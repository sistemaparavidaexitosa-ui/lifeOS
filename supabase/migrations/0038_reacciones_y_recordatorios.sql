-- 0038_reacciones_y_recordatorios.sql
--
-- DOS MANERAS DE ACTUAR SOBRE UN MENSAJE SIN ESCRIBIR OTRO.
--
-- El hilo de una tarea ya existe (D-056) y hasta ahora solo admitía una cosa:
-- escribir más. Un «visto», un «de acuerdo» o un «esto ya está» costaban un
-- comentario entero, que es lo que convierte un hilo en ruido.

-- =============================================================================
-- REACCIONES
--
-- Clave primaria compuesta, no `id` propio: la unicidad de (comentario,
-- persona, emoji) es la regla de negocio entera. Con un id suelto habría que
-- comprobar antes de insertar, y dos clics rápidos crearían dos filas — el
-- contador diría 2 con una sola persona detrás.
-- =============================================================================

create table if not exists public.comment_reactions (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  emoji text not null check (char_length(emoji) between 1 and 8),
  created_at timestamptz not null default now(),
  primary key (comment_id, user_id, emoji)
);
comment on table public.comment_reactions is
  'FR-COL-004 (extensión): reaccionar a un comentario. PK compuesta = una persona, un emoji, una vez.';
comment on column public.comment_reactions.emoji is
  'Hasta 8 caracteres: un emoji con modificadores de tono o ZWJ ocupa varios puntos de código. No es texto libre: el `check` impide que alguien meta un párrafo donde va un símbolo.';

create index if not exists idx_comment_reactions_comment on public.comment_reactions(comment_id);

alter table public.comment_reactions enable row level security;

-- Leer: quien pueda leer el comentario. Se reutiliza la MISMA condición que
-- `comments_select` en vez de inventar una función nueva — si algún día cambia
-- quién ve un comentario, sus reacciones cambian con él.
create policy comment_reactions_select on public.comment_reactions for select using (
  exists (
    select 1 from public.comments c
    join public.tasks t on t.id = c.subject_id
    where c.id = comment_id and c.subject_type = 'task' and public.has_project_access(t.project_id)
  )
);

-- Escribir: solo las propias, y solo donde se puede leer. Que `user_id` sea el
-- de la sesión es lo que impide reaccionar en nombre de otro.
create policy comment_reactions_insert on public.comment_reactions for insert with check (
  user_id = auth.uid()
  and exists (
    select 1 from public.comments c
    join public.tasks t on t.id = c.subject_id
    where c.id = comment_id and c.subject_type = 'task' and public.has_project_access(t.project_id)
  )
);

create policy comment_reactions_delete on public.comment_reactions for delete using (user_id = auth.uid());

-- =============================================================================
-- RECORDATORIOS
--
-- `subject_id` es un uuid SIN clave foránea, por la misma razón que
-- `key_results.source_id` (0024): apunta a dos tablas distintas. Si el sujeto
-- desaparece, quien lee decide qué hacer — aquí, callar el recordatorio en vez
-- de llevar a una pantalla que ya no existe.
--
-- `remind_on` es una FECHA, no una marca de tiempo. No hay ningún proceso que
-- despierte a nadie: el recordatorio aparece en Home el día que toca, y el día
-- se decide en la zona horaria del perfil, como todo lo demás (D-016/D-018).
-- Prometer una hora exacta sería prometer algo que no existe.
-- =============================================================================

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  subject_type text not null check (subject_type in ('task', 'comment')),
  subject_id uuid not null,
  text text not null default '',
  remind_on date not null,
  done boolean not null default false,
  created_at timestamptz not null default now()
);
comment on table public.reminders is
  'Recordatorio personal sobre una tarea o un comentario. PRIVADO: nadie ve los de otro, ni siquiera en un espacio compartido.';
comment on column public.reminders.subject_id is
  'uuid SIN FK a propósito: apunta a `tasks` o a `comments`. Si el sujeto desaparece, la capa de datos calla el recordatorio en vez de llevar a una pantalla que ya no existe.';

create index if not exists idx_reminders_user_pending on public.reminders(user_id, remind_on) where done = false;

alter table public.reminders enable row level security;

create policy reminders_select on public.reminders for select using (user_id = auth.uid());
create policy reminders_insert on public.reminders for insert with check (user_id = auth.uid());
create policy reminders_update on public.reminders for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy reminders_delete on public.reminders for delete using (user_id = auth.uid());

-- F9: GRANTS explícitos, aunque 0010 sea el backstop.
grant select on public.comment_reactions, public.reminders to anon, authenticated;
grant insert, update, delete on public.comment_reactions, public.reminders to authenticated;
grant all privileges on public.comment_reactions, public.reminders to service_role;
