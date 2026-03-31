import React, { useState } from 'react'

export default function AddDivisionForm({ isOpen, onClose, onAdd }) {
  const [name, setName] = useState('')
  const [targetPercent, setTargetPercent] = useState('')
  const [error, setError] = useState('')

  if (!isOpen) return null

  function handleSubmit() {
    setError('')
    if (!name.trim()) { setError('Name is required'); return }
    onAdd({ name: name.trim(), targetPercent: Number(targetPercent) || 0 })
    setName(''); setTargetPercent('')
  }

  return (
    <div className="modal-backdrop" onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal-box">
        <div className="flex items-center gap-2 mb-4">
          <h2 className="modal-title" style={{ margin: 0 }}>Add Division</h2>
          <button className="btn-icon ml-auto" onClick={onClose} style={{ fontSize: 18 }}>×</button>
        </div>
        <div className="flex flex-col gap-2">
          <div className="form-group">
            <label className="form-label">Division Name</label>
            <input className="input" autoFocus placeholder="e.g. Equity, Debt, Mutual Funds" value={name} onChange={e => setName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          <div className="form-group">
            <label className="form-label">Target Allocation %</label>
            <input className="input" type="number" placeholder="e.g. 50" min="0" max="100" step="0.5" value={targetPercent} onChange={e => setTargetPercent(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleSubmit()} />
          </div>
          {error && <div style={{ background: 'var(--red-dim)', color: 'var(--red)', padding: '8px 12px', borderRadius: 6, fontSize: 12 }}>{error}</div>}
          <div className="flex gap-2 mt-2">
            <button className="btn btn-primary" style={{ flex: 1 }} onClick={handleSubmit}>Create Division</button>
            <button className="btn btn-secondary" onClick={onClose}>Cancel</button>
          </div>
        </div>
      </div>
    </div>
  )
}
