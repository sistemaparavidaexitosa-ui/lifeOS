-- =============================================================================
-- 0067 · ARQUITECTO DE MANIFESTACIÓN: EL BRIEF CRECE, Y APRENDE
-- =============================================================================
--
-- El brief de identidad (0065, D-161) funciona: cinco afirmaciones, una escena
-- de dos a cuatro minutos, un recordatorio, una pregunta y una cita original.
-- Lo que no hace es CERRAR EL DÍA. Se lee por la mañana y ahí muere: no deja
-- una frase que repetir, no deja nada que HACER, y —lo importante— nadie mira
-- nunca si el día que vino detrás fue mejor o peor que los demás.
--
-- Esta migración añade las dos mitades que faltaban:
--
--   1) LO QUE SE ESCRIBE. `identity_briefs` gana mantra, acción concreta del
--      día, área de foco y la marca de quién lo escribió. Las afirmaciones
--      ganan categoría dentro de su jsonb, y pasan de cinco a veinte.
--   2) LO QUE PASÓ DESPUÉS. `identity_brief_style` guarda con qué ESTILO se
--      escribió cada brief y qué se midió al cerrar ese día. De ahí sale el
--      libro de estilo: qué forma de hablarle a esta persona acompaña a sus
--      mejores días (D-164).
--
-- TODO LO NUEVO ES NULLABLE, Y NO POR COMODIDAD. El brief lo escribe un agente
-- en Python, y `src/lib/identity/generar.ts` queda como respaldo cuando ese
-- agente no responde. El respaldo produce cinco afirmaciones y ninguna de las
-- piezas nuevas. Si `mantra` fuera `not null`, un contenedor caído dejaría a la
-- persona SIN BRIEF en vez de con uno más corto. La pantalla omite lo que falta
-- y no necesita una rama especial para hacerlo.
--
-- LA CATEGORÍA NO ES UNA COLUMNA, Y `focus_area` NO ES UNA CATEGORÍA.
-- Se pidieron once categorías de afirmación (carrera, negocio, dinero,
-- liderazgo, disciplina, confianza, relaciones, salud, aprendizaje, propósito,
-- espiritualidad). Las áreas de 0064 son siete y son ESTRUCTURALES: alimentan
-- el radar de Analítica y el componente «equilibrio» del Identity Score.
-- Ampliarlas a once obligaría a migrar datos y repintar el radar por una
-- etiqueta de presentación. Así que la categoría vive dentro del jsonb de la
-- afirmación —donde no necesita esquema— y una función pura la proyecta a un
-- área. `focus_area` sí es un área, con su check contra las mismas siete, para
-- que se pueda cruzar con el score.
--
-- Ver `docs/superpowers/specs/2026-09-17-arquitecto-de-manifestacion-design.md`
-- y D-164.
-- =============================================================================


-- =============================================================================
-- 1) LO QUE EL BRIEF AHORA TAMBIÉN LLEVA
-- =============================================================================

alter table public.identity_briefs
  add column if not exists mantra        text,
  add column if not exists daily_action  jsonb,
  add column if not exists focus_area    text,
  add column if not exists action_done   boolean not null default false,
  add column if not exists generator     text not null default 'ts',
  add column if not exists agent_version text not null default '';

-- Los checks van por separado y con `not valid` NO: la tabla es de una fila por
-- persona y día, y validar lo existente es instantáneo. Todos toleran el NULL,
-- que es exactamente lo que escribe el respaldo.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'identity_briefs_mantra_check') then
    alter table public.identity_briefs
      add constraint identity_briefs_mantra_check
      check (mantra is null or char_length(btrim(mantra)) between 8 and 140);
  end if;

  if not exists (select 1 from pg_constraint where conname = 'identity_briefs_daily_action_check') then
    alter table public.identity_briefs
      add constraint identity_briefs_daily_action_check
      check (daily_action is null or jsonb_typeof(daily_action) = 'object');
  end if;

  if not exists (select 1 from pg_constraint where conname = 'identity_briefs_focus_area_check') then
    alter table public.identity_briefs
      add constraint identity_briefs_focus_area_check
      check (focus_area is null or focus_area in
        ('Salud', 'Carrera', 'Relaciones', 'Finanzas', 'Aprendizaje', 'Espiritual', 'Personal'));
  end if;

  if not exists (select 1 from pg_constraint where conname = 'identity_briefs_generator_check') then
    alter table public.identity_briefs
      add constraint identity_briefs_generator_check
      check (generator in ('ts', 'py'));
  end if;
end $$;

comment on column public.identity_briefs.mantra is
  'Una sola frase, máximo 20 palabras, para repetir durante el día. El tope de palabras lo impone el saneado puro; aquí solo el suelo de caracteres. Nulo cuando lo escribió el respaldo.';
comment on column public.identity_briefs.daily_action is
  '{text, trait_id, area}: la acción CONCRETA del día. «Llama al cliente», no «sé más constante». Nula cuando lo escribió el respaldo.';
comment on column public.identity_briefs.focus_area is
  'El área (de las 7 de 0064, no de las 11 categorías) en la que se concentra el brief de hoy. Es área y no categoría para poder cruzarse con el desglose del Identity Score.';
comment on column public.identity_briefs.action_done is
  'Si la persona marcó hecha la acción del día. Es la SEGUNDA (y única otra) cosa que la persona escribe sobre su brief, junto a `reactions`, y cierra el bucle del libro de estilo.';
comment on column public.identity_briefs.generator is
  'Quién escribió esta fila: el agente Python («py») o el respaldo TypeScript («ts»). Sin esto, un mes de briefs cortos no se puede atribuir a un agente caído — se vería como un cambio de humor del modelo.';
comment on column public.identity_briefs.agent_version is
  'Versión del agente que lo escribió, para poder aislar una regresión a un despliegue concreto. Vacía cuando lo escribió el respaldo.';

-- Los comments de estas dos cambian de forma, y un comment que describe la
-- forma anterior es peor que no tenerlo.
comment on column public.identity_briefs.affirmations is
  'Arreglo de {id, text, trait_id, category}. `trait_id` es el rasgo al que habla la afirmación, o null. `category` es una de las 11 categorías de presentación, o null si no se reconoció. Hasta 20 elementos (ids a1..a20); el respaldo escribe 5.';
comment on column public.identity_briefs.visualization is
  '{title, duration_min (2..7), steps: [{text, seconds}]}. Hasta 12 pasos: el arco completo del agente son nueve tiempos (respiración, calma, escena, sensaciones, conversaciones, resultados, emoción, gratitud, regreso). El respaldo sigue escribiendo de 4 a 7 pasos y 2..4 minutos.';

comment on table public.identity_briefs is
  'El brief de identidad del día (F4, D-161; ampliado en D-164): afirmaciones con categoría, visualización, mantra, acción del día, recordatorio, pregunta y cita original. Una fila por persona y día. La persona solo puede actualizar `reactions` y `action_done`.';

-- EL GRANT POR COLUMNA DE 0065 YA PROTEGE LO NUEVO, y conviene decir por qué
-- para que nadie «lo complete» más adelante: aquel `revoke all` + `grant
-- update (reactions)` significa que las columnas que se añadan heredan el
-- INSERT de la tabla pero NO heredan UPDATE. Es decir, `mantra`,
-- `daily_action`, `focus_area`, `generator` y `agent_version` quedan fuera del
-- alcance de escritura de la persona sin escribir una línea más.
--
-- La única excepción es marcar hecha la acción del día, que es precisamente
-- algo que la persona hace.
grant update (action_done) on public.identity_briefs to authenticated;


-- =============================================================================
-- 2) IDENTITY_BRIEF_STYLE: EL LIBRO DE ESTILO
--
-- Una fila por brief. La mitad de arriba se escribe al generar (con qué estilo
-- se le habló); la mitad de abajo, al cerrar el día siguiente (qué pasó).
--
-- UNA TABLA Y NO DOS. Etiqueta y resultado son las dos mitades del MISMO
-- experimento: separarlas obligaría a un join en cada lectura y permitiría
-- resultados huérfanos, que es justo lo que envenenaría la correlación.
--
-- CUELGA DEL BRIEF CON `on delete cascade`, y eso es una decisión de
-- privacidad, no de integridad: «borrar historial de IA» borra `identity_briefs`
-- (src/lib/insights/actions.ts), y lo aprendido de ese historial tiene que irse
-- con él. Con el cascade sale gratis y no hay que acordarse de tocar aquella
-- acción. Hay un test de pgTAP que lo fija, porque es el tipo de invariante que
-- se rompe callado.
-- =============================================================================

create table if not exists public.identity_brief_style (
  brief_id          uuid primary key references public.identity_briefs(id) on delete cascade,
  user_id           uuid not null references auth.users(id) on delete cascade,
  local_date        date not null,

  -- --- QUÉ SE ESCRIBIÓ (determinista, derivado del propio brief) -----------
  tone              text     not null check (tone in ('sereno', 'directo', 'intenso')),
  length_bucket     text     not null check (length_bucket in ('corta', 'media', 'larga')),
  scene_kind        text     not null check (scene_kind in ('logro', 'proceso', 'relacional', 'sensorial', 'tranquila')),
  uses_numbers      boolean  not null default false,
  category_mix      text[]   not null default '{}',
  affirmation_count smallint not null check (affirmation_count between 0 and 20),

  -- --- QUÉ PASÓ ESE DÍA (lo escribe el reloj; nulo hasta que el día cierra) -
  measured_at       timestamptz,
  completion_pct    smallint check (completion_pct between 0 and 100),
  mood              smallint check (mood between 1 and 5),
  energy            smallint check (energy between 1 and 5),
  reaction_score    smallint check (reaction_score between -100 and 100),
  action_done       boolean,
  outcome_score     smallint check (outcome_score between 0 and 100),
  formula_version   smallint not null default 1,

  created_at        timestamptz not null default now(),

  -- Dos filas de estilo el mismo día convertirían cada día en dos votos. El
  -- UNIQUE es lo que lo impide; un UNIQUE sobre un join no existe, y por eso
  -- `local_date` se duplica aquí en vez de leerse del brief.
  unique (user_id, local_date)
);

comment on table public.identity_brief_style is
  'El libro de estilo (D-164): con qué estilo se escribió cada brief y qué se midió el día que vino detrás. De aquí sale «con tono sereno tu cumplimiento sube 11 puntos», con su n. Cuelga del brief: borrar el historial de IA borra también lo aprendido de él.';
comment on column public.identity_brief_style.length_bucket is
  'Longitud media de las afirmaciones: corta (<10 palabras), media (10-16), larga (>16).';
comment on column public.identity_brief_style.scene_kind is
  'De qué iba la visualización. Se deriva por palabras clave, en orden fijo, con «proceso» por defecto: determinista y explicable, sin modelo.';
comment on column public.identity_brief_style.category_mix is
  'Las categorías presentes en las afirmaciones, ordenadas. Cada una vota por separado en la correlación.';
comment on column public.identity_brief_style.measured_at is
  'Cuándo se cerró la medición. NULO significa «el día todavía no cerró», que es distinto de «cerró y no hubo datos» — sin esta distinción, quien no registra nada parecería estar teniendo días malos.';
comment on column public.identity_brief_style.reaction_score is
  'De -100 a 100: (resuena - no_resuena) / total x 100. Es la señal más directa, pero también la más escasa: mucha gente no toca los pulgares.';
comment on column public.identity_brief_style.outcome_score is
  'Qué tan bueno fue el día, de 0 a 100. Media ponderada de cumplimiento, ánimo, energía y reacciones, RENORMALIZADA sobre los componentes presentes. Nulo si quedaron menos de dos: un día medido solo por el ánimo no es un día medido.';
comment on column public.identity_brief_style.formula_version is
  'Igual que en `identity_scores`: si la fórmula del `outcome_score` cambia, un histórico mezclado dejaría de ser comparable y el aprendizaje pasaría a correlacionar peras con manzanas.';

-- La consulta real es siempre «los últimos N días medidos de esta persona».
create index if not exists idx_identity_brief_style_user_date
  on public.identity_brief_style (user_id, local_date desc);

alter table public.identity_brief_style enable row level security;

drop policy if exists identity_brief_style_select_own on public.identity_brief_style;
create policy identity_brief_style_select_own on public.identity_brief_style
  for select using (user_id = auth.uid());

drop policy if exists identity_brief_style_insert_own on public.identity_brief_style;
create policy identity_brief_style_insert_own on public.identity_brief_style
  for insert with check (user_id = auth.uid());

-- EL REPARTO, que es la parte que se leerá mal dentro de seis meses:
--
--   SELECT propio     La pantalla enseña las preferencias aprendidas CON su
--                     evidencia y su n. Un sistema que aprende y no enseña lo
--                     que aprendió es indistinguible de uno que inventa.
--   INSERT propio     La acción de generar corre con la sesión de la persona y
--                     tiene que poder etiquetar el brief que acaba de escribir.
--                     Las etiquetas se derivan del texto del propio brief, así
--                     que falsificarlas solo se engaña a uno mismo.
--   NI UPDATE NI      El resultado medido es un HECHO del día, no una opinión.
--   DELETE            Sin UPDATE, ninguna sesión puede maquillar su
--                     `outcome_score` para que el agente le hable como quiere.
--                     El borrado llega por el cascade del brief, que corre como
--                     dueño de la tabla y no necesita grant.
--   service_role      El reloj mide y escribe la mitad de abajo.
revoke all on public.identity_brief_style from anon, authenticated;
grant select, insert on public.identity_brief_style to authenticated;
grant all privileges on public.identity_brief_style to service_role;


-- =============================================================================
-- 3) UNA QUINTA INSPIRACIÓN
--
-- Joe Dispenza entra al catálogo de principios. Como los otros cuatro: se
-- inspira el TONO, nunca se cita ni se atribuye (D-161).
--
-- EL DEFAULT NO CAMBIA. Sigue siendo {hill,goddard,clear,sharma}: nadie debe
-- despertarse con una inspiración que no eligió. Dispenza entra opt-in desde la
-- hoja de perfil de identidad.
--
-- El check de 0064 es inline, así que lo nombró Postgres y el nombre depende de
-- la versión. Se busca por su definición en vez de adivinarlo.
-- =============================================================================

do $$
declare
  v_nombre text;
begin
  select conname into v_nombre
    from pg_constraint
   where conrelid = 'public.identity_profiles'::regclass
     and contype = 'c'
     and pg_get_constraintdef(oid) ilike '%inspirations%';

  if v_nombre is not null then
    execute format('alter table public.identity_profiles drop constraint %I', v_nombre);
  end if;
end $$;

alter table public.identity_profiles
  add constraint identity_profiles_inspirations_check
  check (inspirations <@ array['hill', 'goddard', 'clear', 'sharma', 'dispenza']);

comment on column public.identity_profiles.inspirations is
  'Qué principios inspiran el brief: Napoleon Hill, Neville Goddard, James Clear, Robin Sharma y Joe Dispenza. Solo principios: nunca se citan ni se atribuyen textos (D-161). El default sigue sin Dispenza a propósito — se elige, no se hereda.';
