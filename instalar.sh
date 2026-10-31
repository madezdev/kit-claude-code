#!/usr/bin/env bash
# Instalación GLOBAL (~/.claude): agentes, skills, hooks y CLAUDE.md. Se puede correr varias veces.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
C="$HOME/.claude"
mkdir -p "$C/agents" "$C/hooks" "$C/skills"

source "$DIR/lib/copiar.sh"
copiar_administrados "$DIR" "$C"
cp "$DIR"/hooks/*.js "$C/hooks/"
echo "✓ $(ls "$DIR"/agents/*.md | wc -l | tr -d ' ') agentes y $(ls -d "$DIR"/skills/*/ | wc -l | tr -d ' ') skills en $C"

echo "→ Tests de hooks..."
node "$C/hooks/test-guardia.js" && node "$C/hooks/test-tamanio.js"

[ -f "$C/CLAUDE.md" ] && cp "$C/CLAUDE.md" "$C/CLAUDE.md.bak"
node "$DIR/lib/fusionar.js" bloque "$C/CLAUDE.md" "$DIR/CLAUDE.global.md" kit-claude-code

[ -f "$C/settings.json" ] && cp "$C/settings.json" "$C/settings.json.bak"
node "$DIR/lib/fusionar.js" hooks "$C/settings.json" "$C/hooks"
echo "Listo. Reiniciá Claude Code y verificá con /agents, /hooks y /feature."
