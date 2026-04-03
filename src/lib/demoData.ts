import type {
  BudgetScenario,
  FinanceSettings,
  FixedExpense,
  Transaction,
} from '../types'

const now = new Date()

function isoMonthOffset(monthOffset: number, day: number) {
  const date = new Date(now.getFullYear(), now.getMonth() + monthOffset, day)
  return date.toISOString().slice(0, 10)
}

export const demoSettings: FinanceSettings = {
  monthlyIncome: 146935,
  savingsGoal: 10000,
}

export const demoTransactions: Transaction[] = [
  {
    id: crypto.randomUUID(),
    title: 'Ingreso Laura',
    category: 'Ingreso',
    amount: 100730,
    type: 'income',
    occurredOn: isoMonthOffset(0, 1),
    notes: 'Base marzo 2026',
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    title: 'Ingreso Mauricio (ACJ Feb/2026)',
    category: 'Ingreso',
    amount: 46205,
    type: 'income',
    occurredOn: isoMonthOffset(0, 1),
    notes: 'Base marzo 2026',
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    title: 'Disco (super)',
    category: 'Comidas',
    amount: 1172,
    type: 'expense',
    occurredOn: isoMonthOffset(0, 4),
    notes: 'Base marzo 2026',
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    title: 'Macro Mercado',
    category: 'Comidas',
    amount: 8658,
    type: 'expense',
    occurredOn: isoMonthOffset(0, 18),
    notes: 'Base marzo 2026',
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    title: 'Tarjeta Mauricio',
    category: 'Tarjetas',
    amount: 15497,
    type: 'expense',
    occurredOn: isoMonthOffset(0, 18),
    notes: 'Base marzo 2026',
    createdAt: new Date().toISOString(),
  },
]

export const demoFixedExpenses: FixedExpense[] = [
  {
    id: crypto.randomUUID(),
    name: 'UCM',
    amount: 2640,
    category: 'Salud',
    dueDay: 10,
    ownerLabel: '',
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Angirú',
    amount: 8500,
    category: 'Educación',
    dueDay: 10,
    ownerLabel: '',
    createdAt: new Date().toISOString(),
  },
  {
    id: crypto.randomUUID(),
    name: 'Cuota auto actual',
    amount: 15000,
    category: 'Vehículo',
    dueDay: 10,
    ownerLabel: '',
    createdAt: new Date().toISOString(),
  },
]

export const demoScenarios: BudgetScenario[] = []
