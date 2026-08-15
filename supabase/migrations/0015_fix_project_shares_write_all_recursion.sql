-- 0015_fix_project_shares_write_all_recursion.sql
--
-- CAUSA RAÍZ REAL (confirmada con `select * from public.debug_rls_policies()`
-- tras aplicar 0012/0013/0014): el ciclo NUNCA estuvo en projects_select_access
-- (esa política ya quedó correcta desde 0013 — subconsultas 100% directas).
--
-- El ciclo real involucra a `project_shares_write`, definida en
-- 0003_execution_collaboration.sql como `FOR ALL` (la única forma en
-- Postgres de cubrir INSERT + UPDATE + DELETE en una sola política, ya que
-- CREATE POLICY no admite listar varios comandos salvo ALL).
--
-- El problema: una política `FOR ALL` se evalúa para TODOS los comandos,
-- incluido SELECT. Su USING clause consulta `projects` directamente:
--
--   EXISTS (select 1 from projects p where p.id = project_shares.project_id
--           and p.owner_id = auth.uid())
--
-- Esto cierra el ciclo:
--   SELECT projects (projects_select_access)
--     -> subconsulta EXISTS sobre project_shares
--        -> Postgres evalúa TODAS las políticas SELECT-aplicables de
--           project_shares, incluida project_shares_write (por ser FOR ALL)
--           -> su USING vuelve a consultar projects
--              -> se reevalúa projects_select_access -> recursión infinita.
--
-- FIX: reemplazar la política FOR ALL por 3 políticas específicas (INSERT,
-- UPDATE, DELETE). Por definición de Postgres, una política declarada para
-- un comando específico NUNCA se evalúa durante un SELECT, así que esto
-- rompe el ciclo sin tocar ninguna regla de autorización (misma condición
-- exacta, solo repetida en 3 políticas en vez de 1 con FOR ALL).

drop policy if exists project_shares_write on public.project_shares;

create policy project_shares_insert on public.project_shares for insert
with check (
  exists (select 1 from public.projects p where p.id = project_shares.project_id and p.owner_id = auth.uid())
  or public.workspace_role(workspace_id) in ('Owner', 'Admin')
);
comment on policy project_shares_insert on public.project_shares is
  'Fix 0015: separada de project_shares_write (FOR ALL) para que NO se evalúe durante SELECT y así romper el ciclo projects <-> project_shares.';

create policy project_shares_update on public.project_shares for update
using (
  exists (select 1 from public.projects p where p.id = project_shares.project_id and p.owner_id = auth.uid())
  or public.workspace_role(workspace_id) in ('Owner', 'Admin')
)
with check (
  exists (select 1 from public.projects p where p.id = project_shares.project_id and p.owner_id = auth.uid())
  or public.workspace_role(workspace_id) in ('Owner', 'Admin')
);
comment on policy project_shares_update on public.project_shares is
  'Fix 0015: separada de project_shares_write (FOR ALL) para que NO se evalúe durante SELECT y así romper el ciclo projects <-> project_shares.';

create policy project_shares_delete on public.project_shares for delete
using (
  exists (select 1 from public.projects p where p.id = project_shares.project_id and p.owner_id = auth.uid())
  or public.workspace_role(workspace_id) in ('Owner', 'Admin')
);
comment on policy project_shares_delete on public.project_shares is
  'Fix 0015: separada de project_shares_write (FOR ALL) para que NO se evalúe durante SELECT y así romper el ciclo projects <-> project_shares.';

-- =============================================================================
-- VERIFICACIÓN MANUAL:
--   supabase db reset
--   psql "postgresql://postgres:postgres@localhost:54322/postgres" \
--     -c "select policyname, cmd from pg_policies where tablename = 'project_shares';"
--   -> debe mostrar: project_shares_select (SELECT), project_shares_insert
--      (INSERT), project_shares_update (UPDATE), project_shares_delete
--      (DELETE) — ninguna con cmd = ALL.
--   npx supabase test db
-- =============================================================================
