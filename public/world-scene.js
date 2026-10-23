(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";
  function el(tag, attrs, text) {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs || {}).forEach(([k, v]) => node.setAttribute(k, String(v)));
    if (text !== undefined && text !== "") node.textContent = text;
    return node;
  }
  function decorate(svg, map, world, player, username, selected, actions) {
    const W = map.width, H = map.height, horizon = H * .31, floor = H * .45;
    const scene = el("g", {"data-illustrated-world":"true", "aria-label":"Escenario ilustrado"});
    const defs = el("defs");
    const themes = {
      earth_training: { skyTop:"#58bce9", skyBottom:"#e1f2c8", grassTop:"#8fc95b", grassBottom:"#32643c", stoneTop:"#d2d0b9", stoneBottom:"#6d7a6a" },
      earth_wilderness: { skyTop:"#80b2de", skyBottom:"#e1f2c8", grassTop:"#8fc95b", grassBottom:"#32643c", stoneTop:"#d2d0b9", stoneBottom:"#6d7a6a" },
      frozen_peak: { skyTop:"#4f8fbd", skyBottom:"#e5f7ff", grassTop:"#d6edf0", grassBottom:"#779da8", stoneTop:"#f3ffff", stoneBottom:"#7b9cae" },
      volcanic_rift: { skyTop:"#44263e", skyBottom:"#e17a4c", grassTop:"#9d4939", grassBottom:"#382536", stoneTop:"#b77d70", stoneBottom:"#45313c" },
      sacred_lookout: { skyTop:"#7d8ce0", skyBottom:"#f5dcff", grassTop:"#b9d4a6", grassBottom:"#567c76", stoneTop:"#e1d8ef", stoneBottom:"#7a78a5" }
    };
    const theme = themes[map.id] || themes.earth_wilderness;
    const sky = el("linearGradient",{id:"dr-sky",x1:"0",y1:"0",x2:"0",y2:"1"});
    sky.append(el("stop",{offset:"0%","stop-color":theme.skyTop}),el("stop",{offset:"100%","stop-color":theme.skyBottom}));
    const ground = el("linearGradient",{id:"dr-ground",x1:"0",y1:"0",x2:"0",y2:"1"});
    ground.append(el("stop",{offset:"0%","stop-color":theme.grassTop}),el("stop",{offset:"100%","stop-color":theme.grassBottom}));
    const stone = el("linearGradient",{id:"dr-stone",x1:"0",y1:"0",x2:"0",y2:"1"});
    stone.append(el("stop",{offset:"0%","stop-color":theme.stoneTop}),el("stop",{offset:"100%","stop-color":theme.stoneBottom}));
    const sun = el("radialGradient",{id:"dr-sun"});
    sun.append(el("stop",{offset:"0%","stop-color":"#fffbd6","stop-opacity":".95"}),el("stop",{offset:"100%","stop-color":"#fffbd6","stop-opacity":"0"}));
    defs.append(sky,ground,stone,sun); scene.append(defs);
    scene.append(el("rect",{width:W,height:H,fill:"url(#dr-sky)"}));
    scene.append(el("circle",{cx:W*.8,cy:H*.15,r:H*.17,fill:"url(#dr-sun)"}),el("circle",{cx:W*.8,cy:H*.15,r:H*.055,fill:"#fff4bd"}));
    function cloud(x,y,s) {
      const g=el("g",{transform:"translate("+x+" "+y+") scale("+s+")",opacity:".85"});
      g.append(el("ellipse",{cx:0,cy:10,rx:53,ry:16,fill:"#fff"}),el("circle",{cx:-24,cy:1,r:23,fill:"#fff"}),el("circle",{cx:0,cy:-8,r:29,fill:"#fff"}),el("circle",{cx:29,cy:2,r:21,fill:"#fff"})); return g;
    }
    scene.append(cloud(W*.14,H*.14,.9),cloud(W*.48,H*.21,.62),cloud(W*.92,H*.27,.7));
    scene.append(el("path",{d:"M 0 "+(horizon+30)+" Q "+(W*.13)+" "+(horizon-80)+" "+(W*.25)+" "+(horizon+8)+" T "+(W*.53)+" "+(horizon-18)+" T "+(W*.79)+" "+(horizon+6)+" T "+W+" "+(horizon-20)+" L "+W+" "+H+" L 0 "+H+" Z",fill:"#a6ca80"}));
    scene.append(el("path",{d:"M 0 "+(horizon+72)+" Q "+(W*.18)+" "+(horizon-8)+" "+(W*.35)+" "+(horizon+56)+" T "+(W*.69)+" "+(horizon+42)+" T "+W+" "+(horizon+65)+" L "+W+" "+H+" L 0 "+H+" Z",fill:"#6eaa5d"}));
    scene.append(el("path",{d:"M 0 "+floor+" Q "+(W*.22)+" "+(floor-27)+" "+(W*.42)+" "+(floor+8)+" T "+(W*.75)+" "+(floor-4)+" T "+W+" "+(floor+5)+" L "+W+" "+H+" L 0 "+H+" Z",fill:"url(#dr-ground)"}));
    scene.append(el("path",{d:"M 0 "+floor+" Q "+(W*.22)+" "+(floor-27)+" "+(W*.42)+" "+(floor+8)+" T "+(W*.75)+" "+(floor-4)+" T "+W+" "+(floor+5),fill:"none",stroke:"#cce47b","stroke-width":12,"stroke-linecap":"round"}));
    if(map.id==="earth_training" || map.id==="earth_wilderness" || map.id==="sacred_lookout") {
      for(let i=0;i<Math.ceil(W/48);i++){
        const x=(i*83+19)%W,y=floor+30+(i%5)*31;
        scene.append(el("path",{d:"M "+x+" "+(y+10)+" q -7 -13 -10 -17 M "+x+" "+(y+10)+" q 4 -16 12 -20 M "+x+" "+(y+10)+" v -11",fill:"none",stroke:i%3===0?"#d6e781":"#438449","stroke-width":4,"stroke-linecap":"round",opacity:".7"}));
        if(i%4===0) scene.append(el("circle",{cx:x+13,cy:y-2,r:3.5,fill:"#fff0ad"}));
      }
    } else if(map.id==="frozen_peak") {
      for(let i=0;i<Math.ceil(W/110);i++) scene.append(el("path",{d:"M "+((i*137+22)%W)+" "+(floor+70+(i%4)*35)+" l 16 -5 11 7",fill:"none",stroke:"#e5fbff","stroke-width":4,opacity:".85"}));
    } else {
      for(let i=0;i<Math.ceil(W/190);i++) scene.append(el("path",{d:"M "+((i*211+30)%W)+" "+(floor+55+(i%3)*40)+" l 28 12 -19 9 36 16",fill:"none",stroke:"#ff9b48","stroke-width":5,"stroke-linecap":"round",opacity:".8"}));
    }
    function tree(x,y,s,alt){
      const g=el("g",{transform:"translate("+x+" "+y+") scale("+s+")"});
      g.append(el("ellipse",{cx:0,cy:8,rx:47,ry:10,fill:"#21452d",opacity:".28"}),el("path",{d:"M -8 0 L -13 -82 Q -5 -102 7 -82 L 12 0 Z",fill:"#805a3b",stroke:"#5d432f","stroke-width":4}),el("circle",{cx:-23,cy:-83,r:35,fill:alt?"#367b47":"#3d914d"}),el("circle",{cx:13,cy:-102,r:38,fill:alt?"#4d9853":"#55a85b"}),el("circle",{cx:35,cy:-75,r:28,fill:alt?"#2d6c42":"#418e48"}),el("circle",{cx:0,cy:-115,r:20,fill:"#83bf62",opacity:".75"})); return g;
    }
    function rock(x,y,s){
      const g=el("g",{transform:"translate("+x+" "+y+") scale("+s+")"});
      g.append(el("ellipse",{cx:0,cy:8,rx:48,ry:10,fill:"#1d3e2b",opacity:".25"}),el("path",{d:"M -45 0 L -35 -31 L -10 -54 L 22 -49 L 48 -19 L 43 0 Z",fill:"url(#dr-stone)",stroke:"#596a61","stroke-width":4}),el("path",{d:"M -31 -29 L -10 -48 L 4 -23 L -8 -9 Z",fill:"#e0dcc6",opacity:".8"})); return g;
    }
    if(map.id==="earth_training"){
      const x=W*.12,y=floor+8,hut=el("g",{transform:"translate("+x+" "+y+")"});
      hut.append(el("ellipse",{cx:0,cy:9,rx:104,ry:18,fill:"#21432e",opacity:".3"}),el("rect",{x:-78,y:-120,width:156,height:120,rx:8,fill:"#f2d9a2",stroke:"#76513b","stroke-width":7}),el("path",{d:"M -100 -115 L 0 -190 L 100 -115 Z",fill:"#d85b43",stroke:"#793f34","stroke-width":8}),el("path",{d:"M -64 -105 L 0 -154 L 64 -105",fill:"none",stroke:"#f7a05c","stroke-width":9}),el("rect",{x:-20,y:-64,width:40,height:64,rx:4,fill:"#76513b"}),el("rect",{x:-61,y:-91,width:30,height:29,rx:4,fill:"#82d6e8",stroke:"#76513b","stroke-width":5}),el("rect",{x:31,y:-91,width:30,height:29,rx:4,fill:"#82d6e8",stroke:"#76513b","stroke-width":5}),el("text",{x:0,y:-127,"text-anchor":"middle","font-size":24,"font-weight":900,fill:"#fff2cb"},"DOJO"));
      scene.append(hut);
    } else if(map.id==="frozen_peak") {
      scene.append(el("path",{d:"M 0 "+(floor+24)+" L "+(W*.16)+" "+(floor-165)+" L "+(W*.24)+" "+(floor-80)+" L "+(W*.42)+" "+(floor-245)+" L "+(W*.57)+" "+(floor-70)+" L "+(W*.73)+" "+(floor-195)+" L "+W+" "+(floor+10)+" Z",fill:"#789eaf",stroke:"#476c83","stroke-width":8}),
        el("path",{d:"M "+(W*.16)+" "+(floor-165)+" l 42 64 -31 -13 -15 35 -16 -47 Z M "+(W*.42)+" "+(floor-245)+" l 52 88 -35 -19 -18 38 -18 -50 Z M "+(W*.73)+" "+(floor-195)+" l 42 74 -29 -12 -16 32 -17 -46 Z",fill:"#f1ffff",stroke:"#c5e9f2","stroke-width":5}));
    } else if(map.id==="volcanic_rift") {
      scene.append(el("path",{d:"M 0 "+(floor+15)+" L "+(W*.17)+" "+(floor-170)+" L "+(W*.25)+" "+(floor-115)+" L "+(W*.43)+" "+(floor-275)+" L "+(W*.57)+" "+(floor-80)+" L "+(W*.77)+" "+(floor-205)+" L "+W+" "+(floor+15)+" Z",fill:"#4c3545",stroke:"#2c2435","stroke-width":10}),
        el("path",{d:"M "+(W*.15)+" "+(floor+5)+" l 70 22 -40 18 82 31 M "+(W*.54)+" "+(floor+15)+" l 50 25 -30 22 74 35 M "+(W*.83)+" "+(floor+10)+" l -28 29 46 22",fill:"none",stroke:"#ff9b48","stroke-width":10,"stroke-linecap":"round"}),
        el("path",{d:"M "+(W*.43)+" "+(floor-275)+" l 30 105 -30 -22 -20 38 -8 -61 Z",fill:"#e7a078"}));
    } else if(map.id==="sacred_lookout") {
      scene.append(el("path",{d:"M "+(W*.1)+" "+(floor+18)+" Q "+(W*.5)+" "+(floor-50)+" "+(W*.9)+" "+(floor+18)+" L "+(W*.72)+" "+(floor+105)+" L "+(W*.28)+" "+(floor+105)+" Z",fill:"#8e9ad1",stroke:"#e6d8ff","stroke-width":8}),
        el("path",{d:"M "+(W*.4)+" "+(floor+18)+" v -120 l "+(W*.1)+" -78 l "+(W*.1)+" 78 v 120 Z",fill:"#e5d9ee",stroke:"#777db1","stroke-width":8}),
        el("path",{d:"M "+(W*.35)+" "+(floor-98)+" L "+(W*.5)+" "+(floor-225)+" L "+(W*.65)+" "+(floor-98)+" Z",fill:"#c5a6e8",stroke:"#777db1","stroke-width":8}),
        el("circle",{cx:W*.5,cy:floor-125,r:35,fill:"#fff0c6",stroke:"#b4a4e8","stroke-width":8}));
    } else {
      scene.append(el("path",{d:"M "+(W*.55)+" "+(floor+15)+" l 90 -135 66 47 86 -158 115 246 80 -102 100 102 Z",fill:"#778b79",stroke:"#526d5e","stroke-width":8}),el("path",{d:"M "+(W*.61)+" "+(floor-55)+" l 34 -50 23 17 44 -80 50 113",fill:"none",stroke:"#d1d7bd","stroke-width":9,opacity:".7"}));
    }
    if(map.id==="earth_training" || map.id==="earth_wilderness" || map.id==="sacred_lookout") {
      for(let i=0;i<Math.ceil(W/280);i++) scene.append(tree((i*317+140)%W,floor-8-(i%3)*25,.55+(i%3)*.12,i%2));
    } else if(map.id==="frozen_peak") {
      for(let i=0;i<Math.ceil(W/330);i++) {
        const x=(i*379+90)%W, y=floor+4-(i%2)*18, h=80+(i%3)*22;
        scene.append(el("path",{d:"M "+x+" "+y+" l -34 "+h+" h 68 Z",fill:"#3e7185",stroke:"#d4f4ff","stroke-width":4}),
          el("path",{d:"M "+x+" "+(y+16)+" l -21 28 h 42 Z",fill:"#e8fbff"}));
      }
    }
    scene.append(rock(W*(map.id==="earth_training"?.37:.25),floor+32,.8),rock(W*.72,floor+36,.65));
    scene.append(el("path",{d:"M 0 "+(floor+H*.11)+" Q "+(W*.25)+" "+(floor+H*.08)+" "+(W*.5)+" "+(floor+H*.12)+" T "+W+" "+(floor+H*.1),fill:"none",stroke:"#d4d89a","stroke-width":4,"stroke-dasharray":"2 18",opacity:".5","pointer-events":"none"}));

    function fighter(kind, label, x, y, scale, boss) {
      const enemy=kind==="enemy", npc=kind==="npc", remote=kind==="remote";
      const g=el("g",{transform:"translate("+x+" "+y+") scale("+scale+")",class:kind==="enemy"?"scene-mob":kind==="player"?"scene-hero":kind==="npc"?"scene-npc":"scene-remote"});
      const skin=enemy?"#75c84c":"#f4c6a1", suit=enemy?"#326d38":npc?"#eee4ce":remote?"#8c74d6":"#ed793e", hair=enemy?"#4d893d":npc?"#4b382c":"#34251e";
      g.append(el("ellipse",{cx:0,cy:5,rx:31,ry:9,fill:"#163a27",opacity:".35"}),el("path",{d:"M -18 -30 L -24 -2 L -9 0 L -3 -25 Z",fill:skin,stroke:"#293b31","stroke-width":3}),el("path",{d:"M 5 -26 L 8 0 L 23 0 L 18 -30 Z",fill:skin,stroke:"#293b31","stroke-width":3}),el("path",{d:"M -25 -65 Q -4 -76 22 -63 L 27 -30 Q 0 -17 -27 -31 Z",fill:suit,stroke:enemy?"#244b31":"#8c4934","stroke-width":4}),el("path",{d:"M -22 -59 L -40 -43 L -31 -34 L -12 -49 Z",fill:skin,stroke:"#293b31","stroke-width":3}),el("path",{d:"M 18 -59 L 38 -48 L 31 -38 L 12 -48 Z",fill:skin,stroke:"#293b31","stroke-width":3}),el("path",{d:"M -16 -87 Q 0 -102 17 -87 L 20 -65 Q 0 -52 -18 -66 Z",fill:skin,stroke:"#293b31","stroke-width":3}),el("path",{d:enemy?"M -18 -86 L -24 -105 L -7 -95 L 0 -116 L 7 -96 L 24 -105 L 17 -84 Z":"M -18 -86 L -24 -101 L -8 -96 L 0 -109 L 7 -96 L 22 -100 L 17 -84 Z",fill:hair,stroke:"#302d27","stroke-width":3}),el("path",{d:"M -10 -78 h 7 M 5 -78 h 7",stroke:"#222d2c","stroke-width":4,"stroke-linecap":"round"}),el("path",{d:"M -3 -68 h 7",stroke:enemy?"#244b31":"#8d4d43","stroke-width":3,"stroke-linecap":"round"}));
      if(enemy) g.append(el("path",{d:"M -18 -56 L 0 -47 L 18 -56 L 13 -34 L 0 -29 L -13 -34 Z",fill:"#a8e16a",stroke:"#315a34","stroke-width":3}));
      else g.append(el("path",{d:"M -25 -36 L -8 -30 L -7 -23 L -24 -25 Z M 7 -30 L 24 -36 L 27 -26 L 8 -22 Z",fill:"#fff1d0",stroke:"#754c37","stroke-width":2}));
      if(boss) g.append(el("circle",{cx:0,cy:-50,r:73,fill:"none",stroke:"#ffcf64","stroke-width":4,"stroke-dasharray":"8 8"}));
      if(label){
        g.append(el("path",{d:"M -42 -130 Q 0 -154 42 -130 L 32 -111 L -32 -111 Z",fill:boss?"#f4c75e":npc?"#fff1a6":"#e5f5ff",stroke:enemy?"#42653b":"#3577a5","stroke-width":4}),el("text",{x:0,y:-137,"text-anchor":"middle","font-size":17,"font-weight":900,fill:"#273d2d"},label.toUpperCase()),el("text",{x:0,y:39,"text-anchor":"middle","font-size":24,class:"map-label"},label));
      }
      return g;
    }
    // Render map props behind the characters.
    (world.obstacles||[]).filter(o=>o.mapId===map.id).forEach(o=>{
      const obj=el("g",{class:"scene-obstacle"});
      if(o.kind==="ruins") obj.append(el("path",{d:"M "+o.x+" "+(o.y+o.height)+" v -"+(o.height*.7)+" l 30 -25 25 15 0 -"+(o.height*.3)+" h 38 v "+(o.height*.35)+" l 34 -20 28 25 v "+(o.height*.5)+" Z",fill:"#a7a28a",stroke:"#696f62","stroke-width":7}));
      else obj.append(rock(o.x+o.width*.5,o.y+o.height*.55,1.25));
      obj.append(el("text",{x:o.x+o.width/2,y:o.y+o.height+25,"text-anchor":"middle","font-size":19,class:"map-label"},o.name)); scene.append(obj);
    });
    // Add a subtle dirt path to visually connect the world.
    scene.append(el("path",{d:"M 0 "+(floor+H*.13)+" Q "+(W*.2)+" "+(floor+H*.08)+" "+(W*.44)+" "+(floor+H*.15)+" T "+W+" "+(floor+H*.11),fill:"none",stroke:"#d8c88a","stroke-width":22,opacity:".45"}));
    // NPCs, mobs and the local player are added last so they sit in front of the scenery.
    (world.npcs||[]).filter(n=>n.mapId===map.id).forEach(n=>{
      const g=el("g",{transform:"translate("+n.x+" "+n.y+")",class:"map-npc-marker",tabindex:0,role:"button","aria-label":"Hablar con "+n.name});
      if(n.role==="travel") g.append(el("ellipse",{cx:0,cy:-47,rx:48,ry:77,fill:"#4de5ff",opacity:".23",stroke:"#9af4ff","stroke-width":7}),el("ellipse",{cx:0,cy:-47,rx:30,ry:59,fill:"none",stroke:"#a2f7ff","stroke-width":4,"stroke-dasharray":"8 6"}));
      g.append(fighter("npc",n.role==="travel"?"PORTAL":n.name,n.x?0:0,0,.82,false));
      const interact=e=>{e.stopPropagation();actions.interactNpc(n);};
      g.addEventListener("click",interact);g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();interact(e);}});
      scene.append(g);
    });
    (world.spawns||[]).filter(s=>s.mapId===map.id).forEach(s=>{
      const g=el("g",{transform:"translate("+s.x+" "+s.y+")",class:"map-mob-marker"+(s.spawnId===selected?" selected":""),"data-spawn-id":s.spawnId,tabindex:0,role:"button","aria-label":"Seleccionar "+s.name});
      g.append(el("ellipse",{cx:0,cy:-48,rx:62,ry:83,class:"marker-halo"}),fighter("enemy",s.name,0,0,.92,!!s.isBoss),el("rect",{class:"mob-hp-bg",x:-42,y:17,width:84,height:10,rx:5}),el("rect",{class:"mob-hp-fill"+(s.maxHp&&s.hp/s.maxHp<.25?" low":""),x:-39,y:20,width:78*(s.maxHp?Math.max(0,Math.min(1,s.hp/s.maxHp)):0),height:4,rx:2}),el("text",{x:0,y:54,"text-anchor":"middle","font-size":15,class:"mob-hp-label"},s.hp>0?s.hp.toLocaleString("es-AR")+" HP":"KO"));
      const choose=e=>{e.stopPropagation();actions.selectSpawn(s.spawnId);};
      g.addEventListener("click",choose);g.addEventListener("keydown",e=>{if(e.key==="Enter"||e.key===" "){e.preventDefault();choose(e);}});
      scene.append(g);
    });
    if(player&&player.mapId===map.id){
      const g=el("g",{transform:"translate("+player.x+" "+player.y+")",class:"map-player-marker","aria-label":"Tu personaje"});
      g.append(el("ellipse",{cx:0,cy:-48,rx:60,ry:80,fill:"#77ddff",opacity:".13"}),fighter("player",username||"Guerrero",0,0,.94,false));
      scene.append(g);
    }
    // Put this artwork over the old prototype drawing; interactions are recreated above.
    svg.append(scene);
  }
  window.DragonRealmScene={decorate:decorate};
})();