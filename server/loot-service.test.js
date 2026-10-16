const test = require("node:test");
const assert = require("node:assert/strict");
const { rollLoot } = require("./loot-service");
const { LOOT_CONFIG } = require("./game-config");

function sequence(values) {
  let index = 0;
  return () => values[index++] ?? 0.999999;
}

test("ordinary mob uses the configured 20% gold and 0.1% gem chances", () => {
  const noDrops = rollLoot({ random: () => 0.999999 });
  assert.deepEqual(noDrops, { gold: 0, gems: 0, equipment: [] });

  const drops = rollLoot({ random: () => 0 });
  assert.equal(drops.gold, LOOT_CONFIG.gold.tier1Min);
  assert.equal(drops.gems, 1);
  assert.deepEqual(drops.equipment.map(item => item.slot), ["gloves", "pants", "armor", "boots"]);
});

test("boss gold chance is 30% and gold amount receives the 30% bonus", () => {
  const loot = rollLoot({
    isBoss: true,
    random: sequence([0, 0, 0.999999, 0.999999, 0.999999, 0.999999, 0.999999])
  });
  assert.equal(loot.gold, Math.floor(LOOT_CONFIG.gold.tier1Min * 1.3));
  assert.equal(loot.gems, 0);
  assert.deepEqual(loot.equipment, []);
});

test("equipment rates use relative kill-speed multipliers", () => {
  const values = [0.999999, 0.999999, 0.0055, 0.999999, 0.999999, 0.999999];
  const fast = rollLoot({ killSpeed: "very_fast", random: sequence(values) });
  assert.deepEqual(fast.equipment, [{ slot: "gloves", itemId: "training_gloves" }]);

  const normal = rollLoot({ killSpeed: "normal", random: sequence(values) });
  assert.deepEqual(normal.equipment, []);
});

test("boss gem chance can be rolled independently from gold", () => {
  const loot = rollLoot({
    isBoss: true,
    random: sequence([0.999999, 0.004, 0.999999, 0.999999, 0.999999, 0.999999])
  });
  assert.equal(loot.gold, 0);
  assert.equal(loot.gems, 1);
});

test("invalid kill speed, random value, and gold range are rejected", () => {
  assert.throws(() => rollLoot({ killSpeed: "instant", random: () => 0.5 }), /velocidad/);
  assert.throws(() => rollLoot({ random: () => 1 }), /entre 0 y 1/);
  assert.throws(() => rollLoot({ goldRange: { min: 30, max: 10 } }), /Rango de oro/);
});
