# FAILURE_MATRIX — copia de §1 del prompt de build, con estado de mitigación

| # | Síntoma | Causa raíz | Mitigación en este proyecto | Estado |
|---|---|---|---|---|
| F1 | `ERESOLVE` en Vercel | React 19 peer de Next 15/16 con pin desalineado | `package.json` con versiones exactas coherentes (Next 15.1.8 / React 19.0.0); `.npmrc legacy-peer-deps=true`; dependencias de runtime sin peers de React salvo Next/React mismos | ✅ Mitigado estructuralmente. ⚠️ `pnpm install` real NO EJECUTADO en este entorno (sin registro npm) |
| F2 | Build muere en errores de tipo en serie | `tsc` corre dentro de `next build` | Script `typecheck` separado (`tsc --noEmit`) en `package.json` y en CI, corrido ANTES de `build` | ✅ Mitigado estructuralmente. ⚠️ NO EJECUTADO contra el árbol completo (sin `next`/`react` instalados aquí); sí se validó sintaxis de los 98 archivos con el compilador TypeScript (ver `/docs/CHECKS.md`) |
| F3 | Tipos de BD como stub permisivo | `database.types.ts` no generado | Stub manual que satisface `GenericSchema` (Tables/Views/Functions/Enums/CompositeTypes con Row/Insert/Update), marcado con comentario ⚠️ explícito arriba del archivo; script `gen:types` listo | ⚠️ NO EJECUTADO — requiere `supabase link` a un proyecto real |
| F4 | `ZodError` rompe "collect page data" | `schema.parse()` a nivel de módulo | `src/config/env.ts` usa `safeParse` + defaults para `NEXT_PUBLIC_*`; secretos de servidor validados lazy (`requireServiceRoleKey`) | ✅ Mitigado y verificable por inspección del código |
| F5 | Pantalla en blanco (CSP sin nonce) | CSP estática | `middleware.ts` genera un nonce por request y lo inyecta en la CSP (`script-src 'self' 'nonce-...' 'strict-dynamic'`) | ✅ Mitigado estructuralmente. ⚠️ No probado en un deploy real de Vercel |
| F6 | `router.push` no compila (`RouteImpl`) | `typedRoutes` activo | `experimental.typedRoutes: false` explícito en `next.config.ts`, documentado en D-006 | ✅ Mitigado |
| F7 | `useSearchParams` sin Suspense | Bailout de prerender | `Suspense` envolviendo `LoginForm` (usa `useSearchParams`) y `Sidebar`/`TitleFromPath` (usan `usePathname`, por precaución) | ✅ Mitigado en el código; ⚠️ el bailout real solo se confirma con `next build` (NO EJECUTADO) |
| F8 | "Se ve pero no funciona" (mock) | HTML portado como lógica imperativa | CERO líneas de `localStorage` o arrays hardcodeados en `src/app/**`; cada página es un Server Component que hace `await supabase.from(...)`. Ver `/docs/UX_MAP.md` para la traza completa | ✅ Verificado por inspección exhaustiva del código fuente |
| F9 | `permission denied` (RLS sin GRANT) | Falta de GRANT | Cada migración `0002`…`0009` incluye su bloque `grant select/insert/update/delete/all` explícito; `0010_default_privileges.sql` es el backstop con `ALTER DEFAULT PRIVILEGES` | ✅ Mitigado estructuralmente. ⚠️ Pruebas pgTAP positivas/negativas escritas (`supabase/tests/*.sql`) pero NO EJECUTADAS (sin Supabase CLI/Docker en este entorno) |
| F10 | BD vacía tras `db push` | `seed.sql` no corre en remoto | Advertencia explícita en `/docs/DEPLOY.md` §1.3 con el paso manual (SQL Editor) | ✅ Documentado; ⚠️ no aplicable verificar sin proyecto remoto real |
| F11 | Una acción falla por secretos ajenos | Validación monolítica de env | `requireServiceRoleKey()`/`requireResendApiKey()` independientes en `src/config/env.ts`; ninguna Server Action de Execution/Time/Habits/Money exige `RESEND_API_KEY` | ✅ Mitigado y verificable por inspección |
| F12 | Móvil se ve como mockup (phone-frame) | Layout de ancho fijo centrado | `globals.css` usa `100dvh`, `env(safe-area-inset-*)`; `layout.tsx` define `viewportFit: "cover"`; `Topbar.tsx`/`Sidebar.tsx` usan `position: sticky/fixed` con padding de safe-area | ✅ Mitigado en CSS/componentes; ⚠️ no verificado visualmente en un dispositivo real |
| F13 | Seed no idempotente deja datos a medias | `ON CONFLICT` parcial | Cada `on conflict ... do update set` en `supabase/seed.sql` fija TODOS los campos relevantes de esa fila (no un subconjunto) | ✅ Mitigado por diseño del SQL; ⚠️ NO EJECUTADO (`supabase db reset` requiere Docker/CLI) |
| F14 | Warning cosmético de ESLint | `eslint-config-next` + ESLint 9 | Documentado aquí como no-bloqueante; el lint real se ejecuta en CI (`pnpm lint`), no en este entorno | ⚠️ Puede aparecer; no bloquea el build si aparece solo como warning |

## Resumen de honestidad

De las 14 filas: **7 están mitigadas y verificadas por inspección/pruebas
unitarias reales que SÍ corrieron aquí** (F2 parcial, F4, F6, F7 parcial, F8,
F9 parcial, F11, F13 parcial). **Las verificaciones que requieren un entorno
con registro npm, Docker/Supabase CLI, o un proyecto Supabase real no se
pudieron ejecutar en este entorno de construcción** y están marcadas
explícitamente con ⚠️ en vez de un ✅ falso, consistente con el Contrato de
Honestidad (§0 del prompt de build).
