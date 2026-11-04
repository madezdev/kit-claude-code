#!/usr/bin/env bash
# kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar.
# Chequeos de seguridad del kit. Los corren el hook pre-PR y el CI:
#   .claude/checks/seguridad.sh [--solo-secretos] [rama-base]
# - pnpm audit: vulnerabilidades high/critical. Con "pnpmAudit": "aviso" en
#   .claude/limites.json avisa sin frenar (mientras se resuelven las existentes).
# - Semgrep (p/typescript, p/nodejs, p/nestjs y .semgrep/ si existe): solo los
#   hallazgos nuevos respecto de la rama base, en los archivos JS/TS cambiados.
# - gitleaks: secretos en los commits que no están en la rama base y en lo que
#   todavía no se commiteó (staged, modificado y archivos nuevos).
# --solo-secretos corre solo gitleaks (lo usa el hook antes de cada git push), y
#   sobre lo que el push va a publicar: los commits que no están en ningún remoto.
#   Con la base, una rama de develop en un repo cuyo default es main arrastraba
#   cientos de commits ya publicados, y un falso positivo viejo frenaba todo push.
# La última línea es KIT_FALLAN=<chequeos que fallaron, separados por coma>.
set -o pipefail
DIR_KIT="$(cd "$(dirname "$0")" && pwd)"
cd "$(git rev-parse --show-toplevel)" || exit 2

SOLO_SECRETOS=""
[ "${1:-}" = "--solo-secretos" ] && { SOLO_SECRETOS=1; shift; }
FALLAN=""
falla() { FALLAN="${FALLAN:+$FALLAN,}$1"; echo "✗ $1: $2"; }
terminar() { echo "KIT_FALLAN=$FALLAN"; [ -z "$FALLAN" ]; exit $?; }
existe() { git rev-parse -q --verify "$1^{commit}" >/dev/null; }

# Rama base: origin/<base> antes que <base>; sin base, la por defecto del remoto
resolver_base() {
  local pedida="${1#refs/heads/}" c
  if [ -n "$pedida" ]; then
    for c in "origin/${pedida#origin/}" "$pedida"; do existe "$c" && { echo "$c"; return; }; done
    return 1
  fi
  for c in "$(git symbolic-ref -q --short refs/remotes/origin/HEAD)" origin/main origin/master; do
    [ -n "$c" ] && existe "$c" && { echo "$c"; return; }
  done
  return 1
}
BASE="$(resolver_base "${1:-}")" && DESDE="$(git merge-base HEAD "$BASE")"
if [ -z "$DESDE" ]; then
  falla base "no encontré la rama base ${1:-por defecto del remoto} ni su punto en común con HEAD (pasala como argumento y hacé git fetch)"
  terminar
fi

# Archivos cambiados respecto de la base, con nombres en crudo (-z: acentos y espacios)
cambiados() {
  git -c core.quotePath=false diff -z --name-only --diff-filter=ACMR "$DESDE" HEAD -- \
    '*.ts' '*.tsx' '*.mts' '*.cts' '*.js' '*.jsx' '*.mjs' '*.cjs'
}

chequear_audit() {
  if [ ! -f pnpm-lock.yaml ]; then echo "· pnpm audit: no hay pnpm-lock.yaml en la raíz"; return; fi
  local modo salida
  modo="$(node -e 'console.log(require(process.argv[1]).cargarLimites(process.argv[2]).pnpmAudit)' "$DIR_KIT/../hooks/comun.js" "$PWD" 2>/dev/null || echo bloqueo)"
  if salida="$(pnpm audit --audit-level high 2>&1)"; then echo "✓ pnpm audit"; return; fi
  if echo "$salida" | grep -qE 'ERR_PNPM|ENOTFOUND|ETIMEDOUT|ECONNRESET'; then
    falla pnpm-audit "no se pudo consultar el registry ($(echo "$salida" | grep -m1 -oE 'ERR_PNPM_[A-Z_]+|E[A-Z]+'))"
  elif [ "$modo" = "aviso" ]; then
    echo "⚠ pnpm audit: hay vulnerabilidades high/critical (modo aviso: no frena)"
  else
    falla pnpm-audit "vulnerabilidades high/critical"
    echo "$salida" | grep -E '│ (high|critical) ' | head -20
  fi
  echo "$salida" | tail -3
}

chequear_semgrep() {
  local archivos=() f salida codigo
  while IFS= read -r -d '' f; do [ -f "$f" ] && archivos+=("$f"); done < <(cambiados)
  if [ ${#archivos[@]} -eq 0 ]; then echo "✓ semgrep (sin archivos JS/TS cambiados)"; return; fi
  if ! command -v semgrep >/dev/null; then falla semgrep "no está instalado (brew install semgrep o pip install semgrep)"; return; fi
  local args=(scan --config p/typescript --config p/nodejs --config p/nestjs --error --metrics=off --quiet --disable-version-check --baseline-commit "$DESDE")
  [ -d .semgrep ] && args+=(--config .semgrep)
  # En un worktree limpio de HEAD: --baseline-commit no corre con cambios sin commitear,
  # y así tampoco se mezclan los de otro agente que trabaja en el mismo checkout.
  local limpio
  limpio="$(mktemp -d "${TMPDIR:-/tmp}/kit-semgrep.XXXXXX")" && git worktree add -q --detach "$limpio" HEAD 2>/dev/null
  salida="$(cd "$limpio" && semgrep "${args[@]}" "${archivos[@]}" 2>&1)"; codigo=$?
  git worktree remove --force "$limpio" 2>/dev/null; rm -rf "$limpio"
  case $codigo in
    0) echo "✓ semgrep" ;;
    1) falla semgrep "hallazgos nuevos"; echo "$salida" | tail -40 ;;
    *) falla semgrep "Semgrep no pudo correr (código $codigo)"; echo "$salida" | tail -10 ;;
  esac
}

# gitleaks sale con 3 si encuentra algo (con 1, por error)
gitleaks_en() {
  local salida codigo
  salida="$(gitleaks "$@" --redact --verbose --no-banner --exit-code 3 2>&1)"; codigo=$?
  [ $codigo -eq 0 ] && return 0
  [ $codigo -eq 3 ] && { echo "$salida" | grep -E '^(RuleID|File|Line|Commit):'; return 3; }
  echo "(gitleaks $1 falló con código $codigo: $(echo "$salida" | tail -1))"; return 1
}

chequear_gitleaks() {
  if ! command -v gitleaks >/dev/null; then falla gitleaks "no está instalado (brew install gitleaks)"; return; fi
  local salida="" peor=0 c f rango="$DESDE..HEAD"
  [ -n "$SOLO_SECRETOS" ] && rango="HEAD --not --remotes"
  salida+="$(gitleaks_en git --log-opts="$rango" .)"; c=$?; [ $c -gt $peor ] && peor=$c
  salida+="$(gitleaks_en git --pre-commit --staged .)"; c=$?; [ $c -gt $peor ] && peor=$c
  salida+="$(gitleaks_en git --pre-commit .)"; c=$?; [ $c -gt $peor ] && peor=$c
  while IFS= read -r -d '' f; do
    [ -f "$f" ] || continue
    salida+="$(gitleaks_en dir "$f")"; c=$?; [ $c -gt $peor ] && peor=$c
  done < <(git ls-files -z --others --exclude-standard | head -c 200000)
  case $peor in
    0) echo "✓ gitleaks" ;;
    3) falla gitleaks "posibles secretos (en commits o sin commitear). Sacalos antes de pushear; si ya llegaron a un remoto, rotalos"; echo "$salida" | head -40 ;;
    *) falla gitleaks "gitleaks no pudo correr"; echo "$salida" | tail -5 ;;
  esac
}

if [ -z "$SOLO_SECRETOS" ]; then
  chequear_audit
  chequear_semgrep
fi
chequear_gitleaks
terminar
