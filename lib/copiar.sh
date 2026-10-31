# Copia agentes y skills del kit sin pisar archivos personalizados del proyecto:
# solo se sobrescriben los que no existen o conservan la marca del kit.
copiar_administrados() {
  local origen="$1" destino="$2" omitidos=0
  mkdir -p "$destino/agents" "$destino/skills"
  for f in "$origen"/agents/*.md; do
    local d="$destino/agents/$(basename "$f")"
    if [ ! -f "$d" ] || grep -q "kit-claude-code: archivo administrado" "$d"; then cp "$f" "$d"
    else echo "  · conservo $d (personalizado)"; omitidos=$((omitidos+1)); fi
  done
  for s in "$origen"/skills/*/; do
    local n; n="$(basename "$s")"; local d="$destino/skills/$n/SKILL.md"
    if [ ! -f "$d" ] || grep -q "kit-claude-code: archivo administrado" "$d"; then mkdir -p "$destino/skills/$n"; cp -r "$s". "$destino/skills/$n/"
    else echo "  · conservo $d (personalizado)"; omitidos=$((omitidos+1)); fi
  done
}
