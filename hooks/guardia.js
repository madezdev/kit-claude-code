#!/usr/bin/env node
/**
 * guardia.js — Hook PreToolUse para Claude Code.
 *
 * Bloquea (exit 2) comandos que modifican infraestructura real, publican,
 * destruyen datos o exponen secretos. Funciona aunque uses bypassPermissions.
 *
 * Cada regla tiene un `id`: el bloqueo se anota en guardia.log y en jarvis-brain (ver jarvis.js).
 *
 * Desactivar temporalmente: lanzar Claude con  CLAUDE_GUARDIA_OFF=1 claude
 * (Claude no puede setearla él mismo: el hook lee el entorno de Claude Code,
 * no el de sus comandos). GUARDIA_LOG cambia la ruta del log (para pruebas).
 */
const fs = require("fs");
const os = require("os");
const path = require("path");
const { execFileSync } = require("child_process");
const { cederAlProyecto, leerEntrada, segmentos, tokens } = require("./comun.js");
const { registrarBloqueo } = require("./jarvis.js");

const LOG = process.env.GUARDIA_LOG || path.join(os.homedir(), ".claude", "hooks", "guardia.log");

// ---------------------------------------------------------------------------
// Reglas para comandos Bash. `allow` = excepción que deja pasar el comando.
// ---------------------------------------------------------------------------
const DRY_RUN = /--dry-run|--what-if|\bwhat-if\b|--preview\b/;
// Crear/editar PRs en Azure Repos está permitido (el merge no).
const AZ_PERMITIDO = /--dry-run|--what-if|\bwhat-if\b|^(?!.*(--status\s+completed|--auto-complete\s+true|--merge-commit-message)).*\baz\s+repos\s+pr\s+(create|update|reviewer\s+add|work-item\s+add)\b/;

const REGLAS_BASH = [
  // --- Infraestructura como código ---
  { id: "terraform-aplica", re: /\b(terraform|tofu|terragrunt)\s+(.*\s)?(apply|destroy|import|taint|untaint|force-unlock)\b/, msg: "Terraform/OpenTofu que modifica estado real. Solo plan/validate/fmt." },
  { id: "terraform-state", re: /\b(terraform|tofu)\s+(.*\s)?state\s+(rm|mv|push|replace-provider)\b/, msg: "Modificación directa del state de Terraform." },
  { id: "terraform-workspace", re: /\b(terraform|tofu)\s+(.*\s)?workspace\s+delete\b/, msg: "Borrado de workspace de Terraform." },
  { id: "pulumi-modifica", re: /\bpulumi\s+(up|destroy|import|cancel|state\s+(delete|unprotect))\b/, msg: "Pulumi que modifica recursos reales. Usá pulumi preview." },

  // --- Azure ---
  { id: "az-modifica", re: /\baz\s+(?:[a-z][\w-]*\s+)*?(create|delete|update|set|deploy|start|stop|restart|purge|import|assign|add|remove|up|scale|revoke|regenerate|renew|reset|swap|rotate|upload|build|run|activate|deactivate|attach|detach|move|copy|sync|batch|recover|restore|failover|lock|unlock)\b/, allow: AZ_PERMITIDO, msg: "Comando de Azure CLI que modifica recursos. Solo show/list/what-if." },
  { id: "az-lee-secretos", re: /\baz\s+(keyvault\s+(secret|key|certificate)\s+(show|download|backup)|acr\s+credential\s+show|storage\s+account\s+(keys\s+list|show-connection-string)|cosmosdb\s+keys\s+list|redis\s+list-keys|webapp\s+deployment\s+list-publishing-profiles|ad\s+sp\s+credential)\b/, msg: "Lectura de secretos/credenciales de Azure: no deben entrar al contexto." },
  { id: "az-containerapp-secretos", re: /\baz\s+containerapp\s+(secret\s+(show|list)\b.*--show-values|.*--show-secrets)/, msg: "Lectura de secretos de Container Apps." },
  { id: "az-bicep-deploy", re: /\baz\s+bicep\s+.*\bdeploy\b|\baz\s+stack\s+\w+\s+(create|delete)\b/, msg: "Despliegue de Bicep/deployment stack." },

  // --- AWS / GCP ---
  { id: "aws-modifica", re: /\baws\s+[\w-]+\s+(create|delete|put|update|terminate|run|deploy|attach|detach|modify|start|stop|reboot|remove|revoke|authorize|disable|enable|restore|reset)[\w-]*/, allow: DRY_RUN, msg: "AWS CLI que modifica recursos." },
  { id: "aws-s3-destructivo", re: /\baws\s+s3\s+(rm|rb|mv|sync)\b|\baws\s+s3api\s+delete/, msg: "Operación destructiva en S3." },
  { id: "aws-lee-secretos", re: /\baws\s+secretsmanager\s+get-secret-value|\baws\s+ssm\s+get-parameters?\b.*--with-decryption/, msg: "Lectura de secretos de AWS." },
  { id: "gcloud-modifica", re: /\bgcloud\s+(?:[a-z][\w-]*\s+)*?(create|delete|deploy|update|set-iam-policy|add-iam-policy-binding|remove-iam-policy-binding|reset|stop|start|resize)\b/, msg: "gcloud que modifica recursos." },
  { id: "gcloud-lee-secretos", re: /\bgcloud\s+secrets\s+versions\s+access\b/, msg: "Lectura de secretos de GCP." },


  // --- Plataformas: fly.io, Vercel, Neon, Upstash, Cloudflare (wrangler), Supabase, Railway, Render ---
  { id: "fly-modifica", re: /\b(fly|flyctl)\s+(?:[a-z][\w-]*\s+)*?(deploy|destroy|launch|scale|restart|stop|start|suspend|resume|clone|update|create|remove|rm|delete|kill|attach|detach|extend|fork|promote|failover|import|unset|set|rollback)\b/, allow: /--dry-run|\bfly\w*\s+(?:[a-z][\w-]*\s+)*?(status|list|ls|show|logs|info|config\s+show|releases)\b(?![\s\S]*\b(set|unset|destroy|delete)\b)/, msg: "fly.io que modifica la app, máquinas, volúmenes o secretos de producción." },
  { id: "fly-acceso-prod", re: /\b(fly|flyctl)\s+(ssh\s+console|proxy|postgres\s+connect|pg\s+connect)\b/, msg: "Acceso directo a máquinas o base de datos de producción en fly.io." },
  { id: "vercel-modifica", re: /\bvercel\s+(deploy\b.*--prod|promote|rollback|remove|rm|env\s+(add|rm|remove|pull)|domains\s+(add|rm|remove)|alias|secrets?|project\s+rm|dns\s+(add|rm))\b/, msg: "Vercel que modifica producción, dominios o variables de entorno." },
  { id: "neon-modifica", re: /\b(neonctl|neon)\s+(?:[a-z][\w-]*\s+)*?(delete|create|reset|restore|update|set-primary|set-default|rename)\b/, msg: "Neon que modifica proyectos, ramas, bases o roles." },
  { id: "neon-connection-string", re: /\b(neonctl|neon)\s+connection-string\b/, msg: "Lectura del connection string de Neon (contiene la contraseña)." },
  { id: "upstash-modifica", re: /\bupstash\s+(?:[a-z][\w-]*\s+)*?(delete|create|reset|rename|update|move)\b/, msg: "Upstash que modifica bases de datos." },
  { id: "wrangler-modifica", re: /\bwrangler\s+(r2\s+(bucket|object)\s+(delete|create|put)|secret\s+(put|delete|bulk)|kv\s+(namespace|key|bulk)\s+(delete|put|create)|d1\s+(delete|execute\b.*--remote|migrations\s+apply\b.*--remote)|delete|rollback|versions\s+deploy)\b/, msg: "Cloudflare (wrangler) que modifica R2, KV, D1, secretos o workers en producción." },
  { id: "plataforma-modifica", re: /\b(supabase\s+(db\s+(push|reset)|projects\s+delete|secrets\s+(set|unset))|railway\s+(up|down|delete|variables\s+set)|render\s+(deploy|delete))\b/, msg: "Plataforma cloud que modifica producción." },
  { id: "db-prod-directa", re: /\bredis-cli\b.*(-u|--uri)\s+\S*upstash|\bpsql\b.*neon\.tech/, msg: "Conexión directa a la base de datos de producción." },

  // --- Kubernetes / Helm ---
  { id: "kubectl-modifica", re: /\bkubectl\s+(?:[^|;&]*\s)?(apply|delete|create|patch|replace|scale|edit|drain|cordon|uncordon|taint|annotate|label|set|expose|autoscale)\b/, allow: DRY_RUN, msg: "kubectl que modifica el cluster. Usá --dry-run=server o diff." },
  { id: "kubectl-rollout", re: /\bkubectl\s+rollout\s+(restart|undo|pause|resume)\b/, msg: "kubectl rollout sobre el cluster." },
  { id: "kubectl-lee-secretos", re: /\bkubectl\s+get\s+secrets?\b.*(-o|--output)[\s=]*(yaml|json|jsonpath)/, msg: "Lectura de valores de secrets de Kubernetes." },
  { id: "helm-modifica", re: /\bhelm\s+(install|upgrade|uninstall|delete|rollback)\b/, allow: DRY_RUN, msg: "Helm que modifica el cluster. Usá --dry-run o helm template." },

  // --- Contenedores / publicación / deploy ---
  { id: "docker-push", re: /\bdocker\s+(push|buildx\s+build\s+.*--push)\b|\bdocker\s+buildx\s+build\b.*--push/, msg: "Push de imagen a un registry." },
  { id: "docker-prune", re: /\bdocker\s+(system|volume|image|container|network)\s+prune\b|\bdocker\s+compose\s+down\b.*(-v\b|--volumes)/, msg: "Borrado de volúmenes/imágenes de Docker." },
  { id: "publicar-paquete", re: /\b(npm|pnpm|yarn)\s+publish\b|\bcargo\s+publish\b|\btwine\s+upload\b|\bgh\s+release\s+create\b/, msg: "Publicación de paquete/release." },
  { id: "deploy-prod", re: /\bvercel\b.*--prod\b|\bnetlify\s+deploy\b.*--prod\b|\bfirebase\s+deploy\b|\bfly\s+deploy\b|\bwrangler\s+(deploy|publish)\b/, msg: "Deploy a producción." },

  // --- Git (git push se analiza aparte, en revisarGit) ---
  { id: "pr-aprobar", re: /\bgh\s+pr\s+review\b.*(--approve|-a\b|--request-changes|-r\b)/, msg: "Aprobar o rechazar PRs es decisión humana. Usá --comment." },
  { id: "pr-merge", re: /\bgh\s+pr\s+merge\b|\baz\s+repos\s+pr\s+update\b.*(--status\s+completed|--auto-complete\s+true)/, msg: "Merge de PR: lo hace el humano después de revisar." },
  { id: "git-descarta-cambios", re: /\bgit\s+reset\s+--hard\b|\bgit\s+clean\s+-\w*f/, msg: "Descarta trabajo no commiteado (riesgoso con agentes en paralelo)." },
  { id: "git-borra-rama-principal", re: /\bgit\s+branch\s+-D\s+(main|master|develop|prod)\b/, msg: "Borrado de rama principal." },
  { id: "git-reescribe-historial", re: /\bgit\s+filter-(branch|repo)\b/, msg: "Reescritura del historial." },

  // --- Bases de datos ---
  { id: "prisma-perdida-datos", re: /\bprisma\s+(migrate\s+reset|db\s+push\b.*(--force-reset|--accept-data-loss))/, msg: "Prisma con pérdida de datos." },
  { id: "typeorm-esquema", re: /\b(typeorm|typeorm-ts-node-\w+)\b.*\b(schema:drop|schema:sync)\b/, msg: "TypeORM que borra/sincroniza el esquema." },
  { id: "sql-destructivo", re: /\b(DROP\s+(DATABASE|SCHEMA|TABLE)|TRUNCATE\s+(TABLE\s+)?\w)/i, msg: "SQL destructivo." },
  { id: "db-borrado", re: /\bdropdb\b|\bmongosh?\b.*\.drop(Database)?\(|\bredis-cli\b.*\bFLUSH(ALL|DB)\b/i, msg: "Borrado de base de datos." },

  // --- Sistema / secretos locales ---
  { id: "rm-rf-amplio", re: /\brm\s+(-[a-zA-Z]*\s+)*-[a-zA-Z]*(r[a-zA-Z]*f|f[a-zA-Z]*r)[a-zA-Z]*\s+(\/|~|\$HOME|\.\.?|\*)(\/?\s|\/?$)/, msg: "rm -rf sobre raíz, home o directorio completo." },
  { id: "lee-env", re: /\b(cat|less|more|head|tail|bat|type|grep|sed|awk|cp|scp|base64|xxd|strings)\b[^|;&]*(\s|\/|^)\.env(\.(?!example|sample|template)[\w.-]+)?(\s|$)/, msg: "Lectura de archivo .env con secretos. Usá .env.example." },
  { id: "lee-credenciales", re: /\b(cat|less|more|head|tail|bat|cp|scp|base64)\b[^|;&]*(id_rsa|id_ed25519|\.pem\b|\.pfx\b|\.p12\b|\.key\b|\.aws\/credentials|\.azure\/|\.kube\/config|\.tfstate\b)/, msg: "Lectura de claves/credenciales locales." },
  { id: "volcado-env", re: /\b(printenv|env)\s*($|\|)|\bset\s*\|/, msg: "Volcado de variables de entorno (puede exponer secretos)." },
  { id: "script-remoto", re: /\bcurl\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b|\bwget\b[^|]*\|\s*(sudo\s+)?(ba|z)?sh\b/, msg: "Ejecución de script remoto sin revisar." },
];

// ---------------------------------------------------------------------------
// Archivos protegidos para Read/Edit/Write.
// ---------------------------------------------------------------------------
const ENV_FILE = /(^|[\/\\])\.env(\.(?!example$|sample$|template$)[\w.-]+)?$/;
const SECRET_FILE = /(^|[\/\\])(id_rsa|id_ed25519|id_ecdsa)(\.pub)?$|\.(pem|pfx|p12|key|keystore|jks)$|\.tfstate(\.backup)?$|[\/\\]\.aws[\/\\]credentials$|[\/\\]\.azure[\/\\]|[\/\\]\.kube[\/\\]config$|[\/\\]\.ssh[\/\\]/;

/** Devuelve { id, msg } de la regla que bloquea, o null. */
function revisarArchivo(tool, filePath) {
  if (!filePath) return null;
  const p = filePath.replace(/\\/g, "/");
  if (ENV_FILE.test(p)) {
    return tool === "Read"
      ? { id: "lee-env", msg: "Lectura de .env con secretos. Para ver qué variables existen usá .env.example." }
      : { id: "escribe-env", msg: "Escritura en .env con secretos. Editá .env.example y avisá al humano qué agregar." };
  }
  if (SECRET_FILE.test(p)) return { id: "archivo-secreto", msg: "Acceso a claves, certificados, credenciales o tfstate." };
  return null;
}

/**
 * Devuelve { id, msg } de la regla que bloquea, o null.
 * contexto (opcional): { cwd, rama, ramaEn(dir) } para evaluar los git push contra la rama actual.
 */
function revisarBash(cmd, contexto) {
  for (const r of REGLAS_BASH) {
    if (r.re.test(cmd) && !(r.allow && r.allow.test(cmd))) return { id: r.id, msg: r.msg };
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
const FORCE = { id: "push-force", msg: "git push --force. Usá --force-with-lease si es tu rama." };
const VARIAS = { id: "push-varias-ramas", msg: "git push que abarca varias ramas (--all, --branches, --mirror, ':' o '*'), incluidas las protegidas. Empujá solo tu rama." };

/** Rama destino de un refspec ("HEAD:refs/heads/main" → "main", "feat/x:" → "feat/x"); null = la rama actual; "" = ":" (todas). */
function destino(refspec) {
  if (/\$\(|`/.test(refspec)) return null; // $(git branch --show-current) y similares
  const [src, dst] = refspec.split(":");
  const rama = (dst || src).replace(/^refs\/heads\//, "");
  return rama === "HEAD" || rama === "@" ? null : rama;
}

const PROTEGIDA = { id: "push-rama-protegida", msg: "Push directo a rama protegida. Usá un PR." };
const implicito = (rama) => ({
  id: "push-implicito-protegida",
  msg: `git push sin rama explícita estando en ${rama}: empujaría una rama protegida. Creá una rama y usá un PR. ` +
    `Si cambiaste de rama en el mismo comando, nombrala: git push -u origin <rama>.`,
});

/** Argumentos posicionales de git push (remoto y refspecs), salteando el valor de las opciones que lo llevan. */
function posicionalesDe(args) {
  const posicionales = [];
  for (let i = 0; i < args.length; i++) {
    if (OPCIONES_CON_VALOR.has(args[i])) i++;
    else if (!args[i].startsWith("-")) posicionales.push(args[i]);
  }
  return posicionales;
}

function revisarRefspec(refspec, rama) {
  if (refspec.startsWith("+")) return FORCE;
  const dst = destino(refspec);
  if (dst === null) return rama && RAMA_PROTEGIDA.test(rama) ? implicito(rama) : null;
  if (dst === "" || dst.includes("*")) return VARIAS;
  return RAMA_PROTEGIDA.test(dst) ? PROTEGIDA : null;
}

const esForce = (a) => a === "--force" || /^-[a-z]*f[a-z]*$/.test(a);

function revisarPush(args, rama) {
  if (args.some((a) => /^--(all|branches|mirror)$/.test(a))) return VARIAS;
  if (args.some(esForce)) return FORCE;
  const refspecs = posicionalesDe(args).slice(1); // el primero es el remoto
  if (!refspecs.length && args.includes("--tags")) return null;
  for (const r of refspecs.length ? refspecs : ["HEAD"]) {
    const motivo = revisarRefspec(r, rama);
    if (motivo) return motivo;
  }
  return null;
}

/** Rama que crea un checkout/switch (-b, -c, --create=, --track): el nombre, null si no se sabe, o undefined si no crea ninguna. */
function ramaCreada(args) {
  const conIgual = args.find((a) => /^--(create|force-create|orphan)=/.test(a));
  if (conIgual) return conIgual.split("=")[1] || null;
  const i = args.findIndex((a) => CREAR_RAMA.has(a));
  if (i >= 0) return args[i + 1] || null;
  const track = args.findIndex((a) => a === "-t" || /^--track(=|$)/.test(a));
  if (track < 0) return undefined;
  const remota = args.slice(track + 1).find((a) => !a.startsWith("-")); // origin/main → main
  return remota ? remota.replace(/^[^/]+\//, "") : null;
}

/** Rama después de un checkout/switch. checkout también recibe archivos: sin -b, solo cuenta si es una rama protegida. */
function ramaTrasCambio(sub, args, rama) {
  if (args.includes("--detach") || args.includes("-")) return null;
  const creada = ramaCreada(args);
  if (creada !== undefined) return creada;
  const x = args.find((a) => !a.startsWith("-"));
  if (!x || args.includes("--")) return rama;
  return sub === "switch" || RAMA_PROTEGIDA.test(x) ? x : rama;
}

/** Saca las asignaciones del principio: VAR=valor git ... */
function sinVariables(t) {
  let i = 0;
  while (i < t.length && /^\w+=/.test(t[i])) i++;
  return t.slice(i);
}

/** cd, pushd y popd cambian el directorio y, con él, la rama. true si el segmento era uno de esos. */
function cambiaDirectorio(t, estado) {
  if (!["cd", "pushd", "popd"].includes(t[0])) return false;
  if (t[0] === "popd" || t[1] === "-") {
    estado.rama = null;
    return true;
  }
  estado.dir = path.resolve(estado.dir, (t[1] || "~").replace(/^~/, os.homedir()));
  estado.rama = estado.ramaEn(estado.dir);
  return true;
}

/** Opciones de git antes del subcomando (-C, -c, --git-dir…): índice del subcomando, rama del repo al que apuntan y si es otro repo. */
function opcionesGlobales(t, i, estado) {
  let rama = estado.rama, otroRepo = false;
  for (; t[i]?.startsWith("-"); i++) {
    if (t[i] === "-C") { rama = estado.ramaEn(path.resolve(estado.dir, t[++i] || ".")); otroRepo = true; }
    else if (/^--(git-dir|work-tree)(=|$)/.test(t[i])) { rama = null; otroRepo = true; if (!t[i].includes("=")) i++; }
    else if (t[i] === "-c" || t[i] === "--namespace") i++;
  }
  return { i, rama, otroRepo };
}

/** Un segmento con git: sigue los checkout/switch y revisa los push. */
function revisarSegmentoGit(t, estado) {
  const git = t.indexOf("git"); // también con prefijos: timeout 60 git, sudo git, env X=1 git, ! git
  if (git < 0) return null;
  const { i, rama, otroRepo } = opcionesGlobales(t, git + 1, estado);
  const sub = t[i], args = t.slice(i + 1);
  if ((sub === "checkout" || sub === "switch") && !otroRepo) estado.rama = ramaTrasCambio(sub, args, estado.rama);
  return sub === "push" ? revisarPush(args, rama) : null;
}

function revisarGit(cmd, { cwd = process.cwd(), rama = null, ramaEn = () => null } = {}) {
  const estado = { dir: cwd, rama, ramaEn };
  for (const segmento of segmentos(cmd)) {
    const t = sinVariables(tokens(segmento));
    if (cambiaDirectorio(t, estado)) continue;
    const motivo = revisarSegmentoGit(t, estado);
    if (motivo) return motivo;
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

const HERRAMIENTAS_DE_ARCHIVOS = ["Read", "Edit", "Write", "MultiEdit", "NotebookEdit"];

/** Regla que bloquea la llamada a la herramienta ({ id, msg }) o null. */
function motivoDe(data) {
  const tool = data.tool_name, ti = data.tool_input || {};
  if (HERRAMIENTAS_DE_ARCHIVOS.includes(tool)) return revisarArchivo(tool, ti.file_path || ti.notebook_path);
  if (tool !== "Bash") return null;
  const cmd = ti.command || "", cwd = data.cwd || process.cwd();
  if (!/\bpush\b/.test(cmd)) return revisarBash(cmd, { cwd }); // git solo se consulta si hace falta
  return revisarBash(cmd, { cwd, rama: ramaActual(cwd), ramaEn: ramaActual });
}

const detalleDe = ({ tool_name: tool, tool_input: ti = {} }) => (tool === "Bash" ? ti.command : ti.file_path || ti.notebook_path);

// Exportado para tests
module.exports = { revisarBash, revisarArchivo, REGLAS_BASH };

if (require.main === module) {
  if (process.env.CLAUDE_GUARDIA_OFF === "1") process.exit(0);

  leerEntrada((data) => {
    if (cederAlProyecto(__filename, data.cwd)) process.exit(0);
    const motivo = motivoDe(data);
    if (!motivo) process.exit(0);
    log(`BLOQUEADO [${data.tool_name}] ${detalleDe(data)} :: ${motivo.id} :: ${motivo.msg}`);
    registrarBloqueo({ fuente: "guardia", regla: motivo.id, motivo: motivo.msg, data });
    process.stderr.write(
      `🛑 Bloqueado por guardia (${motivo.id}): ${motivo.msg}\n` +
      `No intentes rodearlo con otro comando equivalente. ` +
      `Si es necesario, dejá el comando exacto listo y explicale al usuario qué hace, para que lo ejecute él.\n`
    );
    process.exit(2);
  });
}
