#!/usr/bin/env node
// Corré: node lib/test-lint-cambios.js   (qué archivos cubre el script lint de cada paquete)
const { objetivosDe, cubre } = require("../checks/lint-cambios.js");

const casos = [
  // [script lint, archivo relativo al paquete, ¿lo lintea?]
  ["eslint src/ scripts/", "src/a.ts", true],
  ["eslint src/ scripts/", "scripts/x.ts", true],
  ["eslint src/ scripts/", "test/a.spec.ts", false],
  ["eslint src/", "srcx/a.ts", false],
  ["eslint .", "test/a.ts", true],
  ["eslint", "x.ts", true],
  ["eslint --max-warnings 0 src", "src/a.ts", true],
  ["eslint --max-warnings 0 src", "lib/a.ts", false],
  ['eslint "{src,test}/**/*.ts"', "src/a/b.ts", true],
  ['eslint "{src,test}/**/*.ts"', "test/b.ts", true],
  ['eslint "{src,test}/**/*.ts"', "scripts/c.ts", false],
  ['eslint "{src,test}/**/*.ts"', "src/c.tsx", false],
  ["next lint && eslint ./src", "src/a.tsx", true],
  ["tsc && eslint src && prettier --check .", "test/a.ts", false],
  ["eslint src; echo ok", "src/a.ts", true],
  ["eslint src | tee lint.log", "src/a.ts", true],
];
let f = 0;
for (const [lint, rel, esperado] of casos) {
  if (objetivosDe(lint).some((o) => cubre(o, rel)) !== esperado) { f++; console.log("❌", lint, rel, "esperaba", esperado); }
}
console.log(f ? `${f} fallos` : `✅ ${casos.length}/${casos.length} casos OK`);
process.exit(f ? 1 : 0);
