-- =============================================================================
-- 0064 · IDENTIDAD: EN QUIÉN TE ESTÁS CONVIRTIENDO
-- =============================================================================
--
-- Hasta aquí la identidad era una frase suelta por rutina (`routines.identity`,
-- 0046). Servía para recordarte por qué sostienes una rutina, pero no para
-- medir nada: no había a dónde apuntar un hábito ni contra qué comparar lo que
-- haces.
--
-- Esta migración le da forma:
--
--   1) `identity_profiles`: quién quieres ser, tu visión, tus valores y cómo
--      prefieres que te hablen. Una fila por persona.
--   2) `identity_revisions`: el rastro de cómo cambia eso. Lo llena un trigger;
--      la IA lo lee para que el brief acompañe el cambio en vez de ignorarlo.
--   3) `identity_traits`: los rasgos concretos («Soy alguien que entrena»), cada
--      uno en un área de vida.
--   4) `habit_identity_traits`: cada hábito vota por uno o varios rasgos
--      (Hábitos atómicos, cap. 2). Es lo que permite medir identidad y no solo
--      casillas.
--   5) `identity_scores`: la foto diaria del Identity Score. El cálculo vive en
--      `src/lib/domain/identity/score.ts` (D-160); aquí solo se guarda lo que
--      la noche calculó, para dibujar la evolución. Escribe solo el servidor.
--   6) El rasgo entra al grafo como nodo, y cada voto como arista hábito →
--      rasgo. Un rasgo es algo a lo que la persona se refiere (D-148); el
--      registro, la puntuación y el brief no.
--
-- Todo es privado de la persona (BR-012), sin espacio de trabajo.
--
-- Ver `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` §F3.
-- =============================================================================


-- =============================================================================
-- 1) IDENTITY_PROFILES
-- =============================================================================

create table if not exists public.identity_profiles (
  user_id            uuid primary key references auth.users(id) on delete cascade,
  desired_identity   text not null default '' check (char_length(desired_identity) <= 280),
  vision_statement   text not null default '' check (char_length(vision_statement) <= 2000),
  core_values        text[] not null default '{}'
                       check (coalesce(array_length(core_values, 1), 0) <= 10),
  motivational_tone  text not null default 'directo'
                       check (motivational_tone in ('sereno', 'directo', 'intenso')),
  inspirations       text[] not null default '{hill,goddard,clear,sharma}'
                       check (inspirations <@ array['hill', 'goddard', 'clear', 'sharma']),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table public.identity_profiles is
  'Quién quiere ser la persona: identidad deseada, visión, valores y preferencias de tono. Una fila por persona. Lo lee el brief diario de identidad (F4).';
comment on column public.identity_profiles.desired_identity is
  'La identidad que se construye, en una frase: «Soy alguien libre financieramente y disciplinado».';
comment on column public.identity_profiles.motivational_tone is
  'Cómo prefiere que le hable la IA: sereno, directo o intenso. Cambia el registro, no el contenido.';
comment on column public.identity_profiles.inspirations is
  'Qué principios inspiran el brief: Napoleon Hill, Neville Goddard, James Clear, Robin Sharma. Solo principios: nunca se citan ni se atribuyen textos (D-161).';

drop trigger if exists trg_identity_profiles_updated_at on public.identity_profiles;
create trigger trg_identity_profiles_updated_at
  before update on public.identity_profiles
  for each row execute function public.registro_toca_updated_at();

alter table public.identity_profiles enable row level security;
drop policy if exists identity_profiles_own on public.identity_profiles;
create policy identity_profiles_own on public.identity_profiles
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.identity_profiles to anon, authenticated;
grant insert, update, delete on public.identity_profiles to authenticated;
grant all privileges on public.identity_profiles to service_role;


-- =============================================================================
-- 2) IDENTITY_REVISIONS
--
-- Guarda lo que HABÍA antes de cada cambio de identidad, visión o valores. El
-- tono y las inspiraciones no dejan rastro: son preferencias, no quién eres.
-- Nadie escribe aquí a mano: el trigger es `security definer` y la tabla no
-- concede INSERT a `authenticated`.
-- =============================================================================

create table if not exists public.identity_revisions (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  changed_at       timestamptz not null default now(),
  desired_identity text not null,
  vision_statement text not null,
  core_values      text[] not null
);

comment on table public.identity_revisions is
  'Cómo era la identidad antes de cada cambio. La llena `registrar_revision_de_identidad`; la lee el brief para acompañar la evolución.';

create index if not exists idx_identity_revisions_user_changed
  on public.identity_revisions (user_id, changed_at desc);

create or replace function public.registrar_revision_de_identidad()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Un perfil recién rellenado desde vacío no es un cambio de identidad: es la
  -- primera vez que se dice. Guardar «antes no había nada» solo añade ruido.
  if old.desired_identity = '' and old.vision_statement = '' and coalesce(array_length(old.core_values, 1), 0) = 0 then
    return new;
  end if;

  insert into public.identity_revisions (user_id, desired_identity, vision_statement, core_values)
  values (old.user_id, old.desired_identity, old.vision_statement, old.core_values);
  return new;
end;
$$;

drop trigger if exists trg_identity_profiles_revision on public.identity_profiles;
create trigger trg_identity_profiles_revision
  after update of desired_identity, vision_statement, core_values on public.identity_profiles
  for each row
  when (old.desired_identity is distinct from new.desired_identity
     or old.vision_statement is distinct from new.vision_statement
     or old.core_values is distinct from new.core_values)
  execute function public.registrar_revision_de_identidad();

alter table public.identity_revisions enable row level security;
drop policy if exists identity_revisions_own_select on public.identity_revisions;
create policy identity_revisions_own_select on public.identity_revisions
  for select using (user_id = auth.uid());
drop policy if exists identity_revisions_own_delete on public.identity_revisions;
create policy identity_revisions_own_delete on public.identity_revisions
  for delete using (user_id = auth.uid());

grant select on public.identity_revisions to anon, authenticated;
grant delete on public.identity_revisions to authenticated;
grant all privileges on public.identity_revisions to service_role;


-- =============================================================================
-- 3) IDENTITY_TRAITS
-- =============================================================================

create table if not exists public.identity_traits (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users(id) on delete cascade,
  name       text not null check (char_length(btrim(name)) between 1 and 60),
  statement  text not null default '' check (char_length(statement) <= 160),
  -- Mismas áreas que `personal_goals.area`: el radar de Analítica y las metas
  -- hablan el mismo idioma.
  area       text not null default 'Personal'
               check (area in ('Salud', 'Carrera', 'Relaciones', 'Finanzas', 'Aprendizaje', 'Espiritual', 'Personal')),
  position   integer not null default 0,
  active     boolean not null default true,
  created_at timestamptz not null default now()
);

comment on table public.identity_traits is
  'Los rasgos de la identidad que se construye («Disciplinado», «Libre financieramente»). Cada hábito vota por uno o varios (habit_identity_traits). Es nodo del grafo.';
comment on column public.identity_traits.statement is
  'El rasgo en primera persona: «Soy alguien que no negocia sus entrenamientos».';

create index if not exists idx_identity_traits_user
  on public.identity_traits (user_id, active, position);

alter table public.identity_traits enable row level security;
drop policy if exists identity_traits_own on public.identity_traits;
create policy identity_traits_own on public.identity_traits
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.identity_traits to anon, authenticated;
grant insert, update, delete on public.identity_traits to authenticated;
grant all privileges on public.identity_traits to service_role;


-- =============================================================================
-- 4) HABIT_IDENTITY_TRAITS: CADA HÁBITO ES UN VOTO
--
-- Tabla puente sin `user_id`: la RLS mira el hábito, como `habit_logs`. Las
-- claves foráneas no evalúan RLS, así que un guard impide votar con tu hábito
-- por el rasgo de otra persona.
-- =============================================================================

create table if not exists public.habit_identity_traits (
  habit_id   uuid not null references public.habits(id) on delete cascade,
  trait_id   uuid not null references public.identity_traits(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (habit_id, trait_id)
);

comment on table public.habit_identity_traits is
  'Por qué rasgo de identidad vota cada hábito. Un hábito puede votar por varios. Alimenta el componente «Votos por tu identidad» del Identity Score y la arista hábito → rasgo del grafo.';

create index if not exists idx_habit_identity_traits_trait
  on public.habit_identity_traits (trait_id);

create or replace function public.guard_habit_trait_owner()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1
      from public.habits h
      join public.identity_traits t on t.user_id = h.user_id
     where h.id = new.habit_id and t.id = new.trait_id
  ) then
    raise exception 'Un hábito solo puede votar por un rasgo de tu propia identidad.';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_guard_habit_trait_owner on public.habit_identity_traits;
create trigger trg_guard_habit_trait_owner
  before insert or update on public.habit_identity_traits
  for each row execute function public.guard_habit_trait_owner();

alter table public.habit_identity_traits enable row level security;
drop policy if exists habit_identity_traits_own on public.habit_identity_traits;
create policy habit_identity_traits_own on public.habit_identity_traits
  for all
  using (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()))
  with check (exists (select 1 from public.habits h where h.id = habit_id and h.user_id = auth.uid()));

grant select on public.habit_identity_traits to anon, authenticated;
grant insert, update, delete on public.habit_identity_traits to authenticated;
grant all privileges on public.habit_identity_traits to service_role;


-- =============================================================================
-- 5) IDENTITY_SCORES: LA FOTO DE CADA NOCHE
--
-- La persona la lee; solo el servidor la escribe. Si pudiera escribirla desde
-- el cliente, la curva de «evolución de tu identidad» sería un campo editable.
-- `components` guarda el desglose para poder explicar un día pasado con las
-- cifras de ese día, y `formula_version` para no comparar peras con manzanas
-- si la fórmula cambia.
-- =============================================================================

create table if not exists public.identity_scores (
  user_id         uuid not null references auth.users(id) on delete cascade,
  local_date      date not null,
  score           smallint not null check (score between 0 and 100),
  components      jsonb not null default '[]',
  formula_version smallint not null,
  created_at      timestamptz not null default now(),
  primary key (user_id, local_date)
);

comment on table public.identity_scores is
  'Foto diaria del Identity Score (D-160), escrita por el reloj de la noche. El valor de hoy se calcula al pintar; esto sirve para dibujar la evolución.';

alter table public.identity_scores enable row level security;
drop policy if exists identity_scores_own_select on public.identity_scores;
create policy identity_scores_own_select on public.identity_scores
  for select using (user_id = auth.uid());

grant select on public.identity_scores to anon, authenticated;
grant all privileges on public.identity_scores to service_role;


-- =============================================================================
-- 6) EL RASGO EN EL GRAFO
--
-- Tipo de nodo nuevo, entre la meta (40) y el hábito (50): en la leyenda se
-- leen juntos meta → rasgo → hábito → rutina, que es la cadena del módulo.
-- =============================================================================

insert into public.graph_node_types (node_type, label, label_plural, color, is_projected, position) values
  ('identity_trait', 'Rasgo de identidad', 'rasgos de identidad', 'var(--c-orange)', true, 45)
on conflict (node_type) do nothing;

insert into public.graph_sources (
  entity_table, node_type, scope, projector, label_column, tenant_column,
  metadata_fields, watch_columns, route_template, notes
) values
  ('identity_traits', 'identity_trait', 'user', 'user_row', 'name', 'user_id',
   '{statement,area,active}',
   '{name,statement,area,active}', '/development/routines',
   'Los hábitos votan por él a través de habit_identity_traits.');

select public.graph_install_source('identity_traits');
select public.graph_backfill_source('identity_traits');

insert into public.graph_edge_rules (
  source_table, rel_type, nombre, source_column, column_kind, anchor_column,
  target_table, direction, implementado_por, notes
) values
  ('habit_identity_traits', 'supports', 'rasgo', 'trait_id', 'scalar_fk', 'habit_id',
   'identity_traits', 'out', 'graph_edges_habit_identity_traits',
   'Tabla puente: la arista sale del HÁBITO y entra en el rasgo por el que vota. `supports` y no `belongs_to`: un hábito puede votar por varios rasgos.');

select public.graph_install_edges('habit_identity_traits');
select public.graph_backfill_edges('habit_identity_traits');


-- =============================================================================
-- 7) QUE TODO CUADRE (mismo cierre que 0061)
-- =============================================================================

do $$
declare
  v_n int;
  v_detalle text;
begin
  select count(*), string_agg(format('  · %s / %s: %s', entity_table, trigger_name, motivo), e'\n')
    into v_n, v_detalle from public.graph_registry_diff();
  if v_n > 0 then
    raise exception 'graph: los triggers no coinciden con el registro:%', e'\n' || v_detalle
      using errcode = 'P0001';
  end if;

  select count(*), string_agg(format('  · %s: faltan %s, sobran %s', entity_table, faltan, sobran), e'\n')
    into v_n, v_detalle from public.graph_registry_deriva();
  if v_n > 0 then
    raise exception 'graph: hay nodos sin proyectar o proyectados de más:%', e'\n' || v_detalle
      using errcode = 'P0001';
  end if;

  select count(*), string_agg(format('  · %s %s → %s (%s)', lado, source_id, target_id, rel_type), e'\n')
    into v_n, v_detalle from public.graph_edges_deriva();
  if v_n > 0 then
    raise exception 'graph: las aristas vivas no coinciden con las reglas:%', e'\n' || v_detalle
      using errcode = 'P0001';
  end if;
end $$;
