-- =============================================================================
-- 0055 · LA FRONTERA DEL GRAFO SE REDEFINE, NO SE ABRE
-- =============================================================================
--
-- QUÉ CAMBIA Y POR QUÉ
-- La 0054 prohibió que una arista uniera un nodo privado con uno de un espacio
-- de trabajo. La regla era «los dos extremos tienen el mismo dueño», y su
-- consecuencia, aceptada entonces a conciencia, era que el grafo personal y el
-- de trabajo quedaban como dos mundos sin una sola línea entre ellos.
--
-- Al usarlo, esa consecuencia resultó ser más cara de lo previsto: «tampoco veo
-- las relaciones entre todos los módulos». Una meta personal que se persigue a
-- través de un proyecto es exactamente la clase de relación que un sistema
-- operativo personal existe para enseñar, y estaba prohibida.
--
-- LA REGLA NUEVA NO ES «SE PERMITE CRUZAR». Es más precisa que la vieja:
--
--     dos nodos se pueden unir si los ve EXACTAMENTE la misma persona.
--
-- El espacio personal cumple eso y el compartido no, y no es una opinión: desde
-- la 0030 hay dos guardas que impiden invitar a nadie a un espacio personal y
-- meter a un miembro ajeno, más un índice único parcial que garantiza uno por
-- persona. Una arista entre un hábito tuyo y un proyecto de tu espacio personal
-- no se le puede enseñar a nadie porque ahí dentro no hay nadie más.
--
-- LO QUE SIGUE PROHIBIDO, y sigue lanzando igual que antes: cualquier arista
-- que toque un espacio COMPARTIDO desde fuera. Ahí es donde BR-012 importaba de
-- verdad y ahí no se toca nada.
--
-- EL AGUJERO QUE ESTA MIGRACIÓN TIENE QUE CERRAR, porque abrir lo de arriba sin
-- esto sería peor que no abrirlo: `moveProject` puede sacar un proyecto del
-- espacio personal y llevarlo a uno compartido. Una arista legal hoy pasaría
-- mañana a cruzar de verdad sin que nadie la hubiera tocado. Ver §2.
-- =============================================================================


-- =============================================================================
-- 1) LA REGLA, EN UNA FUNCIÓN QUE PUEDEN COMPARTIR EL TRIGGER Y LA AUDITORÍA
--
-- Vive aparte y no dentro del trigger a propósito: `graph_check_integrity()`
-- tiene que preguntar EXACTAMENTE lo mismo. Con la condición escrita dos veces,
-- el día que una cambie la otra dejaría de detectar lo que ya no cumple.
-- =============================================================================

create or replace function public.graph_misma_audiencia(
  a public.graph_nodes, b public.graph_nodes
)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $fn$
  select
    -- La regla de la 0054: mismo ámbito y mismo dueño.
    (a.scope = b.scope
       and a.workspace_id is not distinct from b.workspace_id
       and a.user_id     is not distinct from b.user_id)
    -- O uno privado y el otro en el espacio PERSONAL de esa misma persona.
    -- Se comprueba en los dos sentidos porque una arista tiene origen y
    -- destino, y cuál de los dos es el privado depende de quién la dibujó.
    or exists (
      select 1 from public.workspaces w
      where a.scope = 'user' and b.scope = 'workspace'
        and w.id = b.workspace_id and w.is_personal and w.owner_id = a.user_id
    )
    or exists (
      select 1 from public.workspaces w
      where b.scope = 'user' and a.scope = 'workspace'
        and w.id = a.workspace_id and w.is_personal and w.owner_id = b.user_id
    );
$fn$;

comment on function public.graph_misma_audiencia(public.graph_nodes, public.graph_nodes) is
  'Si dos nodos los ve exactamente la misma persona, que es la condición para poder unirlos con una arista. Sustituye a la comparación literal de dueños de la 0054; ver el encabezado de 0055.';


-- El trigger de la 0054, reescrito sobre la regla nueva.
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
  v_privado public.graph_nodes%rowtype;
  v_espacio public.graph_nodes%rowtype;
begin
  -- Orden determinista por uuid: sin él, dos aristas inversas creadas a la vez
  -- bloquean las mismas filas en orden contrario y se abrazan en interbloqueo.
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

  if not public.graph_misma_audiencia(v_src, v_dst) then
    -- errcode P0001 (el de por defecto) A PROPÓSITO: describeDbError() traduce
    -- 23514 y 42501 a genéricos que se comerían este mensaje, que es justo el
    -- que la persona necesita leer. Ver src/lib/supabase/errors.ts.
    raise exception
      'No se puede relacionar «%» con «%»: uno es tuyo y el otro vive en un espacio compartido. Dentro de tu espacio personal sí puedes unirlos.',
      coalesce(v_src.label, '?'), coalesce(v_dst.label, '?')
      using detail = 'graph.cross_tenant';
  end if;

  if v_src.scope = v_dst.scope then
    new.workspace_id := v_src.workspace_id;
    new.user_id      := v_src.user_id;
  else
    -- Arista mixta dentro del espacio personal. Lleva las DOS columnas: el
    -- usuario del lado privado y el espacio del otro. No se puede tomar solo
    -- las del origen, porque la mitad de la información está en el destino.
    if v_src.scope = 'user' then
      v_privado := v_src; v_espacio := v_dst;
    else
      v_privado := v_dst; v_espacio := v_src;
    end if;
    new.user_id      := v_privado.user_id;
    new.workspace_id := v_espacio.workspace_id;
  end if;

  -- Si los dos extremos cuelgan de proyectos distintos gana el del origen: la
  -- arista se ve solo si ves el proyecto de donde SALE. Es el lado conservador.
  new.project_id := coalesce(v_src.project_id, v_dst.project_id);
  return new;
end;
$fn$;


-- =============================================================================
-- 2) EL AGUJERO: MUDAR UN PROYECTO FUERA DEL ESPACIO PERSONAL
--
-- `moveProject` (src/lib/workspaces/actions.ts) cambia `projects.workspace_id`.
-- Sacar un proyecto del espacio personal y llevarlo a uno compartido convierte
-- en ilegal cualquier arista que ese proyecto tuviera con un nodo privado, y
-- nadie la ha tocado: lo que cambió fue el suelo bajo sus pies.
--
-- POR QUÉ SE BORRAN Y NO SE RECHAZA LA MUDANZA
-- Mover un proyecto es una acción de /execution, una pantalla que no sabe nada
-- de grafos. Hacerla fallar porque alguien dibujó una línea en otro módulo
-- sería convertir una función nueva en un obstáculo para una que ya existía.
-- Se borra la arista, que es lo único que deja de ser cierto, y se deja rastro
-- en `audit_log` para que la desaparición no sea un misterio.
--
-- Esto va en el MISMO trigger que re-etiqueta los nodos, así que ocurre en la
-- misma transacción que el UPDATE: no existe un instante en el que el proyecto
-- ya esté compartido y la arista todavía viva.
-- =============================================================================

create or replace function public.graph_reproject_project()
returns trigger
language plpgsql
security definer
set search_path = public
set row_security = off
as $fn$
declare
  v_borradas integer := 0;
  v_dueno uuid;
begin
  update public.graph_nodes n
     set workspace_id = new.workspace_id, updated_at = now()
   where n.project_id = new.id
     and n.workspace_id is distinct from new.workspace_id;

  update public.graph_edges e
     set workspace_id = new.workspace_id
   where e.project_id = new.id
     and e.workspace_id is distinct from new.workspace_id;

  -- Las que han dejado de ser legales por la mudanza. Se comprueba con la MISMA
  -- función que usa el trigger de creación: si un día la regla cambia, esto
  -- cambia con ella sin que haya que acordarse.
  with fuera as (
    delete from public.graph_edges e
    using public.graph_nodes s, public.graph_nodes t
    where e.source_id = s.id
      and e.target_id = t.id
      and (s.project_id = new.id or t.project_id = new.id)
      and not public.graph_misma_audiencia(s, t)
    returning e.user_id
  )
  -- `(array_agg(...))[1]` y no `max(...)`: Postgres no tiene agregado max para
  -- uuid. Cualquiera de los dueños vale para el rastro —todas las aristas
  -- borradas por una mudanza son de la misma persona, la dueña del espacio
  -- personal del que sale el proyecto—.
  select count(*), (array_agg(user_id))[1] into v_borradas, v_dueno from fuera;

  if v_borradas > 0 then
    insert into public.audit_log (user_id, action, object, meta)
    values (v_dueno, 'graph.edges.dropped_on_move', new.id::text,
            jsonb_build_object('borradas', v_borradas, 'workspace_id', new.workspace_id));
  end if;

  return null;
end;
$fn$;


-- La auditoría, sobre la misma regla.
create or replace function public.graph_check_integrity()
returns table (source_id uuid, rel_type text, target_id uuid, motivo text)
language sql
stable
security definer
set search_path = public
set row_security = off
as $fn$
  select e.source_id, e.rel_type, e.target_id,
         'los extremos no los ve la misma persona'
  from public.graph_edges e
  join public.graph_nodes s on s.id = e.source_id
  join public.graph_nodes t on t.id = e.target_id
  where not public.graph_misma_audiencia(s, t)

  union all

  -- Una arista sin dueño de ninguna clase no la puede ver nadie: es basura que
  -- el trigger no debería haber dejado pasar.
  select e.source_id, e.rel_type, e.target_id,
         'la arista no tiene ni usuario ni espacio'
  from public.graph_edges e
  where e.workspace_id is null and e.user_id is null;
$fn$;


-- =============================================================================
-- PERMISOS (F9 🔴). `graph_misma_audiencia` es `security definer` y 0010 le
-- concede EXECUTE a `anon` por defecto: no la llama nadie desde fuera, así que
-- se revoca del todo.
-- =============================================================================
revoke execute on function public.graph_misma_audiencia(public.graph_nodes, public.graph_nodes)
  from public, anon, authenticated;
revoke execute on function public.graph_check_integrity() from public, anon;
grant  execute on function public.graph_check_integrity() to authenticated;
