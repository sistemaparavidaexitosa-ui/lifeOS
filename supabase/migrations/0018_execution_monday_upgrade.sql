-- 0018_execution_monday_upgrade.sql
-- Rediseño "Monday-style" de Execution OS (Proyectos y Tareas):
--   1) Subtareas ilimitadas en anidación vía parent_task_id (auto-referencia
--      en tasks). La UI (MondayBoard.tsx) las renderiza de forma recursiva,
--      igual que "Subitem Level 1 / Subitem Level 2" en Monday.com.
--   2) start_date para la columna "Timeline" (barra de rango de fechas).
--      due ya existía y se sigue usando como fecha de fin del rango; si
--      start_date es NULL, la UI muestra due como fecha única.
--
-- No se crea ninguna tabla paralela: se reutiliza tasks/comments/
-- task_assignees/task_history tal cual, consistente con /docs/DECISIONS.md.

alter table public.tasks
  add column if not exists parent_task_id uuid references public.tasks(id) on delete cascade,
  add column if not exists start_date date;

comment on column public.tasks.parent_task_id is
  'Subtareas (Monday-style): auto-referencia a tasks.id. NULL = tarea raíz. ON DELETE CASCADE: borrar el padre borra sus subtareas.';
comment on column public.tasks.start_date is
  'Inicio del rango para la columna Timeline. Si es NULL, la UI muestra únicamente due (fecha única).';

create index if not exists idx_tasks_parent on public.tasks(parent_task_id);
create index if not exists idx_tasks_project_parent on public.tasks(project_id, parent_task_id);

-- RLS/GRANTS: la columna nueva hereda las políticas y grants ya existentes
-- de public.tasks (tasks_select/tasks_write, ver 0003_execution_collaboration.sql).
-- Ninguna migración de RLS adicional es necesaria: has_project_access/
-- can_edit_project ya cubren cualquier fila de tasks sin importar si tiene
-- parent_task_id o no.
