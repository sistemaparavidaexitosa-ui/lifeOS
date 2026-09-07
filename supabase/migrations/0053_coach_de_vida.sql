-- =============================================================================
-- 0053 · LA IA DEJA DE SER UN CHAT Y PASA A SER UN COACH
-- =============================================================================
--
-- Tres cambios que van juntos porque responden a la misma petición del dueño
-- del sistema: «que la IA vea todo, que me hable ella sola dos veces al día, y
-- que las configuraciones se guarden».
--
--  1. Un dominio nuevo, `growth`, encendido por defecto.
--  2. Las preferencias del coach, en la tabla que ya existía para eso.
--  3. Las propuestas del coach, que es lo único que puede provocar en el resto
--     de la app — y solo si la persona pulsa un botón.
--
-- LO QUE ESTA MIGRACIÓN NO HACE, y conviene decirlo: no abre ninguna fila
-- nueva a nadie. La lista blanca de tablas que el modelo puede consultar creció
-- mucho en este mismo cambio, pero vive en `src/lib/insights/context.ts` y se
-- aplica SOBRE la RLS, nunca en su lugar. Todo lo que el modelo lee, lo lee con
-- la llave de sesión del usuario y con sus políticas puestas.
--
-- LA CONSECUENCIA ACEPTADA, dicha sin adornos, igual que en 0048: en este mismo
-- cambio se retiró la seudonimización de nombres. A partir de aquí los nombres
-- reales de cuentas, personas, metas, proyectos y notas viajan a Gemini en cada
-- turno de chat y en cada mensaje diario. Es una decisión del dueño del
-- sistema, tomada con esa información delante, y la razón es que un coach que
-- dice «Cuenta #2» no puede hablar de la vida de nadie.

-- =============================================================================
-- 1) EL DOMINIO `growth`
--
-- `personal_goals` y `key_results` están en la base desde 0024 y nunca
-- pertenecieron a ningún dominio de IA. La consecuencia no era teórica: no
-- había casilla que encender ni tabla que consultar, así que «¿cómo van mis
-- metas?» era literalmente incontestable, y el chat lo decía.
-- =============================================================================

alter table public.profiles
  alter column ai_domains set default
    '{money,debt,habits,time,execution,nutrition,activity,growth}'::text[];

comment on column public.profiles.ai_domains is
  'Dominios cuyos hechos el usuario autoriza a enviar al modelo. Desde 0048 nacen TODOS encendidos; 0053 añade `growth` (metas y lectura). Se apagan uno a uno en /settings. Se aplica en src/lib/insights/context.ts.';

-- Los perfiles que YA existen. Se AÑADE el dominio nuevo a lo que cada quien
-- tuviera, en vez de reescribir la columna entera: quien apagó `money` a
-- conciencia tiene que seguir con `money` apagado después de esto.
update public.profiles
set ai_domains = array_append(ai_domains, 'growth')
where not ('growth' = any(ai_domains));

-- =============================================================================
-- 2) EL COACH, EN LAS PREFERENCIAS QUE YA EXISTÍAN
--
-- `notification_prefs` (0049) tenía esquema, RLS y un defecto sensato, y
-- NADIE LA ESCRIBÍA: el único código que la tocaba era el despachador, que la
-- lee. No había pantalla ni Server Action. Por eso «las configuraciones no se
-- guardan» era una observación correcta y no una impresión: no había nada que
-- guardara. La UI llega en este mismo cambio.
--
-- Las horas por defecto —7 y 21— no son un capricho: el mensaje de la mañana
-- tiene que llegar antes de que el día esté decidido, y el de la noche cuando
-- ya se puede cerrar. Cada quien las mueve en Configuración.
-- =============================================================================

alter table public.notification_prefs
  add column if not exists coach_enabled boolean not null default true,
  add column if not exists coach_morning_hour smallint not null default 7
    check (coach_morning_hour between 0 and 23),
  add column if not exists coach_night_hour smallint not null default 21
    check (coach_night_hour between 0 and 23);

comment on column public.notification_prefs.coach_enabled is
  'Si el coach manda sus dos mensajes diarios. La AUSENCIA de fila sigue significando «todo encendido», igual que el resto de esta tabla.';
comment on column public.notification_prefs.coach_morning_hour is
  'Hora LOCAL (zona del perfil, D-016/D-018) del mensaje de la mañana. El despachador la compara contra la hora local de cada quien, no contra UTC.';

-- El aviso del coach es un tipo nuevo en la bandeja. Sin esto el insert falla
-- por el check y el mensaje se genera para no llegar a ninguna parte.
alter table public.notifications
  drop constraint if exists notifications_kind_check;
alter table public.notifications
  add constraint notifications_kind_check
  check (kind in ('mention', 'task.assigned', 'reminder', 'task.due', 'coach'));

-- =============================================================================
-- 3) LAS PROPUESTAS DEL COACH
--
-- POR QUÉ UNA TABLA Y NO TEXTO DENTRO DEL MENSAJE
-- El coach observa y propone: «este proyecto no tiene estructura», «esta rutina
-- no está agendada». Que la propuesta sea texto la deja en una sugerencia que
-- hay que ir a ejecutar a mano a otra pantalla, que es exactamente el trabajo
-- que el coach existía para quitar. Una fila permite el botón.
--
-- POR QUÉ NO LAS EJECUTA ÉL SOLO
-- Es la misma regla que D-075 y que `createTaskFromChat`: el modelo propone, la
-- persona confirma. Al aceptar no se abre ningún camino de escritura nuevo —se
-- llama a la Server Action que ya crea esa cosa, con sus validaciones y su
-- rastro—. `status` existe para que una propuesta descartada no vuelva a
-- ofrecerse cada vez que se abre el rail.
--
-- POR QUÉ `payload` ES JSONB Y NO COLUMNAS
-- Los cinco tipos no comparten forma: un bloque de tiempo tiene hora de inicio
-- y fin, una meta tiene área y horizonte. Cinco juegos de columnas anulables
-- serían una tabla donde casi todo es NULL y nada se puede comprobar. El
-- esquema real de cada `payload` se valida con zod en el servidor ANTES de
-- llamar a la acción, que es donde una comprobación sirve de algo.
-- =============================================================================

create table if not exists public.coach_proposals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  -- El turno del asistente donde salió. Se borra con él: una propuesta sin la
  -- observación que la motivó es un botón sin contexto.
  message_id uuid not null references public.ai_chat_messages(id) on delete cascade,
  tipo text not null check (tipo in ('tarea', 'bloque', 'rutina', 'estructura', 'meta')),
  titulo text not null,
  detalle text not null default '',
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'dismissed')),
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

comment on table public.coach_proposals is
  'Lo que el coach propone y la persona todavía no ha decidido. Privada de cada usuario, como ai_chat_messages (0045). Aceptar una NO escribe aquí en la app: llama a la Server Action que ya crea esa cosa. Ver 0053.';
comment on column public.coach_proposals.payload is
  'Los campos propios del tipo, validados con zod en el servidor antes de llamar a la acción. jsonb y no columnas porque los cinco tipos no comparten forma.';

-- La consulta es siempre la misma —«mis propuestas pendientes»— y este índice
-- es exactamente esa consulta.
create index if not exists idx_coach_proposals_pendientes
  on public.coach_proposals (user_id, created_at desc) where status = 'pending';

alter table public.coach_proposals enable row level security;

-- Las cuatro sobre la misma condición, sin helper ni join: no hay un segundo
-- sujeto que resolver, igual que en `ai_chat_messages`.
create policy coach_proposals_select on public.coach_proposals
  for select using (user_id = auth.uid());

create policy coach_proposals_insert on public.coach_proposals
  for insert with check (user_id = auth.uid());

create policy coach_proposals_update on public.coach_proposals
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Borrar hace falta para «Borrar historial de IA» en Configuración, que ya
-- vacía las recomendaciones y la conversación, y ahora vacía también esto.
create policy coach_proposals_delete on public.coach_proposals
  for delete using (user_id = auth.uid());

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.coach_proposals to anon, authenticated;
grant insert, update, delete on public.coach_proposals to authenticated;
grant all privileges on public.coach_proposals to service_role;
