// Shared character definitions: consumed by both the authoritative server and browser UI.
(function(root,factory){
  const data=factory();
  if(typeof module==="object"&&module.exports)module.exports=data;
  if(root)root.DragonRealmCharacterData=data;
})(typeof globalThis!=="undefined"?globalThis:null,function(){
  "use strict";
  return Object.freeze({
    namekian:Object.freeze({
      id:"namekian",name:"Namekiano",title:"Namekiano",
      description:"50 Vida · 50 Ki · 1 Ataque · 0 Defensa · 0% crítico. Puño: 20% de daño.",
      baseStats:Object.freeze({hp:50,maxHp:50,ki:50,maxKi:50,attack:1,defense:0,criticalChance:0}),
      punchMultiplier:0.20,skillIds:Object.freeze(["masenko"])
    }),
    saiyan:Object.freeze({
      id:"saiyan",name:"Saiyan",title:"Saiyan",
      description:"40 Vida · 40 Ki · 5 Ataque · 1 Defensa · 0% crítico. Puño: 40% de daño.",
      baseStats:Object.freeze({hp:40,maxHp:40,ki:40,maxKi:40,attack:5,defense:1,criticalChance:0}),
      punchMultiplier:0.40,skillIds:Object.freeze(["big_bang_attack"])
    }),
    earthling:Object.freeze({
      id:"earthling",name:"Terrícola",title:"Terrícola",
      description:"30 Vida · 30 Ki · 2 Ataque · 1 Defensa · 0% crítico. Puño: 30% de daño.",
      baseStats:Object.freeze({hp:30,maxHp:30,ki:30,maxKi:30,attack:2,defense:1,criticalChance:0}),
      punchMultiplier:0.30,skillIds:Object.freeze(["kame_hame_ha"])
    })
  });
});
