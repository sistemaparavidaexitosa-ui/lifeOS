-- =============================================================================
-- 0029 — Política DELETE para comments
--
-- POR QUÉ
-- public.comments nació con políticas de SELECT e INSERT y ninguna de DELETE.
-- Con RLS activo eso significa que un DELETE desde el cliente no falla: borra
-- CERO filas y devuelve éxito. El síntoma aparece al eliminar un proyecto —
-- tasks y task_groups caen por `on delete cascade`, pero comments no tiene
-- clave foránea (su relación es polimórfica: subject_type + subject_id), así
-- que sus filas quedaban apuntando a tareas que ya no existen, y el código que
-- intentaba limpiarlas parecía funcionar sin hacer nada.
--
-- QUIÉN PUEDE BORRAR
--   - el autor del comentario; o
--   - quien puede editar el proyecto al que pertenece el comentario (su dueño,
--     o un miembro del workspace con permiso de edición) — que es justo quien
--     puede borrar el proyecto entero.
--
-- La resolución del sujeto va en una función SECURITY DEFINER con
-- row_security = off, igual que has_project_access/can_edit_project: mirar
-- public.tasks desde una política de public.comments volvería a activar la RLS
-- de tasks y es exactamente la forma de recursión que costó las migraciones
-- 0011-0015.
-- =============================================================================

create or replace function public.can_edit_comment_subject(p_subject_type text, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case p_subject_type
    when 'project' then public.can_edit_project(p_subject_id)
    when 'task' then exists (
      select 1
      from public.tasks t
      where t.id = p_subject_id
        and public.can_edit_project(t.project_id)
    )
    else false
  end;
$$;

comment on function public.can_edit_comment_subject(text, uuid) is
  'RLS: resuelve el proyecto detrás de un comentario (task|project) sin reactivar la RLS de tasks. Ver 0029.';

drop policy if exists comments_delete on public.comments;
create policy comments_delete on public.comments for delete using (
  author_id = auth.uid()
  or public.can_edit_comment_subject(subject_type, subject_id)
);

comment on policy comments_delete on public.comments is
  'FR-COL-004: borra su comentario el autor, o quien puede editar el proyecto (mismo permiso que borrar el proyecto).';
