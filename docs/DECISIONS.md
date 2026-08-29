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
