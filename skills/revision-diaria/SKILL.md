---
name: revision-diaria
description: Revisión de los cambios mergeados a la rama principal en las últimas 24 horas (seguridad, multitenant, calidad). Abre un issue solo si encuentra problemas. Pensada para routines programadas.
---

# Revisión diaria

Corrés sin supervisión humana. **No modifiques código.**

1. `git fetch` y `git log --since="24 hours ago" --first-parent` sobre la rama de integración del proyecto (la que el CLAUDE.md indica como destino de los PRs; si no indica ninguna, la rama por defecto). Si no hay commits, terminá sin hacer nada.
2. Juntá el diff acumulado de esos commits.
3. Delegá en paralelo **seguridad**, **multitenant** (si existe) y **qa-revisor** sobre ese diff. Es una segunda red: buscá lo que se pudo escapar en la revisión de cada PR (interacciones entre PRs, configuración, secretos).
4. Corré la suite de tests completa en esa misma rama.

## Entrega
- Hallazgos 🔴 / críticos o tests que fallan → abrí un issue "Revisión diaria AAAA-MM-DD" con los hallazgos (archivo:línea, PR o commit de origen, sugerencia), con la etiqueta `bug` o `security` según corresponda.
- Solo hallazgos menores → listalos en el resumen de la sesión, sin crear issue.
- Nada → terminá sin crear nada.

<!-- kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar. -->
