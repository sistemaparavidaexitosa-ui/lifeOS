-- 0070_centro_agentico.sql
--
-- EL CENTRO EMPIEZA A PROPONER (D-167).
--
-- El centro (D-166) ya es la puerta de LifeOS, pero lo que muestra es estático.
-- Esto le añade sugerencias de la IA a partir de la actividad real: «llevas tres
-- días en Rediseño», «abre Dinero», «pon esto en tu día». La persona acepta de
-- un toque; la IA no escribe nada por su cuenta (D-153).
--
-- NO HAY TABLA DE PROPUESTAS NUEVA, y es deliberado (D-151): las sugerencias
-- viven en `coach_proposals`, la cola que ya existe, con su saneado y su camino
-- de aceptación probados. Dos colas serían dos sitios donde mirar qué te ha
-- sugerido la IA, y dos caminos que se desincronizan.

-- =============================================================================
-- UN ORIGEN MÁS Y UN TIPO MÁS
-- =============================================================================
-- `message_id` YA admite nulo desde 0062, y la regla que lo gobierna no es «hay
-- que tener turno» sino «el COACH tiene que tenerlo»
-- (`origen <> 'coach' or message_id is not null`). Las sugerencias del centro no
-- nacen de un turno del chat: nacen de los hechos, y su contexto viaja en
-- `payload.motivo`. Por eso entran con `origen = 'centro'` y sin `message_id`,
-- exactamente como ya hacen 'analisis' y 'grafo'.
--
-- CONSECUENCIA QUE SE ACEPTA POR ESCRITO: borrar el historial de chat no se
-- lleva por delante las sugerencias del centro, porque no salieron de él. Lo que
-- sí las quita es descartarlas.
alter table public.coach_proposals drop constraint if exists coach_proposals_origen_check;
alter table public.coach_proposals add constraint coach_proposals_origen_check
  check (origen in ('coach', 'chat', 'analisis', 'grafo', 'mision', 'centro'));

-- =============================================================================
-- EL TIPO QUE NO ESCRIBE NADA
-- =============================================================================
-- Los tipos anteriores CREAN algo al aceptarse. `foco` no: lleva a una pantalla,
-- con su motivo. Es lo que permite que el centro diga «sigue con lo que estabas
-- haciendo» sin inventar una tarea para decirlo.
--
-- Su destino se valida en el servidor contra el menú y contra los proyectos
-- reales de la persona (`destinoValido`, puro y probado). La base guarda el
-- `href` dentro del payload; quien decide si existe es el dominio.
--
-- OJO AL REESCRIBIR ESTA LISTA: `arista` la añadió 0062 y la usa el pgTAP 0034.
-- Copiar la lista de 0053 y añadirle uno la borra, y el fallo aparece en un test
-- que no tiene nada que ver con lo que estabas tocando. (Pasó al escribir esto.)
alter table public.coach_proposals drop constraint if exists coach_proposals_tipo_check;
alter table public.coach_proposals add constraint coach_proposals_tipo_check
  check (tipo in ('tarea', 'bloque', 'rutina', 'estructura', 'meta', 'arista', 'foco'));

-- =============================================================================
-- LA GUARDA DEL GASTO
-- =============================================================================
-- Una fila por persona, día local y franja. La CLAVE PRIMARIA es la guarda: se
-- inserta ANTES de llamar al modelo, así que dos aperturas simultáneas del
-- centro no pagan dos veces.
--
-- POR QUÉ NO `ai_job_runs` (0066), que es exactamente esto para el reloj: esa
-- tabla tiene la RLS cerrada y los grants revocados para `authenticated` —la
-- escribe solo el reloj con `service_role`—, y esto se dispara desde el
-- navegador de una persona, con su sesión. Mismo obstáculo y misma salida que
-- `ritual_runs.brief_attempted` en D-165.
create table if not exists public.centro_runs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  local_date date not null,
  franja     text not null check (franja in ('manana', 'tarde', 'noche')),
  -- La huella de los hechos con los que se generó. Si en la franja siguiente es
  -- la misma, no hace falta volver a pagarle al modelo para que diga lo mismo.
  facts_hash text not null default '',
  -- Qué pasó: 'hecho', 'sin-hechos', 'sin-cambios', 'ia-apagada' o el motivo.
  outcome    text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, local_date, franja)
);

comment on table public.centro_runs is
  'Una fila por persona, día local y franja (mañana/tarde/noche): la guarda que limita a tres las llamadas al modelo del centro por día, y la huella de hechos que las evita cuando nada cambió (D-167).';

alter table public.centro_runs enable row level security;
create policy centro_runs_own on public.centro_runs
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update on public.centro_runs to authenticated;
grant all privileges on public.centro_runs to service_role;
revoke all on public.centro_runs from anon;
