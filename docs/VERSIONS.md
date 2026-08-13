# VERSIONS — pinned, coherent, ERESOLVE-safe

## ⚠️ Rev. fix de seguridad (13-ago-2026) — actualización obligatoria

Vercel reportó "Vulnerable version of Next.js detected" en el deploy anterior
(pinneado en `15.1.8`). Verifiqué en vivo el historial de CVEs de Next.js y
confirmé que **`15.1.8` es vulnerable a múltiples fallas reales**, la más
grave de ellas crítica:

| CVE | Severidad (CVSS) | Descripción | Rango afectado | Corregido en |
|---|---|---|---|---|
| **CVE-2025-66478** ("React2Shell") | **Crítica (10.0)** | RCE vía protocolo React Server Components | 15.1.0–15.1.8 | 15.1.9 |
| CVE-2025-55184 | Alta (7.5) | DoS — loop infinito en App Router | 15.1.x | 15.1.11 |
| CVE-2025-55183 | Media | Exposición de código fuente de Server Functions | 15.1.x | 15.1.11 |
| CVE-2026-64641 | Alta | DoS vía Server Actions | ≥13.0.0 <15.5.21 | 15.5.21 |
| CVE-2026-64645 | Alta | SSRF vía `rewrites()` con hostname controlado por el atacante | ≥12.0.0 <15.5.21 | 15.5.21 |
| CVE-2026-64649 | Alta | SSRF en Server Actions con servidor custom | ≥14.1.1 <15.5.21 | 15.5.21 |
| CVE-2026-64643/44/46/47/48 | Media | DoS, cache poisoning, disclosure de endpoints internos | ≥13.0.0 <15.5.21 | 15.5.21 |

**Acción tomada**: se actualizó `next` de `15.1.8` → **`15.5.23`** (última
patch de la línea 15.x confirmada en vivo el 13-ago-2026), que corrige TODOS
los CVEs de la tabla. Se mantiene la misma línea major (15.x) para minimizar
el riesgo de cambios disruptivos en un hotfix de seguridad urgente — ver
razonamiento de "same-major patch primero, migración de major después" en
`/docs/DECISIONS.md`.

React y sus `@types` también se actualizaron a versiones parchadas
confirmadas como reales y publicadas en npm:
- `react`/`react-dom`: `19.0.0` → **`19.1.2`** (versión fijada oficialmente
  como corregida en el aviso de seguridad de React de diciembre de 2025).
- `@types/react`/`@types/react-dom`: `19.0.2` → **`19.1.9`** (última patch
  confirmada de la línea 19.1.x, compatible con `react@19.1.2`).
- `eslint-config-next`: actualizado a `15.5.23` para coincidir con `next`.

### ⏰ Próximo vencimiento a vigilar: EOL de Next 15.x

Verifiqué que Next.js 15.x está en estado **"Maintenance LTS"**, con fin de
soporte el **21 de octubre de 2026** (~2 meses después de esta revisión).
Next 16.x es la **"Active LTS"** actual (última: `16.3.0`, 3-ago-2026).

**Recomendación** (subject to owner approval, no aplicada en este hotfix):
planear una migración a Next 16.x como una tarea separada y probada
explícitamente (no como parte de un parche de seguridad urgente), idealmente
antes de octubre de 2026. Un salto de major version puede introducir cambios
disruptivos que este entorno de construcción no puede validar sin acceso a
un registro npm real — ver `/docs/CHECKS.md`.

### ⚠️ Verificación pendiente del owner (honestidad, no verificado aquí)

Este entorno de construcción sigue sin acceso a `registry.npmjs.org` (403
Forbidden confirmado repetidamente). Los números de versión de arriba están
**verificados como reales y publicados** (vía búsqueda web en vivo), pero
**no se instalaron realmente en este entorno**. Como tu `pnpm-lock.yaml` ya
existe (lo generaste en un paso anterior), este cambio de `package.json`
requiere que vuelvas a correr:

```bash
pnpm install   # SIN --frozen-lockfile esta vez: el lockfile debe actualizarse
               # porque cambiaron las versiones de next/react/react-dom/types
git add package.json pnpm-lock.yaml
git commit -m "fix(security): update Next.js to 15.5.23 (CVE-2025-66478 and others)"
git push
```

Si `pnpm install` reporta un conflicto de peer dependencies entre
`react@19.1.2` y algún paquete, pégame el mensaje completo — ajusto la
versión exacta según lo que el propio instalador exija.

---

## Tabla de versiones (post-fix de seguridad, 13-ago-2026)

| Paquete | Versión fijada | Justificación |
|---|---|---|
| node | `24.19.0` (`.nvmrc`, `engines` en `package.json`) | Active LTS de Node (Node 20 llegó a EOL el 30-abr-2026). |
| next | **`15.5.23`** | Última patch parchada de la línea 15.x (Maintenance LTS, soporte hasta 21-oct-2026). Corrige CVE-2025-66478 (RCE crítico) y el lote de CVEs de julio 2026. |
| react / react-dom | **`19.1.2`** | Versión fijada como corregida en el aviso de seguridad de React de diciembre 2025; peer compatible con Next 15.5.x. |
| eslint-config-next | `15.5.23` | Debe coincidir con la major/minor de `next`. |
| @supabase/supabase-js | `2.47.10` | Cliente admin (`service_role`), usado solo en `src/lib/supabase/admin.ts`. |
| @supabase/ssr | `0.5.2` | Cliente SSR con cookies para App Router. **Nunca** `@supabase/auth-helpers-*` (deprecado). |
| typescript | `5.7.3` | `strict: true` + `noUncheckedIndexedAccess: true` + `allowImportingTsExtensions: true`. |
| tailwindcss | `3.4.17` | Design tokens extraídos de `LifeOS 4.html`. |
| zod | `3.24.1` | Validación de entrada en todas las Server Actions. |

## Por qué este set evita ERESOLVE (F1)

Los únicos paquetes de runtime son `next`, `react`, `react-dom`, `@supabase/*`,
`zod` y `clsx`. Ninguno de `@supabase/*`/`zod`/`clsx` declara un peer de React,
por lo que React 19 no puede entrar en conflicto con ninguna dependencia
transitiva. `.npmrc` con `legacy-peer-deps=true` se mantiene como red de
seguridad documentada (no como parche a ciegas — ver `/docs/DECISIONS.md`
D-001), y el lockfile (`pnpm-lock.yaml`) debe regenerarse tras este cambio de
versiones (ver arriba) y permanecer commiteado.

## Nota sobre `@supabase/ssr` vs `@supabase/auth-helpers-*`

Este proyecto usa exclusivamente `@supabase/ssr` (`createServerClient`,
`createBrowserClient`) en `src/lib/supabase/{server,client}.ts`. Los paquetes
`@supabase/auth-helpers-nextjs` / `@supabase/auth-helpers-react` están
deprecados y NO aparecen en `package.json`.

## Tabla de compatibilidad

| Next.js | React | Node | @supabase/ssr |
|---|---|---|---|
| 15.5.x | 19.1.x | ≥20 <25 (recomendado: 24 Active LTS) | 0.5.x |

## Proceso de verificación de seguridad hacia adelante

Dado que Vercel escanea automáticamente CVEs conocidos en cada deploy (como
ocurrió con este aviso), y dado que Next.js adoptó en julio 2026 un
**programa formal de releases de seguridad mensuales pre-anunciados**
(ver https://nextjs.org/blog/next-security-release-program), se recomienda:
1. Revisar el blog de seguridad de Next.js (`nextjs.org/blog`) al menos una
   vez al mes.
2. Ante cualquier aviso de Vercel de "vulnerable version", verificar en vivo
   (no de memoria) el CVE exacto y la versión mínima parchada antes de
   actualizar, siguiendo el mismo proceso documentado aquí.
