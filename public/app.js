const $ = id => document.getElementById(id);
let token = "";
let currentUsername = "";
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
    button.addEventListener("click", () => action("equip_item", null, null, null, { itemId }));
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
      button.addEventListener("click", () => action("unequip_item", null, null, null, { slot }));
      row.append(button);
    }
    equipment.append(row);
  }
}
async function refreshWorldMobs() {
  const target = $("worldMobs");
  if (!target || !token) return;
  try {
    const data = await api("/api/world");
    target.replaceChildren();
    const maps = Array.isArray(data.maps) ? data.maps : [];
    const spawns = Array.isArray(data.spawns) ? data.spawns : [];
    const npcs = Array.isArray(data.npcs) ? data.npcs : [];
    for (const map of maps) {
      const section = document.createElement("section");
      section.className = "world-map-section";
      const heading = document.createElement("h3");
      heading.textContent = map.name;
      const description = document.createElement("p");
      description.className = "muted";
      description.textContent = map.description;
      section.append(heading, description);
      const mapNpcs = npcs.filter(npc => npc.mapId === map.id);
      if (mapNpcs.length) {
        const npcLine = document.createElement("p");
        npcLine.className = "muted";
        npcLine.textContent = "NPC: " + mapNpcs.map(npc => npc.name).join(", ");
        section.append(npcLine);
      }
      const mapSpawns = spawns.filter(spawn => spawn.mapId === map.id);
      if (!mapSpawns.length) {
        const empty = document.createElement("p");
        empty.className = "muted";
        empty.textContent = "No hay apariciones configuradas.";
        section.append(empty);
      }
      for (const spawn of mapSpawns) {
        const row = document.createElement("div");
        row.className = "world-mob-row";
        const details = document.createElement("div");
        const label = document.createElement("strong");
        label.textContent = spawn.name + (spawn.isBoss ? " · Jefe" : "");
        const status = document.createElement("p");
        status.className = "muted";
        status.textContent = spawn.hp > 0
          ? spawn.hp.toLocaleString("es-AR") + " / " + spawn.maxHp.toLocaleString("es-AR") + " HP · posición " + spawn.x + ", " + spawn.y
          : "Reaparece en " + Math.max(1, Math.ceil((spawn.respawnAt - Date.now()) / 1000)) + " s";
        details.append(label, status);
        const attack = document.createElement("button");
        attack.className = "secondary";
        attack.textContent = "Atacar";
        attack.disabled = spawn.hp <= 0 && spawn.respawnAt > Date.now();
        attack.addEventListener("click", () => action("attack_mob", null, null, null, { spawnId: spawn.spawnId }).catch(error => msg(error.message)));
        row.append(details, attack);
        section.append(row);
      }
      target.append(section);
    }
  } catch (_) {
    target.textContent = "No se pudo actualizar el estado del mundo.";
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
$("uphp").onclick = () => action("spend_potential", "maxHp", null, "uphp").catch(error => msg(error.message));
$("upki").onclick = () => action("spend_potential", "maxKi", null, "upki").catch(error => msg(error.message));
$("upatk").onclick = () => action("spend_potential", "attack", null, "upatk").catch(error => msg(error.message));
$("refresh").onclick = () => api("/api/me").then(show).then(() => msg("Progreso actualizado desde el servidor.")).catch(error => msg(error.message));
$("logout").onclick = () => {
  token = ""; currentUsername = "";
  $("game").classList.add("hidden"); $("auth").classList.remove("hidden"); $("pass").value = "";
  msg("Sesión cerrada en este dispositivo.");
};
fetch("/health").then(response => response.json()).then(data => msg(data.ok ? "Servidor conectado · base de datos " + data.database : "Servidor no disponible")).catch(() => msg("No se pudo contactar al servidor."));
