---
name: feature
description: Flujo completo de una feature o fix con los agentes especializados, desde los antecedentes hasta el PR. Si no entra en un PR, la parte en tareas chicas, cada una en su propia sesión.
disable-model-invocation: true
argument-hint: "<descripción de la feature o fix, o el brief de una tarea de un plan aprobado>"
---

# Flujo /feature

Tarea: **$ARGUMENTS**

Al empezar cada fase, informá en una línea en cuál estás. Cada llamada relee todo el contexto de la sesión, así que leé lo justo (`rg` y lectura por rango), agrupá los comandos independientes y no vuelques archivos ni salidas enteras.

## 0. Preparación
- `git status`: si hay cambios sin commitear que no son de esta tarea, frená y preguntá.
- Si `$ARGUMENTS` es el brief de una tarea de un plan ya aprobado (dice de qué feature es y qué número de tarea), salteá antecedentes, investigación y plan: andá directo a la fase 3.
- Si `$ARGUMENTS` corrige o completa una funcionalidad cuyo PR sigue abierto (observaciones de la revisión, un test que falta), trabajá en esa rama y sumale commits a ese PR: no se abre otro. Si ese PR ya se mergeó, es un fix nuevo, con su rama desde la de integración actualizada.
- **antecedentes** con la tarea. Si da 🔴, frená, mostrame los hallazgos y esperá qué hacer: seguir igual, continuar una rama o un PR que ya existe, o cancelar. Si da 🟡, seguí y pasáselos al arquitecto.
- Si la tarea es ambigua, hacé las preguntas necesarias ahora, todas juntas, antes de seguir.

## 1. Investigación (solo si hace falta)
Si la tarea usa librerías, APIs o servicios externos sobre los que haya dudas → **investigador**.

## 2. Plan
**arquitecto** con la tarea, lo investigado y los antecedentes. Mostrame el plan resumido: archivos, pasos y riesgos.

**Si no entra en un PR** (más de ~400 líneas de diff, o partes que se pueden entregar por separado), el plan es una lista de tareas: un PR por funcionalidad no significa acumular cambios sin límite. Cada una:
- se entrega sola: compila, pasa la gate y no deja nada roto a medias (si hace falta, sin cablear todavía o detrás de un flag);
- trae un brief que se entiende sin esta conversación: de qué feature es y qué número de tarea, objetivo, archivos, qué es "hecho", qué gate correr y de qué tarea depende;
- no comparte archivos con otra que vaya en paralelo.

⏸️ **Esperá mi OK explícito.** No sigas sin aprobación. Si pido cambios, volvé al arquitecto.

Con el OK, si hay engram, guardá la decisión con `mem_save`: qué se eligió, por qué y qué alternativa se descartó.

**Con varias tareas, esta sesión hace solo la primera** (fases 3 a 8). Cada una de las siguientes va en su propia sesión nueva, con `/feature <brief>`: si podés abrir sesiones (en la app de escritorio), proponé una por tarea; si no, dejame los briefs listos para pegar. Una tarea que depende de otra arranca cuando esa tenga su PR.

## 3. Implementación
- Actualizá la rama base y creá la rama de trabajo (`feat/...` o `fix/...`, según la convención del repo), salvo que se haya decidido continuar una existente.
- Una tarea chica de un área la implementás vos, con sus tests. Delegá en **backend**, **frontend**, **infraestructura** (o los específicos del proyecto, como **pagos**) y **tester** cuando hay partes independientes que pueden ir en paralelo, y solo si no comparten archivos. Pasales el plan aprobado y la parte que le toca a cada uno.
- Un error que no entendés después de un par de intentos → **depurador**.

## 4. Gate
Lint, typecheck y tests del scope tocado, con los comandos del proyecto. Filtrá la salida hasta el primer error. Si algo queda en rojo, corregilo antes de seguir.

## 5. Calidad
- **refactorizador** si quedaron archivos sobre los límites, funciones largas o código duplicado.
- **qa-revisor** con el diff (o la lista de archivos) y el resultado de la gate, para que no la vuelva a correr.

Si da ❌ o hallazgos 🔴 → corregí → repetí esta fase. Máximo 3 vueltas; si sigue fallando, frená y explicame qué pasa.

## 6. Seguridad antes del PR
Siempre que el diff cambie código (si es solo documentación, salteala). Commiteá antes: los chequeos comparan contra la rama base.
- **Mecánicos**, siempre: `seguridad.sh <rama-base>` (pnpm audit, Semgrep, gitleaks) y `node lint-cambios.js <rama-base>` (ESLint del proyecto sobre lo commiteado). Están en `.claude/checks/` o, con la instalación global, en `~/.claude/checks/`.
- **Revisores, solo si el diff toca su terreno**, en paralelo y cada uno con el diff:
  - **revisor-seguridad**: backend, auth, pagos, endpoints, datos o inputs externos.
  - **multitenant** (si existe en el proyecto): datos, endpoints, caché o eventos.
  - **seguridad**: infraestructura, configuración o dependencias.

  Un diff solo de UI, estilos, textos o docs no necesita ninguno.

Un chequeo que falla o un hallazgo Crítico o Alto → corregí → repetí esta fase (máximo 3 vueltas). No sigas a la entrega con algo de esto pendiente: el hook pre-PR lo bloquearía igual.

## 7. Documentación
**documentador** si cambiaron APIs, comandos, variables de entorno o arquitectura.

## 8. Entrega
**git**: commits atómicos y PR (draft si quedó algo pendiente). Si la rama ya tenía un PR abierto, los commits van a ese y se actualiza su descripción: no se abre otro. La descripción lleva el alcance, los criterios de aceptación con la evidencia de las pruebas, los cambios de configuración, datos o migraciones, y los riesgos con la forma de revertir. Si se introdujo un patrón de diseño, dice cuál y qué necesidad concreta lo justifica. Si la tarea es parte de un plan, el PR dice de qué feature es y qué tareas faltan.

Con el PR abierto, esta sesión terminó: lo que siga va en otra. Las correcciones de la revisión van a esa misma rama y ese mismo PR.

## Resumen final
Antes de mostrarlo, si hay engram: guardá con `mem_save` lo que los agentes marcaron **Para memoria**, valga la pena y no hayas guardado ya, y cerrá con `mem_session_summary`.

- Link del PR
- Qué se hizo, en 3 a 5 líneas
- Resultado de cada revisión (qa, chequeos mecánicos, revisor-seguridad, multitenant)
- Pendientes, riesgos y cosas para probar a mano
- Pasos manuales (variables de entorno nuevas, migraciones, comandos de infra que tenga que ejecutar yo)

<!-- kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar. -->
