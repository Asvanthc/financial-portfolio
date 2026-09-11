import React, { useEffect, useState } from 'react'
import { api } from '../api'
import { toast } from '../toast'
import { money, signedMoney, percent } from '../format'
import BrokerAmountsEditor from './BrokerAmountsEditor'

// What the holdings tree cannot know: the net amount actually put into each broker.
//
// That figure is maintained outside this app and is ALREADY net of the profit and loss
// booked and of the brokerage and taxes paid. So booked P&L and charges are not inputs
// here — they're inside it. Which makes the real result a single subtraction:
//
//     capital gain  = what the holdings are worth now − net amount put in
//     total return  = capital gain + dividends
//
// The app's own P/L (current − invested) is unrealised only and ignores every cost, so
// it reads better than reality. This is the honest version.

const PLATFORMS = [
  { id: 'kite', label: 'Zerodha Kite', cls: 'platform-kite' },
  { id: 'groww', label: 'Groww', cls: 'platform-groww' },
  { id: 'indmoney', label: 'IndMoney', cls: 'platform-indmoney' },
  { id: 'bank', label: 'Bank', cls: 'platform-bank' },
  { id: 'other', label: 'Other', cls: 'platform-other' },
]
const platformOf = id => PLATFORMS.find(p => p.id === id) || PLATFORMS[4]

const FIELDS = [
  { key: 'netDeposited', label: 'Net amount put in', color: 'var(--cyan)',
    hint: 'Deposits minus withdrawals, already net of what you booked and what it cost' },
  { key: 'dividends', label: 'Dividends received', color: 'var(--purple)', hint: 'Net of TDS' },
]

function Tile({ label, value, color, sub, title }) {
  return (
    <div className="metric-card" title={title}>
      <div className="metric-label">{label}</div>
      <div className="metric-value" style={{ color, fontSize: 17 }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 2 }}>{sub}</div>}
    </div>
  )
}

function BrokerCard({ broker, onSaved, onDeleted }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({})
  const [busy, setBusy] = useState(false)
  const p = platformOf(broker.platform)

  function startEdit() {
    setDraft(Object.fromEntries(FIELDS.map(f => [f.key, String(Number(broker[f.key]) || 0)])
      .concat([['name', broker.name || ''], ['note', broker.note || '']])))
    setEditing(true)
  }

  async function save() {
    const payload = { name: draft.name, note: draft.note }
    for (const f of FIELDS) {
      const v = Number(draft[f.key])
      if (!Number.isFinite(v) || v < 0) {
        toast.error(`${f.label} must be 0 or more`)
        return
      }
      payload[f.key] = v
    }
    setBusy(true)
    try {
      await api.updateBroker(broker.id, payload)
      setEditing(false)
      await onSaved?.()
      toast.success(`${broker.name || p.label} updated`)
    } catch (e) {
      toast.error('Could not save', { detail: e.message })
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!window.confirm(`Remove the ${broker.name || p.label} ledger? Your holdings are not touched.`)) return
    try { await api.deleteBroker(broker.id); await onDeleted?.() }
    catch (e) { toast.error('Could not remove', { detail: e.message }) }
  }

  const net = Number(broker.totalReturn) || 0
  const netColor = net > 0 ? 'var(--green)' : net < 0 ? 'var(--red)' : 'var(--text2)'

  return (
    <div className="card-lg mb-4">
      <div className="section-header" style={{ marginBottom: 12 }}>
        <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
          <span className={`platform-badge ${p.cls}`}>{p.label}</span>
          {broker.name && broker.name !== p.label && (
            <span style={{ fontWeight: 800, fontSize: 15 }}>{broker.name}</span>
          )}
          <span className="text-xs text-dim">
            {broker.holdingsCount} holding{broker.holdingsCount === 1 ? '' : 's'} tagged to this broker
          </span>
        </div>
        <div className="flex items-center gap-2">
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: 11, color: 'var(--text3)', textTransform: 'uppercase', letterSpacing: '0.6px', fontWeight: 700 }}>
              Actual return
            </div>
            <div style={{ fontSize: 22, fontWeight: 900, color: netColor }}>
              {signedMoney(net)}
              {broker.returnPercent != null && (
                <span style={{ fontSize: 12, fontWeight: 700, marginLeft: 6 }}>
                  ({broker.returnPercent >= 0 ? '+' : ''}{broker.returnPercent}%)
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-1">
            {!editing && (
              <button className="btn btn-secondary btn-xs" aria-label="Edit ledger" onClick={startEdit}>✏️ Edit</button>
            )}
            <button className="btn-icon" aria-label="Remove ledger" title="Remove ledger" onClick={remove}>🗑️</button>
          </div>
        </div>
      </div>

      {editing ? (
        <>
          <div className="fire-inputs">
            <div className="form-group">
              <label className="form-label" htmlFor={`nm-${broker.id}`}>Display name</label>
              <input id={`nm-${broker.id}`} className="input" value={draft.name}
                placeholder={p.label} onChange={e => setDraft(d => ({ ...d, name: e.target.value }))} />
            </div>
            {FIELDS.map(f => (
              <div className="form-group" key={f.key}>
                <label className="form-label" htmlFor={`${f.key}-${broker.id}`}>{f.label}</label>
                <input id={`${f.key}-${broker.id}`} className="input" type="number" min="0" step="any"
                  value={draft[f.key]} onChange={e => setDraft(d => ({ ...d, [f.key]: e.target.value }))} />
                <span style={{ fontSize: 10, color: 'var(--text3)' }}>{f.hint}</span>
              </div>
            ))}
            <div className="form-group">
              <label className="form-label" htmlFor={`nt-${broker.id}`}>Note</label>
              <input id={`nt-${broker.id}`} className="input" value={draft.note}
                placeholder="optional" onChange={e => setDraft(d => ({ ...d, note: e.target.value }))} />
            </div>
          </div>
          <div className="flex gap-2 mt-3">
            <button className="btn btn-primary btn-sm" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setEditing(false)} disabled={busy}>Cancel</button>
          </div>
        </>
      ) : (
        <>
          <div className="metric-grid">
            <Tile label="Net amount put in" value={money(broker.netDeposited)} color="var(--cyan)"
              title="Your figure — already net of booked profit/loss and charges" />
            <Tile label="Worth now" value={money(broker.holdingsValue)} color="var(--purple)"
              sub={`${broker.holdingsCount} holding${broker.holdingsCount === 1 ? '' : 's'}`}
              title="Current value of the holdings tagged to this broker" />
            <Tile label="Capital gain" value={signedMoney(broker.capitalGain)}
              color={broker.capitalGain >= 0 ? 'var(--green)' : 'var(--red)'}
              sub="worth now − put in"
              title="The real capital result: no costs left to subtract, they're already inside your net amount" />
            <Tile label="Dividends" value={money(broker.dividends)} color="var(--purple)" title="Net of TDS" />
          </div>

          <div className="broker-equation">
            {money(broker.holdingsValue)} <span className="text-dim">worth now</span>
            {' − '}{money(broker.netDeposited)} <span className="text-dim">put in</span>
            {' = '}<strong style={{ color: broker.capitalGain >= 0 ? 'var(--green)' : 'var(--red)' }}>
              {signedMoney(broker.capitalGain)}
            </strong>
            {broker.dividends > 0 && (
              <>
                {' '}<span className="text-dim">+</span> {money(broker.dividends)} <span className="text-dim">dividends</span>
                {' = '}<strong style={{ color: netColor }}>{signedMoney(broker.totalReturn)}</strong>
              </>
            )}
          </div>

          <div className="text-xs text-dim mt-2">
            {Math.abs(broker.investedGap) > 1000 && (
              <>This app records {money(broker.holdingsInvested)} invested in these holdings —{' '}
                {money(Math.abs(broker.investedGap))} {broker.investedGap > 0 ? 'more' : 'less'} than your
                net amount. Yours is the one to trust; the gap is usually reinvested profit or a rounded buy price.</>
            )}
          </div>
          {broker.note && <div className="text-xs text-muted mt-2">{broker.note}</div>}
        </>
      )}
    </div>
  )
}

function AddBrokerForm({ existing, untracked, onAdded }) {
  const taken = new Set(existing.map(b => b.platform))
  const available = PLATFORMS.filter(p => !taken.has(p.id))
  const [open, setOpen] = useState(false)
  const [platform, setPlatform] = useState(available[0]?.id || '')
  const [busy, setBusy] = useState(false)

  useEffect(() => { if (!available.some(p => p.id === platform)) setPlatform(available[0]?.id || '') }, [existing])

  if (!available.length) return null

  async function add() {
    setBusy(true)
    try {
      await api.addBroker({ platform, netDeposited: 0 })
      setOpen(false)
      await onAdded?.()
    } catch (e) { toast.error('Could not add', { detail: e.message }) }
    finally { setBusy(false) }
  }

  return open ? (
    <div className="card-lg mb-4">
      <div className="flex items-center gap-2" style={{ flexWrap: 'wrap' }}>
        <label className="form-label" htmlFor="new-broker">Broker</label>
        <select id="new-broker" className="input" style={{ width: 180 }} value={platform} onChange={e => setPlatform(e.target.value)}>
          {available.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
        </select>
        <button className="btn btn-primary btn-sm" onClick={add} disabled={busy || !platform}>
          {busy ? 'Adding…' : 'Add ledger'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      <div className="text-xs text-dim mt-2">
        Holdings are matched to a ledger by their Platform, so tag your holdings to the same broker.
      </div>
    </div>
  ) : (
    <button className="btn btn-secondary btn-sm mb-4" onClick={() => setOpen(true)}>+ Add a broker ledger</button>
  )
}

export default function BrokerLedger({ onUpdate }) {
  const [data, setData] = useState({ brokers: [], totals: {}, untracked: [] })
  const [loading, setLoading] = useState(true)
  const [editAmounts, setEditAmounts] = useState(false)

  async function load() {
    const d = await api.getBrokers()
    setData({ brokers: d.brokers || [], totals: d.totals || {}, untracked: d.untracked || [] })
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  const refresh = async () => { await load(); await onUpdate?.() }
  const t = data.totals
  const net = Number(t.totalReturn) || 0
  const netColor = net > 0 ? 'var(--green)' : net < 0 ? 'var(--red)' : 'var(--text2)'
  const dividendBrokers = data.brokers.filter(b => Number(b.dividends) > 0)

  return (
    <div>
      <div className="section-header">
        <h2 className="section-title">Brokers</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-dim hide-sm">
            What you actually put in, against what it's worth now
          </span>
          {data.brokers.length > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={() => setEditAmounts(true)}>
              ✏️ Edit all amounts
            </button>
          )}
        </div>
      </div>

      {loading ? (
        <div className="kpi-row" aria-hidden="true">
          {[0, 1, 2, 3].map(i => (
            <div className="kpi-card" key={i}>
              <div className="skeleton" style={{ width: '55%', height: 10, marginBottom: 10 }} />
              <div className="skeleton" style={{ width: '80%', height: 22 }} />
            </div>
          ))}
        </div>
      ) : data.brokers.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon" aria-hidden="true">⚖</div>
          <div className="empty-state-title">No broker ledgers yet</div>
          <div className="empty-state-body">
            The P/L on Overview is only the unrealised part, and it ignores every cost. Record
            the net amount you've actually put into each broker — the figure you already keep,
            net of what you booked and what it cost — and this compares it against what those
            holdings are worth today to give the real number.
          </div>
          <AddBrokerForm existing={data.brokers} untracked={data.untracked} onAdded={refresh} />
        </div>
      ) : (
        <>
          <div className="kpi-row">
            <div className="kpi-card">
              <div className="kpi-label">Net amount put in</div>
              <div className="kpi-value" style={{ color: 'var(--cyan)', fontSize: 22 }}>{money(t.netDeposited)}</div>
              <div className="kpi-sub text-dim">across {data.brokers.length} broker{data.brokers.length === 1 ? '' : 's'}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Worth now</div>
              <div className="kpi-value" style={{ color: 'var(--purple)', fontSize: 22 }}>{money(t.holdingsValue)}</div>
              <div className="kpi-sub text-dim">value of the tagged holdings</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Capital gain</div>
              <div className="kpi-value" style={{ color: (t.capitalGain || 0) >= 0 ? 'var(--green)' : 'var(--red)', fontSize: 22 }}>
                {signedMoney(t.capitalGain)}
              </div>
              <div className="kpi-sub text-dim">worth now − put in</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Dividends</div>
              <div className="kpi-value" style={{ color: 'var(--purple)', fontSize: 22 }}>+{money(t.dividends)}</div>
              <div className="kpi-sub text-dim">net of TDS</div>
            </div>
            <div className="kpi-card" style={{ borderColor: 'rgba(34,211,238,0.35)' }}>
              <div className="kpi-label">Actual return</div>
              <div className="kpi-value" style={{ color: netColor, fontSize: 22 }}>{signedMoney(net)}</div>
              <div className="kpi-sub text-dim">
                {t.returnPercent != null ? `${t.returnPercent >= 0 ? '+' : ''}${t.returnPercent}% on what you put in` : 'enter the amount put in for a %'}
              </div>
            </div>
          </div>

          {data.untracked.length > 0 && (
            <div className="banner banner-warn" role="status">
              <span aria-hidden="true">⚠</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <strong>
                  {data.untracked.map(u => `${platformOf(u.platform).label} holds ${money(u.holdingsValue)}`).join(', ')} with no ledger.
                </strong>{' '}
                <span className="text-muted">
                  They count towards the portfolio, but with no net amount recorded they can't
                  be compared against what you actually put in.
                </span>
              </div>
            </div>
          )}

          {data.brokers.map(b => (
            <BrokerCard key={b.id} broker={b} onSaved={refresh} onDeleted={refresh} />
          ))}

          <AddBrokerForm existing={data.brokers} untracked={data.untracked} onAdded={refresh} />

          {/* Where the two halves of the app disagree, and why. */}
          <div className="card-lg section">
            <div className="card-title">Portfolio's return vs actual</div>
            <div className="text-xs text-dim" style={{ marginTop: -8, marginBottom: 12 }}>
              The portfolio measures against the buy prices recorded on each holding and only
              counts unrealised movement. The difference between the two columns is everything
              it can't see: the profit and loss you've already booked, the brokerage and taxes
              you've paid, and dividends received.
            </div>
            <div className="scroll-x">
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>Broker</th>
                    <th className="right">Portfolio shows</th>
                    <th className="right">Actually</th>
                    <th className="right">Difference</th>
                    <th className="col-optional">What the difference is</th>
                  </tr>
                </thead>
                <tbody>
                  {data.brokers.map(b => {
                    const diff = Number(b.returnDifference) || 0
                    return (
                      <tr key={b.id}>
                        <td>
                          <span className={`platform-badge ${platformOf(b.platform).cls}`}>{platformOf(b.platform).label}</span>
                        </td>
                        <td className="right num">
                          <span className={(b.portfolioReturn || 0) >= 0 ? 'pos' : 'neg'}>{signedMoney(b.portfolioReturn)}</span>
                          {b.portfolioReturnPercent != null && (
                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                              {b.portfolioReturnPercent >= 0 ? '+' : ''}{b.portfolioReturnPercent}% on invested
                            </div>
                          )}
                        </td>
                        <td className="right num">
                          <span className={(b.totalReturn || 0) >= 0 ? 'pos' : 'neg'}>{signedMoney(b.totalReturn)}</span>
                          {b.returnPercent != null && (
                            <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                              {b.returnPercent >= 0 ? '+' : ''}{b.returnPercent}% on cash in
                            </div>
                          )}
                        </td>
                        <td className="right num" style={{ fontWeight: 700, color: Math.abs(diff) < 1 ? 'var(--text3)' : diff > 0 ? 'var(--green)' : 'var(--orange)' }}>
                          {Math.abs(diff) < 1 ? '—' : signedMoney(diff)}
                        </td>
                        <td className="text-xs text-dim col-optional">
                          {Math.abs(diff) < 1
                            ? 'the two agree'
                            : [
                                b.dividends > 0 ? `${money(b.dividends)} dividends` : null,
                                Math.abs(b.investedGap) > 1 ? `${money(Math.abs(b.investedGap))} of booked P&L and charges` : null,
                              ].filter(Boolean).join(' + ') || 'booked P&L and charges'}
                        </td>
                      </tr>
                    )
                  })}
                  <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                    <td style={{ fontWeight: 800 }}>Total</td>
                    <td className="right num" style={{ fontWeight: 800 }}>
                      <span className={(t.portfolioReturn || 0) >= 0 ? 'pos' : 'neg'}>{signedMoney(t.portfolioReturn)}</span>
                      {t.portfolioReturnPercent != null && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                          {t.portfolioReturnPercent >= 0 ? '+' : ''}{t.portfolioReturnPercent}%
                        </div>
                      )}
                    </td>
                    <td className="right num" style={{ fontWeight: 800 }}>
                      <span className={net >= 0 ? 'pos' : 'neg'}>{signedMoney(net)}</span>
                      {t.returnPercent != null && (
                        <div style={{ fontSize: 10, color: 'var(--text3)', fontWeight: 400 }}>
                          {t.returnPercent >= 0 ? '+' : ''}{t.returnPercent}%
                        </div>
                      )}
                    </td>
                    <td className="right num" style={{ fontWeight: 800, color: Math.abs(t.returnDifference || 0) < 1 ? 'var(--text3)' : (t.returnDifference || 0) > 0 ? 'var(--green)' : 'var(--orange)' }}>
                      {Math.abs(t.returnDifference || 0) < 1 ? '—' : signedMoney(t.returnDifference)}
                    </td>
                    <td className="col-optional" />
                  </tr>
                </tbody>
              </table>
            </div>
            <div className="text-xs text-dim mt-2">
              A positive difference means you're doing better than the portfolio tab suggests —
              usually dividends. A negative one means worse: costs and booked losses the
              portfolio never recorded.
            </div>
          </div>

          {/* Dividends get their own section — it's income, not a price movement, and it
              never shows up anywhere else in the app. */}
          <div className="card-lg section">
            <div className="card-title">Dividends earned</div>
            {dividendBrokers.length === 0 ? (
              <div className="text-sm text-dim">
                No dividends recorded yet. Add them per broker above — they're income, so they
                never appear in the price-based P/L.
              </div>
            ) : (
              <div className="scroll-x">
                <table className="holdings-table">
                  <thead>
                    <tr>
                      <th>Broker</th>
                      <th className="right">Dividends</th>
                      <th className="right col-optional">Share</th>
                      <th className="right col-optional">Yield on cash put in</th>
                      <th className="right">% of actual return</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dividendBrokers.map(b => {
                      const div = Number(b.dividends) || 0
                      const share = t.dividends > 0 ? (div / t.dividends) * 100 : 0
                      const yieldPct = b.netDeposited > 0 ? (div / b.netDeposited) * 100 : null
                      const ofProfit = b.totalReturn > 0 ? (div / b.totalReturn) * 100 : null
                      return (
                        <tr key={b.id}>
                          <td>
                            <span className={`platform-badge ${platformOf(b.platform).cls}`}>{platformOf(b.platform).label}</span>
                            {b.name && b.name !== platformOf(b.platform).label && (
                              <span style={{ marginLeft: 8, fontWeight: 600 }}>{b.name}</span>
                            )}
                          </td>
                          <td className="right num" style={{ color: 'var(--purple)', fontWeight: 700 }}>{money(div)}</td>
                          <td className="right num text-muted col-optional">{percent(share)}</td>
                          <td className="right num col-optional">{yieldPct == null ? '—' : percent(yieldPct)}</td>
                          <td className="right num text-muted">{ofProfit == null ? '—' : percent(ofProfit)}</td>
                        </tr>
                      )
                    })}
                    <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
                      <td style={{ fontWeight: 800 }}>Total</td>
                      <td className="right num" style={{ fontWeight: 800, color: 'var(--purple)' }}>{money(t.dividends)}</td>
                      <td className="right num text-dim col-optional">100%</td>
                      <td className="right num col-optional">
                        {t.netDeposited > 0 ? percent((t.dividends / t.netDeposited) * 100) : '—'}
                      </td>
                      <td className="right num text-dim">
                        {net > 0 ? percent((t.dividends / net) * 100) : '—'}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="text-xs text-dim">
            Overview's P/L compares current value against the <em>invested</em> figure recorded on
            each holding, and is unrealised only. This compares it against the net amount you
            actually put in — which already carries your booked profit, losses and charges — so
            the two differ, and this one is the real result.
          </div>
        </>
      )}

      {editAmounts && (
        <BrokerAmountsEditor
          isOpen={editAmounts}
          onClose={() => setEditAmounts(false)}
          brokers={data.brokers}
          onSaved={refresh}
        />
      )}
    </div>
  )
}
