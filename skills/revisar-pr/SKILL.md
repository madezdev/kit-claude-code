---
name: revisar-pr
description: Revisión automática de un pull request con los agentes de calidad, publicando el resultado en el PR. Pensada para routines con trigger de GitHub.
argument-hint: "[número de PR]"
---

# Revisión de PR

PR: $ARGUMENTS (si viene vacío, tomalo del evento que disparó la sesión).

Corrés sin supervisión humana. **No modifiques código ni hagas push.** Solo revisás y comentás.

## Pasos
1. Obtené el PR: título, descripción, rama base y head, archivos cambiados y diff completo. Hacé checkout de la rama head.
2. Si es draft o el título empieza con `WIP`, terminá sin comentar.
3. Instalá dependencias y corré lint, typecheck, tests y build (comandos del CLAUDE.md o del package.json).
4. Delegá en paralelo según lo que toque el diff:
   - **qa-revisor**: siempre.
   - **seguridad**: si toca auth, permisos, pagos, datos personales, endpoints, configuración o infraestructura.
   - **multitenant** (si existe en el proyecto): si toca modelos, queries, endpoints, caché, eventos o archivos.
5. Consolidá y deduplicá los hallazgos.

## Publicación
Publicá **un solo comentario** de revisión en el PR (con `gh pr review --comment` o las herramientas de GitHub disponibles en la sesión), y comentarios inline solo para los hallazgos 🔴 / críticos:

```
## 🤖 Revisión automática
**Veredicto:** ✅ / ⚠️ / ❌
**Checks:** lint ✓/✗ · types ✓/✗ · tests ✓/✗ · build ✓/✗
### Hallazgos
🔴 ... (archivo:línea — problema — sugerencia)
🟡 ...
🔵 ...
### Revisado por
qa-revisor · seguridad · multitenant
```

- Nunca apruebes el PR ni pidas cambios formalmente (`--approve` / `--request-changes`). Solo comentarios: la decisión es humana.
- Si no hay hallazgos, decilo en una línea. Sin elogios ni relleno.

<!-- kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar. -->
