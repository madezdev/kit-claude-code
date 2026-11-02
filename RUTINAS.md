# Routines en la nube (claude.ai/code/routines)

Requisitos (una sola vez):
1. Kit instalado y commiteado en el repo: `./instalar-en-repo.sh <repo>`. Las routines clonan el repo y no ven tu `~/.claude`. El CLAUDE.md del repo tiene que indicar la rama de integración (en tabloFlow, `develop`): las routines arrancan desde la rama por defecto y las skills usan ese dato para saber qué revisar.
2. App de Claude instalada en el repo de GitHub (obligatoria para los triggers de GitHub).
3. Entorno cloud: el Default sirve (permite npm). Agregá un setup script que instale las dependencias y las herramientas de los chequeos de seguridad (el hook pre-PR las necesita para que la auditoría semanal pueda abrir su PR):
   ```bash
   pnpm install --frozen-lockfile
   pip install --quiet semgrep
   curl -sSL https://github.com/gitleaks/gitleaks/releases/download/v8.30.1/gitleaks_8.30.1_linux_x64.tar.gz | tar -xz -C /usr/local/bin gitleaks
   ```
4. En cada routine, **quitá todos los conectores** (Gmail, Drive, Calendar): no los necesitan y la routine puede usarlos sin pedir permiso.
5. Probá cada una con **Run now** y leé la transcripción: un estado verde solo significa que la sesión arrancó y terminó, no que la tarea salió bien.

Los mensajes de las routines los firma tu usuario de GitHub. Las ejecuciones cuentan contra tu uso y hay un tope diario de corridas.

Las routines no tienen engram: es un servidor MCP local y la nube no lo ve. La regla de memoria del kit (en el CLAUDE.md del repo) indica seguir sin memoria cuando no está. Para no duplicar trabajo, las skills usan GitHub como fuente de verdad: antes de crear algo, revisan los PRs, los issues y las revisiones anteriores.

---

## 1. Revisión de PR
- **Trigger:** GitHub → Pull request → `opened` · filtros **Is draft = false** y **Base branch = develop** (o la rama de integración del proyecto)
- Opcional: un segundo trigger con la acción `labeled` y el filtro **Labels incluye `revisar`**, para pedir una nueva revisión poniendo esa etiqueta.
- **Prompt:**
  > Usá la skill revisar-pr para revisar el pull request que disparó esta sesión. Seguí sus instrucciones al pie de la letra. No modifiques código.

## 2. Revisión diaria
- **Trigger:** Programado → días de semana, 07:07 (evitá la hora en punto)
- **Prompt:**
  > Usá la skill revision-diaria sobre la rama por defecto. Seguí sus instrucciones al pie de la letra. No modifiques código.

## 3. Auditoría semanal
- **Trigger:** Programado → semanal, lunes 06:07
- **Prompt:**
  > Usá la skill auditoria-semanal. Seguí sus instrucciones al pie de la letra. Solo arreglos de bajo riesgo, en un PR draft sobre una rama claude/.

---

Desde la terminal también podés crearlas con `/schedule` y administrarlas con `/schedule list`, `/schedule update` y `/schedule run`.
