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

- **D-044 El catálogo de plantillas vive en código, no en la base.**
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
