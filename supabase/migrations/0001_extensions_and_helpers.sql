-- 0001_extensions_and_helpers.sql
-- Extensiones base. Las funciones helper de RLS (is_workspace_member,
-- workspace_role, has_project_access, can_edit_project) se crean en
-- 0003_execution_collaboration.sql, DESPUÉS de las tablas que referencian
-- (workspaces, memberships, projects, project_shares), porque
-- `check_function_bodies` valida la existencia de esas relaciones al crear
-- una función `language sql`.

create extension if not exists "uuid-ossp";
create extension if not exists "pgcrypto";

-- Esquema público: uso básico para todos los roles de aplicación (RLS filtra filas).
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
