const DEFAULT_STATE = Object.freeze({
  level: 1, power: 0, potential: 0,
  hp: 1000, maxHp: 1000, ki: 500, maxKi: 500,
  attack: 10, gold: 0, gems: 0, inventory: [],
  missions: { training_dummy: false }
});
function normalizeUsername(value) { return String(value || "").trim().toLowerCase(); }
function publicState(row) {
  return row?.state || { ...DEFAULT_STATE, inventory: [], missions: { ...DEFAULT_STATE.missions } };
}
async function loadState(db, accountId) {
  const result = await db.query("SELECT state FROM characters WHERE account_id = $1", [accountId]);
  if (!result.rowCount) {
    const inserted = await db.query(
      "INSERT INTO characters (account_id, state) VALUES ($1, $2::jsonb) RETURNING state",
      [accountId, JSON.stringify(DEFAULT_STATE)]
    );
    return publicState(inserted.rows[0]);
  }
  return publicState(result.rows[0]);
}
async function saveState(db, accountId, state) {
  await db.query(`INSERT INTO characters (account_id, state, updated_at)
    VALUES ($1, $2::jsonb, NOW())
    ON CONFLICT (account_id) DO UPDATE SET state = EXCLUDED.state, updated_at = NOW()`,
    [accountId, JSON.stringify(state)]);
}
function performAction(state, body) {
  if (!body || typeof body.action !== "string") {
    const e = new Error("Acción inválida."); e.status = 400; throw e;
  }
  if (body.action === "training_dummy") {
    if (state.missions.training_dummy) {
      const e = new Error("Esta recompensa ya fue reclamada."); e.status = 409; throw e;
    }
    state.missions.training_dummy = true;
    state.power += 50; state.potential += 50;
    return { state, result: { message: "Entrenamiento completado.", reward: { power: 50, potential: 50 } } };
  }
  if (body.action === "spend_potential") {
    const stat = body.stat;
    if (!new Set(["maxHp", "maxKi", "attack"]).has(stat)) {
      const e = new Error("Estadística no válida."); e.status = 400; throw e;
    }
    const cost = stat === "attack" ? 10 : 5;
    if (!Number.isSafeInteger(state.potential) || state.potential < cost) {
      const e = new Error("Potencial insuficiente."); e.status = 409; throw e;
    }
    state.potential -= cost;
    if (stat === "maxHp") { state.maxHp += 40; state.hp = Math.min(state.maxHp, state.hp + 40); }
    else if (stat === "maxKi") { state.maxKi += 40; state.ki = Math.min(state.maxKi, state.ki + 40); }
    else state.attack += 1;
    return { state, result: { message: "Estadística mejorada.", cost, stat } };
  }
  const e = new Error("Acción todavía no implementada en el servidor."); e.status = 501; throw e;
}
module.exports = { DEFAULT_STATE, normalizeUsername, loadState, saveState, performAction };
