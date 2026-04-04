alter table public.budget_scenarios
  add column if not exists base_period_month date;

update public.budget_scenarios
set base_period_month = coalesce(
  base_period_month,
  (select max(period_month) from public.transactions),
  date_trunc('month', now())::date
);

alter table public.budget_scenarios
  alter column base_period_month set not null,
  alter column base_period_month set default date_trunc('month', now())::date;
