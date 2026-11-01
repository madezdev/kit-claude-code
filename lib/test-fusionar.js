#!/usr/bin/env node
// Corré: node lib/test-fusionar.js   (después de tocar fusionar.js)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");

const FUSIONAR = path.join(__dirname, "fusionar.js");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-fusionar-"));
const f = (nombre) => path.join(tmp, nombre);
const correr = (...args) => spawnSync(process.execPath, [FUSIONAR, ...args], { encoding: "utf8" });
const leer = (nombre) => fs.readFileSync(f(nombre), "utf8");

let fallos = 0, total = 0;
function caso(nombre, ok) { total++; if (!ok) { fallos++; console.log("❌", nombre); } }

// bloque: conserva lo ajeno, es idempotente y copia el origen tal cual (incluidos los $)
fs.writeFileSync(f("origen.md"), "# Kit\nUsá $& y $1 tal cual.\n");
fs.writeFileSync(f("CLAUDE.md"), "## Engram Persistent Memory\nReglas propias.\n");
correr("bloque", f("CLAUDE.md"), f("origen.md"), "kit-claude-code");
const primera = leer("CLAUDE.md");
correr("bloque", f("CLAUDE.md"), f("origen.md"), "kit-claude-code");
const segunda = leer("CLAUDE.md");
caso("bloque: conserva el contenido ajeno", primera.includes("## Engram Persistent Memory\nReglas propias."));
caso("bloque: es idempotente", primera === segunda);
caso("bloque: no interpreta $ del origen", segunda.includes("Usá $& y $1 tal cual.") && segunda.split("kit-claude-code:inicio").length === 2);

// hooks: fusiona sin perder otras claves ni hooks ajenos, y sin duplicar los del kit
const ajeno = { matcher: "Bash", hooks: [{ type: "command", command: "node otro.js" }] };
fs.writeFileSync(f("settings.json"), JSON.stringify({ permissions: { allow: ["Bash(ls)"] }, hooks: { PreToolUse: [ajeno] } }));
correr("hooks", f("settings.json"), "/h");
correr("hooks", f("settings.json"), "/h");
const s = JSON.parse(leer("settings.json"));
const comandos = s.hooks.PreToolUse.map((e) => e.hooks[0].command);
caso("hooks: conserva otras claves", s.permissions.allow[0] === "Bash(ls)");
caso("hooks: conserva hooks ajenos", comandos.includes("node otro.js"));
caso("hooks: no duplica la guardia", comandos.filter((c) => c.includes("guardia.js")).length === 1);

// hooks: settings.json inválido → falla sin pisarlo
const roto = '{ "permissions": { "allow": [] }, }';
fs.writeFileSync(f("roto.json"), roto);
const r = correr("hooks", f("roto.json"), "/h");
caso("hooks: falla con JSON inválido", r.status !== 0);
caso("hooks: no pisa el JSON inválido", leer("roto.json") === roto);
caso("validar: falla con JSON inválido", correr("validar", f("roto.json")).status !== 0);
caso("validar: acepta un settings.json inexistente", correr("validar", f("no-existe.json")).status === 0 && !fs.existsSync(f("no-existe.json")));

// hooks: settings.json inexistente → lo crea
correr("hooks", f("nuevo.json"), "/h");
caso("hooks: crea settings.json si no existe", JSON.parse(leer("nuevo.json")).hooks.PostToolUse.length === 1);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} fallos de ${total}` : `✅ ${total}/${total} casos OK`);
process.exit(fallos ? 1 : 0);
