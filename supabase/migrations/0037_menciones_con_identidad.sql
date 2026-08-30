-- 0037_menciones_con_identidad.sql
--
-- QUE UNA MENCIÓN SEPA A QUIÉN MENCIONA.
--
-- `comments.mentions` guarda NOMBRES desde 0003, y los saca de un regex
-- (`@([\wÀ-ÿ]+)` en task-detail-actions.ts) que corta en el primer espacio: a
-- «@Luis Varsa» le guarda «Luis». Mientras nadie recibiera un aviso eso no
-- rompía nada visible — la mención se pintaba en negrita y ahí moría. En cuanto
-- exista una bandeja, un nombre a medias entrega el aviso a quien se llame
-- parecido, o a nadie.
--
-- Se AÑADE la columna de ids, no se sustituye la de nombres. Los comentarios ya
-- escritos no se pueden reconstruir —del texto «Luis» no sale un uuid— y
-- perderlos sería peor que convivir con dos columnas: la vieja sostiene el
-- histórico, la nueva sostiene la bandeja.
--
-- Lo mismo con `workspace_activity.actor`, que hoy guarda un correo suelto.
-- Sirve para pintar una línea y no para nada más: no se puede enlazar, ni
-- filtrar por persona, ni saber si el actor sigue en el espacio.

alter table public.comments
  add column if not exists mentioned_user_ids uuid[] not null default '{}';

comment on column public.comments.mentioned_user_ids is
  'Ids de los mencionados. Convive con `mentions` (nombres, 0003): esta sostiene la bandeja, aquella el histórico ya escrito.';

-- GIN porque la bandeja pregunta siempre por contención (`@> array[auth.uid()]`),
-- y sin él eso es un recorrido completo de la tabla en cada carga de pantalla.
create index if not exists idx_comments_mentioned_user_ids
  on public.comments using gin (mentioned_user_ids);

alter table public.workspace_activity
  add column if not exists actor_id uuid references auth.users(id) on delete set null;

comment on column public.workspace_activity.actor_id is
  'Quién hizo la acción. `on delete set null`: el rastro de lo que pasó sobrevive a la baja de la cuenta que lo hizo — borrar la fila reescribiría la historia del espacio.';

create index if not exists idx_workspace_activity_workspace_created
  on public.workspace_activity(workspace_id, created_at desc);

-- =============================================================================
-- LEÍDO POR QUIÉN
--
-- `comments.read` existe desde 0003 y nunca se ha escrito. No se usa, y no es
-- por olvido: es UN booleano en la fila del comentario, así que el primero que
-- lo marque lo marca para todos. En un comentario que menciona a tres personas,
-- eso es sencillamente falso.
--
-- Y hay una segunda razón, de seguridad: escribir esa columna exigiría una
-- política UPDATE sobre `comments`, y una política UPDATE que permita marcar
-- leído permite también reescribir el `body`. El aviso de una mención no puede
-- costar el derecho a editar el comentario de otro.
--
-- Lo leído es de quien lee, así que va en su propia tabla. `comments.read` se
-- queda donde está, sin uso: quitarla es una decisión aparte.
-- =============================================================================

create table if not exists public.comment_reads (
  comment_id uuid not null references public.comments(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (comment_id, user_id)
);
comment on table public.comment_reads is
  'Marca de leído POR USUARIO. Clave primaria compuesta: marcar dos veces es idempotente sin lógica en el cliente.';

create index if not exists idx_comment_reads_user on public.comment_reads(user_id);

alter table public.comment_reads enable row level security;

-- Cada quien ve y escribe SOLO sus propias marcas. No hace falta comprobar el
-- acceso al comentario: sin acceso no se puede leer la fila de `comments`, así
-- que una marca sobre un comentario invisible no revela nada de él.
create policy comment_reads_select on public.comment_reads for select
  using (user_id = auth.uid());
create policy comment_reads_insert on public.comment_reads for insert
  with check (user_id = auth.uid());
create policy comment_reads_delete on public.comment_reads for delete
  using (user_id = auth.uid());

-- F9: GRANTS explícitos, aunque 0010 sea el backstop.
grant select on public.comment_reads to anon, authenticated;
grant insert, update, delete on public.comment_reads to authenticated;
grant all privileges on public.comment_reads to service_role;
