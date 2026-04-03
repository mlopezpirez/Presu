import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import Tesseract from 'tesseract.js'
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeDollarSign,
  CalendarRange,
  Camera,
  CirclePlus,
  FileImage,
  Filter,
  Landmark,
  LayoutDashboard,
  PiggyBank,
  Plus,
  Scale,
  Search,
  Trash2,
  TrendingUp,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { currency, monthLabel, todayLocalIso } from './lib/format'
import { financeStore } from './lib/store'
import type {
  FinanceSnapshot,
  FixedExpense,
  FixedExpenseDraft,
  PeriodMode,
  ScenarioDraft,
  TransactionDraft,
} from './types'

const initialExpense: TransactionDraft = {
  title: '',
  category: 'General',
  amount: 0,
  type: 'expense',
  occurredOn: todayLocalIso(),
  notes: '',
}

const initialIncome: TransactionDraft = {
  title: '',
  category: 'Ingreso',
  amount: 0,
  type: 'income',
  occurredOn: todayLocalIso(),
  notes: '',
}

const initialFixedExpense: FixedExpenseDraft = {
  name: '',
  amount: 0,
  category: 'Hogar',
  dueDay: 1,
  ownerLabel: '',
}

const initialScenario: ScenarioDraft = {
  name: '',
  incomeDelta: 0,
  extraExpenseDelta: 0,
  fixedExpenseDelta: 0,
  notes: '',
  expenseChanges: [],
}

type AddFlowMode = 'menu' | 'manual' | 'ticket'

function App() {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [expense, setExpense] = useState<TransactionDraft>(initialExpense)
  const [income, setIncome] = useState<TransactionDraft>(initialIncome)
  const [fixedExpense, setFixedExpense] = useState<FixedExpenseDraft>(initialFixedExpense)
  const [scenario, setScenario] = useState<ScenarioDraft>(initialScenario)
  const [activeView, setActiveView] = useState<'dashboard' | 'scenarios'>('dashboard')
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchFilter, setSearchFilter] = useState('')
  const [scenarioBasePeriod, setScenarioBasePeriod] = useState('')
  const [scenarioItemLabel, setScenarioItemLabel] = useState('')
  const [scenarioItemCategory, setScenarioItemCategory] = useState('General')
  const [scenarioItemAmount, setScenarioItemAmount] = useState(0)
  const [scenarioItemType, setScenarioItemType] = useState<'add_fixed' | 'add_variable'>(
    'add_variable',
  )
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [addFlowMode, setAddFlowMode] = useState<AddFlowMode>('menu')
  const [manualType, setManualType] = useState<'expense' | 'income'>('expense')
  const [expenseKind, setExpenseKind] = useState<'variable' | 'fixed'>('variable')
  const [isAnalyzingTicket, setIsAnalyzingTicket] = useState(false)
  const [ticketImageName, setTicketImageName] = useState('')
  const [ocrPreview, setOcrPreview] = useState('')

  useEffect(() => {
    void loadSnapshot()
  }, [])

  useEffect(() => {
    if (snapshot && !selectedPeriod && snapshot.availablePeriods.length > 0) {
      setSelectedPeriod(snapshot.availablePeriods[0])
    }
  }, [snapshot, selectedPeriod])

  useEffect(() => {
    if (snapshot && !scenarioBasePeriod && snapshot.availablePeriods.length > 0) {
      setScenarioBasePeriod(snapshot.availablePeriods[0])
    }
  }, [scenarioBasePeriod, snapshot])

  async function loadSnapshot() {
    setStatus('loading')
    setError(null)

    try {
      const data = await financeStore.getSnapshot()
      setSnapshot(data)
    } catch (loadError) {
      setError(getErrorMessage(loadError))
    } finally {
      setStatus('idle')
    }
  }

  const periodTransactions = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return periodMode === 'all'
      ? snapshot.transactions
      : snapshot.transactions.filter((item) => item.occurredOn.startsWith(selectedPeriod))
  }, [periodMode, selectedPeriod, snapshot])

  const visibleTransactions = useMemo(() => {
    return periodTransactions.filter((item) => {
      if (item.type === 'income') {
        return true
      }

      const matchesCategory =
        categoryFilter === 'all' ? true : item.category === categoryFilter
      const haystack = `${item.title} ${item.notes}`.toLowerCase()
      const matchesSearch = searchFilter.trim()
        ? haystack.includes(searchFilter.trim().toLowerCase())
        : true

      return matchesCategory && matchesSearch
    })
  }, [categoryFilter, periodTransactions, searchFilter])

  const filteredFixedExpenses = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return snapshot.fixedExpenses.filter((item) =>
      categoryFilter === 'all' ? true : item.category === categoryFilter,
    )
  }, [categoryFilter, snapshot])

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null
    }

    const monthsCount = periodMode === 'all' ? Math.max(snapshot.availablePeriods.length, 1) : 1
    const visibleIncome = periodTransactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0)
    const visibleVariableExpenses = visibleTransactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0)
    const visibleFixedExpenses =
      filteredFixedExpenses.reduce((sum, item) => sum + item.amount, 0) * monthsCount
    const totalExpenses = visibleVariableExpenses + visibleFixedExpenses
    const balance = visibleIncome - totalExpenses
    const coverage = visibleIncome === 0 ? 0 : (totalExpenses / visibleIncome) * 100

    return {
      monthsCount,
      visibleIncome,
      visibleVariableExpenses,
      visibleFixedExpenses,
      totalExpenses,
      balance,
      coverage,
    }
  }, [filteredFixedExpenses, periodMode, periodTransactions, snapshot, visibleTransactions])

  const expenseCategories = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return [...new Set(snapshot.transactions.filter((item) => item.type === 'expense').map((item) => item.category))].sort()
  }, [snapshot])

  const categorySummary = useMemo(() => {
    const expenseMap = new Map<string, number>()

    for (const item of filteredFixedExpenses) {
      expenseMap.set(item.category, (expenseMap.get(item.category) ?? 0) + item.amount)
    }

    for (const item of visibleTransactions) {
      if (item.type !== 'expense') {
        continue
      }

      expenseMap.set(item.category, (expenseMap.get(item.category) ?? 0) + item.amount)
    }

    return [...expenseMap.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
  }, [filteredFixedExpenses, visibleTransactions])

  const scenarioPreview = useMemo(() => {
    if (!snapshot || !metrics) {
      return null
    }

    const scenarioBaseTransactions = snapshot.transactions.filter(
      (item) => item.occurredOn.startsWith(scenarioBasePeriod) && item.type === 'expense',
    )
    const baseVariableExpenses = scenarioBaseTransactions.reduce(
      (sum, item) => sum + item.amount,
      0,
    )

    const removedFixedTotal = scenario.expenseChanges
      .filter((item) => item.changeType === 'remove_fixed')
      .reduce((sum, item) => sum + item.amount, 0)

    const addedFixedTotal = scenario.expenseChanges
      .filter((item) => item.changeType === 'add_fixed')
      .reduce((sum, item) => sum + item.amount, 0)

    const addedVariableTotal = scenario.expenseChanges
      .filter((item) => item.changeType === 'add_variable')
      .reduce((sum, item) => sum + item.amount, 0)

    const projectedIncome = snapshot.settings.monthlyIncome + scenario.incomeDelta
    const projectedExpenses =
      snapshot.fixedExpenses.reduce((sum, item) => sum + item.amount, 0) -
      removedFixedTotal +
      addedFixedTotal +
      baseVariableExpenses +
      addedVariableTotal +
      scenario.extraExpenseDelta +
      scenario.fixedExpenseDelta
    const projectedBalance = projectedIncome - projectedExpenses

    return {
      baseVariableExpenses,
      projectedIncome,
      projectedExpenses,
      projectedBalance,
      hitsGoal: projectedBalance >= snapshot.settings.savingsGoal,
    }
  }, [scenario, scenarioBasePeriod, snapshot, metrics])

  async function submitExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    setError(null)

    try {
      await financeStore.addTransaction({ ...expense, type: 'expense' })
      setExpense(initialExpense)
      await loadSnapshot()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  async function submitIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    setError(null)

    try {
      await financeStore.addTransaction({ ...income, type: 'income' })
      setIncome(initialIncome)
      await loadSnapshot()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  async function submitAddFlow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()

    if (manualType === 'income') {
      await submitIncome(event)
      closeAddModal()
      return
    }

    if (expenseKind === 'fixed') {
      await submitFixedFromDraft()
      closeAddModal()
      return
    }

    await submitExpense(event)
    closeAddModal()
  }

  async function submitFixedFromDraft() {
    setStatus('saving')
    setError(null)

    try {
      await financeStore.addFixedExpense({
        ...fixedExpense,
        name: expense.title,
        amount: expense.amount,
        category: expense.category,
      })
      setExpense(initialExpense)
      setFixedExpense(initialFixedExpense)
      await loadSnapshot()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  async function submitScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    setError(null)

    try {
      await financeStore.addScenario(scenario)
      setScenario(initialScenario)
      setScenarioItemLabel('')
      setScenarioItemCategory('General')
      setScenarioItemAmount(0)
      setScenarioItemType('add_variable')
      await loadSnapshot()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  async function removeTransaction(id: string) {
    await withSave(async () => financeStore.deleteTransaction(id))
  }

  async function removeFixedExpense(id: string) {
    await withSave(async () => financeStore.deleteFixedExpense(id))
  }

  async function removeScenario(id: string) {
    await withSave(async () => financeStore.deleteScenario(id))
  }

  async function withSave(action: () => Promise<void>) {
    setStatus('saving')
    setError(null)

    try {
      await action()
      await loadSnapshot()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  function closeAddModal() {
    setIsAddModalOpen(false)
    setAddFlowMode('menu')
    setManualType('expense')
    setExpenseKind('variable')
    setExpense(initialExpense)
    setIncome(initialIncome)
    setFixedExpense(initialFixedExpense)
    setTicketImageName('')
    setOcrPreview('')
    setIsAnalyzingTicket(false)
  }

  async function analyzeTicket(file: File) {
    setAddFlowMode('ticket')
    setTicketImageName(file.name)
    setIsAnalyzingTicket(true)
    setError(null)

    try {
      const result = await Tesseract.recognize(file, 'spa+eng')
      const text = result.data.text
      setOcrPreview(text.trim())

      const amount = extractAmount(text)
      const category = inferCategory(text)
      const title = inferTitle(text)

      setManualType('expense')
      setExpenseKind('variable')
      setExpense({
        title,
        category,
        amount,
        type: 'expense',
        occurredOn: todayLocalIso(),
        notes: text.trim().slice(0, 1000),
      })
    } catch (analyzeError) {
      setError(getErrorMessage(analyzeError))
    } finally {
      setIsAnalyzingTicket(false)
    }
  }

  function toggleFixedExpenseInScenario(expense: FixedExpense) {
    const exists = scenario.expenseChanges.some(
      (item) => item.changeType === 'remove_fixed' && item.fixedExpenseId === expense.id,
    )

    setScenario((current) => ({
      ...current,
      expenseChanges: exists
        ? current.expenseChanges.filter((item) => item.fixedExpenseId !== expense.id)
        : [
            ...current.expenseChanges,
            {
              changeType: 'remove_fixed',
              fixedExpenseId: expense.id,
              label: expense.name,
              category: expense.category,
              amount: expense.amount,
            },
          ],
    }))
  }

  function addScenarioItem() {
    if (!scenarioItemLabel.trim() || scenarioItemAmount <= 0) {
      return
    }

    setScenario((current) => ({
      ...current,
      expenseChanges: [
        ...current.expenseChanges,
        {
          changeType: scenarioItemType,
          label: scenarioItemLabel.trim(),
          category: scenarioItemCategory.trim() || 'General',
          amount: scenarioItemAmount,
        },
      ],
    }))
    setScenarioItemLabel('')
    setScenarioItemCategory('General')
    setScenarioItemAmount(0)
    setScenarioItemType('add_variable')
  }

  function removeScenarioItem(index: number) {
    setScenario((current) => ({
      ...current,
      expenseChanges: current.expenseChanges.filter((_, itemIndex) => itemIndex !== index),
    }))
  }

  if (!snapshot || !metrics) {
    return (
      <main className="app-shell loading-shell">
        <div className="loading-card">
          <p>{status === 'loading' ? 'Cargando tu tablero...' : 'Inicializando...'}</p>
        </div>
      </main>
    )
  }

  return (
    <main className="app-shell">
      <section className="hero-panel">
        <div>
          <p className="eyebrow">Control financiero personal</p>
          <h1>Elegí un mes, filtrá el detalle y planificá escenarios aparte.</h1>
          <p className="hero-copy">
            El tablero quedó dividido entre operación diaria y planificación. Ahora
            podés mirar un mes puntual o el acumulado, filtrar por rubro o texto,
            y mover escenarios a una sección separada.
          </p>
        </div>
        <div className="hero-badges">
          <span className="badge">
            <Landmark size={16} /> {snapshot.summary.dataSourceLabel}
          </span>
          <span className="badge">
            <CalendarRange size={16} />{' '}
            {periodMode === 'all'
              ? `Acumulado (${metrics.monthsCount} meses)`
              : monthLabel(`${selectedPeriod}-01`)}
          </span>
        </div>
      </section>

      <nav className="top-nav">
        <button
          className={`nav-pill ${activeView === 'dashboard' ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveView('dashboard')}
        >
          <LayoutDashboard size={16} /> Dashboard
        </button>
        <button
          className={`nav-pill ${activeView === 'scenarios' ? 'active' : ''}`}
          type="button"
          onClick={() => setActiveView('scenarios')}
        >
          <ArrowRightLeft size={16} /> Escenarios
        </button>
      </nav>

      {error ? (
        <section className="alert error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </section>
      ) : null}

      {activeView === 'dashboard' ? (
        <>
          <section className="panel filter-panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Vista</p>
                <h2>Elegí período y filtros</h2>
              </div>
            </div>

            <div className="filter-grid">
              <div className="segmented">
                <button
                  className={periodMode === 'month' ? 'active' : ''}
                  type="button"
                  onClick={() => setPeriodMode('month')}
                >
                  Mes puntual
                </button>
                <button
                  className={periodMode === 'all' ? 'active' : ''}
                  type="button"
                  onClick={() => setPeriodMode('all')}
                >
                  Acumulado
                </button>
              </div>

              <label>
                Mes
                <select
                  value={selectedPeriod}
                  onChange={(event) => setSelectedPeriod(event.target.value)}
                  disabled={periodMode === 'all'}
                >
                  {snapshot.availablePeriods.map((period) => (
                    <option key={period} value={period}>
                      {monthLabel(`${period}-01`)}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Rubro
                <select
                  value={categoryFilter}
                  onChange={(event) => setCategoryFilter(event.target.value)}
                >
                  <option value="all">Todos los rubros</option>
                  {expenseCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Buscar ticket o detalle
                <div className="search-input">
                  <Search size={16} />
                  <input
                    value={searchFilter}
                    onChange={(event) => setSearchFilter(event.target.value)}
                    placeholder="farmashop, ticket, merienda..."
                  />
                </div>
              </label>
            </div>
          </section>

          <section className="metric-grid">
            <MetricCard
              icon={<Wallet size={18} />}
              label="Ingreso del período"
              value={currency(metrics.visibleIncome)}
              tone="emerald"
            />
            <MetricCard
              icon={<BadgeDollarSign size={18} />}
              label="Gasto del período"
              value={currency(metrics.totalExpenses)}
              tone="amber"
            />
            <MetricCard
              icon={<PiggyBank size={18} />}
              label="Saldo"
              value={currency(metrics.balance)}
              tone={metrics.balance >= 0 ? 'blue' : 'rose'}
            />
            <MetricCard
              icon={<Scale size={18} />}
              label="Uso del ingreso"
              value={`${metrics.coverage.toFixed(1)}%`}
              tone={metrics.coverage < 80 ? 'blue' : 'rose'}
            />
          </section>

          <section className="content-grid">
            <div className="panel chart-panel">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Evolución</p>
                  <h2>Ingresos y egresos por mes</h2>
                </div>
                <p className="muted">Sirve para ver tendencia aunque filtres un mes puntual.</p>
              </div>
              <div className="chart-wrap">
                <ResponsiveContainer width="100%" height={300}>
                  <AreaChart data={snapshot.summary.chartPoints}>
                    <defs>
                      <linearGradient id="incomeFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#0f766e" stopOpacity={0.45} />
                        <stop offset="95%" stopColor="#0f766e" stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="expenseFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#b45309" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#b45309" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="4 4" stroke="#d8d2c4" />
                    <XAxis dataKey="label" stroke="#6f6657" />
                    <YAxis stroke="#6f6657" />
                    <Tooltip />
                    <Area type="monotone" dataKey="income" stroke="#0f766e" fill="url(#incomeFill)" strokeWidth={2.5} />
                    <Area type="monotone" dataKey="expenses" stroke="#b45309" fill="url(#expenseFill)" strokeWidth={2.5} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="panel">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Rubro</p>
                  <h2>En qué se va el gasto</h2>
                </div>
                <p className="muted">Solo considera egresos filtrados.</p>
              </div>
              <div className="chart-wrap compact">
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={categorySummary.slice(0, 8)} layout="vertical">
                    <CartesianGrid strokeDasharray="4 4" stroke="#d8d2c4" />
                    <XAxis type="number" stroke="#6f6657" />
                    <YAxis dataKey="category" type="category" width={90} stroke="#6f6657" />
                    <Tooltip />
                    <Bar dataKey="total" fill="#0f766e" radius={[0, 10, 10, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </section>

          <section className="content-grid bottom-grid">
            <div className="panel">
              <div className="panel-heading">
                <div>
                  <p className="section-kicker">Movimientos</p>
                  <h2>Registrar movimientos</h2>
                </div>
                <div className="panel-actions">
                  <p className="muted">{visibleTransactions.length} movimientos visibles</p>
                  <button className="primary-button" type="button" onClick={() => setIsAddModalOpen(true)}>
                    <CirclePlus size={16} /> Agregar
                  </button>
                </div>
              </div>

              <div className="list-block">
                {visibleTransactions.map((item) => (
                  <article className="list-item" key={item.id}>
                    <div>
                      <strong>{item.title}</strong>
                      <p>
                        {item.category} · {monthLabel(item.occurredOn)}
                      </p>
                      {item.notes ? <small>{item.notes}</small> : null}
                    </div>
                    <div className="item-actions">
                      <span className={item.type === 'income' ? 'pill positive' : 'pill negative'}>
                        {item.type === 'income' ? '+' : '-'}
                        {currency(item.amount)}
                      </span>
                      <button className="ghost-button" type="button" onClick={() => void removeTransaction(item.id)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </div>

            <div className="panel right-stack">
              <section className="subpanel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Gastos fijos</p>
                    <h2>Compromisos recurrentes existentes</h2>
                  </div>
                </div>
                <div className="list-block compact-list">
                  {snapshot.fixedExpenses.map((item) => (
                    <article className="list-item" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <p>
                          {item.category}
                          {item.ownerLabel ? ` · ${item.ownerLabel}` : ''} · día {item.dueDay}
                        </p>
                      </div>
                      <div className="item-actions">
                        <span className="pill neutral">{currency(item.amount)}</span>
                        <button className="ghost-button" type="button" onClick={() => void removeFixedExpense(item.id)}>
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            </div>
          </section>
        </>
      ) : (
        <section className="scenario-layout">
          <section className="panel scenario-builder">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Planificación</p>
                <h2>Armar escenario nuevo</h2>
              </div>
              <p className="muted">Sacá gastos que desaparecen y sumá nuevos compromisos.</p>
            </div>

            <form className="stack-form" onSubmit={submitScenario}>
              <div className="form-row">
                <label>
                  Nombre del escenario
                  <input
                    value={scenario.name}
                    onChange={(event) =>
                      setScenario((current) => ({ ...current, name: event.target.value }))
                    }
                    required
                  />
                </label>
                <label>
                  Cambio en ingreso mensual
                  <input
                    type="number"
                    step="0.01"
                    value={scenario.incomeDelta}
                    onChange={(event) =>
                      setScenario((current) => ({
                        ...current,
                        incomeDelta: Number(event.target.value),
                      }))
                    }
                  />
                </label>
              </div>

              <label>
                Notas del escenario
                <textarea
                  rows={3}
                  value={scenario.notes}
                  onChange={(event) =>
                    setScenario((current) => ({ ...current, notes: event.target.value }))
                  }
                />
              </label>

              <div className="scenario-columns">
                <div className="scenario-box">
                  <label>
                    Mes base del escenario
                    <select
                      value={scenarioBasePeriod}
                      onChange={(event) => setScenarioBasePeriod(event.target.value)}
                    >
                      {snapshot.availablePeriods.map((period) => (
                        <option key={period} value={period}>
                          {monthLabel(`${period}-01`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <p className="scenario-helper">
                    Variables base tomadas de {monthLabel(`${scenarioBasePeriod || selectedPeriod}-01`)}:{' '}
                    {currency(scenarioPreview?.baseVariableExpenses ?? 0)}
                  </p>
                </div>

                <div className="scenario-box">
                  <h3>Gastos fijos que dejarían de existir</h3>
                  <div className="check-list">
                    {snapshot.fixedExpenses.map((expense) => {
                      const checked = scenario.expenseChanges.some(
                        (item) =>
                          item.changeType === 'remove_fixed' &&
                          item.fixedExpenseId === expense.id,
                      )

                      return (
                        <label className="check-item" key={expense.id}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleFixedExpenseInScenario(expense)}
                          />
                          <span>
                            {expense.name} · {currency(expense.amount)}
                          </span>
                        </label>
                      )
                    })}
                  </div>
                </div>

                <div className="scenario-box">
                  <h3>Gastos que agregarías</h3>
                  <div className="stack-form mini-form">
                    <div className="form-row">
                      <label>
                        Tipo
                        <select
                          value={scenarioItemType}
                          onChange={(event) =>
                            setScenarioItemType(
                              event.target.value as 'add_fixed' | 'add_variable',
                            )
                          }
                        >
                          <option value="add_variable">Variable</option>
                          <option value="add_fixed">Fijo mensual</option>
                        </select>
                      </label>
                      <label>
                        Rubro
                        <input
                          value={scenarioItemCategory}
                          onChange={(event) => setScenarioItemCategory(event.target.value)}
                        />
                      </label>
                    </div>
                    <div className="form-row">
                      <label>
                        Nombre
                        <input
                          value={scenarioItemLabel}
                          onChange={(event) => setScenarioItemLabel(event.target.value)}
                        />
                      </label>
                      <label>
                        Monto
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={scenarioItemAmount}
                          onChange={(event) =>
                            setScenarioItemAmount(Number(event.target.value))
                          }
                        />
                      </label>
                    </div>
                    <button className="secondary-button" type="button" onClick={addScenarioItem}>
                      <Plus size={16} /> Sumar ítem al escenario
                    </button>
                  </div>
                </div>
              </div>

              <div className="list-block compact-list">
                {scenario.expenseChanges.map((item, index) => (
                  <article className="list-item" key={`${item.label}-${index}`}>
                    <div>
                      <strong>{item.label}</strong>
                      <p>
                        {item.category} ·{' '}
                        {item.changeType === 'remove_fixed'
                          ? 'sale del presupuesto'
                          : item.changeType === 'add_fixed'
                            ? 'nuevo gasto fijo'
                            : 'nuevo gasto variable'}
                      </p>
                    </div>
                    <div className="item-actions">
                      <span className={item.changeType === 'remove_fixed' ? 'pill positive' : 'pill negative'}>
                        {item.changeType === 'remove_fixed' ? '-' : '+'}
                        {currency(item.amount)}
                      </span>
                      <button className="ghost-button" type="button" onClick={() => removeScenarioItem(index)}>
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </article>
                ))}
              </div>

              {scenarioPreview ? (
                <section className="scenario-preview">
                  <MetricCard
                    icon={<TrendingUp size={18} />}
                    label="Ingreso proyectado"
                    value={currency(scenarioPreview.projectedIncome)}
                    tone="emerald"
                  />
                  <MetricCard
                    icon={<Filter size={18} />}
                    label="Gasto proyectado"
                    value={currency(scenarioPreview.projectedExpenses)}
                    tone="amber"
                  />
                  <MetricCard
                    icon={<PiggyBank size={18} />}
                    label="Balance proyectado"
                    value={currency(scenarioPreview.projectedBalance)}
                    tone={scenarioPreview.projectedBalance >= 0 ? 'blue' : 'rose'}
                  />
                  <MetricCard
                    icon={<Scale size={18} />}
                    label="¿Llega a la meta?"
                    value={scenarioPreview.hitsGoal ? 'Sí' : 'No'}
                    tone={scenarioPreview.hitsGoal ? 'blue' : 'rose'}
                  />
                </section>
              ) : null}

              <button className="primary-button" type="submit" disabled={status !== 'idle'}>
                Guardar escenario
              </button>
            </form>
          </section>

          <section className="panel">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Escenarios guardados</p>
                <h2>Comparaciones listas para revisar</h2>
              </div>
            </div>
            <div className="scenario-grid">
              {snapshot.scenarios.map((item) => (
                <article className="scenario-card" key={item.id}>
                  <div className="scenario-top">
                    <div>
                      <h3>{item.name}</h3>
                      <p>{item.notes || 'Sin notas adicionales.'}</p>
                    </div>
                    <button className="ghost-button" type="button" onClick={() => void removeScenario(item.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                  <dl>
                    <div>
                      <dt>Balance proyectado</dt>
                      <dd>{currency(item.projectedBalance)}</dd>
                    </div>
                    <div>
                      <dt>Ingreso ajustado</dt>
                      <dd>{currency(item.projectedIncome)}</dd>
                    </div>
                    <div>
                      <dt>Gasto ajustado</dt>
                      <dd>{currency(item.projectedExpenses)}</dd>
                    </div>
                    <div>
                      <dt>Meta de ahorro</dt>
                      <dd>{item.hitsSavingsGoal ? 'Cumple' : 'No llega'}</dd>
                    </div>
                  </dl>
                  <div className="scenario-tag-list">
                    {item.expenseChanges.map((change) => (
                      <span className="badge small-badge" key={change.id}>
                        {change.changeType === 'remove_fixed' ? 'Sale' : 'Suma'}: {change.label}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {isAddModalOpen ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Nuevo movimiento</p>
                <h2>Elegí cómo querés cargarlo</h2>
              </div>
              <button className="ghost-button" type="button" onClick={closeAddModal}>
                <Trash2 size={16} />
              </button>
            </div>

            {addFlowMode === 'menu' ? (
              <div className="entry-grid">
                <label className="upload-card">
                  <input
                    className="hidden-input"
                    type="file"
                    accept="image/*"
                    capture="environment"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void analyzeTicket(file)
                      }
                    }}
                  />
                  <Camera size={24} />
                  <strong>Sacar foto o subir ticket</strong>
                  <span>La web analiza el texto y te propone rubro, monto y detalle.</span>
                </label>

                <button className="upload-card button-card" type="button" onClick={() => setAddFlowMode('manual')}>
                  <FileImage size={24} />
                  <strong>Agregar manualmente</strong>
                  <span>Elegís si es ingreso o gasto y después si ese gasto es fijo o variable.</span>
                </button>
              </div>
            ) : null}

            {addFlowMode !== 'menu' ? (
              <form className="stack-form" onSubmit={submitAddFlow}>
                {isAnalyzingTicket ? <p className="scenario-helper">Analizando ticket...</p> : null}
                {ticketImageName ? <p className="scenario-helper">Archivo: {ticketImageName}</p> : null}

                <div className="form-row">
                  <label>
                    Tipo
                    <select
                      value={manualType}
                      onChange={(event) =>
                        setManualType(event.target.value as 'expense' | 'income')
                      }
                    >
                      <option value="expense">Gasto</option>
                      <option value="income">Ingreso</option>
                    </select>
                  </label>

                  {manualType === 'expense' ? (
                    <label>
                      Naturaleza
                      <select
                        value={expenseKind}
                        onChange={(event) =>
                          setExpenseKind(event.target.value as 'variable' | 'fixed')
                        }
                      >
                        <option value="variable">Variable</option>
                        <option value="fixed">Fijo</option>
                      </select>
                    </label>
                  ) : (
                    <label>
                      Rubro único
                      <input
                        value={income.category}
                        onChange={(event) =>
                          setIncome((current) => ({ ...current, category: event.target.value }))
                        }
                        required
                      />
                    </label>
                  )}
                </div>

                <label>
                  Descripción
                  <input
                    value={manualType === 'expense' ? expense.title : income.title}
                    onChange={(event) =>
                      manualType === 'expense'
                        ? setExpense((current) => ({ ...current, title: event.target.value }))
                        : setIncome((current) => ({ ...current, title: event.target.value }))
                    }
                    required
                  />
                </label>

                <div className="form-row">
                  <label>
                    Rubro único
                    <input
                      value={manualType === 'expense' ? expense.category : income.category}
                      onChange={(event) =>
                        manualType === 'expense'
                          ? setExpense((current) => ({ ...current, category: event.target.value }))
                          : setIncome((current) => ({ ...current, category: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Monto
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={manualType === 'expense' ? expense.amount : income.amount}
                      onChange={(event) =>
                        manualType === 'expense'
                          ? setExpense((current) => ({
                              ...current,
                              amount: Number(event.target.value),
                            }))
                          : setIncome((current) => ({
                              ...current,
                              amount: Number(event.target.value),
                            }))
                      }
                      required
                    />
                  </label>
                </div>

                <div className="form-row">
                  <label>
                    Fecha
                    <input
                      type="date"
                      value={manualType === 'expense' ? expense.occurredOn : income.occurredOn}
                      onChange={(event) =>
                        manualType === 'expense'
                          ? setExpense((current) => ({
                              ...current,
                              occurredOn: event.target.value,
                            }))
                          : setIncome((current) => ({
                              ...current,
                              occurredOn: event.target.value,
                            }))
                      }
                      required
                    />
                  </label>

                  {manualType === 'expense' && expenseKind === 'fixed' ? (
                    <label>
                      Día de vencimiento
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={fixedExpense.dueDay}
                        onChange={(event) =>
                          setFixedExpense((current) => ({
                            ...current,
                            dueDay: Number(event.target.value),
                          }))
                        }
                        required
                      />
                    </label>
                  ) : (
                    <label>
                      Detalle
                      <input
                        value={manualType === 'expense' ? expense.notes : income.notes}
                        onChange={(event) =>
                          manualType === 'expense'
                            ? setExpense((current) => ({ ...current, notes: event.target.value }))
                            : setIncome((current) => ({ ...current, notes: event.target.value }))
                        }
                        placeholder="Ticket, aclaración, comercio..."
                      />
                    </label>
                  )}
                </div>

                {manualType === 'expense' && expenseKind === 'fixed' ? (
                  <div className="form-row">
                    <label>
                      Responsable
                      <input
                        value={fixedExpense.ownerLabel}
                        onChange={(event) =>
                          setFixedExpense((current) => ({
                            ...current,
                            ownerLabel: event.target.value,
                          }))
                        }
                      />
                    </label>
                    <label>
                      Detalle
                      <input
                        value={expense.notes}
                        onChange={(event) =>
                          setExpense((current) => ({ ...current, notes: event.target.value }))
                        }
                      />
                    </label>
                  </div>
                ) : null}

                {ocrPreview ? (
                  <label>
                    Texto detectado del ticket
                    <textarea rows={5} value={ocrPreview} readOnly />
                  </label>
                ) : null}

                <div className="modal-actions">
                  <button className="secondary-button" type="button" onClick={closeAddModal}>
                    Cancelar
                  </button>
                  <button className="primary-button" type="submit" disabled={status !== 'idle' || isAnalyzingTicket}>
                    <Plus size={16} /> Guardar
                  </button>
                </div>
              </form>
            ) : null}
          </div>
        </div>
      ) : null}
    </main>
  )
}

type MetricCardProps = {
  icon: ReactNode
  label: string
  value: string
  tone: 'emerald' | 'amber' | 'blue' | 'rose'
}

function MetricCard({ icon, label, value, tone }: MetricCardProps) {
  return (
    <article className={`metric-card ${tone}`}>
      <div className="metric-icon">{icon}</div>
      <p>{label}</p>
      <strong>{value}</strong>
    </article>
  )
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message
  }

  return 'Ocurrió un problema inesperado.'
}

function extractAmount(text: string) {
  const normalized = text.replace(/\./g, '').replace(/,/g, '.')
  const matches = normalized.match(/\d+(?:\.\d{1,2})?/g) ?? []
  const values = matches
    .map((value) => Number(value))
    .filter((value) => Number.isFinite(value) && value > 50 && value < 1000000)

  return values.length > 0 ? Math.max(...values) : 0
}

function inferCategory(text: string) {
  const lower = text.toLowerCase()

  if (/(farmashop|farmacia|medic|hospital|ucm)/.test(lower)) {
    return 'Salud'
  }

  if (/(disco|tienda inglesa|macro mercado|fresh market|super|merienda|café|almuerzo|helader)/.test(lower)) {
    return 'Comidas'
  }

  if (/(ute|ose|adsl|internet|celular|movistar)/.test(lower)) {
    return 'Servicios'
  }

  if (/(patente|estacionamiento|boleto|auto|camioneta|lavado)/.test(lower)) {
    return 'Vehículo'
  }

  if (/(tarjeta|mastercard|visa)/.test(lower)) {
    return 'Tarjetas'
  }

  if (/(bookshop|juguete|libro|ropa|compra)/.test(lower)) {
    return 'Compras'
  }

  return 'General'
}

function inferTitle(text: string) {
  const firstMeaningfulLine = text
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 3 && !/^\d+$/.test(line))

  return firstMeaningfulLine?.slice(0, 80) ?? 'Ticket importado'
}

export default App
