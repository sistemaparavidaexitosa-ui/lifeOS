# DECISIONS — resoluciones Spec ⇄ HTML y decisiones técnicas (subject to owner approval)

## Resoluciones Spec ⇄ HTML

- **D-001 Gestor de paquetes**: se eligió `pnpm` (más rápido, lockfile
  determinista) en vez de `npm`. Si prefieres `npm`, cambia
  `packageManager` en `package.json`, borra `pnpm-lock.yaml` y regenera
  `package-lock.json`; ajusta `vercel.json` (`installCommand`) y
  `.github/workflows/ci.yml` en consecuencia. *(Recommended default, subject
  to owner approval.)*
- **D-002 CSP con nonce (F5)**: la Spec no dicta una política de seguridad de
  contenido explícita; se adoptó la CSP con nonce por request en
  `middleware.ts` como default seguro no negociable de este prompt de build,
  con `connect-src` abierto a `*.supabase.co` para no bloquear las llamadas
  reales del cliente Supabase.
- **D-003 Presupuesto tabular reutiliza `budgets`**: FR-MNY-018/019 pedía una
  "pestaña separada"; se implementó como una **ruta separada** (`/money/budget`)
  que lee/escribe la **misma tabla** `budgets` (extendida con
  `monthly_cost`/`q1_amount`/`q2_amount`), no una entidad paralela — ver
  ADR-003 en la Master Spec.
- **D-004 Sugerencia de secuencia de proyecto**: implementada como heurística
  determinista (orden topológico + prioridad + estimación), consistente con
  ADR-014 de la Spec (Phase 1 antes de un modelo generativo).
- **D-005 Estados `loading`/`stale` custom**: el HTML de referencia mostraba
  estados de carga explícitos por tarjeta; en este slice se confía en el
  streaming nativo de Server Components de Next.js sin skeletons custom por
  vista. Se anota como mejora posible, no bloqueante.
- **D-006 `typedRoutes` desactivado (F6)**: el prompt de build permite
  desactivarlo si no aporta valor claro; se desactivó explícitamente en
  `next.config.ts` para evitar el error `RouteImpl<string>` en rutas
  dinámicas (`/execution?project=...`, `/time?view=...`, etc.).
- **D-007 Auditoría (`audit_log`) vive en `public`, no en un esquema
  `private`**: a diferencia de un esquema de webhooks/OTP puramente interno,
  el usuario final puede consultar su propia auditoría (§34.1: "Consultar
  auditoría: Propia limitada"), por eso usa RLS por `user_id` en vez de
  aislarse completamente al `service_role`.

### Rediseño del flujo de proyectos (Execution OS, agosto 2026)
- **D-012 Un solo estado de tablero en el cliente (`BoardShell`)**: antes cada
  vista de `/execution` (Tablero, Kanban, Lista, Árbol) era un Client
  Component autosuficiente con su propia copia de las tareas, y cambiar de
  vista era una navegación (`?view=`) que volvía a consultar la base y
  reiniciaba filtros/selección/scroll. Peor: cada vista pedía un subconjunto
  DISTINTO de datos (responsables solo en Kanban, miembros y grupos solo en
  Tablero), así que la misma tarea se veía distinta según la vista. Ahora
  `page.tsx` consulta una sola vez todo el tablero y `BoardShell` mantiene el
  estado; las vistas son presentación pura sobre ese estado. La URL sigue
  llevando `?view=` (enlace compartible), sincronizada con
  `history.replaceState`. *(Recommended default, subject to owner approval.)*
- **D-013 Orden manual en `tasks.position` (migración 0021)**: el tablero
  ordenaba siempre por `created_at`, así que no existía la interacción más
  básica de monday/ClickUp — arrastrar para priorizar. `position` ordena
  DENTRO de la lista de hermanos (raíces de un grupo, o subtareas de un
  padre), no globalmente. El cálculo del nuevo orden es puro (`reorderIds` en
  `src/lib/domain/board.ts`) y el cliente manda al servidor exactamente el
  mismo arreglo que aplicó de forma optimista, así no pueden divergir. Si la
  migración todavía no está aplicada, `page.tsx` degrada explícitamente al
  orden histórico por `created_at` y desactiva el arrastre en vez de romper
  la página.
- **D-014 La vista "Árbol" se absorbe en el Tablero**: `TreeView`/
  `TreeItemNode` mostraban Group → Item → Subitem, exactamente la jerarquía
  que el Tablero ya renderiza. Su única capacidad propia era reparentar por
  arrastre, que ahora vive en el Tablero (soltar una fila sobre el centro de
  otra la convierte en subtarea, con guarda anti-ciclos `isDescendantOf`).
  Se eliminaron ambos archivos junto con `updateTaskStatusFromTree`, un
  segundo camino de cambio de estado que escribía `status` SIN validar la
  transición — hoy todo pasa por `setTaskStatus`. La vista "Lista" (que
  apilaba un Drawer por tarea) se reemplazó por "Tabla" (rejilla ordenable
  con edición inline) y se agregó "Timeline" (Gantt ligero).
- **D-015 Toda la lógica de tablero es dominio puro y testeado**: filtros,
  orden, estadísticas, rango/barras del timeline y guardas de jerarquía
  viven en `src/lib/domain/board.ts` (sin React ni Supabase) con
  `tests/domain/board.test.ts`. La regla "¿está vencida?" o "¿cuánto avanzó
  este grupo?" existe UNA vez y se ve igual en las 4 vistas.

### Zona horaria del usuario (agosto 2026)
- **D-016 "Hoy" se calcula con `profiles.timezone`, nunca con el reloj del
  proceso**: `todayLocal()` usaba `new Date()` + `getTimezoneOffset()`, es
  decir la zona del SERVIDOR. En local funciona (la laptop está en México),
  pero en Vercel el proceso corre en UTC, así que entre las 18:00 y la
  medianoche hora de México el backend ya estaba en el día siguiente: los
  hábitos marcados de noche caían en la fecha de mañana, el plan diario se
  guardaba con `local_date` equivocada, los rangos de /reports se corrían un
  día y /home saludaba "Buenas noches" a la 1 pm. La columna
  `profiles.timezone` existía desde la migración 0002 y no se usaba para
  calcular nada. Ahora la lógica pura vive en `src/lib/domain/datetime.ts`
  (con `Intl.DateTimeFormat`, probada en `tests/domain/datetime.test.ts`) y
  cada vista/Action obtiene la zona con `getUserTimeZone()`
  (`src/lib/data/profile.ts`, envuelto en React `cache()` para no repetir la
  consulta dentro del mismo request). No se requirió migración.
- **D-017 La zona horaria se valida al escribir y se degrada al leer**:
  `profiles.timezone` es un `<input>` de texto libre en /settings, así que un
  typo tumbaba cualquier página que formateara fechas (Intl lanza
  `RangeError`). Ahora settings/onboarding la rechazan con Zod
  (`isValidTimeZone`) y, si aun así llegara un valor inválido a la base,
  `getUserTimeZone()` cae a `America/Mexico_City` en vez de reventar: una
  fecha equivocada es un bug, una app caída por un typo es peor.
- **D-018 El tablero recibe "hoy" del servidor**: las vistas de /execution son
  Client Components y calculaban su propio `todayISO()` con la zona del
  NAVEGADOR, mientras la barra lateral lo hacía en el servidor — con zonas
  distintas, el conteo de vencidas del proyecto podía contradecir a los chips
  rojos del tablero. Ahora `page.tsx` calcula el día una vez y lo pasa por
  `BoardApi.today`.

### Invitaciones a workspaces (agosto 2026)
- **D-019 El canje vive en dos RPC `SECURITY DEFINER`, no en el cliente
  service_role**: aceptar una invitación era imposible por diseño —
  `invitations_all_admin` (FOR ALL, Owner/Admin) impide que el invitado lea su
  propia invitación, y `memberships_insert_admin` impide que cree su
  membresía; el invitado necesitaba un permiso que solo tendría DESPUÉS de
  aceptar. Se resolvió con `invitation_preview(token)` y
  `accept_invitation(token)` (migración 0022) en vez de usar
  `SUPABASE_SERVICE_ROLE_KEY` desde una Server Action: no exige un secreto
  nuevo en el despliegue, valida todo de forma atómica (`SELECT ... FOR
  UPDATE`, así dos clics simultáneos no canjean el mismo token) y se puede
  probar con pgTAP como el resto (`supabase/tests/0006_invitations_accept.sql`).
  Esto NO reintroduce el problema de recursión de 0011-0015: aquel venía de
  funciones invocadas DESDE una política, y estas dos no se referencian en
  ninguna — la app las llama por RPC. Ninguna política existente se tocó.
- **D-020 El token no basta: el correo debe coincidir**: `accept_invitation`
  exige que `auth.email()` sea igual (sin distinguir mayúsculas) al correo
  invitado. Un token filtrado o reenviado no alcanza para entrar al workspace,
  que es justo lo que un enlace "mágico" por sí solo no garantiza.
- **D-021 Enviar correo NUNCA rompe la acción**: `sendEmail()`
  (`src/lib/email/send.ts`) jamás lanza; devuelve `{sent, reason}`. Si falta
  `RESEND_API_KEY`, el dominio no está verificado o el proveedor falla, la
  invitación se crea igual y la UI muestra el enlace para compartirlo a mano,
  diciendo explícitamente que el correo NO salió. El antipatrón a evitar era
  el estado anterior: la UI daba a entender que se había invitado a alguien
  cuando en realidad no se mandaba nada.
- **D-022 Resend por `fetch`, sin SDK**: mantiene el set de dependencias de
  runtime intacto (D-008) — la API REST son ~15 líneas.
- **D-023 `/invite/[token]` es una ruta pública**: el invitado llega desde el
  correo normalmente SIN cuenta. Si viviera bajo `(app)`, el middleware lo
  mandaría a `/login` perdiendo el token y sin decirle a qué lo invitaron. La
  página solo muestra nombre del workspace, rol y vigencia, y el correo
  invitado enmascarado (`lu***@gmail.com`). Se agregó `?next=` a login y
  onboarding para volver a la invitación tras autenticarse, validando que el
  destino sea una ruta relativa (evita convertir el login en un open redirect).
- **D-024 Desviaciones deliberadas del spec de Personal Development OS**
  (`docs/superpowers/specs/2026-08-22-personal-development-os-design.md`).
  Se revisaron una por una el 2026-08-23 contra la Fase 1 ya implementada;
  ninguna cambia el comportamiento descrito, pero quedan escritas para que la
  Fase 2 no las tome por error:
  - `goalAtRisk` recibe `(startISO, horizonISO, pct, todayISO, threshold = 20)`,
    no `(horizonISO, pct, todayISO)` como dibuja el §3.3. Sin fecha de inicio no
    hay "porcentaje de horizonte transcurrido" que calcular, y el umbral
    explícito hace la regla comprobable en un test en vez de esconderla.
  - Las pruebas de dominio viven en `tests/domain/development-*.test.ts`, planas,
    no en `tests/domain/development/*.test.ts`. El script `test:unit` usa el glob
    `tests/domain/*.test.ts`, de un solo nivel; una subcarpeta habría quedado
    fuera de `pnpm verify` sin que nadie lo notara.
  - La clave del ícono es `personalGoals` (camelCase), no `personal-goals`:
    `NAV_ICONS` se indexa como propiedad de objeto en el resto del archivo.
  - El puente a `habit_logs` no hace `upsert ... on conflict do nothing` como
    sugiere el §4.2: consulta si ya existe la fila del día y decide con
    `habitLogEffect`, una función pura y probada. El efecto observable es el
    mismo y el índice único `(habit_id, log_date)` sigue siendo la garantía
    última, pero la decisión queda testeable sin base de datos.

## Decisiones técnicas (§7, ERESOLVE)

- **D-008 Dependencias de runtime mínimas**: solo `next`, `react`,
  `react-dom`, `@supabase/ssr`, `@supabase/supabase-js`, `zod`, `clsx`.
  Ninguna de estas (salvo `next`/`react`/`react-dom`) declara un peer de
  React, lo que hace estructuralmente imposible un conflicto `ERESOLVE` con
  paquetes de terceros en este set. `.npmrc legacy-peer-deps=true` se
  mantiene como red de seguridad documentada, no como parche a ciegas.

### Resoluciones adicionales (extensión Presupuesto, 16-ago-2026)
- **D-009 Ingreso quincenal en `profiles`, no en `budgets`**: se solicitó
  poder declarar el ingreso quincenal para calcular la diferencia cuando las
  aportaciones Q1/Q2 excedan ese ingreso. Se agregó como columna
  `quincenal_income` en `profiles` (migración
  `0017_budget_quincenal_income.sql`) en vez de en `budgets`, porque es un
  dato único del ciclo financiero del usuario (no por concepto) — mismo
  patrón que `activity_window_start/end`. _(Recommended default, subject to
  owner approval.)_
- **D-010 Conciliación con cuentas reutiliza `accountBalance`**: el
  requisito de "conciliar el balance del presupuesto con lo disponible en
  cuentas" se implementó en `budget/page.tsx` reutilizando
  `accountBalance()` de `src/lib/domain/money.ts` (la misma función que usan
  `/money` y `/debt`), sin crear ninguna tabla ni función de dominio
  paralela — consistente con D-003.
- **D-011 "Crear presupuesto" como flujo combinado**: el botón "+ Crear
  presupuesto" (visible solo cuando el usuario aún no tiene ningún
  concepto) combina en un solo formulario la declaración del ingreso
  quincenal y el primer concepto, reutilizando las Server Actions ya
  existentes (`updateQuincenalIncome`, `upsertBudgetLine`). Una vez creado
  el primer concepto, se usa el flujo habitual "+ Concepto"
  (`BudgetLineForm`), que ya soportaba edición de conceptos existentes.

## Guardrails aplicados literalmente del prompt de build

Cada guardrail marcado 🔴 en el prompt tiene un archivo/línea concreto que lo
implementa:

| Guardrail | Archivo |
|---|---|
| F1 (ERESOLVE) | `package.json` (versiones exactas), `.npmrc` |
| F2 (tsc en serie) | `package.json` script `typecheck` separado de `build` |
| F3 (tipos DB) | `src/types/database.types.ts`, generado con `supabase gen types` (`pnpm gen:types:local` / `pnpm gen:types`). Dejó de ser un stub escrito a mano el 2026-08-23 |
| F4 (env a nivel de módulo) | `src/config/env.ts` (`safeParse` + defaults, validación lazy) |
| F5 (CSP sin nonce) | `middleware.ts` |
| F6 (typedRoutes) | `next.config.ts` (`experimental.typedRoutes: false`) |
| F7 (useSearchParams sin Suspense) | `Sidebar.tsx`, `login/page.tsx` |
| F8 (NO-MOCK) | Todas las páginas leen de Supabase; ver `/docs/UX_MAP.md` |
| F9 (RLS sin GRANT) | Cada migración en `supabase/migrations/*.sql` incluye bloque GRANT explícito + `0010_default_privileges.sql` como backstop |
| F10 (seed no llega a remoto) | `docs/DEPLOY.md` paso 1.3, advertencia explícita |
| F11 (secretos acoplados) | `src/config/env.ts` (`requireServiceRoleKey`, `requireResendApiKey` independientes) |
| F12 (phone-frame en móvil) | `globals.css` (`100dvh`, `env(safe-area-inset-*)`), `layout.tsx` (`viewportFit: "cover"`) |
| F13 (seed no idempotente) | `supabase/seed.sql` (todo `ON CONFLICT` fija TODOS los campos gate) |
| F14 (warning ESLint cosmético) | Documentado en `/docs/CHECKS.md`, no bloqueante |
