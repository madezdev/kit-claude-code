#!/usr/bin/env node
// Corré: node test-guardia-tiempo.js
// Un hook que se pasa del timeout no bloquea: estos casos cuidan que la guardia termine rápido
// y que, si no termina, falle cerrada.
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { revisarBash, REGLAS_BASH } = require("./guardia.js");

let fallos = 0, total = 0;
const fallo = (...m) => { fallos++; console.log("❌", ...m); };
const ms = (f) => { const t = process.hrtime.bigint(); const r = f(); return [Number(process.hrtime.bigint() - t) / 1e6, r]; };
const PROTEGIDA = ["ma", "in"].join("");
const RELLENO_RM = "echo rm -" + "rf".repeat(2400) + " x";

// 1. El comando que tardaba 15 s (push a una rama protegida tapado por un flag de rm larguísimo).
total++;
const [tPush, rPush] = ms(() => revisarBash(`git push origin ${PROTEGIDA}; ${RELLENO_RM}`, { cwd: "/tmp", rama: "feat/x", ramaEn: () => null }));
if (!rPush || rPush.id !== "push-rama-protegida" || tPush > 200) fallo("push tapado:", tPush.toFixed(0), "ms", rPush && rPush.id);
total++;
const [tRm] = ms(() => revisarBash(RELLENO_RM));
if (tRm > 200) fallo("flag de rm largo:", tRm.toFixed(0), "ms");

// 2. Ninguna regex (re ni allow) se va a segundos con entradas adversarias largas.
const cabezas = ["", "rm -", "gh pr ", "git push ", "terraform ", "az ", "kubectl ", "psql "];
const piezas = ["rf", "-r", " -", "a", "a ", "--a", "/", "\"", "-", " ", "=a", "\\"];
for (const r of REGLAS_BASH) {
  for (const re of [r.re, r.allow].filter(Boolean)) {
    total++;
    let peor = 0;
    for (const c of cabezas) for (const p of piezas) peor = Math.max(peor, ms(() => re.test(c + p.repeat(Math.ceil(3000 / p.length)) + "\u0001"))[0]);
    if (peor > 100) fallo(`regex lenta en ${r.id}:`, peor.toFixed(0), "ms");
  }
}

// 3. El proceso real: un comando largo se revisa en el worker y, sin tiempo, se bloquea.
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "guardia-tiempo-"));
const correr = (command, env = {}) => spawnSync(process.execPath, [path.join(__dirname, "guardia.js")], {
  input: JSON.stringify({ tool_name: "Bash", cwd: tmp, tool_input: { command } }),
  env: { ...process.env, CLAUDE_GUARDIA_OFF: "", GUARDIA_LOG: path.join(tmp, "g.log"), JARVIS_BRAIN: path.join(tmp, "jb"), ...env },
  encoding: "utf8",
  timeout: 15000,
});
const largoInocuo = "echo " + "a".repeat(3000);
const casos = [
  ["largo inocuo pasa", correr(largoInocuo), 0, ""],
  ["largo con push protegido se bloquea", correr(`git push origin ${PROTEGIDA}; ${RELLENO_RM}`), 2, "push-rama-protegida"],
  ["sin presupuesto falla cerrada", correr(largoInocuo, { GUARDIA_PRESUPUESTO_MS: "1" }), 2, "guardia-sin-tiempo"],
  ["corto no usa el worker", correr("echo hola", { GUARDIA_PRESUPUESTO_MS: "1" }), 0, ""],
];
for (const [nombre, r, codigo, id] of casos) {
  total++;
  if (r.status !== codigo || (id && !r.stderr.includes(id))) fallo(`${nombre}: exit ${r.status}, esperaba ${codigo}`, r.stderr.slice(0, 200));
}
fs.rmSync(tmp, { recursive: true, force: true });

console.log(fallos ? `\n${fallos} fallos de ${total}` : `✅ ${total}/${total} casos OK`);
process.exit(fallos ? 1 : 0);
