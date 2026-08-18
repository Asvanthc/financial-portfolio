import React, { useRef, useState } from 'react'
import { api } from '../api'

function fmt(n) {
  if (!Number.isFinite(n)) return '—'
  const abs = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (abs >= 1e7) return `${sign}₹${(abs / 1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `${sign}₹${(abs / 1e5).toFixed(2)}L`
  return `${sign}₹${Math.round(abs).toLocaleString('en-IN')}`
}

const ACCOUNT_TYPES = [
  { id: 'savings', label: 'Savings' },
  { id: 'current', label: 'Current' },
  { id: 'salary', label: 'Salary' },
  { id: 'emergency', label: 'Emergency fund' },
  { id: 'wallet', label: 'Wallet / UPI' },
  { id: 'cash', label: 'Cash in hand' },
  { id: 'other', label: 'Other' },
]

function typeLabel(t) {
  return ACCOUNT_TYPES.find(x => x.id === t)?.label || t || 'Other'
}

// Inline-editable number cell — commits on blur / Enter, reverts on Escape.
function EditableBalance({ value, onSave }) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  // Enter commits and unmounts the input, which then fires blur — without this the
  // same edit would be PATCHed twice.
  const committing = useRef(false)

  async function commit() {
    if (committing.current) return
    committing.current = true
    const raw = String(draft).trim()
    setEditing(false)
    // A blank or unparseable box is a cancel, never "set this account to zero" —
    // select-all + Delete + click away must not wipe a real balance.
    if (raw === '') return
    const next = Number(raw)
    if (!Number.isFinite(next) || next < 0) return
    if (next === Number(value)) return
    setSaving(true)
    try { await onSave(next) } finally { setSaving(false) }
  }

  function startEditing() {
    committing.current = false
    setDraft(String(Number(value) || 0))
    setEditing(true)
  }

  if (editing) {
    return (
      <input
        className="input input-sm"
        type="number"
        autoFocus
        style={{ width: 130, textAlign: 'right' }}
        value={draft}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={e => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') { committing.current = true; setEditing(false) }
        }}
      />
    )
  }

  return (
    <span
      className="editable"
      title="Click to edit balance"
      style={{ color: 'var(--green)', fontWeight: 700, opacity: saving ? 0.5 : 1 }}
      onClick={startEditing}
    >
      {fmt(Number(value) || 0)}
    </span>
  )
}

/**
 * Bank cash — a standalone section, not part of the investment portfolio.
 * Nothing in here is a division or a holding, so it never enters the allocation
 * %, target %, goal-seek or rebalance maths. `onUpdate` just refetches.
 */
export default function BankSection({ accounts = [], total = 0, onUpdate }) {
  const [open, setOpen] = useState(true)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', bankName: '', accountType: 'savings', balance: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  const reset = () => setForm({ name: '', bankName: '', accountType: 'savings', balance: '', note: '' })

  async function add(e) {
    e?.preventDefault()
    if (!form.name.trim()) return
    setBusy(true); setErr(null)
    try {
      await api.addBankAccount({
        name: form.name.trim(),
        bankName: form.bankName.trim(),
        accountType: form.accountType,
        balance: Number(form.balance) || 0,
        note: form.note.trim(),
      })
      reset(); setAdding(false)
      await onUpdate?.()
    } catch (e2) {
      setErr(e2.message)
    } finally { setBusy(false) }
  }

  async function updateBalance(id, balance) {
    setErr(null)
    try {
      await api.updateBankAccount(id, { balance })
      await onUpdate?.()
    } catch (e) { setErr(e.message) }
  }

  async function remove(acc) {
    if (!window.confirm(`Remove "${acc.name}" (${fmt(Number(acc.balance) || 0)}) from bank cash?`)) return
    setErr(null)
    try {
      await api.deleteBankAccount(acc.id)
      await onUpdate?.()
    } catch (e) { setErr(e.message) }
  }

  return (
    <div className="card-lg section">
      <div className="flex items-center gap-2" style={{ cursor: 'pointer' }} onClick={() => setOpen(o => !o)}>
        <span className="section-title" style={{ color: 'var(--green)' }}>Bank Cash</span>
        <span className="text-xs text-dim">not part of the investment portfolio</span>
        <div className="ml-auto flex items-center gap-3">
          <span style={{ fontSize: 18, fontWeight: 900, color: 'var(--green)' }}>{fmt(total)}</span>
          <span className="chevron" style={{ color: 'var(--text3)', fontSize: 14 }}>{open ? '▲' : '▼'}</span>
        </div>
      </div>

      <div className="text-xs text-dim mt-2">
        Idle money in bank accounts / wallets. Shown here only — it is excluded from every
        allocation %, target %, goal-seek and rebalance figure on this page.
      </div>

      {err && <div className="text-xs mt-2" style={{ color: 'var(--red)' }}>✗ {err}</div>}

      {open && (
        <>
          {accounts.length > 0 ? (
            <div style={{ overflowX: 'auto', marginTop: 14 }}>
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Bank</th>
                    <th>Type</th>
                    <th className="right">Balance</th>
                    <th className="right">Share of cash</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {[...accounts].sort((a, b) => (Number(b.balance) || 0) - (Number(a.balance) || 0)).map(acc => {
                    const bal = Number(acc.balance) || 0
                    const share = total > 0 ? (bal / total) * 100 : 0
                    return (
                      <tr key={acc.id}>
                        <td style={{ fontWeight: 600 }}>
                          {acc.name}
                          {acc.note && <div className="text-xs text-dim">{acc.note}</div>}
                        </td>
                        <td className="text-sm text-muted">{acc.bankName || '—'}</td>
                        <td><span className="asset-type">{typeLabel(acc.accountType)}</span></td>
                        <td className="right num">
                          <EditableBalance value={bal} onSave={v => updateBalance(acc.id, v)} />
                        </td>
                        <td className="right num text-muted">{share.toFixed(1)}%</td>
                        <td className="right">
                          <div className="action-group">
                            <button className="btn-icon" title="Remove" onClick={() => remove(acc)}>🗑</button>
                          </div>
                        </td>
                      </tr>
                    )
                  })}
                  <tr>
                    <td style={{ fontWeight: 800 }}>Total</td>
                    <td /><td />
                    <td className="right num" style={{ color: 'var(--green)', fontWeight: 800 }}>{fmt(total)}</td>
                    <td className="right num text-dim">100%</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          ) : (
            <div className="text-sm text-dim" style={{ padding: '18px 0 6px' }}>
              No bank accounts added yet.
            </div>
          )}

          {adding ? (
            <form className="add-holding-panel mt-3" style={{ borderRadius: 'var(--radius-sm)' }} onSubmit={add}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 10 }}>
                <div className="form-group">
                  <label className="form-label">Account name *</label>
                  <input className="input" autoFocus value={form.name}
                    placeholder="e.g. Emergency fund"
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Bank</label>
                  <input className="input" value={form.bankName} placeholder="e.g. HDFC"
                    onChange={e => setForm(f => ({ ...f, bankName: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Type</label>
                  <select className="input" value={form.accountType}
                    onChange={e => setForm(f => ({ ...f, accountType: e.target.value }))}>
                    {ACCOUNT_TYPES.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Balance ₹</label>
                  <input className="input" type="number" min="0" value={form.balance} placeholder="0"
                    onChange={e => setForm(f => ({ ...f, balance: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Note</label>
                  <input className="input" value={form.note} placeholder="optional"
                    onChange={e => setForm(f => ({ ...f, note: e.target.value }))} />
                </div>
              </div>
              <div className="flex gap-2 mt-3">
                <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !form.name.trim()}>
                  {busy ? 'Saving…' : 'Save account'}
                </button>
                <button className="btn btn-ghost btn-sm" type="button" onClick={() => { setAdding(false); reset() }}>Cancel</button>
              </div>
            </form>
          ) : (
            <button className="btn btn-secondary btn-sm mt-3" onClick={() => setAdding(true)}>+ Add bank account</button>
          )}
        </>
      )}
    </div>
  )
}
