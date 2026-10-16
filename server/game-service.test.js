const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_STATE, performAction } = require("./game-service");

function freshState() {
  return {
    ...DEFAULT_STATE,
    inventory: [],
    missions: { ...DEFAULT_STATE.missions }
  };
}

test("training dummy awards 50 Power and Potential exactly once", () => {
  const state = freshState();
  const first = performAction(state, { action: "training_dummy" });
  assert.equal(first.state.power, 50);
  assert.equal(first.state.potential, 50);
  assert.equal(first.result.reward.power, 50);
  assert.equal(first.result.reward.potential, 50);
  assert.equal(first.state.missions.training_dummy, true);

  assert.throws(
    () => performAction(state, { action: "training_dummy" }),
    (error) => error.status === 409
  );
  assert.equal(state.power, 50);
  assert.equal(state.potential, 50);
});

test("HP upgrade spends Potential and adds 40 max HP", () => {
  const state = freshState();
  state.potential = 5;
  const outcome = performAction(state, { action: "spend_potential", stat: "maxHp" });
  assert.equal(outcome.state.potential, 0);
  assert.equal(outcome.state.maxHp, 1040);
  assert.equal(outcome.state.hp, 1040);
  assert.equal(outcome.result.cost, 5);
});

test("KI upgrade adds 40 max KI and does not exceed max KI", () => {
  const state = freshState();
  state.potential = 5;
  state.ki = 490;
  const outcome = performAction(state, { action: "spend_potential", stat: "maxKi" });
  assert.equal(outcome.state.maxKi, 540);
  assert.equal(outcome.state.ki, 530);
  assert.equal(outcome.state.potential, 0);
});

test("attack upgrade requires 10 Potential and adds one attack", () => {
  const state = freshState();
  state.potential = 10;
  const outcome = performAction(state, { action: "spend_potential", stat: "attack" });
  assert.equal(outcome.state.attack, 11);
  assert.equal(outcome.state.potential, 0);
});

test("spending Potential rejects an unsupported stat", () => {
  const state = freshState();
  state.potential = 100;
  assert.throws(
    () => performAction(state, { action: "spend_potential", stat: "power" }),
    (error) => error.status === 400
  );
  assert.equal(state.potential, 100);
});

test("spending Potential rejects insufficient balance without mutation", () => {
  const state = freshState();
  state.potential = 4;
  const before = { ...state };
  assert.throws(
    () => performAction(state, { action: "spend_potential", stat: "maxHp" }),
    (error) => error.status === 409
  );
  assert.equal(state.potential, before.potential);
  assert.equal(state.maxHp, before.maxHp);
});

test("unknown game actions return not implemented", () => {
  const state = freshState();
  assert.throws(
    () => performAction(state, { action: "attack_mob" }),
    (error) => error.status === 501
  );
});

test("malformed actions are rejected", () => {
  assert.throws(
    () => performAction(freshState(), null),
    (error) => error.status === 400
  );
  assert.throws(
    () => performAction(freshState(), { action: 42 }),
    (error) => error.status === 400
  );
});
