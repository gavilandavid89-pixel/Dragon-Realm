const { MOB_TIERS, MOB_DEFINITIONS, CHARACTER_RACES, MISSION_DEFINITIONS, ITEM_DEFINITIONS, NPC_SHOP_CATALOG } = require("./game-config");
const { rollLoot } = require("./loot-service");
const { WORLD_MAPS, WORLD_NPCS } = require("./world-config");
const { resolveMovement } = require("./world-navigation");
const DEFAULT_POSITION = Object.freeze({ mapId: "earth_training", x: 150, y: 420 });
const DEFAULT_STATE = Object.freeze({
  level:1,power:0,potential:0,hp:1000,maxHp:1000,ki:500,maxKi:500,attack:10,gold:0,gems:0,
  race:null,inventory:[],pendingLoot:[],equipment:{gloves:null,pants:null,armor:null,boots:null},mobStates:{},position:DEFAULT_POSITION,lastMoveAt:0,
  missions:{training_dummy:false,scout_patrol:{accepted:false,claimed:false},wilderness_patrol:{accepted:false,claimed:false}},missionProgress:{trainingDummyKills:0,scoutPatrolKills:0,wildernessPatrolKills:0},lastCombatAt:0
});
const COMBAT_CONFIG = Object.freeze({
  trainingDummy:MOB_DEFINITIONS.training_dummy,minimumPowerPerHit:1,attackCooldownMs:250,
  firstMissionKills:10,firstMissionReward:Object.freeze({power:50,potential:50}),inventoryMaxStacks:30
});
const MOVEMENT_CONFIG = Object.freeze({ speedPerSecond:320, maxStepPerRequest:120, minIntervalMs:120, portalRange:100, attackRange:115, npcRange:100 });
function normalizeUsername(value){return String(value||"").trim().toLowerCase();}
function cloneDefaultState(){return {...DEFAULT_STATE,inventory:[],pendingLoot:[],equipment:{...DEFAULT_STATE.equipment},mobStates:{},position:{...DEFAULT_POSITION},missions:{...DEFAULT_STATE.missions,scout_patrol:{...DEFAULT_STATE.missions.scout_patrol},wilderness_patrol:{...DEFAULT_STATE.missions.wilderness_patrol}},missionProgress:{...DEFAULT_STATE.missionProgress}};}
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
  const race=CHARACTER_RACES[state.race];
  if(race)for(const [stat,bonus] of Object.entries(race.bonuses))stats[stat]+=bonus;
  return stats;
}
function publicState(row){
  const state=row?.state?{...row.state}:cloneDefaultState();
  ensurePosition(state);
  if(!Object.hasOwn(CHARACTER_RACES,state.race))state.race=null;
  if(!state.missions||typeof state.missions!=="object")state.missions={};
  for(const mission of Object.values(MISSION_DEFINITIONS)){
    if(typeof state.missions[mission.id]!=="object"||state.missions[mission.id]===null)state.missions[mission.id]={accepted:false,claimed:false};
    state.missions[mission.id]={accepted:Boolean(state.missions[mission.id].accepted),claimed:Boolean(state.missions[mission.id].claimed)};
  }
  if(!state.missionProgress||typeof state.missionProgress!=="object")state.missionProgress={trainingDummyKills:state.missions.training_dummy?COMBAT_CONFIG.firstMissionKills:0};
  for(const mission of Object.values(MISSION_DEFINITIONS)){
    if(state.missionProgress[mission.progressKey]===undefined)state.missionProgress[mission.progressKey]=0;
    if(!Number.isSafeInteger(state.missionProgress[mission.progressKey])||state.missionProgress[mission.progressKey]<0)state.missionProgress[mission.progressKey]=0;
  }
  if(!Array.isArray(state.inventory))state.inventory=[];
  if(!Array.isArray(state.pendingLoot))state.pendingLoot=[];
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
function ensurePosition(state){
  const position=state.position;
  const map=WORLD_MAPS.find(entry=>entry.id===position?.mapId);
  if(!map||!Number.isSafeInteger(position.x)||!Number.isSafeInteger(position.y)||position.x<0||position.y<0||position.x>map.width||position.y>map.height){
    state.position={...DEFAULT_POSITION};
  }else state.position={mapId:map.id,x:position.x,y:position.y};
  if(!Number.isSafeInteger(state.lastMoveAt)||state.lastMoveAt<0)state.lastMoveAt=0;
}
function ensureProgress(state){
  ensurePosition(state);
  if(!state.missions||typeof state.missions!=="object")state.missions={};
  for(const mission of Object.values(MISSION_DEFINITIONS)){
    if(typeof state.missions[mission.id]!=="object"||state.missions[mission.id]===null)state.missions[mission.id]={accepted:false,claimed:false};
    state.missions[mission.id]={accepted:Boolean(state.missions[mission.id].accepted),claimed:Boolean(state.missions[mission.id].claimed)};
  }
  if(!state.missionProgress||typeof state.missionProgress!=="object")state.missionProgress={trainingDummyKills:state.missions.training_dummy?COMBAT_CONFIG.firstMissionKills:0};
  for(const mission of Object.values(MISSION_DEFINITIONS)){
    if(state.missionProgress[mission.progressKey]===undefined)state.missionProgress[mission.progressKey]=0;
  }
  if(!state.mobStates||typeof state.mobStates!=="object")state.mobStates={};
  if(state.pendingLoot===undefined)state.pendingLoot=[];
  if(!Array.isArray(state.pendingLoot)||state.pendingLoot.some(entry=>!entry||!ITEM_DEFINITIONS[entry.itemId]||!Number.isSafeInteger(entry.quantity)||entry.quantity<1)){
    fail(409,"El botín pendiente guardado no es válido.");
  }
  if(!state.equipment||typeof state.equipment!=="object")state.equipment={...DEFAULT_STATE.equipment};
  if(!Number.isSafeInteger(state.missionProgress.trainingDummyKills)||state.missionProgress.trainingDummyKills<0)fail(409,"El progreso de misión del personaje no es válido.");
  // Older characters are upgraded lazily as new mission definitions are introduced.
  for(const mission of Object.values(MISSION_DEFINITIONS)){
    const kills=state.missionProgress[mission.progressKey];
    if(!Number.isSafeInteger(kills)||kills<0)fail(409,"El progreso de misión del personaje no es válido.");
  }
  if(!Number.isSafeInteger(state.lastCombatAt)||state.lastCombatAt<0)state.lastCombatAt=0;
}
function performMovement(state,body,now=Date.now()){
  ensureProgress(state);validateProgression(state);
  if(!Number.isSafeInteger(now)||now<0)fail(500,"Reloj de movimiento no válido.");
  const position=state.position;
  const map=WORLD_MAPS.find(entry=>entry.id===position.mapId);
  if(body.mapId!==position.mapId)fail(409,"Primero viajá a esa zona usando un portal.");
  if(!Number.isSafeInteger(body.x)||!Number.isSafeInteger(body.y)||body.x<0||body.y<0||body.x>map.width||body.y>map.height){
    fail(400,"El destino de movimiento está fuera del mapa.");
  }
  const elapsed=state.lastMoveAt===0?400:now-state.lastMoveAt;
  if(state.lastMoveAt>0&&elapsed<MOVEMENT_CONFIG.minIntervalMs)fail(429,"Esperá un instante antes de moverte otra vez.");
  const dx=body.x-position.x,dy=body.y-position.y,distance=Math.hypot(dx,dy);
  const maxStep=Math.min(MOVEMENT_CONFIG.maxStepPerRequest,Math.max(1,elapsed*MOVEMENT_CONFIG.speedPerSecond/1000));
  const ratio=distance<=maxStep||distance===0?1:maxStep/distance;
  const proposed={
    x:Math.max(0,Math.min(map.width,Math.round(position.x+dx*ratio))),
    y:Math.max(0,Math.min(map.height,Math.round(position.y+dy*ratio)))
  };
  const resolved=resolveMovement(map.id,position,proposed);
  state.position={mapId:map.id,x:resolved.x,y:resolved.y};
  state.lastMoveAt=now;
  const remaining=Math.hypot(body.x-resolved.x,body.y-resolved.y);
  return {state,result:{
    message:remaining<=1?"Llegaste al destino.":resolved.blocked?"Hay un obstáculo en el camino.":"Moviéndote hacia el destino.",
    position:{...state.position},reachedTarget:remaining<=1,blocked:resolved.blocked
  }};
}
function performTravel(state,body,now=Date.now()){
  ensureProgress(state);validateProgression(state);
  if(!Number.isSafeInteger(now)||now<0)fail(500,"Reloj de movimiento no válido.");
  const currentMap=WORLD_MAPS.find(map=>map.id===state.position.mapId);
  const targetMap=WORLD_MAPS.find(map=>map.id===body.mapId);
  if(!targetMap||!currentMap.connections.includes(targetMap.id))fail(400,"Ese portal no conecta con la zona solicitada.");
  const portal=WORLD_NPCS.find(npc=>npc.mapId===currentMap.id&&npc.role==="travel");
  if(!portal)fail(409,"No hay un portal disponible en esta zona.");
  if(Math.hypot(state.position.x-portal.x,state.position.y-portal.y)>MOVEMENT_CONFIG.portalRange){
    fail(409,"Acercate al portal para viajar.");
  }
  const destinationPortal=WORLD_NPCS.find(npc=>npc.mapId===targetMap.id&&npc.role==="travel");
  if(!destinationPortal)fail(409,"La zona de destino no tiene un punto de llegada configurado.");
  state.position={mapId:targetMap.id,x:Math.min(targetMap.width,destinationPortal.x+70),y:destinationPortal.y};
  state.lastMoveAt=0;
  return {state,result:{message:"Viajaste a "+targetMap.name+".",position:{...state.position},mapId:targetMap.id}};
}
function assertSpawnMobMatchesRequest(requestedMobId, actualMobId) {
  if (requestedMobId === undefined || requestedMobId === null || requestedMobId === "") return true;
  if (typeof requestedMobId !== "string" || requestedMobId.length > 100) fail(400, "Identificador de enemigo no válido.");
  if (requestedMobId !== actualMobId) fail(409, "El enemigo solicitado no coincide con la aparición seleccionada.");
  return true;
}
function assertCanReachSpawn(state,spawn,maxDistance=MOVEMENT_CONFIG.attackRange){
  ensurePosition(state);
  if(!spawn||typeof spawn.mapId!=="string"||!Number.isFinite(Number(spawn.x))||!Number.isFinite(Number(spawn.y)))fail(500,"Datos de aparición no válidos.");
  if(state.position.mapId!==spawn.mapId)fail(409,"No estás en el mismo mapa que el enemigo.");
  if(Math.hypot(state.position.x-Number(spawn.x),state.position.y-Number(spawn.y))>maxDistance){
    fail(409,"Acercate al enemigo antes de atacar.");
  }
  return true;
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
function addPendingLoot(state,itemId){
  const existing=state.pendingLoot.find(entry=>entry.itemId===itemId);
  if(existing)existing.quantity+=1;
  else state.pendingLoot.push({itemId,quantity:1});
}
function performClaimPendingLoot(state){
  ensureProgress(state);validateProgression(state);
  if(!state.pendingLoot.length)fail(409,"No tenés botín pendiente para recoger.");
  const claimed=[];
  const remaining=[];
  for(const entry of state.pendingLoot){
    let quantity=entry.quantity;
    while(quantity>0&&addInventoryItem(state,entry.itemId)){
      const existing=claimed.find(item=>item.itemId===entry.itemId);
      if(existing)existing.quantity+=1;
      else claimed.push({itemId:entry.itemId,quantity:1});
      quantity-=1;
    }
    if(quantity>0)remaining.push({itemId:entry.itemId,quantity});
  }
  if(!claimed.length)fail(409,"El inventario está lleno. Liberá un espacio para recoger el botín pendiente.");
  state.pendingLoot=remaining;
  return {state,result:{message:remaining.length?"Recogiste parte del botín pendiente.":"Recogiste todo el botín pendiente.",claimedItems:claimed,pendingLoot:remaining}};
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
    for(const drop of loot.equipment){if(addInventoryItem(state,drop.itemId))reward.equipment.push(drop);else{inventoryFullDrops.push(drop);addPendingLoot(state,drop.itemId);}}
    reward.gold=loot.gold;reward.gems=loot.gems;
  }
  return {state,result:{
    message:mobDefeated?`¡Derrotaste a ${mob.name}!`:`Golpeaste a ${mob.name}.`,mobId:mob.id,mobName:mob.name,
    damage:appliedDamage,mobHp:ms.hp,mobMaxHp:mob.hp,mobDefeated,respawnAt:ms.respawnAt,reward,inventoryFullDrops,isBoss:mob.isBoss
  }};
}
function performSharedMobHit(state,mobId,sharedMobState,now=Date.now(),random=Math.random,mapId=null){
  ensureProgress(state);validateProgression(state);
  const mob=MOB_DEFINITIONS[mobId];
  if(!mob||mob.trainingDummy)fail(404,"No se encontró ese enemigo compartido.");
  if(!Number.isSafeInteger(now)||now<0)fail(500,"Reloj de combate no válido.");
  if(now-state.lastCombatAt<COMBAT_CONFIG.attackCooldownMs)fail(429,"Esperá un instante antes de volver a golpear.");
  if(!sharedMobState||!Number.isSafeInteger(sharedMobState.hp)||!Number.isSafeInteger(sharedMobState.respawnAt)||!Number.isSafeInteger(sharedMobState.defeatCount))fail(500,"Estado compartido del enemigo no válido.");
  if(sharedMobState.hp<=0){
    if(now<sharedMobState.respawnAt)fail(409,`${mob.name} reaparece en ${Math.max(1,Math.ceil((sharedMobState.respawnAt-now)/1000))} s.`);
    sharedMobState.hp=mob.hp;sharedMobState.respawnAt=0;sharedMobState.combatStartedAt=null;
  }
  if(sharedMobState.combatStartedAt===null||!Number.isSafeInteger(sharedMobState.combatStartedAt))sharedMobState.combatStartedAt=now;
  const stats=effectiveStats(state);
  const damage=Math.max(1,stats.attack-mob.defense),appliedDamage=Math.min(sharedMobState.hp,damage);
  sharedMobState.hp-=appliedDamage;state.lastCombatAt=now;
  const pp=randomInt(MOB_TIERS[mob.tier].minPowerPerHit,MOB_TIERS[mob.tier].maxPowerPerHit,random);
  state.power+=pp;state.potential+=pp;
  const reward={power:pp,potential:pp,gold:0,gems:0,equipment:[]};
  let inventoryFullDrops=[],mobDefeated=false;
  if(sharedMobState.hp===0){
    mobDefeated=true;
    const mission=state.missions?.scout_patrol;
    for(const definition of Object.values(MISSION_DEFINITIONS)){
      const mission=state.missions[definition.id];
      if(mission?.accepted&&!mission.claimed&&definition.mobId===mobId&&definition.mapId===mapId){
        state.missionProgress[definition.progressKey]=Math.min(definition.requiredKills,state.missionProgress[definition.progressKey]+1);
      }
    }
    const killSpeed=getKillSpeed(Math.max(0,now-sharedMobState.combatStartedAt));
    sharedMobState.respawnAt=now+mob.respawnMs;sharedMobState.combatStartedAt=null;sharedMobState.defeatCount+=1;
    const loot=rollLoot({isBoss:mob.isBoss,killSpeed,goldRange:mob.goldRange,random});
    state.gold+=loot.gold;state.gems+=loot.gems;
    for(const drop of loot.equipment){if(addInventoryItem(state,drop.itemId))reward.equipment.push(drop);else{inventoryFullDrops.push(drop);addPendingLoot(state,drop.itemId);}}
    reward.gold=loot.gold;reward.gems=loot.gems;
  }
  return {state,mobState:sharedMobState,result:{
    message:mobDefeated?`¡Derrotaste a ${mob.name}! Botín otorgado al último golpe.`:`Golpeaste a ${mob.name}.`,
    mobId:mob.id,mobName:mob.name,damage:appliedDamage,mobHp:sharedMobState.hp,mobMaxHp:mob.hp,
    mobDefeated,respawnAt:sharedMobState.respawnAt,defeatCount:sharedMobState.defeatCount,
    reward,inventoryFullDrops,isBoss:mob.isBoss,shared:true
  }};
}

function assertCanReachNpc(state,npcId,requiredRole){
  ensurePosition(state);
  if(typeof npcId!=="string"||npcId.length>100)fail(400,"Identificador de NPC no válido.");
  const npc=WORLD_NPCS.find(entry=>entry.npcId===npcId);
  if(!npc)fail(404,"No se encontró ese NPC.");
  if(requiredRole&&npc.role!==requiredRole)fail(409,"Ese NPC no puede realizar esa acción.");
  if(npc.role==="travel")fail(409,"Usá el portal para viajar entre zonas.");
  if(state.position.mapId!==npc.mapId)fail(409,"No estás en la misma zona que ese NPC.");
  if(Math.hypot(state.position.x-npc.x,state.position.y-npc.y)>MOVEMENT_CONFIG.npcRange){
    fail(409,"Acercate al NPC para interactuar.");
  }
  return npc;
}
function performNpcInteract(state,body){
  ensureProgress(state);validateProgression(state);
  const npc=assertCanReachNpc(state,body.npcId);
  if(npc.role==="equipment"){
    return {state,result:{
      message:"Abriste la tienda de "+npc.name+".",
      npc:{npcId:npc.npcId,name:npc.name,role:npc.role},
      dialogue:"¡Ey! Soy Bulma. Tengo equipo para ayudarte a entrenar. Elegí una pieza y pagá con oro.",
      shop:NPC_SHOP_CATALOG.map(entry=>({
        ...entry,slot:ITEM_DEFINITIONS[entry.itemId].slot,
        requiredPower:ITEM_DEFINITIONS[entry.itemId].requiredPower,
        bonuses:ITEM_DEFINITIONS[entry.itemId].bonuses
      }))
    }};
  }
  if(npc.role==="training"){
    const missionActions=Object.values(MISSION_DEFINITIONS)
      .filter(definition=>definition.npcId===npc.npcId)
      .map(definition=>{
        const mission=state.missions[definition.id];
        const kills=Math.min(definition.requiredKills,state.missionProgress[definition.progressKey]);
        const prerequisite=definition.prerequisiteMissionId?state.missions[definition.prerequisiteMissionId]:null;
        const locked=Boolean(definition.prerequisiteMissionId&&(!prerequisite||!prerequisite.claimed));
        const powerLocked=state.power<definition.minPower;
        const action=mission.claimed||locked||(powerLocked&&!mission.accepted)?"mission_status":!mission.accepted?"mission_accept":kills>=definition.requiredKills?"mission_claim":"mission_status";
        const label=mission.claimed?definition.title+" · completada":locked
          ?"Bloqueada: completar "+(MISSION_DEFINITIONS[definition.prerequisiteMissionId]?.title||"misión previa")
          :powerLocked&&!mission.accepted?"Bloqueada: requiere "+definition.minPower.toLocaleString("es-AR")+" de Poder"
          :!mission.accepted?"Aceptar: "+definition.title
          :kills>=definition.requiredKills?"Reclamar: "+definition.title
          :definition.title+" · "+kills+"/"+definition.requiredKills;
        return {id:action,missionId:definition.id,label};
      });
    return {state,result:{
      message:"Hablaste con "+npc.name+".",
      npc:{npcId:npc.npcId,name:npc.name,role:npc.role},
      dialogue:npc.npcId==="master_training"
        ?"La fuerza se construye con práctica. Podés entrenar, mejorar tus estadísticas o aceptar una patrulla."
        :"La Llanura salvaje es peligrosa. Necesitás al menos 1.000 de Poder para aceptar esta misión.",
      actions:[
        ...(npc.npcId==="master_training"?[
          {id:"train",label:"Entrenar con muñeco"},
          {id:"maxHp",label:"+40 Vida · 5 Potencial"},
          {id:"maxKi",label:"+40 Ki · 5 Potencial"},
          {id:"attack",label:"+1 Ataque · 10 Potencial"}
        ]:[]),
        ...missionActions
      ]
    }};
  }
  fail(409,"Este NPC todavía no tiene interacciones configuradas.");
}
function performMissionAction(state,body){
  ensureProgress(state);validateProgression(state);
  const definition=MISSION_DEFINITIONS[body.missionId||"scout_patrol"];
  if(!definition)fail(404,"No existe esa misión.");
  assertCanReachNpc(state,body.npcId, "training");
  if(body.npcId!==definition.npcId)fail(409,"Este NPC no gestiona esa misión.");
  const mission=state.missions[definition.id];
  const kills=Math.min(definition.requiredKills,state.missionProgress[definition.progressKey]);
  if(body.action==="mission_accept"){
    if(mission.accepted||mission.claimed)fail(409,"La misión ya fue aceptada.");
    if(definition.prerequisiteMissionId&&!state.missions[definition.prerequisiteMissionId]?.claimed){
      const prerequisite=MISSION_DEFINITIONS[definition.prerequisiteMissionId];
      fail(409,"Completá primero la misión "+(prerequisite?.title||definition.prerequisiteMissionId)+".");
    }
    if(state.power<definition.minPower)fail(409,"Necesitás "+definition.minPower.toLocaleString("es-AR")+" de Poder para aceptar esta misión.");
    mission.accepted=true;
    return {state,result:{message:"Misión aceptada: "+definition.description,mission:{id:definition.id,accepted:true,kills,required:definition.requiredKills}}};
  }
  if(body.action==="mission_status"){
    const prerequisite=definition.prerequisiteMissionId?MISSION_DEFINITIONS[definition.prerequisiteMissionId]:null;
    const prerequisiteClaimed=!definition.prerequisiteMissionId||Boolean(state.missions[definition.prerequisiteMissionId]?.claimed);
    const status=!prerequisiteClaimed?"bloqueada; completá primero "+(prerequisite?.title||definition.prerequisiteMissionId)
      :mission.claimed?"completada y recompensa reclamada"
      :!mission.accepted&&state.power<definition.minPower?"bloqueada; requiere "+definition.minPower.toLocaleString("es-AR")+" de Poder"
      :!mission.accepted?"todavía no aceptada":kills+"/"+definition.requiredKills+" objetivos derrotados";
    return {state,result:{message:definition.title+": "+status+".",mission:{id:definition.id,accepted:mission.accepted,claimed:mission.claimed,kills,required:definition.requiredKills,unlocked:prerequisiteClaimed&&state.power>=definition.minPower}}};
  }
  if(body.action==="mission_claim"){
    if(!mission.accepted)fail(409,"Primero aceptá la misión con el NPC correspondiente.");
    if(mission.claimed)fail(409,"La recompensa de esta misión ya fue reclamada.");
    if(kills<definition.requiredKills)fail(409,"Todavía faltan objetivos: necesitás derrotar "+definition.requiredKills+".");
    mission.claimed=true;
    const reward=definition.reward;
    state.power+=reward.power;state.potential+=reward.potential;state.gold+=reward.gold;state.gems+=reward.gems;
    return {state,result:{message:"¡"+definition.title+" completada! Recompensa reclamada.",mission:{id:definition.id,claimed:true,kills:definition.requiredKills,required:definition.requiredKills},reward:{...reward,equipment:[]}}};
  }
  fail(400,"Acción de misión no válida.");
}
function performNpcTraining(state,body,now){
  assertCanReachNpc(state,body.npcId,"training");
  return performTrainingDummyHit(state,now);
}
function performPurchase(state,body){
  ensureProgress(state);validateProgression(state);
  assertCanReachNpc(state,body.npcId,"equipment");
  const offer=NPC_SHOP_CATALOG.find(entry=>entry.itemId===body.itemId);
  if(!offer)fail(404,"Bulma no vende ese objeto.");
  if(state.gold<offer.price)fail(409,"No tenés suficiente oro. Necesitás "+offer.price+".");
  if(!addInventoryItem(state,offer.itemId))fail(409,"El inventario está lleno.");
  state.gold-=offer.price;
  return {state,result:{
    message:"Compraste "+offer.name+".",
    purchase:{itemId:offer.itemId,name:offer.name,price:offer.price}
  }};
}

function performAction(state,body,options={}){
  if(!body||typeof body.action!=="string")fail(400,"Acción inválida.");
  if(body.action==="select_race"){
    ensureProgress(state);validateProgression(state);
    if(typeof body.race!=="string"||!Object.hasOwn(CHARACTER_RACES,body.race))fail(400,"Elegí una raza disponible.");
    if(state.race){
      if(state.race===body.race)return {state,result:{message:"Ya elegiste la raza "+CHARACTER_RACES[state.race].name+".",race:CHARACTER_RACES[state.race]}};
      fail(409,"La raza inicial ya fue elegida y no se puede cambiar en esta versión.");
    }
    state.race=body.race;
    const race=CHARACTER_RACES[state.race];
    return {state,result:{message:"¡Tu aventura comienza como "+race.name+"!",race}};
  }
  if(body.action==="move_player")return performMovement(state,body,options.now??Date.now());
  if(body.action==="travel_map")return performTravel(state,body,options.now??Date.now());
  if(body.action==="npc_interact")return performNpcInteract(state,body);
  if(body.action==="npc_train")return performNpcTraining(state,body,options.now??Date.now());
  if(body.action==="mission_accept"||body.action==="mission_claim"||body.action==="mission_status")return performMissionAction(state,body);
  if(body.action==="buy_item")return performPurchase(state,body);
  if(body.action==="claim_pending_loot")return performClaimPendingLoot(state);
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
    validateProgression(state);
    if(body.npcId)assertCanReachNpc(state,body.npcId,"training");
    const stat=body.stat;
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
module.exports={DEFAULT_STATE,COMBAT_CONFIG,MOVEMENT_CONFIG,normalizeUsername,cloneDefaultState,publicState,loadState,saveState,effectiveStats,performAction,performSharedMobHit,assertCanReachSpawn,assertCanReachNpc,assertSpawnMobMatchesRequest};
