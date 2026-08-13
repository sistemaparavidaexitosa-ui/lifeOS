-- 0012_fix_rls_recursion_structural.sql
-- Corrección DEFINITIVA del "infinite recursion detected in policy for
-- relation projects" que persistió tras el fix de la migración 0011.
--
-- DIAGNÓSTICO CORREGIDO: `set row_security = off` (usado en 0011) NO hace
-- bypass de RLS — según la documentación de Postgres, esa GUC solo controla
-- si se lanza un ERROR en lugar de aplicar una política; no desactiva la
-- evaluación de políticas. Por eso el fix anterior no tuvo ningún efecto:
-- era, en la práctica, un no-op para este problema.
--
-- CAUSA RAÍZ REAL (confirmada con el log de CI): un ciclo A<->B entre DOS
-- tablas distintas:
--   projects (política SELECT) --consulta EXISTS--> project_shares
--   project_shares (política SELECT) --llama a has_project_access()-->
--   has_project_access() --vuelve a consultar--> projects
--   --> se reevalúa la política de projects --> recursión infinita.
--
-- FIX ESTRUCTURAL (no depende de bypass de RLS, es correcto pase lo que
-- pase con los privilegios del rol que ejecuta las migraciones):
--   1) project_shares_select ya NO llama a has_project_access() (que
--      volvía a tocar projects). Ahora verifica DIRECTAMENTE, usando las
--      columnas que ya tiene la propia fila (workspace_id), si el usuario
--      es dueño o miembro activo de ese workspace. Esto rompe el lado
--      "B -> A" del ciclo.
--   2) projects_update_edit ya NO llama a can_edit_project() (que también
--      volvía a consultar projects desde dentro de la evaluación de una
--      política DE projects sobre la misma fila). Se reescribe usando
--      directamente las columnas de la fila actual (owner_id,
--      workspace_id) + los helpers is_workspace_member/workspace_role
--      (que solo tocan workspaces/memberships, nunca projects).
--   3) workspaces_select_member y memberships_select_member se reescriben
--      para eliminar TAMBIÉN sus propios riesgos de recursión:
--      - workspaces: ya no llama a is_workspace_member() (que internamente
--        volvía a consultar workspaces); ahora referencia directamente la
--        columna de la fila actual (id) en una subconsulta a `memberships`
--        (tabla distinta, sin ciclo).
--      - memberships: se restringe a "ves tu propia fila" (cero
--        subconsultas, cero riesgo de recursión posible). Esto es MÁS
--        RESTRICTIVO que antes: un Owner ya no ve el roster completo vía
--        una consulta cruda a la tabla. Para restaurar esa funcionalidad
--        sin reintroducir un ciclo, se agrega el RPC
--        `list_workspace_members` (ver más abajo), que la app debe usar
--        en vez de `.from("memberships").select("*")` para listar el
--        equipo completo.
--
-- Los helpers is_workspace_member/workspace_role/has_project_access/
-- can_edit_project NO se eliminan: siguen siendo seguros y necesarios para
-- las políticas de OTRAS tablas (tasks, milestones, comments,
-- workspace_activity), donde consultar `projects`/`workspaces` desde su
-- política es una dependencia de UN SOLO SENTIDO (no cíclica).
--
-- ⚠️ Riesgo residual conocido, no cubierto por este fix (documentado con
-- honestidad, no verificado porque no hay Postgres real en este entorno):
-- `memberships_insert_admin/update_admin/delete_admin` siguen llamando a
-- `workspace_role()`, que internamente consulta `memberships`. Si esto
-- llegara a producir recursión en un flujo de invitación/cambio de rol
-- (no cubierto por las pruebas pgTAP actuales), aplica el mismo patrón
-- estructural: reescribe esas políticas para no depender de una función
-- que vuelva a consultar `memberships` desde dentro de una política DE
-- `memberships`.

-- =============================================================================
-- 1) project_shares_select: ya no depende de projects (rompe el ciclo B->A)
-- =============================================================================
drop policy if exists project_shares_select on public.project_shares;
create policy project_shares_select on public.project_shares for select
using (
  exists (
    select 1 from public.workspaces w
    where w.id = project_shares.workspace_id and w.owner_id = auth.uid()
  )
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = project_shares.workspace_id
      and m.user_id = auth.uid()
      and m.status = 'Active'
  )
);
comment on policy project_shares_select on public.project_shares is
  'Fix 0012: verifica membresía/ownership DIRECTAMENTE (workspaces/memberships), sin volver a consultar projects. Rompe el ciclo projects<->project_shares.';

-- =============================================================================
-- 2) projects_update_edit: ya no llama a can_edit_project() sobre sí misma
-- =============================================================================
drop policy if exists projects_update_edit on public.projects;
create policy projects_update_edit on public.projects for update
using (
  owner_id = auth.uid()
  or (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
    and (
      public.workspace_role(workspace_id) in ('Owner', 'Admin')
      or (
        public.workspace_role(workspace_id) = 'Member'
        and exists (
          select 1 from public.project_shares ps
          where ps.project_id = projects.id and ps.access_level = 'edit'
        )
      )
    )
  )
)
with check (
  owner_id = auth.uid()
  or (
    workspace_id is not null
    and public.is_workspace_member(workspace_id)
    and public.workspace_role(workspace_id) in ('Owner', 'Admin')
  )
);
comment on policy projects_update_edit on public.projects is
  'Fix 0012: usa las columnas de la fila actual (owner_id, workspace_id) en vez de can_edit_project(id), que volvía a consultar projects desde dentro de su propia política UPDATE.';

-- =============================================================================
-- 3) workspaces_select_member: ya no llama a is_workspace_member() sobre sí misma
-- =============================================================================
drop policy if exists workspaces_select_member on public.workspaces;
create policy workspaces_select_member on public.workspaces for select
using (
  owner_id = auth.uid()
  or exists (
    select 1 from public.memberships m
    where m.workspace_id = workspaces.id
      and m.user_id = auth.uid()
      and m.status = 'Active'
  )
);
comment on policy workspaces_select_member on public.workspaces is
  'Fix 0012: subconsulta directa a memberships (tabla distinta), sin pasar por is_workspace_member() para evitar que esa función vuelva a tocar workspaces desde dentro de su propia política SELECT.';

-- =============================================================================
-- 4) memberships_select_member: se restringe a "tu propia fila" (cero
--    subconsultas => cero riesgo de recursión, garantizado)
-- =============================================================================
drop policy if exists memberships_select_member on public.memberships;
create policy memberships_select_member on public.memberships for select
using (user_id = auth.uid());
comment on policy memberships_select_member on public.memberships is
  'Fix 0012: sin subconsultas (ni a memberships ni a workspaces), para eliminar CUALQUIER posibilidad de recursión. Ver list_workspace_members() para listar el roster completo (Owner/Admin/Member) sin usar esta política.';

-- =============================================================================
-- 5) RPC: list_workspace_members — restaura la visibilidad del roster
--    completo (Owner ve a todos los miembros) SIN tocar la política de
--    memberships. Al ser un RPC invocado directamente por la app (no una
--    política anidada dentro de otra), no participa en ninguna cadena de
--    recursión de políticas.
-- =============================================================================
create or replace function public.list_workspace_members(p_workspace_id uuid)
returns setof public.memberships
language sql
security definer
set search_path = public
stable
as $$
  select m.* from public.memberships m
  where m.workspace_id = p_workspace_id
    and (
      exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid())
      or exists (
        select 1 from public.memberships me
        where me.workspace_id = p_workspace_id and me.user_id = auth.uid() and me.status = 'Active'
      )
    );
$$;
comment on function public.list_workspace_members is
  'FR-WSP-004: lista el roster completo de un workspace para Owner/Admin/Member. Usar en vez de SELECT * FROM memberships (esa tabla ahora solo expone la fila propia del usuario, ver fix 0012).';

grant execute on function public.list_workspace_members(uuid) to authenticated;
