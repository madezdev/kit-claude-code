/**
 * comun.js — Utilidades compartidas por los hooks del kit y por eslint.calidad.mjs:
 * límites por proyecto, contenido resultante de una edición y lectura de comandos.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

// Valores por defecto de .claude/limites.json. Los mismos límites aplican los hooks y ESLint.
const LIMITES = {
  codigo: 400, // aviso
  codigoMax: 600, // bloqueo
  tests: 600,
  testsMax: 800,
  complejidad: 10,
  profundidad: 4,
  lineasFuncion: 60,
  pnpmAudit: "bloqueo", // "aviso" mientras se resuelven las vulnerabilidades existentes
  ignorar: [],
};

const EXT_CODIGO = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|vue|svelte|py|go|rs|java|kt|cs|php|rb|swift|scss|css)$/i;
const EXT_JS = /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/i;
const ES_TEST = /(\.|_)(test|spec|e2e)\.\w+$|[\/\\](__tests__|tests?|e2e)[\/\\]/i;
// Equivalente de ES_TEST para ESLint, solo con extensiones JS/TS (un glob sin extensión haría lintear .json o .sql).
const EXT_GLOB = "{ts,tsx,mts,cts,js,jsx,mjs,cjs}";
const GLOBS_TEST = [`**/*.{test,spec,e2e}.${EXT_GLOB}`, `**/*_{test,spec,e2e}.${EXT_GLOB}`, `**/{__tests__,test,tests,e2e}/**/*.${EXT_GLOB}`];
const IGNORAR_SIEMPRE = /[\/\\](node_modules|dist|build|\.next|coverage|vendor|generated|__generated__|migrations?)[\/\\]|\.d\.ts$|\.min\.\w+$|\.(gen|generated)\.\w+$/i;

/** Raíz del repo git que contiene `desde` (directorio o archivo, aunque todavía no exista), o null. */
function raizDe(desde) {
  for (let d = path.resolve(desde || "."); ; d = path.dirname(d)) {
    if (fs.existsSync(path.join(d, ".git"))) return d;
    if (path.dirname(d) === d) return null;
  }
}

function cargarLimites(dir) {
  try {
    return { ...LIMITES, ...JSON.parse(fs.readFileSync(path.join(dir || process.cwd(), ".claude", "limites.json"), "utf8")) };
  } catch {
    return { ...LIMITES };
  }
}

/**
 * Ruta con "/" adelante y relativa a la raíz del proyecto si está adentro: así los patrones
 * (test/, build/, vendor/…) no matchean directorios de afuera del repo, como ~/test/mi-repo.
 */
function rutaEnProyecto(filePath, raiz) {
  const abs = path.resolve(filePath), r = raiz && path.resolve(raiz);
  const p = r && abs.startsWith(r + path.sep) ? path.relative(r, abs) : filePath;
  return `/${p.replace(/\\/g, "/").replace(/^\//, "")}`;
}

const esTest = (filePath, raiz) => ES_TEST.test(rutaEnProyecto(filePath, raiz));

/** true si los hooks de calidad no revisan este archivo (generados, dependencias o `ignorar` del proyecto). */
function ignorado(filePath, limites, raiz) {
  const p = rutaEnProyecto(filePath, raiz);
  return IGNORAR_SIEMPRE.test(p) || limites.ignorar.some((x) => p.includes(x));
}

const contarLineas = (txt) => (txt ? txt.replace(/\n$/, "").split("\n").length : 0);

function leerArchivo(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function edicionesDe(tool, ti) {
  if (tool === "Edit") return [ti];
  return tool === "MultiEdit" ? ti.edits || [] : null;
}

/** Aplica una edición; null si old_string no está (la edición va a fallar sola). */
function aplicar(s, e) {
  if (!e.old_string || !s.includes(e.old_string)) return null;
  return e.replace_all ? s.split(e.old_string).join(e.new_string) : s.replace(e.old_string, () => e.new_string);
}

/** Contenido que tendría el archivo después de Write/Edit/MultiEdit; null si no se puede calcular. */
function contenidoResultante(tool, ti, actual) {
  if (tool === "Write") return typeof ti.content === "string" ? ti.content : null;
  const edits = edicionesDe(tool, ti);
  if (!edits || actual == null) return null;
  let s = actual;
  for (const e of edits) {
    s = aplicar(s, e);
    if (s == null) return null;
  }
  return s;
}

/**
 * Si este hook es la copia global (~/.claude/hooks) y el proyecto trae la suya en
 * .claude/hooks, le cede el control a la del proyecto (evita que corra dos veces).
 */
function cederAlProyecto(archivoHook, cwd) {
  const global = path.join(os.homedir(), ".claude", "hooks");
  if (path.resolve(path.dirname(archivoHook)) !== path.resolve(global)) return false;
  const proyecto = process.env.CLAUDE_PROJECT_DIR || cwd;
  if (!proyecto) return false;
  const local = path.join(proyecto, ".claude", "hooks", path.basename(archivoHook));
  return path.resolve(local) !== path.resolve(archivoHook) && fs.existsSync(local);
}

/** Lee el JSON del hook por stdin. Con una entrada inválida, el hook no hace nada. */
function leerEntrada(alTerminar) {
  let input = "";
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => {
    let data;
    try { data = JSON.parse(input); } catch { process.exit(0); }
    alTerminar(data);
  });
}

/** Largo del separador de comandos que empieza en i: 2 para &&, || y $(; 1 para ; | & salto ( ) `; 0 si no hay. */
function separador(s, i) {
  const dos = s.slice(i, i + 2);
  if (dos === "&&" || dos === "||" || dos === "$(") return 2;
  if (s[i] === "&") return s[i - 1] === ">" || s[i + 1] === ">" ? 0 : 1; // 2>&1 y &> son redirecciones
  return ";|\n()`".includes(s[i]) ? 1 : 0;
}

/** Saca el cuerpo de los heredocs (<<EOF … EOF): es texto, no comandos. */
function sinHeredocs(cmd) {
  const out = [];
  let fin = null;
  for (const linea of cmd.split("\n")) {
    if (fin) {
      if (linea.trim() === fin) fin = null;
      continue;
    }
    out.push(linea);
    const m = linea.match(/(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_][\w-]*)\1/);
    if (m) fin = m[2];
  }
  return out.join("\n");
}

/** Comilla abierta después de leer c: abre con ' o ", cierra con la misma. */
const comillaTras = (comilla, c) => (comilla ? (c === comilla ? null : comilla) : c);

/** Parte un comando de shell en segmentos (&&, ||, ;, |, saltos de línea, subshells y $(...)) sin cortar dentro de comillas. */
function segmentos(cmd) {
  const s = sinHeredocs(cmd).replace(/\\\n/g, " "), out = [];
  let actual = "", comilla = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (comilla || c === "'" || c === '"') { comilla = comillaTras(comilla, c); actual += c; continue; }
    const largo = separador(s, i);
    if (!largo) { actual += c; continue; }
    out.push(actual);
    actual = "";
    i += largo - 1;
  }
  return [...out, actual];
}

/** Tokens de un segmento, sin comillas ni redirecciones (2>&1, > archivo, &>/dev/null). */
function tokens(segmento) {
  const crudos = segmento.match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g) || [];
  const t = [];
  for (let i = 0; i < crudos.length; i++) {
    if (/^(\d*>>?|&>>?|<)$/.test(crudos[i])) i++; // operador suelto: se saltea también su archivo
    else if (!/^(\d*>>?|&>>?|<|\d*>&)/.test(crudos[i])) t.push(crudos[i].replace(/['"]/g, ""));
  }
  return t;
}

module.exports = {
  LIMITES, EXT_CODIGO, EXT_JS, GLOBS_TEST, raizDe, cargarLimites, esTest, ignorado, contarLineas, leerArchivo,
  contenidoResultante, cederAlProyecto, leerEntrada, segmentos, tokens,
};
