-- =============================================================================
-- 0041 — El hilo de un PROYECTO
--
-- POR QUÉ
-- `comments.subject_type` acepta 'task' y 'project' desde 0003, y sus políticas
-- de SELECT/INSERT (0003) y DELETE (0029) ya contemplan las dos ramas. Un hilo
-- colgado del proyecto, por tanto, no necesita tabla nueva: son filas de
-- `comments` con subject_id = projects.id.
--
-- Lo que SÍ está atado a tareas son las REACCIONES. Las políticas de
-- comment_reactions (0038) resuelven el sujeto con un join literal:
--
--   join public.tasks t on t.id = c.subject_id
--   where c.id = comment_id and c.subject_type = 'task' and ...
--
-- Sobre un comentario de proyecto ese join no casa ninguna fila, así que la
-- reacción ni se ve ni se puede insertar — y no falla con un error, que es lo
-- peor: el `insert` es rechazado por la política y el hilo se queda mudo sin
-- decir por qué. Aquí se sustituye ese join por un helper que resuelve los DOS
-- sujetos.
--
-- El helper es SECURITY DEFINER con row_security = off por la misma razón que
-- can_edit_comment_subject en 0029: mirar public.tasks desde una política que
-- ya está evaluando public.comments reactivaría la RLS de tasks, que es la
-- forma exacta de recursión que costó las migraciones 0011-0015.
--
-- No hay índices nuevos: idx_comments_subject(subject_type, subject_id) existe
-- desde 0003 y es justo la consulta del hilo. Tampoco hace falta tocar la
-- publicación `supabase_realtime`: 0039 metió `comments` y `comment_reactions`,
-- y el filtro del cliente es por subject_id, que sirve igual para un proyecto.
-- =============================================================================

create or replace function public.can_view_comment_subject(p_subject_type text, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
set row_security = off
as $$
  select case p_subject_type
    when 'project' then public.has_project_access(p_subject_id)
    when 'task' then exists (
      select 1
      from public.tasks t
      where t.id = p_subject_id
        and public.has_project_access(t.project_id)
    )
    else false
  end;
$$;

comment on function public.can_view_comment_subject(text, uuid) is
  'RLS: resuelve si se puede LEER el sujeto de un comentario (task|project) sin reactivar la RLS de tasks. Gemela de can_edit_comment_subject (0029). Ver 0041.';

-- =============================================================================
-- Reacciones: mismo permiso, los dos sujetos
-- =============================================================================
drop policy if exists comment_reactions_select on public.comment_reactions;
create policy comment_reactions_select on public.comment_reactions for select using (
  exists (
    select 1
    from public.comments c
    where c.id = comment_id
      and public.can_view_comment_subject(c.subject_type, c.subject_id)
  )
);

comment on policy comment_reactions_select on public.comment_reactions is
  'Ve la reacción quien puede leer el comentario, sea de una tarea o de un proyecto. Antes: join literal a tasks (0038), que dejaba mudo el hilo de proyecto.';

drop policy if exists comment_reactions_insert on public.comment_reactions;
create policy comment_reactions_insert on public.comment_reactions for insert with check (
  user_id = auth.uid()
  and exists (
    select 1
    from public.comments c
    where c.id = comment_id
      and public.can_view_comment_subject(c.subject_type, c.subject_id)
  )
);

comment on policy comment_reactions_insert on public.comment_reactions is
  'Reacciona quien puede leer el comentario, y solo en su propio nombre (user_id = auth.uid()).';

-- comment_reactions_delete (0038) se queda como está: `user_id = auth.uid()` no
-- depende del sujeto, y quitarle a alguien su propia reacción no es asunto del
-- proyecto.

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
-- No hay tablas nuevas: comments y comment_reactions ya tienen sus GRANTS de
-- 0003 y 0038. Lo único que se otorga aquí es la ejecución del helper nuevo.
grant execute on function public.can_view_comment_subject(text, uuid) to authenticated;
