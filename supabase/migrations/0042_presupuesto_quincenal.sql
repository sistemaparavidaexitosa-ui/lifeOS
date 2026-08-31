-- =============================================================================
-- 0042 — El presupuesto se trabaja POR QUINCENA (D-076)
--
-- POR QUÉ
-- Al usuario le pagan por quincena y `budgets` guarda desde 0005 una aportación
-- por quincena (`q1_amount` / `q2_amount`), pero la aplicación nunca las usó
-- para medir: comparaba el gasto de una ventana RODANTE de 15 días contra el
-- `monthly_cost`. Esa ventana se desplaza cada día, pisa el final de Q1 y el
-- principio de Q2 y no se reinicia el día de pago, así que lo que el usuario
-- veía era un acumulado Q1+Q2 y no "cómo voy en ESTA quincena".
--
-- El arreglo del periodo es puro cálculo y vive en src/lib/domain/quincena.ts
-- (Q1 = día 1-15, Q2 = día 16-fin de mes): no necesita base de datos, porque las
-- fronteras se derivan de la fecha. Lo único que SÍ hay que persistir es una
-- decisión humana.
--
-- QUÉ SE PERSISTE Y POR QUÉ AQUÍ
-- Cuando una quincena cierra con sobrante (o excedida), el sistema lo calcula y
-- lo MUESTRA, pero no lo aplica: arrastrarlo a la quincena siguiente es una
-- decisión explícita del usuario, concepto por concepto, y reversible. Esa
-- decisión no se puede derivar de los movimientos —es justamente lo que el
-- cálculo no sabe—, así que necesita fila propia.
--
-- El monto se CONGELA al aplicarlo en vez de recalcularse en cada render: el
-- usuario aceptó una cifra concreta y su quincena no debe moverse sola porque
-- después haya registrado un movimiento atrasado de la quincena anterior. La
-- pestaña compara el monto congelado contra el cierre vigente y, si difieren,
-- ofrece reaplicar.
--
-- No se crea una entidad de presupuesto paralela (D-003): esto es un ajuste
-- sobre `budgets`, con FK y borrado en cascada. Tampoco lleva `workspace_id`:
-- las tablas de dinero son por usuario (0005) y así siguen.
-- =============================================================================

create table if not exists public.budget_carryovers (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  budget_id uuid not null references public.budgets(id) on delete cascade,
  period_key text not null,
  amount numeric(20, 6) not null,
  created_at timestamptz not null default now(),
  unique (user_id, budget_id, period_key),
  constraint budget_carryovers_period_key_format check (period_key ~ '^\d{4}-(0[1-9]|1[0-2])-Q[12]$')
);

comment on table public.budget_carryovers is
  'D-076: arrastre que el USUARIO decidió aplicar de una quincena a la siguiente. Sin fila = la quincena arranca limpia; el sistema nunca la ajusta por su cuenta.';
comment on column public.budget_carryovers.period_key is
  'Quincena que RECIBE el ajuste, formato ''YYYY-MM-Q1|Q2'' (src/lib/domain/quincena.ts). Mismo formato que usa el querystring de /money/budget.';
comment on column public.budget_carryovers.amount is
  'Congelado al aplicar: positivo = sobrante de la quincena anterior, negativo = exceso. No se recalcula solo (ver el encabezado de esta migración).';

create index if not exists idx_budget_carryovers_user_period
  on public.budget_carryovers(user_id, period_key);

-- =============================================================================
-- RLS — mismo patrón por usuario que budgets en 0005.
-- =============================================================================
alter table public.budget_carryovers enable row level security;

drop policy if exists budget_carryovers_own on public.budget_carryovers;
create policy budget_carryovers_own on public.budget_carryovers
  for all using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select on public.budget_carryovers to anon, authenticated;
grant insert, update, delete on public.budget_carryovers to authenticated;
grant all privileges on public.budget_carryovers to service_role;
