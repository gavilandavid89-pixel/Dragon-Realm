const test = require("node:test");
const assert = require("node:assert/strict");
const { WORLD_MAPS, WORLD_SPAWNS, WORLD_NPCS, WORLD_OBSTACLES } = require("./world-config");
const { isPositionWalkable, resolveMovement } = require("./world-navigation");
const { MOB_DEFINITIONS, MISSION_DEFINITIONS } = require("./game-config");
const { cloneDefaultState, performSharedMobHit } = require("./game-service");

test("world map ids are unique and connections point to configured maps", () => {
  const ids = WORLD_MAPS.map(map => map.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const map of WORLD_MAPS) {
    assert.ok(map.width > 0 && map.height > 0);
    for (const target of map.connections) assert.ok(ids.includes(target));
  }
});

test("the world contains five connected maps and keeps future zones intentionally empty", () => {
  assert.equal(WORLD_MAPS.length, 5);
  const ids = new Set(WORLD_MAPS.map(map => map.id));
  for (const map of WORLD_MAPS) {
    assert.ok(map.connections.length > 0, map.id + " should have a portal destination");
    for (const targetId of map.connections) {
      const target = WORLD_MAPS.find(entry => entry.id === targetId);
      assert.ok(target, "missing destination " + targetId);
      assert.ok(target.connections.includes(map.id), "connection should work in both directions: " + map.id + " ↔ " + targetId);
    }
    assert.ok(ids.has(map.id));
  }
  for (const mapId of ["frozen_peak", "volcanic_rift", "sacred_lookout"]) {
    assert.ok(WORLD_NPCS.some(npc => npc.mapId === mapId && npc.role === "travel"), mapId + " needs a return/travel portal");
    assert.equal(WORLD_SPAWNS.some(spawn => spawn.mapId === mapId), false, mapId + " is reserved without enemies for now");
    assert.equal(WORLD_NPCS.some(npc => npc.mapId === mapId && npc.role !== "travel"), false, mapId + " is reserved without NPC content for now");
  }
});

test("every world spawn has a unique id, valid map, mob and in-bounds coordinates", () => {
  const ids = WORLD_SPAWNS.map(spawn => spawn.spawnId);
  const maps = new Map(WORLD_MAPS.map(map => [map.id, map]));
  assert.equal(new Set(ids).size, ids.length);
  for (const spawn of WORLD_SPAWNS) {
    const map = maps.get(spawn.mapId);
    assert.ok(map, "unknown map for " + spawn.spawnId);
    assert.ok(MOB_DEFINITIONS[spawn.mobId], "unknown mob for " + spawn.spawnId);
    assert.ok(!MOB_DEFINITIONS[spawn.mobId].trainingDummy);
    assert.ok(Number.isSafeInteger(spawn.x) && spawn.x >= 0 && spawn.x <= map.width);
    assert.ok(Number.isSafeInteger(spawn.y) && spawn.y >= 0 && spawn.y <= map.height);
  }
});

test("the same mob type can have multiple independent spawn identities", () => {
  const scouts = WORLD_SPAWNS.filter(spawn => spawn.mobId === "saibaman_scout");
  assert.ok(scouts.length >= 2);
  assert.notEqual(scouts[0].spawnId, scouts[1].spawnId);
});

test("NPC ids are unique and each NPC belongs to a configured map", () => {
  const ids = WORLD_NPCS.map(npc => npc.npcId);
  const mapIds = new Set(WORLD_MAPS.map(map => map.id));
  assert.equal(new Set(ids).size, ids.length);
  const maps = new Map(WORLD_MAPS.map(map => [map.id, map]));
  for (const npc of WORLD_NPCS) {
    const map = maps.get(npc.mapId);
    assert.ok(map, "unknown map for NPC " + npc.npcId);
    assert.ok(Number.isSafeInteger(npc.x) && npc.x >= 0 && npc.x <= map.width);
    assert.ok(Number.isSafeInteger(npc.y) && npc.y >= 0 && npc.y <= map.height);
  }
});

test("hitting one spawn does not change another spawn's HP", () => {
  const first = { hp: 100, respawnAt: 0, combatStartedAt: null, defeatCount: 0 };
  const second = { hp: 100, respawnAt: 0, combatStartedAt: null, defeatCount: 0 };
  const state = cloneDefaultState();
  performSharedMobHit(state, "saibaman_scout", first, 1000, () => 0);
  assert.equal(first.hp, 90);
  assert.equal(second.hp, 100);
  assert.equal(second.defeatCount, 0);
});

test("spawn defeat increments only that spawn's defeat counter and starts its respawn", () => {
  const spawn = { hp: 1, respawnAt: 0, combatStartedAt: 1000, defeatCount: 2 };
  const state = cloneDefaultState();
  const result = performSharedMobHit(state, "saibaman_scout", spawn, 2000, () => 0);
  assert.equal(result.result.mobDefeated, true);
  assert.equal(spawn.hp, 0);
  assert.equal(spawn.defeatCount, 3);
  assert.equal(spawn.respawnAt, 7000);
});


test("world collision obstacles have unique ids and stay within their configured maps", () => {
  const ids = WORLD_OBSTACLES.map(obstacle => obstacle.obstacleId);
  const maps = new Map(WORLD_MAPS.map(map => [map.id, map]));
  assert.equal(new Set(ids).size, ids.length);
  for (const obstacle of WORLD_OBSTACLES) {
    const map = maps.get(obstacle.mapId);
    assert.ok(map, "unknown map for obstacle " + obstacle.obstacleId);
    assert.ok(obstacle.width > 0 && obstacle.height > 0);
    assert.ok(obstacle.x >= 0 && obstacle.y >= 0);
    assert.ok(obstacle.x + obstacle.width <= map.width);
    assert.ok(obstacle.y + obstacle.height <= map.height);
  }
});

test("server navigation blocks obstacle penetration but allows movement around its edge", () => {
  assert.equal(isPositionWalkable("earth_training", 600, 220), false);
  assert.equal(isPositionWalkable("earth_training", 500, 220), true);
  const blocked = resolveMovement("earth_training", { x: 500, y: 220 }, { x: 620, y: 220 });
  assert.equal(blocked.blocked, true);
  assert.ok(blocked.x < 560);
  const slide = resolveMovement("earth_training", { x: 540, y: 330 }, { x: 620, y: 390 });
  assert.ok(slide.y > 330);
  assert.ok(isPositionWalkable("earth_training", slide.x, slide.y));
});

test("movement keeps the player radius inside map bounds", () => {
  const edge = resolveMovement("earth_training", { x: 150, y: 420 }, { x: 0, y: 420 });
  assert.ok(edge.x >= 18);
  assert.ok(edge.y >= 18);
});


test("mission definitions reference valid maps, NPCs, mobs, spawns and unique progress keys", () => {
  const missionIds = Object.keys(MISSION_DEFINITIONS);
  const progressKeys = Object.values(MISSION_DEFINITIONS).map(mission => mission.progressKey);
  const maps = new Map(WORLD_MAPS.map(map => [map.id, map]));
  const npcs = new Map(WORLD_NPCS.map(npc => [npc.npcId, npc]));
  assert.equal(new Set(missionIds).size, missionIds.length);
  assert.equal(new Set(progressKeys).size, progressKeys.length);

  for (const [id, mission] of Object.entries(MISSION_DEFINITIONS)) {
    assert.equal(mission.id, id);
    assert.ok(maps.has(mission.mapId), "unknown mission map: " + id);
    assert.ok(npcs.has(mission.npcId), "unknown mission NPC: " + id);
    assert.equal(npcs.get(mission.npcId).mapId, mission.mapId, "mission NPC must be on the objective map: " + id);
    assert.ok(MOB_DEFINITIONS[mission.mobId], "unknown mission mob: " + id);
    assert.ok(WORLD_SPAWNS.some(spawn => spawn.mapId === mission.mapId && spawn.mobId === mission.mobId),
      "mission has no target spawn on its objective map: " + id);
    assert.ok(Number.isSafeInteger(mission.requiredKills) && mission.requiredKills > 0);
    assert.ok(Number.isSafeInteger(mission.minPower) && mission.minPower >= 0);
    assert.ok(mission.reward && Object.values(mission.reward).every(value => Number.isSafeInteger(value) && value >= 0));
    if (mission.prerequisiteMissionId) assert.ok(MISSION_DEFINITIONS[mission.prerequisiteMissionId], "unknown prerequisite: " + id);
  }
});

test("mission prerequisites do not contain cycles", () => {
  const visiting = new Set();
  const visited = new Set();
  function visit(id) {
    if (visited.has(id)) return;
    assert.ok(!visiting.has(id), "mission prerequisite cycle detected at " + id);
    visiting.add(id);
    const prerequisite = MISSION_DEFINITIONS[id].prerequisiteMissionId;
    if (prerequisite) visit(prerequisite);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of Object.keys(MISSION_DEFINITIONS)) visit(id);
});

test("wilderness patrol has a configured NPC and target spawn on the same map", () => {
  const npc = WORLD_NPCS.find(entry => entry.npcId === "wilderness_scout");
  const spawn = WORLD_SPAWNS.find(entry => entry.spawnId === "earth_wilderness_saibaman_scout_01");
  assert.ok(npc);
  assert.ok(spawn);
  assert.equal(npc.mapId, "earth_wilderness");
  assert.equal(spawn.mapId, "earth_wilderness");
  assert.equal(spawn.mobId, "saibaman_scout");
});
