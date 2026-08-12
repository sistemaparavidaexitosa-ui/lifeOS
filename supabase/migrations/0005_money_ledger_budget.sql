-- 0005_money_ledger_budget.sql
-- Money OS: Dashboard, cuentas, ledger de doble partida y presupuesto.
-- FR-MNY-001…012/018/019, BR-001/002/016/028. NG-007: Money OS NUNCA se
-- comparte vía workspace — estas tablas no tienen workspace_id ni se
-- referencian desde has_project_access/can_edit_project.
-- Dinero: numeric(20,6), nunca float (guardrail no-negociable).

create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type text not null check (type in ('bank', 'cash', 'savings', 'credit', 'investment')),
  currency text not null default 'MXN',
  opening_balance numeric(20, 6) not null default 0,
  created_at timestamptz not null default now()
);
comment on table public.accounts is 'FR-MNY-001. Privado (NG-007); sin workspace_id.';

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  unique (user_id, name)
);

-- =============================================================================
-- LEDGER — asientos balanceados (BR-001/002/009)
-- =============================================================================
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('income', 'expense', 'transfer')),
  memo text not null,
  entry_date date not null,
  effective_at date not null,
  category text,
  counterparty text not null default '',
  status text not null default 'Posted' check (status in ('Posted', 'Reconciled', 'Reversed')),
  reconciled boolean not null default false,
  source text not null default 'manual',
  dedupe_key text not null,
  family_member_id uuid, -- FK añadida en 0006_household.sql (orden de dependencia)
  debt_id uuid,          -- FK añadida en 0007_debt_cashback_wealth.sql (Rev 0.4, FR-DEB-006)
  version integer not null default 1,
  created_at timestamptz not null default now()
);
comment on table public.journal_entries is 'FR-MNY-002/003: asiento contable. BR-009: dedupe_key para detectar duplicados de importación.';
comment on column public.journal_entries.debt_id is 'FR-DEB-006, BR-024: pago de deuda vinculado. Reutiliza el ledger — ADR-016, no crear tabla debt_payments.';

create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  entry_id uuid not null references public.journal_entries(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete restrict,
  amount numeric(20, 6) not null
);
comment on table public.journal_lines is 'BR-002: una transferencia mueve valor entre 2 líneas (cuentas); no es ingreso ni gasto.';

-- =============================================================================
-- BUDGETS (extendida con monthly_cost/q1/q2 — FR-MNY-018/019, A-010, ADR-... )
-- =============================================================================
create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  period text not null default 'current',
  cycle text not null default 'Quincenal' check (cycle in ('Quincenal', 'Mensual')),
  category text not null,
  amount numeric(20, 6) not null default 0,
  monthly_cost numeric(20, 6) not null default 0,
  q1_amount numeric(20, 6) not null default 0,
  q2_amount numeric(20, 6) not null default 0,
  created_at timestamptz not null default now(),
  unique (user_id, period, category)
);
comment on table public.budgets is 'FR-MNY-010/011/018/019: presupuesto por ciclo. La pestaña de Presupuesto REUTILIZA esta tabla (no crea una paralela).';
comment on column public.budgets.q1_amount is 'A-010: por defecto = monthly_cost/2, editable de forma independiente.';

-- =============================================================================
-- Índices
-- =============================================================================
create index if not exists idx_accounts_user on public.accounts(user_id);
create index if not exists idx_journal_entries_user_date on public.journal_entries(user_id, entry_date desc);
create index if not exists idx_journal_entries_category on public.journal_entries(user_id, category);
create index if not exists idx_journal_entries_dedupe on public.journal_entries(user_id, dedupe_key);
create index if not exists idx_journal_lines_entry on public.journal_lines(entry_id);
create index if not exists idx_journal_lines_account on public.journal_lines(account_id);
create index if not exists idx_budgets_user_period on public.budgets(user_id, period);

-- =============================================================================
-- Constraint: un asiento debe balancear a 0 quitando transferencias (se valida
-- en aplicación + trigger de verificación ligera para ingreso/gasto de 1 línea).
-- Para transferencias (2 líneas) la suma de amount debe ser 0.
-- =============================================================================
create or replace function public.check_journal_balance()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_type text;
  v_sum numeric(20,6);
  v_count integer;
begin
  select type into v_type from public.journal_entries where id = new.entry_id;
  select count(*), coalesce(sum(amount), 0) into v_count, v_sum
    from public.journal_lines where entry_id = new.entry_id;
  if v_type = 'transfer' and v_count = 2 and v_sum <> 0 then
    raise exception 'Asiento de transferencia desbalanceado (suma = %)', v_sum;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_check_journal_balance on public.journal_lines;
create constraint trigger trg_check_journal_balance
  after insert or update on public.journal_lines
  deferrable initially deferred
  for each row execute function public.check_journal_balance();

-- =============================================================================
-- RLS: privado por user_id (NG-007)
-- =============================================================================
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.journal_entries enable row level security;
alter table public.journal_lines enable row level security;
alter table public.budgets enable row level security;

create policy accounts_own on public.accounts for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy categories_own on public.categories for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy journal_entries_own on public.journal_entries for all using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy journal_lines_own on public.journal_lines for all
  using (exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = auth.uid()))
  with check (exists (select 1 from public.journal_entries e where e.id = entry_id and e.user_id = auth.uid()));
create policy budgets_own on public.budgets for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- =============================================================================
-- GRANTS (F9 🔴)
-- =============================================================================
grant select on public.accounts, public.categories, public.journal_entries, public.journal_lines, public.budgets to anon, authenticated;
grant insert, update, delete on public.accounts, public.categories, public.journal_entries, public.journal_lines, public.budgets to authenticated;
grant all privileges on public.accounts, public.categories, public.journal_entries, public.journal_lines, public.budgets to service_role;
