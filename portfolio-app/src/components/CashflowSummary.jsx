import React, { useMemo, useState } from 'react'
import { money, percent, signedMoney } from '../format'

// Ties the Expenses tab back to the portfolio.
//
// Money you earn goes to exactly three places: you spend it, you invest it, or it sits in
// the bank. So over the same period:
//
//     income − expenses  =  invested  +  bank cash  +  anything unaccounted for
//
// The last term is the useful one. If it's near zero the two halves of the app agree; if
// it isn't, either some spending never got logged, or you invested from savings made
// before you started tracking. Showing the subtraction is the whole point — it's a
// reference figure, not a verdict.

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const monthLabel = (y, m) => `${MONTHS[m - 1]} ${y}`

function Card({ label, value, color, sub, tone }) {
  return (
    <div className="kpi-card" style={tone ? { borderColor: tone } : undefined}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value" style={{ color, fontSize: 22 }}>{value}</div>
      {sub && <div className="kpi-sub text-dim">{sub}</div>}
    </div>
  )
}

export default function CashflowSummary({ expenses = [], totalInvested = 0, bankTotal = 0 }) {
  const [open, setOpen] = useState(true)

  const flow = useMemo(() => {
    let income = 0, spend = 0
    const months = new Set()
    expenses.forEach(e => {
      const amt = Number(e.amount) || 0
      const y = Number(e.year), m = Number(e.month)
      if (y && m) months.add(y * 12 + m)
      if (e.type === 'income') income += amt
      else spend += amt
    })
    const keys = [...months].sort((a, b) => a - b)
    const first = keys.length ? { year: Math.floor((keys[0] - 1) / 12), month: ((keys[0] - 1) % 12) + 1 } : null
    const last = keys.length ? { year: Math.floor((keys[keys.length - 1] - 1) / 12), month: ((keys[keys.length - 1] - 1) % 12) + 1 } : null
    return {
      income, spend, saved: income - spend,
      rate: income > 0 ? ((income - spend) / income) * 100 : 0,
      monthCount: keys.length, first, last,
    }
  }, [expenses])

  if (!expenses.length) return null

  // saved − invested is what the user asked to see. Bank cash explains most of it.
  const gap = flow.saved - totalInvested
  const unaccounted = gap - bankTotal
  const tolerance = Math.max(5000, Math.abs(flow.saved) * 0.02)
  const reconciled = Math.abs(unaccounted) <= tolerance

  const gapColor = Math.abs(gap) < tolerance ? 'var(--text2)' : gap > 0 ? 'var(--cyan)' : 'var(--orange)'

  const explanation = reconciled
    ? `Adds up — the gap is your bank cash (${money(bankTotal)}), within ${money(tolerance)}.`
    : unaccounted > 0
      ? `${money(unaccounted)} of those savings is neither invested nor in the bank — most likely spending that never got logged.`
      : `Your portfolio and bank hold ${money(-unaccounted)} more than the savings tracked here, which is expected if they were built up before ${flow.first ? monthLabel(flow.first.year, flow.first.month) : 'you started tracking expenses'}.`

  return (
    <div className="card-lg section">
      <div
        className="flex items-center gap-2"
        style={{ cursor: 'pointer' }}
        role="button" tabIndex={0} aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(o => !o) } }}
      >
        <span className="section-title">Cash flow vs portfolio</span>
        <span className="text-xs text-dim hide-sm">
          {flow.monthCount} month{flow.monthCount === 1 ? '' : 's'} tracked
          {flow.first && flow.last ? ` · ${monthLabel(flow.first.year, flow.first.month)} – ${monthLabel(flow.last.year, flow.last.month)}` : ''}
        </span>
        <span className="ml-auto flex items-center gap-2">
          {/* "unexplained" would be alarmist: a gap is normal when the portfolio is older
              than the expense log. State the size, not a verdict. */}
          <span className="text-xs" style={{ color: reconciled ? 'var(--green)' : 'var(--orange)' }}>
            {reconciled ? '✓ reconciles' : `off by ${money(Math.abs(unaccounted))}`}
          </span>
          <span className="chevron" style={{ color: 'var(--text3)', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
        </span>
      </div>

      {open && (
        <>
          <div className="kpi-row" style={{ marginTop: 14, marginBottom: 0 }}>
            <Card label="Total income" value={money(flow.income)} color="var(--green)"
              sub={`over ${flow.monthCount} month${flow.monthCount === 1 ? '' : 's'}`} />
            <Card label="Total expenses" value={money(flow.spend)} color="var(--red)"
              sub={flow.income > 0 ? `${percent((flow.spend / flow.income) * 100)} of income` : null} />
            <Card label="Net savings" value={money(flow.saved)} color="var(--cyan)"
              sub={flow.income > 0 ? `${percent(flow.rate)} savings rate` : null} />
            <Card label="Invested" value={money(totalInvested)} color="var(--cyan)"
              sub="from the portfolio" />
            {/* The card they asked for: the plain subtraction, for reference */}
            <Card
              label="Savings − invested"
              value={signedMoney(gap)}
              color={gapColor}
              tone={reconciled ? 'rgba(74,222,128,0.28)' : 'rgba(251,146,60,0.28)'}
              sub={bankTotal > 0 ? `bank cash ${money(bankTotal)}` : 'no bank cash recorded'}
            />
          </div>

          <div className="reconcile-line">
            <span className="reconcile-eq">
              {money(flow.income)} <span className="text-dim">income</span>
              {' − '}{money(flow.spend)} <span className="text-dim">spent</span>
              {' = '}<strong style={{ color: 'var(--cyan)' }}>{money(flow.saved)}</strong> <span className="text-dim">saved</span>
            </span>
            {/* Not "of which": when the portfolio predates the expense log this total is
                larger than the savings above it, and calling it a subset would be a lie. */}
            <span className="reconcile-eq">
              <span className="text-dim">held today:</span> {money(totalInvested)} <span className="text-dim">invested</span>
              {' + '}{money(bankTotal)} <span className="text-dim">in bank</span>
              {' = '}<strong>{money(totalInvested + bankTotal)}</strong>
            </span>
          </div>

          <div className="text-xs mt-2" style={{ color: reconciled ? 'var(--text2)' : 'var(--orange)' }}>
            {explanation}
          </div>
          <div className="text-xs text-dim mt-2">
            Invested is all-time, while expenses only cover the {flow.monthCount} month
            {flow.monthCount === 1 ? '' : 's'} you've logged — so a large gap usually just means
            the portfolio predates the expense tracking.
          </div>
        </>
      )}
    </div>
  )
}
