const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_STATE, COMBAT_CONFIG, MOVEMENT_CONFIG, performAction, performSharedMobHit, assertCanReachSpawn } = require("./game-service");

function freshState() {
  return {
    ...DEFAULT_STATE,
    inventory: [],
    equipment: { ...DEFAULT_STATE.equipment },
    mobStates: {},
    missions: { ...DEFAULT_STATE.missions, scout_patrol: { ...DEFAULT_STATE.missions.scout_patrol } },
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


test("movement is server-authoritative and caps distance per request", () => {
  const state = freshState();
  const first = performAction(state, { action: "move_player", mapId: "earth_training", x: 600, y: 420 }, { now: 1000 });
  assert.equal(first.state.position.mapId, "earth_training");
  assert.equal(first.state.position.x, 270);
  assert.equal(first.state.position.y, 420);
  assert.equal(first.result.reachedTarget, false);
  const second = performAction(state, { action: "move_player", mapId: "earth_training", x: 600, y: 420 }, { now: 1200 });
  assert.equal(second.state.position.x, 334);
  assert.ok(second.state.position.x - first.state.position.x <= MOVEMENT_CONFIG.maxStepPerRequest);
});

test("movement rejects out-of-bounds targets and too-frequent requests", () => {
  const state = freshState();
  assert.throws(
    () => performAction(state, { action: "move_player", mapId: "earth_training", x: 9999, y: 420 }, { now: 1000 }),
    error => error.status === 400
  );
  assert.deepEqual(state.position, { mapId: "earth_training", x: 150, y: 420 });
  performAction(state, { action: "move_player", mapId: "earth_training", x: 300, y: 420 }, { now: 1000 });
  assert.throws(
    () => performAction(state, { action: "move_player", mapId: "earth_training", x: 300, y: 420 }, { now: 1000 + MOVEMENT_CONFIG.minIntervalMs - 1 }),
    error => error.status === 429
  );
});

test("movement cannot change maps without using a connected portal", () => {
  const state = freshState();
  assert.throws(
    () => performAction(state, { action: "move_player", mapId: "earth_wilderness", x: 500, y: 500 }, { now: 1000 }),
    error => error.status === 409 && /portal/.test(error.message)
  );
  const travel = performAction(state, { action: "travel_map", mapId: "earth_wilderness" }, { now: 1000 });
  assert.equal(travel.state.position.mapId, "earth_wilderness");
  assert.deepEqual(travel.state.position, { mapId: "earth_wilderness", x: 150, y: 600 });
});

test("portal travel requires the character to be near a configured portal", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 500, y: 420 };
  assert.throws(
    () => performAction(state, { action: "travel_map", mapId: "earth_wilderness" }, { now: 1000 }),
    error => error.status === 409 && /Acercate al portal/.test(error.message)
  );
});

test("world spawn attacks require the character to be on the same map and in range", () => {
  const state = freshState();
  assert.throws(
    () => assertCanReachSpawn(state, { mapId: "earth_training", x: 720, y: 420 }),
    error => error.status === 409 && /Acercate/.test(error.message)
  );
  assert.throws(
    () => assertCanReachSpawn(state, { mapId: "earth_wilderness", x: 150, y: 600 }),
    error => error.status === 409 && /mismo mapa/.test(error.message)
  );
  state.position = { mapId: "earth_training", x: 620, y: 420 };
  assert.equal(assertCanReachSpawn(state, { mapId: "earth_training", x: 720, y: 420 }), true);
});


test("movement cannot cross server-defined obstacles", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 500, y: 220 };
  const outcome = performAction(state, { action: "move_player", mapId: "earth_training", x: 620, y: 220 }, { now: 1000 });
  assert.equal(outcome.result.blocked, true);
  assert.ok(outcome.state.position.x < 560);
  assert.equal(outcome.state.position.y, 220);
});


test("NPC interactions require the player to be nearby on the same map", () => {
  const state = freshState();
  assert.throws(
    () => performAction(state, { action: "npc_interact", npcId: "bulma_training" }),
    error => error.status === 409 && /Acercate al NPC/.test(error.message)
  );
  state.position = { mapId: "earth_training", x: 260, y: 420 };
  const shop = performAction(state, { action: "npc_interact", npcId: "bulma_training" });
  assert.equal(shop.result.npc.name, "Bulma");
  assert.equal(shop.result.shop.length, 4);
  assert.equal(shop.result.shop[0].itemId, "training_boots");
  assert.throws(
    () => performAction(state, { action: "npc_interact", npcId: "master_training" }),
    error => error.status === 409 && /Acercate al NPC/.test(error.message)
  );
});

test("Bulma's shop validates proximity, NPC role, gold and inventory before charging", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 260, y: 420 };
  state.gold = 250;
  const purchase = performAction(state, { action: "buy_item", npcId: "bulma_training", itemId: "training_gloves" });
  assert.equal(purchase.state.gold, 0);
  assert.deepEqual(purchase.state.inventory, [{ itemId: "training_gloves", quantity: 1 }]);
  assert.equal(purchase.result.purchase.price, 250);
  assert.throws(
    () => performAction(state, { action: "buy_item", npcId: "bulma_training", itemId: "training_armor" }),
    error => error.status === 409 && /suficiente oro/.test(error.message)
  );
  assert.throws(
    () => performAction(state, { action: "buy_item", npcId: "master_training", itemId: "training_boots" }),
    error => error.status === 409 && /no puede realizar/.test(error.message)
  );
  state.position = { mapId: "earth_wilderness", x: 260, y: 420 };
  assert.throws(
    () => performAction(state, { action: "buy_item", npcId: "bulma_training", itemId: "training_boots" }),
    error => error.status === 409 && /misma zona/.test(error.message)
  );
});

test("the Master NPC gates training and Potential upgrades by proximity", () => {
  const state = freshState();
  assert.throws(
    () => performAction(state, { action: "npc_train", npcId: "master_training" }, { now: 1000 }),
    error => error.status === 409 && /Acercate al NPC/.test(error.message)
  );
  state.position = { mapId: "earth_training", x: 380, y: 420 };
  const dialogue = performAction(state, { action: "npc_interact", npcId: "master_training" });
  assert.equal(dialogue.result.actions.length, 5);
  const training = performAction(state, { action: "npc_train", npcId: "master_training" }, { now: 1000 });
  assert.equal(training.result.mobDefeated, true);
  state.power = 5;
  state.potential = 5;
  const upgrade = performAction(state, { action: "spend_potential", stat: "maxHp", npcId: "master_training" });
  assert.equal(upgrade.state.potential, 0);
  assert.equal(upgrade.state.maxHp, 1040);
  assert.throws(
    () => performAction(state, { action: "spend_potential", stat: "maxHp", npcId: "bulma_training" }),
    error => error.status === 409 && /no puede realizar/.test(error.message)
  );
});


test("Bulma's shop does not charge for an item when the inventory has no free stack", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 260, y: 420 };
  state.gold = 1000;
  state.inventory = Array.from({ length: COMBAT_CONFIG.inventoryMaxStacks }, (_, index) => ({
    itemId: "occupied_stack_" + index, quantity: 1
  }));
  assert.throws(
    () => performAction(state, { action: "buy_item", npcId: "bulma_training", itemId: "training_boots" }),
    error => error.status === 409 && /inventario está lleno/.test(error.message)
  );
  assert.equal(state.gold, 1000);
  assert.equal(state.inventory.length, COMBAT_CONFIG.inventoryMaxStacks);
});


test("Master patrol mission persists progress and pays its reward only once", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 380, y: 420 };
  const accepted = performAction(state, { action: "mission_accept", npcId: "master_training" });
  assert.equal(accepted.state.missions.scout_patrol.accepted, true);
  assert.equal(accepted.result.mission.required, 3);

  let now = 1000;
  for (let kill = 0; kill < 3; kill++) {
    const spawnState = { hp: 100, respawnAt: 0, combatStartedAt: null, defeatCount: 0 };
    for (let hit = 0; hit < 10; hit++) {
      performSharedMobHit(state, "saibaman_scout", spawnState, now, () => 0, "earth_training");
      now += 300;
    }
  }
  assert.equal(state.missionProgress.scoutPatrolKills, 3);
  const powerBeforeClaim = state.power;
  const potentialBeforeClaim = state.potential;
  const goldBeforeClaim = state.gold;
  const claimed = performAction(state, { action: "mission_claim", npcId: "master_training" });
  assert.equal(claimed.state.missions.scout_patrol.claimed, true);
  assert.equal(claimed.state.power, powerBeforeClaim + 100);
  assert.equal(claimed.state.potential, potentialBeforeClaim + 100);
  assert.equal(claimed.state.gold, goldBeforeClaim + 100);
  assert.deepEqual(claimed.result.reward, { power: 100, potential: 100, gold: 100, gems: 0, equipment: [] });
  assert.throws(
    () => performAction(state, { action: "mission_claim", npcId: "master_training" }),
    error => error.status === 409 && /ya fue reclamada/.test(error.message)
  );
  assert.equal(state.power, powerBeforeClaim + 100);
  assert.equal(state.potential, potentialBeforeClaim + 100);
  assert.equal(state.gold, goldBeforeClaim + 100);
});

test("patrol mission cannot be claimed early or managed from the wrong NPC", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 380, y: 420 };
  assert.throws(
    () => performAction(state, { action: "mission_accept", npcId: "bulma_training" }),
    error => error.status === 409 && /no puede realizar/.test(error.message)
  );
  performAction(state, { action: "mission_accept", npcId: "master_training" });
  assert.throws(
    () => performAction(state, { action: "mission_claim", npcId: "master_training" }),
    error => error.status === 409 && /faltan Saibamen/.test(error.message)
  );
  assert.equal(state.missions.scout_patrol.claimed, false);
  assert.equal(state.power, 0);
  assert.equal(state.potential, 0);
  assert.equal(state.gold, 0);
});

test("patrol mission progress is not credited before acceptance", () => {
  const state = freshState();
  const spawnState = { hp: 10, respawnAt: 0, combatStartedAt: null, defeatCount: 0 };
  const outcome = performSharedMobHit(state, "saibaman_scout", spawnState, 1000, () => 0);
  assert.equal(outcome.result.mobDefeated, true);
  assert.equal(state.missionProgress.scoutPatrolKills, 0);
});


test("existing character mission progress is migrated in memory without losing dummy progress", () => {
  const state = freshState();
  state.missionProgress = { trainingDummyKills: 7 };
  state.position = { mapId: "earth_training", x: 380, y: 420 };
  const result = performAction(state, { action: "npc_interact", npcId: "master_training" });
  assert.equal(result.state.missionProgress.trainingDummyKills, 7);
  assert.equal(result.state.missionProgress.scoutPatrolKills, 0);
});


test("patrol objective ignores a matching mob defeated outside the training map", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 380, y: 420 };
  performAction(state, { action: "mission_accept", npcId: "master_training" });
  const spawnState = { hp: 10, respawnAt: 0, combatStartedAt: null, defeatCount: 0 };
  const result = performSharedMobHit(state, "saibaman_scout", spawnState, 1000, () => 0, "earth_wilderness");
  assert.equal(result.result.mobDefeated, true);
  assert.equal(state.missionProgress.scoutPatrolKills, 0);
});
