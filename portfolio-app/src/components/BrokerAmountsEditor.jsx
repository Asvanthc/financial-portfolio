import React, { useMemo, useState } from 'react'
import Modal from './Modal'
import { api } from '../api'
import { toast } from '../toast'
import { money, signedMoney } from '../format'

// Every broker's net amount in one form.
//
// These figures are only meaningful next to each other — the totals, and the comparison
// against what the portfolio is worth, are what you're actually checking when you update
// them. Editing one card at a time hides that. One save writes the set atomically, so a
// failure can't leave half the brokers on new numbers and half on old.

export default function BrokerAmountsEditor({ isOpen, onClose, brokers, onSaved }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries((brokers || []).map(b => [b.id, {
      netDeposited: String(Number(b.netDeposited) || 0),
      dividends: String(Number(b.dividends) || 0),
    }]))
  )
  const [saving, setSaving] = useState(false)

  const val = (id, key) => {
    const v = Number(draft[id]?.[key])
    return Number.isFinite(v) && v >= 0 ? v : 0
  }
  const set = (id, key, v) => setDraft(d => ({ ...d, [id]: { ...d[id], [key]: v } }))

  const totals = useMemo(() => (brokers || []).reduce((acc, b) => {
    const put = val(b.id, 'netDeposited')
    const div = val(b.id, 'dividends')
    acc.put += put
    acc.div += div
    acc.worth += Number(b.holdingsValue) || 0
    acc.ret += (Number(b.holdingsValue) || 0) - put + div
    return acc
  }, { put: 0, div: 0, worth: 0, ret: 0 }), [draft, brokers])

  const invalid = (brokers || []).some(b => ['netDeposited', 'dividends'].some(k => {
    const raw = String(draft[b.id]?.[k] ?? '').trim()
    return raw !== '' && !(Number.isFinite(Number(raw)) && Number(raw) >= 0)
  }))

  async function save() {
    if (invalid) {
      toast.error('Amounts must be 0 or more')
      return
    }
    setSaving(true)
    try {
      const amounts = Object.fromEntries((brokers || []).map(b => [b.id, {
        netDeposited: val(b.id, 'netDeposited'),
        dividends: val(b.id, 'dividends'),
      }]))
      await api.setBrokerAmounts(amounts)
      toast.success('Amounts saved', { detail: `${money(totals.put)} across ${brokers.length} broker${brokers.length === 1 ? '' : 's'}` })
      onClose?.()
      await onSaved?.()
    } catch (e) {
      toast.error("Couldn't save", { detail: e.message })
    } finally { setSaving(false) }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Net amount put in — all brokers">
      <div className="text-xs text-dim" style={{ marginTop: -6, marginBottom: 14 }}>
        Deposits minus withdrawals, already net of the profit and loss you've booked and the
        charges you've paid. The return updates as you type, so you can check it before saving.
      </div>

      <div className="scroll-x">
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Broker</th>
              <th className="right" style={{ width: 130 }}>Net amount put in</th>
              <th className="right" style={{ width: 110 }}>Dividends</th>
              <th className="right col-optional">Worth now</th>
              <th className="right">Return</th>
            </tr>
          </thead>
          <tbody>
            {(brokers || []).map(b => {
              const put = val(b.id, 'netDeposited')
              const div = val(b.id, 'dividends')
              const worth = Number(b.holdingsValue) || 0
              const ret = worth - put + div
              const pct = put > 0 ? (ret / put) * 100 : null
              return (
                <tr key={b.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{b.name || b.platform}</div>
                    <div className="text-xs text-dim">
                      {b.holdingsCount} holding{b.holdingsCount === 1 ? '' : 's'}
                    </div>
                  </td>
                  <td className="right">
                    <input
                      className="input input-sm" type="number" min="0" step="any"
                      style={{ width: 118, textAlign: 'right' }}
                      value={draft[b.id]?.netDeposited ?? ''}
                      onChange={e => set(b.id, 'netDeposited', e.target.value)}
                      aria-label={`Net amount put into ${b.name || b.platform}`}
                    />
                  </td>
                  <td className="right">
                    <input
                      className="input input-sm" type="number" min="0" step="any"
                      style={{ width: 100, textAlign: 'right' }}
                      value={draft[b.id]?.dividends ?? ''}
                      onChange={e => set(b.id, 'dividends', e.target.value)}
                      aria-label={`Dividends received at ${b.name || b.platform}`}
                    />
                  </td>
                  <td className="right num col-optional" style={{ color: 'var(--purple)' }}>{money(worth)}</td>
                  <td className="right num">
                    <span className={ret >= 0 ? 'pos' : 'neg'}>{signedMoney(ret)}</span>
                    {pct != null && (
                      <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                        {pct >= 0 ? '+' : ''}{pct.toFixed(1)}%
                      </div>
                    )}
                  </td>
                </tr>
              )
            })}
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              <td style={{ fontWeight: 800 }}>Total</td>
              <td className="right num" style={{ fontWeight: 800, color: 'var(--cyan)' }}>{money(totals.put)}</td>
              <td className="right num" style={{ fontWeight: 800, color: 'var(--purple)' }}>{money(totals.div)}</td>
              <td className="right num col-optional" style={{ fontWeight: 800, color: 'var(--purple)' }}>{money(totals.worth)}</td>
              <td className="right num" style={{ fontWeight: 800 }}>
                <span className={totals.ret >= 0 ? 'pos' : 'neg'}>{signedMoney(totals.ret)}</span>
                {totals.put > 0 && (
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>
                    {totals.ret >= 0 ? '+' : ''}{((totals.ret / totals.put) * 100).toFixed(1)}%
                  </div>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="flex gap-2 mt-4">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving || invalid}>
          {saving ? 'Saving…' : 'Save all'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
      </div>
    </Modal>
  )
}
