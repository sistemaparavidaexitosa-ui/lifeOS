-- 0019_execution_groups_folders.sql
--
-- FASE 2 (rediseño Monday-style, arquitectura de jerarquía) — cierra la
-- jerarquía completa solicitada:
--
--   Workspace
--       └── Folder (opcional)         <- NUEVO (folders)
--               └── Board (Proyecto)  <- ya existía (projects)
--                       └── Group     <- NUEVO (task_groups)
--                               └── Item        <- ya existía (tasks)
--                                       └── Subitem <- ya existía (tasks.parent_task_id, migración 0018)
--
-- Regla de oro seguida: NINGUNA tabla se duplica, NINGUNA política RLS se
-- reescribe. task_groups y folders son EXTENSIONES nuevas que reutilizan
-- los helpers de autorización YA EXISTENTES:
--   - task_groups hereda el acceso de su proyecto vía
--     has_project_access(project_id) / can_edit_project(project_id)
--     (mismas funciones que ya protegen tasks, milestones, comments, etc.
--     desde 0003_execution_collaboration.sql).
--   - folders hereda el acceso de su workspace vía
--     is_workspace_member(workspace_id) / workspace_role(workspace_id)
--     (mismas funciones que ya protegen workspace_activity, invitations, etc.)
--
-- No se agrega NINGUNA función SECURITY DEFINER nueva — evita reintroducir
-- cualquier riesgo de recursión de los que se corrigieron en las
-- migraciones 0011-0015.

-- =============================================================================
-- TASK_GROUPS — "Group" dentro de un Board (proyecto)
-- =============================================================================
create table if not exists public.task_groups (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null default 'General',
  color text not null default 'var(--c-purple)',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.task_groups is 'FASE 2 (Monday upgrade): agrupación de Items (tasks) dentro de un Board (project). Antes, el color/agrupación era por proyecto completo; ahora es un nivel real de jerarquía, igual que los "grupos" de monday.com.';
comment on column public.task_groups.color is 'Token de color CSS (ej. var(--c-purple)) para la barra de color del grupo en el tablero (.mb-group-head), consistente con el resto del design system.';

create index if not exists idx_task_groups_project on public.task_groups(project_id);
create index if not exists idx_task_groups_project_position on public.task_groups(project_id, position);

-- =============================================================================
-- FOLDERS — agrupación opcional de Boards dentro de un Workspace
-- =============================================================================
create table if not exists public.folders (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null default 'var(--muted)',
  position integer not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.folders is 'FASE 2 (Monday upgrade): agrupación OPCIONAL de proyectos (Boards) dentro de un Workspace. Un proyecto sin folder_id sigue siendo válido (BR: folder es opcional, no obligatorio).';

create index if not exists idx_folders_workspace on public.folders(workspace_id);
create index if not exists idx_folders_workspace_position on public.folders(workspace_id, position);

-- =============================================================================
-- Extensión de TASKS — group_id (Item -> Group) y description (Drawer)
-- =============================================================================
alter table public.tasks
  add column if not exists group_id uuid references public.task_groups(id) on delete set null,
  add column if not exists description text not null default '';

comment on column public.tasks.group_id is 'FASE 2 (Monday upgrade): liga el Item a su Group dentro del Board. NULL válido (tarea sin agrupar) hasta que corra el backfill de abajo.';
comment on column public.tasks.description is 'FASE 2 (Monday upgrade): descripción larga del Item, mostrada en el Drawer lateral. Antes solo existía \"title\" (una línea); esto no reemplaza title, lo complementa.';

create index if not exists idx_tasks_group on public.tasks(group_id);
create index if not exists idx_tasks_project_group on public.tasks(project_id, group_id);

-- =============================================================================
-- Extensión de PROJECTS — folder_id (Board -> Folder, opcional)
-- =============================================================================
alter table public.projects
  add column if not exists folder_id uuid references public.folders(id) on delete set null;

comment on column public.projects.folder_id is 'FASE 2 (Monday upgrade): Folder opcional al que pertenece este Board. NULL = el Board vive directamente bajo el Workspace (o es personal), consistente con "Folder (opcional)" en la jerarquía solicitada.';

create index if not exists idx_projects_folder on public.projects(folder_id);

-- =============================================================================
-- BACKFILL idempotente — ningún proyecto/tarea existente debe quedar roto
-- =============================================================================
-- 1) Crea un grupo "General" (posición 0) para cada proyecto que todavía no
--    tenga NINGÚN grupo. Es idempotente: si ya corriste esta migración antes
--    (o el proyecto ya tiene grupos propios), no inserta nada de nuevo.
insert into public.task_groups (project_id, name, color, position)
select p.id, 'General', 'var(--c-purple)', 0
from public.projects p
where not exists (
  select 1 from public.task_groups g where g.project_id = p.id
);

-- 2) Asigna todas las tareas SIN group_id al primer grupo de su proyecto
--    (por position, luego created_at). Idempotente: una tarea que ya tiene
--    group_id nunca se toca.
update public.tasks t
set group_id = (
  select g.id
  from public.task_groups g
  where g.project_id = t.project_id
  order by g.position asc, g.created_at asc
  limit 1
)
where t.group_id is null;

-- =============================================================================
-- RLS: task_groups hereda el acceso del proyecto (mismo patrón que
-- milestones/tasks en 0003_execution_collaboration.sql)
-- =============================================================================
alter table public.task_groups enable row level security;

create policy task_groups_select on public.task_groups for select
  using (public.has_project_access(project_id));

create policy task_groups_write on public.task_groups for all
  using (public.can_edit_project(project_id))
  with check (public.can_edit_project(project_id));

comment on policy task_groups_select on public.task_groups is 'Reutiliza has_project_access(project_id) — la misma función que ya protege tasks/milestones/comments. Sin funciones RLS nuevas.';
comment on policy task_groups_write on public.task_groups is 'Reutiliza can_edit_project(project_id) — misma regla de edición que tasks (BR-015).';

-- =============================================================================
-- RLS: folders hereda el acceso del workspace (mismo patrón que
-- workspace_activity/invitations en 0003_execution_collaboration.sql)
-- =============================================================================
alter table public.folders enable row level security;

create policy folders_select on public.folders for select
  using (public.is_workspace_member(workspace_id));

create policy folders_insert on public.folders for insert
  with check (public.workspace_role(workspace_id) in ('Owner', 'Admin'));

create policy folders_update on public.folders for update
  using (public.workspace_role(workspace_id) in ('Owner', 'Admin'))
  with check (public.workspace_role(workspace_id) in ('Owner', 'Admin'));

create policy folders_delete on public.folders for delete
  using (public.workspace_role(workspace_id) in ('Owner', 'Admin'));

comment on policy folders_select on public.folders is 'Reutiliza is_workspace_member(workspace_id) — misma función que ya protege workspace_activity/invitations.';
comment on policy folders_insert on public.folders is 'Fix de diseño aprendido en 0015: políticas separadas por comando (no FOR ALL) para evitar cualquier riesgo de recursión si en el futuro folders se referencia desde otra política SELECT.';

-- =============================================================================
-- GRANTS (F9 — patrón exacto del resto del proyecto: sin esto, cualquier
-- SELECT/INSERT devuelve "permission denied")
-- =============================================================================
grant select on public.task_groups, public.folders to anon, authenticated;
grant insert, update, delete on public.task_groups, public.folders to authenticated;
grant all privileges on public.task_groups, public.folders to service_role;
