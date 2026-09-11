-- =============================================================================
-- 0056 · DEPENDENCIAS ENTRE PROYECTOS, Y VISTAS SIN RAÍZ
-- =============================================================================
--
-- Dos cambios que van juntos porque responden a la misma frase: «no se ven
-- otros proyectos, sus dependencias, las relaciones entre otros proyectos».
--
--   1. Las dependencias entre proyectos NO EXISTÍAN como dato.
--      `projects.dependencies` lleva en la base desde 0003 y es una columna de
--      TEXTO LIBRE: prosa que una persona escribe y que ningún programa puede
--      recorrer. El grafo no puede dibujar una relación que solo vive como
--      frase dentro de un campo, así que no era un fallo del grafo: era que el
--      dato no estaba.
--
--   2. Las vistas de ámbito PRIVADO no tienen por dónde empezar.
--      Un espacio de trabajo es un nodo del que cuelga todo lo suyo, así que
--      recorrer desde ahí enseña el espacio entero. Lo privado no tiene
--      equivalente: no existe un «nodo usuario» del que cuelguen las metas, los
--      hábitos y el dinero. Recorrer desde una meta suelta enseña esa meta y
--      poco más, que es justo lo que se reportó.
--
-- LA COLUMNA DE TEXTO NO SE MIGRA. Adivinar a qué proyecto se refiere cada
-- frase sería inventarse datos de otra persona. Se queda donde está y en la
-- interfaz pasa a llamarse «Notas de dependencias».
-- =============================================================================


-- =============================================================================
-- 1) LA COLUMNA
--
-- `uuid[]` y no una tabla puente, por simetría con `tasks.deps` (0003): mismo
-- significado, misma forma, mismo patrón de trigger. Una tabla puente daría
-- integridad referencial de verdad —que el array no da— pero introduciría una
-- segunda manera de expresar lo mismo en el esquema, y la asimetría entre
-- «dependencias de tarea» y «dependencias de proyecto» costaría más de lo que
-- vale. Un proyecto borrado deja un uuid huérfano en el array y quien lee lo
-- ignora, exactamente como ya ocurre con `tasks.deps` y con `comments.subject_id`.
-- =============================================================================

alter table public.projects
  add column if not exists depends_on uuid[] not null default '{}'::uuid[];

comment on column public.projects.depends_on is
  'Proyectos que tienen que avanzar antes que este. Es el equivalente de tasks.deps a nivel de cartera, y lo que el grafo proyecta como relación `depends_on`. NO confundir con `dependencies`, que es texto libre y se conserva como notas.';

comment on column public.projects.dependencies is
  'Notas en prosa sobre dependencias. Desde 0056 la relación REAL vive en `depends_on`; esta columna se conserva tal cual porque su contenido no se puede traducir sin inventar.';

-- Un proyecto que depende de sí mismo se bloquea para siempre. Es lo único que
-- se puede comprobar sin mirar otras filas; los ciclos de dos o más saltos los
-- ataja la Server Action antes de escribir (ver domain/execution/project-deps.ts).
alter table public.projects
  drop constraint if exists projects_depends_on_no_propio;
alter table public.projects
  add constraint projects_depends_on_no_propio check (not (id = any (depends_on)));


-- =============================================================================
-- 2) LA PROYECCIÓN AL GRAFO
--
-- Mismo sentido que en las tareas: la flecha sale del proyecto que depende, y
-- `depends_on` está marcada como `reversed` en el catálogo, así que el impacto
-- viaja al revés —de aquello de lo que depende hacia él—. Es lo que hace que
-- «si este proyecto se retrasa, ¿qué se rompe?» conteste lo correcto.
-- =============================================================================

create or replace function public.graph_edges_project()
returns trigger
language plpgsql security definer set search_path = public set row_security = off
as $fn$
declare
  v_node uuid := public.graph_node_of(new.id);
  v_deps uuid[];
begin
  if v_node is null then return null; end if;

  perform public.graph_system_edges(v_node, 'belongs_to',
    array[public.graph_node_of(new.workspace_id)]);

  -- Los uuid huérfanos —proyectos borrados que siguen en el array— se caen
  -- solos aquí: `graph_node_of` devuelve null y el filtro los descarta.
  select coalesce(array_agg(public.graph_node_of(d)) filter (where public.graph_node_of(d) is not null), '{}')
    into v_deps
  from unnest(coalesce(new.depends_on, '{}'::uuid[])) as d;

  perform public.graph_system_edges(v_node, 'depends_on', v_deps);
  return null;
end;
$fn$;

-- `depends_on` entra en la lista de `update of`: sin esto el trigger no se
-- dispara al cambiarlas y el grafo se queda con las de antes.
drop trigger if exists trg_graph_projects_b_aristas on public.projects;
create trigger trg_graph_projects_b_aristas
  after insert or update of workspace_id, depends_on on public.projects
  for each row execute function public.graph_edges_project();


-- =============================================================================
-- 3) LAS VISTAS SIN RAÍZ
--
-- `graph_subgraph` y `graph_impact` RECORREN desde un nodo. Eso es lo correcto
-- para «qué cuelga de esto», y es justo lo que no sirve para «enséñame todas
-- mis metas y mis hábitos»: no hay un nodo del que cuelguen.
--
-- Esta función no recorre nada. Devuelve TUS nodos de los tipos que se pidan,
-- y el lienzo pide después las aristas entre ellos con `graph_edges_of`, que ya
-- existe. Mismo contrato de seguridad que las otras dos —y por eso mismo
-- conviene leer aquí el porqué de cada `set`, que es idéntico al de 0054—:
-- camina con la seguridad por filas apagada, así que la protegen las
-- comprobaciones de dentro y no la RLS.
--
-- El tope NO es cosmético: sin él, una petición de todos los nodos de un
-- espacio con cien mil tareas devolvería cien mil filas a un navegador que va a
-- dibujar unos cientos.
-- =============================================================================

create or replace function public.graph_all(
  -- `default null` = todos los tipos, igual que en graph_subgraph. Además hace
  -- que el argumento sea opcional en el tipo generado de PostgREST, que es lo
  -- que permite omitirlo desde TypeScript en vez de inventar una lista.
  p_node_types text[] default null,
  p_scope text default 'user',
  p_limit integer default 500
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
  v_total integer;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión para leer el grafo.' using errcode = '42501';
  end if;
  p_limit := least(greatest(coalesce(p_limit, 500), 1), 2000);

  -- Dos conjuntos y no uno, por la misma razón que en 0054: un Guest es miembro
  -- activo del espacio, así que `is_workspace_member()` le diría que sí a todo;
  -- lo que le limita a sus proyectos compartidos es `project_shares`.
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

  select count(*) into v_total
  from public.graph_nodes n
  where n.archived_at is null
    and n.scope = p_scope
    and (p_node_types is null or n.node_type = any (p_node_types))
    and ((n.scope = 'user' and n.user_id = v_uid)
      or (n.scope = 'workspace' and n.workspace_id = any (v_ws))
      or (n.scope = 'workspace' and n.project_id = any (v_proj)));

  return query
  select n.id, 0, n.label, n.node_type, n.entity_table, n.entity_id,
         n.scope, n.metadata, v_total > p_limit
  from public.graph_nodes n
  where n.archived_at is null
    and n.scope = p_scope
    and (p_node_types is null or n.node_type = any (p_node_types))
    and ((n.scope = 'user' and n.user_id = v_uid)
      or (n.scope = 'workspace' and n.workspace_id = any (v_ws))
      or (n.scope = 'workspace' and n.project_id = any (v_proj)))
  -- Por etiqueta y no por fecha: si el recorte corta, que corte siempre por el
  -- mismo sitio. Un tope que devuelve un subconjunto distinto en cada carga
  -- hace que la pantalla parpadee sin que nada haya cambiado.
  order by n.label, n.id
  limit p_limit;
end;
$fn$;

comment on function public.graph_all(text[], text, integer) is
  'Todos los nodos visibles de unos tipos, SIN recorrer desde ninguna raíz. Para las vistas de ámbito privado, que no tienen un nodo contenedor del que colgar. Ver 0056.';

-- 0010 concede EXECUTE a `anon` sobre toda función nueva de este esquema, y
-- esta camina con `row_security = off`: se revoca a mano, igual que en 0054.
revoke execute on function public.graph_all(text[], text, integer) from public, anon;
grant  execute on function public.graph_all(text[], text, integer) to authenticated;
