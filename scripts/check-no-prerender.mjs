// scripts/check-no-prerender.mjs
// Guarda contra la regresión que tumbó producción el 2026-08-24.
//
// La CSP de esta app lleva un nonce distinto por petición (middleware.ts). Next
// solo puede estampar ese nonce en los `<script>` cuando renderiza en el momento
// de la petición; una página PRERENDERIZADA se hornea en el build, sale sin
// nonce, y `strict-dynamic` bloquea todos sus scripts. El resultado no es un
// error: es una página que se queda cargando para siempre.
//
// Por eso, mientras la CSP use nonce, ninguna ruta puede ser estática. Este
// chequeo corre después de `next build` dentro de `pnpm verify`.

import { readFileSync } from "node:fs";

const MANIFEST = ".next/prerender-manifest.json";

let manifest;
try {
  manifest = JSON.parse(readFileSync(MANIFEST, "utf8"));
} catch {
  console.error(`No se pudo leer ${MANIFEST}. ¿Corriste \`next build\` antes?`);
  process.exit(1);
}

const prerendered = Object.keys(manifest.routes ?? {});

if (prerendered.length > 0) {
  console.error("\n✖ Hay rutas prerenderizadas y la CSP usa nonce por petición:\n");
  for (const route of prerendered) console.error(`    ${route}`);
  console.error(`
  Esas páginas llegarán al navegador con sus scripts SIN nonce y no van a
  hidratar: el usuario verá una pantalla que no avanza. Añade

      export const dynamic = "force-dynamic";

  al page.tsx de cada una, o quita el nonce de la CSP en middleware.ts.
  Contexto: /docs/DECISIONS.md D-029 y /docs/RUNBOOK.md.
`);
  process.exit(1);
}

console.log(`✔ Ninguna ruta prerenderizada: todas pueden recibir el nonce de la CSP.`);
