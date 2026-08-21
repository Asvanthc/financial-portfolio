// Shared money / percent formatting.
//
// Each component used to carry its own `fmt`, and they disagreed on negatives:
// some produced "₹-1.50Cr" (sign wedged after the symbol), some "-₹1.50Cr". One
// place to fix it, one behaviour everywhere.

// Compact Indian-style money: ₹1.23Cr / ₹4.5L / ₹12,345, sign always leading.
export function money(n, { decimals } = {}) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  const abs = Math.abs(v)
  const sign = v < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(decimals ?? 2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(decimals ?? 2)}L`
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`
}

// Money with an explicit + for gains, for P/L style figures.
export function signedMoney(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${v > 0 ? '+' : ''}${money(v)}`
}

// Full rupee value, no Cr/L shortening — for inputs and tooltips.
export function rupees(n) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${v < 0 ? '-' : ''}₹${Math.abs(Math.round(v)).toLocaleString('en-IN')}`
}

export function percent(n, digits = 1) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${v.toFixed(digits)}%`
}

export function signedPercent(n, digits = 2) {
  const v = Number(n)
  if (!Number.isFinite(v)) return '—'
  return `${v >= 0 ? '+' : ''}${v.toFixed(digits)}%`
}

// "2 minutes ago" / "just now" — for the last-synced hint.
export function timeAgo(iso) {
  if (!iso) return null
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return null
  const secs = Math.max(0, Math.round((Date.now() - then) / 1000))
  if (secs < 45) return 'just now'
  const mins = Math.round(secs / 60)
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.round(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  const days = Math.round(hrs / 24)
  return days === 1 ? 'yesterday' : `${days}d ago`
}
