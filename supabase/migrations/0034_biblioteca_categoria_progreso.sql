-- 0034_biblioteca_categoria_progreso.sql
--
-- QUE LA BIBLIOTECA SE PUEDA ORDENAR Y MEDIR.
--
-- Dos huecos, distintos entre sí:
--
--   1. Solo se podía agrupar por estado (Leyendo / Por leer / Terminado). Con
--      treinta libros eso deja de servir: hace falta saber de qué trata cada
--      uno. Las dos APIs que ya se consultan traen el tema — Google Books en
--      `categories` y Open Library en `subject` — y se estaba tirando.
--
--   2. `books.current_page` se SOBRESCRIBE en cada actualización. La app sabía
--      en qué página vas y no a qué velocidad avanzas, así que no podía decir
--      cuándo terminarás ni avisarte de que llevas tres semanas sin abrirlo.
--
-- La categoría es una lista propia en español y no los temas crudos de la API:
-- un mismo libro llega con «Self-Help», «Personal Growth» y «Success» a la vez,
-- y otro con «Business & Economics». Guardar eso tal cual daría una estantería
-- en inglés, con decenas de grupos casi idénticos y libros repetidos en cinco
-- sitios. Columna con `check`, mismo criterio que `habits.category` y
-- `personal_goals.area`: son valores fijos, no una tabla.

alter table public.books
  add column if not exists category text not null default 'Otros';

alter table public.books
  drop constraint if exists books_category_check;
alter table public.books
  add constraint books_category_check check (category in (
    'Desarrollo personal', 'Negocios', 'Salud', 'Técnico',
    'Ficción', 'Historia', 'Espiritual', 'Otros'
  ));

comment on column public.books.category is
  'Categoría propia en español, una por libro. El buscador de metadatos la PROPONE mapeando lo que devuelven Open Library y Google Books, y el usuario la confirma — la propuesta automática se equivoca lo suficiente como para no guardarla a ciegas.';

create index if not exists idx_books_user_category on public.books(user_id, category);

-- =============================================================================
-- BOOK_PROGRESS — un punto por día
-- =============================================================================
-- Append-only con `unique (book_id, local_date)`, exactamente el patrón de
-- `habit_logs` y `routine_runs`. Un punto por día es justo lo que necesita un
-- cálculo de ritmo: guardar cada pulsación daría decenas de puntos del mismo
-- día que no aportan nada y ensucian la ventana.
--
-- `local_date` y no `now()::date`: el día es el del usuario (profiles.timezone),
-- no el del servidor — en Vercel son las 00:00 UTC cuando en México son las 18
-- del día anterior. La app lo calcula con todayLocal() antes de escribir.
create table if not exists public.book_progress (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.books(id) on delete cascade,
  local_date date not null,
  page integer not null check (page >= 0),
  created_at timestamptz not null default now(),
  unique (book_id, local_date)
);

comment on table public.book_progress is
  'Historial de lectura: un punto por libro y día local. De aquí salen el ritmo de páginas/día, la fecha estimada de término y el aviso de lectura estancada — ver src/lib/domain/development/reading.ts.';
comment on column public.book_progress.local_date is
  'Día del usuario según profiles.timezone, no del servidor. El único por (book_id, local_date) hace que actualizar la página cinco veces en un día deje un solo punto, el último.';

create index if not exists idx_book_progress_book_date on public.book_progress(book_id, local_date desc);

-- =============================================================================
-- RLS — a través del libro padre, patrón de book_notes (0004)
-- =============================================================================
alter table public.book_progress enable row level security;

create policy book_progress_own on public.book_progress for all
  using (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()))
  with check (exists (select 1 from public.books b where b.id = book_id and b.user_id = auth.uid()));

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.book_progress to anon, authenticated;
grant insert, update, delete on public.book_progress to authenticated;
grant all privileges on public.book_progress to service_role;

-- =============================================================================
-- Semilla del historial con lo que ya se sabe
-- =============================================================================
-- Sin esto, cada libro en curso empieza con cero puntos y la estimación cae al
-- respaldo «desde el inicio» hasta que el usuario actualice dos veces. Con un
-- punto de arranque, el primer avance real ya produce una velocidad.
insert into public.book_progress (book_id, local_date, page)
select b.id, coalesce(b.started_at, b.updated_at::date), b.current_page
from public.books b
where b.current_page > 0
on conflict (book_id, local_date) do nothing;
