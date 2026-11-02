---
name: revisar-pr
description: Revisión automática de un pull request con los agentes de calidad, publicando el resultado en el PR. Pensada para routines con trigger de GitHub.
argument-hint: "[número de PR]"
---

# Revisión de PR

PR: $ARGUMENTS (si viene vacío, tomalo del evento que disparó la sesión).

Corrés sin supervisión humana. **No modifiques código ni hagas push.** Solo revisás y comentás.

## Pasos
1. Obtené el PR con `gh` o las herramientas de GitHub de la sesión: título, descripción, rama base y head, sha del head, archivos cambiados, diff completo, reviews y comentarios (`gh pr view <n> --json title,body,isDraft,baseRefName,headRefName,headRefOid,files,reviews,comments` y `gh pr diff <n>`).
2. Si es draft o el título empieza con `WIP`, terminá sin comentar.
3. Si ya hay una revisión automática del sha actual, terminá sin comentar. Para saberlo, buscá la marca `<!-- revision-automatica:<sha del head> -->` en las reviews y los comentarios. Excepción: si la sesión la disparó la etiqueta `revisar`, es un pedido explícito de nueva revisión, así que seguí. Anotá cuántas marcas de ese sha había al empezar. Si no pudiste leer reviews ni comentarios, seguí: es mejor una revisión repetida que ninguna.
4. Hacé checkout de la rama head, instalá dependencias y corré lint, typecheck, tests y build (comandos del CLAUDE.md o del package.json). Si existe `.claude/checks/seguridad.sh`, corrélo con la rama base del PR (pnpm audit, Semgrep, gitleaks).
5. Delegá en paralelo según lo que toque el diff:
   - **qa-revisor**: siempre.
   - **revisor-seguridad**: siempre que el diff cambie código.
   - **seguridad**: si toca configuración, dependencias o infraestructura.
   - **multitenant** (si existe en el proyecto): si toca modelos, queries, endpoints, caché, eventos o archivos.
6. Consolidá y deduplicá los hallazgos.

## Publicación
Publicá **un solo comentario** de revisión en el PR (con `gh pr review --comment` o las herramientas de GitHub disponibles en la sesión), y comentarios inline solo para los hallazgos 🔴 / críticos. La primera línea es la marca con el sha completo del head, para que la próxima corrida no repita la revisión. Justo antes de publicar, volvé a buscar la marca: si apareció una nueva del mismo sha durante esta corrida (otra sesión en paralelo, por ejemplo por los triggers `opened` y `labeled` a la vez), no publiques.

```
<!-- revision-automatica:<sha del head> -->
## 🤖 Revisión automática
**Veredicto:** ✅ / ⚠️ / ❌
**Checks:** lint ✓/✗ · types ✓/✗ · tests ✓/✗ · build ✓/✗ · audit ✓/✗ · semgrep ✓/✗ · gitleaks ✓/✗
### Hallazgos
🔴 ... (archivo:línea — problema — sugerencia)
🟡 ...
🔵 ...
### Revisado por
qa-revisor · revisor-seguridad · seguridad · multitenant
```

- Nunca apruebes el PR ni pidas cambios formalmente (`--approve` / `--request-changes`). Solo comentarios: la decisión es humana.
- Si no hay hallazgos, decilo en una línea. Sin elogios ni relleno.

<!-- kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar. -->
