const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const { spawn } = require("node:child_process");
const net = require("node:net");
const jwt = require("jsonwebtoken");
const WebSocket = require("ws");
const fs = require("node:fs");
const path = require("node:path");

const databaseUrl = process.env.WORLD_SYNC_TEST_DATABASE_URL;

async function waitForSpawnEvent(response, spawnId, timeoutMs = 6000) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out waiting for world SSE update")), timeoutMs);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) throw new Error("World SSE stream closed before the spawn update arrived");
      buffer += decoder.decode(chunk.value, {stream:true}).replace(/\r\n/g,"\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0,boundary);
        buffer = buffer.slice(boundary+2);
        const data = frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        const payload = JSON.parse(data);
        if (payload.changes?.some(change=>change.spawnId===spawnId)) return {payload,reader};
      }
    }
  } finally {
    clearTimeout(timer);
  }
}



async function waitForSocketMessage(socket, predicate, timeoutMs = 6000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      socket.off("message", onMessage);
      reject(new Error("Timed out waiting for movement WebSocket message"));
    }, timeoutMs);
    function onMessage(raw) {
      let message;
      try { message = JSON.parse(raw.toString()); } catch (_) { return; }
      if (!predicate(message)) return;
      clearTimeout(timer);
      socket.off("message", onMessage);
      resolve(message);
    }
    socket.on("message", onMessage);
  });
}

async function waitForPlayerSnapshot(response, username, expectedX, timeoutMs = 6000) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error("Timed out waiting for world player snapshot")), timeoutMs);
  });
  try {
    while (true) {
      const chunk = await Promise.race([reader.read(), timeout]);
      if (chunk.done) throw new Error("Player SSE stream closed before the position update arrived");
      buffer += decoder.decode(chunk.value, {stream:true}).replace(/\r\n/g,"\n");
      let boundary;
      while ((boundary = buffer.indexOf("\n\n")) !== -1) {
        const frame = buffer.slice(0,boundary);
        buffer = buffer.slice(boundary+2);
        const data = frame.split("\n").filter(line=>line.startsWith("data:")).map(line=>line.slice(5).trimStart()).join("\n");
        if (!data) continue;
        const payload = JSON.parse(data);
        if (payload.players?.some(player=>player.username===username&&player.x===expectedX)) return payload;
      }
    }
  } finally {
    clearTimeout(timer);
    try { await reader.cancel(); } catch (_) {}
  }
}

test("global world revisions preserve concurrent enemy updates and persisted state", {
  skip: databaseUrl ? false : "Set WORLD_SYNC_TEST_DATABASE_URL to an isolated PostgreSQL test database",
  timeout: 20000
}, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  const first = new Client({ connectionString: databaseUrl });
  const second = new Client({ connectionString: databaseUrl });
  const reopened = new Client({ connectionString: databaseUrl });
  const schema = "world_sync_test_" + process.pid + "_" + Date.now();
  let adminConnected = false;
  let schemaCreated = false;
  const connected = new Set();

  try {
    await admin.connect();
    adminConnected = true;
    await admin.query("CREATE SCHEMA " + schema);
    schemaCreated = true;
    for (const client of [first, second]) {
      await client.connect();
      connected.add(client);
      await client.query("SET search_path TO " + schema);
    }

    const schemaSql = fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8");
    await first.query(schemaSql);
    await first.query(
      "INSERT INTO world_mob_spawns (spawn_id,map_id,mob_id,x,y,hp) VALUES " +
      "('mob-a','test-map','test-mob',0,0,100),('mob-b','test-map','test-mob',10,0,100)"
    );

    const initial = await first.query("SELECT revision FROM world_revision_state WHERE id=1");
    const since = Number(initial.rows[0].revision);
    await first.query("BEGIN");
    await first.query("UPDATE world_mob_spawns SET hp=80 WHERE spawn_id='mob-a'");

    const secondPid = Number((await second.query("SELECT pg_backend_pid() AS pid")).rows[0].pid);
    await second.query("BEGIN");
    const concurrentUpdate = second.query("UPDATE world_mob_spawns SET hp=60 WHERE spawn_id='mob-b'");
    let blockedByGlobalRevision = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const activity = await admin.query(
        "SELECT wait_event_type FROM pg_stat_activity WHERE pid=$1",
        [secondPid]
      );
      if (activity.rows[0]?.wait_event_type === "Lock") {
        blockedByGlobalRevision = true;
        break;
      }
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    assert.equal(
      blockedByGlobalRevision,
      true,
      "the second transaction must wait for the first transaction's global revision lock"
    );

    await first.query("COMMIT");
    await concurrentUpdate;
    await second.query("COMMIT");

    const cursor = await first.query("SELECT revision FROM world_revision_state WHERE id=1");
    const signature = Number(cursor.rows[0].revision);
    const changes = await first.query(
      "SELECT spawn_id,hp,revision FROM world_mob_change_log WHERE revision > $1 AND revision <= $2 ORDER BY revision",
      [since, signature]
    );

    assert.equal(changes.rows.length, 2, "both concurrent mob updates must be delivered");
    assert.deepEqual(changes.rows.map(row => row.spawn_id), ["mob-a", "mob-b"]);
    assert.ok(Number(changes.rows[0].revision) < Number(changes.rows[1].revision));
    assert.equal(Number(changes.rows[0].hp), 80);
    assert.equal(Number(changes.rows[1].hp), 60);
    assert.equal(signature, Number(changes.rows[1].revision));

    await reopened.connect();
    connected.add(reopened);
    await reopened.query("SET search_path TO " + schema);
    const persisted = await reopened.query(
      "SELECT spawn_id,hp,revision FROM world_mob_spawns ORDER BY spawn_id"
    );
    assert.deepEqual(
      persisted.rows.map(row => [row.spawn_id, Number(row.hp), Number(row.revision)]),
      [["mob-a", 80, Number(changes.rows[0].revision)], ["mob-b", 60, Number(changes.rows[1].revision)]],
      "enemy state and its latest revision must survive a fresh database connection"
    );

    // Intermediate states must remain visible even when one spawn changes several
    // times before a client polls again.
    await first.query("UPDATE world_mob_spawns SET hp=75 WHERE spawn_id='mob-a'");
    await first.query("UPDATE world_mob_spawns SET hp=45 WHERE spawn_id='mob-a'");
    const replayed = await first.query(
      "SELECT spawn_id,hp,revision FROM world_mob_change_log WHERE revision > $1 ORDER BY revision",
      [signature]
    );
    assert.deepEqual(
      replayed.rows.map(row => [row.spawn_id, Number(row.hp)]),
      [["mob-a", 75], ["mob-a", 45]],
      "every intermediate enemy state must be retained in revision order"
    );
    assert.ok(
      Number(replayed.rows[0].revision) < Number(replayed.rows[1].revision),
      "repeated changes to the same spawn must have distinct ordered revisions"
    );
  } finally {
    for (const client of connected) {
      try { await client.query("ROLLBACK"); } catch (_) {}
      try { await client.end(); } catch (_) {}
    }
    if (adminConnected) {
      if (schemaCreated) {
        try { await admin.query("DROP SCHEMA " + schema + " CASCADE"); } catch (_) {}
      }
      try { await admin.end(); } catch (_) {}
    }
  }
});


test("authenticated SSE broadcasts a real database update to every connected client", {
  skip: databaseUrl ? false : "Set WORLD_SYNC_TEST_DATABASE_URL to an isolated PostgreSQL test database",
  timeout: 20000
}, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  const secret = "integration-test-secret-that-is-at-least-32-characters";
  const portServer = net.createServer();
  let child;
  const streamControllers = [];
  let adminConnected = false;
  let childOutput = "";

  try {
    await admin.connect();
    adminConnected = true;
    await new Promise((resolve, reject) => {
      portServer.once("error", reject);
      portServer.listen(0, "127.0.0.1", resolve);
    });
    const port = portServer.address().port;
    await new Promise(resolve => portServer.close(resolve));

    child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, PORT: String(port), DATABASE_URL: databaseUrl, JWT_SECRET: secret, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => { childOutput += chunk.toString(); });
    child.stderr.on("data", chunk => { childOutput += chunk.toString(); });

    const baseUrl = "http://127.0.0.1:" + port;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error("API process exited early: " + childOutput);
      try {
        const health = await fetch(baseUrl + "/health");
        if (health.ok) { ready = true; break; }
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "API must start against the temporary PostgreSQL database");

    const spawnResult = await admin.query("SELECT spawn_id FROM world_mob_spawns ORDER BY spawn_id LIMIT 1");
    assert.ok(spawnResult.rows.length, "API initialization should seed at least one world spawn");
    const spawnId = spawnResult.rows[0].spawn_id;
    const cursorResult = await admin.query("SELECT revision FROM world_revision_state WHERE id=1");
    const since = Number(cursorResult.rows[0].revision);
    const token = jwt.sign({sub:"1",username:"stream-test"}, secret, {expiresIn:"5m",issuer:"dragon-realm"});
    const authHeaders = {Authorization:"Bearer " + token};
    const invalidChanges = await fetch(baseUrl + "/api/world/changes?since=" + Number.MAX_SAFE_INTEGER, {headers:authHeaders});
    const invalidStream = await fetch(baseUrl + "/api/world/stream?since=" + Number.MAX_SAFE_INTEGER, {headers:authHeaders});
    assert.equal(invalidChanges.status, 400, "future HTTP cursors must be rejected");
    assert.equal(invalidStream.status, 400, "future SSE cursors must be rejected");
    const openStream = async () => {
      const controller = new AbortController();
      streamControllers.push(controller);
      const streamResponse = await fetch(baseUrl + "/api/world/stream?since=" + since, {
        headers: authHeaders,
        signal: controller.signal,
        cache: "no-store"
      });
      assert.equal(streamResponse.status, 200);
      assert.match(streamResponse.headers.get("content-type") || "", /text\/event-stream/);
      return streamResponse;
    };
    const responseA = await openStream();
    const responseB = await openStream();

    // Two updates before the next poll must both be recoverable over HTTP, even
    // though they target the same mutable spawn row.
    await admin.query("UPDATE world_mob_spawns SET updated_at=NOW() WHERE spawn_id=$1", [spawnId]);
    await admin.query("UPDATE world_mob_spawns SET updated_at=NOW() WHERE spawn_id=$1", [spawnId]);
    const catchupResponse = await fetch(baseUrl + "/api/world/changes?since=" + since, {headers:authHeaders});
    assert.equal(catchupResponse.status, 200);
    const catchupPayload = await catchupResponse.json();
    const repeatedChanges = catchupPayload.changes.filter(change => change.spawnId === spawnId && change.revision > since);
    assert.ok(repeatedChanges.length >= 2, "HTTP catch-up must retain repeated changes to the same spawn");
    assert.ok(
      Number(repeatedChanges[0].revision) < Number(repeatedChanges[1].revision),
      "HTTP catch-up must preserve enemy revision order"
    );

    const [deliveryA, deliveryB] = await Promise.all([
      waitForSpawnEvent(responseA, spawnId),
      waitForSpawnEvent(responseB, spawnId)
    ]);
    assert.ok(deliveryA.payload.signature > since);
    assert.ok(deliveryA.payload.changes.some(change=>change.spawnId===spawnId && change.revision > since));
    assert.ok(deliveryB.payload.signature > since, "the second client must receive a global revision");
    assert.ok(deliveryB.payload.changes.some(change=>change.spawnId===spawnId && change.revision > since),
      "the second client must receive the committed spawn change");
    assert.ok(deliveryA.payload.changes.every(change=>Number(change.revision) <= deliveryA.payload.signature));
    assert.ok(deliveryB.payload.changes.every(change=>Number(change.revision) <= deliveryB.payload.signature));
    await Promise.all([deliveryA.reader.cancel().catch(()=>{}),deliveryB.reader.cancel().catch(()=>{})]);
  } finally {
    for (const controller of streamControllers) controller.abort();
    if (child && child.exitCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.once("exit", () => { clearTimeout(timeout); resolve(); });
        child.kill("SIGTERM");
      });
    }
    if (adminConnected) await admin.end().catch(()=>{});
  }
});


test("authenticated map presence publishes authoritative player movement to other players only on the requested map", {
  skip: databaseUrl ? false : "Set WORLD_SYNC_TEST_DATABASE_URL to an isolated PostgreSQL test database",
  timeout: 20000
}, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  const secret = "integration-test-secret-that-is-at-least-32-characters";
  const portServer = net.createServer();
  let child;
  let adminConnected = false;
  let childOutput = "";
  const suffix = process.pid + "_" + Date.now();
  const usernameA = "presence_a_" + suffix;
  const usernameB = "presence_b_" + suffix;
  let accountA;
  let accountB;
  let playerStreamController;
  let movementSocket;
  let movementSocketA;
  try {
    await admin.connect();
    adminConnected = true;


    await new Promise((resolve, reject) => {
      portServer.once("error", reject);
      portServer.listen(0, "127.0.0.1", resolve);
    });
    const port = portServer.address().port;
    await new Promise(resolve => portServer.close(resolve));
    child = spawn(process.execPath, [path.join(__dirname, "index.js")], {
      cwd: path.join(__dirname, ".."),
      env: { ...process.env, PORT: String(port), DATABASE_URL: databaseUrl, JWT_SECRET: secret, NODE_ENV: "test" },
      stdio: ["ignore", "pipe", "pipe"]
    });
    child.stdout.on("data", chunk => { childOutput += chunk.toString(); });
    child.stderr.on("data", chunk => { childOutput += chunk.toString(); });
    const baseUrl = "http://127.0.0.1:" + port;
    let ready = false;
    for (let attempt = 0; attempt < 100; attempt += 1) {
      if (child.exitCode !== null) throw new Error("API process exited early: " + childOutput);
      try {
        const health = await fetch(baseUrl + "/health");
        if (health.ok) { ready = true; break; }
      } catch (_) {}
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    assert.equal(ready, true, "API must start against the test PostgreSQL database");
    const insertedA = await admin.query(
      "INSERT INTO accounts (username,password_hash) VALUES ($1,'test-hash') RETURNING id",
      [usernameA]
    );
    accountA = insertedA.rows[0].id;
    const insertedB = await admin.query(
      "INSERT INTO accounts (username,password_hash) VALUES ($1,'test-hash') RETURNING id",
      [usernameB]
    );
    accountB = insertedB.rows[0].id;
    await admin.query("INSERT INTO characters (account_id) VALUES ($1),($2)", [accountA,accountB]);
    const tokenA = jwt.sign({sub:String(accountA),username:usernameA}, secret, {expiresIn:"5m",issuer:"dragon-realm"});
    const tokenB = jwt.sign({sub:String(accountB),username:usernameB}, secret, {expiresIn:"5m",issuer:"dragon-realm"});
    const headersA = {Authorization:"Bearer " + tokenA,"Content-Type":"application/json"};
    const headersB = {Authorization:"Bearer " + tokenB,"Content-Type":"application/json"};

    const invalidMap = await fetch(baseUrl + "/api/world/players?mapId=not-a-map", {headers:headersA});
    assert.equal(invalidMap.status, 400, "unknown maps must be rejected");
    const initialPresence = await fetch(baseUrl + "/api/world/players?mapId=earth_training", {headers:headersA});
    assert.equal(initialPresence.status, 200);
    const initialPayload = await initialPresence.json();
    assert.equal(initialPayload.players.some(player => player.username === usernameA), false, "the endpoint must not echo the requesting player");

    const move = await fetch(baseUrl + "/api/game/action", {
      method:"POST",headers:headersA,
      body:JSON.stringify({action:"move_player",mapId:"earth_training",x:200,y:420})
    });
    assert.equal(move.status, 200);
    const movePayload = await move.json();
    assert.deepEqual(movePayload.state.position, {mapId:"earth_training",x:200,y:420});

    const visibleToB = await fetch(baseUrl + "/api/world/players?mapId=earth_training", {headers:headersB});
    assert.equal(visibleToB.status, 200);
    const visiblePayload = await visibleToB.json();
    const playerA = visiblePayload.players.find(player => player.username === usernameA);
    assert.ok(playerA, "another active player on the same map should be visible");
    assert.deepEqual({mapId:playerA.mapId,x:playerA.x,y:playerA.y}, {mapId:"earth_training",x:200,y:420});

    const otherMap = await fetch(baseUrl + "/api/world/players?mapId=earth_wilderness", {headers:headersB});
    const otherMapPayload = await otherMap.json();
    assert.equal(otherMapPayload.players.some(player => player.username === usernameA), false, "players must not leak across maps");

    // Player snapshots travel on their own SSE channel, independently of enemy revisions.
    playerStreamController = new AbortController();
    const playerStream = await fetch(baseUrl + "/api/world/players/stream?mapId=earth_training", {
      headers:headersB,signal:playerStreamController.signal
    });
    assert.equal(playerStream.status, 200);
    assert.match(playerStream.headers.get("content-type") || "", /text\/event-stream/);
    // Movement has a server-enforced minimum interval and speed cap.
    await new Promise(resolve => setTimeout(resolve, 200));
    const movedAgain = await fetch(baseUrl + "/api/game/action", {
      method:"POST",headers:headersA,
      body:JSON.stringify({action:"move_player",mapId:"earth_training",x:260,y:420})
    });
    assert.equal(movedAgain.status, 200);
    const streamedSnapshot = await waitForPlayerSnapshot(playerStream, usernameA, 260);
    assert.equal(streamedSnapshot.mapId, "earth_training");

    // A WebSocket target starts continuous server-authoritative steps; each
    // acknowledgement contains the persisted position and the matching target id.
    movementSocket = new WebSocket("ws://127.0.0.1:" + port + "/api/world/movement");
    const readyMessage = waitForSocketMessage(movementSocket, message => message.type === "ready");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out opening movement WebSocket")), 5000);
      movementSocket.once("open", () => {
        clearTimeout(timeout);
        movementSocket.send(JSON.stringify({type:"auth",token:tokenB}));
        resolve();
      });
      movementSocket.once("error", error => { clearTimeout(timeout); reject(error); });
      movementSocket.once("close", () => { clearTimeout(timeout); reject(new Error("Movement WebSocket closed before opening")); });
    });
    await readyMessage;

    // A second authenticated client receives movement broadcasts directly over
    // the map WebSocket, without waiting for the batched SSE presence snapshot.
    movementSocketA = new WebSocket("ws://127.0.0.1:" + port + "/api/world/movement");
    const readyMessageA = waitForSocketMessage(movementSocketA, message => message.type === "ready");
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("Timed out opening second movement WebSocket")), 5000);
      movementSocketA.once("open", () => {
        clearTimeout(timeout);
        movementSocketA.send(JSON.stringify({type:"auth",token:tokenA}));
        resolve();
      });
      movementSocketA.once("error", error => { clearTimeout(timeout); reject(error); });
      movementSocketA.once("close", () => { clearTimeout(timeout); reject(new Error("Second movement WebSocket closed before opening")); });
    });
    await readyMessageA;
    const remoteMovement = waitForSocketMessage(movementSocketA, message =>
      message.type === "remote_position" && message.username === usernameB &&
      message.mapId === "earth_training" && message.x === 250);
    const movementResult = waitForSocketMessage(movementSocket, message =>
      message.type === "position" && message.moveId === 77 && message.position?.x === 250);
    movementSocket.send(JSON.stringify({
      type:"move",moveId:77,mapId:"earth_training",x:250,y:420
    }));
    const continuousPosition = await movementResult;
    assert.equal(continuousPosition.reachedTarget, true);
    const broadcastPosition = await remoteMovement;
    assert.equal(broadcastPosition.mapId, "earth_training");
    const persistedMovement = await admin.query("SELECT state FROM characters WHERE account_id=$1", [accountB]);
    assert.deepEqual(persistedMovement.rows[0].state.position, {mapId:"earth_training",x:250,y:420});
  } finally {
    if (playerStreamController) playerStreamController.abort();
    if (movementSocket && movementSocket.readyState !== WebSocket.CLOSED) movementSocket.close();
    if (movementSocketA && movementSocketA.readyState !== WebSocket.CLOSED) movementSocketA.close();
    if (child && child.exitCode === null) {
      await new Promise(resolve => {
        const timeout = setTimeout(() => {
          if (child.exitCode === null) child.kill("SIGKILL");
          resolve();
        }, 3000);
        child.once("exit", () => { clearTimeout(timeout); resolve(); });
        child.kill("SIGTERM");
      });
    }
    if (adminConnected) {
      if (accountA || accountB) await admin.query("DELETE FROM accounts WHERE id = ANY($1::bigint[])", [[accountA,accountB].filter(Boolean)]).catch(()=>{});
      await admin.end().catch(()=>{});
    }
  }
});
