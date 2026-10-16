const test = require("node:test");
const assert = require("node:assert/strict");
const { WORLD_MAPS, WORLD_SPAWNS, WORLD_NPCS } = require("./world-config");
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
  for (const npc of WORLD_NPCS) assert.ok(mapIds.has(npc.mapId));
});

test("hitting one spawn does not change another spawn's HP", () => {
  const first = { hp: 100, respawnAt: 0, combatStartedAt: null, defeatCount: 0 };
  const second = { hp: 100, respawnAt: 0, combatStartedAt: null, defeatCount: 0 };
  const state = cloneDefaultState();
  performSharedMobHit(state, "saibaman_scout", first, 1000, () => 0);
  assert.equal(first.hp, 99);
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
