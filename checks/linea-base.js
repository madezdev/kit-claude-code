#!/usr/bin/env node
// kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar.
/**
 * Guarda como línea base las violaciones que ya existen de las reglas del kit, en el
 * eslint-suppressions.json de cada paquete que lintea con eslint. Desde ahí ESLint solo
 * frena las nuevas. Se corre una vez al instalar el kit; con --podar, después de arreglar
 * código, saca de la línea base lo que ya no hace falta.
 *   node .claude/checks/linea-base.js [--podar]
 */
const path = require("path");
const { execFileSync, spawnSync } = require("child_process");
const { scriptLint, objetivosDe, binEslint } = require("./lint-cambios.js");

const REGLAS = ["complexity", "max-depth", "max-lines-per-function", "max-lines"];
const podar = process.argv.includes("--podar");

const raiz = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf8" }).trim();
const paquetes = execFileSync("git", ["ls-files", "package.json", "**/package.json"], { cwd: raiz, encoding: "utf8" })
  .split("\n").filter(Boolean).map((f) => path.join(raiz, path.dirname(f)))
  .filter((d) => scriptLint(d));

let fallaron = 0;
for (const dir of paquetes) {
  const bin = binEslint(dir), donde = path.relative(raiz, dir) || ".";
  if (!bin) { console.log(`⚠ ${donde}: sin ESLint instalado`); continue; }
  const accion = podar ? ["--prune-suppressions"] : REGLAS.flatMap((r) => ["--suppress-rule", r]);
  const r = spawnSync(process.execPath, [bin, ...accion, ...objetivosDe(scriptLint(dir))], { cwd: dir, encoding: "utf8" });
  // exit 1 = quedan errores de otras reglas del proyecto (no son del kit): se informan, no se suprimen
  console.log(`${r.status === 0 ? "✓" : "⚠"} ${donde}${r.status === 0 ? "" : ": quedan errores que no son de las reglas del kit"}`);
  if (r.status > 1) { fallaron++; console.log((r.stderr || r.stdout).trim().split("\n").slice(0, 10).join("\n")); }
}
process.exit(fallaron ? 1 : 0);
