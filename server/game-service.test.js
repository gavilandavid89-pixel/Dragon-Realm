const test = require("node:test");
const assert = require("node:assert/strict");
const { DEFAULT_STATE, COMBAT_CONFIG, MOVEMENT_CONFIG, performAction, performSharedMobHit, assertCanReachSpawn, assertSpawnMobMatchesRequest, effectiveStats, publicState } = require("./game-service");
const { CHARACTER_RACES, SKILL_DEFINITIONS } = require("./game-config");

function freshState() {
  return {
    ...DEFAULT_STATE,
    inventory: [],
    equipment: { ...DEFAULT_STATE.equipment },
    mobStates: {},
    missions: { ...DEFAULT_STATE.missions, scout_patrol: { ...DEFAULT_STATE.missions.scout_patrol }, wilderness_patrol: { ...DEFAULT_STATE.missions.wilderness_patrol } },
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

test("selected spawn identity cannot be used with a mismatched mob id", () => {
  assert.equal(assertSpawnMobMatchesRequest(undefined, "saibaman_scout"), true);
  assert.equal(assertSpawnMobMatchesRequest("saibaman_scout", "saibaman_scout"), true);
  assert.throws(
    () => assertSpawnMobMatchesRequest("raditz", "saibaman_scout"),
    error => error.status === 409 && /no coincide/.test(error.message)
  );
  assert.throws(
    () => assertSpawnMobMatchesRequest({ mob: "raditz" }, "saibaman_scout"),
    error => error.status === 400 && /Identificador de enemigo/.test(error.message)
  );
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

test("full inventory preserves equipment drops as claimable pending loot", () => {
  const state = freshState();
  state.inventory = Array.from({ length: COMBAT_CONFIG.inventoryMaxStacks }, (_, index) => ({
    itemId: "legacy_item_" + index, quantity: 1
  }));
  const spawn = { hp: 1, respawnAt: 0, combatStartedAt: 1000, defeatCount: 0 };

  const defeated = performSharedMobHit(state, "saibaman_scout", spawn, 1000, () => 0, "earth_training");
  assert.equal(defeated.result.mobDefeated, true);
  assert.equal(defeated.result.inventoryFullDrops.length, 4);
  assert.deepEqual(state.pendingLoot, [
    { itemId: "training_gloves", quantity: 1 },
    { itemId: "training_pants", quantity: 1 },
    { itemId: "training_armor", quantity: 1 },
    { itemId: "training_boots", quantity: 1 }
  ]);
  assert.equal(state.inventory.length, COMBAT_CONFIG.inventoryMaxStacks);

  assert.throws(
    () => performAction(state, { action: "claim_pending_loot" }),
    error => error.status === 409 && /inventario está lleno/.test(error.message)
  );
  assert.equal(state.pendingLoot.length, 4);

  state.inventory.pop();
  state.inventory.pop();
  const partial = performAction(state, { action: "claim_pending_loot" });
  assert.deepEqual(partial.result.claimedItems, [
    { itemId: "training_gloves", quantity: 1 },
    { itemId: "training_pants", quantity: 1 }
  ]);
  assert.deepEqual(state.pendingLoot, [
    { itemId: "training_armor", quantity: 1 },
    { itemId: "training_boots", quantity: 1 }
  ]);

  state.inventory.pop();
  state.inventory.pop();
  const final = performAction(state, { action: "claim_pending_loot" });
  assert.equal(final.result.message, "Recogiste todo el botín pendiente.");
  assert.deepEqual(state.pendingLoot, []);
  assert.equal(state.inventory.length, COMBAT_CONFIG.inventoryMaxStacks);
});

test("legacy characters receive an empty pending-loot queue", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 380, y: 420 };
  delete state.pendingLoot;
  const migrated = performAction(state, { action: "mission_status", missionId: "scout_patrol", npcId: "master_training" });
  assert.deepEqual(migrated.state.pendingLoot, []);
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
    error => error.status === 409 && /faltan objetivos/.test(error.message)
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


test("data-driven wilderness mission enforces Power gate and pays its configured reward once", () => {
  const state = freshState();
  state.position = { mapId: "earth_wilderness", x: 240, y: 600 };
  assert.throws(
    () => performAction(state, { action: "mission_accept", missionId: "wilderness_patrol", npcId: "wilderness_scout" }),
    error => error.status === 409 && /Completá primero la misión Patrulla de Saibamen/.test(error.message)
  );
  state.missions.scout_patrol.claimed = true;
  assert.throws(
    () => performAction(state, { action: "mission_accept", missionId: "wilderness_patrol", npcId: "wilderness_scout" }),
    error => error.status === 409 && /1.000 de Poder/.test(error.message)
  );
  state.power = 1000;
  state.potential = 1000;
  const accepted = performAction(state, { action: "mission_accept", missionId: "wilderness_patrol", npcId: "wilderness_scout" });
  assert.equal(accepted.state.missions.wilderness_patrol.accepted, true);

  let now = 1000;
  for (let kill = 0; kill < 3; kill++) {
    const spawnState = { hp: 1, respawnAt: 0, combatStartedAt: 500, defeatCount: 0 };
    performSharedMobHit(state, "saibaman_scout", spawnState, now, () => 0, "earth_wilderness");
    now += 300;
  }
  assert.equal(state.missionProgress.wildernessPatrolKills, 3);
  const before = { power: state.power, potential: state.potential, gold: state.gold };
  const claimed = performAction(state, { action: "mission_claim", missionId: "wilderness_patrol", npcId: "wilderness_scout" });
  assert.deepEqual(claimed.result.reward, { power: 250, potential: 250, gold: 250, gems: 0, equipment: [] });
  assert.equal(claimed.state.power, before.power + 250);
  assert.equal(claimed.state.potential, before.potential + 250);
  assert.equal(claimed.state.gold, before.gold + 250);
  assert.throws(
    () => performAction(state, { action: "mission_claim", missionId: "wilderness_patrol", npcId: "wilderness_scout" }),
    error => error.status === 409 && /ya fue reclamada/.test(error.message)
  );
});

test("wilderness mission is locked until the Master patrol reward is claimed", () => {
  const state = freshState();
  state.position = { mapId: "earth_wilderness", x: 240, y: 600 };
  state.power = 1000;
  state.potential = 1000;

  const dialogue = performAction(state, { action: "npc_interact", npcId: "wilderness_scout" });
  const missionAction = dialogue.result.actions.find(entry => entry.missionId === "wilderness_patrol");
  assert.equal(missionAction.id, "mission_status");
  assert.match(missionAction.label, /Bloqueada.*Patrulla de Saibamen/);

  const status = performAction(state, { action: "mission_status", missionId: "wilderness_patrol", npcId: "wilderness_scout" });
  assert.equal(status.result.mission.unlocked, false);
  assert.match(status.result.message, /completá primero Patrulla de Saibamen/);
  assert.throws(
    () => performAction(state, { action: "mission_accept", missionId: "wilderness_patrol", npcId: "wilderness_scout" }),
    error => error.status === 409 && /Completá primero la misión Patrulla de Saibamen/.test(error.message)
  );

  state.missions.scout_patrol.claimed = true;
  const unlocked = performAction(state, { action: "mission_accept", missionId: "wilderness_patrol", npcId: "wilderness_scout" });
  assert.equal(unlocked.state.missions.wilderness_patrol.accepted, true);
});

test("generic mission actions reject an NPC that does not own the mission", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 380, y: 420 };
  assert.throws(
    () => performAction(state, { action: "mission_accept", missionId: "wilderness_patrol", npcId: "master_training" }),
    error => error.status === 409 && /gestiona esa misión/.test(error.message)
  );
});

test("legacy character state gains new mission fields without resetting existing progress", () => {
  const state = freshState();
  state.position = { mapId: "earth_training", x: 380, y: 420 };
  state.missions = { training_dummy: false, scout_patrol: { accepted: true, claimed: false } };
  state.missionProgress = { trainingDummyKills: 7, scoutPatrolKills: 2 };
  const result = performAction(state, { action: "mission_status", missionId: "scout_patrol", npcId: "master_training" });
  assert.equal(result.state.missionProgress.trainingDummyKills, 7);
  assert.equal(result.state.missionProgress.scoutPatrolKills, 2);
  assert.deepEqual(result.state.missions.wilderness_patrol, { accepted: false, claimed: false });
  assert.equal(result.state.missionProgress.wildernessPatrolKills, 0);
});


test("veteran sweep unlocks after wilderness patrol and pays its reward once", () => {
  const state = freshState();
  state.position = { mapId: "earth_wilderness", x: 240, y: 600 };
  state.power = 2000;
  state.potential = 2000;
  state.missions.wilderness_patrol.claimed = true;

  const dialogue = performAction(state, { action: "npc_interact", npcId: "wilderness_scout" });
  const offer = dialogue.result.actions.find(entry => entry.missionId === "veteran_sweep");
  assert.ok(offer);
  assert.match(offer.label, /Aceptar: La avanzada veterana/);

  const accepted = performAction(state, {
    action: "mission_accept", missionId: "veteran_sweep", npcId: "wilderness_scout"
  });
  assert.equal(accepted.state.missions.veteran_sweep.accepted, true);

  let now = 1000;
  for (let kill = 0; kill < 5; kill += 1) {
    const spawn = { hp: 1, respawnAt: 0, combatStartedAt: now, defeatCount: kill };
    performSharedMobHit(state, "saibaman_veteran", spawn, now, () => 0, "earth_wilderness");
    now += 300;
  }
  assert.equal(state.missionProgress.veteranSweepKills, 5);

  const before = { power: state.power, potential: state.potential, gold: state.gold, gems: state.gems };
  const claimed = performAction(state, {
    action: "mission_claim", missionId: "veteran_sweep", npcId: "wilderness_scout"
  });
  assert.deepEqual(claimed.result.reward, { power: 500, potential: 500, gold: 350, gems: 1, equipment: [] });
  assert.equal(state.power, before.power + 500);
  assert.equal(state.potential, before.potential + 500);
  assert.equal(state.gold, before.gold + 350);
  assert.equal(state.gems, before.gems + 1);
  assert.throws(
    () => performAction(state, { action: "mission_claim", missionId: "veteran_sweep", npcId: "wilderness_scout" }),
    error => error.status === 409 && /ya fue reclamada/.test(error.message)
  );
});

test("veteran mission power requirement is shown by the Explorer", () => {
  const state = freshState();
  state.position = { mapId: "earth_wilderness", x: 240, y: 600 };
  state.missions.wilderness_patrol.claimed = true;
  state.power = 1499;
  const dialogue = performAction(state, { action: "npc_interact", npcId: "wilderness_scout" });
  const offer = dialogue.result.actions.find(entry => entry.missionId === "veteran_sweep");
  assert.equal(offer.id, "mission_status");
  assert.ok(offer.label.includes("1.500 de Poder"));
  const status = performAction(state, { action: "mission_status", missionId: "veteran_sweep", npcId: "wilderness_scout" });
  assert.equal(status.result.mission.unlocked, false);
  assert.ok(status.result.message.includes("1.500 de Poder"));
});


test("the three character races grant distinct server-side bonuses and cannot be switched", () => {
  assert.deepEqual(Object.keys(CHARACTER_RACES), ["saiyan", "namekian", "earthling"]);
  const cases = [
    ["saiyan", "attack", 13],
    ["namekian", "maxHp", 1200],
    ["earthling", "maxKi", 650]
  ];
  for (const [race, stat, expected] of cases) {
    const state = freshState();
    const selected = performAction(state, { action: "select_race", race });
    assert.equal(state.race, race);
    assert.equal(effectiveStats(state)[stat], expected);
    assert.equal(selected.result.race.id, race);
    assert.equal(performAction(state, { action: "select_race", race }).state.race, race);
    assert.throws(
      () => performAction(state, { action: "select_race", race: cases.find(entry => entry[0] !== race)[0] }),
      error => error.status === 409 && /no se puede cambiar/.test(error.message)
    );
  }
});

test("invalid race selection is rejected and legacy characters remain selectable", () => {
  const state = freshState();
  assert.throws(() => performAction(state, { action: "select_race", race: "android" }),
    error => error.status === 400 && /raza disponible/.test(error.message));
  const legacy = publicState({ state: { ...freshState(), race: "unknown_race" } });
  assert.equal(legacy.race, null);
  assert.equal(performAction(legacy, { action: "select_race", race: "namekian" }).state.race, "namekian");
});


test("each race unlocks only its own server-validated skill with Ki cost and cooldown", () => {
  const scenarios = [
    { race:"saiyan", skillId:"saiyan_burst", damage:28, kiCost:70 },
    { race:"namekian", skillId:"namekian_wave", damage:19, kiCost:55 },
    { race:"earthling", skillId:"earthling_pulse", damage:17, kiCost:30 }
  ];
  for (const scenario of scenarios) {
    const state = freshState();
    performAction(state, { action:"select_race", race:scenario.race });
    const mob = { hp:1000, respawnAt:0, combatStartedAt:null, defeatCount:0 };
    const beforeKi = state.ki;
    const result = performSharedMobHit(state, "saibaman_scout", mob, 1000, () => 0, "earth_training", scenario.skillId);
    assert.equal(result.result.damage, scenario.damage);
    assert.equal(state.ki, beforeKi-scenario.kiCost);
    assert.equal(result.result.skillId, scenario.skillId);
    assert.equal(result.result.kiSpent, scenario.kiCost);
    assert.equal(state.skillCooldowns[scenario.skillId], 1000+SKILL_DEFINITIONS[scenario.skillId].cooldownMs);
    assert.throws(() => performSharedMobHit(state,"saibaman_scout",mob,1300,()=>0,"earth_training",scenario.skillId),
      error => error.status===409 && /lista en/.test(error.message));
    const other = scenarios.find(item=>item.race!==scenario.race);
    assert.throws(() => performSharedMobHit(state,"saibaman_scout",mob,5000,()=>0,"earth_training",other.skillId),
      error => error.status===403 && /no pertenece/.test(error.message));
  }
});

test("race skills reject insufficient Ki and the Namekian wave heals without exceeding max HP", () => {
  const state=freshState();
  performAction(state,{action:"select_race",race:"namekian"});
  state.ki=54;
  const mob={hp:1000,respawnAt:0,combatStartedAt:null,defeatCount:0};
  assert.throws(()=>performSharedMobHit(state,"saibaman_scout",mob,1000,()=>0,"earth_training","namekian_wave"),
    error=>error.status===409 && /suficiente Ki/.test(error.message));
  state.ki=500;
  state.hp=700;
  const outcome=performSharedMobHit(state,"saibaman_scout",mob,1000,()=>0,"earth_training","namekian_wave");
  assert.equal(state.hp,790);
  assert.equal(outcome.result.healed,90);
  state.hp=effectiveStats(state).maxHp-10;
  const next={hp:1000,respawnAt:0,combatStartedAt:null,defeatCount:0};
  performSharedMobHit(state,"saibaman_scout",next,6000,()=>0,"earth_training","namekian_wave");
  assert.equal(state.hp,effectiveStats(state).maxHp);
});
