const express = require("express");
const http = require("http");
const { WebSocketServer } = require("ws");
const helmet = require("helmet");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { normalizeUsername, loadState, saveState, publicState, performAction, performSharedMobHit, assertCanReachSpawn, assertSpawnMobMatchesRequest, MOVEMENT_CONFIG } = require("./game-service");
const { MOB_DEFINITIONS } = require("./game-config");
const { isAllowedOrigin } = require("./origin-policy");
const { WORLD_MAPS, WORLD_SPAWNS, WORLD_NPCS, WORLD_OBSTACLES } = require("./world-config");
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
if (!JWT_SECRET || JWT_SECRET.length < 32) { console.error("FATAL: JWT_SECRET debe tener al menos 32 caracteres."); process.exit(1); }
if (!DATABASE_URL) { console.error("FATAL: DATABASE_URL es obligatoria."); process.exit(1); }
const worldStreamClients = new Set();
const worldPlayerStreamClients = new Set();
const movementClients = new Set();
const movementClientsByAccount = new Map();
const movementWss = new WebSocketServer({ noServer: true, maxPayload: 1024, perMessageDeflate: false });
const server = http.createServer(app);
let worldStreamSignature = 0;
let worldStreamTimer = null;
let worldPlayerStreamTimer = null;
let worldStreamHeartbeatTimer = null;
let worldStreamPolling = false;
let worldPlayerStreamPolling = false;
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000
});
const allowedOrigins = (process.env.CLIENT_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    // Same-origin requests do not need CORS headers. Cross-origin browser clients
    // must be explicitly listed in CLIENT_ORIGIN; an empty list is not a wildcard.
    return callback(null, isAllowedOrigin(origin, allowedOrigins));
  },
  methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "16kb" }));
app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(express.static(path.join(__dirname, "..", "public")));
async function initializeDatabase() {
  await pool.query(fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8"));
  // Reconcile static spawn configuration on startup without wiping live world state.
  // If the mob type changes, reset its combat state; otherwise preserve HP/respawn/defeat count.
  // HP is clamped when a configured mob's maximum HP is reduced.
  for (const spawn of WORLD_SPAWNS) {
    const mob = MOB_DEFINITIONS[spawn.mobId];
    if (!mob || mob.trainingDummy) throw new Error("World spawn references an unknown mob: " + spawn.spawnId);
    await pool.query(
      `INSERT INTO world_mob_spawns (spawn_id,map_id,mob_id,x,y,hp)
       VALUES ($1,$2,$3,$4,$5,$6)
       ON CONFLICT (spawn_id) DO UPDATE SET
         map_id=EXCLUDED.map_id,
         mob_id=EXCLUDED.mob_id,
         x=EXCLUDED.x,
         y=EXCLUDED.y,
         hp=CASE
           WHEN world_mob_spawns.mob_id IS DISTINCT FROM EXCLUDED.mob_id THEN EXCLUDED.hp
           ELSE LEAST(world_mob_spawns.hp, EXCLUDED.hp)
         END,
         respawn_at_ms=CASE
           WHEN world_mob_spawns.mob_id IS DISTINCT FROM EXCLUDED.mob_id THEN 0
           ELSE world_mob_spawns.respawn_at_ms
         END,
         combat_started_at_ms=CASE
           WHEN world_mob_spawns.mob_id IS DISTINCT FROM EXCLUDED.mob_id
             OR world_mob_spawns.map_id IS DISTINCT FROM EXCLUDED.map_id
             OR world_mob_spawns.x IS DISTINCT FROM EXCLUDED.x
             OR world_mob_spawns.y IS DISTINCT FROM EXCLUDED.y
           THEN NULL
           ELSE world_mob_spawns.combat_started_at_ms
         END,
         defeat_count=CASE
           WHEN world_mob_spawns.mob_id IS DISTINCT FROM EXCLUDED.mob_id THEN 0
           ELSE world_mob_spawns.defeat_count
         END,
         updated_at=NOW()`,
      [spawn.spawnId,spawn.mapId,spawn.mobId,spawn.x,spawn.y,mob.hp]
    );
  }
}
function issueToken(account) {
  return jwt.sign({ sub: String(account.id), username: account.username }, JWT_SECRET, { expiresIn: "7d", issuer: "dragon-realm" });
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  try {
    if (!header.startsWith("Bearer ")) throw new Error("missing token");
    req.user = jwt.verify(header.slice(7), JWT_SECRET, { issuer: "dragon-realm" }); next();
  } catch { res.status(401).json({ ok: false, error: "Sesión inválida o vencida." }); }
}

server.on("upgrade", (req, socket, head) => {
  let pathname;
  try { pathname = new URL(req.url, "http://localhost").pathname; }
  catch { socket.destroy(); return; }
  if (pathname !== "/api/world/movement") { socket.destroy(); return; }
  movementWss.handleUpgrade(req, socket, head, ws => movementWss.emit("connection", ws, req));
});
function sendMovementMessage(client, payload) {
  if (client.readyState === 1) client.send(JSON.stringify(payload));
}
movementWss.on("connection", ws => {
  const client = { ws, authenticated: false, accountId: "", expiresAt: 0, target: null, moving: false, nextStepAt: 0 };
  movementClients.add(client);
  const authTimeout = setTimeout(() => {
    if (!client.authenticated) ws.close(4001, "Authentication required");
  }, 5000);
  ws.on("close", () => {
    clearTimeout(authTimeout);
    client.target = null;
    movementClients.delete(client);
    if (movementClientsByAccount.get(client.accountId) === client) movementClientsByAccount.delete(client.accountId);
  });
  ws.on("error", error => console.warn("Movement WebSocket error:", error.message));
  ws.on("message", async raw => {
    let message;
    try {
      message = JSON.parse(raw.toString());
      if (!message || typeof message !== "object" || Array.isArray(message)) throw new Error("Mensaje no válido.");
      if (!client.authenticated) {
        if (message.type !== "auth" || typeof message.token !== "string" || message.token.length > 4096) {
          ws.close(4001, "Authentication required");
          return;
        }
        const identity = jwt.verify(message.token, JWT_SECRET, { issuer: "dragon-realm" });
        if (!identity.sub) throw new Error("Sesión inválida.");
        client.accountId = String(identity.sub);
        client.expiresAt = Number(identity.exp || 0) * 1000;
        const previousSession = movementClientsByAccount.get(client.accountId);
        if (previousSession && previousSession !== client) {
          previousSession.target = null;
          previousSession.ws.close(4002, "Movement session replaced");
        }
        movementClientsByAccount.set(client.accountId, client);
        client.authenticated = true;
        clearTimeout(authTimeout);
        sendMovementMessage(ws, { type: "ready", tickMs: MOVEMENT_CONFIG.minIntervalMs });
        return;
      }
      if (message.type === "stop") {
        client.target = null;
        sendMovementMessage(ws, { type: "stopped" });
        return;
      }
      if (message.type !== "move" ||
          typeof message.mapId !== "string" ||
          !Number.isSafeInteger(message.x) || !Number.isSafeInteger(message.y) ||
          !Number.isSafeInteger(message.moveId) || message.moveId < 1) {
        sendMovementMessage(ws, { type: "error", error: "Destino de movimiento no válido." });
        return;
      }
      client.target = { mapId: message.mapId, x: message.x, y: message.y, moveId: message.moveId };
      sendMovementMessage(ws, { type: "moving", target: client.target });
    } catch (error) {
      if (!client.authenticated) ws.close(4001, "Invalid authentication");
      else sendMovementMessage(ws, { type: "error", error: error.message || "Mensaje no válido." });
    }
  });
});
async function advanceContinuousMovement(client) {
  const target = client.target;
  if (!target || !client.authenticated || client.moving) return;
  client.moving = true;
  const dbClient = await pool.connect().catch(() => {
    sendMovementMessage(client.ws, { type: "error", error: "No se pudo conectar con el mundo." });
    client.nextStepAt = Date.now() + MOVEMENT_CONFIG.minIntervalMs;
    return null;
  });
  if (!dbClient) { client.moving = false; return; }
  try {
    await dbClient.query("BEGIN");
    const found = await dbClient.query("SELECT state FROM characters WHERE account_id=$1 FOR UPDATE", [client.accountId]);
    if (!found.rowCount) {
      await dbClient.query("ROLLBACK");
      client.target = null;
      sendMovementMessage(client.ws, { type: "error", error: "Personaje no encontrado." });
      return;
    }
    const previousPosition = found.rows[0].state.position || {};
    const outcome = performAction(found.rows[0].state, { action: "move_player", ...target });
    await saveState(dbClient, client.accountId, outcome.state);
    const position = outcome.state.position;
    await dbClient.query(
      "INSERT INTO world_player_presence (account_id,map_id,x,y,last_seen_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (account_id) DO UPDATE SET map_id=EXCLUDED.map_id,x=EXCLUDED.x,y=EXCLUDED.y,last_seen_at=NOW()",
      [client.accountId, position.mapId, position.x, position.y]
    );
    await dbClient.query("COMMIT");
    client.nextStepAt = Date.now() + MOVEMENT_CONFIG.minIntervalMs;
    sendMovementMessage(client.ws, {
      type: "position", position, moveId: target.moveId,
      reachedTarget: Boolean(outcome.result.reachedTarget),
      blocked: Boolean(outcome.result.blocked),
      serverTime: Date.now()
    });
    if (client.target === target && outcome.result.reachedTarget) client.target = null;
    else if (client.target === target && outcome.result.blocked &&
      position.x === previousPosition.x && position.y === previousPosition.y) {
      client.target = null;
      sendMovementMessage(client.ws, { type: "error", error: "El camino está bloqueado." });
    }
  } catch (error) {
    await dbClient.query("ROLLBACK").catch(() => {});
    client.nextStepAt = Date.now() + MOVEMENT_CONFIG.minIntervalMs;
    if (error.status === 429) return;
    if (client.target === target) client.target = null;
    sendMovementMessage(client.ws, { type: "error", error: error.status && error.status < 500 ? error.message : "No se pudo completar el movimiento." });
  } finally {
    dbClient.release();
    client.moving = false;
  }
}
const movementTimer = setInterval(() => {
  const now = Date.now();
  for (const client of movementClients) {
    if (client.authenticated && client.expiresAt && now >= client.expiresAt) {
      client.target = null;
      client.ws.close(4001, "Session expired");
      continue;
    }
    if (client.authenticated && client.target && !client.moving && now >= client.nextStepAt) {
      void advanceContinuousMovement(client);
    }
  }
}, 25);
movementTimer.unref?.();

app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true, service: "dragon-realm-api", database: "connected" }); }
  catch { res.status(503).json({ ok: false, service: "dragon-realm-api", database: "unavailable" }); }
});
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ ok:false, error:"Usuario: 3–20 caracteres, letras, números o _." });
    if (password.length < 10 || password.length > 72) return res.status(400).json({ ok:false, error:"La contraseña debe tener entre 10 y 72 caracteres." });
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query("INSERT INTO accounts (username,password_hash) VALUES ($1,$2) RETURNING id,username", [username,passwordHash]);
      await client.query("INSERT INTO characters (account_id) VALUES ($1)", [account.rows[0].id]);
      await client.query("COMMIT");
      res.status(201).json({ ok:true, token:issueToken(account.rows[0]), username, message:"Cuenta creada." });
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code === "23505") return res.status(409).json({ ok:false, error:"Ese usuario ya existe." });
      throw e;
    } finally { client.release(); }
  } catch (e) { next(e); }
});
app.post("/api/auth/login", async (req,res,next) => {
  try {
    const username = normalizeUsername(req.body?.username), password = String(req.body?.password || "");
    const found = await pool.query("SELECT id,username,password_hash FROM accounts WHERE username=$1",[username]);
    const account = found.rows[0];
    if (!account || !(await bcrypt.compare(password, account.password_hash))) return res.status(401).json({ok:false,error:"Usuario o contraseña incorrectos."});
    res.json({ok:true,token:issueToken(account),username:account.username});
  } catch(e) { next(e); }
});
app.get("/api/me",requireAuth,async(req,res,next)=>{
  try { res.json({ok:true,username:req.user.username,state:await loadState(pool,req.user.sub)}); } catch(e){next(e);}
});
function publicWorldSpawn(row) {
  const mob = MOB_DEFINITIONS[row.mob_id];
  return {
    spawnId: row.spawn_id, mapId: row.map_id, mobId: row.mob_id,
    name: mob?.name || row.mob_id, x: Number(row.x), y: Number(row.y),
    hp: Number(row.hp), maxHp: mob?.hp || Number(row.hp),
    respawnAt: Number(row.respawn_at_ms), defeatCount: Number(row.defeat_count),
    isBoss: Boolean(mob?.isBoss), revision: Number(row.revision || 0)
  };
}
async function readWorldSignature(db = pool) {
  const result = await db.query("SELECT revision AS signature FROM world_revision_state WHERE id=1");
  return Number(result.rows[0]?.signature || 0);
}
async function respawnDueWorldMobs(db = pool, now = Date.now()) {
  const configuredMobs = Object.entries(MOB_DEFINITIONS)
    .filter(([, mob]) => mob && !mob.trainingDummy && Number.isSafeInteger(mob.hp) && mob.hp > 0);
  if (!configuredMobs.length) return;
  const values = [];
  const tuples = configuredMobs.map(([mobId, mob], index) => {
    values.push(mobId, mob.hp);
    return "($" + (index * 2 + 1) + "::text,$" + (index * 2 + 2) + "::integer)";
  });
  values.push(now);
  await db.query(
    "UPDATE world_mob_spawns AS spawn SET hp=due.max_hp,respawn_at_ms=0,combat_started_at_ms=NULL,updated_at=NOW() " +
    "FROM (VALUES " + tuples.join(",") + ") AS due(mob_id,max_hp) " +
    "WHERE spawn.mob_id=due.mob_id AND spawn.hp=0 AND spawn.respawn_at_ms>0 AND spawn.respawn_at_ms <= $" + values.length,
    values
  );
}
app.get("/api/world",requireAuth,async(_req,res,next)=>{
  try {
    await respawnDueWorldMobs();
    // Read the cursor first: a concurrent update after this point will be included in rows
    // but remains above the returned cursor, so the next incremental poll cannot miss it.
    const signature = await readWorldSignature();
    const rows = await pool.query("SELECT spawn_id,map_id,mob_id,x,y,hp,respawn_at_ms,defeat_count,revision FROM world_mob_spawns ORDER BY map_id,spawn_id");
    res.json({
      ok: true, signature,
      maps: WORLD_MAPS, npcs: WORLD_NPCS, obstacles: WORLD_OBSTACLES,
      spawns: rows.rows.map(publicWorldSpawn)
    });
  } catch(e) { next(e); }
});
async function readWorldChangesSince(since) {
  // Resolve elapsed respawns as authoritative world changes before capturing the cursor.
  await respawnDueWorldMobs();
  // Bound the query to a cursor captured first; concurrent commits above it are delivered next time.
  const signature = await readWorldSignature();
  // Read the append-only event log, not the mutable current-state table: a spawn may
  // change more than once between polls, and every revision must remain replayable.
  const rows = await pool.query(
    "SELECT spawn_id,map_id,mob_id,x,y,hp,respawn_at_ms,defeat_count,revision FROM world_mob_change_log WHERE revision > $1 AND revision <= $2 ORDER BY revision",
    [since, signature]
  );
  return {signature,changes:rows.rows.map(publicWorldSpawn)};
}
app.get("/api/world/changes",requireAuth,async(req,res,next)=>{
  try {
    const rawSince = req.query.since ?? "0";
    if (typeof rawSince !== "string" || !/^\d{1,16}$/.test(rawSince) || !Number.isSafeInteger(Number(rawSince))) {
      return res.status(400).json({ok:false,error:"Firma global no válida."});
    }
    const since = Number(rawSince);
    if (since > await readWorldSignature()) return res.status(400).json({ok:false,error:"La firma supera la revisión actual del mundo."});
    res.json({ok:true,...await readWorldChangesSince(since)});
  } catch(e) { next(e); }
});
function sendWorldStreamEvent(client, payload) {
  if (payload.signature <= client.signature || client.res.writableEnded || client.res.destroyed) return;
  client.res.write("id: " + payload.signature + "\nevent: world-changes\ndata: " + JSON.stringify(payload) + "\n\n");
  client.signature = payload.signature;
}
async function publishWorldChanges() {
  if (worldStreamPolling) return;
  worldStreamPolling = true;
  try {
    if (!worldStreamClients.size) {
      worldStreamSignature = await readWorldSignature();
      return;
    }
    const payload = await readWorldChangesSince(worldStreamSignature);
    if (payload.signature <= worldStreamSignature) return;
    worldStreamSignature = payload.signature;
    for (const client of worldStreamClients) sendWorldStreamEvent(client, payload);
  } finally {
    worldStreamPolling = false;
  }
}
app.get("/api/world/stream",requireAuth,async(req,res,next)=>{
  try {
    const rawSince = req.query.since ?? "0";
    if (typeof rawSince !== "string" || !/^\d{1,16}$/.test(rawSince) || !Number.isSafeInteger(Number(rawSince))) {
      return res.status(400).json({ok:false,error:"Firma global no válida."});
    }
    const since = Number(rawSince);
    if (since > await readWorldSignature()) return res.status(400).json({ok:false,error:"La firma supera la revisión actual del mundo."});
    res.status(200).set({
      "Content-Type":"text/event-stream; charset=utf-8",
      "Cache-Control":"no-cache, no-transform",
      "Connection":"keep-alive",
      "X-Accel-Buffering":"no"
    });
    res.flushHeaders();
    const client = {res,signature:since};
    worldStreamClients.add(client);
    res.write(": connected\n\n");
    res.on("close",()=>worldStreamClients.delete(client));
    // Register before catch-up so a concurrent publish cannot fall into a subscription gap.
    const catchup = await readWorldChangesSince(client.signature);
    sendWorldStreamEvent(client,catchup);
  } catch(e) {
    if (res.headersSent) res.end();
    else next(e);
  }
});
app.get("/api/world/players",requireAuth,async(req,res,next)=>{
  const client=await pool.connect();
  try {
    const mapId=req.query.mapId;
    if(typeof mapId!=="string"||!WORLD_MAPS.some(map=>map.id===mapId)){
      return res.status(400).json({ok:false,error:"Mapa no válido."});
    }
    await client.query("BEGIN");
    // Serialize heartbeat with movement so a stale read cannot overwrite a newer position.
    const found=await client.query("SELECT state FROM characters WHERE account_id=$1 FOR UPDATE",[req.user.sub]);
    if(!found.rowCount){
      await client.query("ROLLBACK");
      return res.status(404).json({ok:false,error:"Personaje no encontrado."});
    }
    const position=publicState(found.rows[0]).position;
    await client.query(
      "INSERT INTO world_player_presence (account_id,map_id,x,y,last_seen_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (account_id) DO UPDATE SET map_id=EXCLUDED.map_id,x=EXCLUDED.x,y=EXCLUDED.y,last_seen_at=NOW()",
      [req.user.sub,position.mapId,position.x,position.y]
    );
    await client.query("COMMIT");
    const rows=await pool.query(
      "SELECT a.username,p.map_id,p.x,p.y FROM world_player_presence p JOIN accounts a ON a.id=p.account_id WHERE p.map_id=$1 AND p.account_id<>$2 AND p.last_seen_at > NOW() - INTERVAL '12 seconds' ORDER BY p.account_id",
      [mapId,req.user.sub]
    );
    res.json({ok:true,mapId,players:rows.rows.map(row=>({username:row.username,mapId:row.map_id,x:Number(row.x),y:Number(row.y)}))});
  } catch(e){await client.query("ROLLBACK").catch(()=>{});next(e);} finally{client.release();}
});
app.get("/api/world/players/stream",requireAuth,async(req,res,next)=>{
  const dbClient=await pool.connect();
  try {
    const mapId=req.query.mapId;
    if(typeof mapId!=="string"||!WORLD_MAPS.some(map=>map.id===mapId)){
      return res.status(400).json({ok:false,error:"Mapa no válido."});
    }
    await dbClient.query("BEGIN");
    // The stream registers the same authoritative heartbeat as the snapshot endpoint.
    const found=await dbClient.query("SELECT state FROM characters WHERE account_id=$1 FOR UPDATE",[req.user.sub]);
    if(!found.rowCount){
      await dbClient.query("ROLLBACK");
      return res.status(404).json({ok:false,error:"Personaje no encontrado."});
    }
    const position=publicState(found.rows[0]).position;
    await dbClient.query(
      "INSERT INTO world_player_presence (account_id,map_id,x,y,last_seen_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (account_id) DO UPDATE SET map_id=EXCLUDED.map_id,x=EXCLUDED.x,y=EXCLUDED.y,last_seen_at=NOW()",
      [req.user.sub,position.mapId,position.x,position.y]
    );
    await dbClient.query("COMMIT");
    res.status(200).set({
      "Content-Type":"text/event-stream; charset=utf-8",
      "Cache-Control":"no-cache, no-transform",
      "Connection":"keep-alive",
      "X-Accel-Buffering":"no"
    });
    res.flushHeaders();
    const client={res,accountId:String(req.user.sub),mapId,snapshot:""};
    worldPlayerStreamClients.add(client);
    res.write(": connected\n\n");
    res.on("close",()=>worldPlayerStreamClients.delete(client));
    // Send the first snapshot immediately; future snapshots are batched across all maps.
    await publishWorldPlayerSnapshots(client);
  } catch(e) {
    await dbClient.query("ROLLBACK").catch(()=>{});
    if(res.headersSent) res.end();
    else next(e);
  } finally {
    dbClient.release();
  }
});
async function publishWorldPlayerSnapshots(targetClient=null) {
  if(!targetClient&&worldPlayerStreamPolling) return;
  if(!targetClient) worldPlayerStreamPolling=true;
  try {
    if(!worldPlayerStreamClients.size&&!targetClient) return;
    const rows=await pool.query(
      "SELECT p.account_id,a.username,p.map_id,p.x,p.y FROM world_player_presence p JOIN accounts a ON a.id=p.account_id WHERE p.last_seen_at > NOW() - INTERVAL '12 seconds' ORDER BY p.map_id,p.account_id"
    );
    const byMap=new Map();
    for(const row of rows.rows){
      const mapId=row.map_id;
      if(!byMap.has(mapId)) byMap.set(mapId,[]);
      byMap.get(mapId).push({
        accountId:String(row.account_id),
        username:row.username,
        mapId,
        x:Number(row.x),
        y:Number(row.y)
      });
    }
    const clients=targetClient?[targetClient]:Array.from(worldPlayerStreamClients);
    for(const client of clients){
      if(client.res.writableEnded||client.res.destroyed) {
        worldPlayerStreamClients.delete(client);
        continue;
      }
      const players=(byMap.get(client.mapId)||[])
        .filter(player=>player.accountId!==client.accountId)
        .map(({username,mapId,x,y})=>({username,mapId,x,y}));
      const payload={mapId:client.mapId,players};
      const snapshot=JSON.stringify(payload);
      if(!targetClient&&snapshot===client.snapshot) continue;
      client.res.write("event: players-snapshot\ndata: "+snapshot+"\n\n");
      client.snapshot=snapshot;
    }
  } finally {
    if(!targetClient) worldPlayerStreamPolling=false;
  }
}
app.get("/api/mobs",requireAuth,async(_req,res,next)=>{
  try {
    const rows=await pool.query("SELECT spawn_id,map_id,mob_id,x,y,hp,respawn_at_ms,defeat_count,revision FROM world_mob_spawns ORDER BY map_id,spawn_id");
    res.json({ok:true,mobs:rows.rows.map(row=>{
      const mob=MOB_DEFINITIONS[row.mob_id];
      return {
        id:row.spawn_id,...publicWorldSpawn(row)
      };
    })});
  } catch(e){next(e);}
});
app.post("/api/game/action",requireAuth,async(req,res,next)=>{
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const found=await client.query("SELECT state FROM characters WHERE account_id=$1 FOR UPDATE",[req.user.sub]);
    if(!found.rowCount){await client.query("ROLLBACK");return res.status(404).json({ok:false,error:"Personaje no encontrado."});}
    let outcome;
    let spawnId = req.body?.action === "attack_mob" ? req.body.spawnId : null;
    const mobId = req.body?.action === "attack_mob" ? (req.body.mobId || "training_dummy") : null;
    if (!spawnId && mobId && mobId !== "training_dummy") {
      // Older clients can still request a mob by type; resolve the nearest spawn on their current map.
      const position = found.rows[0].state.position || { mapId: "earth_training", x: 150, y: 420 };
      const nearest = await client.query(
        "SELECT spawn_id FROM world_mob_spawns WHERE mob_id=$1 AND map_id=$2 ORDER BY ((x-$3)*(x-$3)+(y-$4)*(y-$4)) LIMIT 1",
        [mobId, position.mapId, position.x, position.y]
      );
      if (!nearest.rowCount) { const error = new Error("No hay una aparición de ese enemigo en tu zona."); error.status = 404; throw error; }
      spawnId = nearest.rows[0].spawn_id;
    }
    if (spawnId) {
      if (typeof spawnId !== "string" || spawnId.length > 100) { const error = new Error("Identificador de aparición no válido."); error.status = 400; throw error; }
      // Each spawn has its own row lock, HP, defeat count, and respawn timer.
      const locked = await client.query(
        "SELECT spawn_id,map_id,mob_id,x,y,hp,respawn_at_ms,combat_started_at_ms,defeat_count FROM world_mob_spawns WHERE spawn_id=$1 FOR UPDATE",
        [spawnId]
      );
      if (!locked.rowCount) { const error = new Error("No se encontró esa aparición del mundo."); error.status = 404; throw error; }
      const row = locked.rows[0];
      const spawnMob = MOB_DEFINITIONS[row.mob_id];
      if (!spawnMob || spawnMob.trainingDummy) { const error = new Error("La aparición referencia un enemigo inválido."); error.status = 409; throw error; }
      assertSpawnMobMatchesRequest(req.body?.mobId, row.mob_id);
      assertCanReachSpawn(found.rows[0].state, { mapId: row.map_id, x: Number(row.x), y: Number(row.y) });
      const spawnState = {
        hp: Number(row.hp), respawnAt: Number(row.respawn_at_ms),
        combatStartedAt: row.combat_started_at_ms === null ? null : Number(row.combat_started_at_ms),
        defeatCount: Number(row.defeat_count)
      };
      outcome = performSharedMobHit(found.rows[0].state, row.mob_id, spawnState, Date.now(), Math.random, row.map_id);
      outcome.result.spawnId = row.spawn_id;
      outcome.result.mapId = row.map_id;
      await client.query(
        "UPDATE world_mob_spawns SET hp=$2,respawn_at_ms=$3,combat_started_at_ms=$4,defeat_count=$5,updated_at=NOW() WHERE spawn_id=$1",
        [row.spawn_id,spawnState.hp,spawnState.respawnAt,spawnState.combatStartedAt,spawnState.defeatCount]
      );
    } else {
      outcome = performAction(found.rows[0].state,req.body);
    }
    await saveState(client,req.user.sub,outcome.state);
    if(req.body?.action==="move_player"||req.body?.action==="travel_map"){
      const position=outcome.state.position;
      await client.query(
        "INSERT INTO world_player_presence (account_id,map_id,x,y,last_seen_at) VALUES ($1,$2,$3,$4,NOW()) ON CONFLICT (account_id) DO UPDATE SET map_id=EXCLUDED.map_id,x=EXCLUDED.x,y=EXCLUDED.y,last_seen_at=NOW()",
        [req.user.sub,position.mapId,position.x,position.y]
      );
    }
    await client.query("COMMIT");
    res.json({ok:true,...outcome,state:publicState({state:outcome.state})});
  } catch(e){await client.query("ROLLBACK").catch(()=>{});next(e);} finally{client.release();}
});
app.use((err,_req,res,_next)=>{
  const status=Number.isInteger(err.status)?err.status:500;
  if(status>=500) console.error(err);
  res.status(status).json({ok:false,error:status>=500?"Error interno del servidor.":err.message});
});
initializeDatabase().then(async()=>{
  worldStreamSignature = await readWorldSignature();
  worldStreamTimer = setInterval(()=>publishWorldChanges().catch(error=>console.error("World stream poll failed:",error)),500);
  worldPlayerStreamTimer = setInterval(()=>{
    publishWorldPlayerSnapshots().catch(error=>console.error("World player stream poll failed:",error));
  },100);
  worldStreamHeartbeatTimer = setInterval(()=>{
    for (const client of worldStreamClients) {
      if (!client.res.writableEnded && !client.res.destroyed) client.res.write(": keep-alive\n\n");
    }
    for (const client of worldPlayerStreamClients) {
      if (!client.res.writableEnded && !client.res.destroyed) client.res.write(": keep-alive\n\n");
    }
  },15000);
  worldStreamTimer.unref?.();
  worldPlayerStreamTimer.unref?.();
  worldStreamHeartbeatTimer.unref?.();
  server.listen(PORT,"0.0.0.0",()=>console.log("Dragon Realm API listening on "+PORT));
}).catch(e=>{console.error("Database initialization failed:",e);process.exit(1);});
process.on("SIGTERM",async()=>{
  clearInterval(worldStreamTimer);
  clearInterval(worldPlayerStreamTimer);
  clearInterval(movementTimer);
  clearInterval(worldStreamHeartbeatTimer);
  for (const client of worldStreamClients) client.res.end();
  for (const client of worldPlayerStreamClients) client.res.end();
  worldStreamClients.clear();
  worldPlayerStreamClients.clear();
  for (const client of movementClients) client.ws.terminate();
  movementClients.clear();
  movementWss.close();
  await new Promise(resolve => {
    const timeout = setTimeout(resolve, 2000);
    server.close(() => { clearTimeout(timeout); resolve(); });
  });
  await pool.end();
  process.exit(0);
});
