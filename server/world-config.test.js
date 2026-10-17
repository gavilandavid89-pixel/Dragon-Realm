const test = require("node:test");
const assert = require("node:assert/strict");
const { WORLD_MAPS, WORLD_SPAWNS, WORLD_NPCS, WORLD_OBSTACLES } = require("./world-config");
const { isPositionWalkable, resolveMovement } = require("./world-navigation");
const { MOB_DEFINITIONS } = require("./game-config");
const { cloneDefaultState, performSharedMobHit } = require("./game-service");

test("world map ids are unique and connections point to configured maps", () => {
  const ids = WORLD_MAPS.map(map => map.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const map of WORLD_MAPS) {
    assert.ok(map.width > 0 && map.height > 0);
    for (const target of map.connections) assert.ok(ids.includes(target));
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
