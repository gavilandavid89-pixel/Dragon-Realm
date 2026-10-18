// Dragon Realm balance values. These are our design values, not extracted from the original game's server.
const MOB_TIERS = Object.freeze({
  1: Object.freeze({ minPowerPerHit: 1, maxPowerPerHit: 5 }),
  2: Object.freeze({ minPowerPerHit: 10, maxPowerPerHit: 25 }),
  3: Object.freeze({ minPowerPerHit: 80, maxPowerPerHit: 120 }),
  4: Object.freeze({ minPowerPerHit: 200, maxPowerPerHit: 300 })
});
const MOB_DEFINITIONS = Object.freeze({
  training_dummy: Object.freeze({ id:"training_dummy", name:"Muñeco de entrenamiento", hp:1, defense:0, tier:1, isBoss:false, respawnMs:0, goldRange:Object.freeze({min:10,max:30}), trainingDummy:true }),
  saibaman_scout: Object.freeze({ id:"saibaman_scout", name:"Saibaman explorador", hp:100, defense:0, tier:2, isBoss:false, respawnMs:5000, goldRange:Object.freeze({min:20,max:60}) }),
  saibaman_250k: Object.freeze({ id:"saibaman_250k", name:"Saibaman · 250 mil", hp:250000, defense:25, tier:3, isBoss:true, respawnMs:60000, goldRange:Object.freeze({min:100,max:250}) }),
  saibaman_500k: Object.freeze({ id:"saibaman_500k", name:"Saibaman · 500 mil", hp:500000, defense:50, tier:3, isBoss:true, respawnMs:60000, goldRange:Object.freeze({min:150,max:350}) }),
  saibaman_700k: Object.freeze({ id:"saibaman_700k", name:"Saibaman · 700 mil", hp:700000, defense:75, tier:4, isBoss:true, respawnMs:90000, goldRange:Object.freeze({min:200,max:500}) }),
  saibaman_1m: Object.freeze({ id:"saibaman_1m", name:"Saibaman · 1 millón", hp:1000000, defense:100, tier:4, isBoss:true, respawnMs:90000, goldRange:Object.freeze({min:250,max:600}) }),
  raditz: Object.freeze({ id:"raditz", name:"Raditz", hp:1000000, defense:100, tier:4, isBoss:true, respawnMs:120000, goldRange:Object.freeze({min:300,max:700}) }),
  vegeta: Object.freeze({ id:"vegeta", name:"Vegeta", hp:1200000, defense:150, tier:4, isBoss:true, respawnMs:180000, goldRange:Object.freeze({min:400,max:800}) }),
  vegeta_ozaru: Object.freeze({ id:"vegeta_ozaru", name:"Vegeta Ozaru", hp:1700000, defense:200, tier:4, isBoss:true, respawnMs:240000, goldRange:Object.freeze({min:500,max:1000}) })
});
const MISSION_DEFINITIONS = Object.freeze({
  scout_patrol: Object.freeze({
    id: "scout_patrol", title: "Patrulla de Saibamen", description: "Derrotá 3 Saibamen exploradores en la Zona de entrenamiento.",
    npcId: "master_training", mapId: "earth_training", mobId: "saibaman_scout", requiredKills: 3, minPower: 0,
    progressKey: "scoutPatrolKills",
    reward: Object.freeze({ power: 100, potential: 100, gold: 100, gems: 0 })
  }),
  wilderness_patrol: Object.freeze({
    id: "wilderness_patrol", title: "Exploración de la Llanura", description: "Derrotá 3 Saibamen exploradores en la Llanura salvaje.",
    npcId: "wilderness_scout", mapId: "earth_wilderness", mobId: "saibaman_scout", requiredKills: 3, minPower: 1000,
    prerequisiteMissionId: "scout_patrol",
    progressKey: "wildernessPatrolKills",
    reward: Object.freeze({ power: 250, potential: 250, gold: 250, gems: 0 })
  })
});
const ITEM_DEFINITIONS = Object.freeze({
  training_gloves: Object.freeze({ itemId:"training_gloves", name:"Guantes de entrenamiento", slot:"gloves", requiredPower:800, bonuses:Object.freeze({attack:2}) }),
  training_pants: Object.freeze({ itemId:"training_pants", name:"Pantalones de entrenamiento", slot:"pants", requiredPower:500, bonuses:Object.freeze({maxHp:100}) }),
  training_armor: Object.freeze({ itemId:"training_armor", name:"Armadura de entrenamiento", slot:"armor", requiredPower:1000, bonuses:Object.freeze({maxHp:150}) }),
  training_boots: Object.freeze({ itemId:"training_boots", name:"Botas de entrenamiento", slot:"boots", requiredPower:300, bonuses:Object.freeze({maxKi:50}) })
});
// Bulma's shop is a Dragon Realm design choice; prices are not claimed to match the original game.
const NPC_SHOP_CATALOG = Object.freeze([
  Object.freeze({ itemId: "training_boots", name: ITEM_DEFINITIONS.training_boots.name, price: 120 }),
  Object.freeze({ itemId: "training_pants", name: ITEM_DEFINITIONS.training_pants.name, price: 180 }),
  Object.freeze({ itemId: "training_gloves", name: ITEM_DEFINITIONS.training_gloves.name, price: 250 }),
  Object.freeze({ itemId: "training_armor", name: ITEM_DEFINITIONS.training_armor.name, price: 400 })
]);
const LOOT_CONFIG = Object.freeze({
  gold: Object.freeze({ normalChance:0.20, bossChance:0.30, tier1Min:10, tier1Max:30, bossAmountMultiplier:1.30 }),
  gems: Object.freeze({ normalChance:0.001, bossChance:0.005, amount:1 }),
  equipment: Object.freeze({
    gloves:Object.freeze({itemId:"training_gloves",chance:0.005}),
    pants:Object.freeze({itemId:"training_pants",chance:0.02}),
    armor:Object.freeze({itemId:"training_armor",chance:0.01}),
    boots:Object.freeze({itemId:"training_boots",chance:0.03})
  }),
  killSpeedMultipliers:Object.freeze({very_fast:1.20,fast:1.10,normal:1.00,slow:0.95,very_slow:0.90})
});
module.exports = { MOB_TIERS, MOB_DEFINITIONS, MISSION_DEFINITIONS, ITEM_DEFINITIONS, NPC_SHOP_CATALOG, LOOT_CONFIG };
