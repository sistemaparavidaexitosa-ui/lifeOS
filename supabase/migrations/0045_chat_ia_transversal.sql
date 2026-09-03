-- 0045_chat_ia_transversal.sql
--
-- UN SITIO DONDE PREGUNTAR.
--
-- Intelligence OS es PROACTIVO y sin chat, y eso fue una decisión, no un
-- olvido: el spec de 2026-08-21 §2 dice que «el valor está en que el sistema
-- note cosas, no en conversar». Sigue siendo cierto para las recomendaciones
-- —nadie quiere teclear para enterarse de que su presupuesto va al 92%—, pero
-- deja fuera la pregunta en la otra dirección: «¿en qué me enfoco esta
-- semana?». Esa no la puede adivinar un motor que se dispara solo. El chat no
-- sustituye al motor: contesta lo que el motor nunca se preguntó.
--
-- POR QUÉ UNA TABLA Y NO ESTADO EN EL CLIENTE
-- Una conversación que se borra al recargar la pestaña no es una conversación,
-- es un formulario con memoria corta. Y el historial es lo que permite que el
-- siguiente turno sepa de qué se venía hablando.
--
-- POR QUÉ ES PRIVADA Y NO DE ESPACIO
-- Es el único criterio compatible con lo que el chat ve. El contexto sale de
-- `src/lib/insights/context.ts` —hechos del USUARIO, filtrados por sus
-- casillas de `profiles.ai_domains`—, así que una respuesta puede hablar de su
-- deuda o de su presupuesto. Compartirla con el espacio filtraría por la
-- puerta de atrás justo lo que BR-012 protege por la de delante. Misma RLS que
-- `profiles`: `user_id = auth.uid()`, sin `workspace_id` a la vista.
-- =============================================================================

create table if not exists public.ai_chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  -- Los hechos que sustentaron la respuesta, mismo criterio que
  -- `recommendations.fact_ids` (0027): poder auditar DESPUÉS qué vio el modelo
  -- cuando dijo lo que dijo. Vacío en los turnos del usuario, y también en una
  -- respuesta que no se apoyó en ningún hecho.
  fact_ids text[] not null default '{}',
  created_at timestamptz not null default now()
);

comment on table public.ai_chat_messages is
  'El chat de IA transversal (rail lateral, todas las pantallas). Privada de cada usuario, como profiles: el contexto que alimenta las respuestas son SUS hechos. Ver 0045.';
comment on column public.ai_chat_messages.fact_ids is
  'Los id de los hechos que el modelo citó. Mismo papel que recommendations.fact_ids: auditar qué vio, no reconstruir la respuesta.';

-- La consulta es siempre la misma —«mis últimos N mensajes»— y este índice es
-- exactamente esa consulta.
create index if not exists idx_ai_chat_messages_user
  on public.ai_chat_messages (user_id, created_at desc);

alter table public.ai_chat_messages enable row level security;

-- Las cuatro sobre la misma condición, sin helper ni join: no hay un segundo
-- sujeto que resolver. `user_id = auth.uid()` en el insert es lo que impide
-- escribir un turno en nombre de otra persona.
create policy ai_chat_messages_select on public.ai_chat_messages
  for select using (user_id = auth.uid());

create policy ai_chat_messages_insert on public.ai_chat_messages
  for insert with check (user_id = auth.uid());

create policy ai_chat_messages_update on public.ai_chat_messages
  for update using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Borrar hace falta para «Borrar historial de IA» en Configuración, que ya
-- vacía las recomendaciones y ahora vacía también esto.
create policy ai_chat_messages_delete on public.ai_chat_messages
  for delete using (user_id = auth.uid());

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.ai_chat_messages to anon, authenticated;
grant insert, update, delete on public.ai_chat_messages to authenticated;
grant all privileges on public.ai_chat_messages to service_role;
