// Character selection and stat projection. This module subscribes to the shared game event bus.
(function(global){
  "use strict";
  const events=global.DragonRealmEvents;
  const labels={namekian:"Namekiano",saiyan:"Saiyan",earthling:"Terrícola"};
  function render(state){
    if(!state)return;
    const raceStatus=document.getElementById("raceStatus");
    if(raceStatus)raceStatus.textContent=state.race
      ?"Raza elegida: "+(labels[state.race]||state.race)+". Esta decisión es permanente en esta versión."
      :"Elegí una de las tres razas para definir las estadísticas iniciales.";
    document.querySelectorAll("[data-race-card]").forEach(card=>{
      const race=card.getAttribute("data-race-card"),chosen=state.race===race,button=card.querySelector("[data-select-race]");
      card.classList.toggle("selected",chosen);
      if(button){
        button.textContent=chosen?"Raza elegida ✓":state.race?"No disponible":"Elegir "+(labels[race]||race);
        button.disabled=Boolean(state.race);button.setAttribute("aria-pressed",String(chosen));
      }
    });
    const stats=state.effectiveStats||state;
    const set=(id,value)=>{const el=document.getElementById(id);if(el)el.textContent=String(value);};
    set("power",state.power??0);set("potential",state.potential??0);
    set("hp",(state.hp??stats.maxHp??0)+" / "+(stats.maxHp??0));
    set("ki",(state.ki??stats.maxKi??0)+" / "+(stats.maxKi??0));
    set("attack",stats.attack??state.attack??0);set("defense",stats.defense??state.defense??0);
    set("criticalChance",(stats.criticalChance??state.criticalChance??0)+"%");
    set("gold",state.gold??0);set("gems",state.gems??0);
    const welcome=document.getElementById("welcome");
    if(welcome)welcome.textContent="⚔️ "+(global.DragonRealmCurrentUsername||"Guerrero")+(labels[state.race]?" · "+labels[state.race]:"");
  }
  events?.on("state:updated",({state})=>render(state));
  events?.on("character:race-selected",({state})=>render(state));
  global.DragonRealmCharacterUI=Object.freeze({render,labels});
})(window);
