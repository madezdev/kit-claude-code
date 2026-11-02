#!/usr/bin/env node
/**
 * tamanio.js — Hook de tamaño de archivos para Claude Code (PreToolUse y PostToolUse).
 *
 * - PreToolUse (Write/Edit/MultiEdit): calcula cuántas líneas tendría el archivo y
 *   bloquea (exit 2) si pasa el máximo (600 en código, 800 en tests). El bloqueo
 *   se registra en jarvis-brain.
 * - PostToolUse: si el archivo pasa el aviso (400 en código, 600 en tests), le pide
 *   a Claude que lo divida (exit 2 → el mensaje le llega como feedback).
 *
 * Archivos legacy que ya eran grandes: solo cuenta si la edición los hizo crecer.
 * Límites por proyecto en .claude/limites.json (ver comun.js).
 */
const path = require("path");
const {
  LIMITES, EXT_CODIGO, raizDe, cargarLimites, esTest, ignorado, contarLineas, leerArchivo,
  contenidoResultante, cederAlProyecto, leerEntrada,
} = require("./comun.js");
const { registrarBloqueo } = require("./jarvis.js");

const COMO_DIVIDIR =
  "extraé subcomponentes, hooks, servicios, utilidades o tipos a archivos propios, sin cambiar el comportamiento " +
  "y manteniendo los exports públicos. Si es un refactor grande, delegalo al agente refactorizador.";

/**
 * { nivel: "aviso" | "bloqueo", limite } o null. `crecio` indica si la edición sumó líneas;
 * `raiz` es la del proyecto (los patrones de tests e ignorados se aplican relativos a ella).
 */
function evaluar(filePath, lineas, crecio, limites = LIMITES, raiz) {
  const l = { ...LIMITES, ...limites };
  if (!EXT_CODIGO.test(filePath) || ignorado(filePath, l, raiz) || !crecio) return null;
  const test = esTest(filePath, raiz);
  const aviso = test ? l.tests : l.codigo, maximo = test ? l.testsMax : l.codigoMax;
  if (lineas > maximo) return { nivel: "bloqueo", limite: maximo };
  if (lineas > aviso) return { nivel: "aviso", limite: aviso, maximo };
  return null;
}

function antesDeEscribir(data, limites, raiz) {
  const tool = data.tool_name, ti = data.tool_input || {};
  if (!ti.file_path || !["Write", "Edit", "MultiEdit"].includes(tool)) return 0;
  const actual = leerArchivo(ti.file_path);
  const nuevo = contenidoResultante(tool, ti, actual);
  if (nuevo == null) return 0;
  const lineas = contarLineas(nuevo);
  const r = evaluar(ti.file_path, lineas, lineas > contarLineas(actual), limites, raiz);
  if (r?.nivel !== "bloqueo") return 0;
  const motivo = `${path.basename(ti.file_path)} quedaría con ${lineas} líneas y el máximo es ${r.limite}.`;
  process.stderr.write(`🛑 Bloqueado por tamanio (max-lines): ${motivo}\nNo lo escribas así: dividilo antes, ${COMO_DIVIDIR}\n`);
  registrarBloqueo({ fuente: "tamanio", regla: "max-lines", motivo, data });
  return 2;
}

/** Si la edición ya hecha sumó líneas (Write: archivo completo, siempre se evalúa). */
function crecioCon(tool, ti) {
  if (tool === "Edit") return contarLineas(ti.new_string) > contarLineas(ti.old_string);
  if (tool !== "MultiEdit") return true;
  return (ti.edits || []).reduce((d, e) => d + contarLineas(e.new_string) - contarLineas(e.old_string), 0) > 0;
}

function despuesDeEscribir(data, limites, raiz) {
  const tool = data.tool_name, ti = data.tool_input || {};
  if (!ti.file_path || !["Write", "Edit", "MultiEdit"].includes(tool)) return 0;
  const contenido = leerArchivo(ti.file_path);
  if (contenido == null) return 0;
  const lineas = contarLineas(contenido);
  const r = evaluar(ti.file_path, lineas, crecioCon(tool, ti), limites, raiz);
  if (!r) return 0;
  const tope = r.nivel === "bloqueo" ? `pasa el máximo de ${r.limite}` : `pasa el aviso de ${r.limite}; se bloquea a partir de ${r.maximo}`;
  process.stderr.write(
    `📏 ${path.basename(ti.file_path)} tiene ${lineas} líneas (${tope}).\n` +
    `Dividilo antes de seguir: ${COMO_DIVIDIR} No sigas agregando código a este archivo.\n`
  );
  return 2;
}

module.exports = { evaluar };

if (require.main === module) {
  if (process.env.CLAUDE_GUARDIA_OFF === "1") process.exit(0);
  leerEntrada((data) => {
    if (cederAlProyecto(__filename, data.cwd)) process.exit(0);
    const archivo = (data.tool_input || {}).file_path;
    const raiz = (archivo && raizDe(path.dirname(archivo))) || process.env.CLAUDE_PROJECT_DIR || data.cwd;
    const evaluarCon = data.hook_event_name === "PreToolUse" ? antesDeEscribir : despuesDeEscribir;
    process.exit(evaluarCon(data, cargarLimites(raiz), raiz));
  });
}
