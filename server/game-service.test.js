const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_STATE, COMBAT_CONFIG, performAction, performSharedMobHit } = require("./game-service");

function freshState() {
  return {
    ...DEFAULT_STATE,
    inventory: [],
    equipment: { ...DEFAULT_STATE.equipment },
    mobStates: {},
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


test("Saibaman combat grants tier-based Power and Potential and rolls loot only on death", () => {
  const state = freshState();
  let outcome;
  for (let i = 0; i < 10; i++) outcome = performAction(state, { action: "attack_mob", mobId: "saibaman_scout" }, { now: 1000 + i * 300, random: () => 0 });
  assert.equal(outcome.result.mobDefeated, true);
  assert.equal(outcome.result.mobHp, 0);
  assert.equal(state.power, 100);
  assert.equal(state.potential, 100);
  assert.equal(state.gold, 20);
  assert.equal(state.gems, 1);
  assert.equal(outcome.result.reward.equipment.length, 4);
  assert.equal(state.inventory.length, 4);
  assert.equal(state.mobStates.saibaman_scout.respawnAt, 8700);
});

test("a defeated mob cannot be farmed during its respawn timer", () => {
  const state = freshState();
  for (let i = 0; i < 10; i++) performAction(state, { action: "attack_mob", mobId: "saibaman_scout" }, { now: 1000 + i * 300, random: () => 0 });
  const powerBefore = state.power;
  assert.throws(() => performAction(state, { action: "attack_mob", mobId: "saibaman_scout" }, { now: 8699, random: () => 0 }), error => error.status === 409 && /reaparece/.test(error.message));
  assert.equal(state.power, powerBefore);
  const respawned = performAction(state, { action: "attack_mob", mobId: "saibaman_scout" }, { now: 8700, random: () => 0.999999 });
  assert.equal(respawned.result.mobHp, 90);
  assert.equal(respawned.result.mobDefeated, false);
});

test("equipment requirements and bonuses are enforced by the server", () => {
  const state = freshState();
  state.inventory = [{ itemId: "training_gloves", quantity: 1 }];
  state.power = 799;
  state.potential = 0;
  assert.throws(() => performAction(state, { action: "equip_item", itemId: "training_gloves" }), error => error.status === 409 && /Necesitás 800/.test(error.message));
  assert.equal(state.equipment.gloves, null);
  state.power = 800;
  const equipped = performAction(state, { action: "equip_item", itemId: "training_gloves" });
  assert.equal(equipped.state.equipment.gloves, "training_gloves");
  assert.equal(equipped.result.effectiveStats.attack, 12);
  assert.deepEqual(equipped.state.inventory, []);
});

test("invalid equipment slot and unowned equipment are rejected", () => {
  const state = freshState();
  assert.throws(() => performAction(state, { action: "equip_item", itemId: "made_up_item" }), error => error.status === 404);
  assert.throws(() => performAction(state, { action: "unequip_item", slot: "cape" }), error => error.status === 400);
});


test("shared mob HP is external to each character and the kill reward is paid once", () => {
  const playerA = freshState();
  const playerB = freshState();
  const worldMob = { hp:100, respawnAt:0, combatStartedAt:null, defeatCount:0 };
  let result;
  for (let i=0;i<10;i++) {
    result=performSharedMobHit(playerA,"saibaman_scout",worldMob,1000+i*300,()=>0);
  }
  assert.equal(result.result.mobDefeated,true);
  assert.equal(worldMob.hp,0);
  assert.equal(worldMob.defeatCount,1);
  assert.equal(playerA.gold,20);
  assert.equal(playerB.gold,0);
  assert.equal(playerB.mobStates.saibaman_scout,undefined);
  assert.throws(
    () => performSharedMobHit(playerB,"saibaman_scout",worldMob,4000,()=>0),
    error => error.status===409 && /reaparece/.test(error.message)
  );
  assert.equal(playerB.power,0);
  assert.equal(playerB.gold,0);
  const afterRespawn=performSharedMobHit(playerB,"saibaman_scout",worldMob,8700,()=>0.999999);
  assert.equal(afterRespawn.result.mobDefeated,false);
  assert.equal(worldMob.hp,90);
  assert.equal(worldMob.defeatCount,1);
});

test("shared mob combat rejects a missing or malformed shared state", () => {
  assert.throws(
    () => performSharedMobHit(freshState(),"saibaman_scout",null,1000,()=>0),
    error => error.status===500
  );
});
