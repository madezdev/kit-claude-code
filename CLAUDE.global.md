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
7. **seguridad** → si se tocó auth, pagos, datos personales, endpoints públicos o infraestructura.
8. **documentador** → si cambió la API, comandos, arquitectura o setup.
9. **git** → commits atómicos y PR, solo después de que qa-revisor apruebe.

Ante cualquier error o test que falla → **depurador**.
Cambios chicos (un archivo, un fix obvio): implementá, qa-revisor y git.

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
- **No repetir código**: antes de crear una función, componente, hook, util o tipo, buscá si ya existe algo igual o parecido y reutilizalo.
- **Tamaño**: archivos ≤ 400 líneas (500 tope absoluto, tests hasta 600), funciones ≤ ~50 líneas, máximo 3 niveles de anidamiento. Un hook avisa automáticamente si un archivo se pasa.
- **Componentes y módulos chicos** con una sola responsabilidad: subcomponentes, custom hooks, servicios y utilidades en archivos propios.
- Nombres que expliquen la intención; early returns en vez de ifs anidados.
- Los proyectos pueden ajustar límites en `.claude/limites.json`.

## Reglas generales
- Cada proyecto define en su CLAUDE.md la **rama de integración** (destino de los PRs, ej. develop). Sin push directo a ella ni a main.
- Respetá las convenciones del proyecto por encima de estas reglas genéricas.
- Antes de dar algo por terminado, corré typecheck, linter y tests.
- Nunca ejecutes comandos que modifiquen infraestructura real o datos de producción, ni mergees PRs.
- Commits en Conventional Commits.
- Respondeme en español.
