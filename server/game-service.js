const { MOB_TIERS, MOB_DEFINITIONS, ITEM_DEFINITIONS } = require("./game-config");
const { rollLoot } = require("./loot-service");
const DEFAULT_STATE = Object.freeze({
  level:1,power:0,potential:0,hp:1000,maxHp:1000,ki:500,maxKi:500,attack:10,gold:0,gems:0,
  inventory:[],equipment:{gloves:null,pants:null,armor:null,boots:null},mobStates:{},
  missions:{training_dummy:false},missionProgress:{trainingDummyKills:0},lastCombatAt:0
});
const COMBAT_CONFIG = Object.freeze({
  trainingDummy:MOB_DEFINITIONS.training_dummy,minimumPowerPerHit:1,attackCooldownMs:250,
  firstMissionKills:10,firstMissionReward:Object.freeze({power:50,potential:50}),inventoryMaxStacks:30
});
function normalizeUsername(value){return String(value||"").trim().toLowerCase();}
function cloneDefaultState(){return {...DEFAULT_STATE,inventory:[],equipment:{...DEFAULT_STATE.equipment},mobStates:{},missions:{...DEFAULT_STATE.missions},missionProgress:{...DEFAULT_STATE.missionProgress}};}
function fail(status,message){const error=new Error(message);error.status=status;throw error;}
function effectiveStats(state){
  const stats={attack:state.attack,maxHp:state.maxHp,maxKi:state.maxKi};
  const equipment=state.equipment&&typeof state.equipment==="object"?state.equipment:{};
  for(const [slot,itemId] of Object.entries(equipment)){
    if(!itemId)continue;
    const item=ITEM_DEFINITIONS[itemId];
    if(!item||item.slot!==slot)continue;
    for(const [stat,bonus] of Object.entries(item.bonuses))stats[stat]+=bonus;
  }
  return stats;
}
function publicState(row){
  const state=row?.state?{...row.state}:cloneDefaultState();
  if(!state.missions||typeof state.missions!=="object")state.missions={};
  if(!state.missionProgress||typeof state.missionProgress!=="object")state.missionProgress={trainingDummyKills:state.missions.training_dummy?COMBAT_CONFIG.firstMissionKills:0};
  if(!Array.isArray(state.inventory))state.inventory=[];
  state.equipment=state.equipment&&typeof state.equipment==="object"?{...DEFAULT_STATE.equipment,...state.equipment}:{...DEFAULT_STATE.equipment};
  if(!state.mobStates||typeof state.mobStates!=="object")state.mobStates={};
  if(!Number.isSafeInteger(state.lastCombatAt))state.lastCombatAt=0;
  state.effectiveStats=effectiveStats(state);
  return state;
}
async function loadState(db,accountId){
  const result=await db.query("SELECT state FROM characters WHERE account_id = $1",[accountId]);
  if(!result.rowCount){
    const inserted=await db.query("INSERT INTO characters (account_id,state) VALUES ($1,$2::jsonb) RETURNING state",[accountId,JSON.stringify(cloneDefaultState())]);
    return publicState(inserted.rows[0]);
  }
  return publicState(result.rows[0]);
}
async function saveState(db,accountId,state){
  const persisted={...state};delete persisted.effectiveStats;
  await db.query(`INSERT INTO characters (account_id,state,updated_at) VALUES ($1,$2::jsonb,NOW())
    ON CONFLICT (account_id) DO UPDATE SET state=EXCLUDED.state,updated_at=NOW()`,[accountId,JSON.stringify(persisted)]);
}
function validateProgression(state){
  for(const key of ["power","potential","gold","gems","attack","hp","maxHp","ki","maxKi"]){
    if(!Number.isSafeInteger(state[key])||state[key]<0)fail(409,"Las estadísticas guardadas del personaje no son válidas.");
  }
  if(state.potential>state.power)fail(409,"El Potencial no puede superar el Poder total.");
  if(!Array.isArray(state.inventory)||state.inventory.length>COMBAT_CONFIG.inventoryMaxStacks)fail(409,"El inventario guardado no es válido.");
}
function ensureProgress(state){
  if(!state.missions||typeof state.missions!=="object")state.missions={};
  if(!state.missionProgress||typeof state.missionProgress!=="object")state.missionProgress={trainingDummyKills:state.missions.training_dummy?COMBAT_CONFIG.firstMissionKills:0};
  if(!state.mobStates||typeof state.mobStates!=="object")state.mobStates={};
  if(!state.equipment||typeof state.equipment!=="object")state.equipment={...DEFAULT_STATE.equipment};
  if(!Number.isSafeInteger(state.missionProgress.trainingDummyKills)||state.missionProgress.trainingDummyKills<0)fail(409,"El progreso de misión del personaje no es válido.");
  if(!Number.isSafeInteger(state.lastCombatAt)||state.lastCombatAt<0)state.lastCombatAt=0;
}
function randomInt(min,max,random){
  const value=random();
  if(!Number.isFinite(value)||value<0||value>=1)fail(500,"Generador aleatorio no válido.");
  return min+Math.floor(value*(max-min+1));
}
function getKillSpeed(durationMs){
  if(durationMs<3000)return "very_fast";if(durationMs<10000)return "fast";if(durationMs<30000)return "normal";if(durationMs<60000)return "slow";return "very_slow";
}
function addInventoryItem(state,itemId){
  const existing=state.inventory.find(entry=>entry.itemId===itemId);
  if(existing){existing.quantity+=1;return true;}
  if(state.inventory.length>=COMBAT_CONFIG.inventoryMaxStacks)return false;
  state.inventory.push({itemId,quantity:1});return true;
}
function performTrainingDummyHit(state,now=Date.now()){
  ensureProgress(state);validateProgression(state);
  if(!Number.isSafeInteger(now)||now<0)fail(500,"Reloj de combate no válido.");
  if(now-state.lastCombatAt<COMBAT_CONFIG.attackCooldownMs)fail(429,"Esperá un instante antes de volver a golpear.");
  state.lastCombatAt=now;state.power+=1;state.potential+=1;state.missionProgress.trainingDummyKills+=1;
  const reward={power:1,potential:1,gold:0,gems:0,equipment:[]};let missionCompleted=false;
  if(state.missionProgress.trainingDummyKills>=COMBAT_CONFIG.firstMissionKills&&!state.missions.training_dummy){
    state.missions.training_dummy=true;state.power+=50;state.potential+=50;reward.power+=50;reward.potential+=50;missionCompleted=true;
  }
  return {state,result:{
    message:missionCompleted?"¡Misión completada! Derrotaste 10 muñecos de entrenamiento.":"Golpe acertado: muñeco de entrenamiento derrotado.",
    mobId:"training_dummy",mobName:MOB_DEFINITIONS.training_dummy.name,damage:1,mobHp:0,mobMaxHp:1,mobDefeated:true,missionCompleted,
    missionProgress:{kills:Math.min(state.missionProgress.trainingDummyKills,10),required:10},reward
  }};
}
function performMobHit(state,mob,now,random){
  ensureProgress(state);validateProgression(state);
  if(!Number.isSafeInteger(now)||now<0)fail(500,"Reloj de combate no válido.");
  if(now-state.lastCombatAt<COMBAT_CONFIG.attackCooldownMs)fail(429,"Esperá un instante antes de volver a golpear.");
  const stats=effectiveStats(state);
  let ms=state.mobStates[mob.id];
  if(!ms||typeof ms!=="object"){ms={hp:mob.hp,respawnAt:0,combatStartedAt:null};state.mobStates[mob.id]=ms;}
  if(ms.hp<=0){
    if(now<ms.respawnAt)fail(409,`${mob.name} reaparece en ${Math.max(1,Math.ceil((ms.respawnAt-now)/1000))} s.`);
    ms.hp=mob.hp;ms.respawnAt=0;ms.combatStartedAt=null;
  }
  if(ms.combatStartedAt===null||!Number.isSafeInteger(ms.combatStartedAt))ms.combatStartedAt=now;
  const damage=Math.max(1,stats.attack-mob.defense),appliedDamage=Math.min(ms.hp,damage);
  ms.hp-=appliedDamage;state.lastCombatAt=now;
  const pp=randomInt(MOB_TIERS[mob.tier].minPowerPerHit,MOB_TIERS[mob.tier].maxPowerPerHit,random);
  state.power+=pp;state.potential+=pp;
  const reward={power:pp,potential:pp,gold:0,gems:0,equipment:[]};
  let inventoryFullDrops=[],mobDefeated=false;
  if(ms.hp===0){
    mobDefeated=true;const killSpeed=getKillSpeed(Math.max(0,now-ms.combatStartedAt));
    ms.respawnAt=now+mob.respawnMs;ms.combatStartedAt=null;
    const loot=rollLoot({isBoss:mob.isBoss,killSpeed,goldRange:mob.goldRange,random});
    state.gold+=loot.gold;state.gems+=loot.gems;
    for(const drop of loot.equipment){if(addInventoryItem(state,drop.itemId))reward.equipment.push(drop);else inventoryFullDrops.push(drop);}
    reward.gold=loot.gold;reward.gems=loot.gems;
  }
  return {state,result:{
    message:mobDefeated?`¡Derrotaste a ${mob.name}!`:`Golpeaste a ${mob.name}.`,mobId:mob.id,mobName:mob.name,
    damage:appliedDamage,mobHp:ms.hp,mobMaxHp:mob.hp,mobDefeated,respawnAt:ms.respawnAt,reward,inventoryFullDrops,isBoss:mob.isBoss
  }};
}
function performAction(state,body,options={}){
  if(!body||typeof body.action!=="string")fail(400,"Acción inválida.");
  if(body.action==="training_dummy"||body.action==="attack_mob"){
    const mobId=body.mobId||"training_dummy",mob=MOB_DEFINITIONS[mobId];
    if(!mob)fail(404,"No se encontró ese enemigo.");
    if(mob.trainingDummy)return performTrainingDummyHit(state,options.now??Date.now());
    return performMobHit(state,mob,options.now??Date.now(),options.random||Math.random);
  }
  if(body.action==="equip_item"){
    ensureProgress(state);validateProgression(state);
    const item=ITEM_DEFINITIONS[body.itemId];if(!item)fail(404,"No existe ese objeto.");
    const owned=state.inventory.find(entry=>entry.itemId===item.itemId&&entry.quantity>0);
    if(!owned)fail(409,"No tenés ese objeto en el inventario.");
    if(state.power<item.requiredPower)fail(409,`Necesitás ${item.requiredPower} de Poder para equiparlo.`);
    const previous=state.equipment[item.slot];state.equipment[item.slot]=item.itemId;owned.quantity-=1;
    if(owned.quantity===0)state.inventory=state.inventory.filter(entry=>entry!==owned);
    if(previous&&!addInventoryItem(state,previous))fail(409,"El inventario está lleno.");
    const stats=effectiveStats(state);state.hp=Math.min(state.hp,stats.maxHp);state.ki=Math.min(state.ki,stats.maxKi);
    return {state,result:{message:`Equipaste ${item.name}.`,itemId:item.itemId,slot:item.slot,effectiveStats:stats}};
  }
  if(body.action==="unequip_item"){
    ensureProgress(state);validateProgression(state);
    const slot=body.slot;if(!Object.hasOwn(DEFAULT_STATE.equipment,slot))fail(400,"Ranura de equipo no válida.");
    const itemId=state.equipment[slot];if(!itemId)fail(409,"No hay ningún objeto equipado en esa ranura.");
    if(!addInventoryItem(state,itemId))fail(409,"El inventario está lleno.");
    state.equipment[slot]=null;const stats=effectiveStats(state);
    state.hp=Math.min(state.hp,stats.maxHp);state.ki=Math.min(state.ki,stats.maxKi);
    return {state,result:{message:"Objeto desequipado.",itemId,slot,effectiveStats:stats}};
  }
  if(body.action==="spend_potential"){
    validateProgression(state);const stat=body.stat;
    if(!new Set(["maxHp","maxKi","attack"]).has(stat))fail(400,"Estadística no válida.");
    const cost=stat==="attack"?10:5;if(state.potential<cost)fail(409,"Potencial insuficiente.");
    state.potential-=cost;
    if(stat==="maxHp"){state.maxHp+=40;state.hp=Math.min(effectiveStats(state).maxHp,state.hp+40);}
    else if(stat==="maxKi"){state.maxKi+=40;state.ki=Math.min(effectiveStats(state).maxKi,state.ki+40);}
    else state.attack+=1;
    return {state,result:{message:"Estadística mejorada.",cost,stat,effectiveStats:effectiveStats(state)}};
  }
  fail(501,"Acción todavía no implementada en el servidor.");
}
module.exports={DEFAULT_STATE,COMBAT_CONFIG,normalizeUsername,cloneDefaultState,publicState,loadState,saveState,effectiveStats,performAction};
