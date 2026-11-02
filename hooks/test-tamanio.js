#!/usr/bin/env node
const { evaluar } = require("./tamanio.js");
const casos = [
  // [archivo, líneas, creció, nivel esperado: null | "aviso" | "bloqueo"]
  ["/r/apps/web/src/Carta.tsx", 450, true, "aviso"],
  ["/r/apps/web/src/Carta.tsx", 450, false, null], // legacy, la edición no lo agrandó
  ["/r/apps/web/src/Carta.tsx", 390, true, null],
  ["/r/apps/api/src/menu.service.ts", 401, true, "aviso"],
  ["/r/apps/api/src/menu.service.ts", 600, true, "aviso"],
  ["/r/apps/api/src/menu.service.ts", 601, true, "bloqueo"],
  ["/r/apps/api/src/menu.service.ts", 650, true, "bloqueo"],
  ["/r/apps/api/src/menu.service.ts", 700, false, null], // legacy de 700 que no crece
  ["/r/apps/api/src/menu.service.spec.ts", 550, true, null],
  ["/r/apps/api/src/menu.service.spec.ts", 650, true, "aviso"],
  ["/r/apps/api/src/menu.service.spec.ts", 850, true, "bloqueo"],
  ["/r/apps/api/test/e2e/orders.ts", 700, true, "aviso"],
  ["/r/apps/api/prisma/migrations/001/migration.sql", 900, true, null],
  ["/r/apps/api/src/migrations/1700-init.ts", 900, true, null],
  ["/r/package-lock.json", 9000, true, null],
  ["/r/README.md", 800, true, null],
  ["/r/src/types/api.d.ts", 900, true, null],
  ["/r/apps/web/.next/server/x.js", 900, true, null],
  ["C:\\r\\apps\\web\\src\\Panel.tsx", 500, true, "aviso"],
  ["C:\\r\\apps\\web\\src\\Panel.tsx", 900, true, "bloqueo"],
];
let f = 0;
for (const [a, l, c, esperado] of casos) {
  const nivel = evaluar(a, l, c)?.nivel ?? null;
  if (nivel !== esperado) { f++; console.log("❌", a, l, c, "esperaba", esperado, "y dio", nivel); }
}
const conIgnorar = evaluar("/r/src/legacy/Viejo.tsx", 900, true, { ignorar: ["src/legacy/"] });
if (conIgnorar) { f++; console.log("❌ ignorar no funcionó"); }
const conLimites = evaluar("/r/src/x.ts", 350, true, { codigo: 300, codigoMax: 500 })?.nivel;
if (conLimites !== "aviso") { f++; console.log("❌ los límites del proyecto no se aplicaron"); }
const total = casos.length + 2;
console.log(f ? `${f} fallos` : `✅ ${total}/${total} casos OK`);
process.exit(f ? 1 : 0);
