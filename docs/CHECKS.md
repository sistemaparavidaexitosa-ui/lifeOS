# CHECKS — verificación honesta (Contrato de Honestidad, §0 del prompt de build)

> Este entorno de construcción **no tiene acceso a un registro npm real**
> (`npm install`/`pnpm install` devuelven `403 Forbidden` en todas las
> pruebas realizadas), **no tiene el CLI de Supabase ni Docker instalados**,
> y **no tiene un proyecto Supabase real vinculado**. Por lo tanto, `next
> build`, `supabase db reset` y `supabase test db` **no se pudieron ejecutar
> aquí**. Cada ítem de abajo usa uno de tres estados exactos, sin excepción:
> `✅ EJECUTADO OK` · `❌ EJECUTADO FALLÓ` · `⚠️ NO EJECUTADO en el entorno del asistente`.
>
> **Actualización (23-ago-2026):** la máquina del owner ya tiene registro npm,
> Docker y el CLI de Supabase, y la cadena completa se corrió de verdad contra
> una pila local de Supabase. Las secciones 1–10 conservan el estado del
> entorno original de construcción (son el registro histórico); el estado
> vigente está en la sección **Personal Development OS — Fase 1 (0024)**, al
> final del documento.

## Comando único para el owner

```bash
pnpm verify
# equivalente a:
# pnpm install --frozen-lockfile && pnpm typecheck && pnpm lint && \
# pnpm test:unit && pnpm build && supabase db reset && supabase db test
```

## 1) Versiones

| Ítem | Estado | Evidencia |
|---|---|---|
| Next.js no-EOL, última patch declarada | ✅ EJECUTADO OK | `package.json` fija `next: 15.1.8` (línea activa, no `.0`) — ver `/docs/VERSIONS.md` para la nota de verificación manual pendiente del owner |
| React/peers coherentes | ✅ EJECUTADO OK (por inspección) | `react`/`react-dom` en `19.0.0`, coincide con el peer que Next 15 exige |
| `@supabase/ssr` (no `auth-helpers`) | ✅ EJECUTADO OK | `grep -r "auth-helpers" package.json src/` → 0 resultados; `package.json` solo declara `@supabase/ssr` y `@supabase/supabase-js` |
| Instalación real (`pnpm install --frozen-lockfile`) | ⚠️ NO EJECUTADO en el entorno del asistente | Sin acceso a registro npm (403 Forbidden confirmado en `registry.npmjs.org`) |
| `pnpm-lock.yaml` commiteado | ❌ **NO INCLUIDO en esta entrega** | No se pudo generar sin `pnpm install` real. **Acción requerida del owner**: correr `pnpm install` una vez localmente (esto generará el lockfile), commitearlo, y a partir de ahí usar siempre `--frozen-lockfile`. Sin este paso, Vercel generará su propio lockfile en el primer deploy, lo cual funciona pero no es reproducible entre entornos hasta que se commitee |

## 2) Build

| Ítem | Estado | Evidencia |
|---|---|---|
| `tsc --noEmit` (proyecto completo, con tipos de Next/React reales) | ⚠️ NO EJECUTADO en el entorno del asistente | Requiere `node_modules` con `next`/`react` reales instalados |
| Sintaxis TypeScript de cada archivo (validación estática vía compilador TS) | ✅ EJECUTADO OK | **98/98 archivos** (`src/**/*.{ts,tsx}` + `middleware.ts`) transpilan sin error de sintaxis, verificado con `typescript.transpileModule` |
| `next build` | ⚠️ NO EJECUTADO en el entorno del asistente | Sin paquete `next` instalado en este entorno |
| `pnpm lint` | ⚠️ NO EJECUTADO en el entorno del asistente | Requiere `eslint`/`eslint-config-next` instalados |

## 3) Tipos de base de datos (F3)

| Ítem | Estado | Evidencia |
|---|---|---|
| `database.types.ts` generado con `supabase gen types` | ✅ EJECUTADO OK (23-ago-2026) | Regenerado con `--local` contra la pila en Docker; ya no queda nada escrito a mano. Ver la sección de la Fase 1 al final |
| Stub que satisface `GenericSchema` como puente temporal | ✅ EJECUTADO OK | `src/types/database.types.ts` define `Tables`/`Views`/`Functions`/`Enums`/`CompositeTypes` con `Row`/`Insert`/`Update`/`Relationships` para las 30 tablas del esquema, con comentario ⚠️ explícito al inicio del archivo |

## 4) Base de datos: migraciones + RLS + GRANTS (F9)

| Ítem | Estado | Evidencia |
|---|---|---|
| Migraciones aplican de cero (`supabase db reset`) | ⚠️ NO EJECUTADO en el entorno del asistente | Sin Docker/Supabase CLI |
| Sintaxis SQL balanceada (paréntesis) en las 10 migraciones + seed + 3 archivos de test | ✅ EJECUTADO OK | Verificado con conteo de paréntesis por archivo — todos balanceados (ver salida de comando en el historial de construcción) |
| Cada tabla con RLS tiene su bloque `GRANT` explícito | ✅ EJECUTADO OK (por inspección) | Las 10 migraciones incluyen bloques `grant select/insert/update/delete/all` inmediatamente después de cada bloque de políticas RLS; `0010_default_privileges.sql` añade el backstop `ALTER DEFAULT PRIVILEGES` |
| Pruebas pgTAP positivas Y negativas (RLS) | ⚠️ NO EJECUTADO en el entorno del asistente | 3 archivos escritos en `supabase/tests/*.sql` (17 aserciones pgTAP en total: 6 en `0001`, 7 en `0002`, 6 en `0003`), pero requieren `supabase test db` con Docker |

## 5) NO-MOCK (F8)

| Ítem | Estado | Evidencia |
|---|---|---|
| Ninguna vista muestra datos de entidades hardcodeados | ✅ EJECUTADO OK | `grep -rln "localStorage" src/app/` → 0 resultados. Cada página en `src/app/**/page.tsx` es un Server Component `async` que llama `await supabase.from(...)` — ver traza completa en `/docs/UX_MAP.md` |
| El `<script>` del HTML de referencia no se portó como lógica imperativa | ✅ EJECUTADO OK | No existe ningún archivo `app.ts`/`app.js` de lógica de UI; toda la lógica de dominio vive en `src/lib/domain/*.ts` (funciones puras, testeadas) y las Server Actions en `src/app/**/actions.ts` |

## 6) App Router (F5, F6, F7, F12)

| Ítem | Estado | Evidencia |
|---|---|---|
| CSP con nonce por request | ✅ EJECUTADO OK (por inspección) | `middleware.ts` genera `crypto.randomUUID()` por request y lo inyecta en `script-src 'nonce-...'` |
| `typedRoutes` desactivado o rutas dinámicas casteadas | ✅ EJECUTADO OK | `next.config.ts`: `experimental.typedRoutes: false` |
| `useSearchParams`/`usePathname` envueltos en `<Suspense>` | ✅ EJECUTADO OK | `login/page.tsx` envuelve `<LoginForm />`; `Sidebar.tsx` envuelve `<SidebarInner />`; `AppShell.tsx` envuelve `<TitleFromPath />` |
| Móvil nativo (sin phone-frame, safe-area) | ✅ EJECUTADO OK (por inspección de CSS) | `globals.css`: `height: 100dvh`, `env(safe-area-inset-*)`; `layout.tsx`: `viewportFit: "cover"` |
| Verificación visual en dispositivo/emulador real | ⚠️ NO EJECUTADO en el entorno del asistente | Sin navegador/dispositivo disponible en este entorno |

## 7) Env y secretos (F4, F11)

| Ítem | Estado | Evidencia |
|---|---|---|
| Sin `schema.parse()` a nivel de módulo | ✅ EJECUTADO OK | `src/config/env.ts` usa `safeParse` + `publicSchema.parse({})` (que aplica solo defaults, nunca lanza) |
| Secretos desacoplados por feature | ✅ EJECUTADO OK | `requireServiceRoleKey()` y `requireResendApiKey()` son funciones independientes; ninguna Server Action de Execution/Time/Habits/Money importa `requireResendApiKey` |
| Sin `service_role` en cliente | ✅ EJECUTADO OK | `grep -rn "SUPABASE_SERVICE_ROLE_KEY" src/` → solo aparece en `src/config/env.ts` y `src/lib/supabase/admin.ts` (ambos con `import "server-only"` en la cadena de imports) |
| `.env.example` sin valores reales | ✅ EJECUTADO OK (23-ago-2026) | El archivo **no existía** pese a que esta fila lo daba por hecho; se añadió en esta pasada. Solo trae las llaves por defecto de la pila local de Supabase, que son públicas e idénticas en cualquier máquina — ningún secreto real |

## 8) Seed (F10, F13)

| Ítem | Estado | Evidencia |
|---|---|---|
| Seed deja la app usable (usuario demo, proyecto, cuentas, deudas, hábitos, libro) | ✅ EJECUTADO OK (por inspección) | `supabase/seed.sql` crea 1 usuario, 2 proyectos, 3 tareas, 3 cuentas, 2 deudas, 4 líneas de presupuesto, 2 movimientos, 1 ocupación, 1 hábito, 1 libro, 2 miembros de hogar, 1 tarjeta de cashback |
| `ON CONFLICT` fija TODOS los campos gate, no un subconjunto | ✅ EJECUTADO OK (por inspección) | Cada `do update set` en el seed lista explícitamente todas las columnas que determinan visibilidad/estado de esa fila |
| Ejecución real del seed contra Postgres | ⚠️ NO EJECUTADO en el entorno del asistente | Requiere Docker/Supabase CLI local o un proyecto remoto |

## 9) Lógica de dominio (pruebas unitarias reales)

| Ítem | Estado | Evidencia |
|---|---|---|
| `node --experimental-strip-types --test tests/domain/*.test.ts` | ✅ EJECUTADO OK | **56 tests, 56 pass, 0 fail** — salida completa reproducida abajo |

```
$ node --experimental-strip-types --test tests/domain/*.test.ts
ℹ tests 56
ℹ suites 0
ℹ pass 56
ℹ fail 0
ℹ cancelled 0
ℹ skipped 0
ℹ todo 0
ℹ duration_ms 2625.639869
```

Desglose por archivo (todos ✅ ejecutados y en verde):

| Archivo | Casos | Cubre |
|---|---|---|
| `task-state.test.ts` | 8 | Máquina de estados, dependencias (FR-EXE-003/005) |
| `eisenhower.test.ts` | 8 | Cuadrantes, BR-023, estados terminales |
| `budget.test.ts` | 5 | Presupuesto tabular, BR-028 |
| `debt.test.ts` | 6 | Simuladores avalancha/nieve/cashflow/IA, FR-DEB-005/008 |
| `time.test.ts` | 7 | Huecos, saturación, BR-017 |
| `habits.test.ts` | 5 | Racha, BR-026 |
| `project-sequence.test.ts` | 6 | Secuenciación IA, BR-022 |
| `money.test.ts` | 11 | Ledger, BR-002/003/024/025, savings, investments |

## 10) Trazabilidad / UX map / A11y

| Ítem | Estado | Evidencia |
|---|---|---|
| Matriz Requisito → Tabla → RLS → Action → Componente → Test | ✅ EJECUTADO OK | `/docs/TRACEABILITY.md`, 21 filas cubriendo toda la Master Spec v0.4 |
| Mapa Vista HTML → Ruta → Componente → Dato → Acción | ✅ EJECUTADO OK | `/docs/UX_MAP.md`, 20 filas |
| Auditoría de accesibilidad (WCAG 2.2 AA) | ⚠️ NO EJECUTADO en el entorno del asistente | Requiere herramienta de auditoría (axe, Lighthouse) contra un build corriendo |

## Actualización (16-ago-2026) — extensión de Presupuesto (ingreso quincenal + conciliación con cuentas)

Se agregó `supabase/migrations/0017_budget_quincenal_income.sql` (columna
`profiles.quincenal_income`) y se modificaron `budget/actions.ts`,
`budget/page.tsx`, y se crearon `QuincenalIncomeForm.tsx` y
`CreateBudgetButton.tsx`. Estado honesto de esta actualización:

| Ítem | Estado | Evidencia |
| --- | --- | --- |
| Sintaxis TypeScript de los 4 archivos nuevos/modificados | ✅ EJECUTADO OK | Validado con `typescript.transpileModule` (mismo método usado para los 98 archivos originales) |
| Migración `0017` aplica sin errores de sintaxis SQL | ✅ EJECUTADO OK (por inspección) | Las 2 sentencias reales (`alter table`, `comment on column`) tienen paréntesis balanceados; el resto son comentarios `--` |
| `supabase db reset` con la migración `0017` aplicada | ⚠️ NO EJECUTADO en el entorno del asistente | Sin Docker/Supabase CLI, igual que el resto de migraciones (ver tabla de abajo) |
| Prueba unitaria de dominio para la nueva lógica | ⚠️ NO AGREGADA | La diferencia de ingreso quincenal y la conciliación con cuentas se calculan con funciones puras ya cubiertas por `tests/domain/budget.test.ts` (`budgetTabRow`) y `tests/domain/money.test.ts` (`accountBalance`); no se introdujo lógica de dominio nueva que requiera un archivo de test adicional |
| Verificación visual en navegador | ⚠️ NO EJECUTADO en el entorno del asistente | Sin navegador disponible aquí — revisa el flujo tú mismo tras el deploy |

## Resumen ejecutivo de este CHECKS.md

- **56 pruebas unitarias de dominio ejecutadas y en verde**, cubriendo toda
  la lógica de negocio no trivial (máquina de estados, ledger, presupuesto,
  deuda, tiempo, hábitos, secuenciación).
- **98 archivos TypeScript/TSX validados sintácticamente**, cero errores.
  (+4 archivos adicionales de la extensión de Presupuesto del 16-ago-2026,
  también validados sintácticamente, ver arriba.)
- **14 migraciones SQL + seed + 3 suites pgTAP** con sintaxis balanceada y
  patrón GRANT explícito por tabla, pero **sin ejecución real contra
  Postgres** (requiere Docker/Supabase CLI que este entorno no tiene).
  (+1 migración adicional, `0017`, en el mismo estado.)
- **Cero mocks**: se verificó por inspección exhaustiva que ninguna página
  usa `localStorage` ni datos hardcodeados.
- Ningún ítem fue marcado ✅ sin haberse ejecutado realmente en este
  entorno. Los ítems que dependen de `npm install`, `next build`, o un
  proyecto Supabase real están honestamente marcados ⚠️.

---

## Personal Development OS — Fase 1 (0024)

Verificación corrida el 2026-08-23 en la máquina del owner (WSL2, Node 24.19.0,
pnpm 9.15.4, Docker 29.7.2, Supabase CLI 2.115.0). **Esta pasada ya tuvo
Docker**: la pila local de Supabase (`npx supabase start`) estuvo levantada, así
que las migraciones, las pruebas pgTAP, la generación de tipos y el recorrido
manual en `pnpm dev` se ejecutaron de verdad. No queda ningún ⚠️ en esta fase.

La revisión contra el spec del módulo
(`docs/superpowers/specs/2026-08-22-personal-development-os-design.md`, añadido
al repo el 2026-08-23) cerró además los dos huecos de su §9 que no estaban
cubiertos: la equivalencia de la racha entre los dos caminos de marcado, y que
las tres tablas de rutinas también queden vacías para otro usuario. Las
desviaciones de forma respecto del spec, todas deliberadas, están en D-024 de
`/docs/DECISIONS.md`.

| Ítem | Estado | Evidencia |
|---|---|---|
| `pnpm install --frozen-lockfile` | ✅ EJECUTADO OK | Instalación limpia contra `pnpm-lock.yaml` commiteado |
| `pnpm typecheck` (`tsc --noEmit`) | ✅ EJECUTADO OK | Sin errores, ya con `database.types.ts` regenerado desde la base real |
| `pnpm lint` | ✅ EJECUTADO OK | `✔ No ESLint warnings or errors` |
| `pnpm test:unit` | ✅ EJECUTADO OK | 116/116 (86 previos + 12 de `development-goals` + 18 de `development-routines`, incluidas las 2 del puente rutina → racha que pedía el §9 del spec) |
| `pnpm build` | ✅ EJECUTADO OK | 30 rutas, incluidas `/development`, `/development/goals`, `/development/routines`, `/development/habits`, `/development/library` |
| `supabase db reset` (migraciones `0002`→`0025`) | ✅ EJECUTADO OK | Las 24 migraciones aplican de cero sin error, incluidas `0024_personal_development.sql` y `0025_fix_accept_invitation_ambiguity.sql`; el seed corre después |
| `supabase test db` | ✅ EJECUTADO OK | **7 archivos, 52 assertions, 0 fallos.** `0007_rls_development.sql` en verde y `0006_invitations_accept.sql` ya completo (era el que abortaba con el plan de 11/8) |
| Tipos de base de datos | ✅ EJECUTADO OK | `supabase gen types typescript --local` regeneró `src/types/database.types.ts` desde el esquema real. Sustituye el parche manual de `/docs/PATCH_database_types_development.md`. La regeneración también corrigió deriva previa: sobraba `occupations.days` (columna que ninguna migración crea) y faltaba la firma de `accept_invitation` |

### Recorrido manual en `pnpm dev` (los pasos "verificar en la app real" del plan)

Contra la pila local en Docker, con un usuario real creado en `auth.users` y
sesión de cookie legítima; los datos se sembraron **a través de PostgREST con el
JWT del usuario**, es decir pasando por RLS, no por `service_role`.

| Paso del plan | Estado | Qué se observó |
|---|---|---|
| Task 1 · Step 8 — `/habits` redirige | ✅ EJECUTADO OK | `307 → /development/habits` |
| Task 1 · Step 8 — sidebar del módulo | ✅ EJECUTADO OK | Grupo "Personal Development OS" con sus 5 rutas, en `var(--c-orange)` |
| Task 1 · Step 8 — biblioteca con notas | ✅ EJECUTADO OK | `/development/library`: "Deep Work · pág. 80/300 (27%) · 1 nota(s)" |
| Task 4 · Step 6 — meta medida desde el libro | ✅ EJECUTADO OK | Resultado clave con fuente libro: "120 / 240 págs" sin haber capturado nada |
| Task 4 · Step 6 — promedio de la meta | ✅ EJECUTADO OK | Meta "Leer 24 libros" = **25 %** = promedio de 50 % (libro) y 0 % (manual) |
| Task 4 · Step 6 — fuente borrada | ✅ EJECUTADO OK | Al borrar el libro, el resultado clave muestra el chip "fuente eliminada", no un 0 % fingido |
| Task 6 · Step 6 — puente rutina → `habit_logs` | ✅ EJECUTADO OK | Marcar el paso ligado a "Meditar" creó 1 fila en `habit_logs` para hoy; `/development/habits` pasó a "1 día(s) de racha" |
| Task 6 · Step 6 — idempotencia del puente | ✅ EJECUTADO OK | Ciclo marcar → desmarcar → marcar: sigue habiendo **1** `routine_run`, **1** `habit_log` y **1** entrada `habit.complete` en `audit_log`. Desmarcar no borra la racha |
| Task 6 · Step 6 — cierre de la ejecución | ✅ EJECUTADO OK | Con los 2 pasos marcados, `routine_runs.completed_at` quedó con timestamp |
| Task 7 · Step 4 — panel `/development` | ✅ EJECUTADO OK | "Metas activas 2 · Metas en riesgo 1"; la meta con horizonte cercano y poco avance muestra el chip "En riesgo"; "Rutina de hoy" muestra 2/2 pasos |

### Arreglo colateral: `accept_invitation` (0025)

| Ítem | Estado | Evidencia |
|---|---|---|
| Bug detectado | ✅ EJECUTADO OK | Job `db` de CI, run 32652771534 sobre `main`: `column reference "workspace_id" is ambiguous` en `accept_invitation()`; `0006_invitations_accept.sql` abortaba con "Bad plan. You planned 11 tests but ran 8" |
| `0025_fix_accept_invitation_ambiguity.sql` aplicada | ✅ EJECUTADO OK | `supabase test db` local: `0006_invitations_accept.sql .... ok`, sin plan roto |

---

## Personal Development OS — Fase 4, rebanada 1: metadatos de libros (`0026`)

Open Library / Google Books (§5.1 del spec del módulo). Sin OAuth, sin
credenciales obligatorias, sin tabla nueva. Verificado el 2026-08-23 contra la
pila local en Docker y contra las **APIs reales** de los dos proveedores.

| Ítem | Estado | Evidencia |
|---|---|---|
| `pnpm typecheck` / `pnpm lint` | ✅ EJECUTADO OK | Sin errores ni warnings |
| `pnpm test:unit` | ✅ EJECUTADO OK | 133/133 (116 previos + 17 de `development-book-lookup`) |
| `pnpm build` | ✅ EJECUTADO OK | 31 rutas: las 30 previas más `/api/development/book-lookup` |
| `supabase db reset` con `0026` | ✅ EJECUTADO OK | 25 migraciones desde cero; `books.cover_url text not null default ''` presente en el esquema |
| `supabase test db` | ✅ EJECUTADO OK | 7 archivos, 52 assertions, 0 fallos (la columna nueva hereda RLS y GRANT de `books`) |
| Open Library, API real | ✅ EJECUTADO OK | `isbn:9780735211292` → "Atomic Habits", James Clear, 323 págs, portada `covers.openlibrary.org/b/id/12539702-M.jpg`. Búsqueda por título ("deep work newport") → 5 candidatos, el primero correcto y completo |
| Google Books, API real | ❌ EJECUTADO FALLÓ (del proveedor, no del código) | Sin API key devuelve `429 Quota exceeded for quota metric 'Queries' ... per day` sobre una cuota anónima compartida. El fallo suave funcionó: la búsqueda siguió devolviendo los resultados de Open Library. Ver D-025 y la `GOOGLE_BOOKS_API_KEY` opcional |
| Ruta protegida | ✅ EJECUTADO OK | Sin sesión: `401 {"ok":false,...,"reason":"No autenticado"}`. Con sesión: 200 con candidatos |
| Portada en la biblioteca | ✅ EJECUTADO OK | El libro con `cover_url` renderiza `<img src="https://covers.openlibrary.org/…">`; el libro sin portada renderiza el placeholder 📖 de siempre |
| `img-src` ampliado | ⚠️ CORRECTO PERO INERTE HOY | La directiva quedó bien escrita y se comprobó emitida —`img-src 'self' data: blob: https://covers.openlibrary.org https://books.google.com`— **solo al mover el middleware a `src/`**. En el árbol tal como está, ninguna respuesta lleva CSP: ver el hallazgo de abajo |
| Guardado de la portada por la Server Action | ⚠️ VERIFICADO PARCIALMENTE | La validación del host está cubierta por pruebas unitarias (`isAllowedCoverUrl`) y el renderizado se comprobó con una fila real; lo que **no** se simuló es el envío del formulario desde el navegador — la acción se invoca con argumentos ligados y reproducir ese protocolo con `curl` no era proporcional |

### Hallazgo colateral (preexistente, NO introducido por esta rebanada): el middleware nunca corre

`middleware.ts` está en la **raíz** del repo mientras la aplicación vive en
`src/`. Next.js busca el middleware junto al directorio `app`, así que lo
ignora por completo. Comprobado de tres formas independientes el 2026-08-23:

1. `.next/server/middleware-manifest.json` tiene `middleware: {}` — sin entradas.
2. Ninguna respuesta de la app lleva cabecera `Content-Security-Policy`, en
   ninguna ruta (`/login`, `/development/library`, `/api/health`).
3. El dev server nunca reporta haber compilado un middleware.

Consecuencias, todas anteriores a esta rama:

- **La CSP con nonce por request (F5 🔴) no se está aplicando en ningún lado.**
  El código existe y es correcto, pero no se ejecuta.
- **El refresco de sesión de `@supabase/ssr` en cada request tampoco corre.**
  Las páginas siguen funcionando porque cada una llama `getUser()` por su
  cuenta, y el redirect a `/login` que se observa lo produce la página, no el
  middleware.
- Por eso el Route Handler nuevo valida la sesión él mismo: era la única
  guarda real que tenía.

**El arreglo es mover el archivo a `src/middleware.ts`.** No se incluyó en la
rama del buscador de libros a propósito —encender por primera vez una CSP en
toda la app es un cambio de comportamiento global que no debe viajar de
polizón— y se hizo aparte, en la rama siguiente. Su verificación está abajo.

---

## Arreglo: el middleware se mueve a `src/` y la CSP se enciende por primera vez

`git mv middleware.ts src/middleware.ts`, más las dos guardas que antes no
hacían falta porque el código no corría (ver D-026). Verificado el 2026-08-23
contra la pila local, con la CSP ya activa.

| Ítem | Estado | Evidencia |
|---|---|---|
| El middleware se registra | ✅ EJECUTADO OK | `pnpm dev` imprime `Compiling /middleware ... Compiled /middleware in 533ms`. Antes no aparecía nunca |
| CSP presente en toda respuesta | ✅ EJECUTADO OK | `/login`, `/home`, `/execution`, `/money`, `/time`, `/development`, `/settings`: **200 y cabecera CSP en las siete** |
| El nonce llega a los scripts | ✅ EJECUTADO OK | **35 de 35** `<script>` de `/development/library` llevan `nonce=`, y es el mismo valor que la cabecera. Sin esto, encender la CSP sería la pantalla en blanco de F5 |
| `connect-src` cubre Supabase | ✅ EJECUTADO OK | `connect-src 'self' http://127.0.0.1:54321 https://*.supabase.co wss://*.supabase.co` — el origen local sale de `NEXT_PUBLIC_SUPABASE_URL`, así que en producción apunta al proyecto real |
| `img-src` cubre las portadas | ✅ EJECUTADO OK | `img-src 'self' data: blob: https://covers.openlibrary.org https://books.google.com`, y la portada se renderiza en la biblioteca |
| `/api/health` sigue público | ✅ EJECUTADO OK | Sin sesión: `200 {"status":"ok",...}`. Es el smoke check de DEPLOY.md paso 4 — sin la exención, el arreglo lo habría roto |
| `/api/*` responde 401, no redirect | ✅ EJECUTADO OK | `/api/development/book-lookup` sin sesión: `401 {"ok":false,"reason":"No autenticado"}`. Con redirect, el `fetch` del cliente habría recibido el HTML del login con estado 200 |
| Página protegida sin sesión | ✅ EJECUTADO OK | `307 → /login`, ahora sí desde el middleware, y **el redirect también lleva CSP** (antes era el único camino que se quedaba sin ella) |
| Página protegida con sesión | ✅ EJECUTADO OK | `/development/library` → 200, con la portada y el listado completos |
| `pnpm verify` | ✅ EJECUTADO OK | Cadena completa en verde: 133 pruebas unitarias, 52 assertions pgTAP, 25 migraciones, build de 31 rutas |

### Lo que este arreglo cambia en producción, y que hay que mirar tras el deploy

- **La barra de "Preview Comments" de Vercel se carga desde `vercel.live`**, que
  no está en `script-src`. En los deploys de *preview* es previsible que quede
  bloqueada. Producción no la usa, y no se abrió la CSP por una herramienta de
  preview.
- **El refresco de sesión empieza a correr de verdad** en cada request. Es el
  comportamiento que el patrón oficial de `@supabase/ssr` espera y que llevaba
  todo este tiempo apagado.

---

## Intelligence OS — Fase 1: rebanada vertical sobre Dinero

El motor de recomendaciones existía solo como cuatro tablas de la `0008` y cero
código. Esta fase entrega la rebanada vertical del §8.1 de su spec: tipo `Fact`,
extractor de money, `context.ts` con allowlist, capa de modelo, validación por
anclaje y `InsightPanel` en `/money`. Sin ruta nueva, sin memoria, sin acciones
aplicables y **sin migración**: la tabla `recommendations` ya tenía todo lo que
hacía falta.

Verificado el 2026-08-24 contra la pila local.

| Ítem | Estado | Evidencia |
|---|---|---|
| `pnpm typecheck` / `pnpm lint` | ✅ EJECUTADO OK | Sin errores ni warnings, ya con zod `3.25.76` |
| `pnpm test:unit` | ✅ EJECUTADO OK | 166/166 (133 previos + 33 nuevas: 14 del extractor, 12 del filtro de privacidad, 7 del anclaje) |
| `pnpm build` | ✅ EJECUTADO OK | 31 rutas, sin ruta nueva |
| `supabase db reset` + `supabase test db` | ✅ EJECUTADO OK | 25 migraciones, 52 assertions pgTAP |
| Compatibilidad de `zodOutputFormat` con la zod del proyecto | ❌ EJECUTADO FALLÓ, y por eso se cambió | El spec dejó esto marcado como "verificar al instalar". Con la zod clásica revienta: `Cannot read properties of undefined (reading 'def')`. Resuelto subiendo a `3.25.76` e importando `zod/v4` **solo** en `recommend.ts` — ver D-027 |
| Hechos calculados desde datos reales | ✅ EJECUTADO OK | Con 8400 gastados contra 6000 presupuestados en la base, el prompt salió con `budget.overrun.alimentos \| Alimentos: 8400 gastado de 6000 presupuestado (2400 por encima)` e `income.unassigned \| 14000 de ingreso mensual sin asignar` |
| Petición al modelo bien formada | ✅ EJECUTADO OK | `model: claude-opus-5`, `thinking: {type: adaptive}`, `output_config.effort: high`, `output_config.format.type: json_schema`, `max_tokens: 8000` |
| **Validación de anclaje** | ✅ EJECUTADO OK | El proveedor devolvió dos recomendaciones: una anclada a `budget.overrun.alimentos` y otra citando `investment.loss.inexistente`. **Se escribió una sola fila**; la inventada se descartó y quedó contada en la bitácora (`dropped: 1`) |
| **Seudonimización en el camino real** | ✅ EJECUTADO OK | Con una recomendación suprimida que decía "No recortes el gasto de Ana ni toques BBVA Nómina", la petición salió con "Dependiente #1" y "Cuenta #1", y ni `Ana` ni `BBVA Nómina` aparecen en ningún punto del cuerpo enviado |
| Bitácora del análisis (§4.2) | ✅ EJECUTADO OK | `audit_log`: `ai.analyze` con `{"model":"claude-opus-5","scope":"money","domains":["money"],"factCount":2,"created":1,"dropped":1}` |
| Fallo suave sin llave | ✅ EJECUTADO OK | Sin `ANTHROPIC_API_KEY`: el análisis responde `{"ok":false,...,"reason":"ANTHROPIC_API_KEY no está definida..."}` y `/money` sigue en 200. Un motor no configurado no puede tumbar la página de dinero (D-021) |

### Lo que NO se pudo verificar: la llamada al modelo real

**No hay `ANTHROPIC_API_KEY` en esta máquina ni CLI de Anthropic instalado**, así
que ninguna petición llegó a la API de verdad. Todo lo de arriba se comprobó
contra un **stub local del endpoint `/v1/messages`** (`ANTHROPIC_BASE_URL`
apuntando a `127.0.0.1`), que registra la petición recibida y responde con una
salida estructurada fabricada a propósito: una recomendación bien anclada y una
inventada.

Eso verifica de punta a punta la construcción de la petición, el parseo de la
salida, la validación de anclaje, la seudonimización, la escritura en la base y
la bitácora. Lo que **no** verifica es la calidad de lo que el modelo real
escribe, ni que la API acepte exactamente este cuerpo. Queda pendiente de la
primera corrida con llave real:

1. Que la API acepte la combinación `thinking: adaptive` + `output_config` con
   `effort` y `format` a la vez.
2. Si las recomendaciones que produce sobre datos reales son útiles o son
   obviedades que el propio panel ya muestra — que es la pregunta que esta fase
   existía para responder.

---

## Intelligence OS — Fase 2: bandeja, memoria, deduplicación y opt-in

Lo que el §8.2 del spec pedía: rutas `/intelligence` y `/intelligence/memory`,
los siete estados, dedupe por huella (migración `0027`, no la `0023` que pedía
el spec) y opt-in por dominio en `/settings`, más los dos borrados del §4.4.

Verificado el 2026-08-24 contra la pila local.

| Ítem | Estado | Evidencia |
|---|---|---|
| `pnpm verify` completo | ✅ EJECUTADO OK | typecheck, lint, **192 pruebas unitarias**, build, `db reset` con 26 migraciones y **59 assertions pgTAP** |
| pgTAP de la fase (`0008_rls_intelligence.sql`) | ✅ EJECUTADO OK | 7 assertions: el opt-in nace vacío, el índice parcial bloquea el duplicado vivo, una descartada deja pasar la misma huella otra vez, `origin` solo admite `user`/`ai`, y otro usuario no ve recomendaciones, memoria ni bitácora |
| **El opt-in apagado corta el envío de verdad** | ✅ EJECUTADO OK | Con `ai_domains` vacío (el default), `analyze` responde "Dinero está apagado para el análisis…" y **no sale ni una petición hacia el modelo** — comprobado borrando el registro del stub antes de la llamada: no se volvió a crear |
| Encender el dominio en Configuración | ✅ EJECUTADO OK | `setAiDomains` desde el formulario real: `ai_domains={money}` en la base |
| Memoria vigente en el prompt | ✅ EJECUTADO OK | Con dos notas, una vigente y una caducada en enero, el prompt salió con la sección "Lo que el usuario te ha dicho y debes respetar" conteniendo **solo la vigente** |
| **Dedupe: no duplicar lo vivo** | ✅ EJECUTADO OK | Dos análisis seguidos con la misma salida: **una sola fila**, y la respuesta lo dice ("las recomendaciones que ya tenías se actualizaron") |
| **Dedupe: no resucitar lo silenciado** | ✅ EJECUTADO OK | Con la recomendación en `Suppressed`, un análisis nuevo con la misma huella **no la reescribe ni la revive**: sigue en `Suppressed`, una sola fila |
| Máquina de estados sobre el cable | ✅ EJECUTADO OK | `Suppressed → Presented` rechazada (`"No se puede pasar de Suppressed a Presented."`); `Suppressed → Dismissed` aceptada, con `audit_log` registrando `{"from":"Suppressed","to":"Dismissed"}` |
| Bandeja `/intelligence` | ✅ EJECUTADO OK | 200, con el contador "0 sin resolver de 1", los filtros por estado y la tarjeta con impacto, confianza, estado, dominio y tipo |
| Memoria `/intelligence/memory` | ✅ EJECUTADO OK | 200, las dos notas listadas y la caducada marcada como tal y tachada |
| Grupo de navegación | ✅ EJECUTADO OK | "Intelligence OS" en la sidebar con sus dos rutas, en `var(--c-teal)` |

### Un bug que solo apareció integrando

La memoria entraba al contexto y **no se estaba renderizando en el prompt**: la
añadí a `buildContext` y olvidé la sección correspondiente en `buildPrompt`. Las
pruebas unitarias del contexto pasaban —la memoria estaba ahí— y aun así el
modelo nunca la habría visto. Lo destapó mirar el cuerpo real de la petición en
el stub, no el árbol de pruebas. Corregido y vuelto a comprobar.

### Lo que sigue sin verificarse

- **La llamada al modelo real**, por lo mismo que en la Fase 1: no hay
  `ANTHROPIC_API_KEY` en esta máquina. Todo lo de arriba corre contra el stub
  local del endpoint.
- **`upsertMemoryItem` y `deleteMemoryItem` no se ejercitaron sobre el cable.**
  Se invocan desde un formulario con argumentos ligados y reproducir ese
  protocolo con `curl` no era proporcional; la memoria se sembró por PostgREST,
  que pasa por la misma RLS. Lo que sí se verificó de punta a punta es que la
  memoria vigente llega al prompt y la caducada no.

---

## Workspaces obligatorios (agosto 2026) — migraciones 0030/0031

| Check | Estado | Evidencia |
|---|---|---|
| `supabase db reset` (migraciones `0002`→`0031`) | ✅ EJECUTADO OK | Las 26 migraciones aplican de cero, incluidas `0030_workspaces_obligatorios.sql` (backfill + `set not null`) y `0031_rls_acceso_por_workspace.sql`; el seed corre después sin tocar nada a mano |
| `supabase test db` | ✅ EJECUTADO OK | **82 assertions pgTAP en 11 archivos, todas en verde** |
| `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm build` | ✅ EJECUTADO OK | 212 pruebas unitarias, build de 31 rutas |
| Tipos generados coinciden con la base | ✅ EJECUTADO OK | `pnpm gen:types:local` sobre el esquema nuevo devuelve exactamente lo editado a mano (`workspaces.is_personal`, `projects.workspace_id` sin `| null`); la única diferencia fue `can_edit_comment_subject`, un rezago de la migración 0029 que nunca se regeneró |
| **Membresía = acceso, sobre datos reales** | ✅ EJECUTADO OK | Con el seed: Ana (Member de «Equipo LifeOS», **sin ninguna fila en `project_shares`**) ve «Mudanza de oficina» y `can_edit_project` devuelve `true`; NO ve «Lanzar Life OS MVP», que vive en el espacio personal de Luis. Luis ve los dos |
| Cero proyectos huérfanos tras el backfill | ✅ EJECUTADO OK | `select count(*) from projects where workspace_id is null` → 0 |
| El espacio personal se crea solo | ✅ EJECUTADO OK | `0011_workspace_obligatorio.sql`: insertar un usuario en `auth.users` deja su espacio personal **y** su membresía Owner; un segundo espacio personal rebota con `23505` |
| El espacio personal no admite invitados | ✅ EJECUTADO OK | El `insert` en `invitations` contra un espacio personal falla en la BASE (`P0001`), no solo en la interfaz |
| Un espacio con proyectos no se borra | ✅ EJECUTADO OK | `delete from workspaces` con un proyecto dentro lanza `P0001` con el conteo en el mensaje |

### Tres pruebas que hubo que reescribir, y por qué

No fue mantenimiento cosmético: sus aserciones **decían lo contrario** del
modelo nuevo y pasaban por eso.

- `0002_rls_execution_collaboration.sql` — su test central era «un Member NO
  puede editar un proyecto compartido solo con nivel view». Desde 0031 el
  Member edita los proyectos de su espacio. Reescrito entero a la tabla por rol
  (Member, Viewer, Guest con y sin share, Outsider): de 7 assertions a 12.
- `0004_rls_groups_folders.sql` — el test 4 (`Member SIN project_shares NO ve
  el grupo del Board`) **falló en la primera corrida**, que es exactamente lo
  que debía pasar. Se invirtió la expectativa dejando el montaje intacto.
- `0010_rls_comments_delete.sql` — necesitaba a alguien que viera sin poder
  editar, papel que hacía un Member con share `view`. Ese rol dejó de existir:
  ahora lo hace un **Viewer**, el único que ve sin editar.

### Lo que no se verificó

- **El correo de invitación sobre el cable.** Sigue dependiendo de
  `RESEND_API_KEY`, ausente en esta máquina; el enlace se genera y se muestra
  igual (D-021), que es la ruta que sí se ejercitó.
- **El recorrido de UI en el navegador.** Selector de espacio, panel de Equipo,
  «Mover a otro espacio» y «Acceso de invitados» compilan y tienen sus acciones
  probadas contra la RLS, pero no se hizo clic en ellos.

---

## Notebooks del espacio (agosto 2026) — migración 0032

| Check | Estado | Evidencia |
|---|---|---|
| `supabase db reset` (migraciones `0002`→`0032`) | ✅ EJECUTADO OK | 27 migraciones de cero + seed, sin intervención manual |
| `supabase test db` | ✅ EJECUTADO OK | **91 assertions pgTAP en 12 archivos**, todas en verde |
| `pnpm typecheck` · `pnpm lint` · `pnpm test:unit` · `pnpm build` | ✅ EJECUTADO OK | **232 pruebas unitarias** (20 nuevas del formato de notas), build de 32 rutas |
| **Membresía = acceso, sobre datos reales** | ✅ EJECUTADO OK | Con el seed, Ana (Member, **sin ninguna fila de permiso adicional**) ve las 2 notas de «Actas y decisiones», `can_edit_notebook` le devuelve `true`, y NO ve «Ideas sueltas», el cuaderno del espacio personal de Luis |
| Marca de autoría por nota | ✅ EJECUTADO OK | Las notas del cuaderno compartido salen firmadas por quien las escribió: una por Luis y otra por Ana |
| Búsqueda en español, sin acentos | ✅ EJECUTADO OK | Buscar `direccion` encuentra la nota titulada «Acta de la reunión de dirección»; el índice lematiza (`to_tsvector('spanish', …)`) |
| **La búsqueda no filtra entre espacios** | ✅ EJECUTADO OK | Test 8 de `0012`: un Outsider llamando a `search_notes()` sobre el workspace ajeno recibe 0 filas. `search_notes` NO es SECURITY DEFINER, así que la RLS se aplica dentro |
| El Guest queda fuera de los cuadernos | ✅ EJECUTADO OK | Tests 5 y 6 de `0012`: siendo miembro activo del espacio, no ve ni el notebook ni sus notas |
| El Viewer lee y no escribe | ✅ EJECUTADO OK | Test 4 de `0012`: su `UPDATE` afecta 0 filas |
| Nada de lo que se escriba puede ejecutarse | ✅ EJECUTADO OK | `tests/domain/notes-markup.test.ts`: `<img src=x onerror=…>` se parsea como TEXTO, y `[x](javascript:alert(1))` no produce ningún enlace. El renderizador crea elementos de React, nunca `dangerouslySetInnerHTML` |

### Un fallo que valió la pena

El test 9 de `0012` (búsqueda con acentos) falló en la primera corrida con
`have: 0, want: 1`. **No era el código**: el test del Member, más arriba en el
mismo archivo, reescribe el cuerpo de la nota, y como todo el archivo corre en
una sola transacción ese cambio seguía vivo al llegar a buscar — la palabra que
se buscaba ya no existía. Se arregló con una nota aparte que ningún otro test
toca, para que la búsqueda pruebe la búsqueda y no el orden de los tests.

### Lo que no se verificó

- **El recorrido en un iPhone real.** Las decisiones de móvil del editor
  (pantalla propia en vez de panel, autoguardado en `visibilitychange`, textarea
  que crece solo, 16px en el cuerpo para que Safari no haga zoom) están puestas
  y compilan, pero no se ha escrito una nota con el teclado abierto en un
  dispositivo. Es la comprobación pendiente más importante de esta entrega.
- **Dos personas editando la misma nota a la vez.** La rama de conflicto de
  `saveNote` está escrita y razonada, pero no se ha ejercitado con dos sesiones
  simultáneas. Reproducirlo pide abrir la misma nota en dos navegadores y
  guardar en orden.

---

## Rendimiento percibido en móvil (agosto 2026)

Medido contra el build de producción (`pnpm build && pnpm start`) apuntando al
Supabase local, con sesión real del usuario demo y contando peticiones en el log
del contenedor de auth y en `pg_stat_statements`.

| Check | Estado | Evidencia |
|---|---|---|
| **Llamadas a `/auth/v1/user` por request** | ⚠️ HIPÓTESIS REFUTADA | Se esperaban 5 y **eran 2, antes y después**. Next.js ya memoiza los `fetch` GET idénticos dentro de un render; la segunda es la del middleware, que corre en otra invocación. Ver D-042 |
| Consultas PostgREST en `/execution?ws=<equipo>` | ✅ MEDIDO | 8 antes y 8 después. No se quita ninguna: lo que cambia es que 4 pasan de ir en serie a ir en paralelo, y 2 (TeamSection) salen del camino crítico |
| Consultas en el editor de notas | ✅ MEDIDO, MEJORA REAL | 8 → 7. La consulta de conteo de notas solo aparece ya en la estantería, que es la única pantalla que la usa |
| Tiempo de respuesta en local | ❌ NO CONCLUYENTE | Medianas de 15 requests: `/execution` 0.335 s antes vs 0.306 s después; con `?ws=` 0.258 s vs 0.332 s. Se mueve ±0.07 s **en ambas direcciones** entre corridas — con Supabase en 127.0.0.1 un viaje cuesta <1 ms y no hay latencia que ahorrar. Ver D-043 |
| `pnpm typecheck` · `lint` · `test:unit` · `supabase test db` | ✅ EJECUTADO OK | 232 unitarias, 91 assertions pgTAP, sin regresiones |

### El bug que apareció al intentar medir

Para contar peticiones hacía falta una sesión real, y **el usuario demo del seed
no podía iniciar sesión**: `auth.users` se sembraba con `email_change` y otras
cinco columnas de token en NULL, GoTrue las lee como `string` de Go y devolvía
500 «Database error querying schema». La causa real solo estaba en su log:
*"converting NULL to string is unsupported"*. Venía así desde el primer commit
del seed. Corregido en un commit aparte.

### Lo que NO se pudo verificar

- **Que paralelizar y `Suspense` mejoren el tiempo real.** Es la limitación de
  medir en local: quitan viajes EN SERIE, y aquí cada viaje cuesta <1 ms. Para
  verlo hace falta medir contra el despliegue (Vercel `iad1` + Supabase remoto)
  con el teléfono, no con `curl` a `localhost`.
- **La región.** `vercel.json` fija `iad1` (Virginia) y el perfil por defecto es
  `America/Mexico_City`. Cambiarla depende de dónde esté alojado el proyecto de
  Supabase, que no se puede consultar desde aquí. Queda como pendiente, no como
  hecho.

---

## Personal Development OS: plantillas y lectura medida (agosto 2026) — migraciones 0033/0034

| Check | Estado | Evidencia |
|---|---|---|
| `supabase db reset` (migraciones `0002`→`0034`) | ✅ EJECUTADO OK | 29 migraciones de cero + seed |
| `supabase test db` | ✅ EJECUTADO OK | **98 assertions pgTAP en 13 archivos** |
| `pnpm typecheck` · `lint` · `test:unit` · `build` | ✅ EJECUTADO OK | **270 pruebas unitarias** (29 nuevas), build de 32 rutas |
| **Fecha estimada, contra el servidor de producción** | ✅ EJECUTADO OK | `/development/library` con sesión real pinta *«Terminarías el 11 sep 2026 · 12 págs./día, según tu ritmo de los últimos días»*. Cuadra a mano: 3 puntos sembrados (0 → 60 → 120 páginas en 10 días) dan 12 págs./día, y las 160 restantes son 14 días |
| Las tres vistas de la biblioteca | ✅ EJECUTADO OK | `?por=estado` (por defecto), `?por=categoria` (agrupa en «Desarrollo personal» y muestra el estado como dato complementario) y `?por=todos` («Todos · 1 libro») |
| Campos de «Hábitos atómicos» en la fila | ✅ EJECUTADO OK | `/development/habits` pinta la señal («Después de meterme a la cama») y, al no estar marcado hoy, la salida de emergencia («Si hoy no puedes: leer una página») |
| Entradas a las plantillas | ✅ EJECUTADO OK | Botón «Plantillas» presente en Rutinas y en Hábitos |
| Las duraciones de las plantillas suman lo que prometen | ✅ EJECUTADO OK | Prueba unitaria: S.A.V.E.R.S. 60, versión corta 6, 20/20/20 son `[20,20,20]` |
| El historial de lectura es privado | ✅ EJECUTADO OK | Test 6 de `0013`: otro usuario no ve ni un punto de `book_progress` |
| No se puede apilar sobre un hábito ajeno ni sobre sí mismo | ✅ EJECUTADO OK | Tests 5 y 7 de `0013`: `23514` para el auto-apilamiento y `P0001` (trigger) para el de otra cuenta, probado **como superusuario** — si la única defensa fuera la RLS, ese UPDATE pasaría |

### Un bug que solo apareció al escribir la prueba

El mapeo de categorías clasificaba **«Juvenile Nonfiction» como Ficción**,
porque buscaba por subcadena y «nonfiction» contiene «fiction». Lo destapó el
test de «lo que no reconoce cae en Otros», que es justo el que parecía trivial.
Se corrigió buscando por inicio de palabra —que además conserva «biograf» →
«biografía»— y de paso se reordenó Ficción antes que Técnico para que «Science
Fiction» sea una novela y no un libro de ciencia. Las dos correcciones tienen su
propia prueba.

### Lo que no se verificó

- **La categoría propuesta contra las APIs reales.** El mapeo está probado con
  los valores que Open Library y Google Books devuelven habitualmente, pero no
  se hizo una búsqueda real contra los dos proveedores; Google Books además
  responde 429 con la cuota anónima compartida (ver D-022).
- **El recorrido de las plantillas en el navegador.** Crear una rutina desde
  S.A.V.E.R.S. y comprobar que el paso de lectura queda ligado al hábito «Leer
  20 minutos» está implementado y con la acción probada por tipos, pero no se
  hizo clic en él.

## Panel de administración y catálogo de plantillas en la base (1-sep-2026, migración 0044)

Es el cambio que **deroga D-044**: el catálogo deja de ser un array en el código
y pasa a `template_catalog`, editable desde `/admin`. Lo que sigue es lo que se
ejecutó de verdad.

### Lo que se ejecutó

| Comprobación | Estado | Evidencia |
|---|---|---|
| `pnpm typecheck` | ✅ EJECUTADO OK | Sin errores. Incluye las tres aserciones de tipo de `templates/schema.ts`, que hacen fallar a `tsc` si una interfaz del dominio gana un campo y el zod no |
| `pnpm lint` | ✅ EJECUTADO OK | «No ESLint warnings or errors» |
| `pnpm test:unit` | ✅ EJECUTADO OK | **572 pruebas, 572 pass, 0 fail** (eran 563 antes de este cambio) |
| `pnpm build` | ✅ EJECUTADO OK | Compila y aparecen las tres rutas nuevas: `/admin`, `/admin/[kind]`, `/admin/[kind]/[slug]` |
| Migración 0044 aplicada | ✅ EJECUTADO OK | `supabase migration up --local`. **No** se corrió `db reset`: la base local tenía datos y la migración no los necesita |
| `pnpm db:test` (pgTAP) | ✅ EJECUTADO OK | **20 archivos, 150 assertions, PASS**, incluido el nuevo `0020_rls_template_catalog.sql` (12) |
| El seed no perdió nada | ✅ EJECUTADO OK | 24 filas publicadas: 11 proyecto, 3 rutina, 10 hábito. `tests/domain/templates-catalogo.test.ts` compara los slugs uno a uno contra la lista que había en código |
| Las 24 pasan el esquema con el que se leen | ✅ EJECUTADO OK | Si una no pasara, la capa de datos la descartaría y sería invisible en producción sin fallar ruidosamente |

### Recorrido real contra PostgREST (no solo `set role`)

pgTAP prueba la RLS con `set local role`, que no pasa por los GRANT del mismo
modo que la aplicación. Esto se hizo por el camino real, contra la pila local:

| Paso | Resultado |
|---|---|
| `anon` (sin sesión) pidiendo el catálogo | `42501 permission denied for table template_catalog` — el `revoke` de la migración **hacía falta**: `0002` concede `select` a `anon` por defecto a toda tabla nueva, y la política `status = 'published'` no lo habría frenado |
| Usuario normal con sesión, publicadas | Ve las 24: 11 proyecto, 10 hábito, 3 rutina |
| Usuario normal, con un borrador REAL en la tabla | `[]` — no lo ve |
| Usuario normal intentando insertar | `42501 new row violates row-level security policy` |
| El **mismo** usuario tras ponerle `is_admin` | Ya ve el borrador |
| Ese admin publicando la plantilla | `status` pasa a `published` |
| Ese admin pidiendo el perfil de la otra usuaria | `[]` — **BR-012 en pie**: administrar contenido no es ver a la gente |

La base se dejó como estaba: 24 plantillas, cero administradores, ninguna fila
temporal.

### Un descuido que la verificación destapó

El comentario de la migración afirmaba que a `anon` «no se le da nada», y era
falso: `0002` deja puesto un `alter default privileges ... grant select on
tables to anon`, así que la tabla nacía legible para cualquiera sin sesión —y su
política de lectura no lo frenaba, porque `status = 'published'` es cierto sin
usuario. Se añadió un `revoke all ... from anon` explícito, y la comprobación de
arriba es la que lo demuestra.

### Un test que estaba mal escrito

La primera versión de «una tarea con `due` o `impact` no pasa el esquema» falló:
zod **descarta** las claves que no declara en vez de rechazarlas. La garantía
real no es que se rechace, sino que nunca se guarda — la acción del panel
escribe lo que sale del parseo, no lo que entró. El test se corrigió para
comprobar eso, que es lo que de verdad protege el invariante.

### Lo que NO se verificó

- **El recorrido en un navegador.** No se hizo clic en `/admin`: crear una
  plantilla desde el formulario, moverle un grupo de sitio, previsualizarla y
  publicarla está implementado y probado por tipos, RLS y pruebas unitarias,
  pero nadie lo ha usado con el ratón. El paso 3bis de `/docs/DEPLOY.md` y el
  smoke test lo cubren para el despliegue.
- **`pnpm verify` completo.** Se corrieron sus pasos por separado a propósito:
  termina en `supabase db reset`, que borra la base local, y había datos dentro.
- **Que el 404 de `/admin` se vea como 404 en el navegador.** El `notFound()`
  del layout está puesto y el build genera la ruta, pero la respuesta HTTP no se
  comprobó con una sesión real.

## Nutrición dentro de Personal Development OS (4-sep-2026)

### Lo que se ejecutó

| Comprobación | Resultado |
|---|---|
| `pnpm verify` (cadena completa) | ✅ install → typecheck → lint → test:unit → build → `db reset` → `db test`, todo en verde |
| `pnpm test:unit` | ✅ **664 pruebas**, 0 fallos (eran 574) |
| `pnpm build` | ✅ exit 0; `/development/nutrition` aparece en el listado de rutas |
| `pnpm db:reset` (47 migraciones + seed) | ✅ la 0047 aplica sin error desde cero |
| `supabase test db` | ✅ **23 archivos, 182 aserciones**, incluido `0022_rls_nutricion.sql` (17) |
| `pnpm gen:types:local` | ✅ `nutrition_profiles`, `body_measurements`, `foods`, `food_entries`, `key_results.source_metric` y `key_results.baseline` aparecen en `database.types.ts` (F3) |

La base local se reseteó varias veces durante el trabajo. Antes de la primera se
comprobó su contenido: 2 usuarios y 3 tareas, exactamente la semilla. **No había
datos reales que perder** y el proyecto remoto no se tocó.

### Un bug que se detectó leyendo, no en pantalla

**Dos campos con el mismo `name` en el formulario de alimentos.** Los macros del
alimento elegido iban en `input hidden` pintados siempre, y convivían con los
campos visibles de captura manual: `FormData.get` se queda con el primero, que
iba vacío, así que **registrar a mano habría fallado siempre**. Los ocultos
pasan a pintarse solo cuando hay un alimento elegido. Da igual de todas formas
para la integridad: el servidor recalcula los macros desde `(per100g, gramos)` y
los vuelve a validar, porque eso lo edita cualquiera desde el navegador.

### Lo que NO se verificó

- **Ninguna llamada real a USDA ni a Open Food Facts.** No hay `USDA_API_KEY` en
  este entorno, y a Open Food Facts no se ha salido. Lo que está probado es la
  normalización de sus respuestas contra cuerpos escritos a mano
  (`development-nutrition-lookup.test.ts`, 16 casos), incluidos los dos errores
  que más caro salen: usar `energy_100g` (kJ) en vez de `energy-kcal_100g`, y
  descartar un alimento sin energía en vez de inventarle 0 kcal. Sin ejercitar
  quedan: la forma real de las respuestas, el `User-Agent` obligatorio de OFF
  —incumplirlo se castiga con bloqueo de IP—, y que la caché evite de verdad la
  segunda petición.
- **El recorrido en un navegador.** Nadie ha registrado una comida con el ratón.
  El buscador, el panel del perfil corporal y el formulario de peso compilan y
  tienen sus acciones probadas por tipos, pero no se han visto funcionar.

## Cadena de modelos · Herramientas · Memoria (3/4-sep-2026)

### Lo que se ejecutó

| Comprobación | Resultado |
|---|---|
| `pnpm typecheck` | ✅ limpio |
| `pnpm lint` | ✅ sin warnings ni errores |
| `pnpm test:unit` | ✅ 0 fallos, con las pruebas nuevas de `ai-model-chain`, `ai-tools`, `ai-chat` e `insights-context` |
| `pnpm build` | ✅ exit 0 |
| `supabase test db` | ✅ sin regresiones (el esquema no cambia en esta tanda) |

### Dos bugs que cazó una prueba escrita antes que el código

1. **`RegExp.test` sobre un patrón global es stateful.** `FECHA` llevaba el flag
   `g` para `replace`, y reusar el mismo objeto en `sanitizeProposedMemory`
   habría dejado pasar una memoria con fecha **una de cada dos veces**:
   `lastIndex` avanza al acertar y no se reinicia. Se partió en dos objetos, uno
   con `g` y otro sin él. La prueba que lo destapó llama dos veces seguidas con
   el mismo texto.
2. La lista de ámbitos de `memory_items` estaba escrita **tres veces** (el tipo,
   un arreglo en las acciones, y habría sido una tercera en el saneador). Se
   unificó en `MEMORY_SCOPES`, junto al tipo, que ahora se deriva de ella.

### Lo que NO se verificó

**Sigue sin haber ni una sola llamada real al modelo desde aquí.** No hay
`GEMINI_API_KEY` en este entorno. Todo lo que dice la sección siguiente («Hilo
solo de conversación») sigue vigente, y esta tanda **añade tres cosas nuevas sin
ejercitar**, que son las primeras que hay que mirar con una llave puesta:

1. **`thoughtSignature`.** La serie Gemini 3 devuelve una firma dentro de las
   partes y hay que reenviarla IDÉNTICA o la segunda llamada responde 400
   («Function call is missing a thought_signature»). Los SDK lo hacen solos;
   aquí no hay SDK. La defensa implementada es no reconstruir nunca el turno del
   modelo: se reenvía `candidates[0].content` tal cual. **Esto es lo primero que
   hay que probar vivo**, porque si falla, falla todo el uso de herramientas.
2. **`tools` junto a `responseSchema`.** Está documentado para Gemini 3, pero no
   comprobado aquí. Hay red de seguridad: un 400 con herramientas reintenta el
   mismo modelo sin ellas, así que el peor caso conocido es un chat sin datos
   frescos, no un rail roto. Esa red tampoco está ejercitada.
3. **El salto de modelo.** `debeSaltarDeModelo` tiene pruebas unitarias por cada
   código HTTP, pero el bucle contra la API no se ha corrido. Se provoca a mano
   poniendo un primer modelo inexistente en `GEMINI_MODELS` y comprobando que el
   segundo contesta y que `audit_log.meta.model` registra **el que de verdad
   contestó**.

**El recorrido en un navegador.** Nadie ha pulsado «Recordar esto» ni el
interruptor de acceso total con el ratón.

## Hilo solo de conversación · Gemini único proveedor · Chat transversal (3-sep-2026)

### Lo que se ejecutó

| Comprobación | Resultado |
|---|---|
| `pnpm typecheck` | ✅ limpio |
| `pnpm lint` | ✅ sin warnings ni errores |
| `pnpm test:unit` | ✅ **574 pruebas**, 0 fallos (eran 572: −9 de `execution-project-thread`, +11 de `ai-chat`) |
| `pnpm build` | ✅ compila; 30 rutas |
| `supabase start` (46 migraciones + seed) | ✅ la 0045 aplica sin error; la 0046 llegó después y NO se ha ejercitado |
| `supabase test db` | ✅ **21 archivos, 156 pruebas**, incluido el nuevo `0021_rls_chat_ia.sql` (6 casos) |
| `pnpm gen:types:local` | ✅ `ai_chat_messages` aparece en `database.types.ts` (F3: generado, no escrito a mano) |

### Un volumen de Postgres que hubo que recrear

La base local no arrancaba: `supabase_db_lifeos` había sido inicializado con
PostgreSQL 15 y el CLI levanta ahora un 17.6 — `database files are incompatible
with server`, y el contenedor se quedaba en `unhealthy`. Antes de borrar nada se
comprobó qué había dentro del stack que sí estaba en marcha (uno huérfano de
otro directorio, ocupando los mismos puertos): **cero tablas en `public`, cero
usuarios**. Con eso a la vista se recreó el volumen y se aplicaron las 45
migraciones desde cero. El proyecto remoto no se tocó.

### La app, con una sesión real

Se creó un usuario local, se armó su cookie de `@supabase/ssr` a mano y se pidió
la app por HTTP para mirar el HTML que sale del servidor:

| Petición | Resultado |
|---|---|
| `/login` sin sesión | 200, y **sin rail** — está fuera del grupo `(app)`, como debe |
| `/home` con sesión, sin cookie de plegado | 200 y el rail abierto en el HTML: `class="ai-rail"`, «Asistente», el texto de bienvenida |
| `/home` con `lifeos_chat_collapsed=1` | 200 y `ai-rail-collapsed`: la franja, no el panel |
| `/execution`, `/settings`, `/intelligence`, `/activity`, `/money` | 200 las cinco |
| Copia del botón en `/settings` | «Borrar historial de IA» |

### Un salto de layout que solo se vio mirando el HTML del servidor

El rail no aparecía en la respuesta del servidor: la preferencia de plegado
estaba en `localStorage`, que solo se lee tras hidratar, así que en escritorio
el rail entraba un frame tarde y **movía el ancho del contenido en cada carga**.
Se pasó a cookie, que el layout lee antes de pintar (D-090). No lo habría
detectado ninguna prueba automática de las que hay: el componente era correcto,
lo que estaba mal era cuándo sabía lo que tenía que pintar.

### Un fallo de CSS que el orden de capas habría escondido

El rail se ocultaba en móvil con `hidden xl:flex` de Tailwind. No habría
funcionado: el bloque `.ai-rail { display: flex }` se añade al final de
`globals.css`, **después** de `@tailwind utilities`, así que gana a `.hidden`
por orden de aparición y el rail se habría pintado también en un teléfono. El
corte se movió a media queries dentro del propio bloque (D-090). Se detectó
leyendo, no en pantalla — no habría saltado en `typecheck` ni en `lint`.

### Lo que NO se verificó

- **Ninguna llamada real al modelo desde aquí.** No hay `GEMINI_API_KEY` en este entorno,
  así que `planProject`, `recommend` y `chatReply` no se han ejecutado contra la
  API. Lo que sí está comprobado es que sin llave la app entera sigue en pie:
  las cinco rutas que embeben IA responden 200 y solo el botón correspondiente
  avisa (F11). Queda sin ejercitar **todo el trato con la API**, y en concreto
  tres cosas que se escribieron siguiendo la documentación y no la experiencia:

  1. **La forma del `responseSchema`.** Los tipos van en MAYÚSCULAS (`STRING`,
     `OBJECT`, `ARRAY`) porque el cuerpo se parsea como JSON de protobuf y un
     valor de enum se casa por su nombre exacto; en minúscula sería un 400
     antes de llegar al modelo. Los enums llevan además `format: "enum"`.
  2. **`thinkingConfig.thinkingBudget`.** Es lo que evita el peor fallo posible
     —`MAX_TOKENS` con el texto vacío— al gastar el modelo tokens de
     razonamiento contra el mismo tope que la respuesta. Si la API rechazara el
     campo, la llamada fallaría entera y no a medias, así que se vería al
     primer intento.
  3. **El mapeo de `finishReason` y el mensaje del 429.**

  Es lo primero que hay que mirar con una llave puesta, y en ese orden.

  **Lo que sí se supo al ponerle llave, fuera de este entorno:** la primera
  llamada real devolvió «This model models/gemini-2.5-flash is no longer
  available to new users». Eso confirma dos cosas y **ninguna tercera**: que la
  autenticación por `x-goog-api-key` funciona, y que `httpReason` deja pasar el
  mensaje de la API tal cual —traía dentro el nombre del sucesor—. No confirma
  nada del cuerpo: el modelo va en la URL y se rechaza antes de validar
  `responseSchema`, `thinkingConfig` o los tipos en mayúsculas. Los tres siguen
  sin ejercitarse, y siguen siendo lo primero que hay que mirar.
- **El recorrido en un navegador.** Nadie ha escrito en el hilo ni en el chat
  con el ratón. El plegado del rail, la burbuja de móvil y el botón «Crear» de
  la tarea propuesta están implementados y tipados, pero no usados.
- **`pnpm verify` completo.** Se corrieron sus pasos por separado, como la vez
  anterior y por el mismo motivo: termina en `supabase db reset`.
