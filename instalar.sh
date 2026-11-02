#!/usr/bin/env bash
# Instalación GLOBAL (~/.claude): agentes, skills, hooks, chequeos y CLAUDE.md. Se puede correr varias veces.
set -euo pipefail
DIR="$(cd "$(dirname "$0")" && pwd)"
C="$HOME/.claude"
source "$DIR/lib/copiar.sh"
# Antes de copiar nada, para no dejar la instalación a medias
node "$DIR/lib/fusionar.js" validar "$C/settings.json"
node "$DIR/lib/fusionar.js" paquete-hooks "$C/hooks"
echo "→ Tests de hooks e instalador..."
correr_tests "$DIR/hooks" "$DIR"

mkdir -p "$C/agents" "$C/hooks" "$C/skills" "$C/checks"
copiar_administrados "$DIR" "$C"
cp "$DIR"/hooks/*.js "$C/hooks/"
copiar_checks "$DIR" "$C"
echo "✓ $(ls "$DIR"/agents/*.md | wc -l | tr -d ' ') agentes y $(ls -d "$DIR"/skills/*/ | wc -l | tr -d ' ') skills en $C"

[ -f "$C/CLAUDE.md" ] && cp "$C/CLAUDE.md" "$C/CLAUDE.md.bak"
node "$DIR/lib/fusionar.js" bloque "$C/CLAUDE.md" "$DIR/CLAUDE.global.md" kit-claude-code

[ -f "$C/settings.json" ] && cp "$C/settings.json" "$C/settings.json.bak"
node "$DIR/lib/fusionar.js" hooks "$C/settings.json" "$C/hooks"
echo "Listo. Reiniciá Claude Code y verificá con /agents, /hooks y /feature."
command -v semgrep >/dev/null && command -v gitleaks >/dev/null || echo "⚠ Faltan semgrep y/o gitleaks: el chequeo antes de abrir un PR los necesita (brew install semgrep gitleaks)."
