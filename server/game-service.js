const DEFAULT_STATE = Object.freeze({
  level: 1, power: 0, potential: 0,
  hp: 1000, maxHp: 1000, ki: 500, maxKi: 500,
  attack: 10, gold: 0, gems: 0, inventory: [],
  missions: { training_dummy: false },
  missionProgress: { trainingDummyKills: 0 },
  lastCombatAt: 0
});

const COMBAT_CONFIG = Object.freeze({
  trainingDummy: Object.freeze({ id: "training_dummy", hp: 1, power: 1, respawnPerHit: true }),
  minimumPowerPerHit: 1,
  attackCooldownMs: 250,
  firstMissionKills: 10,
  firstMissionReward: Object.freeze({ power: 50, potential: 50 })
});

function normalizeUsername(value) { return String(value || "").trim().toLowerCase(); }

function cloneDefaultState() {
  return {
    ...DEFAULT_STATE,
    inventory: [],
    missions: { ...DEFAULT_STATE.missions },
    missionProgress: { ...DEFAULT_STATE.missionProgress }
  };
}

function publicState(row) {
  if (!row?.state) return cloneDefaultState();
  const state = row.state;
  if (!state.missions || typeof state.missions !== "object") state.missions = {};
  if (!state.missionProgress || typeof state.missionProgress !== "object") {
    state.missionProgress = {
      trainingDummyKills: state.missions.training_dummy ? COMBAT_CONFIG.firstMissionKills : 0
    };
  }
  if (!Number.isSafeInteger(state.lastCombatAt)) state.lastCombatAt = 0;
  return state;
}

async function loadState(db, accountId) {
  const result = await db.query("SELECT state FROM characters WHERE account_id = $1", [accountId]);
  if (!result.rowCount) {
    const inserted = await db.query(
      "INSERT INTO characters (account_id, state) VALUES ($1, $2::jsonb) RETURNING state",
      [accountId, JSON.stringify(cloneDefaultState())]
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

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  throw error;
}

function ensureProgress(state) {
  if (!state.missions || typeof state.missions !== "object") state.missions = {};
  if (!state.missionProgress || typeof state.missionProgress !== "object") {
    state.missionProgress = {
      trainingDummyKills: state.missions.training_dummy ? COMBAT_CONFIG.firstMissionKills : 0
    };
  }
  if (!Number.isSafeInteger(state.missionProgress.trainingDummyKills) || state.missionProgress.trainingDummyKills < 0) {
    fail(409, "El progreso de misión del personaje no es válido.");
  }
  if (!Number.isSafeInteger(state.lastCombatAt) || state.lastCombatAt < 0) state.lastCombatAt = 0;
}

function validateProgression(state) {
  for (const key of ["power", "potential", "gold", "gems", "attack", "hp", "maxHp", "ki", "maxKi"]) {
    if (!Number.isSafeInteger(state[key]) || state[key] < 0) {
      fail(409, "Las estadísticas guardadas del personaje no son válidas.");
    }
  }
  if (state.potential > state.power) {
    fail(409, "El Potencial no puede superar el Poder total.");
  }
}

function performTrainingDummyHit(state, now = Date.now()) {
  ensureProgress(state);
  validateProgression(state);
  if (!Number.isSafeInteger(now) || now < 0) fail(500, "Reloj de combate no válido.");
  if (now - state.lastCombatAt < COMBAT_CONFIG.attackCooldownMs) {
    fail(429, "Esperá un instante antes de volver a golpear.");
  }

  // The training dummy intentionally takes one damage per hit.
  state.lastCombatAt = now;
  state.power += COMBAT_CONFIG.minimumPowerPerHit;
  state.potential += COMBAT_CONFIG.minimumPowerPerHit;
  state.missionProgress.trainingDummyKills += 1;

  const reward = {
    power: COMBAT_CONFIG.minimumPowerPerHit,
    potential: COMBAT_CONFIG.minimumPowerPerHit,
    gold: 0,
    gems: 0
  };
  let missionCompleted = false;

  if (
    state.missionProgress.trainingDummyKills >= COMBAT_CONFIG.firstMissionKills &&
    !state.missions.training_dummy
  ) {
    state.missions.training_dummy = true;
    state.power += COMBAT_CONFIG.firstMissionReward.power;
    state.potential += COMBAT_CONFIG.firstMissionReward.potential;
    reward.power += COMBAT_CONFIG.firstMissionReward.power;
    reward.potential += COMBAT_CONFIG.firstMissionReward.potential;
    missionCompleted = true;
  }

  return {
    state,
    result: {
      message: missionCompleted
        ? "¡Misión completada! Derrotaste 10 muñecos de entrenamiento."
        : "Golpe acertado: muñeco de entrenamiento derrotado.",
      mobId: COMBAT_CONFIG.trainingDummy.id,
      damage: 1,
      mobDefeated: true,
      missionCompleted,
      missionProgress: {
        kills: Math.min(state.missionProgress.trainingDummyKills, COMBAT_CONFIG.firstMissionKills),
        required: COMBAT_CONFIG.firstMissionKills
      },
      reward
    }
  };
}

function performAction(state, body, options = {}) {
  if (!body || typeof body.action !== "string") fail(400, "Acción inválida.");

  if (body.action === "training_dummy" || body.action === "attack_mob") {
    const mobId = body.mobId || "training_dummy";
    if (mobId !== COMBAT_CONFIG.trainingDummy.id) fail(404, "No se encontró ese enemigo.");
    return performTrainingDummyHit(state, options.now ?? Date.now());
  }

  if (body.action === "spend_potential") {
    validateProgression(state);
    const stat = body.stat;
    if (!new Set(["maxHp", "maxKi", "attack"]).has(stat)) {
      fail(400, "Estadística no válida.");
    }
    const cost = stat === "attack" ? 10 : 5;
    if (state.potential < cost) fail(409, "Potencial insuficiente.");

    state.potential -= cost;
    if (stat === "maxHp") {
      state.maxHp += 40;
      state.hp = Math.min(state.maxHp, state.hp + 40);
    } else if (stat === "maxKi") {
      state.maxKi += 40;
      state.ki = Math.min(state.maxKi, state.ki + 40);
    } else {
      state.attack += 1;
    }
    return { state, result: { message: "Estadística mejorada.", cost, stat } };
  }

  fail(501, "Acción todavía no implementada en el servidor.");
}

module.exports = {
  DEFAULT_STATE,
  COMBAT_CONFIG,
  normalizeUsername,
  cloneDefaultState,
  publicState,
  loadState,
  saveState,
  performAction
};
