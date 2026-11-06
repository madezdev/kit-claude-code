# Flujo de trabajo y calidad (kit Claude Code)

## Tareas chicas, sesiones cortas
Cada llamada al modelo relee todo el contexto de la sesión: una sesión larga es cara y lenta aunque cada paso sea chico.
- **Una tarea = una sesión = un PR** (apuntá a < 400 líneas de diff). Lo que no entra, `/feature` lo parte en tareas así antes de implementar.
- **Cortá la sesión** al abrir el PR o cuando cambia el tema, y también si ya se compactó o pasó las ~100 llamadas. Lo que falta sigue en una sesión nueva con un brief corto (objetivo, archivos, qué es "hecho", qué gate correr), no con el historial.
- **Leé lo justo**: buscá con `rg` y leé por rango, sin `cat` ni `git show` de archivos enteros. Filtrá la salida de tests y gates hasta el primer error.
- **Agrupá** los comandos independientes en una sola llamada: cada ida y vuelta relee todo el contexto.

## Flujo de trabajo con agentes
Para tareas no triviales (el detalle está en `/feature`):

0. **antecedentes** → ¿ya se hizo, está en curso (otro agente, sesión o persona) o se descartó? Si da 🔴, frená y mostrame los hallazgos. Si da 🟡, pasáselos al arquitecto.
1. **investigador** → dudas sobre librerías, APIs o tecnologías externas.
2. **arquitecto** → features nuevas o cambios en varios módulos: el plan, partido en tareas de un PR si no entra en uno. Mostrame el plan y esperá mi OK antes de implementar.
3. **Implementación**: una tarea chica de un área la implementás vos, con sus tests. **backend** / **frontend** / **infraestructura** / **tester** cuando hay partes independientes para ir en paralelo (solo si no tocan los mismos archivos).
4. **refactorizador** → si quedó código duplicado o archivos/funciones que superan los límites.
5. **qa-revisor** → siempre, con el diff y el resultado de la gate en el brief para que no la repita. Si el veredicto es ❌, corregí y volvé a revisar.
6. **Seguridad antes del PR**, siempre que cambie código. Los chequeos mecánicos (`seguridad.sh` y `lint-cambios.js`, en `.claude/checks/` o, con la instalación global, en `~/.claude/checks/`) corren siempre. Los revisores, solo si el diff toca su terreno: **revisor-seguridad** si toca backend, auth, pagos, endpoints, datos o inputs externos; **multitenant** (si el proyecto lo tiene) si toca datos, endpoints, caché o eventos; **seguridad** para infraestructura, configuración, dependencias y releases. Un diff solo de UI, estilos, textos o docs no necesita ninguno. Una Crítica o Alta frena el PR.
7. **documentador** → si cambió la API, comandos, arquitectura o setup.
8. **git** → commits atómicos y PR, solo después de que aprueben qa-revisor y los revisores que correspondían. El hook pre-PR vuelve a correr los chequeos y bloquea si fallan.

Un error que no entendés después de un par de intentos → **depurador**.
Cambios chicos (un archivo, un fix obvio): implementá, qa-revisor y git, más los revisores que active el diff según el paso 6.

## Criterio
- **Patrones de diseño** solo ante una necesidad concreta y presente, y justificados en la descripción del PR. Nada especulativo ("por si después…").
- **Comentarios** solo para explicar el porqué. Sin código comentado: lo viejo queda en git.
- **Diff mínimo**: tocá solo lo que la tarea necesita, sin reformateos ni mejoras de paso. En tareas medianas, un plan corto (3 a 5 pasos) antes de implementar.

## Ramas, PRs y despliegues
Estrategia por defecto (el detalle está en el agente **git**). Si el CLAUDE.md del proyecto define otra, manda la del proyecto.
- **Un PR por funcionalidad y por repo.** Los avances, tests y correcciones de revisión son commits en la misma rama y el mismo PR, aunque lleguen en otra sesión: mientras ese PR siga abierto, no se abre otro.
- **Un PR mergeado está terminado.** Un defecto que aparece después va en un PR de fix nuevo, con una rama nueva desde la de integración actualizada.
- **Ramas**: `feat/` y `fix/` salen de la rama de integración y vuelven a ella. `release/<versión>` sale de un commit de integración validado en QA y va a producción (`main`), y solo recibe correcciones. `hotfix/` sale de `main`, vuelve a `main` y después se reintegra en la rama de integración y en la release activa.
- **El humano** valida en los ambientes que tenga el proyecto (QA, stage), mergea, etiqueta y despliega. Los agentes preparan las ramas, los PRs y los comandos.

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
