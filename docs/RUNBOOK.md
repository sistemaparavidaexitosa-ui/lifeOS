# RUNBOOK

## Incidentes comunes

### "permission denied for table X" (F9)
**Causa raíz:** RLS habilitada sin `GRANT` correspondiente para el rol
(`anon`/`authenticated`). **Diagnóstico:** en Supabase SQL Editor, corre
`select * from information_schema.role_table_grants where table_name = 'X';`
y confirma que `authenticated` tiene `SELECT`/`INSERT`/`UPDATE`/`DELETE`.
**Fix:** aplica el bloque GRANT de la migración correspondiente
manualmente, o ejecuta de nuevo `supabase/migrations/0010_default_privileges.sql`.

### La app conecta pero no hay datos (F10)
**Causa raíz:** `supabase db push` no ejecuta `seed.sql` contra remoto.
**Fix:** pega `supabase/seed.sql` completo en el SQL Editor de Supabase
Studio y ejecútalo.

### Pantalla en blanco en producción (F5)
**Causa raíz:** una CSP estática sin nonce bloqueando scripts de Next.
**Diagnóstico:** abre la consola del navegador, busca errores
`Content-Security-Policy` bloqueando `script-src`.
**Fix:** confirma que `middleware.ts` (no `next.config.ts`) es quien define
`Content-Security-Policy`, y que incluye `'nonce-...' 'strict-dynamic'`.

### No hay CSP en ninguna respuesta (el fallo silencioso opuesto)
**Síntoma:** `curl -D - -o /dev/null https://tu-dominio/login` no devuelve
ninguna cabecera `Content-Security-Policy`, y aun así la app funciona. Nada
falla a gritos: simplemente no hay política aplicada.
**Causa raíz:** el middleware no se está ejecutando. Con el proyecto en `src/`,
Next.js **solo** reconoce `src/middleware.ts`; un `middleware.ts` en la raíz lo
ignora sin error ni warning. Así estuvo este repo hasta el 2026-08-23.
**Diagnóstico:** `cat .next/server/middleware-manifest.json` — si
`"middleware"` es un objeto vacío, no se registró ninguno. En `pnpm dev`, el
arranque debe imprimir `Compiling /middleware`.
**Fix:** `git mv middleware.ts src/middleware.ts`. Ojo: al arreglarlo se
encienden de golpe la CSP, el refresco de sesión de `@supabase/ssr` y el
redirect a `/login` — verifica que las rutas `/api/*` respondan lo que deben.

### Build roto por errores de tipo en cascada (F2)
**Fix:** corre `pnpm typecheck` de forma aislada (sin `next build`) para ver
TODOS los errores de una vez, arréglalos juntos, y solo entonces corre
`pnpm build`.

### Pérdida de la base de datos / necesidad de restaurar
1. Restaura el backup más reciente desde Supabase Dashboard → Database →
   Backups.
2. Tras restaurar, vuelve a aplicar cualquier migración posterior al backup:
   `supabase db push`.
3. Corre el smoke test de `/docs/DEPLOY.md` §4 completo antes de anunciar
   que el servicio está de vuelta.
4. Revisa `audit_log` de los últimos usuarios activos para detectar
   pérdida de escrituras entre el backup y el incidente.

### Sospecha de exposición de datos entre usuarios/workspaces
1. Congela nuevos deploys.
2. Corre las pruebas pgTAP negativas (`supabase test db`,
   `supabase/tests/0001_rls_money.sql` y `0002_rls_execution_collaboration.sql`)
   contra el proyecto afectado.
3. Revisa `audit_log` filtrando por el `object` sospechoso.
4. Si se confirma una política RLS faltante, aplica el fix como migración
   nueva (nunca edites una migración ya aplicada) y despliega de inmediato.

## Runbook de datos faltantes

Si `/reports` muestra "Datos faltantes: transacciones sin conciliar", es
esperado: significa que hay movimientos en `journal_entries` con
`status != 'Reconciled'`. Guía al usuario a `/money` para conciliarlos.
