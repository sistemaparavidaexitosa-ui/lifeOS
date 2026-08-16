alter table public.occupations add column if not exists occ_date date;

comment on column public.occupations.occ_date is
  'Fecha especifica (YYYY-MM-DD) para ocupaciones NO recurrentes. Las recurrentes (recurring=true) ignoran esta columna.';

update public.occupations
set occ_date = current_date
where recurring = false and occ_date is null;

alter table public.occupations
  add constraint occupations_date_check
  check ((recurring = true and occ_date is null) or (recurring = false and occ_date is not null));

create index if not exists idx_occupations_user_date on public.occupations(user_id, occ_date);
