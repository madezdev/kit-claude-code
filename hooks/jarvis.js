/**
 * jarvis.js — Registra cada bloqueo de un hook en jarvis-brain, como una línea de
 * lessons/AAAA-MM-DD.jsonl con category "bloqueo" (la procesa la routine nocturna).
 *
 * Solo guarda la regla y el motivo, nunca el comando ni el contenido: lessons/ se
 * commitea y se pushea. Sin jarvis-brain clonado no hace nada, y un error acá
 * nunca cambia el resultado del hook.
 *   JARVIS_BRAIN: ruta del repo (por defecto ~/jarvis-brain) · JARVIS_OFF=1: no registra
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const p2 = (n) => String(n).padStart(2, "0");

/** Fecha local con offset, igual que `date +%FT%T%z` en capture.sh: 2026-11-01T16:08:18-0300 */
function fechaLocal(d) {
  const dia = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`;
  const off = -d.getTimezoneOffset(), abs = Math.abs(off);
  const zona = `${off >= 0 ? "+" : "-"}${p2(Math.floor(abs / 60))}${p2(abs % 60)}`;
  return { dia, iso: `${dia}T${p2(d.getHours())}:${p2(d.getMinutes())}:${p2(d.getSeconds())}${zona}` };
}

/** Nombre del proyecto como lo arma capture.sh (funciona también dentro de un worktree). */
function proyecto(cwd) {
  try {
    const comun = execFileSync("git", ["-C", cwd, "rev-parse", "--path-format=absolute", "--git-common-dir"],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim();
    return comun.endsWith("/.git") ? path.basename(path.dirname(comun)) : path.basename(comun, ".git");
  } catch {
    return path.basename(cwd || "desconocido");
  }
}

/** Mismo lock que capture.sh (un directorio). Uno de más de 10 minutos es de un proceso que murió. */
function tomarLock(dir, ms) {
  const fin = Date.now() + ms;
  for (;;) {
    try { fs.mkdirSync(dir); return true; } catch {}
    try { if (Date.now() - fs.statSync(dir).mtimeMs > 600000) { fs.rmdirSync(dir); continue; } } catch {}
    if (Date.now() > fin) return false;
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
  }
}

/** Ruta de jarvis-brain si hay que registrar, o null (apagado, dentro de capture.sh o sin clonar). */
function brainActivo() {
  if (process.env.JARVIS_CAPTURE === "1" || process.env.JARVIS_OFF === "1") return null;
  const brain = process.env.JARVIS_BRAIN || path.join(os.homedir(), "jarvis-brain");
  return fs.existsSync(path.join(brain, ".git")) ? brain : null;
}

/**
 * Escribe las líneas en lessons/ (cada una en el archivo de su día). Si capture.sh tiene el
 * lock (pull/push en curso), quedan pendientes dentro de .git y salen con la escritura siguiente.
 */
function escribirLineas(brain, entradas) {
  const lock = path.join(brain, ".git", "jarvis-capture.lock");
  const pendientes = path.join(brain, ".git", "jarvis-bloqueos-pendientes.jsonl");
  const lineas = entradas.map((e) => JSON.stringify(e) + "\n").join("");
  if (!tomarLock(lock, 1000)) {
    fs.appendFileSync(pendientes, lineas);
    return false;
  }
  try {
    const todas = (fs.existsSync(pendientes) ? fs.readFileSync(pendientes, "utf8") : "") + lineas;
    fs.mkdirSync(path.join(brain, "lessons"), { recursive: true });
    for (const linea of todas.split("\n").filter(Boolean)) {
      fs.appendFileSync(path.join(brain, "lessons", `${JSON.parse(linea).date.slice(0, 10)}.jsonl`), linea + "\n");
    }
    fs.rmSync(pendientes, { force: true });
  } finally {
    try { fs.rmdirSync(lock); } catch {}
  }
  return true;
}

/**
 * Registra los bloqueos de una ejecución del hook ({ regla, motivo }[]) con una sola toma del lock.
 * Devuelve true si llegaron a lessons/. `data` es la entrada del hook (cwd, session_id, hook_event_name).
 */
function registrarBloqueos(fuente, bloqueos, data = {}) {
  try {
    const brain = brainActivo();
    if (!brain || !bloqueos.length) return false;
    const { iso } = fechaLocal(new Date());
    const base = { date: iso, project: proyecto(data.cwd || process.cwd()), session: data.session_id || "", trigger: data.hook_event_name || "hook", source: fuente };
    return escribirLineas(brain, bloqueos.map(({ regla, motivo }) => ({
      ...base,
      summary: `Bloqueo de ${fuente}: ${regla}`,
      corrections: [{ what: `${fuente} bloqueó una acción del agente (${regla})`, why: String(motivo).slice(0, 300), rule: regla, category: "bloqueo" }],
    })));
  } catch {
    return false;
  }
}

const registrarBloqueo = ({ fuente, regla, motivo, data }) => registrarBloqueos(fuente, [{ regla, motivo }], data);

module.exports = { registrarBloqueo, registrarBloqueos, fechaLocal };
