-- 0010_default_privileges.sql
-- Refuerzo final del patrón exacto exigido en el prompt de build (§4bis):
-- garantiza que CUALQUIER tabla/función futura (creada por un `role` que
-- ejecute esta sesión) herede los privilegios correctos, incluso si una
-- migración futura olvida declarar sus propios GRANTS explícitos.
-- Esto es un backstop, NO un sustituto de los GRANTS explícitos por tabla
-- que ya están en cada migración anterior.

grant usage on schema public to anon, authenticated, service_role;

grant select on all tables in schema public to anon, authenticated;
grant insert, update, delete on all tables in schema public to authenticated;
grant all privileges on all tables in schema public to service_role;
grant all privileges on all sequences in schema public to service_role;
grant execute on all functions in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant select on tables to anon, authenticated;
alter default privileges in schema public grant insert, update, delete on tables to authenticated;
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

-- Excepción deliberada: revocar INSERT/UPDATE/DELETE de audit_log para
-- `authenticated` salvo lo que sus propias políticas RLS de INSERT permiten
-- (no hay política de UPDATE/DELETE = append-only real, ver 0009_audit.sql).
revoke update, delete on public.audit_log from authenticated;
