import React, { useMemo, useState } from 'react'
import Modal from './Modal'
import { api } from '../api'
import { toast } from '../toast'
import { money, percent } from '../format'

// Setting one target at a time is the wrong unit of work: weights only make sense
// relative to their siblings, and you can't tell whether you're at 100% until you've
// seen them all. So this edits a whole sibling group at once, with the running total
// in front of you and one save at the end.
//
// `rows` are the siblings: [{ id, kind: 'holding'|'subdivision', name, current, targetPercent, sub }]
// A group is either a division's children (subdivisions + direct holdings) or a
// subdivision's holdings.

function nearly(a, b, tol = 0.05) { return Math.abs(a - b) < tol }

export default function TargetsEditor({ isOpen, onClose, groupLabel, parentValue, rows, onSaved }) {
  const [draft, setDraft] = useState(() =>
    Object.fromEntries((rows || []).map(r => [r.id, r.targetPercent > 0 ? String(r.targetPercent) : '']))
  )
  const [saving, setSaving] = useState(false)

  const num = id => {
    const v = Number(draft[id])
    return Number.isFinite(v) && v > 0 ? v : 0
  }

  const totalTarget = useMemo(() => (rows || []).reduce((s, r) => s + num(r.id), 0), [draft, rows])
  const totalCurrent = (rows || []).reduce((s, r) => s + (Number(r.current) || 0), 0)
  const balanced = nearly(totalTarget, 100)
  const untouched = totalTarget === 0

  const set = (id, v) => setDraft(d => ({ ...d, [id]: v }))

  function evenSplit() {
    const each = rows.length ? Math.round((100 / rows.length) * 10) / 10 : 0
    const next = {}
    rows.forEach((r, i) => {
      // Put the rounding remainder on the first row so the column lands on exactly 100.
      next[r.id] = String(i === 0 ? Math.round((100 - each * (rows.length - 1)) * 10) / 10 : each)
    })
    setDraft(next)
  }

  function matchCurrent() {
    const next = {}
    rows.forEach(r => {
      const pctOf = totalCurrent > 0 ? (Number(r.current) || 0) / totalCurrent * 100 : 0
      next[r.id] = pctOf > 0 ? String(Math.round(pctOf * 10) / 10) : ''
    })
    setDraft(next)
  }

  function normalise() {
    if (totalTarget <= 0) return
    const next = {}
    rows.forEach(r => {
      const scaled = (num(r.id) / totalTarget) * 100
      next[r.id] = scaled > 0 ? String(Math.round(scaled * 10) / 10) : ''
    })
    setDraft(next)
  }

  function clearAll() {
    setDraft(Object.fromEntries(rows.map(r => [r.id, ''])))
  }

  async function save() {
    setSaving(true)
    try {
      const holdings = {}, subdivisions = {}
      rows.forEach(r => {
        const v = num(r.id)
        if (r.kind === 'subdivision') subdivisions[r.id] = v
        else holdings[r.id] = v
      })
      await api.setTargets({ holdings, subdivisions })
      toast.success('Targets saved', {
        detail: balanced ? `${groupLabel} adds up to 100%` : `${groupLabel} adds up to ${percent(totalTarget)}`,
      })
      onClose?.()
      await onSaved?.()
    } catch (e) {
      toast.error("Couldn't save targets", { detail: e.message })
    } finally {
      setSaving(false)
    }
  }

  const sumColor = untouched ? 'var(--text3)' : balanced ? 'var(--green)' : totalTarget > 100 ? 'var(--red)' : 'var(--orange)'

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title={`Targets — ${groupLabel}`}>
      <div className="text-xs text-dim" style={{ marginTop: -6, marginBottom: 14 }}>
        Each target is a share of {groupLabel} ({money(parentValue)}). Leave a row blank to give
        it no target — it still counts towards the value, it just won't be steered.
      </div>

      <div className="flex gap-2 mb-3" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-secondary btn-xs" onClick={evenSplit}>Even split</button>
        <button className="btn btn-secondary btn-xs" onClick={matchCurrent} title="Set each target to what it currently holds — a starting point to tweak">
          Match current
        </button>
        <button className="btn btn-secondary btn-xs" onClick={normalise} disabled={untouched || balanced}
          title="Scale what's entered so it adds up to exactly 100%">
          Scale to 100%
        </button>
        <button className="btn btn-ghost btn-xs" onClick={clearAll}>Clear</button>
      </div>

      <div className="scroll-x">
        <table className="holdings-table">
          <thead>
            <tr>
              <th>Holding</th>
              <th className="right">Value</th>
              <th className="right">Now</th>
              <th className="right" style={{ width: 96 }}>Target %</th>
              <th className="right">Drift</th>
              <th style={{ width: 120 }}>Now vs target</th>
            </tr>
          </thead>
          <tbody>
            {(rows || []).map(r => {
              const nowPct = totalCurrent > 0 ? (Number(r.current) || 0) / totalCurrent * 100 : 0
              const tgt = num(r.id)
              const drift = tgt > 0 ? tgt - nowPct : 0
              const scale = Math.max(nowPct, tgt, 1)
              return (
                <tr key={r.id}>
                  <td>
                    <div style={{ fontWeight: 600 }}>{r.name}</div>
                    {r.sub && <div className="text-xs text-dim">{r.sub}</div>}
                    {r.kind === 'subdivision' && <span className="asset-type">group</span>}
                  </td>
                  <td className="right num" style={{ color: 'var(--purple)' }}>{money(r.current)}</td>
                  <td className="right num text-muted">{percent(nowPct)}</td>
                  <td className="right">
                    <input
                      className="input input-sm"
                      style={{ width: 78, textAlign: 'right' }}
                      type="number" min="0" max="100" step="0.5"
                      placeholder="—"
                      value={draft[r.id] ?? ''}
                      onChange={e => set(r.id, e.target.value)}
                      aria-label={`Target percent for ${r.name}`}
                    />
                  </td>
                  <td className="right num">
                    {tgt > 0
                      ? <span className={Math.abs(drift) < 1 ? 'neu' : drift > 0 ? 'pos' : 'neg'}>
                          {drift > 0 ? '+' : ''}{drift.toFixed(1)}%
                        </span>
                      : <span className="text-dim">—</span>}
                  </td>
                  <td>
                    {/* Two stacked bars: what it is, and what it should be */}
                    <div style={{ display: 'grid', gap: 3 }}>
                      <div className="progress-bar" title={`Now ${percent(nowPct)}`}>
                        <div className="progress-fill" style={{ width: `${(nowPct / scale) * 100}%`, background: 'var(--cyan)' }} />
                      </div>
                      <div className="progress-bar" title={tgt > 0 ? `Target ${percent(tgt)}` : 'No target'}>
                        <div className="progress-fill" style={{ width: `${(tgt / scale) * 100}%`, background: tgt > 0 ? 'var(--green)' : 'transparent' }} />
                      </div>
                    </div>
                  </td>
                </tr>
              )
            })}
            <tr style={{ background: 'rgba(255,255,255,0.03)' }}>
              <td style={{ fontWeight: 800 }}>Total</td>
              <td className="right num" style={{ fontWeight: 800, color: 'var(--purple)' }}>{money(totalCurrent)}</td>
              <td className="right num text-dim">100%</td>
              <td className="right num" style={{ fontWeight: 800, color: sumColor }}>{percent(totalTarget)}</td>
              <td colSpan={2} className="text-xs" style={{ color: sumColor }}>
                {untouched ? 'no targets set'
                  : balanced ? '✓ adds up to 100%'
                  : totalTarget > 100 ? `over by ${percent(totalTarget - 100)}`
                  : `${percent(100 - totalTarget)} unallocated`}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {!balanced && !untouched && (
        <div className="text-xs" style={{ color: 'var(--orange)', marginTop: 10 }}>
          Targets that don't add up to 100% still work — the goal seek treats the gap as
          unassigned, and the rebalance plan scales them proportionally. “Scale to 100%”
          fixes it in one click.
        </div>
      )}

      <div className="flex gap-2 mt-4">
        <button className="btn btn-primary btn-sm" onClick={save} disabled={saving}>
          {saving ? 'Saving…' : 'Save targets'}
        </button>
        <button className="btn btn-ghost btn-sm" onClick={onClose} disabled={saving}>Cancel</button>
      </div>
    </Modal>
  )
}
