import React, { useState } from 'react'
import Modal from './Modal'

export default function AddHoldingForm({ isOpen, onClose, onAdd, subdivisionName = '' }) {
  const [form, setForm] = useState({ name: '', invested: '', current: '', targetPercent: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async () => {
    setError('')
    setLoading(true)
    
    if (!form.name.trim()) {
      setError('⚠️ Holding name is required')
      setLoading(false)
      return
    }
    if (!form.invested || Number(form.invested) < 0) {
      setError('⚠️ Invested amount must be 0 or greater')
      setLoading(false)
      return
    }
    if (!form.current || Number(form.current) < 0) {
      setError('⚠️ Current value must be 0 or greater')
      setLoading(false)
      return
    }
    
    try {
      await onAdd({
        name: form.name.trim(),
        invested: Number(form.invested) || 0,
        current: Number(form.current) || 0,
        targetPercent: form.targetPercent ? Number(form.targetPercent) : undefined,
      })
      setForm({ name: '', invested: '', current: '', targetPercent: '' })
      onClose()
    } catch (e) {
      setError('❌ Failed to add holding: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') handleSubmit()
  }

  return (
    <Modal isOpen={isOpen} title={`➕ Add Holding${subdivisionName ? ` to ${subdivisionName}` : ''}`} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, color: '#22d3ee', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            📊 Holding Name *
          </label>
          <input
            autoFocus
            placeholder="e.g., HDFC Bank, Nifty 50 Index, Gold ETF"
            value={form.name}
            onChange={e => setForm({ ...form, name: e.target.value })}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)',
              color: '#e6e9ef',
              border: '2px solid #2d3f5f',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              outline: 'none',
              boxSizing: 'border-box',
              transition: 'border 0.2s ease',
            }}
            onFocus={e => e.target.style.borderColor = '#22d3ee'}
            onBlur={e => e.target.style.borderColor = '#2d3f5f'}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#a78bfa', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              💵 Invested (₹) *
            </label>
            <input
              type="number"
              placeholder="10000"
              step="1000"
              min="0"
              value={form.invested}
              onChange={e => setForm({ ...form, invested: e.target.value })}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)',
                color: '#e6e9ef',
                border: '2px solid #2d3f5f',
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                outline: 'none',
                textAlign: 'right',
                boxSizing: 'border-box',
                transition: 'border 0.2s ease',
              }}
              onFocus={e => e.target.style.borderColor = '#a78bfa'}
              onBlur={e => e.target.style.borderColor = '#2d3f5f'}
            />
          </div>

          <div>
            <label style={{ fontSize: 11, fontWeight: 700, color: '#22c55e', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              📈 Current Value (₹) *
            </label>
            <input
              type="number"
              placeholder="12000"
              step="1000"
              min="0"
              value={form.current}
              onChange={e => setForm({ ...form, current: e.target.value })}
              onKeyDown={handleKeyDown}
              style={{
                width: '100%',
                padding: '14px 16px',
                background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)',
                color: '#e6e9ef',
                border: '2px solid #2d3f5f',
                borderRadius: 10,
                fontSize: 16,
                fontWeight: 700,
                outline: 'none',
                textAlign: 'right',
                boxSizing: 'border-box',
                transition: 'border 0.2s ease',
              }}
              onFocus={e => e.target.style.borderColor = '#22c55e'}
              onBlur={e => e.target.style.borderColor = '#2d3f5f'}
            />
          </div>
        </div>

        <div>
          <label style={{ fontSize: 11, fontWeight: 700, color: '#f59e0b', display: 'block', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
            🎯 Target % (Optional)
          </label>
          <input
            type="number"
            placeholder="e.g., 15 for 15%"
            step="0.1"
            min="0"
            max="100"
            value={form.targetPercent}
            onChange={e => setForm({ ...form, targetPercent: e.target.value })}
            onKeyDown={handleKeyDown}
            style={{
              width: '100%',
              padding: '14px 16px',
              background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)',
              color: '#e6e9ef',
              border: '2px solid #2d3f5f',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 600,
              outline: 'none',
              textAlign: 'center',
              boxSizing: 'border-box',
              transition: 'border 0.2s ease',
            }}
            onFocus={e => e.target.style.borderColor = '#f59e0b'}
            onBlur={e => e.target.style.borderColor = '#2d3f5f'}
          />
          <div style={{ fontSize: 10, color: '#64748b', marginTop: 6, fontStyle: 'italic' }}>
            💡 Tip: Leave empty if you don't have a specific target allocation
          </div>
        </div>

        {error && (
          <div style={{
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(127, 29, 29, 0.2))',
            color: '#fca5a5',
            padding: '14px 16px',
            borderRadius: 10,
            fontSize: 13,
            borderLeft: '4px solid #ef4444',
            fontWeight: 600,
            boxShadow: '0 2px 8px rgba(239, 68, 68, 0.2)',
          }}>
            {error}
          </div>
        )}

        <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{
              flex: 1,
              padding: '14px 24px',
              background: loading ? '#6b7280' : 'linear-gradient(135deg, #22c55e, #16a34a)',
              color: 'white',
              border: 'none',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 800,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.3s ease',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(34, 197, 94, 0.3)',
              opacity: loading ? 0.6 : 1,
            }}
            onMouseEnter={e => !loading && (e.target.style.transform = 'translateY(-2px)')}
            onMouseLeave={e => !loading && (e.target.style.transform = 'translateY(0)')}
          >
            {loading ? '⏳ Adding Holding...' : '✅ Add Holding'}
          </button>
          <button
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: '14px 24px',
              background: loading ? '#1f2937' : '#374151',
              color: loading ? '#6b7280' : '#e6e9ef',
              border: '2px solid #4b5563',
              borderRadius: 10,
              fontSize: 15,
              fontWeight: 700,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.5 : 1,
            }}
            onMouseEnter={e => !loading && (e.target.style.background = '#4b5563')}
            onMouseLeave={e => !loading && (e.target.style.background = '#374151')}
          >
            Cancel
          </button>
        </div>
      </div>
    </Modal>
  )
}
