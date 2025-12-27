import React, { useState } from 'react'
import Modal from './Modal'

export default function EditHoldingForm({ isOpen, onClose, holding, onSave }) {
  const [name, setName] = useState(holding?.name || '')
  const [invested, setInvested] = useState(holding?.invested || 0)
  const [current, setCurrent] = useState(holding?.current || 0)
  const [targetPercent, setTargetPercent] = useState(holding?.targetPercent || 0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Update form when holding changes
  React.useEffect(() => {
    if (holding) {
      setName(holding.name || '')
      setInvested(holding.invested || 0)
      setCurrent(holding.current || 0)
      setTargetPercent(holding.targetPercent || 0)
      setError('')
    }
  }, [holding])

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!name.trim()) {
      setError('Holding name is required')
      return
    }
    if (!invested || invested < 0) {
      setError('Invested amount must be positive')
      return
    }
    if (!current || current < 0) {
      setError('Current value must be positive')
      return
    }
    
    setLoading(true)
    setError('')
    try {
      await onSave({
        name: name.trim(),
        invested: Number(invested),
        current: Number(current),
        targetPercent: Number(targetPercent) || 0
      })
      onClose()
    } catch (e) {
      setError(e.message || 'Failed to update holding')
    } finally {
      setLoading(false)
    }
  }

  const pl = (Number(current) || 0) - (Number(invested) || 0)
  const plPercent = invested > 0 ? ((pl / invested) * 100).toFixed(2) : 0

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="✏️ Edit Holding">
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {error && (
          <div style={{
            padding: '12px 16px',
            background: 'linear-gradient(135deg, rgba(239, 68, 68, 0.15), rgba(220, 38, 38, 0.15))',
            border: '2px solid #ef4444',
            borderRadius: 10,
            color: '#fca5a5',
            fontSize: 13,
            fontWeight: 600,
            textAlign: 'center'
          }}>
            ⚠️ {error}
          </div>
        )}

        {/* Holding Name */}
        <div>
          <label style={{ 
            display: 'block', 
            color: '#7dd3fc', 
            fontSize: 13, 
            fontWeight: 700, 
            marginBottom: 8,
            letterSpacing: '0.3px'
          }}>
            📊 Holding Name
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            disabled={loading}
            placeholder="HDFC Bank, Nifty 50 Index, Gold ETF"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              background: loading ? '#1a2436' : '#0f1724',
              color: '#e6e9ef',
              border: '2px solid #2d3f5f',
              borderRadius: 10,
              outline: 'none',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.6 : 1
            }}
            onFocus={(e) => e.target.style.borderColor = '#0ea5e9'}
            onBlur={(e) => e.target.style.borderColor = '#2d3f5f'}
          />
        </div>

        {/* Invested Amount */}
        <div>
          <label style={{ 
            display: 'block', 
            color: '#fbbf24', 
            fontSize: 13, 
            fontWeight: 700, 
            marginBottom: 8,
            letterSpacing: '0.3px'
          }}>
            💰 Invested Amount (₹)
          </label>
          <input
            type="number"
            value={invested}
            onChange={(e) => setInvested(e.target.value)}
            disabled={loading}
            placeholder="10000"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 16,
              fontWeight: 700,
              background: loading ? '#1a2436' : '#0f1724',
              color: '#fbbf24',
              border: '2px solid #2d3f5f',
              borderRadius: 10,
              outline: 'none',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.6 : 1
            }}
            onFocus={(e) => e.target.style.borderColor = '#fbbf24'}
            onBlur={(e) => e.target.style.borderColor = '#2d3f5f'}
          />
        </div>

        {/* Current Value */}
        <div>
          <label style={{ 
            display: 'block', 
            color: '#22c55e', 
            fontSize: 13, 
            fontWeight: 700, 
            marginBottom: 8,
            letterSpacing: '0.3px'
          }}>
            📈 Current Value (₹)
          </label>
          <input
            type="number"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            disabled={loading}
            placeholder="12000"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 16,
              fontWeight: 700,
              background: loading ? '#1a2436' : '#0f1724',
              color: '#22c55e',
              border: '2px solid #2d3f5f',
              borderRadius: 10,
              outline: 'none',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.6 : 1
            }}
            onFocus={(e) => e.target.style.borderColor = '#22c55e'}
            onBlur={(e) => e.target.style.borderColor = '#2d3f5f'}
          />
          {invested > 0 && (
            <div style={{ 
              marginTop: 8, 
              fontSize: 12, 
              fontWeight: 600,
              color: pl >= 0 ? '#22c55e' : '#ef4444'
            }}>
              P/L: {pl >= 0 ? '+' : ''}₹{pl.toLocaleString()} ({pl >= 0 ? '+' : ''}{plPercent}%)
            </div>
          )}
        </div>

        {/* Target Allocation % */}
        <div>
          <label style={{ 
            display: 'block', 
            color: '#a78bfa', 
            fontSize: 13, 
            fontWeight: 700, 
            marginBottom: 8,
            letterSpacing: '0.3px'
          }}>
            🎯 Target Allocation (%)
          </label>
          <input
            type="number"
            step="0.01"
            value={targetPercent}
            onChange={(e) => setTargetPercent(e.target.value)}
            disabled={loading}
            placeholder="10.00"
            style={{
              width: '100%',
              padding: '12px 16px',
              fontSize: 14,
              fontWeight: 600,
              background: loading ? '#1a2436' : '#0f1724',
              color: '#a78bfa',
              border: '2px solid #2d3f5f',
              borderRadius: 10,
              outline: 'none',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.6 : 1
            }}
            onFocus={(e) => e.target.style.borderColor = '#a78bfa'}
            onBlur={(e) => e.target.style.borderColor = '#2d3f5f'}
          />
          <div style={{ marginTop: 6, fontSize: 11, color: '#7c92ab', fontStyle: 'italic' }}>
            Optional: Set target % for rebalancing alerts
          </div>
        </div>

        {/* Action Buttons */}
        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button
            type="button"
            onClick={onClose}
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 700,
              background: 'transparent',
              color: loading ? '#4b5563' : '#9fb3c8',
              border: '2px solid #2d3f5f',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              opacity: loading ? 0.5 : 1
            }}
            onMouseEnter={(e) => !loading && (e.target.style.borderColor = '#4f5d73')}
            onMouseLeave={(e) => !loading && (e.target.style.borderColor = '#2d3f5f')}
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            style={{
              flex: 1,
              padding: '12px 20px',
              fontSize: 14,
              fontWeight: 800,
              background: loading ? '#6b7280' : 'linear-gradient(135deg, #0ea5e9, #0284c7)',
              color: '#ffffff',
              border: 'none',
              borderRadius: 10,
              cursor: loading ? 'not-allowed' : 'pointer',
              transition: 'all 0.2s ease',
              boxShadow: loading ? 'none' : '0 4px 12px rgba(14, 165, 233, 0.3)',
              opacity: loading ? 0.6 : 1
            }}
            onMouseEnter={(e) => !loading && (e.target.style.transform = 'translateY(-2px)')}
            onMouseLeave={(e) => !loading && (e.target.style.transform = 'translateY(0)')}
          >
            {loading ? '⏳ Saving...' : '💾 Save Changes'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
