-- =============================================================================
-- 0054 · EXECUTION GRAPH — todo LifeOS como un grafo
-- =============================================================================
--
-- POR QUÉ ESTA MIGRACIÓN
-- Las relaciones ya existían. `tasks.deps`, `tasks.parent_task_id`,
-- `habits.routine_id`, `key_results.source_id`, `notes.notebook_id`: la
-- estructura de dependencias del sistema vive en la base desde 0003, repartida
-- entre sesenta tablas y sin una sola pantalla que la muestre. «Si esta tarea
-- se retrasa, ¿qué se rompe?» era incontestable sin abrir cinco vistas y
-- reconstruirlo de cabeza.
--
-- LO QUE ESTA MIGRACIÓN NO HACE: no mueve ni un dato de sitio. Las tablas de
-- dominio siguen siendo la fuente de verdad; `graph_nodes` es una PROYECCIÓN
-- que los triggers mantienen al día. Si mañana se borra el módulo entero, se
-- borran estas tablas y no falta nada en ninguna otra pantalla.
--
-- LA FRONTERA DE PRIVACIDAD, Y POR QUÉ ES EL CORAZÓN DE ESTE ARCHIVO
-- `graph_nodes` es la PRIMERA tabla del sistema donde una fila que describe un
-- presupuesto y una fila que describe un proyecto compartido conviven bajo la
-- misma política. docs/SECURITY.md lista exactamente eso como amenaza nº2, y su
-- control declarado —«ninguna tabla de Money OS, Hogar, Time o Habits tiene
-- workspace_id»— deja de aplicarse aquí por primera vez.
--
-- La respuesta es una invariante que se aplica en tres capas, y ninguna sobra:
--   1. Un CHECK de forma que hace imposible una fila anfibia.
--   2. DOS políticas SELECT separadas por `scope`, no un `or` gigante: un fallo
--      en la de espacios no puede alcanzar una fila privada, porque esa política
--      ni la mira.
--   3. Un trigger en `graph_edges` que RECHAZA una arista cuyos extremos no
--      compartan dueño. No se puede ni insertar.
--
-- La consecuencia, dicha sin adornos: un nodo privado (una meta, un hábito, una
-- inversión, una decisión de la bitácora) NUNCA se conecta con un nodo que vive
-- en un espacio de trabajo, ni siquiera en tu espacio personal. El Personal
-- Graph y el Money Graph son grafos separados del Project Graph. Es lo que
-- BR-012 significa cuando se aplica de verdad.
-- =============================================================================


-- =============================================================================
-- 1) LOS CATÁLOGOS
--
-- Tablas y no CHECKs por dos razones. La primera es que cada tipo necesita
-- metadatos que la interfaz consume —color, icono, etiqueta en español— y un
-- CHECK no los lleva. La segunda es `custom`: el brief pide nodos definidos por
-- el usuario, y un catálogo crece con un INSERT mientras que un CHECK crece con
-- una migración.
--
-- `reversed` es la columna que hace funcionar el análisis de impacto y merece
-- explicarse: «A depends_on B» apunta de A a B, pero el impacto viaja al revés
-- —si B cambia, el que se rompe es A—. «A blocks B» viaja en el sentido de la
-- flecha. Sin esta columna, el grafo de impacto contestaría al revés la mitad
-- de las veces.
-- =============================================================================

create table if not exists public.graph_node_types (
  node_type text primary key,
  label text not null,
  color text not null default 'var(--muted)',
  -- Si sale de una tabla de dominio (y por tanto lo mantiene un trigger) o si
  -- nace a mano en el lienzo. Los `custom`, `risk` y `meeting` son nativos:
  -- no hay tabla detrás y no la va a haber.
  is_projected boolean not null default false,
  position smallint not null default 0
);

create table if not exists public.graph_rel_types (
  rel_type text primary key,
  label text not null,
  -- Si cuenta para el camino crítico y para la detección de ciclos. Solo las
  -- cuatro que expresan «esto tiene que pasar antes que aquello».
  is_dependency boolean not null default false,
  -- Si el impacto viaja en contra de la flecha (ver arriba).
  reversed boolean not null default false,
  -- Si la dirección no significa nada («relacionado con», «duplica»).
  is_symmetric boolean not null default false,
  position smallint not null default 0
);

insert into public.graph_node_types (node_type, label, color, is_projected, position) values
  ('workspace',       'Espacio',          'var(--accent)',    true,  10),
  ('project',         'Proyecto',         'var(--c-purple)',  true,  20),
  ('task',            'Tarea',            'var(--c-purple)',  true,  30),
  ('goal',            'Meta',             'var(--c-orange)',  true,  40),
  ('habit',           'Hábito',           'var(--c-orange)',  true,  50),
  ('routine',         'Rutina',           'var(--c-orange)',  true,  60),
  ('book',            'Libro',            'var(--c-orange)',  true,  70),
  ('note',            'Nota',             'var(--c-blue)',    true,  80),
  ('document',        'Documento',        'var(--c-blue)',    true,  90),
  ('decision',        'Decisión',         'var(--c-blue)',    true, 100),
  ('person',          'Persona',          'var(--c-pink)',    true, 110),
  ('investment',      'Inversión',        'var(--c-green)',   true, 120),
  ('budget',          'Presupuesto',      'var(--c-green)',   true, 130),
  ('asset',           'Activo',           'var(--c-green)',   true, 140),
  ('ai_conversation', 'Conversación IA',  'var(--c-teal)',    false,150),
  ('meeting',         'Reunión',          'var(--c-pink)',    false,160),
  ('risk',            'Riesgo',           'var(--danger)',    false,170),
  ('custom',          'Nodo propio',      'var(--muted)',     false,180)
on conflict (node_type) do nothing;

insert into public.graph_rel_types (rel_type, label, is_dependency, reversed, is_symmetric, position) values
  ('depends_on',      'depende de',        true,  true,  false, 10),
  ('blocks',          'bloquea a',         true,  false, false, 20),
  ('leads_to',        'lleva a',           true,  false, false, 30),
  ('caused_by',       'causado por',       true,  true,  false, 40),
  ('child_of',        'es parte de',       false, true,  false, 50),
  ('parent_of',       'contiene a',        false, false, false, 60),
  ('belongs_to',      'pertenece a',       false, true,  false, 70),
  ('supports',        'apoya a',           false, false, false, 80),
  ('references',      'referencia a',      false, false, false, 90),
  ('created_from',    'salió de',          false, true,  false,100),
  ('generated_by_ai', 'generado por IA',   false, true,  false,110),
  ('assigned_to',     'asignado a',        false, false, false,120),
  ('related_to',      'relacionado con',   false, false, true, 130),
  ('duplicates',      'duplica a',         false, false, true, 140)
on conflict (rel_type) do nothing;

alter table public.graph_node_types enable row level security;
alter table public.graph_rel_types  enable row level security;

-- Catálogo global de solo lectura, igual que `foods` en 0047: la escritura se
-- cierra con GRANT, no con RLS, porque no hay nada que filtrar por fila.
create policy graph_node_types_lectura on public.graph_node_types
  for select using (auth.role() = 'authenticated');
create policy graph_rel_types_lectura on public.graph_rel_types
  for select using (auth.role() = 'authenticated');


-- =============================================================================
-- 2) LOS NODOS
--
-- `entity_table` + `entity_id` es la proyección: qué fila del dominio describe
-- este nodo. Los nodos nativos (custom, risk, meeting) llevan ambos en null.
--
-- `project_id` está desnormalizado y no es un capricho de rendimiento: sin él
-- la política no puede respetar al rol Guest, que desde 0031 no se resuelve por
-- membresía sino por `project_shares`. Un Guest es miembro activo del espacio,
-- así que `is_workspace_member()` le dice que sí a todo; lo único que le frena
-- es `has_project_access()`, y eso necesita saber de qué proyecto cuelga cada
-- nodo.
--
-- Las POSICIONES NO ESTÁN AQUÍ, y es deliberado: ver `graph_layouts` abajo.
-- =============================================================================

create table if not exists public.graph_nodes (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('workspace', 'user')),
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  node_type text not null references public.graph_node_types(node_type),
  entity_table text,
  entity_id uuid,
  label text not null default '(sin nombre)',
  -- Lista BLANCA de campos por tipo, nunca la fila entera menos exclusiones:
  -- una lista negra falla en abierto, y el día que alguien añada una columna
  -- con el número de cuenta del broker aparecería aquí sin que nadie lo pida.
  metadata jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- La invariante de BR-012, primera capa. Sin este CHECK existe la «fila
  -- anfibia»: un nodo privado con `project_id` puesto al que la política de
  -- espacios podría engancharse.
  constraint graph_nodes_tenant_shape check (
    (scope = 'user'
       and user_id is not null
       and workspace_id is null
       and project_id is null)
    or
    (scope = 'workspace'
       and workspace_id is not null
       and user_id is null)
  ),
  -- O es proyectado (las dos columnas) o es nativo (ninguna). A medias no.
  constraint graph_nodes_entity_shape check (
    (entity_table is null and entity_id is null)
    or (entity_table is not null and entity_id is not null)
  )
);

comment on table public.graph_nodes is
  'Proyección de las entidades de LifeOS como nodos de grafo. La fuente de verdad sigue siendo la tabla de dominio; los triggers de 0054 mantienen esto al día. Ver el encabezado de la migración para la invariante de privacidad (BR-012).';
comment on column public.graph_nodes.project_id is
  'Desnormalizado desde la entidad. Existe para que la RLS pueda llamar a has_project_access() y respetar al rol Guest (0031). Un nodo de scope user lo lleva SIEMPRE en null (ver graph_nodes_tenant_shape).';

-- `entity_id` viene siempre de gen_random_uuid(), así que ya es único en toda
-- la base sin necesidad de meter `entity_table` en la clave: 16 bytes por
-- entrada en vez de 16 + el texto del nombre de la tabla.
create unique index if not exists idx_graph_nodes_entity
  on public.graph_nodes (entity_id) where entity_id is not null;

-- El índice más rentable del módulo. Cada salto del recorrido hace
-- `join graph_nodes on n.id = <extremo>` y necesita las tres columnas de tenant
-- para decidir si ese nodo se ve. Con el INCLUDE eso es un Index Only Scan y no
-- se toca el heap; sin él, un acceso aleatorio al heap por nodo visitado.
create index if not exists idx_graph_nodes_tenant_cover
  on public.graph_nodes (id)
  include (workspace_id, user_id, project_id, scope, node_type)
  where archived_at is null;

create index if not exists idx_graph_nodes_project
  on public.graph_nodes (project_id) where project_id is not null;
create index if not exists idx_graph_nodes_ws
  on public.graph_nodes (workspace_id, node_type)
  where workspace_id is not null and archived_at is null;
create index if not exists idx_graph_nodes_user
  on public.graph_nodes (user_id, node_type)
  where user_id is not null and archived_at is null;

-- El index-only scan de arriba depende del visibility map, y esta tabla se
-- reescribe cada vez que alguien renombra una tarea. Con el scale_factor por
-- defecto (0.2) el mapa se ensucia y los Heap Fetches suben al 100%, que es
-- exactamente como no tener el índice covering.
alter table public.graph_nodes set (
  fillfactor = 80,
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01
);


-- =============================================================================
-- 3) BÚSQUEDA: TRIGRAMAS, NO UN QUINTO TSVECTOR
--
-- La tentación era copiar 0039 y poner `search tsvector generated always`. Tres
-- razones para no hacerlo:
--
--   1. Sería la QUINTA copia de lo mismo. `projects.search`, `tasks.search`,
--      `notes.search`, `comments.search` y `workspace_activity.search` ya
--      indexan estos mismos títulos.
--   2. Cada renombrado de una tarea pasaría a ser una inserción en un índice
--      GIN, lo que rompe la actualización HOT en la tabla que más churn tiene
--      del módulo.
--   3. Lo que un buscador de lienzo necesita es subcadena y tolerancia a
--      erratas sobre etiquetas cortas —escribir «mudan» y que salga
--      «Mudanza»—, no lematización española. `to_tsvector` no hace prefijos.
--
-- Aviso que va más allá de este archivo: el operador `@@` (`ts_match_vq`) NO es
-- leakproof, así que en una tabla con RLS Postgres no puede usarlo como
-- condición de índice por delante de los quals de seguridad — evalúa la
-- política fila a fila ANTES de mirar el GIN. Eso ya le pasa hoy a
-- `search_workspace` (0039) y no se nota porque las tablas son pequeñas.
-- =============================================================================

-- Primera extensión que declara este repo: la 0001 original se perdió y desde
-- entonces no había dónde ponerlas. En Supabase las extensiones viven en el
-- esquema `extensions`, y por eso la clase de operadores va cualificada abajo:
-- sin cualificar, el índice no se encuentra desde una función con
-- `search_path = public`.
create extension if not exists pg_trgm with schema extensions;

create index if not exists idx_graph_nodes_label_trgm
  on public.graph_nodes using gin (label extensions.gin_trgm_ops);


-- =============================================================================
-- 4) LAS POSICIONES, FUERA DEL NODO
--
-- POR QUÉ NO SON DOS COLUMNAS DE graph_nodes
-- Arrastrar un nodo por el lienzo escribiría en la misma fila que mantiene el
-- trigger de proyección y que indexa el buscador. Un arrastre son decenas de
-- escrituras por segundo compitiendo con el trigger de `tasks`, cada una
-- invalidando la entrada del índice de trigramas de una etiqueta que no ha
-- cambiado.
--
-- Y hay una razón de producto además de la técnica: la posición NO es una
-- propiedad del nodo, es una propiedad de cómo TÚ miras el grafo. Dos personas
-- en el mismo espacio quieren colocar las mismas tareas de forma distinta, y la
-- misma tarea ocupa sitios distintos en el Project Graph y en el Impact Graph.
-- Con las coordenadas dentro del nodo, el lienzo de dos personas se pelea.
--
-- Ausencia de fila = «colócalo el auto-layout». No hay valor por defecto.
-- =============================================================================

create table if not exists public.graph_layouts (
  node_id uuid not null references public.graph_nodes(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  view text not null default 'default',
  x double precision not null,
  y double precision not null,
  updated_at timestamptz not null default now(),
  primary key (node_id, user_id, view)
) with (fillfactor = 70);

comment on table public.graph_layouts is
  'Dónde ha colocado cada persona cada nodo, por vista. Ausencia de fila significa «lo coloca el auto-layout». Vive fuera de graph_nodes a propósito: ver 0054.';


-- =============================================================================
-- 5) LAS ARISTAS
--
-- POR QUÉ NO HAY COLUMNA `id`
-- Esta es la tabla que va a crecer a millones de filas. Un `id uuid` serían 16
-- bytes por fila MÁS un índice btree completamente aleatorio —los uuid v4 no
-- tienen localidad de inserción, así que cada INSERT ensucia una página
-- distinta— del orden de 150 MB a tres millones de aristas. Y no haría falta
-- para nada: la unicidad ya la impone el trío (origen, relación, destino), que
-- es exactamente lo que una arista ES. Ese trío pasa a ser la clave primaria y
-- el índice deja de ser un coste para ser la estructura de acceso.
--
-- POR QUÉ EL ORDEN ES (source_id, rel_type, target_id)
-- Con `rel_type` en segunda posición, «las dependencias que salen de X» es UN
-- RANGO del índice. Con `target_id` en medio sería el rango entero de X
-- filtrando después. Es la diferencia entre leer lo que necesitas y leer todo
-- lo que cuelga del nodo.
--
-- `weight`, `confidence` y `metadata` son nullable SIN default: un jsonb vacío
-- por defecto es una cabecera varlena en cada una de esos millones de filas
-- para guardar «nada».
--
-- No hay columna `scope`: sería redundante con el par (workspace_id, user_id) y
-- una segunda fuente de verdad que puede desincronizarse de la primera.
-- =============================================================================

create table if not exists public.graph_edges (
  source_id uuid not null references public.graph_nodes(id) on delete cascade,
  rel_type text not null references public.graph_rel_types(rel_type),
  target_id uuid not null references public.graph_nodes(id) on delete cascade,

  -- Las tres las rellena el trigger `graph_edge_tenant`, NUNCA el cliente.
  workspace_id uuid references public.workspaces(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,

  weight real,
  -- 'system' son las aristas que se derivan del dominio y mantienen los
  -- triggers (tasks.deps, parent_task_id, routine_id…): el usuario no las
  -- dibuja y no las borra, aparecen y desaparecen con el dato que las causa.
  -- 'ai' NUNCA se inserta directamente: pasa por graph_suggestions y por el
  -- botón de aceptar, igual que las propuestas del coach (0053).
  origin text not null default 'user' check (origin in ('user', 'system', 'ai')),
  confidence real check (confidence is null or (confidence >= 0 and confidence <= 1)),
  metadata jsonb,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),

  constraint graph_edges_pkey primary key (source_id, rel_type, target_id),
  -- Un nodo no depende de sí mismo. El ciclo de longitud 1 es el único que se
  -- puede descartar sin recorrer nada.
  constraint graph_edges_no_bucle check (source_id <> target_id)
);

comment on table public.graph_edges is
  'Las relaciones del grafo. PK compuesta (source, rel, target) en vez de un uuid: ver 0054. Sus columnas de tenant las escribe el trigger graph_edge_tenant, que además rechaza las aristas que cruzarían la frontera de privacidad (BR-012).';

-- Hacia adelante lo cubre la propia PK. Hacia atrás hace falta el simétrico:
-- el recorrido «qué depende de esto» camina en contra de las flechas.
create index if not exists idx_graph_edges_reverse
  on public.graph_edges (target_id, rel_type, source_id) include (weight);

create index if not exists idx_graph_edges_project
  on public.graph_edges (project_id) where project_id is not null;

alter table public.graph_edges set (autovacuum_vacuum_scale_factor = 0.05);


-- =============================================================================
-- 6) RLS
--
-- DOS POLÍTICAS DE SELECT, NO UNA CON `or`.
-- Postgres combina varias políticas permisivas con OR, así que el resultado que
-- se ve es idéntico. La diferencia está en el modo de fallo: con dos políticas,
-- un error en la de espacios NO PUEDE alcanzar una fila privada, porque esa
-- política ni siquiera la mira —su primera condición es `scope = 'workspace'`—.
-- Con un solo `or` de seis líneas, un paréntesis mal puesto expone los
-- presupuestos de todo el mundo. Esta tabla mezcla Money OS con proyectos
-- compartidos; el modo de fallo importa más que la elegancia.
--
-- `(select auth.uid())` Y NO `auth.uid()` A SECAS.
-- Desnudo, Postgres lo evalúa una vez POR FILA. Envuelto en un subselect se
-- convierte en un InitPlan que se evalúa una sola vez para toda la consulta.
-- A cien mil nodos son entre cinco y diez veces. Ninguna política del repo lo
-- hace todavía; se estrena en la tabla que lo necesita.
-- =============================================================================

alter table public.graph_nodes   enable row level security;
alter table public.graph_edges   enable row level security;
alter table public.graph_layouts enable row level security;

create policy graph_nodes_select_privado on public.graph_nodes
  for select using (
    scope = 'user' and user_id = (select auth.uid())
  );

create policy graph_nodes_select_espacio on public.graph_nodes
  for select using (
    scope = 'workspace'
    and workspace_id is not null
    and public.is_workspace_member(workspace_id)
    and (project_id is null or public.has_project_access(project_id))
  );

-- ESCRITURA. Los nodos proyectados no los toca nadie a mano: los escriben los
-- triggers, que son `security definer` y por tanto no pasan por estas políticas.
-- Lo único que `authenticated` puede crear es un nodo NATIVO —los `custom`,
-- `risk` y `meeting` que se dibujan en el lienzo—, y por eso todas las
-- políticas de escritura exigen `entity_id is null`. Sin esa condición, alguien
-- podría insertar a mano un nodo que dice describir una tarea ajena.
create policy graph_nodes_insert_nativo on public.graph_nodes
  for insert with check (
    entity_id is null
    and (
      (scope = 'user' and user_id = (select auth.uid()))
      or (scope = 'workspace' and public.is_workspace_member(workspace_id)
          and (project_id is null or public.can_edit_project(project_id)))
    )
  );

create policy graph_nodes_update_nativo on public.graph_nodes
  for update using (
    entity_id is null
    and (
      (scope = 'user' and user_id = (select auth.uid()))
      or (scope = 'workspace' and public.is_workspace_member(workspace_id)
          and (project_id is null or public.can_edit_project(project_id)))
    )
  ) with check (
    entity_id is null
    and (
      (scope = 'user' and user_id = (select auth.uid()))
      or (scope = 'workspace' and public.is_workspace_member(workspace_id)
          and (project_id is null or public.can_edit_project(project_id)))
    )
  );

create policy graph_nodes_delete_nativo on public.graph_nodes
  for delete using (
    entity_id is null
    and (
      (scope = 'user' and user_id = (select auth.uid()))
      or (scope = 'workspace' and public.is_workspace_member(workspace_id)
          and (project_id is null or public.can_edit_project(project_id)))
    )
  );

-- ARISTAS. La visibilidad se define por los DOS extremos y no por las columnas
-- desnormalizadas de la propia arista. Es más caro, y da igual: todas las
-- lecturas de verdad pasan por las RPC de recorrido; estas políticas son la red
-- de debajo, y una red tiene que ser correcta antes que rápida. La RLS de
-- graph_nodes se aplica también dentro de estos EXISTS, así que «veo la arista»
-- equivale exactamente a «veo los dos nodos».
create policy graph_edges_select on public.graph_edges
  for select using (
    exists (select 1 from public.graph_nodes n where n.id = source_id)
    and exists (select 1 from public.graph_nodes n where n.id = target_id)
  );

-- Solo aristas dibujadas por una persona. Las 'system' las pone un trigger
-- (security definer, no pasa por aquí) y las 'ai' pasan por su cola de
-- propuestas antes de existir.
create policy graph_edges_insert on public.graph_edges
  for insert with check (
    origin = 'user'
    and created_by = (select auth.uid())
    and exists (select 1 from public.graph_nodes n where n.id = source_id)
    and exists (select 1 from public.graph_nodes n where n.id = target_id)
  );

create policy graph_edges_delete on public.graph_edges
  for delete using (
    origin <> 'system'
    and exists (select 1 from public.graph_nodes n where n.id = source_id)
    and exists (select 1 from public.graph_nodes n where n.id = target_id)
  );

-- El layout es tuyo y de nadie más, ni siquiera de tus compañeros de espacio.
create policy graph_layouts_own on public.graph_layouts
  for all using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));


-- =============================================================================
-- GRANTS (F9 🔴 — RLS filtra FILAS; GRANT decide si el rol puede TOCAR la tabla)
-- =============================================================================
grant select on public.graph_node_types to anon, authenticated;
grant select on public.graph_rel_types  to anon, authenticated;
grant all privileges on public.graph_node_types to service_role;
grant all privileges on public.graph_rel_types  to service_role;
-- Catálogos: la escritura se cierra aquí, no con RLS. 0002 dejó un default
-- grant que hay que deshacer explícitamente.
revoke insert, update, delete on public.graph_node_types from anon, authenticated;
revoke insert, update, delete on public.graph_rel_types  from anon, authenticated;

grant select on public.graph_nodes to anon, authenticated;
grant insert, update, delete on public.graph_nodes to authenticated;
grant all privileges on public.graph_nodes to service_role;

grant select on public.graph_edges to anon, authenticated;
grant insert, update, delete on public.graph_edges to authenticated;
grant all privileges on public.graph_edges to service_role;

grant select on public.graph_layouts to anon, authenticated;
grant insert, update, delete on public.graph_layouts to authenticated;
grant all privileges on public.graph_layouts to service_role;


-- =============================================================================
-- 7) LA FRONTERA DE PRIVACIDAD, EN UN TRIGGER
--
-- Tercera y última capa de BR-012. El CHECK impide una fila anfibia y las dos
-- políticas impiden ver lo que no es tuyo; esto impide CONSTRUIR el puente.
--
-- POR QUÉ CON BLOQUEO EXPLÍCITO
-- Sin `for share`, dos transacciones concurrentes —una creando la arista, otra
-- mudando el proyecto de espacio con moveProject— leen cada una el estado
-- anterior de la otra y ambas confirman, dejando una arista que cruza la
-- frontera sin que nadie la haya insertado mal.
--
-- POR QUÉ EN ORDEN DE UUID
-- No es estilo. Dos aristas inversas creadas a la vez (A→B y B→A) bloquearían
-- las mismas dos filas en orden contrario y se abrazarían en un interbloqueo.
-- Bloquear siempre primero el uuid menor lo hace imposible.
-- =============================================================================

create or replace function public.graph_edge_tenant()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $fn$
declare
  v_src public.graph_nodes%rowtype;
  v_dst public.graph_nodes%rowtype;
begin
  if new.source_id < new.target_id then
    select * into v_src from public.graph_nodes where id = new.source_id for share;
    select * into v_dst from public.graph_nodes where id = new.target_id for share;
  else
    select * into v_dst from public.graph_nodes where id = new.target_id for share;
    select * into v_src from public.graph_nodes where id = new.source_id for share;
  end if;

  if v_src.id is null or v_dst.id is null then
    raise exception 'Uno de los dos nodos de la relación ya no existe.'
      using errcode = '23503';
  end if;

  if v_src.scope        is distinct from v_dst.scope
     or v_src.workspace_id is distinct from v_dst.workspace_id
     or v_src.user_id      is distinct from v_dst.user_id then
    -- errcode P0001 (el de por defecto) A PROPÓSITO. describeDbError()
    -- (src/lib/supabase/errors.ts) traduce 23514 a «alguno de los valores no es
    -- válido» y 42501 a «no tienes permisos», y las dos serían mentira: el
    -- valor es válido y los permisos están bien. P0001 cae en el `default` de
    -- esa función y devuelve este mensaje tal cual, que es justo el que la
    -- persona necesita leer. Es el mismo razonamiento que 0030 dejó escrito.
    raise exception
      'No se puede relacionar «%» con «%»: uno es privado tuyo y el otro vive en un espacio de trabajo. Lo tuyo no cruza a un espacio compartido ni aunque estés sola en él.',
      coalesce(v_src.label, '?'), coalesce(v_dst.label, '?')
      using detail = 'graph.cross_tenant';
  end if;

  new.workspace_id := v_src.workspace_id;
  new.user_id      := v_src.user_id;
  -- Si los dos extremos cuelgan de proyectos distintos gana el del origen: la
  -- arista se ve solo si ves el proyecto de donde SALE. Es el lado conservador.
  new.project_id   := coalesce(v_src.project_id, v_dst.project_id);
  return new;
end;
$fn$;


-- =============================================================================
-- 8) LOS CICLOS SE RECHAZAN AL INSERTAR, NO AL RECORRER
--
-- El recorrido lleva un conjunto de visitados, así que un ciclo no lo cuelga.
-- Pero un ciclo de dependencias deja sin sentido dos cosas que sí importan: el
-- camino crítico (no hay «el más largo» si se puede dar vueltas) y el
-- secuenciador de proyectos de src/lib/domain/execution/project-sequence.ts.
--
-- Solo se comprueba para las relaciones marcadas `is_dependency` —cuatro de las
-- catorce—. Las jerarquías y las referencias pueden tener formas raras sin que
-- nada se rompa, y comprobarlas costaría un recorrido en cada tarea que se crea.
--
-- La comprobación se hace sobre el grafo NORMALIZADO causa → efecto, que no es
-- el de las flechas: «A depende de B» apunta de A a B pero el efecto viaja de B
-- a A. Comparar flechas en vez de efectos daría falsos negativos.
-- =============================================================================

create or replace function public.graph_edge_sin_ciclos()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $fn$
declare
  v_reversed boolean;
  v_cause uuid;
  v_effect uuid;
  v_fwd text[];
  v_rev text[];
  v_ciclo boolean;
begin
  select r.reversed into v_reversed
  from public.graph_rel_types r
  where r.rel_type = new.rel_type and r.is_dependency;

  if v_reversed is null then
    return new;   -- no es una relación de dependencia: nada que comprobar
  end if;

  -- Las aristas 'system' NO se comprueban, y esta excepción es importante.
  -- Reflejan `tasks.deps` tal como está en la base: si alguien consigue crear
  -- un ciclo con las herramientas que ya existían, el grafo tiene que MOSTRARLO,
  -- no negarse a proyectarlo. Un grafo que rechaza la realidad miente, y además
  -- haría fallar el guardado de una tarea desde una pantalla que no sabe nada
  -- de grafos. Los ciclos heredados los denuncia el detector, no este trigger.
  if new.origin = 'system' then
    return new;
  end if;

  if v_reversed then
    v_cause := new.target_id; v_effect := new.source_id;
  else
    v_cause := new.source_id; v_effect := new.target_id;
  end if;

  select array_agg(r.rel_type) filter (where not r.reversed),
         array_agg(r.rel_type) filter (where r.reversed)
    into v_fwd, v_rev
  from public.graph_rel_types r where r.is_dependency;

  -- ¿Se llega ya desde el efecto hasta la causa? Entonces esta arista cierra el
  -- círculo. `union` y no `union all`: deduplica contra todo lo acumulado, que
  -- es lo que impide volver a visitar un nodo alcanzable por varios caminos.
  with recursive camino as (
    select v_effect as node, 0 as depth
    union
    select sig.id, c.depth + 1
    from camino c
    cross join lateral (
      select e.target_id as id from public.graph_edges e
       where e.source_id = c.node and e.rel_type = any (v_fwd)
      union all
      select e.source_id from public.graph_edges e
       where e.target_id = c.node and e.rel_type = any (v_rev)
    ) sig
    where c.depth < 32
  )
  select exists (select 1 from camino where node = v_cause) into v_ciclo;

  if v_ciclo then
    raise exception
      'Esa dependencia cierra un círculo: lo que quieres poner delante ya depende, directa o indirectamente, de lo que quieres poner detrás.'
      using detail = 'graph.cycle';
  end if;

  return new;
end;
$fn$;


-- =============================================================================
-- 9) LA PROYECCIÓN
--
-- CUATRO FORMAS, NO CATORCE FUNCIONES NI UNA SOLA.
-- Catorce funciones serían el mismo cuerpo copiado catorce veces: el día que
-- haya que tocar el `on conflict` se toca en catorce sitios y en el
-- decimoquinto no. Una sola función genérica exigiría `execute format(...)`
-- para resolver de dónde sale el dueño de cada tabla, es decir un intérprete de
-- SQL dentro de un trigger —plan sin cachear, y una cadena de texto donde
-- debería haber una consulta—.
--
-- El eje que de verdad agrupa NO es la tabla, es DE DÓNDE SALE EL DUEÑO, y de
-- eso hay cuatro formas: el `user_id` está en la fila, el `workspace_id` está
-- en la fila, hay que ir a buscarlo al proyecto, o hay que ir a buscarlo a dos
-- saltos. `tasks` tiene la suya aparte, sin `to_jsonb`, porque es la tabla que
-- más se escribe del sistema y serializar la fila entera en cada cambio de
-- estado del tablero es un coste que no hace falta pagar.
--
-- `to_jsonb(new)` se usa SOLO para leer la etiqueta y los metadatos de una
-- lista blanca. Lo que decide quién ve el nodo se lee siempre de una columna
-- con nombre, escrita a mano en cada función.
-- =============================================================================

-- Metadatos por lista BLANCA. Se llama con los nombres de columna permitidos y
-- no con los prohibidos: una lista negra falla en abierto, y el día que alguien
-- añada `investments.numero_de_cuenta` aparecería en el grafo sin pedirlo.
create or replace function public.graph_meta(p_row jsonb, p_campos text[])
returns jsonb
language sql immutable
as $fn$
  select jsonb_strip_nulls(coalesce(
    (select jsonb_object_agg(c, p_row -> c) from unnest(p_campos) as c where p_row ? c),
    '{}'::jsonb
  ));
$fn$;

-- El id del nodo que proyecta una fila de dominio. `entity_id` es único en toda
-- la tabla, así que no hace falta pasar también el nombre de la tabla.
create or replace function public.graph_node_of(p_entity_id uuid)
returns uuid
language sql stable security definer set search_path = public set row_security = off
as $fn$
  select n.id from public.graph_nodes n where n.entity_id = p_entity_id;
$fn$;

-- Sincroniza el CONJUNTO de aristas 'system' de un tipo que salen de un nodo:
-- borra las que ya no toca e inserta las que faltan. Una sola función sirve
-- para `tasks.deps` (un array), para `parent_task_id` (cero o uno) y para
-- `habits.routine_id` (siempre uno), que es justo lo que se quería evitar
-- escribir tres veces.
create or replace function public.graph_system_edges(
  p_source uuid, p_rel text, p_targets uuid[]
) returns void
language plpgsql security definer set search_path = public set row_security = off
as $fn$
begin
  if p_source is null then return; end if;

  delete from public.graph_edges e
   where e.source_id = p_source
     and e.rel_type = p_rel
     and e.origin = 'system'
     and not (e.target_id = any (coalesce(p_targets, '{}'::uuid[])));

  insert into public.graph_edges (source_id, rel_type, target_id, origin)
  select p_source, p_rel, t, 'system'
  from unnest(coalesce(p_targets, '{}'::uuid[])) as t
  where t is not null and t <> p_source
  on conflict (source_id, rel_type, target_id) do nothing;
end;
$fn$;


-- --- Forma 1: el user_id está en la fila -------------------------------------
-- tg_argv[0] = tipo de nodo, [1] = columna de la etiqueta, [2..] = lista blanca
create or replace function public.graph_project_user_row()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_row jsonb;
  v_campos text[] := '{}';
  i int;
begin
  v_row := to_jsonb(new);
  for i in 2 .. tg_nargs - 1 loop
    v_campos := v_campos || tg_argv[i];
  end loop;

  insert into public.graph_nodes
    (scope, user_id, node_type, entity_table, entity_id, label, metadata)
  values
    ('user', new.user_id, tg_argv[0], tg_table_name, new.id,
     coalesce(nullif(btrim(v_row ->> tg_argv[1]), ''), '(sin nombre)'),
     public.graph_meta(v_row, v_campos))
  on conflict (entity_id) where entity_id is not null
  do update set label = excluded.label,
                metadata = excluded.metadata,
                user_id = excluded.user_id,
                updated_at = now()
  -- Sin este `where`, un guardado que no cambia nada reescribe la fila, toca
  -- updated_at e invalida la entrada del índice de trigramas para nada.
  where public.graph_nodes.label    is distinct from excluded.label
     or public.graph_nodes.metadata is distinct from excluded.metadata
     or public.graph_nodes.user_id  is distinct from excluded.user_id;

  return null;
end;
$fn$;


-- --- Forma 2: el workspace_id está en la fila --------------------------------
-- tg_argv[0] = tipo, [1] = etiqueta, [2] = columna del espacio,
-- [3] = columna del proyecto ('' si el nodo no cuelga de ninguno), [4..] = lista blanca
create or replace function public.graph_project_ws_row()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_row jsonb;
  v_campos text[] := '{}';
  v_project uuid;
  i int;
begin
  v_row := to_jsonb(new);
  for i in 4 .. tg_nargs - 1 loop
    v_campos := v_campos || tg_argv[i];
  end loop;

  if tg_argv[3] <> '' then
    v_project := (v_row ->> tg_argv[3])::uuid;
  end if;

  insert into public.graph_nodes
    (scope, workspace_id, project_id, node_type, entity_table, entity_id, label, metadata)
  values
    ('workspace', (v_row ->> tg_argv[2])::uuid, v_project, tg_argv[0],
     tg_table_name, new.id,
     coalesce(nullif(btrim(v_row ->> tg_argv[1]), ''), '(sin nombre)'),
     public.graph_meta(v_row, v_campos))
  on conflict (entity_id) where entity_id is not null
  do update set label = excluded.label,
                metadata = excluded.metadata,
                workspace_id = excluded.workspace_id,
                project_id = excluded.project_id,
                updated_at = now()
  where public.graph_nodes.label        is distinct from excluded.label
     or public.graph_nodes.metadata     is distinct from excluded.metadata
     or public.graph_nodes.workspace_id is distinct from excluded.workspace_id
     or public.graph_nodes.project_id   is distinct from excluded.project_id;

  return null;
end;
$fn$;


-- --- Forma 3: hay que ir a buscar el espacio al proyecto ---------------------
-- `tasks` tiene función propia, sin to_jsonb: es la tabla más escrita del
-- sistema y la lista de metadatos es fija, así que no hay nada que generalizar.
create or replace function public.graph_project_task()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_ws uuid;
begin
  select p.workspace_id into v_ws
  from public.projects p where p.id = new.project_id;
  if v_ws is null then return null; end if;

  insert into public.graph_nodes
    (scope, workspace_id, project_id, node_type, entity_table, entity_id, label, metadata)
  values
    ('workspace', v_ws, new.project_id, 'task', 'tasks', new.id,
     coalesce(nullif(btrim(new.title), ''), '(sin título)'),
     jsonb_strip_nulls(jsonb_build_object(
       'status', new.status, 'priority', new.priority, 'due', new.due,
       'urgent', new.urgent, 'impact', new.impact, 'est', new.est,
       'completed_at', new.completed_at)))
  on conflict (entity_id) where entity_id is not null
  do update set label = excluded.label,
                metadata = excluded.metadata,
                workspace_id = excluded.workspace_id,
                project_id = excluded.project_id,
                updated_at = now()
  where public.graph_nodes.label        is distinct from excluded.label
     or public.graph_nodes.metadata     is distinct from excluded.metadata
     or public.graph_nodes.workspace_id is distinct from excluded.workspace_id
     or public.graph_nodes.project_id   is distinct from excluded.project_id;

  return null;
end;
$fn$;


-- --- Forma 4: dos saltos -----------------------------------------------------
create or replace function public.graph_project_note()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_ws uuid;
begin
  select nb.workspace_id into v_ws
  from public.notebooks nb where nb.id = new.notebook_id;
  if v_ws is null then return null; end if;

  insert into public.graph_nodes
    (scope, workspace_id, node_type, entity_table, entity_id, label, metadata)
  values
    ('workspace', v_ws, 'note', 'notes', new.id,
     coalesce(nullif(btrim(new.title), ''), '(nota sin título)'),
     jsonb_build_object('notebook_id', new.notebook_id))
  on conflict (entity_id) where entity_id is not null
  do update set label = excluded.label,
                metadata = excluded.metadata,
                workspace_id = excluded.workspace_id,
                updated_at = now()
  where public.graph_nodes.label        is distinct from excluded.label
     or public.graph_nodes.metadata     is distinct from excluded.metadata
     or public.graph_nodes.workspace_id is distinct from excluded.workspace_id;

  return null;
end;
$fn$;

create or replace function public.graph_project_task_file()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_ws uuid;
  v_project uuid;
begin
  select p.workspace_id, t.project_id into v_ws, v_project
  from public.tasks t join public.projects p on p.id = t.project_id
  where t.id = new.task_id;
  if v_ws is null then return null; end if;

  insert into public.graph_nodes
    (scope, workspace_id, project_id, node_type, entity_table, entity_id, label, metadata)
  values
    ('workspace', v_ws, v_project, 'document', 'task_files', new.id,
     coalesce(nullif(btrim(new.file_name), ''), '(archivo)'),
     jsonb_build_object('content_type', new.content_type, 'size_bytes', new.size_bytes))
  on conflict (entity_id) where entity_id is not null
  do update set label = excluded.label, metadata = excluded.metadata, updated_at = now()
  where public.graph_nodes.label    is distinct from excluded.label
     or public.graph_nodes.metadata is distinct from excluded.metadata;

  return null;
end;
$fn$;

-- La bitácora, solo las entradas de tipo `decision`.
--
-- NODO PRIVADO, Y LA CONSECUENCIA QUE ESO TIENE: `logbook` es una tabla con
-- política `user_id = auth.uid()` (0003), así que una decisión es tuya y de
-- nadie más aunque hable de un proyecto compartido. Por la invariante de este
-- archivo, eso significa que una Decisión NUNCA se podrá enlazar con el
-- Proyecto del que salió. Es el precio de BR-012 y se paga a conciencia: antes
-- que un nodo que filtre el texto de tu bitácora a tus compañeros, un nodo que
-- vive en tu grafo personal.
create or replace function public.graph_project_decision()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
begin
  if new.type is distinct from 'decision' then
    -- Cambió de tipo: deja de ser un nodo.
    delete from public.graph_nodes where entity_id = new.id;
    return null;
  end if;

  insert into public.graph_nodes
    (scope, user_id, node_type, entity_table, entity_id, label, metadata)
  values
    ('user', new.user_id, 'decision', 'logbook', new.id,
     coalesce(nullif(btrim(left(new.text, 120)), ''), '(decisión)'),
     jsonb_strip_nulls(jsonb_build_object('project_id', new.project_id)))
  on conflict (entity_id) where entity_id is not null
  do update set label = excluded.label, metadata = excluded.metadata, updated_at = now()
  where public.graph_nodes.label    is distinct from excluded.label
     or public.graph_nodes.metadata is distinct from excluded.metadata;

  return null;
end;
$fn$;


-- --- El borrado, por SENTENCIA y no por fila ---------------------------------
--
-- Borrar un proyecto con cinco mil tareas dispara cinco mil cascadas. Con un
-- trigger de fila serían cinco mil entradas y salidas de plpgsql y cinco mil
-- DELETE de una fila; con la tabla de transición es UNA consulta.
--
-- Que INSERT/UPDATE usen triggers de fila con `when` y DELETE uno de sentencia
-- es deliberado, y la asimetría tiene una razón: los triggers de sentencia no
-- admiten cláusula `when`, y el `when` es justo lo que hace barato el camino de
-- la actualización, que es el que ocurre mil veces al día.
create or replace function public.graph_unproject_batch()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
begin
  delete from public.graph_nodes n
   using borradas b
   where n.entity_id = b.id;
  return null;
end;
$fn$;


-- =============================================================================
-- 10) LAS ARISTAS QUE YA EXISTÍAN COMO DATOS
--
-- Esto es lo que hace que el módulo nazca útil en vez de vacío. `tasks.deps`
-- lleva en la base desde 0003 y nadie la ha visto nunca dibujada; el primer día
-- que se abra el lienzo, las dependencias del tablero ya están ahí.
--
-- Todas nacen con origin='system': aparecen y desaparecen con el dato que las
-- causa, no se pueden borrar desde el lienzo, y no se comprueban contra ciclos
-- (ver §8).
-- =============================================================================

-- El simétrico de graph_system_edges, para cuando lo que es fijo es el DESTINO.
create or replace function public.graph_system_edges_in(
  p_target uuid, p_rel text, p_sources uuid[]
) returns void
language plpgsql security definer set search_path = public set row_security = off
as $fn$
begin
  if p_target is null then return; end if;

  delete from public.graph_edges e
   where e.target_id = p_target
     and e.rel_type = p_rel
     and e.origin = 'system'
     and not (e.source_id = any (coalesce(p_sources, '{}'::uuid[])));

  insert into public.graph_edges (source_id, rel_type, target_id, origin)
  select s, p_rel, p_target, 'system'
  from unnest(coalesce(p_sources, '{}'::uuid[])) as s
  where s is not null and s <> p_target
  on conflict (source_id, rel_type, target_id) do nothing;
end;
$fn$;

create or replace function public.graph_edges_task()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_node uuid := public.graph_node_of(new.id);
  v_deps uuid[];
begin
  if v_node is null then return null; end if;

  perform public.graph_system_edges(v_node, 'belongs_to',
    array[public.graph_node_of(new.project_id)]);

  perform public.graph_system_edges(v_node, 'child_of',
    case when new.parent_task_id is null then '{}'::uuid[]
         else array[public.graph_node_of(new.parent_task_id)] end);

  -- `deps` es «de qué depende esta tarea», así que la flecha sale de la tarea
  -- y `depends_on` está marcada como reversed: el impacto viaja al revés, de
  -- aquello de lo que depende hacia ella. Es exactamente lo que hay que
  -- contestar en «si esto se retrasa, ¿qué se rompe?».
  select coalesce(array_agg(public.graph_node_of(d)) filter (where public.graph_node_of(d) is not null), '{}')
    into v_deps
  from unnest(coalesce(new.deps, '{}'::uuid[])) as d;

  perform public.graph_system_edges(v_node, 'depends_on', v_deps);
  return null;
end;
$fn$;

create or replace function public.graph_edges_project()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
begin
  perform public.graph_system_edges(
    public.graph_node_of(new.id), 'belongs_to',
    array[public.graph_node_of(new.workspace_id)]);
  return null;
end;
$fn$;

create or replace function public.graph_edges_habit()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_node uuid := public.graph_node_of(new.id);
begin
  if v_node is null then return null; end if;
  perform public.graph_system_edges(v_node, 'belongs_to',
    array[public.graph_node_of(new.routine_id)]);
  -- El apilado de hábitos (0033) ES una dependencia: «después de X, hago Y».
  perform public.graph_system_edges(v_node, 'depends_on',
    case when new.stack_after_habit_id is null then '{}'::uuid[]
         else array[public.graph_node_of(new.stack_after_habit_id)] end);
  return null;
end;
$fn$;

create or replace function public.graph_edges_note()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_node uuid := public.graph_node_of(new.id);
  v_ws uuid;
begin
  if v_node is null then return null; end if;
  select nb.workspace_id into v_ws from public.notebooks nb where nb.id = new.notebook_id;
  -- No hay nodo de Cuaderno —no está entre los tipos que pide el producto—, así
  -- que la nota cuelga directamente del espacio.
  perform public.graph_system_edges(v_node, 'belongs_to',
    array[public.graph_node_of(v_ws)]);
  return null;
end;
$fn$;

create or replace function public.graph_edges_task_file()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
begin
  perform public.graph_system_edges(
    public.graph_node_of(new.id), 'belongs_to',
    array[public.graph_node_of(new.task_id)]);
  return null;
end;
$fn$;

-- Quién trabaja en qué. El nodo de Persona sale de `memberships`, así que solo
-- existe dentro del espacio: la misma persona en dos espacios son dos nodos, que
-- es lo correcto —su papel y lo que se le asigna son distintos en cada uno—.
create or replace function public.graph_edges_assignee()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_task uuid := coalesce(new.task_id, old.task_id);
  v_node uuid;
  v_ws uuid;
  v_personas uuid[];
begin
  v_node := public.graph_node_of(v_task);
  if v_node is null then return null; end if;

  select n.workspace_id into v_ws from public.graph_nodes n where n.id = v_node;

  select coalesce(array_agg(pn.id), '{}') into v_personas
  from public.task_assignees ta
  join public.memberships m on m.workspace_id = v_ws and m.user_id = ta.user_id
  join public.graph_nodes pn on pn.entity_id = m.id
  where ta.task_id = v_task and ta.user_id is not null;

  perform public.graph_system_edges(v_node, 'assigned_to', v_personas);
  return null;
end;
$fn$;

-- Qué alimenta una meta personal.
--
-- SOLO LAS FUENTES PRIVADAS, Y NO ES UNA OMISIÓN. `key_results.source_kind`
-- admite 'project', y un proyecto vive en un espacio de trabajo mientras que
-- una meta personal es tuya: esa arista cruzaría la frontera y el trigger de §7
-- la rechazaría con un mensaje que la persona no entendería, en mitad de un
-- guardado que no tiene nada que ver con el grafo. Se filtra aquí, antes.
create or replace function public.graph_edges_key_result()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_goal uuid := public.graph_node_of(coalesce(new.goal_id, old.goal_id));
  v_fuentes uuid[];
begin
  if v_goal is null then return null; end if;

  select coalesce(array_agg(fn.id), '{}') into v_fuentes
  from public.key_results kr
  join public.graph_nodes fn on fn.entity_id = kr.source_id
  where kr.goal_id = coalesce(new.goal_id, old.goal_id)
    and kr.source_id is not null
    and kr.source_kind in ('habit', 'book');

  perform public.graph_system_edges_in(v_goal, 'supports', v_fuentes);
  return null;
end;
$fn$;


-- =============================================================================
-- 11) MUDAR UN PROYECTO DE ESPACIO
--
-- `moveProject` (src/lib/workspaces/actions.ts) cambia `projects.workspace_id`.
-- Sin esto, los nodos de sus tareas y todas sus aristas seguirían apuntando al
-- espacio anterior: la gente del espacio viejo seguiría viéndolos en el grafo
-- aunque el proyecto ya no esté ahí. Va como trigger y no en la Server Action
-- para que sea ATÓMICO con el UPDATE, que es la única forma de que no exista un
-- instante en que el grafo miente.
-- =============================================================================

create or replace function public.graph_reproject_project()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
begin
  update public.graph_nodes n
     set workspace_id = new.workspace_id, updated_at = now()
   where n.project_id = new.id
     and n.workspace_id is distinct from new.workspace_id;

  update public.graph_edges e
     set workspace_id = new.workspace_id
   where e.project_id = new.id
     and e.workspace_id is distinct from new.workspace_id;

  return null;
end;
$fn$;

-- La red de debajo. La invariante «ninguna arista cruza la frontera» relaciona
-- tres filas, así que no hay CHECK que la exprese; lo que sí se puede es
-- preguntar. La prueba pgTAP mueve un proyecto y exige que esto salga vacío.
create or replace function public.graph_check_integrity()
returns table (source_id uuid, rel_type text, target_id uuid, motivo text)
language sql stable security definer set search_path = public set row_security = off
as $fn$
  select e.source_id, e.rel_type, e.target_id,
         case
           when s.scope is distinct from t.scope then 'los extremos tienen ámbitos distintos'
           when s.workspace_id is distinct from t.workspace_id then 'espacios distintos'
           when s.user_id is distinct from t.user_id then 'dueños distintos'
           else 'las columnas de la arista no coinciden con su origen'
         end
  from public.graph_edges e
  join public.graph_nodes s on s.id = e.source_id
  join public.graph_nodes t on t.id = e.target_id
  where s.scope is distinct from t.scope
     or s.workspace_id is distinct from t.workspace_id
     or s.user_id is distinct from t.user_id
     or e.workspace_id is distinct from s.workspace_id
     or e.user_id is distinct from s.user_id;
$fn$;


-- =============================================================================
-- 12) BACKFILL
--
-- POR QUÉ AQUÍ Y NO EN UN SCRIPT APARTE
-- La razón de 0030: si el backfill falla, la migración aborta ENTERA y la base
-- queda como estaba. Un grafo a medias es peor que ninguno, porque
-- `graph_impact` contestaría «no depende nada de esto» con toda seguridad y
-- estaría mintiendo.
--
-- POR QUÉ EL ORDEN ES TABLAS → ÍNDICES → BACKFILL → TRIGGERS
-- Los índices van antes porque sin el único de `entity_id` el `on conflict` de
-- los INSERT no tiene dónde inferir. Los triggers van después porque durante el
-- backfill no hay nada que sincronizar y dispararlos sería hacer el trabajo dos
-- veces. Que todo esté en UNA transacción es lo que impide que una escritura
-- concurrente se cuele por el hueco entre el backfill y el primer trigger.
--
-- POR QUÉ NO HAY `create index concurrently`
-- No puede correr dentro de una transacción, y `supabase db push` envuelve cada
-- archivo en una.
-- =============================================================================

-- El riesgo real de esta migración NO es el volumen de datos: es que
-- `create trigger` sobre `tasks` necesita ACCESS EXCLUSIVE. Si hay una sesión
-- larga leyendo `tasks`, el bloqueo queda pendiente y —esto es lo que duele—
-- encola detrás a TODOS los lectores nuevos. Con `lock_timeout`, «la aplicación
-- estuvo caída cuarenta minutos durante el despliegue» se convierte en «la
-- migración falló, vuelve a lanzarla».
set local lock_timeout = '10s';
set local statement_timeout = 0;

-- --- Nodos de espacio --------------------------------------------------------
insert into public.graph_nodes (scope, workspace_id, node_type, entity_table, entity_id, label, metadata)
select 'workspace', w.id, 'workspace', 'workspaces', w.id,
       coalesce(nullif(btrim(w.name), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(w), array['is_personal', 'color'])
from public.workspaces w
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, workspace_id, project_id, node_type, entity_table, entity_id, label, metadata)
select 'workspace', p.workspace_id, p.id, 'project', 'projects', p.id,
       coalesce(nullif(btrim(p.title), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(p), array['status', 'priority', 'area', 'target_date'])
from public.projects p
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, workspace_id, project_id, node_type, entity_table, entity_id, label, metadata)
select 'workspace', p.workspace_id, t.project_id, 'task', 'tasks', t.id,
       coalesce(nullif(btrim(t.title), ''), '(sin título)'),
       jsonb_strip_nulls(jsonb_build_object(
         'status', t.status, 'priority', t.priority, 'due', t.due,
         'urgent', t.urgent, 'impact', t.impact, 'est', t.est,
         'completed_at', t.completed_at))
from public.tasks t join public.projects p on p.id = t.project_id
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, workspace_id, node_type, entity_table, entity_id, label, metadata)
select 'workspace', nb.workspace_id, 'note', 'notes', n.id,
       coalesce(nullif(btrim(n.title), ''), '(nota sin título)'),
       jsonb_build_object('notebook_id', n.notebook_id)
from public.notes n join public.notebooks nb on nb.id = n.notebook_id
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, workspace_id, project_id, node_type, entity_table, entity_id, label, metadata)
select 'workspace', p.workspace_id, t.project_id, 'document', 'task_files', f.id,
       coalesce(nullif(btrim(f.file_name), ''), '(archivo)'),
       jsonb_build_object('content_type', f.content_type, 'size_bytes', f.size_bytes)
from public.task_files f
join public.tasks t on t.id = f.task_id
join public.projects p on p.id = t.project_id
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, workspace_id, node_type, entity_table, entity_id, label, metadata)
select 'workspace', m.workspace_id, 'person', 'memberships', m.id,
       coalesce(nullif(btrim(m.user_name), ''), '(persona)'),
       public.graph_meta(to_jsonb(m), array['role', 'status'])
from public.memberships m
on conflict (entity_id) where entity_id is not null do nothing;

-- --- Nodos privados ----------------------------------------------------------
insert into public.graph_nodes (scope, user_id, node_type, entity_table, entity_id, label, metadata)
select 'user', g.user_id, 'goal', 'personal_goals', g.id,
       coalesce(nullif(btrim(g.title), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(g), array['status', 'area', 'horizon', 'achieved_at'])
from public.personal_goals g
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, user_id, node_type, entity_table, entity_id, label, metadata)
select 'user', h.user_id, 'habit', 'habits', h.id,
       coalesce(nullif(btrim(h.name), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(h), array['category', 'cue', 'duration_min', 'meal'])
from public.habits h
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, user_id, node_type, entity_table, entity_id, label, metadata)
select 'user', r.user_id, 'routine', 'routines', r.id,
       coalesce(nullif(btrim(r.name), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(r), array['frequency', 'active', 'identity'])
from public.routines r
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, user_id, node_type, entity_table, entity_id, label, metadata)
select 'user', b.user_id, 'book', 'books', b.id,
       coalesce(nullif(btrim(b.title), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(b), array['status', 'category', 'author', 'current_page', 'total_pages'])
from public.books b
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, user_id, node_type, entity_table, entity_id, label, metadata)
select 'user', i.user_id, 'investment', 'investments', i.id,
       coalesce(nullif(btrim(i.name), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(i), array['kind', 'institution', 'currency', 'valuation'])
from public.investments i
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, user_id, node_type, entity_table, entity_id, label, metadata)
select 'user', bu.user_id, 'budget', 'budgets', bu.id,
       coalesce(nullif(btrim(bu.category), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(bu), array['period', 'cycle', 'amount', 'monthly_cost'])
from public.budgets bu
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, user_id, node_type, entity_table, entity_id, label, metadata)
select 'user', a.user_id, 'asset', 'assets', a.id,
       coalesce(nullif(btrim(a.name), ''), '(sin nombre)'),
       public.graph_meta(to_jsonb(a), array['kind', 'currency', 'value'])
from public.assets a
on conflict (entity_id) where entity_id is not null do nothing;

insert into public.graph_nodes (scope, user_id, node_type, entity_table, entity_id, label, metadata)
select 'user', l.user_id, 'decision', 'logbook', l.id,
       coalesce(nullif(btrim(left(l.text, 120)), ''), '(decisión)'),
       jsonb_strip_nulls(jsonb_build_object('project_id', l.project_id))
from public.logbook l where l.type = 'decision'
on conflict (entity_id) where entity_id is not null do nothing;

-- --- Aristas -----------------------------------------------------------------
-- Las columnas de dueño se calculan igual que lo hará el trigger de §7: salen
-- del ORIGEN, y el proyecto es el del origen o, si no tiene, el del destino.
insert into public.graph_edges (source_id, rel_type, target_id, workspace_id, user_id, project_id, origin)
select s.id, v.rel, t.id, s.workspace_id, s.user_id, coalesce(s.project_id, t.project_id), 'system'
from (
  -- proyecto → espacio
  select p.id as src, p.workspace_id as dst, 'belongs_to' as rel from public.projects p
  union all
  -- tarea → proyecto
  select tk.id, tk.project_id, 'belongs_to' from public.tasks tk
  union all
  -- subtarea → tarea madre
  select tk.id, tk.parent_task_id, 'child_of' from public.tasks tk where tk.parent_task_id is not null
  union all
  -- tarea → aquello de lo que depende
  select tk.id, d.dep, 'depends_on'
  from public.tasks tk cross join lateral unnest(tk.deps) as d(dep)
  union all
  -- hábito → rutina, y hábito → hábito anterior (apilado, 0033)
  select h.id, h.routine_id, 'belongs_to' from public.habits h
  union all
  select h.id, h.stack_after_habit_id, 'depends_on' from public.habits h where h.stack_after_habit_id is not null
  union all
  -- nota → espacio
  select n.id, nb.workspace_id, 'belongs_to' from public.notes n join public.notebooks nb on nb.id = n.notebook_id
  union all
  -- documento → tarea
  select f.id, f.task_id, 'belongs_to' from public.task_files f
) v
join public.graph_nodes s on s.entity_id = v.src
join public.graph_nodes t on t.entity_id = v.dst
where v.src is distinct from v.dst
on conflict (source_id, rel_type, target_id) do nothing;

-- tarea → persona asignada
insert into public.graph_edges (source_id, rel_type, target_id, workspace_id, user_id, project_id, origin)
select tn.id, 'assigned_to', pn.id, tn.workspace_id, tn.user_id, coalesce(tn.project_id, pn.project_id), 'system'
from public.task_assignees ta
join public.graph_nodes tn on tn.entity_id = ta.task_id
join public.memberships m on m.workspace_id = tn.workspace_id and m.user_id = ta.user_id
join public.graph_nodes pn on pn.entity_id = m.id
where ta.user_id is not null
on conflict (source_id, rel_type, target_id) do nothing;

-- hábito/libro → meta personal a la que alimenta (solo fuentes privadas, §10)
insert into public.graph_edges (source_id, rel_type, target_id, workspace_id, user_id, project_id, origin)
select fn.id, 'supports', gn.id, fn.workspace_id, fn.user_id, coalesce(fn.project_id, gn.project_id), 'system'
from public.key_results kr
join public.graph_nodes fn on fn.entity_id = kr.source_id
join public.graph_nodes gn on gn.entity_id = kr.goal_id
where kr.source_id is not null and kr.source_kind in ('habit', 'book')
on conflict (source_id, rel_type, target_id) do nothing;


-- =============================================================================
-- 13) LOS TRIGGERS
--
-- SOBRE EL ORDEN DE LOS NOMBRES: Postgres dispara los triggers de una tabla en
-- orden ALFABÉTICO. El nodo tiene que existir antes de que nadie intente
-- colgarle una arista, así que los nombres llevan `_a_` y `_b_` y eso NO es
-- decoración: cambiarlos por algo más bonito rompe la inserción de una tarea
-- con dependencias.
--
-- SOBRE `update of` Y LA AUSENCIA DE `when`: la cláusula `when` de un trigger no
-- puede mencionar OLD si el mismo trigger cubre INSERT, así que o se duplican
-- todos los triggers o se prescinde de ella. Se prescinde, porque `update of`
-- ya hace el trabajo que importaba: se evalúa UNA VEZ POR SENTENCIA contra la
-- lista del SET, y con eso el `update tasks set position = …` masivo del
-- arrastre del tablero (0021) no llega ni a rozar el grafo. El caso que queda
-- —un SET que menciona `title` y le pone el mismo valor— lo corta el `where`
-- del `on conflict do update`, que evita la escritura aunque entre en la función.
--
-- SOBRE EL BORRADO: por SENTENCIA y con tabla de transición, no por fila. Ver §9.
-- =============================================================================

-- --- Espacios ---------------------------------------------------------------
create trigger trg_graph_workspaces_a_nodo
  after insert or update of name, is_personal, color on public.workspaces
  for each row execute function public.graph_project_ws_row('workspace', 'name', 'id', '', 'is_personal', 'color');

-- --- Proyectos --------------------------------------------------------------
create trigger trg_graph_projects_a_nodo
  after insert or update of title, status, priority, area, target_date, workspace_id on public.projects
  for each row execute function public.graph_project_ws_row('project', 'title', 'workspace_id', 'id', 'status', 'priority', 'area', 'target_date');

create trigger trg_graph_projects_b_aristas
  after insert or update of workspace_id on public.projects
  for each row execute function public.graph_edges_project();

-- Mudar un proyecto de espacio arrastra a sus tareas y a todas sus aristas (§11).
create trigger trg_graph_projects_c_mudanza
  after update of workspace_id on public.projects
  for each row execute function public.graph_reproject_project();

create trigger trg_graph_projects_z_borrado
  after delete on public.projects referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

-- --- Tareas ------------------------------------------------------------------
create trigger trg_graph_tasks_a_nodo
  after insert or update of title, status, priority, due, urgent, impact, est, completed_at, project_id
  on public.tasks
  for each row execute function public.graph_project_task();

create trigger trg_graph_tasks_b_aristas
  after insert or update of project_id, parent_task_id, deps on public.tasks
  for each row execute function public.graph_edges_task();

create trigger trg_graph_tasks_z_borrado
  after delete on public.tasks referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

create trigger trg_graph_task_assignees_aristas
  after insert or update or delete on public.task_assignees
  for each row execute function public.graph_edges_assignee();

-- --- Notas y documentos ------------------------------------------------------
create trigger trg_graph_notes_a_nodo
  after insert or update of title, notebook_id on public.notes
  for each row execute function public.graph_project_note();

create trigger trg_graph_notes_b_aristas
  after insert or update of notebook_id on public.notes
  for each row execute function public.graph_edges_note();

create trigger trg_graph_notes_z_borrado
  after delete on public.notes referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

create trigger trg_graph_task_files_a_nodo
  after insert or update of file_name on public.task_files
  for each row execute function public.graph_project_task_file();

create trigger trg_graph_task_files_b_aristas
  after insert on public.task_files
  for each row execute function public.graph_edges_task_file();

create trigger trg_graph_task_files_z_borrado
  after delete on public.task_files referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

-- --- Personas ---------------------------------------------------------------
create trigger trg_graph_memberships_a_nodo
  after insert or update of user_name, role, status on public.memberships
  for each row execute function public.graph_project_ws_row('person', 'user_name', 'workspace_id', '', 'role', 'status');

create trigger trg_graph_memberships_z_borrado
  after delete on public.memberships referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

-- --- Lo privado: metas, hábitos, rutinas, lectura ---------------------------
create trigger trg_graph_personal_goals_a_nodo
  after insert or update of title, status, area, horizon, achieved_at on public.personal_goals
  for each row execute function public.graph_project_user_row('goal', 'title', 'status', 'area', 'horizon', 'achieved_at');

create trigger trg_graph_personal_goals_z_borrado
  after delete on public.personal_goals referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

create trigger trg_graph_habits_a_nodo
  after insert or update of name, category, cue, duration_min, meal on public.habits
  for each row execute function public.graph_project_user_row('habit', 'name', 'category', 'cue', 'duration_min', 'meal');

create trigger trg_graph_habits_b_aristas
  after insert or update of routine_id, stack_after_habit_id on public.habits
  for each row execute function public.graph_edges_habit();

create trigger trg_graph_habits_z_borrado
  after delete on public.habits referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

create trigger trg_graph_routines_a_nodo
  after insert or update of name, frequency, active, identity on public.routines
  for each row execute function public.graph_project_user_row('routine', 'name', 'frequency', 'active', 'identity');

create trigger trg_graph_routines_z_borrado
  after delete on public.routines referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

create trigger trg_graph_books_a_nodo
  after insert or update of title, status, category, author, current_page, total_pages on public.books
  for each row execute function public.graph_project_user_row('book', 'title', 'status', 'category', 'author', 'current_page', 'total_pages');

create trigger trg_graph_books_z_borrado
  after delete on public.books referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

create trigger trg_graph_key_results_aristas
  after insert or update or delete on public.key_results
  for each row execute function public.graph_edges_key_result();

-- --- Lo privado: dinero ------------------------------------------------------
create trigger trg_graph_investments_a_nodo
  after insert or update of name, kind, institution, currency, valuation on public.investments
  for each row execute function public.graph_project_user_row('investment', 'name', 'kind', 'institution', 'currency', 'valuation');

create trigger trg_graph_investments_z_borrado
  after delete on public.investments referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

create trigger trg_graph_budgets_a_nodo
  after insert or update of category, period, cycle, amount, monthly_cost on public.budgets
  for each row execute function public.graph_project_user_row('budget', 'category', 'period', 'cycle', 'amount', 'monthly_cost');

create trigger trg_graph_budgets_z_borrado
  after delete on public.budgets referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

create trigger trg_graph_assets_a_nodo
  after insert or update of name, kind, currency, value on public.assets
  for each row execute function public.graph_project_user_row('asset', 'name', 'kind', 'currency', 'value');

create trigger trg_graph_assets_z_borrado
  after delete on public.assets referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

-- --- La bitácora -------------------------------------------------------------
create trigger trg_graph_logbook_a_nodo
  after insert or update of text, type, project_id on public.logbook
  for each row execute function public.graph_project_decision();

create trigger trg_graph_logbook_z_borrado
  after delete on public.logbook referencing old table as borradas
  for each statement execute function public.graph_unproject_batch();

-- --- Las aristas, sus dos guardianes ----------------------------------------
create trigger trg_graph_edge_tenant
  before insert or update of source_id, target_id on public.graph_edges
  for each row execute function public.graph_edge_tenant();

-- Después del de dueño: no tiene sentido buscar ciclos en una arista que no va
-- a existir.
create trigger trg_graph_edge_sin_ciclos
  before insert on public.graph_edges
  for each row execute function public.graph_edge_sin_ciclos();


-- =============================================================================
-- 14) EL RECORRIDO
--
-- POR QUÉ UN BUCLE Y NO UNA `with recursive`
-- Una CTE recursiva visita cada nodo UNA VEZ POR CAMINO. El array de `path` —o
-- la cláusula CYCLE, que Postgres reescribe exactamente a ese array— corta los
-- ciclos y nada más: en un grafo donde un nodo cuelga de otros diez, se recorre
-- diez veces, y a seis saltos eso son un millón de filas para devolver
-- trescientas. El término recursivo de una CTE no puede consultar lo que la
-- propia CTE ya ha producido, así que no hay forma de llevar un conjunto de
-- visitados dentro. Un bucle sí.
--
-- POR QUÉ `stable` Y NO `volatile`
-- Una función `stable` en plpgsql NO PUEDE ejecutar INSERT, UPDATE ni DELETE:
-- Postgres lo rechaza en tiempo de ejecución. Es una garantía barata de que una
-- función que camina con la seguridad por filas apagada no escribe nada.
--
-- POR QUÉ SECURITY DEFINER, Y QUÉ SIGNIFICA ESO
-- Comprobar `has_project_access()` por cada nodo visitado es inviable: se
-- comprueba UNA vez el acceso a la raíz y se precalcula el permiso, y a partir
-- de ahí la función camina con `row_security = off`. Dicho claro: LA RLS NO
-- PROTEGE ESTA FUNCIÓN. La protegen las comprobaciones que hay escritas dentro,
-- y por eso supabase/tests/0025_rls_grafo.sql las prueba una por una.
--
-- POR QUÉ DOS CONJUNTOS DE PERMISO Y NO UNO
-- Éste es el error que el diseño estuvo a punto de tener. Un Guest ES miembro
-- activo del espacio, así que `is_workspace_member()` le dice que sí; lo único
-- que le limita a sus proyectos compartidos es `has_project_access()`, que es
-- justo lo que el precálculo elimina. Precalcular «los espacios donde soy
-- miembro» le habría entregado el grafo entero del espacio. Por eso `v_ws`
-- excluye explícitamente el rol Guest y `v_proj` recoge aparte los proyectos
-- que sí tiene compartidos.
--
-- POR QUÉ EL FILTRO VA EN CADA SALTO Y NO AL HIDRATAR
-- Filtrar solo al final ocultaría las etiquetas pero no la topología, y saber
-- que algo tuyo cuelga de ALGO invisible a dos saltos ya es información. El
-- recorrido se corta en el nodo inaccesible: no se atraviesa para llegar al de
-- más allá.
--
-- POR QUÉ TODO VA CUALIFICADO CON `public.`
-- Con `search_path = public`, Postgres sigue mirando `pg_temp` PRIMERO para las
-- tablas. Un usuario autenticado puede crear `pg_temp.graph_nodes` y secuestrar
-- la función. Aquí una omisión no da un error: da un bypass.
-- =============================================================================

create or replace function public.graph_impact(
  p_root uuid,
  p_direction text default 'downstream',
  p_max_depth integer default 6,
  p_max_nodes integer default 500
)
returns table (
  node_id uuid,
  parent_id uuid,
  via_rel text,
  depth integer,
  label text,
  node_type text,
  entity_table text,
  entity_id uuid,
  truncated boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
set statement_timeout = '5s'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ws uuid[];
  v_proj uuid[];
  v_fwd text[];
  v_rev text[];
  v_down boolean := (coalesce(p_direction, 'downstream') <> 'upstream');
  v_frontera uuid[];
  v_vistos uuid[];
  v_nivel uuid[];
  v_padres uuid[];
  v_rels text[];
  v_acc_id uuid[] := '{}';
  v_acc_padre uuid[] := '{}';
  v_acc_rel text[] := '{}';
  v_acc_prof integer[] := '{}';
  v_prof integer := 0;
  v_trunc boolean := false;
  i integer;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión para recorrer el grafo.' using errcode = '42501';
  end if;
  p_max_depth := least(greatest(coalesce(p_max_depth, 6), 1), 12);
  p_max_nodes := least(greatest(coalesce(p_max_nodes, 500), 1), 5000);

  select coalesce(array_agg(distinct w.id), '{}') into v_ws
  from public.workspaces w
  where w.owner_id = v_uid
     or exists (
       select 1 from public.memberships m
       where m.workspace_id = w.id and m.user_id = v_uid
         and m.status = 'Active' and m.role <> 'Guest'
     );

  select coalesce(array_agg(distinct ps.project_id), '{}') into v_proj
  from public.project_shares ps
  join public.memberships m
    on m.workspace_id = ps.workspace_id and m.user_id = v_uid
   and m.status = 'Active' and m.role = 'Guest';

  -- ESTE `if` ES LA POLÍTICA. A partir de aquí no hay red.
  if not exists (
    select 1 from public.graph_nodes n
    where n.id = p_root
      and n.archived_at is null
      and ((n.scope = 'user' and n.user_id = v_uid)
        or (n.scope = 'workspace' and n.workspace_id = any (v_ws))
        or (n.scope = 'workspace' and n.project_id = any (v_proj)))
  ) then
    raise exception 'Ese nodo no existe o no tienes acceso.' using errcode = '42501';
  end if;

  select coalesce(array_agg(r.rel_type) filter (where not r.reversed), '{}'),
         coalesce(array_agg(r.rel_type) filter (where r.reversed), '{}')
    into v_fwd, v_rev
  from public.graph_rel_types r;

  v_frontera := array[p_root];
  v_vistos := array[p_root];

  while cardinality(v_frontera) > 0 and v_prof < p_max_depth and not v_trunc loop
    v_prof := v_prof + 1;

    -- Un nivel entero en una sola consulta. `distinct on` porque un nodo al que
    -- se llega por tres aristas de este mismo nivel entra una vez, con un padre.
    select coalesce(array_agg(h.id), '{}'),
           coalesce(array_agg(h.padre), '{}'),
           coalesce(array_agg(h.rel), '{}')
      into v_nivel, v_padres, v_rels
    from (
      select distinct on (n.id) n.id, e.padre, e.rel
      from (
        select e.target_id as sig, e.source_id as padre, e.rel_type as rel
          from public.graph_edges e
         where v_down and e.source_id = any (v_frontera) and e.rel_type = any (v_fwd)
        union all
        select e.source_id, e.target_id, e.rel_type
          from public.graph_edges e
         where v_down and e.target_id = any (v_frontera) and e.rel_type = any (v_rev)
        union all
        select e.source_id, e.target_id, e.rel_type
          from public.graph_edges e
         where not v_down and e.target_id = any (v_frontera) and e.rel_type = any (v_fwd)
        union all
        select e.target_id, e.source_id, e.rel_type
          from public.graph_edges e
         where not v_down and e.source_id = any (v_frontera) and e.rel_type = any (v_rev)
      ) e
      join public.graph_nodes n on n.id = e.sig
      where not (e.sig = any (v_vistos))
        and n.archived_at is null
        and ((n.scope = 'user' and n.user_id = v_uid)
          or (n.scope = 'workspace' and n.workspace_id = any (v_ws))
          or (n.scope = 'workspace' and n.project_id = any (v_proj)))
      order by n.id, e.rel
    ) h;

    exit when cardinality(v_nivel) = 0;

    if cardinality(v_vistos) + cardinality(v_nivel) > p_max_nodes then
      i := greatest(p_max_nodes - cardinality(v_vistos), 0);
      v_nivel := v_nivel[1:i];
      v_padres := v_padres[1:i];
      v_rels := v_rels[1:i];
      v_trunc := true;
    end if;

    v_acc_id := v_acc_id || v_nivel;
    v_acc_padre := v_acc_padre || v_padres;
    v_acc_rel := v_acc_rel || v_rels;
    for i in 1 .. cardinality(v_nivel) loop
      v_acc_prof := v_acc_prof || v_prof;
    end loop;

    v_vistos := v_vistos || v_nivel;
    v_frontera := v_nivel;
  end loop;

  return query
  select a.nid, a.pid, a.rel, a.prof,
         n.label, n.node_type, n.entity_table, n.entity_id, v_trunc
  from unnest(v_acc_id, v_acc_padre, v_acc_rel, v_acc_prof) as a(nid, pid, rel, prof)
  join public.graph_nodes n on n.id = a.nid
  order by a.prof, n.label;
end;
$fn$;

comment on function public.graph_impact(uuid, text, integer, integer) is
  'Qué depende de un nodo (downstream) o de qué depende él (upstream), con profundidad mínima y el padre por el que se llegó —encadenarlo da el camino crítico—. Camina con row_security apagada: su seguridad son las comprobaciones de dentro, probadas en supabase/tests/0025_rls_grafo.sql.';


-- El vecindario de un nodo, sin dirección: lo que el lienzo pinta al abrirse y
-- lo que va pidiendo cuando alguien expande. Mismo motor, mismas garantías.
create or replace function public.graph_subgraph(
  p_root uuid,
  p_node_types text[] default null,
  p_rel_types text[] default null,
  p_max_depth integer default 2,
  p_max_nodes integer default 500
)
returns table (
  node_id uuid,
  depth integer,
  label text,
  node_type text,
  entity_table text,
  entity_id uuid,
  scope text,
  metadata jsonb,
  truncated boolean
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
set statement_timeout = '5s'
as $fn$
declare
  v_uid uuid := auth.uid();
  v_ws uuid[];
  v_proj uuid[];
  v_frontera uuid[];
  v_vistos uuid[];
  v_nivel uuid[];
  v_acc_id uuid[] := '{}';
  v_acc_prof integer[] := '{}';
  v_prof integer := 0;
  v_trunc boolean := false;
  i integer;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión para recorrer el grafo.' using errcode = '42501';
  end if;
  p_max_depth := least(greatest(coalesce(p_max_depth, 2), 1), 8);
  p_max_nodes := least(greatest(coalesce(p_max_nodes, 500), 1), 5000);

  select coalesce(array_agg(distinct w.id), '{}') into v_ws
  from public.workspaces w
  where w.owner_id = v_uid
     or exists (select 1 from public.memberships m
                 where m.workspace_id = w.id and m.user_id = v_uid
                   and m.status = 'Active' and m.role <> 'Guest');

  select coalesce(array_agg(distinct ps.project_id), '{}') into v_proj
  from public.project_shares ps
  join public.memberships m on m.workspace_id = ps.workspace_id and m.user_id = v_uid
   and m.status = 'Active' and m.role = 'Guest';

  if not exists (
    select 1 from public.graph_nodes n
    where n.id = p_root and n.archived_at is null
      and ((n.scope = 'user' and n.user_id = v_uid)
        or (n.scope = 'workspace' and n.workspace_id = any (v_ws))
        or (n.scope = 'workspace' and n.project_id = any (v_proj)))
  ) then
    raise exception 'Ese nodo no existe o no tienes acceso.' using errcode = '42501';
  end if;

  v_frontera := array[p_root];
  v_vistos := array[p_root];
  v_acc_id := array[p_root];
  v_acc_prof := array[0];

  while cardinality(v_frontera) > 0 and v_prof < p_max_depth and not v_trunc loop
    v_prof := v_prof + 1;

    select coalesce(array_agg(distinct n.id), '{}') into v_nivel
    from (
      select e.target_id as sig from public.graph_edges e
       where e.source_id = any (v_frontera)
         and (p_rel_types is null or e.rel_type = any (p_rel_types))
      union
      select e.source_id from public.graph_edges e
       where e.target_id = any (v_frontera)
         and (p_rel_types is null or e.rel_type = any (p_rel_types))
    ) e
    join public.graph_nodes n on n.id = e.sig
    where not (e.sig = any (v_vistos))
      and n.archived_at is null
      and (p_node_types is null or n.node_type = any (p_node_types))
      and ((n.scope = 'user' and n.user_id = v_uid)
        or (n.scope = 'workspace' and n.workspace_id = any (v_ws))
        or (n.scope = 'workspace' and n.project_id = any (v_proj)));

    exit when cardinality(v_nivel) = 0;

    if cardinality(v_vistos) + cardinality(v_nivel) > p_max_nodes then
      v_nivel := v_nivel[1 : greatest(p_max_nodes - cardinality(v_vistos), 0)];
      v_trunc := true;
    end if;

    v_acc_id := v_acc_id || v_nivel;
    for i in 1 .. cardinality(v_nivel) loop
      v_acc_prof := v_acc_prof || v_prof;
    end loop;
    v_vistos := v_vistos || v_nivel;
    v_frontera := v_nivel;
  end loop;

  return query
  select a.nid, a.prof, n.label, n.node_type, n.entity_table, n.entity_id,
         n.scope, n.metadata, v_trunc
  from unnest(v_acc_id, v_acc_prof) as a(nid, prof)
  join public.graph_nodes n on n.id = a.nid
  order by a.prof, n.label;
end;
$fn$;


-- Las aristas de un conjunto de nodos. El lienzo pide primero los nodos y
-- después las aristas ENTRE ELLOS: pedirlas juntas obligaría a devolver dos
-- formas distintas en la misma llamada, y pedir las aristas de cada nodo por
-- separado serían quinientas llamadas para pintar una pantalla.
create or replace function public.graph_edges_of(p_nodes uuid[])
returns table (source_id uuid, rel_type text, target_id uuid, origin text, weight real, confidence real)
language sql
stable
security definer
set search_path = public
set row_security = off
set statement_timeout = '5s'
as $fn$
  with permiso as (
    select coalesce(array_agg(distinct w.id), '{}') as ws
    from public.workspaces w
    where auth.uid() is not null
      and (w.owner_id = auth.uid()
        or exists (select 1 from public.memberships m
                    where m.workspace_id = w.id and m.user_id = auth.uid()
                      and m.status = 'Active' and m.role <> 'Guest'))
  ), guest as (
    select coalesce(array_agg(distinct ps.project_id), '{}') as proj
    from public.project_shares ps
    join public.memberships m on m.workspace_id = ps.workspace_id and m.user_id = auth.uid()
     and m.status = 'Active' and m.role = 'Guest'
  ), visibles as (
    select n.id from public.graph_nodes n, permiso p, guest g
    where n.id = any (p_nodes)
      and n.archived_at is null
      and ((n.scope = 'user' and n.user_id = auth.uid())
        or (n.scope = 'workspace' and n.workspace_id = any (p.ws))
        or (n.scope = 'workspace' and n.project_id = any (g.proj)))
  )
  select e.source_id, e.rel_type, e.target_id, e.origin, e.weight, e.confidence
  from public.graph_edges e
  where e.source_id in (select id from visibles)
    and e.target_id in (select id from visibles);
$fn$;


-- Búsqueda instantánea sobre las etiquetas. Trigramas, no lematización: la
-- gente escribe «mudan» esperando «Mudanza», y `to_tsvector` no hace prefijos.
--
-- El ILIKE con comodines a los dos lados NO es un recorrido secuencial aquí: el
-- índice GIN de trigramas lo acelera, que es precisamente para lo que sirve
-- gin_trgm_ops. El `similarity` de al lado ordena por parecido para que una
-- errata siga encontrando lo que se buscaba.
--
-- El texto se escapa antes de meterlo en el patrón: sin eso, escribir «%» en el
-- buscador devuelve el grafo entero y escribir «_» hace cosas raras.
create or replace function public.graph_search(p_query text, p_limit integer default 20)
returns table (node_id uuid, label text, node_type text, entity_table text, entity_id uuid, similitud real)
language sql
stable
set search_path = public
as $fn$
  select n.id, n.label, n.node_type, n.entity_table, n.entity_id,
         extensions.similarity(n.label, p_query)
  from public.graph_nodes n
  where n.archived_at is null
    and length(btrim(coalesce(p_query, ''))) >= 2
    and n.label ilike '%' || replace(replace(replace(btrim(p_query), '\\', '\\\\'), '%', '\\%'), '_', '\\_') || '%'
  order by extensions.similarity(n.label, p_query) desc, n.label
  limit least(greatest(coalesce(p_limit, 20), 1), 100);
$fn$;

comment on function public.graph_search(text, integer) is
  'Búsqueda por trigramas sobre las etiquetas. A diferencia de graph_impact/graph_subgraph NO es security definer: aquí sí conviene que la RLS de graph_nodes haga el filtrado, porque no hay recorrido que optimizar.';


-- =============================================================================
-- PERMISOS DE EJECUCIÓN
--
-- 0010_default_privileges.sql dejó puesto esto:
--   alter default privileges in schema public grant execute on functions to anon, …
-- Es decir, TODA función nueva de este esquema nace ejecutable por `anon`. En
-- las funciones de recorrido eso se cruza con `row_security = off`, y aunque
-- `auth.uid()` sería null y saldrían por el `raise`, eso es confiar en un `if`
-- donde debería haber un permiso. Es la primera vez en el repo que la
-- combinación importa de verdad, y por eso aquí se revoca a mano.
-- =============================================================================
revoke execute on function public.graph_impact(uuid, text, integer, integer) from public, anon;
revoke execute on function public.graph_subgraph(uuid, text[], text[], integer, integer) from public, anon;
revoke execute on function public.graph_edges_of(uuid[]) from public, anon;
revoke execute on function public.graph_check_integrity() from public, anon;
grant execute on function public.graph_impact(uuid, text, integer, integer) to authenticated;
grant execute on function public.graph_subgraph(uuid, text[], text[], integer, integer) to authenticated;
grant execute on function public.graph_edges_of(uuid[]) to authenticated;
grant execute on function public.graph_check_integrity() to authenticated;

-- Las de proyección no las llama nadie desde fuera: las invocan los triggers,
-- que corren con los privilegios del dueño de la función.
revoke execute on function public.graph_system_edges(uuid, text, uuid[]) from public, anon, authenticated;
revoke execute on function public.graph_system_edges_in(uuid, text, uuid[]) from public, anon, authenticated;
revoke execute on function public.graph_node_of(uuid) from public, anon;

-- Sin estadísticas, el primer recorrido de producción planifica sobre una tabla
-- que el planificador cree vacía y elige recorrido secuencial.
analyze public.graph_nodes;
analyze public.graph_edges;
