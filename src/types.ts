export type DataSource = 'supabase' | 'demo'

export type Transaction = {
  id: string
  title: string
  category: string
  amount: number
  type: 'expense' | 'income'
  occurredOn: string
  notes: string
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
  createdAt: string
}

export type FixedExpenseDraft = Omit<FixedExpense, 'id' | 'createdAt'>

export type BudgetScenario = {
  id: string
  name: string
  incomeDelta: number
  extraExpenseDelta: number
  fixedExpenseDelta: number
  notes: string
  projectedIncome: number
  projectedExpenses: number
  projectedBalance: number
  hitsSavingsGoal: boolean
  createdAt: string
}

export type ScenarioDraft = Omit<
  BudgetScenario,
  | 'id'
  | 'createdAt'
  | 'projectedIncome'
  | 'projectedExpenses'
  | 'projectedBalance'
  | 'hitsSavingsGoal'
>

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
  summary: {
    totalVariableExpenses: number
    totalFixedExpenses: number
    monthlyIncome: number
    chartPoints: ChartPoint[]
    dataSource: DataSource
    dataSourceLabel: string
  }
}
