/**
 * shell-anidado.js — El texto que un shell ejecuta dentro de un comando (bash -c "…", eval "…",
 * heredocs, pipes y here-strings a un shell, intérpretes). guardia.js analiza git push por
 * tokens y, con esto, vuelve a revisar ese texto con la rama y el directorio del momento.
 * Como red de seguridad, a lo que se ejecuta como texto le aplica además regex de push.
 */
const { segmentos, tokens } = require("./comun.js");

const SHELL = /(^|\/)((ba|z|da|k|c|tc|a|mk)?sh|fish|pwsh)$/;
// Lo que puede leer un heredoc y ejecutarlo: un shell o un intérprete (python3 - <<EOF).
const LECTOR = /(^|\/)((ba|z|da|k|c|tc|a|mk)?sh|fish|pwsh|python[\d.]*|node|perl|ruby|deno|bun)$/;
// Comandos que corren a otro (sudo bash …): el shell puede venir después.
const ENVOLTORIOS = new Set(["sudo", "doas", "env", "exec", "nohup", "time", "command", "timeout", "nice", "xargs"]);
const HEREDOC = /(?<!<)<<(?!<)-?\s*(['"]?)([A-Za-z_][\w-]*)\1/;
// Algo del comando ejecuta texto por una vía que el análisis por tokens no sigue.
const EJECUTA_TEXTO = /\b((ba|z|da|k|c|tc|a|mk)?sh|fish|pwsh)\b|\$\{?SHELL|<<<|<\(|\b(python3?|node|perl|ruby|deno|bun|eval|source|script|flock|watch|npx|xargs|rebase|submodule|ssh|docker|podman|kubectl)\b|alias\.|\benv\s+-S/;
// Ramas a las que no se pushea directo. guardia.js arma su RAMA_PROTEGIDA con la misma lista.
// release/<algo> no está: los releases por rama (release/<fecha>) se pushean y van por PR.
const RAMAS_PROTEGIDAS = "main|master|develop|dev|prod|production|release";
// Red de seguridad sobre el texto que se ejecuta, acotada al tramo (sin cruzar ; & | ni saltos de línea).
const PUSH_FORCE = /\bgit\s+push\b[^;&|\n]*(\s-f\b|--force(?!-with-lease)\b|\s\+\S)/;
const PUSH_PROTEGIDA = new RegExp(
  /\bgit\s+push\b[^;&|\n]*[\s:'"`](refs\/heads\/)?/.source +
    `(${RAMAS_PROTEGIDAS})` +
    /(['"`\\)]|[\s;&|]|$)|\bgit\s+push\b[^;&|\n]*\s--(all|mirror)\b/.source,
);

/** Tokens sin las asignaciones del principio (VAR=1 bash …). */
function sinAsignaciones(t) {
  let i = 0;
  while (i < t.length && /^\w+=/.test(t[i])) i++;
  return t.slice(i);
}

/** true si el tramo corre un lector de heredocs: `bash …`, `sudo -u x sh …`, `python3 - …`. */
const correLector = (t) => LECTOR.test(t[0] || "") || (ENVOLTORIOS.has(t[0]) && t.some((x) => LECTOR.test(x)));

/** Comandos que el tramo ejecuta como texto: los argumentos de `bash|sh|zsh… -c` y el de `eval`. */
function anidadosDe(t) {
  const shell = t.findIndex((x) => SHELL.test(x));
  const resto = shell >= 0 ? t.slice(shell + 1) : [];
  if (resto.some((x) => /^-[A-Za-z]*c[A-Za-z]*$/.test(x))) return resto.filter((x) => !x.startsWith("-"));
  const ev = t.indexOf("eval");
  return ev >= 0 ? [t.slice(ev + 1).join(" ")] : [];
}

/** true si el heredoc que empieza en `pos` lo ejecuta un lector: el comando del `<<` o uno de su pipeline. */
function leeShell(linea, pos) {
  const comando = linea.slice(0, pos).split(/&&|\|\||;/).pop() + linea.slice(pos).split(/&&|\|\||;/)[0];
  return segmentos(comando).some((s) => correLector(sinAsignaciones(tokens(s))));
}

/** El comando fuera de los heredocs y los cuerpos que lee un shell (bash <<EOF, cat <<EOF | sh). */
function partirHeredocs(cmd) {
  const fuera = [], ejecutados = [];
  let fin = null, cuerpo = null;
  for (const linea of cmd.replace(/\\\n/g, " ").split("\n")) {
    if (!fin) {
      fuera.push(linea);
      const m = linea.match(HEREDOC);
      if (m) [fin, cuerpo] = [m[2], leeShell(linea, m.index) ? [] : null];
      continue;
    }
    if (linea.trim() !== fin) { cuerpo?.push(linea); continue; }
    if (cuerpo) ejecutados.push(cuerpo.join("\n"));
    fin = cuerpo = null;
  }
  if (cuerpo) ejecutados.push(cuerpo.join("\n")); // heredoc sin cerrar
  return { fuera: fuera.join("\n"), ejecutados };
}

/**
 * Red de seguridad: si el comando ejecuta texto, las regex de push sobre
 * lo que se ejecuta (sin los heredocs de puro texto). "force", "protegida" o null.
 */
function redDePush(cmd) {
  const { fuera, ejecutados } = partirHeredocs(cmd);
  const texto = [fuera, ...ejecutados].join("\n");
  if (!EJECUTA_TEXTO.test(texto)) return null;
  if (PUSH_FORCE.test(texto)) return "force";
  return PUSH_PROTEGIDA.test(texto) ? "protegida" : null;
}

module.exports = { anidadosDe, partirHeredocs, redDePush, RAMAS_PROTEGIDAS };
