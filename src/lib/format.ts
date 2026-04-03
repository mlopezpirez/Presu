export function currency(value: number) {
  return new Intl.NumberFormat('es-UY', {
    style: 'currency',
    currency: 'UYU',
    maximumFractionDigits: 0,
  }).format(value)
}

export function monthLabel(dateInput: string) {
  return new Intl.DateTimeFormat('es-UY', {
    month: 'short',
    year: 'numeric',
  }).format(new Date(dateInput))
}
