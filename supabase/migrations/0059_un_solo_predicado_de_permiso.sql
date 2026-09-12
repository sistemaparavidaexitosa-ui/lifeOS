-- =============================================================================
-- 0059 · UN SOLO PREDICADO DE PERMISO
-- =============================================================================
--
-- Cuatro funciones recorren el grafo con `row_security = off`: `graph_impact`,
-- `graph_subgraph`, `graph_all` y `graph_edges_of`. La RLS no las protege —lo
-- dice `docs/SECURITY.md` y lo repite el comentario de 0054—, las protege el
-- código de dentro. Y ese código está escrito SIETE VECES:
--
--   graph_impact    · comprobación de la raíz + filtro de cada salto   (2)
--   graph_subgraph  · comprobación de la raíz + filtro de cada salto   (2)
--   graph_all       · el conteo + la consulta                         (2)
--   graph_edges_of  · la CTE `visibles`                               (1)
--
-- Más el precómputo de los dos conjuntos de permiso, copiado cuatro veces.
--
-- Hoy las siete copias son idénticas carácter a carácter. Ese es justamente el
-- momento de unificarlas: el modo de fallo de este patrón no es que alguien
-- escriba mal una copia, es que alguien ARREGLE seis. Un cambio en la regla del
-- Guest aplicado a seis de siete no da error, no rompe ninguna prueba que mire
-- las otras seis, y deja un agujero en la séptima. La regla de la frontera ya
-- vive en una sola función desde 0055 (`graph_misma_audiencia`, D-131) y por
-- esta misma razón; esto es terminar ese trabajo en la otra mitad del módulo.
--
-- LO QUE NO CAMBIA: ni una firma, ni un mensaje de error, ni un `set`, ni la
-- volatilidad, ni el orden de los resultados. Los cuerpos nuevos se generaron
-- transformando los que había —sustituyendo el precómputo y el predicado, y
-- nada más—, no reescribiéndolos a mano.
--
-- POR QUÉ EL PREDICADO ES `sql` E `immutable` Y NO `security definer`:
-- porque tiene que poder EMBEBERSE. Una función `sql` de una sola expresión que
-- no sea `security definer` ni `strict` la sustituye el planificador por su
-- cuerpo, y entonces `graph_all` puede seguir usando `idx_graph_nodes_ws` y
-- `idx_graph_nodes_user`. Con `security definer` dejaría de embeberse, el filtro
-- pasaría a evaluarse fila a fila y esos índices dejarían de servir — sin que
-- nada fallara, solo más despacio cada mes. Hay dos assertions en
-- `0030_un_solo_predicado.sql` que vigilan esas cuatro propiedades.
--
-- Ver `docs/UNIVERSAL_GRAPH_ROADMAP.md` §M3 y D-145/D-146.
-- =============================================================================


-- =============================================================================
-- 1) LOS DOS CONJUNTOS DE PERMISO
--
-- Dos y no uno, y esto es lo que hay que entender antes de tocarlo: un Guest es
-- miembro ACTIVO del espacio, así que `is_workspace_member()` le dice que sí a
-- todo el espacio. Lo que lo limita a sus proyectos es `project_shares`. Un
-- solo conjunto le habría regalado el grafo entero — está escrito como riesgo
-- nº 1 en el plan de 0054, y sigue siendo cierto.
-- =============================================================================

create or replace function public.graph_acceso_espacios()
returns uuid[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $fn$
  select coalesce(array_agg(distinct w.id), '{}')
  from public.workspaces w
  where auth.uid() is not null
    and (w.owner_id = auth.uid()
      or exists (
        select 1 from public.memberships m
        where m.workspace_id = w.id and m.user_id = auth.uid()
          and m.status = 'Active' and m.role <> 'Guest'
      ));
$fn$;

comment on function public.graph_acceso_espacios() is
  'Los espacios cuyo grafo se puede recorrer entero: donde eres dueña o miembro activo NO Guest. Un Guest queda fuera a propósito — lo suyo lo decide graph_acceso_proyectos(). Ver 0059.';

create or replace function public.graph_acceso_proyectos()
returns uuid[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $fn$
  select coalesce(array_agg(distinct ps.project_id), '{}')
  from public.project_shares ps
  join public.memberships m
    on m.workspace_id = ps.workspace_id and m.user_id = auth.uid()
   and m.status = 'Active' and m.role = 'Guest';
$fn$;

comment on function public.graph_acceso_proyectos() is
  'Los proyectos sueltos que alcanza un Guest por project_shares. La otra mitad del permiso: sin esto, un Guest vería el espacio entero. Ver 0059.';


-- =============================================================================
-- 2) EL PREDICADO
--
-- Recibe los campos sueltos y no la fila entera (`graph_nodes`) a propósito:
-- construir el registro completo para pasarlo obliga a materializarlo y estorba
-- al planificador justo donde más importa, en el `where` de `graph_all`.
--
-- Y NO es `strict`. Con `strict`, un `project_id` nulo —que lo es en casi todos
-- los nodos— haría que la función devolviera null sin mirar nada, y la primera
-- rama, la de los nodos privados, dejaría de evaluarse. El comportamiento
-- correcto es el de las tres comparaciones sueltas: null se propaga dentro de su
-- rama y el `or` lo absorbe.
-- =============================================================================

create or replace function public.graph_nodo_visible(
  p_scope        text,
  p_user_id      uuid,
  p_workspace_id uuid,
  p_project_id   uuid,
  p_uid          uuid,
  p_ws           uuid[],
  p_proj         uuid[]
)
returns boolean
language sql
immutable
as $fn$
  select (p_scope = 'user'      and p_user_id      = p_uid)
      or (p_scope = 'workspace' and p_workspace_id = any (p_ws))
      or (p_scope = 'workspace' and p_project_id   = any (p_proj));
$fn$;

comment on function public.graph_nodo_visible(text, uuid, uuid, uuid, uuid, uuid[], uuid[]) is
  'Si un nodo es visible para quien recorre, dados los dos conjuntos de permiso. La ÚNICA copia de esta condición: hasta 0059 estaba escrita siete veces. `sql` + `immutable` + sin security definer para que el planificador la embeba. Ver D-145.';


-- =============================================================================
-- 3) LAS CUATRO FUNCIONES DE RECORRIDO
--
-- Cuerpos transformados, no reescritos: se sustituyó el precómputo por las dos
-- llamadas y el predicado por la función, y no se tocó nada más. Todo lo demás
-- —los topes, el `distinct on`, los mensajes, el orden de salida— es literal.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.graph_impact(p_root uuid, p_direction text DEFAULT 'downstream'::text, p_max_depth integer DEFAULT 6, p_max_nodes integer DEFAULT 500)
 RETURNS TABLE(node_id uuid, parent_id uuid, via_rel text, depth integer, label text, node_type text, entity_table text, entity_id uuid, truncated boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
 SET statement_timeout TO '5s'
AS $function$
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

  v_ws   := public.graph_acceso_espacios();
  v_proj := public.graph_acceso_proyectos();

  -- ESTE `if` ES LA POLÍTICA. A partir de aquí no hay red.
  if not exists (
    select 1 from public.graph_nodes n
    where n.id = p_root
      and n.archived_at is null
      and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                              v_uid, v_ws, v_proj)
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
        and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                              v_uid, v_ws, v_proj)
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
$function$

;

CREATE OR REPLACE FUNCTION public.graph_subgraph(p_root uuid, p_node_types text[] DEFAULT NULL::text[], p_rel_types text[] DEFAULT NULL::text[], p_max_depth integer DEFAULT 2, p_max_nodes integer DEFAULT 500)
 RETURNS TABLE(node_id uuid, depth integer, label text, node_type text, entity_table text, entity_id uuid, scope text, metadata jsonb, truncated boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
 SET statement_timeout TO '5s'
AS $function$
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

  v_ws   := public.graph_acceso_espacios();
  v_proj := public.graph_acceso_proyectos();

  if not exists (
    select 1 from public.graph_nodes n
    where n.id = p_root and n.archived_at is null
      and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                              v_uid, v_ws, v_proj)
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
      and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                              v_uid, v_ws, v_proj);

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
$function$

;

CREATE OR REPLACE FUNCTION public.graph_all(p_node_types text[] DEFAULT NULL::text[], p_scope text DEFAULT 'user'::text, p_limit integer DEFAULT 500)
 RETURNS TABLE(node_id uuid, depth integer, label text, node_type text, entity_table text, entity_id uuid, scope text, metadata jsonb, truncated boolean)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
 SET row_security TO 'off'
 SET statement_timeout TO '5s'
AS $function$
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

  v_ws   := public.graph_acceso_espacios();
  v_proj := public.graph_acceso_proyectos();

  select count(*) into v_total
  from public.graph_nodes n
  where n.archived_at is null
    and n.scope = p_scope
    and (p_node_types is null or n.node_type = any (p_node_types))
    and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                              v_uid, v_ws, v_proj);

  return query
  select n.id, 0, n.label, n.node_type, n.entity_table, n.entity_id,
         n.scope, n.metadata, v_total > p_limit
  from public.graph_nodes n
  where n.archived_at is null
    and n.scope = p_scope
    and (p_node_types is null or n.node_type = any (p_node_types))
    and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                              v_uid, v_ws, v_proj)
  -- Por etiqueta y no por fecha: si el recorte corta, que corte siempre por el
  -- mismo sitio. Un tope que devuelve un subconjunto distinto en cada carga
  -- hace que la pantalla parpadee sin que nada haya cambiado.
  order by n.label, n.id
  limit p_limit;
end;
$function$

;


-- La séptima copia vivía en dos CTE y en la de `visibles`. Aquí la forma sí
-- cambia —las CTE `permiso` y `guest` se funden en una— porque esta función es
-- `sql` y no plpgsql: no tiene variables donde guardar los conjuntos, así que
-- los lleva una fila de una sola columna por cada uno.
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
    select public.graph_acceso_espacios()  as ws,
           public.graph_acceso_proyectos() as proj,
           auth.uid()                      as uid
  ), visibles as (
    select n.id
    from public.graph_nodes n, permiso p
    where n.id = any (p_nodes)
      and n.archived_at is null
      and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                                    p.uid, p.ws, p.proj)
  )
  select e.source_id, e.rel_type, e.target_id, e.origin, e.weight, e.confidence
  from public.graph_edges e
  where e.source_id in (select id from visibles)
    and e.target_id in (select id from visibles);
$fn$;


-- =============================================================================
-- 4) PERMISOS DE EJECUCIÓN
--
-- Las cuatro de recorrido conservan los suyos: `create or replace function` no
-- toca la lista de permisos de una función que ya existía. Se reafirman de
-- todos modos, que es barato y deja el archivo autocontenido.
--
-- Las tres nuevas hay que revocarlas: `0010_default_privileges.sql` concede
-- EXECUTE a `anon` sobre toda función nueva del esquema.
-- =============================================================================

revoke execute on function public.graph_acceso_espacios()  from public, anon, authenticated;
revoke execute on function public.graph_acceso_proyectos() from public, anon, authenticated;

revoke execute on function public.graph_nodo_visible(text, uuid, uuid, uuid, uuid, uuid[], uuid[])
  from public, anon;
grant  execute on function public.graph_nodo_visible(text, uuid, uuid, uuid, uuid, uuid[], uuid[])
  to authenticated;

revoke execute on function public.graph_impact(uuid, text, integer, integer) from public, anon;
revoke execute on function public.graph_subgraph(uuid, text[], text[], integer, integer) from public, anon;
revoke execute on function public.graph_all(text[], text, integer) from public, anon;
revoke execute on function public.graph_edges_of(uuid[]) from public, anon;
grant  execute on function public.graph_impact(uuid, text, integer, integer) to authenticated;
grant  execute on function public.graph_subgraph(uuid, text[], text[], integer, integer) to authenticated;
grant  execute on function public.graph_all(text[], text, integer) to authenticated;
grant  execute on function public.graph_edges_of(uuid[]) to authenticated;


-- =============================================================================
-- 5) QUE NO SE HAYA PERDIDO NADA POR EL CAMINO
--
-- Las cuatro funciones caminan con la RLS apagada, y lo que las hace seguras son
-- sus `set` y su volatilidad: `row_security = off` sin `stable` sería una
-- función que puede escribir con la seguridad quitada. Recrear un cuerpo es
-- justo el momento en que esas propiedades se pierden sin que nadie lo note.
-- =============================================================================

do $$
declare
  v_mal text;
begin
  select string_agg(p.proname, ', ') into v_mal
  from pg_proc p
  join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and p.proname in ('graph_impact', 'graph_subgraph', 'graph_all', 'graph_edges_of')
    and (p.provolatile <> 's'
      or not p.prosecdef
      or not (p.proconfig @> array['row_security=off'])
      or not (p.proconfig @> array['search_path=public'])
      or not (p.proconfig @> array['statement_timeout=5s']));

  if v_mal is not null then
    raise exception 'graph: estas funciones perdieron sus garantías al recrearse: %', v_mal
      using errcode = 'P0001';
  end if;

  -- Y el predicado tiene que poder embeberse, o `graph_all` deja de usar sus
  -- índices en silencio.
  if exists (
    select 1 from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'graph_nodo_visible'
      and (p.prosecdef or p.proisstrict or p.provolatile <> 'i'
           or p.prolang <> (select oid from pg_language where lanname = 'sql'))
  ) then
    raise exception
      'graph: graph_nodo_visible tiene que ser sql + immutable + no strict + no security definer para que el planificador la embeba.'
      using errcode = 'P0001';
  end if;
end $$;


-- =============================================================================
-- CÓMO SE REVIERTE
--
-- Las cuatro funciones conservan nombre y firma, así que revertir es volver a
-- ejecutar sus `create or replace function` originales: `graph_impact`,
-- `graph_subgraph` y `graph_edges_of` están literales en
-- `0054_execution_graph.sql` §14, y `graph_all` en
-- `0056_dependencias_entre_proyectos.sql` §3. Ningún trigger, ninguna tabla y
-- ninguna fila se tocan aquí, así que no hay nada más que deshacer.
--
--   drop function if exists public.graph_nodo_visible(text, uuid, uuid, uuid, uuid, uuid[], uuid[]);
--   drop function if exists public.graph_acceso_proyectos();
--   drop function if exists public.graph_acceso_espacios();
-- =============================================================================
