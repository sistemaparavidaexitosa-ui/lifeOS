-- 0016_time_occupation_date.sql
--
-- Autogestión del Tiempo — soporta ocupaciones y tareas específicas de
-- CUALQUIER día de la semana (no solo "hoy"), FR-TIM-001/003/008.
--
-- GAP CERRADO: hasta esta migración, `occupations` no tenía ninguna columna
-- de fecha. Una ocupación NO recurrente no tenía forma de indicar A QUÉ DÍA
-- pertenecía — de hecho, WeekView.tsx mostraba el MISMO conjunto de
-- ocupaciones repetido en los 7 días (ver comentario original en el código:
-- "En el MVP las ocupaciones recurrentes se muestran igual cada día"), lo
-- cual también aplicaba, por accidente de diseño, a las NO-recurrentes.
--
-- Esta migración agrega `occ_date` para que:
--   - recurring = true  -> occ_date es NULL, se muestra en los 7 días de
--     cualquier semana (comportamiento ya existente, sin cambios).
--   - recurring = false -> occ_date es OBLIGATORIO, la ocupación SOLO
--     aparece en ese día calendario específico (nuevo, FR-TIM-001/008).
--
-- No se modifica ningún RLS/GRANT — la tabla ya tenía la política
-- `occupations_own` (0004_planning_time_habits.sql) con RLS/GRANT correctos
-- por user_id; una columna nueva hereda automáticamente esa misma política
-- de fila, sin necesidad de tocarla.

alter table public.occupations add column if not exists occ_date date;

comment on column public.occupations.occ_date is
  'Fecha específica (YYYY-MM-DD) para ocupaciones NO recurrentes (FR-TIM-001/008). Las recurrentes (recurring=true) ignoran esta columna y se muestran en los 7 días de cualquier semana.';

-- Backfill de seguridad: no debería existir ninguna fila no-recurrente sin
-- fecha (columna nueva, todo empieza en NULL), pero si el owner ya tenía
-- datos reales insertados antes de aplicar esta migración, se ancla a HOY
-- en vez de dejar la fila en un estado que luego violaría el check de abajo.
update public.occupations
set occ_date = current_date
where recurring = false and occ_date is null;

alter table public.occupations
  add constraint occupations_date_check
  check ((recurring = true and occ_date is null) or (recurring = false and occ_date is not null));

create index if not exists idx_occupations_user_date on public.occupations(user_id, occ_date);
