export function currency(value: number) {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 0,
  }).format(value)
}

export function parseDateInput(dateInput: string) {
  const [year, month, day] = dateInput.split('-').map(Number)

  if (
    Number.isFinite(year) &&
    Number.isFinite(month) &&
    Number.isFinite(day) &&
    year > 0 &&
    month > 0 &&
    day > 0
  ) {
    return new Date(year, month - 1, day)
  }

  return new Date(dateInput)
}

export function monthLabel(dateInput: string) {
  return new Intl.DateTimeFormat('es-UY', {
    month: 'short',
    year: 'numeric',
  }).format(parseDateInput(dateInput))
}

export function todayLocalIso() {
  const now = new Date()
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')

  return `${year}-${month}-${day}`
}
