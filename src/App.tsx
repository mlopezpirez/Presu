import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import {
  AlertCircle,
  BadgeDollarSign,
  Landmark,
  PiggyBank,
  Plus,
  Scale,
  Trash2,
  Wallet,
} from 'lucide-react'
import {
  Area,
  AreaChart,
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
  FixedExpenseDraft,
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
}

function App() {
  const [snapshot, setSnapshot] = useState<FinanceSnapshot | null>(null)
  const [status, setStatus] = useState<'idle' | 'loading' | 'saving'>('loading')
  const [error, setError] = useState<string | null>(null)
  const [transaction, setTransaction] = useState<TransactionDraft>(initialTransaction)
  const [fixedExpense, setFixedExpense] =
    useState<FixedExpenseDraft>(initialFixedExpense)
  const [scenario, setScenario] = useState<ScenarioDraft>(initialScenario)

  useEffect(() => {
    void loadSnapshot()
  }, [])

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null
    }

    const monthlyExpenses =
      snapshot.summary.totalVariableExpenses + snapshot.summary.totalFixedExpenses
    const balance = snapshot.summary.monthlyIncome - monthlyExpenses
    const coverage = snapshot.summary.monthlyIncome === 0
      ? 0
      : (monthlyExpenses / snapshot.summary.monthlyIncome) * 100

    return {
      monthlyExpenses,
      balance,
      coverage,
    }
  }, [snapshot])

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
      await loadSnapshot()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  async function removeTransaction(id: string) {
    setStatus('saving')
    setError(null)

    try {
      await financeStore.deleteTransaction(id)
      await loadSnapshot()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
      setStatus('idle')
    }
  }

  async function removeFixedExpense(id: string) {
    setStatus('saving')
    setError(null)

    try {
      await financeStore.deleteFixedExpense(id)
      await loadSnapshot()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
      setStatus('idle')
    }
  }

  async function removeScenario(id: string) {
    setStatus('saving')
    setError(null)

    try {
      await financeStore.deleteScenario(id)
      await loadSnapshot()
    } catch (deleteError) {
      setError(getErrorMessage(deleteError))
      setStatus('idle')
    }
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
          <p className="eyebrow">Dashboard financiero personal</p>
          <h1>Controlá ingresos, gastos y escenarios antes de comprometerte.</h1>
          <p className="hero-copy">
            El modelo está pensado en base a tu presupuesto de marzo: gastos fijos,
            variables, ingresos por persona, notas y movimientos consolidados.
          </p>
        </div>
        <div className="hero-badges">
          <span className="badge">
            <Landmark size={16} /> {snapshot.summary.dataSourceLabel}
          </span>
          <span className="badge">
            <Scale size={16} /> {monthLabel(new Date().toISOString().slice(0, 10))}
          </span>
        </div>
      </section>

      {error ? (
        <section className="alert error">
          <AlertCircle size={18} />
          <span>{error}</span>
        </section>
      ) : null}

      <section className="metric-grid">
        <MetricCard
          icon={<Wallet size={18} />}
          label="Ingreso mensual"
          value={currency(snapshot.summary.monthlyIncome)}
          tone="emerald"
        />
        <MetricCard
          icon={<BadgeDollarSign size={18} />}
          label="Gasto mensual"
          value={currency(metrics.monthlyExpenses)}
          tone="amber"
        />
        <MetricCard
          icon={<PiggyBank size={18} />}
          label="Saldo disponible"
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
              <h2>Movimiento del último semestre</h2>
            </div>
            <p className="muted">Ingresos vs egresos variables</p>
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
                <Tooltip
                  contentStyle={{
                    borderRadius: 16,
                    border: '1px solid #d8d2c4',
                    background: '#fffaf0',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="income"
                  stroke="#0f766e"
                  fill="url(#incomeFill)"
                  strokeWidth={2.5}
                />
                <Area
                  type="monotone"
                  dataKey="expenses"
                  stroke="#b45309"
                  fill="url(#expenseFill)"
                  strokeWidth={2.5}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="panel settings-panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Base del presupuesto</p>
              <h2>Ingreso y meta de ahorro</h2>
            </div>
          </div>
          <form className="stack-form" onSubmit={saveIncome}>
            <label>
              Ingreso mensual
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
        </div>
      </section>

      <section className="content-grid bottom-grid">
        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Movimientos</p>
              <h2>Cargar gasto o ingreso</h2>
            </div>
          </div>
          <form className="stack-form" onSubmit={submitTransaction}>
            <label>
              Descripción
              <input
                value={transaction.title}
                onChange={(event) =>
                  setTransaction((current) => ({
                    ...current,
                    title: event.target.value,
                  }))
                }
                placeholder="Supermercado, freelance, regalo..."
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
                Categoría
                <input
                  value={transaction.category}
                  onChange={(event) =>
                    setTransaction((current) => ({
                      ...current,
                      category: event.target.value,
                    }))
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
              Notas
              <textarea
                rows={3}
                value={transaction.notes}
                onChange={(event) =>
                  setTransaction((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
            <button className="primary-button" type="submit" disabled={status !== 'idle'}>
              <Plus size={16} /> Agregar movimiento
            </button>
          </form>

          <div className="list-block">
            {snapshot.transactions.map((item) => (
              <article className="list-item" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <p>
                    {item.category} · {monthLabel(item.occurredOn)}
                  </p>
                </div>
                <div className="item-actions">
                  <span className={item.type === 'income' ? 'pill positive' : 'pill negative'}>
                    {item.type === 'income' ? '+' : '-'}
                    {currency(item.amount)}
                  </span>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void removeTransaction(item.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-heading">
            <div>
              <p className="section-kicker">Compromisos mensuales</p>
              <h2>Gastos fijos</h2>
            </div>
          </div>
          <form className="stack-form" onSubmit={submitFixedExpense}>
            <label>
              Nombre
              <input
                value={fixedExpense.name}
                onChange={(event) =>
                  setFixedExpense((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Alquiler, internet, gimnasio..."
                required
              />
            </label>
            <div className="form-row">
              <label>
                Categoría
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
                  placeholder="Mauri, Laura, familiar..."
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
              <Plus size={16} /> Agregar gasto fijo
            </button>
          </form>

          <div className="list-block">
            {snapshot.fixedExpenses.map((item) => (
              <article className="list-item" key={item.id}>
                <div>
                  <strong>{item.name}</strong>
                  <p>
                    {item.category}
                    {item.ownerLabel ? ` · ${item.ownerLabel}` : ''} · vence el día {item.dueDay}
                  </p>
                </div>
                <div className="item-actions">
                  <span className="pill neutral">{currency(item.amount)}</span>
                  <button
                    className="ghost-button"
                    type="button"
                    onClick={() => void removeFixedExpense(item.id)}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="panel scenario-panel">
        <div className="panel-heading">
          <div>
            <p className="section-kicker">Escenarios</p>
            <h2>Probá si tu presupuesto aguanta cambios</h2>
          </div>
          <p className="muted">
            Meta de ahorro actual: {currency(snapshot.settings.savingsGoal)}
          </p>
        </div>

        <form className="stack-form scenario-form" onSubmit={submitScenario}>
          <div className="form-row triple">
            <label>
              Nombre del escenario
              <input
                value={scenario.name}
                onChange={(event) =>
                  setScenario((current) => ({
                    ...current,
                    name: event.target.value,
                  }))
                }
                placeholder="Cambio de alquiler, menos ingresos..."
                required
              />
            </label>
            <label>
              Cambio en ingresos
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
                required
              />
            </label>
            <label>
              Gasto variable extra
              <input
                type="number"
                step="0.01"
                value={scenario.extraExpenseDelta}
                onChange={(event) =>
                  setScenario((current) => ({
                    ...current,
                    extraExpenseDelta: Number(event.target.value),
                  }))
                }
                required
              />
            </label>
          </div>
          <div className="form-row">
            <label>
              Cambio en gastos fijos
              <input
                type="number"
                step="0.01"
                value={scenario.fixedExpenseDelta}
                onChange={(event) =>
                  setScenario((current) => ({
                    ...current,
                    fixedExpenseDelta: Number(event.target.value),
                  }))
                }
                required
              />
            </label>
            <label>
              Notas
              <input
                value={scenario.notes}
                onChange={(event) =>
                  setScenario((current) => ({
                    ...current,
                    notes: event.target.value,
                  }))
                }
              />
            </label>
          </div>
          <button className="primary-button" type="submit" disabled={status !== 'idle'}>
            <Plus size={16} /> Guardar escenario
          </button>
        </form>

        <div className="scenario-grid">
          {snapshot.scenarios.map((item) => (
            <article className="scenario-card" key={item.id}>
              <div className="scenario-top">
                <div>
                  <h3>{item.name}</h3>
                  <p>{item.notes || 'Sin notas adicionales.'}</p>
                </div>
                <button
                  className="ghost-button"
                  type="button"
                  onClick={() => void removeScenario(item.id)}
                >
                  <Trash2 size={16} />
                </button>
              </div>
              <dl>
                <div>
                  <dt>Balance proyectado</dt>
                  <dd>{currency(item.projectedBalance)}</dd>
                </div>
                <div>
                  <dt>¿Llega a la meta?</dt>
                  <dd>{item.hitsSavingsGoal ? 'Sí' : 'No'}</dd>
                </div>
                <div>
                  <dt>Ingreso ajustado</dt>
                  <dd>{currency(item.projectedIncome)}</dd>
                </div>
                <div>
                  <dt>Gasto total ajustado</dt>
                  <dd>{currency(item.projectedExpenses)}</dd>
                </div>
              </dl>
            </article>
          ))}
        </div>
      </section>
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
