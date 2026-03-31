import React, { useMemo } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend)

function fmt(n) {
  if (!n && n !== 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

const COLORS = ['#22d3ee','#a78bfa','#4ade80','#fb923c','#f472b6','#818cf8','#facc15','#34d399','#60a5fa','#f87171']

export default function DeepAnalytics({ divisions, analytics }) {
  const totalCurrent = analytics?.totals?.current || 0
  const totalInvested = analytics?.totals?.invested || 0
  const totalProfit = analytics?.totals?.profit || 0

  const metrics = useMemo(() => {
    let positions = 0, profitable = 0, maxGain = 0, maxLoss = 0, totalDev = 0
    const allItems = []

    // Gather all holdings (direct + from subdivisions)
    divisions.forEach(div => {
      const da = analytics.divisions?.find(d => d.id === div.id) || {}
      const divTargetPct = Number(div.targetPercent) || 0

      const processHolding = (h, parentName) => {
        const invested = Number(h.invested) || 0
        const current = Number(h.current) || 0
        const profit = current - invested
        const roi = invested > 0 ? (profit / invested) * 100 : 0
        const currentPct = totalCurrent > 0 ? (current / totalCurrent) * 100 : 0
        positions++
        if (profit > 0) profitable++
        if (roi > maxGain) maxGain = roi
        if (roi < maxLoss) maxLoss = roi
        allItems.push({ name: h.name, parent: parentName, invested, current, profit, roi, currentPct, platform: h.platform, assetType: h.assetType })
      }

      ;(div.holdings || []).forEach(h => processHolding(h, div.name))
      ;(div.subdivisions || []).forEach(sub => {
        ;(sub.holdings || []).forEach(h => processHolding(h, `${div.name} / ${sub.name}`))
      })

      // Division-level metrics
      const currentPct = da.currentPercent || 0
      const dev = divTargetPct > 0 ? Math.abs(currentPct - divTargetPct) : 0
      totalDev += dev
    })

    const winRate = positions > 0 ? (profitable / positions) * 100 : 0
    const avgDev = analytics.divisions?.length > 0 ? totalDev / analytics.divisions.length : 0
    const diversification = Math.min(100, (positions / 12) * 100)
    const health = (winRate * 0.4) + (diversification * 0.3) + (Math.max(0, 100 - avgDev * 3) * 0.3)

    // Platform breakdown
    const byPlatform = {}
    allItems.forEach(h => {
      const p = h.platform || 'other'
      if (!byPlatform[p]) byPlatform[p] = { invested: 0, current: 0 }
      byPlatform[p].invested += h.invested
      byPlatform[p].current += h.current
    })

    // Asset type breakdown
    const byAsset = {}
    allItems.forEach(h => {
      const a = h.assetType || 'other'
      if (!byAsset[a]) byAsset[a] = 0
      byAsset[a] += h.current
    })

    return { positions, profitable, winRate, maxGain, maxLoss, avgDev, diversification, health, allItems, byPlatform, byAsset }
  }, [divisions, analytics, totalCurrent])

  const returnPct = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0
  const healthColor = metrics.health >= 70 ? 'var(--green)' : metrics.health >= 45 ? 'var(--orange)' : 'var(--red)'

  // Allocation chart
  const allocData = {
    labels: (analytics.divisions || []).map(d => d.name),
    datasets: [{
      data: (analytics.divisions || []).map(d => d.current || 0),
      backgroundColor: COLORS,
      borderWidth: 0,
    }]
  }

  // Asset type chart
  const assetLabels = Object.keys(metrics.byAsset)
  const assetData = {
    labels: assetLabels.map(k => k.toUpperCase()),
    datasets: [{
      data: assetLabels.map(k => metrics.byAsset[k]),
      backgroundColor: COLORS,
      borderWidth: 0,
    }]
  }

  // Division vs target bar
  const barData = {
    labels: (analytics.divisions || []).map(d => d.name),
    datasets: [
      {
        label: 'Current %',
        data: (analytics.divisions || []).map(d => Number((d.currentPercent || 0).toFixed(1))),
        backgroundColor: 'rgba(34,211,238,0.6)',
      },
      {
        label: 'Target %',
        data: (analytics.divisions || []).map(d => Number((d.targetPercent || 0))),
        backgroundColor: 'rgba(167,139,250,0.4)',
      }
    ]
  }

  const pieOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 12 } }, tooltip: { callbacks: { label: ctx => `${ctx.label}: ${fmt(ctx.raw)}` } } }
  }
  const barOpts = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 11 } } }, tooltip: {} },
    scales: {
      x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { display: false } },
      y: { ticks: { color: '#64748b', callback: v => `${v}%` }, grid: { color: '#1f2937' } }
    }
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Analytics</h2>
      </div>

      {/* Top KPIs */}
      <div className="metric-grid mb-4">
        <div className="metric-card">
          <div className="metric-label">Portfolio Health</div>
          <div className="metric-value" style={{ color: healthColor }}>{metrics.health.toFixed(0)}<span style={{ fontSize: 14 }}>/100</span></div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Win Rate</div>
          <div className="metric-value" style={{ color: metrics.winRate >= 60 ? 'var(--green)' : 'var(--orange)' }}>{metrics.winRate.toFixed(0)}%</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{metrics.profitable}/{metrics.positions} profitable</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Total Return</div>
          <div className="metric-value" style={{ color: returnPct >= 0 ? 'var(--green)' : 'var(--red)' }}>{returnPct >= 0 ? '+' : ''}{returnPct.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{fmt(totalProfit)}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Best ROI</div>
          <div className="metric-value" style={{ color: 'var(--green)' }}>+{metrics.maxGain.toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Worst ROI</div>
          <div className="metric-value" style={{ color: 'var(--red)' }}>{metrics.maxLoss.toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Positions</div>
          <div className="metric-value" style={{ color: 'var(--cyan)' }}>{metrics.positions}</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Avg Allocation Gap</div>
          <div className="metric-value" style={{ color: metrics.avgDev < 3 ? 'var(--green)' : 'var(--orange)' }}>{metrics.avgDev.toFixed(1)}%</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Diversification</div>
          <div className="metric-value" style={{ color: 'var(--purple)' }}>{metrics.diversification.toFixed(0)}<span style={{ fontSize: 14 }}>/100</span></div>
        </div>
      </div>

      {/* Charts row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card-lg">
          <div className="card-title">Allocation by Division</div>
          <div style={{ height: 220 }}><Doughnut data={allocData} options={pieOpts} /></div>
        </div>
        {assetLabels.length > 1 && (
          <div className="card-lg">
            <div className="card-title">By Asset Type</div>
            <div style={{ height: 220 }}><Doughnut data={assetData} options={pieOpts} /></div>
          </div>
        )}
        <div className="card-lg" style={{ gridColumn: assetLabels.length > 1 ? '1 / -1' : 'auto' }}>
          <div className="card-title">Current vs Target Allocation</div>
          <div style={{ height: 200 }}><Bar data={barData} options={barOpts} /></div>
        </div>
      </div>

      {/* Platform summary */}
      {Object.keys(metrics.byPlatform).length > 0 && (
        <div className="card-lg mb-4">
          <div className="card-title">By Platform</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>Platform</th>
                  <th className="right">Invested</th>
                  <th className="right">Current</th>
                  <th className="right">P/L</th>
                  <th className="right">Return</th>
                  <th className="right">Share</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(metrics.byPlatform).map(([p, v]) => {
                  const pl = v.current - v.invested
                  const ret = v.invested > 0 ? (pl / v.invested) * 100 : 0
                  const share = totalCurrent > 0 ? (v.current / totalCurrent) * 100 : 0
                  const PLABELS = { kite: 'Kite', groww: 'Groww', indmoney: 'IndMoney', bank: 'Bank', other: 'Other' }
                  const PCLS = { kite: 'platform-kite', groww: 'platform-groww', indmoney: 'platform-indmoney', bank: 'platform-bank', other: 'platform-other' }
                  return (
                    <tr key={p}>
                      <td><span className={`platform-badge ${PCLS[p] || 'platform-other'}`}>{PLABELS[p] || p}</span></td>
                      <td className="right num">{fmt(v.invested)}</td>
                      <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(v.current)}</td>
                      <td className="right num"><span className={pl >= 0 ? 'pos' : 'neg'}>{pl >= 0 ? '+' : ''}{fmt(pl)}</span></td>
                      <td className="right num"><span className={ret >= 0 ? 'pos' : 'neg'}>{ret >= 0 ? '+' : ''}{ret.toFixed(1)}%</span></td>
                      <td className="right num" style={{ color: 'var(--text2)' }}>{share.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Holdings detail */}
      {metrics.allItems.length > 0 && (
        <div className="card-lg">
          <div className="card-title">All Positions</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Division</th>
                  <th>Platform</th>
                  <th className="right">Invested</th>
                  <th className="right">Current</th>
                  <th className="right">P/L</th>
                  <th className="right">ROI</th>
                  <th className="right">% of Portfolio</th>
                </tr>
              </thead>
              <tbody>
                {[...metrics.allItems].sort((a, b) => b.current - a.current).map((h, i) => {
                  const PCLS = { kite: 'platform-kite', groww: 'platform-groww', indmoney: 'platform-indmoney', bank: 'platform-bank', other: 'platform-other' }
                  const PLABELS = { kite: 'Kite', groww: 'Groww', indmoney: 'IndMoney', bank: 'Bank', other: 'Other' }
                  return (
                    <tr key={i}>
                      <td style={{ fontWeight: 600 }}>{h.name}</td>
                      <td className="text-sm text-muted">{h.parent}</td>
                      <td><span className={`platform-badge ${PCLS[h.platform] || 'platform-other'}`}>{PLABELS[h.platform] || h.platform || 'Other'}</span></td>
                      <td className="right num">{fmt(h.invested)}</td>
                      <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(h.current)}</td>
                      <td className="right num"><span className={h.profit >= 0 ? 'pos' : 'neg'}>{h.profit >= 0 ? '+' : ''}{fmt(h.profit)}</span></td>
                      <td className="right num"><span className={h.roi >= 0 ? 'pos' : 'neg'}>{h.roi >= 0 ? '+' : ''}{h.roi.toFixed(1)}%</span></td>
                      <td className="right num text-muted">{h.currentPct.toFixed(1)}%</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
