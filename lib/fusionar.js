// Utilidades de instalación: bloques con marcadores en Markdown y registro de hooks en settings.json.
const fs = require("fs");
const [, , accion, ...args] = process.argv;

function leer(p, def = "") { try { return fs.readFileSync(p, "utf8"); } catch { return def; } }

/** JSON de p ({} si no existe o está vacío). Si es inválido, frena sin tocarlo. */
function leerJson(p) {
  const crudo = leer(p);
  if (!crudo.trim()) return {};
  try { return JSON.parse(crudo); }
  catch (e) {
    console.error(`✗ ${p} no es JSON válido (${e.message}). No toco nada: corregilo y volvé a correr el instalador.`);
    process.exit(1);
  }
}

if (accion === "validar") {
  // node fusionar.js validar <settings.json>: se corre antes de copiar nada
  leerJson(args[0]);
}

if (accion === "bloque") {
  // node fusionar.js bloque <destino.md> <origen.md> <id>
  const [dest, src, id] = args;
  const ini = `<!-- ${id}:inicio -->`, fin = `<!-- ${id}:fin -->`;
  const bloque = `${ini}\n${leer(src).trim()}\n${fin}`;
  const actual = leer(dest);
  const re = new RegExp(`${ini}[\\s\\S]*?${fin}`);
  let nuevo;
  // Reemplazo con función: si el bloque trae "$&" o "$1", se copian tal cual.
  if (re.test(actual)) nuevo = actual.replace(re, () => bloque);
  else if (id === "kit-claude-code" && /# Instrucciones globales/.test(actual))
    nuevo = actual.replace(/# Instrucciones globales[\s\S]*?Respondeme en español\.\n?/, () => bloque + "\n");
  else nuevo = (actual.trim() ? actual.trim() + "\n\n" : "") + bloque + "\n";
  fs.writeFileSync(dest, nuevo);
  console.log(`✓ ${dest} (bloque ${id})`);
}

if (accion === "hooks") {
  // node fusionar.js hooks <settings.json> <prefijo-de-ruta>
  const [p, prefijo] = args;
  const s = leerJson(p);
  s.hooks ??= {};
  const registrar = (evento, matcher, script) => {
    s.hooks[evento] ??= [];
    s.hooks[evento] = s.hooks[evento].filter(e => !(e.hooks || []).some(x => (x.command || "").includes(script)));
    s.hooks[evento].unshift({ matcher, hooks: [{ type: "command", command: `node "${prefijo}/${script}"`, timeout: 10 }] });
  };
  registrar("PreToolUse", "Bash|Read|Edit|Write|MultiEdit|NotebookEdit", "guardia.js");
  registrar("PostToolUse", "Write|Edit|MultiEdit", "tamanio.js");
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  console.log(`✓ Hooks registrados en ${p}`);
}
