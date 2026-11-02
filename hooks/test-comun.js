#!/usr/bin/env node
const fs = require("fs");
const os = require("os");
const path = require("path");
const { contenidoResultante, cargarLimites, esTest, ignorado, LIMITES } = require("./comun.js");

let f = 0, total = 0;
const caso = (nombre, obtenido, esperado) => {
  total++;
  if (obtenido !== esperado) { f++; console.log("❌", nombre, "→", JSON.stringify(obtenido), "esperaba", JSON.stringify(esperado)); }
};

const actual = "a\nb\nb\nc\n";
caso("Write", contenidoResultante("Write", { content: "x" }, actual), "x");
caso("Edit reemplaza la primera", contenidoResultante("Edit", { old_string: "b", new_string: "B" }, actual), "a\nB\nb\nc\n");
caso("Edit con replace_all", contenidoResultante("Edit", { old_string: "b", new_string: "B", replace_all: true }, actual), "a\nB\nB\nc\n");
caso("Edit con $& en el texto nuevo", contenidoResultante("Edit", { old_string: "c", new_string: "$&$1" }, actual), "a\nb\nb\n$&$1\n");
caso("Edit que no matchea", contenidoResultante("Edit", { old_string: "zzz", new_string: "x" }, actual), null);
caso("Edit sobre un archivo que no existe", contenidoResultante("Edit", { old_string: "a", new_string: "x" }, null), null);
caso("MultiEdit en orden", contenidoResultante("MultiEdit", { edits: [{ old_string: "a", new_string: "A" }, { old_string: "A\nb", new_string: "AB" }] }, actual), "AB\nb\nc\n");
caso("otra herramienta", contenidoResultante("Read", {}, actual), null);

// Los patrones se aplican relativos al proyecto: un repo clonado en ~/e2e/ o ~/build/ no es todo tests ni todo ignorado
caso("repo dentro de una carpeta e2e: src no es test", esTest("/home/m/e2e/app/src/x.ts", "/home/m/e2e/app"), false);
caso("repo dentro de una carpeta e2e: test/ sí", esTest("/home/m/e2e/app/test/x.ts", "/home/m/e2e/app"), true);
caso("test/ en la raíz del proyecto", esTest("/r/test/x.ts", "/r"), true);
caso("repo dentro de una carpeta build: no se ignora", ignorado("/home/m/build/app/src/x.ts", LIMITES, "/home/m/build/app"), false);
caso("dist/ del proyecto sí se ignora", ignorado("/r/apps/web/dist/x.js", LIMITES, "/r"), true);
caso("ignorar del proyecto, relativo", ignorado("/r/src/legacy/x.ts", { ...LIMITES, ignorar: ["src/legacy/"] }, "/r"), true);

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-comun-"));
caso("límites por defecto", cargarLimites(tmp).codigoMax, LIMITES.codigoMax);
fs.mkdirSync(path.join(tmp, ".claude"));
fs.writeFileSync(path.join(tmp, ".claude", "limites.json"), '{ "codigo": 300, "ignorar": ["legacy/"] }');
const l = cargarLimites(tmp);
caso("límites del proyecto pisan los de por defecto", `${l.codigo}/${l.codigoMax}/${l.ignorar[0]}`, `300/${LIMITES.codigoMax}/legacy/`);
fs.rmSync(tmp, { recursive: true, force: true });

console.log(f ? `${f} fallos` : `✅ ${total}/${total} casos OK`);
process.exit(f ? 1 : 0);
