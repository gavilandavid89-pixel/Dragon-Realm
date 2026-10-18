const test = require("node:test");
const assert = require("node:assert/strict");
const { Client } = require("pg");

const databaseUrl = process.env.WORLD_SYNC_TEST_DATABASE_URL;

test("global world revisions preserve concurrent enemy updates", {
  skip: databaseUrl ? false : "Set WORLD_SYNC_TEST_DATABASE_URL to an isolated PostgreSQL test database",
  timeout: 20000
}, async () => {
  const admin = new Client({ connectionString: databaseUrl });
  const first = new Client({ connectionString: databaseUrl });
  const second = new Client({ connectionString: databaseUrl });
  const schema = "world_sync_test_" + process.pid + "_" + Date.now();
  let adminConnected = false;
  let schemaCreated = false;

  try {
    await admin.connect();
    adminConnected = true;
    await admin.query("CREATE SCHEMA " + schema);
    schemaCreated = true;
    for (const client of [first, second]) {
      await client.connect();
      await client.query("SET search_path TO " + schema);
    }

    await first.query(`
      CREATE TABLE world_revision_state (
        id SMALLINT PRIMARY KEY CHECK (id = 1),
        revision BIGINT NOT NULL DEFAULT 0 CHECK (revision >= 0)
      );
      INSERT INTO world_revision_state (id, revision) VALUES (1, 0);
      CREATE TABLE world_mob_spawns (
        spawn_id TEXT PRIMARY KEY,
        hp INTEGER NOT NULL,
        revision BIGINT NOT NULL DEFAULT 0
      );
      CREATE FUNCTION assign_world_mob_revision() RETURNS TRIGGER AS $$
      BEGIN
        UPDATE world_revision_state
        SET revision = revision + 1
        WHERE id = 1
        RETURNING revision INTO NEW.revision;
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;
      CREATE TRIGGER world_mob_revision_trigger
      BEFORE INSERT OR UPDATE ON world_mob_spawns
      FOR EACH ROW EXECUTE FUNCTION assign_world_mob_revision();
      INSERT INTO world_mob_spawns (spawn_id, hp) VALUES ('mob-a', 100), ('mob-b', 100);
    `);

    const initial = await first.query("SELECT revision FROM world_revision_state WHERE id=1");
    const since = Number(initial.rows[0].revision);
    await first.query("BEGIN");
    await first.query("UPDATE world_mob_spawns SET hp=80 WHERE spawn_id='mob-a'");

    await second.query("BEGIN");
    const concurrentUpdate = second.query("UPDATE world_mob_spawns SET hp=60 WHERE spawn_id='mob-b'");
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
  } finally {
    for (const client of [first, second]) {
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
