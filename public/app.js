const $=id=>document.getElementById(id);let token="";
async function api(path,method="GET",body){const headers={"Content-Type":"application/json"};if(token)headers.Authorization="Bearer "+token;const r=await fetch(path,{method,headers,body:body?JSON.stringify(body):undefined});const d=await r.json().catch(()=>({}));if(!r.ok)throw Error(d.error||"Error "+r.status);return d}
function msg(s){$("status").textContent=s}
function show(d){const s=d.state;$("welcome").textContent="⚔️ "+d.username;$("power").textContent=s.power;$("potential").textContent=s.potential;$("hp").textContent=s.maxHp;$("ki").textContent=s.maxKi;$("attack").textContent=s.attack;$("gold").textContent=s.gold;$("auth").classList.add("hidden");$("game").classList.remove("hidden");msg("Sesión activa. Progreso cargado desde el servidor.")}
async function auth(path){const d=await api(path,"POST",{username:$("user").value,password:$("pass").value});token=d.token;show(await api("/api/me"));if(d.message)msg(d.message+" Guardado en la nube.")}
async function action(action,stat){const body={action};if(stat)body.stat=stat;const d=await api("/api/game/action","POST",body);show({username:$("welcome").textContent.replace("⚔️ ",""),state:d.state});msg(d.result.message+" Progreso guardado.")}
$("register").onclick=()=>auth("/api/auth/register").catch(e=>msg(e.message));
$("login").onclick=()=>auth("/api/auth/login").catch(e=>msg(e.message));
$("dummy").onclick=()=>action("training_dummy").catch(e=>msg(e.message));
$("uphp").onclick=()=>action("spend_potential","maxHp").catch(e=>msg(e.message));
$("upki").onclick=()=>action("spend_potential","maxKi").catch(e=>msg(e.message));
$("upatk").onclick=()=>action("spend_potential","attack").catch(e=>msg(e.message));
$("refresh").onclick=()=>api("/api/me").then(show).catch(e=>msg(e.message));
$("logout").onclick=()=>{token="";$("game").classList.add("hidden");$("auth").classList.remove("hidden");$("pass").value="";msg("Sesión cerrada en este dispositivo.")};
fetch("/health").then(r=>r.json()).then(d=>msg(d.ok?"Servidor conectado · base de datos "+d.database:"Servidor no disponible")).catch(()=>msg("No se pudo contactar al servidor."));
