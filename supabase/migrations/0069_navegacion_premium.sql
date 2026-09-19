-- 0069_navegacion_premium.sql
--
-- EL MODO DE NAVEGACIÓN DE CADA PERSONA (D-166).
--
-- La capa del arranque guiado (D-165) deja de ser solo un momento de la mañana:
-- pasa a ser la puerta de la aplicación, un centro premium que abre las
-- pantallas de siempre. Cada persona elige entre ese centro y la navegación
-- habitual, y la elección tiene que seguirla del portátil al teléfono. Por eso
-- vive aquí y no en una cookie.
--
-- SIN FILA = PREMIUM. El usuario pidió que sea «el nuevo sistema de
-- navegación». Salir cuesta un clic y se recuerda.
--
-- SIN AJUSTE DE ADMINISTRACIÓN, por decisión del usuario. La política de 0068
-- sigue gobernando la secuencia de la mañana; el modo es solo de cada quien.

alter table public.ritual_prefs
  add column if not exists nav_mode text not null default 'premium'
  check (nav_mode in ('premium', 'habitual'));

comment on column public.ritual_prefs.nav_mode is
  'Cómo navega esta persona (D-166): «premium» abre el centro al empezar la visita en Home y deja un botón para volver a él; «habitual» es la aplicación de siempre. Sin fila en ritual_prefs, premium.';

-- -----------------------------------------------------------------------------
-- LA PUERTA GANA UNA COLUMNA, Y SIGUE SIENDO UN SOLO VIAJE.
--
-- Con premium por defecto, cada carga de página pasa por el layout. Leer el
-- modo en una consulta aparte sería una segunda consulta en cada clic de cada
-- persona; aquí es una columna más de la RPC que ya se pagaba.
--
-- DROP y no `create or replace`: Postgres no deja cambiar las columnas de
-- salida de una función con `replace`.
-- -----------------------------------------------------------------------------
drop function if exists public.ritual_gate(date);

create function public.ritual_gate(p_date date)
returns table (
  policy_enabled    boolean,
  steps             text[],
  window_start      smallint,
  window_end        smallint,
  frequency         text,
  ai_enabled        boolean,
  blocking          boolean,
  max_routine_steps smallint,
  pref_enabled      boolean,
  pref_steps_off    text[],
  pref_ai           boolean,
  run_exists        boolean,
  pref_nav_mode     text
)
language sql
stable
security invoker
set search_path = public
as $$
  select p.enabled,
         p.steps,
         p.window_start,
         p.window_end,
         p.frequency,
         p.ai_enabled,
         p.blocking,
         p.max_routine_steps,
         coalesce(f.enabled, true),
         coalesce(f.steps_off, '{}'::text[]),
         coalesce(f.ai_enabled, true),
         exists (
           select 1 from public.ritual_runs r
            where r.user_id = auth.uid() and r.local_date = p_date
         ),
         coalesce(f.nav_mode, 'premium')
    from public.ritual_policy p
    left join public.ritual_prefs f on f.user_id = auth.uid();
$$;

comment on function public.ritual_gate(date) is
  'Política + preferencia + «¿ya hay ejecución hoy?» + modo de navegación, en un solo viaje (0068, 0069). security invoker: la RLS de las tres tablas se sigue aplicando.';

grant execute on function public.ritual_gate(date) to authenticated;
