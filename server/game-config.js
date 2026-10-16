// Dragon Realm balance values. These are our design values, not extracted from the original game's server.
const MOB_TIERS = Object.freeze({
  1: Object.freeze({ minPowerPerHit: 1, maxPowerPerHit: 5 }),
  2: Object.freeze({ minPowerPerHit: 10, maxPowerPerHit: 25 }),
  3: Object.freeze({ minPowerPerHit: 80, maxPowerPerHit: 120 }),
  4: Object.freeze({ minPowerPerHit: 200, maxPowerPerHit: 300 })
});

const LOOT_CONFIG = Object.freeze({
  gold: Object.freeze({ normalChance: 0.20, bossChance: 0.30, tier1Min: 10, tier1Max: 30, bossAmountMultiplier: 1.30 }),
  gems: Object.freeze({ normalChance: 0.001, bossChance: 0.005, amount: 1 }),
  equipment: Object.freeze({
    gloves: Object.freeze({ itemId: "training_gloves", chance: 0.005 }),
    pants: Object.freeze({ itemId: "training_pants", chance: 0.02 }),
    armor: Object.freeze({ itemId: "training_armor", chance: 0.01 }),
    boots: Object.freeze({ itemId: "training_boots", chance: 0.03 })
  }),
  killSpeedMultipliers: Object.freeze({
    very_fast: 1.20,
    fast: 1.10,
    normal: 1.00,
    slow: 0.95,
    very_slow: 0.90
  })
});

module.exports = { MOB_TIERS, LOOT_CONFIG };
