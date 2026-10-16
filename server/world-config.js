// World layout for Dragon Realm. Coordinates are logical world units, not pixels.
// Spawn state is persisted per spawnId; all players see the same instance of that spawn.
const WORLD_MAPS = Object.freeze([
  Object.freeze({
    id: "earth_training",
    name: "Zona de entrenamiento",
    description: "Un lugar seguro para aprender los fundamentos del combate.",
    width: 1600,
    height: 900,
    levelRange: Object.freeze({ min: 1, max: 1000 }),
    connections: Object.freeze(["earth_wilderness"])
  }),
  Object.freeze({
    id: "earth_wilderness",
    name: "Llanura salvaje",
    description: "Una llanura abierta donde aparecen enemigos más peligrosos.",
    width: 2400,
    height: 1200,
    levelRange: Object.freeze({ min: 50, max: 1000000 }),
    connections: Object.freeze(["earth_training"])
  })
]);

const WORLD_SPAWNS = Object.freeze([
  Object.freeze({ spawnId: "earth_training_saibaman_01", mapId: "earth_training", mobId: "saibaman_scout", x: 720, y: 420 }),
  Object.freeze({ spawnId: "earth_training_saibaman_02", mapId: "earth_training", mobId: "saibaman_scout", x: 920, y: 420 }),
  Object.freeze({ spawnId: "earth_wilderness_saibaman_250k_01", mapId: "earth_wilderness", mobId: "saibaman_250k", x: 780, y: 520 }),
  Object.freeze({ spawnId: "earth_wilderness_saibaman_500k_01", mapId: "earth_wilderness", mobId: "saibaman_500k", x: 1320, y: 520 }),
  Object.freeze({ spawnId: "earth_wilderness_raditz_01", mapId: "earth_wilderness", mobId: "raditz", x: 1880, y: 520 })
]);

const WORLD_NPCS = Object.freeze([
  Object.freeze({ npcId: "bulma_training", mapId: "earth_training", name: "Bulma", role: "equipment", x: 260, y: 420 }),
  Object.freeze({ npcId: "master_training", mapId: "earth_training", name: "Maestro", role: "training", x: 380, y: 420 }),
  Object.freeze({ npcId: "earth_portal", mapId: "earth_training", name: "Portal", role: "travel", x: 80, y: 420 })
]);

module.exports = { WORLD_MAPS, WORLD_SPAWNS, WORLD_NPCS };
