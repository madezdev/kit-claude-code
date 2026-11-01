---
name: feature
description: Flujo completo de desarrollo de una feature o fix con los agentes especializados, desde la investigación hasta el PR.
disable-model-invocation: true
argument-hint: "<descripción de la feature o fix>"
---

# Flujo /feature

Tarea: **$ARGUMENTS**

Orquestá el trabajo delegando en los subagentes de `.claude/agents` (o `~/.claude/agents`). Vos coordinás, no implementás directamente. Al empezar cada fase, informá en una línea en cuál estás.

## 0. Preparación
- `git status`: si hay cambios sin commitear que no son de esta tarea, frená y preguntá.
- **antecedentes** con la tarea. Si da 🔴, frená, mostrame los hallazgos y esperá qué hacer: seguir igual, continuar una rama o un PR que ya existe, o cancelar. Si da 🟡, seguí y pasáselos al arquitecto.
- Actualizá la rama base y creá la rama de trabajo (`feat/...` o `fix/...`, según la convención del repo), salvo que se haya decidido continuar una existente.
- Si la tarea es ambigua, hacé las preguntas necesarias ahora, todas juntas, antes de seguir.

## 1. Investigación (solo si hace falta)
Si la tarea usa librerías, APIs o servicios externos sobre los que haya dudas → **investigador**.

## 2. Plan
**arquitecto** con la tarea, lo investigado y los antecedentes. Mostrame el plan resumido: archivos, pasos, riesgos y qué agente hace cada parte (con sus archivos).

⏸️ **Esperá mi OK explícito.** No sigas sin aprobación. Si pido cambios, volvé al arquitecto.

Con el OK, si hay engram, guardá la decisión con `mem_save`: qué se eligió, por qué y qué alternativa se descartó.

## 3. Implementación
Según el plan → **backend**, **frontend**, **infraestructura** (o los específicos del proyecto, como **pagos**). Las partes independientes van en paralelo solo si no comparten archivos; si comparten, en secuencia. Pasales el plan aprobado y la parte que le toca a cada uno.

## 4. Tests
**tester** sobre lo implementado. Si encuentra bugs → **depurador** y volvé a correr los tests.

## 5. Calidad
- **refactorizador** si quedaron archivos > 400 líneas, funciones largas o código duplicado.
- **qa-revisor** sobre el diff completo.
- **seguridad** si se tocó auth, permisos, pagos, datos personales, endpoints públicos o infraestructura.
- **multitenant** (si existe en el proyecto) si se tocaron datos, endpoints, caché o eventos.

Si alguno da ❌ o hallazgos 🔴 / críticos → el agente que corresponda los corrige → repetí esta fase. Máximo 3 vueltas; si sigue fallando, frená y explicame qué pasa.

## 6. Documentación
**documentador** si cambiaron APIs, comandos, variables de entorno o arquitectura.

## 7. Entrega
**git**: commits atómicos y PR (draft si quedó algo pendiente). Si la rama ya tenía un PR abierto, se actualiza ese.

## Resumen final
Antes de mostrarlo, si hay engram: guardá con `mem_save` lo que los agentes marcaron **Para memoria**, valga la pena y no hayas guardado ya, y cerrá con `mem_session_summary`.

- Link del PR
- Qué se hizo, en 3 a 5 líneas
- Resultado de cada revisión (qa, seguridad, multitenant)
- Pendientes, riesgos y cosas para probar a mano
- Pasos manuales (variables de entorno nuevas, migraciones, comandos de infra que tenga que ejecutar yo)

<!-- kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar. -->
