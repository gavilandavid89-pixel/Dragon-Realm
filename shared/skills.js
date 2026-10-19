// Shared skill catalogue: visual metadata is shared, but the server alone resolves combat.
(function(root,factory){
  const data=factory();
  if(typeof module==="object"&&module.exports)module.exports=data;
  if(root)root.DragonRealmSkillData=data;
})(typeof globalThis!=="undefined"?globalThis:null,function(){
  "use strict";
  return Object.freeze({
    masenko:Object.freeze({
      id:"masenko",raceId:"namekian",name:"Masenko",
      description:"Miniesfera naranja · 50% de daño · 10 Ki · recarga 2 s.",
      kiCost:10,cooldownMs:2000,damageMultiplier:0.50,color:"#ff8a24",projectile:"small_orb"
    }),
    big_bang_attack:Object.freeze({
      id:"big_bang_attack",raceId:"saiyan",name:"Big Bang Attack",
      description:"Miniesfera amarillo-anaranjada · 70% de daño · 15 Ki · recarga 4 s.",
      kiCost:15,cooldownMs:4000,damageMultiplier:0.70,color:"#ffad32",projectile:"small_orb"
    }),
    kame_hame_ha:Object.freeze({
      id:"kame_hame_ha",raceId:"earthling",name:"Kame Hame Ha",
      description:"Miniesfera azul · 100% de daño · 25 Ki · recarga 10 s.",
      kiCost:25,cooldownMs:10000,damageMultiplier:1.00,color:"#3d9bff",projectile:"small_orb"
    })
  });
});
