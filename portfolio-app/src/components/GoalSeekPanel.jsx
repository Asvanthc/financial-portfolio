import React, { useEffect, useMemo, useState } from 'react'
import { api } from '../api'
import { money, percent } from '../format'
import useNarrow from '../useNarrow'

// Two questions people actually ask, so two modes:
//
//   "Add money"  — I have (or can find) some cash: where does it go? With a budget it
//                  splits by how far below target each thing is; without one it shows
//                  the minimum needed to bring everything up to target by buying only.
//   "Rebalance"  — I don't want to add anything: what do I sell and buy to be on target?
//
// Both drill all the way down to individual holdings, because "put ₹20k into MF" is
// not an instruction you can act on — "put ₹12.3k into Nippon Nifty50" is.

const MODES = [
  { id: 'add', label: 'Add money', hint: 'Buy only — never sells' },
  { id: 'rebalance', label: 'Rebalance', hint: 'Allows selling to hit targets exactly' },
]

function GapCell({ nowPct, targetPct, suffix }) {
  if (!(targetPct > 0)) return <span className="text-dim">—</span>
  const gap = targetPct - nowPct
  return (
    <div>
      <span style={{ color: 'var(--cyan)' }}>{nowPct.toFixed(1)}%</span>
      <span style={{ color: 'var(--text3)' }}> / </span>
      <span style={{ color: 'var(--green)' }}>{targetPct.toFixed(1)}%</span>
      {Math.abs(gap) >= 0.5 && (
        <div style={{ fontSize: 10, color: gap > 0 ? 'var(--orange)' : 'var(--text3)' }}>
          {gap > 0 ? `${gap.toFixed(1)}% under` : `${Math.abs(gap).toFixed(1)}% over`}
        </div>
      )}
      {suffix && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{suffix}</div>}
    </div>
  )
}

function SumWarning({ label, sum, untargeted }) {
  const s = Number(sum) || 0
  const off = Math.abs(s - 100) >= 0.05 && s > 0
  if (!off && !untargeted) return null
  return (
    <div className="text-xs" style={{ color: 'var(--orange)', marginTop: 2 }}>
      {off && <>{label} targets add up to {percent(s)}{s < 100 ? ` — ${percent(100 - s)} unassigned` : ' — over 100%'}. </>}
      {untargeted > 0 && <>{untargeted} item{untargeted === 1 ? '' : 's'} here {untargeted === 1 ? 'has' : 'have'} no target.</>}
    </div>
  )
}


// On a phone the 5-column table clipped its own numbers — the "After" column was
// entirely off-screen and "₹2.77L" painted as "₹2.77", i.e. wrong by 100,000x.
// Stacked rows have no columns to overflow.
function StackedRow({ name, meta, note, current, nowPct, targetPct, amount, after, amountLabel, depth = 0 }) {
  const gap = targetPct > 0 ? targetPct - nowPct : 0
  return (
    <div className="gs-stack-row" style={{ paddingLeft: 12 + depth * 14 }}>
      <div className="gs-stack-head">
        <span className="gs-stack-name">{depth > 0 ? (depth > 1 ? '· ' : '↳ ') : ''}{name}</span>
        {amount > 0 && (
          <span className="gs-stack-amount">{amountLabel}<strong>{money(amount)}</strong></span>
        )}
      </div>
      <div className="gs-stack-meta">
        <span>now <strong style={{ color: 'var(--purple)' }}>{money(current)}</strong></span>
        {targetPct > 0 && (
          <span>
            <span style={{ color: 'var(--cyan)' }}>{nowPct.toFixed(1)}%</span>
            {' / '}<span style={{ color: 'var(--green)' }}>{targetPct.toFixed(1)}%</span>
            {Math.abs(gap) >= 0.5 && (
              <span style={{ color: gap > 0 ? 'var(--orange)' : 'var(--text3)' }}>
                {' '}({Math.abs(gap).toFixed(1)}% {gap > 0 ? 'under' : 'over'})
              </span>
            )}
            {meta && <span className="text-dim"> {meta}</span>}
          </span>
        )}
        {amount > 0 && <span>after <strong>{money(after)}</strong></span>}
      </div>
      {note}
    </div>
  )
}

export default function GoalSeekPanel({ analytics, totalCurrent, portfolio, budget, setBudget, onOpenTargets }) {
  const narrow = useNarrow()
  const [open, setOpen] = useState(false)
  const [mode, setMode] = useState('add')
  const [detailed, setDetailed] = useState(true)
  const [tree, setTree] = useState(null)
  const [plan, setPlan] = useState(null)
  const [loading, setLoading] = useState(false)

  const budgetNum = Number(budget) || 0
  const divisions = analytics.divisions || []
  const minRequired = analytics.requiredTotalAddition || 0

  // Only fetch what the open panel is actually showing.
  useEffect(() => {
    if (!open) return
    let alive = true
    setLoading(true)
    const p = mode === 'add' ? api.goalSeek(budgetNum) : api.rebalancePlan(budgetNum)
    p.then(res => {
      if (!alive) return
      if (mode === 'add') setTree(res); else setPlan(res)
    }).finally(() => alive && setLoading(false))
    return () => { alive = false }
  }, [open, mode, budgetNum, totalCurrent, analytics])

  const projTotal = totalCurrent + (budgetNum > 0 ? budgetNum : minRequired)
  // Always the cascaded split, in both modes. Mixing the two quantities — parent rows
  // showing the division's own minimum while children showed each child's independent
  // minimum — meant the indented rows never added up to the row above them.
  // `allocationByChild` is derived from whatever the parent actually receives, so it does.
  const amountFor = (divId, childId) => tree?.divisions?.[divId]?.allocationByChild?.[childId] || 0
  const holdingAmountFor = (divId, subId, hId) =>
    tree?.divisions?.[divId]?.subdivisions?.[subId]?.allocationByHolding?.[hId] || 0

  const divisionAmount = (d) => {
    if (budgetNum > 0) return tree?.divisions?.[d.id]?.incoming || 0
    return Number(d.requiredAddition) || 0
  }

  const headline = useMemo(() => {
    if (mode === 'rebalance') {
      if (!plan) return null
      return budgetNum > 0
        ? `Deploying ${money(budgetNum)} and rebalancing: buy ${money(plan.totalBuy)}, sell ${money(plan.totalSell)}`
        : `Cash-neutral: sell ${money(plan.totalSell)}, buy ${money(plan.totalBuy)}`
    }
    return budgetNum > 0
      ? `Splitting ${money(budgetNum)} · portfolio after ${money(totalCurrent + budgetNum)}`
      : `Minimum to reach every target: ${money(minRequired)} · portfolio after ${money(projTotal)}`
  }, [mode, plan, budgetNum, minRequired, totalCurrent, projTotal])

  return (
    <div className="card-lg section">
      <div className="flex items-center gap-2" style={{ cursor: 'pointer' }} onClick={() => setOpen(x => !x)}
        role="button" tabIndex={0} aria-expanded={open}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpen(x => !x) } }}>
        <span className="section-title" style={{ color: 'var(--indigo)' }}>Goal Seek — Rebalancing</span>
        {analytics.drift?.divisionDrift > 0 && (
          <span className="text-xs" style={{ color: analytics.drift.divisionDrift > 5 ? 'var(--orange)' : 'var(--text3)' }}
            title="Share of the portfolio that would have to change hands to be on target">
            {percent(analytics.drift.divisionDrift)} off target
          </span>
        )}
        <span className="chevron" style={{ marginLeft: 'auto', color: 'var(--text3)', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
      </div>

      <div className="flex items-center gap-2 text-sm text-muted mt-2" style={{ flexWrap: 'wrap' }}>
        <span>{headline}</span>
        <div className="ml-auto flex items-center gap-2">
          <span className="text-dim text-xs">Budget ₹</span>
          <input className="input input-sm" style={{ width: 110 }} type="number" min="0"
            placeholder="e.g. 50000" value={budget} onChange={e => setBudget(e.target.value)}
            aria-label="Investment budget" />
          {budgetNum > 0 && <button className="btn-icon" aria-label="Clear budget" onClick={() => setBudget('')}>✕</button>}
        </div>
      </div>

      {open && (
        <>
          <div className="flex items-center gap-2 mt-3" style={{ flexWrap: 'wrap' }}>
            <div className="mode-switch">
              {MODES.map(m => (
                <button key={m.id} className={`mode-btn${mode === m.id ? ' active' : ''}`}
                  onClick={() => setMode(m.id)} title={m.hint}>
                  {m.label}
                </button>
              ))}
            </div>
            {mode === 'add' && (
              <label className="text-xs text-muted flex items-center gap-1" style={{ cursor: 'pointer' }}>
                <input type="checkbox" checked={detailed} onChange={e => setDetailed(e.target.checked)} />
                break down to individual holdings
              </label>
            )}
            <span className="text-xs text-dim ml-auto">
              {MODES.find(m => m.id === mode)?.hint}
            </span>
          </div>

          {loading && <div className="text-xs text-dim mt-3">calculating…</div>}

          {mode === 'add' ? (
            narrow ? (
              <div className="mt-3">
                {divisions.map(d => {
                  const add = divisionAmount(d)
                  const divNode = tree?.divisions?.[d.id]
                  const div = portfolio.divisions?.find(x => x.id === d.id)
                  return (
                    <React.Fragment key={d.id}>
                      <StackedRow
                        name={d.name} meta="of portfolio" current={d.current}
                        nowPct={d.currentPercent || 0} targetPct={d.targetPercent || 0}
                        amount={add} after={(Number(d.current) || 0) + add}
                        amountLabel={budgetNum > 0 ? 'allocate ' : 'add '}
                        note={<SumWarning label="Its children's" sum={d.childTargetSum} untargeted={divNode?.untargeted || 0} />}
                      />
                      {detailed && (div?.subdivisions || []).map(sub => {
                        const subAna = (d.subdivisions || []).find(x => x.id === sub.id) || {}
                        const subAdd = amountFor(d.id, sub.id)
                        return (
                          <React.Fragment key={sub.id}>
                            <StackedRow
                              depth={1} name={sub.name} meta={`of ${d.name}`} current={subAna.current || 0}
                              nowPct={subAna.currentPercent || 0} targetPct={subAna.targetPercent || 0}
                              amount={subAdd} after={(subAna.current || 0) + subAdd}
                              amountLabel={budgetNum > 0 ? 'allocate ' : 'add '}
                            />
                            {(subAna.holdings || []).map(h => {
                              const hAdd = holdingAmountFor(d.id, sub.id, h.id)
                              if (!(hAdd > 0) && !(h.targetPercent > 0)) return null
                              return (
                                <StackedRow
                                  key={h.id} depth={2} name={h.name} meta={`of ${sub.name}`} current={h.current}
                                  nowPct={h.currentPercent || 0} targetPct={h.targetPercent || 0}
                                  amount={hAdd} after={(h.current || 0) + hAdd}
                                  amountLabel={budgetNum > 0 ? 'allocate ' : 'add '}
                                />
                              )
                            })}
                          </React.Fragment>
                        )
                      })}
                      {detailed && (d.holdings || []).map(h => {
                        const hAdd = amountFor(d.id, h.id)
                        if (!(hAdd > 0) && !(h.targetPercent > 0)) return null
                        return (
                          <StackedRow
                            key={h.id} depth={1} name={h.name} meta={`of ${d.name}`} current={h.current}
                            nowPct={h.currentPercent || 0} targetPct={h.targetPercent || 0}
                            amount={hAdd} after={(h.current || 0) + hAdd}
                            amountLabel={budgetNum > 0 ? 'allocate ' : 'add '}
                          />
                        )
                      })}
                    </React.Fragment>
                  )
                })}
              </div>
            ) : (
            <div className="scroll-x mt-3">
              <table className="gs-table">
                <thead>
                  <tr>
                    <th>Division / holding</th>
                    <th className="right">Current</th>
                    <th className="right">Now / target</th>
                    <th className="right">{budgetNum > 0 ? 'Allocate' : 'Add (min)'}</th>
                    <th className="right">After</th>
                  </tr>
                </thead>
                <tbody>
                  {divisions.map(d => {
                    const add = divisionAmount(d)
                    const after = (Number(d.current) || 0) + add
                    const divNode = tree?.divisions?.[d.id]
                    const div = portfolio.divisions?.find(x => x.id === d.id)
                    return (
                      <React.Fragment key={d.id}>
                        <tr>
                          <td style={{ fontWeight: 700 }}>
                            {d.name}
                            <SumWarning label="Its children's" sum={d.childTargetSum} untargeted={divNode?.untargeted || 0} />
                          </td>
                          <td className="right num" style={{ color: 'var(--purple)' }}>{money(d.current)}</td>
                          <td className="right num">
                            <GapCell nowPct={d.currentPercent || 0} targetPct={d.targetPercent || 0} suffix="of portfolio" />
                          </td>
                          <td className="right num" style={{ color: add > 0 ? 'var(--orange)' : 'var(--text3)', fontWeight: 700 }}>
                            {add > 0 ? money(add) : '—'}
                          </td>
                          <td className="right num" style={{ color: 'var(--purple)' }}>{money(after)}</td>
                        </tr>

                        {detailed && (div?.subdivisions || []).map(sub => {
                          const subAna = (d.subdivisions || []).find(s => s.id === sub.id) || {}
                          const subAdd = amountFor(d.id, sub.id)
                          const subNode = divNode?.subdivisions?.[sub.id]
                          return (
                            <React.Fragment key={sub.id}>
                              <tr style={{ background: 'rgba(129,140,248,0.05)' }}>
                                <td style={{ paddingLeft: 26, fontSize: 12, color: 'var(--text2)' }}>
                                  ↳ {sub.name}
                                  <SumWarning label="Its holdings'" sum={subAna.targetSum} untargeted={subNode?.untargeted || 0} />
                                </td>
                                <td className="right num text-sm" style={{ color: 'var(--text2)' }}>{money(subAna.current || 0)}</td>
                                <td className="right num text-sm">
                                  <GapCell nowPct={subAna.currentPercent || 0} targetPct={subAna.targetPercent || 0} suffix={`of ${d.name}`} />
                                </td>
                                <td className="right num text-sm" style={{ color: subAdd > 0 ? 'var(--orange)' : 'var(--text3)' }}>
                                  {subAdd > 0 ? money(subAdd) : '—'}
                                </td>
                                <td className="right num text-sm" style={{ color: 'var(--purple)' }}>{money((subAna.current || 0) + subAdd)}</td>
                              </tr>
                              {(subAna.holdings || []).map(h => {
                                const hAdd = holdingAmountFor(d.id, sub.id, h.id)
                                if (!(hAdd > 0) && !(h.targetPercent > 0)) return null
                                return (
                                  <tr key={h.id}>
                                    <td style={{ paddingLeft: 46, fontSize: 12, color: 'var(--text3)' }}>· {h.name}</td>
                                    <td className="right num text-xs" style={{ color: 'var(--text3)' }}>{money(h.current)}</td>
                                    <td className="right num text-xs">
                                      <GapCell nowPct={h.currentPercent || 0} targetPct={h.targetPercent || 0} suffix={`of ${sub.name}`} />
                                    </td>
                                    <td className="right num text-xs" style={{ color: hAdd > 0 ? 'var(--orange)' : 'var(--text3)', fontWeight: 700 }}>
                                      {hAdd > 0 ? money(hAdd) : '—'}
                                    </td>
                                    <td className="right num text-xs" style={{ color: 'var(--text3)' }}>{money((h.current || 0) + hAdd)}</td>
                                  </tr>
                                )
                              })}
                            </React.Fragment>
                          )
                        })}

                        {detailed && (d.holdings || []).map(h => {
                          const hAdd = amountFor(d.id, h.id)
                          if (!(hAdd > 0) && !(h.targetPercent > 0)) return null
                          return (
                            <tr key={h.id} style={{ background: 'rgba(129,140,248,0.03)' }}>
                              <td style={{ paddingLeft: 26, fontSize: 12, color: 'var(--text2)' }}>↳ {h.name}</td>
                              <td className="right num text-sm" style={{ color: 'var(--text2)' }}>{money(h.current)}</td>
                              <td className="right num text-sm">
                                <GapCell nowPct={h.currentPercent || 0} targetPct={h.targetPercent || 0} suffix={`of ${d.name}`} />
                              </td>
                              <td className="right num text-sm" style={{ color: hAdd > 0 ? 'var(--orange)' : 'var(--text3)' }}>
                                {hAdd > 0 ? money(hAdd) : '—'}
                              </td>
                              <td className="right num text-sm" style={{ color: 'var(--purple)' }}>{money((h.current || 0) + hAdd)}</td>
                            </tr>
                          )
                        })}
                      </React.Fragment>
                    )
                  })}
                </tbody>
              </table>
              {tree && Math.abs((tree.divisionTargetSum || 0) - 100) >= 0.05 && (
                <div className="text-xs" style={{ color: 'var(--orange)', marginTop: 8 }}>
                  Division targets add up to {percent(tree.divisionTargetSum)}, not 100%
                  {onOpenTargets && <> — <button className="btn-icon" style={{ padding: 0, color: 'var(--cyan)' }} onClick={onOpenTargets}>fix that</button></>}.
                </div>
              )}
            </div>
            )
          ) : (
            <div className="mt-3">
              {plan && plan.actions?.length > 0 ? (
                <>
                  <div className="flex gap-3 mb-3" style={{ flexWrap: 'wrap' }}>
                    <div className="metric-card" style={{ flex: '1 1 130px' }}>
                      <div className="metric-label">Sell</div>
                      <div className="metric-value" style={{ color: 'var(--red)', fontSize: 17 }}>{money(plan.totalSell)}</div>
                    </div>
                    <div className="metric-card" style={{ flex: '1 1 130px' }}>
                      <div className="metric-label">Buy</div>
                      <div className="metric-value" style={{ color: 'var(--green)', fontSize: 17 }}>{money(plan.totalBuy)}</div>
                    </div>
                    <div className="metric-card" style={{ flex: '1 1 130px' }}>
                      <div className="metric-label">Net cash needed</div>
                      <div className="metric-value" style={{ color: Math.abs(plan.netCash) < 1 ? 'var(--text2)' : 'var(--cyan)', fontSize: 17 }}>
                        {Math.abs(plan.netCash) < 1 ? 'nothing' : money(plan.netCash)}
                      </div>
                    </div>
                    <div className="metric-card" style={{ flex: '1 1 130px' }}>
                      <div className="metric-label">Trades</div>
                      <div className="metric-value" style={{ color: 'var(--purple)', fontSize: 17 }}>{plan.actions.length}</div>
                    </div>
                  </div>
                  <div className="scroll-x">
                    <table className="gs-table">
                      <thead>
                        <tr>
                          <th>Action</th>
                          <th>Holding</th>
                          <th className="right">Now</th>
                          <th className="right">Should be</th>
                          <th className="right">Difference</th>
                        </tr>
                      </thead>
                      <tbody>
                        {plan.actions.map(a => (
                          <tr key={a.holdingId}>
                            <td>
                              <span className="platform-badge" style={{
                                background: a.action === 'buy' ? 'var(--green-dim)' : 'var(--red-dim)',
                                color: a.action === 'buy' ? 'var(--green)' : 'var(--red)',
                                border: `1px solid ${a.action === 'buy' ? 'rgba(74,222,128,0.3)' : 'rgba(248,113,113,0.3)'}`,
                              }}>{a.action}</span>
                            </td>
                            <td>
                              <div style={{ fontWeight: 600 }}>{a.name}</div>
                              <div className="text-xs text-dim">{a.path}</div>
                            </td>
                            <td className="right num" style={{ color: 'var(--text2)' }}>{money(a.current)}</td>
                            <td className="right num" style={{ color: 'var(--purple)' }}>{money(a.ideal)}</td>
                            <td className="right num" style={{ fontWeight: 700, color: a.delta > 0 ? 'var(--green)' : 'var(--red)' }}>
                              {a.delta > 0 ? '+' : ''}{money(a.delta)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {plan.unplaced?.length > 0 && (
                    <div className="text-xs" style={{ color: 'var(--orange)', marginTop: 8 }}>
                      {plan.unplaced.map(u => `${money(u.amount)} is meant for ${u.name} but ${u.reason}`).join('; ')}.
                      Add a holding there, or move that target elsewhere.
                    </div>
                  )}
                  <div className="text-xs text-dim mt-2">
                    {budgetNum > 0
                      ? `Assumes you add ${money(budgetNum)}. Targets are scaled to add up to 100% at each level before the split.`
                      : 'Cash-neutral by construction: every rupee sold is bought back somewhere under-weight. Mind exit loads, lock-ins and capital-gains tax before acting on it.'}
                    {' '}Groups with no per-holding targets keep their current internal mix.
                  </div>
                </>
              ) : (
                <div className="text-sm text-dim" style={{ padding: '12px 0' }}>
                  {loading ? 'calculating…' : plan ? 'Nothing to do — everything is within a rupee of its target.' : ''}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  )
}
