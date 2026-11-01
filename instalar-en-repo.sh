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
# Antes de copiar nada: un settings.json inválido dejaría la instalación a medias.
node "$DIR/lib/fusionar.js" validar "$C/settings.json"
mkdir -p "$C/hooks"
source "$DIR/lib/copiar.sh"
copiar_administrados "$DIR" "$C"
cp "$DIR"/hooks/*.js "$C/hooks/"
[ -f "$C/limites.json" ] || echo '{ "codigo": 400, "tests": 600, "ignorar": [] }' > "$C/limites.json"
echo "✓ $(ls "$C"/agents/*.md | wc -l | tr -d ' ') agentes y $(ls -d "$C"/skills/*/ | wc -l | tr -d ' ') skills en $C"

node "$C/hooks/test-guardia.js" && node "$C/hooks/test-tamanio.js" && node "$DIR/lib/test-fusionar.js"
node "$DIR/lib/fusionar.js" bloque "$REPO/CLAUDE.md" "$DIR/CLAUDE.global.md" kit-claude-code
node "$DIR/lib/fusionar.js" hooks "$C/settings.json" '$CLAUDE_PROJECT_DIR/.claude/hooks'

cat << MSG

Listo. Revisá y commiteá en una rama (no en main ni develop):
  git -C "$REPO" status

Si es la primera vez en este repo, agregá al CLAUDE.md del proyecto:
  - Rama de integración (destino de los PRs), por ejemplo: develop
  - Estructura real y comandos (install, dev, test, lint, typecheck, build)

No commitees .claude/settings.local.json (es personal).
MSG
