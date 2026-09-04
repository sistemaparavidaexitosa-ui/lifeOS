-- 0049_notificaciones_push.sql
--
-- QUE LA APP PUEDA AVISAR CUANDO NADIE LA ESTÁ MIRANDO.
--
-- Hasta aquí, Life OS solo sabía contarte las cosas si tú entrabas a
-- preguntar. La campana de menciones (0037) se entera al renderizar; los
-- recordatorios (0038) aparecen en Home el día que toca. Todo el sistema
-- asumía a alguien delante de la pantalla.
--
-- Esta migración añade las dos tablas que faltan para romper esa suposición:
-- DÓNDE avisar (`push_subscriptions`, un dispositivo suscrito) y QUÉ avisar
-- (`notifications`, la bandeja que la campana lee y que el envío drena).
--
-- LA BANDEJA NO SUSTITUYE A `comment_reads`, CONVIVE CON ELLA.
-- `comment_reads` sigue siendo la marca de leído de un comentario, y no solo
-- por la campana: `src/lib/insights/facts-loader.ts` la consulta para el hecho
-- «tienes N menciones sin leer». Al marcar leída una notificación de mención
-- se escriben las dos. Quitar una de las dos rompe Intelligence OS en
-- silencio, que es la peor forma de romper algo.

-- =============================================================================
-- DÓNDE AVISAR
--
-- Una fila por dispositivo suscrito, no por persona: el mismo usuario tiene el
-- teléfono y el portátil, y cada uno trae su propio endpoint y sus claves.
-- =============================================================================

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  failure_count integer not null default 0
);

comment on table public.push_subscriptions is
  'Un dispositivo suscrito a las notificaciones push. La entrega la hace service_role desde /api/push/dispatch: leer la suscripción de otro NO se concede a nadie más.';
comment on column public.push_subscriptions.endpoint is
  'UNIQUE GLOBAL, no por (user_id, endpoint). El endpoint identifica al DISPOSITIVO, no a la cuenta: con un unique por pareja convivirían dos filas para el mismo navegador y el aviso de una persona llegaría a la pantalla de la otra. Consecuencia asumida: si otra cuenta ya registró ESTE navegador, la nueva no puede quedárselo (la RLS no deja pisar la fila ajena) y la app lo dice con esas palabras — hay que desactivar en la cuenta anterior.';
comment on column public.push_subscriptions.failure_count is
  'Fallos consecutivos de entrega. Un 404/410 borra la fila en el acto (la suscripción ya no existe); esto es para los errores blandos, que no merecen borrar pero sí dejar de insistir.';

create index if not exists idx_push_subscriptions_user on public.push_subscriptions(user_id);

alter table public.push_subscriptions enable row level security;

-- Cada quien ve, crea y borra SOLO las suyas, y ni siquiera puede leer las
-- ajenas: `endpoint` + `p256dh` + `auth` es material suficiente para que un
-- tercero le haga sonar el teléfono a otro. Por eso la entrega usa
-- service_role y no una función `security definer` — no hay forma de exponer
-- estas columnas a un usuario sin darle esa capacidad.
create policy push_subscriptions_select on public.push_subscriptions for select using (user_id = auth.uid());
create policy push_subscriptions_insert on public.push_subscriptions for insert with check (user_id = auth.uid());
create policy push_subscriptions_update on public.push_subscriptions for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy push_subscriptions_delete on public.push_subscriptions for delete using (user_id = auth.uid());

-- =============================================================================
-- QUÉ AVISAR
--
-- `dedupe_key` con UNIQUE es el corazón de la tabla. El reloj (0051) despierta
-- cada pocos minutos y vuelve a mirar lo mismo; sin esta clave, «esta tarea
-- vence hoy» sonaría en cada pasada. La idempotencia vive en el esquema y no
-- en el código que lo llama, que es donde no se puede olvidar.
-- =============================================================================

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('mention', 'task.assigned', 'reminder', 'task.due')),
  title text not null,
  body text not null default '',
  href text not null,
  dedupe_key text not null,
  created_at timestamptz not null default now(),
  read_at timestamptz,
  delivered_at timestamptz,
  delivery_attempts integer not null default 0,
  unique (user_id, dedupe_key)
);

comment on table public.notifications is
  'La bandeja: lo que hay que contarle a alguien. La campana la lee y el despachador la drena hacia sus dispositivos.';
comment on column public.notifications.dedupe_key is
  'Idempotencia. `mention:<comment_id>`, `assign:<task_id>:<fecha_local>`, `reminder:<reminder_id>`, `due:<fecha_local>`. El UNIQUE con user_id es lo que permite que el reloj reintente sin duplicar.';
comment on column public.notifications.href is
  'A dónde lleva el aviso. Se guarda armado, no se reconstruye al leer: quien crea la notificación sabe si la mención fue en una tarea o en el hilo de un proyecto, y quien la muestra no tiene por qué volver a decidirlo.';
comment on column public.notifications.delivered_at is
  'Cuándo salió el push. NULL = aún no ha salido, y el despachador lo reintenta. No es «visto»: eso es `read_at`, y solo lo escribe quien abre el aviso.';

create index if not exists idx_notifications_user_unread
  on public.notifications(user_id, created_at desc) where read_at is null;
create index if not exists idx_notifications_pendientes
  on public.notifications(created_at) where delivered_at is null;

alter table public.notifications enable row level security;

-- Leer y marcar leídas: solo las propias.
create policy notifications_select on public.notifications for select using (user_id = auth.uid());
create policy notifications_update on public.notifications for update using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy notifications_delete on public.notifications for delete using (user_id = auth.uid());

-- NO HAY POLÍTICA DE INSERT, y es deliberado.
-- Una notificación se le crea a OTRA persona (te menciono, te asigno). Una
-- política `with check (user_id = auth.uid())` haría justo lo contrario de lo
-- que hace falta, y una que dejara escribir la fila de otro convertiría la
-- bandeja en un buzón abierto: cualquiera podría hacerte sonar el teléfono con
-- el texto que quisiera. Se entra por `enqueue_notification`, que comprueba
-- que compartís espacio, o por service_role desde el despachador.

-- =============================================================================
-- PREFERENCIAS
--
-- Sin fila = todo encendido. Es lo contrario del criterio de Intelligence OS
-- (donde todo nace apagado, BR-012) y a propósito: allí el opt-in protege de
-- que unos datos salgan del servidor, aquí no sale nada que el usuario no haya
-- provocado — y una notificación que hay que ir a encender no avisa a nadie.
-- El permiso del navegador ya es el interruptor principal.
-- =============================================================================

create table if not exists public.notification_prefs (
  user_id uuid primary key references auth.users(id) on delete cascade,
  mentions boolean not null default true,
  assignments boolean not null default true,
  reminders boolean not null default true,
  due_digest boolean not null default true,
  digest_hour smallint not null default 8 check (digest_hour between 0 and 23),
  created_at timestamptz not null default now()
);

comment on table public.notification_prefs is
  'Qué avisos quiere recibir cada quien. La AUSENCIA de fila significa «todos»: no hay que crearla al dar de alta a nadie.';
comment on column public.notification_prefs.digest_hour is
  'Hora local (zona del perfil, D-016/D-018) del resumen diario de vencimientos, y hora a la que se entregan los recordatorios sin hora propia.';

alter table public.notification_prefs enable row level security;

create policy notification_prefs_select on public.notification_prefs for select using (user_id = auth.uid());
create policy notification_prefs_insert on public.notification_prefs for insert with check (user_id = auth.uid());
create policy notification_prefs_update on public.notification_prefs for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- LA ÚNICA PUERTA PARA CREARLE UN AVISO A OTRO
--
-- `security definer` con la MISMA forma que `list_workspace_members` (0012):
-- se invoca directamente desde la app, nunca desde dentro de una política, así
-- que no participa en ninguna cadena de recursión.
--
-- La condición es compartir un espacio ACTIVO. No se comprueba el acceso al
-- proyecto concreto: quien llama ya tuvo que leer la tarea para mencionarte, y
-- pedir aquí un segundo permiso solo añadiría una consulta que la RLS de
-- `comments` ya hizo. Lo que sí impide es que un desconocido total te escriba
-- en la bandeja.
-- =============================================================================

create or replace function public.enqueue_notification(
  p_user_id uuid,
  p_kind text,
  p_title text,
  p_body text,
  p_href text,
  p_dedupe_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'enqueue_notification requiere una sesión';
  end if;

  -- Avisarse a uno mismo se permite (el reloj lo hace) pero avisar a un
  -- extraño no. `status = 'Active'` a los dos lados: a quien ya salió del
  -- espacio no se le sigue avisando de lo que pasa dentro.
  if p_user_id <> auth.uid() and not exists (
    select 1
    from public.memberships mio
    join public.memberships suyo on suyo.workspace_id = mio.workspace_id
    where mio.user_id = auth.uid() and mio.status = 'Active'
      and suyo.user_id = p_user_id and suyo.status = 'Active'
  ) then
    raise exception 'No se puede notificar a alguien con quien no se comparte un espacio';
  end if;

  insert into public.notifications (user_id, kind, title, body, href, dedupe_key)
  values (p_user_id, p_kind, p_title, coalesce(p_body, ''), p_href, p_dedupe_key)
  on conflict (user_id, dedupe_key) do nothing
  returning id into v_id;

  -- NULL cuando ya existía. Quien llama lo usa para no reenviar un push que ya
  -- salió: sin esto, editar y reguardar repetiría el aviso.
  return v_id;
end;
$$;

comment on function public.enqueue_notification is
  'La única forma de crearle una notificación a otra persona sin service_role. Exige compartir un espacio activo, y devuelve NULL si la dedupe_key ya existía (no es un error: es que ese aviso ya se dio).';

-- =============================================================================
-- BACKFILL: las menciones que hoy están sin leer
--
-- La campana pasa a leer esta tabla. Sin esto, el día del despliegue todas las
-- menciones pendientes desaparecerían de la vista — no se perderían (los
-- comentarios siguen ahí), pero el aviso sí, que es justo lo que la campana
-- promete no hacer.
--
-- Se rehace la MISMA consulta que `loadUnreadMentions`: mencionado, no autor,
-- sin fila en `comment_reads`. `delivered_at = now()` porque estas no deben
-- sonar: son historia, no novedad. Despertar el teléfono de alguien con veinte
-- menciones de hace un mes sería la peor primera impresión posible.
-- =============================================================================

insert into public.notifications (user_id, kind, title, body, href, dedupe_key, created_at, delivered_at)
select
  destinatario.user_id,
  'mention',
  coalesce(t.title, p.title, 'Un hilo'),
  left(c.body, 200),
  case when c.subject_type = 'task'
    then '/execution?task=' || c.subject_id
    else '/execution?project=' || c.subject_id || '&view=hilo'
  end,
  'mention:' || c.id,
  c.created_at,
  now()
from public.comments c
cross join lateral unnest(c.mentioned_user_ids) as destinatario(user_id)
left join public.tasks t on t.id = c.subject_id and c.subject_type = 'task'
left join public.projects p on p.id = c.subject_id and c.subject_type = 'project'
where destinatario.user_id <> c.author_id
  and coalesce(t.id, p.id) is not null
  and not exists (
    select 1 from public.comment_reads r
    where r.comment_id = c.id and r.user_id = destinatario.user_id
  )
on conflict (user_id, dedupe_key) do nothing;

-- F9: GRANTS explícitos, aunque 0010 sea el backstop.
grant select on public.push_subscriptions, public.notifications, public.notification_prefs to anon, authenticated;
grant insert, update, delete on public.push_subscriptions, public.notification_prefs to authenticated;
-- Ojo: `notifications` NO recibe `insert` (ver arriba). Sí update/delete, que
-- son marcar leída y descartar, ambas sobre la fila propia.
grant update, delete on public.notifications to authenticated;
grant all privileges on public.push_subscriptions, public.notifications, public.notification_prefs to service_role;
grant execute on function public.enqueue_notification(uuid, text, text, text, text, text) to authenticated;
