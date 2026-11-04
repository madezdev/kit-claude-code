#!/usr/bin/env node
// kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar.
/**
 * Mide cuánto contexto consumen las sesiones de Claude Code de un proyecto, a partir de los
 * transcripts de ~/.claude/projects. Cada llamada al modelo relee todo el contexto de la
 * sesión, así que el costo lo dominan las sesiones largas: el reporte las pone arriba.
 *   node .claude/checks/consumo.js [--dias 7] [--proyecto <ruta>]
 * Sin --proyecto mide el directorio actual, con sus worktrees.
 */
const fs = require("fs");
const os = require("os");
const path = require("path");

const LLAMADAS_SESION_LARGA = 100;
const RESULTADO_GRANDE = 20000;

/** Carpeta de transcripts de una ruta: Claude Code cambia cada carácter no alfanumérico por "-". */
const carpetaDe = (ruta) => ruta.replace(/[^A-Za-z0-9]/g, "-");

/** Texto de un mensaje del usuario, si lo escribió él (no un recordatorio ni un resultado). */
function textoDe(contenido) {
  const bloques = typeof contenido === "string" ? [{ type: "text", text: contenido }] : contenido || [];
  const texto = bloques.find((b) => b.type === "text" && !b.text.startsWith("<"));
  return texto ? texto.text.replace(/\s+/g, " ").slice(0, 90) : null;
}

const largoDe = (c) => (typeof c === "string" ? c.length : JSON.stringify(c || "").length);

/** Suma una línea del transcript a la sesión `s`. */
function acumular(s, usos, d) {
  if (d.timestamp) {
    s.desde = s.desde || d.timestamp;
    s.hasta = d.timestamp;
  }
  const m = d.message || {};
  if (d.type === "assistant" && m.id && m.usage) usos.set(m.id, m.usage);
  if (d.type !== "user") return;
  s.primerPedido = s.primerPedido || textoDe(m.content);
  const resultados = Array.isArray(m.content) ? m.content.filter((b) => b.type === "tool_result") : [];
  s.resultadosGrandes += resultados.filter((b) => largoDe(b.content) > RESULTADO_GRANDE).length;
}

const contextoDe = (u) => (u.input_tokens || 0) + (u.cache_creation_input_tokens || 0) + (u.cache_read_input_tokens || 0);

function medirTranscript(archivo) {
  const usos = new Map(); // el mismo mensaje se repite en una línea por bloque: se cuenta una vez
  const s = { primerPedido: null, desde: null, hasta: null, resultadosGrandes: 0 };
  for (const linea of fs.readFileSync(archivo, "utf8").split("\n")) {
    try {
      acumular(s, usos, JSON.parse(linea));
    } catch {
      // línea vacía o cortada a mitad de escritura
    }
  }
  const contextos = [...usos.values()].map(contextoDe);
  return {
    ...s,
    llamadas: contextos.length,
    contexto: contextos.reduce((x, y) => x + y, 0),
    arranque: contextos[0] || 0,
    horas: s.desde ? (Date.parse(s.hasta) - Date.parse(s.desde)) / 36e5 : 0,
  };
}

function subagentesDe(dir) {
  const total = { cantidad: 0, contexto: 0 };
  if (!fs.existsSync(dir)) return total;
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".jsonl"))) {
    total.cantidad++;
    total.contexto += medirTranscript(path.join(dir, f)).contexto;
  }
  return total;
}

/** Sesiones del proyecto (y de sus worktrees) modificadas en los últimos `dias`. */
function medirProyecto(raiz, proyecto, dias) {
  const prefijo = carpetaDe(path.resolve(proyecto));
  const corte = Date.now() - dias * 864e5;
  const sesiones = [];
  for (const dir of fs.readdirSync(raiz)) {
    if (dir !== prefijo && !dir.startsWith(prefijo + "-")) continue;
    for (const f of fs.readdirSync(path.join(raiz, dir)).filter((f) => f.endsWith(".jsonl"))) {
      const archivo = path.join(raiz, dir, f);
      if (fs.statSync(archivo).mtimeMs < corte) continue;
      const sesion = medirTranscript(archivo);
      sesion.subagentes = subagentesDe(path.join(raiz, dir, f.slice(0, -6), "subagents"));
      sesiones.push(sesion);
    }
  }
  return sesiones.sort((a, b) => b.contexto + b.subagentes.contexto - a.contexto - a.subagentes.contexto);
}

function reporte(sesiones, dias) {
  const K = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1000)}K`);
  const pct = (a, b) => `${b ? Math.round((100 * a) / b) : 0}%`;
  const suma = (lista, f) => lista.reduce((a, s) => a + f(s), 0);
  const llamadas = suma(sesiones, (s) => s.llamadas);
  const contexto = suma(sesiones, (s) => s.contexto);
  const sub = suma(sesiones, (s) => s.subagentes.contexto);
  const largas = sesiones.filter((s) => s.llamadas > LLAMADAS_SESION_LARGA);
  const arranques = sesiones.map((s) => s.arranque).filter(Boolean).sort((a, b) => a - b);
  const lineas = [
    `${sesiones.length} sesiones en ${dias} días, ${llamadas} llamadas al modelo.`,
    `Contexto por llamada: ${K(contexto / (llamadas || 1))} de promedio; una sesión arranca en ${K(arranques[arranques.length >> 1] || 0)}.`,
    `Subagentes: ${sub ? pct(sub, sub + contexto) : "0%"} de los tokens de entrada.`,
    `Sesiones de más de ${LLAMADAS_SESION_LARGA} llamadas: ${largas.length}, con el ${pct(suma(largas, (s) => s.contexto), contexto)} de los tokens de entrada.`,
    `Resultados de herramientas de más de ${RESULTADO_GRANDE / 1000}K caracteres: ${suma(sesiones, (s) => s.resultadosGrandes)}.`,
    "",
    "Las 5 que más consumieron (tokens de entrada | llamadas | por llamada | horas | primer pedido):",
  ];
  for (const s of sesiones.slice(0, 5)) {
    lineas.push(`  ${K(s.contexto + s.subagentes.contexto)} | ${s.llamadas} | ${K(s.contexto / (s.llamadas || 1))} | ${s.horas.toFixed(1)} h | ${s.primerPedido || "-"}`);
  }
  return lineas;
}

if (require.main === module) {
  const opcion = (nombre, porDefecto) => {
    const i = process.argv.indexOf(nombre);
    return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : porDefecto;
  };
  const dias = Number(opcion("--dias", "7"));
  const sesiones = medirProyecto(path.join(os.homedir(), ".claude", "projects"), opcion("--proyecto", process.cwd()), dias);
  console.log(reporte(sesiones, dias).join("\n"));
}

module.exports = { carpetaDe, medirTranscript, medirProyecto, reporte };
