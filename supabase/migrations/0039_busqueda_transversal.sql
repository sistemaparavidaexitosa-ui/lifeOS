-- 0039_busqueda_transversal.sql
--
-- BUSCAR EN TODO EL ESPACIO, NO SOLO EN LAS NOTAS.
--
-- La búsqueda en español ya estaba resuelta desde 0032, y solo para `notes`:
-- columna `search` generada, índice GIN, y un RPC que lematiza y prescinde de
-- los acentos. Lo que se hace aquí es aplicar ese MISMO patrón a las otras
-- cuatro cosas que un espacio contiene —proyectos, tareas, comentarios y el
-- feed de actividad— y unirlas en una sola consulta.
--
-- Nada de esto es nuevo: es la decisión de 0032 extendida. Y como allí, el RPC
-- NO es `security definer`: la RLS se aplica dentro y no puede devolver una
-- fila que quien busca no deba ver.

-- =============================================================================
-- LAS COLUMNAS DE BÚSQUEDA
--
-- `generated always … stored` exige que la expresión sea IMMUTABLE, y
-- `to_tsvector` solo lo es cuando la configuración va como constante literal
-- ('spanish') y no como parámetro. Es la misma nota que dejó 0032.
-- =============================================================================

alter table public.projects
  add column if not exists search tsvector generated always as (
    to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(objective, ''))
  ) stored;

alter table public.tasks
  add column if not exists search tsvector generated always as (
    to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(description, ''))
  ) stored;

alter table public.comments
  add column if not exists search tsvector generated always as (
    to_tsvector('spanish', coalesce(body, ''))
  ) stored;

alter table public.workspace_activity
  add column if not exists search tsvector generated always as (
    to_tsvector('spanish', coalesce(text, ''))
  ) stored;

create index if not exists idx_projects_search on public.projects using gin (search);
create index if not exists idx_tasks_search on public.tasks using gin (search);
create index if not exists idx_comments_search on public.comments using gin (search);
create index if not exists idx_workspace_activity_search on public.workspace_activity using gin (search);

-- =============================================================================
-- LA CONSULTA
--
-- Cinco fuentes en una sola llamada. Podrían ser cinco consultas desde la app,
-- pero entonces el ordenado por relevancia se haría en el cliente sobre cinco
-- listas ya recortadas, y el resultado nº 1 dependería de en qué tabla vivía.
--
-- Los filtros se aplican DENTRO. `p_author` sobre las fuentes que tienen autor;
-- las que no lo tienen (proyectos y tareas) desaparecen cuando se pide uno, en
-- vez de colarse ignorando el filtro.
-- =============================================================================

drop function if exists public.search_workspace(uuid, text, text, text, date, date);

create or replace function public.search_workspace(
  p_workspace_id uuid,
  p_query text,
  p_kind text default null,
  p_author text default null,
  p_before date default null,
  p_since date default null
)
returns table (
  kind text,
  id uuid,
  title text,
  snippet text,
  project_id uuid,
  task_id uuid,
  notebook_id uuid,
  at timestamptz,
  rank real
)
language sql
stable
set search_path = public
as $$
  with q as (select websearch_to_tsquery('spanish', p_query) as tsq)
  select * from (
    -- PROYECTOS
    select
      'project'::text, p.id, p.title,
      ts_headline('spanish', coalesce(p.objective, ''), q.tsq,
                  'StartSel=«, StopSel=», MaxFragments=1, MaxWords=24, MinWords=6'),
      p.id, null::uuid, null::uuid, p.created_at,
      ts_rank(p.search, q.tsq)
    from public.projects p, q
    where p.workspace_id = p_workspace_id
      and p.search @@ q.tsq
      and (p_kind is null or p_kind = 'project')
      and p_author is null
      and (p_before is null or p.created_at::date < p_before)
      and (p_since is null or p.created_at::date >= p_since)

    union all

    -- TAREAS
    select
      'task'::text, t.id, t.title,
      ts_headline('spanish', coalesce(t.description, ''), q.tsq,
                  'StartSel=«, StopSel=», MaxFragments=1, MaxWords=24, MinWords=6'),
      t.project_id, t.id, null::uuid, t.created_at,
      ts_rank(t.search, q.tsq)
    from public.tasks t
    join public.projects p on p.id = t.project_id, q
    where p.workspace_id = p_workspace_id
      and t.search @@ q.tsq
      and (p_kind is null or p_kind = 'task')
      and p_author is null
      and (p_before is null or t.created_at::date < p_before)
      and (p_since is null or t.created_at::date >= p_since)

    union all

    -- COMENTARIOS
    select
      'comment'::text, c.id, t.title,
      ts_headline('spanish', c.body, q.tsq,
                  'StartSel=«, StopSel=», MaxFragments=1, MaxWords=24, MinWords=6'),
      t.project_id, t.id, null::uuid, c.created_at,
      ts_rank(c.search, q.tsq)
    from public.comments c
    join public.tasks t on t.id = c.subject_id and c.subject_type = 'task'
    join public.projects p on p.id = t.project_id, q
    where p.workspace_id = p_workspace_id
      and c.search @@ q.tsq
      and (p_kind is null or p_kind = 'comment')
      and (p_author is null or c.author_name ilike '%' || p_author || '%')
      and (p_before is null or c.created_at::date < p_before)
      and (p_since is null or c.created_at::date >= p_since)

    union all

    -- NOTAS
    select
      'note'::text, n.id, n.title,
      ts_headline('spanish', n.body, q.tsq,
                  'StartSel=«, StopSel=», MaxFragments=1, MaxWords=24, MinWords=6'),
      null::uuid, null::uuid, n.notebook_id, n.updated_at,
      ts_rank(n.search, q.tsq)
    from public.notes n
    join public.notebooks nb on nb.id = n.notebook_id, q
    where nb.workspace_id = p_workspace_id
      and n.search @@ q.tsq
      and (p_kind is null or p_kind = 'note')
      and (p_author is null or n.updated_by_name ilike '%' || p_author || '%')
      and (p_before is null or n.updated_at::date < p_before)
      and (p_since is null or n.updated_at::date >= p_since)

    union all

    -- ACTIVIDAD
    select
      'activity'::text, a.id, a.type,
      ts_headline('spanish', a.text, q.tsq,
                  'StartSel=«, StopSel=», MaxFragments=1, MaxWords=24, MinWords=6'),
      a.project_id, null::uuid, null::uuid, a.created_at,
      ts_rank(a.search, q.tsq)
    from public.workspace_activity a, q
    where a.workspace_id = p_workspace_id
      and a.search @@ q.tsq
      and (p_kind is null or p_kind = 'activity')
      and (p_author is null or a.actor ilike '%' || p_author || '%')
      and (p_before is null or a.created_at::date < p_before)
      and (p_since is null or a.created_at::date >= p_since)
  ) hits (kind, id, title, snippet, project_id, task_id, notebook_id, at, rank)
  where p_query is not null and length(btrim(p_query)) > 0
  order by rank desc, at desc
  limit 40;
$$;

comment on function public.search_workspace is
  'Busca en proyectos, tareas, comentarios, notas y actividad de UN espacio, con la configuración de texto en español (lematiza y quita acentos). NO es SECURITY DEFINER a propósito, igual que search_notes: la RLS se aplica dentro y no puede devolver filas ajenas. Los filtros van DENTRO para que el ordenado por relevancia sea sobre el conjunto entero y no sobre cinco listas ya recortadas.';

-- =============================================================================
-- REALTIME
--
-- La publicación `supabase_realtime` existía con CERO tablas: el cliente estaba
-- en el árbol de dependencias y nadie se había suscrito nunca a nada.
--
-- Solo entran las dos del hilo. Realtime respeta la RLS del suscriptor, pero
-- cada tabla publicada es tráfico que sale del servidor en cada escritura:
-- publicar `tasks` haría que cualquier movimiento del tablero se emitiera a
-- todo el mundo, y eso es una decisión aparte que aquí no hace falta.
-- =============================================================================

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comments'
  ) then
    alter publication supabase_realtime add table public.comments;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'comment_reactions'
  ) then
    alter publication supabase_realtime add table public.comment_reactions;
  end if;
end $$;

-- F9: GRANTS explícitos, aunque 0010 sea el backstop.
grant execute on function public.search_workspace(uuid, text, text, text, date, date) to authenticated;
