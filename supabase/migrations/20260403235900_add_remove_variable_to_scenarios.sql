alter table public.budget_scenario_expense_changes
  drop constraint if exists budget_scenario_expense_changes_change_type_check;

alter table public.budget_scenario_expense_changes
  add constraint budget_scenario_expense_changes_change_type_check
  check (change_type in ('remove_fixed', 'remove_variable', 'add_fixed', 'add_variable'));
