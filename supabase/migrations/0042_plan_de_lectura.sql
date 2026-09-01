-- 0042_plan_de_lectura.sql
--
-- QUE LA BIBLIOTECA SEPA QUÉ PENSABAS LEER, Y NO SOLO DÓNDE VAS.
--
-- Hasta aquí la Biblioteca medía el pasado y lo medía bien: `books.current_page`
-- dice en qué página estás, `book_progress` (0034) a qué velocidad avanzas, y
-- reading.ts convierte eso en una fecha de término y en el aviso de que llevas
-- tres semanas sin abrir un libro.
--
-- Lo que no había era la intención. Sin ella:
--   - Home elegía el libro a mostrar por `updated_at` más reciente. Eso señala
--     el que tocaste al final, no el que decidiste leer: con tres libros
--     abiertos, apunta al que abriste por curiosidad.
--   - El Panel de Desarrollo Personal no mencionaba la lectura en absoluto.
--
-- Se programa por SEMANAS, no por fecha objetivo ni por páginas al día. Es la
-- unidad en la que se piensa la lectura ("este mes me leo dos") y la única que
-- permite decir literalmente «el libro de esta semana es X».

-- =============================================================================
-- READING_PLAN_WEEKS — una fila por (libro, semana)
-- =============================================================================
-- Un libro de tres semanas son TRES FILAS. La alternativa —una fila con rango
-- desde/hasta— ahorra filas y cobra aritmética de solapamiento en cada lectura.
-- Con una fila por semana, "los libros de esta semana" es un `where week_start
-- = ?` indexado y sin cálculo, y mover o quitar una semana es tocar una fila.
-- El formulario hace la multiplicación (primera semana + cuántas semanas) y la
-- tabla se queda tonta.
--
-- Mismo patrón que habit_logs (por log_date), routine_runs (por local_date) y
-- book_progress (por local_date): una fila por unidad de tiempo, con un
-- `unique` que vuelve idempotente el doble clic.
create table if not exists public.reading_plan_weeks (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  week_start date not null,
  position integer not null default 0,
  created_at timestamptz not null default now(),
  unique (book_id, week_start)
);

-- El lunes no es una convención de este archivo: routineDueToday('Semanal') ya
-- ancla la semana al lunes y /planning arranca en lunes. Se impone en la
-- columna en vez de confiar en que cada llamador normalice — una semana que
-- empezara en martes rompería la agrupación en silencio, y el bug aparecería
-- semanas después como "un libro que no sale en ninguna semana".
-- extract(dow ...) devuelve 0=domingo, 1=lunes.
alter table public.reading_plan_weeks
  drop constraint if exists reading_plan_weeks_lunes_check;
alter table public.reading_plan_weeks
  add constraint reading_plan_weeks_lunes_check check (extract(dow from week_start) = 1);

comment on table public.reading_plan_weeks is
  'Cola semanal de lectura: qué libro toca qué semana. De aquí sale «el libro de esta semana» en Home y en el Panel de Desarrollo — ver src/lib/domain/development/reading-plan.ts.';
comment on column public.reading_plan_weeks.week_start is
  'SIEMPRE lunes (constraint reading_plan_weeks_lunes_check). Mismo ancla de semana que routineDueToday(''Semanal'') y /planning.';
comment on column public.reading_plan_weeks.position is
  'Orden DENTRO de la semana. Con dos libros la misma semana, el de menor position es el que Home y el Panel muestran como foco.';

-- (week_start, position) y no (book_id): la consulta caliente es «qué libros
-- toca esta semana, en orden», no «qué semanas tiene este libro». El unique de
-- arriba ya deja un índice utilizable por book_id.
create index if not exists idx_reading_plan_week on public.reading_plan_weeks(week_start, position);

-- =============================================================================
-- RLS — a través del libro padre, patrón de book_progress (0034)
-- =============================================================================
-- Sin user_id propio a propósito: la lectura es seguimiento personal privado,
-- sin relación con Workspaces (BR-027), y la privacidad la hereda del libro.
-- Duplicar el dueño aquí abriría la puerta a que las dos filas discrepen.
alter table public.reading_plan_weeks enable row level security;

drop policy if exists reading_plan_weeks_own on public.reading_plan_weeks;
create policy reading_plan_weeks_own on public.reading_plan_weeks for all
  using (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()));

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.reading_plan_weeks to anon, authenticated;
grant insert, update, delete on public.reading_plan_weeks to authenticated;
grant all privileges on public.reading_plan_weeks to service_role;

-- =============================================================================
-- Sin semilla, a propósito
-- =============================================================================
-- Se podría "adivinar" un plan metiendo cada libro Leyendo en la semana actual.
-- Sería el mismo error que inventar una fecha de término: el usuario vería una
-- programación que no escribió y que la app le presentaría como su decisión.
-- La cola arranca vacía y el respaldo de focusBook() —el libro Leyendo más
-- reciente, que es justo lo que Home hacía— cubre el hueco mientras tanto.
