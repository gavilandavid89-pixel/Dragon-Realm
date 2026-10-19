// Skill catalogue and combat feedback. All gameplay outcomes arrive from the server through global events.
(function(global){
  "use strict";
  const events=global.DragonRealmEvents;
  const definitions={
    namekian:{id:"masenko",name:"Masenko",description:"Miniesfera naranja · 50% de daño · 10 Ki · recarga 2 s",kiCost:10,cooldownMs:2000,color:"#ff8a24"},
    saiyan:{id:"big_bang_attack",name:"Big Bang Attack",description:"Miniesfera amarillo-anaranjada · 70% de daño · 15 Ki · recarga 4 s",kiCost:15,cooldownMs:4000,color:"#ffad32"},
    earthling:{id:"kame_hame_ha",name:"Kame Hame Ha",description:"Miniesfera azul · 100% de daño · 25 Ki · recarga 10 s",kiCost:25,cooldownMs:10000,color:"#3d9bff"}
  };
  const cooldownUntil=new Map();
  const svgNS="http://www.w3.org/2000/svg";
  function node(name,attrs={},text=""){
    const el=document.createElementNS(svgNS,name);
    Object.entries(attrs).forEach(([key,value])=>el.setAttribute(key,String(value)));
    if(text)el.textContent=text;return el;
  }
  function render(state){
    const root=document.getElementById("raceSkills");if(!root)return;
    root.replaceChildren();
    const skill=definitions[state?.race];
    const hint=document.getElementById("skillsHint");
    if(hint)hint.textContent=skill
      ?"Técnica de nivel 1. La miniesfera y el daño se confirman con el servidor; las poses avanzadas llegarán en niveles superiores."
      :"Todos comienzan con el puño. Elegí una raza para ver su técnica de Ki.";
    if(!skill)return;
    const card=document.createElement("article");card.className="skill-card";
    const title=document.createElement("h3");title.textContent=skill.name;
    const orb=node("svg",{viewBox:"0 0 64 32",class:"skill-orb-preview","aria-hidden":"true"});
    orb.append(node("circle",{cx:32,cy:16,r:12,fill:skill.color,opacity:.24}),node("circle",{cx:32,cy:16,r:7,fill:skill.color,stroke:"#fff4df","stroke-width":2}));
    const description=document.createElement("p");description.textContent=skill.description;
    const button=document.createElement("button");button.type="button";button.className="wide skill-use";button.textContent="Lanzar técnica";
    button.disabled=(state?.ki??0)<skill.kiCost;
    const remaining=Math.max(0,(cooldownUntil.get(skill.id)||0)-Date.now());
    if(remaining>0){button.disabled=true;button.textContent="Recarga "+(remaining/1000).toFixed(1)+" s";}
    button.addEventListener("click",()=>{
      const spawnId=global.DragonRealmSelectedSpawnId;
      if(!spawnId){events?.emit("ui:message",{message:"Seleccioná primero un enemigo del mapa."});return;}
      events?.emit("skill:use-requested",{skillId:skill.id,spawnId});
    });
    card.append(title,orb,description,button);root.append(card);
  }
  function playProjectile(detail,skill){
    const spawn=detail.spawn,position=detail.position;
    const svg=document.querySelector("#worldMapCanvas svg");
    if(!spawn||!position||!svg||spawn.mapId!==detail.mapId||position.mapId!==spawn.mapId)return;
    const sx=Number(position.x),sy=Number(position.y),tx=Number(spawn.x),ty=Number(spawn.y);
    if(![sx,sy,tx,ty].every(Number.isFinite))return;
    const glow=node("circle",{cx:sx,cy:sy,r:13,fill:skill.color,opacity:.3,"pointer-events":"none"});
    const orb=node("circle",{cx:sx,cy:sy,r:7,fill:skill.color,stroke:"#fff4df","stroke-width":2,"pointer-events":"none"});
    svg.append(glow,orb);
    const started=performance.now(),duration=340;
    const animate=now=>{
      const p=Math.min(1,(now-started)/duration),eased=1-Math.pow(1-p,2);
      const x=sx+(tx-sx)*eased,y=sy+(ty-sy)*eased;
      orb.setAttribute("cx",String(x));orb.setAttribute("cy",String(y));
      glow.setAttribute("cx",String(x));glow.setAttribute("cy",String(y));
      glow.setAttribute("opacity",String(.3*(1-p)));
      if(p<1&&orb.isConnected)requestAnimationFrame(animate);
      else{orb.remove();glow.remove();}
    };
    requestAnimationFrame(animate);
  }
  function floatDamage(detail){
    const spawn=detail.spawn,damage=Number(detail.result?.damage);
    if(!spawn||!Number.isFinite(damage)||damage<=0)return;
    const svg=document.querySelector("#worldMapCanvas svg");
    if(!svg||spawn.mapId!==detail.mapId)return;
    const marker=Array.from(svg.querySelectorAll("[data-spawn-id]")).find(el=>el.getAttribute("data-spawn-id")===spawn.spawnId);
    const startX=Number(spawn.x),startY=Number(spawn.y)-42;
    const label=node("text",{x:startX,y:startY,class:"combat-damage-number","text-anchor":"middle","pointer-events":"none"},String(damage));
    svg.append(label);
    const started=performance.now(),duration=850;
    const animate=now=>{
      const progress=Math.min(1,(now-started)/duration);
      label.setAttribute("y",String(startY-38*progress));
      label.setAttribute("opacity",String(1-progress));
      if(progress<1&&label.isConnected)requestAnimationFrame(animate);else label.remove();
    };
    requestAnimationFrame(animate);
    if(marker){
      marker.classList.remove("combat-hit");
      // Force a style boundary so repeated hits restart the short hit flash.
      void marker.getBoundingClientRect();
      marker.classList.add("combat-hit");
      setTimeout(()=>marker.classList.remove("combat-hit"),220);
    }
  }
  events?.on("state:updated",({state})=>render(state));
  events?.on("character:race-selected",({state})=>render(state));
  events?.on("combat:resolved",detail=>{
    const result=detail.result||{};
    if(result.skillId&&definitions[detail.race]){
      const skill=definitions[detail.race];cooldownUntil.set(skill.id,Date.now()+skill.cooldownMs);
      playProjectile(detail,skill);
    }
    if(result.spawnId&&result.mobHp!==undefined)floatDamage(detail);
    if(result.spawnId)events?.emit("world:mob-updated",{spawnId:result.spawnId,hp:result.mobHp,maxHp:result.mobMaxHp,defeated:result.mobDefeated});
  });
  global.DragonRealmSkillUI=Object.freeze({render,definitions});
})(window);
