import React, { useMemo, useState } from 'react'
import { Doughnut, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js'
import { CAP_CATEGORIES, UNCLASSIFIED, sectorColor, capColor } from '../constants'
import Modal from './Modal'
import ProjectionPanel from './ProjectionPanel'

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
    let positions = 0, profitable = 0, priced = 0, maxGain = 0, maxLoss = 0, totalDev = 0
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
        // A holding with no price has current == invested. Counting those as losses put
        // the win rate at 15% when only 2 of 13 holdings were actually priced.
        if (profit !== 0) priced++
        if (roi > maxGain) maxGain = roi
        if (roi < maxLoss) maxLoss = roi
        allItems.push({ name: h.name, parent: parentName, invested, current, profit, roi, currentPct, platform: h.platform, assetType: h.assetType, sector: h.sector || '', capCategory: h.capCategory || '' })
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

    const winRate = priced > 0 ? (profitable / priced) * 100 : 0
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

    // Sector & market-cap analysis covers only holdings that actually carry those
    // attributes: bank deposits (platform 'bank') and FDs are cash-like — no sector,
    // no market cap — so they're excluded and the proportions use this equity/fund base.
    const isAnalyzable = h => h.platform !== 'bank' && h.assetType !== 'fd'
    const analyzableItems = allItems.filter(isAnalyzable)
    const analyzableTotal = analyzableItems.reduce((s, h) => s + h.current, 0)

    // Sector breakdown — unset holdings bucketed as "Unclassified" so coverage is visible
    const bySector = {}
    let classifiedSectorCurrent = 0
    analyzableItems.forEach(h => {
      const key = h.sector || UNCLASSIFIED
      if (!bySector[key]) bySector[key] = { invested: 0, current: 0, count: 0, items: [] }
      bySector[key].invested += h.invested
      bySector[key].current += h.current
      bySector[key].count++
      bySector[key].items.push(h)
      if (h.sector) classifiedSectorCurrent += h.current
    })

    // Market-cap breakdown
    const byCap = {}
    let classifiedCapCurrent = 0
    analyzableItems.forEach(h => {
      const key = h.capCategory || UNCLASSIFIED
      if (!byCap[key]) byCap[key] = { invested: 0, current: 0, count: 0, items: [] }
      byCap[key].invested += h.invested
      byCap[key].current += h.current
      byCap[key].count++
      byCap[key].items.push(h)
      if (h.capCategory) classifiedCapCurrent += h.current
    })

    const sectorCoverage = analyzableTotal > 0 ? (classifiedSectorCurrent / analyzableTotal) * 100 : 0
    const capCoverage = analyzableTotal > 0 ? (classifiedCapCurrent / analyzableTotal) * 100 : 0

    return { positions, profitable, priced, winRate, maxGain, maxLoss, avgDev, diversification, health, allItems, byPlatform, byAsset, bySector, byCap, sectorCoverage, capCoverage, analyzableTotal }
  }, [divisions, analytics, totalCurrent])

  const returnPct = totalInvested > 0 ? (totalProfit / totalInvested) * 100 : 0
  // Server-computed; fall back so an older payload can't crash the tab.
  const conc = analytics.concentration || { positions: metrics.positions, top1: 0, top3: 0, top5: 0, effectiveHoldings: 0, largest: null }
  const drift = analytics.drift || { divisionDrift: metrics.avgDev, maxGap: 0, worst: null }
  // Health, rebuilt on measures that mean something: how many bets are winning, how
  // spread the money actually is, and how far from target it has drifted. The old
  // score counted positions, which can't tell a balanced book from a one-bet one.
  const spreadScore = Math.min(100, (conc.effectiveHoldings / 15) * 100)
  const health = (metrics.winRate * 0.4) + (spreadScore * 0.3) + (Math.max(0, 100 - drift.divisionDrift * 4) * 0.3)
  const healthColor = health >= 70 ? 'var(--green)' : health >= 45 ? 'var(--orange)' : 'var(--red)'

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

  // Sector entries: highest current value first
  const sectorEntries = Object.entries(metrics.bySector)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => b.current - a.current)

  // Cap entries: fixed Large→Mid→Small→… order, Unclassified last
  const capOrder = [...CAP_CATEGORIES, UNCLASSIFIED]
  const capEntries = Object.entries(metrics.byCap)
    .map(([key, v]) => ({ key, ...v }))
    .sort((a, b) => {
      const ai = capOrder.indexOf(a.key), bi = capOrder.indexOf(b.key)
      return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi)
    })

  const hasSectorCapData = metrics.sectorCoverage > 0 || metrics.capCoverage > 0

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Analytics</h2>
      </div>

      {/* Top KPIs */}
      <div className="metric-grid mb-4">
        <div className="metric-card">
          <div className="metric-label">Portfolio Health</div>
          <div className="metric-value" style={{ color: healthColor }}>{health.toFixed(0)}<span style={{ fontSize: 14 }}>/100</span></div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>win rate · spread · drift</div>
        </div>
        <div className="metric-card">
          <div className="metric-label">Win Rate</div>
          <div className="metric-value" style={{ color: metrics.winRate >= 60 ? 'var(--green)' : 'var(--orange)' }}>{metrics.winRate.toFixed(0)}%</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {metrics.profitable}/{metrics.priced} priced holdings
            {metrics.positions > metrics.priced ? ` · ${metrics.positions - metrics.priced} unpriced` : ''}
          </div>
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
        <div className="metric-card" title="Share of the portfolio that would have to change hands to sit exactly on target">
          <div className="metric-label">Off Target</div>
          <div className="metric-value" style={{ color: drift.divisionDrift < 3 ? 'var(--green)' : drift.divisionDrift < 8 ? 'var(--orange)' : 'var(--red)' }}>
            {drift.divisionDrift.toFixed(1)}%
          </div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            of the portfolio must change hands
            {drift.worst ? ` · worst: ${drift.worst.name}, ${Math.abs(drift.worst.deltaPercent).toFixed(1)} pts ${drift.worst.deltaPercent > 0 ? 'under' : 'over'}` : ''}
          </div>
        </div>
        <div className="metric-card" title="Equal-sized holdings this portfolio behaves like (1/HHI). Far below the position count means a few names dominate.">
          <div className="metric-label">Effective Holdings</div>
          <div className="metric-value" style={{ color: 'var(--purple)' }}>{conc.effectiveHoldings.toFixed(1)}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>of {conc.positions} positions</div>
        </div>
        <div className="metric-card" title="Weight of the single biggest position">
          <div className="metric-label">Biggest Position</div>
          <div className="metric-value" style={{ color: conc.top1 > 25 ? 'var(--orange)' : 'var(--cyan)' }}>{conc.top1.toFixed(1)}%</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>
            {conc.largest?.name || '—'} · top 5 hold {conc.top5.toFixed(0)}% of the portfolio
          </div>
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

      {/* Sector & Market-Cap breakdowns */}
      {hasSectorCapData ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))', gap: 16, marginBottom: 20 }}>
          <BreakdownCard title="By Sector" kind="sector" note={`${metrics.sectorCoverage.toFixed(0)}% tagged · bank & FD excluded`} entries={sectorEntries} baseCurrent={metrics.analyzableTotal} colorFn={sectorColor} />
          <BreakdownCard title="By Market Cap" kind="market cap" note={`${metrics.capCoverage.toFixed(0)}% tagged · bank & FD excluded`} entries={capEntries} baseCurrent={metrics.analyzableTotal} colorFn={capColor} />
        </div>
      ) : (
        <div className="card-lg mb-4" style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>
          Tag holdings with a <strong style={{ color: 'var(--text2)' }}>Sector</strong> and <strong style={{ color: 'var(--text2)' }}>Market Cap</strong> (edit any stock/fund holding) to unlock sector &amp; cap-weighted breakdowns here. Bank deposits &amp; FDs are excluded.
        </div>
      )}

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

      {/* Every target in one place, worst gap first */}
      <TargetDrift divisions={analytics.divisions || []} />

      {/* Forward projection of the current portfolio */}
      <ProjectionPanel currentValue={totalCurrent} investedValue={totalInvested} />

      {/* Holdings detail */}
      {metrics.allItems.length > 0 && <AllPositions items={metrics.allItems} />}
    </div>
  )
}

// One list of everything that has a target, ordered by how far off it is. Per-holding
// targets are only useful if you can see all of them at once — hunting through
// division cards to find what has drifted is the thing this replaces.
function TargetDrift({ divisions }) {
  const portfolioTotal = divisions.reduce((s, d) => s + (Number(d.current) || 0), 0)
  const rows = useMemo(() => {
    const out = []
    divisions.forEach(d => {
      if (d.targetPercent > 0) {
        // A division's parent is the portfolio, so it does have a value to size the gap
        // against — passing null here left the biggest gaps as the only rows with no
        // rupee figure, which is exactly backwards.
        out.push({ key: `d-${d.id}`, level: 'Division', name: d.name, scope: 'of portfolio',
                   current: d.current, nowPct: d.currentPercent || 0, targetPct: d.targetPercent, parentValue: portfolioTotal })
      }
      ;(d.holdings || []).forEach(h => {
        if (h.targetPercent > 0) out.push({ key: `h-${h.id}`, level: 'Holding', name: h.name, scope: `of ${d.name}`,
                                            current: h.current, nowPct: h.currentPercent || 0, targetPct: h.targetPercent, parentValue: d.current })
      })
      ;(d.subdivisions || []).forEach(sd => {
        if (sd.targetPercent > 0) {
          out.push({ key: `s-${sd.id}`, level: 'Group', name: sd.name, scope: `of ${d.name}`,
                     current: sd.current, nowPct: sd.currentPercent || 0, targetPct: sd.targetPercent, parentValue: d.current })
        }
        ;(sd.holdings || []).forEach(h => {
          if (h.targetPercent > 0) out.push({ key: `h-${h.id}`, level: 'Holding', name: h.name, scope: `of ${sd.name}`,
                                              current: h.current, nowPct: h.currentPercent || 0, targetPct: h.targetPercent, parentValue: sd.current })
        })
      })
    })
    return out
      .map(r => ({ ...r, gap: r.targetPct - r.nowPct, gapValue: r.parentValue ? ((r.targetPct - r.nowPct) / 100) * r.parentValue : null }))
      .sort((a, b) => Math.abs(b.gap) - Math.abs(a.gap))
  }, [divisions, portfolioTotal])

  const untargeted = useMemo(() => {
    let n = 0
    divisions.forEach(d => {
      ;(d.holdings || []).forEach(h => { if (!(h.targetPercent > 0)) n++ })
      ;(d.subdivisions || []).forEach(sd => (sd.holdings || []).forEach(h => { if (!(h.targetPercent > 0)) n++ }))
    })
    return n
  }, [divisions])

  if (!rows.length) {
    return (
      <div className="card-lg mb-4" style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>
        No targets set yet. Open a division and use the <strong style={{ color: 'var(--cyan)' }}>◎</strong> button
        to set target weights — for whole divisions, for groups, or for individual stocks and funds.
        Everything below then tells you how far off you are and what to buy to fix it.
      </div>
    )
  }

  return (
    <div className="card-lg mb-4">
      <div className="section-header" style={{ marginBottom: 10 }}>
        <div className="card-title" style={{ margin: 0 }}>
          Target drift
          <span className="text-xs text-dim" style={{ fontWeight: 500, marginLeft: 8 }}>
            {rows.length} target{rows.length === 1 ? '' : 's'}{untargeted > 0 ? ` · ${untargeted} holding${untargeted === 1 ? '' : 's'} untargeted` : ''}
          </span>
        </div>
      </div>
      <div className="scroll-x">
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Name</th>
              <th className="col-optional">Level</th>
              <th className="right">Value</th>
              <th className="right">Now</th>
              <th className="right">Target</th>
              <th className="right">Gap</th>
              <th className="right">To close it</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.key}>
                <td>
                  <div style={{ fontWeight: 600 }}>{r.name}</div>
                  <div className="text-xs text-dim">{r.scope}</div>
                </td>
                <td className="col-optional"><span className="asset-type">{r.level}</span></td>
                <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(r.current)}</td>
                <td className="right num" style={{ color: 'var(--cyan)' }}>{r.nowPct.toFixed(1)}%</td>
                <td className="right num" style={{ color: 'var(--green)' }}>{r.targetPct.toFixed(1)}%</td>
                {/* Colour by how far off it is, not by direction: green-for-overweight
                    made the three worst-drifted rows look like the healthy ones. */}
                <td className="right num">
                  <span style={{ color: Math.abs(r.gap) < 1 ? 'var(--text2)' : Math.abs(r.gap) <= 10 ? 'var(--orange)' : 'var(--red)' }}>
                    {r.gap > 0 ? '+' : ''}{r.gap.toFixed(1)} pts
                    <span className="text-dim"> {Math.abs(r.gap) < 1 ? '' : r.gap > 0 ? 'under' : 'over'}</span>
                  </span>
                </td>
                <td className="right num">
                  {r.gapValue == null ? <span className="text-dim">—</span>
                    : Math.abs(r.gap) < 1 ? <span className="text-dim">on target</span>
                    : r.gapValue > 0 ? <span style={{ color: 'var(--orange)' }}>add {fmt(r.gapValue)}</span>
                    : <span className="text-dim">{fmt(-r.gapValue)} over</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="text-xs text-dim mt-2">
        "To close it" is what the gap is worth at today's group size — the Goal Seek panel on
        Overview turns these into an actual buy list.
      </div>
    </div>
  )
}

// Every position, searchable and sortable. With a few dozen holdings the old
// fixed sort-by-value list meant hunting; typing a name or clicking a column is
// what anyone actually wants to do here.
const PCLS = { kite: 'platform-kite', groww: 'platform-groww', indmoney: 'platform-indmoney', bank: 'platform-bank', other: 'platform-other' }
const PLABELS = { kite: 'Kite', groww: 'Groww', indmoney: 'IndMoney', bank: 'Bank', other: 'Other' }

// `optional` columns drop out on phones so the money stays on screen, matching the
// holdings tables. Without it this table hid the money and kept Division/Platform.
const POSITION_COLS = [
  { key: 'name', label: 'Name', align: 'left' },
  { key: 'parent', label: 'Division', align: 'left', optional: true },
  { key: 'platform', label: 'Platform', align: 'left', optional: true },
  { key: 'invested', label: 'Invested', align: 'right' },
  { key: 'current', label: 'Current', align: 'right' },
  { key: 'profit', label: 'P/L', align: 'right' },
  { key: 'roi', label: 'ROI', align: 'right', optional: true },
  { key: 'currentPct', label: '% of portfolio', align: 'right' },
]

function AllPositions({ items }) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState({ key: 'current', dir: 'desc' })

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const filtered = q
      ? items.filter(h => [h.name, h.parent, h.platform, h.sector, h.capCategory, h.assetType]
          .some(v => String(v || '').toLowerCase().includes(q)))
      : items
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...filtered].sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key]
      if (typeof av === 'number' && typeof bv === 'number') return (av - bv) * dir
      return String(av ?? '').localeCompare(String(bv ?? '')) * dir
    })
  }, [items, query, sort])

  const toggle = key => setSort(s => ({
    key,
    // Text reads naturally A→Z first; numbers are far more useful biggest-first.
    dir: s.key === key ? (s.dir === 'asc' ? 'desc' : 'asc') : (['name', 'parent', 'platform'].includes(key) ? 'asc' : 'desc'),
  }))

  const totals = rows.reduce((t, h) => ({
    invested: t.invested + h.invested, current: t.current + h.current, profit: t.profit + h.profit,
  }), { invested: 0, current: 0, profit: 0 })

  return (
    <div className="card-lg">
      <div className="section-header" style={{ marginBottom: 12 }}>
        <div className="card-title" style={{ margin: 0 }}>
          All Positions
          <span className="text-xs text-dim" style={{ fontWeight: 500, marginLeft: 8 }}>
            {rows.length === items.length ? `${items.length} holdings` : `${rows.length} of ${items.length}`}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <input
            className="input input-sm"
            style={{ width: 200 }}
            type="search"
            placeholder="Filter by name, division…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Filter positions"
          />
          {query && <button className="btn-icon" aria-label="Clear filter" onClick={() => setQuery('')}>✕</button>}
        </div>
      </div>

      <div className="scroll-x">
        <table className="holdings-table">
          <thead>
            <tr>
              {POSITION_COLS.map(c => (
                <th
                  key={c.key}
                  className={`sortable${c.align === 'right' ? ' right' : ''}${c.optional ? ' col-optional' : ''}`}
                  onClick={() => toggle(c.key)}
                  aria-sort={sort.key === c.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                  title={`Sort by ${c.label}`}
                  style={c.align === 'right' ? { textAlign: 'right' } : undefined}
                >
                  {c.label}
                  {sort.key === c.key && <span className="sort-arrow">{sort.dir === 'asc' ? '▲' : '▼'}</span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((h, i) => (
              <tr key={`${h.parent}-${h.name}-${i}`}>
                <td style={{ fontWeight: 600 }}>{h.name}</td>
                <td className="text-sm text-muted col-optional">{h.parent}</td>
                <td className="col-optional"><span className={`platform-badge ${PCLS[h.platform] || 'platform-other'}`}>{PLABELS[h.platform] || h.platform || 'Other'}</span></td>
                <td className="right num">{fmt(h.invested)}</td>
                <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(h.current)}</td>
                <td className="right num"><span className={h.profit >= 0 ? 'pos' : 'neg'}>{h.profit >= 0 ? '+' : ''}{fmt(h.profit)}</span></td>
                <td className="right num col-optional"><span className={h.roi >= 0 ? 'pos' : 'neg'}>{h.roi >= 0 ? '+' : ''}{h.roi.toFixed(1)}%</span></td>
                <td className="right num text-muted">{h.currentPct.toFixed(1)}%</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={POSITION_COLS.length} style={{ textAlign: 'center', color: 'var(--text3)', padding: 24 }}>
                Nothing matches “{query}”.
              </td></tr>
            )}
            {rows.length > 1 && (
              <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                <td style={{ fontWeight: 800 }}>{rows.length === items.length ? 'Total' : 'Filtered total'}</td>
                <td className="col-optional" /><td className="col-optional" />
                <td className="right num" style={{ fontWeight: 800 }}>{fmt(totals.invested)}</td>
                <td className="right num" style={{ fontWeight: 800, color: 'var(--purple)' }}>{fmt(totals.current)}</td>
                <td className="right num" style={{ fontWeight: 800 }}>
                  <span className={totals.profit >= 0 ? 'pos' : 'neg'}>{totals.profit >= 0 ? '+' : ''}{fmt(totals.profit)}</span>
                </td>
                <td className="right num col-optional" style={{ fontWeight: 800 }}>
                  <span className={totals.profit >= 0 ? 'pos' : 'neg'}>
                    {totals.invested > 0 ? `${totals.profit >= 0 ? '+' : ''}${((totals.profit / totals.invested) * 100).toFixed(1)}%` : '—'}
                  </span>
                </td>
                <td />
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}

// Reusable "proportion + stats" card: doughnut on top, per-category stats table below.
// Each category row is clickable and opens a popup listing the holdings under it.
// `baseCurrent` is the denominator for share % (the analyzable equity/fund universe).
function BreakdownCard({ title, kind = 'category', note, entries, baseCurrent, colorFn }) {
  const [openKey, setOpenKey] = useState(null)
  if (!entries || entries.length === 0) return null

  const chartData = {
    labels: entries.map(e => e.key),
    datasets: [{
      data: entries.map(e => Math.max(0, e.current)),
      backgroundColor: entries.map(e => colorFn(e.key)),
      borderWidth: 0,
    }],
  }

  const opts = {
    responsive: true, maintainAspectRatio: false,
    plugins: {
      legend: { position: 'bottom', labels: { color: '#94a3b8', font: { size: 10 }, boxWidth: 10, padding: 8 } },
      tooltip: { callbacks: { label: ctx => {
        const share = baseCurrent > 0 ? (ctx.raw / baseCurrent * 100).toFixed(1) : '0.0'
        return `${ctx.label}: ${fmt(ctx.raw)} (${share}%)`
      } } },
    },
  }

  const openEntry = entries.find(e => e.key === openKey) || null

  return (
    <div className="card-lg">
      <div className="card-title" style={{ marginBottom: 4 }}>{title}</div>
      {note && <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 12 }}>{note}</div>}
      <div style={{ height: 220 }}><Doughnut data={chartData} options={opts} /></div>
      <div style={{ overflowX: 'auto', marginTop: 14 }}>
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Category</th>
              <th className="right">#</th>
              <th className="right">Invested</th>
              <th className="right">Current</th>
              <th className="right">P/L</th>
              <th className="right">Return</th>
              <th className="right">Share</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(e => {
              const pl = e.current - e.invested
              const ret = e.invested > 0 ? (pl / e.invested) * 100 : 0
              const share = baseCurrent > 0 ? (e.current / baseCurrent) * 100 : 0
              return (
                <tr key={e.key} onClick={() => setOpenKey(e.key)} style={{ cursor: 'pointer' }}
                  title={`View ${e.count} holding${e.count === 1 ? '' : 's'} in ${e.key}`}>
                  <td>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                      <span style={{ width: 9, height: 9, borderRadius: 2, background: colorFn(e.key), flexShrink: 0 }} />
                      {e.key}
                    </span>
                  </td>
                  <td className="right num text-muted">{e.count}</td>
                  <td className="right num">{fmt(e.invested)}</td>
                  <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(e.current)}</td>
                  <td className="right num"><span className={pl >= 0 ? 'pos' : 'neg'}>{pl >= 0 ? '+' : ''}{fmt(pl)}</span></td>
                  <td className="right num"><span className={ret >= 0 ? 'pos' : 'neg'}>{ret >= 0 ? '+' : ''}{ret.toFixed(1)}%</span></td>
                  <td className="right num" style={{ color: 'var(--text2)' }}>{share.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {openEntry && (
        <CategoryHoldingsModal entry={openEntry} kind={kind} baseCurrent={baseCurrent} color={colorFn(openEntry.key)} onClose={() => setOpenKey(null)} />
      )}
    </div>
  )
}

// Popup listing every holding under a chosen sector / market-cap category.
function CategoryHoldingsModal({ entry, kind, baseCurrent, color, onClose }) {
  const items = [...(entry.items || [])].sort((a, b) => b.current - a.current)
  const pl = entry.current - entry.invested
  const ret = entry.invested > 0 ? (pl / entry.invested) * 100 : 0
  const share = baseCurrent > 0 ? (entry.current / baseCurrent) * 100 : 0

  const stat = (label, value, color2) => (
    <div style={{ flex: '1 1 90px' }}>
      <div style={{ fontSize: 10, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 700 }}>{label}</div>
      <div style={{ fontSize: 15, fontWeight: 800, color: color2 || 'var(--text)' }}>{value}</div>
    </div>
  )

  return (
    <Modal
      isOpen
      onClose={onClose}
      size="lg"
      title={<span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 12, height: 12, borderRadius: 3, background: color, display: 'inline-block' }} />
        {entry.key}
      </span>}
    >
      <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: -6, marginBottom: 14 }}>
        {items.length} holding{items.length === 1 ? '' : 's'} · {kind} breakdown
      </div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', padding: '12px 14px', background: 'rgba(255,255,255,0.03)', border: '1px solid var(--border)', borderRadius: 10, marginBottom: 16 }}>
        {stat('Current', fmt(entry.current), 'var(--purple)')}
        {stat('Invested', fmt(entry.invested))}
        {stat('P / L', `${pl >= 0 ? '+' : ''}${fmt(pl)}`, pl >= 0 ? 'var(--green)' : 'var(--red)')}
        {stat('Return', `${ret >= 0 ? '+' : ''}${ret.toFixed(1)}%`, ret >= 0 ? 'var(--green)' : 'var(--red)')}
        {stat('Share', `${share.toFixed(1)}%`, 'var(--cyan)')}
      </div>

      <div style={{ overflowX: 'auto' }}>
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Holding</th>
              <th>Division</th>
              <th className="right">Invested</th>
              <th className="right">Current</th>
              <th className="right">P/L</th>
              <th className="right">Return</th>
              <th className="right">Weight</th>
            </tr>
          </thead>
          <tbody>
            {items.map((h, i) => {
              const w = entry.current > 0 ? (h.current / entry.current) * 100 : 0
              return (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{h.name}</td>
                  <td className="text-sm text-muted">{h.parent}</td>
                  <td className="right num">{fmt(h.invested)}</td>
                  <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(h.current)}</td>
                  <td className="right num"><span className={h.profit >= 0 ? 'pos' : 'neg'}>{h.profit >= 0 ? '+' : ''}{fmt(h.profit)}</span></td>
                  <td className="right num"><span className={h.roi >= 0 ? 'pos' : 'neg'}>{h.roi >= 0 ? '+' : ''}{h.roi.toFixed(1)}%</span></td>
                  <td className="right num" style={{ color: 'var(--text2)' }}>{w.toFixed(1)}%</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Modal>
  )
}
