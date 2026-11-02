#!/usr/bin/env node
// kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar.
/**
 * ESLint, con la config del proyecto, sobre los archivos JS/TS cambiados respecto de la
 * rama base. Igual que el CI: cada archivo se lintea desde su paquete (el package.json
 * más cercano con un script "lint" que usa eslint) y solo si ese script lo cubre
 * (`eslint src/` no mira test/). Así también encuentra las supresiones de cada paquete.
 *   node .claude/checks/lint-cambios.js [rama-base]
 */
const fs = require("fs");
const path = require("path");
const { createRequire } = require("module");
const { execFileSync, spawnSync } = require("child_process");

const { segmentos, tokens } = require("../hooks/comun.js");

const git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
const intentar = (fn, valor) => { try { return fn(); } catch { return valor; } };
const existe = (ref) => intentar(() => git("rev-parse", "-q", "--verify", `${ref}^{commit}`), "") !== "";

/** Igual que seguridad.sh: origin/<base> antes que <base>; sin base, la por defecto del remoto. null si no hay. */
function resolverBase(pedida) {
  const p = (pedida || "").replace(/^refs\/heads\//, "");
  const candidatas = p
    ? [`origin/${p.replace(/^origin\//, "")}`, p]
    : [intentar(() => git("symbolic-ref", "-q", "--short", "refs/remotes/origin/HEAD"), ""), "origin/main", "origin/master"];
  return candidatas.find((c) => c && existe(c)) || null;
}

/** Script lint del package.json de d: el texto si usa eslint, "" si no lintea con eslint, undefined si no hay package.json. */
function scriptLint(d) {
  const pkg = intentar(() => JSON.parse(fs.readFileSync(path.join(d, "package.json"), "utf8")), undefined);
  if (pkg === undefined) return undefined;
  const lint = pkg.scripts?.lint || "";
  return /(^|[\s/])eslint(\s|$)/.test(lint) ? lint : "";
}

/** Rutas o globs que lintea el script (`tsc && eslint src/ scripts/` → ["src/", "scripts/"]); ["."] si no nombra ninguna. */
function objetivosDe(lint) {
  const t = segmentos(lint).map(tokens).find((x) => x.some((y) => /(^|\/)eslint$/.test(y))) || [];
  const args = t.slice(t.findIndex((x) => /(^|\/)eslint$/.test(x)) + 1);
  const rutas = args.filter((x) => !x.startsWith("-") && !/^\d+$/.test(x));
  return rutas.length ? rutas : ["."];
}

function globARegex(glob) {
  const re = glob.replace(/[.+^$()|[\]\\]/g, "\\$&")
    .replace(/\*\*\/?/g, "\u0000").replace(/\*/g, "[^/]*").replace(/\?/g, "[^/]")
    .replace(/\{([^}]*)\}/g, (_, alternativas) => `(${alternativas.split(",").join("|")})`)
    .replace(/\u0000/g, ".*");
  return new RegExp(`^${re}$`);
}

function cubre(objetivo, rel) {
  const o = objetivo.replace(/^\.\//, "").replace(/\/$/, "");
  if (o === "." || o === "") return true;
  if (/[*?{]/.test(o)) return globARegex(o).test(rel);
  return rel === o || rel.startsWith(`${o}/`);
}

/** Paquete que lintea el archivo { dir, rel }, o null si ningún script lint lo cubre. */
function paqueteDe(raiz, archivo) {
  for (let d = path.dirname(path.join(raiz, archivo)); d.startsWith(raiz); d = path.dirname(d)) {
    const lint = scriptLint(d);
    if (lint !== undefined) {
      const rel = path.relative(d, path.join(raiz, archivo)).replace(/\\/g, "/");
      return lint && objetivosDe(lint).some((o) => cubre(o, rel)) ? { dir: d, rel } : null;
    }
    if (d === raiz) return null;
  }
  return null;
}

/** bin/eslint.js que usa el paquete, o null si no lo tiene instalado. */
const binEslint = (dir) =>
  intentar(() => path.join(path.dirname(createRequire(path.join(dir, "package.json")).resolve("eslint/package.json")), "bin", "eslint.js"), null);

function lintear(raiz, dir, archivos) {
  const donde = path.relative(raiz, dir) || ".";
  const bin = binEslint(dir);
  if (!bin) { console.log(`⚠ ${donde}: no encontré ESLint instalado, no se lintea`); return true; }
  const r = spawnSync(process.execPath, [bin, "--no-warn-ignored", ...archivos], { cwd: dir, encoding: "utf8" });
  if (r.status === 0) { console.log(`✓ eslint ${donde} (${archivos.length} archivos)`); return true; }
  console.log(`✗ eslint ${donde}:\n${(r.stdout + r.stderr).trim().split("\n").slice(0, 60).join("\n")}`);
  return false;
}

module.exports = { scriptLint, objetivosDe, cubre, binEslint };

/** Archivos JS/TS cambiados entre `desde` y HEAD (lo commiteado), con nombres en crudo (-z). */
const cambiados = (desde) => git("-c", "core.quotePath=false", "diff", "-z", "--name-only", "--diff-filter=ACMR", desde, "HEAD")
  .split("\0").filter((f) => /\.(ts|tsx|mts|cts|js|jsx|mjs|cjs)$/.test(f));

if (require.main === module) {
  const raiz = git("rev-parse", "--show-toplevel");
  const base = resolverBase(process.argv[2]);
  const desde = base && intentar(() => git("merge-base", "HEAD", base), null);
  if (!desde) {
    console.log(`✗ eslint: no encontré la rama base ${process.argv[2] || "por defecto del remoto"} (pasala como argumento y hacé git fetch)`);
    process.exit(1);
  }
  const grupos = new Map();
  for (const f of cambiados(desde)) {
    if (!fs.existsSync(path.join(raiz, f))) continue;
    const p = paqueteDe(raiz, f);
    if (p) grupos.set(p.dir, [...(grupos.get(p.dir) || []), p.rel]);
  }
  if (!grupos.size) console.log("✓ eslint (sin archivos JS/TS cambiados que lintee algún paquete)");
  const resultados = [...grupos].map(([dir, archivos]) => lintear(raiz, dir, archivos));
  process.exit(resultados.every(Boolean) ? 0 : 1);
}
