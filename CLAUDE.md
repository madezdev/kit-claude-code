# kit-claude-code

Kit de agentes, skills y hooks para Claude Code. Qué trae y cómo se instala: `README.md`.

- **Rama de integración:** `main`. Cambios por PR, sin push directo.
- **Tests** (antes de commitear): `node hooks/test-guardia.js && node hooks/test-tamanio.js && node lib/test-fusionar.js`
- `CLAUDE.global.md` es lo que el instalador mete en el CLAUDE.md del usuario o del repo destino. Este archivo, en cambio, es solo para trabajar en el kit.
- Cada agente y skill termina con la marca `<!-- kit-claude-code: archivo administrado... -->`: los instaladores solo pisan los archivos que la tienen. Los archivos nuevos también la llevan.
- Agentes con `tools:` restringido: si necesitan engram, se listan las dos variantes de nombre (`mcp__engram__*` y `mcp__plugin_engram_engram__*`), y solo herramientas de lectura. Los nombres que no existen en la sesión se ignoran.
- Si agregás un agente o una skill, actualizá la lista y los conteos del README.
- Regla nueva en la guardia → casos nuevos en `hooks/test-guardia.js`.
