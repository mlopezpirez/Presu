import { demoFixedExpenses, demoSettings, demoTransactions } from './demoData'
import { monthLabel } from './format'
import { isSupabaseConfigured, supabase } from './supabase'
import type {
  BudgetScenario,
  DuplicateTicketMatch,
  FinanceSettings,
  FinanceSnapshot,
  FixedExpense,
  FixedExpenseDraft,
  ScenarioDraft,
  ScenarioExpenseChange,
  Transaction,
  TransactionDraft,
} from '../types'

type DemoScenarioRecord = Omit<BudgetScenario, 'projectedIncome' | 'projectedExpenses' | 'projectedBalance'> & {
  expenseChanges: ScenarioExpenseChange[]
}

type DemoStore = {
  settings: FinanceSettings
  transactions: Transaction[]
  fixedExpenses: FixedExpense[]
  scenarios: DemoScenarioRecord[]
}

const demoStoreKey = 'presu-demo-store'

function sortByDate<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
}

function monthStart(value: string) {
  return `${value.slice(0, 7)}-01`
}

function previousDay(value: string) {
  const date = new Date(`${value}T00:00:00`)
  date.setDate(date.getDate() - 1)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function isFixedExpenseActiveForPeriod(item: FixedExpense, period: string) {
  const periodStart = monthStart(period)
  const periodEnd = `${period}-31`
  const startsOn = item.startsOn
  const endsOn = item.endsOn ?? '9999-12-31'

  return startsOn <= periodEnd && endsOn >= periodStart
}

function fixedExpensesForPeriod(fixedExpenses: FixedExpense[], period: string) {
  return fixedExpenses.filter((item) => isFixedExpenseActiveForPeriod(item, period))
}

function getInitialDemoStore(): DemoStore {
  return {
    settings: demoSettings,
    transactions: demoTransactions,
    fixedExpenses: demoFixedExpenses,
    scenarios: [],
  }
}

function readDemoStore(): DemoStore {
  const raw = localStorage.getItem(demoStoreKey)
  if (!raw) {
    const initial = getInitialDemoStore()
    localStorage.setItem(demoStoreKey, JSON.stringify(initial))
    return initial
  }

  return JSON.parse(raw) as DemoStore
}

function writeDemoStore(data: DemoStore) {
  localStorage.setItem(demoStoreKey, JSON.stringify(data))
}

function buildChartPoints(transactions: Transaction[]) {
  const buckets = new Map<string, { income: number; expenses: number }>()

  for (let offset = 5; offset >= 0; offset -= 1) {
    const date = new Date()
    date.setMonth(date.getMonth() - offset)
    const key = date.toISOString().slice(0, 7)
    buckets.set(key, { income: 0, expenses: 0 })
  }

  for (const item of transactions) {
    const key = item.occurredOn.slice(0, 7)
    const current = buckets.get(key)
    if (!current) {
      continue
    }

    if (item.type === 'income') {
      current.income += item.amount
    } else {
      current.expenses += item.amount
    }
  }

  return [...buckets.entries()].map(([key, values]) => ({
    label: monthLabel(`${key}-01`),
    income: values.income,
    expenses: values.expenses,
  }))
}

function getAvailablePeriods(transactions: Transaction[], fixedExpenses: FixedExpense[]) {
  const periodSet = new Set<string>()

  for (const item of transactions) {
    periodSet.add(item.occurredOn.slice(0, 7))
  }

  for (const item of fixedExpenses) {
    const start = item.startsOn.slice(0, 7)
    const end = (item.endsOn ?? monthStart(new Date().toISOString())).slice(0, 7)
    let cursor = `${start}-01`
    const last = `${end}-01`

    while (cursor <= last) {
      periodSet.add(cursor.slice(0, 7))
      const date = new Date(`${cursor}T00:00:00`)
      date.setMonth(date.getMonth() + 1)
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      cursor = `${year}-${month}-01`
    }
  }

  periodSet.add(monthStart(new Date().toISOString()).slice(0, 7))
  return [...periodSet].sort().reverse()
}

function computeScenario(
  item: DemoScenarioRecord,
  settings: FinanceSettings,
  transactions: Transaction[],
  fixedExpenses: FixedExpense[],
  basePeriod: string,
): BudgetScenario {
  const removedFixedTotal = item.expenseChanges
    .filter((change) => change.changeType === 'remove_fixed')
    .reduce((sum, change) => sum + change.amount, 0)

  const removedVariableTotal = item.expenseChanges
    .filter((change) => change.changeType === 'remove_variable')
    .reduce((sum, change) => sum + change.amount, 0)

  const addedFixedTotal = item.expenseChanges
    .filter((change) => change.changeType === 'add_fixed')
    .reduce((sum, change) => sum + change.amount, 0)

  const addedVariableTotal = item.expenseChanges
    .filter((change) => change.changeType === 'add_variable')
    .reduce((sum, change) => sum + change.amount, 0)

  const activeFixedTotal = fixedExpensesForPeriod(fixedExpenses, basePeriod).reduce(
    (sum, expense) => sum + expense.amount,
    0,
  )
  const variableExpenses = transactions
    .filter((entry) => entry.type === 'expense' && entry.occurredOn.startsWith(basePeriod))
    .reduce((sum, entry) => sum + entry.amount, 0)
  const projectedIncome = settings.monthlyIncome + item.incomeDelta
  const projectedExpenses =
    variableExpenses +
    activeFixedTotal -
    removedFixedTotal +
    addedVariableTotal -
    removedVariableTotal +
    addedFixedTotal +
    item.extraExpenseDelta +
    item.fixedExpenseDelta
  const projectedBalance = projectedIncome - projectedExpenses

  return {
    ...item,
    projectedIncome,
    projectedExpenses,
    projectedBalance,
  }
}

function buildSnapshot(data: DemoStore, sourceLabel: string, source: FinanceSnapshot['summary']['dataSource']): FinanceSnapshot {
  const availablePeriods = getAvailablePeriods(data.transactions, data.fixedExpenses)
  const latestPeriod = availablePeriods[0] ?? monthStart(new Date().toISOString()).slice(0, 7)
  const totalVariableExpenses = data.transactions
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)
  const totalFixedExpenses = fixedExpensesForPeriod(data.fixedExpenses, latestPeriod.slice(0, 7)).reduce(
    (sum, item) => sum + item.amount,
    0,
  )

  return {
    settings: data.settings,
    transactions: sortByDate(data.transactions),
    fixedExpenses: sortByDate(data.fixedExpenses),
    scenarios: data.scenarios.map((item) =>
      computeScenario(
        item,
        data.settings,
        data.transactions,
        data.fixedExpenses,
        item.basePeriodMonth || latestPeriod.slice(0, 7),
      ),
    ),
    availablePeriods,
    summary: {
      totalVariableExpenses,
      totalFixedExpenses,
      monthlyIncome: data.settings.monthlyIncome,
      chartPoints: buildChartPoints(data.transactions),
      dataSource: source,
      dataSourceLabel: sourceLabel,
    },
  }
}

async function getDemoSnapshot(): Promise<FinanceSnapshot> {
  return buildSnapshot(readDemoStore(), 'Modo demo con base marzo', 'demo')
}

async function getSupabaseSnapshot(): Promise<FinanceSnapshot> {
  if (!supabase) {
    throw new Error('Supabase no está configurado.')
  }

  const [
    { data: settingsData, error: settingsError },
    { data: transactionsData, error: transactionsError },
    { data: fixedExpensesData, error: fixedExpensesError },
    { data: scenariosData, error: scenariosError },
    { data: scenarioChangesData, error: scenarioChangesError },
  ] = await Promise.all([
    supabase.from('finance_settings').select('*').limit(1).maybeSingle(),
    supabase.from('transactions').select('*').order('occurred_on', { ascending: false }),
    supabase.from('fixed_expenses').select('*').eq('is_active', true).order('created_at', { ascending: false }),
    supabase.from('budget_scenarios').select('*').order('created_at', { ascending: false }),
    supabase.from('budget_scenario_expense_changes').select('*').order('created_at', { ascending: true }),
  ])

  const firstError =
    settingsError ?? transactionsError ?? fixedExpensesError ?? scenariosError ?? scenarioChangesError
  if (firstError) {
    throw new Error(firstError.message)
  }

  const settings: FinanceSettings = {
    monthlyIncome: settingsData?.monthly_income ?? 0,
    savingsGoal: settingsData?.savings_goal ?? 0,
  }

  const transactions: Transaction[] = (transactionsData ?? []).map((item) => ({
    id: item.id,
    title: item.title,
    category: item.category_name ?? 'Sin categoría',
    amount: Number(item.amount),
    type: item.type,
    occurredOn: item.occurred_on,
    notes: item.notes ?? '',
    merchantName: item.merchant_name ?? '',
    ticketDate: item.ticket_date ?? undefined,
    ticketFingerprint: item.ticket_fingerprint ?? undefined,
    sourceFileName: item.source_file_name ?? undefined,
    createdAt: item.created_at,
  }))

  const fixedExpenses: FixedExpense[] = (fixedExpensesData ?? []).map((item) => ({
    id: item.id,
    name: item.name,
    amount: Number(item.amount),
    category: item.category_name ?? 'Sin categoría',
    dueDay: item.due_day,
    ownerLabel: item.owner_label ?? '',
    isProrated: Boolean(item.is_prorated),
    startsOn: item.starts_on,
    endsOn: item.ends_on ?? undefined,
    createdAt: item.created_at,
  }))

  const scenarioChangesById = new Map<string, ScenarioExpenseChange[]>()

  for (const item of scenarioChangesData ?? []) {
    const current = scenarioChangesById.get(item.scenario_id) ?? []
    current.push({
      id: item.id,
      changeType: item.change_type,
      fixedExpenseId: item.fixed_expense_id ?? undefined,
      label: item.label,
      category: item.category_name,
      amount: Number(item.amount),
    })
    scenarioChangesById.set(item.scenario_id, current)
  }

  const availablePeriods = getAvailablePeriods(transactions, fixedExpenses)
  const latestPeriod = availablePeriods[0] ?? monthStart(new Date().toISOString()).slice(0, 7)
  const totalVariableExpenses = transactions
    .filter((item) => item.type === 'expense')
    .reduce((sum, item) => sum + item.amount, 0)

  const scenarios: BudgetScenario[] = (scenariosData ?? []).map((item) =>
    computeScenario(
      {
        id: item.id,
        name: item.name,
        basePeriodMonth: item.base_period_month?.slice(0, 7) ?? latestPeriod.slice(0, 7),
        incomeDelta: Number(item.income_delta),
        extraExpenseDelta: Number(item.extra_expense_delta),
        fixedExpenseDelta: Number(item.fixed_expense_delta),
        notes: item.notes ?? '',
        expenseChanges: scenarioChangesById.get(item.id) ?? [],
        createdAt: item.created_at,
      },
      settings,
      transactions,
      fixedExpenses,
      item.base_period_month?.slice(0, 7) ?? latestPeriod.slice(0, 7),
    ),
  )

  return {
    settings,
    transactions,
    fixedExpenses,
    scenarios,
    availablePeriods,
    summary: {
      totalVariableExpenses,
      totalFixedExpenses: fixedExpensesForPeriod(fixedExpenses, latestPeriod.slice(0, 7)).reduce(
        (sum, item) => sum + item.amount,
        0,
      ),
      monthlyIncome: settings.monthlyIncome,
      chartPoints: buildChartPoints(transactions),
      dataSource: 'supabase',
      dataSourceLabel: 'Supabase conectado',
    },
  }
}

async function upsertDemoSettings(settings: FinanceSettings) {
  const data = readDemoStore()
  writeDemoStore({ ...data, settings })
}

async function addDemoTransaction(draft: TransactionDraft) {
  const data = readDemoStore()
  data.transactions.unshift({
    ...draft,
    id: crypto.randomUUID(),
    createdAt: new Date().toISOString(),
  })
  writeDemoStore(data)
}

async function addDemoFixedExpense(draft: FixedExpenseDraft) {
  const data = readDemoStore()
  data.fixedExpenses.unshift({
    ...draft,
    id: crypto.randomUUID(),
    endsOn: undefined,
    createdAt: new Date().toISOString(),
  })
  writeDemoStore(data)
}

async function addDemoScenario(draft: ScenarioDraft) {
  const data = readDemoStore()
  data.scenarios.unshift({
    id: crypto.randomUUID(),
    name: draft.name,
    basePeriodMonth: draft.basePeriodMonth,
    incomeDelta: draft.incomeDelta,
    extraExpenseDelta: draft.extraExpenseDelta,
    fixedExpenseDelta: draft.fixedExpenseDelta,
    notes: draft.notes,
    expenseChanges: draft.expenseChanges.map((change) => ({
      ...change,
      id: crypto.randomUUID(),
    })),
    createdAt: new Date().toISOString(),
  })
  writeDemoStore(data)
}

async function deleteDemoTransaction(id: string) {
  const data = readDemoStore()
  data.transactions = data.transactions.filter((item) => item.id !== id)
  writeDemoStore(data)
}

async function deleteDemoFixedExpense(id: string, effectiveMonth: string) {
  const data = readDemoStore()
  const start = monthStart(effectiveMonth)
  data.fixedExpenses = data.fixedExpenses.flatMap((item) => {
    if (item.id !== id) {
      return [item]
    }

    if (item.startsOn >= start) {
      return []
    }

    return [{ ...item, endsOn: previousDay(start) }]
  })
  writeDemoStore(data)
}

async function deleteDemoScenario(id: string) {
  const data = readDemoStore()
  data.scenarios = data.scenarios.filter((item) => item.id !== id)
  writeDemoStore(data)
}

async function upsertSupabaseSettings(settings: FinanceSettings) {
  if (!supabase) {
    return
  }

  const { error } = await supabase.from('finance_settings').upsert(
    {
      id: 1,
      monthly_income: settings.monthlyIncome,
      savings_goal: settings.savingsGoal,
    },
    { onConflict: 'id' },
  )

  if (error) {
    throw new Error(error.message)
  }
}

async function addSupabaseTransaction(draft: TransactionDraft) {
  if (!supabase) {
    return
  }

  const occurredOn = normalizeRequiredDate(draft.occurredOn)
  const ticketDate = normalizeOptionalDate(draft.ticketDate)

  const { error } = await supabase.from('transactions').insert({
    title: draft.title,
    category_name: draft.category,
    amount: draft.amount,
    type: draft.type,
    occurred_on: occurredOn,
    period_month: `${occurredOn.slice(0, 7)}-01`,
    source_type: draft.sourceFileName ? 'ticket' : 'manual',
    notes: draft.notes,
    merchant_name: draft.merchantName ?? '',
    ticket_date: ticketDate,
    ticket_fingerprint: draft.ticketFingerprint ?? null,
    source_file_name: draft.sourceFileName ?? null,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function updateDemoTransaction(id: string, draft: TransactionDraft) {
  const data = readDemoStore()
  data.transactions = data.transactions.map((item) =>
    item.id === id ? { ...item, ...draft } : item,
  )
  writeDemoStore(data)
}

async function updateDemoFixedExpense(id: string, draft: FixedExpenseDraft, effectiveMonth: string) {
  const data = readDemoStore()
  const start = monthStart(effectiveMonth)
  const current = data.fixedExpenses.find((item) => item.id === id)
  if (!current) {
    return
  }

  if (current.startsOn >= start) {
    data.fixedExpenses = data.fixedExpenses.map((item) =>
      item.id === id ? { ...item, ...draft, startsOn: start } : item,
    )
    writeDemoStore(data)
    return
  }

  data.fixedExpenses = [
    {
      ...draft,
      id: crypto.randomUUID(),
      startsOn: start,
      endsOn: current.endsOn,
      createdAt: new Date().toISOString(),
    },
    ...data.fixedExpenses.map((item) =>
      item.id === id ? { ...item, endsOn: previousDay(start) } : item,
    ),
  ]
  writeDemoStore(data)
}

async function updateSupabaseTransaction(id: string, draft: TransactionDraft) {
  if (!supabase) {
    return
  }

  const occurredOn = normalizeRequiredDate(draft.occurredOn)
  const ticketDate = normalizeOptionalDate(draft.ticketDate)

  const { error } = await supabase
    .from('transactions')
    .update({
      title: draft.title,
      category_name: draft.category,
      amount: draft.amount,
      type: draft.type,
      occurred_on: occurredOn,
      period_month: `${occurredOn.slice(0, 7)}-01`,
      notes: draft.notes,
      merchant_name: draft.merchantName ?? '',
      ticket_date: ticketDate,
      ticket_fingerprint: draft.ticketFingerprint ?? null,
      source_file_name: draft.sourceFileName ?? null,
    })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

function normalizeOptionalDate(value?: string | null) {
  const trimmed = typeof value === 'string' ? value.trim() : ''
  return trimmed ? trimmed : null
}

function normalizeRequiredDate(value?: string | null) {
  const normalized = normalizeOptionalDate(value)
  if (!normalized) {
    throw new Error('La fecha del movimiento es obligatoria.')
  }

  return normalized
}

async function updateSupabaseFixedExpense(id: string, draft: FixedExpenseDraft, effectiveMonth: string) {
  if (!supabase) {
    return
  }

  const start = monthStart(effectiveMonth)
  const { data: current, error: loadError } = await supabase
    .from('fixed_expenses')
    .select('*')
    .eq('id', id)
    .single()

  if (loadError) {
    throw new Error(loadError.message)
  }

  if (current.starts_on >= start) {
    const { error } = await supabase
      .from('fixed_expenses')
      .update({
        name: draft.name,
        category_name: draft.category,
        owner_label: draft.ownerLabel,
        amount: draft.amount,
        due_day: draft.dueDay,
        is_prorated: draft.isProrated,
        starts_on: start,
      })
      .eq('id', id)

    if (error) {
      throw new Error(error.message)
    }

    return
  }

  const previousEndsOn = previousDay(start)
  const { error: closeError } = await supabase
    .from('fixed_expenses')
    .update({
      ends_on: previousEndsOn,
    })
    .eq('id', id)

  if (closeError) {
    throw new Error(closeError.message)
  }

  const { error: insertError } = await supabase.from('fixed_expenses').insert({
    name: draft.name,
    category_name: draft.category,
    owner_label: draft.ownerLabel,
    amount: draft.amount,
    due_day: draft.dueDay,
    is_prorated: draft.isProrated,
    starts_on: start,
    ends_on: current.ends_on ?? null,
  })

  if (insertError) {
    throw new Error(insertError.message)
  }
}

function mapDuplicateMatches(rows: Array<Record<string, unknown>>): DuplicateTicketMatch[] {
  return rows.map((item) => ({
    id: String(item.id),
    title: String(item.title),
    amount: Number(item.amount),
    occurredOn: String(item.occurred_on),
    merchantName: typeof item.merchant_name === 'string' ? item.merchant_name : '',
  }))
}

async function findDemoDuplicateTransactions(
  draft: TransactionDraft,
  excludeId?: string,
): Promise<DuplicateTicketMatch[]> {
  const data = readDemoStore()
  return data.transactions
    .filter((item) => item.type === 'expense')
    .filter((item) => (excludeId ? item.id !== excludeId : true))
    .filter((item) => {
      if (draft.ticketFingerprint && item.ticketFingerprint) {
        return item.ticketFingerprint === draft.ticketFingerprint
      }

      const sameAmount = item.amount === draft.amount
      const sameDate = item.occurredOn === draft.occurredOn
      const sameMerchant =
        draft.merchantName && item.merchantName
          ? item.merchantName.toLowerCase() === draft.merchantName.toLowerCase()
          : item.title.toLowerCase() === draft.title.toLowerCase()

      return sameAmount && sameDate && sameMerchant
    })
    .map((item) => ({
      id: item.id,
      title: item.title,
      amount: item.amount,
      occurredOn: item.occurredOn,
      merchantName: item.merchantName,
    }))
}

async function findSupabaseDuplicateTransactions(
  draft: TransactionDraft,
  excludeId?: string,
): Promise<DuplicateTicketMatch[]> {
  if (!supabase || draft.type !== 'expense') {
    return []
  }

  if (draft.ticketFingerprint) {
    let query = supabase
      .from('transactions')
      .select('id,title,amount,occurred_on,merchant_name')
      .eq('ticket_fingerprint', draft.ticketFingerprint)

    if (excludeId) {
      query = query.neq('id', excludeId)
    }

    const { data, error } = await query

    if (error) {
      throw new Error(error.message)
    }

    return mapDuplicateMatches(data ?? [])
  }

  const { data, error } = await supabase
    .from('transactions')
    .select('id,title,amount,occurred_on,merchant_name')
    .eq('type', 'expense')
    .eq('amount', draft.amount)
    .eq('occurred_on', draft.occurredOn)

  if (error) {
    throw new Error(error.message)
  }

  return mapDuplicateMatches((data ?? []).filter((item) => {
    if (excludeId && String(item.id) === excludeId) {
      return false
    }

    const merchant = typeof item.merchant_name === 'string' ? item.merchant_name : ''
    if (draft.merchantName && merchant) {
      return merchant.toLowerCase() === draft.merchantName.toLowerCase()
    }

    return String(item.title).toLowerCase() === draft.title.toLowerCase()
  }))
}

async function addSupabaseFixedExpense(draft: FixedExpenseDraft) {
  if (!supabase) {
    return
  }

  const { error } = await supabase.from('fixed_expenses').insert({
    name: draft.name,
    category_name: draft.category,
    owner_label: draft.ownerLabel,
    amount: draft.amount,
    due_day: draft.dueDay,
    is_prorated: draft.isProrated,
    starts_on: draft.startsOn,
  })

  if (error) {
    throw new Error(error.message)
  }
}

async function deleteSupabaseFixedExpense(id: string, effectiveMonth: string) {
  if (!supabase) {
    return
  }

  const start = monthStart(effectiveMonth)
  const { data: current, error: loadError } = await supabase
    .from('fixed_expenses')
    .select('id,starts_on')
    .eq('id', id)
    .single()

  if (loadError) {
    throw new Error(loadError.message)
  }

  if (current.starts_on >= start) {
    const { error } = await supabase.from('fixed_expenses').delete().eq('id', id)
    if (error) {
      throw new Error(error.message)
    }
    return
  }

  const { error } = await supabase
    .from('fixed_expenses')
    .update({ ends_on: previousDay(start) })
    .eq('id', id)

  if (error) {
    throw new Error(error.message)
  }
}

async function addSupabaseScenario(draft: ScenarioDraft) {
  if (!supabase) {
    return
  }

  const { data: scenarioData, error: scenarioError } = await supabase
    .from('budget_scenarios')
    .insert({
      name: draft.name,
      base_period_month: `${draft.basePeriodMonth}-01`,
      income_delta: draft.incomeDelta,
      extra_expense_delta: draft.extraExpenseDelta,
      fixed_expense_delta: draft.fixedExpenseDelta,
      notes: draft.notes,
    })
    .select('id')
    .single()

  if (scenarioError) {
    throw new Error(scenarioError.message)
  }

  if (draft.expenseChanges.length === 0) {
    return
  }

  const { error } = await supabase.from('budget_scenario_expense_changes').insert(
    draft.expenseChanges.map((change) => ({
      scenario_id: scenarioData.id,
      change_type: change.changeType,
      fixed_expense_id:
        change.changeType === 'remove_fixed' ? change.fixedExpenseId ?? null : null,
      label: change.label,
      category_name: change.category,
      amount: change.amount,
    })),
  )

  if (error) {
    throw new Error(error.message)
  }
}

async function deleteFromSupabase(table: 'transactions' | 'budget_scenarios', id: string) {
  if (!supabase) {
    return
  }

  const { error } = await supabase.from(table).delete().eq('id', id)
  if (error) {
    throw new Error(error.message)
  }
}

export const financeStore = {
  async getSnapshot() {
    return isSupabaseConfigured ? getSupabaseSnapshot() : getDemoSnapshot()
  },
  async upsertSettings(settings: FinanceSettings) {
    return isSupabaseConfigured
      ? upsertSupabaseSettings(settings)
      : upsertDemoSettings(settings)
  },
  async addTransaction(draft: TransactionDraft) {
    return isSupabaseConfigured
      ? addSupabaseTransaction(draft)
      : addDemoTransaction(draft)
  },
  async addFixedExpense(draft: FixedExpenseDraft) {
    return isSupabaseConfigured
      ? addSupabaseFixedExpense(draft)
      : addDemoFixedExpense(draft)
  },
  async updateTransaction(id: string, draft: TransactionDraft) {
    return isSupabaseConfigured
      ? updateSupabaseTransaction(id, draft)
      : updateDemoTransaction(id, draft)
  },
  async updateFixedExpense(id: string, draft: FixedExpenseDraft, effectiveMonth: string) {
    return isSupabaseConfigured
      ? updateSupabaseFixedExpense(id, draft, effectiveMonth)
      : updateDemoFixedExpense(id, draft, effectiveMonth)
  },
  async addScenario(draft: ScenarioDraft) {
    return isSupabaseConfigured ? addSupabaseScenario(draft) : addDemoScenario(draft)
  },
  async findDuplicateTransactions(draft: TransactionDraft, excludeId?: string) {
    return isSupabaseConfigured
      ? findSupabaseDuplicateTransactions(draft, excludeId)
      : findDemoDuplicateTransactions(draft, excludeId)
  },
  async deleteTransaction(id: string) {
    return isSupabaseConfigured
      ? deleteFromSupabase('transactions', id)
      : deleteDemoTransaction(id)
  },
  async deleteFixedExpense(id: string, effectiveMonth: string) {
    return isSupabaseConfigured
      ? deleteSupabaseFixedExpense(id, effectiveMonth)
      : deleteDemoFixedExpense(id, effectiveMonth)
  },
  async deleteScenario(id: string) {
    return isSupabaseConfigured
      ? deleteFromSupabase('budget_scenarios', id)
      : deleteDemoScenario(id)
  },
}
