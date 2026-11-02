#!/usr/bin/env node
// Corré: node test-pre-pr.js   (qué comandos crean PRs o pushean, y bloqueos de punta a punta con chequeos falsos)
const fs = require("fs");
const os = require("os");
const path = require("path");
const { spawnSync, execFileSync } = require("child_process");
const { accionDe } = require("./pre-pr.js");

const casos = [
  // [herramienta, comando o input, base del PR (null = no crea un PR), ¿pushea?, ¿commitea?]
  ["Bash", "gh pr create --base develop --title 'feat: x'", "develop", false, false],
  ["Bash", "gh pr create --title 'x' --body 'y'", "", false, false],
  ["Bash", "git push -u origin feat/x && gh pr create --fill", "", true, false],
  ["Bash", "gh pr create -B main --draft", "main", false, false],
  ["Bash", "gh pr create --base=develop", "develop", false, false],
  ["Bash", "gh pr new --base develop", "develop", false, false],
  ["Bash", "gh -R madezdev/tabloFlow pr create --base develop", "develop", false, false],
  ["Bash", "gh --repo=madezdev/x pr create", "", false, false],
  ["Bash", "/opt/homebrew/bin/gh pr create --base main", "main", false, false],
  ["Bash", "bash -c \"gh pr create --base main\"", "main", false, false],
  ["Bash", "gh auth status & gh pr create", "", false, false],
  ["Bash", "gh api repos/o/r/pulls -X POST -f title=x -f head=feat/x -f base=develop", "develop", false, false],
  ["Bash", "gh api repos/o/r/pulls -f title=x -f head=feat/x", "", false, false],
  ["Bash", "gh api repos/o/r/pulls", null, false, false],
  ["Bash", "cd apps/api && GH_PROMPT_DISABLED=1 gh pr create --base develop", "develop", false, false],
  ["Bash", "az repos pr create --source-branch feat/x --target-branch refs/heads/main", "main", false, false],
  ["Bash", "git add -A && git commit -m x && git push -u origin feat/x && gh pr create --base main --fill", "main", true, true],
  ["Bash", "gh pr create --help", null, false, false],
  ["Bash", "gh pr view 12", null, false, false],
  ["Bash", "gh issue create --title x", null, false, false],
  ["Bash", "echo 'gh pr create'", null, false, false],
  ["Bash", "git commit -m 'docs: cómo usar gh pr create'", null, false, true],
  ["Bash", "cat > notas.md <<'EOF'\ngh pr create --base main\ngit push\nEOF", null, false, false],
  ["Bash", "git -C ../otro push origin feat/x", null, true, false],
  ["Bash", "git stash push -m wip", null, false, false],
  ["Bash", "npm run push", null, false, false],
  ["mcp__github__create_pull_request", { base: "develop", title: "x" }, "develop", false, false],
  ["mcp__github__list_pull_requests", { state: "open" }, null, false, false],
];
let f = 0;
for (const [tool, entrada, pr, push, commit] of casos) {
  const a = accionDe(tool, typeof entrada === "string" ? { command: entrada } : entrada);
  if (a.pr !== pr || a.push !== push || !!a.commit !== commit) {
    f++;
    console.log("❌", tool, JSON.stringify(entrada), "esperaba", { pr, push, commit }, "y dio", a);
  }
}

// De punta a punta: un repo con chequeos falsos (gitleaks falla) y un jarvis-brain temporal
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "kit-pre-pr-"));
const repo = path.join(tmp, "repo"), brain = path.join(tmp, "brain"), checks = path.join(repo, ".claude", "checks");
for (const d of [repo, brain]) execFileSync("git", ["init", "-q", d]);
fs.mkdirSync(checks, { recursive: true });
fs.writeFileSync(path.join(checks, "seguridad.sh"), 'echo "✗ gitleaks: posibles secretos ($1)"; echo "KIT_FALLAN=gitleaks"; exit 1\n');
fs.writeFileSync(path.join(checks, "lint-cambios.js"), "process.exit(0);\n");
const { CLAUDE_GUARDIA_OFF, JARVIS_OFF, ...env } = process.env;
const correr = (command) => spawnSync(process.execPath, [path.join(__dirname, "pre-pr.js")], {
  input: JSON.stringify({ hook_event_name: "PreToolUse", tool_name: "Bash", session_id: "prueba-pre-pr", cwd: repo, tool_input: { command } }),
  encoding: "utf8", env: { ...env, JARVIS_BRAIN: brain },
});
const reglas = () => {
  const dir = path.join(brain, "lessons");
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap((a) => fs.readFileSync(path.join(dir, a), "utf8").split("\n").filter(Boolean)).map((l) => JSON.parse(l).corrections[0].rule);
};
const pr = correr("gh pr create --base main");
const push = correr("git push -u origin feat/x");
const conCommit = correr("git commit -am x && gh pr create --base main");
const pushConCommit = correr("echo x > a.ts && git add -A && git commit -m x && git push");
const otro = correr("git status");
const caso = (nombre, ok) => { if (!ok) { f++; console.log("❌", nombre); } };
caso("PR bloqueado por un chequeo que falla", pr.status === 2 && /PR bloqueado/.test(pr.stderr));
caso("push bloqueado y revisado solo por secretos", push.status === 2 && /--solo-secretos/.test(push.stderr));
caso("PR con commit en el mismo comando, bloqueado", conCommit.status === 2 && /comando aparte/.test(conCommit.stderr));
caso("push con commit en el mismo comando, bloqueado", pushConCommit.status === 2 && /comando aparte/.test(pushConCommit.stderr));
caso("comando que no publica nada, libre", otro.status === 0);
caso("bloqueos en lessons/", reglas().join() === "gitleaks,gitleaks,publicar-sin-commitear,publicar-sin-commitear");
fs.rmSync(tmp, { recursive: true, force: true });

const total = casos.length + 6;
console.log(f ? `${f} fallos` : `✅ ${total}/${total} casos OK`);
process.exit(f ? 1 : 0);
