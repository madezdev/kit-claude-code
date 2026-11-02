#!/usr/bin/env node
/**
 * pre-pr.js — Hook PreToolUse: corre los chequeos del kit antes de que el código salga de
 * la máquina y, si alguno falla, bloquea (exit 2) y registra el bloqueo en jarvis-brain.
 * - Al abrir un PR (`gh pr create|new`, `gh api …/pulls` con POST, `az repos pr create` o
 *   una herramienta MCP …create_pull_request):
 *     .claude/checks/seguridad.sh  pnpm audit, Semgrep y gitleaks
 *     .claude/checks/lint-cambios.js  ESLint del proyecto sobre lo commiteado
 * - En cada `git push`: solo gitleaks (seguridad.sh --solo-secretos), para que un secreto
 *   no llegue al remoto.
 * Si el mismo comando commitea y publica (push o PR), pide commitear antes, en un comando
 * aparte: el hook corre antes del comando y no puede revisar un commit que todavía no existe.
 * Con cualquier otro comando no hace nada.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync } = require("child_process");
const { raizDe, cederAlProyecto, leerEntrada, segmentos, tokens } = require("./comun.js");
const { registrarBloqueos } = require("./jarvis.js");

// Menos que los 600 s del hook: si Claude Code lo corta por tiempo, el PR pasaría.
const SEGUNDOS = { seguridad: 400, lint: 150, secretos: 90 };

/** Valor de una opción (`--base develop` o `--base=develop`); "" si no está. */
function valorDe(args, opciones) {
  for (let i = 0; i < args.length; i++) {
    const [op, igual] = args[i].split(/=(.*)/s);
    if (opciones.includes(op)) return (igual ?? args[i + 1] ?? "").replace(/^refs\/heads\//, "");
  }
  return "";
}

const es = (token, programa) => new RegExp(`(^|/)${programa}$`).test(token || "");

/** `gh api …/pulls` que crea un PR: con -X/--method POST o con campos (-f/-F, que gh manda por POST). */
function baseDeGhApi(args) {
  if (!/\/pulls\/?$/.test(args[0] || "")) return null;
  const metodo = valorDe(args, ["-X", "--method"]).toUpperCase();
  const campos = args.filter((a, i) => ["-f", "-F", "--field", "--raw-field"].includes(args[i - 1]));
  if (metodo !== "POST" && !(campos.length && !metodo)) return null;
  return (campos.find((c) => c.startsWith("base=")) || "").slice(5);
}

/** Base del PR si los tokens de gh (desde el índice `gh`, salteando -R/--repo) crean uno; null si no. */
function baseDeGh(t, gh) {
  let i = gh + 1;
  while (/^(-R|--repo)(=|$)/.test(t[i] || "")) i += t[i].includes("=") ? 1 : 2;
  if (t[i] === "api") return baseDeGhApi(t.slice(i + 1));
  const args = t.slice(i + 2);
  if (t[i] !== "pr" || !["create", "new"].includes(t[i + 1]) || args.some((a) => a === "--help" || a === "-h")) return null;
  return valorDe(args, ["--base", "-B"]);
}

/** Base del PR si los tokens de un segmento crean uno con gh o az; null si no. */
function baseDelSegmento(t) {
  const gh = t.findIndex((x) => es(x, "gh")), az = t.findIndex((x) => es(x, "az"));
  if (az >= 0 && t.slice(az + 1, az + 4).join(" ") === "repos pr create") return valorDe(t.slice(az + 4), ["--target-branch", "-t"]);
  return gh < 0 ? null : baseDeGh(t, gh);
}

/** Subcomando de git del segmento (salteando -C <ruta>, -c <clave=valor> y otras opciones), o null. */
function subcomandoGit(t) {
  let i = t.findIndex((x) => es(x, "git"));
  if (i < 0) return null;
  for (i++; t[i]?.startsWith("-"); i++) if (["-C", "-c", "--git-dir", "--work-tree", "--namespace"].includes(t[i])) i++;
  return t[i] || null;
}

/** Comando de `bash -c "…"` (o sh/zsh), para analizarlo también. */
function anidado(t) {
  const c = t.indexOf("-c");
  return c > 0 && ["bash", "sh", "zsh"].some((p) => es(t[c - 1], p)) ? t[c + 1] || "" : null;
}

/** Qué hace un comando de Bash: { pr: base | null, push, commit }. */
function analizarComando(cmd, r = { pr: null, push: false, commit: false }) {
  for (const segmento of segmentos(cmd)) {
    const t = tokens(segmento), interno = anidado(t);
    if (interno != null) { analizarComando(interno, r); continue; }
    const base = baseDelSegmento(t), sub = subcomandoGit(t);
    if (base != null && r.pr == null) r.pr = base;
    r.push ||= sub === "push";
    r.commit ||= sub === "commit";
  }
  return r;
}

function accionDe(tool, ti) {
  if (/create_pull_request/i.test(tool)) return { pr: ti.base || "", push: false, commit: false };
  return tool === "Bash" ? analizarComando(ti.command || "") : { pr: null, push: false };
}

function correr(comando, args, raiz, segundos) {
  const r = spawnSync(comando, args, { cwd: raiz, encoding: "utf8", timeout: segundos * 1000 });
  const salida = `${r.stdout || ""}${r.stderr || ""}`.trim();
  return { ok: r.status === 0, salida: r.error ? `${salida}\n(no terminó en ${segundos} s: ${r.error.code || r.error.message})` : salida };
}

/** Fallas de seguridad.sh: un { regla, motivo } por cada chequeo de KIT_FALLAN. */
function fallasDeSeguridad(s) {
  if (s.ok) return [];
  const ids = (s.salida.match(/^KIT_FALLAN=(.*)$/m) || [])[1];
  return (ids ? ids.split(",") : ["seguridad"]).map((regla) => ({
    regla,
    motivo: (s.salida.match(new RegExp(`^✗ ${regla}: (.*)$`, "m")) || [])[1] || "falló el chequeo",
  }));
}

/** Corre los chequeos que tocan: { fallas: [{ regla, motivo }], salida }. */
function chequear(raiz, accion) {
  const propios = path.join(raiz, ".claude", "checks");
  const checks = fs.existsSync(propios) ? propios : path.join(__dirname, "..", "checks");
  const seguridad = path.join(checks, "seguridad.sh"), lint = path.join(checks, "lint-cambios.js");
  if (accion.pr == null) {
    const s = fs.existsSync(seguridad) ? correr("bash", [seguridad, "--solo-secretos"], raiz, SEGUNDOS.secretos) : { ok: true, salida: "" };
    return { fallas: fallasDeSeguridad(s), salida: s.salida };
  }
  const fallas = [], salidas = [];
  if (fs.existsSync(seguridad)) {
    const s = correr("bash", [seguridad, accion.pr], raiz, SEGUNDOS.seguridad);
    salidas.push(s.salida);
    fallas.push(...fallasDeSeguridad(s));
  }
  if (fs.existsSync(lint)) {
    const l = correr(process.execPath, [lint, accion.pr], raiz, SEGUNDOS.lint);
    salidas.push(l.salida);
    if (!l.ok) fallas.push({ regla: "eslint", motivo: "errores de ESLint en los archivos cambiados" });
  }
  return { fallas, salida: salidas.join("\n") };
}

function bloquear(fallas, salida, que, data) {
  const log = path.join(os.tmpdir(), `kit-pre-pr-${(data.session_id || "sesion").slice(0, 8)}.log`);
  try { fs.writeFileSync(log, salida + "\n"); } catch {}
  process.stderr.write(
    `🛑 ${que} bloqueado por los chequeos del kit (${fallas.map((f) => f.regla).join(", ")}):\n` +
    `${salida.split("\n").filter((l) => !l.startsWith("KIT_FALLAN=")).slice(-80).join("\n")}\n` +
    `Corregí lo que falla, commiteá y volvé a intentar.${salida ? ` Salida completa: ${log}` : ""}\n`
  );
  registrarBloqueos("pre-pr", fallas, data);
}

const SIN_COMMITEAR = {
  regla: "publicar-sin-commitear",
  motivo: "Commiteá en un comando aparte y después pusheá o abrí el PR: los chequeos revisan lo commiteado.",
};

/** Qué bloquear en esta llamada ({ fallas, salida, que }), o null si pasa. */
function revisar(data) {
  const accion = accionDe(data.tool_name || "", data.tool_input || {});
  if (accion.pr == null && !accion.push) return null;
  const raiz = raizDe(data.cwd || process.env.CLAUDE_PROJECT_DIR);
  if (!raiz) return null;
  const que = accion.pr != null ? "PR" : "Push";
  if (accion.commit) return { fallas: [SIN_COMMITEAR], salida: SIN_COMMITEAR.motivo, que };
  const { fallas, salida } = chequear(raiz, accion);
  return fallas.length ? { fallas, salida, que } : null;
}

module.exports = { accionDe };

if (require.main === module) {
  if (process.env.CLAUDE_GUARDIA_OFF === "1") process.exit(0);
  leerEntrada((data) => {
    if (cederAlProyecto(__filename, data.cwd)) process.exit(0);
    const r = revisar(data);
    if (!r) process.exit(0);
    bloquear(r.fallas, r.salida, r.que, data);
    process.exit(2);
  });
}
