-- 0014_reassert_projects_rls_fix.sql
--
-- CONTEXTO: el error "infinite recursion detected in policy for relation
-- projects" (test 0002_rls_execution_collaboration.sql, línea 54) ya se
-- había atacado en 3 migraciones previas: 0011, 0012 y 0013. Analizando el
-- grafo de dependencias resultante de esas 3 migraciones (projects_select_access
-- -> workspaces/memberships/project_shares, sin ciclo de vuelta a projects),
-- NO debería quedar ninguna recursión posible si 0012/0013 se aplicaron tal
-- cual. Que el error en tu corrida de CI sea IDÉNTICO (mismo archivo, misma
-- línea, mismo mensaje) apunta a que 0012 y/o 0013 no llegaron a ejecutarse
-- contra la base de datos que corrió los tests (lockfile de migraciones
-- desincronizado, rama/PR sin esos commits, o un paso "reset" previo que
-- falló en silencio).
--
-- Esta migración NO cambia la lógica de nada: es una RE-APLICACIÓN
-- explícita e idempotente (drop + create) de las políticas ya correctas de
-- 0012/0013, como una nueva migración con número de versión más alto. Si
-- 0012/0013 SÍ se aplicaron, esto es un no-op funcional (recrea políticas
-- idénticas). Si por cualquier razón NO se aplicaron, esta migración las
-- fuerza a existir, sin depender de que las 2 anteriores hayan corrido.
--
-- Adicionalmente agrega un paso de verificación que puedes correr a mano
-- (o en un step de debug en CI) para CONFIRMAR qué políticas están
-- realmente activas antes de correr los tests — ver el bloque comentado al
-- final de este archivo.

-- =============================================================================
-- 1) project_shares_select — sin dependencia de has_project_access() (rompe
--    el ciclo projects <-> project_shares)
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

-- =============================================================================
-- 2) projects_update_edit — sin dependencia de can_edit_project(id) sobre sí misma
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

-- =============================================================================
-- 3) workspaces_select_member — sin dependencia de is_workspace_member() sobre sí misma
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

-- =============================================================================
-- 4) memberships_select_member — cero subconsultas (cero riesgo de recursión)
-- =============================================================================
drop policy if exists memberships_select_member on public.memberships;
create policy memberships_select_member on public.memberships for select
using (user_id = auth.uid());

-- =============================================================================
-- 5) projects_select_access — 100% subconsultas directas, sin pasar por
--    is_workspace_member()/workspace_role()/has_project_access()
-- =============================================================================
drop policy if exists projects_select_access on public.projects;
create policy projects_select_access on public.projects for select
using (
  owner_id = auth.uid()
  or (
    workspace_id is not null
    and (
      exists (select 1 from public.workspaces w where w.id = projects.workspace_id and w.owner_id = auth.uid())
      or exists (
        select 1 from public.memberships m
        where m.workspace_id = projects.workspace_id and m.user_id = auth.uid() and m.status = 'Active' and m.role = 'Admin'
      )
      or (
        exists (
          select 1 from public.memberships m
          where m.workspace_id = projects.workspace_id and m.user_id = auth.uid() and m.status = 'Active'
        )
        and exists (select 1 from public.project_shares ps where ps.project_id = projects.id)
      )
    )
  )
);

-- =============================================================================
-- 6) RPC de verificación: lista TODAS las políticas activas de las 4 tablas
--    involucradas, para que puedas confirmarlo desde tu app o desde
--    Supabase Studio -> SQL Editor sin necesidad de psql.
-- =============================================================================
create or replace function public.debug_rls_policies()
returns table (tablename text, policyname text, cmd text, qual text, with_check text)
language sql
security definer
set search_path = public
stable
as $$
  select
    schemaname || '.' || tablename as tablename,
    policyname,
    cmd,
    qual::text,
    with_check::text
  from pg_policies
  where tablename in ('projects', 'workspaces', 'memberships', 'project_shares')
  order by tablename, policyname;
$$;
comment on function public.debug_rls_policies is
  'Diagnóstico temporal: corre `select * from public.debug_rls_policies();` en Studio o psql para confirmar qué políticas están REALMENTE activas contra recursión (ver 0014). Seguro de borrar una vez confirmado.';
grant execute on function public.debug_rls_policies() to authenticated, service_role;

-- =============================================================================
-- VERIFICACIÓN MANUAL (correr esto tú mismo, no se ejecuta automáticamente):
--
--   supabase db reset   -- aplica TODO desde cero, incluida esta migración
--   psql "postgresql://postgres:postgres@localhost:54322/postgres" \
--     -c "select * from public.debug_rls_policies();"
--
-- Si la columna `qual` de `projects_select_access` (o `project_shares_select`)
-- todavía contiene el texto "has_project_access" o "can_edit_project",
-- significa que ESTA migración no llegó a aplicarse (revisa el orden de
-- archivos en supabase/migrations/ y que el CI haga checkout de esta rama).
-- =============================================================================
