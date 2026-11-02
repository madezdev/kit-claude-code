# Kit Claude Code

## Qué trae
- **13 agentes:** antecedentes, investigador, arquitecto, backend, frontend, infraestructura, tester, refactorizador, qa-revisor, seguridad, depurador, documentador, git.
- **4 skills:** `/feature` (flujo completo hasta el PR), `revisar-pr`, `revision-diaria` y `auditoria-semanal` (estas tres, para routines).
- **2 hooks:** `guardia.js` (bloquea infra real, deploys, merges, aprobaciones de PR, push a main y demás ramas protegidas, incluidos un `git push` sin rama estando en una de ellas y `--all`/`--branches`/`--mirror`, y lectura de secretos) y `tamanio.js` (archivos > 400 líneas).

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

## Trabajo duplicado y memoria
- **antecedentes** corre antes de cada tarea no trivial (paso 0 de `/feature`). Revisa la memoria, los PRs, los issues, las ramas, los worktrees, el historial y el código para saber si la tarea ya se hizo, si otro agente o persona la está haciendo, o si se descartó. Si da 🔴, el flujo frena y te pregunta.
- Los agentes en paralelo no comparten archivos: el plan del arquitecto asigna archivos a cada uno.
- Las routines no duplican PRs, issues ni revisiones: antes de crear algo, miran lo que ya está abierto en GitHub.
- **Memoria con engram (opcional):** si está instalado, los agentes consultan la memoria y la sesión principal guarda las decisiones aprobadas y las causas de los bugs. Los subagentes no guardan: proponen con "Para memoria:" y la sesión principal decide. Sin engram, por ejemplo en las routines, todo funciona igual. Es una regla de las instrucciones, no un bloqueo técnico: los agentes sin `tools:` heredan todas las herramientas. Los que tienen `tools:` restringido solo leen de engram: arquitecto, qa-revisor y seguridad usan `mem_search` y `mem_get_observation`, y antecedentes además `mem_context`. git y documentador no lo usan. Funciona tanto con engram instalado como servidor MCP como con el plugin.

## Routines
Ver `RUTINAS.md`.

## Ajustes
- Límites por proyecto: `.claude/limites.json`
- Reglas de la guardia: `hooks/guardia.js` (sumá casos en `test-guardia.js`)
- Tests del kit (los instaladores los corren solos): `node hooks/test-guardia.js && node hooks/test-tamanio.js && node lib/test-fusionar.js`
- Desactivar los hooks en una sesión: `CLAUDE_GUARDIA_OFF=1 claude`
