#!/usr/bin/env node
/**
 * complejidad.js — Hook PreToolUse para Claude Code (Write/Edit/MultiEdit en JS/TS).
 *
 * Antes de escribir, lintea el contenido resultante con el ESLint del proyecto y
 * solo tres reglas: complexity, max-depth y max-lines-per-function (el tamaño del
 * archivo lo controla tamanio.js; en tests no cuentan las funciones largas).
 * Bloquea (exit 2) si la edición suma violaciones de alguna regla, el mismo
 * criterio que las supresiones de ESLint: el código viejo que ya violaba pasa
 * mientras no se agreguen violaciones nuevas. El bloqueo se registra en jarvis-brain.
 *
 * Sin ESLint (o sin parser de TypeScript para .ts/.tsx) en el proyecto, no hace nada.
 * Límites por proyecto en .claude/limites.json (ver comun.js).
 */
const path = require("path");
const { createRequire } = require("module");
const { execFileSync } = require("child_process");
const { EXT_JS, raizDe, cargarLimites, esTest, ignorado, leerArchivo, contenidoResultante, cederAlProyecto, leerEntrada } = require("./comun.js");
const { registrarBloqueos } = require("./jarvis.js");

const REGLAS = new Set(["complexity", "max-depth", "max-lines-per-function"]);

/** { Linter, parser } resueltos desde el directorio del archivo, o null si el proyecto no los tiene. */
function cargarLinter(filePath) {
  const req = createRequire(filePath);
  let Linter, parser = null;
  try { ({ Linter } = req("eslint")); } catch { return null; }
  try { parser = req("@typescript-eslint/parser"); } catch {
    try { parser = req("typescript-eslint").parser; } catch {}
  }
  if (!parser && /\.(ts|tsx|mts|cts)$/i.test(filePath)) return null;
  return { Linter, parser };
}

/** { fatal, mensajes }: si el texto no parsea, y las violaciones de las reglas del kit. */
function analizar({ Linter, parser }, texto, filePath, limites, raiz) {
  const rules = { complexity: ["error", limites.complejidad], "max-depth": ["error", limites.profundidad] };
  if (!esTest(filePath, raiz)) rules["max-lines-per-function"] = ["error", limites.lineasFuncion];
  const config = [{
    files: ["**/*.{ts,tsx,mts,cts,js,jsx,mjs,cjs}"], // "**/*" solo no hace que ESLint lintee el archivo
    languageOptions: { ecmaVersion: "latest", sourceType: "module", ...(parser && { parser }), parserOptions: { ecmaFeatures: { jsx: true } } },
    linterOptions: { reportUnusedDisableDirectives: "off" },
    rules,
  }];
  // configType "flat": ESLint 8 arranca en modo eslintrc y, sin esto, cada verify da un error de parseo
  const linter = new Linter({ cwd: path.dirname(filePath), configType: "flat" });
  const mensajes = linter.verify(texto, config, { filename: filePath });
  return { fatal: mensajes.some((m) => m.fatal), mensajes: mensajes.filter((m) => !m.fatal && REGLAS.has(m.ruleId)) };
}

/** Versión commiteada del archivo, o null (archivo nuevo o fuera de un repo). */
function enHead(filePath, raiz) {
  try {
    const rel = path.relative(raiz, filePath).replace(/\\/g, "/");
    return execFileSync("git", ["show", `HEAD:${rel}`], { cwd: raiz, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 });
  } catch {
    return null;
  }
}

/**
 * Violaciones de referencia: las del archivo antes de la edición. Si en disco no parsea (un Edit
 * anterior lo dejó roto), las de su versión en HEAD; si tampoco se puede, null (no se bloquea).
 */
function lineaBase(motor, antes, filePath, limites, raiz) {
  if (!antes) return [];
  const actual = analizar(motor, antes, filePath, limites, raiz);
  if (!actual.fatal) return actual.mensajes;
  const commiteado = raiz && enHead(filePath, raiz);
  const enGit = commiteado ? analizar(motor, commiteado, filePath, limites, raiz) : null;
  return enGit && !enGit.fatal ? enGit.mensajes : null;
}

const nombre = (m) => (m.message.match(/'([^']+)'/) || [])[1] || "";

/** De las violaciones de una regla, las que suman: las que no tienen par (por nombre de función) en `previas`. */
function sobrantes(ahora, previas) {
  const sobran = ahora.length - previas.length;
  if (sobran <= 0) return [];
  const pendientes = previas.map(nombre);
  const sinPar = ahora.filter((m) => {
    const i = pendientes.indexOf(nombre(m));
    if (i < 0) return true;
    pendientes.splice(i, 1);
    return false;
  });
  return (sinPar.length >= sobran ? sinPar : ahora).slice(-sobran);
}

/** Violaciones de `despues` que suman respecto de `antes`, regla por regla. */
function nuevasViolaciones(motor, antes, despues, filePath, limites, raiz) {
  const previas = lineaBase(motor, antes, filePath, limites, raiz);
  if (previas == null) return [];
  const ahora = analizar(motor, despues, filePath, limites, raiz).mensajes;
  return [...REGLAS].flatMap((r) => sobrantes(ahora.filter((m) => m.ruleId === r), previas.filter((m) => m.ruleId === r)));
}

/** Violaciones nuevas que traería la edición del hook, o [] si no aplica. */
function nuevasDe(data) {
  const tool = data.tool_name, ti = data.tool_input || {}, archivo = ti.file_path;
  if (!["Write", "Edit", "MultiEdit"].includes(tool) || !archivo || !EXT_JS.test(archivo)) return [];
  const raiz = raizDe(path.dirname(archivo)) || process.env.CLAUDE_PROJECT_DIR || data.cwd;
  const limites = cargarLimites(raiz);
  if (ignorado(archivo, limites, raiz)) return [];
  const actual = leerArchivo(archivo), nuevo = contenidoResultante(tool, ti, actual);
  const motor = nuevo == null ? null : cargarLinter(archivo);
  return motor ? nuevasViolaciones(motor, actual, nuevo, archivo, limites, raiz) : [];
}

function bloquear(nuevas, data) {
  const base = path.basename(data.tool_input.file_path);
  process.stderr.write(
    `🛑 Bloqueado por complejidad: la edición de ${base} agrega código que pasa los límites del proyecto:\n` +
    nuevas.map((m) => `  - línea ${m.line}: ${m.message} (${m.ruleId})`).join("\n") +
    `\nSimplificalo antes de escribir: extraé funciones con nombres que expliquen la intención, usá early returns ` +
    `y separá responsabilidades. No agregues eslint-disable para esquivarlo. Si estás dividiendo código viejo, ` +
    `cada función que pasa a un archivo nuevo tiene que cumplir los límites.\n`
  );
  const reglas = [...new Set(nuevas.map((m) => m.ruleId))];
  registrarBloqueos("complejidad", reglas.map((regla) => ({
    regla,
    motivo: `${base}: ${nuevas.filter((m) => m.ruleId === regla).map((m) => `línea ${m.line}`).join(", ")}`,
  })), data);
}

module.exports = { cargarLinter, nuevasViolaciones };

if (require.main === module) {
  if (process.env.CLAUDE_GUARDIA_OFF === "1") process.exit(0);
  leerEntrada((data) => {
    if (cederAlProyecto(__filename, data.cwd)) process.exit(0);
    const nuevas = nuevasDe(data);
    if (!nuevas.length) process.exit(0);
    bloquear(nuevas, data);
    process.exit(2);
  });
}
