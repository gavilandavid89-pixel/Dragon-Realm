const { LOOT_CONFIG } = require("./game-config");

function readRandom(random) {
  const value = random();
  if (typeof value !== "number" || value < 0 || value >= 1 || !Number.isFinite(value)) {
    throw new TypeError("La función aleatoria debe devolver un número entre 0 y 1.");
  }
  return value;
}

function chance(chanceValue, random) {
  return readRandom(random) < chanceValue;
}

function rollLoot(options = {}) {
  const isBoss = Boolean(options.isBoss);
  const killSpeed = options.killSpeed || "normal";
  const random = options.random || Math.random;
  if (typeof random !== "function") throw new TypeError("random debe ser una función.");

  const multiplier = LOOT_CONFIG.killSpeedMultipliers[killSpeed];
  if (typeof multiplier !== "number") throw new TypeError("Categoría de velocidad de eliminación desconocida.");

  const goldRange = options.goldRange || {
    min: LOOT_CONFIG.gold.tier1Min,
    max: LOOT_CONFIG.gold.tier1Max
  };
  if (
    !Number.isSafeInteger(goldRange.min) ||
    !Number.isSafeInteger(goldRange.max) ||
    goldRange.min < 0 ||
    goldRange.max < goldRange.min
  ) {
    throw new TypeError("Rango de oro no válido.");
  }

  const result = { gold: 0, gems: 0, equipment: [] };
  const goldChance = isBoss ? LOOT_CONFIG.gold.bossChance : LOOT_CONFIG.gold.normalChance;
  if (chance(goldChance, random)) {
    const baseAmount = goldRange.min + Math.floor(readRandom(random) * (goldRange.max - goldRange.min + 1));
    result.gold = isBoss ? Math.floor(baseAmount * LOOT_CONFIG.gold.bossAmountMultiplier) : baseAmount;
  }

  const gemChance = isBoss ? LOOT_CONFIG.gems.bossChance : LOOT_CONFIG.gems.normalChance;
  if (chance(gemChance, random)) result.gems = LOOT_CONFIG.gems.amount;

  for (const [slot, entry] of Object.entries(LOOT_CONFIG.equipment)) {
    const adjustedChance = Math.min(1, entry.chance * multiplier);
    if (chance(adjustedChance, random)) result.equipment.push({ slot, itemId: entry.itemId });
  }

  return result;
}

module.exports = { rollLoot };
