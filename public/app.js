const $ = id => document.getElementById(id);
let token = "";
let currentUsername = "";

async function api(path, method = "GET", body) {
  const headers = { "Content-Type": "application/json" };
  if (token) headers.Authorization = "Bearer " + token;
  const response = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Error(data.error || "Error " + response.status);
  return data;
}

function msg(text) {
  $("status").textContent = text;
}

function show(data) {
  const state = data.state;
  currentUsername = data.username || currentUsername || "Guerrero";
  $("welcome").textContent = "⚔️ " + currentUsername;
  $("power").textContent = state.power;
  $("potential").textContent = state.potential;
  $("hp").textContent = state.maxHp;
  $("ki").textContent = state.maxKi;
  $("attack").textContent = state.attack;
  $("gold").textContent = state.gold;
  const kills = state.missionProgress?.trainingDummyKills || 0;
  const complete = Boolean(state.missions?.training_dummy);
  $("dummyKills").textContent = Math.min(kills, 10) + " / 10";
  $("missionStatus").textContent = complete
    ? "Misión completada · recompensa reclamada"
    : "Derrotá 10 muñecos para obtener 50 Poder y 50 Potencial";
  $("dummy").textContent = complete
    ? "🥋 Golpear muñeco · +1 Poder y Potencial"
    : "🥋 Golpear muñeco · misión " + Math.min(kills, 10) + "/10";
  $("auth").classList.add("hidden");
  $("game").classList.remove("hidden");
}

async function auth(path) {
  const data = await api(path, "POST", {
    username: $("user").value,
    password: $("pass").value
  });
  token = data.token;
  currentUsername = data.username;
  show(await api("/api/me"));
  msg(data.message ? data.message + " Guardado en la nube." : "Sesión iniciada.");
}

async function action(actionName, stat, mobId, buttonId) {
  const button = buttonId ? $(buttonId) : null;
  if (button) button.disabled = true;
  try {
    const body = { action: actionName };
    if (stat) body.stat = stat;
    if (mobId) body.mobId = mobId;
    const data = await api("/api/game/action", "POST", body);
    show({ username: currentUsername, state: data.state });
    const reward = data.result.reward;
    const rewardText = reward
      ? " · +" + reward.power + " Poder, +" + reward.potential + " Potencial"
        + (reward.gold ? ", +" + reward.gold + " oro" : "")
        + (reward.gems ? ", +" + reward.gems + " gemas" : "")
      : "";
    msg(data.result.message + rewardText + " · Guardado en el servidor.");
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
  token = "";
  currentUsername = "";
  $("game").classList.add("hidden");
  $("auth").classList.remove("hidden");
  $("pass").value = "";
  msg("Sesión cerrada en este dispositivo.");
};

fetch("/health")
  .then(response => response.json())
  .then(data => msg(data.ok ? "Servidor conectado · base de datos " + data.database : "Servidor no disponible"))
  .catch(() => msg("No se pudo contactar al servidor."));
