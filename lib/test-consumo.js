#!/usr/bin/env node
// Corré: node lib/test-consumo.js   (qué sesiones mide checks/consumo.js y cómo cuenta)
const assert = require("assert");
const fs = require("fs");
const os = require("os");
const path = require("path");
const { carpetaDe, medirProyecto, reporte } = require("../checks/consumo.js");

const raiz = fs.mkdtempSync(path.join(os.tmpdir(), "consumo-"));
const escribir = (rel, lineas) => {
  fs.mkdirSync(path.dirname(path.join(raiz, rel)), { recursive: true });
  fs.writeFileSync(path.join(raiz, rel), lineas.map((l) => JSON.stringify(l)).join("\n"));
};
const asistente = (id, contexto) => ({
  type: "assistant",
  timestamp: "2026-11-03T10:00:00Z",
  message: { id, usage: { input_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: contexto - 10 } },
});

escribir("-tmp-proj/s1.jsonl", [
  { type: "user", timestamp: "2026-11-03T08:00:00Z", message: { content: "<system-reminder>x</system-reminder>" } },
  { type: "user", message: { content: [{ type: "text", text: "arreglá el login" }] } },
  asistente("m1", 100000),
  asistente("m1", 100000), // el mismo mensaje, otro bloque: no se cuenta dos veces
  { type: "user", message: { content: [{ type: "tool_result", content: "x".repeat(25000) }] } },
  asistente("m2", 150000),
]);
escribir("-tmp-proj/s1/subagents/agent-a.jsonl", [asistente("a1", 40000)]);
escribir("-tmp-proj--claude-worktrees-x/s2.jsonl", [asistente("m3", 90000)]);
escribir("-tmp-projX/s3.jsonl", [asistente("m4", 999000)]); // otro proyecto con el mismo prefijo

const casos = [
  ["la carpeta de una ruta", () => assert.strictEqual(carpetaDe("/a/b.c/d_e"), "-a-b-c-d-e")],
  ["mide el proyecto y sus worktrees, no otro con el mismo prefijo", () => assert.strictEqual(medirProyecto(raiz, "/tmp/proj", 7).length, 2)],
  ["cuenta cada mensaje una vez y el arranque es la primera llamada", () => {
    const [s1] = medirProyecto(raiz, "/tmp/proj", 7);
    assert.deepStrictEqual([s1.llamadas, s1.contexto, s1.arranque], [2, 250000, 100000]);
  }],
  ["el primer pedido salta los recordatorios", () => assert.strictEqual(medirProyecto(raiz, "/tmp/proj", 7)[0].primerPedido, "arreglá el login")],
  ["resultados grandes, subagentes y horas", () => {
    const [s1] = medirProyecto(raiz, "/tmp/proj", 7);
    assert.deepStrictEqual([s1.resultadosGrandes, s1.subagentes.cantidad, s1.subagentes.contexto, s1.horas], [1, 1, 40000, 2]);
  }],
  ["el reporte resume", () => {
    const lineas = reporte(medirProyecto(raiz, "/tmp/proj", 7), 7);
    assert.match(lineas[0], /^2 sesiones en 7 días, 3 llamadas/);
    assert.match(lineas[1], /113K de promedio; una sesión arranca en 100K/);
  }],
];

let fallaron = 0;
for (const [nombre, caso] of casos) {
  try { caso(); } catch (e) { fallaron++; console.log(`✗ ${nombre}: ${e.message}`); }
}
fs.rmSync(raiz, { recursive: true, force: true });
console.log(fallaron ? `${fallaron} fallaron` : `✓ ${casos.length} casos`);
process.exit(fallaron ? 1 : 0);
