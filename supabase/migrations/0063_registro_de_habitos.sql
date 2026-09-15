-- =============================================================================
-- 0063 · REGISTRO DE HÁBITOS: QUÉ PASÓ, NO SOLO SI PASÓ
-- =============================================================================
--
-- Hasta aquí una fila de `habit_logs` significaba una sola cosa: «hecho ese
-- día». No hacerlo no dejaba rastro, así que el sistema no distinguía entre
-- «lo omití», «hoy no había forma» y «se me olvidó marcarlo». Las tres cosas
-- eran un hueco, y un hueco rompe la racha igual.
--
-- El rediseño de Rutinas mide en quién te estás convirtiendo, y para eso el
-- registro tiene que decir qué pasó:
--
--   1) `habit_logs` gana estado, porcentaje, nota, ánimo y energía.
--        completed  hecho, del 1 al 100 %. Un parcial sigue siendo un voto.
--        skipped    no se hizo. Cuenta en contra y corta la racha.
--        postponed  sin oportunidad. No cuenta ni a favor ni en contra.
--      Las filas que ya existen quedan `completed` al 100 %, que es lo que
--      siempre significaron.
--   2) `daily_reflections`: el check-in del día (ánimo, energía, sueño) y la
--      reflexión. Sin el sueño no hay forma de ver «omites el ejercicio cuando
--      duermes menos de seis horas».
--   3) `habit_log_series[_de]`: el histórico de cada hábito en UNA fila con
--      arreglos. `max_rows = 1000` corta en silencio cualquier consulta más
--      larga, y un año de diez hábitos son 3.650 filas; en arreglos son diez.
--      Las estadísticas NO se guardan: se calculan en
--      `src/lib/domain/development/habit-analytics.ts` (D-162).
--
-- Ver `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` §F1
-- y D-159.
-- =============================================================================


-- =============================================================================
-- 1) HABIT_LOGS: ESTADO, PORCENTAJE, NOTA, ÁNIMO Y ENERGÍA
-- =============================================================================

alter table public.habit_logs
  add column if not exists status text not null default 'completed'
    check (status in ('completed', 'skipped', 'postponed')),
  add column if not exists completion_pct smallint not null default 100
    check (completion_pct between 0 and 100),
  add column if not exists note text not null default ''
    check (char_length(note) <= 500),
  add column if not exists mood smallint check (mood between 1 and 5),
  add column if not exists energy smallint check (energy between 1 and 5),
  add column if not exists updated_at timestamptz not null default now();

-- El porcentaje y el estado se dicen lo mismo dos veces a propósito: un
-- «omitido al 50 %» no significa nada, y si la base lo admitiera cada lector
-- tendría que decidir a cuál de los dos creerle.
alter table public.habit_logs
  drop constraint if exists habit_logs_pct_segun_estado;
alter table public.habit_logs
  add constraint habit_logs_pct_segun_estado
    check ((status = 'completed') = (completion_pct > 0));

comment on column public.habit_logs.status is
  '`completed` hecho (cuenta), `skipped` omitido (cuenta en contra y corta la racha), `postponed` sin oportunidad (no cuenta ni corta). Quien lea «¿se hizo?» filtra `completed`. D-159.';
comment on column public.habit_logs.completion_pct is
  'Cuánto se hizo: 1..100 si está completado, 0 en cualquier otro estado. Un parcial es un voto a medias, no un fallo.';
comment on column public.habit_logs.note is
  'Nota libre del registro. La escribe la persona: si llega a un prompt, va delimitada como texto no confiable.';
comment on column public.habit_logs.mood is 'Ánimo al registrar, 1..5. Opcional.';
comment on column public.habit_logs.energy is 'Energía al registrar, 1..5. Opcional.';
comment on column public.habit_logs.completed_at is
  'Cuándo se registró la fila, en cualquier estado. La hora local sale de aquí y de `profiles.timezone`.';

-- El índice de siempre, con el estado y el porcentaje dentro: las series se
-- leen enteras desde el índice sin tocar la tabla.
drop index if exists public.idx_habit_logs_habit_date;
create index if not exists idx_habit_logs_habit_date
  on public.habit_logs (habit_id, log_date desc) include (status, completion_pct);


-- =============================================================================
-- 2) UPDATED_AT
--
-- Un solo trigger para las dos tablas de esta migración. Las acciones no
-- tienen que acordarse de mandarlo.
-- =============================================================================

create or replace function public.registro_toca_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_habit_logs_updated_at on public.habit_logs;
create trigger trg_habit_logs_updated_at
  before update on public.habit_logs
  for each row execute function public.registro_toca_updated_at();


-- =============================================================================
-- 3) DAILY_REFLECTIONS: EL CHECK-IN DEL DÍA
--
-- Privada de la persona, sin espacio de trabajo (BR-012). Una fila por día: el
-- check-in se corrige, no se acumula.
-- =============================================================================

create table if not exists public.daily_reflections (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,
  mood              smallint check (mood between 1 and 5),
  energy            smallint check (energy between 1 and 5),
  sleep_hours       numeric(3,1) check (sleep_hours between 0 and 24),
  reflection_prompt text not null default '' check (char_length(reflection_prompt) <= 300),
  reflection        text not null default '' check (char_length(reflection) <= 2000),
  wins              text not null default '' check (char_length(wins) <= 1000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  unique (user_id, local_date)
);

comment on table public.daily_reflections is
  'Check-in y reflexión del día: ánimo, energía, horas de sueño, la respuesta a la pregunta del día y los logros. Una fila por persona y día. Es un evento: no se proyecta al grafo (D-148).';
comment on column public.daily_reflections.reflection_prompt is
  'La pregunta que se contestó, copiada tal cual. Si mañana cambia la pregunta, la respuesta de hoy sigue teniendo sentido.';
comment on column public.daily_reflections.sleep_hours is
  'Horas dormidas la noche anterior, en medias horas. Sin esto no hay forma de relacionar sueño y hábitos.';

drop trigger if exists trg_daily_reflections_updated_at on public.daily_reflections;
create trigger trg_daily_reflections_updated_at
  before update on public.daily_reflections
  for each row execute function public.registro_toca_updated_at();

alter table public.daily_reflections enable row level security;

drop policy if exists daily_reflections_own on public.daily_reflections;
create policy daily_reflections_own on public.daily_reflections
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.daily_reflections to anon, authenticated;
grant insert, update, delete on public.daily_reflections to authenticated;
grant all privileges on public.daily_reflections to service_role;


-- =============================================================================
-- 4) HABIT_LOG_SERIES: EL HISTÓRICO EN ARREGLOS
--
-- Una fila por hábito con registros en el rango, y cada arreglo en orden de
-- fecha. `security invoker`: la RLS de `habit_logs` hace el filtro, igual que
-- en una consulta normal.
--
-- La `_de` es para lo que corre sin sesión (el reloj de la noche). Filtra por
-- dueño a mano y se revoca a `anon` y `authenticated` (D-152).
-- =============================================================================

create or replace function public.habit_log_series(p_from date, p_to date)
returns table (
  habit_id uuid,
  dates    date[],
  statuses text[],
  pcts     smallint[],
  moods    smallint[],
  energies smallint[]
)
language sql
stable
security invoker
set search_path = public
as $$
  select l.habit_id,
         array_agg(l.log_date       order by l.log_date),
         array_agg(l.status         order by l.log_date),
         array_agg(l.completion_pct order by l.log_date),
         array_agg(l.mood           order by l.log_date),
         array_agg(l.energy         order by l.log_date)
    from public.habit_logs l
   where l.log_date between p_from and p_to
   group by l.habit_id;
$$;

comment on function public.habit_log_series(date, date) is
  'El histórico de cada hábito visible en una fila con arreglos ordenados por fecha. Existe para esquivar `max_rows`: las estadísticas se calculan en TypeScript (D-162).';

revoke all on function public.habit_log_series(date, date) from public, anon;
grant execute on function public.habit_log_series(date, date) to authenticated, service_role;

create or replace function public.habit_log_series_de(p_uid uuid, p_from date, p_to date)
returns table (
  habit_id uuid,
  dates    date[],
  statuses text[],
  pcts     smallint[],
  moods    smallint[],
  energies smallint[]
)
language sql
stable
security definer
set search_path = public
as $$
  select l.habit_id,
         array_agg(l.log_date       order by l.log_date),
         array_agg(l.status         order by l.log_date),
         array_agg(l.completion_pct order by l.log_date),
         array_agg(l.mood           order by l.log_date),
         array_agg(l.energy         order by l.log_date)
    from public.habit_logs l
    join public.habits h on h.id = l.habit_id
   where h.user_id = p_uid
     and l.log_date between p_from and p_to
   group by l.habit_id;
$$;

comment on function public.habit_log_series_de(uuid, date, date) is
  'Lo mismo que `habit_log_series` para un usuario dado, para el reloj sin sesión. Solo `service_role` (D-152).';

revoke all on function public.habit_log_series_de(uuid, date, date) from public, anon, authenticated;
grant execute on function public.habit_log_series_de(uuid, date, date) to service_role;
