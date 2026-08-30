-- 0040_automations_tipadas.sql
--
-- QUE LAS AUTOMATIZACIONES SE PUEDAN EJECUTAR.
--
-- `automations` existe desde 0008 con `trigger_text`, `condition_text` y
-- `action_text`: tres campos de TEXTO LIBRE. Eso no es una automatización, es
-- la descripción de una. Nada en la app las ejecutaba, y no podía: para correr
-- «cuando cierre una tarea, anótalo en la bitácora» hay que saber qué es
-- «cerrar» y qué es «anotar», y eso no se saca de una frase sin interpretarla.
--
-- Interpretarla con el modelo era la otra salida, y va contra la regla que
-- sostiene todo Intelligence OS: el modelo no calcula ni decide, recibe hechos
-- ya calculados y los redacta. Una automatización que dispara según lo que un
-- modelo entendió del texto de ayer no es reproducible, y aquí ejecuta acciones
-- de verdad sobre datos del usuario.
--
-- Así que se tipa: un disparador con parámetros y una acción con parámetros,
-- ambos acotados por `check`. Las columnas de texto se BORRAN — la tabla está
-- vacía, no hay nada que migrar, y dejarlas invitaría a escribir en ellas.

alter table public.automations drop column if exists trigger_text;
alter table public.automations drop column if exists condition_text;
alter table public.automations drop column if exists action_text;

alter table public.automations
  add column if not exists trigger_type text not null default 'task.status_changed',
  add column if not exists trigger_params jsonb not null default '{}'::jsonb,
  add column if not exists action_type text not null default 'log_entry',
  add column if not exists action_params jsonb not null default '{}'::jsonb;

alter table public.automations drop constraint if exists automations_trigger_type_check;
alter table public.automations
  add constraint automations_trigger_type_check
  check (trigger_type in ('task.status_changed', 'task.assigned', 'comment.added'));

alter table public.automations drop constraint if exists automations_action_type_check;
alter table public.automations
  add constraint automations_action_type_check
  check (action_type in ('create_task', 'set_status', 'log_entry', 'create_reminder'));

comment on column public.automations.trigger_type is
  'Qué la despierta. Acotado por `check`: solo eventos que alguna Server Action emite de verdad. No hay disparadores por TIEMPO — no existe ningún proceso que despierte a nadie, y ofrecer «cada lunes» sería prometer algo que no ocurre.';
comment on column public.automations.action_params is
  'Parámetros de la acción, validados en el dominio (domain/automations/rules.ts) antes de ejecutarse. `jsonb` y no columnas sueltas porque cada acción necesita cosas distintas y la mitad estarían siempre en null.';
comment on column public.automations.authorized is
  'FR-AUT-002. Una acción de IMPACTO (crear tarea, mover estado) con `authorized = false` no se ejecuta: se PROPONE, y queda en automation_runs como `proposed`. Las que solo añaden algo propio —anotar en la bitácora, recordarse algo— no necesitan este permiso.';

-- =============================================================================
-- EL REGISTRO DE EJECUCIONES
--
-- `automation_runs` tenía `result text` y nada más: no se podía saber sobre QUÉ
-- disparó ni si llegó a hacer algo. Sin eso, una automatización que se comporta
-- raro no se puede depurar — y una que ejecuta acciones sobre los datos del
-- usuario tiene que poder auditarse.
-- =============================================================================

alter table public.automation_runs
  add column if not exists outcome text not null default 'ran',
  add column if not exists subject_id uuid,
  add column if not exists detail text not null default '';

alter table public.automation_runs drop constraint if exists automation_runs_outcome_check;
alter table public.automation_runs
  add constraint automation_runs_outcome_check
  check (outcome in ('ran', 'proposed', 'failed', 'skipped'));

comment on column public.automation_runs.outcome is
  '`ran` ejecutada · `proposed` de impacto sin autorizar (FR-AUT-002) · `failed` lo intentó y no pudo · `skipped` la regla casó pero no había nada que hacer.';
comment on column public.automation_runs.subject_id is
  'La tarea o el comentario que la disparó. Sin FK: apunta a dos tablas, igual que reminders.subject_id y key_results.source_id.';

create index if not exists idx_automations_user_enabled on public.automations(user_id, trigger_type) where enabled;
create index if not exists idx_automation_runs_automation on public.automation_runs(automation_id, ts desc);

-- F9: GRANTS explícitos, aunque 0010 sea el backstop y 0008 ya los declarara.
grant select on public.automations, public.automation_runs to anon, authenticated;
grant insert, update, delete on public.automations, public.automation_runs to authenticated;
grant all privileges on public.automations, public.automation_runs to service_role;
