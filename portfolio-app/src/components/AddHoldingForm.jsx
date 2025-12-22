import React, { useState } from 'react'
import Modal from './Modal'

export default function AddHoldingForm({ isOpen, onClose, onAdd, subdivisionName = '' }) {
  const [form, setForm] = useState({ name: '', invested: '', current: '', targetPercent: '' })
  const [error, setError] = useState('')

  const handleSubmit = () => {
    setError('')
    if (!form.name.trim()) {
      setError('Holding name is required')
      return
    }
    if (!form.invested || Number(form.invested) < 0) {
      setError('Invested amount must be 0 or greater')
      return
    }
    if (!form.current || Number(form.current) < 0) {
      setError('Current value must be 0 or greater')
      return
    }
    onAdd({
      name: form.name,
      invested: Number(form.invested) || 0,
      current: Number(form.current) || 0,
      targetPercent: form.targetPercent ? Number(form.targetPercent) : undefined,
    })
    setForm({ name: '', invested: '', current: '', targetPercent: '' })
    onClose()
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <Modal isOpen={isOpen} title={`➕ Add Holding${subdivisionName ? ` to ${subdivisionName}` : ''}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7c92ab', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Holding Name
          </label>
          <input
            autoFocus
            placeholder="e.g., HDFC Bank, Infosys"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '12px 14px',
              background: '#0a1018',
              color: '#e6e9ef',
              border: '1px solid #2d3f5f',
              borderRadius: 8,
              fontSize: 14,
              outline: 'none',
              boxSizing: 'border-box',
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7c92ab', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Invested (₹)
            </label>
            <input
              type="number"
              placeholder="0"
              step="100"
              min="0"
              value={form.invested}
              onChange={e => setForm({ ...form, invested: e.target.value })}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#0a1018',
                color: '#e6e9ef',
                border: '1px solid #2d3f5f',
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                textAlign: 'right',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#7c92ab', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Current Value (₹)
            </label>
            <input
              type="number"
              placeholder="0"
              step="100"
              min="0"
              value={form.current}
              onChange={e => setForm({ ...form, current: e.target.value })}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '12px 14px',
                background: '#0a1018',
                color: '#e6e9ef',
                border: '1px solid #2d3f5f',
                borderRadius: 8,
                fontSize: 14,
                outline: 'none',
                textAlign: 'right',
                boxSizing: 'border-box',
              }}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#7c92ab', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            Target % (Optional)
          </label>
          <input
            type="number"
            placeholder="-"
            step="0.01"
            min="0"
            max="100"
            value={form.targetPercent}
            onChange={e => setForm({ ...form, targetPercent: e.target.value })}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '12px 14px',
              background: '#0a1018',
              color: '#e6e9ef',
              border: '1px solid #2d3f5f',
              borderRadius: 8,
              fontSize: 14,
              outline: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
            }}
          />
        </div>

        {error && (
          <div style={{
            background: '#7f1d1d',
            color: '#fca5a5',
            padding: 12,
            borderRadius: 8,
            fontSize: 12,
            borderLeft: '3px solid #ef4444',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            onClick={handleSubmit}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: '#22c55e',
              color: 'white',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => e.target.style.background = '#16a34a'}
            onMouseLeave={e => e.target.style.background = '#22c55e'}
          >
            Add Holding
          </button>
          <button
            onClick={onClose}
            style={{
              flex: 1,
              padding: '12px 20px',
              background: '#374151',
              color: '#e6e9ef',
              border: 'none',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={e => e.target.style.background = '#4b5563'}
            onMouseLeave={e => e.target.style.background = '#374151'}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
