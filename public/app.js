const $ = id => document.getElementById(id);
const SVG_NS = "http://www.w3.org/2000/svg";
let token = "";
let currentUsername = "";
let worldData = { maps: [], npcs: [], obstacles: [], spawns: [] };
let worldSignature = 0;
let worldSyncInFlight = false;
let worldPlayers = [];
let worldPlayerRenderState = new Map();
let worldPlayerAnimationFrame = 0;
let worldPlayersSyncInFlight = false;
let worldPlayersTimer = null;
let worldPlayersRunId = 0;
let worldPlayersStreamController = null;
let worldPlayersStreamConnected = false;
let worldStreamRunId = 0;
let worldStreamController = null;
let currentMapId = "";
let selectedSpawnId = "";
let playerPosition = { mapId: "earth_training", x: 150, y: 420 };
let movementRunId = 0;
let moveTarget = null;
let movementSocket = null;
let movementSocketReady = false;
let movementResolve = null;
let movementResolveRunId = 0;
let playerRenderState = null;
let playerAnimationFrame = 0;
const CLIENT_ATTACK_RANGE = 115;
const CLIENT_NPC_RANGE = 90;
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
  const pendingLoot = Array.isArray(state.pendingLoot) ? state.pendingLoot : [];
  if (pendingLoot.length) {
    const pending = document.createElement("div");
    pending.className = "item-row";
    const description = document.createElement("span");
    description.textContent = "Botín pendiente: " + pendingLoot.map(entry =>
      (ITEM_LABELS[entry.itemId] || entry.itemId) + " ×" + entry.quantity
    ).join(", ");
    const button = document.createElement("button");
    button.className = "secondary";
    button.textContent = "Recoger";
    button.addEventListener("click", () => action("claim_pending_loot", null, null, null).catch(error => msg(error.message)));
    pending.append(description, button);
    inventory.append(pending);
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
  const onCurrentMap = playerPosition?.mapId === spawn.mapId;
  const distance = onCurrentMap ? Math.round(Math.hypot(playerPosition.x - spawn.x, playerPosition.y - spawn.y)) : Infinity;
  if (!onCurrentMap) hint.textContent = "Estás viendo otra zona. Tu personaje está en " + (worldData.maps.find(map => map.id === playerPosition?.mapId)?.name || "otra zona") + "; viajá usando un portal.";
  else if (distance > CLIENT_ATTACK_RANGE) hint.textContent += " Distancia: " + distance + " — movete por el mapa hasta estar a alcance.";
  attack.disabled = !onCurrentMap || distance > CLIENT_ATTACK_RANGE || (spawn.hp <= 0 && spawn.respawnAt > Date.now());
  for (const marker of $("worldMapCanvas").querySelectorAll("[data-spawn-id]")) {
    marker.classList.toggle("selected", marker.getAttribute("data-spawn-id") === spawnId);
  }
  for (const row of $("worldMobs").querySelectorAll("[data-spawn-row]")) {
    row.classList.toggle("selected", row.getAttribute("data-spawn-row") === spawnId);
  }
}
function currentPlayerRenderPosition(now = performance.now()) {
  const state = playerRenderState;
  if (!state || state.duration <= 0) return state ? { x: state.targetX, y: state.targetY } : playerPosition;
  const progress = Math.max(0, Math.min(1, (now - state.startedAt) / state.duration));
  return { x: state.startX + (state.targetX - state.startX) * progress, y: state.startY + (state.targetY - state.startY) * progress };
}
function animatePlayerMarker() {
  playerAnimationFrame = 0;
  const marker = $("worldMapCanvas").querySelector(".map-player-marker");
  const map = getSelectedMap();
  if (!marker || !map || !playerRenderState || playerRenderState.mapId !== map.id) return;
  const now = performance.now();
  const position = currentPlayerRenderPosition(now);
  marker.setAttribute("transform", "translate(" + position.x.toFixed(2) + " " + position.y.toFixed(2) + ")");
  const progress = playerRenderState.duration > 0 ? (now - playerRenderState.startedAt) / playerRenderState.duration : 1;
  if (progress < 1) playerAnimationFrame = requestAnimationFrame(animatePlayerMarker);
  else {
    playerRenderState.startX = playerRenderState.targetX;
    playerRenderState.startY = playerRenderState.targetY;
    playerRenderState.duration = 0;
  }
}
function updatePlayerMarker(duration = 120) {
  const marker = $("worldMapCanvas").querySelector(".map-player-marker");
  const map = getSelectedMap();
  if (!marker || !map || playerPosition?.mapId !== map.id) return;
  const now = performance.now();
  let current = currentPlayerRenderPosition(now);
  if (!playerRenderState || playerRenderState.mapId !== map.id) current = { x: playerPosition.x, y: playerPosition.y };
  playerRenderState = { mapId: map.id, startX: current.x, startY: current.y, targetX: playerPosition.x, targetY: playerPosition.y, startedAt: now, duration: Math.max(0, duration) };
  if (playerAnimationFrame) cancelAnimationFrame(playerAnimationFrame);
  playerAnimationFrame = 0;
  if (duration <= 0) {
    marker.setAttribute("transform", "translate(" + playerPosition.x + " " + playerPosition.y + ")");
    playerRenderState.startX = playerPosition.x;
    playerRenderState.startY = playerPosition.y;
    playerRenderState.duration = 0;
  } else playerAnimationFrame = requestAnimationFrame(animatePlayerMarker);
}
function finishMovement(runId, result) {
  if (!movementResolve || movementResolveRunId !== runId) return;
  const resolve = movementResolve;
  movementResolve = null;
  movementResolveRunId = 0;
  resolve(result);
}
function connectMovementSocket() {
  if (!token || movementSocket) return;
  const url = (location.protocol === "https:" ? "wss://" : "ws://") + location.host + "/api/world/movement";
  const socket = new WebSocket(url);
  movementSocket = socket;
  socket.addEventListener("open", () => {
    if (socket !== movementSocket || !token) return socket.close();
    socket.send(JSON.stringify({ type: "auth", token }));
  });
  socket.addEventListener("message", event => {
    if (socket !== movementSocket) return;
    let message;
    try { message = JSON.parse(event.data); } catch (_) { return; }
    if (message.type === "ready") {
      movementSocketReady = true;
      if (moveTarget && movementResolve && movementResolveRunId === movementRunId) socket.send(JSON.stringify({ type: "move", ...moveTarget, moveId: movementRunId }));
      $("worldMapHint").textContent = "Movimiento continuo conectado · el servidor valida la posición.";
      return;
    }
    if (message.type === "position" && message.position) {
      if (message.position.mapId !== playerPosition?.mapId) return;
      const previous = playerPosition ? { x: playerPosition.x, y: playerPosition.y } : null;
      playerPosition = message.position;
      updatePlayerMarker(110);
      if (selectedSpawnId) selectSpawn(selectedSpawnId);
      else $("worldMapHint").textContent = "Posición: " + playerPosition.x + ", " + playerPosition.y + ".";
      const runId = movementRunId;
      if (message.moveId !== runId) return;
      if (message.reachedTarget) {
        moveTarget = null;
        finishMovement(runId, true);
      } else if (message.blocked && previous && previous.x === playerPosition.x && previous.y === playerPosition.y) {
        moveTarget = null;
        finishMovement(runId, false);
      }
      return;
    }
    if (message.type === "error") {
      if (movementResolve) {
        const runId = movementResolveRunId;
        moveTarget = null;
        finishMovement(runId, false);
      }
      $("worldMapHint").textContent = message.error || "Movimiento interrumpido.";
    }
  });
  socket.addEventListener("close", () => {
    if (socket !== movementSocket) return;
    movementSocket = null;
    movementSocketReady = false;
    if (movementResolve) finishMovement(movementResolveRunId, false);
    moveTarget = null;
    if (token) setTimeout(connectMovementSocket, 1500);
  });
  socket.addEventListener("error", () => {});
}
function cancelMovement() {
  movementRunId += 1;
  moveTarget = null;
  if (movementSocketReady && movementSocket?.readyState === WebSocket.OPEN) movementSocket.send(JSON.stringify({ type: "stop" }));
  if (movementResolve) finishMovement(movementResolveRunId, false);
}
function currentRemotePlayerPosition(state, now = performance.now()) {
  if (!state || state.duration <= 0) return { x: state?.targetX || 0, y: state?.targetY || 0 };
  const progress = Math.max(0, Math.min(1, (now - state.startedAt) / state.duration));
  return {
    x: state.startX + (state.targetX - state.startX) * progress,
    y: state.startY + (state.targetY - state.startY) * progress
  };
}
function updateRemotePlayerMarker(state, x, y) {
  state.element.setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ")");
}
function animateRemotePlayers() {
  worldPlayerAnimationFrame = 0;
  const now = performance.now();
  let stillAnimating = false;
  for (const state of worldPlayerRenderState.values()) {
    if (state.duration <= 0) continue;
    const progress = Math.max(0, Math.min(1, (now - state.startedAt) / state.duration));
    const x = state.startX + (state.targetX - state.startX) * progress;
    const y = state.startY + (state.targetY - state.startY) * progress;
    updateRemotePlayerMarker(state, x, y);
    if (progress >= 1) {
      state.duration = 0;
      state.startX = state.targetX;
      state.startY = state.targetY;
    } else {
      stillAnimating = true;
    }
  }
  if (stillAnimating) worldPlayerAnimationFrame = requestAnimationFrame(animateRemotePlayers);
}
function scheduleRemotePlayerAnimation() {
  if (!worldPlayerAnimationFrame) worldPlayerAnimationFrame = requestAnimationFrame(animateRemotePlayers);
}
function renderWorldPlayersOnMap() {
  const svg = $("worldMapCanvas").querySelector("svg");
  const map = getSelectedMap();
  if (!svg) return;
  let layer = svg.querySelector("[data-world-player-layer]");
  // renderWorldState may replace the SVG; discard detached elements and rebuild safely.
  if (layer && (layer.getAttribute("data-map-id") !== map?.id || !layer.isConnected)) {
    layer.remove();
    layer = null;
    worldPlayerRenderState.clear();
  }
  if (!map) {
    layer?.remove();
    worldPlayerRenderState.clear();
    return;
  }
  if (!layer) {
    layer = svgElement("g", {
      "data-world-player-layer": "true",
      "data-map-id": map.id,
      "aria-label": "Otros jugadores en este mapa"
    });
    svg.append(layer);
    worldPlayerRenderState.clear();
  }
  const visiblePlayers = worldPlayers.filter(entry => entry.mapId === map.id);
  const visibleNames = new Set(visiblePlayers.map(player => player.username));
  for (const [username, state] of worldPlayerRenderState) {
    if (visibleNames.has(username)) continue;
    state.element.remove();
    worldPlayerRenderState.delete(username);
  }
  const now = performance.now();
  for (const player of visiblePlayers) {
    let state = worldPlayerRenderState.get(player.username);
    if (!state || !state.element.isConnected) {
      const marker = svgElement("g", {
        class: "map-other-player-marker",
        transform: "translate(" + player.x + " " + player.y + ")",
        "aria-label": "Jugador " + player.username,
        "data-world-player": player.username
      });
      marker.append(
        svgElement("circle", { r: 25, fill: "#9d78d5", stroke: "#f4eaff", "stroke-width": 4 }),
        svgElement("text", { x: 0, y: 7, "text-anchor": "middle", "font-size": 22, fill: "#ffffff" }, "♟"),
        svgElement("text", { x: 0, y: 43, "text-anchor": "middle", "font-size": 20, class: "map-label" }, player.username)
      );
      layer.append(marker);
      state = {
        element: marker,
        startX: player.x, startY: player.y,
        targetX: player.x, targetY: player.y,
        startedAt: now, duration: 0
      };
      worldPlayerRenderState.set(player.username, state);
      continue;
    }
    // World re-renders can be triggered by enemy updates; do not restart a player
    // interpolation unless the authoritative player snapshot actually changed.
    if (state.targetX === player.x && state.targetY === player.y) continue;
    const current = currentRemotePlayerPosition(state, now);
    state.startX = current.x;
    state.startY = current.y;
    state.targetX = player.x;
    state.targetY = player.y;
    state.startedAt = now;
    // Interpolate presentation only. The server remains authoritative for coordinates.
    state.duration = Math.hypot(state.targetX - state.startX, state.targetY - state.startY) > 0 ? 2800 : 0;
    if (state.duration === 0) updateRemotePlayerMarker(state, state.targetX, state.targetY);
  }
  scheduleRemotePlayerAnimation();
}
async function refreshWorldPlayers() {
  if (!token || worldPlayersSyncInFlight || !currentMapId) return;
  worldPlayersSyncInFlight = true;
  const runId = worldPlayersRunId;
  const requestToken = token;
  const requestedMapId = currentMapId;
  try {
    const data = await api("/api/world/players?mapId=" + encodeURIComponent(requestedMapId));
    if (runId !== worldPlayersRunId || requestToken !== token || requestedMapId !== currentMapId) return;
    // Keep HTTP snapshots as a fallback and heartbeat; the independent SSE stream
    // takes over rendering as soon as it connects.
    if (!worldPlayersStreamConnected) {
      worldPlayers = Array.isArray(data.players)
        ? data.players.filter(player => player && player.mapId === requestedMapId &&
            Number.isSafeInteger(player.x) && Number.isSafeInteger(player.y) && typeof player.username === "string")
        : [];
      renderWorldPlayersOnMap();
    }
  } catch (_) {
    // Preserve the last known snapshot during a brief network interruption.
  } finally {
    if (runId === worldPlayersRunId) worldPlayersSyncInFlight = false;
  }
}
async function consumeWorldPlayersStream(runId, requestToken, requestedMapId, controller) {
  while (token === requestToken && runId === worldPlayersRunId && requestedMapId === currentMapId) {
    try {
      const response = await fetch("/api/world/players/stream?mapId=" + encodeURIComponent(requestedMapId), {
        headers: { Authorization: "Bearer " + requestToken },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok || !response.body) throw new Error("World player stream unavailable");
      worldPlayersStreamConnected = true;
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (token === requestToken && runId === worldPlayersRunId && requestedMapId === currentMapId) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const payload = frame.split("\n")
            .filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).trimStart())
            .join("\n");
          if (!payload) continue;
          try {
            const snapshot = JSON.parse(payload);
            if (snapshot.mapId !== requestedMapId || !Array.isArray(snapshot.players)) continue;
            worldPlayers = snapshot.players.filter(player => player && player.mapId === requestedMapId &&
              Number.isSafeInteger(player.x) && Number.isSafeInteger(player.y) && typeof player.username === "string");
            renderWorldPlayersOnMap();
          } catch (_) {}
        }
      }
      try { await reader.cancel(); } catch (_) {}
    } catch (_) {
      if (runId !== worldPlayersRunId || token !== requestToken || controller.signal.aborted) break;
    }
    if (runId === worldPlayersRunId) worldPlayersStreamConnected = false;
    if (token !== requestToken || runId !== worldPlayersRunId || requestedMapId !== currentMapId || controller.signal.aborted) break;
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
}
function startWorldPlayersSync() {
  if (worldPlayersTimer) clearInterval(worldPlayersTimer);
  if (worldPlayersStreamController) worldPlayersStreamController.abort();
  worldPlayersRunId += 1;
  worldPlayersSyncInFlight = false;
  worldPlayersStreamConnected = false;
  const runId = worldPlayersRunId;
  const requestToken = token;
  const requestedMapId = currentMapId;
  const controller = new AbortController();
  worldPlayersStreamController = controller;
  void refreshWorldPlayers();
  worldPlayersTimer = setInterval(() => { void refreshWorldPlayers(); }, 3000);
  if (requestToken && requestedMapId) void consumeWorldPlayersStream(runId, requestToken, requestedMapId, controller);
}
function stopWorldPlayersSync() {
  worldPlayersRunId += 1;
  if (worldPlayersTimer) clearInterval(worldPlayersTimer);
  worldPlayersTimer = null;
  if (worldPlayersStreamController) worldPlayersStreamController.abort();
  worldPlayersStreamController = null;
  worldPlayersStreamConnected = false;
  worldPlayers = [];
  if (worldPlayerAnimationFrame) cancelAnimationFrame(worldPlayerAnimationFrame);
  worldPlayerAnimationFrame = 0;
  for (const state of worldPlayerRenderState.values()) state.element.remove();
  worldPlayerRenderState.clear();
  worldPlayersSyncInFlight = false;
}
async function moveTo(x, y, mapId) {
  if (!token) return false;
  if (playerPosition?.mapId !== mapId) {
    $("worldMapHint").textContent = "Solo podés moverte en la zona donde está tu personaje. Usá un portal para viajar.";
    return false;
  }
  const map = worldData.maps.find(entry => entry.id === mapId);
  if (!map) return false;
  if (movementResolve) finishMovement(movementResolveRunId, false);
  moveTarget = { x: Math.max(0, Math.min(map.width, Math.round(x))), y: Math.max(0, Math.min(map.height, Math.round(y))), mapId };
  const runId = ++movementRunId;
  if (movementSocketReady && movementSocket?.readyState === WebSocket.OPEN) {
    return new Promise(resolve => {
      movementResolve = resolve;
      movementResolveRunId = runId;
      movementSocket.send(JSON.stringify({ type: "move", ...moveTarget, moveId: runId }));
    });
  }
  let reachedTarget = false;
  while (token && runId === movementRunId && moveTarget) {
    try {
      const data = await api("/api/game/action", "POST", { action: "move_player", ...moveTarget });
      if (runId !== movementRunId) break;
      const previousPosition = playerPosition ? { x: playerPosition.x, y: playerPosition.y } : null;
      playerPosition = data.state.position || playerPosition;
      updatePlayerMarker(180);
      if (selectedSpawnId) selectSpawn(selectedSpawnId);
      else $("worldMapHint").textContent = "Posición: " + playerPosition.x + ", " + playerPosition.y + ".";
      if (data.result?.reachedTarget) {
        moveTarget = null;
        reachedTarget = true;
        if (selectedSpawnId) selectSpawn(selectedSpawnId);
        break;
      }
      if (data.result?.blocked && previousPosition && previousPosition.x === playerPosition.x && previousPosition.y === playerPosition.y) {
        moveTarget = null;
        $("worldMapHint").textContent = "El camino está bloqueado. Tocá otro punto para rodear el obstáculo.";
        break;
      }
    } catch (error) {
      if (runId !== movementRunId) break;
      moveTarget = null;
      msg(error.message);
      $("worldMapHint").textContent = error.message;
      break;
    }
    await new Promise(resolve => setTimeout(resolve, 130));
  }
  return reachedTarget;
}

function closeNpcPanel() {
  $("npcPanel").classList.add("hidden");
}
function renderNpcPanel(npc, result) {
  const panel = $("npcPanel");
  $("npcTitle").textContent = result.npc?.name || npc.name;
  $("npcDialogue").textContent = result.dialogue || result.message || "El NPC no tiene nada más para decir.";
  const options = $("npcOptions");
  options.replaceChildren();
  if (Array.isArray(result.shop)) {
    for (const offer of result.shop) {
      const row = document.createElement("div");
      row.className = "npc-shop-row";
      const details = document.createElement("div");
      const title = document.createElement("strong");
      title.textContent = offer.name;
      const meta = document.createElement("p");
      const bonusText = Object.entries(offer.bonuses || {}).map(([stat, amount]) =>
        "+" + amount + " " + (stat === "attack" ? "Ataque" : stat === "maxHp" ? "Vida" : stat === "maxKi" ? "Ki" : stat)
      ).join(", ");
      meta.textContent = offer.price.toLocaleString("es-AR") + " oro · " + bonusText +
        " · requiere " + offer.requiredPower.toLocaleString("es-AR") + " Poder para equipar";
      details.append(title, meta);
      const buy = document.createElement("button");
      buy.textContent = "Comprar";
      buy.addEventListener("click", async () => {
        buy.disabled = true;
        try {
          await action("buy_item", null, null, null, { npcId: npc.npcId, itemId: offer.itemId });
          await openNpc(npc, false, false);
        } catch (error) {
          msg(error.message);
          buy.disabled = false;
        }
      });
      row.append(details, buy);
      options.append(row);
    }
  }
  if (Array.isArray(result.actions)) {
    for (const option of result.actions) {
      const button = document.createElement("button");
      button.className = option.id === "train" ? "" : "secondary";
      button.textContent = option.label;
      button.addEventListener("click", async () => {
        button.disabled = true;
        try {
          if (option.id === "train") {
            await action("npc_train", null, null, null, { npcId: npc.npcId });
          } else if (option.id === "maxHp" || option.id === "maxKi" || option.id === "attack") {
            await action("spend_potential", option.id, null, null, { npcId: npc.npcId });
          } else if (option.id === "mission_accept" || option.id === "mission_claim" || option.id === "mission_status") {
            await action(option.id, null, null, null, { npcId: npc.npcId, missionId: option.missionId });
          }
          await openNpc(npc, false, false);
        } catch (error) {
          msg(error.message);
          button.disabled = false;
        }
      });
      options.append(button);
    }
  }
  panel.classList.remove("hidden");
}
async function openNpc(npc, approach = true, announce = true) {
  if (!token) return;
  if (playerPosition?.mapId !== npc.mapId) {
    $("worldMapHint").textContent = "Tu personaje está en otra zona. Viajá usando un portal.";
    return;
  }
  if (approach && Math.hypot(playerPosition.x - npc.x, playerPosition.y - npc.y) > CLIENT_NPC_RANGE) {
    const map = worldData.maps.find(entry => entry.id === npc.mapId);
    const offset = playerPosition.x <= npc.x ? -65 : 65;
    const targetX = Math.max(20, Math.min(map?.width - 20 || npc.x, npc.x + offset));
    const reached = await moveTo(targetX, npc.y, npc.mapId);
    if (!reached) {
      $("worldMapHint").textContent = "No pudiste acercarte al NPC. Probá desde otro punto.";
      return;
    }
  }
  try {
    const data = await api("/api/game/action", "POST", { action: "npc_interact", npcId: npc.npcId });
    show({ username: currentUsername, state: data.state });
    renderNpcPanel(npc, data.result || {});
    if (announce) msg(data.result?.message || "Interacción completada.");
    $("worldMapHint").textContent = "Estás hablando con " + npc.name + ".";
  } catch (error) {
    msg(error.message);
    $("worldMapHint").textContent = error.message;
  }
}

async function usePortal(npc, map) {
  movementRunId += 1;
  moveTarget = null;
  if (playerPosition?.mapId !== map.id) {
    $("worldMapHint").textContent = "Tu personaje no está en esta zona.";
    return;
  }
  const targetMapId = map.connections.find(id => id !== map.id);
  if (!targetMapId) return msg("Este portal no tiene una zona conectada.");
  if (Math.hypot(playerPosition.x - npc.x, playerPosition.y - npc.y) > 85) {
    await moveTo(Math.min(map.width, npc.x + 40), npc.y, map.id);
  }
  if (playerPosition?.mapId !== map.id || Math.hypot(playerPosition.x - npc.x, playerPosition.y - npc.y) > 100) {
    $("worldMapHint").textContent = "No pudiste acercarte al portal; intentá tocarlo de nuevo.";
    return;
  }
  movementRunId += 1;
  moveTarget = null;
  await action("travel_map", null, null, null, { mapId: targetMapId });
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
      closeNpcPanel();
      currentMapId = entry.id;
      startWorldPlayersSync();
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
    role: "group",
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

  // Collision geometry is authored by the server and shared with its movement validator.
  for (const obstacle of (worldData.obstacles || []).filter(entry => entry.mapId === map.id)) {
    const shape = svgElement("g", { class: "map-obstacle", "aria-label": obstacle.name });
    if (obstacle.kind === "cliff") {
      shape.append(
        svgElement("rect", { x: obstacle.x, y: obstacle.y, width: obstacle.width, height: obstacle.height, rx: 16, fill: "#494c4b", stroke: "#a7aaa0", "stroke-width": 9 }),
        svgElement("path", { d: "M " + obstacle.x + " " + (obstacle.y + obstacle.height * .35) + " l 45 -18 l 35 30 l 55 -22 l 40 27 l 75 -17", fill: "none", stroke: "#858981", "stroke-width": 8, "stroke-linecap": "round" })
      );
    } else if (obstacle.kind === "ruins") {
      shape.append(
        svgElement("rect", { x: obstacle.x, y: obstacle.y, width: obstacle.width, height: obstacle.height, rx: 10, fill: "#746b58", stroke: "#c2b38b", "stroke-width": 8 }),
        svgElement("path", { d: "M " + (obstacle.x + 18) + " " + (obstacle.y + 15) + " h " + (obstacle.width - 36) + " M " + (obstacle.x + 18) + " " + (obstacle.y + 45) + " h " + (obstacle.width - 36), stroke: "#b9a77d", "stroke-width": 7 })
      );
    } else {
      shape.append(
        svgElement("rect", { x: obstacle.x, y: obstacle.y, width: obstacle.width, height: obstacle.height, rx: 28, fill: "#656b62", stroke: "#c0c4a7", "stroke-width": 8 }),
        svgElement("circle", { cx: obstacle.x + obstacle.width * .3, cy: obstacle.y + obstacle.height * .35, r: 22, fill: "#858a7a" }),
        svgElement("circle", { cx: obstacle.x + obstacle.width * .72, cy: obstacle.y + obstacle.height * .65, r: 28, fill: "#4d554d" })
      );
    }
    shape.append(svgElement("text", { x: obstacle.x + obstacle.width / 2, y: obstacle.y + obstacle.height + 26, "text-anchor": "middle", "font-size": 20, class: "map-label" }, obstacle.name));
    svg.append(shape);
  }

  const mapNpcs = worldData.npcs.filter(npc => npc.mapId === map.id);
  for (const npc of mapNpcs) {
    const marker = svgElement("g", { class: "map-npc-marker", transform: "translate(" + npc.x + " " + npc.y + ")", tabindex: 0, role: "button", "aria-label": "Interactuar con " + npc.name });
    marker.append(
      svgElement("circle", { r: 34, fill: "#202a3a", stroke: "#f0d18a", "stroke-width": 5 }),
      svgElement("text", { x: 0, y: 10, "text-anchor": "middle", "font-size": 31 }, npc.role === "travel" ? "↔" : npc.role === "equipment" ? "⚒" : "✦"),
      svgElement("text", { x: 0, y: 56, "text-anchor": "middle", "font-size": 24, class: "map-label" }, npc.name)
    );
    svg.append(marker);
    const interact = event => {
      event.stopPropagation();
      if (playerPosition?.mapId !== map.id) {
        $("worldMapHint").textContent = "Tu personaje no está en esta zona.";
        return;
      }
      if (npc.role === "travel") {
        usePortal(npc, map).catch(error => {
          msg(error.message);
          $("worldMapHint").textContent = error.message;
        });
      } else {
        openNpc(npc).catch(error => {
          msg(error.message);
          $("worldMapHint").textContent = error.message;
        });
      }
    };
    marker.addEventListener("click", interact);
    marker.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        interact(event);
      }
    });
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
    const choose = event => {
      event?.stopPropagation();
      selectSpawn(spawn.spawnId);
    };
    marker.addEventListener("click", choose);
    marker.addEventListener("keydown", event => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        choose(event);
      }
    });
    svg.append(marker);
  }
  if (playerPosition?.mapId === map.id) {
    const player = svgElement("g", { class: "map-player-marker", transform: "translate(" + playerPosition.x + " " + playerPosition.y + ")", "aria-label": "Tu personaje" });
    player.append(
      svgElement("circle", { r: 28, fill: "#4ca9e8", stroke: "#e1f5ff", "stroke-width": 5 }),
      svgElement("text", { x: 0, y: 8, "text-anchor": "middle", "font-size": 24 }, "♟"),
      svgElement("text", { x: 0, y: 48, "text-anchor": "middle", "font-size": 22, class: "map-label" }, currentUsername || "Vos")
    );
    svg.append(player);
  }
  svg.addEventListener("click", event => {
    if (playerPosition?.mapId !== map.id) {
      $("worldMapHint").textContent = "Estás viendo otra zona. Volvé al mapa de tu personaje o viajá usando un portal.";
      return;
    }
    const rect = svg.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const x = Math.round((event.clientX - rect.left) / rect.width * map.width);
    const y = Math.round((event.clientY - rect.top) / rect.height * map.height);
    moveTo(x, y, map.id);
  });
  canvas.append(svg);
  renderWorldPlayersOnMap();
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
function renderWorldState() {
  if (!worldData.maps.some(map => map.id === currentMapId)) currentMapId = worldData.maps.some(map => map.id === playerPosition?.mapId) ? playerPosition.mapId : (worldData.maps[0]?.id || "");
  if (!getSpawn(selectedSpawnId) || getSpawn(selectedSpawnId)?.mapId !== currentMapId) {
    selectedSpawnId = worldData.spawns.find(spawn => spawn.mapId === currentMapId)?.spawnId || "";
  }
  renderWorldMap();
  renderWorldSpawnList();
  selectSpawn(selectedSpawnId);
}
async function refreshWorldMobs() {
  if (!token) return;
  try {
    const data = await api("/api/world");
    worldData = {
      maps: Array.isArray(data.maps) ? data.maps : [],
      npcs: Array.isArray(data.npcs) ? data.npcs : [],
      obstacles: Array.isArray(data.obstacles) ? data.obstacles : [],
      spawns: Array.isArray(data.spawns) ? data.spawns : []
    };
    worldSignature = Number.isSafeInteger(data.signature) && data.signature >= 0 ? data.signature : 0;
    renderWorldState();
  } catch (_) {
    $("worldMapCanvas").textContent = "No se pudo actualizar el mapa. Probá con el botón Actualizar.";
  }
}
function applyWorldChanges(data) {
  if (!Number.isSafeInteger(data?.signature) || data.signature < worldSignature || !Array.isArray(data.changes)) return;
  worldSignature = data.signature;
  if (!data.changes.length) return;
  const byId = new Map(worldData.spawns.map(spawn => [spawn.spawnId, spawn]));
  for (const change of data.changes) {
    if (!change || typeof change.spawnId !== "string") continue;
    const previous = byId.get(change.spawnId);
    if (previous) byId.set(change.spawnId, { ...previous, ...change });
    else byId.set(change.spawnId, change);
  }
  worldData.spawns = Array.from(byId.values());
  renderWorldState();
}
async function syncWorldChanges() {
  if (!token || worldSyncInFlight) return;
  worldSyncInFlight = true;
  try {
    const data = await api("/api/world/changes?since=" + encodeURIComponent(String(worldSignature)));
    applyWorldChanges(data);
  } catch (_) {
    // A temporary network error is retried by the event stream reconnect loop.
  } finally {
    worldSyncInFlight = false;
  }
}
async function consumeWorldStream(runId, controller) {
  while (token && runId === worldStreamRunId) {
    try {
      const response = await fetch("/api/world/stream?since=" + encodeURIComponent(String(worldSignature)), {
        headers: { Authorization: "Bearer " + token },
        cache: "no-store",
        signal: controller.signal
      });
      if (!response.ok || !response.body) throw new Error("World event stream unavailable");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (token && runId === worldStreamRunId) {
        const chunk = await reader.read();
        if (chunk.done) break;
        buffer += decoder.decode(chunk.value, { stream: true }).replace(/\r\n/g, "\n");
        let boundary;
        while ((boundary = buffer.indexOf("\n\n")) !== -1) {
          const frame = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const payload = frame.split("\n")
            .filter(line => line.startsWith("data:"))
            .map(line => line.slice(5).trimStart())
            .join("\n");
          if (payload) {
            try { applyWorldChanges(JSON.parse(payload)); } catch (_) {}
          }
        }
      }
      try { await reader.cancel(); } catch (_) {}
    } catch (_) {
      if (runId !== worldStreamRunId || !token) break;
      await syncWorldChanges();
    }
    if (token && runId === worldStreamRunId) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
function startWorldSync() {
  if (worldStreamController) worldStreamController.abort();
  worldStreamRunId += 1;
  worldStreamController = new AbortController();
  void consumeWorldStream(worldStreamRunId, worldStreamController);
}function show(data) {
  const state = data.state;
  currentUsername = data.username || currentUsername || "Guerrero";
  playerPosition = state.position || playerPosition;
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
  const patrolKills = Math.min(state.missionProgress?.scoutPatrolKills || 0, 3);
  const patrol = state.missions?.scout_patrol || {};
  $("patrolKills").textContent = patrolKills + " / 3";
  $("patrolMissionStatus").textContent = patrol.claimed
    ? "Completada · recompensa reclamada"
    : patrol.accepted
      ? patrolKills >= 3 ? "Objetivo cumplido · hablá con el Maestro para reclamar" : "Aceptada · derrotá 3 Saibamen exploradores"
      : "Hablá con el Maestro para aceptar esta misión";
  const wildernessKills = Math.min(state.missionProgress?.wildernessPatrolKills || 0, 3);
  const wildernessMission = state.missions?.wilderness_patrol || {};
  $("wildernessKills").textContent = wildernessKills + " / 3";
  $("wildernessMissionStatus").textContent = wildernessMission.claimed
    ? "Completada · recompensa reclamada"
    : wildernessMission.accepted
      ? wildernessKills >= 3 ? "Objetivo cumplido · hablá con el Explorador para reclamar" : "Aceptada · derrotá 3 Saibamen en la Llanura salvaje"
      : state.power < 1000 ? "Requiere 1.000 de Poder. Hablá con el Explorador en la Llanura salvaje." : "Hablá con el Explorador para aceptar esta misión.";
  $("dummy").textContent = complete ? "🥋 Golpear muñeco · +1 Poder y Potencial" : "🥋 Golpear muñeco · misión " + Math.min(kills, 10) + "/10";
  renderInventory(state);
  updatePlayerMarker();
  if (selectedSpawnId && getSpawn(selectedSpawnId)) selectSpawn(selectedSpawnId);
  $("auth").classList.add("hidden");
  $("game").classList.remove("hidden");
}
async function auth(path) {
  const data = await api(path, "POST", { username: $("user").value, password: $("pass").value });
  token = data.token;
  currentUsername = data.username;
  show(await api("/api/me"));
  await refreshWorldMobs();
  startWorldSync();
  startWorldPlayersSync();
  connectMovementSocket();
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
    if (actionName === "travel_map" && data.state.position?.mapId) { cancelMovement(); currentMapId = data.state.position.mapId; }
    show({ username: currentUsername, state: data.state });
    if (actionName === "travel_map") { renderWorldState(); startWorldPlayersSync(); }
    await syncWorldChanges();
    const result = data.result || {};
    const reward = result.reward;
    let detail = "";
    if (reward) {
      detail = " · +" + reward.power + " Poder, +" + reward.potential + " Potencial";
      if (reward.gold) detail += ", +" + reward.gold + " oro";
      if (reward.gems) detail += ", +" + reward.gems + " gemas";
      if (reward.equipment?.length) detail += " · Equipo: " + reward.equipment.map(item => ITEM_LABELS[item.itemId] || item.itemId).join(", ");
      if (result.inventoryFullDrops?.length) detail += " · Inventario lleno: el equipo quedó guardado en botín pendiente";
    }
    if (result.mobMaxHp && result.mobMaxHp > 1) detail += " · Vida enemiga: " + result.mobHp + "/" + result.mobMaxHp;
    if (result.mobDefeated && result.respawnAt) detail += " · Reaparece en " + Math.max(1, Math.ceil((result.respawnAt - Date.now()) / 1000)) + " s";
    msg((result.message || "Acción completada.") + detail + " · Guardado en el servidor.");
  } finally {
    if (button) {
      if (buttonId === "attackSelectedSpawn") {
        const spawn = getSpawn(selectedSpawnId);
        button.disabled = !spawn || (spawn.hp <= 0 && spawn.respawnAt > Date.now());
      } else button.disabled = false;
    }
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
  stopWorldPlayersSync();
  cancelMovement();
  token = "";
  if (movementSocket) movementSocket.close(1000, "Logout");
  movementSocket = null;
  movementSocketReady = false;
  worldData = { maps: [], npcs: [], obstacles: [], spawns: [] }; worldSignature = 0; worldSyncInFlight = false; worldStreamRunId += 1; if (worldStreamController) worldStreamController.abort(); worldStreamController = null; currentMapId = ""; selectedSpawnId = ""; playerPosition = { mapId: "earth_training", x: 150, y: 420 }; playerRenderState = null; if (playerAnimationFrame) cancelAnimationFrame(playerAnimationFrame); playerAnimationFrame = 0; closeNpcPanel();
  $("game").classList.add("hidden"); $("auth").classList.remove("hidden"); $("pass").value = "";
  $("worldMapNav").replaceChildren(); $("worldMapCanvas").replaceChildren(); $("worldMobs").replaceChildren();
  msg("Sesión cerrada en este dispositivo.");
};
$("npcClose").onclick = closeNpcPanel;
fetch("/health").then(response => response.json()).then(data => msg(data.ok ? "Servidor conectado · base de datos " + data.database : "Servidor no disponible")).catch(() => msg("No se pudo contactar al servidor."));
