import React, { useState, useRef } from 'react'
import { api } from '../api'
import AddHoldingForm from './AddHoldingForm'
import Modal from './Modal'

export default function HoldingsEditor({ divId, subdivId, holdings = [], onUpdate, subdivisionName = '' }) {
  const [hoveredRow, setHoveredRow] = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [adjustHolding, setAdjustHolding] = useState(null)
  const [adjustAmount, setAdjustAmount] = useState('')
  const [adjustMode, setAdjustMode] = useState('add')
  const [localHoldings, setLocalHoldings] = useState(holdings)
  const updateTimersRef = useRef({})

  // Sync local holdings with prop
  React.useEffect(() => {
    setLocalHoldings(holdings)
  }, [holdings.map(h => `${h.id}:${h.invested}:${h.current}:${h.name}`).join('|')])

  const updateHolding = async (hid, data) => {
    // Optimistic update
    setLocalHoldings(prev => prev.map(h => h.id === hid ? { ...h, ...data } : h))
    
    // Clear pending timer if exists
    if (updateTimersRef.current[hid]) {
      clearTimeout(updateTimersRef.current[hid])
    }
    
    // Debounce: wait 800ms before saving to server
    updateTimersRef.current[hid] = setTimeout(async () => {
      try {
        await api.updateHolding(hid, data)
        onUpdate?.()
      } catch (e) {
        console.error('Failed to update holding:', e)
        setLocalHoldings(holdings)
        onUpdate?.()
      }
    }, 800)
  }

  async function deleteHolding(hid) {
    if (confirm('Delete holding?')) {
      await api.deleteHolding(hid)
      onUpdate?.()
    }
  }

  async function addNew(data) {
    await api.addHolding(divId || subdivId, data)
    setShowAddForm(false)
    onUpdate?.()
  }

  function openAdjustModal(h) {
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
    <div style={{ marginTop: 8, overflowX: 'auto' }}>
      <table style={{ width: '100%', fontSize: 'clamp(10px, 1.5vw, 12px)', borderCollapse: 'collapse', minWidth: 700 }}>
        <thead>
          <tr style={{ borderBottom: '2px solid #2d3f5f' }}>
            <th style={{ textAlign: 'left', padding: '10px 8px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Holding</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#7c92ab', width: 'clamp(120px, 15vw, 180px)', fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Invested</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#7c92ab', width: 'clamp(120px, 15vw, 180px)', fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Current</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#7c92ab', width: 80, fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>P/L</th>
            <th style={{ textAlign: 'right', padding: '10px 8px', color: '#7c92ab', width: 100, fontSize: 'clamp(9px, 1.3vw, 10px)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Target %</th>
            <th style={{ textAlign: 'center', padding: '10px 8px', width: 60 }}></th>
          </tr>
        </thead>
        <tbody>
          {localHoldings.map(h => {
            const pl = (Number(h.current) || 0) - (Number(h.invested) || 0)
            return (
              <tr 
                key={h.id} 
                style={{ borderBottom: '1px solid #1a2436', background: hoveredRow === h.id ? 'rgba(99, 102, 241, 0.05)' : 'transparent', transition: 'background 0.15s ease' }}
                onMouseEnter={() => setHoveredRow(h.id)}
                onMouseLeave={() => setHoveredRow(null)}
              >
                <td style={{ padding: '8px', color: '#e6e9ef' }}>
                  <input
                    value={h.name}
                    onChange={e => updateHolding(h.id, { name: e.target.value })}
                    style={{ width: '100%', padding: '5px 8px', background: '#0a1018', color: '#e6e9ef', border: '1px solid #2d3f5f', borderRadius: 5, fontSize: 12, fontWeight: 500 }}
                  />
                </td>
                <td style={{ padding: '6px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => {
                        const newInvested = Math.max(0, Number(h.invested) - 1000)
                        const newCurrent = Math.max(0, Number(h.current) - 1000)
                        updateHolding(h.id, { invested: newInvested, current: newCurrent })
                      }}
                      style={{ background: '#374151', color: '#9fb3c8', border: 'none', borderRadius: 4, padding: '4px 6px', fontSize: 10, cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.target.style.background = '#4b5563'; e.target.style.color = '#e6e9ef' }}
                      onMouseLeave={e => { e.target.style.background = '#374151'; e.target.style.color = '#9fb3c8' }}
                      title="Decrease by ₹1000"
                    >−</button>
                    <input
                      type="number"
                      value={h.invested}
                      onChange={e => updateHolding(h.id, { invested: Number(e.target.value) || 0 })}
                      style={{ width: 90, padding: '5px 6px', background: '#0a1018', color: '#e6e9ef', border: '1px solid #2d3f5f', borderRadius: 5, textAlign: 'right', fontSize: 11, fontWeight: 500 }}
                    />
                    <button
                      onClick={() => {
                        const newInvested = Number(h.invested) + 1000
                        const newCurrent = Number(h.current) + 1000
                        updateHolding(h.id, { invested: newInvested, current: newCurrent })
                      }}
                      style={{ background: '#374151', color: '#9fb3c8', border: 'none', borderRadius: 4, padding: '4px 6px', fontSize: 10, cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.target.style.background = '#4b5563'; e.target.style.color = '#e6e9ef' }}
                      onMouseLeave={e => { e.target.style.background = '#374151'; e.target.style.color = '#9fb3c8' }}
                      title="Increase by ₹1000"
                    >+</button>
                    <button
                      onClick={() => openAdjustModal(h)}
                      style={{ background: '#0ea5e9', color: '#e6f6ff', border: 'none', borderRadius: 4, padding: '4px 8px', fontSize: 10, cursor: 'pointer', transition: 'all 0.2s', fontWeight: 700 }}
                      onMouseEnter={e => { e.target.style.background = '#0284c7'; e.target.style.color = '#ffffff' }}
                      onMouseLeave={e => { e.target.style.background = '#0ea5e9'; e.target.style.color = '#e6f6ff' }}
                      title="Custom adjust (applies to invested & current)"
                    >⚡ Custom</button>
                  </div>
                </td>
                <td style={{ padding: '6px', textAlign: 'right' }}>
                  <div style={{ display: 'flex', gap: 4, alignItems: 'center', justifyContent: 'flex-end' }}>
                    <button
                      onClick={() => updateHolding(h.id, { current: Math.max(0, Number(h.current) - 1000) })}
                      style={{ background: '#374151', color: '#9fb3c8', border: 'none', borderRadius: 4, padding: '4px 6px', fontSize: 10, cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.target.style.background = '#4b5563'; e.target.style.color = '#e6e9ef' }}
                      onMouseLeave={e => { e.target.style.background = '#374151'; e.target.style.color = '#9fb3c8' }}
                      title="Decrease by ₹1000"
                    >−</button>
                    <input
                      type="number"
                      value={h.current}
                      onChange={e => updateHolding(h.id, { current: Number(e.target.value) || 0 })}
                      style={{ width: 90, padding: '5px 6px', background: '#0a1018', color: '#e6e9ef', border: '1px solid #2d3f5f', borderRadius: 5, textAlign: 'right', fontSize: 11, fontWeight: 500 }}
                    />
                    <button
                      onClick={() => updateHolding(h.id, { current: Number(h.current) + 1000 })}
                      style={{ background: '#374151', color: '#9fb3c8', border: 'none', borderRadius: 4, padding: '4px 6px', fontSize: 10, cursor: 'pointer', transition: 'all 0.2s' }}
                      onMouseEnter={e => { e.target.style.background = '#4b5563'; e.target.style.color = '#e6e9ef' }}
                      onMouseLeave={e => { e.target.style.background = '#374151'; e.target.style.color = '#9fb3c8' }}
                      title="Increase by ₹1000"
                    >+</button>
                  </div>
                </td>
                <td style={{ padding: '8px', textAlign: 'right', color: pl >= 0 ? '#22c55e' : '#ef4444', fontWeight: 600 }}>
                  {pl >= 0 ? '+' : ''}₹{pl.toLocaleString()}
                </td>
                <td style={{ padding: '8px', textAlign: 'right' }}>
                  <input
                    type="number"
                    step="0.01"
                    value={h.targetPercent || ''}
                    onChange={e => updateHolding(h.id, { targetPercent: Number(e.target.value) || 0 })}
                    style={{ width: '100%', padding: '5px 8px', background: '#0a1018', color: '#e6e9ef', border: '1px solid #2d3f5f', borderRadius: 5, textAlign: 'right', fontSize: 12, fontWeight: 500 }}
                    placeholder="-"
                  />
                </td>
                <td style={{ padding: '8px', textAlign: 'center' }}>
                  {hoveredRow === h.id && (
                    <button
                      type="button"
                      onClick={() => deleteHolding(h.id)}
                      style={{ background: '#ef4444', color: 'white', border: 'none', padding: '4px 10px', borderRadius: 4, cursor: 'pointer', fontSize: 10, fontWeight: 600, transition: 'all 0.2s ease' }}
                      onMouseEnter={(e) => e.target.style.background = '#dc2626'}
                      onMouseLeave={(e) => e.target.style.background = '#ef4444'}
                    >
                      Delete
                    </button>
                  )}
                </td>
              </tr>
            )
          })}
          {/* Add new button */}
          <tr style={{ borderTop: '2px solid #2d3f5f', background: '#0f1724' }}>
            <td colSpan="6" style={{ padding: '12px', textAlign: 'center' }}>
              <button
                onClick={() => setShowAddForm(true)}
                style={{
                  background: '#22c55e',
                  color: 'white',
                  border: 'none',
                  borderRadius: 6,
                  padding: '8px 16px',
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => e.target.style.background = '#16a34a'}
                onMouseLeave={(e) => e.target.style.background = '#22c55e'}
              >
                ➕ Add Holding
              </button>
            </td>
          </tr>
        </tbody>
      </table>

      <AddHoldingForm
        isOpen={showAddForm}
        onClose={() => setShowAddForm(false)}
        onAdd={addNew}
        subdivisionName={subdivisionName}
      />

      <Modal
        isOpen={!!adjustHolding}
        onClose={closeAdjustModal}
        title={`Adjust ${adjustHolding?.name || 'holding'}`}
      >
        <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
          <button
            onClick={() => setAdjustMode('add')}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #1e293b',
              background: adjustMode === 'add' ? '#22c55e' : '#0f172a',
              color: adjustMode === 'add' ? '#0b1910' : '#e6e9ef',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Add
          </button>
          <button
            onClick={() => setAdjustMode('deduct')}
            style={{
              flex: 1,
              padding: '10px 12px',
              borderRadius: 8,
              border: '1px solid #1e293b',
              background: adjustMode === 'deduct' ? '#ef4444' : '#0f172a',
              color: adjustMode === 'deduct' ? '#fff1f2' : '#e6e9ef',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            Deduct
          </button>
        </div>

        <label style={{ display: 'block', color: '#9fb3c8', fontSize: 12, marginBottom: 6 }}>Amount (₹)</label>
        <input
          type="number"
          value={adjustAmount}
          onChange={e => setAdjustAmount(e.target.value)}
          autoFocus
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #2d3f5f',
            background: '#0a1018',
            color: '#e6e9ef',
            fontSize: 14,
          }}
          placeholder="Enter amount"
        />

        <p style={{ marginTop: 10, marginBottom: 16, color: '#7c92ab', fontSize: 12 }}>
          This applies the same change to both Invested and Current values.
        </p>

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <button
            onClick={closeAdjustModal}
            style={{ padding: '10px 14px', borderRadius: 8, border: '1px solid #2d3f5f', background: 'transparent', color: '#e6e9ef', cursor: 'pointer' }}
          >
            Cancel
          </button>
          <button
            onClick={applyAdjust}
            style={{ padding: '10px 16px', borderRadius: 8, border: 'none', background: '#22c55e', color: '#0b1910', fontWeight: 800, cursor: 'pointer' }}
          >
            Apply
          </button>
        </div>
      </Modal>
    </div>
  )
}
