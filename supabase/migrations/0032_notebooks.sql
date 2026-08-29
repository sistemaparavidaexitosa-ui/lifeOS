-- 0032_notebooks.sql
--
-- NOTEBOOKS: el sitio donde el equipo ESCRIBE (estilo Notion/OneNote).
--
-- QUÉ FALTABA
-- Tras 0030/0031 el espacio de trabajo es el contenedor de los proyectos, pero
-- un espacio compartido no es solo trabajo con fechas y estados. Para escribir
-- —actas, decisiones, investigación, ideas— solo había `knowledge_items` y
-- `logbook` (0003), y esas dos cuelgan de un PROYECTO y su RLS es
-- `user_id = auth.uid()`: son notas de una sola persona, invisibles hasta para
-- su propio equipo. No existía ningún lugar compartido donde redactar.
--
-- JERARQUÍA (dos niveles, como Notion; sin las secciones de OneNote)
--   Workspace
--       └── Notebook
--               └── Note
--
-- Regla de oro de siempre: ninguna tabla se duplica y ninguna política
-- existente se reescribe. `notebooks` verifica la membresía con subconsultas
-- directas (disciplina de 0013/0031, sin funciones que vuelvan a tocar la
-- propia tabla) y `notes` hereda el acceso de su notebook mediante dos helpers
-- nuevos que espejan a has_project_access/can_edit_project — dependencia de UN
-- SOLO SENTIDO (notes -> notebooks), sin ciclo posible.

-- =============================================================================
-- NOTEBOOKS
-- =============================================================================
create table if not exists public.notebooks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  title text not null,
  icon text not null default '📓',
  color text not null default 'var(--c-purple)',
  position integer not null default 0,
  -- created_by es NULLABLE con ON DELETE SET NULL, a diferencia de
  -- comments.author_id (NOT NULL + CASCADE). En un cuaderno de equipo, dar de
  -- baja a alguien NO puede borrar las actas que escribió. El nombre va
  -- denormalizado al lado para que la marca de autoría sobreviva a la cuenta
  -- — mismo motivo por el que memberships.user_name ya está denormalizado.
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.notebooks is 'Cuaderno compartido de un espacio de trabajo (estilo Notion). Cuelga del WORKSPACE, no de un proyecto: es el sitio donde escribe el equipo, a diferencia de knowledge_items/logbook (0003), que son privados de un usuario.';
comment on column public.notebooks.created_by is 'NULL si la cuenta se dio de baja. La marca de quién lo creó se conserva en created_by_name.';

create index if not exists idx_notebooks_workspace on public.notebooks(workspace_id, position);

-- =============================================================================
-- NOTES
-- =============================================================================
create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  notebook_id uuid not null references public.notebooks(id) on delete cascade,
  title text not null default '',
  body text not null default '',
  position integer not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  created_by_name text not null default '',
  created_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text not null default '',
  updated_at timestamptz not null default now(),
  -- Concurrencia optimista: la nota la edita cualquiera del espacio, así que
  -- dos personas pueden guardar sobre lo mismo. saveNote hace
  -- `update ... where id = $1 and version = $2`; cero filas significa que
  -- alguien guardó mientras escribías, y se avisa en vez de pisar su texto.
  -- Mismo patrón que projects.version y tasks.version.
  version integer not null default 1,
  -- Columna generada para la búsqueda. to_tsvector(regconfig, text) es
  -- IMMUTABLE cuando la configuración es una constante, que es lo que exige
  -- una columna GENERATED.
  search tsvector generated always as (
    to_tsvector('spanish', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) stored
);
comment on table public.notes is 'Nota de un notebook. Página COLABORATIVA: la edita cualquiera con permiso de escritura en el espacio, guardando las dos marcas de autoría (quién la creó y quién la editó por última vez) y resolviendo choques con `version`.';
comment on column public.notes.version is 'Concurrencia optimista (BR: nunca pisar el texto de otro en silencio). Sube en cada guardado.';
comment on column public.notes.search is 'Índice de búsqueda en español, generado desde title+body. Ver la función search_notes().';

create index if not exists idx_notes_notebook on public.notes(notebook_id, position);
create index if not exists idx_notes_search on public.notes using gin(search);

-- =============================================================================
-- Helpers de acceso — espejo exacto de has_project_access/can_edit_project
-- =============================================================================
-- `set row_security = off` es el patrón que 0029 dejó establecido y 0031
-- generalizó: sin él, un SECURITY DEFINER vuelve a activar la RLS de las
-- tablas que consulta.
--
-- EL GUEST QUEDA FUERA, a propósito. Su llave es `project_shares`, que es por
-- proyecto; no hay equivalente por notebook, y darle el cuaderno entero del
-- espacio filtraría justo lo que ese rol acota. Un `notebook_shares` para
-- invitados sería trabajo aparte.
create or replace function public.has_notebook_access(p_notebook_id uuid)
returns boolean
language sql security definer set search_path = public set row_security = off stable
as $$
  select exists (
    select 1 from public.notebooks n
    where n.id = p_notebook_id
      and (
        exists (select 1 from public.workspaces w where w.id = n.workspace_id and w.owner_id = auth.uid())
        or exists (
          select 1 from public.memberships m
          where m.workspace_id = n.workspace_id
            and m.user_id = auth.uid()
            and m.status = 'Active'
            and m.role in ('Owner', 'Admin', 'Member', 'Viewer')
        )
      )
  );
$$;

create or replace function public.can_edit_notebook(p_notebook_id uuid)
returns boolean
language sql security definer set search_path = public set row_security = off stable
as $$
  select exists (
    select 1 from public.notebooks n
    where n.id = p_notebook_id
      and (
        exists (select 1 from public.workspaces w where w.id = n.workspace_id and w.owner_id = auth.uid())
        or exists (
          select 1 from public.memberships m
          where m.workspace_id = n.workspace_id
            and m.user_id = auth.uid()
            and m.status = 'Active'
            and m.role in ('Owner', 'Admin', 'Member')
        )
      )
  );
$$;

comment on function public.has_notebook_access is 'RLS: lectura de un notebook y de sus notas. Owner/Admin/Member/Viewer del espacio. El Guest NO: su acceso es por proyecto (project_shares) y no tiene equivalente aquí.';
comment on function public.can_edit_notebook is 'RLS: escritura en un notebook y sus notas. Owner/Admin/Member. Viewer lee y nunca escribe, igual que en los proyectos (BR-015).';

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.notebooks enable row level security;
alter table public.notes enable row level security;

-- notebooks: subconsultas directas a workspaces/memberships (nunca a notebooks
-- desde su propia política), misma disciplina que projects_select_access.
create policy notebooks_select on public.notebooks for select
using (
  exists (select 1 from public.workspaces w where w.id = notebooks.workspace_id and w.owner_id = auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = notebooks.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
      and m.role in ('Owner', 'Admin', 'Member', 'Viewer')
  )
);

create policy notebooks_insert on public.notebooks for insert
with check (
  exists (select 1 from public.workspaces w where w.id = notebooks.workspace_id and w.owner_id = auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = notebooks.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
      and m.role in ('Owner', 'Admin', 'Member')
  )
);

create policy notebooks_update on public.notebooks for update
using (public.can_edit_notebook(id))
with check (
  exists (select 1 from public.workspaces w where w.id = notebooks.workspace_id and w.owner_id = auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = notebooks.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
      and m.role in ('Owner', 'Admin', 'Member')
  )
);

-- Borrar el cuaderno se lleva sus notas por cascada, así que se limita a la
-- administración del espacio y al autor: un Member no borra el trabajo escrito
-- por otros, igual que no borra sus proyectos (projects_delete_owner, 0031).
create policy notebooks_delete on public.notebooks for delete
using (
  created_by = auth.uid()
  or exists (select 1 from public.workspaces w where w.id = notebooks.workspace_id and w.owner_id = auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = notebooks.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
      and m.role = 'Admin'
  )
);

-- notes: heredan del notebook. Dependencia de un solo sentido.
create policy notes_select on public.notes for select using (public.has_notebook_access(notebook_id));
create policy notes_write on public.notes for insert with check (public.can_edit_notebook(notebook_id));
create policy notes_update on public.notes for update
  using (public.can_edit_notebook(notebook_id))
  with check (public.can_edit_notebook(notebook_id));
create policy notes_delete on public.notes for delete using (public.can_edit_notebook(notebook_id));

-- =============================================================================
-- Búsqueda
-- =============================================================================
-- NO es SECURITY DEFINER, y es deliberado: al correr con los privilegios de
-- quien llama, la RLS de `notes`/`notebooks` se aplica DENTRO de la función y
-- la búsqueda no puede devolver una nota que no deberías ver. Una fuga por
-- búsqueda es de las que nadie nota hasta que es tarde.
create or replace function public.search_notes(p_workspace_id uuid, p_query text)
returns table (
  id uuid,
  notebook_id uuid,
  notebook_title text,
  title text,
  snippet text,
  updated_at timestamptz,
  updated_by_name text
)
language sql
stable
set search_path = public
as $$
  select
    n.id,
    n.notebook_id,
    nb.title,
    n.title,
    ts_headline('spanish', n.body, websearch_to_tsquery('spanish', p_query),
                'StartSel=«, StopSel=», MaxFragments=1, MaxWords=24, MinWords=8'),
    n.updated_at,
    n.updated_by_name
  from public.notes n
  join public.notebooks nb on nb.id = n.notebook_id
  where nb.workspace_id = p_workspace_id
    and p_query is not null
    and length(btrim(p_query)) > 0
    and n.search @@ websearch_to_tsquery('spanish', p_query)
  order by ts_rank(n.search, websearch_to_tsquery('spanish', p_query)) desc, n.updated_at desc
  limit 50;
$$;

comment on function public.search_notes is 'Busca en las notas de UN espacio con la configuración de texto en español (lematiza y quita acentos: «dirección» encuentra «direccion»). NO es SECURITY DEFINER a propósito: la RLS se aplica dentro y no puede filtrar notas ajenas.';

-- =============================================================================
-- GRANTS (F9 🔴): RLS filtra FILAS; GRANT decide si el rol puede TOCAR la tabla
-- =============================================================================
grant select on public.notebooks, public.notes to anon, authenticated;
grant insert, update, delete on public.notebooks, public.notes to authenticated;
grant all privileges on public.notebooks, public.notes to service_role;
grant execute on function public.has_notebook_access(uuid) to authenticated;
grant execute on function public.can_edit_notebook(uuid) to authenticated;
grant execute on function public.search_notes(uuid, text) to authenticated;
