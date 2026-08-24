# Personal Development OS — Metas, rutinas, sistemas y biblioteca

**Fecha:** 2026-08-22
**Estado:** Diseño, pendiente plan de implementación
**Alcance:** Personal Development OS completo, en cinco fases. Consume el motor de
Intelligence OS (`2026-08-21-intelligence-os-design.md`) pero no lo modifica: le aporta
un extractor de hechos más.

## 1. Contexto y problema

`README.md` describe tres subsistemas: Execution OS, Money OS e Intelligence OS. El spec
de Intelligence OS difiere explícitamente el Personal Development OS a un documento
propio (§ "Fuera de alcance"). Este es ese documento.

Las piezas de desarrollo personal ya existen, pero dispersas y sin techo común:

- `/habits` mezcla dos cosas distintas —hábitos y biblioteca de lectura— y cuelga del
  grupo **Execution OS** en `src/components/nav-items.ts:29`.
- `/goals` es **financiero** (`financial_goals`), no personal. El nombre "Metas" ya está
  tomado por dinero.
- No existe ninguna noción de meta personal, rutina, sistema/metodología, lista de deseos
  ni integración con servicios externos.

El problema de fondo no es que falten campos: es que **falta el objeto que da sentido a
los registros**. El usuario puede anotar que leyó 30 páginas y que marcó un hábito, pero
nada conecta "leer 24 libros este año" con el libro en curso, con el bloque de 6 a 7 a.m.
de `/time`, con el dinero que cuesta el siguiente libro, ni con la metodología que el
usuario dijo que iba a seguir.

Lo que este módulo debe lograr: **una meta personal que se mide sola con datos que ya
están en la base**, rutinas que se ejecutan sin duplicar el bloque horario ni la racha, y
sistemas que al adoptarse generan objetos reales en vez de quedarse en teoría.

## 2. Decisiones tomadas

| Decisión | Elección | Razón |
|---|---|---|
| Relación con `/habits` | **Absorber** | Un solo lugar donde vive "el hábito" y "el libro". Reutiliza `habits`/`habit_logs`/`books`/`book_notes` sin crear tablas paralelas. |
| Qué es un "Sistema" | **Plantilla instanciable** | Adoptarlo *genera* metas, rutinas y hábitos reales. Un sistema que no produce objetos es un PDF. |
| Alcance de "comprar" | **Wishlist + enlaces** | Todo el valor de decidir la compra, cero PCI, cero datos de tarjeta, cero responsabilidad de pago. |
| Rutinas | **Secuencia sobre un bloque** | El horario sigue en `occupations`, la racha sigue en `habit_logs`. La rutina solo aporta el orden. |
| Metas personales | **Meta + resultados clave** | El progreso se calcula desde fuentes existentes; no se teclea, así no se desactualiza. |
| Integraciones | **Las cuatro, escalonadas** | Se ordenan por costo de integración, no por atractivo. |
| Privacidad | **Privado por `user_id`, sin `workspace_id`** | Extiende BR-012/019/027 al módulo entero. Ningún rol de workspace lo alcanza. |

**Consecuencia aceptada de "absorber `/habits`":** los enlaces existentes a `/habits` se
rompen si no se cuidan. La ruta vieja se conserva como redirección permanente, no se
elimina.

**Consecuencia aceptada de "wishlist sin checkout":** el usuario compra fuera de la app y
vuelve a marcarlo. A cambio, el módulo nunca toca un dato de tarjeta.

## 3. Arquitectura

### 3.1 Navegación

Grupo nuevo **"Personal Development OS"** en `src/components/nav-items.ts`, hermano de
Execution OS y Money OS, con acento `--c-orange` (`--c-purple` es Execution, `--c-green`
es Money, `--c-teal` lo reservó Intelligence OS).

| Ruta | Contenido |
|---|---|
| `/development` | Panel: metas activas, rutina de hoy, sistemas adoptados |
| `/development/goals` | Metas personales y resultados clave |
| `/development/routines` | Rutinas y su ejecución del día |
| `/development/systems` | Catálogo, sistemas propios y adopciones |
| `/development/habits` | Hábitos (movido desde `/habits`) |
| `/development/library` | Biblioteca de lectura (movido desde `/habits`) |
| `/development/wishlist` | Lista de deseos de desarrollo |
| `/development/integrations` | Conexiones externas |

`/habits` pasa a ser un `redirect("/development/habits")` — la ruta desaparece de la
navegación pero no del router. `NAV_ICONS` en `src/components/icons.tsx` gana las claves
nuevas (`development`, `personal-goals`, `routines`, `systems`, `library`, `wishlist`,
`integrations`).

### 3.2 Capas

Cuatro capas, la misma separación que ya usa Execution OS tras el rediseño de tablero
(D-015):

1. **Dominio puro** — `src/lib/domain/development/*.ts`. Sin React, sin Supabase, sin
   `Date.now()` implícito. Toda la aritmética del módulo.
2. **Lectura** — `src/lib/data/development.ts`, envuelto en React `cache()` como
   `src/lib/data/profile.ts`.
3. **Server Actions** — una por ruta, misma convención que `execution/actions.ts`.
4. **Integraciones** — `src/lib/integrations/{openlibrary,readwise,google,strava}.ts`,
   por `fetch`, sin SDKs (D-008/D-022).

### 3.3 Dominio puro

`src/lib/domain/development/`

```ts
// goals.ts
export type KeyResultSource =
  | { kind: "habit";          id: string }   // % de cumplimiento en la ventana
  | { kind: "project";        id: string }   // % de tareas completadas
  | { kind: "book";           id: string }   // páginas leídas
  | { kind: "financial_goal"; id: string }   // current_amount / target
  | { kind: "manual" };                      // número capturado a mano

export interface KeyResultProgress {
  current: number;
  target: number;
  pct: number;          // 0-100, acotado
  stale: boolean;       // la fuente ya no existe
}

export function keyResultProgress(kr: KeyResultLike, sources: SourceSnapshot): KeyResultProgress;
export function goalProgress(krs: KeyResultProgress[]): number;      // promedio simple
export function goalAtRisk(horizonISO: string, pct: number, todayISO: string): boolean;
```

`goalAtRisk` compara **avance esperado vs. avance real**: si transcurrió el 70 % del
horizonte y el progreso va en 30 %, la meta está en riesgo. Es una resta, no un modelo.

```ts
// routines.ts
export function routineDueToday(routine: RoutineLike, todayISO: string): boolean;
export function routineProgress(run: RunLike | null, steps: StepLike[]): { done: number; total: number; remainingMin: number };
export function routineAdherence(runs: RunLike[], fromISO: string, toISO: string, frequency: Frequency): number;
export function routineFitsBlock(steps: StepLike[], block: { start: string; end: string } | null): boolean;

// systems.ts
export const BlueprintSchema: z.ZodType<Blueprint>;
export function instantiate(bp: Blueprint, todayISO: string): InstantiationPlan;  // PURA: describe filas, no las escribe
export function snapshotToBlueprint(goals, routines, habits): Blueprint;

// wishlist.ts
export type Affordability = "Alcanza" | "Ajustado" | "No alcanza";
export function affordability(cost: number, availableBalance: number, budgetRemaining: number): Affordability;

// auto-rules.ts
export function evaluateAutoRule(rule: AutoRuleLike, activity: ExternalActivity): boolean;
```

`instantiate` es el corazón de "Sistemas" y es **pura**: recibe un blueprint y devuelve un
plan de filas a crear. La Server Action toma ese plan y lo escribe. La misma plantilla
produce siempre el mismo plan, lo que la hace trivial de probar.

Todo se prueba con `node --test` en `tests/domain/development/*.test.ts`, igual que
`board.ts` y `datetime.ts`.

### 3.4 Fechas

Sin excepciones: `todayLocal(await getUserTimeZone())` (`src/lib/data/dates.ts`,
`src/lib/data/profile.ts`). El servidor calcula "hoy" **una vez** por request y lo pasa a
los Client Components como prop — la lección de D-016/D-018, que costó un bug de hábitos
marcados en la fecha equivocada.

## 4. Modelo de datos

Todas las tablas nuevas son privadas por `user_id`, **sin `workspace_id`** y con política
`user_id = auth.uid()` — la misma regla que `0004_planning_time_habits.sql`
(BR-012/019/027). Cada migración incluye su bloque `GRANT` explícito (F9).

Numeración: `0024`+, asumiendo que Intelligence OS reclama `0023` para su `fingerprint`.
Si este módulo aterriza primero, se renumera al aplicar.

### 4.1 Metas (`0024`)

```sql
create table public.personal_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  description text not null default '',
  area text not null default 'Personal'
    check (area in ('Salud','Carrera','Relaciones','Finanzas','Aprendizaje','Espiritual','Personal')),
  horizon date,
  status text not null default 'Activa'
    check (status in ('Activa','Pausada','Lograda','Abandonada')),
  achieved_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.key_results (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references public.personal_goals(id) on delete cascade,
  title text not null,
  source_kind text not null default 'manual'
    check (source_kind in ('habit','project','book','financial_goal','manual')),
  source_id uuid,
  target numeric(20,6) not null default 0,
  manual_current numeric(20,6) not null default 0,
  unit text not null default '',
  position integer not null default 0,
  check ((source_kind = 'manual') = (source_id is null))
);
```

`area` es una columna con `check`, no una tabla — mismo criterio que `habits.category`.
Una tabla de áreas de vida sería una tabla de siete filas fijas con su propia RLS.

`source_id` es un uuid **sin FK**, porque apunta a cuatro tablas distintas. La integridad
se resuelve al leer: si la fuente ya no existe, `keyResultProgress` devuelve
`stale: true` y la UI lo dice, en vez de mostrar 0 % como si fuera un dato real.

**Restricción de privacidad:** un resultado clave con `source_kind = 'project'` solo puede
apuntar a un proyecto **personal** (`projects.workspace_id is null`). Se valida en la
Server Action consultando `projects.workspace_id` en el servidor, nunca confiando en el
parámetro del cliente — el mismo patrón que usa Intelligence OS para resolver el scope de
un análisis. Sin esta guarda, el avance de un equipo se filtraría a un módulo declarado
privado.

### 4.2 Rutinas (`0024`)

```sql
create table public.routines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  frequency text not null default 'Diario'
    check (frequency in ('Diario','Semanal','Entre semana','Fin de semana')),
  occupation_id uuid references public.occupations(id) on delete set null,
  active boolean not null default true,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.routine_steps (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  position integer not null default 0,
  title text not null,
  duration_min integer not null default 5 check (duration_min > 0),
  habit_id uuid references public.habits(id) on delete set null
);

create table public.routine_runs (
  id uuid primary key default gen_random_uuid(),
  routine_id uuid not null references public.routines(id) on delete cascade,
  local_date date not null,
  completed_step_ids uuid[] not null default '{}',
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (routine_id, local_date)
);
```

`frequency` reusa **los mismos cuatro valores** que `habits.frequency`. Una rutina y un
hábito responden "¿toca hoy?" con la misma función.

`occupation_id` y `habit_id` usan `on delete set null`, el patrón que `habits.occupation_id`
ya estableció para BR-026: borrar el bloque horario no borra la rutina, y borrar el hábito
no borra el paso.

`routine_runs` es único por `(routine_id, local_date)`, igual que `habit_logs` lo es por
`(habit_id, log_date)`. Dos clics simultáneos no crean dos ejecuciones del mismo día.

**El puente que evita la duplicación:** completar un paso con `habit_id` no nulo hace
`upsert` en `habit_logs` con `on conflict (habit_id, log_date) do nothing`. La racha
sigue viviendo en un solo lugar y `habitStreak` (`src/lib/domain/habits.ts`) no cambia ni
una línea. El puente es idempotente por construcción: marcar el paso dos veces produce
una sola fila.

### 4.3 Sistemas (`0025`)

```sql
create table public.systems (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text not null default '',
  origin text not null default 'propio' check (origin in ('propio','catalogo')),
  catalog_key text,
  blueprint jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create table public.system_adoptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  system_id uuid not null references public.systems(id) on delete cascade,
  status text not null default 'Activo' check (status in ('Activo','Pausado','Terminado')),
  created_goal_ids uuid[] not null default '{}',
  created_routine_ids uuid[] not null default '{}',
  created_habit_ids uuid[] not null default '{}',
  adopted_at timestamptz not null default now(),
  ended_at timestamptz
);
```

**El catálogo semilla vive como dato en código**, en
`src/lib/domain/development/system-catalog.ts`, no como filas en la base. Adoptar un
sistema del catálogo copia su blueprint a una fila `systems` propiedad del usuario. Esto
evita por completo tener que abrir una excepción de lectura pública en RLS para una tabla
de "plantillas globales" — el módulo entero mantiene una sola regla:
`user_id = auth.uid()`.

`blueprint` es `jsonb` validado con zod al escribir y al leer. Es el único jsonb del
módulo, y se justifica porque su forma es un árbol (metas → resultados clave; rutinas →
pasos) que normalizado exigiría cuatro tablas espejo de las que ya existen.

`created_*_ids` es lo que hace reversible una adopción: se puede ver exactamente qué
generó un sistema y deshacerlo.

### 4.4 Wishlist (`0026`)

```sql
create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  kind text not null default 'Libro'
    check (kind in ('Libro','Curso','Equipo','Suscripción','Otro')),
  url text not null default '',
  estimated_cost numeric(20,6) not null default 0,
  currency text not null default 'MXN',
  priority text not null default 'Medium' check (priority in ('High','Medium','Low')),
  status text not null default 'Deseado'
    check (status in ('Deseado','Aprobado','Comprado','Descartado')),
  goal_id uuid references public.personal_goals(id) on delete set null,
  savings_goal_id uuid references public.savings_goals(id) on delete set null,
  journal_entry_id uuid references public.journal_entries(id) on delete set null,
  purchased_at timestamptz,
  created_at timestamptz not null default now()
);
```

`priority` usa los mismos `High/Medium/Low` que `tasks`, `financial_goals` y
`savings_goals`.

**Marcar "Comprado" no escribe un número suelto:** invoca `postTransaction`
(`src/app/(app)/money/actions.ts:59`) con la sesión del usuario, guarda el
`journal_entry_id` resultante y, si `kind = 'Libro'`, crea la fila en `books`. La compra
queda ligada al asiento contable real, así que el gasto aparece en `/money` sin captura
doble.

**El semáforo de asequibilidad no inventa aritmética:** `affordability()` recibe el saldo
calculado por `accountBalance()` (`src/lib/domain/money.ts`, la misma función que usan
`/money`, `/debt` y `/money/budget`) y el remanente del presupuesto. Consistente con
D-010.

### 4.5 Integraciones (`0027`)

```sql
create table public.integrations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null
    check (provider in ('google_calendar','strava','fitbit','readwise')),
  status text not null default 'Conectado'
    check (status in ('Conectado','Expirado','Error','Desconectado')),
  account_label text not null default '',
  secret_id uuid,                              -- referencia a Supabase Vault
  last_sync_at timestamptz,
  last_sync_status text not null default '',
  connected_at timestamptz not null default now(),
  unique (user_id, provider)
);

create table public.habit_auto_rules (
  id uuid primary key default gen_random_uuid(),
  habit_id uuid not null references public.habits(id) on delete cascade,
  provider text not null check (provider in ('strava','fitbit')),
  metric text not null,                        -- 'distance_km', 'steps', 'sleep_hours'
  comparator text not null default 'gte' check (comparator in ('gte','lte')),
  threshold numeric(20,6) not null default 0,
  unique (habit_id, provider, metric)
);
```

**Los tokens no están en esta tabla.** `secret_id` referencia un secreto de Supabase
Vault; el refresh token nunca es legible por el rol `authenticated`. La migración `0027`
debe habilitar la extensión (`create extension if not exists supabase_vault with schema
vault`) — hoy ninguna migración del proyecto la usa. Escribir y leer secretos ocurre solo
desde el cliente admin (`src/lib/supabase/admin.ts`, `requireServiceRoleKey()`), que ya
existe y hasta ahora no tenía consumidor. Esto es
deliberadamente distinto del criterio de D-007 (`audit_log` vive en `public` porque el
usuario debe poder consultar su propia auditoría): un token de terceros es justo lo
contrario — el usuario no gana nada leyéndolo y una fuga es total. `integrations` expone
estado y etiqueta de cuenta, nunca credenciales.

`book_notes` gana dos columnas para importación idempotente:

```sql
alter table public.book_notes
  add column source text not null default 'manual' check (source in ('manual','readwise','kindle')),
  add column external_id text;
create unique index on public.book_notes (book_id, source, external_id) where external_id is not null;
```

Sin el índice único, cada sincronización de Readwise duplicaría todos los subrayados.

## 5. Integraciones externas

Ordenadas por relación costo/beneficio, que es también su orden de construcción.

### 5.1 Metadatos de libros — Open Library / Google Books

Sin OAuth, sin credenciales, sin tabla. Route Handler
`/api/development/book-lookup?isbn=…|q=…` que hace `fetch` desde el servidor, valida la
respuesta con zod y devuelve `{ title, author, totalPages, coverUrl }` para prellenar
`BookForm`. Se guarda la URL de la portada, no el archivo — sin Storage.

**Requiere ampliar la CSP** (`middleware.ts`, D-002): `img-src` debe admitir el host de
portadas. Es la única integración cuyo cambio de CSP afecta al navegador; las demás son
`fetch` de servidor a servidor y no tocan `connect-src`.

### 5.2 Highlights de lectura — Readwise

API key que el usuario pega, guardada en Vault. Sincronización bajo demanda: trae los
highlights, empareja el libro por título/ISBN y escribe en `book_notes` con
`source = 'readwise'` y `external_id`. Lo que no empareja va a una bandeja para asignar a
mano, en vez de crear libros fantasma.

### 5.3 Calendario — Google Calendar

OAuth con Route Handlers `/api/integrations/google/start` y `/callback`, scope
`calendar.events`, refresh token en Vault. **Un solo sentido en v1**: empuja los bloques
de rutina al calendario real y lee eventos para detectar conflictos contra `occupations`.
La sincronización bidireccional queda fuera de alcance.

El callback debe ser público en `middleware.ts` —el usuario vuelve de Google antes de que
la cookie de sesión se resuelva—, misma excepción que `/invite/` (D-023). El `state` de
OAuth se valida contra un valor de un solo uso para evitar CSRF.

**Bloqueante externo, no técnico:** publicar la app requiere verificación de Google, con
semanas de trámite. Por eso va después de las dos anteriores, no porque sea más difícil de
programar.

### 5.4 Salud y actividad — Strava / Fitbit

OAuth igual que Google. Sincronización bajo demanda en v1 (sin webhooks): trae las
actividades del día, evalúa las `habit_auto_rules` con `evaluateAutoRule` —función pura—
y cierra los hábitos que cumplen. Escribe en `habit_logs` por el mismo camino idempotente
que las rutinas.

### 5.5 Regla común: fallar suave

Ninguna integración puede tumbar una página. El contrato es el de `sendEmail()`
(`src/lib/email/send.ts`, D-021): **nunca lanza**, devuelve `{ ok, reason }`. Si el
proveedor está caído, el token expiró o falta el secreto, la UI lo dice explícitamente y
el resto del módulo sigue funcionando. Cada secreto se valida de forma perezosa y por
separado —`requireGoogleOAuthCredentials()`, `requireReadwiseToken()`,
`requireStravaCredentials()`— siguiendo F11: ninguna acción exige un secreto que no usa.

Todas las llamadas van por `fetch`, sin SDKs, para no tocar el set mínimo de dependencias
de runtime (D-008, precedente D-022).

## 6. Conexión con Intelligence OS

El motor de recomendaciones ya diseñado gana un dominio más. Nada de su arquitectura
cambia:

- **Extractor** `src/lib/domain/insights/facts/development.ts`, función pura que produce
  `Fact[]`: meta en riesgo (horizonte cerca, progreso corto), adherencia de rutina cayendo
  respecto al mes previo, sistema adoptado sin ejecución en N días, resultado clave
  `stale`, ítem de wishlist aprobado que no cabe en el presupuesto.
- **Allowlist de scopes** (§4.1 del spec de Intelligence OS): `development` es un dominio
  privado. Ve solo lo suyo en su propio scope, y entra en `global`. Un scope de workspace
  nunca lo incluye.
- **Memoria:** `memory_items.scope` ya admite `goal` y `habit`. No requiere migración.
- **Opt-in por dominio** en `/settings`: `development` se suma a la lista existente.

El cruce que justifica el módulo dentro de un Life OS es el que ninguna app suelta puede
hacer: *"tu meta de leer 24 libros va 40 % con el año al 65 %, y el libro que falta está
en tu wishlist por encima de lo que queda del presupuesto de este mes."* Tres dominios,
un solo dueño de los datos.

## 7. Privacidad

El módulo entero hereda la regla de `0004_planning_time_habits.sql`: **ninguna tabla tiene
`workspace_id` y ninguna política referencia `has_project_access`**. Ningún rol de
workspace alcanza una meta personal, una rutina, un libro ni un ítem de wishlist.

Tres puntos donde la privacidad podría filtrarse y su defensa concreta:

1. **Resultado clave sobre un proyecto compartido.** Se valida en el servidor que
   `projects.workspace_id is null` (§4.1). Sin la guarda, el avance de un equipo entraría
   a un módulo privado.
2. **Tokens de terceros.** En Vault, no en `public` (§4.5).
3. **Envío de datos al modelo.** Lo gobierna `context.ts` de Intelligence OS, que ya es el
   único punto donde se aplica el filtro; `development` entra ahí como dominio privado con
   opt-in propio.

Una fila por sincronización en `audit_log` con `action: 'integration.sync'` y
`meta: { provider, imported, skipped }`. La tabla ya existe (`0009_audit.sql`) y su RLS
por `user_id` es exactamente lo que se necesita.

## 8. Orden de construcción

1. **Núcleo, sin nada externo.** Mover `/habits` a `/development/{habits,library}` con
   redirección, metas + resultados clave, rutinas + ejecución que cierra `habit_logs`,
   panel `/development`. Migración `0024`. *Esta fase ya justifica el módulo por sí sola:
   responde la única pregunta que importa —¿el usuario vuelve a abrir `/development` al día
   siguiente?— sin depender de ningún tercero.*
2. **Sistemas.** Catálogo semilla en código, adopción e instanciación, guardar
   configuración actual como plantilla, adherencia. Migración `0025`.
3. **Wishlist.** Semáforo de asequibilidad, compra que crea el asiento en Money OS.
   Migración `0026`.
4. **Integraciones**, en el orden de §5: Open Library → Readwise → Google Calendar →
   Strava/Fitbit. Migración `0027`, Vault y los cambios de CSP.
5. **Enganche a Intelligence OS.** Extractor `development` y su entrada en el allowlist.

Cada fase es una rebanada vertical usable. Ninguna deja a la anterior a medias.

## 9. Verificación

- `node --test` por archivo de `src/lib/domain/development/`: entrada conocida → salida
  esperada, como `tests/domain/board.test.ts`.
- Test de que completar un paso de rutina ligado a un hábito produce **exactamente una**
  fila en `habit_logs`, y que `habitStreak` da el mismo resultado que si se hubiera marcado
  desde `/development/habits`.
- Test de que `instantiate` es pura: el mismo blueprint y la misma fecha producen el mismo
  plan de filas.
- Test de que un resultado clave cuya fuente fue borrada devuelve `stale: true` en vez de
  0 %.
- Test de que la importación de Readwise dos veces seguidas no duplica notas.
- pgTAP `supabase/tests/0007_rls_development.sql`: un usuario no ve las filas de otro, y
  ningún rol de workspace alcanza ninguna tabla del módulo.
- pgTAP de que `integrations.secret_id` no permite leer el token: el rol `authenticated` no
  tiene acceso al esquema de Vault.
- Todo se integra al `pnpm verify` existente.

## 10. Fuera de alcance

- **Checkout y pagos reales** dentro de la app. Decidido explícitamente: el costo (PCI,
  tokenización, reembolsos, responsabilidad legal) excede lo que asume hoy el resto del
  proyecto.
- **Precio automático por API de comercio.** La wishlist guarda costo estimado y enlace;
  no consulta precios. Evolución posible, no v1.
- **Marketplace público de sistemas** entre usuarios. Todo el módulo es privado por
  `user_id`; compartir plantillas exigiría un modelo de permisos que no existe.
- **Metas anidadas** (anual → trimestral). El horizonte cubre el caso común; la jerarquía
  se agrega cuando el uso la pida.
- **Sincronización bidireccional de calendario.** v1 empuja y lee conflictos.
- **Webhooks de Strava/Fitbit.** Sincronización bajo demanda primero.
- **Coaching conversacional.** El chat ya se descartó en el spec de Intelligence OS.
