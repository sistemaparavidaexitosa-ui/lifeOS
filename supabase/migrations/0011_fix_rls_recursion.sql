-- 0011_fix_rls_recursion.sql
-- Fix de un bug real de diseño detectado en la primera ejecución de
-- `supabase test db` en CI: "infinite recursion detected in policy for
-- relation projects".
--
-- CAUSA RAÍZ (3 ciclos distintos, todos con el mismo patrón):
--   1) projects <-> project_shares:
--      projects_select_access consulta project_shares -> la política de
--      project_shares llama a has_project_access(project_id) -> esa función
--      vuelve a consultar projects -> se reevalúa projects_select_access ->
--      ciclo infinito.
--   2) workspaces <-> is_workspace_member:
--      workspaces_select_member llama a is_workspace_member(id) -> esa
--      función vuelve a consultar workspaces -> se reevalúa
--      workspaces_select_member -> ciclo infinito.
--   3) memberships <-> is_workspace_member:
--      memberships_select_member llama a is_workspace_member(workspace_id)
--      -> esa función vuelve a consultar memberships -> se reevalúa
--      memberships_select_member -> ciclo infinito.
--
-- FIX (patrón estándar de Postgres/Supabase para este escenario): estas 4
-- funciones SECURITY DEFINER ya implementan la lógica de autorización
-- explícitamente (comparan auth.uid() contra owner_id/user_id). Es seguro y
-- correcto marcarlas con `set row_security = off`, para que sus consultas
-- INTERNAS ignoren las políticas RLS de las tablas que leen (evitando así
-- que se vuelvan a disparar a sí mismas), sin cambiar en nada el resultado
-- de seguridad: la función sigue devolviendo exactamente el mismo booleano
-- que antes, solo que ya no dispara la maquinaria de políticas al hacerlo.
--
-- CREATE OR REPLACE FUNCTION conserva el mismo OID y los GRANTs ya
-- otorgados (no es necesario volver a otorgarlos), pero se re-otorgan al
-- final de todas formas por explicitud y defensa en profundidad.

create or replace function public.is_workspace_member(p_workspace_id uuid)
returns boolean
language sql security definer
set search_path = public
set row_security = off
stable
as $$
  select exists (
    select 1 from public.memberships m
    where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'Active'
  )
  or exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid());
$$;

create or replace function public.workspace_role(p_workspace_id uuid)
returns text
language sql security definer
set search_path = public
set row_security = off
stable
as $$
  select case
    when exists (select 1 from public.workspaces w where w.id = p_workspace_id and w.owner_id = auth.uid()) then 'Owner'
    else (select m.role from public.memberships m where m.workspace_id = p_workspace_id and m.user_id = auth.uid() and m.status = 'Active' limit 1)
  end;
$$;

create or replace function public.has_project_access(p_project_id uuid)
returns boolean
language sql security definer
set search_path = public
set row_security = off
stable
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

create or replace function public.can_edit_project(p_project_id uuid)
returns boolean
language sql security definer
set search_path = public
set row_security = off
stable
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

comment on function public.is_workspace_member is 'RLS helper: membresía activa u ownership de un workspace (§34.2). row_security=off evita recursión con workspaces/memberships (fix post-CI, 0011).';
comment on function public.workspace_role is 'RLS helper: rol efectivo del usuario en un workspace. row_security=off evita recursión (fix post-CI, 0011).';
comment on function public.has_project_access is 'RLS helper: acceso a un proyecto. row_security=off evita recursión con project_shares (fix post-CI, 0011). NUNCA usar para Money OS/Time/Habits (FR-COL-008).';
comment on function public.can_edit_project is 'RLS: escritura de un proyecto/tareas (BR-015). row_security=off evita recursión (fix post-CI, 0011).';

-- Re-otorgar por explicitud (CREATE OR REPLACE conserva los grants previos,
-- pero se repite aquí como defensa en profundidad, siguiendo el patrón del
-- resto de migraciones de este proyecto).
grant execute on function public.is_workspace_member(uuid) to anon, authenticated, service_role;
grant execute on function public.workspace_role(uuid) to anon, authenticated, service_role;
grant execute on function public.has_project_access(uuid) to anon, authenticated, service_role;
grant execute on function public.can_edit_project(uuid) to anon, authenticated, service_role;
