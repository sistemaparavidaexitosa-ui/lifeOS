-- 0007_debt_cashback_wealth.sql
-- Deudas (+ pagos vinculados, FR-DEB-006/008), Cashback (FR-DEB-007), Ahorros,
-- Inversiones, Metas Financieras y Patrimonio. Todo Money OS: privado,
-- sin workspace_id (NG-007).

create table if not exists public.debts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  balance numeric(20, 6) not null default 0,
  rate numeric(6, 3) not null default 0, -- % anual
  min_payment numeric(20, 6) not null default 0,
  due_day integer not null default 1 check (due_day between 1 and 28),
  created_at timestamptz not null default now()
);
comment on table public.debts is 'FR-DEB-001. El simulador (FR-DEB-002/005/008) nunca ejecuta pagos reales, solo calcula escenarios.';

-- Ahora que debts existe, añadimos la FK de journal_entries.debt_id (Rev 0.4, FR-DEB-006, ADR-016)
alter table public.journal_entries
  add constraint fk_journal_entries_debt foreign key (debt_id) references public.debts(id) on delete set null;
create index if not exists idx_journal_entries_debt on public.journal_entries(debt_id);

create table if not exists public.cashback_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  account_id uuid references public.accounts(id) on delete set null,
  debt_id uuid references public.debts(id) on delete set null,
  rate_pct numeric(6, 3) not null default 1,
  eligible_categories text[] not null default '{}',
  accrued_estimate numeric(20, 6) not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.cashback_cards is 'FR-DEB-007, NG-012: cashback informativo/estimado, no es integración bancaria en tiempo real.';

create table if not exists public.cashback_redemptions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cashback_cards(id) on delete cascade,
  amount numeric(20, 6) not null,
  redeemed_at date not null default current_date
);
comment on table public.cashback_redemptions is 'BR-025: redención manual, nunca automática.';

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null default 'Emergencia',
  target numeric(20, 6) not null default 0,
  current_amount numeric(20, 6) not null default 0,
  target_date date,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  monthly numeric(20, 6) not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.savings_goals is 'FR-SAV-001/002/003.';

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('fija', 'variable')),
  name text not null,
  institution text not null default '',
  broker text not null default '',
  principal numeric(20, 6) not null default 0,
  rate numeric(6, 3) not null default 0,
  valuation numeric(20, 6) not null default 0,
  as_of date not null default current_date,
  source text not null default '',
  currency text not null default 'MXN',
  family_member_id uuid references public.family_members(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.investments is 'FR-INV-001…007: toda rentabilidad exige metodología, moneda, período y fuente (FR-INV-002).';

create table if not exists public.financial_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  target numeric(20, 6) not null default 0,
  horizon date,
  priority text not null default 'Medium' check (priority in ('High', 'Medium', 'Low')),
  account_ids uuid[] not null default '{}',
  current_amount numeric(20, 6) not null default 0,
  family_member_id uuid references public.family_members(id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.financial_goals is 'FR-GOL-001…004: escenario sujeto a supuestos, no garantía (BR-010).';

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind text not null default 'Otros',
  value numeric(20, 6) not null default 0,
  currency text not null default 'MXN',
  as_of date not null default current_date,
  source text not null default '',
  created_at timestamptz not null default now()
);
comment on table public.assets is 'FR-WLT-001/003: toda valuación exige fecha y fuente.';

create table if not exists public.liabilities (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  value numeric(20, 6) not null default 0,
  currency text not null default 'MXN',
  as_of date not null default current_date,
  source text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists public.net_worth_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  as_of date not null default current_date,
  assets numeric(20, 6) not null,
  liabilities numeric(20, 6) not null,
  net numeric(20, 6) not null,
  method_version text not null default '1.0',
  created_at timestamptz not null default now()
);
comment on table public.net_worth_snapshots is 'FR-WLT-002, BR-004: inmutable — no se edita destructivamente, se genera una revisión nueva.';

-- =============================================================================
-- Índices
-- =============================================================================
create index if not exists idx_debts_user on public.debts(user_id);
create index if not exists idx_cashback_cards_user on public.cashback_cards(user_id);
create index if not exists idx_cashback_redemptions_card on public.cashback_redemptions(card_id);
create index if not exists idx_savings_goals_user on public.savings_goals(user_id);
create index if not exists idx_investments_user on public.investments(user_id);
create index if not exists idx_investments_family_member on public.investments(family_member_id);
create index if not exists idx_financial_goals_user on public.financial_goals(user_id);
create index if not exists idx_financial_goals_family_member on public.financial_goals(family_member_id);
create index if not exists idx_assets_user on public.assets(user_id);
create index if not exists idx_liabilities_user on public.liabilities(user_id);
create index if not exists idx_net_worth_snapshots_user on public.net_worth_snapshots(user_id, as_of desc);

-- =============================================================================
-- RLS
-- =============================================================================
alter table public.debts enable row level security;
alter table public.cashback_cards enable row level security;
alter table public.cashback_redemptions enable row level security;
alter table public.savings_goals enable row level security;
alter table public.investments enable row level security;
alter table public.financial_goals enable row level security;
alter table public.assets enable row level security;
alter table public.liabilities enable row level security;
alter table public.net_worth_snapshots enable row level security;

create policy debts_own on public.debts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cashback_cards_own on public.cashback_cards for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy cashback_redemptions_own on public.cashback_redemptions for all
  using (exists (select 1 from public.cashback_cards c where c.id = card_id and c.user_id = auth.uid()))
  with check (exists (select 1 from public.cashback_cards c where c.id = card_id and c.user_id = auth.uid()));
create policy savings_goals_own on public.savings_goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy investments_own on public.investments for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy financial_goals_own on public.financial_goals for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy assets_own on public.assets for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy liabilities_own on public.liabilities for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy net_worth_snapshots_own on public.net_worth_snapshots for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.debts, public.cashback_cards, public.cashback_redemptions, public.savings_goals,
  public.investments, public.financial_goals, public.assets, public.liabilities, public.net_worth_snapshots
  to anon, authenticated;
grant insert, update, delete on public.debts, public.cashback_cards, public.cashback_redemptions, public.savings_goals,
  public.investments, public.financial_goals, public.assets, public.liabilities, public.net_worth_snapshots
  to authenticated;
grant all privileges on public.debts, public.cashback_cards, public.cashback_redemptions, public.savings_goals,
  public.investments, public.financial_goals, public.assets, public.liabilities, public.net_worth_snapshots
  to service_role;
