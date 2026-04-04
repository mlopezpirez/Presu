export type DataSource = 'supabase' | 'demo'

export type Transaction = {
  id: string
  title: string
  category: string
  amount: number
  type: 'expense' | 'income'
  occurredOn: string
  notes: string
  merchantName?: string
  ticketDate?: string
  ticketFingerprint?: string
  sourceFileName?: string
  createdAt: string
}

export type TransactionDraft = Omit<Transaction, 'id' | 'createdAt'>

export type FixedExpense = {
  id: string
  name: string
  amount: number
  category: string
  dueDay: number
  ownerLabel: string
  isProrated: boolean
  startsOn: string
  endsOn?: string
  createdAt: string
}

export type FixedExpenseDraft = Omit<FixedExpense, 'id' | 'createdAt' | 'endsOn'>

export type ScenarioExpenseChange = {
  id: string
  changeType: 'remove_fixed' | 'remove_variable' | 'add_fixed' | 'add_variable'
  fixedExpenseId?: string
  label: string
  category: string
  amount: number
}

export type BudgetScenario = {
  id: string
  name: string
  incomeDelta: number
  extraExpenseDelta: number
  fixedExpenseDelta: number
  notes: string
  expenseChanges: ScenarioExpenseChange[]
  projectedIncome: number
  projectedExpenses: number
  projectedBalance: number
  createdAt: string
}

export type ScenarioDraft = ScenarioDraftBase & {
  expenseChanges: Omit<ScenarioExpenseChange, 'id'>[]
}

type ScenarioDraftBase = Omit<
  BudgetScenario,
  | 'id'
  | 'createdAt'
  | 'expenseChanges'
  | 'projectedIncome'
  | 'projectedExpenses'
  | 'projectedBalance'
>

export type PeriodMode = 'month' | 'all'

export type FinanceSettings = {
  monthlyIncome: number
  savingsGoal: number
}

export type ChartPoint = {
  label: string
  income: number
  expenses: number
}

export type FinanceSnapshot = {
  settings: FinanceSettings
  transactions: Transaction[]
  fixedExpenses: FixedExpense[]
  scenarios: BudgetScenario[]
  availablePeriods: string[]
  summary: {
    totalVariableExpenses: number
    totalFixedExpenses: number
    monthlyIncome: number
    chartPoints: ChartPoint[]
    dataSource: DataSource
    dataSourceLabel: string
  }
}

export type DuplicateTicketMatch = {
  id: string
  title: string
  amount: number
  occurredOn: string
  merchantName?: string
}
