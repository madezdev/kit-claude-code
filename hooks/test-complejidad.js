#!/usr/bin/env node
// Necesita ESLint y el parser de TypeScript: en un repo los encuentra solo; desde el kit,
// KIT_ESLINT_DESDE=<repo con node_modules> node hooks/test-complejidad.js
const path = require("path");
const { cargarLinter, nuevasViolaciones } = require("./complejidad.js");
const { LIMITES } = require("./comun.js");

const desde = process.env.KIT_ESLINT_DESDE || path.resolve(__dirname, "..", ".."); // <repo>/.claude/hooks → <repo>
const ts = path.join(desde, "src", "prueba-kit.ts");
if (!cargarLinter(ts)) {
  console.log("⏭  test-complejidad omitido: no hay ESLint ni parser de TypeScript (KIT_ESLINT_DESDE=<repo> para correrlo)");
  process.exit(0);
}

// complejidad = cantidad de if + 1
const ramas = (nombre, ifs) =>
  `export function ${nombre}(x: number): number {\n${Array.from({ length: ifs }, (_, i) => `  if (x === ${i}) return ${i};`).join("\n")}\n  return -1;\n}\n`;
const larga = (nombre, lineas) =>
  `export function ${nombre}(): number {\n  let a = 0;\n${"  a++;\n".repeat(lineas)}  return a;\n}\n`;
const anidada = (niveles) =>
  `export function hondo(x: number): number {\n${Array.from({ length: niveles }, (_, i) => `${"  ".repeat(i + 1)}if (x > ${i}) {`).join("\n")}\n` +
  `${"  ".repeat(niveles + 1)}return x;\n${Array.from({ length: niveles }, (_, i) => `${"  ".repeat(niveles - i)}}`).join("\n")}\n  return 0;\n}\n`;
const vieja = ramas("vieja", 14);

const casos = [
  // [nombre, antes, después, archivo, reglas que tienen que bloquear]
  ["función nueva con complejidad 15", null, ramas("nueva", 14), ts, ["complexity"]],
  ["función nueva con complejidad 10", null, ramas("nueva", 9), ts, []],
  ["legacy que ya violaba y no suma violaciones", vieja, vieja.replace("return -1", "return -2"), ts, []],
  ["legacy más una función nueva que viola", vieja, vieja + ramas("otra", 12), ts, ["complexity"]],
  ["función de 70 líneas", null, larga("larga", 70), ts, ["max-lines-per-function"]],
  ["función de 70 líneas en un test", null, larga("larga", 70), path.join(desde, "src", "prueba-kit.spec.ts"), []],
  ["anidamiento de 5 niveles", null, anidada(5), ts, ["max-depth"]],
  ["anidamiento de 4 niveles", null, anidada(4), ts, []],
  ["disable de una regla que no existe", null, "// eslint-disable-next-line @typescript-eslint/no-explicit-any\nexport const x: any = 1;\n", ts, []],
  ["componente TSX chico", null, "export function A() {\n  return <div>hola</div>;\n}\n", path.join(desde, "src", "A.tsx"), []],
  ["código que no parsea", null, "export function (", ts, []],
];

let f = 0;
for (const [nombre, antes, despues, archivo, esperadas] of casos) {
  const motor = cargarLinter(archivo);
  const reglas = [...new Set(nuevasViolaciones(motor, antes ?? "", despues, archivo, LIMITES, desde).map((m) => m.ruleId))].sort();
  if (reglas.join() !== [...esperadas].sort().join()) { f++; console.log("❌", nombre, "→ esperaba", esperadas, "y dio", reglas); }
}
// Archivo roto en disco (un Edit anterior lo dejó sin parsear): la línea base sale de HEAD
const fs = require("fs");
const os = require("os");
const { execFileSync } = require("child_process");
const repo = fs.mkdtempSync(path.join(os.tmpdir(), "kit-complejidad-"));
const enRepo = path.join(repo, "x.ts");
execFileSync("git", ["init", "-q", repo]);
fs.writeFileSync(enRepo, vieja);
execFileSync("git", ["-C", repo, "add", "x.ts"]);
execFileSync("git", ["-C", repo, "-c", "user.name=t", "-c", "user.email=t@t", "commit", "-qm", "x"]);
const motor = cargarLinter(ts);
const roto = "export function (";
const conHead = [
  ["roto en disco, se arregla y queda la violación vieja", roto, vieja, enRepo, []],
  ["roto en disco, se arregla y suma una función que viola", roto, vieja + ramas("otra", 12), enRepo, ["complexity"]],
  ["roto en disco y sin versión en HEAD: no bloquea", roto, ramas("nueva", 14), path.join(repo, "nuevo.ts"), []],
];
for (const [nombre, antes, despues, archivo, esperadas] of conHead) {
  const reglas = [...new Set(nuevasViolaciones(motor, antes, despues, archivo, LIMITES, repo).map((m) => m.ruleId))].sort();
  if (reglas.join() !== esperadas.join()) { f++; console.log("❌", nombre, "→ esperaba", esperadas, "y dio", reglas); }
}
fs.rmSync(repo, { recursive: true, force: true });

const total = casos.length + conHead.length;
console.log(f ? `${f} fallos` : `✅ ${total}/${total} casos OK`);
process.exit(f ? 1 : 0);
