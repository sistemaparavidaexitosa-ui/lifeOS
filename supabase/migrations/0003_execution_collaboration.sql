-- 0003_execution_collaboration.sql
-- Execution OS + Collaboration/Workspaces — FR-EXE-*, FR-WSP-*, FR-COL-*.
-- Roles de workspace: Owner, Admin, Member, Guest, Viewer (§34.2).
-- Money OS y datos privados de Time/Habits quedan FUERA de este esquema
-- (nunca referenciados por has_project_access) — ver FR-COL-008.

-- =============================================================================
-- WORKSPACES / MEMBERSHIPS / INVITATIONS
-- =============================================================================
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  color text not null default '#0b8f75',
  created_at timestamptz not null default now()
);

create table if not exists public.memberships (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text not null,
  role text not null check (role in ('Owner', 'Admin', 'Member', 'Guest', 'Viewer')),
  status text not null default 'Active' check (status in ('Active', 'Suspended', 'Removed')),
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);
comment on table public.memberships is 'FR-WSP-004: roles por workspace, único índice (workspace_id, user_id) evita duplicados (BR-013/014).';

create table if not exists public.invitations (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  email text not null,
  role text not null default 'Member' check (role in ('Admin', 'Member', 'Guest', 'Viewer')),
  token uuid not null default gen_random_uuid(),
  status text not null default 'Pending' check (status in ('Pending', 'Accepted', 'Declined', 'Expired', 'Revoked')),
  expires_at timestamptz not null default (now() + interval '7 days'),
  created_at timestamptz not null default now()
);
comment on table public.invitations is 'FR-WSP-003: token de un solo uso con expiración (BR-013).';

-- =============================================================================
-- PROJECTS / MILESTONES / PROJECT_SHARES
-- =============================================================================
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.workspaces(id) on delete set null,
  title text not null,
  objective text not null default '',
  description text not null default '',
  status text not null default 'Draft' check (status in ('Draft', 'Active', 'OnHold', 'Completed', 'Cancelled', 'Archived')),
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  target_date date,
  area text not null default '',
  owner_name text not null default '',
  tags text[] not null default '{}',
  results text not null default '',
  risks text not null default '',
  dependencies text not null default '',
  resources text not null default '',
  notes text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now()
);
comment on table public.projects is 'FR-EXE-001/002/009/010: proyecto personal o de workspace (FR-EXE-013 maestro-detalle en la app).';

create table if not exists public.milestones (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.project_shares (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  access_level text not null default 'edit' check (access_level in ('view', 'comment', 'edit')),
  created_at timestamptz not null default now(),
  unique (project_id)
);
comment on table public.project_shares is 'FR-COL-001/002: nivel de acceso del workspace a un proyecto compartido.';

-- =============================================================================
-- TASKS (+ urgent para Matriz de Eisenhower, FR-EXE-014, ADR-013)
-- =============================================================================
create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  title text not null,
  status text not null default 'Pending' check (status in ('Pending', 'InProgress', 'Blocked', 'Rescheduled', 'Completed', 'Cancelled')),
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  urgent boolean not null default false,
  due date,
  est integer not null default 30,
  deps uuid[] not null default '{}',
  impact boolean not null default false,
  completed_at timestamptz,
  version integer not null default 1,
  created_at timestamptz not null default now()
);
comment on column public.tasks.urgent is 'FR-EXE-014: atributo independiente de priority, para la Matriz de Eisenhower (FR-VIEW-007/008).';

create table if not exists public.task_history (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  from_state text,
  to_state text not null,
  ts timestamptz not null default now()
);
comment on table public.task_history is 'FR-EXE-004: historial de cambios de estado Y de cuadrante Eisenhower (BR-023).';

create table if not exists public.task_assignees (
  task_id uuid not null references public.tasks(id) on delete cascade,
  user_name text not null,
  primary key (task_id, user_name)
);
comment on table public.task_assignees is 'FR-COL-003: solo miembros con acceso al proyecto (BR-015), validado en Server Action.';

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('task', 'project')),
  subject_id uuid not null,
  author_id uuid not null references auth.users(id) on delete cascade,
  author_name text not null,
  body text not null,
  mentions text[] not null default '{}',
  read boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.comments is 'FR-COL-004: comentarios con menciones (@usuario).';

create table if not exists public.workspace_activity (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  type text not null,
  text text not null,
  actor text not null,
  created_at timestamptz not null default now()
);
comment on table public.workspace_activity is 'FR-COL-005: feed de actividad por proyecto y workspace.';

create table if not exists public.logbook (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  type text not null check (type in ('decision', 'change', 'comment', 'learning')),
  text text not null,
  created_at timestamptz not null default now()
);
comment on table public.logbook is 'FR-EXE-007/012: bitácora de decisiones, cambios y aprendizajes.';

create table if not exists public.knowledge_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  project_id uuid references public.projects(id) on delete set null,
  title text not null,
  type text not null check (type in ('doc', 'link', 'note', 'file')),
  url text not null default '',
  note text not null default '',
  version integer not null default 1,
  created_at timestamptz not null default now()
);
comment on table public.knowledge_items is 'FR-EXE-008: base de conocimiento (notas, enlaces, archivos, versiones).';

-- =============================================================================
-- Índices (§4: índices por user_id/tenant)
-- =============================================================================
create index if not exists idx_memberships_user on public.memberships(user_id);
create index if not exists idx_memberships_workspace on public.memberships(workspace_id);
create index if not exists idx_projects_owner on public.projects(owner_id);
create index if not exists idx_projects_workspace on public.projects(workspace_id);
create index if not exists idx_tasks_project on public.tasks(project_id);
create index if not exists idx_tasks_urgent_priority on public.tasks(urgent, priority);
create index if not exists idx_comments_subject on public.comments(subject_type, subject_id);
create index if not exists idx_workspace_activity_ws on public.workspace_activity(workspace_id, created_at desc);
create index if not exists idx_logbook_user on public.logbook(user_id, created_at desc);

-- =============================================================================
-- Funciones helper de RLS (ahora que las tablas existen)
-- =============================================================================
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'Active'
  )
  or exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid());
$$;

create or replace function public.workspace_role(p_workspace_id uuid)
returns text
language sql security definer set search_path = public stable
as $$
  select case
    when exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid()) then 'Owner'
    else (select m.role from public.memberships m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'Active' limit 1)
  end;
$$;

-- Lectura: dueño del proyecto, o miembro del workspace con share existente (o Owner/Admin).
create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (
        p.owner_id = auth.uid()
        or (
          p.workspace_id is not null and public.is_workspace_member(p.workspace_id)
          and (
            public.workspace_role(p.workspace_id) in ('Owner', 'Admin')
            or exists (select 1 from public.project_shares ps where ps.project_id = p.id)
          )
        )
      )
  );
$$;

-- Escritura: dueño, Owner/Admin del workspace, o Member con share.access_level = 'edit'.
create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql security definer set search_path = public stable
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (
        p.owner_id = auth.uid()
        or (
          p.workspace_id is not null and public.is_workspace_member(p.workspace_id)
          and (
            public.workspace_role(p.workspace_id) in ('Owner', 'Admin')
            or (
              public.workspace_role(p.workspace_id) = 'Member'
              and exists (select 1 from public.project_shares ps where ps.project_id = p.id and ps.access_level = 'edit')
            )
          )
        )
      )
  );
$$;

comment on function public.has_project_access is 'RLS: lectura de un proyecto. NUNCA usar en tablas de Money OS/Time/Habits (FR-COL-008).';
comment on function public.can_edit_project is 'RLS: escritura de un proyecto/tareas (BR-015). Guest y Viewer nunca editan.';

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.workspaces enable row level security;
alter table public.memberships enable row level security;
alter table public.invitations enable row level security;
alter table public.projects enable row level security;
alter table public.milestones enable row level security;
alter table public.project_shares enable row level security;
alter table public.tasks enable row level security;
alter table public.task_history enable row level security;
alter table public.task_assignees enable row level security;
alter table public.comments enable row level security;
alter table public.workspace_activity enable row level security;
alter table public.logbook enable row level security;
alter table public.knowledge_items enable row level security;

-- Workspaces: visibles para miembros; solo el owner administra.
create policy workspaces_select_member on public.workspaces for select using (public.is_workspace_member(id));
create policy workspaces_insert_owner on public.workspaces for insert with check (owner_id = auth.uid());
create policy workspaces_update_owner on public.workspaces for update using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy workspaces_delete_owner on public.workspaces for delete using (owner_id = auth.uid());

-- Memberships: visibles para miembros del mismo workspace; solo Owner/Admin administran.
create policy memberships_select_member on public.memberships for select using (public.is_workspace_member(workspace_id));
create policy memberships_insert_admin on public.memberships for insert with check (public.workspace_role(workspace_id) in ('Owner', 'Admin'));
create policy memberships_update_admin on public.memberships for update using (public.workspace_role(workspace_id) in ('Owner', 'Admin'));
create policy memberships_delete_admin on public.memberships for delete using (public.workspace_role(workspace_id) in ('Owner', 'Admin'));

-- Invitations: visibles/gestionables solo por Owner/Admin del workspace.
create policy invitations_all_admin on public.invitations for all
  using (public.workspace_role(workspace_id) in ('Owner', 'Admin'))
  with check (public.workspace_role(workspace_id) in ('Owner', 'Admin'));

-- Projects: SELECT si eres dueño o tienes acceso vía workspace; escritura según can_edit_project.
create policy projects_select_access on public.projects for select
  using (owner_id = auth.uid() or (workspace_id is not null and public.is_workspace_member(workspace_id) and (public.workspace_role(workspace_id) in ('Owner','Admin') or exists (select 1 from public.project_shares ps where ps.project_id = id))));
create policy projects_insert_own on public.projects for insert with check (owner_id = auth.uid());
create policy projects_update_edit on public.projects for update using (public.can_edit_project(id)) with check (owner_id = auth.uid() or public.can_edit_project(id));
create policy projects_delete_owner on public.projects for delete using (owner_id = auth.uid());

-- Milestones/Tasks heredan el acceso del proyecto.
create policy milestones_select on public.milestones for select using (public.has_project_access(project_id));
create policy milestones_write on public.milestones for all using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

create policy project_shares_select on public.project_shares for select using (public.has_project_access(project_id));
create policy project_shares_write on public.project_shares for all
  using (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()) or public.workspace_role(workspace_id) in ('Owner','Admin'))
  with check (exists (select 1 from public.projects p where p.id = project_id and p.owner_id = auth.uid()) or public.workspace_role(workspace_id) in ('Owner','Admin'));

create policy tasks_select on public.tasks for select using (public.has_project_access(project_id));
create policy tasks_write on public.tasks for all using (public.can_edit_project(project_id)) with check (public.can_edit_project(project_id));

create policy task_history_select on public.task_history for select using (exists (select 1 from public.tasks t where t.id = task_id and public.has_project_access(t.project_id)));
create policy task_history_insert on public.task_history for insert with check (exists (select 1 from public.tasks t where t.id = task_id and public.can_edit_project(t.project_id)));

create policy task_assignees_select on public.task_assignees for select using (exists (select 1 from public.tasks t where t.id = task_id and public.has_project_access(t.project_id)));
create policy task_assignees_write on public.task_assignees for all
  using (exists (select 1 from public.tasks t where t.id = task_id and public.can_edit_project(t.project_id)))
  with check (exists (select 1 from public.tasks t where t.id = task_id and public.can_edit_project(t.project_id)));

-- Comments: cualquiera con acceso de lectura al sujeto puede leer; escribir requiere al menos 'comment'.
create policy comments_select on public.comments for select using (
  (subject_type = 'task' and exists (select 1 from public.tasks t where t.id = subject_id and public.has_project_access(t.project_id)))
  or (subject_type = 'project' and public.has_project_access(subject_id))
);
create policy comments_insert on public.comments for insert with check (
  author_id = auth.uid() and (
    (subject_type = 'task' and exists (select 1 from public.tasks t where t.id = subject_id and public.has_project_access(t.project_id)))
    or (subject_type = 'project' and public.has_project_access(subject_id))
  )
);

create policy workspace_activity_select on public.workspace_activity for select using (public.is_workspace_member(workspace_id));
create policy workspace_activity_insert on public.workspace_activity for insert with check (public.is_workspace_member(workspace_id));

-- Bitácora y base de conocimiento: privadas del usuario (no son de colaboración).
create policy logbook_own on public.logbook for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy knowledge_items_own on public.knowledge_items for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.workspaces, public.memberships, public.invitations, public.projects, public.milestones,
  public.project_shares, public.tasks, public.task_history, public.task_assignees, public.comments,
  public.workspace_activity, public.logbook, public.knowledge_items
  to anon, authenticated;
grant insert, update, delete on public.workspaces, public.memberships, public.invitations, public.projects, public.milestones,
  public.project_shares, public.tasks, public.task_history, public.task_assignees, public.comments,
  public.workspace_activity, public.logbook, public.knowledge_items
  to authenticated;
grant all privileges on public.workspaces, public.memberships, public.invitations, public.projects, public.milestones,
  public.project_shares, public.tasks, public.task_history, public.task_assignees, public.comments,
  public.workspace_activity, public.logbook, public.knowledge_items
  to service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;
