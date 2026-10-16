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


-- One authoritative living instance per configured mob type, shared by every account.
-- Times are Unix milliseconds so the Node service can compare them without timezone ambiguity.
CREATE TABLE IF NOT EXISTS global_mob_instances (
  mob_id TEXT PRIMARY KEY,
  hp INTEGER NOT NULL CHECK (hp >= 0),
  respawn_at_ms BIGINT NOT NULL DEFAULT 0 CHECK (respawn_at_ms >= 0),
  combat_started_at_ms BIGINT NULL CHECK (combat_started_at_ms IS NULL OR combat_started_at_ms >= 0),
  defeat_count BIGINT NOT NULL DEFAULT 0 CHECK (defeat_count >= 0),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
