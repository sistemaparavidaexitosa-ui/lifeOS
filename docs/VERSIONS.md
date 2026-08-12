# VERSIONS — pinned, coherent, ERESOLVE-safe

_Última verificación de conocimiento del asistente: 2026-08 (no se pudo hacer una
consulta en vivo al registro npm/GitHub en este entorno — ver `/docs/CHECKS.md`.
Antes de tu primer deploy real, confirma tú mismo que estos números siguen
siendo la última patch de su línea LTS en https://nextjs.org/blog y
https://github.com/vercel/next.js/releases)._

| Paquete | Versión fijada | Justificación |
|---|---|---|
| node | `20.18.1` (`.nvmrc`, `engines` en `package.json`) | LTS activa de Node, soportada por Vercel. |
| next | `15.1.8` | Línea 15.x activa (no `.0`, para incluir parches de seguridad conocidos del middleware — **F1**). Verifica en el changelog oficial si hay una patch más reciente antes de tu deploy. |
| react / react-dom | `19.0.0` | Peer exigido por Next 15 — causa típica de `ERESOLVE` si se fija una versión de Next incompatible (**F1**). |
| eslint-config-next | `15.1.8` | Debe coincidir con la major/minor de `next`. |
| @supabase/supabase-js | `2.47.10` | Cliente admin (`service_role`), usado solo en `src/lib/supabase/admin.ts`. |
| @supabase/ssr | `0.5.2` | Cliente SSR con cookies para App Router. **Nunca** `@supabase/auth-helpers-*` (deprecado). |
| typescript | `5.7.3` | `strict: true` + `noUncheckedIndexedAccess: true`. |
| tailwindcss | `3.4.17` | Design tokens extraídos de `LifeOS 4.html`. |
| zod | `3.24.1` | Validación de entrada en todas las Server Actions. |

## Por qué este set evita ERESOLVE (F1)

Los únicos paquetes de runtime son `next`, `react`, `react-dom`, `@supabase/*`,
`zod` y `clsx`. Ninguno de `@supabase/*`/`zod`/`clsx` declara un peer de React,
por lo que React 19 no puede entrar en conflicto con ninguna dependencia
transitiva. `.npmrc` con `legacy-peer-deps=true` se mantiene como red de
seguridad documentada (no como parche a ciegas — ver `/docs/DECISIONS.md`
D-001), y el lockfile (`pnpm-lock.yaml`, generado en tu primera instalación
real) debe commitearse.

## Nota sobre `@supabase/ssr` vs `@supabase/auth-helpers-*`

Este proyecto usa exclusivamente `@supabase/ssr` (`createServerClient`,
`createBrowserClient`) en `src/lib/supabase/{server,client}.ts`. Los paquetes
`@supabase/auth-helpers-nextjs` / `@supabase/auth-helpers-react` están
deprecados y NO aparecen en `package.json`.

## Tabla de compatibilidad

| Next.js | React | Node | @supabase/ssr |
|---|---|---|---|
| 15.1.x | 19.0.x | ≥20 <23 | 0.5.x |

## ⚠️ Verificación pendiente del owner

Este entorno de construcción **no tuvo acceso a un registro npm real**
(`npm install` devolvió `403 Forbidden` en todas las pruebas — ver
`/docs/CHECKS.md`). Por lo tanto, **estas versiones no se instalaron
realmente aquí**. Antes de tu primer deploy:

```bash
pnpm install --frozen-lockfile   # generará pnpm-lock.yaml si no existe
pnpm typecheck && pnpm build     # confirma que esta combinación resuelve sin ERESOLVE
```

Si `pnpm install` reporta un conflicto de peers real, sube `next` a la última
patch de su línea (15.x o 16.x LTS) y ajusta `react`/`react-dom` al peer que
esa versión exige, documentando el cambio en `/docs/DECISIONS.md`.
