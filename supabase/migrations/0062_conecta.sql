-- =============================================================================
-- 0062 · CONECTA: EL GRAFO ENTRA EN LA IA
-- =============================================================================
--
-- Hasta aquí el grafo no tenía ningún consumidor de IA: el chat, el coach y
-- `analyze` razonaban sobre hechos sueltos. Esta migración pone las tres piezas
-- de base para que dejen de serlo, y ninguna abre una política:
--
--   1) El precómputo de permiso, por uid. El coach corre SIN sesión y
--      `auth.uid()` es null allí; en vez de copiar el precómputo, las
--      versiones de siempre pasan a delegar en la nueva.
--   2) `graph_cadenas[_de]`: «a qué pertenece y qué apoya esto», recorriendo
--      las aristas en el sentido en que están guardadas. `graph_impact` no
--      sirve para eso: mezcla sentidos (belongs_to va marcada `reversed` y
--      supports no), y subir de una tarea a su meta no es ni upstream ni
--      downstream en su lenguaje.
--   3) `coach_proposals` crece hasta ser la cola única de propuestas.
--   4) `graph_aceptar_arista`: la única puerta por la que entra `origin = 'ai'`.
--   5) `graph_detectar_de`: los detectores deterministas que alimentan la cola.
--
-- LA REGLA DE LAS `_de`: reciben el usuario como argumento y caminan con
-- `row_security = off`, así que se revocan a `anon` y `authenticated`. Solo
-- las ejecuta el servidor. Ver D-152 y `supabase/tests/0033…0035`.
--
-- Ver `docs/superpowers/specs/2026-09-13-sistema-cognitivo-design.md` §C.
-- =============================================================================


-- =============================================================================
-- 1) EL PRECÓMPUTO DE PERMISO, POR UID
--
-- Mismo cuerpo que 0059 con `auth.uid()` sustituido por `p_uid`. Las versiones
-- sin argumento se quedan —las usan las cuatro funciones de recorrido— pero ya
-- no llevan la condición: la leen de aquí. Una sola copia, igual que 0059 dejó
-- el predicado.
-- =============================================================================

create or replace function public.graph_acceso_espacios_de(p_uid uuid)
returns uuid[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $fn$
  select coalesce(array_agg(distinct w.id), '{}')
  from public.workspaces w
  where p_uid is not null
    and (w.owner_id = p_uid
      or exists (
        select 1 from public.memberships m
        where m.workspace_id = w.id and m.user_id = p_uid
          and m.status = 'Active' and m.role <> 'Guest'
      ));
$fn$;

create or replace function public.graph_acceso_proyectos_de(p_uid uuid)
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
    on m.workspace_id = ps.workspace_id and m.user_id = p_uid
   and m.status = 'Active' and m.role = 'Guest';
$fn$;

create or replace function public.graph_acceso_espacios()
returns uuid[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $fn$
  select public.graph_acceso_espacios_de(auth.uid());
$fn$;

create or replace function public.graph_acceso_proyectos()
returns uuid[]
language sql
stable
security definer
set search_path = public
set row_security = off
as $fn$
  select public.graph_acceso_proyectos_de(auth.uid());
$fn$;

revoke all on function public.graph_acceso_espacios_de(uuid)  from public, anon, authenticated, service_role;
revoke all on function public.graph_acceso_proyectos_de(uuid) from public, anon, authenticated, service_role;

comment on function public.graph_acceso_espacios_de(uuid) is
  'graph_acceso_espacios() para un usuario dado. La única copia de la condición desde 0062. Revocada a todos: la llaman funciones security definer.';
comment on function public.graph_acceso_proyectos_de(uuid) is
  'graph_acceso_proyectos() para un usuario dado. La única copia de la condición desde 0062. Revocada a todos.';


-- =============================================================================
-- 2) LAS CADENAS: A QUÉ PERTENECE Y QUÉ APOYA ESTO
--
-- Solo tres relaciones, y en el sentido guardado: belongs_to (tarea → proyecto),
-- child_of (subtarea → tarea) y supports (hábito/proyecto → meta). No sube a un
-- espacio ni a una persona: «esta tarea pertenece a Equipo X» no le dice a
-- nadie para qué sirve.
--
-- El filtro de cada salto es `graph_nodo_visible`, igual que en las cuatro de
-- 0059, y la raíz también lo pasa: una raíz invisible no devuelve nada, ni un
-- error que confirme que existe.
-- =============================================================================

create or replace function public.graph_cadenas_de(
  p_uid        uuid,
  p_entity_ids uuid[],
  p_max_depth  integer default 4
)
returns table (
  root_entity_id uuid, node_id uuid, parent_id uuid, via_rel text, depth integer,
  label text, node_type text, entity_table text, entity_id uuid
)
language plpgsql
stable
security definer
set search_path = public
set row_security = off
set statement_timeout = '5s'
as $fn$
#variable_conflict use_column
declare
  v_ws   uuid[];
  v_proj uuid[];
  v_ids  uuid[] := coalesce(p_entity_ids, '{}');
begin
  if p_uid is null then
    raise exception 'Hay que iniciar sesión para recorrer el grafo.' using errcode = '42501';
  end if;
  p_max_depth := least(greatest(coalesce(p_max_depth, 4), 1), 6);
  if cardinality(v_ids) > 50 then
    v_ids := v_ids[1:50];
  end if;

  v_ws   := public.graph_acceso_espacios_de(p_uid);
  v_proj := public.graph_acceso_proyectos_de(p_uid);

  return query
  with recursive raices as (
    select n.id, n.entity_id
    from public.graph_nodes n
    where n.entity_id = any (v_ids)
      and n.archived_at is null
      and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                                    p_uid, v_ws, v_proj)
  ),
  camino (root_entity_id, node_id, parent_id, via_rel, depth, visitados) as (
    select r.entity_id, r.id, null::uuid, null::text, 0, array[r.id]
    from raices r
    union all
    select c.root_entity_id, n.id, c.node_id, e.rel_type, c.depth + 1, c.visitados || n.id
    from camino c
    join public.graph_edges e
      on e.source_id = c.node_id
     and e.rel_type in ('belongs_to', 'child_of', 'supports')
    join public.graph_nodes n on n.id = e.target_id
    where c.depth < p_max_depth
      and not (n.id = any (c.visitados))
      and n.archived_at is null
      and n.node_type not in ('workspace', 'person')
      and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                                    p_uid, v_ws, v_proj)
  )
  select c.root_entity_id, c.node_id, c.parent_id, c.via_rel, c.depth,
         n.label, n.node_type, n.entity_table, n.entity_id
  from camino c
  join public.graph_nodes n on n.id = c.node_id
  where c.depth > 0
  order by c.root_entity_id, c.depth, n.label;
end;
$fn$;

create or replace function public.graph_cadenas(
  p_entity_ids uuid[],
  p_max_depth  integer default 4
)
returns table (
  root_entity_id uuid, node_id uuid, parent_id uuid, via_rel text, depth integer,
  label text, node_type text, entity_table text, entity_id uuid
)
language plpgsql
stable
security definer
set search_path = public
as $fn$
begin
  if auth.uid() is null then
    raise exception 'Hay que iniciar sesión para recorrer el grafo.' using errcode = '42501';
  end if;
  return query select * from public.graph_cadenas_de(auth.uid(), p_entity_ids, p_max_depth);
end;
$fn$;

revoke all on function public.graph_cadenas_de(uuid, uuid[], integer) from public, anon, authenticated;
grant execute on function public.graph_cadenas_de(uuid, uuid[], integer) to service_role;
revoke all on function public.graph_cadenas(uuid[], integer) from public, anon;
grant execute on function public.graph_cadenas(uuid[], integer) to authenticated;

comment on function public.graph_cadenas_de(uuid, uuid[], integer) is
  'A qué pertenece y qué apoya cada entidad (belongs_to, child_of, supports, en el sentido guardado), para un usuario dado. Solo service_role: el coach corre sin sesión. Ver 0062 y D-152.';
comment on function public.graph_cadenas(uuid[], integer) is
  'graph_cadenas_de para la sesión actual. Es la que usan el chat y analyze.';
