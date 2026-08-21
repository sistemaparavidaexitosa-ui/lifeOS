-- 0021_execution_board_order.sql
--
-- Rediseño del flujo de proyectos (Execution OS) estilo monday.com/ClickUp:
-- ORDEN MANUAL de las tareas dentro de su lista de hermanos.
--
-- Hasta ahora el tablero ordenaba SIEMPRE por created_at, así que el usuario
-- no podía priorizar visualmente arrastrando una tarea arriba de otra (la
-- interacción más básica de monday/ClickUp). `position` agrega ese orden sin
-- tocar ninguna otra columna, tabla ni política:
--
--   * El orden es POR LISTA DE HERMANOS, no global: las tareas raíz de un
--     grupo se comparan entre sí, y las subtareas se comparan entre las
--     subtareas del mismo padre. La UI siempre reasigna 0..N-1 a la lista
--     completa que reordenó (ver reorderTasks en board-actions.ts), así que
--     nunca hay posiciones duplicadas dentro de una misma lista.
--   * `task_groups.position` ya existía (migración 0019) y se sigue usando
--     igual para el orden de los grupos.
--
-- RLS/GRANTS: la columna nueva hereda tasks_select/tasks_write
-- (0003_execution_collaboration.sql). Ninguna política se reescribe, ningún
-- SECURITY DEFINER nuevo — mismo criterio que 0018/0019/0020.

alter table public.tasks
  add column if not exists position integer not null default 0;

comment on column public.tasks.position is
  'Orden manual (drag&drop) DENTRO de la lista de hermanos: tareas raíz del mismo group_id, o subtareas del mismo parent_task_id. Menor = más arriba. Ver reorderTasks() en app/(app)/execution/board-actions.ts.';

-- Backfill idempotente: numera cada lista de hermanos por created_at, que es
-- exactamente el orden que el tablero mostraba antes de esta migración — así
-- ningún usuario ve su tablero "barajado" al desplegar.
with ordered as (
  select
    id,
    row_number() over (
      partition by project_id, coalesce(parent_task_id::text, 'root'), coalesce(group_id::text, 'nogroup')
      order by created_at asc, id asc
    ) - 1 as new_position
  from public.tasks
)
update public.tasks t
set position = ordered.new_position
from ordered
where ordered.id = t.id
  and t.position = 0;

create index if not exists idx_tasks_group_position on public.tasks(group_id, position);
create index if not exists idx_tasks_parent_position on public.tasks(parent_task_id, position);
