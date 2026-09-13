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

-- `root_label` es columna nueva en un `RETURNS TABLE`: hace falta soltar la
-- función antes de poder recrearla con otra firma (`create or replace` no
-- puede cambiar las columnas de salida). Sin esto, una cadena que cita varias
-- tareas por el mismo hecho (`facts/chains.ts`) solo tenía el nombre del HECHO
-- para las tres, y una cadena de la tarea T2 en el proyecto Q se leía como si
-- T1 —la que nombraba el hecho— estuviera bajo Q.
drop function if exists public.graph_cadenas_de(uuid, uuid[], integer);
drop function if exists public.graph_cadenas(uuid[], integer);

create or replace function public.graph_cadenas_de(
  p_uid        uuid,
  p_entity_ids uuid[],
  p_max_depth  integer default 4
)
returns table (
  root_entity_id uuid, root_label text, node_id uuid, parent_id uuid, via_rel text, depth integer,
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
    select n.id, n.entity_id, n.label
    from public.graph_nodes n
    where n.entity_id = any (v_ids)
      and n.archived_at is null
      and public.graph_nodo_visible(n.scope, n.user_id, n.workspace_id, n.project_id,
                                    p_uid, v_ws, v_proj)
  ),
  camino (root_entity_id, root_label, node_id, parent_id, via_rel, depth, visitados) as (
    select r.entity_id, r.label, r.id, null::uuid, null::text, 0, array[r.id]
    from raices r
    union all
    select c.root_entity_id, c.root_label, n.id, c.node_id, e.rel_type, c.depth + 1, c.visitados || n.id
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
  select c.root_entity_id, c.root_label, c.node_id, c.parent_id, c.via_rel, c.depth,
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
  root_entity_id uuid, root_label text, node_id uuid, parent_id uuid, via_rel text, depth integer,
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


-- =============================================================================
-- 3) UNA SOLA COLA DE PROPUESTAS
--
-- `coach_proposals` crece en vez de nacer otra tabla (criterio de D-143: los
-- nombres heredados se quedan). Lo que cambia:
--
--   · `message_id` puede ser nulo: una sugerencia del grafo no sale de un turno
--     de chat. El CHECK de abajo lo sigue exigiendo cuando el origen es el coach.
--   · `fingerprint` único por usuario, como `recommendations` (0027). Único EN
--     CUALQUIER ESTADO a propósito: descartar una sugerencia tiene que
--     significar «no me la vuelvas a proponer».
--   · `aplicando` es el reclamo atómico que le faltaba a `acceptProposal`: dos
--     clics a la vez podían crear la cosa dos veces. `fallida` es el final de
--     una propuesta que no se puede cumplir (la frontera, un nodo que ya no está).
-- =============================================================================

alter table public.coach_proposals alter column message_id drop not null;

alter table public.coach_proposals
  add column if not exists origen text not null default 'coach',
  add column if not exists fact_ids text[] not null default '{}',
  add column if not exists fingerprint text;

alter table public.coach_proposals
  add constraint coach_proposals_origen_check
    check (origen in ('coach', 'chat', 'analisis', 'grafo', 'mision')),
  add constraint coach_proposals_coach_con_mensaje
    check (origen <> 'coach' or message_id is not null);

alter table public.coach_proposals drop constraint if exists coach_proposals_tipo_check;
alter table public.coach_proposals add constraint coach_proposals_tipo_check
  check (tipo in ('tarea', 'bloque', 'rutina', 'estructura', 'meta', 'arista'));

alter table public.coach_proposals drop constraint if exists coach_proposals_status_check;
alter table public.coach_proposals add constraint coach_proposals_status_check
  check (status in ('pending', 'aplicando', 'accepted', 'fallida', 'dismissed'));

create unique index if not exists idx_coach_proposals_fingerprint
  on public.coach_proposals (user_id, fingerprint);

comment on column public.coach_proposals.origen is
  'De dónde salió: coach (turno diario), chat, analisis, grafo (detectores de 0062) o mision (fase E). Ver 0062.';
comment on column public.coach_proposals.fingerprint is
  'Huella estable de la sugerencia. Única por usuario en cualquier estado: una descartada no vuelve. Ver 0062.';


-- =============================================================================
-- 4) LA ÚNICA PUERTA DE `origin = 'ai'`
--
-- La política `graph_edges_insert` sigue admitiendo solo `origin = 'user'`.
-- Esta función es security definer y hace, en UNA transacción, las cuatro
-- comprobaciones que un botón no puede garantizar:
--
--   1. La propuesta es de quien llama, es una arista y está pendiente
--      (`for update`: dos clics a la vez no pasan los dos).
--   2. La relación es de las que se pueden sugerir.
--   3. Quien llama ve los dos nodos (`graph_nodo_visible`, la regla de siempre).
--   4. Los dos nodos tienen la misma audiencia (`graph_misma_audiencia`, BR-012).
--
-- 3 y 4 devuelven un código en vez de lanzar, y dejan la propuesta `fallida`:
-- lanzar desharía también el cambio de estado, y el botón quedaría pendiente
-- para siempre. El trigger de tenant sigue ahí debajo como red.
-- =============================================================================

create or replace function public.graph_aceptar_arista(p_proposal uuid)
returns text
language plpgsql
volatile
security definer
set search_path = public
set row_security = off
as $fn$
declare
  v_uid  uuid := auth.uid();
  v_p    public.coach_proposals%rowtype;
  v_rel  text;
  v_src  public.graph_nodes%rowtype;
  v_dst  public.graph_nodes%rowtype;
  v_ws   uuid[];
  v_proj uuid[];
  v_conf numeric;
begin
  if v_uid is null then
    raise exception 'Hay que iniciar sesión.' using errcode = '42501';
  end if;

  select * into v_p
  from public.coach_proposals
  where id = p_proposal and user_id = v_uid and tipo = 'arista' and status = 'pending'
  for update;

  if v_p.id is null then
    raise exception 'Esa propuesta ya no está o ya se resolvió.' using errcode = 'P0002';
  end if;

  v_rel := v_p.payload ->> 'rel';
  if v_rel is null or v_rel not in ('supports', 'related_to', 'duplicates') then
    raise exception 'Esa relación no se puede proponer.' using errcode = '22023';
  end if;

  select * into v_src from public.graph_nodes
   where entity_id = (v_p.payload ->> 'source')::uuid and archived_at is null;
  select * into v_dst from public.graph_nodes
   where entity_id = (v_p.payload ->> 'target')::uuid and archived_at is null;

  v_ws   := public.graph_acceso_espacios_de(v_uid);
  v_proj := public.graph_acceso_proyectos_de(v_uid);

  if v_src.id is null or v_dst.id is null
     or not public.graph_nodo_visible(v_src.scope, v_src.user_id, v_src.workspace_id, v_src.project_id, v_uid, v_ws, v_proj)
     or not public.graph_nodo_visible(v_dst.scope, v_dst.user_id, v_dst.workspace_id, v_dst.project_id, v_uid, v_ws, v_proj)
  then
    update public.coach_proposals set status = 'fallida', resolved_at = now() where id = v_p.id;
    return 'no_visible';
  end if;

  if not public.graph_misma_audiencia(v_src, v_dst) then
    update public.coach_proposals set status = 'fallida', resolved_at = now() where id = v_p.id;
    return 'frontera';
  end if;

  v_conf := least(greatest(coalesce(nullif(v_p.payload ->> 'confianza', '')::numeric, 0.6), 0), 1);

  insert into public.graph_edges (source_id, rel_type, target_id, origin, created_by, confidence)
  values (v_src.id, v_rel, v_dst.id, 'ai', v_uid, v_conf)
  on conflict (source_id, rel_type, target_id) do nothing;

  update public.coach_proposals set status = 'accepted', resolved_at = now() where id = v_p.id;
  return 'creada';
end;
$fn$;

revoke all on function public.graph_aceptar_arista(uuid) from public, anon;
grant execute on function public.graph_aceptar_arista(uuid) to authenticated;

comment on function public.graph_aceptar_arista(uuid) is
  'Convierte una propuesta de arista PENDIENTE y PROPIA en una arista origin = ai. La única puerta de ai: graph_edges_insert sigue admitiendo solo user. Devuelve creada | frontera | no_visible. Ver 0062.';


-- =============================================================================
-- 5) LOS DETECTORES: EL AGENTE `graph_suggestions` QUE 0054 DEJÓ ESCRITO
--
-- Deterministas y baratos. El modelo NO busca conexiones: elige entre las que
-- esto encontró. Dos patrones, y los dos acotados:
--
--   · sin_meta: lo tuyo que no apoya nada (hábitos, y proyectos de TU espacio
--     personal —los únicos que BR-012 deja unir a una meta—) × tus metas
--     activas. Producto cruzado de 10 × 10 como mucho; decidir cuál con cuál
--     es trabajo de lenguaje, y ese sí es del modelo.
--   · posible_duplicado: tareas abiertas del mismo proyecto visible con nombres
--     casi iguales (trigramas > 0,8). No necesita modelo.
--
-- Una tarea «abierta» es la que no está Completed ni Cancelled, leído del
-- `metadata` del nodo, que ya lo lleva desde 0054.
-- =============================================================================

create or replace function public.graph_detectar_de(p_uid uuid)
returns table (
  patron text,
  source_entity_id uuid, source_label text, source_table text,
  target_entity_id uuid, target_label text, target_table text,
  rel_type text, similitud real
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
  v_ws         uuid[];
  v_proj       uuid[];
  v_personales uuid[];
begin
  if p_uid is null then
    raise exception 'Hace falta un usuario.' using errcode = '42501';
  end if;

  v_ws   := public.graph_acceso_espacios_de(p_uid);
  v_proj := public.graph_acceso_proyectos_de(p_uid);
  select coalesce(array_agg(w.id), '{}') into v_personales
  from public.workspaces w
  where w.owner_id = p_uid and w.is_personal;

  return query
  with metas as (
    select n.entity_id, n.label, n.entity_table
    from public.graph_nodes n
    join public.personal_goals g on g.id = n.entity_id
    where n.node_type = 'goal' and n.scope = 'user' and n.user_id = p_uid
      and n.archived_at is null and g.status = 'Activa'
    order by n.updated_at desc
    limit 10
  ),
  sueltos as (
    select n.entity_id, n.label, n.entity_table
    from public.graph_nodes n
    where n.archived_at is null
      and ((n.node_type = 'habit' and n.scope = 'user' and n.user_id = p_uid)
        or (n.node_type = 'project' and n.scope = 'workspace' and n.workspace_id = any (v_personales)))
      and not exists (
        select 1 from public.graph_edges e
        where e.source_id = n.id and e.rel_type = 'supports'
      )
    order by n.updated_at desc
    limit 10
  ),
  duplicados as (
    select a.entity_id as a_id, a.label as a_label, b.entity_id as b_id, b.label as b_label,
           extensions.similarity(a.label, b.label) as sim
    from public.graph_nodes a
    join public.graph_nodes b
      on b.project_id = a.project_id and b.node_type = 'task' and a.id < b.id
    where a.node_type = 'task'
      and a.archived_at is null and b.archived_at is null
      and coalesce(a.metadata ->> 'status', '') not in ('Completed', 'Cancelled')
      and coalesce(b.metadata ->> 'status', '') not in ('Completed', 'Cancelled')
      and public.graph_nodo_visible(a.scope, a.user_id, a.workspace_id, a.project_id, p_uid, v_ws, v_proj)
      -- Mismo `project_id` en el join no basta de red: sin este segundo
      -- chequeo, un `b` visible solo por casualidad de datos (o si el join de
      -- arriba cambia algún día) se coló con la sola comprobación de `a`.
      -- Barata porque `b.project_id = a.project_id` ya visible por `a` casi
      -- siempre implica lo mismo para `b`; aquí solo por si no.
      and public.graph_nodo_visible(b.scope, b.user_id, b.workspace_id, b.project_id, p_uid, v_ws, v_proj)
      and extensions.similarity(a.label, b.label) > 0.8
      and not exists (
        select 1 from public.graph_edges e
        where e.rel_type = 'duplicates'
          and ((e.source_id = a.id and e.target_id = b.id) or (e.source_id = b.id and e.target_id = a.id))
      )
    order by sim desc
    limit 10
  )
  select 'sin_meta'::text, s.entity_id, s.label, s.entity_table,
         m.entity_id, m.label, m.entity_table, 'supports'::text, null::real
  from sueltos s cross join metas m
  union all
  select 'posible_duplicado'::text, d.a_id, d.a_label, 'tasks'::text,
         d.b_id, d.b_label, 'tasks'::text, 'duplicates'::text, d.sim
  from duplicados d;
end;
$fn$;

revoke all on function public.graph_detectar_de(uuid) from public, anon, authenticated;
grant execute on function public.graph_detectar_de(uuid) to service_role;

comment on function public.graph_detectar_de(uuid) is
  'Candidatas de arista para un usuario: sin_meta (hábitos y proyectos personales sueltos × metas activas) y posible_duplicado (tareas abiertas casi iguales). Solo service_role. El modelo elige entre estas; nunca inventa. Ver 0062.';


-- =============================================================================
-- CÓMO SE REVIERTE
--
-- DESPLIEGUE: esta migración va ANTES que el código que la usa, nunca después.
-- `acceptProposal` reclama una arista con `status = 'aplicando'`, y ese estado
-- no existe en el CHECK de antes de 0062: si el código llega primero, cada
-- intento de aceptar CUALQUIER propuesta —no solo aristas— revienta el CHECK,
-- la transacción se deshace entera y el usuario ve «esa propuesta ya se
-- resolvió» sin que se haya resuelto nada. Ver la entrada de Fase C en
-- `docs/CHECKS.md`.
--
-- REVERTIR, en este orden — hay datos de por medio y el orden importa:
--
--   1) `coach_proposals`: primero las filas que el `origen`/estado de 0062
--      dejarían huérfanas o inválidas para el CHECK viejo.
--        delete from public.coach_proposals where tipo = 'arista';
--        delete from public.coach_proposals where status in ('aplicando', 'fallida');
--        -- Lo que quede con message_id nulo (origen 'grafo' o 'mision', que
--        -- 0062 dejó existir sin turno) no pasaría el NOT NULL de más abajo:
--        delete from public.coach_proposals where message_id is null;
--
--   2) Los CHECK y el NOT NULL de antes de 0062:
--        alter table public.coach_proposals drop constraint if exists coach_proposals_tipo_check;
--        alter table public.coach_proposals add constraint coach_proposals_tipo_check
--          check (tipo in ('tarea', 'bloque', 'rutina', 'estructura', 'meta'));
--        alter table public.coach_proposals drop constraint if exists coach_proposals_status_check;
--        alter table public.coach_proposals add constraint coach_proposals_status_check
--          check (status in ('pending', 'accepted', 'dismissed'));
--        alter table public.coach_proposals alter column message_id set not null;
--
--   3) Índice, constraints y columnas nuevas, y las funciones de este archivo:
--        drop index if exists public.idx_coach_proposals_fingerprint;
--        alter table public.coach_proposals drop constraint if exists coach_proposals_coach_con_mensaje;
--        alter table public.coach_proposals drop constraint if exists coach_proposals_origen_check;
--        alter table public.coach_proposals drop column if exists fingerprint;
--        alter table public.coach_proposals drop column if exists fact_ids;
--        alter table public.coach_proposals drop column if exists origen;
--        drop function if exists public.graph_detectar_de(uuid);
--        drop function if exists public.graph_aceptar_arista(uuid);
--        drop function if exists public.graph_cadenas(uuid[], integer);
--        drop function if exists public.graph_cadenas_de(uuid, uuid[], integer);
--
--   4) Las variantes por uid del precómputo de permiso NO tienen antes: 0059
--      ya las dejó sin argumento y esta migración solo les puso una copia por
--      uid delante. Basta con devolver las de siempre a llevar la condición
--      ellas mismas — el cuerpo literal de 0059 §1 — y soltar las `_de`:
--        create or replace function public.graph_acceso_espacios()
--        returns uuid[] language sql stable security definer
--        set search_path = public set row_security = off
--        as $$
--          select coalesce(array_agg(distinct w.id), '{}')
--          from public.workspaces w
--          where auth.uid() is not null
--            and (w.owner_id = auth.uid()
--              or exists (
--                select 1 from public.memberships m
--                where m.workspace_id = w.id and m.user_id = auth.uid()
--                  and m.status = 'Active' and m.role <> 'Guest'
--              ));
--        $$;
--        create or replace function public.graph_acceso_proyectos()
--        returns uuid[] language sql stable security definer
--        set search_path = public set row_security = off
--        as $$
--          select coalesce(array_agg(distinct ps.project_id), '{}')
--          from public.project_shares ps
--          join public.memberships m
--            on m.workspace_id = ps.workspace_id and m.user_id = auth.uid()
--           and m.status = 'Active' and m.role = 'Guest';
--        $$;
--        drop function if exists public.graph_acceso_espacios_de(uuid);
--        drop function if exists public.graph_acceso_proyectos_de(uuid);
--
--   5) Las aristas `origin = 'ai'` que `graph_aceptar_arista` haya creado: son
--      válidas bajo la política de 0054 (que solo exige `user`) — la política
--      nunca admitió escribir `ai` desde el cliente, y esta función tampoco
--      existe ya tras el paso 3 — así que DEJARLAS es seguro. Si se prefiere
--      borrarlas por higiene, es una decisión de producto, no de integridad:
--        -- delete from public.graph_edges where origin = 'ai';
--
-- Y regenerar `catalog.generated.ts` y `src/types/database.types.ts`.
-- =============================================================================
