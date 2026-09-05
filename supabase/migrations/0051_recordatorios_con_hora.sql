-- 0051_recordatorios_con_hora.sql
--
-- EL RELOJ. Aquí se revierte, a conciencia, una decisión escrita.
--
-- La migración 0038 dice, con estas palabras: «`remind_on` es una FECHA, no
-- una marca de tiempo. No hay ningún proceso que despierte a nadie: el
-- recordatorio aparece en Home el día que toca. Prometer una hora exacta sería
-- prometer algo que no existe.»
--
-- Era cierto y era honesto. Deja de serlo a partir de aquí: ahora SÍ hay un
-- proceso que despierta a alguien —pg_cron, cada cinco minutos, llamando a
-- /api/push/dispatch— y por tanto una hora exacta ya no es una promesa vacía.
--
-- LO QUE **NO** CAMBIA: la 0040 dice que no hay disparadores por TIEMPO en las
-- automatizaciones del usuario, y eso sigue en pie. Este reloj es del sistema y
-- no aparece en /settings: nadie puede crear una regla «cada lunes». Cambiar
-- eso sería otra decisión, con otras consecuencias.
--
-- Se AÑADE la hora, no se sustituye la fecha — mismo criterio que 0037 y 0050.
-- `remind_on` sigue siendo la fecha que mira Home, y los recordatorios ya
-- escritos siguen valiendo sin hora.

alter table public.reminders
  add column if not exists remind_at time,
  add column if not exists notified_at timestamptz;

comment on column public.reminders.remind_at is
  'Hora local (zona del perfil, D-016/D-018) a la que avisar. NULL = «ese día, sin hora»: se entrega a `notification_prefs.digest_hour`. Se guarda la hora de pared y NO un timestamptz calculado: precalcularlo dejaría el recordatorio desfasado en cuanto el usuario cambie de zona o entre el horario de verano.';
comment on column public.reminders.notified_at is
  'Cuándo se avisó. Es lo que impide que el reloj vuelva a sonar en la pasada siguiente. Distinto de `done`: avisado no es atendido.';

comment on column public.reminders.remind_on is
  'La fecha. Desde 0051 puede llevar hora (`remind_at`) y SÍ existe un proceso que despierta a alguien — el texto de 0038 que decía lo contrario dejó de ser cierto ahí.';

-- El despachador pregunta siempre lo mismo: pendientes, no avisados, de hoy o
-- antes. Sin el índice parcial eso es un recorrido completo cada cinco minutos.
create index if not exists idx_reminders_por_avisar
  on public.reminders(remind_on, remind_at)
  where done = false and notified_at is null;

-- =============================================================================
-- EL RELOJ, EN LA BASE
--
-- pg_cron y no Vercel Cron: en el plan Hobby de Vercel un cron se ejecuta UNA
-- VEZ AL DÍA, lo que convertiría «recordarme a las 15:30» en «recordarme a la
-- hora que le toque al plan». pg_cron da granularidad de minuto y está
-- disponible en el plan gratis de Supabase.
--
-- ⚠️ TODO ESTE BLOQUE ES OPCIONAL Y NO PUEDE TUMBAR LA MIGRACIÓN.
-- `pnpm verify` termina en `supabase db reset`, y la Postgres local en Docker
-- normalmente NO puede cargar pg_cron (necesita `shared_preload_libraries`).
-- Si esto lanzara, la feature entera bloquearía el pipeline. Así que el
-- esquema se aplica siempre y solo el job se salta, diciéndolo por consola.
--
-- ⚠️ LA URL Y EL SECRETO SALEN DE VAULT, NUNCA DE ESTE ARCHIVO.
-- Escribirlos aquí los dejaría en git para siempre. Se cargan a mano, una vez
-- por proyecto (ver /docs/DEPLOY.md):
--
--   select vault.create_secret('https://tu-app/api/push/dispatch', 'push_dispatch_url');
--   select vault.create_secret('<PUSH_DISPATCH_SECRET>',           'push_dispatch_secret');
-- =============================================================================

do $$
declare
  v_url text;
  v_secret text;
begin
  create extension if not exists pg_cron;
  create extension if not exists pg_net;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_dispatch_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_dispatch_secret';

  if v_url is null or v_secret is null then
    raise notice '[0051] Sin push_dispatch_url/push_dispatch_secret en Vault: el reloj NO queda programado. Los avisos instantáneos (menciones, asignaciones) funcionan igual. Ver /docs/DEPLOY.md.';
    return;
  end if;

  if exists (select 1 from cron.job where jobname = 'lifeos_push_dispatch') then
    perform cron.unschedule('lifeos_push_dispatch');
  end if;

  -- Cada cinco minutos. Cada minuto sería precisión falsa: entre que el push
  -- sale y el teléfono lo enseña ya pasan segundos, y el modo Doze de Android
  -- puede añadir minutos. Cinco es lo bastante fino para «a las 15:30» y no
  -- convierte el reloj en ruido constante contra la app.
  perform cron.schedule(
    'lifeos_push_dispatch',
    '*/5 * * * *',
    format(
      $job$select net.http_post(
        url := %L,
        headers := jsonb_build_object('Content-Type', 'application/json', 'x-push-secret', %L),
        body := '{}'::jsonb,
        timeout_milliseconds := 20000
      );$job$,
      v_url, v_secret
    )
  );

  raise notice '[0051] Reloj programado: lifeos_push_dispatch cada 5 minutos.';
exception when others then
  -- El caso normal en local: pg_cron no se puede cargar sin
  -- `shared_preload_libraries`. No es un fallo de la migración.
  raise notice '[0051] No se pudo programar el reloj (%). El esquema queda aplicado; los avisos instantáneos funcionan. Ver /docs/DEPLOY.md.', sqlerrm;
end $$;
