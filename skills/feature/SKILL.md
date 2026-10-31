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
- Actualizá la rama base y creá la rama de trabajo (`feat/...` o `fix/...`, según la convención del repo).
- Si la tarea es ambigua, hacé las preguntas necesarias ahora, todas juntas, antes de seguir.

## 1. Investigación (solo si hace falta)
Si la tarea usa librerías, APIs o servicios externos sobre los que haya dudas → **investigador**.

## 2. Plan
**arquitecto** con la tarea y lo investigado. Mostrame el plan resumido: archivos, pasos, riesgos y qué agente hace cada parte.

⏸️ **Esperá mi OK explícito.** No sigas sin aprobación. Si pido cambios, volvé al arquitecto.

## 3. Implementación
Según el plan → **backend**, **frontend**, **infraestructura** (o los específicos del proyecto, como **pagos**). Partes independientes, en paralelo. Pasales el plan aprobado y la parte que le toca a cada uno.

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
**git**: commits atómicos y PR (draft si quedó algo pendiente).

## Resumen final
- Link del PR
- Qué se hizo, en 3 a 5 líneas
- Resultado de cada revisión (qa, seguridad, multitenant)
- Pendientes, riesgos y cosas para probar a mano
- Pasos manuales (variables de entorno nuevas, migraciones, comandos de infra que tenga que ejecutar yo)

<!-- kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar. -->
