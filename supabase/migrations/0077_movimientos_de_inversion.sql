-- 0077 · Los movimientos de una inversión (D-200)
--
-- Hasta aquí una posición era UNA foto: `principal`, `valuation`, `as_of`.
-- Con una foto no hay curva. Desde aquí la verdad son sus movimientos
-- (aportación, retiro, rendimiento, valuación) y `investments` guarda el
-- RESUMEN, que mantiene un trigger. Así `/wealth`, `/debt`, `/reports`,
-- `/household`, el grafo y «mercado» siguen leyendo `valuation` sin enterarse.
--
-- LA SEMÁNTICA VIVE DOS VECES: aquí y en `curva-inversion.ts`. Las dos se
-- prueban con los mismos casos (supabase/tests/0047 y
-- tests/domain/curva-inversion.test.ts). Una valuación es el valor al CIERRE
-- de su día; los flujos posteriores se le suman o restan; el rendimiento sube
-- el valor y no el capital.

create table if not exists public.investment_movements (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade,
  investment_id uuid not null references public.investments(id) on delete cascade,
  kind          text not null check (kind in ('aportacion', 'retiro', 'rendimiento', 'valuacion')),
  -- Una valuación en 0 es legítima (se perdió todo); un flujo de 0 no es nada.
  amount        numeric(20, 6) not null check (amount <= 1e12 and (amount > 0 or (kind = 'valuacion' and amount = 0))),
  occurred_on   date not null,
  note          text not null default '' check (char_length(note) <= 200),
  created_at    timestamptz not null default now()
);

create index if not exists idx_investment_movements_pos
  on public.investment_movements (investment_id, occurred_on, created_at);

alter table public.investment_movements enable row level security;

-- Sin `update`: un movimiento mal capturado se borra y se registra de nuevo.
drop policy if exists investment_movements_select on public.investment_movements;
create policy investment_movements_select on public.investment_movements
  for select using (user_id = auth.uid());

drop policy if exists investment_movements_insert on public.investment_movements;
create policy investment_movements_insert on public.investment_movements
  for insert with check (
    user_id = auth.uid()
    and exists (select 1 from public.investments i where i.id = investment_id and i.user_id = auth.uid())
  );

drop policy if exists investment_movements_delete on public.investment_movements;
create policy investment_movements_delete on public.investment_movements
  for delete using (user_id = auth.uid());

grant select, insert, delete on public.investment_movements to authenticated;
grant all privileges on public.investment_movements to service_role;
revoke all on public.investment_movements from anon;

comment on table public.investment_movements is
  'Movimientos de una inversión (D-200): la verdad de la que `investments` guarda el resumen vía `recalcular_inversion`.';

-- El resumen de UNA posición. SECURITY INVOKER: corre con la RLS de quien
-- escribió el movimiento, que es la dueña de la posición.
create or replace function public.recalcular_inversion(p_id uuid)
returns void
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_ultimo    date;
  v_capital   numeric;
  v_val_monto numeric;
  v_val_fecha date;
  v_valor     numeric;
begin
  select max(occurred_on) into v_ultimo from public.investment_movements where investment_id = p_id;

  if v_ultimo is null then
    update public.investments set principal = 0, valuation = 0 where id = p_id;
    return;
  end if;

  select coalesce(sum(case kind when 'aportacion' then amount when 'retiro' then -amount else 0 end), 0)
    into v_capital
    from public.investment_movements where investment_id = p_id;

  select amount, occurred_on into v_val_monto, v_val_fecha
    from public.investment_movements
   where investment_id = p_id and kind = 'valuacion'
   order by occurred_on desc, created_at desc
   limit 1;

  select coalesce(v_val_monto, 0)
       + coalesce(sum(case kind when 'retiro' then -amount else amount end), 0)
    into v_valor
    from public.investment_movements
   where investment_id = p_id
     and kind <> 'valuacion'
     and (v_val_fecha is null or occurred_on > v_val_fecha);

  update public.investments
     set principal = v_capital, valuation = v_valor, as_of = v_ultimo
   where id = p_id;
end;
$fn$;

revoke execute on function public.recalcular_inversion(uuid) from public, anon;
grant execute on function public.recalcular_inversion(uuid) to authenticated, service_role;

create or replace function public.trg_investment_movements_resumen()
returns trigger
language plpgsql
security invoker
set search_path = public
as $fn$
begin
  perform public.recalcular_inversion(coalesce(new.investment_id, old.investment_id));
  return null;
end;
$fn$;

revoke execute on function public.trg_investment_movements_resumen() from public, anon;

drop trigger if exists trg_investment_movements_resumen on public.investment_movements;
create trigger trg_investment_movements_resumen
  after insert or delete on public.investment_movements
  for each row execute function public.trg_investment_movements_resumen();

-- Alta de una posición con su aportación inicial, en una transacción: una
-- posición sin movimientos sería una posición en 0 que nadie pidió.
create or replace function public.crear_posicion(
  p_kind text,
  p_name text,
  p_institution text,
  p_broker text,
  p_rate numeric,
  p_source text,
  p_currency text,
  p_monto numeric,
  p_fecha date,
  -- Al final y con default: así los tipos generados lo dan como opcional y
  -- «sin titular» se pasa omitiéndolo, no con un null que el tipo no admite.
  p_family_member_id uuid default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $fn$
declare
  v_id uuid;
begin
  insert into public.investments (user_id, kind, name, institution, broker, rate, source, family_member_id, currency, as_of)
  values (auth.uid(), p_kind, p_name, coalesce(p_institution, ''), coalesce(p_broker, ''), coalesce(p_rate, 0),
          coalesce(p_source, ''), p_family_member_id, p_currency, p_fecha)
  returning id into v_id;

  insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on, note)
  values (auth.uid(), v_id, 'aportacion', p_monto, p_fecha, 'Aportación inicial');

  return v_id;
end;
$fn$;

revoke execute on function public.crear_posicion(text, text, text, text, numeric, text, text, numeric, date, uuid) from public, anon;
grant execute on function public.crear_posicion(text, text, text, text, numeric, text, text, numeric, date, uuid) to authenticated, service_role;

-- Relleno: cada posición existente arranca con lo que ya decía —una
-- aportación de `principal` y una valuación de `valuation`, a su `as_of`—.
-- Con la semántica de arriba, el trigger devuelve los mismos números: la
-- valuación, del mismo día y creada después, manda.
--
-- UNA SOLA SENTENCIA, A PROPÓSITO. Con dos `insert` seguidos, el trigger del
-- primero ya reescribe `investments.valuation` y el segundo leería el valor
-- reescrito, no el original (una posición de 1,000 que valía 1,234.50 quedaba
-- en 1,000). Una sola sentencia lee la foto de antes de que corra ningún
-- trigger. Re-ejecutable: sólo toca posiciones sin ningún movimiento.
insert into public.investment_movements (user_id, investment_id, kind, amount, occurred_on, note, created_at)
select i.user_id, i.id, r.kind, r.amount, i.as_of, 'Saldo inicial (migración)', now() + r.orden * interval '1 second'
  from public.investments i
 cross join lateral (values ('aportacion', i.principal, 0), ('valuacion', i.valuation, 1)) as r(kind, amount, orden)
 where (i.principal > 0 or i.valuation > 0)
   and (r.kind = 'valuacion' or i.principal > 0)
   and not exists (select 1 from public.investment_movements m where m.investment_id = i.id);
