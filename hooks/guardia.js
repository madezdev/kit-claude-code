#!/usr/bin/env node
/**
 * guardia.js — Hook PreToolUse para Claude Code.
 *
 * Bloquea (exit 2) comandos que modifican infraestructura real, publican,
 * destruyen datos o exponen secretos. Funciona aunque uses bypassPermissions.
 *
 * Desactivar temporalmente: lanzar Claude con  CLAUDE_GUARDIA_OFF=1 claude
 * (Claude no puede setearla él mismo: el hook lee el entorno de Claude Code,
 * no el de sus comandos).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");

const LOG = path.join(os.homedir(), ".claude", "hooks", "guardia.log");

// ---------------------------------------------------------------------------
// Reglas para comandos Bash. `allow` = excepción que deja pasar el comando.
// ---------------------------------------------------------------------------
const DRY_RUN = /--dry-run|--what-if|\bwhat-if\b|--preview\b/;
// Crear/editar PRs en Azure Repos está permitido (el merge no).
const AZ_PERMITIDO = /--dry-run|--what-if|\bwhat-if\b|^(?!.*(--status\s+completed|--auto-complete\s+true|--merge-commit-message)).*\baz\s+repos\s+pr\s+(create|update|reviewer\s+add|work-item\s+add)\b/;

const REGLAS_BASH = [
  // --- Infraestructura como código ---
  { re: /\b(terraform|tofu|terragrunt)\s+(.*\s)?(apply|destroy|import|taint|untaint|force-unlock)\b/, msg: "Terraform/OpenTofu que modifica estado real. Solo plan/validate/fmt." },
  { re: /\b(terraform|tofu)\s+(.*\s)?state\s+(rm|mv|push|replace-provider)\b/, msg: "Modificación directa del state de Terraform." },
  { re: /\b(terraform|tofu)\s+(.*\s)?workspace\s+delete\b/, msg: "Borrado de workspace de Terraform." },
  { re: /\bpulumi\s+(up|destroy|import|cancel|state\s+(delete|unprotect))\b/, msg: "Pulumi que modifica recursos reales. Usá pulumi preview." },

  // --- Azure ---
  { re: /\baz\s+(?:[a-z][\w-]*\s+)*?(create|delete|update|set|deploy|start|stop|restart|purge|import|assign|add|remove|up|scale|revoke|regenerate|renew|reset|swap|rotate|upload|build|run|activate|deactivate|attach|detach|move|copy|sync|batch|recover|restore|failover|lock|unlock)\b/, allow: AZ_PERMITIDO, msg: "Comando de Azure CLI que modifica recursos. Solo show/list/what-if." },
  { re: /\baz\s+(keyvault\s+(secret|key|certificate)\s+(show|download|backup)|acr\s+credential\s+show|storage\s+account\s+(keys\s+list|show-connection-string)|cosmosdb\s+keys\s+list|redis\s+list-keys|webapp\s+deployment\s+list-publishing-profiles|ad\s+sp\s+credential)\b/, msg: "Lectura de secretos/credenciales de Azure: no deben entrar al contexto." },
  { re: /\baz\s+containerapp\s+(secret\s+(show|list)\b.*--show-values|.*--show-secrets)/, msg: "Lectura de secretos de Container Apps." },
  { re: /\baz\s+bicep\s+.*\bdeploy\b|\baz\s+stack\s+\w+\s+(create|delete)\b/, msg: "Despliegue de Bicep/deployment stack." },

  // --- AWS / GCP ---
  { re: /\baws\s+[\w-]+\s+(create|delete|put|update|terminate|run|deploy|attach|detach|modify|start|stop|reboot|remove|revoke|authorize|disable|enable|restore|reset)[\w-]*/, allow: DRY_RUN, msg: "AWS CLI que modifica recursos." },
  { re: /\baws\s+s3\s+(rm|rb|mv|sync)\b|\baws\s+s3api\s+delete/, msg: "Operación destructiva en S3." },
  { re: /\baws\s+secretsmanager\s+get-secret-value|\baws\s+ssm\s+get-parameters?\b.*--with-decryption/, msg: "Lectura de secretos de AWS." },
  { re: /\bgcloud\s+(?:[a-z][\w-]*\s+)*?(create|delete|deploy|update|set-iam-policy|add-iam-policy-binding|remove-iam-policy-binding|reset|stop|start|resize)\b/, msg: "gcloud que modifica recursos." },
  { re: /\bgcloud\s+secrets\s+versions\s+access\b/, msg: "Lectura de secretos de GCP." },


  // --- Plataformas: fly.io, Vercel, Neon, Upstash, Cloudflare (wrangler), Supabase, Railway, Render ---
  { re: /\b(fly|flyctl)\s+(?:[a-z][\w-]*\s+)*?(deploy|destroy|launch|scale|restart|stop|start|suspend|resume|clone|update|create|remove|rm|delete|kill|attach|detach|extend|fork|promote|failover|import|unset|set|rollback)\b/, allow: /--dry-run|\bfly\w*\s+(?:[a-z][\w-]*\s+)*?(status|list|ls|show|logs|info|config\s+show|releases)\b(?![\s\S]*\b(set|unset|destroy|delete)\b)/, msg: "fly.io que modifica la app, máquinas, volúmenes o secretos de producción." },
  { re: /\b(fly|flyctl)\s+(ssh\s+console|proxy|postgres\s+connect|pg\s+connect)\b/, msg: "Acceso directo a máquinas o base de datos de producción en fly.io." },
  { re: /\bvercel\s+(deploy\b.*--prod|promote|rollback|remove|rm|env\s+(add|rm|remove|pull)|domains\s+(add|rm|remove)|alias|secrets?|project\s+rm|dns\s+(add|rm))\b/, msg: "Vercel que modifica producción, dominios o variables de entorno." },
  { re: /\b(neonctl|neon)\s+(?:[a-z][\w-]*\s+)*?(delete|create|reset|restore|update|set-primary|set-default|rename)\b/, msg: "Neon que modifica proyectos, ramas, bases o roles." },
  { re: /\b(neonctl|neon)\s+connection-string\b/, msg: "Lectura del connection string de Neon (contiene la contraseña)." },
  { re: /\bupstash\s+(?:[a-z][\w-]*\s+)*?(delete|create|reset|rename|update|move)\b/, msg: "Upstash que modifica bases de datos." },
  { re: /\bwrangler\s+(r2\s+(bucket|object)\s+(delete|create|put)|secret\s+(put|delete|bulk)|kv\s+(namespace|key|bulk)\s+(delete|put|create)|d1\s+(delete|execute\b.*--remote|migrations\s+apply\b.*--remote)|delete|rollback|versions\s+deploy)\b/, msg: "Cloudflare (wrangler) que modifica R2, KV, D1, secretos o workers en producción." },
  { re: /\b(supabase\s+(db\s+(push|reset)|projects\s+delete|secrets\s+(set|unset))|railway\s+(up|down|delete|variables\s+set)|render\s+(deploy|delete))\b/, msg: "Plataforma cloud que modifica producción." },
  { re: /\bredis-cli\b.*(-u|--uri)\s+\S*upstash|\bpsql\b.*neon\.tech/, msg: "Conexión directa a la base de datos de producción." },

  // --- Kubernetes / Helm ---
  { re: /\bkubectl\s+(?:[^|;&]*\s)?(apply|delete|create|patch|replace|scale|edit|drain|cordon|uncordon|taint|annotate|label|set|expose|autoscale)\b/, allow: DRY_RUN, msg: "kubectl que modifica el cluster. Usá --dry-run=server o diff." },
  { re: /\bkubectl\s+rollout\s+(restart|undo|pause|resume)\b/, msg: "kubectl rollout sobre el cluster." },
  { re: /\bkubectl\s+get\s+secrets?\b.*(-o|--output)[\s=]*(yaml|json|jsonpath)/, msg: "Lectura de valores de secrets de Kubernetes." },
  { re: /\bhelm\s+(install|upgrade|uninstall|delete|rollback)\b/, allow: DRY_RUN, msg: "Helm que modifica el cluster. Usá --dry-run o helm template." },

  // --- Contenedores / publicación / deploy ---
  { re: /\bdocker\s+(push|buildx\s+build\s+.*--push)\b|\bdocker\s+buildx\s+build\b.*--push/, msg: "Push de imagen a un registry." },
  { re: /\bdocker\s+(system|volume|image|container|network)\s+prune\b|\bdocker\s+compose\s+down\b.*(-v\b|--volumes)/, msg: "Borrado de volúmenes/imágenes de Docker." },
  { re: /\b(npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgh\s+release\s+create\b/, msg: "Publicación de paquete/release." },
  { re: /\bvercel\b.*--prod\b|\bnetlify\s+deploy\b.*--prod\b|\bfirebase\s+deploy\b|\bfly\s+deploy\b|\bwrangler\s+(deploy|publish)\b/, msg: "Deploy a producción." },

  // --- Git (git push se analiza aparte, en revisarGit) ---
  { re: /\bgh\s+pr\s+review\b.*(--approve|-a\b|--request-changes|-r\b)/, msg: "Aprobar o rechazar PRs es decisión humana. Usá --comment." },
  { re: /\bgh\s+pr\s+merge\b|\baz\s+repos\s+pr\s+update\b.*(--status\s+completed|--auto-complete\s+true)/, msg: "Merge de PR: lo hace el humano después de revisar." },
  { re: /\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-\w*f/, msg: "Descarta trabajo no commiteado (riesgoso con agentes en paralelo)." },
  { re: /\bgit\s+branch\s+-D\s+(main|master|develop|prod)\b/, msg: "Borrado de rama principal." },
  { re: /\bgit\s+filter-(branch|repo)\b/, msg: "Reescritura del historial." },

  // --- Bases de datos ---
  { re: /\bprisma\s+(migrate\s+reset|db\s+push\b.*(--force-reset|--accept-data-loss))/, msg: "Prisma con pérdida de datos." },
  { re: /\b(typeorm|typeorm-ts-node-\w+)\b.*\b(schema:drop|schema:sync)\b/, msg: "TypeORM que borra/sincroniza el esquema." },
  { re: /\b(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE\s+(TABLE\s+)?\w)/i, msg: "SQL destructivo." },
  { re: /\bdropdb\b|\bmongosh?\b.*\.drop(Database)?\(|\bredis-cli\b.*\bFLUSH(ALL|DB)\b/i, msg: "Borrado de base de datos." },

  // --- Sistema / secretos locales ---
  { re: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*(r[a-zA-Z]*f|f[a-zA-Z]*r)[a-zA-Z]*\s+(\/|~|\$HOME|\.\.?|\*)(\/?\s|\/?$)/, msg: "rm -rf sobre raíz, home o directorio completo." },
  { re: /\b(cat|less|more|head|tail|bat|type|grep|sed|awk|cp|scp|base64|xxd|strings)\b[^|;&]*(\s|\/|^)\.env(\.(?!example|sample|template)[\w.-]+)?(\s|$)/, msg: "Lectura de archivo .env con secretos. Usá .env.example." },
  { re: /\b(cat|less|more|head|tail|bat|cp|scp|base64)\b[^|;&]*(id_rsa|id_ed25519|\.pem\b|\.pfx\b|\.p12\b|\.key\b|\.aws\/credentials|\.azure\/|\.kube\/config|\.tfstate\b)/, msg: "Lectura de claves/credenciales locales." },
  { re: /\b(printenv|env)\s*($|\|)|\bset\s*\|/, msg: "Volcado de variables de entorno (puede exponer secretos)." },
  { re: /\bcurl\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b|\bwget\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, msg: "Ejecución de script remoto sin revisar." },
];

// ---------------------------------------------------------------------------
// Archivos protegidos para Read/Edit/Write.
// ---------------------------------------------------------------------------
const ENV_FILE = /(^|[\/\\])\.env(\.(?!example$|sample$|template$)[\w.-]+)?$/;
const SECRET_FILE = /(^|[\/\\])(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$|\.(pem|pfx|p12|key|keystore|jks)$|\.tfstate(\.backup)?$|[\/\\]\.aws[\/\\]credentials$|[\/\\]\.azure[\/\\]|[\/\\]\.kube[\/\\]config$|[\/\\]\.ssh[\/\\]/;

function revisarArchivo(tool, filePath) {
  if (!filePath) return null;
  const p = filePath.replace(/\\/g, "/");
  if (ENV_FILE.test(p)) {
    return tool === "Read"
      ? "Lectura de .env con secretos. Para ver qué variables existen usá .env.example."
      : "Escritura en .env con secretos. Editá .env.example y avisá al humano qué agregar.";
  }
  if (SECRET_FILE.test(p)) return "Acceso a claves, certificados, credenciales o tfstate.";
  return null;
}

/** contexto (opcional): { cwd, rama, ramaEn(dir) } para evaluar los git push contra la rama actual. */
function revisarBash(cmd, contexto) {
  for (const r of REGLAS_BASH) {
    if (r.re.test(cmd) && !(r.allow && r.allow.test(cmd))) return r.msg;
  }
  return revisarGit(cmd, contexto);
}

// ---------------------------------------------------------------------------
// git push: el comando se analiza por segmentos (&&, ||, ;, |, saltos de línea,
// subshells y $(...)) siguiendo la rama actual, que cambia con checkout/switch,
// cd/pushd y git -C. Sin rama conocida, solo se revisan los destinos explícitos.
// ---------------------------------------------------------------------------
const RAMA_PROTEGIDA = /^(main|master|develop|dev|prod|production|release)$/;
const OPCIONES_CON_VALOR = new Set(["-o", "--push-option", "--repo", "--receive-pack", "--exec", "--recurse-submodules"]);
const CREAR_RAMA = new Set(["-b", "-B", "-c", "-C", "--create", "--force-create", "--orphan"]);
const MSG_FORCE = "git push --force. Usá --force-with-lease si es tu rama.";
const MSG_VARIAS = "git push que abarca varias ramas (--all, --branches, --mirror, ':' o '*'), incluidas las protegidas. Empujá solo tu rama.";

/** Parte el comando en segmentos sin cortar dentro de comillas. */
function segmentos(cmd) {
  const s = cmd.replace(/\\\n/g, " "), out = [];
  let actual = "", comilla = null;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (comilla) { actual += c; if (c === comilla) comilla = null; continue; }
    if (c === "'" || c === '"') { comilla = c; actual += c; continue; }
    const doble = (c === "&" || c === "|") && s[i + 1] === c, sustitucion = c === "$" && s[i + 1] === "(";
    if (doble || sustitucion || ";|\n()`".includes(c)) {
      out.push(actual);
      actual = "";
      if (doble || sustitucion) i++;
      continue;
    }
    actual += c;
  }
  return [...out, actual];
}

/** Tokens de un segmento, sin comillas ni redirecciones (2>&1, > archivo, &>/dev/null). */
function tokens(segmento) {
  const crudos = segmento.match(/(?:[^\s'"]+|'[^']*'|"[^"]*")+/g) || [];
  const t = [];
  for (let i = 0; i < crudos.length; i++) {
    if (/^(\d*>>?|&>>?|<)$/.test(crudos[i])) i++; // operador suelto: se saltea también su archivo
    else if (!/^(\d*>>?|&>>?|<|\d*>&)/.test(crudos[i])) t.push(crudos[i].replace(/['"]/g, ""));
  }
  return t;
}

/** Rama destino de un refspec ("HEAD:refs/heads/main" → "main", "feat/x:" → "feat/x"); null = la rama actual; "" = ":" (todas). */
function destino(refspec) {
  if (/\$\(|`/.test(refspec)) return null; // $(git branch --show-current) y similares
  const [src, dst] = refspec.split(":");
  const rama = (dst || src).replace(/^refs\/heads\//, "");
  return rama === "HEAD" || rama === "@" ? null : rama;
}

function revisarPush(args, rama) {
  if (args.some((a) => /^--(all|branches|mirror)$/.test(a))) return MSG_VARIAS;
  if (args.some((a) => a === "--force" || /^-[a-z]*f[a-z]*$/.test(a))) return MSG_FORCE;
  const posicionales = [];
  for (let i = 0; i < args.length; i++) {
    if (OPCIONES_CON_VALOR.has(args[i])) i++;
    else if (!args[i].startsWith("-")) posicionales.push(args[i]);
  }
  const refspecs = posicionales.slice(1); // el primero es el remoto
  if (!refspecs.length && args.includes("--tags")) return null;
  for (const r of refspecs.length ? refspecs : ["HEAD"]) {
    if (r.startsWith("+")) return MSG_FORCE;
    const dst = destino(r);
    if (dst === "" || dst?.includes("*")) return MSG_VARIAS;
    if (dst && RAMA_PROTEGIDA.test(dst)) return "Push directo a rama protegida. Usá un PR.";
    if (dst === null && rama && RAMA_PROTEGIDA.test(rama))
      return `git push sin rama explícita estando en ${rama}: empujaría una rama protegida. Creá una rama y usá un PR. ` +
        `Si cambiaste de rama en el mismo comando, nombrala: git push -u origin <rama>.`;
  }
  return null;
}

/** Rama después de un checkout/switch. checkout también recibe archivos: sin -b, solo cuenta si es una rama protegida. */
function ramaTrasCambio(sub, args, rama) {
  if (args.includes("--detach") || args.includes("-")) return null;
  const conIgual = args.find((a) => /^--(create|force-create|orphan)=/.test(a));
  if (conIgual) return conIgual.split("=")[1] || null;
  const i = args.findIndex((a) => CREAR_RAMA.has(a));
  if (i >= 0) return args[i + 1] || null;
  const track = args.findIndex((a) => a === "-t" || /^--track(=|$)/.test(a));
  if (track >= 0) {
    const remota = args.slice(track + 1).find((a) => !a.startsWith("-")); // origin/main → main
    return remota ? remota.replace(/^[^/]+\//, "") : null;
  }
  const x = args.find((a) => !a.startsWith("-"));
  if (!x || args.includes("--")) return rama;
  return sub === "switch" || RAMA_PROTEGIDA.test(x) ? x : rama;
}

function revisarGit(cmd, { cwd = process.cwd(), rama = null, ramaEn = () => null } = {}) {
  let dir = cwd;
  for (const segmento of segmentos(cmd)) {
    let t = tokens(segmento);
    while (t.length && /^\w+=/.test(t[0])) t = t.slice(1); // VAR=valor git ...
    if (t[0] === "popd" || (["cd", "pushd"].includes(t[0]) && t[1] === "-")) { rama = null; continue; }
    if (t[0] === "cd" || t[0] === "pushd") {
      dir = path.resolve(dir, (t[1] || "~").replace(/^~/, os.homedir()));
      rama = ramaEn(dir);
      continue;
    }
    let i = t.indexOf("git"); // también con prefijos: timeout 60 git, sudo git, env X=1 git, ! git
    if (i < 0) continue;
    let ramaSegmento = rama, otroRepo = false;
    for (i++; t[i]?.startsWith("-"); i++) {
      if (t[i] === "-C") { ramaSegmento = ramaEn(path.resolve(dir, t[++i] || ".")); otroRepo = true; }
      else if (/^--(git-dir|work-tree)(=|$)/.test(t[i])) { ramaSegmento = null; otroRepo = true; if (!t[i].includes("=")) i++; }
      else if (t[i] === "-c" || t[i] === "--namespace") i++;
    }
    const sub = t[i], args = t.slice(i + 1);
    if ((sub === "checkout" || sub === "switch") && !otroRepo) rama = ramaTrasCambio(sub, args, rama);
    if (sub === "push") {
      const motivo = revisarPush(args, ramaSegmento);
      if (motivo) return motivo;
    }
  }
  return null;
}

function ramaActual(cwd) {
  try {
    // symbolic-ref: anda en ramas sin commits y en cualquier versión de git; falla si HEAD está desacoplado.
    return execFileSync("git", ["symbolic-ref", "--short", "-q", "HEAD"], { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], timeout: 3000 }).trim() || null;
  } catch {
    return null;
  }
}

function log(linea) {
  try {
    fs.mkdirSync(path.dirname(LOG), { recursive: true });
    fs.appendFileSync(LOG, `${new Date().toISOString()} ${linea}\n`);
  } catch (_) {}
}


/**
 * Si esta es la copia global (~/.claude/hooks) y el proyecto trae su propia
 * copia en .claude/hooks, se cede el control a la del proyecto (evita doble ejecución).
 */
function cederAlProyecto(nombre, cwd) {
  const global = path.join(os.homedir(), ".claude", "hooks");
  if (path.resolve(__dirname) !== path.resolve(global)) return false;
  const proyecto = process.env.CLAUDE_PROJECT_DIR || cwd;
  if (!proyecto) return false;
  const local = path.join(proyecto, ".claude", "hooks", nombre);
  return path.resolve(local) !== path.resolve(__filename) && fs.existsSync(local);
}

// Exportado para tests
module.exports = { revisarBash, revisarArchivo, cederAlProyecto };

if (require.main === module) {
  if (process.env.CLAUDE_GUARDIA_OFF === "1") process.exit(0);

  let input = "";
  process.stdin.on("data", (c) => (input += c));
  process.stdin.on("end", () => {
    let data;
    try { data = JSON.parse(input); } catch { process.exit(0); }
    if (cederAlProyecto("guardia.js", data.cwd)) process.exit(0);

    const tool = data.tool_name || "";
    const ti = data.tool_input || {};
    let motivo = null;

    if (tool === "Bash") {
      const cmd = ti.command || "";
      const cwd = data.cwd || process.cwd();
      const hayPush = /\bpush\b/.test(cmd); // git solo se consulta si hace falta
      motivo = revisarBash(cmd, { cwd, rama: hayPush ? ramaActual(cwd) : null, ramaEn: hayPush ? ramaActual : () => null });
    } else if (["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"].includes(tool))
      motivo = revisarArchivo(tool, ti.file_path || ti.notebook_path);

    if (motivo) {
      const detalle = tool === "Bash" ? ti.command : (ti.file_path || ti.notebook_path);
      log(`BLOQUEADO [${tool}] ${detalle} :: ${motivo}`);
      process.stderr.write(
        `🛑 Bloqueado por guardia: ${motivo}\n` +
        `No intentes rodearlo con otro comando equivalente. ` +
        `Si es necesario, dejá el comando exacto listo y explicale al usuario qué hace, para que lo ejecute él.\n`
      );
      process.exit(2);
    }
    process.exit(0);
  });
}
