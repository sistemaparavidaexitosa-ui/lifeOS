-- 0033_habitos_atomicos.sql
--
-- LA FORMA DEL HÁBITO, NO SOLO SU NOMBRE.
--
-- `habits` guardaba nombre, frecuencia, categoría y un bloque horario opcional.
-- Con eso se puede listar un hábito y contar su racha, pero no se puede
-- describir CÓMO se sostiene, que es de lo que trata «Hábitos atómicos»: el
-- libro no da una lista de hábitos, da reglas para darles forma.
--
-- Se añaden las tres reglas que caben en el esquema y que cambian la conducta:
--
--   cue                  la intención de implementación — «después de X…».
--                        Un hábito sin momento no se ejecuta: se recuerda con
--                        culpa a las once de la noche.
--   stack_after_habit_id el apilamiento sobre un hábito que YA tienes, que es
--                        el disparador más fiable que existe porque ya ocurre
--                        sin esfuerzo.
--   two_min_version      la versión que cabe en dos minutos y no se puede
--                        fallar. Es la que se hace el día malo, y la que
--                        decide si la racha sobrevive a ese día.
--
-- El «a qué hora» NO se añade: ya es `occupation_id`, desde 0004. Duplicarlo
-- daría dos sitios donde decir lo mismo y ninguna forma de saber cuál manda.

alter table public.habits
  add column if not exists cue text not null default '',
  add column if not exists stack_after_habit_id uuid references public.habits(id) on delete set null,
  add column if not exists two_min_version text not null default '';

comment on column public.habits.cue is
  'Intención de implementación: «después de servirme el café…». Texto libre; la plantilla propone una y el usuario la reescribe con su vida, que es el único modo de que signifique algo.';
comment on column public.habits.stack_after_habit_id is
  'Apilamiento: el hábito que dispara a este. on delete set null — que desaparezca el hábito ancla no puede llevarse el que se apiló encima.';
comment on column public.habits.two_min_version is
  'La versión mínima que no se puede fallar. Se muestra como salida para un mal día, no como una meta menor.';

-- Un hábito no puede apilarse sobre sí mismo. Se escribe como restricción y no
-- como validación de la app porque es una imposibilidad, no una preferencia.
alter table public.habits
  drop constraint if exists habits_no_self_stack;
alter table public.habits
  add constraint habits_no_self_stack check (stack_after_habit_id is distinct from id);

-- =============================================================================
-- El hábito ancla tiene que ser TUYO
-- =============================================================================
-- Las claves foráneas NO pasan por RLS: `stack_after_habit_id` aceptaría el id
-- del hábito de otra persona si alguien lo mandara a mano. No filtra nada
-- —seguirías sin poder leer esa fila— pero dejaría una referencia cruzada
-- entre cuentas que nadie sabría explicar después. Se cierra aquí.
create or replace function public.guard_habit_stack_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.stack_after_habit_id is null then
    return new;
  end if;

  if not exists (
    select 1 from public.habits h
    where h.id = new.stack_after_habit_id and h.user_id = new.user_id
  ) then
    raise exception 'Solo puedes apilar un hábito sobre otro hábito tuyo.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_habit_stack_owner on public.habits;
create trigger trg_guard_habit_stack_owner
  before insert or update of stack_after_habit_id on public.habits
  for each row execute function public.guard_habit_stack_owner();

comment on function public.guard_habit_stack_owner is
  'Impide apilar un hábito sobre el de otra cuenta. Necesario porque las claves foráneas no evalúan RLS.';

create index if not exists idx_habits_stack on public.habits(stack_after_habit_id);
