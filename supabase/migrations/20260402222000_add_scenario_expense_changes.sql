create table if not exists public.budget_scenario_expense_changes (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.budget_scenarios(id) on delete cascade,
  change_type text not null check (change_type in ('remove_fixed', 'add_fixed', 'add_variable')),
  fixed_expense_id uuid references public.fixed_expenses(id) on delete set null,
  label text not null,
  category_name text not null,
  amount numeric(12, 2) not null check (amount >= 0),
  created_at timestamptz not null default now()
);

create index if not exists idx_budget_scenario_expense_changes_scenario
on public.budget_scenario_expense_changes (scenario_id);

alter table public.budget_scenario_expense_changes enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'budget_scenario_expense_changes'
      and policyname = 'Allow all on budget_scenario_expense_changes'
  ) then
    create policy "Allow all on budget_scenario_expense_changes"
    on public.budget_scenario_expense_changes
    for all
    using (true)
    with check (true);
  end if;
end
$$;
