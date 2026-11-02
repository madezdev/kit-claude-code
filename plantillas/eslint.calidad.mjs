// kit-claude-code: archivo administrado por el kit. Si lo personalizás, borrá esta línea y el instalador no lo va a pisar.
// Reglas de calidad del kit para ESLint (flat config). Los límites salen de .claude/limites.json,
// los mismos que aplican los hooks. Se suma al final del eslint.config del proyecto:
//   import calidad from "./eslint.calidad.mjs";
//   export default [...config, ...calidad];
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const raiz = path.dirname(fileURLToPath(import.meta.url));
const { cargarLimites, GLOBS_TEST } = createRequire(import.meta.url)("./.claude/hooks/comun.js");
const l = cargarLimites(raiz);

// ESLint admite una sola severidad por regla: el aviso de tamaño es max-lines con otro nombre.
// Se busca ESLint desde donde corre el lint y, si no está (raíz de un monorepo), desde acá;
// sin ESLint alcanzable no hay aviso, pero el error de max-lines sigue.
function maxLines() {
  for (const desde of [path.join(process.cwd(), "package.json"), import.meta.url]) {
    try { return createRequire(desde)("eslint/use-at-your-own-risk").builtinRules.get("max-lines"); } catch {}
  }
  return null;
}
const aviso = maxLines();
const plugins = aviso ? { kit: { rules: { "max-lines-aviso": aviso } } } : {};
const avisoA = (lineas) => (aviso ? { "kit/max-lines-aviso": ["warn", lineas] } : {});

export default [
  // Los hooks y chequeos de .claude/ son herramientas, no código del proyecto.
  { ignores: [".claude/**"] },
  {
    // Sin `files`: las reglas aplican a lo que el proyecto ya lintea, sin sumar archivos nuevos.
    ignores: ["**/*.{json,jsonc,json5,md,mdx,css,scss,less,yaml,yml,html,toml,graphql,gql}"],
    plugins,
    rules: {
      complexity: ["error", l.complejidad],
      "max-depth": ["error", l.profundidad],
      "max-lines-per-function": ["error", l.lineasFuncion],
      "max-lines": ["error", l.codigoMax],
      ...avisoA(l.codigo),
    },
  },
  {
    // En los tests, describe() e it() son funciones largas por naturaleza.
    files: GLOBS_TEST,
    rules: { "max-lines-per-function": "off", "max-lines": ["error", l.testsMax], ...avisoA(l.tests) },
  },
];
