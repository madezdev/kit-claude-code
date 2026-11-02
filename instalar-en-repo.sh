#!/usr/bin/env bash
# Instala el kit DENTRO de un repo (.claude/ commiteable), para que lo usen
# las routines en la nube, los worktrees y quien clone el repo.
#   ./instalar-en-repo.sh <ruta-del-repo>
# No pisa agentes ni skills que el proyecto haya personalizado.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
REPO="${1:?Uso: ./instalar-en-repo.sh <ruta-del-repo>}"
REPO="$(cd "$REPO" && pwd)"
# Raíz del repo con rev-parse: acepta worktrees (donde .git es un archivo) y subcarpetas,
# y rechaza repos bare y el interior de .git.
RAIZ="$(git -C "$REPO" rev-parse --show-toplevel 2>/dev/null)" || { echo "✗ $REPO no es un repositorio git con working tree"; exit 1; }
REPO="$RAIZ"

C="$REPO/.claude"
source "$DIR/lib/copiar.sh"
# Antes de copiar nada, para no dejar la instalación a medias: JSON válidos, hooks
# CommonJS posibles y tests del kit en verde (el de complejidad, con el ESLint del repo).
node "$DIR/lib/fusionar.js" validar "$C/settings.json"
node "$DIR/lib/fusionar.js" validar "$C/limites.json"
node "$DIR/lib/fusionar.js" paquete-hooks "$C/hooks"
KIT_ESLINT_DESDE="$REPO" correr_tests "$DIR/hooks" "$DIR"

# pnpm audit que ya falla en el repo: si el proyecto no eligió modo, queda en "aviso"
AUDIT=""
if [ -f "$REPO/pnpm-lock.yaml" ] && ! (cd "$REPO" && pnpm audit --audit-level high >/dev/null 2>&1); then AUDIT="pnpmAudit=aviso"; fi

mkdir -p "$C/hooks" "$C/checks"
copiar_administrados "$DIR" "$C"
cp "$DIR"/hooks/*.js "$C/hooks/"
copiar_checks "$DIR" "$C"
copiar_si_administrado "$DIR/plantillas/eslint.calidad.mjs" "$REPO/eslint.calidad.mjs"
node "$DIR/lib/fusionar.js" limites "$C/limites.json" $AUDIT
echo "✓ $(ls "$C"/agents/*.md | wc -l | tr -d ' ') agentes y $(ls -d "$C"/skills/*/ | wc -l | tr -d ' ') skills en $C"

node "$DIR/lib/fusionar.js" bloque "$REPO/CLAUDE.md" "$DIR/CLAUDE.global.md" kit-claude-code
node "$DIR/lib/fusionar.js" hooks "$C/settings.json" '$CLAUDE_PROJECT_DIR/.claude/hooks'

cat << MSG

Listo. Revisá y commiteá en una rama (no en main ni develop):
  git -C "$REPO" status

Si es la primera vez en este repo:
  - Agregá al CLAUDE.md la rama de integración (destino de los PRs) y los comandos reales.
  - Sumá las reglas de calidad al final de cada eslint.config:
      import calidad from "<ruta>/eslint.calidad.mjs";  export default [...config, ...calidad];
  - Guardá las violaciones que ya existen como línea base (solo se bloquea lo nuevo):
      node .claude/checks/linea-base.js        (con --podar, después de arreglar código)
  - En el CI: .claude/checks/seguridad.sh origin/<rama-base> (con fetch-depth: 0).

No commitees .claude/settings.local.json (es personal).
MSG
