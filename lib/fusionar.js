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
  const registrar = (evento, matcher, script, timeout = 10) => {
    s.hooks[evento] ??= [];
    s.hooks[evento] = s.hooks[evento].filter(e => !(e.hooks || []).some(x => (x.command || "").includes(script)));
    s.hooks[evento].unshift({ matcher, hooks: [{ type: "command", command: `node "${prefijo}/${script}"`, timeout }] });
  };
  registrar("PreToolUse", "Bash|Read|Edit|Write|MultiEdit|NotebookEdit|mcp__github__merge_pull_request", "guardia.js");
  registrar("PreToolUse", "Write|Edit|MultiEdit", "tamanio.js");
  registrar("PreToolUse", "Write|Edit|MultiEdit", "complejidad.js", 15);
  // pnpm audit + Semgrep + gitleaks + ESLint pueden tardar varios minutos
  registrar("PreToolUse", "Bash|mcp__.*create_pull_request", "pre-pr.js", 600);
  registrar("PostToolUse", "Write|Edit|MultiEdit", "tamanio.js");
  fs.writeFileSync(p, JSON.stringify(s, null, 2) + "\n");
  console.log(`✓ Hooks registrados en ${p}`);
}

if (accion === "limites") {
  // node fusionar.js limites <.claude/limites.json> [clave=valor…]: suma las claves nuevas sin
  // tocar las del proyecto; clave=valor se usa solo si el proyecto todavía no la tiene
  const [p, ...extra] = args;
  const { LIMITES } = require("../hooks/comun.js");
  const actual = leerJson(p);
  const nuevos = Object.fromEntries(extra.map((x) => x.split("=")).filter(([k]) => !(k in actual)));
  const { ignorar, ...resto } = { ...LIMITES, ...nuevos, ...actual };
  fs.writeFileSync(p, JSON.stringify({ ...resto, ignorar }, null, 2) + "\n");
  console.log(`✓ ${p} (límites del kit)`);
  if (nuevos.pnpmAudit === "aviso") console.log("⚠ pnpm audit ya falla en este repo: queda en modo aviso hasta resolverlo (pnpmAudit en .claude/limites.json)");
}

if (accion === "paquete-hooks") {
  // node fusionar.js paquete-hooks <.claude/hooks>: los hooks del kit son CommonJS. Si el
  // proyecto ya tiene ahí un package.json "module", frena en vez de romper sus hooks ESM.
  const [dir] = args, p = `${dir}/package.json`;
  const tipo = leerJson(p).type;
  if (tipo && tipo !== "commonjs") {
    console.error(`✗ ${p} declara "type": "${tipo}" y los hooks del kit son CommonJS. Movelos o renombralos a .mjs y volvé a correr el instalador.`);
    process.exit(1);
  }
  if (!fs.existsSync(p)) { fs.mkdirSync(dir, { recursive: true }); fs.writeFileSync(p, '{ "type": "commonjs" }\n'); }
}
