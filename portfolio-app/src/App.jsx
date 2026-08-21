import React, { useEffect, useState } from 'react'
import { api, onApiError } from './api'
import { money, signedMoney, signedPercent } from './format'
import { toast } from './toast'
import ToastHost from './components/ToastHost'
import DataManager from './components/DataManager'
import DivisionCard from './components/DivisionCard'
import PortfolioCharts from './components/PortfolioCharts'
import AddDivisionForm from './components/AddDivisionForm'
import MonthlyPlanner from './components/MonthlyPlanner'
import DeepAnalytics from './components/DeepAnalytics'
import ExpenseTracker from './components/ExpenseTracker'
import FIRECalculator from './components/FIRECalculator'
import OverlapAnalysis from './components/OverlapAnalysis'
import BulkPriceEditor from './components/BulkPriceEditor'
import BankSection from './components/BankSection'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'analytics', label: 'Analytics' },
  { id: 'overlap', label: 'Overlap' },
  { id: 'expenses', label: 'Expenses' },
  { id: 'fire', label: 'FIRE' },
  { id: 'planner', label: 'Planner' },
]

const fmt = money
const pct = signedPercent

export default function App() {
  const [portfolio, setPortfolio] = useState({ divisions: [] })
  const [analytics, setAnalytics] = useState({ totals: { invested: 0, current: 0, profit: 0 }, divisions: [] })
  const [subdivisionGoalSeek, setSubdivisionGoalSeek] = useState({})
  const [budget, setBudget] = useState('')
  const [showAddDivision, setShowAddDivision] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')
  const [expenses, setExpenses] = useState([])
  const [syncing, setSyncing] = useState(false)
  const [syncResult, setSyncResult] = useState(null)
  const [showBulkPrices, setShowBulkPrices] = useState(false)
  const [showData, setShowData] = useState(false)
  const [bank, setBank] = useState({ accounts: [], total: 0 })
  const [loading, setLoading] = useState(true)      // first paint only
  const [refreshing, setRefreshing] = useState(false)
  const [apiError, setApiError] = useState(null)

  // The resilient api helpers can't throw, so they report failures here instead —
  // otherwise a dead backend renders as a portfolio full of zeros.
  useEffect(() => {
    onApiError(({ path, message }) => setApiError({ path, message }))
    return () => onApiError(null)
  }, [])

  async function refreshAll() {
    setRefreshing(true)
    setApiError(null)
    try {
      const [p, a, sgs, exp, bk] = await Promise.all([
        api.getPortfolio(),
        api.analytics(budget || undefined),
        api.subdivisionGoalSeek(),
        api.getExpenses(),
        api.getBankAccounts(),
      ])
      setPortfolio(p)
      setAnalytics(a)
      setSubdivisionGoalSeek(sgs)
      setExpenses(exp)
      setBank({ accounts: Array.isArray(bk.accounts) ? bk.accounts : [], total: Number(bk.total) || 0 })
    } catch (e) {
      setApiError({ path: '/api/portfolio', message: e.message })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  async function syncAllPrices() {
    setSyncing(true)
    setSyncResult(null)
    try {
      const result = await api.refreshAll()
      setSyncResult({ ...result, at: new Date().toISOString() })
      await refreshAll()
      if (result.updated > 0 && !result.failed && !result.suspicious?.length) {
        toast.success(`${result.updated} price${result.updated === 1 ? '' : 's'} updated`)
      } else if (!result.updated && !result.failed) {
        toast.info('Nothing to price', { detail: 'No holding has a ticker or scheme code yet.' })
      }
    } catch (e) {
      setSyncResult({ error: e.message })
      toast.error('Price sync failed', { detail: e.message })
    } finally {
      setSyncing(false)
    }
  }

  // One effect, not two: the mount render already runs this, so a second
  // mount-only effect just doubled every page load's requests.
  useEffect(() => { refreshAll() }, [budget])

  const { invested: totalInvested = 0, current: totalCurrent = 0, profit: totalProfit = 0 } = analytics.totals || {}
  const minRequired = analytics.requiredTotalAddition || 0
  const returnPct = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0

  return (
    <div className="app-shell">
      {/* Header */}
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-title">Fin<span>Folio</span></div>
          <nav className="tab-nav">
            {TABS.map(t => (
              <button key={t.id} className={`tab-btn${activeTab === t.id ? ' active' : ''}`} onClick={() => setActiveTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>
          <div className="header-actions">
            {refreshing && !loading && <span className="header-hint" aria-live="polite">updating…</span>}
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowData(true)}
              title="Export an Excel workbook, a CSV, or a JSON backup — and restore from one"
            >
              <span aria-hidden="true">⇩</span> <span className="btn-label">Export</span>
            </button>
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowBulkPrices(true)}
              title="Manually set prices for all holdings"
            >
              <span aria-hidden="true">✏</span> <span className="btn-label">Prices</span>
            </button>
            <button
              className="btn btn-sm btn-sync"
              style={{ background: syncing ? 'var(--surface2)' : 'var(--indigo)', color: '#fff' }}
              onClick={syncAllPrices}
              disabled={syncing}
            >
              <span className={syncing ? 'spin' : ''} aria-hidden="true">⟳</span>{' '}
              <span className="btn-label">{syncing ? 'Syncing…' : 'Sync All'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="app-content">
        {/* A dead or erroring backend used to render as a portfolio full of zeros */}
        {apiError && (
          <div className="banner banner-error" role="alert">
            <span aria-hidden="true">⚠</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>Couldn't load some data.</strong>{' '}
              <span className="text-muted">{apiError.path} — {apiError.message}.</span>{' '}
              <span className="text-dim">Figures below may be incomplete.</span>
            </div>
            <button className="btn btn-sm btn-secondary" onClick={refreshAll} disabled={refreshing}>
              {refreshing ? 'Retrying…' : 'Retry'}
            </button>
            <button className="btn-icon" aria-label="Dismiss" onClick={() => setApiError(null)}>✕</button>
          </div>
        )}

        {/* Sync results get their own panel — the names and sources used to be
            buried in a title tooltip nobody hovers */}
        {syncResult && !syncResult.error && (syncResult.failed > 0 || syncResult.suspicious?.length > 0) && (
          <div className="banner banner-warn" role="status">
            <span aria-hidden="true">⚠</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <strong>
                Priced {syncResult.updated} of {syncResult.total}
                {syncResult.bySource && Object.keys(syncResult.bySource).length
                  ? ` (${Object.entries(syncResult.bySource).map(([s, n]) => `${n} via ${s}`).join(', ')})`
                  : ''}
                .
              </strong>
              {syncResult.failed > 0 && (
                <div className="text-sm" style={{ color: 'var(--red)', marginTop: 4 }}>
                  {syncResult.failed} couldn't be found anywhere: {syncResult.failedNames?.join(', ')}
                </div>
              )}
              {syncResult.suspicious?.length > 0 && (
                <div className="text-sm" style={{ color: 'var(--orange)', marginTop: 4 }}>
                  {syncResult.suspicious.length} left unchanged as a safeguard —{' '}
                  {syncResult.suspicious.map(s => `${s.name || s.ticker} (${fmt(s.oldPrice)} → ${fmt(s.newPrice)}: ${s.reason || 'unexpected'})`).join('; ')}
                  . Fix these with <em>Prices</em> if the new value is right.
                </div>
              )}
            </div>
            <button className="btn-icon" aria-label="Dismiss" onClick={() => setSyncResult(null)}>✕</button>
          </div>
        )}

        {loading && (
          <div className="kpi-row" aria-hidden="true">
            {[0, 1, 2, 3, 4].map(i => (
              <div className="kpi-card" key={i}>
                <div className="skeleton" style={{ width: '55%', height: 10, marginBottom: 10 }} />
                <div className="skeleton" style={{ width: '80%', height: 24 }} />
              </div>
            ))}
          </div>
        )}

        {/* KPI Bar — always visible on overview */}
        {activeTab === 'overview' && !loading && (
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Invested</div>
              <div className="kpi-value" style={{ color: 'var(--cyan)' }}>{fmt(totalInvested)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Current Value</div>
              <div className="kpi-value" style={{ color: 'var(--purple)' }}>{fmt(totalCurrent)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">P / L</div>
              <div className="kpi-value" style={{ color: totalProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {signedMoney(totalProfit)}
              </div>
              <div className="kpi-sub" style={{ color: totalProfit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {pct(returnPct)} returns
              </div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">To Rebalance</div>
              <div className="kpi-value" style={{ color: 'var(--orange)' }}>{fmt(minRequired)}</div>
              <div className="kpi-sub text-dim">min. to reach all targets</div>
            </div>
            {/* Bank cash sits outside the portfolio — shown, never counted in the % maths */}
            <div className="kpi-card" style={{ borderColor: 'rgba(74,222,128,0.28)' }}>
              <div className="kpi-label">In Bank (cash)</div>
              <div className="kpi-value" style={{ color: 'var(--green)' }}>{fmt(bank.total)}</div>
              <div className="kpi-sub text-dim">
                excluded from allocation % · net worth {fmt(totalCurrent + bank.total)}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'overview' && (
          <div className="section">
            {/* Division cards */}
            <div className="section-header" style={{ marginTop: 8 }}>
              <h2 className="section-title">Divisions</h2>
              <button className="btn btn-primary btn-sm" onClick={() => setShowAddDivision(true)}>+ Add Division</button>
            </div>
            {[...(portfolio.divisions || [])]
              .sort((a, b) => {
                const aVal = analytics.divisions?.find(d => d.id === a.id)?.current || 0
                const bVal = analytics.divisions?.find(d => d.id === b.id)?.current || 0
                return bVal - aVal
              })
              .map(div => (
                <DivisionCard key={div.id} division={div} analytics={analytics} onUpdate={refreshAll} />
              ))
            }
            {portfolio.divisions?.length === 0 && (
              <div className="empty-state">
                <div className="empty-state-icon" aria-hidden="true">◔</div>
                <div className="empty-state-title">No divisions yet</div>
                <div className="empty-state-body">
                  A division is a bucket of your portfolio with a target weight — say <em>Mutual funds 50%</em>,{' '}
                  <em>Direct stocks 20%</em>. Add a couple and the allocation, rebalancing and analytics all follow.
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => setShowAddDivision(true)}>
                  + Add your first division
                </button>
              </div>
            )}

            {/* Goal Seek Summary */}
            <GoalSeekPanel analytics={analytics} totalCurrent={totalCurrent} minRequired={minRequired} subdivisionGoalSeek={subdivisionGoalSeek} portfolio={portfolio} budget={budget} setBudget={setBudget} />

            {/* Bank cash — standalone, outside every portfolio percentage calculation */}
            <BankSection accounts={bank.accounts} total={bank.total} onUpdate={refreshAll} />

            {/* Charts */}
            <PortfolioCharts divisions={portfolio.divisions} analytics={analytics} />
          </div>
        )}

        {activeTab === 'analytics' && (
          <DeepAnalytics divisions={portfolio.divisions} analytics={analytics} />
        )}

        {activeTab === 'overlap' && (
          <OverlapAnalysis divisions={portfolio.divisions} totalCurrent={totalCurrent} />
        )}

        {activeTab === 'expenses' && (
          <ExpenseTracker expenses={expenses} onUpdate={refreshAll} />
        )}

        {activeTab === 'fire' && (
          <FIRECalculator currentPortfolioValue={totalCurrent} expenses={expenses} />
        )}

        {activeTab === 'planner' && (
          <MonthlyPlanner analytics={analytics} divisions={portfolio.divisions || []} />
        )}
      </main>

      {showAddDivision && (
        <AddDivisionForm
          isOpen={showAddDivision}
          onClose={() => setShowAddDivision(false)}
          onAdd={async (data) => { await api.addDivision(data); setShowAddDivision(false); refreshAll() }}
        />
      )}

      <DataManager
        isOpen={showData}
        onClose={() => setShowData(false)}
        onRestored={refreshAll}
      />

      <ToastHost />

      {showBulkPrices && (
        <BulkPriceEditor
          portfolio={portfolio}
          onClose={() => setShowBulkPrices(false)}
          onUpdate={refreshAll}
        />
      )}
    </div>
  )
}

function GoalSeekPanel({ analytics, totalCurrent, minRequired, subdivisionGoalSeek, portfolio, budget, setBudget }) {
  const [open, setOpen] = useState(false)
  const budgetNum = Number(budget) || 0
  const useBudget = budgetNum > 0
  const budgetAdds = analytics.budgetAdditions || {}

  // When using budget: new total = totalCurrent + budget; add = budgetAdds[d.id]
  // When no budget:    new total = totalCurrent + minRequired; add = d.requiredAddition
  const projTotal = useBudget ? totalCurrent + budgetNum : totalCurrent + minRequired

  return (
    <div className="card-lg section">
      <div className="flex items-center gap-2 mb-2" style={{ cursor: 'pointer' }} onClick={() => setOpen(x => !x)}>
        <span className="section-title" style={{ color: 'var(--indigo)' }}>Goal Seek — Rebalancing</span>
        <span className="chevron" style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted mb-2" style={{ flexWrap: 'wrap' }}>
        {useBudget ? (
          <>
            <span>Allocating <strong style={{ color: 'var(--cyan)' }}>{fmt(budgetNum)}</strong> across divisions</span>
            <span>·</span>
            <span>Portfolio after: <strong style={{ color: 'var(--green)' }}>{fmt(projTotal)}</strong></span>
          </>
        ) : (
          <>
            <span>Min. to reach all targets: <strong style={{ color: 'var(--orange)' }}>{fmt(minRequired)}</strong></span>
            <span>·</span>
            <span>Portfolio after: <strong style={{ color: 'var(--green)' }}>{fmt(projTotal)}</strong></span>
          </>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-dim text-xs" title="Enter your investment budget to see how it gets split by target weights">
            My Budget ₹:
          </span>
          <input className="input input-sm" style={{ width: 110 }} type="number"
            placeholder="e.g. 50000" value={budget} onChange={e => setBudget(e.target.value)} />
          {useBudget && <button className="btn-icon" style={{ fontSize: 11 }} onClick={() => setBudget('')}>✕</button>}
        </div>
      </div>
      {useBudget && (
        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
          "Add Here" shows how ₹{budgetNum.toLocaleString('en-IN')} is split proportionally by target weights. Leave blank to see the minimum investment needed to hit all targets.
        </div>
      )}

      {open && (
        <div style={{ overflowX: 'auto', marginTop: 12 }}>
          <table className="gs-table">
            <thead>
              <tr>
                <th>Division / Subdivision</th>
                <th className="right">Current</th>
                <th className="right">P/L</th>
                <th className="right">Now %</th>
                <th className="right">Target %</th>
                <th className="right">{useBudget ? 'Allocate' : 'Add (min)'}</th>
                <th className="right">After</th>
                <th className="right">New %</th>
              </tr>
            </thead>
            <tbody>
              {(analytics.divisions || []).map(d => {
                const addition  = useBudget ? Math.round(budgetAdds[d.id] || 0) : Math.ceil(Number(d.requiredAddition) || 0)
                const newValue  = (Number(d.current) || 0) + addition
                const newPct    = projTotal > 0 ? (newValue / projTotal) * 100 : 0
                const profitPct = d.invested > 0 ? (d.profit / d.invested) * 100 : 0
                const divGs     = subdivisionGoalSeek[d.id]
                const hasSubGs  = divGs && divGs.requiredAddition > 0
                const div       = portfolio.divisions?.find(x => x.id === d.id)

                return (
                  <React.Fragment key={d.id}>
                    <tr>
                      <td style={{ fontWeight: 700 }}>{d.name}</td>
                      <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(d.current)}</td>
                      <td className="right num">
                        <span className={d.profit >= 0 ? 'pos' : 'neg'}>
                          {d.profit >= 0 ? '+' : ''}{fmt(d.profit)}<br />
                          <span className="text-xs">{pct(profitPct)}</span>
                        </span>
                      </td>
                      <td className="right num" style={{ color: 'var(--cyan)' }}>{(d.currentPercent || 0).toFixed(1)}%</td>
                      <td className="right num" style={{ color: 'var(--green)' }}>{(d.targetPercent || 0).toFixed(1)}%</td>
                      <td className="right num" style={{ color: addition > 0 ? 'var(--orange)' : 'var(--text3)' }}>
                        {addition > 0 ? fmt(addition) : '—'}
                      </td>
                      <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(newValue)}</td>
                      <td className="right num" style={{ color: 'var(--green)' }}>{newPct.toFixed(1)}%</td>
                    </tr>

                    {/* Subdivision rows — only show when not using budget (budget works at division level) */}
                    {!useBudget && hasSubGs && (div?.subdivisions || []).map(sub => {
                      const subAdd = Math.ceil(divGs.additionsBySubdivision[sub.id] || 0)
                      if (subAdd <= 0) return null
                      const subAna    = (analytics.divisions?.find(x => x.id === d.id)?.subdivisions || []).find(s => s.id === sub.id) || {}
                      const subProfit = subAna.profit || 0
                      const subProfPct = subAna.invested > 0 ? (subProfit / subAna.invested * 100) : 0
                      const subAfter  = (subAna.current || 0) + subAdd
                      // currentPercent here is % of parent division (from analytics.js line 42)
                      const subNewPct = (Number(d.current) + addition) > 0
                        ? (subAfter / (Number(d.current) + addition)) * 100 : 0

                      return (
                        <tr key={`sub-${sub.id}`} style={{ background: 'rgba(251,146,60,0.04)' }}>
                          <td style={{ paddingLeft: 28, color: 'var(--text2)', fontSize: 12 }}>↳ {sub.name}</td>
                          <td className="right num text-sm" style={{ color: 'var(--text2)' }}>{fmt(subAna.current || 0)}</td>
                          <td className="right num text-sm">
                            {subProfit !== 0 ? (
                              <span className={subProfit >= 0 ? 'pos' : 'neg'} style={{ fontSize: 11 }}>
                                {subProfit >= 0 ? '+' : ''}{fmt(subProfit)}<br />
                                <span style={{ fontSize: 10 }}>{pct(subProfPct)}</span>
                              </span>
                            ) : <span className="text-dim">—</span>}
                          </td>
                          <td className="right text-sm" style={{ color: 'var(--cyan)' }}>
                            {(subAna.currentPercent || 0).toFixed(1)}%
                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>of div</div>
                          </td>
                          <td className="right text-sm" style={{ color: 'var(--green)' }}>
                            {(sub.targetPercent || 0).toFixed(1)}%
                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>of div</div>
                          </td>
                          <td className="right num text-sm" style={{ color: 'var(--orange)' }}>{fmt(subAdd)}</td>
                          <td className="right num text-sm" style={{ color: 'var(--purple)' }}>{fmt(subAfter)}</td>
                          <td className="right text-sm" style={{ color: 'var(--green)' }}>
                            {subNewPct.toFixed(1)}%
                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>of div</div>
                          </td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}


