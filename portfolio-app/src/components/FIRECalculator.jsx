import React, { useState, useEffect, useMemo } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

// DOB hardcoded — update if needed
const DOB = new Date(2002, 3, 13)
function currentAge() {
  const now = new Date()
  let age = now.getFullYear() - DOB.getFullYear()
  if (now.getMonth() < DOB.getMonth() || (now.getMonth() === DOB.getMonth() && now.getDate() < DOB.getDate())) age--
  return age
}

function fmt(n) {
  if (!n && n !== 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e7) return `₹${(n / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `₹${(n / 1e5).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}
function fmtYr(months) {
  if (!months && months !== 0) return '—'
  const yrs = Math.floor(months / 12)
  const mos = months % 12
  return yrs > 0 ? `${yrs}y ${mos}m` : `${mos}m`
}

function SliderInput({ label, value, min, max, step = 1, unit = '', onChange }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="range" min={min} max={max} step={step}
          value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: 'var(--cyan)' }}
        />
        <span style={{ width: 60, textAlign: 'right', color: 'var(--cyan)', fontWeight: 700, fontSize: 14 }}>
          {value}{unit}
        </span>
      </div>
    </div>
  )
}

function NumInput({ label, value, onChange, prefix = '₹', placeholder = '0' }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="flex items-center gap-1">
        {prefix && <span style={{ color: 'var(--text3)', fontSize: 13 }}>{prefix}</span>}
        <input
          className="input"
          type="number"
          placeholder={placeholder}
          value={value || ''}
          onChange={e => onChange(Number(e.target.value) || 0)}
          style={{ flex: 1 }}
        />
      </div>
    </div>
  )
}

export default function FIRECalculator({ currentPortfolioValue = 0, expenses = [] }) {
  const age = currentAge()

  const [inputs, setInputs] = useState({
    currentAge: age,
    targetAge: age + 20,
    monthlyExpenses: 0,
    inflationRate: 6,
    accumulationReturn: 11,
    withdrawalReturn: 7,
    safeWithdrawalRate: 3.5,
    monthlyContribution: 0,
  })

  const set = (k, v) => setInputs(p => ({ ...p, [k]: v }))

  // Auto-populate from expenses
  useEffect(() => {
    if (!expenses.length) return
    const byMonth = new Map()
    expenses.forEach(e => {
      const key = `${e.year}-${e.month}`
      if (!byMonth.has(key)) byMonth.set(key, { income: 0, expense: 0 })
      const r = byMonth.get(key)
      if (e.type === 'expense') r.expense += Number(e.amount || 0)
      if (e.type === 'income') r.income += Number(e.amount || 0)
    })
    const entries = Array.from(byMonth.values())
    if (!entries.length) return
    const avgExpense = entries.reduce((s, m) => s + m.expense, 0) / entries.length
    const avgSaving = entries.reduce((s, m) => s + (m.income - m.expense), 0) / entries.length
    setInputs(p => ({
      ...p,
      monthlyExpenses: p.monthlyExpenses > 0 ? p.monthlyExpenses : Math.round(avgExpense),
      monthlyContribution: p.monthlyContribution > 0 ? p.monthlyContribution : Math.max(0, Math.round(avgSaving)),
    }))
  }, [expenses])

  const results = useMemo(() => {
    const { targetAge, monthlyExpenses, inflationRate, accumulationReturn, withdrawalReturn, safeWithdrawalRate, monthlyContribution } = inputs
    if (!monthlyExpenses || !targetAge) return null

    const yearsToRetire = Math.max(0, targetAge - age)
    const inflFactor = Math.pow(1 + inflationRate / 100, yearsToRetire)
    const futureMonthlyExpense = monthlyExpenses * inflFactor
    const futureAnnualExpense = futureMonthlyExpense * 12

    // Corpus at retirement using SWR
    const corpusNeeded = futureAnnualExpense / (safeWithdrawalRate / 100)

    // Simulate month-by-month growth
    const accRate = accumulationReturn / 12 / 100
    let balance = currentPortfolioValue
    let monthsToFire = null
    const projectionMonths = Math.max(yearsToRetire, 40) * 12

    const labels = []
    const data = []
    const targetLine = []

    for (let m = 0; m <= projectionMonths; m++) {
      const yr = Math.floor(m / 12)
      if (m % 12 === 0) {
        labels.push(`${age + yr}`)
        data.push(Math.round(balance))
        targetLine.push(Math.round(corpusNeeded))
      }
      if (monthsToFire === null && balance >= corpusNeeded) monthsToFire = m
      balance = balance * (1 + accRate) + monthlyContribution
    }

    // SIP needed to reach corpus in yearsToRetire years
    const n = yearsToRetire * 12
    let sipNeeded = 0
    if (accRate > 0 && n > 0) {
      const fv = corpusNeeded - currentPortfolioValue * Math.pow(1 + accRate, n)
      sipNeeded = Math.max(0, fv * accRate / (Math.pow(1 + accRate, n) - 1))
    }

    // Balance at target retirement age
    const balanceAtTarget = currentPortfolioValue * Math.pow(1 + accRate, n) +
      (n > 0 ? monthlyContribution * (Math.pow(1 + accRate, n) - 1) / accRate : 0)

    // Post-retirement: how long corpus lasts
    const withdrawRate = withdrawalReturn / 12 / 100
    let corpus = balanceAtTarget
    let survivalMonths = 0
    while (corpus > 0 && survivalMonths < 600) {
      corpus = corpus * (1 + withdrawRate) - futureMonthlyExpense
      survivalMonths++
    }

    return {
      corpusNeeded, futureMonthlyExpense, futureAnnualExpense,
      sipNeeded, balanceAtTarget,
      shortfall: Math.max(0, corpusNeeded - balanceAtTarget),
      monthsToFire, survivalMonths,
      chart: { labels, data, targetLine }
    }
  }, [inputs, currentPortfolioValue, age])

  const onTrack = results && results.balanceAtTarget >= results.corpusNeeded
  const fireAge = results?.monthsToFire !== null ? age + Math.floor((results?.monthsToFire || 0) / 12) : null

  const chartData = results ? {
    labels: results.chart.labels,
    datasets: [
      {
        label: 'Portfolio Value',
        data: results.chart.data,
        borderColor: 'var(--cyan)',
        backgroundColor: 'rgba(34,211,238,0.08)',
        fill: true,
        tension: 0.4,
        pointRadius: 0,
        borderWidth: 2,
      },
      {
        label: 'Corpus Needed',
        data: results.chart.targetLine,
        borderColor: 'rgba(251,146,60,0.7)',
        borderDash: [6, 3],
        pointRadius: 0,
        borderWidth: 2,
      }
    ]
  } : null

  const chartOptions = {
    responsive: true, maintainAspectRatio: false,
    plugins: { legend: { labels: { color: '#94a3b8', font: { size: 12 } } }, tooltip: { callbacks: { label: ctx => fmt(ctx.raw) } } },
    scales: {
      x: { ticks: { color: '#64748b', maxTicksLimit: 10 }, grid: { color: '#1f2937' } },
      y: { ticks: { color: '#64748b', callback: v => fmt(v) }, grid: { color: '#1f2937' } }
    }
  }

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">FIRE Calculator</h2>
        {results && (
          <span style={{
            padding: '4px 12px', borderRadius: 99, fontSize: 12, fontWeight: 700,
            background: onTrack ? 'var(--green-dim)' : 'var(--red-dim)',
            color: onTrack ? 'var(--green)' : 'var(--red)',
            border: `1px solid ${onTrack ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`
          }}>
            {onTrack ? '✓ On track' : '⚠ Gap exists'}
          </span>
        )}
      </div>

      <div className="card-lg mb-4">
        <div className="fire-inputs">
          <NumInput label="Monthly Expenses (today)" value={inputs.monthlyExpenses} onChange={v => set('monthlyExpenses', v)} />
          <NumInput label="Monthly SIP / Contribution" value={inputs.monthlyContribution} onChange={v => set('monthlyContribution', v)} />
          <div className="form-group">
            <label className="form-label">Current Age</label>
            <input className="input" value={inputs.currentAge} readOnly style={{ color: 'var(--text3)' }} />
          </div>
          <div className="form-group">
            <label className="form-label">Target Retirement Age</label>
            <input className="input" type="number" value={inputs.targetAge} onChange={e => set('targetAge', Number(e.target.value))} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16 }}>
          <SliderInput label="Inflation Rate" value={inputs.inflationRate} min={3} max={12} step={0.5} unit="%" onChange={v => set('inflationRate', v)} />
          <SliderInput label="Expected Portfolio Return" value={inputs.accumulationReturn} min={5} max={18} step={0.5} unit="%" onChange={v => set('accumulationReturn', v)} />
          <SliderInput label="Post-Retirement Return" value={inputs.withdrawalReturn} min={4} max={12} step={0.5} unit="%" onChange={v => set('withdrawalReturn', v)} />
          <SliderInput label="Safe Withdrawal Rate" value={inputs.safeWithdrawalRate} min={2} max={6} step={0.5} unit="%" onChange={v => set('safeWithdrawalRate', v)} />
        </div>
      </div>

      {results && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
            <div className="fire-result">
              <div className="fire-result-label">Corpus Needed at Retirement</div>
              <div className="fire-result-value" style={{ color: 'var(--orange)' }}>{fmt(results.corpusNeeded)}</div>
              <div className="fire-result-sub">Future monthly expenses: {fmt(results.futureMonthlyExpense)}</div>
            </div>
            <div className="fire-result">
              <div className="fire-result-label">Portfolio at Target Age ({inputs.targetAge})</div>
              <div className="fire-result-value" style={{ color: onTrack ? 'var(--green)' : 'var(--red)' }}>{fmt(results.balanceAtTarget)}</div>
              <div className="fire-result-sub">
                {onTrack ? `Surplus: ${fmt(results.balanceAtTarget - results.corpusNeeded)}` : `Shortfall: ${fmt(results.shortfall)}`}
              </div>
            </div>
            <div className="fire-result">
              <div className="fire-result-label">SIP Needed to FIRE at {inputs.targetAge}</div>
              <div className="fire-result-value" style={{ color: 'var(--purple)' }}>{fmt(results.sipNeeded)}/mo</div>
              <div className="fire-result-sub">Your current SIP: {fmt(inputs.monthlyContribution)}/mo</div>
            </div>
            <div className="fire-result">
              <div className="fire-result-label">FIRE Age (at current SIP)</div>
              <div className="fire-result-value" style={{ color: 'var(--cyan)' }}>
                {fireAge !== null ? `Age ${fireAge}` : '> 80'}
              </div>
              <div className="fire-result-sub">
                {results.monthsToFire !== null ? `In ${fmtYr(results.monthsToFire)}` : 'Increase SIP or reduce expenses'}
              </div>
            </div>
            <div className="fire-result">
              <div className="fire-result-label">Corpus Lasts After Retirement</div>
              <div className="fire-result-value" style={{ color: results.survivalMonths >= 600 ? 'var(--green)' : 'var(--text)' }}>
                {results.survivalMonths >= 600 ? 'Perpetual' : fmtYr(results.survivalMonths)}
              </div>
              <div className="fire-result-sub">Post-retirement return: {inputs.withdrawalReturn}%</div>
            </div>
            <div className="fire-result">
              <div className="fire-result-label">Current Portfolio</div>
              <div className="fire-result-value" style={{ color: 'var(--purple)' }}>{fmt(currentPortfolioValue)}</div>
              <div className="fire-result-sub">
                {results.corpusNeeded > 0 ? `${((currentPortfolioValue / results.corpusNeeded) * 100).toFixed(1)}% of corpus` : ''}
              </div>
            </div>
          </div>

          {chartData && (
            <div className="card-lg">
              <div className="card-title">Portfolio Growth Projection</div>
              <div style={{ height: 280 }}>
                <Line data={chartData} options={chartOptions} />
              </div>
              <div className="text-xs text-muted mt-2">
                Assumes {inputs.accumulationReturn}% annual returns, {inputs.inflationRate}% inflation, ₹{inputs.monthlyContribution.toLocaleString('en-IN')}/mo SIP.
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
