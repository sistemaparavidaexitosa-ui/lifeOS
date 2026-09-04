-- 0050_asignacion_con_identidad.sql
--
-- QUE UNA ASIGNACIÓN SEPA A QUIÉN ASIGNA.
--
-- Es la misma enfermedad que curó 0037 con las menciones, en la tabla de al
-- lado. `task_assignees` tiene como clave `(task_id, user_name)` desde 0003:
-- guarda el NOMBRE de la persona y nada más. «¿Me asignaron a mí?» se responde
-- hoy comparando ese texto con `profiles.name` — así está escrito, con esas
-- palabras, en `setTaskAssignees` y en `loadMyTasks`.
--
-- Mientras la asignación solo pintaba una etiqueta, eso no rompía nada
-- visible. En cuanto suena un teléfono, un nombre suelto avisa a quien se
-- llame parecido, o a nadie: dos «Ana» en un espacio son dos personas, y
-- alguien que cambia su nombre en el perfil desaparece de sus propias tareas.
--
-- Se AÑADE la columna de ids, no se sustituye la de nombres — mismo criterio
-- que 0037. `user_name` sostiene el histórico y sigue siendo lo que leen
-- `loadMyTasks` y la propiedad de tareas; `user_id` sostiene el aviso.

alter table public.task_assignees
  add column if not exists user_id uuid references auth.users(id) on delete set null;

comment on column public.task_assignees.user_id is
  'A qué CUENTA se asignó. Convive con `user_name` (0003): esta sostiene el aviso, aquella el histórico y la propiedad de tareas. `on delete set null` porque quien se dio de baja siguió estando asignado: borrar la fila reescribiría quién hizo qué.';
comment on column public.task_assignees.user_name is
  'El nombre tal como se escribió. NO es la verdad operativa desde 0050 — para saber a quién avisar, `user_id`. Se conserva porque del texto «Ana» no sale un uuid y perder el histórico sería peor que convivir con dos columnas.';

-- La consulta que hace el despachador es «mis tareas» (`user_id = yo`), así
-- que el índice va por ahí. Sin él, el resumen diario de vencimientos recorre
-- la tabla entera una vez por usuario.
create index if not exists idx_task_assignees_user on public.task_assignees(user_id) where user_id is not null;

-- =============================================================================
-- BACKFILL
--
-- Se casa el nombre contra el roster del workspace AL QUE PERTENECE LA TAREA,
-- no contra `profiles` en global: dos personas de espacios distintos pueden
-- llamarse igual, y resolver por nombre a secas volvería a ser adivinar.
--
-- El `= 1` del contador es la parte importante. Si dentro del mismo espacio hay
-- dos nombres iguales, la fila se queda en NULL: es preferible que esa tarea no
-- avise a que avise a la persona equivocada. Queda como deuda visible, no como
-- error silencioso.
-- =============================================================================

update public.task_assignees ta
set user_id = (
  select m.user_id
  from public.tasks t
  join public.projects p on p.id = t.project_id
  join public.memberships m on m.workspace_id = p.workspace_id
  where t.id = ta.task_id
    and m.user_name = ta.user_name
    and m.status = 'Active'
  limit 1
)
where ta.user_id is null
  and (
    select count(*)
    from public.tasks t
    join public.projects p on p.id = t.project_id
    join public.memberships m on m.workspace_id = p.workspace_id
    where t.id = ta.task_id
      and m.user_name = ta.user_name
      and m.status = 'Active'
  ) = 1;

-- La RLS NO cambia. `task_assignees_select` y `task_assignees_write` siguen
-- mandando por `has_project_access(t.project_id)`: saber a qué cuenta apunta
-- una asignación no ensancha quién puede verla. Se comprueba en pgTAP.
