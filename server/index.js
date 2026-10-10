const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const { normalizeUsername, loadState, saveState, performAction } = require("./game-service");
const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
if (!JWT_SECRET || JWT_SECRET.length < 32) { console.error("FATAL: JWT_SECRET debe tener al menos 32 caracteres."); process.exit(1); }
if (!DATABASE_URL) { console.error("FATAL: DATABASE_URL es obligatoria."); process.exit(1); }
const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : false,
  max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000
});
const allowedOrigins = (process.env.CLIENT_ORIGIN || "").split(",").map(s => s.trim()).filter(Boolean);
app.disable("x-powered-by");
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({
  origin(origin, callback) {
    if (!origin || allowedOrigins.length === 0 || allowedOrigins.includes(origin)) return callback(null, true);
    return callback(new Error("Origen no autorizado por CORS."));
  },
  methods: ["GET", "POST"], allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json({ limit: "16kb" }));
app.use((_req, res, next) => { res.setHeader("Cache-Control", "no-store"); next(); });
app.use(express.static(path.join(__dirname, "..", "public")));
async function initializeDatabase() { await pool.query(fs.readFileSync(path.join(__dirname, "..", "db", "schema.sql"), "utf8")); }
function issueToken(account) {
  return jwt.sign({ sub: String(account.id), username: account.username }, JWT_SECRET, { expiresIn: "7d", issuer: "dragon-realm" });
}
function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  try {
    if (!header.startsWith("Bearer ")) throw new Error("missing token");
    req.user = jwt.verify(header.slice(7), JWT_SECRET, { issuer: "dragon-realm" }); next();
  } catch { res.status(401).json({ ok: false, error: "Sesión inválida o vencida." }); }
}
app.get("/health", async (_req, res) => {
  try { await pool.query("SELECT 1"); res.json({ ok: true, service: "dragon-realm-api", database: "connected" }); }
  catch { res.status(503).json({ ok: false, service: "dragon-realm-api", database: "unavailable" }); }
});
app.post("/api/auth/register", async (req, res, next) => {
  try {
    const username = normalizeUsername(req.body?.username);
    const password = String(req.body?.password || "");
    if (!/^[a-z0-9_]{3,20}$/.test(username)) return res.status(400).json({ ok:false, error:"Usuario: 3–20 caracteres, letras, números o _." });
    if (password.length < 10 || password.length > 72) return res.status(400).json({ ok:false, error:"La contraseña debe tener entre 10 y 72 caracteres." });
    const passwordHash = await bcrypt.hash(password, 12);
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const account = await client.query("INSERT INTO accounts (username,password_hash) VALUES ($1,$2) RETURNING id,username", [username,passwordHash]);
      await client.query("INSERT INTO characters (account_id) VALUES ($1)", [account.rows[0].id]);
      await client.query("COMMIT");
      res.status(201).json({ ok:true, token:issueToken(account.rows[0]), username, message:"Cuenta creada." });
    } catch (e) {
      await client.query("ROLLBACK");
      if (e.code === "23505") return res.status(409).json({ ok:false, error:"Ese usuario ya existe." });
      throw e;
    } finally { client.release(); }
  } catch (e) { next(e); }
});
app.post("/api/auth/login", async (req,res,next) => {
  try {
    const username = normalizeUsername(req.body?.username), password = String(req.body?.password || "");
    const found = await pool.query("SELECT id,username,password_hash FROM accounts WHERE username=$1",[username]);
    const account = found.rows[0];
    if (!account || !(await bcrypt.compare(password, account.password_hash))) return res.status(401).json({ok:false,error:"Usuario o contraseña incorrectos."});
    res.json({ok:true,token:issueToken(account),username:account.username});
  } catch(e) { next(e); }
});
app.get("/api/me",requireAuth,async(req,res,next)=>{
  try { res.json({ok:true,username:req.user.username,state:await loadState(pool,req.user.sub)}); } catch(e){next(e);}
});
app.post("/api/game/action",requireAuth,async(req,res,next)=>{
  const client=await pool.connect();
  try {
    await client.query("BEGIN");
    const found=await client.query("SELECT state FROM characters WHERE account_id=$1 FOR UPDATE",[req.user.sub]);
    if(!found.rowCount){await client.query("ROLLBACK");return res.status(404).json({ok:false,error:"Personaje no encontrado."});}
    const outcome=performAction(found.rows[0].state,req.body);
    await saveState(client,req.user.sub,outcome.state);
    await client.query("COMMIT"); res.json({ok:true,...outcome});
  } catch(e){await client.query("ROLLBACK").catch(()=>{});next(e);} finally{client.release();}
});
app.use((err,_req,res,_next)=>{
  const status=Number.isInteger(err.status)?err.status:500;
  if(status>=500) console.error(err);
  res.status(status).json({ok:false,error:status>=500?"Error interno del servidor.":err.message});
});
initializeDatabase().then(()=>app.listen(PORT,"0.0.0.0",()=>console.log("Dragon Realm API listening on "+PORT)))
  .catch(e=>{console.error("Database initialization failed:",e);process.exit(1);});
process.on("SIGTERM",async()=>{await pool.end();process.exit(0);});
