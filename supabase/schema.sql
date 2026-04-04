create extension if not exists "pgcrypto";

create table if not exists public.finance_settings (
  id bigint primary key,
  monthly_income numeric(12, 2) not null default 0,
  savings_goal numeric(12, 2) not null default 0,
  currency_code text not null default 'UYU',
  updated_at timestamptz not null default now()
);

create table if not exists public.household_members (
  id uuid primary key default gen_random_uuid(),
  display_name text not null unique,
  role_label text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  category_type text not null check (category_type in ('expense', 'income')),
  group_label text not null,
  is_fixed boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.import_batches (
  id uuid primary key default gen_random_uuid(),
  source_name text not null,
  period_month date not null,
  source_file_name text,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.fixed_expenses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  category_name text not null,
  owner_label text not null default '',
  amount numeric(12, 2) not null check (amount >= 0),
  due_day smallint not null check (due_day between 1 and 31),
  starts_on date not null default date_trunc('month', now())::date,
  ends_on date,
  notes text,
  is_prorated boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category_name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  type text not null check (type in ('expense', 'income')),
  occurred_on date not null default current_date,
  period_month date not null,
  owner_label text not null default '',
  source_type text not null default 'manual' check (source_type in ('manual', 'csv_import', 'chat', 'ticket', 'consolidated')),
  import_batch_id uuid references public.import_batches(id) on delete set null,
  notes text,
  is_consolidated boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.budget_scenarios (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  base_period_month date not null default date_trunc('month', now())::date,
  income_delta numeric(12, 2) not null default 0,
  extra_expense_delta numeric(12, 2) not null default 0,
  fixed_expense_delta numeric(12, 2) not null default 0,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists idx_transactions_period_month on public.transactions (period_month desc);
create index if not exists idx_transactions_type_period on public.transactions (type, period_month desc);
create index if not exists idx_fixed_expenses_active on public.fixed_expenses (is_active) where is_active = true;

insert into public.finance_settings (id, monthly_income, savings_goal)
values (1, 146935, 10000)
on conflict (id) do update
set monthly_income = excluded.monthly_income,
    savings_goal = excluded.savings_goal,
    updated_at = now();

insert into public.household_members (display_name, role_label)
values
  ('Laura', 'Ingreso principal'),
  ('Mauricio', 'Ingreso complementario')
on conflict (display_name) do nothing;

insert into public.budget_categories (name, category_type, group_label, is_fixed)
values
  ('Salud', 'expense', 'Servicios', true),
  ('Vehículo', 'expense', 'Movilidad', true),
  ('Educación', 'expense', 'Familia', true),
  ('Servicios', 'expense', 'Hogar', true),
  ('Comidas', 'expense', 'Vida diaria', false),
  ('Tarjetas', 'expense', 'Finanzas', false),
  ('Compras', 'expense', 'Vida diaria', false),
  ('Ingreso', 'income', 'Ingresos', false)
on conflict (name) do nothing;

alter table public.finance_settings enable row level security;
alter table public.household_members enable row level security;
alter table public.budget_categories enable row level security;
alter table public.import_batches enable row level security;
alter table public.fixed_expenses enable row level security;
alter table public.transactions enable row level security;
alter table public.budget_scenarios enable row level security;

create policy "Allow all on finance_settings"
on public.finance_settings
for all
using (true)
with check (true);

create policy "Allow all on household_members"
on public.household_members
for all
using (true)
with check (true);

create policy "Allow all on budget_categories"
on public.budget_categories
for all
using (true)
with check (true);

create policy "Allow all on import_batches"
on public.import_batches
for all
using (true)
with check (true);

create policy "Allow all on fixed_expenses"
on public.fixed_expenses
for all
using (true)
with check (true);

create policy "Allow all on transactions"
on public.transactions
for all
using (true)
with check (true);

create policy "Allow all on budget_scenarios"
on public.budget_scenarios
for all
using (true)
with check (true);
