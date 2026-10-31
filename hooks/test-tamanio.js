#!/usr/bin/env node
const { evaluar } = require("./tamanio.js");
const casos = [
  // [archivo, líneas, creció, debeAvisar]
  ["/r/apps/web/src/Carta.tsx", 450, true, true],
  ["/r/apps/web/src/Carta.tsx", 450, false, false],   // legacy, la edición no lo agrandó
  ["/r/apps/web/src/Carta.tsx", 390, true, false],
  ["/r/apps/api/src/menu.service.ts", 401, true, true],
  ["/r/apps/api/src/menu.service.spec.ts", 550, true, false],
  ["/r/apps/api/src/menu.service.spec.ts", 650, true, true],
  ["/r/apps/api/prisma/migrations/001/migration.sql", 900, true, false],
  ["/r/apps/api/src/migrations/1700-init.ts", 900, true, false],
  ["/r/package-lock.json", 9000, true, false],
  ["/r/README.md", 800, true, false],
  ["/r/src/types/api.d.ts", 900, true, false],
  ["/r/apps/web/.next/server/x.js", 900, true, false],
  ["C:\\r\\apps\\web\\src\\Panel.tsx", 500, true, true],
];
let f = 0;
for (const [a, l, c, esperado] of casos) {
  if (!!evaluar(a, l, c) !== esperado) { f++; console.log("❌", a, l, c, "esperaba", esperado); }
}
const conIgnorar = evaluar("/r/src/legacy/Viejo.tsx", 900, true, { codigo: 400, tests: 600, ignorar: ["src/legacy/"] });
if (conIgnorar) { f++; console.log("❌ ignorar no funcionó"); }
console.log(f ? `${f} fallos` : `✅ ${casos.length + 1}/${casos.length + 1} casos OK`);
process.exit(f ? 1 : 0);
