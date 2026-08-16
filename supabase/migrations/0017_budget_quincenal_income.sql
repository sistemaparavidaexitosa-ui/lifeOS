-- 0017_budget_quincenal_income.sql
-- Submódulo Presupuesto (/money/budget) — extensión solicitada:
--   1) Ingreso quincenal declarado por el usuario, para calcular la
--      diferencia cuando las aportaciones Q1/Q2 exceden ese ingreso.
--   2) La liquidez disponible en cuentas ya se calcula en tiempo real con
--      accountBalance (src/lib/domain/money.ts) a partir de accounts y
--      journal_entries. Se reutiliza esa misma función en la pestaña de
--      Presupuesto para conciliar el balance del presupuesto con el
--      disponible real en cuentas, sin duplicar lógica de dominio ni crear
--      una entidad paralela, consistente con /docs/DECISIONS.md D-003.
--
-- Se guarda en public.profiles porque es un dato del ciclo financiero del
-- usuario, uno solo y no por concepto — mismo patrón que
-- activity_window_start/end (dato de perfil consumido por un módulo
-- específico, aquí Presupuesto en vez de Autogestión del Tiempo).
alter table public.profiles
  add column if not exists quincenal_income numeric(20, 6) not null default 0;

comment on column public.profiles.quincenal_income is
  'FR-MNY-018/019 (extensión Presupuesto): ingreso quincenal declarado por el usuario. Se usa para calcular la diferencia (excedente o déficit) cuando la aportación Q1 o Q2 del presupuesto excede este ingreso.';

-- Sin cambios de RLS/GRANT: la columna nueva hereda las políticas y grants
-- ya existentes de public.profiles (profiles_select_own/update_own, ver
-- 0002_identity.sql). Ninguna migración adicional es necesaria aquí.
