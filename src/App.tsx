import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  AlertCircle,
  ArrowRightLeft,
  BadgeDollarSign,
  CalendarRange,
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
import { currency, monthLabel } from './lib/format'
import { financeStore } from './lib/store'
import type {
  FinanceSnapshot,
  FixedExpense,
  FixedExpenseDraft,
  PeriodMode,
  ScenarioDraft,
  TransactionDraft,
} from './types'

const initialTransaction: TransactionDraft = {
  title: '',
  category: 'General',
  amount: 0,
  type: 'expense',
  occurredOn: new Date().toISOString().slice(0, 10),
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

function App() {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [transaction, setTransaction] = useState<TransactionDraft>(initialTransaction)
  const [fixedExpense, setFixedExpense] = useState<FixedExpenseDraft>(initialFixedExpense)
  const [scenario, setScenario] = useState<ScenarioDraft>(initialScenario)
  const [activeView, setActiveView] = useState<'dashboard' | 'scenarios'>('dashboard')
  const [periodMode, setPeriodMode] = useState<PeriodMode>('month')
  const [selectedPeriod, setSelectedPeriod] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [searchFilter, setSearchFilter] = useState('')
  const [scenarioItemLabel, setScenarioItemLabel] = useState('')
  const [scenarioItemCategory, setScenarioItemCategory] = useState('General')
  const [scenarioItemAmount, setScenarioItemAmount] = useState(0)
  const [scenarioItemType, setScenarioItemType] = useState<'add_fixed' | 'add_variable'>(
    'add_variable',
  )

  useEffect(() => {
    void loadSnapshot()
  }, [])

  useEffect(() => {
    if (snapshot && !selectedPeriod && snapshot.availablePeriods.length > 0) {
      setSelectedPeriod(snapshot.availablePeriods[0])
    }
  }, [snapshot, selectedPeriod])

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

  const visibleTransactions = useMemo(() => {
    if (!snapshot) {
      return []
    }

    const base =
      periodMode === 'all'
        ? snapshot.transactions
        : snapshot.transactions.filter((item) => item.occurredOn.startsWith(selectedPeriod))

    return base.filter((item) => {
      const matchesCategory =
        categoryFilter === 'all' ? true : item.category === categoryFilter
      const haystack = `${item.title} ${item.notes}`.toLowerCase()
      const matchesSearch = searchFilter.trim()
        ? haystack.includes(searchFilter.trim().toLowerCase())
        : true

      return matchesCategory && matchesSearch
    })
  }, [categoryFilter, periodMode, searchFilter, selectedPeriod, snapshot])

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null
    }

    const monthsCount = periodMode === 'all' ? Math.max(snapshot.availablePeriods.length, 1) : 1
    const visibleIncome = visibleTransactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0)
    const visibleVariableExpenses = visibleTransactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0)
    const visibleFixedExpenses =
      snapshot.fixedExpenses.reduce((sum, item) => sum + item.amount, 0) * monthsCount
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
  }, [periodMode, snapshot, visibleTransactions])

  const expenseCategories = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return [...new Set(snapshot.transactions.filter((item) => item.type === 'expense').map((item) => item.category))].sort()
  }, [snapshot])

  const categorySummary = useMemo(() => {
    const expenseMap = new Map<string, number>()

    for (const item of visibleTransactions) {
      if (item.type !== 'expense') {
        continue
      }

      expenseMap.set(item.category, (expenseMap.get(item.category) ?? 0) + item.amount)
    }

    return [...expenseMap.entries()]
      .map(([category, total]) => ({ category, total }))
      .sort((a, b) => b.total - a.total)
  }, [visibleTransactions])

  const scenarioPreview = useMemo(() => {
    if (!snapshot || !metrics) {
      return null
    }

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
      metrics.visibleVariableExpenses +
      addedVariableTotal +
      scenario.extraExpenseDelta +
      scenario.fixedExpenseDelta
    const projectedBalance = projectedIncome - projectedExpenses

    return {
      projectedIncome,
      projectedExpenses,
      projectedBalance,
      hitsGoal: projectedBalance >= snapshot.settings.savingsGoal,
    }
  }, [metrics, scenario, snapshot])

  async function saveIncome(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    const monthlyIncome = Number(formData.get('monthlyIncome') ?? 0)
    const savingsGoal = Number(formData.get('savingsGoal') ?? 0)

    setStatus('saving')
    setError(null)

    try {
      await financeStore.upsertSettings({ monthlyIncome, savingsGoal })
      await loadSnapshot()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  async function submitTransaction(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    setError(null)

    try {
      await financeStore.addTransaction(transaction)
      setTransaction(initialTransaction)
      await loadSnapshot()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  async function submitFixedExpense(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setStatus('saving')
    setError(null)

    try {
      await financeStore.addFixedExpense(fixedExpense)
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
                  <h2>Registrar y revisar detalle</h2>
                </div>
                <p className="muted">{visibleTransactions.length} movimientos visibles</p>
              </div>
              <form className="stack-form" onSubmit={submitTransaction}>
                <label>
                  Descripción
                  <input
                    value={transaction.title}
                    onChange={(event) =>
                      setTransaction((current) => ({ ...current, title: event.target.value }))
                    }
                    required
                  />
                </label>
                <div className="form-row">
                  <label>
                    Tipo
                    <select
                      value={transaction.type}
                      onChange={(event) =>
                        setTransaction((current) => ({
                          ...current,
                          type: event.target.value as TransactionDraft['type'],
                        }))
                      }
                    >
                      <option value="expense">Gasto</option>
                      <option value="income">Ingreso</option>
                    </select>
                  </label>
                  <label>
                    Rubro
                    <input
                      value={transaction.category}
                      onChange={(event) =>
                        setTransaction((current) => ({ ...current, category: event.target.value }))
                      }
                      required
                    />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Monto
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={transaction.amount}
                      onChange={(event) =>
                        setTransaction((current) => ({
                          ...current,
                          amount: Number(event.target.value),
                        }))
                      }
                      required
                    />
                  </label>
                  <label>
                    Fecha
                    <input
                      type="date"
                      value={transaction.occurredOn}
                      onChange={(event) =>
                        setTransaction((current) => ({
                          ...current,
                          occurredOn: event.target.value,
                        }))
                      }
                      required
                    />
                  </label>
                </div>
                <label>
                  Notas o detalle de ticket
                  <textarea
                    rows={3}
                    value={transaction.notes}
                    onChange={(event) =>
                      setTransaction((current) => ({ ...current, notes: event.target.value }))
                    }
                  />
                </label>
                <button className="primary-button" type="submit" disabled={status !== 'idle'}>
                  <Plus size={16} /> Agregar movimiento
                </button>
              </form>

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
                    <p className="section-kicker">Presupuesto base</p>
                    <h2>Ingreso y ahorro objetivo</h2>
                  </div>
                </div>
                <form className="stack-form" onSubmit={saveIncome}>
                  <label>
                    Ingreso mensual base
                    <input
                      name="monthlyIncome"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={snapshot.settings.monthlyIncome}
                      required
                    />
                  </label>
                  <label>
                    Meta de ahorro
                    <input
                      name="savingsGoal"
                      type="number"
                      min="0"
                      step="0.01"
                      defaultValue={snapshot.settings.savingsGoal}
                      required
                    />
                  </label>
                  <button className="primary-button" type="submit" disabled={status !== 'idle'}>
                    Guardar configuración
                  </button>
                </form>
              </section>

              <section className="subpanel">
                <div className="panel-heading">
                  <div>
                    <p className="section-kicker">Gastos fijos</p>
                    <h2>Compromisos recurrentes</h2>
                  </div>
                </div>
                <form className="stack-form" onSubmit={submitFixedExpense}>
                  <label>
                    Nombre
                    <input
                      value={fixedExpense.name}
                      onChange={(event) =>
                        setFixedExpense((current) => ({ ...current, name: event.target.value }))
                      }
                      required
                    />
                  </label>
                  <div className="form-row">
                    <label>
                      Rubro
                      <input
                        value={fixedExpense.category}
                        onChange={(event) =>
                          setFixedExpense((current) => ({
                            ...current,
                            category: event.target.value,
                          }))
                        }
                        required
                      />
                    </label>
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
                  </div>
                  <div className="form-row">
                    <label>
                      Monto
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        value={fixedExpense.amount}
                        onChange={(event) =>
                          setFixedExpense((current) => ({
                            ...current,
                            amount: Number(event.target.value),
                          }))
                        }
                        required
                      />
                    </label>
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
                  </div>
                  <button className="primary-button" type="submit" disabled={status !== 'idle'}>
                    <Plus size={16} /> Agregar fijo
                  </button>
                </form>
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

export default App
