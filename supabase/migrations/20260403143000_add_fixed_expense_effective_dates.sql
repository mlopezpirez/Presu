alter table public.fixed_expenses
  add column if not exists starts_on date,
  add column if not exists ends_on date;

update public.fixed_expenses
set starts_on = coalesce(
  starts_on,
  (select min(period_month) from public.transactions),
  date_trunc('month', now())::date
);

alter table public.fixed_expenses
  alter column starts_on set not null,
  alter column starts_on set default date_trunc('month', now())::date;

create index if not exists idx_fixed_expenses_effective_dates
on public.fixed_expenses (starts_on, ends_on)
where is_active = true;
