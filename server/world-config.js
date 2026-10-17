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
  Object.freeze({ spawnId: "earth_wilderness_saibaman_scout_01", mapId: "earth_wilderness", mobId: "saibaman_scout", x: 700, y: 600 }),
  Object.freeze({ spawnId: "earth_wilderness_saibaman_250k_01", mapId: "earth_wilderness", mobId: "saibaman_250k", x: 780, y: 520 }),
  Object.freeze({ spawnId: "earth_wilderness_saibaman_500k_01", mapId: "earth_wilderness", mobId: "saibaman_500k", x: 1320, y: 520 }),
  Object.freeze({ spawnId: "earth_wilderness_raditz_01", mapId: "earth_wilderness", mobId: "raditz", x: 1880, y: 520 })
]);

// Rectangular collision geometry in logical coordinates. The client renders these shapes,
// but the server uses them as the source of truth for movement.
const WORLD_OBSTACLES = Object.freeze([
  Object.freeze({ obstacleId: "training_rock_grove", mapId: "earth_training", x: 560, y: 170, width: 120, height: 145, kind: "rocks", name: "Formación rocosa" }),
  Object.freeze({ obstacleId: "training_ruins", mapId: "earth_training", x: 1120, y: 650, width: 190, height: 95, kind: "ruins", name: "Ruinas" }),
  Object.freeze({ obstacleId: "wilderness_rock_grove", mapId: "earth_wilderness", x: 470, y: 250, width: 165, height: 145, kind: "rocks", name: "Formación rocosa" }),
  Object.freeze({ obstacleId: "wilderness_cliff", mapId: "earth_wilderness", x: 1510, y: 790, width: 250, height: 115, kind: "cliff", name: "Acantilado" })
]);

const WORLD_NPCS = Object.freeze([
  Object.freeze({ npcId: "bulma_training", mapId: "earth_training", name: "Bulma", role: "equipment", x: 260, y: 420 }),
  Object.freeze({ npcId: "master_training", mapId: "earth_training", name: "Maestro", role: "training", x: 380, y: 420 }),
  Object.freeze({ npcId: "earth_portal", mapId: "earth_training", name: "Portal", role: "travel", x: 80, y: 420 }),
  Object.freeze({ npcId: "wilderness_portal", mapId: "earth_wilderness", name: "Portal", role: "travel", x: 80, y: 600 }),
  Object.freeze({ npcId: "wilderness_scout", mapId: "earth_wilderness", name: "Explorador", role: "training", x: 240, y: 600 })
]);

module.exports = { WORLD_MAPS, WORLD_SPAWNS, WORLD_NPCS, WORLD_OBSTACLES };
