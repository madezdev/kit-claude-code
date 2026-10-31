# Flujo de trabajo y calidad (kit Claude Code)

## Flujo de trabajo con agentes
Para tareas no triviales, delegá en los subagentes de ~/.claude/agents:

1. **investigador** → dudas sobre librerías, APIs o tecnologías externas.
2. **arquitecto** → features nuevas o cambios en varios módulos. Mostrame el plan y esperá mi OK antes de implementar.
3. **backend** / **frontend** / **infraestructura** → implementación por área (en paralelo si son independientes).
4. **tester** → tests de lo implementado.
5. **refactorizador** → si quedó código duplicado o archivos/funciones que superan los límites.
6. **qa-revisor** → revisión final. Si el veredicto es ❌, corregí y volvé a revisar.
7. **seguridad** → si se tocó auth, pagos, datos personales, endpoints públicos o infraestructura.
8. **documentador** → si cambió la API, comandos, arquitectura o setup.
9. **git** → commits atómicos y PR, solo después de que qa-revisor apruebe.

Ante cualquier error o test que falla → **depurador**.
Cambios chicos (un archivo, un fix obvio): implementá, qa-revisor y git.

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
