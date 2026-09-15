-- =============================================================================
-- 0065 · COACH DE IDENTIDAD: EL BRIEF DEL DÍA
-- =============================================================================
--
-- Cada día, la IA escribe para la persona un brief de identidad: cinco
-- afirmaciones, una visualización de dos a cuatro minutos, un recordatorio de
-- identidad, una pregunta para reflexionar y una cita original inspirada en
-- los principios que eligió (Hill, Goddard, Clear, Sharma). Todo sale de SU
-- identidad, sus rasgos, sus metas y sus hechos (F3), no de un catálogo.
--
-- Una fila por persona y día. Lo que la persona puede tocar es UNA columna,
-- `reactions` («esto me resuena / esto no»), y la base lo impide para el resto
-- con un GRANT por columna: el contenido lo escribe el servidor al generar.
-- Esas reacciones, junto con las afirmaciones de los días anteriores, son la
-- memoria que evita repetirse y que hace evolucionar el tono (D-161).
--
-- El brief es CONTENIDO, no una acción: no escribe nada en el resto del
-- sistema, así que D-089 no aplica. Borrar el historial de IA lo borra.
--
-- Ver `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` §F4.
-- =============================================================================

create table if not exists public.identity_briefs (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null references auth.users(id) on delete cascade,
  local_date          date not null,
  affirmations        jsonb not null,
  visualization       jsonb not null,
  identity_reminder   text not null check (char_length(identity_reminder) <= 300),
  reflection_question text not null check (char_length(reflection_question) <= 300),
  -- Nula cuando la cita no pasó el saneado (atribuida a un autor, o vacía): la
  -- pantalla la omite antes que enseñar algo que parezca copiado.
  quote               jsonb,
  fact_ids            text[] not null default '{}',
  model               text not null default '',
  prompt_version      smallint not null,
  generation          smallint not null default 1 check (generation between 1 and 3),
  reactions           jsonb not null default '{}',
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (user_id, local_date),
  check (jsonb_typeof(affirmations) = 'array'),
  check (jsonb_typeof(visualization) = 'object'),
  check (jsonb_typeof(reactions) = 'object')
);

comment on table public.identity_briefs is
  'El brief de identidad del día, generado por la IA (F4, D-161): afirmaciones, visualización, recordatorio, pregunta y cita original. Una fila por persona y día. La persona solo puede actualizar `reactions`.';
comment on column public.identity_briefs.affirmations is
  'Arreglo de {id, text, trait_id}. `trait_id` es el rasgo al que habla la afirmación, o null.';
comment on column public.identity_briefs.visualization is
  '{title, duration_min (2..4), steps: [{text, seconds}]}.';
comment on column public.identity_briefs.quote is
  '{text, principle}: una cita ORIGINAL inspirada en un principio, nunca atribuida a un autor. Null si no pasó el saneado.';
comment on column public.identity_briefs.reactions is
  'Mapa id de elemento → «resuena» | «no_resuena». Lo único que la persona escribe; lo lee el brief del día siguiente.';
comment on column public.identity_briefs.generation is
  'Cuántas veces se generó hoy (tope 3). El tope real de coste se cuenta en `audit_log`, que la persona no puede borrar.';

create index if not exists idx_identity_briefs_user_date
  on public.identity_briefs (user_id, local_date desc);

drop trigger if exists trg_identity_briefs_updated_at on public.identity_briefs;
create trigger trg_identity_briefs_updated_at
  before update on public.identity_briefs
  for each row execute function public.registro_toca_updated_at();

alter table public.identity_briefs enable row level security;

drop policy if exists identity_briefs_own on public.identity_briefs;
create policy identity_briefs_own on public.identity_briefs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- La acción de generar corre con la sesión de la persona, así que INSERT y el
-- UPDATE del contenido al regenerar los necesita `authenticated`. Lo que no
-- puede es tocar el contenido desde el cliente con la API directa... salvo que
-- se le conceda: por eso UPDATE va por columnas. Regenerar pasa por la acción,
-- que borra y vuelve a insertar.
-- El REVOKE va primero y no sobra: los privilegios por defecto de Supabase ya
-- conceden UPDATE sobre la tabla entera a `authenticated`, y un GRANT por
-- columna encima de eso no restringe nada.
revoke all on public.identity_briefs from anon, authenticated;
grant select, insert, delete on public.identity_briefs to authenticated;
grant select on public.identity_briefs to anon;
grant update (reactions) on public.identity_briefs to authenticated;
grant all privileges on public.identity_briefs to service_role;
