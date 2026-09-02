-- 0045_habitos_dentro_de_rutinas.sql
--
-- EL HÁBITO NO ES UNA ISLA.
--
-- Hasta aquí, `habits` y `routines` eran dos módulos que se rozaban sin
-- unirse: un hábito podía existir sin rutina, un paso podía ser texto libre
-- que nadie contaba, y las dos tablas guardaban su propia `frequency`. Había
-- dos sitios respondiendo «¿toca hoy?» y ninguno mandaba.
--
-- Los tres libros que inspiran el módulo describen la misma cosa: una rutina
-- es una cadena de hábitos, y el hábito se sostiene porque la cadena tira de
-- él. Esta migración lo escribe en el esquema:
--
--   habits.routine_id    obligatorio. Un hábito fuera de una rutina deja de
--                        ser representable, y no por convención de la app:
--                        por un `not null` que la base defiende sola.
--   habits.position      el orden dentro de la rutina, que ES el apilamiento.
--   habits.duration_min  lo que duraba el paso, que ahora dura el hábito.
--   routines.identity    «Soy alguien que no negocia sus mañanas». Cap. 2 de
--                        «Hábitos atómicos»: el hábito no se sostiene por la
--                        meta, se sostiene por quién crees que eres.
--
-- Y borra lo que quedó diciendo lo mismo dos veces: `habits.frequency` (la
-- dicta la rutina), `habits.occupation_id` (el bloque lo ancla la rutina),
-- `routine_steps` entera (el paso ES el hábito) y
-- `routine_runs.completed_step_ids` (el registro vive en `habit_logs`, que ya
-- es único por (habit_id, log_date)).

-- =============================================================================
-- Columnas nuevas
-- =============================================================================
alter table public.habits
  add column if not exists routine_id uuid references public.routines(id) on delete cascade,
  add column if not exists position integer not null default 0,
  add column if not exists duration_min integer not null default 5 check (duration_min > 0);

alter table public.routines
  add column if not exists identity text not null default '';

comment on column public.habits.routine_id is
  'La rutina a la que pertenece. `on delete cascade` y no `set null` como occupation_id (BR-026): el bloque horario es opcional y el hábito le sobrevive, pero sin rutina un hábito ya no puede existir.';
comment on column public.habits.position is
  'El orden dentro de la rutina. ES el apilamiento: «después de qué» se lee de la posición anterior, no de un campo que haya que mantener a mano.';
comment on column public.habits.duration_min is
  'Lo que duraba el paso. Se usa para decir si la rutina cabe en su bloque horario.';
comment on column public.routines.identity is
  'En quién te conviertes al sostenerla. Texto libre y opcional: una rutina sin identidad sigue funcionando, solo que apoyada en la fuerza de voluntad en vez de en quién crees que eres.';

-- =============================================================================
-- Backfill — ver la sección «Backfill» de la spec del 2026-09-01
-- =============================================================================
-- El orden importa: el primero que reclama un hábito se lo queda.
do $$
declare
  r record;
  v_routine_id uuid;
begin
  -- Paso 1. Los hábitos que YA son paso de una rutina heredan esa rutina, con
  -- la posición y la duración que tenía el paso.
  --
  -- `distinct on` resuelve el hábito que está en dos rutinas: gana la de menor
  -- `position`, y a igualdad la más antigua. Se descarta duplicar el hábito
  -- para ponerlo en las dos, que bifurcaría la racha — justo lo que 0024
  -- evitó al inventar `routine_steps.habit_id`.
  --
  -- `rt.id` cierra el orden al final. Sin él el desempate no es total: dos
  -- rutinas creadas en la misma transacción comparten `created_at` —`now()` es
  -- el instante de la transacción, no el de la fila— y las dos nacen con
  -- `position` 0. Ahí el ganador lo elegiría el plan de ejecución, y la misma
  -- base migrada dos veces podría dar dos respuestas distintas. Con `rt.id` el
  -- resultado es reproducible aunque el criterio siga siendo arbitrario.
  with elegido as (
    select distinct on (s.habit_id)
           s.habit_id, s.routine_id, s.position, s.duration_min
      from public.routine_steps s
      join public.routines rt on rt.id = s.routine_id
     where s.habit_id is not null
     order by s.habit_id, rt.position, rt.created_at, s.position, rt.id
  )
  update public.habits h
     set routine_id = e.routine_id,
         position = e.position,
         duration_min = e.duration_min
    from elegido e
   where h.id = e.habit_id;

  -- Paso 2. Los sueltos con bloque horario se agrupan por bloque. Quien ató
  -- tres hábitos a «Mañana» ya había dicho que forman una rutina; lo único que
  -- faltaba era dónde anotarlo.
  for r in
    select h.user_id,
           h.occupation_id,
           o.title,
           (select h2.frequency
              from public.habits h2
             where h2.user_id = h.user_id
               and h2.occupation_id = h.occupation_id
               and h2.routine_id is null
             group by h2.frequency
             -- La más común; a igualdad gana 'Diario', que es el default de la
             -- tabla y el caso que no sorprende a nadie.
             order by count(*) desc, (h2.frequency <> 'Diario'), h2.frequency
             limit 1) as freq
      from public.habits h
      -- `o.user_id = h.user_id` no es redundante con la clave foránea. Las
      -- claves foráneas no evalúan RLS y `habits.occupation_id` nunca tuvo un
      -- guard de propiedad como el que 0033 le puso al apilamiento: un hábito
      -- tuyo podía apuntar legalmente al bloque de otra cuenta. Sin esta
      -- cláusula ese hábito estrenaría una rutina con el TÍTULO del bloque
      -- ajeno y anclada a él, que es filtrar por backfill lo que la aplicación
      -- nunca dejó ver. Con ella cae al paso 3 y se agrupa por frecuencia, que
      -- no revela nada de nadie.
      join public.occupations o on o.id = h.occupation_id and o.user_id = h.user_id
     where h.routine_id is null
     group by h.user_id, h.occupation_id, o.title
  loop
    insert into public.routines (user_id, name, frequency, occupation_id, active, position)
    values (r.user_id, r.title, r.freq, r.occupation_id, true,
            coalesce((select max(position) + 1 from public.routines where user_id = r.user_id), 0))
    returning id into v_routine_id;

    update public.habits h
       set routine_id = v_routine_id, position = sub.pos
      from (select id, (row_number() over (order by created_at, id) - 1) as pos
              from public.habits
             where routine_id is null
               and user_id = r.user_id
               and occupation_id = r.occupation_id) sub
     where h.id = sub.id;
  end loop;

  -- Paso 3. Los sueltos sin bloque se agrupan por frecuencia, que es el único
  -- dato que queda sobre cuándo tocaban. Sin esto perderían ese «cuándo».
  --
  -- No filtra por `occupation_id is null`: es el cajón de sastre, y tiene que
  -- serlo. Tras el paso 2 queda sin rutina el que no tenía bloque y también el
  -- que apuntaba al bloque de otra cuenta, que el paso 2 dejó pasar a
  -- propósito. Si este paso mirara el bloque, ese segundo hábito no lo
  -- recogería nadie y el `set not null` del final tumbaría la migración
  -- entera por un dato que sí se sabe colocar.
  for r in
    select user_id, frequency
      from public.habits
     where routine_id is null
     group by user_id, frequency
  loop
    insert into public.routines (user_id, name, frequency, occupation_id, active, position)
    values (r.user_id,
            case r.frequency
              when 'Diario' then 'Hábitos diarios'
              when 'Semanal' then 'Hábitos semanales'
              when 'Entre semana' then 'Hábitos de entre semana'
              when 'Fin de semana' then 'Hábitos de fin de semana'
            end,
            r.frequency, null, true,
            coalesce((select max(position) + 1 from public.routines where user_id = r.user_id), 0))
    returning id into v_routine_id;

    update public.habits h
       set routine_id = v_routine_id, position = sub.pos
      from (select id, (row_number() over (order by created_at, id) - 1) as pos
              from public.habits
             where routine_id is null
               and user_id = r.user_id
               and frequency = r.frequency) sub
     where h.id = sub.id;
  end loop;

  -- Paso 4. Los pasos de texto libre se convierten en hábitos. Sin logs
  -- previos: nunca los tuvieron, y regalarle una racha a algo que nadie ha
  -- marcado sería mentir en la primera pantalla.
  insert into public.habits (user_id, name, category, routine_id, position, duration_min)
  select rt.user_id, s.title, 'Otros', s.routine_id, s.position, s.duration_min
    from public.routine_steps s
    join public.routines rt on rt.id = s.routine_id
   where s.habit_id is null;
end $$;

-- =============================================================================
-- Cierre del modelo
-- =============================================================================
-- El `set not null` es además la red de seguridad del backfill: si algún
-- hábito se quedó sin rutina, la migración entera revienta aquí y no deja una
-- base a medias.
alter table public.habits alter column routine_id set not null;

alter table public.habits drop column frequency;
alter table public.habits drop column occupation_id;
drop table public.routine_steps;
alter table public.routine_runs drop column completed_step_ids;

comment on table public.routine_runs is
  'Único por (routine_id, local_date). Ya no lleva la lista de pasos hechos: eso vive en habit_logs desde 0045. Sobrevive por started_at y completed_at, que dicen cuándo arrancaste la rutina y cuándo la cerraste — dato que ninguna otra tabla tiene.';

create index if not exists idx_habits_routine on public.habits(routine_id, position);

-- =============================================================================
-- La rutina tiene que ser TUYA
-- =============================================================================
-- Mismo agujero que cerró 0033 para `stack_after_habit_id`: las claves
-- foráneas NO evalúan RLS, así que `routine_id` aceptaría la rutina de otra
-- cuenta si alguien lo mandara a mano. No filtraría nada —seguirías sin poder
-- leer esa fila— pero dejaría una referencia cruzada entre cuentas que nadie
-- sabría explicar después.
create or replace function public.guard_habit_routine_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un hábito sin rutina no es asunto de este guard: lo rechaza el `not null`
  -- de la columna, que es quien tiene el mensaje correcto. Sin esta salida el
  -- trigger se le adelanta —los BEFORE corren antes de que se comprueben las
  -- restricciones de la fila— y a quien se le olvidó `routine_id` le contesta
  -- «la rutina no es tuya», que no es lo que pasó. Misma forma que
  -- guard_habit_stack_owner en 0033.
  if new.routine_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.routines r
    where r.id = new.routine_id and r.user_id = new.user_id
  ) then
    raise exception 'Solo puedes poner un hábito en una rutina tuya.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_habit_routine_owner on public.habits;
create trigger trg_guard_habit_routine_owner
  before insert or update of routine_id on public.habits
  for each row execute function public.guard_habit_routine_owner();

comment on function public.guard_habit_routine_owner is
  'Impide colgar un hábito de la rutina de otra cuenta. Necesario porque las claves foráneas no evalúan RLS.';
