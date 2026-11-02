---
name: auditoria-semanal
description: Auditoría semanal del repositorio (duplicación, tamaño de archivos, dependencias) que abre un PR draft con arreglos de bajo riesgo. Pensada para routines programadas.
---

# Auditoría semanal

Corrés sin supervisión humana, desde la rama de integración del proyecto (la que el CLAUDE.md indica como destino de los PRs; si no indica ninguna, la rama por defecto), actualizada. El PR draft apunta a esa misma rama.

## 0. Antecedentes
Con `gh` o las herramientas de GitHub de la sesión:
- **PR de una auditoría anterior todavía abierto** (`gh pr list --state open --limit 200 --json number,headRefName,url --jq '.[] | select(.headRefName | startswith("claude/auditoria-"))'`): no abras otro ni hagas arreglos nuevos. Hacé el relevamiento, comentá el reporte de esta semana en ese PR y terminá.
- **Archivos en PRs abiertos** (`gh pr list --state open --limit 200 --json number,files`): quedan fuera de los arreglos, para no pisar trabajo en curso de otros agentes o personas.
- **Arreglos rechazados**: revisá los PRs de auditoría cerrados sin merge (`gh pr list --state closed --limit 200 --json headRefName,mergedAt,title,url --jq '.[] | select((.headRefName | startswith("claude/auditoria-")) and .mergedAt == null)'`) y no repitas un arreglo que ya se rechazó.
- Si no podés consultar GitHub, no crees PR ni issue: dejá el reporte en el resumen de la sesión.

## 1. Relevamiento
- **Tamaño**: archivos de código > 400 líneas (tests > 600), excluyendo generados, migraciones y lo listado en `.claude/limites.json`.
- **Duplicación**: `npx jscpd . --min-lines 6 --ignore "**/node_modules/**,**/dist/**,**/.next/**,**/coverage/**" --reporters console`.
- **Dependencias**: `npm audit` (o el gestor del repo) y `npm outdated`. Separá vulnerabilidades (por severidad) de actualizaciones normales.
- **Código muerto**: exports sin uso (`npx knip`, si está disponible).

## 2. Arreglos de bajo riesgo (solo estos)
- **refactorizador**: como máximo 2 archivos (los peores) o 2 duplicaciones, sin cambiar comportamiento y con tests en verde antes y después.
- Actualizaciones patch/minor de dependencias con vulnerabilidades, si los tests pasan.
- NADA de actualizaciones major, cambios de comportamiento ni infraestructura.

## 3. Entrega
- Si hubo arreglos: **git** → rama `claude/auditoria-AAAA-MM-DD`, commits atómicos, **PR draft** con el reporte en la descripción.
- Si no hubo arreglos pero sí hallazgos: si hay un issue "Auditoría semanal" anterior abierto, comentá ahí el reporte nuevo; si no, abrí un issue "Auditoría semanal AAAA-MM-DD" con el reporte.
- Si no hubo nada: no crees nada.

## Formato del reporte
- Resumen en 3 líneas
- Tabla: archivos más grandes (líneas)
- Duplicaciones principales (ubicaciones)
- Vulnerabilidades por severidad
- Qué se arregló en el PR y qué queda pendiente, priorizado

<!-- kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar. -->
