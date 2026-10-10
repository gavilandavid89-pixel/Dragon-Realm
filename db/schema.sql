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
