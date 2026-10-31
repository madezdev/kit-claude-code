#!/usr/bin/env node
/**
 * tamanio.js — Hook PostToolUse para Claude Code.
 *
 * Después de cada Write/Edit, cuenta las líneas del archivo. Si un archivo de
 * código supera el límite, le avisa a Claude (exit 2 → el mensaje le llega
 * como feedback) para que lo divida en piezas más chicas.
 *
 * Archivos legacy que ya eran grandes: solo avisa si la edición los hizo crecer.
 *
 * Límites configurables por proyecto con un archivo .claude/limites.json:
 *   { "codigo": 400, "tests": 600, "ignorar": ["src/legacy/"] }
 */
const fs = require("fs");
const path = require("path");
const os = require("os");

const DEFAULTS = { codigo: 400, tests: 600, ignorar: [] };

const EXT_CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs|vue|svelte|py|go|rs|java|kt|cs|php|rb|swift|scss|css)$/i;
const ES_TEST = /(\.|_)(test|spec|e2e)\.\w+$|[\/\\](__tests__|tests?|e2e)[\/\\]/i;
const IGNORAR_SIEMPRE = /[\/\\](node_modules|dist|build|\.next|coverage|vendor|generated|__generated__|migrations?)[\/\\]|\.d\.ts$|\.min\.\w+$|\.(gen|generated)\.\w+$/i;

function cargarConfig(cwd) {
  try {
    const f = path.join(cwd || process.cwd(), ".claude", "limites.json");
    return { ...DEFAULTS, ...JSON.parse(fs.readFileSync(f, "utf8")) };
  } catch {
    return DEFAULTS;
  }
}

const contar = (txt) => (txt ? txt.replace(/\n$/, "").split("\n").length : 0);

/** Devuelve el mensaje de aviso o null. `crecio` indica si la edición sumó líneas. */
function evaluar(filePath, lineas, crecio, config = DEFAULTS) {
  const p = filePath.replace(/\\/g, "/");
  if (!EXT_CODIGO.test(p) || IGNORAR_SIEMPRE.test(p)) return null;
  if (config.ignorar.some((x) => p.includes(x))) return null;
  const limite = ES_TEST.test(p) ? config.tests : config.codigo;
  if (lineas <= limite || !crecio) return null;
  return (
    `📏 ${path.basename(p)} tiene ${lineas} líneas (límite ${limite}).\n` +
    `Dividilo antes de seguir: extraé subcomponentes, hooks, servicios, utilidades o tipos ` +
    `a archivos propios, sin cambiar el comportamiento y manteniendo los exports públicos. ` +
    `Si es un refactor grande, delegalo al agente refactorizador. No sigas agregando código a este archivo.`
  );
}

function cederAlProyecto(nombre, cwd) {
  const global = path.join(os.homedir(), ".claude", "hooks");
  if (path.resolve(__dirname) !== path.resolve(global)) return false;
  const proyecto = process.env.CLAUDE_PROJECT_DIR || cwd;
  if (!proyecto) return false;
  const local = path.join(proyecto, ".claude", "hooks", nombre);
  return path.resolve(local) !== path.resolve(__filename) && fs.existsSync(local);
}

module.exports = { evaluar };

if (require.main === module) {
  if (process.env.CLAUDE_GUARDIA_OFF === "1") process.exit(0);
  let input = "";
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => {
    let data;
    try { data = JSON.parse(input); } catch { process.exit(0); }
    if (cederAlProyecto("tamanio.js", data.cwd)) process.exit(0);
    const tool = data.tool_name;
    const ti = data.tool_input || {};
    const file = ti.file_path;
    if (!file || !["Write", "Edit", "MultiEdit"].includes(tool)) process.exit(0);

    let lineas;
    try { lineas = contar(fs.readFileSync(file, "utf8")); } catch { process.exit(0); }

    let crecio = true; // Write: archivo completo, siempre se evalúa
    if (tool === "Edit") crecio = contar(ti.new_string) > contar(ti.old_string);
    if (tool === "MultiEdit")
      crecio = (ti.edits || []).reduce((d, e) => d + contar(e.new_string) - contar(e.old_string), 0) > 0;

    const msg = evaluar(file, lineas, crecio, cargarConfig(data.cwd));
    if (msg) { process.stderr.write(msg + "\n"); process.exit(2); }
    process.exit(0);
  });
}
