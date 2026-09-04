-- =============================================================================
-- 0047 · NUTRICIÓN — LO QUE COMES NO ES UN DATO MÁS
-- =============================================================================
--
-- Personal Development OS tenía metas, rutinas, hábitos y biblioteca, y nada
-- sobre alimentación — que es justo el dato que más explica por qué una racha
-- se rompe. Esta migración no trae «otra app de calorías dentro»: trae el
-- diario que las metas leen (§4), la rutina abre (`habits.meal`) y la IA cita
-- (dominio `nutrition`).
--
-- TRES DECISIONES QUE SE APARTAN DE LO QUE HACE EL RESTO DEL REPO, y por eso
-- se justifican aquí y no en un comentario suelto:
--
-- 1. `foods` NO LLEVA `user_id`. Es la única tabla del OS que se salta
--    BR-012/019/027, y es deliberado: el límite de Open Food Facts es de 15
--    peticiones por minuto POR IP, y todos los usuarios del despliegue
--    comparten la IP de Vercel. Una caché por usuario no ahorraría ni una
--    petición, que es exactamente para lo que la caché existe. Lo que la hace
--    inocua es lo que NO guarda: no registra quién buscó qué. Son copias de
--    filas públicas, no datos de nadie. Y la escritura no se controla con RLS
--    sino con GRANT — `authenticated` no puede insertar, porque vía PostgREST
--    cualquiera envenenaría la caché de todos.
--
-- 2. EL DIARIO GUARDA COPIA DE LOS NÚMEROS, no un join a `foods`. Es lo
--    contrario de la regla de D-093 («dos sitios diciendo lo mismo es un sitio
--    donde mentir») y aquí la regla se invierte a propósito: en Open Food Facts
--    la ficha de un producto la edita cualquiera. Por join, que un desconocido
--    corrija hoy un yogur reescribiría lo que desayunaste en marzo. Un diario
--    que cambia el pasado no mide nada. `food_id` se conserva solo como
--    procedencia, y con `on delete set null` para que purgar la caché no toque
--    el historial.
--
-- 3. `food_entries` NO LLEVA `unique (user_id, local_date, meal)`, a diferencia
--    de `habit_logs`, `routine_runs` y `book_progress`. Allí el `unique` existe
--    porque marcar es un TOGGLE y el doble clic tiene que ser idempotente;
--    aquí dos manzanas son dos manzanas. La protección contra el envío
--    duplicado es que la línea de más se ve en la lista y se borra con un
--    toque, cosa que un toggle duplicado no permitía.
--
-- `body_measurements` sí lo lleva, y por el motivo de siempre: un peso por día
-- es un valor, no una lista.
--
-- Sin semilla, a propósito: el diario de otro no le sirve a nadie.
--
-- ODbL: lo que se guarde en `foods` con `source = 'off'` es base de datos
-- derivada de Open Food Facts. La atribución viaja en la interfaz junto a esas
-- filas. Queda escrito aquí para que no se descubra tarde.

-- -----------------------------------------------------------------------------
-- 1) nutrition_profiles — el cuerpo que fija los objetivos
-- -----------------------------------------------------------------------------
-- Tabla propia y no columnas nuevas en `profiles`: esa tabla la lee CADA
-- request vía `getUserTimeZone()`, y colgarle peso, sexo y fecha de nacimiento
-- pasearía dato de salud por toda la app. Separado además se puede borrar solo.

create table if not exists public.nutrition_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  sex text not null,
  birth_date date not null,
  height_cm numeric(5,1) not null,
  weight_kg numeric(5,1) not null,
  activity_level text not null default 'Ligero',
  goal text not null default 'Mantener',
  protein_g_per_kg numeric(3,1) not null default 1.6,
  fat_pct integer not null default 25,
  kcal_override integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_sexo_check;
alter table public.nutrition_profiles add constraint nutrition_profiles_sexo_check
  check (sex in ('Hombre', 'Mujer'));

alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_actividad_check;
alter table public.nutrition_profiles add constraint nutrition_profiles_actividad_check
  check (activity_level in ('Sedentario', 'Ligero', 'Moderado', 'Alto', 'Muy alto'));

alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_objetivo_check;
alter table public.nutrition_profiles add constraint nutrition_profiles_objetivo_check
  check (goal in ('Perder', 'Mantener', 'Ganar'));

alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_altura_check;
alter table public.nutrition_profiles add constraint nutrition_profiles_altura_check
  check (height_cm between 80 and 250);

alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_peso_check;
alter table public.nutrition_profiles add constraint nutrition_profiles_peso_check
  check (weight_kg between 25 and 400);

alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_proteina_check;
alter table public.nutrition_profiles add constraint nutrition_profiles_proteina_check
  check (protein_g_per_kg between 0.5 and 3.0);

alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_grasa_check;
alter table public.nutrition_profiles add constraint nutrition_profiles_grasa_check
  check (fat_pct between 15 and 45);

-- EL SUELO DE 1000 NO ES UN RANGO RAZONABLE MÁS. La app no puede ser el
-- instrumento con el que alguien se fija 600 kcal al día. El suelo blando —el
-- metabolismo basal, 1200/1500— lo pone el dominio y se puede discutir; este
-- lo defiende Postgres y no se discute.
alter table public.nutrition_profiles drop constraint if exists nutrition_profiles_override_check;
alter table public.nutrition_profiles add constraint nutrition_profiles_override_check
  check (kcal_override is null or kcal_override between 1000 and 6000);

comment on table public.nutrition_profiles is
  'Perfil corporal del usuario. Fija los objetivos diarios, que NO se guardan: se calculan en domain/development/nutrition.ts para que no se desactualicen al cambiar el peso.';
comment on column public.nutrition_profiles.birth_date is
  'La fecha y no la edad: una edad entera se equivoca el día del cumpleaños y nadie la corrige.';
comment on column public.nutrition_profiles.weight_kg is
  'El peso VIGENTE, el que alimenta el cálculo. El histórico está en body_measurements; se duplica a propósito porque el objetivo no puede depender de que exista una medición de hoy.';
comment on column public.nutrition_profiles.kcal_override is
  'Objetivo fijado a mano. Suelo duro de 1000 kcal: es una salvaguarda, no un rango.';

-- -----------------------------------------------------------------------------
-- 2) body_measurements — el peso a lo largo del tiempo
-- -----------------------------------------------------------------------------
-- Patrón de diario idéntico a book_progress. El `unique` SÍ corresponde aquí:
-- pesarse dos veces el mismo día no son dos datos, es el mismo corregido.

create table if not exists public.body_measurements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  weight_kg numeric(5,1) not null,
  body_fat_pct numeric(4,1),
  created_at timestamptz not null default now(),
  unique (user_id, local_date)
);

alter table public.body_measurements drop constraint if exists body_measurements_peso_check;
alter table public.body_measurements add constraint body_measurements_peso_check
  check (weight_kg between 25 and 400);

alter table public.body_measurements drop constraint if exists body_measurements_grasa_check;
alter table public.body_measurements add constraint body_measurements_grasa_check
  check (body_fat_pct is null or body_fat_pct between 2 and 70);

comment on table public.body_measurements is
  'Un peso por usuario y día local. Es la fuente de una meta como «bajar a 78 kg», que se mide sola (key_results.source_metric = peso).';

-- La consulta caliente es la tendencia: el peso del usuario, del más reciente
-- hacia atrás.
create index if not exists idx_body_measurements_user on public.body_measurements(user_id, local_date desc);

-- -----------------------------------------------------------------------------
-- 3) foods — la caché local de alimentos consultados
-- -----------------------------------------------------------------------------

create table if not exists public.foods (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_ref text not null,
  name text not null,
  brand text not null default '',
  kcal_100g numeric(7,2) not null,
  protein_100g numeric(6,2) not null default 0,
  carbs_100g numeric(6,2) not null default 0,
  fat_100g numeric(6,2) not null default 0,
  serving_g numeric(7,2),
  serving_label text not null default '',
  -- Columna generada y no un índice sobre la expresión: así la búsqueda se
  -- escribe contra una columna real (`textSearch("search", …)`) y el índice se
  -- usa de verdad. Un índice sobre `name || brand` con la consulta sobre
  -- `name` compila igual y no lo toca nadie.
  search tsvector generated always as (to_tsvector('simple', name || ' ' || brand)) stored,
  fetched_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (source, source_ref)
);

-- `source` NO admite 'manual': un alimento que el usuario teclea es dato
-- personal y se queda en su diario. Es lo que mantiene cierta la única
-- afirmación que justifica que esta tabla sea global.
alter table public.foods drop constraint if exists foods_source_check;
alter table public.foods add constraint foods_source_check
  check (source in ('usda', 'off'));

alter table public.foods drop constraint if exists foods_kcal_check;
alter table public.foods add constraint foods_kcal_check
  check (kcal_100g >= 0 and kcal_100g <= 900);

alter table public.foods drop constraint if exists foods_macros_check;
alter table public.foods add constraint foods_macros_check
  check (protein_100g between 0 and 100 and carbs_100g between 0 and 100 and fat_100g between 0 and 100);

alter table public.foods drop constraint if exists foods_porcion_check;
alter table public.foods add constraint foods_porcion_check
  check (serving_g is null or serving_g > 0);

comment on table public.foods is
  'Caché de alimentos consultados en USDA y Open Food Facts. SIN user_id a propósito: el límite de OFF es por IP compartida, así que una caché por usuario no ahorraría ninguna petición. No guarda quién buscó qué, que es lo que la hace inocua.';
comment on column public.foods.kcal_100g is
  'Todo por 100 g, siempre. serving_g es informativa (el botón «1 porción»), nunca la base del cálculo.';

-- Búsqueda de texto con configuración `simple` y NO `spanish` (deviación
-- consciente de 0039): el catálogo mezcla inglés de USDA con marcas de
-- cualquier idioma, y el stemmer español destroza «chicken breast» sin ayudar
-- con «Nutella». `simple` no stemea, que es lo correcto aquí.
create index if not exists idx_foods_busqueda on public.foods using gin (search);

-- -----------------------------------------------------------------------------
-- 4) food_entries — el diario
-- -----------------------------------------------------------------------------

create table if not exists public.food_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  meal text not null,
  position integer not null default 0,
  food_id uuid references public.foods(id) on delete set null,
  name text not null,
  brand text not null default '',
  grams numeric(7,2) not null,
  kcal numeric(7,2) not null,
  protein_g numeric(6,2) not null default 0,
  carbs_g numeric(6,2) not null default 0,
  fat_g numeric(6,2) not null default 0,
  created_at timestamptz not null default now()
);

alter table public.food_entries drop constraint if exists food_entries_comida_check;
alter table public.food_entries add constraint food_entries_comida_check
  check (meal in ('Desayuno', 'Almuerzo', 'Cena', 'Snack'));

alter table public.food_entries drop constraint if exists food_entries_gramos_check;
alter table public.food_entries add constraint food_entries_gramos_check
  check (grams > 0 and grams <= 5000);

alter table public.food_entries drop constraint if exists food_entries_macros_check;
alter table public.food_entries add constraint food_entries_macros_check
  check (kcal >= 0 and protein_g >= 0 and carbs_g >= 0 and fat_g >= 0);

comment on table public.food_entries is
  'El diario de comidas. Es tabla PADRE (lleva user_id) porque foods no tiene dueño del que heredar privacidad.';
comment on column public.food_entries.food_id is
  'Solo procedencia, y anulable: purgar la caché o que OFF retire un producto no puede tocar el historial.';
comment on column public.food_entries.kcal is
  'COPIA congelada, no un join a foods. En Open Food Facts la ficha la edita cualquiera; por join, una corrección de hoy reescribiría lo que comiste en marzo.';

-- Exactamente la consulta del día: las entradas de una fecha, agrupadas por
-- comida y en su orden.
create index if not exists idx_food_entries_dia on public.food_entries(user_id, local_date, meal, position);

-- -----------------------------------------------------------------------------
-- 5) Tablas existentes que se amplían
-- -----------------------------------------------------------------------------

-- Un hábito puede SER una comida. Etiqueta, no una segunda verdad: el hábito se
-- sigue completando en habit_logs (D-094) y esto solo dice a cuál corresponde.
alter table public.habits add column if not exists meal text;
alter table public.habits drop constraint if exists habits_meal_check;
alter table public.habits add constraint habits_meal_check
  check (meal is null or meal in ('Desayuno', 'Almuerzo', 'Cena', 'Snack'));
comment on column public.habits.meal is
  'Etiqueta, NO una segunda fuente de verdad. habit_logs sigue siendo la única respuesta a «¿lo hice hoy?» (D-094); esto permite que marcar el hábito abra el registro de esa comida.';

-- Sexta fuente automática. `key_results_source_shape` NO se toca: 'nutrition'
-- no es 'manual', así que exige source_id, y lo tiene — apunta a la fila de
-- nutrition_profiles del propio usuario, que es LA fila que define los
-- objetivos contra los que se mide todo.
alter table public.key_results drop constraint if exists key_results_source_kind_check;
alter table public.key_results add constraint key_results_source_kind_check
  check (source_kind in ('habit', 'project', 'book', 'financial_goal', 'savings_goal', 'nutrition', 'manual'));

-- Una meta de nutrición puede seguir DOS cosas, y source_kind solo dice de qué
-- módulo viene. La alternativa era una tabla nutrition_targets cuyo único
-- consumidor sería key_results.
alter table public.key_results add column if not exists source_metric text not null default 'adherencia';
alter table public.key_results drop constraint if exists key_results_source_metric_check;
alter table public.key_results add constraint key_results_source_metric_check
  check (source_metric in ('adherencia', 'peso'));
-- La línea de partida de una meta DESCENDENTE. Sin ella, 81 kg contra un
-- objetivo de 78 dan 103 % y la meta nacería cumplida: lo que se avanza es el
-- trecho recorrido desde donde se empezó, no la razón entre dos pesos.
alter table public.key_results add column if not exists baseline numeric(20,6);
comment on column public.key_results.baseline is
  'Valor de partida. Solo lo usan las metas descendentes (source_metric = peso); nulo en las demás, donde el progreso es current/target.';

comment on column public.key_results.source_metric is
  'Solo lo lee source_kind = nutrition: adherencia (% de días en banda, desde food_entries) o peso (desde body_measurements). Para las demás fuentes es un default que nadie mira.';
comment on column public.key_results.source_kind is
  'Seis fuentes automáticas (habit/project/book/financial_goal/savings_goal/nutrition) y una manual. Ampliar esta lista exige tocar SourceSnapshot en domain/development/goals.ts: un valor que la base acepte y el dominio no sepa leer deja el resultado clave en 0% para siempre.';

-- La memoria de la IA necesita poder guardar «es celíaco» sin forzarlo dentro
-- de `preference`.
alter table public.memory_items drop constraint if exists memory_items_scope_check;
do $$
begin
  if exists (select 1 from pg_constraint where conname = 'memory_items_scope_check1') then
    alter table public.memory_items drop constraint memory_items_scope_check1;
  end if;
end $$;
alter table public.memory_items drop constraint if exists memory_items_scope_valores;
alter table public.memory_items add constraint memory_items_scope_valores
  check (scope in ('goal', 'project', 'finance', 'decision', 'preference', 'time', 'habit', 'health'));

-- -----------------------------------------------------------------------------
-- 6) RLS
-- -----------------------------------------------------------------------------
-- Tres de las cuatro tablas son privadas por user_id, como todo Personal
-- Development (BR-012/019/027). La cuarta, `foods`, es la excepción explicada
-- en la cabecera y su escritura se cierra con GRANT, no con RLS.

alter table public.nutrition_profiles enable row level security;
drop policy if exists nutrition_profiles_own on public.nutrition_profiles;
create policy nutrition_profiles_own on public.nutrition_profiles for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.body_measurements enable row level security;
drop policy if exists body_measurements_own on public.body_measurements;
create policy body_measurements_own on public.body_measurements for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.food_entries enable row level security;
drop policy if exists food_entries_own on public.food_entries;
create policy food_entries_own on public.food_entries for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

alter table public.foods enable row level security;
drop policy if exists foods_lectura on public.foods;
create policy foods_lectura on public.foods for select
  using (auth.role() = 'authenticated');

-- -----------------------------------------------------------------------------
-- 7) GRANTS (F9 🔴)
-- -----------------------------------------------------------------------------

grant select on public.nutrition_profiles, public.body_measurements, public.food_entries to anon, authenticated;
grant insert, update, delete on public.nutrition_profiles, public.body_measurements, public.food_entries to authenticated;
grant all privileges on public.nutrition_profiles, public.body_measurements, public.food_entries to service_role;

-- `foods` SE LEE por cualquier autenticado y NO SE ESCRIBE por nadie salvo el
-- servidor. Sin esta asimetría, un token anónimo podría envenenar por PostgREST
-- la caché que ven todos los usuarios. Lo comprueba una aserción pgTAP.
grant select on public.foods to anon, authenticated;
grant all privileges on public.foods to service_role;
