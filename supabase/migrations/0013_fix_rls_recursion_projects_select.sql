-- 0013_fix_rls_recursion_projects_select.sql
-- Corrección de un GAP real que dejé en 0012_fix_rls_recursion_structural.sql:
-- esa migración reescribió `projects_update_edit` (UPDATE) sin depender de
-- funciones intermedias, pero NO tocó `projects_select_access` (SELECT),
-- que es la política que dispara el test "Member SÍ ve el proyecto
-- compartido" (isnt_empty) — exactamente el que sigue reportando
-- "infinite recursion detected in policy for relation projects".
--
-- ⚠️ IMPORTANTE: si tras aplicar ESTA migración el error persiste
-- IDÉNTICO (misma línea, mismo mensaje), la causa más probable ya NO es un
-- gap de diseño, sino que 0012 (o esta misma) no se aplicó. Verifica con:
--   git ls-files | grep -E "001[23]"
-- y revisa el log completo del paso "Reset DB (migrations + seed)" de tu
-- CI (no solo "Run supabase test db") para confirmar qué migraciones
-- corrieron.
--
-- CAUSA RAÍZ (revisada): `projects_select_access` (definida en
-- 0003_execution_collaboration.sql, NUNCA modificada por 0012) llama a
-- `public.is_workspace_member(workspace_id)`. Esa función es
-- SECURITY DEFINER, y yo había asumido (sin poder verificarlo en un
-- Postgres real) que las funciones SECURITY DEFINER bypasean
-- automáticamente las políticas RLS de las tablas que consultan cuando su
-- dueño es un rol con privilegios elevados. Esa suposición puede no
-- cumplirse en el entorno de Supabase CLI/Docker usado por tu CI. En vez
-- de seguir dependiendo de esa suposición, esta migración elimina POR
-- COMPLETO la dependencia de cualquier función intermedia en la política
-- SELECT de `projects`, usando subconsultas 100% directas a `workspaces` y
-- `project_shares` (ninguna de las cuales, tras el fix 0012, vuelve a
-- consultar `projects`).

drop policy if exists projects_select_access on public.projects;
create policy projects_select_access on public.projects for select
using (
  owner_id = auth.uid()
  or (
    workspace_id is not null
    and (
      -- Soy Owner del workspace (consulta directa a workspaces, NO via is_workspace_member).
      exists (select 1 from public.workspaces w where w.id = projects.workspace_id and w.owner_id = auth.uid())
      or (
        -- Soy Admin del workspace (consulta directa a memberships).
        exists (
          select 1 from public.memberships m
          where m.workspace_id = projects.workspace_id and m.user_id = auth.uid() and m.status = 'Active' and m.role = 'Admin'
        )
      )
      or (
        -- Soy Member (o cualquier rol activo) Y el proyecto está compartido
        -- explícitamente (project_shares, ya sin ciclo tras el fix 0012).
        exists (
          select 1 from public.memberships m
          where m.workspace_id = projects.workspace_id and m.user_id = auth.uid() and m.status = 'Active'
        )
        and exists (select 1 from public.project_shares ps where ps.project_id = projects.id)
      )
    )
  )
);
comment on policy projects_select_access on public.projects is
  'Fix 0013: subconsultas 100% directas a workspaces/memberships/project_shares, SIN pasar por is_workspace_member()/workspace_role(), para eliminar cualquier dependencia de que una función SECURITY DEFINER bypasee RLS (suposición no verificable sin Postgres real en este entorno).';
