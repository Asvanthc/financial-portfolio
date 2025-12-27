import React, { useState } from 'react'
import { api } from '../api'
import AddHoldingForm from './AddHoldingForm'
import EditHoldingForm from './EditHoldingForm'
import Modal from './Modal'

export default function HoldingsEditor({ divId, subdivId, holdings = [], onUpdate, subdivisionName = '', readOnly = false }) {
  const [hoveredRow, setHoveredRow] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null)
  const [adjustHolding, setAdjustHolding] = useState(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustMode, setAdjustMode] = useState('add')
  const [loading, setLoading] = useState(false)
  const [successMessage, setSuccessMessage] = useState('')

  const updateHolding = async (hid, data) => {
    try {
      await api.updateHolding(hid, data)
      setSuccessMessage('✅ Changes saved!')
      setTimeout(() => setSuccessMessage(''), 2000)
      onUpdate?.()
    } catch (e) {
      console.error('Failed to update holding:', e)
      alert('Failed to save changes: ' + e.message)
    }
  }

  async function deleteHolding(hid) {
    if (confirm('Delete holding?')) {
      await api.deleteHolding(hid)
      onUpdate?.()
    }
  }

  async function addNew(data) {
    if (!divId) {
      alert('Error: Division ID is required to add holdings')
      return
    }
    setLoading(true)
    try {
      const payload = subdivId ? { ...data, subdivisionId: subdivId } : data
      await api.addHolding(divId, payload)
      setShowAddForm(false)
      setSuccessMessage('✅ Holding added successfully!')
      setTimeout(() => setSuccessMessage(''), 3000)
      onUpdate?.()
    } catch (e) {
      alert('Failed to add holding: ' + e.message)
    } finally {
      setLoading(false)
    }
  }

  function openAdjustModal(h) {
    if (readOnly) return
    setAdjustHolding(h)
    setAdjustAmount('')
    setAdjustMode('add')
  }

  function closeAdjustModal() {
    setAdjustHolding(null)
    setAdjustAmount('')
    setAdjustMode('add')
  }

  async function applyAdjust() {
    if (!adjustHolding) return
    const amt = Number(adjustAmount)
    if (!amt || amt < 0) return
    const delta = adjustMode === 'add' ? amt : -amt
    const live = holdings.find(h => h.id === adjustHolding.id) || adjustHolding
    const invested = Math.max(0, (Number(live.invested) || 0) + delta)
    const current = Math.max(0, (Number(live.current) || 0) + delta)
    await updateHolding(adjustHolding.id, { invested, current })
    closeAdjustModal()
  }

  return (
    <div style={{ marginTop: 8, overflowX: 'auto', position: 'relative' }}>
      {successMessage && !readOnly && (
        <div style={{
          position: 'fixed',
          top: 20,
          right: 20,
          background: 'linear-gradient(135deg, #22c55e, #16a34a)',
          color: 'white',
          padding: '12px 20px',
          borderRadius: 8,
          boxShadow: '0 4px 20px rgba(34, 197, 94, 0.4)',
          zIndex: 1000,
          fontWeight: 600,
          fontSize: 14,
          animation: 'slideIn 0.3s ease-out'
        }}>
          {successMessage}
        </div>
      )}
      <table style={{ width: '100%', fontSize: 'clamp(10px, 1.5vw, 12px)', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #2d3f5f' }}>
            <th style={{ textAlign: 'left', padding: '10px 8px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Holding</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#7c92ab', width: 'clamp(120px, 15vw, 180px)', fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invested</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#7c92ab', width: 'clamp(120px, 15vw, 180px)', fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#7c92ab', width: 80, fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>P/L</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#7c92ab', width: 100, fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target %</th>
            {!readOnly && (<th style={{ textAlign: 'center', padding: '10px 8px', width: 80 }}></th>)}
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => {
            const pl = (Number(h.current) || 0) - (Number(h.invested) || 0)
            return (
              <tr 
                key={h.id} 
                style={{ borderBottom: '1px solid #1a2436', background: hoveredRow === h.id ? 'rgba(99, 102, 241, 0.05)' : 'transparent', transition: 'background 0.15s ease' }}
                onMouseEnter={() => setHoveredRow(h.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td style={{ padding: '10px 12px', color: '#e6e9ef' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{h.name}</span>
                    {!readOnly && hoveredRow === h.id && (
                      <button
                        type="button"
                        onClick={() => setEditingHolding(h)}
                        style={{
                          background: 'linear-gradient(135deg, #0ea5e9, #0284c7)',
                          color: '#ffffff',
                          border: 'none',
                          borderRadius: 5,
                          padding: '4px 10px',
                          fontSize: 11,
                          fontWeight: 700,
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                          boxShadow: '0 2px 4px rgba(14, 165, 233, 0.3)',
                          whiteSpace: 'nowrap'
                        }}
                        onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                        onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                      >
                        ✏️ Edit
                      </button>
                    )}
                  </div>
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        const newInvested = Math.max(0, Number(h.invested) - 1000)
                        const newCurrent = Math.max(0, Number(h.current) - 1000)
                        updateHolding(h.id, { invested: newInvested, current: newCurrent })
                      }}
                      style={{ 
                        background: 'linear-gradient(135deg, #4b5563, #374151)', 
                        color: '#e6e9ef', 
                        border: 'none', 
                        borderRadius: 5, 
                        padding: '5px 8px', 
                        fontSize: 11, 
                        fontWeight: 700,
                        cursor: 'pointer', 
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}
                      onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                      onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                      title="Decrease by ₹1000"
                    >−</button>)}
                    <span style={{ 
                      minWidth: 85, 
                      padding: '5px 6px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#fbbf24'
                    }}>
                      ₹{Number(h.invested).toLocaleString()}
                    </span>
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => {
                        const newInvested = Number(h.invested) + 1000
                        const newCurrent = Number(h.current) + 1000
                        updateHolding(h.id, { invested: newInvested, current: newCurrent })
                      }}
                      style={{ 
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)', 
                        color: '#ffffff', 
                        border: 'none', 
                        borderRadius: 5, 
                        padding: '5px 8px', 
                        fontSize: 11, 
                        fontWeight: 700,
                        cursor: 'pointer', 
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(34, 197, 94, 0.3)'
                      }}
                      onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                      onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                      title="Increase by ₹1000"
                    >+</button>)}
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => openAdjustModal(h)}
                      style={{ 
                        background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', 
                        color: '#ffffff', 
                        border: 'none', 
                        borderRadius: 5, 
                        padding: '5px 9px', 
                        fontSize: 10, 
                        cursor: 'pointer', 
                        transition: 'all 0.2s', 
                        fontWeight: 700,
                        boxShadow: '0 2px 4px rgba(14, 165, 233, 0.3)'
                      }}
                      onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                      onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                      title="Custom adjust (applies to invested & current)"
                    >⚡</button>)}
                  </div>
                </td>
                <td style={{ padding: '8px 6px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => updateHolding(h.id, { current: Math.max(0, Number(h.current) - 1000) })}
                      style={{ 
                        background: 'linear-gradient(135deg, #4b5563, #374151)', 
                        color: '#e6e9ef', 
                        border: 'none', 
                        borderRadius: 5, 
                        padding: '5px 8px', 
                        fontSize: 11, 
                        fontWeight: 700,
                        cursor: 'pointer', 
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
                      }}
                      onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                      onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                      title="Decrease by ₹1000"
                    >−</button>)}
                    <span style={{ 
                      minWidth: 85, 
                      padding: '5px 6px',
                      fontSize: 13,
                      fontWeight: 600,
                      color: '#22c55e'
                    }}>
                      ₹{Number(h.current).toLocaleString()}
                    </span>
                    {!readOnly && (
                    <button
                      type="button"
                      onClick={() => updateHolding(h.id, { current: Number(h.current) + 1000 })}
                      style={{ 
                        background: 'linear-gradient(135deg, #22c55e, #16a34a)', 
                        color: '#ffffff', 
                        border: 'none', 
                        borderRadius: 5, 
                        padding: '5px 8px', 
                        fontSize: 11, 
                        fontWeight: 700,
                        cursor: 'pointer', 
                        transition: 'all 0.2s',
                        boxShadow: '0 2px 4px rgba(34, 197, 94, 0.3)'
                      }}
                      onMouseEnter={e => e.target.style.transform = 'scale(1.05)'}
                      onMouseLeave={e => e.target.style.transform = 'scale(1)'}
                      title="Increase by ₹1000"
                    >+</button>)}
                  </div>
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right', color: pl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600, fontSize: 13 }}>
                  {pl >= 0 ? '+' : ''}₹{pl.toLocaleString()}
                </td>
                <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                  <span style={{ fontSize: 13, fontWeight: 600, color: '#a78bfa' }}>
                    {h.targetPercent ? `${Number(h.targetPercent).toFixed(2)}%` : '-'}
                  </span>
                </td>
                {!readOnly && (
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  {hoveredRow === h.id && (
                    <button
                      type="button"
                      onClick={() => deleteHolding(h.id)}
                      style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 5, cursor: 'pointer', fontSize: 10, fontWeight: 600, transition: 'all 0.2s ease' }}
                      onMouseEnter={(e) => e.target.style.background = '#dc2626'}
                      onMouseLeave={(e) => e.target.style.background = '#ef4444'}
                    >
                      🗑️
                    </button>
                  )}
                </td>
                )}
              </tr>
            )
          })}
          {!readOnly && (
          <tr style={{ borderTop: '2px solid #2d3f5f', background: '#0f1724' }}>
            <td colSpan="6" style={{ padding: '12px', textAlign: 'center' }}>
              <button
                onClick={() => setShowAddForm(true)}
                disabled={loading}
                style={{
                  background: loading ? '#6b7280' : 'linear-gradient(135deg, #22c55e, #16a34a)',
                  color: 'white',
                  border: 'none',
                  borderRadius: 8,
                  padding: '10px 20px',
                  fontSize: 13,
                  fontWeight: 700,
                  cursor: loading ? 'not-allowed' : 'pointer',
                  transition: 'all 0.2s ease',
                  opacity: loading ? 0.6 : 1,
                  boxShadow: loading ? 'none' : '0 3px 10px rgba(34, 197, 94, 0.3)'
                }}
                onMouseEnter={(e) => !loading && (e.target.style.transform = 'translateY(-2px)')}
                onMouseLeave={(e) => !loading && (e.target.style.transform = 'translateY(0)')}
              >
                {loading ? '⏳ Adding...' : '➕ Add Holding'}
              </button>
            </td>
          </tr>
          )}
        </tbody>
      </table>
      {!readOnly && (
        <AddHoldingForm
          isOpen={showAddForm}
          onClose={() => setShowAddForm(false)}
          onAdd={addNew}
          subdivisionName={subdivisionName}
        />
      )}

      {!readOnly && (
        <EditHoldingForm
          isOpen={!!editingHolding}
          onClose={() => setEditingHolding(null)}
          holding={editingHolding}
          onSave={async (data) => {
            await updateHolding(editingHolding.id, data)
            setEditingHolding(null)
          }}
        />
      )}

      {!readOnly && (
        <Modal
          isOpen={!!adjustHolding}
          onClose={closeAdjustModal}
          title={`⚡ Adjust ${adjustHolding?.name || 'holding'}`}
        >
          <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
            <button
              onClick={() => setAdjustMode('add')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 8,
                border: '2px solid #1e293b',
                background: adjustMode === 'add' ? 'linear-gradient(135deg, #22c55e, #16a34a)' : '#0f172a',
                color: adjustMode === 'add' ? '#ffffff' : '#e6e9ef',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ➕ Add
            </button>
            <button
              onClick={() => setAdjustMode('deduct')}
              style={{
                flex: 1,
                padding: '12px',
                borderRadius: 8,
                border: '2px solid #1e293b',
                background: adjustMode === 'deduct' ? 'linear-gradient(135deg, #ef4444, #dc2626)' : '#0f172a',
                color: adjustMode === 'deduct' ? '#ffffff' : '#e6e9ef',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
            >
              ➖ Deduct
            </button>
          </div>

          <label style={{ display: 'block', color: '#9fb3c8', fontSize: 13, fontWeight: 600, marginBottom: 8 }}>Amount (₹)</label>
          <input
            type="number"
            value={adjustAmount}
            onChange={e => setAdjustAmount(e.target.value)}
            autoFocus
            style={{
              width: '100%',
              padding: '12px 14px',
              borderRadius: 10,
              border: '2px solid #2d3f5f',
              background: '#0a1018',
              color: '#e6e9ef',
              fontSize: 16,
              fontWeight: 600,
              outline: 'none',
              transition: 'all 0.2s'
            }}
            onFocus={(e) => e.target.style.borderColor = '#0ea5e9'}
            onBlur={(e) => e.target.style.borderColor = '#2d3f5f'}
            placeholder="Enter amount"
          />

          <p style={{ marginTop: 12, marginBottom: 18, color: '#7c92ab', fontSize: 12, fontStyle: 'italic' }}>
            💡 This applies the same change to both Invested and Current values.
          </p>

          <div style={{ display: 'flex', gap: 12 }}>
            <button
              onClick={closeAdjustModal}
              style={{ 
                flex: 1,
                padding: '12px 16px', 
                borderRadius: 10, 
                border: '2px solid #2d3f5f', 
                background: 'transparent', 
                color: '#e6e9ef', 
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.borderColor = '#4f5d73'}
              onMouseLeave={(e) => e.target.style.borderColor = '#2d3f5f'}
            >
              Cancel
            </button>
            <button
              onClick={applyAdjust}
              style={{ 
                flex: 1,
                padding: '12px 16px', 
                borderRadius: 10, 
                border: 'none', 
                background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', 
                color: '#ffffff', 
                fontWeight: 800,
                fontSize: 14,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(14, 165, 233, 0.3)',
                transition: 'all 0.2s'
              }}
              onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
            >
              💾 Apply
            </button>
          </div>
        </Modal>
      )}
    </div>
  )
}
