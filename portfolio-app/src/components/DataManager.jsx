import React, { useEffect, useRef, useState } from 'react'
import Modal from './Modal'
import { api } from '../api'
import { toast } from '../toast'

// Downloads a server-generated file. Goes through fetch rather than a plain <a> so a
// failure surfaces as a toast instead of dumping a JSON error page over the app.
async function download(path, fallbackName) {
  const r = await fetch(path)
  if (!r.ok) {
    let msg = `${r.status} ${r.statusText}`
    try { const j = await r.json(); if (j?.error) msg = j.error } catch (_) {}
    throw new Error(msg)
  }
  const blob = await r.blob()
  const cd = r.headers.get('Content-Disposition') || ''
  const named = /filename="([^"]+)"/.exec(cd)
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = named ? named[1] : fallbackName
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Revoke on the next tick so Firefox has started the download.
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return blob.size
}

function Row({ icon, title, body, action, tone = 'default' }) {
  return (
    <div className="data-row" style={tone === 'danger' ? { borderColor: 'rgba(248,113,113,0.3)' } : undefined}>
      <span className="data-row-icon" aria-hidden="true">{icon}</span>
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="data-row-title">{title}</div>
        <div className="data-row-body">{body}</div>
      </div>
      <div style={{ flexShrink: 0 }}>{action}</div>
    </div>
  )
}

export default function DataManager({ isOpen, onClose, onRestored }) {
  const [busy, setBusy] = useState(null)          // which action is running
  const [summary, setSummary] = useState(null)
  const [pending, setPending] = useState(null)    // parsed backup awaiting confirmation
  const fileRef = useRef(null)

  useEffect(() => {
    if (!isOpen) return
    api.backupSummary().then(setSummary).catch(() => setSummary(null))
  }, [isOpen])

  async function run(key, fn, okMessage) {
    setBusy(key)
    try {
      const size = await fn()
      toast.success(okMessage, { detail: size ? `${(size / 1024).toFixed(0)} KB` : null })
    } catch (e) {
      toast.error('Export failed', { detail: e.message })
    } finally {
      setBusy(null)
    }
  }

  function pickFile() {
    fileRef.current?.click()
  }

  async function onFile(e) {
    const file = e.target.files?.[0]
    e.target.value = ''   // let the same file be re-picked later
    if (!file) return
    try {
      const text = await file.text()
      const parsed = JSON.parse(text)
      const divisions = parsed?.portfolio?.divisions ?? parsed?.divisions
      if (!Array.isArray(divisions)) {
        toast.error("That file isn't a FinFolio backup", { detail: 'No portfolio.divisions array found in it.' })
        return
      }
      const holdings = divisions.reduce((n, d) =>
        n + (d.holdings || []).length + (d.subdivisions || []).reduce((m, s) => m + (s.holdings || []).length, 0), 0)
      setPending({
        name: file.name,
        data: parsed,
        exportedAt: parsed.exportedAt || null,
        counts: {
          divisions: divisions.length,
          holdings,
          bankAccounts: (parsed.bankAccounts || []).length,
          expenses: (parsed.expenses || []).length,
        },
      })
    } catch (err) {
      toast.error("Couldn't read that file", { detail: err.message })
    }
  }

  async function confirmRestore() {
    if (!pending) return
    setBusy('restore')
    try {
      const res = await api.restoreBackup(pending.data)
      const r = res.restored || {}
      toast.success('Backup restored', {
        detail: `${r.divisions || 0} divisions · ${r.bankAccounts || 0} bank accounts · ${r.expenses || 0} expense entries`,
      })
      setPending(null)
      onClose?.()
      await onRestored?.()
    } catch (e) {
      toast.error('Restore failed — nothing was changed', { detail: e.message })
    } finally {
      setBusy(null)
    }
  }

  const counts = summary
    ? `${summary.divisions} divisions · ${summary.holdings} holdings · ${summary.bankAccounts} bank accounts · ${summary.expenses} expense entries`
    : 'reading…'

  return (
    <Modal isOpen={isOpen} onClose={onClose} size="lg" title="Export & backup">
      <div className="text-xs text-dim" style={{ marginTop: -6, marginBottom: 16 }}>
        Currently holding {counts}.
      </div>

      <Row
        icon="🧾"
        title="Excel workbook (.xlsx)"
        body="Every sheet is live: holdings, divisions, subdivisions, sector & cap splits, bank cash, month-by-month income vs expenses, and a projection model with editable assumptions. Totals, returns and weights are real formulas, so editing a price recalculates the lot."
        action={
          <button className="btn btn-primary btn-sm" disabled={!!busy}
            onClick={() => run('xlsx', () => download(api.exportUrl('excel'), 'finfolio.xlsx'), 'Excel workbook downloaded')}>
            {busy === 'xlsx' ? 'Building…' : 'Download'}
          </button>
        }
      />

      <Row
        icon="📄"
        title="Holdings CSV"
        body="One flat row per holding, for pivoting elsewhere or importing into another tool. UTF-8 with a BOM so ₹ and fund names survive Excel."
        action={
          <button className="btn btn-secondary btn-sm" disabled={!!busy}
            onClick={() => run('csv', () => download(api.exportUrl('csv'), 'finfolio-holdings.csv'), 'CSV downloaded')}>
            {busy === 'csv' ? 'Building…' : 'Download'}
          </button>
        }
      />

      <Row
        icon="💾"
        title="JSON backup"
        body="The complete dataset — portfolio, bank cash, expenses and categories. This is the only export that can be restored, so keep one somewhere safe after any big change."
        action={
          <button className="btn btn-success btn-sm" disabled={!!busy}
            onClick={() => run('json', () => download(api.exportUrl('backup'), 'finfolio-backup.json'), 'Backup downloaded')}>
            {busy === 'json' ? 'Preparing…' : 'Download'}
          </button>
        }
      />

      <div className="divider" />

      <Row
        icon="⤴"
        title="Restore from a JSON backup"
        body="Only needed if something has gone wrong with the data. This replaces the portfolio, bank cash, expenses and categories with the file's contents — so download a fresh backup first."
        tone="danger"
        action={
          <button className="btn btn-secondary btn-sm" disabled={!!busy} onClick={pickFile}>
            Choose file…
          </button>
        }
      />
      <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={onFile} />

      {pending && (
        <div className="restore-confirm">
          <div style={{ fontWeight: 800, marginBottom: 6 }}>Replace everything with “{pending.name}”?</div>
          <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
            That file contains <strong style={{ color: 'var(--text)' }}>{pending.counts.divisions}</strong> divisions,{' '}
            <strong style={{ color: 'var(--text)' }}>{pending.counts.holdings}</strong> holdings,{' '}
            <strong style={{ color: 'var(--text)' }}>{pending.counts.bankAccounts}</strong> bank accounts and{' '}
            <strong style={{ color: 'var(--text)' }}>{pending.counts.expenses}</strong> expense entries.
          </div>
          {pending.exportedAt && (
            <div className="text-xs text-dim">Taken {new Date(pending.exportedAt).toLocaleString('en-IN')}</div>
          )}
          <div className="text-xs" style={{ color: 'var(--orange)', margin: '8px 0 12px' }}>
            Your current data ({counts}) will be overwritten.
          </div>
          <div className="flex gap-2">
            <button className="btn btn-danger btn-sm" disabled={busy === 'restore'} onClick={confirmRestore}>
              {busy === 'restore' ? 'Restoring…' : 'Yes, replace my data'}
            </button>
            <button className="btn btn-ghost btn-sm" disabled={busy === 'restore'} onClick={() => setPending(null)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
