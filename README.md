# Kit Claude Code

## Qué trae
- **14 agentes:** antecedentes, investigador, arquitecto, backend, frontend, infraestructura, tester, refactorizador, qa-revisor, revisor-seguridad, seguridad, depurador, documentador, git.
- **4 skills:** `/feature` (flujo completo hasta el PR; una feature grande la parte en tareas de un PR cada una), `revisar-pr`, `revision-diaria` y `auditoria-semanal` (estas tres, para routines).
- **4 hooks:**
  - `guardia.js`: bloquea infra real, deploys, merges, aprobaciones de PR, lectura de secretos y push a main y demás ramas protegidas (incluidos un `git push` sin rama estando en una de ellas y `--all`/`--branches`/`--mirror`).
  - `tamanio.js`: avisa a las 400 líneas y bloquea a las 600, antes de escribir (en tests, 600 y 800).
  - `complejidad.js`: antes de escribir JS/TS, bloquea si la edición suma funciones con complejidad > 10, anidamiento > 4 o más de 60 líneas.
  - `pre-pr.js`: antes de abrir un PR corre `pnpm audit` (high/critical), Semgrep, gitleaks y ESLint, y bloquea si algo falla.
- **Chequeos** (`checks/`): `seguridad.sh` y `lint-cambios.js`, los mismos en el hook pre-PR y en el CI.
- **`eslint.calidad.mjs`**: las mismas reglas para ESLint (complexity, max-depth, max-lines-per-function, max-lines), con los límites de `.claude/limites.json`.

## Instalación
**Global** (todos tus proyectos, en tu máquina):
```bash
./instalar.sh
```
**En un repo** (para commitear: lo usan las routines en la nube, los worktrees y quien clone el repo):
```bash
./instalar-en-repo.sh ~/ruta/tabloflow
./instalar-en-repo.sh ~/ruta/pulso
```
Ambos son idempotentes y respetan tu contenido existente: `CLAUDE.md` se actualiza por bloques con marcadores, sin tocar el resto (por ejemplo, tus reglas de engram), y `settings.json` se fusiona. La instalación global además hace backup de los dos. Si `settings.json` no es JSON válido, el instalador frena sin tocarlo.
Si un repo trae su propia copia de los hooks, la global le cede el control (no corren dos veces).

**Archivos personalizados:** los agentes y skills del kit llevan una marca al final. El instalador solo actualiza los que la conservan; si personalizás uno en un proyecto (por ejemplo, la infraestructura real de ese proyecto), borrá la marca y nunca se va a pisar. Los agentes específicos de cada proyecto (multitenant, pagos, etc.) viven solo en su repo.

## Uso diario
```
/feature agregar sonido configurable al llamado del mozo
```
Vos solo aprobás el plan y mergeás el PR.

Si la feature no entra en un PR (~400 líneas de diff), el plan sale como una lista de tareas, cada una con un brief que se entiende solo. La sesión del plan hace la primera; cada una de las demás va en una sesión nueva con `/feature <brief>`.

## Trabajo duplicado y memoria
- **antecedentes** corre antes de cada tarea no trivial (paso 0 de `/feature`). Revisa la memoria, los PRs, los issues, las ramas, los worktrees, el historial y el código para saber si la tarea ya se hizo, si otro agente o persona la está haciendo, o si se descartó. Si da 🔴, el flujo frena y te pregunta.
- Los agentes en paralelo no comparten archivos: el plan del arquitecto asigna archivos a cada uno.
- Las routines no duplican PRs, issues ni revisiones: antes de crear algo, miran lo que ya está abierto en GitHub.
- **Memoria con engram (opcional):** si está instalado, los agentes consultan la memoria y la sesión principal guarda las decisiones aprobadas y las causas de los bugs. Los subagentes no guardan: proponen con "Para memoria:" y la sesión principal decide. Sin engram, por ejemplo en las routines, todo funciona igual. Es una regla de las instrucciones, no un bloqueo técnico: los agentes sin `tools:` heredan todas las herramientas. Los que tienen `tools:` restringido solo leen de engram: arquitecto, qa-revisor, revisor-seguridad y seguridad usan `mem_search` y `mem_get_observation`, y antecedentes además `mem_context`. git y documentador no lo usan. Funciona tanto con engram instalado como servidor MCP como con el plugin.

## Calidad y seguridad
- **Etapa nueva antes del PR** (paso 6 de `/feature`): los chequeos mecánicos y, si el diff toca backend, auth, pagos, endpoints, datos o inputs externos, **revisor-seguridad**. Revisa fuga de datos entre tenants, firma de los webhooks de Mercado Pago, autorización en endpoints de Nest e inputs sin validar, y una Crítica o Alta frena el PR.
- **Solo se frena lo nuevo:**
  - Los hooks dejan pasar el código viejo que no empeora.
  - En ESLint, las violaciones existentes se guardan como línea base con `node .claude/checks/linea-base.js` (un `eslint-suppressions.json` por paquete) y se achican con `--podar`.
- **Requisitos:** `semgrep` y `gitleaks` instalados (`brew install semgrep gitleaks`), y ESLint (8 o más, con `typescript-eslint` para TS) en el proyecto. Sin ESLint, el hook de complejidad no hace nada y lo cubre el CI.
- **Secretos antes de salir de la máquina:** el hook también corre gitleaks antes de cada `git push` (commits nuevos, staged, modificados y archivos nuevos). Si un PR se abre en el mismo comando que un commit, pide commitear antes.
- **Límites conocidos:**
  - Las reglas de Semgrep de la comunidad cubren poco a NestJS; esa parte la revisa revisor-seguridad.
  - Con `--max-warnings 0`, el aviso de 400 líneas hace fallar el lint en los archivos viejos grandes (las supresiones solo cubren errores).
  - `eslint.calidad.mjs` suma sus overrides a los tests (`GLOBS_TEST` en `hooks/comun.js`): si tu config no lintea tests, revisalo.
- **`pnpm audit` en modo aviso:** mientras se resuelven las vulnerabilidades que ya existen, poné `"pnpmAudit": "aviso"` en `.claude/limites.json`.
- **Jarvis:** cada bloqueo de un hook se anota en `~/jarvis-brain/lessons/<día>.jsonl` con `category: "bloqueo"` y el `id` de la regla. Nunca anota el comando ni el contenido. `JARVIS_BRAIN` cambia la ruta, `JARVIS_OFF=1` lo apaga y `GUARDIA_LOG` cambia el log de la guardia (para pruebas).

## Routines
Ver `RUTINAS.md`.

## Ajustes
- Límites por proyecto: `.claude/limites.json`
- Reglas de la guardia: `hooks/guardia.js` (sumá casos en `test-guardia.js`)
- Tests del kit (los instaladores los corren solos): `for t in hooks/test-*.js lib/test-*.js; do node "$t" || break; done`. El de complejidad necesita ESLint: `KIT_ESLINT_DESDE=<repo con node_modules>`.
- Desactivar los hooks en una sesión: `CLAUDE_GUARDIA_OFF=1 claude`
