create table if not exists public.fixed_expense_payments (
  id uuid primary key default gen_random_uuid(),
  fixed_expense_id uuid not null references public.fixed_expenses(id) on delete cascade,
  period_month date not null,
  is_paid boolean not null default true,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  unique (fixed_expense_id, period_month)
);

create index if not exists idx_fixed_expense_payments_period
on public.fixed_expense_payments (period_month desc);

alter table public.fixed_expense_payments enable row level security;

create policy "Allow all on fixed_expense_payments"
on public.fixed_expense_payments
for all
using (true)
with check (true);
