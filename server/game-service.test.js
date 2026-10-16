const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_STATE, COMBAT_CONFIG, performAction } = require("./game-service");

function freshState() {
  return {
    ...DEFAULT_STATE,
    inventory: [],
    missions: { ...DEFAULT_STATE.missions },
    missionProgress: { ...DEFAULT_STATE.missionProgress },
    lastCombatAt: 0
  };
}

test("one dummy hit gives the minimum 1 Power and 1 Potential", () => {
  const state = freshState();
  const outcome = performAction(state, { action: "attack_mob", mobId: "training_dummy" }, { now: 1000 });
  assert.equal(outcome.result.damage, 1);
  assert.equal(outcome.result.mobDefeated, true);
  assert.equal(outcome.state.power, 1);
  assert.equal(outcome.state.potential, 1);
  assert.equal(outcome.state.missionProgress.trainingDummyKills, 1);
  assert.equal(outcome.result.missionCompleted, false);
});

test("the first mission pays 50 Power and Potential on the tenth dummy", () => {
  const state = freshState();
  for (let i = 1; i <= 9; i++) {
    performAction(state, { action: "attack_mob", mobId: "training_dummy" }, { now: i * 300 });
  }
  const tenth = performAction(state, { action: "attack_mob", mobId: "training_dummy" }, { now: 3000 });
  assert.equal(tenth.result.missionCompleted, true);
  assert.equal(tenth.result.missionProgress.kills, 10);
  assert.equal(tenth.state.power, 60);
  assert.equal(tenth.state.potential, 60);
  assert.equal(tenth.result.reward.power, 51);
  assert.equal(tenth.result.reward.potential, 51);
  assert.equal(tenth.state.missions.training_dummy, true);
});

test("the first mission reward is not paid twice", () => {
  const state = freshState();
  for (let i = 1; i <= 10; i++) {
    performAction(state, { action: "training_dummy" }, { now: i * 300 });
  }
  const next = performAction(state, { action: "training_dummy" }, { now: 3300 });
  assert.equal(next.result.missionCompleted, false);
  assert.equal(next.result.reward.power, 1);
  assert.equal(next.state.power, 61);
  assert.equal(next.state.potential, 61);
});

test("unknown mobs are rejected", () => {
  assert.throws(
    () => performAction(freshState(), { action: "attack_mob", mobId: "not-a-mob" }, { now: 1000 }),
    error => error.status === 404
  );
});

test("combat cooldown prevents rapid repeated hits", () => {
  const state = freshState();
  performAction(state, { action: "attack_mob" }, { now: 1000 });
  assert.throws(
    () => performAction(state, { action: "attack_mob" }, { now: 1000 + COMBAT_CONFIG.attackCooldownMs - 1 }),
    error => error.status === 429
  );
  assert.equal(state.power, 1);
  assert.equal(state.potential, 1);
});

test("HP upgrade spends Potential and adds 40 max HP", () => {
  const state = freshState();
  state.power = 5;
  state.potential = 5;
  const outcome = performAction(state, { action: "spend_potential", stat: "maxHp" });
  assert.equal(outcome.state.potential, 0);
  assert.equal(outcome.state.maxHp, 1040);
  assert.equal(outcome.state.hp, 1040);
  assert.equal(outcome.result.cost, 5);
});

test("KI upgrade adds 40 max KI without exceeding max KI", () => {
  const state = freshState();
  state.power = 5;
  state.potential = 5;
  state.ki = 490;
  const outcome = performAction(state, { action: "spend_potential", stat: "maxKi" });
  assert.equal(outcome.state.maxKi, 540);
  assert.equal(outcome.state.ki, 530);
  assert.equal(outcome.state.potential, 0);
});

test("attack upgrade requires 10 Potential and adds one attack", () => {
  const state = freshState();
  state.power = 10;
  state.potential = 10;
  const outcome = performAction(state, { action: "spend_potential", stat: "attack" });
  assert.equal(outcome.state.attack, 11);
  assert.equal(outcome.state.potential, 0);
});

test("unsupported stats and insufficient Potential are rejected without spending", () => {
  const state = freshState();
  state.power = 100;
  state.potential = 4;
  assert.throws(
    () => performAction(state, { action: "spend_potential", stat: "power" }),
    error => error.status === 400
  );
  assert.throws(
    () => performAction(state, { action: "spend_potential", stat: "maxHp" }),
    error => error.status === 409
  );
  assert.equal(state.potential, 4);
  assert.equal(state.maxHp, 1000);
});

test("Potential can never exceed total Power", () => {
  const state = freshState();
  state.power = 2;
  state.potential = 3;
  assert.throws(
    () => performAction(state, { action: "spend_potential", stat: "maxHp" }),
    error => error.status === 409
  );
});

test("malformed actions and unknown actions are rejected", () => {
  assert.throws(() => performAction(freshState(), null), error => error.status === 400);
  assert.throws(() => performAction(freshState(), { action: 42 }), error => error.status === 400);
  assert.throws(() => performAction(freshState(), { action: "unknown" }), error => error.status === 501);
});
