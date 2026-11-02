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

# Copia un archivo suelto del kit (chequeos, plantillas) con el mismo criterio:
# solo si el destino no existe o conserva la marca del kit.
copiar_si_administrado() {
  local origen="$1" destino="$2"
  if [ ! -f "$destino" ] || grep -q "kit-claude-code: archivo administrado" "$destino"; then
    mkdir -p "$(dirname "$destino")"; cp "$origen" "$destino"
  else echo "  · conservo $destino (personalizado)"; fi
}

# Chequeos del kit. El package.json (que fuerza CommonJS) no lleva marca: se copia solo si falta.
copiar_checks() {
  local f
  mkdir -p "$2/checks"
  for f in "$1"/checks/*; do
    [ "$(basename "$f")" = package.json ] && { [ -f "$2/checks/package.json" ] || cp "$f" "$2/checks/"; continue; }
    copiar_si_administrado "$f" "$2/checks/$(basename "$f")"
  done
  chmod +x "$2/checks/seguridad.sh"
}

# Corre los tests de hooks de un directorio y los del instalador
correr_tests() {
  local t
  for t in "$1"/test-*.js "$2"/lib/test-*.js; do node "$t" || { echo "✗ falló $t: no se instaló nada"; return 1; }; done
}
