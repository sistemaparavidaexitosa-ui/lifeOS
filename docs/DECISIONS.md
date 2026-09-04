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
- **D-025 Metadatos de libros: Open Library manda, Google Books rellena**
  (Fase 4, §5.1). Las dos APIs se consultan en paralelo desde el servidor y se
  fusionan con `fillGaps`, en vez de mostrarle al usuario dos listas de
  resultados para que adivine cuál fila es el mismo libro.
  - **Open Library es el primario** porque no pide credenciales ni tiene cuota
    declarada. Google Books entra solo a rellenar huecos (`totalPages` sobre
    todo) porque **sin API key responde contra una cuota anónima compartida
    que en la práctica está agotada**: verificado el 2026-08-23, devuelve
    `429 Quota exceeded ... per day`. Por eso admite una
    `GOOGLE_BOOKS_API_KEY` **opcional** (F11: perezosa, por feature, su
    ausencia no rompe nada) y por eso no puede ser el primario.
  - **Se guarda la URL de la portada, no el archivo** (`books.cover_url`,
    migración `0026`). Nada de Storage: si el proveedor borra la imagen, la
    vista degrada al placeholder de siempre.
  - **La portada se pinta con `<img>`, no con `next/image`.** El optimizador
    de Vercel cobra por transformación y aquí se trata de una miniatura de
    ~180px que no controlamos; además `next/image` la serviría desde nuestro
    origen, escondiendo que el recurso es de un tercero. El costo es ampliar
    `img-src` en la CSP a `covers.openlibrary.org` y `books.google.com` — los
    dos únicos hosts externos que el navegador carga en toda la app.
  - **El host se valida también al guardar** (`isAllowedCoverUrl`), no solo al
    buscar: la URL viaja en un `<input hidden>` y eso lo edita cualquiera. Una
    URL fuera de la lista se guarda como "sin portada" en vez de tumbar el
    guardado del libro.
- **D-026 El middleware vive en `src/`, y eso no es cosmético.** Con el
  proyecto usando `src/`, Next.js solo reconoce `src/middleware.ts`. El archivo
  estuvo en la raíz desde el primer commit y el framework lo ignoró en
  silencio: sin error, sin warning, con `middleware-manifest.json` vacío. Se
  detectó el 2026-08-23 al notar que **ninguna** respuesta llevaba cabecera
  `Content-Security-Policy`. Durante todo ese tiempo la CSP con nonce (F5) no
  se aplicó y el refresco de sesión de `@supabase/ssr` no corrió — las páginas
  parecían protegidas porque cada `page.tsx` llama `getUser()` por su cuenta, y
  ese era el `307` que uno observaba. Al moverlo se añadieron dos guardas que
  antes no hacían falta porque el código no corría:
  - **`/api/health` queda exento de sesión**: es el smoke check post-deploy
    (DEPLOY.md paso 4) y se consulta desde fuera, sin cookies.
  - **El resto de `/api/*` responde `401` con cuerpo JSON, no un redirect a
    `/login`**: quien llama es `fetch`, y un redirect le entregaría el HTML del
    login con estado 200, que no puede interpretar como error.
- **D-027 Intelligence OS, Fase 1: las decisiones que el spec dejó abiertas.**
  - **Se añade `@anthropic-ai/sdk`, rompiendo D-008 a propósito.** D-008 fijó
    cero dependencias de runtime nuevas y D-022 llegó a usar `fetch` contra
    Resend antes que un SDK. Aquí no aplica el mismo criterio: la salida
    estructurada del modelo (`messages.parse()` + `zodOutputFormat`) es
    justamente lo que garantiza que la respuesta valide contra un esquema, y
    reimplementarla a mano sobre `fetch` sería reescribir la parte del sistema
    de la que depende que el modelo no invente formas. El spec del módulo ya
    lo había elegido explícitamente.
  - **zod sube de `3.24.1` a `3.25.76`, y solo el archivo de la IA importa
    `zod/v4`.** El SDK exige `zod@^3.25`, y su `zodOutputFormat` convierte el
    esquema con el núcleo v4: pasarle un esquema de la zod clásica revienta con
    `Cannot read properties of undefined (reading 'def')` — comprobado. La
    salida es que `src/lib/ai/recommend.ts` importa `zod/v4` y **el resto de la
    app se queda en la zod clásica**, sin migrar 20 Server Actions. El spec
    decía "si no cuadra, subir zod"; cuadra con la subida menor.
  - **`context.ts` no carga datos, solo filtra.** El spec le daba también la
    responsabilidad de cargar. Se separó: la Server Action carga y
    `context.ts` queda puro, con allowlist, recorte y seudonimización. El
    filtro de privacidad sigue viviendo en **un solo archivo auditable**, que
    era el objetivo, y ahora además se puede probar sin base de datos.
  - **La Server Action vive en `src/lib/insights/actions.ts`, no bajo
    `app/`.** El panel se va a embeber en varias rutas (`/money` hoy, `/debt`,
    `/time`, `/habits` después); colgar la acción de una de ellas la volvería
    la dueña arbitraria de las demás.
  - **Sin opt-in por dominio todavía**, porque el spec lo pone en la Fase 2.
    En la Fase 1 el consentimiento es el clic: no sale nada del servidor hasta
    que el usuario pulsa "Analizar", y el panel dice explícitamente qué se
    envía antes de que lo pulse.
- **D-028 Intelligence OS, Fase 2: qué significa exactamente "refrescar en vez
  de duplicar".** El §5.2 del spec pide deduplicar por huella, pero no dice qué
  hacer cuando la que ya existe está silenciada. Las dos ramas no pueden ser la
  misma:
  - una **viva** (`Presented`) con la misma huella se **refresca** con el texto
    y las cifras nuevas;
  - una **silenciada** (`Suppressed`) se **salta entera**. El usuario dijo que
    no quiere verla; volver a insertarla con otro texto sería burlar esa
    decisión por la puerta de atrás.
  - Una **descartada** (`Dismissed`) no bloquea nada: "esta vez no" no es "nunca
    más", y si las cifras cambian el motor debe poder replantearlo. Por eso el
    índice único es **parcial** sobre `Presented`/`Suppressed`.
  - **El opt-in y el allowlist son cosas distintas y se aplican los dos.** El
    allowlist dice qué PUEDE ver un ámbito; `profiles.ai_domains` dice qué
    QUIERE el usuario que salga. Solo viaja la intersección, y lo que se quedó
    fuera se nombra —en la UI y en el propio prompt— en vez de fingir cobertura
    completa.
  - **La huella la calcula la app, no la base.** Es `type` + los factId citados,
    ordenados y hasheados; vive en una función pura para poder probarla sin
    Postgres. El índice único es la red de seguridad, no el mecanismo.
  - La migración es la `0027`, no la `0023` que pedía el spec: tercera
    renumeración del plan original. Lo que importa es el orden de aplicación.

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

- **D-029 Los días de la semana de una ocupación usan `0=domingo`, no ISO-8601.**
  Al sincronizar el esquema el 2026-08-25 apareció que `occupations.days` **ya
  existía en producción** sin ninguna migración que la creara: se hizo a mano
  desde el dashboard, con su `CHECK`, y con una ocupación que tenía `{0,1,3}`
  capturado de verdad. `supabase db reset` en local nunca la reproducía, así
  que las dos bases venían divergiendo en silencio.

  `0028_occupation_days.sql` la **adopta tal cual** —mismo nombre, tipo,
  default y convención— en vez de imponer el `weekdays smallint[]` con ISO
  (1=lunes … 7=domingo) que el plan traía. Tres razones, en orden de peso:
  1. **Riesgo:** sin rename, sin cambio de tipo, sin conversión del dato ya
     capturado. La migración es casi un no-op en producción.
  2. **La convención JS ya es la nativa del código.** `Date.getUTCDay()`
     devuelve 0–6, así que `occupationAppliesOn` no traduce nada. Con ISO
     habría una conversión en cada lectura, y ahí es donde nacen los bugs de
     "se corrió un día".
  3. Imponer el diseño propio sobre algo que ya funciona en producción cuesta
     más de lo que rinde.

  **Contrapartida aceptada:** `days` es un nombre más vago que `weekdays`
  —¿días del mes?—, y se compensa con el comentario de la columna y con que
  `routines.days` usará la misma convención, para que no haya dos formas de
  decir "qué día" en el proyecto.

  **Además:** el `CHECK` lleva `coalesce(array_length(days,1), 0)` y el
  `coalesce` no es adorno. `array_length('{}', 1)` devuelve `NULL`, no `0`, y
  un `CHECK` que evalúa a `NULL` **pasa** — sin él, el arreglo vacío se colaba
  y la restricción no restringía. Lo destapó el test 4 de
  `supabase/tests/0009_occupation_days.sql`.

- **D-030 Las Server Actions de biblioteca y tiempo devuelven `{ ok, reason }`
  en vez de lanzar.** En el build de producción, Next redacta el mensaje de una
  excepción lanzada desde una Server Action y entrega *"An error occurred in
  the Server Components render. The specific message is omitted…"*. Guardar un
  libro fallaba así por `books.cover_url` ausente en producción, y desde la
  pantalla era indistinguible de un fallo de red.

  Se adopta el contrato de `sendEmail()` (D-021), que el spec del Personal
  Development OS ya pedía en §5.5. `src/lib/supabase/errors.ts` traduce el
  error de PostgREST a algo accionable: para una columna faltante nombra la
  columna y dice si toca `supabase db push` o recargar el caché del esquema.
  `zod` pasa de `parse` a `safeParse` por lo mismo: un campo vacío producía una
  excepción cruda en vez de un mensaje.

### Los workspaces se vuelven el contenedor de los proyectos (agosto 2026)

- **D-031 Todo proyecto vive en un espacio de trabajo; `projects.workspace_id`
  es NOT NULL** (migración `0030_workspaces_obligatorios.sql`). Antes había dos
  clases de proyecto con reglas distintas: el personal (`workspace_id is null`,
  invisible para cualquier colaborador) y el de workspace. Eso obligaba a que
  «compartir» fuera una operación especial —la pantalla `/workspaces` movía el
  proyecto Y creaba una fila en `project_shares`— y dejaba a los espacios como
  un módulo aparte del menú lateral, al que había que ir y volver para algo que
  se decide mirando los proyectos. Es el modelo de Notion y monday.com: el
  espacio contiene, no etiqueta.

  Para no perder la frontera de privacidad que dependía de aquel `null`, se
  añade `workspaces.is_personal`: cada usuario tiene exactamente uno (índice
  único parcial), se lo crea el trigger de alta, y no admite invitaciones ni
  miembros ajenos ni borrado — las tres cosas rechazadas por triggers, no solo
  por la interfaz. **«Proyecto personal» pasa a significar «proyecto en un
  espacio personal»**, y con eso BR-012 sobrevive intacta: un resultado clave
  sigue sin poder medirse contra el trabajo de un equipo.

- **D-032 Membresía = acceso; `project_shares` cambia de trabajo**
  (migración `0031_rls_acceso_por_workspace.sql`). Ser miembro activo del
  espacio ya da acceso a sus proyectos:

  | Rol | Ve | Edita |
  |---|---|---|
  | Owner / Admin | todo el espacio | sí |
  | Member | todo el espacio | sí |
  | Viewer | todo el espacio | nunca |
  | Guest | solo lo de `project_shares` | solo con share `edit` |

  `project_shares` no se elimina: pasa a ser la llave del **Guest**, el
  colaborador externo acotado a ciertos proyectos. Dos correcciones que salieron
  de aquí: `projects_insert_own` solo comprobaba `owner_id`, y con el espacio
  obligatorio eso permitía plantar un proyecto en un workspace ajeno mandando su
  id; y el `WITH CHECK` de `projects_update_edit` solo aceptaba dueño u
  Owner/Admin, así que **un Member pasaba el `USING` y moría en el `CHECK`**:
  nunca pudo editar de verdad, aunque la política decía que sí.

  Las tablas hijas (`tasks`, `task_groups`, `milestones`, `comments`,
  `task_files`) no se tocaron: heredan el criterio nuevo porque se apoyan en
  `has_project_access`/`can_edit_project`, que es exactamente para lo que esos
  helpers existen. Los cuatro llevan ahora `set row_security = off`, el patrón
  que 0029 dejó establecido — eso cierra de paso el riesgo residual que 0012
  documentó sin resolver (`memberships_*_admin` llamando a `workspace_role()`,
  que vuelve a consultar `memberships` desde una política DE `memberships`).

- **D-033 Un espacio con proyectos dentro no se borra.** `deleteWorkspace` hacía
  `update projects set workspace_id = null` y eliminaba el espacio: los
  proyectos de TODOS sus miembros quedaban en un limbo que la interfaz llamaba
  «personal». Con la columna NOT NULL esa salida ya no existe, y las dos
  alternativas eran bloquear o borrar en cascada. Se bloquea, con un mensaje que
  dice cuántos proyectos estorban — es la opción que no puede destruir trabajo
  ajeno con un clic. La regla vive en el trigger `guard_workspace_delete`, no
  solo en la Server Action.

  La FK de `projects.workspace_id` quedó en `on delete cascade` y no en
  `restrict`, que sería lo intuitivo: al borrar una CUENTA, `workspaces` y
  `projects` caen los dos por cascada desde `auth.users` y el orden entre esas
  dos cascadas no está garantizado — con `restrict`, borrar una cuenta podía
  fallar. El trigger se salta a sí mismo cuando el dueño ya no existe, que es
  como distingue «borrado de cuenta» de «borrado de espacio».

- **D-034 «Equipos y Colaboración» sale del menú lateral.** La ruta
  `/workspaces` sobrevive únicamente como redirección a `/execution`: los
  correos de invitación ya enviados apuntan ahí y no pueden terminar en un 404.
  El espacio activo viaja en `?ws=` —igual que `?project=` y `?view=`— para que
  el enlace sea compartible y el Server Component pueda filtrar la cartera en la
  consulta en vez de traerlo todo y esconder lo que no toca.

### Notebooks: el sitio donde el equipo escribe (agosto 2026)

- **D-035 Los cuadernos cuelgan del ESPACIO, no del proyecto** (migración
  `0032_notebooks.sql`). Ya existían dos sitios para escribir —`knowledge_items`
  y `logbook`, desde 0003— y los dos fallan en lo mismo: cuelgan de un proyecto
  y su RLS es `user_id = auth.uid()`, así que son notas de una sola persona,
  invisibles hasta para su propio equipo. No había ningún lugar compartido donde
  redactar. Los notebooks lo son, y por eso su contenedor es el workspace: un
  acta de dirección o una nota de investigación no pertenece a un proyecto.

  Jerarquía de dos niveles (Notebook → Nota, como Notion) y no de tres (con las
  secciones de OneNote): cada nivel extra es otra pantalla que atravesar con el
  pulgar, y esta función se va a usar sobre todo desde un iPhone.

- **D-036 La nota es una página colaborativa, con `version` de verdad.**
  Cualquiera con permiso de escritura edita la misma nota, y quedan las dos
  marcas de autoría: quién la creó y quién la editó por última vez. Eso obliga a
  resolver los choques, porque dos personas pueden estar escribiendo a la vez:
  `saveNote` hace `update ... where id = $1 and version = $2`, y cero filas
  significa que alguien se adelantó — entonces se relee para poder decir QUIÉN
  fue, el editor se bloquea y **no se pisa su texto**. Es el patrón `version`
  que ya llevaban `projects` y `tasks`, aplicado por primera vez a un texto
  largo, que es donde de verdad duele perder trabajo.

  `created_by` es nullable con `ON DELETE SET NULL`, a diferencia de
  `comments.author_id` (NOT NULL + CASCADE). Es deliberado: dar de baja a
  alguien no puede borrar las actas que escribió. El nombre va denormalizado al
  lado para que la marca sobreviva a la cuenta, igual que `memberships.user_name`.

- **D-037 El Guest no ve los cuadernos.** Su llave de acceso es
  `project_shares`, que es POR PROYECTO; los notebooks no tienen equivalente, y
  dejarlo entrar le abriría de golpe todo lo que el espacio escribe — justo lo
  contrario de lo que ese rol significa. Un `notebook_shares` para invitados es
  trabajo aparte. Owner/Admin/Member escriben, Viewer lee, y eso lo fija
  `supabase/tests/0012_rls_notebooks.sql` rol por rol.

- **D-038 Formato propio en vez de una librería de Markdown, y sin `innerHTML`.**
  D-008 fija cero dependencias de runtime nuevas y aquí no hay motivo para
  romperlo: un cuaderno necesita títulos, listas, negrita y enlaces, no tablas ni
  notas al pie. `src/lib/domain/notes/markup.ts` es una función pura, probada
  entera, que devuelve un ÁRBOL — no una cadena de HTML. Esa es la parte que
  importa: el cuerpo lo escribe un colaborador, y si esto produjera HTML alguien
  tendría que pintarlo con `dangerouslySetInnerHTML` y una nota se convertiría en
  un vector de XSS contra todo su equipo. `NoteBody.tsx` recorre el árbol creando
  elementos de React, y el esquema `https?://` está en el propio patrón, así que
  un `href` con `javascript:` no llega ni a construirse.

- **D-039 La búsqueda vive en la base, en español, y NO es `SECURITY DEFINER`.**
  Columna generada `to_tsvector('spanish', title || body)` con índice GIN: busca
  lematizando y sin acentos, así que «direccion» encuentra «dirección». Filtrar
  en el cliente habría exigido descargar el cuerpo entero de cada nota del
  espacio en cada pulsación. Y `search_notes()` corre con los privilegios de
  quien llama a propósito: la RLS se aplica DENTRO de la función, de modo que la
  búsqueda no puede devolver una nota ajena. Una fuga por búsqueda no la nota
  nadie, porque no aparece en ninguna pantalla — por eso tiene su propio test.

- **D-040 El editor de notas es una PANTALLA, y guarda solo.** Las dos son
  decisiones de iPhone. El drawer lateral del tablero ocupa el 92dvh y con el
  teclado abierto deja poco más de 200px para escribir, así que el editor tiene
  URL propia (`?note=`) y el gesto de volver del sistema funciona. Y no hay botón
  de guardar: guarda al parar de escribir, al perder el foco y —lo que de verdad
  salva trabajo— en `visibilitychange`, porque en iOS bloquear el teléfono o
  cambiar de app puede congelar la pestaña y es justo el momento en que se pierde
  lo último escrito. Por lo mismo, las acciones van arriba: una barra fija abajo
  pelea con el teclado y con la barra de gestos.


### Rendimiento percibido en móvil (agosto 2026)

- **D-041 `loading.tsx` por sección.** No había ninguno en toda la app, y todas
  las rutas son dinámicas (`ƒ` en el build, ni una `○`): cada navegación espera
  al servidor con la pantalla anterior intacta y sin ninguna señal. En un
  escritorio eso se lee como "va lento"; con el pulgar se lee como "no registró
  el toque", y la gente vuelve a tocar. Hay uno genérico en `(app)/` y dos con
  la forma de su destino (`execution/`, `notebooks/`), porque un esqueleto que
  imita la lista evita el salto que produce reemplazar un spinner centrado por
  un contenido que estaba en otro sitio.

- **D-042 Una hipótesis de rendimiento que resultó FALSA, y por qué se deja
  escrita.** Se contaron cinco llamadas a `supabase.auth.getUser()` en el camino
  de `/execution` (middleware, layout, página, `getUserTimeZone`,
  `listWorkspaces`) y, sabiendo que `getUser()` hace un `GET /auth/v1/user` de
  verdad (ver `_getUser` en @supabase/auth-js), se dio por hecho que eran cinco
  viajes de red por carga.

  **Medido contra el servidor de producción local, contando las peticiones en el
  log del contenedor de auth: eran 2, antes y después.** Next.js memoiza los
  `fetch` GET idénticos dentro de un mismo render, así que las cuatro del render
  ya colapsaban en una; la otra es la del middleware, que corre en otra
  invocación y no puede compartirla.

  Se conserva `getSessionUser()` (`src/lib/data/session.ts`) igualmente, pero por
  un motivo distinto del que lo motivó: deja la deduplicación EXPLÍCITA con
  `cache()` de React en vez de depender de un detalle del framework —el
  comportamiento de caché de `fetch` ya cambió una vez entre Next 14 y 15— y
  quita la repetición de cinco sitios. Lo que NO hace es ahorrar red.

- **D-043 Paralelizar y `Suspense`: correctos, pero no demostrables en local.**
  `/execution` encadenaba cuatro lecturas independientes (`getUserTimeZone`,
  `listWorkspaces`, proyectos, tareas) y ahora van en un `Promise.all`; y
  `TeamSection` está por fin dentro de un `<Suspense>` —el comentario que decía
  que se separaba "para hacer streaming" era falso mientras no lo estuvo, y sus
  dos consultas bloqueaban el render de la cartera entera.

  Ninguna de las dos cosas se puede medir en local: con Supabase en `127.0.0.1`
  un viaje de ida y vuelta cuesta menos de 1 ms, así que la mejora se pierde en
  el ruido (las medianas se movieron ±0.07 s en ambas direcciones entre
  corridas). Lo que estas dos quitan son viajes EN SERIE, y su efecto aparece
  cuando cada viaje cuesta decenas de milisegundos — que es el caso real:
  `vercel.json` fija la región `iad1` y el teléfono está en México.

  El único recorte contable en local es que la ruta del editor de notas dejó de
  lanzar la consulta de conteo que solo usa la estantería: 8 consultas -> 7.

### Personal Development OS: plantillas y lectura medida (agosto 2026)

- **D-044 (DEROGADA por D-080, sept-2026) El catálogo de plantillas vive en
  código, no en la base.** Se conserva escrita porque su razonamiento sigue
  siendo válido y explica qué se perdió al cambiar de opinión.

  `src/lib/domain/development/templates.ts` es contenido, no datos del usuario:
  no tiene dueño, no lleva RLS y no cambia por persona. En código va versionado
  en git, se prueba sin levantar Postgres y no puede divergir entre entornos,
  que es justo lo que le pasa a un catálogo sembrado que alguien edita en
  producción. Al usar una plantilla se **copia** a las tablas del usuario: a
  partir de ahí es suya, y cambiar el catálogo en un despliegue futuro no le
  reescribe los pasos a nadie.

  De los libros se usa su **estructura** —un hecho comprobable, como que
  S.A.V.E.R.S. son seis prácticas o que la fórmula de Sharma parte la hora en
  tres bloques de veinte minutos— y las descripciones están escritas aquí. No se
  reproduce texto de ninguna de las obras.

- **D-045 La Mañana Milagrosa lleva DOS plantillas, y la corta no es relleno.**
  Además de la de sesenta minutos hay una de seis, un minuto por práctica. Sin
  ella, la de sesenta se abandona el primer día que uno se levanta tarde — y
  abandonarla un día es como se abandona del todo. La versión mínima es la que
  sostiene la racha, que es exactamente el mismo argumento que la regla de los
  dos minutos en los hábitos.

- **D-046 Los hábitos guardan la FORMA del libro, no solo el nombre**
  (migración `0033_habitos_atomicos.sql`): `cue` (la intención de
  implementación), `stack_after_habit_id` (el apilamiento) y `two_min_version`.
  Son las tres reglas de «Hábitos atómicos» que caben en el esquema y que
  cambian la conducta; el «a qué hora» no se añade porque ya es
  `occupation_id` desde 0004, y duplicarlo daría dos sitios donde decir lo
  mismo y ninguna forma de saber cuál manda.

  Dos consecuencias que no son obvias: **la plantilla prellena el formulario, no
  crea el hábito en silencio** —la señal es personal («después de *mi* café») y
  guardarla sin editar deja una frase que no dispara nada—, y los tres campos se
  **pintan en la fila del hábito**, no solo en el formulario. Guardar tres
  columnas que solo se ven al editar habría sido sumar esquema para nada.

  El trigger `guard_habit_stack_owner` impide apilar sobre el hábito de otra
  cuenta: las claves foráneas no evalúan RLS, así que sin él la referencia
  cruzada sería posible mandando el id a mano.

- **D-047 La biblioteca guarda historial, y la estimación dice sobre qué base
  estima** (migración `0034`). `books.current_page` se sobrescribía: la app
  sabía en qué página vas y no a qué velocidad avanzas. `book_progress` guarda
  un punto por día local —`unique (book_id, local_date)`, el patrón de
  `habit_logs` y `routine_runs`— y de ahí salen el ritmo, la fecha estimada y el
  aviso de libro estancado.

  `estimatedFinish` devuelve siempre un `basis`: `historial`, `desde el inicio`
  o `sin datos`. No es decoración. Una fecha calculada sobre un punto no vale lo
  mismo que una calculada sobre dos semanas, y con `sin datos` **no se muestra
  ninguna fecha**: una fecha inventada se lee igual que una calculada, y esa es
  la manera de perderle la confianza a la pantalla entera.

- **D-048 La categoría del libro es una lista propia en español, propuesta por
  la API pero confirmada por el usuario.** Las dos APIs ya devolvían el tema y
  se estaba descartando —Google en `categories`, que viajaba por el cable sin
  usarse, y Open Library en `subject`, que además hay que pedir en `&fields=`—.
  Guardarlo crudo daría una estantería en inglés, con decenas de grupos casi
  idénticos y libros repetidos en cinco sitios, así que se mapea a ocho valores
  con `check`, mismo criterio que `habits.category`.

  El mapeo busca por **inicio de palabra** y no por subcadena, y eso lo destapó
  una prueba: «Juvenile Nonfiction» contiene «fiction» y se clasificaba como
  Ficción. Por lo mismo Ficción se evalúa antes que Técnico, para que «Science
  Fiction» sea una novela y no un libro de ciencia.

- **D-049 Intelligence OS deja de ser una sección del menú, pero conserva sus
  dos pantallas.** El menú anunciaba un cerebro central que todavía no existe:
  el motor está construido para cinco ámbitos —`allowedDomains()` contempla
  money, debt, habits, time y execution— y `analyze()` rechaza todo salvo
  Dinero. Una sección propia, con su color y sus dos entradas, prometía una
  cobertura que ninguna de las dos pantallas puede dar.

  Donde de verdad se leen las recomendaciones es en el panel embebido al final
  de /money, junto a las cifras que las produjeron. Ese es el sitio: un
  hallazgo sobre el presupuesto se entiende mirando el presupuesto, no en una
  bandeja aparte a la que hay que ir a propósito.

  Las pantallas NO se convierten en redirecciones, y esta es la parte que
  importa: lo que el usuario silencia vuelve como contexto de rechazo del
  siguiente análisis (D-027). Un rechazo que no se puede revisar ni deshacer es
  una decisión irreversible tomada con un clic, y el motor iría arrastrando
  para siempre un "no me sugieras esto" del que ya nadie se acuerda. Así que la
  bandeja histórica sobrevive, y con ella la memoria.

  Se usa el flag `hidden` de `nav-items.ts`, no el borrado de las entradas: de
  esa lista sale el título de la barra superior, y sin entrada ambas pantallas
  se titularían "Life OS". Es el mismo mecanismo que ya usa /notebooks, y
  distinto del de /workspaces y /habits, que sí son redirecciones porque su
  contenido se mudó a otra pantalla. Aquí no se mudó nada.

  Acceso desde Configuración además del panel: la bandeja ya se alcanzaba desde
  /money, pero la memoria solo se alcanzaba a través de la bandeja, y una
  pantalla que depende de pasar por Dinero es una pantalla perdida.

- **D-050 El motor pasa de un dominio a cuatro, y se queda a las puertas del
  quinto a propósito.** `allowedDomains()` contemplaba cinco ámbitos desde el
  primer día y `analyze()` rechazaba todo lo que no fuera Dinero: la
  infraestructura cara —privacidad, seudonimización, anclaje, memoria,
  historial de rechazos— ya estaba construida y probada, y lo único que faltaba
  eran los extractores. Ahora hay cuatro: `money`, `time`, `execution` y
  `habits`.

  `debt` sigue sin extractor, y `global` está deshabilitado POR ESO. Global
  incluye los cinco dominios, así que hoy daría un análisis que se presenta como
  la foto completa habiendo mirado cuatro quintas partes. El motor puede decir
  "no tengo datos de X" cuando el usuario lo apagó —esa es una decisión suya, y
  `skippedDomains` ya la comunica— pero no puede callar que un dominio entero no
  existe todavía.

  QUÉ CUENTA COMO HECHO, Y QUÉ NO

  La regla de los tres extractores nuevos es la misma que ya seguía money: pocos
  hechos buenos. Lo vencido va en UN hecho con el recuento y la más antigua, no
  en quince; los hábitos sin ancla van en uno agregado y solo si son mayoría.
  Quince hechos del mismo tipo llenan el tope de contexto (MAX_FACTS = 40) y
  expulsan a los otros dominios, que es justo lo contrario de para qué se
  amplió el motor.

  Los umbrales están escogidos contra el falso positivo, no contra el falso
  negativo, porque un motor así se muere de decir obviedades: un proyecto que
  nunca completó nada no está estancado (no ha empezado); una rutina que nunca
  se ejecutó no está abandonada; un hábito creado el jueves no lleva 2 de 30; y
  una racha se mira desde AYER, no desde hoy, porque avisar a las nueve de la
  mañana de que rompiste algo que todavía puedes cumplir es la forma más rápida
  de que el usuario deje de creerle.

  Ningún extractor reimplementa un cálculo que ya exista: `saturationStatus` y
  `availableSlots` vienen de domain/time.ts, `isOverdue` de task-state.ts,
  `habitStreak` de habits.ts. Si el motor tuviera su propia aritmética, diría
  "llevas 12 días" mientras la pantalla dice 11, y el usuario creería a la
  pantalla — con razón.

  EL CORTE ES ANTES DE LEER, NO DESPUÉS

  `analyze()` comprueba el opt-in ANTES de cargar los datos del dominio.
  `buildContext` volvería a filtrar de todas formas, pero para entonces las
  cifras ya se habrían leído. Con un opt-in, no preguntar es parte de la
  promesa.

  UNA SOLA DEFINICIÓN DE "MI TAREA"

  Los hechos de tiempo y ejecución usan `loadMyTasks` (data/tasks.ts), el mismo
  cargador que Home. No es comodidad: con un criterio propio, el motor acabaría
  diciéndome que voy saturado por el trabajo de un compañero. Por lo mismo, los
  hechos de proyecto solo miran proyectos donde tengo tareas — avisar de que el
  proyecto de otro lleva tres semanas parado no es una recomendación, es un
  chisme.

  DÓNDE SE PIDE CADA ANÁLISIS

  El panel se embebe en la pantalla del ámbito —/money, /time, /execution y
  /development— y no en una bandeja central, que es la misma razón por la que
  Intelligence OS salió del menú (D-049): un hallazgo sobre tu agenda se
  entiende mirando tu agenda.

  El de ejecución va en la CARTERA y no dentro del tablero de un proyecto,
  porque lo que mira es transversal: lo vencido de todo, los proyectos
  estancados, lo que ya se puede empezar. Y va tras un límite de `Suspense` por
  el mismo motivo que TeamSection: su consulta no puede retrasar la lista de
  proyectos.

  La carga de las recomendaciones vivas es un Server Component
  (`InsightSection`) y no un bloque copiado en cada página. Con cuatro copias,
  cambiar una columna de `recommendations` sería cuatro sitios donde arreglarlo
  y tres donde olvidarlo. De paso deja de bloquear: en /money la consulta era
  secuencial y retrasaba el resto del dashboard.

- **D-051 Un ahorro también puede sostener una meta personal, y la cadena de
  ternarios se vuelve exhaustiva.** `key_results` conocía cuatro fuentes desde
  0024 —hábito, proyecto, libro y meta financiera— y dejaba Ahorros fuera sin
  ninguna razón de diseño: `savings_goals` es hermana de `financial_goals`
  (mismo `current_amount`, mismo `target`), y una meta del tipo "juntar el fondo
  de emergencia" no se podía medir contra el ahorro que existe exactamente para
  eso. Había que elegir entre una fuente equivocada o capturar el progreso a
  mano, que es lo que este módulo existe para evitar.

  Al añadir la quinta fuente se cambió también CÓMO se elige la tabla. Era una
  cadena de ternarios con un `else` al final, y ese `else` es una trampa: una
  fuente nueva sin su rama no daba error, caía en `financialGoalAmount` y el
  resultado clave mostraba el número de otra cosa. Ahora es un `Record`
  exhaustivo sobre `Exclude<KeyResultSourceKind, "manual">`, así que olvidar una
  rama no compila. Hay una prueba que lo fija: un ahorro y una meta financiera
  con el mismo id devuelven números distintos.

  El `check` de la base se prueba en pgTAP y no solo en el dominio, porque es
  ahí donde está la garantía: si alguien amplía el enum de TypeScript y olvida
  la migración, el dominio compila y el `insert` revienta en producción.

- **D-052 Se borra `milestones`; `folders` y `automations` se quedan, y conviene
  decir por qué.** `milestones` la creó 0003 con sus políticas y sus grants, y
  desde entonces ninguna línea de `src/` la nombra. Lo único que quedaba de ella
  eran treinta y dos líneas en `database.types.ts` — la peor clase de tabla, la
  que se lee en el esquema, se supone en uso y no lo está. Los hitos acabaron
  siendo tareas con `impact` y `due` dentro del tablero, donde el usuario ya
  trabaja; una tabla aparte obligaba a mantener dos listas del mismo proyecto
  sincronizadas a mano. Se fue sin nada que perder: cero filas y cero claves
  foráneas apuntándole.

  Las otras dos NO son lo mismo, y la distinción importa porque "limpiar
  esquema muerto" es justo la clase de tarea que se hace sin mirar:

  - `folders` (0019) tiene cuatro políticas RLS, dos índices, la columna
    `projects.folder_id` apuntándole y cuatro aserciones pgTAP que pasan. Es una
    agrupación de tableros construida y probada a la espera de interfaz —
    estructuralmente, la misma situación en la que estaban los extractores del
    motor antes de D-050, y a aquellos se les terminó el trabajo en vez de
    borrarlos.
  - `automations` / `automation_runs` (0008) son la mitad no construida de
    Intelligence OS: el paso de recomendar a proponer una acción con
    confirmación explícita. Mientras esa decisión de producto siga abierta, se
    quedan.

- **D-053 El quinto extractor cierra el motor, y `global` deja de estar
  bloqueado.** Deudas era el dominio que faltaba, y con él se levanta la
  restricción de D-050: `global` ya no calla ningún dominio, así que puede
  ofrecerse. Su panel vive en Home, que es la única pantalla que no pertenece a
  ningún módulo — donde una recomendación puede decir lo que ninguna otra
  puede, porque es la única que ve la agenda y la tarjeta a la vez.

  EL HECHO QUE JUSTIFICA EL MÓDULO ENTERO

  Que el pago mínimo no cubra ni los intereses. No es que la deuda tarde: es
  que CRECE. Nadie lo ve mirando /debt, porque ahí el interés mensual y el pago
  mínimo son dos números en dos recuadros distintos y la resta hay que hacerla
  de cabeza. Pesa 1 siempre, sin escala.

  Se separa del hecho de horizonte a propósito: `simulateSingleDebt` tiene un
  tope de 600 meses, así que este caso saldría por ahí como "tarda 600 meses",
  que es una manera pésima de decir "nunca" — suena a mucho tiempo, no a
  imposible.

  LO QUE EL EXTRACTOR NO HACE, Y POR QUÉ

  No compara métodos de pago (avalancha, bola de nieve, cash flow). El orden
  entre deudas solo cambia algo cuando hay dinero EXTRA que repartir —con solo
  los mínimos, `runSimulation` da el mismo resultado con cualquier orden— y
  cuánto extra puede poner el usuario no está en ninguna tabla. Inventar una
  cifra para que la comparación tuviera gracia es exactamente lo que el motor
  tiene prohibido. Esa comparación ya vive en el simulador de /debt, donde el
  usuario pone su propio número.

  EL SILENCIO DE UNA DEUDA SE MIRA SOLO SI ANTES HUBO RUIDO

  "No registra pagos desde hace X" solo se reporta si esa deuda tuvo algún pago
  ligado alguna vez. Quien paga por fuera y no lo anota no tiene un problema de
  deuda, tiene otra manera de llevar sus cuentas, y avisarle cada vez es la
  forma de que deje de leer las recomendaciones. Mismo criterio que el proyecto
  que nunca completó nada y la rutina que nunca se ejecutó: sin un antes, no hay
  nada que haya cambiado. Y el hecho dice las dos lecturas —no se pagó, o no se
  anotó— porque desde aquí no se pueden distinguir.

- **D-054 Una mención se resuelve contra el ROSTER, no contra un regex.** El
  parseo vivía suelto en la Server Action: `body.match(/@([\wÀ-ÿ]+)/g)`. Corta
  en el primer espacio, así que a «@Luis Varsa» le guardaba «Luis» — un nombre
  que no es de nadie. Mientras nadie recibiera un aviso eso no rompía nada
  visible; en cuanto hay bandeja, entrega el aviso a quien se llame parecido.

  La solución no es un regex mejor: es dejar de adivinar. La interfaz ofrece el
  roster del espacio (`list_workspace_members`, que ya alimentaba el selector de
  responsables), el usuario elige de una lista, y `domain/execution/mentions.ts`
  casa el texto contra nombres CONOCIDOS. Un nombre que no está en el roster no
  produce mención.

  Se prueban de más largo a más corto, por la misma razón que `pseudonymize`
  ordena así sus alias en el motor: con «Ana» y «Ana María» en el mismo espacio,
  empezar por el corto casaría «@Ana María» como «Ana». Y el `@` tiene que ABRIR
  palabra — eso lo destapó una prueba, porque `mentionQueryAt` lo comprobaba y
  `parseMentions` no: en «luis@Ana.com» ese arroba es un correo. Es la clase de
  divergencia que aparece siempre que la misma regla se escribe dos veces.

  `mentions` (nombres) se conserva junto a `mentioned_user_ids`. Del texto
  «Luis» no sale un uuid, así que el histórico ya escrito no se puede
  reconstruir: perderlo sería peor que convivir con dos columnas.

- **D-055 Lo leído es de quien lee, y por eso NO se usa `comments.read`.** Esa
  columna existe desde 0003 y nunca se ha escrito. No es un olvido: es UN
  booleano en la fila del comentario, así que el primero que lo marcara lo
  marcaría para todos — en un comentario que menciona a tres personas, eso es
  sencillamente falso.

  Y hay una segunda razón, de seguridad: escribirla exigiría una política UPDATE
  sobre `comments`, y una política UPDATE que permita marcar leído permite
  también reescribir el `body`. El aviso de una mención no puede costar el
  derecho a editar el comentario de otro. Lo leído vive en `comment_reads`, con
  clave primaria compuesta (marcar dos veces es idempotente desde el servidor) y
  RLS por `auth.uid()`. `comments.read` se queda sin uso; quitarla es una
  decisión aparte.

- **D-056 Los comentarios y el historial son UN hilo.** Se pintaban en dos
  tarjetas apiladas —toda la conversación, y debajo toda la cronología— con dos
  relojes que además iban en sentidos opuestos: los comentarios ascendentes y el
  historial descendente. Para saber si un comentario se escribió antes o después
  de que la tarea se bloqueara había que cruzar dos listas a ojo.

  Un cambio de estado es lo que en un chat serían los mensajitos grises de
  sistema: no es ruido, es lo que explica por qué el comentario siguiente dice
  lo que dice. `mergeThread` (domain/execution/thread.ts) los ordena en una sola
  corriente ascendente, y desempata por id — al completar una tarea desde el
  propio hilo, el comentario y la transición se escriben en la misma operación y
  pueden compartir marca al milisegundo; sin segundo criterio, el orden entre
  ambos cambiaría entre recargas de la misma pantalla.

- **D-057 El feed del espacio deja de ser una tabla de solo escritura.**
  `workspace_activity` existe desde 0003: cuatro Server Actions insertaban en
  ella y ninguna pantalla la leía. Todo lo registrado desde entonces estaba ahí,
  invisible.

  Vive en `/activity`, como PESTAÑA del espacio junto a Proyectos y Notebooks, no
  como entrada del menú lateral: es lo que ha pasado DENTRO de este espacio, no
  un módulo aparte. Mismo criterio que llevó a los cuadernos a esa barra.

  El corte por día se hace sobre la fecha LOCAL y no sobre el prefijo del ISO:
  un comentario de las 19:00 en Ciudad de México se guarda como la 01:00 UTC del
  día siguiente y aparecería bajo «mañana». Es el mismo error que la migración
  0016 arregló en las ocupaciones. Y un `type` desconocido se muestra tal cual:
  la columna es texto libre en el esquema, así que esconderlo tras un «Otro»
  borraría la única pista de qué pasó.

- **D-058 El ✅ completa la tarea, y no puede saltarse ninguna regla.** Reaccionar
  con ✅ intenta una transición a Completed de verdad, y pasa por
  `evaluateTransition` como cualquier otro camino: el selector de estado, el
  Kanban y el arrastre del tablero. No hay validación nueva — la máquina de
  estados que ya existía protege también esto. Comprobado contra la app real:
  con una dependencia abierta devuelve «Faltan dependencias» y la tarea se
  queda como estaba; cerrada la dependencia, la completa y deja fila en
  `task_history`.

  Cuando la transición se rechaza, la reacción SE QUEDA PUESTA. El usuario
  expresó algo —«esto ya está»— que sigue siendo cierto; lo que falla es
  cerrarla. Deshacer las dos cosas escondería el motivo real y parecería que el
  clic no llegó.

  Y quitar el ✅ no reabre la tarea. Reabrir es una decisión con consecuencias,
  no la retirada de un gesto: para eso está el selector de estado, con su
  nombre.

- **D-059 Una reacción es (comentario, persona, emoji), y esa es toda la regla.**
  `comment_reactions` no tiene `id` propio: la clave primaria compuesta ES la
  unicidad. Con un id suelto habría que comprobar antes de insertar, y dos clics
  rápidos crearían dos filas — el contador diría 2 con una sola persona detrás.
  Por lo mismo, la acción borra SIEMPRE antes de insertar: así es idempotente
  sin depender de que el cliente sepa el estado actual, que con dos pestañas
  abiertas no tiene por qué.

  El orden de los botones es el de la paleta, no el de llegada. Si dependiera de
  quién reaccionó primero, los botones bailarían de sitio entre recargas y
  pulsar el de al lado sería cuestión de suerte.

- **D-060 Fijar copia el texto, no lo referencia.** La bitácora es el registro
  de lo que se decidió, y tiene que seguir diciéndolo aunque el comentario se
  borre después. Se le añade de dónde salió —autor y tarea— porque sin el
  contexto media bitácora acaba siendo frases sueltas que nadie sabe a qué
  respondían.

- **D-061 Un recordatorio es una FECHA que Home mira, no una alarma.** No hay
  ningún proceso que despierte a nadie, así que `reminders.remind_on` es `date`
  y no `timestamptz`: prometer una hora exacta sería prometer algo que no
  existe. El día se decide en la zona del perfil (D-016/D-018) — con UTC, un
  «mañana» pedido esta tarde en México caería pasado mañana.

  Los VENCIDOS siguen apareciendo, no solo los de hoy. Un recordatorio que se
  quedó atrás porque no abriste la app el martes no puede desaparecer en
  silencio: es exactamente lo que un recordatorio promete no hacer.

  Tres plazos y no siete: la gracia de un recordatorio rápido es no tener que
  pensar la fecha. «La próxima semana» son 7 días y no «el lunes que viene» —
  un lunes fijo amontona en un solo día todo lo que se aplaza durante la semana,
  y obliga a decidir qué pasa cuando hoy ya es lunes.

- **D-062 La búsqueda es UNA consulta sobre cinco fuentes, no cinco consultas.**
  `search_workspace` une proyectos, tareas, comentarios, notas y actividad en un
  solo `union all`. Podrían ser cinco llamadas desde la app, pero entonces el
  ordenado por relevancia se haría en el cliente sobre cinco listas YA
  recortadas, y el resultado nº 1 dependería de en qué tabla vivía. Los filtros
  también van dentro, por lo mismo.

  Como `search_notes` (0032), NO es `security definer`: la RLS se aplica dentro.
  Hay una prueba pgTAP que llama al RPC con el uuid del espacio desde una cuenta
  ajena y comprueba que no devuelve nada.

  `tipo:` en vez del `en:` que decía el plan. `en:` filtraba por el nombre del
  contenedor, y dentro de un espacio ya acotado eso responde a una pregunta que
  casi nadie se hace; lo que sí se pregunta al buscar es «esto era una tarea o
  un comentario». Un filtro que no se entiende se DICE en la interfaz en vez de
  ignorarse, y una palabra con dos puntos que no sea una clave conocida se busca
  como texto: «13:30» tiene que poder buscarse.

- **D-063 CORRECCIÓN: el índice en español NO garantiza insensibilidad a los
  acentos.** El comentario de 0032 afirma que «buscar "direccion" encuentra
  "dirección"», y en ese caso es cierto — pero no es una regla, es una
  casualidad del stemmer. «dirección» y «direccion» se reducen ambos a
  `direccion`, mientras que «almacén» da `almacen` y «almacen» da `almac`, que
  no casan. Lo destapó una prueba pgTAP escrita para afirmarlo.

  No se cambia nada todavía: conseguirlo de verdad pide la extensión `unaccent`
  y una configuración de texto propia, y eso obliga a regenerar `notes.search`
  además de las cuatro columnas nuevas. Queda dicho aquí y en la prueba para que
  nadie vuelva a darlo por hecho.

- **D-064 La paleta crea la tarea REUSANDO `createTask`, no insertando.** Esa
  acción hace cosas que desde fuera no se ven: asigna el grupo del tablero,
  escribe la posición y deja la primera fila de `task_history`. Un `insert`
  propio habría creado tareas de segunda categoría, indistinguibles hasta que
  algo fallara semanas después.

  El proyecto es el primero del espacio, sin preguntar: el sentido de la paleta
  es apuntar algo en dos segundos, y el usuario aterriza en el drawer de la
  tarea recién creada, donde puede moverla.

- **D-065 El realtime avisa, no trae el dato.** La suscripción solo dispara el
  mismo `onSaved()` que ya se usa tras una acción propia, y este vuelve a pedir
  el hilo entero por el camino de siempre. Reconstruir el estado desde el
  payload del evento significaría mantener DOS maneras de armar el mismo hilo, y
  la del evento no tiene ni el nombre del autor ni el roster para pintar las
  menciones.

  Solo se publican `comments` y `comment_reactions`. Cada tabla publicada es
  tráfico que sale en cada escritura: publicar `tasks` haría que cualquier
  movimiento del tablero se emitiera a todo el mundo, y esa es una decisión
  aparte.

  Comprobado con dos sesiones reales a la vez: quien tiene acceso recibe el
  evento y quien no, no recibe nada. Realtime aplica la RLS del suscriptor.

- **D-066 `activity` es el sexto dominio del motor, y NO entra en `global`.**
  Global es «tu vida» —tus cifras, tu agenda, tus hábitos—; esto es «la semana
  de tu equipo». Son preguntas distintas, y mezclarlas metería la actividad de
  otras personas dentro de un análisis que el usuario pidió sobre sí mismo.
  Tiene su propio ámbito, su propia casilla de opt-in y su panel en /activity.

  NINGÚN HECHO DE ESTE DOMINIO NOMBRA A UNA PERSONA, y es la decisión que
  ordena todo el archivo. Los otros cinco extractores hablan de los datos del
  propio usuario; este habla de lo que ha hecho su equipo, y ahí la
  seudonimización del motor no alcanza: `buildAliasMap` cubre cuentas y
  dependientes, no a los compañeros de espacio, y `workspace_activity.actor`
  guarda un correo. Mandar correos o nombres de terceros al modelo para que
  redacte «Ana lleva dos días sin contestarte» es una línea que no se cruza.

  Así que los hechos cuentan y describen —cuántas menciones, qué proyecto
  concentra el movimiento, cuántos días de silencio— y el usuario abre el hilo
  para ver quién. Hay una prueba que recorre todos los hechos y falla si alguno
  contiene un nombre.

  El hecho que justifica el dominio es «te mencionaron y nadie escribió nada
  después»: es distinto de «sin leer» —puede que ya lo hayas visto— y es el
  único que señala una deuda con otra persona. Dos días de gracia, porque una
  mención de esta mañana sin contestar no es un hallazgo, es una mañana normal.

- **D-067 Un dominio nuevo no puede quedarse sin casilla.** Al añadir `activity`
  apareció en `DOMAIN_LABEL` y `setAiDomains` empezó a leer `domain.activity`,
  pero la lista de ORDEN de `AiSettings` estaba escrita a mano y se quedó atrás:
  la casilla no se pintaba, así que el usuario no podía encender un dominio que
  el servidor sí esperaba. Apagado para siempre, sin que nada fallara. Lo
  destapó abrir Configuración en el navegador, no ninguna prueba.

  Ahora la lista es la de orden MÁS las claves de `DOMAIN_LABEL` que falten, así
  que un dominio olvidado aparece igual, al final. El orden es una preferencia;
  que la casilla exista, no.

- **D-068 Las automatizaciones se TIPAN; no se interpretan.** `automations`
  llevaba desde 0008 con `trigger_text`, `condition_text` y `action_text`: tres
  campos de texto libre. Eso no es una automatización, es la descripción de una,
  y nada podía ejecutarla — para correr «cuando cierre una tarea, anótalo en la
  bitácora» hay que saber qué es «cerrar» y qué es «anotar».

  La otra salida era que el modelo interpretara la frase, y va contra la regla
  que sostiene Intelligence OS: el modelo no calcula ni decide, recibe hechos ya
  calculados y los redacta. Una automatización que dispara según lo que un
  modelo entendió del texto de ayer no es reproducible, y aquí ejecuta acciones
  reales sobre los datos del usuario. Así que disparador y acción son enums con
  parámetros en `jsonb`, acotados por `check`. Las columnas de texto se borran:
  la tabla estaba vacía y dejarlas invitaría a escribir en ellas.

  NO HAY DISPARADORES POR TIEMPO, y no es un recorte de alcance: no existe
  ningún proceso que despierte a nadie. Ofrecer «cada lunes a las 9» sería
  prometer algo que no ocurre — el mismo motivo por el que `reminders.remind_on`
  es `date` y no una alarma (D-061).

- **D-069 La barrera contra los bucles es estructural, y aun así hay una
  segunda.** `dispatch.ts` ejecuta las acciones DIRECTAMENTE contra la base, no
  llamando a las Server Actions que a su vez despachan: una automatización no
  puede provocar una segunda ronda porque no hay ninguna ronda que provocar.

  El dominio pone además una barrera propia —una regla cuya acción repetiría el
  evento que la disparó se salta— a propósito. La garantía estructural depende
  de cómo esté escrito el despachador, y eso puede cambiar el día que alguien lo
  refactorice; la del dominio está probada sin base de datos y no depende de
  nada.

  Y `set_status` pasa por `evaluateTransition` como todos los demás caminos: una
  automatización no puede cerrar una tarea con dependencias abiertas por el
  hecho de ser automática.

- **D-070 FR-AUT-002 distingue por IMPACTO, no por regla.** Anotar en tu
  bitácora o recordarte algo no necesita permiso: nadie más lo nota y se deshace
  solo. Crear una tarea o mover un estado sí — aparecen en el tablero del equipo
  y disparan sus propias consecuencias. Una acción de impacto con
  `authorized = false` NO se ejecuta: se PROPONE, y queda en `automation_runs`
  como `proposed` con su motivo.

  `automation_runs` registra también lo que no hizo nada (`skipped`) y lo que
  falló (`failed`). Una regla que no actuó y no dejó rastro es una regla que el
  usuario cree rota.

  El despachador NUNCA lanza: se llama al final de acciones que ya hicieron su
  trabajo —completar una tarea, dejar un comentario— y una automatización rota
  no puede deshacer eso ni presentarlo como un fallo. Mismo contrato que
  `sendEmail` (D-021).

- **D-071 Las plantillas de proyecto AÑADEN, nunca reemplazan.** Aplicarla a un
  proyecto que ya tiene trabajo pone sus grupos DESPUÉS de los que hay y no
  borra nada. La alternativa —limpiar el tablero y poner la plantilla— es
  irreversible: se llevaría las tareas con sus comentarios (que no tienen FK y
  quedarían huérfanos), sus archivos y sus responsables. Lo que sobre se borra a
  mano, y eso sí se deshace una fila a la vez.

  Por eso aplicar dos veces DUPLICA, y no se impide: repetir una fase es un uso
  legítimo en un proyecto largo. Quien avisa es el panel, que ya recibe
  `taskCount` — el mismo dato que hoy usa el de borrado. El aviso informa; la
  decisión sigue siendo del usuario.

  `plannedRows(template, { fromGroupPosition })` es lo que hace correcto el
  «al final»: sin arrancar después de la última posición, dos grupos la
  comparten y el orden del tablero pasa a depender de cuál devuelva antes la
  base. Probado con dos plantillas seguidas sobre el mismo proyecto: posiciones
  0-4 y luego 5-8, todas únicas.

- **D-072 Una plantilla trae estructura, no calendario ni juicio.**

  SIN FECHAS. El horizonte va en el NOMBRE del grupo («Fase 1 · Grind (llegar a
  25 ventas al día)»), que es honesto porque no promete nada. Poner `due` sería
  inventar un ritmo que no es de nadie: dos personas con el mismo proyecto no
  tardan lo mismo, y al mes medio tablero aparecería vencido — contando además
  como atraso en Home y en el hecho `execution.overdue` del motor.

  SIN `impact`. Ese flag alimenta «tres tareas de impacto» en Home y los minutos
  comprometidos del día. Cuáles lo son ESTA semana es del usuario; una plantilla
  que marca ocho rompe las dos cosas. Hay una prueba que falla si alguna tarea
  del catálogo trae `impact` o fecha.

  SIN `deps`. Exigen los ids de las tareas ya insertadas y no resuelven nada que
  el orden de los grupos no diga ya. `suggestProjectSequence` sigue estando.

- **D-074 Once plantillas piden agrupar el selector.** Con seis, una lista plana
  se lee de un vistazo; con once hay que recorrerla entera para descartar diez.
  Cada plantilla declara `category` —Trabajo y producto, Negocio, Marketing,
  Personal— y el `<select>` las pinta en `<optgroup>`.

  El orden de los grupos lo fija `TEMPLATE_CATEGORIES` y no el del array: así
  añadir una plantilla al final del catálogo no la manda al bloque equivocado.
  Hay pruebas que fallan si una plantilla declara una categoría desconocida
  —quedaría fuera de todo `optgroup`, invisible— o si una categoría se queda
  vacía.

  Marketing tiene dos entradas nuevas que no se pisan con «Lanzamiento o
  campaña»: aquella tiene fecha de fin, y estas no. El motor de contenido
  termina cuando publicar deja de depender de la inspiración; el embudo ordena
  las cinco etapas AARRR de Dave McClure, que son un marco con nombre y etapas
  comprobables, atribuido como los libros.

  Las tres personales son proyectos de verdad —mudanza, búsqueda de trabajo,
  certificación—, con fecha y muchas tareas discretas. Deliberadamente NO se
  añadió ninguna de hábitos o salud: eso ya lo cubren las rutinas y los hábitos
  de Personal Development OS, y duplicarlo en forma de tablero llevaría a llevar
  la misma cosa en dos sitios.

- **D-073 El catálogo de proyectos vive en código, como el de rutinas.** Mismo
  criterio que D-044: es CONTENIDO, no datos del usuario — sin dueño, sin RLS,
  versionado en git y probable sin levantar Postgres. Al usarla se COPIA: editar
  el proyecto no toca el catálogo, y cambiar el catálogo no le reescribe nada a
  nadie.

  De los libros se usa su ESTRUCTURA, que es un hecho comprobable —que Lean
  Startup se organiza alrededor del bucle Construir-Medir-Aprender, o que Moran
  divide el camino en Grind, Growth y Gold—, y todo el texto está escrito con
  nuestras palabras. No se reproduce nada de ninguna obra, y la plantilla
  atribuye el libro del que sale.

  Si la plantilla falla al crear un proyecto nuevo, se cae al grupo «General» de
  siempre en vez de dejar al usuario sin proyecto: un tablero usable vale más
  que un error. Y si falla a mitad, se borran los grupos recién insertados —
  solo los nuevos— por el mismo motivo que `createRoutineFromTemplate`: media
  plantilla obliga a limpiar a mano antes de reintentar.

### El hilo del proyecto, y una actividad que dice quién (agosto 2026)

**Sin tabla nueva.** `comments.subject_type` acepta `'project'` desde la
migración 0003 y sus políticas de lectura, escritura y borrado ya resolvían las
dos ramas; simplemente nadie había escrito nunca un comentario de proyecto. Todo
el hilo vivía dentro de una tarea, así que un mensaje como «@Victor, dejé
cargado el último commit, favor de aplicar las migraciones» —que no pertenece a
ninguna tarea concreta— acababa colgado de la que estuviera abierta.

Lo único que faltaba en la base eran las **reacciones**: las políticas de
`comment_reactions` (0038) resolvían el sujeto con un join literal a
`public.tasks`, que sobre un comentario de proyecto no casa ninguna fila. Y una
política que no casa no da error — el `insert` se rechaza en silencio. La
migración 0041 las reescribe sobre `can_view_comment_subject`, gemela de
`can_edit_comment_subject` (0029) y con la misma disciplina anti-recursión.

**La pestaña solo aparece en espacios compartidos.** En el personal no hay a
quién mencionar, y una conversación con nadie es peor que no tenerla. La
condición vive en un sitio (`page.tsx` calcula `threadEnabled` desde
`is_personal`) y viaja como lista de pestañas, no como un `if` dentro de la
barra. Un enlace con `?view=hilo` a un proyecto que ha acabado en un espacio
personal cae en el Tablero en vez de dejar la pantalla en blanco.

**El feed deja de guardar correos.** `workspace_activity.actor` guardaba
`user.email` en las cuatro Server Actions que escribían en ella, cada una con su
bloque copiado. Ahora hay un solo `recordActivity` (`src/lib/data/activity.ts`)
que resuelve el nombre (`profiles.name` → `memberships.user_name` → correo como
último recurso) y nunca lanza: el feed es un efecto secundario, y una excepción
ahí tumbaría el cambio de estado que ya ocurrió. Las filas ya guardadas con
correo **no se reescriben**, mismo criterio que 0037 tomó con `comments.mentions`.

Con eso, crear una tarea, mover un estado, borrar, editar el proyecto, tocar un
grupo o aplicar una plantilla dejan rastro — cosas que hasta ahora no lo dejaban.
Las acciones masivas escriben **una** fila por proyecto y no una por tarea: mover
diez tareas de golpe es un gesto, y diez líneas idénticas entierran el feed.

**El mensaje del hilo tiene su propio tipo** (`comment.project`). No es
burocracia: el propio hilo excluye esos eventos al pintarse —el mensaje del que
hablan está dos líneas más abajo— y sin un tipo que los distinga habría que
adivinarlo por el texto. En `/activity` se lee como cualquier comentario.

**`?task=` se leyó por fin.** Home, el buscador y la campana de menciones
apuntaban a `/execution?task=<id>` desde hacía versiones, y `page.tsx` nunca leyó
ese parámetro: el enlace abría la cartera y dejaba al usuario buscando a mano la
tarea que le acababan de señalar. Ahora se traduce a su proyecto y el drawer se
abre al montar. Salió al ampliar la bandeja de menciones al hilo del proyecto —
la mitad que ya existía estaba rota.

- **D-075 El plan de proyecto con IA: segundo proveedor, cero fechas y ningún
  camino de escritura nuevo.** «Generar plan con IA» toma un objetivo y un plazo
  y propone la estructura del proyecto. Cuatro decisiones que no se ven en el
  código y sin las cuales parece incoherente:
  - **Conviven DOS proveedores de IA, y es deliberado.** El motor de
    recomendaciones (D-027) corre sobre `@anthropic-ai/sdk` y funciona;
    migrarlo para unificar sería reescribir código probado sin ganar nada, y
    dejar el planificador en Anthropic era gratis pero se pidió OpenAI. Cada
    uno vive en su archivo (`src/lib/ai/provider.ts` y `openai-provider.ts`),
    con su secreto y su validación perezosa (F11): si falta uno, la feature del
    otro ni se entera. `openai` es la segunda dependencia de runtime que rompe
    D-008 a propósito, por el mismo motivo que la primera — la salida
    estructurada validada contra un esquema es justo lo que impide que el
    modelo invente formas, y reimplementarla sobre `fetch` sería reescribir la
    pieza de la que depende todo lo demás.
  - **`plan-project.ts` importa `zod` CLÁSICA, y `recommend.ts` importa
    `zod/v4`. No es un descuido y no se debe "arreglar".** El
    `zodOutputFormat` de Anthropic convierte el esquema con el núcleo v4 y
    revienta con uno v3 (D-027); el `zodTextFormat` de OpenAI va por
    `zod-to-json-schema` y revienta con uno v4 (openai/openai-node#1602). Cada
    archivo importa el que su SDK admite. `openai@7` pide `zod ^3.25 || ^4.0`
    y el repo ya estaba en `3.25.76`: **no hubo que tocar zod**.
  - **El plan NO lleva fechas. Ninguna, en ningún campo.** Es la misma razón que
    documenta el catálogo de plantillas y la que sostiene D-044: un plazo
    repartido en fechas inventadas deja medio tablero vencido al mes siguiente,
    y ese atraso falso se cuela en Home y en el hecho `execution.overdue` del
    motor. El plazo vive en el NOMBRE de la fase («Fase 2 · Construcción
    (semanas 4-9)»), que informa sin prometer. Lo prohíbe el prompt, pero quien
    lo GARANTIZA es `sanitizePlan`, que construye tareas nuevas con tres campos
    en vez de copiar lo que llegó — y hay un test que falla si alguna fecha
    sobrevive.
  - **La IA produce un `ProjectTemplate` y escribe por `writeTemplate`.** No
    estrena camino de inserción propio. Así hereda gratis lo que ya estaba
    resuelto para las plantillas: añadir al final sin tocar lo existente, el
    rollback si algo falla a mitad, el primer punto de `task_history` de cada
    tarea y el `audit_log`. Un segundo camino equivalente estaría condenado a
    divergir del primero al siguiente cambio de esquema.
  - **Dónde vive cada cosa, y por qué el reparto.** `sanitizePlan` y
    `selectionToTemplate` son dominio PURO
    (`src/lib/domain/execution/ai-plan.ts`), probados sin red y sin Postgres,
    porque son la última línea de defensa entre el modelo y la base — mismo
    criterio que `insights/anchoring.ts`. El esquema de zod garantiza la FORMA;
    el dominio garantiza las REGLAS (topes, colores del design system, cero
    fechas), que ningún esquema puede garantizar. Y el borrador **no se guarda
    en ninguna tabla**: vive en el estado del cliente hasta que se confirma, así
    que un plan descartado no deja filas que limpiar.
  - **En el alta, el plan viaja en el propio formulario.** `createProject` gana
    un campo `aiPlan` con el plan serializado, gemelo de `templateId`. Crear el
    proyecto y escribirle el plan en dos llamadas dejaría un tablero vacío si la
    segunda falla; en una sola, o nacen juntos o el proyecto nace en blanco, que
    es un estado usable. Y como el JSON pasa por el navegador, el servidor lo
    vuelve a sanear: `sanitizePlan` es idempotente a propósito para que eso no
    desplace los índices de la selección.

- **D-076 El presupuesto se trabaja por QUINCENA y se resume por mes.** El
  usuario cobra por quincena y `budgets` guardaba una aportación por quincena
  desde 0005, pero la app nunca las usó para medir: comparaba el gasto de una
  ventana **rodante** de 15 días (`hoy − 15`) contra el `monthly_cost`. Esa
  ventana se desplaza cada día, pisa el final de Q1 y el principio de Q2 y no se
  reinicia el día de pago, así que lo que se veía era un acumulado Q1+Q2 y la
  columna "Balance" salía en verde aunque la quincena estuviera agotada. Cuatro
  decisiones detrás del arreglo:
  - **Calendario fijo, no días de pago configurables.** Q1 = día 1-15, Q2 = día
    16-fin de mes (`src/lib/domain/quincena.ts`). Q1 + Q2 = mes natural exacto,
    de modo que el resumen mensual sigue cuadrando sin una segunda aritmética. La
    alternativa (dos días de pago en el perfil) daba periodos que cruzan el corte
    mensual y una pantalla de ajustes más, a cambio de una fidelidad que el
    usuario no pidió.
  - **La quincena no es un estado: se deriva de la fecha.** Vive en el
    querystring (`/money/budget?q=2026-08-Q2`), no en la base ni en el cliente,
    así que la vista es compartible y el botón "atrás" funciona. Una clave
    manipulada devuelve `null` y la página cae a la quincena vigente en vez de
    lanzar.
  - **El arrastre entre quincenas es una decisión humana, no un cálculo.** Cada
    quincena arranca con su aportación limpia; el sobrante o el exceso de la
    anterior se **muestra** por concepto, y sólo entra si el usuario lo aplica —
    y se puede quitar. Por eso `budget_carryovers`
    (`0042_presupuesto_quincenal.sql`) existe: es el único dato que no se puede
    derivar de los movimientos. El monto se **congela** al aplicarlo, porque el
    usuario aceptó una cifra concreta y su quincena no debe moverse sola si
    después registra un movimiento atrasado; si el cierre cambia, la pestaña
    ofrece reaplicar en vez de reescribir en silencio. Y lo recalcula la Server
    Action, nunca el cliente: un botón que enviara el monto permitiría inventarse
    presupuesto desde el navegador.
  - **El gasto fuera de presupuesto cuenta, pero se nombra.** El indicador de la
    quincena suma TODO el gasto del periodo, también el de categorías sin
    concepto, y lo desglosa (`en presupuesto` / `fuera de presupuesto`) con acceso
    directo a crear el concepto que falta. Un indicador que ignorara ese gasto
    dejaría el "disponible" inflado, que es la forma silenciosa de mentir.
  - **Un solo significado de "restante".** Antes el mismo objeto publicaba
    `balance` (costo mensual − gasto) y `expenseVsBudget` (gasto − costo mensual):
    la misma idea con dos nombres y signo opuesto según la pantalla. Ahora
    `remaining` = disponible − gasto, positivo = te queda, y la columna "Balance"
    desaparece. `/home` y `/money` calculan con la misma función
    (`budgetQuincenaRow`) para que las tres pantallas no puedan discrepar. De
    paso se corrigió que Home calculaba la **liquidez** con sólo los últimos 15
    días de movimientos, y por eso no coincidía con la de `/money`.

- **D-078 · Plan de lectura: una cola SEMANAL, y una fila por (libro, semana).**
  - **Por qué semanas y no una fecha objetivo por libro.** "Termina este libro
    el 30 de septiembre" mide, pero no contesta la pregunta que el usuario hace
    de verdad, que es *qué leo ahora*. La semana es la unidad en la que se
    piensa la lectura ("este mes me leo dos") y la única que permite decir
    literalmente «el libro de esta semana es X» en Inicio.
  - **Una fila por (libro, semana), no un rango `desde`/`hasta`.** El rango
    ahorra filas y cobra aritmética de solapamiento en CADA lectura. Con una
    fila por semana, "los libros de esta semana" es un `where week_start = ?`
    indexado y sin cálculo, y mover o quitar una semana es tocar una fila. El
    formulario multiplica (primera semana + cuántas) y la tabla se queda tonta.
    Es el patrón que ya usan `habit_logs`, `routine_runs` y `book_progress`:
    una fila por unidad de tiempo, con un `unique` que vuelve idempotente el
    doble clic.
  - **El lunes es una restricción, no una convención.** `routineDueToday`
    ('Semanal') ya ancla al lunes y /planning arranca ahí. `week_start` lo
    impone con `check (extract(dow from week_start) = 1)` en vez de confiar en
    que cada llamador normalice: una fila escrita desde SQL o desde una versión
    futura de la acción rompería la agrupación EN SILENCIO, y el bug aparecería
    semanas después como "un libro que no sale en ninguna semana".
  - **Qué es "urgente" en una cola.** Una cola no mide si vas a tiempo, pero sí
    sabe que una semana YA PASÓ. `focusBook` elige en tres escalones —atrasado,
    esta semana, y de respaldo el libro `Leyendo` más reciente— y devuelve
    SIEMPRE el porqué. Ese porqué llega hasta la UI: Inicio dice «El libro de
    esta semana» solo cuando hay plan detrás, y «Hoy estás leyendo» cuando es
    el respaldo. Prometer un plan que no existe es la forma rápida de que el
    usuario deje de creerle a la tarjeta — mismo criterio que el `basis` de
    `estimatedFinish`.
  - **Lo decide la ÚLTIMA semana programada, no la primera.** Un plan de tres
    semanas que arrancó la semana pasada y llega hasta la que viene va en hora.
    Marcarlo "Atrasado" por haber empezado antes convertiría el aviso en ruido,
    y un aviso que salta siempre deja de leerse.
  - **Una sola fuente para el libro foco.** `loadReadingFocus()`
    (`src/lib/data/development.ts`, envuelta en `cache()`). Antes Inicio elegía
    su libro con su propio `select ... order by updated_at`: eso señalaba el
    que tocaste al final, no el que decidiste leer, y con el Panel consultando
    por su cuenta las dos pantallas podían enseñar libros distintos en la misma
    sesión, sin que el usuario supiera cuál le miente.
  - **El avance rápido no es una comodidad, es lo que alimenta el cálculo.**
    Toda la Biblioteca mide sobre `book_progress`, y la única forma de escribir
    ahí era abrir el formulario completo y guardar seis campos. Un cálculo que
    nadie alimenta contesta siempre "sin datos suficientes": el problema no era
    la fórmula, era el trámite.

- **D-079 · `fdate` formateaba las fechas de calendario en la zona del proceso,
  y les quitaba un día.** `new Date("2026-08-31")` se interpreta como medianoche
  UTC, e Intl lo formateaba en la zona local: en México (UTC-6) esa medianoche
  son las 18:00 del día anterior, así que una columna `date` con `2026-08-31` se
  pintaba **"30 ago 2026"**. Afectaba a TODA fecha pura de la app —vencimientos
  de tareas, horizontes de metas, cortes de reporte, la fecha estimada de
  término de un libro— y se destapó con las semanas del plan de lectura, donde
  una semana anclada al lunes se anunciaba empezando en domingo. Una fecha de
  calendario no tiene zona horaria: el 31 de agosto es el 31 de agosto en
  Tijuana y en Madrid, así que se formatea en UTC, que es como se guardó. Un
  instante completo (`...T12:00:00Z`) sí la tiene y conserva el comportamiento
  de siempre. Cubierto por `tests/domain/format.test.ts`.

### Un panel de administración, y el catálogo que se muda a la base (septiembre 2026)

- **D-080 · El catálogo de plantillas se muda a `template_catalog` y lo edita un
  administrador. DEROGA D-044.** Añadir o corregir una plantilla exigía un
  despliegue, y eso convierte el catálogo en algo que solo se toca cuando
  alguien programa. Migración `0044_admin_catalogo_plantillas.sql`.

  **Qué se pierde, sin adornos.** `git log` sobre el contenido (quién cambió qué
  plantilla y cuándo), `git revert` sobre una edición mala, y la imposibilidad
  de que dos entornos divergan. Las tres eran ventajas reales de D-044 y ninguna
  se recupera con esto; el panel **no lleva historial ni deshacer**, así que una
  edición equivocada se arregla volviéndola a escribir.

  **Qué lo compensa.** El miedo CONCRETO de D-044 era que alguien editara en
  producción y un usuario aplicara una plantilla a medio escribir. Eso lo cierra
  la columna `status`: una plantilla nace en `draft` y no la ve nadie —lo
  garantiza la RLS, y lo prueba `supabase/tests/0020`— hasta que se publica. La
  semilla es idempotente (`on conflict do nothing`) y conserva los `slug` de
  siempre, así que un entorno nuevo arranca con el catálogo exacto de antes y un
  redespliegue nunca pisa lo que un administrador ya editó.

  **Lo que NO cambia, y es la mitad importante de D-044:** al usar una plantilla
  se **copia** a las tablas del usuario. Editarla no le reescribe el tablero ni
  los pasos a nadie que ya la hubiera aplicado.

- **D-081 · `payload jsonb`, y no cinco tablas relacionales.** Los tres tipos de
  plantilla tienen formas distintas —proyecto es grupos → tareas → subtareas,
  rutina es una lista de pasos, hábito es plano— y el contenido se lee entero y
  siempre: nadie consulta «las tareas de la plantilla X» por separado, porque al
  aplicarla se copia de una vez. Relacional serían cinco tablas y tres joins
  para algo que nunca se consulta por partes, más una migración de esquema cada
  vez que un tipo gane un campo.

  Quien garantiza la forma es `src/lib/domain/templates/schema.ts`, que corre en
  los DOS extremos: al guardar (lo que no valida no entra) y al leer (una fila
  que no valida se descarta y las demás se muestran). Es el puesto que ocupaba
  el compilador cuando el catálogo era un array de un `.ts`, y por eso el
  esquema **guarda lo que sale del parseo, nunca lo que entró**: así una tarea
  con `due` o con `impact` pierde el campo antes de llegar a la tabla, que es la
  forma de seguir cumpliendo las ausencias que documenta `project-templates.ts`
  ahora que el compilador ya no puede.

- **D-082 · El rol de administrador es de PLATAFORMA, y no toca datos de nadie.**
  Es el primer rol del esquema que no es de workspace: los de 0003
  (Owner/Admin/Member/Guest/Viewer) dicen qué puede alguien dentro de un
  espacio; `profiles.is_admin` dice quién cura el contenido que ven todos. La
  única tabla que alcanza es `template_catalog`, que no tiene `user_id`. BR-012
  sigue en pie palabra por palabra, y hay una assertion de pgTAP que lo
  demuestra: un administrador **no ve el perfil de otro usuario**.

  Se otorga con SQL después de desplegar (ver `/docs/DEPLOY.md`). No hay
  pantalla para repartir privilegios: es superficie de ataque que no hace falta
  mientras los administradores se cuenten con los dedos de una mano.

- **D-083 · /admin devuelve 404 a quien no es administrador, no un redirect.**
  Un redirect a /home contesta «esto existe, pero no es para ti»; un 404 no
  contesta nada. Y no es la única defensa, es la primera: la RLS rechaza
  cualquier escritura de quien no es admin, y cada Server Action lo vuelve a
  comprobar antes de escribir — porque una Server Action es un endpoint HTTP y
  se puede invocar sin pasar por la pantalla.

- **D-084 · El editor es un formulario, no un campo de JSON.** Un `textarea` con
  el payload sería una fracción del código y convertiría cada edición en un
  ejercicio de puntuación: una coma de más y la plantilla no se guarda, sin
  decir dónde. Con campos, lo único que se puede escribir es lo que el esquema
  declara.

  Y la **previsualización reusa las funciones del dominio** —`plannedRows`,
  `templateSummary`, `routineTemplateDuration`—, las mismas que ejecuta la
  acción que aplica la plantilla. Lo que el administrador ve es literalmente lo
  que se va a insertar, no una segunda cuenta condenada a divergir de la primera
  al siguiente cambio.

- **D-085 · Las pruebas de contenido apuntan a la semilla de la migración.**
  Al salir el catálogo del código, los tests que vigilaban que ninguna tarea
  trajera fecha, que los colores fueran tokens del design system o que
  S.A.V.E.R.S. sumara sesenta minutos se quedaban sin objeto. Ahora leen el
  `insert` de la migración (`tests/domain/seed-catalogo.ts`), que es el catálogo
  con el que arranca cualquier entorno nuevo, y siguen corriendo sin Postgres.
  Lo que un administrador escriba después no pasa por ahí: a eso lo protege el
  esquema zod, al guardarlo y al leerlo.

### El hilo se calla, la IA se unifica y aparece un sitio donde preguntar (septiembre 2026)

- **D-086 · El hilo del proyecto deja de intercalar la actividad.** La 0041 lo
  estrenó mezclando los eventos de `workspace_activity` entre los mensajes, con
  el argumento —bueno— de que un cambio de estado explica por qué el siguiente
  mensaje dice lo que dice. Lo que no se vio entonces es que esa pregunta ya
  tenía pantalla: `/activity` enseña los mismos eventos, completos, agrupados
  por día y con su autor al margen. Repetirlos en el hilo no añadía contexto,
  competía con él: sesenta líneas grises por cada puñado de mensajes.

  El hilo contesta «qué nos dijimos»; `/activity` contesta «qué ha pasado
  aquí». Son dos preguntas y ahora son dos pantallas.

  **Se cae `src/lib/domain/execution/project-thread.ts` entero**, con sus dos
  funciones y sus nueve pruebas. `mergeProjectThread` existía para mezclar dos
  corrientes y ya solo hay una; `describeEvent` se queda sin eventos que
  describir. Y el desempate por `id` que la mezcla protegía tampoco sobrevive,
  por una razón concreta y no por descuido: existía porque el comentario y su
  fila de actividad se escriben en la MISMA operación y podían compartir
  milisegundo. Sin eventos esa colisión no puede ocurrir, y el
  `order("created_at")` de la consulta ya deja el orden bien.

  Lo que **no** cambia: `addProjectComment` sigue escribiendo su
  `recordActivity({ type: "comment.project" })`. Quien mira `/activity` quiere
  saber que aquí se habló. Lo que se quitó es la lectura, no el registro.

- **D-087 · Un solo proveedor de IA, y sin SDK.** D-075 defendía dos —Anthropic
  para las recomendaciones, OpenAI para el planificador— con el argumento de
  que migrar código probado no ganaba nada. Dejó de ser cierto en cuanto
  apareció una tercera feature: dos proveedores para tres cosas son dos
  facturas, dos formas de fallar y dos SDK que mantener. Todo pasa a
  `gemini-3.6-flash`, con `GEMINI_API_KEY` como única llave.

  **Y se habla con la API por `fetch`, sin SDK.** Esto es lo que de verdad se
  gana, y no es ahorro por ahorro: `recommend.ts` importaba `zod/v4` y
  `plan-project.ts` la `zod` clásica porque el conversor de esquemas de cada
  SDK revienta con el núcleo del otro (D-027, D-075). Era una división que no
  venía de nuestro código sino de sus dependencias, y que obligaba a escribir
  en la cabecera de los dos archivos que NO se podían unificar. Sin conversor,
  el problema desaparece: **queda una sola `zod` en todo el repo y caen dos
  dependencias de runtime** (`openai`, `@anthropic-ai/sdk`), que es la
  dirección que pide D-008.

  El precio es escribir dos esquemas por feature en vez de uno: el de zod, que
  EXIGE la forma de la respuesta, y el de `responseSchema`, que se la PIDE al
  modelo. Se aceptó porque son veinte líneas y porque una deriva entre ambos la
  caza el `safeParse`, no la pantalla del usuario.

  `generateJson` mantiene el contrato de D-021 palabra por palabra —nunca
  lanza— y traduce a un motivo legible cada forma de fallar. Una que antes no
  existía y ahora es normal: el **429 del free tier**. No es una anomalía, es
  el plan gratuito haciendo su trabajo, y se dice con esas palabras en vez de
  como un error.

  **Addendum (a los pocos días): el modelo se retiró.** `gemini-2.5-flash` pasó
  a «no longer available to new users» y la propia API nombró al sucesor,
  `gemini-3.6-flash`. Se cambió la línea de `GEMINI_MODEL` y ya está — que
  fuera una línea es la razón por la que la constante vive sola en
  `gemini-provider.ts` y no repartida por cada feature.

  Lo que confirmó el episodio no es el modelo sino el manejo de errores:
  `httpReason` devuelve el `detalle` que manda la API para cualquier 4xx que no
  sea 429/401/403, así que el mensaje llegó íntegro a la pantalla —con el
  nombre del sucesor dentro— en vez de convertirse en un «no se pudo» genérico.
  El diagnóstico vino dicho.

  **La API sugiere además migrar a su «Interactions API». No se hizo, a
  propósito.** Es una recomendación, no un requisito: el mismo mensaje dice
  «update your code to use models/gemini-3.6-flash», o sea que
  `:generateContent` sigue sirviendo. Cambiar de superficie de API a ciegas,
  sin poder ejecutar una sola llamada en este entorno, sería sustituir algo que
  falla por una razón conocida por algo que puede fallar por razones que no
  sabríamos leer. Queda como pendiente con nombre, no como deuda escondida.

- **D-088 · Hay un chat, y no contradice al spec.** El spec de Intelligence OS
  (§2) descartó el chat a propósito: «el valor está en que el sistema note
  cosas, no en conversar». Sigue siendo verdad para las recomendaciones —nadie
  quiere teclear para enterarse de que su presupuesto va al 92%—, y por eso el
  motor no se toca. Lo que ese diseño deja fuera es la pregunta en la otra
  dirección, «¿en qué me enfoco esta semana?», que ningún motor proactivo puede
  adivinar. El chat no sustituye al motor: contesta lo que el motor nunca se
  preguntó.

  **Ve exactamente el mismo contexto, por el mismo sitio.** Reusa
  `allowedDomains('global')`, el opt-in de `profiles.ai_domains` (vacío por
  defecto), `buildAliasMap`, `buildContext` y `restore`. Un chat con su propia
  forma de reunir datos habría sido un SEGUNDO camino por el que salen cifras
  del servidor, con sus propias reglas y su propia manera de quedarse atrás
  — y `context.ts` dejaría de ser lo que D-027 promete: un archivo que
  auditar.

  Para lograrlo hubo que sacar `loadFacts` de `lib/insights/actions.ts` a
  `lib/insights/facts-loader.ts`. No es un capricho de organización: ese
  archivo lleva `"use server"`, donde todo lo exportado tiene que ser una
  Server Action, así que la función solo podía ser privada. La alternativa era
  una segunda forma de cargar hechos, condenada a divergir de la primera.

  **Con todos los dominios apagados el chat contesta igual**, pero diciendo que
  no ve nada. Un asistente que se niega a hablar hasta que configures algo es
  peor que uno honesto sobre lo que no sabe.

- **D-089 · El chat propone tareas; crearlas sigue siendo del usuario.** El
  modelo devuelve un título y la UI ofrece un botón. No hay ningún camino de
  escritura nuevo: lo crea `quickAddTask`, que ya existía y que a su vez reusa
  `createTask` —con su grupo, su posición y su primera fila de
  `task_history`—, así que del chat no salen tareas de segunda categoría.
  Mismo criterio que D-075 tomó con el planificador, y por el mismo motivo: lo
  que un modelo escribe solo en la base de datos de alguien es lo único que no
  se puede deshacer con un clic.

  El título pasa por `sanitizeProposedTask`, que le quita las fechas por la
  misma razón que `sanitizePlan`: una fecha inventada deja el tablero lleno de
  tareas vencidas al mes siguiente.

- **D-090 · El chat es un rail que se pliega, no un drawer ni una pantalla.**
  Casi todo lo que se le pregunta es SOBRE lo que se está mirando: «¿por cuál
  empiezo?» delante del tablero, «¿cuánto llevo?» delante del presupuesto. Una
  ruta `/chat` quita justo el contexto que hace buena la pregunta, y un drawer
  tapa la pantalla sobre la que se pregunta. Es la tercera columna del grid a
  partir de 1280px, montada en `AppShell` al lado de `CommandPalette` y por el
  mismo motivo que aquélla: es el único ancestro de todas las pantallas.

  **Se pliega en vez de cerrarse** porque el tablero de `/execution` con sus
  cinco columnas es a la vez donde más estorba y donde más falta hace tenerlo
  cerca; plegado deja la franja con el icono, que es el mismo botón de abrir.
  Por debajo de 1280px no cabe —272 de menú + contenido + 360 estrangulan la
  pantalla— y ahí se comporta como los demás paneles del proyecto, reusando
  `.td-backdrop`/`.td-drawer`.

  **El corte de visibilidad vive en `globals.css` con media queries y no en
  clases `hidden xl:flex`.** No es preferencia de estilo: el bloque va después
  de `@tailwind utilities`, así que `.ai-rail { display: flex }` le gana a
  `.hidden` por orden de aparición y el rail se habría pintado también en un
  teléfono.

  **Y la preferencia de plegado va en una COOKIE, no en `localStorage`.** La
  primera versión usaba `localStorage` y al comprobar el HTML del servidor se
  vio el problema: solo se puede leer después de hidratar, así que el servidor
  pintaba siempre la misma forma y el ancho del contenido se movía un frame más
  tarde, en CADA carga de página. La cookie la lee el layout —que ya es
  dinámico— y el rail llega decidido desde el servidor. Es una preferencia de
  interfaz, no una sesión: `samesite=lax` y un año.

- **D-091 · Sin streaming, y dicho a propósito.** No hay streaming en ninguna
  parte del repo: toda la IA es request/response con `useTransition`. Abrirlo
  para la primera versión de una feature habría sido estrenar un patrón —route
  handler, `ReadableStream`, reensamblado en cliente— en el sitio con menos
  información sobre si hace falta. La familia flash responde rápido y el
  «Pensando…» cubre la espera. Queda apuntado como siguiente paso, no como
  deuda escondida.

- **D-092 · «Borrar historial de IA» borra también la conversación.** El botón
  de Configuración vaciaba solo `recommendations`. Con el chat guardando turnos
  en `ai_chat_messages`, dejarlo como estaba convertía la promesa del botón en
  media verdad — y precisamente sobre la tabla donde el modelo escribió con más
  detalle sobre la vida del usuario. El botón se llama ahora «Borrar historial
  de IA» y hace lo que dice.

### Hábitos dentro de rutinas (Personal Development OS, septiembre 2026)

_Se planificaron como D-086 y D-087, que era lo siguiente libre cuando se
escribió el diseño. Llegaron después de la rama del catálogo y el chat, que
ya había ocupado de la D-080 a la D-092; los documentos de diseño de
`docs/superpowers/` conservan la numeración original porque son el registro
de lo que se planeó, no de lo que quedó._

- **D-093 · Un hábito no existe fuera de una rutina**: `habits.routine_id` es
  `not null` (migración 0046) y `routine_steps` desaparece — el paso ES el
  hábito. Se descartó dejar la relación opcional o mantener una tabla de unión:
  las dos habrían dejado la invariante en manos de la aplicación, y la
  aplicación no puede defenderla contra un `insert` que no pase por ella. Con
  ello se van también `habits.frequency` (la dicta la rutina) y
  `habits.occupation_id` (el bloque lo ancla la rutina): dos sitios diciendo lo
  mismo es un sitio donde mentir.
- **D-094 · `habit_logs` es la única fuente de "¿lo hice hoy?"**: se borra
  `routine_runs.completed_step_ids`, que era un segundo registro de lo mismo.
  Consecuencia deliberada: desmarcar un hábito dentro de la rutina ahora **sí**
  borra el registro del día. Antes no lo hacía —`habitLogEffect`— porque el
  usuario podía haberlo cumplido por otra vía y la rutina no era dueña de
  negarlo; con un solo registro esa ambigüedad no existe.

### IA transversal: cadena de modelos, herramientas y memoria (septiembre 2026)

- **D-095 · El modelo deja de ser uno y pasa a ser una cadena.** `GEMINI_MODEL`
  era una constante y el 429 del free tier dejaba las tres funciones de IA sin
  servicio hasta el día siguiente. Ahora `GEMINI_MODELS` es
  `["gemini-3.1-flash-lite", "gemini-3.6-flash"]` y se recorre: cada modelo del
  plan gratuito tiene su propio contador diario, así que encadenarlos **suma
  cuota** en vez de esperar a mañana. El primero es el `-lite` porque es el que
  más peticiones al día trae; el segundo es el que ya estaba en producción.

  **Lo que decide el salto está en una función pura**, `debeSaltarDeModelo`
  (`src/lib/domain/ai/model-chain.ts`), y no en el bucle: es la única parte de
  esto que se puede probar sin red, y son seis casos que conviene tener
  escritos. Salta el **429** (cuota), el **404** (modelo retirado) y los
  **5xx**. NO salta el 401/403 —la llave fallaría igual en todos y recorrer la
  cadena solo añade espera antes del mismo mensaje—, ni el **400**, que es
  nuestro esquema mal formado: saltarlo lo escondería, que es lo contrario de
  lo que consiguió `httpReason` devolviendo el detalle de la API tal cual. El
  timeout tampoco encadena: son 60 s por modelo y dos seguidos son dos minutos
  con un botón girando.

  **Efecto secundario que sí importa:** el episodio de D-087 —un modelo retirado
  que tumbó la IA entera— ya no puede repetirse igual. El 404 salta y el
  siguiente contesta.

  **Y `audit_log` deja de registrar una constante.** `GenerateJsonResult` gana
  `model` con el que de verdad contestó, porque con una cadena dar por hecho el
  primero es registrar algo falso. Un registro que miente es peor que no
  tenerlo.

- **D-096 · El chat propone memoria; guardarla sigue siendo del usuario.**
  Extensión literal de D-089, con el mismo mecanismo y por el mismo motivo: el
  modelo devuelve `proposedMemoryText`/`proposedMemoryScope` y la UI ofrece un
  botón «Recordar». **Ninguna tabla nueva** — `memory_items` existe desde 0008
  con `scope`, `valid_until` y un `origin` que 0027 restringió a
  `('user','ai')` precisamente para este caso. La escritura reusa
  `upsertMemoryItem`, que sigue siendo el único sitio que escribe ahí; lo único
  que se le añadió es el parámetro `origin`.

  **La regla que hace útil la memoria es qué se RECHAZA.** `memory_items` entra
  en el prompt de todas las features y no caduca sola, así que lo que se cuele
  se seguirá contando dentro de un año. `sanitizeProposedMemory` descarta lo
  efímero —«hoy comió avena» es un renglón del diario, no quién eres—, lo que
  lleva una fecha dentro y lo demasiado corto para significar algo. Aceptar
  basura aquí es permanente, a diferencia de un botón de tarea que se ignora.

  Dos detalles que costaron una prueba cada uno y se dejan escritos porque
  volverían a morder: el `(?<!la |las )` delante de «mañana», sin el cual
  «entrena por la mañana» —el tipo de hecho duradero que esto busca— se
  rechazaría por contener un adverbio de tiempo que ahí no lo es; y que el
  regex de fechas se partió en dos objetos, uno con `g` para `replace` y otro
  sin él para `test`, porque `RegExp.test` sobre un patrón global avanza
  `lastIndex` y no lo reinicia al acertar: compartir el objeto habría dejado
  pasar una memoria con fecha una de cada dos veces.

  **La lista de ámbitos se unificó de camino.** Estaba escrita tres veces
  —el tipo en `domain/insights/memory.ts`, un arreglo en `insights/actions.ts`
  y habría sido un tercero en el saneador—. Ahora `MEMORY_SCOPES` vive junto al
  tipo, que se deriva de ella. Un ámbito que la base no admite no falla en la
  pantalla: falla en el `insert`, con un error de restricción que el usuario no
  puede interpretar.

- **D-097 · El modelo pregunta por los datos en vez de recibirlos todos.** El
  contexto eran 40 hechos precocinados (`MAX_FACTS`) y punto: lo que no cupiera
  ahí no existía para el modelo. Se descartó ensanchar el volcado —meter todos
  los dominios en cada turno paga el contexto entero en cada pregunta y se come
  la cuota que D-095 acaba de ganar— y se eligió **function calling**: dos
  herramientas, `leer_hechos` y `consultar`, que el modelo usa solo cuando le
  hacen falta.

  **La regla que sostiene todo lo demás: una herramienta devuelve cosas con id,
  nunca filas anónimas.** El motor entero se apoya en que el modelo no calcula
  —cita hechos con id estable y `validateAnchoring` descarta lo que cite un id
  que no se le envió—. Devolver filas sin identificar habría dejado al modelo
  redactando cifras que nadie puede rastrear, y esa red se habría caído sin que
  fallara nada visible. Por eso hasta una fila cruda entra como
  `fila:<tabla>:<uuid>`, y por eso `chatReply` valida las citas contra los
  hechos del contexto **unidos a** los ids que entregaron las herramientas: sin
  esa unión, lo que el modelo se molestó en consultar se le descartaría por
  inventado, justo en las respuestas mejor fundamentadas.

  **La lista blanca vive en `insights/context.ts`, no en `lib/ai/tools.ts`.**
  Ese archivo dice de sí mismo que es «el ÚNICO punto donde se aplica el filtro
  de privacidad» (D-027), y repartirlo entre dos sitios habría costado
  exactamente lo que ese archivo vale: poder auditarlo de una sentada. Es una
  lista BLANCA —lo que no está, no se consulta—, así que `profiles`,
  `audit_log`, `ai_chat_messages` o cualquier tabla de workspace quedan fuera
  sin que nadie tenga que acordarse de excluirlas. Cada entrada declara su
  dominio (para que `ai_domains` siga mandando) y la columna por la que se
  acota la ventana. El `satisfies Partial<Record<keyof Database…>>` hace que
  una tabla mal escrita **no compile**.

  **Dos topes, y los dos por la misma razón:** máximo dos rondas de
  herramientas y máximo 50 filas por consulta. Lo que devuelve una herramienta
  viaja DENTRO del prompt de la llamada siguiente, así que sin topes el modelo
  puede gastarse la ventana y la cuota dando vueltas. En la última ronda se le
  quitan las herramientas, que es lo que convierte el tope en «ahora contesta»
  en vez de en un error.

  **La trampa que costó leerse la documentación: `thoughtSignature`.** La serie
  Gemini 3 devuelve una firma dentro de las partes y hay que reenviarla
  IDÉNTICA, o la segunda llamada responde 400. Los SDK lo hacen solos; aquí no
  hay SDK (D-087). La defensa no es copiar el campo —mañana habrá otro— sino no
  reconstruir nunca el turno del modelo: se reenvía `candidates[0].content`
  tal cual llegó.

  **Y una red de seguridad que se deja puesta a propósito:** si la petición con
  herramientas se rechaza con un 400, se reintenta el mismo modelo sin ellas.
  Combinar `tools` con `responseSchema` está documentado para Gemini 3, pero en
  este repo no hay **ni una sola llamada real ejercitada** (CHECKS.md) y el
  chat está montado en todas las pantallas. Vale mil veces más una respuesta
  sin datos frescos que un rail roto.

  **En Configuración cambió el texto, no solo el código.** Decía que «lo que
  viaja son cifras ya calculadas», y con `consultar` eso dejó de ser cierto.
  El botón «Acceso total» marca todas las casillas pero **no guarda**: dejarlo
  guardar convertiría un clic en autorización para leerlo todo, y el
  consentimiento sigue estando en Guardar.

### Nutrición dentro de Personal Development OS (septiembre 2026)

- **D-098 · El diario guarda COPIA de los números, no un join a `foods`.** Es lo
  contrario de la regla de D-093 —«dos sitios diciendo lo mismo es un sitio
  donde mentir»— y la inversión es deliberada: en Open Food Facts la ficha de un
  producto la edita cualquiera. Leyendo por join, que un desconocido corrija hoy
  un yogur **reescribiría lo que desayunaste en marzo**. Un diario que cambia el
  pasado no mide nada, y medir es lo único que hace útil un diario. `food_id`
  queda solo como procedencia, con `on delete set null` para que purgar la caché
  tampoco toque el historial. Lo fija una aserción pgTAP, no la buena voluntad.

  **`food_entries` tampoco lleva el `unique` que sí tienen `habit_logs`,
  `routine_runs` y `book_progress`.** Allí existe porque marcar es un *toggle* y
  el doble clic tiene que ser idempotente; aquí dos manzanas son dos manzanas.
  La protección contra el registro duplicado es que la línea de más se ve en la
  lista y se borra con un toque, cosa que un toggle duplicado no permitía.
  `body_measurements` sí lo lleva: un peso por día es un valor, no una lista.

- **D-099 · `foods` es la única tabla del OS sin `user_id`, y su escritura se
  cierra con GRANT y no con RLS.** El límite de Open Food Facts es de 15
  peticiones por minuto **por IP**, y todos los usuarios comparten la de Vercel:
  una caché por usuario no ahorraría ni una petición, que es exactamente para lo
  que la caché existe. Se aceptó saltarse BR-012/019/027 porque lo que guarda
  son copias de filas públicas y —esto es lo que la hace inocua— **no registra
  quién buscó qué**. `source` no admite `'manual'` justo para que esa afirmación
  siga siendo cierta: un alimento tecleado es dato personal y se queda en el
  diario.

  La escritura es el punto delicado y por eso no se resolvió con una política:
  `authenticated` no tiene `insert` ni `update`, escribe `service_role` desde
  `lib/data/nutrition.ts`. Con `insert` concedido, cualquiera con un token
  envenenaría por PostgREST la caché que ven todos. Hay una aserción pgTAP
  dedicada a eso, y es la que justifica toda la excepción.

  **Si en revisión el precio parece alto, la vuelta atrás es de una línea:**
  `user_id not null` y quitar los grants especiales. El resto del módulo no se
  mueve, porque el diario nunca depende de `foods`.

- **D-100 · La caché es el índice de búsqueda primario, no un memo.** Se
  consulta ANTES que la red siempre: un código de barras ya visto son cero
  peticiones, y en texto basta con cinco filas guardadas para no salir. Un
  `upsert` fallido —falta la llave de servicio, por ejemplo— se ignora y se
  devuelven los candidatos igual: una caché que no se puede escribir es una
  caché lenta, no una búsqueda rota. Y si los proveedores caen pero la caché
  tenía algo, se devuelve `ok: true` diciéndolo; `books.ts` no puede hacer eso
  porque no tiene tabla, aquí sale gratis.

- **D-101 · El objetivo diario se CALCULA, y tiene un suelo que es ético y no
  técnico.** No se guardan cuatro números que nadie recalcularía al cambiar el
  peso: `dailyTargets` los deriva con Mifflin-St Jeor —elegida sobre
  Harris-Benedict porque es la que usa el mercado y el usuario puede contrastar
  el número—. Lo que no es aritmética es el suelo: **la app no puede ser el
  instrumento con el que alguien se fija 600 kcal al día.** El suelo blando (el
  metabolismo basal, y 1200/1500 por sexo) lo pone el dominio y lo DICE en
  `floored` en vez de callarlo; el duro de 1000 lo defiende un `check` de
  Postgres, donde no se discute.

  **Y la banda de cumplimiento es simétrica (±10 %), que también es una
  postura.** Quedarse un 20 % por debajo no es cumplir mejor: es otro desvío.
  Igual que `nutrition.kcal-drift` reporta las dos direcciones con el mismo
  peso, y que un día sin registrar **no** cuenta como cumplido — contarlo
  convertiría el abandono en adherencia perfecta.

- **D-102 · La meta de peso obligó a admitir metas DESCENDENTES.** «Bajar a 78
  kg» es la primera fuente del sistema donde el objetivo está por debajo del
  valor actual, y con `pctOf` daba 105 % recortado a 100: la meta nacía
  cumplida. Se añadió `key_results.baseline` —el punto de partida— porque sin él
  81 kg puede ser casi la meta o no haber empezado, y sin él el resultado clave
  se declara `stale` en vez de inventarse un número.

  `key_results_source_shape` **no se tocó**: `'nutrition'` no es `'manual'`, así
  que exige `source_id`, y lo tiene — apunta a `nutrition_profiles.user_id`, que
  es *la* fila que define los objetivos. Lo que sí hizo falta es
  `source_metric`, porque una meta de nutrición mide dos cosas distintas y
  `source_kind` solo dice de qué módulo viene. Se descartó una tabla
  `nutrition_targets` cuyo único consumidor sería `key_results`.

- **D-103 · Ningún hecho de nutrición nombra un alimento.** «Registraste 3
  donas» es exactamente el detalle con juicio moral que hace que alguien borre
  la app. El extractor habla solo en agregados —kcal, gramos de macro, días— y
  lo comprueba una prueba, porque es el tipo de regla que se erosiona sola en
  cuanto alguien quiere «dar más contexto». Los hechos descriptivos topan además
  en 0.4 de peso: el contexto se recorta por peso (`MAX_FACTS`) y nada de
  nutrición debe desplazar de ahí una racha de hábito rota de dos semanas.

- **D-104 · El enlace con Money OS es una comparación, no un join.** El usuario
  lo pidió sabiendo que era el más flojo de los cuatro. Lo único cierto que se
  puede hacer con esos datos es poner lado a lado, para el mismo mes, cuántos
  movimientos hubo en la categoría «Alimentación» y cuántos días tienen diario
  — **cero columnas, cero FK, cero joins**, y la advertencia pegada debajo en la
  propia pantalla.

  Lo que **no** se hace, escrito aquí para que dentro de seis meses nadie «lo
  arregle» con un heurístico: casar un ticket con comidas (un `journal_entries`
  es un importe y una fecha, sin un solo renglón de producto), decir cuánto
  costó lo que comiste, o repartir una compra entre los días en que se consumió.
  Lo único que haría real ese enlace es capturar renglones de ticket, que es
  otra feature y grande.

- **D-105 · `habits.meal` es una etiqueta, no una segunda verdad.** Un hábito
  puede SER una comida, pero marcarlo **no registra nada**: ofrece un enlace al
  diario. `habit_logs` sigue siendo la única respuesta a «¿lo hice hoy?»
  (D-094), y lo que un modelo o una pantalla escriben solos en tu base es lo
  único que no se deshace con un clic (D-089).

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
