CREATE TABLE IF NOT EXISTS accounts (
  id BIGSERIAL PRIMARY KEY,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS characters (
  account_id BIGINT PRIMARY KEY REFERENCES accounts(id) ON DELETE CASCADE,
  state JSONB NOT NULL DEFAULT '{"level":1,"power":0,"potential":0,"hp":1000,"maxHp":1000,"ki":500,"maxKi":500,"attack":10,"gold":0,"gems":0,"inventory":[],"missions":{"training_dummy":false}}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Legacy mob-type state retained to preserve existing database data during migration.
-- Current authoritative world combat state is stored per spawn in world_mob_spawns below.
-- Times are Unix milliseconds so the Node service can compare them without timezone ambiguity.
CREATE TABLE IF NOT EXISTS global_mob_instances (
  mob_id TEXT PRIMARY KEY,
  hp INTEGER NOT NULL CHECK (hp >= 0),
  respawn_at_ms BIGINT NOT NULL DEFAULT 0 CHECK (respawn_at_ms >= 0),
  combat_started_at_ms BIGINT NULL CHECK (combat_started_at_ms IS NULL OR combat_started_at_ms >= 0),
  defeat_count BIGINT NOT NULL DEFAULT 0 CHECK (defeat_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);


-- Independent persistent world spawns. Existing global_mob_instances is retained
-- during the transition so existing combat and character data are not discarded.
CREATE TABLE IF NOT EXISTS world_mob_spawns (
  spawn_id TEXT PRIMARY KEY,
  map_id TEXT NOT NULL,
  mob_id TEXT NOT NULL,
  x INTEGER NOT NULL CHECK (x >= 0),
  y INTEGER NOT NULL CHECK (y >= 0),
  hp INTEGER NOT NULL CHECK (hp >= 0),
  respawn_at_ms BIGINT NOT NULL DEFAULT 0 CHECK (respawn_at_ms >= 0),
  combat_started_at_ms BIGINT NULL CHECK (combat_started_at_ms IS NULL OR combat_started_at_ms >= 0),
  defeat_count BIGINT NOT NULL DEFAULT 0 CHECK (defeat_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS world_mob_spawns_map_idx ON world_mob_spawns (map_id);
