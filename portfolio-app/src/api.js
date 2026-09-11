// Configurable API root: use VITE_API_ROOT if provided; otherwise use relative.
// In dev, Vite proxies /api to the Node server (see vite.config.js), avoiding CORS.
// In production, the Node server serves the frontend and /api from the same origin.
const API_ROOT = import.meta.env.VITE_API_ROOT?.trim() || ''

async function json(method, path, body) {
  const r = await fetch(`${API_ROOT}${path}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await r.json().catch(() => ({}))
  if (!r.ok) throw new Error(data.error || r.statusText)
  return data
}

// Failures in the resilient helpers below are swallowed so the UI can't crash, but
// swallowing them silently meant a dead backend looked like an empty portfolio.
// The app registers a reporter here and shows a banner / toast instead.
let errorReporter = null
export function onApiError(fn) { errorReporter = fn }
function report(path, message) {
  try { errorReporter?.({ path, message }) } catch (_) {}
}

// Resilient GET helpers for endpoints whose result shape the UI relies on.
// A failed request (network error, 4xx/5xx, or a JSON error object) must NEVER
// leak a non-array/non-object back to the UI — otherwise `.map` etc. crash the app.
async function getArr(path) {
  try {
    const r = await fetch(`${API_ROOT}${path}`)
    if (!r.ok) { report(path, `${r.status} ${r.statusText}`); return [] }
    const d = await r.json().catch(() => [])
    if (!Array.isArray(d)) { report(path, d?.error || 'unexpected response'); return [] }
    return d
  } catch (e) { report(path, e.message); return [] }
}
async function getObj(path) {
  try {
    const r = await fetch(`${API_ROOT}${path}`)
    if (!r.ok) { report(path, `${r.status} ${r.statusText}`); return {} }
    const d = await r.json().catch(() => ({}))
    if (!d || typeof d !== 'object' || Array.isArray(d)) { report(path, 'unexpected response'); return {} }
    if (d.error) { report(path, d.error); return {} }
    return d
  } catch (e) { report(path, e.message); return {} }
}

export const api = {
  getPortfolio: () => json('GET', '/api/portfolio'),
  savePortfolio: (p) => json('POST', '/api/portfolio', p),
  addDivision: (d) => json('POST', '/api/divisions', d),
  updateDivision: (id, p) => json('PATCH', `/api/divisions/${id}`, p),
  deleteDivision: (id) => json('DELETE', `/api/divisions/${id}`),
  addSubdivision: (id, sd) => json('POST', `/api/divisions/${id}/subdivisions`, sd),
  updateSubdivision: (sid, p) => json('PATCH', `/api/subdivisions/${sid}`, p),
  deleteSubdivision: (sid) => json('DELETE', `/api/subdivisions/${sid}`),
  addHolding: (id, h) => json('POST', `/api/divisions/${id}/holdings`, h),
  updateHolding: (hid, h) => json('PATCH', `/api/holdings/${hid}`, h),
  deleteHolding: (hid) => json('DELETE', `/api/holdings/${hid}`),
  refreshHoldingPrice: (hid) => json('POST', `/api/holdings/${hid}/refresh-price`),
  // These three feed the whole dashboard. A 5xx used to resolve to `{error: "..."}`,
  // which the UI then rendered as zeros with no sign anything had failed. Now the
  // shape is guaranteed and the failure is reported through onApiError.
  analytics: (budget) => getObj(`/api/portfolio/analytics${budget !== undefined ? `?budget=${encodeURIComponent(budget)}` : ''}`),
  subdivisionGoalSeek: () => getObj('/api/subdivision-goal-seek'),
  // Three-level goal seek (division → subdivision → holding) and its sell-allowed twin.
  goalSeek: (budget) => getObj(`/api/goal-seek${budget ? `?budget=${encodeURIComponent(budget)}` : ''}`),
  rebalancePlan: (budget) => getObj(`/api/rebalance-plan${budget ? `?budget=${encodeURIComponent(budget)}` : ''}`),
  setTargets: (payload) => json('POST', '/api/targets', payload),
  getExpenses: () => getArr('/api/expenses'),
  addExpense: (exp) => json('POST', '/api/expenses', exp),
  deleteExpense: (id) => json('DELETE', `/api/expenses/${id}`),
  saveMonthExpenses: (year, month, entries) => json('POST', '/api/expenses/month', { year, month, entries }),
  getCategories: () => fetch(`${API_ROOT}/api/categories`).then(r => r.json()),
  addCategory: (type, name) => json('POST', `/api/categories/${type}`, { name }),
  deleteCategory: (type, name) => json('DELETE', `/api/categories/${type}/${encodeURIComponent(name)}`),
  quotes: (symbols = []) => getObj(`/api/quotes?symbols=${encodeURIComponent(symbols.join(','))}`),
  mfSearch: (q) => getArr(`/api/mf/search?q=${encodeURIComponent(q)}`),
  mfNav: (codes = []) => getObj(`/api/mf/nav?codes=${encodeURIComponent(codes.join(','))}`),
  stockSearch: (q) => getArr(`/api/stock/search?q=${encodeURIComponent(q)}`),
  refreshAll: () => json('POST', '/api/holdings/refresh-all'),
  // Bank cash — separate from the investment portfolio, never part of allocation %.
  getBankAccounts: () => getObj('/api/bank-accounts'),
  addBankAccount: (a) => json('POST', '/api/bank-accounts', a),
  updateBankAccount: (id, a) => json('PATCH', `/api/bank-accounts/${id}`, a),
  deleteBankAccount: (id) => json('DELETE', `/api/bank-accounts/${id}`),
  // Broker ledgers — deposits, booked P&L, charges and dividends per broker.
  getBrokers: () => getObj('/api/brokers'),
  addBroker: (b) => json('POST', '/api/brokers', b),
  updateBroker: (id, b) => json('PATCH', `/api/brokers/${id}`, b),
  deleteBroker: (id) => json('DELETE', `/api/brokers/${id}`),
  setBrokerAmounts: (amounts) => json('POST', '/api/brokers/amounts', { amounts }),
  portfolioOverlap: () => fetch(`${API_ROOT}/api/portfolio/overlap`).then(r => r.json()),
  getExchangeRate: (currency) => fetch(`${API_ROOT}/api/exchange-rate/${encodeURIComponent(currency)}`).then(r => r.json()),

  // Export / backup / restore
  exportUrl: (kind) => `${API_ROOT}${kind === 'excel' ? '/api/export/excel' : kind === 'csv' ? '/api/export/csv' : '/api/backup'}`,
  backupSummary: () => getObj('/api/backup/summary'),
  restoreBackup: (backup) => json('POST', '/api/backup/restore', { backup, confirm: true }),
}
