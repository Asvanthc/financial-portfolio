// Use relative URLs in production, absolute in development
const API_ROOT = import.meta.env.PROD ? '' : 'http://localhost:3001'

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
  analytics: (budget) => fetch(`${API_ROOT}/api/portfolio/analytics${budget!==undefined?`?budget=${encodeURIComponent(budget)}`:''}`).then(r=>r.json()),
  subdivisionGoalSeek: () => fetch(`${API_ROOT}/api/subdivision-goal-seek`).then(r=>r.json()),
}
