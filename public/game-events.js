// Shared event bus for loosely coupled character, skill, combat and world presentation modules.
(function(global){
  "use strict";
  const listeners = new Map();
  function on(name, callback){
    if(typeof name!=="string"||typeof callback!=="function")throw new TypeError("Evento o callback inválido.");
    if(!listeners.has(name))listeners.set(name,new Set());
    listeners.get(name).add(callback);
    return ()=>off(name,callback);
  }
  function off(name,callback){
    const group=listeners.get(name);if(!group)return;
    group.delete(callback);if(!group.size)listeners.delete(name);
  }
  function emit(name,detail={}){
    for(const callback of Array.from(listeners.get(name)||[])){
      try{callback(detail);}catch(error){console.error("[DragonRealm event]",name,error);}
    }
  }
  global.DragonRealmEvents=Object.freeze({on,off,emit});
})(window);
