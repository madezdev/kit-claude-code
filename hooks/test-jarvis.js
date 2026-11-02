#!/usr/bin/env node
// Corré: node test-jarvis.js   (escribe solo en directorios temporales)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { registrarBloqueo, registrarBloqueos, fechaLocal } = require("./jarvis.js");

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-jarvis-"));
const brain = path.join(tmp, "brain");
execFileSync("git", ["init", "-q", brain]);
const data = { cwd: brain, session_id: "abcd1234-sesion", hook_event_name: "PreToolUse" };
const leer = () => {
  const dir = path.join(brain, "lessons");
  return fs.existsSync(dir) ? fs.readdirSync(dir).flatMap((a) => fs.readFileSync(path.join(dir, a), "utf8").split("\n").filter(Boolean)) : [];
};
const con = (env, fn) => {
  const previo = { ...process.env };
  Object.assign(process.env, env);
  try { return fn(); } finally { for (const k of Object.keys(env)) if (k in previo) process.env[k] = previo[k]; else delete process.env[k]; }
};

let f = 0, total = 0;
const caso = (nombre, ok) => { total++; if (!ok) { f++; console.log("❌", nombre); } };

con({ JARVIS_BRAIN: brain }, () => {
  caso("registra con un brain clonado", registrarBloqueo({ fuente: "guardia", regla: "push-rama-protegida", motivo: "Push directo", data }) === true);
  const [linea] = leer().map((l) => JSON.parse(l));
  caso("forma de la línea", linea && linea.session === data.session_id && linea.trigger === "PreToolUse" && linea.source === "guardia" &&
    linea.corrections[0].category === "bloqueo" && linea.corrections[0].rule === "push-rama-protegida");
  caso("fecha como capture.sh", /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}[+-]\d{4}$/.test(linea?.date || ""));
  caso("archivo del día local", fs.existsSync(path.join(brain, "lessons", `${fechaLocal(new Date()).dia}.jsonl`)));
  caso("motivo recortado", (registrarBloqueo({ fuente: "x", regla: "y", motivo: "a".repeat(1000), data }), JSON.parse(leer().pop()).corrections[0].why.length === 300));

  const lock = path.join(brain, ".git", "jarvis-capture.lock");
  fs.mkdirSync(lock);
  const viejo = (Date.now() - 11 * 60000) / 1000;
  fs.utimesSync(lock, viejo, viejo);
  caso("libera un lock abandonado", registrarBloqueo({ fuente: "x", regla: "z", motivo: "m", data }) === true && !fs.existsSync(lock));

  // capture.sh tiene el lock: el bloqueo queda pendiente y sale con la escritura siguiente
  const antes = leer().length;
  fs.mkdirSync(lock);
  caso("con el lock tomado no escribe en lessons/", registrarBloqueo({ fuente: "x", regla: "pendiente", motivo: "m", data }) === false && leer().length === antes);
  fs.rmdirSync(lock);
  registrarBloqueos("x", [{ regla: "a", motivo: "m" }, { regla: "b", motivo: "m" }], data);
  const reglas = leer().slice(antes).map((l) => JSON.parse(l).corrections[0].rule);
  caso("el pendiente sale con la escritura siguiente, en orden", reglas.join() === "pendiente,a,b");
  caso("no quedan pendientes", !fs.existsSync(path.join(brain, ".git", "jarvis-bloqueos-pendientes.jsonl")));
});
con({ JARVIS_BRAIN: brain, JARVIS_OFF: "1" }, () => caso("JARVIS_OFF no registra", registrarBloqueo({ fuente: "x", regla: "y", motivo: "m", data }) === false));
con({ JARVIS_BRAIN: brain, JARVIS_CAPTURE: "1" }, () => caso("dentro de capture.sh no registra", registrarBloqueo({ fuente: "x", regla: "y", motivo: "m", data }) === false));
con({ JARVIS_BRAIN: path.join(tmp, "no-existe") }, () => caso("sin brain no hace nada", registrarBloqueo({ fuente: "x", regla: "y", motivo: "m", data }) === false));

fs.rmSync(tmp, { recursive: true, force: true });
console.log(f ? `${f} fallos` : `✅ ${total}/${total} casos OK`);
process.exit(f ? 1 : 0);
