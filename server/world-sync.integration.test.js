const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");
const fs = require("node:fs");
const path = require("node:path");

const databaseUrl = process.env.WORLD_SYNC_TEST_DATABASE_URL;

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
      "SELECT spawn_id,hp,revision FROM world_mob_spawns WHERE revision > $1 AND revision <= $2 ORDER BY revision",
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
