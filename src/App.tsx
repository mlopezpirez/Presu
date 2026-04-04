import { useEffect, useMemo, useState } from 'react'
import type { FormEvent, ReactNode } from 'react'
import Tesseract from 'tesseract.js'
import * as pdfjsLib from 'pdfjs-dist'
import {
  AlertCircle,
  AlertTriangle,
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
  Pencil,
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
  DuplicateTicketMatch,
  FinanceSnapshot,
  FixedExpense,
  FixedExpenseDraft,
  PeriodMode,
  ScenarioDraft,
  Transaction,
  TransactionDraft,
} from './types'

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.min.mjs`

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
  isProrated: false,
  startsOn: todayLocalIso().slice(0, 7) + '-01',
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
type EditingTarget =
  | { kind: 'transaction'; id: string }
  | { kind: 'fixedExpense'; id: string }
  | null
type TicketAnalysis = {
  merchantName?: string
  title?: string
  category?: string
  amount?: number
  occurredOn?: string
  ticketDate?: string
  notes?: string
  analysisSource?: 'llm' | 'ocr_fallback' | 'local_fast'
  fingerprint?: string
  sourceFileName?: string
  items?: Array<{ description: string; amount?: number }>
}

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
  const [ticketAnalysis, setTicketAnalysis] = useState<TicketAnalysis | null>(null)
  const [duplicateMatches, setDuplicateMatches] = useState<DuplicateTicketMatch[]>([])
  const [duplicateConfirmationRequired, setDuplicateConfirmationRequired] = useState(false)
  const [editingTarget, setEditingTarget] = useState<EditingTarget>(null)
  const [selectedScenario, setSelectedScenario] = useState<FinanceSnapshot['scenarios'][number] | null>(null)

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

  const effectiveFixedPeriod = selectedPeriod || todayLocalIso().slice(0, 7)
  const visibleFixedExpenses = useMemo(() => {
    if (!snapshot) {
      return []
    }

    const periods =
      periodMode === 'all' ? snapshot.availablePeriods : [effectiveFixedPeriod]

    return periods.flatMap((period) =>
      filteredFixedExpenses.filter((item) => isFixedExpenseActiveForPeriod(item, period)),
    )
  }, [effectiveFixedPeriod, filteredFixedExpenses, periodMode, snapshot])

  const metrics = useMemo(() => {
    if (!snapshot) {
      return null
    }

    const months = periodMode === 'all' ? snapshot.availablePeriods : [effectiveFixedPeriod]
    const visibleIncome = periodTransactions
      .filter((item) => item.type === 'income')
      .reduce((sum, item) => sum + item.amount, 0)
    const visibleVariableExpenses = visibleTransactions
      .filter((item) => item.type === 'expense')
      .reduce((sum, item) => sum + item.amount, 0)
    const totalFixedExpensesForPeriods = months.reduce(
      (sum, period) =>
        sum +
        filteredFixedExpenses
          .filter((item) => isFixedExpenseActiveForPeriod(item, period))
          .reduce((periodSum, item) => periodSum + item.amount, 0),
      0,
    )
    const totalProratedExpensesForPeriods = months.reduce(
      (sum, period) =>
        sum +
        filteredFixedExpenses
          .filter((item) => isFixedExpenseActiveForPeriod(item, period) && item.isProrated)
          .reduce((periodSum, item) => periodSum + item.amount, 0),
      0,
    )
    const totalCoreFixedExpensesForPeriods =
      totalFixedExpensesForPeriods - totalProratedExpensesForPeriods
    const totalExpenses = visibleVariableExpenses + totalFixedExpensesForPeriods
    const totalExpensesWithoutProrated = visibleVariableExpenses + totalCoreFixedExpensesForPeriods
    const balance = visibleIncome - totalExpenses
    const coverage = visibleIncome === 0 ? 0 : (totalExpenses / visibleIncome) * 100

    return {
      monthsCount: months.length,
      visibleIncome,
      visibleVariableExpenses,
      visibleCoreFixedExpenses: totalCoreFixedExpensesForPeriods,
      visibleProratedExpenses: totalProratedExpensesForPeriods,
      visibleFixedExpenses: totalFixedExpensesForPeriods,
      totalExpensesWithoutProrated,
      totalExpenses,
      balance,
      coverage,
    }
  }, [effectiveFixedPeriod, filteredFixedExpenses, periodMode, periodTransactions, snapshot, visibleTransactions])

  const expenseCategories = useMemo(() => {
    if (!snapshot) {
      return []
    }

    return [...new Set(snapshot.transactions.filter((item) => item.type === 'expense').map((item) => item.category))].sort()
  }, [snapshot])

  const categorySummary = useMemo(() => {
    const expenseMap = new Map<string, number>()

    for (const item of visibleFixedExpenses) {
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
  }, [visibleFixedExpenses, visibleTransactions])

  const scenarioPreview = useMemo(() => {
    if (!snapshot || !metrics) {
      return null
    }

    const activeFixedExpenses = snapshot.fixedExpenses.filter((item) =>
      isFixedExpenseActiveForPeriod(item, scenarioBasePeriod),
    )
    const scenarioBaseTransactions = snapshot.transactions.filter(
      (item) => item.occurredOn.startsWith(scenarioBasePeriod) && item.type === 'expense',
    )
    const baseVariableExpenses = scenarioBaseTransactions.reduce(
      (sum, item) => sum + item.amount,
      0,
    )
    const baseProratedFixedExpenses = activeFixedExpenses
      .filter((item) => item.isProrated)
      .reduce((sum, item) => sum + item.amount, 0)
    const baseCoreFixedExpenses = activeFixedExpenses
      .filter((item) => !item.isProrated)
      .reduce((sum, item) => sum + item.amount, 0)

    const removedFixedTotal = scenario.expenseChanges
      .filter((item) => item.changeType === 'remove_fixed')
      .reduce((sum, item) => sum + item.amount, 0)

    const removedVariableTotal = scenario.expenseChanges
      .filter((item) => item.changeType === 'remove_variable')
      .reduce((sum, item) => sum + item.amount, 0)

    const addedFixedTotal = scenario.expenseChanges
      .filter((item) => item.changeType === 'add_fixed')
      .reduce((sum, item) => sum + item.amount, 0)

    const addedVariableTotal = scenario.expenseChanges
      .filter((item) => item.changeType === 'add_variable')
      .reduce((sum, item) => sum + item.amount, 0)

    const projectedIncome = snapshot.settings.monthlyIncome + scenario.incomeDelta
    const projectedExpenses =
      baseCoreFixedExpenses +
      baseProratedFixedExpenses -
      removedFixedTotal +
      baseVariableExpenses -
      removedVariableTotal +
      addedFixedTotal +
      addedVariableTotal +
      scenario.extraExpenseDelta +
      scenario.fixedExpenseDelta
    const projectedExpensesWithoutProrated =
      baseCoreFixedExpenses -
      removedFixedTotal +
      baseVariableExpenses -
      removedVariableTotal +
      addedFixedTotal +
      addedVariableTotal +
      scenario.extraExpenseDelta +
      scenario.fixedExpenseDelta
    const projectedBalance = projectedIncome - projectedExpenses

    return {
      baseCoreFixedExpenses,
      baseProratedFixedExpenses,
      baseVariableExpenses,
      removedFixedTotal,
      removedVariableTotal,
      addedFixedTotal,
      addedVariableTotal,
      projectedIncome,
      projectedExpensesWithoutProrated,
      projectedExpenses,
      projectedBalance,
    }
  }, [scenario, scenarioBasePeriod, snapshot, metrics])

  async function submitAddFlow(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    await persistEntry(duplicateConfirmationRequired)
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
    await withSave(async () => financeStore.deleteFixedExpense(id, effectiveFixedPeriod))
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
    setTicketAnalysis(null)
    setDuplicateMatches([])
    setDuplicateConfirmationRequired(false)
    setEditingTarget(null)
    setIsAnalyzingTicket(false)
  }

  async function persistEntry(ignoreDuplicates: boolean) {
    setStatus('saving')
    setError(null)

    try {
      const currentDraft = manualType === 'income' ? income : expense
      const duplicateCandidates =
        manualType === 'expense' && expenseKind === 'variable'
          ? await financeStore.findDuplicateTransactions(
              currentDraft,
              editingTarget?.kind === 'transaction' ? editingTarget.id : undefined,
            )
          : []

      if (!ignoreDuplicates && duplicateCandidates.length > 0) {
        setDuplicateMatches(duplicateCandidates)
        setDuplicateConfirmationRequired(true)
        setStatus('idle')
        return
      }

      if (editingTarget?.kind === 'transaction') {
        await saveFromTransactionEdit(currentDraft)
      } else if (editingTarget?.kind === 'fixedExpense') {
        await saveFromFixedExpenseEdit(currentDraft)
      } else if (manualType === 'income') {
        await financeStore.addTransaction({ ...income, type: 'income' })
      } else if (expenseKind === 'fixed') {
        await financeStore.addFixedExpense({
          ...fixedExpense,
          name: expense.title,
          amount: expense.amount,
          category: expense.category,
          startsOn: fixedExpense.startsOn,
        })
      } else {
        await financeStore.addTransaction({ ...expense, type: 'expense' })
      }

      await loadSnapshot()
      closeAddModal()
    } catch (saveError) {
      setError(getErrorMessage(saveError))
      setStatus('idle')
    }
  }

  async function saveFromTransactionEdit(currentDraft: TransactionDraft) {
    if (!editingTarget || editingTarget.kind !== 'transaction') {
      return
    }

    if (manualType === 'income' || expenseKind === 'variable') {
      await financeStore.updateTransaction(editingTarget.id, currentDraft)
      return
    }

    await financeStore.addFixedExpense({
      ...fixedExpense,
      name: expense.title,
      amount: expense.amount,
      category: expense.category,
      startsOn: fixedExpense.startsOn,
    })
    await financeStore.deleteTransaction(editingTarget.id)
  }

  async function saveFromFixedExpenseEdit(currentDraft: TransactionDraft) {
    if (!editingTarget || editingTarget.kind !== 'fixedExpense') {
      return
    }

    if (manualType === 'expense' && expenseKind === 'fixed') {
      await financeStore.updateFixedExpense(editingTarget.id, {
        ...fixedExpense,
        name: expense.title,
        amount: expense.amount,
        category: expense.category,
      }, fixedExpense.startsOn.slice(0, 7))
      return
    }

    await financeStore.addTransaction(currentDraft)
    await financeStore.deleteFixedExpense(editingTarget.id, fixedExpense.startsOn.slice(0, 7))
  }

  async function analyzeTicket(file: File) {
    setAddFlowMode('ticket')
    setTicketImageName(file.name)
    setIsAnalyzingTicket(true)
    setError(null)
    setDuplicateMatches([])
    setDuplicateConfirmationRequired(false)

    try {
      const imageDataUrl = await preprocessTicketFile(file)
      const result = await Tesseract.recognize(imageDataUrl, 'spa+eng', {
        logger: () => undefined,
      })
      const text = result.data.text
      setOcrPreview(text.trim())
      const localAnalysis = buildLocalTicketAnalysis(text, file.name)
      const finalAnalysis = shouldUseLocalTicketAnalysis(localAnalysis)
        ? localAnalysis
        : await analyzeTicketWithLlm(imageDataUrl, text, file.name)

      const amount = resolveTicketAmount(finalAnalysis.amount, text)
      const category = resolveTicketCategory(finalAnalysis.category, text)
      const title = resolveTicketTitle(finalAnalysis.title, finalAnalysis.merchantName, text)
      const ticketDate = resolveTicketDate(finalAnalysis.ticketDate, finalAnalysis.occurredOn, text)
      const occurredOn = ticketDate || todayLocalIso()
      const normalizedAnalysis = {
        ...finalAnalysis,
        title,
        category,
        amount,
        occurredOn,
        ticketDate,
        merchantName: finalAnalysis.merchantName?.trim() || title,
      }

      setTicketAnalysis(normalizedAnalysis)
      applyTicketAnalysisToExpense(normalizedAnalysis, file.name)
    } catch (analyzeError) {
      setError(getErrorMessage(analyzeError))
    } finally {
      setIsAnalyzingTicket(false)
    }
  }

  function startManualEntry() {
    setAddFlowMode('manual')
    setDuplicateMatches([])
    setDuplicateConfirmationRequired(false)
    setTicketAnalysis(null)
    setEditingTarget(null)
    setFixedExpense((current) => ({
      ...current,
      startsOn: `${effectiveFixedPeriod}-01`,
    }))
  }

  function applyTicketAnalysisToExpense(analysis: TicketAnalysis, fileName: string) {
    const title = analysis.title ?? 'Ticket importado'

    setManualType('expense')
    setExpenseKind('variable')
    setExpense({
      title,
      category: analysis.category ?? 'General',
      amount: analysis.amount ?? 0,
      type: 'expense',
      occurredOn: analysis.occurredOn || todayLocalIso(),
      notes: sanitizeTicketNotes(analysis),
      merchantName: analysis.merchantName ?? title,
      ticketDate: analysis.ticketDate,
      ticketFingerprint: analysis.fingerprint,
      sourceFileName: fileName,
    })
  }

  function openTransactionEditor(id: string) {
    const target = snapshot?.transactions.find((item) => item.id === id)
    if (!target) {
      return
    }

    setEditingTarget({ kind: 'transaction', id })
    setManualType(target.type)
    setExpenseKind('variable')
    setExpense({
      title: target.title,
      category: target.category,
      amount: target.amount,
      type: target.type,
      occurredOn: target.occurredOn,
      notes: target.notes,
      merchantName: target.merchantName,
      ticketDate: target.ticketDate,
      ticketFingerprint: target.ticketFingerprint,
      sourceFileName: target.sourceFileName,
    })
    setIncome({
      title: target.title,
      category: target.category,
      amount: target.amount,
      type: target.type,
      occurredOn: target.occurredOn,
      notes: target.notes,
      merchantName: target.merchantName,
      ticketDate: target.ticketDate,
      ticketFingerprint: target.ticketFingerprint,
      sourceFileName: target.sourceFileName,
    })
    setAddFlowMode('manual')
    setIsAddModalOpen(true)
    setDuplicateMatches([])
    setDuplicateConfirmationRequired(false)
  }

  function openFixedExpenseEditor(id: string) {
    const target = snapshot?.fixedExpenses.find((item) => item.id === id)
    if (!target) {
      return
    }

    setEditingTarget({ kind: 'fixedExpense', id })
    setManualType('expense')
    setExpenseKind('fixed')
    setExpense({
      title: target.name,
      category: target.category,
      amount: target.amount,
      type: 'expense',
      occurredOn: todayLocalIso(),
      notes: '',
    })
    setFixedExpense({
      name: target.name,
      category: target.category,
      amount: target.amount,
      dueDay: target.dueDay,
      ownerLabel: target.ownerLabel,
      isProrated: target.isProrated,
      startsOn: `${effectiveFixedPeriod}-01`,
    })
    setAddFlowMode('manual')
    setIsAddModalOpen(true)
    setDuplicateMatches([])
    setDuplicateConfirmationRequired(false)
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

  function toggleVariableExpenseInScenario(
    expense: Pick<Transaction, 'id' | 'title' | 'category' | 'amount'>,
  ) {
    const exists = scenario.expenseChanges.some(
      (item) =>
        item.changeType === 'remove_variable' &&
        item.label === expense.title &&
        item.category === expense.category &&
        item.amount === expense.amount,
    )

    setScenario((current) => ({
      ...current,
      expenseChanges: exists
        ? current.expenseChanges.filter(
            (item) =>
              !(
                item.changeType === 'remove_variable' &&
                item.label === expense.title &&
                item.category === expense.category &&
                item.amount === expense.amount
              ),
          )
        : [
            ...current.expenseChanges,
            {
              changeType: 'remove_variable',
              label: expense.title,
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
              label="Presupuesto real"
              value={currency(metrics.totalExpensesWithoutProrated)}
              tone="amber"
            />
            <MetricCard
              icon={<CalendarRange size={18} />}
              label="Anuales prorrateados"
              value={currency(metrics.visibleProratedExpenses)}
              tone="blue"
            />
            <MetricCard
              icon={<Scale size={18} />}
              label="Gasto total presupuestado"
              value={currency(metrics.totalExpenses)}
              tone="rose"
            />
            <MetricCard
              icon={<PiggyBank size={18} />}
              label="Saldo"
              value={currency(metrics.balance)}
              tone={metrics.balance >= 0 ? 'blue' : 'rose'}
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
                      <button className="ghost-button" type="button" onClick={() => openTransactionEditor(item.id)}>
                        <Pencil size={16} />
                      </button>
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
                <p className="scenario-helper">
                  Mostrando vigentes en {monthLabel(`${effectiveFixedPeriod}-01`)}. Editar o eliminar
                  afecta desde ese mes en adelante.
                </p>
                <div className="list-block compact-list">
                  {snapshot.fixedExpenses
                    .filter((item) => isFixedExpenseActiveForPeriod(item, effectiveFixedPeriod))
                    .map((item) => (
                    <article className="list-item" key={item.id}>
                      <div>
                        <strong>{item.name}</strong>
                        <p>
                          {item.category}
                          {item.ownerLabel ? ` · ${item.ownerLabel}` : ''} · día {item.dueDay}
                        </p>
                        <small>
                          Desde {monthLabel(item.startsOn)}
                          {item.endsOn ? ` hasta ${monthLabel(item.endsOn)}` : ''}
                        </small>
                        {item.isProrated ? <small>Prorrateado anual</small> : null}
                      </div>
                      <div className="item-actions">
                        <span className="pill neutral">{currency(item.amount)}</span>
                        <button className="ghost-button" type="button" onClick={() => openFixedExpenseEditor(item.id)}>
                          <Pencil size={16} />
                        </button>
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
                    {snapshot.fixedExpenses
                      .filter((expense) => isFixedExpenseActiveForPeriod(expense, scenarioBasePeriod))
                      .map((expense) => {
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
                  <h3>Gastos variables que sacarías</h3>
                  <div className="check-list scroll-check-list">
                    {snapshot.transactions
                      .filter(
                        (expense) =>
                          expense.type === 'expense' &&
                          expense.occurredOn.startsWith(scenarioBasePeriod),
                      )
                      .map((expense) => {
                        const checked = scenario.expenseChanges.some(
                          (item) =>
                            item.changeType === 'remove_variable' &&
                            item.label === expense.title &&
                            item.category === expense.category &&
                            item.amount === expense.amount,
                        )

                        return (
                          <label className="check-item check-card" key={expense.id}>
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => toggleVariableExpenseInScenario(expense)}
                            />
                            <span>
                              {expense.title}
                              <small>
                                {expense.category} · {currency(expense.amount)}
                              </small>
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
                          : item.changeType === 'remove_variable'
                            ? 'gasto variable que desaparece'
                          : item.changeType === 'add_fixed'
                            ? 'nuevo gasto fijo'
                            : 'nuevo gasto variable'}
                      </p>
                    </div>
                    <div className="item-actions">
                      <span
                        className={
                          item.changeType === 'remove_fixed' || item.changeType === 'remove_variable'
                            ? 'pill positive'
                            : 'pill negative'
                        }
                      >
                        {item.changeType === 'remove_fixed' || item.changeType === 'remove_variable'
                          ? '-'
                          : '+'}
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
                <>
                  <section className="scenario-preview">
                    <MetricCard
                      icon={<TrendingUp size={18} />}
                      label="Ingreso proyectado"
                      value={currency(scenarioPreview.projectedIncome)}
                      tone="emerald"
                    />
                    <MetricCard
                      icon={<Filter size={18} />}
                      label="Presupuesto real proyectado"
                      value={currency(scenarioPreview.projectedExpensesWithoutProrated)}
                      tone="amber"
                    />
                    <MetricCard
                      icon={<CalendarRange size={18} />}
                      label="Prorrateados incluidos"
                      value={currency(scenarioPreview.baseProratedFixedExpenses)}
                      tone="blue"
                    />
                    <MetricCard
                      icon={<PiggyBank size={18} />}
                      label="Balance proyectado"
                      value={currency(scenarioPreview.projectedBalance)}
                      tone={scenarioPreview.projectedBalance >= 0 ? 'blue' : 'rose'}
                    />
                  </section>

                  <section className="scenario-box">
                    <h3>Cómo se calcula el gasto proyectado</h3>
                    <dl className="scenario-breakdown">
                      <div>
                        <dt>Fijos mensuales base</dt>
                        <dd>{currency(scenarioPreview.baseCoreFixedExpenses)}</dd>
                      </div>
                      <div>
                        <dt>Variables del mes base</dt>
                        <dd>{currency(scenarioPreview.baseVariableExpenses)}</dd>
                      </div>
                      <div>
                        <dt>Fijos que se eliminan</dt>
                        <dd>-{currency(scenarioPreview.removedFixedTotal)}</dd>
                      </div>
                      <div>
                        <dt>Variables que se eliminan</dt>
                        <dd>-{currency(scenarioPreview.removedVariableTotal)}</dd>
                      </div>
                      <div>
                        <dt>Fijos que se agregan</dt>
                        <dd>+{currency(scenarioPreview.addedFixedTotal)}</dd>
                      </div>
                      <div>
                        <dt>Variables que se agregan</dt>
                        <dd>+{currency(scenarioPreview.addedVariableTotal)}</dd>
                      </div>
                      <div>
                        <dt>Prorrateados anuales</dt>
                        <dd>+{currency(scenarioPreview.baseProratedFixedExpenses)}</dd>
                      </div>
                      <div>
                        <dt>Total proyectado</dt>
                        <dd>{currency(scenarioPreview.projectedExpenses)}</dd>
                      </div>
                    </dl>
                  </section>
                </>
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
                <article
                  className="scenario-card clickable-card"
                  key={item.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedScenario(item)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setSelectedScenario(item)
                    }
                  }}
                >
                  <div className="scenario-top">
                    <div>
                      <h3>{item.name}</h3>
                      <p>{item.notes || 'Sin notas adicionales.'}</p>
                    </div>
                    <button
                      className="ghost-button"
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation()
                        void removeScenario(item.id)
                      }}
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
                      <dt>Ingreso ajustado</dt>
                      <dd>{currency(item.projectedIncome)}</dd>
                    </div>
                    <div>
                      <dt>Gasto ajustado</dt>
                      <dd>{currency(item.projectedExpenses)}</dd>
                    </div>
                  </dl>
                  <div className="scenario-tag-list">
                    {item.expenseChanges.map((change) => (
                      <span className="badge small-badge" key={change.id}>
                        {change.changeType === 'remove_fixed' || change.changeType === 'remove_variable'
                          ? 'Sale'
                          : 'Suma'}
                        : {change.label}
                      </span>
                    ))}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </section>
      )}

      {selectedScenario ? (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal-card">
            <div className="panel-heading">
              <div>
                <p className="section-kicker">Escenario</p>
                <h2>{selectedScenario.name}</h2>
              </div>
              <button className="ghost-button" type="button" onClick={() => setSelectedScenario(null)}>
                <Trash2 size={16} />
              </button>
            </div>

            <div className="scenario-preview detail-preview">
              <MetricCard
                icon={<TrendingUp size={18} />}
                label="Ingreso proyectado"
                value={currency(selectedScenario.projectedIncome)}
                tone="emerald"
              />
              <MetricCard
                icon={<Filter size={18} />}
                label="Gasto proyectado"
                value={currency(selectedScenario.projectedExpenses)}
                tone="amber"
              />
              <MetricCard
                icon={<PiggyBank size={18} />}
                label="Balance proyectado"
                value={currency(selectedScenario.projectedBalance)}
                tone={selectedScenario.projectedBalance >= 0 ? 'blue' : 'rose'}
              />
            </div>

            <div className="stack-form">
              <div className="scenario-box">
                <h3>Notas</h3>
                <p className="muted">{selectedScenario.notes || 'Sin notas adicionales.'}</p>
              </div>

              <div className="scenario-box">
                <h3>Movimientos del escenario</h3>
                <div className="list-block compact-list">
                  {selectedScenario.expenseChanges.length > 0 ? (
                    selectedScenario.expenseChanges.map((change) => (
                      <article className="list-item" key={change.id}>
                        <div>
                          <strong>{change.label}</strong>
                          <p>
                            {change.category} ·{' '}
                            {change.changeType === 'remove_fixed'
                              ? 'sale del presupuesto fijo'
                              : change.changeType === 'remove_variable'
                                ? 'sale del presupuesto variable'
                                : change.changeType === 'add_fixed'
                                  ? 'nuevo gasto fijo'
                                  : 'nuevo gasto variable'}
                          </p>
                        </div>
                        <div className="item-actions">
                          <span
                            className={
                              change.changeType === 'remove_fixed' || change.changeType === 'remove_variable'
                                ? 'pill positive'
                                : 'pill negative'
                            }
                          >
                            {change.changeType === 'remove_fixed' || change.changeType === 'remove_variable'
                              ? '-'
                              : '+'}
                            {currency(change.amount)}
                          </span>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="muted">Este escenario no tiene cambios cargados.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}

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
                  <span>Abre la cámara del celu y analiza la foto del ticket.</span>
                </label>

                <label className="upload-card">
                  <input
                    className="hidden-input"
                    type="file"
                    accept="image/*,application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      if (file) {
                        void analyzeTicket(file)
                      }
                    }}
                  />
                  <FileImage size={24} />
                  <strong>Subir JPG, PNG o PDF</strong>
                  <span>Elegís un archivo ya guardado sin abrir la cámara.</span>
                </label>

                <button className="upload-card button-card" type="button" onClick={startManualEntry}>
                  <CirclePlus size={24} />
                  <strong>Agregar manualmente</strong>
                  <span>Elegís si es ingreso o gasto y después si ese gasto es fijo o variable.</span>
                </button>
              </div>
            ) : null}

            {addFlowMode !== 'menu' ? (
              <form className="stack-form" onSubmit={submitAddFlow}>
                {isAnalyzingTicket ? <p className="scenario-helper">Analizando ticket...</p> : null}
                {ticketImageName ? <p className="scenario-helper">Archivo: {ticketImageName}</p> : null}

                {ticketAnalysis ? (
                  <div className="ticket-summary">
                    <p className="section-kicker">Lectura sugerida</p>
                    <strong>{ticketAnalysis.title || 'Ticket analizado'}</strong>
                    <p>
                      {ticketAnalysis.merchantName || 'Comercio sin detectar'} ·{' '}
                      {ticketAnalysis.ticketDate || 'fecha no detectada'} ·{' '}
                      {currency(ticketAnalysis.amount ?? 0)}
                    </p>
                    {ticketAnalysis.analysisSource === 'ocr_fallback' ? (
                      <p className="scenario-helper">
                        Lectura rápida por OCR. Revisá monto y rubro antes de guardar.
                      </p>
                    ) : null}
                    {ticketAnalysis.analysisSource === 'local_fast' ? (
                      <p className="scenario-helper">
                        Lectura local sin IA. Solo se usa el modelo si faltan datos clave.
                      </p>
                    ) : null}
                    {ticketAnalysis.items?.length ? (
                      <div className="ticket-items">
                        {ticketAnalysis.items.slice(0, 6).map((item, index) => (
                          <span className="badge small-badge" key={`${item.description}-${index}`}>
                            {item.description}
                            {item.amount ? ` · ${currency(item.amount)}` : ''}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                ) : null}

                {duplicateMatches.length > 0 ? (
                  <section className="alert duplicate-alert">
                    <AlertTriangle size={18} />
                    <div>
                      <strong>Este ticket parece ya cargado.</strong>
                      {duplicateMatches.map((match) => (
                        <p key={match.id}>
                          {match.title} · {currency(match.amount)} · {monthLabel(match.occurredOn)}
                          {match.merchantName ? ` · ${match.merchantName}` : ''}
                        </p>
                      ))}
                    </div>
                  </section>
                ) : null}

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
                    <>
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
                      <label>
                        Aplicar desde
                        <input
                          type="month"
                          value={fixedExpense.startsOn.slice(0, 7)}
                          onChange={(event) =>
                            setFixedExpense((current) => ({
                              ...current,
                              startsOn: `${event.target.value}-01`,
                            }))
                          }
                          required
                        />
                      </label>
                    </>
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
                    <label className="check-item">
                      <input
                        type="checkbox"
                        checked={fixedExpense.isProrated}
                        onChange={(event) =>
                          setFixedExpense((current) => ({
                            ...current,
                            isProrated: event.target.checked,
                          }))
                        }
                      />
                      <span>Es un gasto anual prorrateado</span>
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
                  {duplicateMatches.length > 0 && !duplicateConfirmationRequired ? (
                    <button
                      className="secondary-button warning-button"
                      type="button"
                      onClick={() => void persistEntry(true)}
                    >
                      Guardar igual
                    </button>
                  ) : null}
                  <button
                    className={`primary-button ${duplicateConfirmationRequired ? 'warning-button' : ''}`}
                    type="button"
                    disabled={status !== 'idle' || isAnalyzingTicket}
                    onClick={() =>
                      void persistEntry(duplicateConfirmationRequired)
                    }
                  >
                    <Plus size={16} />{' '}
                    {duplicateConfirmationRequired
                      ? 'Confirmar y guardar igual'
                      : editingTarget
                        ? 'Actualizar'
                        : 'Guardar'}
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

function resolveTicketAmount(modelAmount: number | undefined, text: string) {
  const extracted = extractAmountCandidate(text)

  if (
    typeof modelAmount === 'number' &&
    Number.isFinite(modelAmount) &&
    modelAmount > 0 &&
    !shouldReplaceModelAmount(modelAmount, extracted)
  ) {
    return Math.round(modelAmount)
  }

  return extracted.isReliable ? extracted.amount : 0
}

function buildLocalTicketAnalysis(text: string, sourceFileName: string): TicketAnalysis {
  const amountCandidate = extractAmountCandidate(text)
  const title = inferTitle(text)
  const ticketDate = extractTicketDate(text)
  const category = inferCategory(text)

  return {
    merchantName: title,
    title,
    category,
    amount: amountCandidate.isReliable ? amountCandidate.amount : 0,
    occurredOn: ticketDate || '',
    ticketDate,
    notes: '',
    analysisSource: 'local_fast',
    sourceFileName,
    items: [],
  }
}

function shouldUseLocalTicketAnalysis(analysis: TicketAnalysis) {
  const hasAmount = typeof analysis.amount === 'number' && analysis.amount > 0
  const hasDate = Boolean(analysis.ticketDate)
  const hasMerchant = Boolean(analysis.merchantName && analysis.merchantName.length >= 4)

  return hasAmount && hasDate && hasMerchant
}

function shouldReplaceModelAmount(
  modelAmount: number,
  extracted: { amount: number; isReliable: boolean },
) {
  if (!extracted.isReliable || !extracted.amount || extracted.amount <= 0) {
    return false
  }

  if (modelAmount <= 0) {
    return true
  }

  if (modelAmount < extracted.amount / 10) {
    return true
  }

  if (modelAmount < 100 && extracted.amount >= 1000) {
    return true
  }

  return false
}

function extractAmountCandidate(text: string) {
  const lines = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  let best = { amount: 0, score: Number.NEGATIVE_INFINITY, line: '' }

  for (const [index, line] of lines.entries()) {
    const candidates = line.match(/\d[\d., ]*\d|\d/g) ?? []

    for (const candidate of candidates) {
      const amount = parseLocalizedAmount(candidate)
      if (!Number.isFinite(amount) || amount <= 0 || amount > 1000000) {
        continue
      }

      const score = scoreAmountCandidate(line, amount, index)
      if (score > best.score || (score === best.score && amount > best.amount)) {
        best = { amount, score, line }
      }
    }
  }

  const hasTotalSignal = /(total|importe|a pagar|saldo|total \$|total:|total uyu|total pagado)/.test(
    best.line.toLowerCase(),
  )
  const isReliable = best.amount > 0 && (hasTotalSignal || best.score >= 80)

  return {
    amount: best.amount > 0 ? best.amount : 0,
    isReliable,
  }
}

function parseLocalizedAmount(raw: string) {
  const value = raw.replace(/\s+/g, '').trim()
  if (!value) {
    return 0
  }

  const hasComma = value.includes(',')
  const hasDot = value.includes('.')
  let normalized = value

  if (hasComma && hasDot) {
    const decimalSeparator = value.lastIndexOf(',') > value.lastIndexOf('.') ? ',' : '.'
    if (decimalSeparator === ',') {
      normalized = value.replace(/\./g, '').replace(',', '.')
    } else {
      normalized = value.replace(/,/g, '')
    }
  } else if (hasComma) {
    normalized = /,\d{2}$/.test(value) ? value.replace(/\./g, '').replace(',', '.') : value.replace(/,/g, '')
  } else if (hasDot) {
    if (/\.\d{2}$/.test(value) && (value.match(/\./g)?.length ?? 0) === 1) {
      normalized = value
    } else {
      normalized = value.replace(/\./g, '')
    }
  }

  const parsed = Number(normalized)
  if (!Number.isFinite(parsed)) {
    return 0
  }

  return Math.round(parsed)
}

function scoreAmountCandidate(line: string, amount: number, index: number) {
  const lower = line.toLowerCase()
  let score = amount / 1000

  if (/(total|importe|a pagar|total \$|total:|saldo|efectivo|tarjeta)/.test(lower)) {
    score += 100
  }

  if (/(subtotal)/.test(lower)) {
    score += 30
  }

  if (/(iva|descuento|recargo)/.test(lower)) {
    score -= 20
  }

  if (/\bx\b|\d+\s*x\s*\d+/.test(lower)) {
    score -= 45
  }

  if (/^\d+\//.test(lower)) {
    score -= 20
  }

  if (/(rut|r\.u\.t|autoriz|caja|serie|factura|ticket nro|comprobante|cliente|terminal|lote)/.test(lower)) {
    score -= 60
  }

  score += index * 0.5
  return score
}

function resolveTicketCategory(modelCategory: string | undefined, text: string) {
  const normalizedModelCategory = modelCategory?.trim()
  const inferredCategory = inferCategory(text)

  if (!normalizedModelCategory) {
    return inferredCategory
  }

  if (normalizedModelCategory.toLowerCase() === 'general' && inferredCategory !== 'General') {
    return inferredCategory
  }

  return normalizedModelCategory
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

function resolveTicketTitle(
  modelTitle: string | undefined,
  merchantName: string | undefined,
  text: string,
) {
  const normalizedTitle = modelTitle?.trim()
  if (normalizedTitle) {
    return normalizedTitle
  }

  const normalizedMerchant = merchantName?.trim()
  if (normalizedMerchant) {
    return normalizedMerchant
  }

  return inferTitle(text)
}

function resolveTicketDate(
  modelTicketDate: string | undefined,
  modelOccurredOn: string | undefined,
  text: string,
) {
  const normalizedModelTicketDate = normalizeTicketDate(modelTicketDate)
  if (normalizedModelTicketDate) {
    return normalizedModelTicketDate
  }

  const normalizedModelOccurredOn = normalizeTicketDate(modelOccurredOn)
  if (normalizedModelOccurredOn) {
    return normalizedModelOccurredOn
  }

  return extractTicketDate(text)
}

function sanitizeTicketNotes(ticketAnalysis: TicketAnalysis) {
  if (ticketAnalysis.analysisSource === 'ocr_fallback') {
    return ''
  }

  return ticketAnalysis.notes?.trim() ?? ''
}

function isFixedExpenseActiveForPeriod(
  expense: Pick<FixedExpense, 'startsOn' | 'endsOn'>,
  period: string,
) {
  const periodStart = `${period}-01`
  const periodEnd = `${period}-31`
  const endsOn = expense.endsOn ?? '9999-12-31'

  return expense.startsOn <= periodEnd && endsOn >= periodStart
}

function normalizeTicketDate(value: string | undefined) {
  const trimmed = value?.trim()
  if (!trimmed) {
    return ''
  }

  const isoMatch = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (isoMatch) {
    return trimmed
  }

  const latinMatch = trimmed.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/)
  if (!latinMatch) {
    return ''
  }

  const day = latinMatch[1].padStart(2, '0')
  const month = latinMatch[2].padStart(2, '0')
  const year = latinMatch[3].length === 2 ? `20${latinMatch[3]}` : latinMatch[3]
  return `${year}-${month}-${day}`
}

function extractTicketDate(text: string) {
  const candidates = [...text.matchAll(/\b(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})\b/g)]

  for (const candidate of candidates) {
    const day = Number(candidate[1])
    const month = Number(candidate[2])
    const year = Number(candidate[3].length === 2 ? `20${candidate[3]}` : candidate[3])

    if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2020 || year > 2100) {
      continue
    }

    return `${String(year)}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
  }

  return ''
}

async function preprocessTicketFile(file: File) {
  if (file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')) {
    return renderPdfFirstPage(file)
  }

  return preprocessTicketImage(file)
}

async function preprocessTicketImage(file: File) {
  const imageBitmap = await createImageBitmap(file)
  const scale = Math.min(2200 / imageBitmap.width, 2200 / imageBitmap.height, 1.8)
  const width = Math.max(1, Math.round(imageBitmap.width * scale))
  const height = Math.max(1, Math.round(imageBitmap.height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No se pudo preparar la imagen del ticket.')
  }

  context.drawImage(imageBitmap, 0, 0, width, height)
  const imageData = context.getImageData(0, 0, width, height)
  const data = imageData.data

  for (let index = 0; index < data.length; index += 4) {
    const avg = (data[index] + data[index + 1] + data[index + 2]) / 3
    const boosted = avg > 185 ? 255 : avg < 110 ? 0 : avg
    data[index] = boosted
    data[index + 1] = boosted
    data[index + 2] = boosted
  }

  context.putImageData(imageData, 0, 0)
  return canvas.toDataURL('image/jpeg', 0.92)
}

async function renderPdfFirstPage(file: File) {
  const bytes = new Uint8Array(await file.arrayBuffer())
  const pdf = await pdfjsLib.getDocument({ data: bytes }).promise
  const page = await pdf.getPage(1)
  const viewport = page.getViewport({ scale: 2 })
  const canvas = document.createElement('canvas')
  const context = canvas.getContext('2d')

  if (!context) {
    throw new Error('No se pudo renderizar el PDF del ticket.')
  }

  canvas.width = viewport.width
  canvas.height = viewport.height

  await page.render({
    canvas,
    canvasContext: context,
    viewport,
  }).promise

  return canvas.toDataURL('image/jpeg', 0.92)
}

async function analyzeTicketWithLlm(
  imageDataUrl: string,
  ocrText: string,
  sourceFileName: string,
): Promise<TicketAnalysis> {
  const response = await fetch('/.netlify/functions/analyze-ticket', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      imageDataUrl,
      ocrText,
      sourceFileName,
    }),
  })

  if (!response.ok) {
    throw new Error('No se pudo analizar el ticket con el modelo.')
  }

  return (await response.json()) as TicketAnalysis
}

export default App
