import React, { useMemo, useState } from 'react'
import { Line } from 'react-chartjs-2'
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler } from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler)

function fmt(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`
}

// "Expected annual return" is treated as an EFFECTIVE annual rate, so the monthly
// rate is the 12th root — (1+r)^(1/12)-1 — not r/12. r/12 would silently deliver
// 12.68% a year for a 12% input.
function monthlyRate(annualPct) {
  const r = Number(annualPct) / 100
  if (!Number.isFinite(r) || r <= -1) return 0
  return Math.pow(1 + r, 1 / 12) - 1
}

// Month-by-month simulation. Contributions land at the END of each month (ordinary
// annuity), the SIP steps up on each anniversary, and the yearly lumpsum lands at
// the end of each year. Returns a per-year series plus the closing figures.
function simulate({ startValue, startCost, annualReturn, monthlySip, stepUpPct, yearlyLumpsum, years, inflationPct }) {
  const rm = monthlyRate(annualReturn)
  const step = Math.max(0, Number(stepUpPct) || 0) / 100
  const infl = Number(inflationPct) / 100
  const nYears = Math.max(0, Math.min(60, Math.round(Number(years) || 0)))

  let value = Math.max(0, Number(startValue) || 0)
  let cost = Math.max(0, Number(startCost) || 0)
  let sip = Math.max(0, Number(monthlySip) || 0)
  const lump = Math.max(0, Number(yearlyLumpsum) || 0)

  const series = [{ year: 0, value, cost, real: value, added: 0 }]
  let added = 0

  for (let y = 1; y <= nYears; y++) {
    for (let m = 0; m < 12; m++) {
      value = value * (1 + rm) + sip
      cost += sip
      added += sip
    }
    if (lump > 0) { value += lump; cost += lump; added += lump }
    const deflator = Number.isFinite(infl) && infl > -1 ? Math.pow(1 + infl, y) : 1
    series.push({ year: y, value, cost, real: value / deflator, added })
    sip = sip * (1 + step)
  }

  const last = series[series.length - 1]
  return {
    series,
    finalValue: last.value,
    finalCost: last.cost,
    finalReal: last.real,
    totalAdded: last.added,
    gain: last.value - last.cost,
    sipAtEnd: sip,
    // Money-weighted growth of the whole plan, useful as a sanity check.
    multiple: last.cost > 0 ? last.value / last.cost : 0,
  }
}

// Monthly SIP required to land exactly on `target` in `years`, given the current
// corpus grows too. Solved in closed form for a level (non-stepped) SIP.
function requiredSip({ startValue, annualReturn, years, target }) {
  const rm = monthlyRate(annualReturn)
  const n = Math.max(0, Math.round(Number(years) || 0)) * 12
  const T = Number(target) || 0
  const P = Math.max(0, Number(startValue) || 0)
  if (n === 0 || T <= 0) return null
  const grown = P * Math.pow(1 + rm, n)
  const shortfall = T - grown
  if (shortfall <= 0) return 0
  if (rm === 0) return shortfall / n
  return shortfall * rm / (Math.pow(1 + rm, n) - 1)
}

function Slider({ label, value, min, max, step = 1, unit = '', onChange, color = 'var(--cyan)' }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <div className="flex items-center gap-2">
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={e => onChange(Number(e.target.value))}
          style={{ flex: 1, accentColor: color }} />
        <span style={{ width: 62, textAlign: 'right', color, fontWeight: 700, fontSize: 14 }}>{value}{unit}</span>
      </div>
    </div>
  )
}

function Num({ label, value, onChange, hint }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      <input className="input" type="number" min="0" value={value === 0 ? '' : value} placeholder="0"
        onChange={e => onChange(Math.max(0, Number(e.target.value) || 0))} />
      {hint && <span style={{ fontSize: 10, color: 'var(--text3)' }}>{hint}</span>}
    </div>
  )
}

/**
 * Forward projection of the investment portfolio.
 * `currentValue` / `investedValue` come from portfolio analytics — bank cash is
 * deliberately NOT part of this, since it isn't earning the portfolio's return.
 */
export default function ProjectionPanel({ currentValue = 0, investedValue = 0 }) {
  const [inp, setInp] = useState({
    startValue: Math.round(currentValue),
    annualReturn: 12,
    monthlySip: 0,
    stepUpPct: 10,
    yearlyLumpsum: 0,
    years: 15,
    inflationPct: 6,
    target: 0,
  })
  const [overrideStart, setOverrideStart] = useState(false)
  const set = (k, v) => setInp(p => ({ ...p, [k]: v }))

  // Follow the live portfolio value unless the user has typed their own number.
  const startValue = overrideStart ? inp.startValue : Math.round(currentValue)

  // Cost basis for the "Gain" column. Only the real portfolio has a real invested
  // amount — once the user models a hypothetical starting corpus, treating it as
  // already-gained (or already-lost) money would invent a profit they never made.
  const startCost = overrideStart ? startValue : (investedValue > 0 ? investedValue : startValue)

  const base = useMemo(() => simulate({
    startValue,
    startCost,
    annualReturn: inp.annualReturn,
    monthlySip: inp.monthlySip,
    stepUpPct: inp.stepUpPct,
    yearlyLumpsum: inp.yearlyLumpsum,
    years: inp.years,
    inflationPct: inp.inflationPct,
  }), [startValue, startCost, inp])

  // Return sensitivity — same contributions, worse/better markets.
  const scenarios = useMemo(() => {
    const deltas = [
      { key: 'Bear', d: -4, color: 'var(--red)' },
      { key: 'Conservative', d: -2, color: 'var(--orange)' },
      { key: 'Base', d: 0, color: 'var(--cyan)' },
      { key: 'Bull', d: +3, color: 'var(--green)' },
    ]
    return deltas.map(s => {
      const r = Math.max(0, inp.annualReturn + s.d)
      const sim = simulate({
        startValue,
        startCost,
        annualReturn: r,
        monthlySip: inp.monthlySip,
        stepUpPct: inp.stepUpPct,
        yearlyLumpsum: inp.yearlyLumpsum,
        years: inp.years,
        inflationPct: inp.inflationPct,
      })
      return { ...s, rate: r, ...sim }
    })
  }, [startValue, startCost, inp])

  // Milestones — first year the corpus crosses each round number.
  const milestones = useMemo(() => {
    const marks = [1e6, 5e6, 1e7, 2.5e7, 5e7, 1e8]
    return marks
      .filter(m => m > startValue)
      .map(m => {
        const hit = base.series.find(s => s.value >= m)
        return { amount: m, year: hit ? hit.year : null }
      })
      .filter(x => x.year !== null)
      .slice(0, 4)
  }, [base, startValue])

  const sipForTarget = inp.target > 0
    ? requiredSip({ startValue, annualReturn: inp.annualReturn, years: inp.years, target: inp.target })
    : null

  const chartData = {
    labels: base.series.map(s => `Y${s.year}`),
    datasets: [
      {
        label: 'Projected value',
        data: base.series.map(s => Math.round(s.value)),
        borderColor: '#22d3ee',
        backgroundColor: 'rgba(34,211,238,0.10)',
        fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2,
      },
      {
        label: 'Inflation-adjusted (today’s ₹)',
        data: base.series.map(s => Math.round(s.real)),
        borderColor: '#a78bfa',
        borderDash: [5, 4], fill: false, tension: 0.35, pointRadius: 0, borderWidth: 2,
      },
      {
        label: 'Money you put in',
        data: base.series.map(s => Math.round(s.cost)),
        borderColor: '#64748b',
        fill: false, tension: 0.2, pointRadius: 0, borderWidth: 1.5,
      },
    ],
  }

  const chartOpts = {
    responsive: true, maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { labels: { color: '#94a3b8', font: { size: 11 }, boxWidth: 14 } },
      tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${fmt(ctx.raw)}` } },
    },
    scales: {
      x: { ticks: { color: '#64748b', maxTicksLimit: 12, font: { size: 10 } }, grid: { color: '#1f2937' } },
      y: { ticks: { color: '#64748b', callback: v => fmt(v), font: { size: 10 } }, grid: { color: '#1f2937' } },
    },
  }

  const tableYears = base.series.filter(s =>
    s.year === 0 || s.year === base.series.length - 1 || s.year % (inp.years > 20 ? 5 : inp.years > 10 ? 2 : 1) === 0
  )

  return (
    <div className="section">
      <div className="section-header">
        <h2 className="section-title">Projection — where this portfolio lands</h2>
        <span style={{ fontSize: 11, color: 'var(--text3)' }}>
          Investment portfolio only · bank cash excluded
        </span>
      </div>

      {/* Inputs */}
      <div className="card-lg mb-4">
        <div className="fire-inputs">
          <div className="form-group">
            <label className="form-label">Starting corpus</label>
            <input className="input" type="number" value={startValue}
              onChange={e => { setOverrideStart(true); set('startValue', Math.max(0, Number(e.target.value) || 0)) }} />
            <span style={{ fontSize: 10, color: 'var(--text3)' }}>
              {overrideStart
                ? <button className="btn-icon" style={{ fontSize: 10, padding: 0 }} onClick={() => setOverrideStart(false)}>↺ use live value {fmt(currentValue)}</button>
                : 'live portfolio value'}
            </span>
          </div>
          <Num label="Monthly addition (SIP)" value={inp.monthlySip} onChange={v => set('monthlySip', v)} hint="extra invested every month" />
          <Num label="Yearly lumpsum" value={inp.yearlyLumpsum} onChange={v => set('yearlyLumpsum', v)} hint="bonus / annual top-up" />
          <Num label="Target corpus (optional)" value={inp.target} onChange={v => set('target', v)} hint="to back-solve the SIP needed" />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 16 }}>
          <Slider label="Expected annual return" value={inp.annualReturn} min={0} max={25} step={0.5} unit="%" onChange={v => set('annualReturn', v)} />
          <Slider label="Yearly SIP step-up" value={inp.stepUpPct} min={0} max={25} step={1} unit="%" onChange={v => set('stepUpPct', v)} color="var(--green)" />
          <Slider label="Horizon" value={inp.years} min={1} max={40} step={1} unit="y" onChange={v => set('years', v)} color="var(--purple)" />
          <Slider label="Inflation" value={inp.inflationPct} min={0} max={12} step={0.5} unit="%" onChange={v => set('inflationPct', v)} color="var(--orange)" />
        </div>
      </div>

      {/* Headline results */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12, marginBottom: 20 }}>
        <div className="fire-result">
          <div className="fire-result-label">Value in {inp.years} years</div>
          <div className="fire-result-value" style={{ color: 'var(--cyan)' }}>{fmt(base.finalValue)}</div>
          <div className="fire-result-sub">at {inp.annualReturn}% a year</div>
        </div>
        <div className="fire-result">
          <div className="fire-result-label">In today's money</div>
          <div className="fire-result-value" style={{ color: 'var(--purple)' }}>{fmt(base.finalReal)}</div>
          <div className="fire-result-sub">after {inp.inflationPct}% inflation</div>
        </div>
        <div className="fire-result">
          <div className="fire-result-label">You will have added</div>
          <div className="fire-result-value" style={{ color: 'var(--orange)' }}>{fmt(base.totalAdded)}</div>
          <div className="fire-result-sub">
            {inp.monthlySip > 0
              ? `SIP grows to ${fmt(base.sipAtEnd)}/mo at ${inp.stepUpPct}% step-up`
              : 'no fresh additions assumed'}
          </div>
        </div>
        <div className="fire-result">
          <div className="fire-result-label">Growth on top</div>
          <div className="fire-result-value" style={{ color: base.gain >= 0 ? 'var(--green)' : 'var(--red)' }}>{fmt(base.gain)}</div>
          <div className="fire-result-sub">
            {base.multiple > 0 ? `${base.multiple.toFixed(2)}× money put in` : '—'}
          </div>
        </div>
        {sipForTarget !== null && (
          <div className="fire-result">
            <div className="fire-result-label">SIP needed for {fmt(inp.target)}</div>
            <div className="fire-result-value" style={{ color: sipForTarget === 0 ? 'var(--green)' : 'var(--indigo)' }}>
              {sipForTarget === 0 ? 'Already there' : `${fmt(sipForTarget)}/mo`}
            </div>
            <div className="fire-result-sub">
              {sipForTarget === 0
                ? 'current corpus alone gets you there'
                : `level SIP, no step-up · you plan ${fmt(inp.monthlySip)}/mo`}
            </div>
          </div>
        )}
      </div>

      {/* Growth chart */}
      <div className="card-lg mb-4">
        <div className="card-title">Growth path</div>
        <div style={{ height: 300 }}><Line data={chartData} options={chartOpts} /></div>
        <div className="text-xs text-dim mt-2">
          {fmt(startValue)} today, {fmt(inp.monthlySip)}/mo stepping up {inp.stepUpPct}% a year
          {inp.yearlyLumpsum > 0 ? `, plus ${fmt(inp.yearlyLumpsum)} once a year` : ''}, compounding at {inp.annualReturn}%.
        </div>
      </div>

      {/* Scenarios + milestones */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16, marginBottom: 20 }}>
        <div className="card-lg">
          <div className="card-title">If returns come in different</div>
          <div style={{ overflowX: 'auto' }}>
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>Scenario</th>
                  <th className="right">Return</th>
                  <th className="right">In {inp.years}y</th>
                  <th className="right">Today's ₹</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map(s => (
                  <tr key={s.key}>
                    <td>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 2, background: s.color }} />
                        {s.key}
                      </span>
                    </td>
                    <td className="right num" style={{ color: 'var(--text2)' }}>{s.rate.toFixed(1)}%</td>
                    <td className="right num" style={{ color: s.color }}>{fmt(s.finalValue)}</td>
                    <td className="right num" style={{ color: 'var(--text2)' }}>{fmt(s.finalReal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {milestones.length > 0 && (
          <div className="card-lg">
            <div className="card-title">When you cross</div>
            <div style={{ overflowX: 'auto' }}>
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>Milestone</th>
                    <th className="right">Reached in</th>
                    <th className="right">Worth then (today's ₹)</th>
                  </tr>
                </thead>
                <tbody>
                  {milestones.map(m => {
                    const row = base.series.find(s => s.year === m.year)
                    return (
                      <tr key={m.amount}>
                        <td style={{ fontWeight: 700, color: 'var(--cyan)' }}>{fmt(m.amount)}</td>
                        <td className="right num">{m.year === 0 ? 'now' : `${m.year} yr${m.year === 1 ? '' : 's'}`}</td>
                        <td className="right num" style={{ color: 'var(--text2)' }}>{row ? fmt(row.real) : '—'}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="text-xs text-dim mt-2">Based on the base-case {inp.annualReturn}% path above.</div>
          </div>
        )}
      </div>

      {/* Year by year */}
      <div className="card-lg">
        <div className="card-title">Year by year</div>
        <div style={{ overflowX: 'auto' }}>
          <table className="holdings-table">
            <thead>
              <tr>
                <th>Year</th>
                <th className="right">Put in (total)</th>
                <th className="right">Value</th>
                <th className="right">Gain</th>
                <th className="right">Today's ₹</th>
              </tr>
            </thead>
            <tbody>
              {tableYears.map(s => {
                const gain = s.value - s.cost
                return (
                  <tr key={s.year}>
                    <td style={{ fontWeight: 600 }}>{s.year === 0 ? 'Now' : `Year ${s.year}`}</td>
                    <td className="right num" style={{ color: 'var(--text2)' }}>{fmt(s.cost)}</td>
                    <td className="right num" style={{ color: 'var(--cyan)' }}>{fmt(s.value)}</td>
                    <td className="right num"><span className={gain >= 0 ? 'pos' : 'neg'}>{gain >= 0 ? '+' : ''}{fmt(gain)}</span></td>
                    <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(s.real)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <div className="text-xs text-dim mt-2">
          {overrideStart
            ? `"Put in" starts from the ${fmt(startValue)} you typed above, so "Gain" is purely the projected growth on it.`
            : `"Put in" starts from what you have actually invested (${fmt(startCost)}) and adds every future contribution, so "Gain" is real profit, not just paper growth on the starting value.`}
        </div>
      </div>
    </div>
  )
}
