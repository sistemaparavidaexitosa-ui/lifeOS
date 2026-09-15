-- =============================================================================
-- 0066 · INSIGHTS NOCTURNOS: UNA LLAMADA POR NOCHE, Y SOLO SI HAY ALGO NUEVO
-- =============================================================================
--
-- Cada noche el reloj (`/api/push/dispatch`, cada cinco minutos) analiza el
-- historial de hábitos de cada persona y deja recomendaciones en
-- `recommendations`, las mismas que ya se ven en el panel. Dos cosas hay que
-- impedir, y ninguna la resuelve bien la tabla de recomendaciones:
--
--   1) Que la ventana de la noche —tres horas, doce pasadas por hora— llame al
--      modelo treinta y seis veces. Hace falta un «esto ya se intentó hoy» que
--      se escriba ANTES de llamar, y que dos pasadas simultáneas no puedan
--      escribir a la vez: la clave primaria lo garantiza.
--   2) Que cada noche se pague una llamada para decir lo mismo que ayer. Se
--      guarda la huella de los hechos (`facts_hash`); si la de hoy es igual a
--      la de la última ejecución, no se llama al modelo.
--
-- Tabla genérica (`job`), porque el brief de identidad o los pronósticos de la
-- fase A del sistema cognitivo tendrán el mismo problema. Solo la toca el
-- servidor.
--
-- Ver `docs/superpowers/specs/2026-09-15-identidad-y-analitica-design.md` §F5 y D-163.
-- =============================================================================

create table if not exists public.ai_job_runs (
  user_id    uuid not null references auth.users(id) on delete cascade,
  job        text not null check (char_length(job) between 1 and 60),
  local_date date not null,
  facts_hash text not null default '',
  -- Qué pasó: 'omitido' (sin hechos nuevos), 'hecho', 'fallido', o el motivo.
  outcome    text not null default '',
  created_at timestamptz not null default now(),
  primary key (user_id, job, local_date)
);

comment on table public.ai_job_runs is
  'Una fila por trabajo de IA del reloj, persona y día local. Se inserta antes de llamar al modelo: la clave primaria impide dos intentos el mismo día. `facts_hash` evita pagar una llamada si los hechos no cambiaron desde la última ejecución (D-163).';

create index if not exists idx_ai_job_runs_user_job_date
  on public.ai_job_runs (user_id, job, local_date desc);

alter table public.ai_job_runs enable row level security;
-- Sin políticas para `authenticated`: nadie la lee ni la escribe desde el cliente.
revoke all on public.ai_job_runs from anon, authenticated;
grant all privileges on public.ai_job_runs to service_role;
