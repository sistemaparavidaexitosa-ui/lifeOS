-- 0028_occupation_days.sql
-- Autogestión del Tiempo: una ocupación recurrente se repite en los días que
-- el usuario elija, no forzosamente en los siete.
--
-- POR QUÉ ESTA MIGRACIÓN SE VE RARA
-- La columna `days` YA EXISTE en producción: se creó a mano desde el dashboard,
-- con su check constraint, y hay una ocupación con un valor real ({0,1,3}).
-- Nunca hubo migración, así que `supabase db reset` en local jamás la
-- reproducía y las dos bases venían divergiendo en silencio.
--
-- Esta migración NO impone un diseño nuevo: adopta exactamente lo que
-- producción ya tiene —mismo nombre, mismo tipo, mismo default, misma
-- convención— y lo vuelve reproducible. En producción es prácticamente un
-- no-op; en local crea lo que faltaba. A partir de aquí las dos bases
-- coinciden y el esquema vuelve a estar bajo control de versiones.
--
-- CONVENCIÓN DE DÍAS: 0 = domingo … 6 = sábado.
-- Es la de `Date.prototype.getUTCDay()`, que es la que el código ya usa
-- (WeekView.tsx). Deliberadamente NO se usa ISO-8601 (1=lunes … 7=domingo):
-- obligaría a convertir en cada lectura y a traducir el dato ya capturado, a
-- cambio de nada.
--
-- Sin cambios de RLS: las columnas nuevas heredan las políticas y los grants
-- de public.occupations (0004_planning_time_habits.sql). Mismo criterio que
-- 0017 y 0026.

-- =============================================================================
-- days — en qué días de la semana se repite una ocupación recurrente
-- =============================================================================
alter table public.occupations
  add column if not exists days smallint[] not null default '{0,1,2,3,4,5,6}';

-- El default son los siete días para que la migración sea NEUTRA: toda
-- ocupación recurrente existente se sigue comportando igual que antes, que es
-- justo lo que hacía `recurring = true`. Sin este default, encender la columna
-- vaciaría la semana de todo el mundo.

-- Se recrea el constraint en vez de asumir su forma: en producción existe
-- (creado a mano) y en local no. Al recrearlo, ambas bases quedan con la misma
-- definición y se le suma la exigencia de al menos un día — un arreglo con
-- `days = '{}'` no se mostraría nunca, que es un estado sin sentido.
-- `coalesce` NO es decorativo: array_length('{}', 1) devuelve NULL, no 0, y un
-- CHECK que evalúa a NULL PASA. Sin el coalesce, el arreglo vacío se colaba
-- —lo destapó el test 4 de 0009_occupation_days.sql, que por eso existe.
alter table public.occupations drop constraint if exists chk_occupations_days_range;
alter table public.occupations
  add constraint chk_occupations_days_range
  check (days <@ array[0,1,2,3,4,5,6]::smallint[] and coalesce(array_length(days, 1), 0) between 1 and 7);

comment on column public.occupations.days is
  'Días en que se repite una ocupación recurrente. 0 = domingo … 6 = sábado, la convención de Date.getUTCDay(). Solo aplica cuando recurring = true; una ocupación con occ_date la ignora. Default = los siete días, que es como se comportaba recurring=true antes de esta columna.';

-- =============================================================================
-- source — quién es dueño del bloque
-- =============================================================================
alter table public.occupations
  add column if not exists source text not null default 'manual';

alter table public.occupations drop constraint if exists occupations_source_check;
alter table public.occupations
  add constraint occupations_source_check check (source in ('manual', 'routine'));

comment on column public.occupations.source is
  'manual = lo creó el usuario en /time. routine = es la proyección de una rutina del Personal Development OS. Decide si borrar la rutina puede borrar el bloque: una rutina no es dueña de un bloque que no creó.';

create index if not exists idx_occupations_source on public.occupations(user_id, source);
