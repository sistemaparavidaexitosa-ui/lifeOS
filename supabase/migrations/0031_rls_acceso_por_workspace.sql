-- 0031_rls_acceso_por_workspace.sql
--
-- MEMBRESÍA = ACCESO (modelo Notion/monday.com).
--
-- QUÉ CAMBIA
-- Hasta 0030, un miembro de un workspace no veía un proyecto por ser miembro:
-- hacía falta ADEMÁS una fila en `project_shares`, y para editarlo esa fila
-- tenía que decir 'edit'. Con `projects.workspace_id` ya obligatorio, eso deja
-- de tener sentido — el workspace ES el continente del proyecto, no una
-- etiqueta opcional.
--
-- Tabla de acceso que implementa este archivo:
--
--   Rol           | Ve                          | Edita
--   --------------|-----------------------------|---------------------------
--   Owner/Admin   | todos los del workspace     | sí
--   Member        | todos los del workspace     | sí
--   Viewer        | todos los del workspace     | nunca
--   Guest         | solo los de project_shares  | solo si el share es 'edit'
--   owner_id      | siempre                     | siempre
--
-- `project_shares` NO se elimina: cambia de trabajo. Deja de ser "compartir mi
-- proyecto personal con un equipo" (imposible ya: el proyecto nace dentro de
-- un workspace) y pasa a ser el mecanismo del GUEST — el colaborador externo
-- que solo debe ver ciertos proyectos del workspace.
--
-- DISCIPLINA ANTI-RECURSIÓN (migraciones 0011-0015, 0029)
-- Dos reglas que este archivo respeta al pie de la letra:
--   1. Las políticas DE `projects` usan subconsultas 100% directas a
--      workspaces/memberships/project_shares. Ninguna llama a una función que
--      vuelva a consultar `projects`.
--   2. Las funciones helper llevan `set row_security = off`, el patrón que
--      0029 dejó establecido para que un SECURITY DEFINER no reactive la RLS
--      de las tablas que consulta. Se aplica también a is_workspace_member y
--      workspace_role, que hasta ahora no lo tenían: eso cierra de paso el
--      riesgo residual que 0012 dejó documentado y sin resolver
--      (memberships_insert/update/delete_admin llaman a workspace_role, que
--      vuelve a consultar memberships desde una política DE memberships).

-- =============================================================================
-- Helpers
-- =============================================================================
create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql security definer set search_path = public set row_security = off stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'Active'
  )
  or exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid());
$$;

create or replace function public.workspace_role(p_workspace_id uuid)
returns text
language sql security definer set search_path = public set row_security = off stable
as $$
  select case
    when exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid()) then 'Owner'
    else (
      select m.role from public.memberships m
      where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'Active'
      limit 1
    )
  end;
$$;

-- Lectura de un proyecto: dueño, dueño del workspace, o miembro activo. El
-- Guest es el único que además necesita el share.
create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql security definer set search_path = public set row_security = off stable
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (
        p.owner_id = auth.uid()
        or exists (select 1 from public.workspaces w where w.id = p.workspace_id and w.owner_id = auth.uid())
        or exists (
          select 1 from public.memberships m
          where m.workspace_id = p.workspace_id
            and m.user_id = auth.uid()
            and m.status = 'Active'
            and (
              m.role <> 'Guest'
              or exists (select 1 from public.project_shares ps where ps.project_id = p.id)
            )
        )
      )
  );
$$;

-- Escritura: igual que la lectura, menos el Viewer (que nunca edita) y menos
-- el Guest sin share 'edit'.
create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql security definer set search_path = public set row_security = off stable
as $$
  select exists (
    select 1 from public.projects p
    where p.id = p_project_id
      and (
        p.owner_id = auth.uid()
        or exists (select 1 from public.workspaces w where w.id = p.workspace_id and w.owner_id = auth.uid())
        or exists (
          select 1 from public.memberships m
          where m.workspace_id = p.workspace_id
            and m.user_id = auth.uid()
            and m.status = 'Active'
            and (
              m.role in ('Owner', 'Admin', 'Member')
              or (
                m.role = 'Guest'
                and exists (
                  select 1 from public.project_shares ps
                  where ps.project_id = p.id and ps.access_level = 'edit'
                )
              )
            )
        )
      )
  );
$$;

comment on function public.has_project_access is
  'RLS (0031): lectura de un proyecto. Membresía activa basta; el Guest necesita además su fila en project_shares. NUNCA usar en tablas de Money OS/Time/Habits (FR-COL-008).';
comment on function public.can_edit_project is
  'RLS (0031): escritura de un proyecto/tareas. Owner/Admin/Member editan; Viewer nunca; Guest solo con share access_level = edit (BR-015).';

-- =============================================================================
-- Políticas de projects (subconsultas directas, sin funciones)
-- =============================================================================

-- SELECT
drop policy if exists projects_select_access on public.projects;
create policy projects_select_access on public.projects for select
using (
  owner_id = auth.uid()
  or exists (select 1 from public.workspaces w where w.id = projects.workspace_id and w.owner_id = auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = projects.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
      and (
        m.role <> 'Guest'
        or exists (select 1 from public.project_shares ps where ps.project_id = projects.id)
      )
  )
);
comment on policy projects_select_access on public.projects is
  '0031: ser miembro activo del workspace ya da lectura. El Guest es el único que necesita además una fila en project_shares.';

-- INSERT
--
-- Antes solo comprobaba `owner_id = auth.uid()`. Con workspace obligatorio eso
-- se volvía un agujero: bastaba mandar el id de un workspace ajeno para
-- plantarle un proyecto dentro. Ahora hay que poder crear EN ese workspace.
drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own on public.projects for insert
with check (
  owner_id = auth.uid()
  and (
    exists (select 1 from public.workspaces w where w.id = projects.workspace_id and w.owner_id = auth.uid())
    or exists (
      select 1 from public.memberships m
      where m.workspace_id = projects.workspace_id
        and m.user_id = auth.uid()
        and m.status = 'Active'
        and m.role in ('Owner', 'Admin', 'Member')
    )
  )
);
comment on policy projects_insert_own on public.projects is
  '0031: además de ser tuyo, el proyecto debe nacer en un workspace donde puedas crear (Owner/Admin/Member). Guest y Viewer no crean proyectos.';

-- UPDATE
--
-- El WITH CHECK anterior solo aceptaba dueño u Owner/Admin, así que un Member
-- pasaba el USING y moría en el CHECK: nunca pudo editar de verdad. Ahora
-- ambas mitades dicen lo mismo, y el CHECK se evalúa sobre la fila NUEVA, lo
-- que de paso impide mover un proyecto a un workspace donde no puedas escribir.
drop policy if exists projects_update_edit on public.projects;
create policy projects_update_edit on public.projects for update
using (
  owner_id = auth.uid()
  or exists (select 1 from public.workspaces w where w.id = projects.workspace_id and w.owner_id = auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = projects.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
      and (
        m.role in ('Owner', 'Admin', 'Member')
        or (
          m.role = 'Guest'
          and exists (select 1 from public.project_shares ps where ps.project_id = projects.id and ps.access_level = 'edit')
        )
      )
  )
)
with check (
  owner_id = auth.uid()
  or exists (select 1 from public.workspaces w where w.id = projects.workspace_id and w.owner_id = auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = projects.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
      and (
        m.role in ('Owner', 'Admin', 'Member')
        or (
          m.role = 'Guest'
          and exists (select 1 from public.project_shares ps where ps.project_id = projects.id and ps.access_level = 'edit')
        )
      )
  )
);
comment on policy projects_update_edit on public.projects is
  '0031: Owner/Admin/Member editan cualquier proyecto del workspace; Viewer nunca; Guest solo con share edit. El WITH CHECK espeja al USING para que un Member sí pueda guardar (antes el CHECK lo bloqueaba) y para que nadie mueva un proyecto a un workspace donde no puede escribir.';

-- DELETE
drop policy if exists projects_delete_owner on public.projects;
create policy projects_delete_owner on public.projects for delete
using (
  owner_id = auth.uid()
  or exists (select 1 from public.workspaces w where w.id = projects.workspace_id and w.owner_id = auth.uid())
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = projects.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
      and m.role = 'Admin'
  )
);
comment on policy projects_delete_owner on public.projects is
  '0031: el dueño del proyecto y la administración del workspace (Owner/Admin) pueden borrarlo. Un Member edita pero no borra el trabajo de otro.';

-- =============================================================================
-- project_shares: mismo permiso, papel nuevo
-- =============================================================================
comment on table public.project_shares is
  '0031: acceso de GUEST a un proyecto concreto del workspace. Ya NO es "compartir un proyecto personal": todo proyecto vive en un workspace desde 0030, y los demás roles acceden por membresía. access_level edit lo habilita a escribir.';

-- =============================================================================
-- Las tablas hijas NO se tocan
-- =============================================================================
-- tasks, task_groups, milestones, task_history, task_assignees, comments y
-- task_files siguen con exactamente las mismas políticas: todas se apoyan en
-- has_project_access/can_edit_project, que acaban de cambiar de criterio arriba.
-- Ese es el motivo de que estos helpers existan.
