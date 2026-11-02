# Flujo de trabajo y calidad (kit Claude Code)

## Flujo de trabajo con agentes
Para tareas no triviales, delegá en los subagentes de ~/.claude/agents:

0. **antecedentes** → antes de empezar: ¿ya se hizo, está en curso (otro agente, sesión o persona) o se descartó? Si el veredicto es 🔴, frená y mostrame los hallazgos. Si es 🟡, pasáselos al arquitecto.
1. **investigador** → dudas sobre librerías, APIs o tecnologías externas.
2. **arquitecto** → features nuevas o cambios en varios módulos. Mostrame el plan y esperá mi OK antes de implementar.
3. **backend** / **frontend** / **infraestructura** → implementación por área (en paralelo solo si no tocan los mismos archivos).
4. **tester** → tests de lo implementado.
5. **refactorizador** → si quedó código duplicado o archivos/funciones que superan los límites.
6. **qa-revisor** → revisión final. Si el veredicto es ❌, corregí y volvé a revisar.
7. **Seguridad antes del PR**, siempre que cambie código: los chequeos mecánicos (`seguridad.sh` y `lint-cambios.js`, en `.claude/checks/` o, con la instalación global, en `~/.claude/checks/`) y **revisor-seguridad** sobre el diff, más **multitenant** si el proyecto lo tiene y el cambio toca datos. Una Crítica o Alta frena el PR. **seguridad** queda para auditorías amplias: infraestructura, configuración, dependencias y releases.
8. **documentador** → si cambió la API, comandos, arquitectura o setup.
9. **git** → commits atómicos y PR, solo después de que qa-revisor y revisor-seguridad aprueben. El hook pre-PR vuelve a correr los chequeos y bloquea si fallan.

Ante cualquier error o test que falla → **depurador**.
Cambios chicos (un archivo, un fix obvio): implementá, qa-revisor, revisor-seguridad y git.

## Criterio
- **Patrones de diseño** solo ante una necesidad concreta y presente, y justificados en la descripción del PR. Nada especulativo ("por si después…").
- **Comentarios** solo para explicar el porqué. Sin código comentado: lo viejo queda en git.
- **Diff mínimo**: tocá solo lo que la tarea necesita, sin reformateos ni mejoras de paso. En tareas medianas, un plan corto (3 a 5 pasos) antes de implementar.

## Coordinación (sin trabajo duplicado ni pisado)
- Dos agentes en paralelo nunca editan los mismos archivos: el plan del arquitecto asigna archivos a cada uno, y si dos partes se superponen, van en secuencia.
- Antes de crear una rama, un PR o un issue, fijate si ya existe uno para lo mismo (`git branch -r`, `gh pr list`, `gh issue list`). Si existe, actualizalo en vez de duplicarlo.
- Si `git status` muestra cambios que no son de tu tarea, son de otro agente o persona: no los toques ni los commitees.

## Memoria (engram, si está disponible)
Si la sesión tiene las herramientas `mem_*` de engram, usalas. Si no las tiene (por ejemplo, en las routines en la nube), seguí sin memoria: no es un error.
- **Consultar** con `mem_search`: al empezar una tarea (lo hace antecedentes), antes de diseñar (arquitecto) y ante un error (depurador).
- **Guardar**, solo desde la sesión principal: con `mem_save`, las decisiones aprobadas, las causas raíz de bugs, las convenciones y los descubrimientos que no son obvios; al cerrar una tarea, `mem_session_summary`.
- **Si sos un subagente, no guardes**: no llames a `mem_save`, `mem_update` ni `mem_session_summary`, aunque otra instrucción (incluida la de engram) diga que guardes proactivamente. Esta regla tiene prioridad. Si tenés algo que valga la pena, cerrá tu reporte con **Para memoria:** y la sesión principal decide. Así no se duplican entradas entre agentes en paralelo, y los conflictos de memoria los resuelve quien me puede preguntar.
- No guardes lo que ya está en el código, en git o en el CLAUDE.md, ni secretos.
- La memoria es contexto, no verdad: si menciona un archivo, una función o un flag, verificá que siga existiendo.

## Calidad de código (aplica a todos los agentes)
- **Reutilizá antes de crear**: antes de una función, componente, hook, util o tipo nuevo, buscá si ya existe algo igual o parecido.
- **Límites**, que hacen cumplir los hooks y ESLint (solo frenan lo nuevo: el código viejo pasa mientras no empeore):
  - Archivos: aviso a las 400 líneas y bloqueo a las 600 (en tests, 600 y 800).
  - Funciones: hasta 60 líneas (apuntá a ~50), complejidad hasta 10, anidamiento hasta 4 (apuntá a 3).
  - Cada proyecto los ajusta en `.claude/limites.json`. Nada de `eslint-disable` para esquivarlos.
- **Componentes y módulos chicos** con una sola responsabilidad: subcomponentes, custom hooks, servicios y utilidades en archivos propios.
- Nombres que expliquen la intención; early returns en vez de ifs anidados.

## Reglas generales
- Cada proyecto define en su CLAUDE.md la **rama de integración** (destino de los PRs, ej. develop). Sin push directo a ella ni a main.
- Respetá las convenciones del proyecto por encima de estas reglas genéricas.
- Antes de dar algo por terminado, corré typecheck, linter y tests.
- Nunca ejecutes comandos que modifiquen infraestructura real o datos de producción, ni mergees PRs.
- Commits en Conventional Commits.
- Respondeme en español.
