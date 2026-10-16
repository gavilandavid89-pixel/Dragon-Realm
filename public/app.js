const $ = id => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
let token = "";
let currentUsername = "";
let worldData = { maps: [], npcs: [], spawns: [] };
let currentMapId = "";
let selectedSpawnId = "";
const ITEM_LABELS = {
  training_gloves: "Guantes de entrenamiento",
  training_pants: "Pantalones de entrenamiento",
  training_armor: "Armadura de entrenamiento",
  training_boots: "Botas de entrenamiento"
};
const SLOT_LABELS = { gloves:"Guantes", pants:"Pantalones", armor:"Armadura", boots:"Botas" };

async function api(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(path, { method, headers, body: body ? JSON.stringify(body) : undefined });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "Error " + response.status);
  return data;
}
function msg(text) { $("status").textContent = text; }
function svgElement(name, attrs = {}, text = "") {
  const element = document.createElementNS(SVG_NS, name);
  for (const [key, value] of Object.entries(attrs)) element.setAttribute(key, String(value));
  if (text) element.textContent = text;
  return element;
}
function renderInventory(state) {
  const inventory = $("inventory");
  inventory.replaceChildren();
  const entries = Array.isArray(state.inventory) ? state.inventory : [];
  if (!entries.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "Todavía no tenés objetos. Los equipos aparecen como botín al derrotar enemigos.";
    inventory.append(empty);
  }
  for (const entry of entries) {
    const itemId = entry.itemId;
    const row = document.createElement("div");
    row.className = "item-row";
    const description = document.createElement("span");
    description.textContent = (ITEM_LABELS[itemId] || itemId) + " ×" + entry.quantity;
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = "Equipar";
    button.disabled = !ITEM_LABELS[itemId];
    button.addEventListener("click", () => action("equip_item", null, null, null, { itemId }).catch(error => msg(error.message)));
    row.append(description, button);
    inventory.append(row);
  }
  const equipment = $("equipment");
  equipment.replaceChildren();
  for (const slot of Object.keys(SLOT_LABELS)) {
    const itemId = state.equipment?.[slot] || null;
    const row = document.createElement("div");
    row.className = "item-row";
    const label = document.createElement("span");
    label.textContent = SLOT_LABELS[slot] + ": " + (itemId ? (ITEM_LABELS[itemId] || itemId) : "Vacío");
    row.append(label);
    if (itemId) {
      const button = document.createElement("button");
      button.className = "secondary";
      button.textContent = "Quitar";
      button.addEventListener("click", () => action("unequip_item", null, null, null, { slot }).catch(error => msg(error.message)));
      row.append(button);
    }
    equipment.append(row);
  }
}
function getSelectedMap() {
  return worldData.maps.find(map => map.id === currentMapId) || worldData.maps[0] || null;
}
function getSpawn(spawnId) {
  return worldData.spawns.find(spawn => spawn.spawnId === spawnId) || null;
}
function selectSpawn(spawnId) {
  selectedSpawnId = spawnId;
  const spawn = getSpawn(spawnId);
  const hint = $("worldMapHint");
  const attack = $("attackSelectedSpawn");
  if (!spawn) {
    hint.textContent = "Tocá un enemigo del mapa para seleccionarlo.";
    attack.disabled = true;
    return;
  }
  hint.textContent = spawn.name + (spawn.isBoss ? " · Jefe" : "") + " — " +
    (spawn.hp > 0
      ? spawn.hp.toLocaleString("es-AR") + " / " + spawn.maxHp.toLocaleString("es-AR") + " HP"
      : "Reaparece en " + Math.max(1, Math.ceil((spawn.respawnAt - Date.now()) / 1000)) + " s") +
    ". Coordenadas: " + spawn.x + ", " + spawn.y + ".";
  attack.disabled = spawn.hp <= 0 && spawn.respawnAt > Date.now();
  for (const marker of $("worldMapCanvas").querySelectorAll("[data-spawn-id]")) {
    marker.classList.toggle("selected", marker.getAttribute("data-spawn-id") === spawnId);
  }
  for (const row of $("worldMobs").querySelectorAll("[data-spawn-row]")) {
    row.classList.toggle("selected", row.getAttribute("data-spawn-row") === spawnId);
  }
}
function renderWorldMap() {
  const map = getSelectedMap();
  const nav = $("worldMapNav");
  const canvas = $("worldMapCanvas");
  nav.replaceChildren();
  canvas.replaceChildren();
  if (!map) {
    canvas.textContent = "No hay mapas configurados.";
    $("worldMapHint").textContent = "El servidor todavía no devolvió mapas.";
    $("attackSelectedSpawn").disabled = true;
    return;
  }
  for (const entry of worldData.maps) {
    const button = document.createElement("button");
    button.className = "map-tab" + (entry.id === map.id ? " active" : "");
    button.textContent = entry.name;
    button.setAttribute("aria-pressed", String(entry.id === map.id));
    button.addEventListener("click", () => {
      currentMapId = entry.id;
      const spawns = worldData.spawns.filter(spawn => spawn.mapId === currentMapId);
      selectedSpawnId = spawns[0]?.spawnId || "";
      renderWorldMap();
      renderWorldSpawnList();
      selectSpawn(selectedSpawnId);
    });
    nav.append(button);
  }

  const svg = svgElement("svg", {
    viewBox: "0 0 " + map.width + " " + map.height,
    role: "img",
    "aria-label": "Mapa " + map.name,
    preserveAspectRatio: "xMidYMid meet"
  });
  const defs = svgElement("defs");
  const gradient = svgElement("linearGradient", { id: "terrain-gradient", x1: "0", y1: "0", x2: "1", y2: "1" });
  gradient.append(
    svgElement("stop", { offset: "0%", "stop-color": map.id === "earth_training" ? "#496c4b" : "#6c7950" }),
    svgElement("stop", { offset: "100%", "stop-color": map.id === "earth_training" ? "#263f38" : "#394a39" })
  );
  const pattern = svgElement("pattern", { id: "terrain-pattern", width: 100, height: 100, patternUnits: "userSpaceOnUse" });
  pattern.append(
    svgElement("path", { d: "M 0 25 Q 25 10 50 25 T 100 25 M 0 75 Q 25 60 50 75 T 100 75", fill: "none", stroke: "#c5d6a0", "stroke-opacity": ".12", "stroke-width": 3 }),
    svgElement("circle", { cx: 24, cy: 45, r: 3, fill: "#d5d8a4", "fill-opacity": ".25" })
  );
  defs.append(gradient, pattern);
  svg.append(defs);
  svg.append(svgElement("rect", { x: 0, y: 0, width: map.width, height: map.height, fill: "url(#terrain-gradient)" }));
  svg.append(svgElement("rect", { x: 0, y: 0, width: map.width, height: map.height, fill: "url(#terrain-pattern)" }));

  // Decorative landmarks are generated locally; gameplay positions still come from server data.
  svg.append(svgElement("path", {
    d: "M 0 " + (map.height * .72) + " Q " + (map.width * .22) + " " + (map.height * .62) + " " + (map.width * .38) + " " + (map.height * .73) +
      " T " + (map.width * .72) + " " + (map.height * .68) + " T " + map.width + " " + (map.height * .75),
    fill: "none", stroke: "#c7b783", "stroke-width": Math.max(18, map.width * .018), "stroke-opacity": ".45"
  }));
  for (let i = 0; i < 18; i += 1) {
    const x = (i * 197 + 83) % map.width;
    const y = (i * 113 + 67) % map.height;
    const radius = 14 + (i % 4) * 5;
    const tree = svgElement("g", { opacity: ".58", "aria-hidden": "true" });
    tree.append(
      svgElement("circle", { cx: x, cy: y, r: radius, fill: i % 3 === 0 ? "#8ca76a" : "#294b39" }),
      svgElement("circle", { cx: x - radius * .2, cy: y - radius * .2, r: radius * .55, fill: "#a2b87a", "fill-opacity": ".45" })
    );
    svg.append(tree);
  }

  const mapNpcs = worldData.npcs.filter(npc => npc.mapId === map.id);
  for (const npc of mapNpcs) {
    const marker = svgElement("g", { class: "map-npc-marker", transform: "translate(" + npc.x + " " + npc.y + ")" });
    marker.append(
      svgElement("circle", { r: 34, fill: "#202a3a", stroke: "#f0d18a", "stroke-width": 5 }),
      svgElement("text", { x: 0, y: 10, "text-anchor": "middle", "font-size": 31 }, npc.role === "travel" ? "↔" : npc.role === "equipment" ? "⚒" : "✦"),
      svgElement("text", { x: 0, y: 56, "text-anchor": "middle", "font-size": 24, class: "map-label" }, npc.name)
    );
    svg.append(marker);
  }

  const mapSpawns = worldData.spawns.filter(spawn => spawn.mapId === map.id);
  for (const spawn of mapSpawns) {
    const marker = svgElement("g", {
      class: "map-mob-marker" + (spawn.spawnId === selectedSpawnId ? " selected" : ""),
      transform: "translate(" + spawn.x + " " + spawn.y + ")",
      "data-spawn-id": spawn.spawnId,
      role: "button",
      tabindex: 0,
      "aria-label": "Seleccionar " + spawn.name
    });
    marker.append(
      svgElement("circle", { class: "marker-halo", r: spawn.isBoss ? 42 : 31 }),
      svgElement("circle", { class: "marker-core", r: spawn.isBoss ? 29 : 22 }),
      svgElement("text", { x: 0, y: 8, "text-anchor": "middle", "font-size": spawn.isBoss ? 25 : 21 }, spawn.isBoss ? "★" : "☠"),
      svgElement("text", { x: 0, y: -42, "text-anchor": "middle", "font-size": 22, class: "map-label" }, spawn.name)
    );
    const choose = () => selectSpawn(spawn.spawnId);
    marker.addEventListener("click", choose);
    marker.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose();
      }
    });
    svg.append(marker);
  }
  canvas.append(svg);
  selectSpawn(selectedSpawnId && getSpawn(selectedSpawnId)?.mapId === map.id ? selectedSpawnId : (mapSpawns[0]?.spawnId || ""));
}
function renderWorldSpawnList() {
  const target = $("worldMobs");
  target.replaceChildren();
  const map = getSelectedMap();
  if (!map) return;
  const mapSpawns = worldData.spawns.filter(spawn => spawn.mapId === map.id);
  if (!mapSpawns.length) {
    const empty = document.createElement("p");
    empty.className = "muted";
    empty.textContent = "No hay apariciones configuradas en este mapa.";
    target.append(empty);
    return;
  }
  for (const spawn of mapSpawns) {
    const row = document.createElement("div");
    row.className = "world-mob-row" + (spawn.spawnId === selectedSpawnId ? " selected" : "");
    row.setAttribute("data-spawn-row", spawn.spawnId);
    const details = document.createElement("div");
    const label = document.createElement("strong");
    label.textContent = spawn.name + (spawn.isBoss ? " · Jefe" : "");
    const status = document.createElement("p");
    status.className = "muted";
    status.textContent = spawn.hp > 0
      ? spawn.hp.toLocaleString("es-AR") + " / " + spawn.maxHp.toLocaleString("es-AR") + " HP · posición " + spawn.x + ", " + spawn.y
      : "Reaparece en " + Math.max(1, Math.ceil((spawn.respawnAt - Date.now()) / 1000)) + " s";
    details.append(label, status);
    const choose = document.createElement("button");
    choose.className = "secondary";
    choose.textContent = "Ver";
    choose.addEventListener("click", () => {
      selectSpawn(spawn.spawnId);
      renderWorldSpawnList();
    });
    row.append(details, choose);
    target.append(row);
  }
}
async function refreshWorldMobs() {
  if (!token) return;
  try {
    const data = await api("/api/world");
    worldData = {
      maps: Array.isArray(data.maps) ? data.maps : [],
      npcs: Array.isArray(data.npcs) ? data.npcs : [],
      spawns: Array.isArray(data.spawns) ? data.spawns : []
    };
    if (!worldData.maps.some(map => map.id === currentMapId)) currentMapId = worldData.maps[0]?.id || "";
    if (!getSpawn(selectedSpawnId) || getSpawn(selectedSpawnId)?.mapId !== currentMapId) {
      selectedSpawnId = worldData.spawns.find(spawn => spawn.mapId === currentMapId)?.spawnId || "";
    }
    renderWorldMap();
    renderWorldSpawnList();
    selectSpawn(selectedSpawnId);
  } catch (_) {
    $("worldMapCanvas").textContent = "No se pudo actualizar el mapa. Probá con el botón Actualizar.";
  }
}
function show(data) {
  const state = data.state;
  currentUsername = data.username || currentUsername || "Guerrero";
  const effective = state.effectiveStats || state;
  $("welcome").textContent = "⚔️ " + currentUsername;
  $("power").textContent = state.power;
  $("potential").textContent = state.potential;
  $("hp").textContent = effective.maxHp;
  $("ki").textContent = effective.maxKi;
  $("attack").textContent = effective.attack;
  $("gold").textContent = state.gold;
  $("gems").textContent = state.gems || 0;
  const kills = state.missionProgress?.trainingDummyKills || 0;
  const complete = Boolean(state.missions?.training_dummy);
  $("dummyKills").textContent = Math.min(kills, 10) + " / 10";
  $("missionStatus").textContent = complete ? "Misión completada · recompensa reclamada" : "Derrotá 10 muñecos para obtener 50 Poder y 50 Potencial";
  $("dummy").textContent = complete ? "🥋 Golpear muñeco · +1 Poder y Potencial" : "🥋 Golpear muñeco · misión " + Math.min(kills, 10) + "/10";
  renderInventory(state);
  $("auth").classList.add("hidden");
  $("game").classList.remove("hidden");
}
async function auth(path) {
  const data = await api(path, "POST", { username: $("user").value, password: $("pass").value });
  token = data.token;
  currentUsername = data.username;
  show(await api("/api/me"));
  await refreshWorldMobs();
  msg(data.message ? data.message + " Guardado en la nube." : "Sesión iniciada.");
}
async function action(actionName, stat, mobId, buttonId, extra = {}) {
  const button = buttonId ? $(buttonId) : null;
  if (button) button.disabled = true;
  try {
    const body = { action: actionName, ...extra };
    if (stat) body.stat = stat;
    if (mobId) body.mobId = mobId;
    const data = await api("/api/game/action", "POST", body);
    show({ username: currentUsername, state: data.state });
    await refreshWorldMobs();
    const result = data.result || {};
    const reward = result.reward;
    let detail = "";
    if (reward) {
      detail = " · +" + reward.power + " Poder, +" + reward.potential + " Potencial";
      if (reward.gold) detail += ", +" + reward.gold + " oro";
      if (reward.gems) detail += ", +" + reward.gems + " gemas";
      if (reward.equipment?.length) detail += " · Equipo: " + reward.equipment.map(item => ITEM_LABELS[item.itemId] || item.itemId).join(", ");
      if (result.inventoryFullDrops?.length) detail += " · Inventario lleno: no se recogió todo el equipo";
    }
    if (result.mobMaxHp && result.mobMaxHp > 1) detail += " · Vida enemiga: " + result.mobHp + "/" + result.mobMaxHp;
    if (result.mobDefeated && result.respawnAt) detail += " · Reaparece en " + Math.max(1, Math.ceil((result.respawnAt - Date.now()) / 1000)) + " s";
    msg((result.message || "Acción completada.") + detail + " · Guardado en el servidor.");
  } finally {
    if (button) button.disabled = false;
  }
}
$("register").onclick = () => auth("/api/auth/register").catch(error => msg(error.message));
$("login").onclick = () => auth("/api/auth/login").catch(error => msg(error.message));
$("dummy").onclick = () => action("attack_mob", null, "training_dummy", "dummy").catch(error => msg(error.message));
$("attackSelectedSpawn").onclick = () => {
  const spawn = getSpawn(selectedSpawnId);
  if (!spawn) return msg("Seleccioná primero un enemigo del mapa.");
  action("attack_mob", null, null, "attackSelectedSpawn", { spawnId: spawn.spawnId }).catch(error => msg(error.message));
};
$("uphp").onclick = () => action("spend_potential", "maxHp", null, "uphp").catch(error => msg(error.message));
$("upki").onclick = () => action("spend_potential", "maxKi", null, "upki").catch(error => msg(error.message));
$("upatk").onclick = () => action("spend_potential", "attack", null, "upatk").catch(error => msg(error.message));
$("refresh").onclick = () => api("/api/me").then(show).then(refreshWorldMobs).then(() => msg("Progreso y mundo actualizados desde el servidor.")).catch(error => msg(error.message));
$("logout").onclick = () => {
  token = ""; currentUsername = ""; worldData = { maps: [], npcs: [], spawns: [] }; currentMapId = ""; selectedSpawnId = "";
  $("game").classList.add("hidden"); $("auth").classList.remove("hidden"); $("pass").value = "";
  $("worldMapNav").replaceChildren(); $("worldMapCanvas").replaceChildren(); $("worldMobs").replaceChildren();
  msg("Sesión cerrada en este dispositivo.");
};
fetch("/health").then(response => response.json()).then(data => msg(data.ok ? "Servidor conectado · base de datos " + data.database : "Servidor no disponible")).catch(() => msg("No se pudo contactar al servidor."));
