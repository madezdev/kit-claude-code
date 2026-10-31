# Kit Claude Code

## Qué trae
- **12 agentes:** investigador, arquitecto, backend, frontend, infraestructura, tester, refactorizador, qa-revisor, seguridad, depurador, documentador, git.
- **4 skills:** `/feature` (flujo completo hasta el PR), `revisar-pr`, `revision-diaria` y `auditoria-semanal` (estas tres, para routines).
- **2 hooks:** `guardia.js` (bloquea infra real, deploys, merges, aprobaciones de PR, push a main y lectura de secretos) y `tamanio.js` (archivos > 400 líneas).

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
Ambos son idempotentes y respetan tu contenido existente: `CLAUDE.md` se actualiza por bloques con marcadores, `settings.json` se fusiona y se hace backup.
Si un repo trae su propia copia de los hooks, la global le cede el control (no corren dos veces).

**Archivos personalizados:** los agentes y skills del kit llevan una marca al final. El instalador solo actualiza los que la conservan; si personalizás uno en un proyecto (por ejemplo, la infraestructura real de ese proyecto), borrá la marca y nunca se va a pisar. Los agentes específicos de cada proyecto (multitenant, pagos, etc.) viven solo en su repo.

## Uso diario
```
/feature agregar sonido configurable al llamado del mozo
```
Vos solo aprobás el plan y mergeás el PR.

## Routines
Ver `RUTINAS.md`.

## Ajustes
- Límites por proyecto: `.claude/limites.json`
- Reglas de la guardia: `hooks/guardia.js` (sumá casos en `test-guardia.js`)
- Desactivar los hooks en una sesión: `CLAUDE_GUARDIA_OFF=1 claude`
