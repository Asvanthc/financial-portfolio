import React, { useEffect, useState } from 'react'
import Modal from './Modal'
import { api } from '../api'

export default function EditSubdivisionForm({ isOpen, onClose, subdivision, holdings = [], onSaved, divisionId }) {
  const [name, setName] = useState(subdivision?.name || '')
  const [targetPercent, setTargetPercent] = useState(Number(subdivision?.targetPercent) || 0)
  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [deletedIds, setDeletedIds] = useState([])

  useEffect(() => {
    if (subdivision) {
      setName(subdivision.name || '')
      setTargetPercent(Number(subdivision.targetPercent) || 0)
      setRows((holdings || []).map(h => ({
        id: h.id,
        name: h.name || '',
        invested: Number(h.invested) || 0,
        current: Number(h.current) || 0,
        targetPercent: Number(h.targetPercent) || 0,
        _original: { name: h.name || '', invested: Number(h.invested)||0, current: Number(h.current)||0, targetPercent: Number(h.targetPercent)||0 }
      })))
      setError('')
      setDeletedIds([])
    }
  }, [subdivision, holdings])

  const updateRow = (id, patch) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, ...patch } : r))
  }

  const addRow = () => {
    const newId = `new-${Date.now()}-${Math.floor(Math.random()*100000)}`
    setRows(prev => [...prev, {
      id: newId,
      name: '',
      invested: 0,
      current: 0,
      targetPercent: 0,
      _isNew: true,
      _original: { name: '', invested: 0, current: 0, targetPercent: 0 }
    }])
  }

  const removeRow = (id) => {
    const row = rows.find(r => r.id === id)
    if (!row) return
    if (!row._isNew) setDeletedIds(prev => [...prev, id])
    setRows(prev => prev.filter(r => r.id !== id))
  }

  // Live summary for better visualization
  const totalInvested = rows.reduce((sum, r) => sum + (Number(r.invested)||0), 0)
  const totalCurrent = rows.reduce((sum, r) => sum + (Number(r.current)||0), 0)
  const totalPL = totalCurrent - totalInvested
  const plPercent = totalInvested > 0 ? (totalPL / totalInvested) * 100 : 0

  const handleSave = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      // Save subdivision first
      await api.updateSubdivision(subdivision.id, { name: name.trim(), targetPercent: Number(targetPercent) || 0 })

      // Delete removed holdings
      if (deletedIds.length > 0) {
        await Promise.all(deletedIds.map(id => api.deleteHolding(id)))
      }

      // Add new holdings
      const newRows = rows.filter(r => r._isNew && r.name.trim())
      if (newRows.length > 0) {
        if (!divisionId) throw new Error('Missing divisionId for adding holdings')
        await Promise.all(newRows.map(r => api.addHolding(divisionId, {
          name: r.name.trim(),
          invested: Number(r.invested)||0,
          current: Number(r.current)||0,
          targetPercent: Number(r.targetPercent)||0,
          subdivisionId: subdivision.id,
        })))
      }

      // Update modified existing holdings
      const changes = rows.filter(r => !r._isNew && (
        r.name !== r._original.name ||
        r.invested !== r._original.invested ||
        r.current !== r._original.current ||
        r.targetPercent !== r._original.targetPercent
      ))
      if (changes.length > 0) {
        await Promise.all(changes.map(r => api.updateHolding(r.id, {
          name: r.name,
          invested: Number(r.invested)||0,
          current: Number(r.current)||0,
          targetPercent: Number(r.targetPercent)||0,
        })))
      }

      onSaved?.()
      onClose()
    } catch (err) {
      setError(err.message || 'Failed to save subdivision changes')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="✏️ Edit Subdivision" size="lg">
      <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {error && (
          <div style={{ padding: '10px 14px', border: '2px solid #ef4444', borderRadius: 10, color: '#fca5a5', background: 'rgba(239,68,68,0.08)', fontWeight: 600 }}>⚠️ {error}</div>
        )}

        {/* Summary stats */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 12 }}>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #1e293b', background: '#0a1018' }}>
            <div style={{ fontSize: 11, color: '#7c92ab', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Invested</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#fbbf24' }}>₹{Math.ceil(totalInvested).toLocaleString()}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #1e293b', background: '#0a1018' }}>
            <div style={{ fontSize: 11, color: '#7c92ab', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Current</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#22d3ee' }}>₹{Math.ceil(totalCurrent).toLocaleString()}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #1e293b', background: '#0a1018' }}>
            <div style={{ fontSize: 11, color: '#7c92ab', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>P/L</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: totalPL >= 0 ? '#22c55e' : '#ef4444' }}>{totalPL >= 0 ? '+' : ''}₹{Math.ceil(totalPL).toLocaleString()}</div>
          </div>
          <div style={{ padding: 12, borderRadius: 10, border: '1px solid #1e293b', background: '#0a1018' }}>
            <div style={{ fontSize: 11, color: '#7c92ab', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>% Change</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: totalPL >= 0 ? '#22c55e' : '#ef4444' }}>{isFinite(plPercent) ? plPercent.toFixed(2) + '%' : '—'}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12 }}>
          <div style={{ flex: 2 }}>
            <label style={{ display: 'block', color: '#7dd3fc', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>📂 Subdivision Name</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Large Cap, Mid Cap, International"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #2d3f5f', background: '#0f1724', color: '#e6e9ef', fontSize: 14, fontWeight: 600 }}
            />
          </div>
          <div style={{ flex: 1 }}>
            <label style={{ display: 'block', color: '#a78bfa', fontSize: 12, fontWeight: 700, marginBottom: 6 }}>🎯 Target within Division (%)</label>
            <input
              type="number"
              step="0.01"
              value={targetPercent}
              onChange={e => setTargetPercent(e.target.value)}
              placeholder="10.00"
              style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '2px solid #2d3f5f', background: '#0f1724', color: '#a78bfa', fontSize: 14, fontWeight: 700, textAlign: 'right' }}
            />
          </div>
        </div>

        <div style={{ marginTop: 6, borderTop: '1px solid #1e293b', paddingTop: 10 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
            <div style={{ color: '#7c92ab', fontSize: 11, textTransform: 'uppercase', fontWeight: 700 }}>Holding</div>
            <div style={{ color: '#7c92ab', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, textAlign: 'right' }}>Invested (₹)</div>
            <div style={{ color: '#7c92ab', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, textAlign: 'right' }}>Current (₹)</div>
            <div style={{ color: '#7c92ab', fontSize: 11, textTransform: 'uppercase', fontWeight: 700, textAlign: 'right' }}>Target %</div>
            <div></div>
          </div>

          {rows.map(r => (
            <div key={r.id} style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr 60px', gap: 8, alignItems: 'center', marginBottom: 8 }}>
              <input
                type="text"
                value={r.name}
                onChange={e => updateRow(r.id, { name: e.target.value })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #2d3f5f', background: '#0f1724', color: '#e6e9ef', fontSize: 13 }}
              />
              <input
                type="number"
                value={r.invested}
                onChange={e => updateRow(r.id, { invested: Number(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #2d3f5f', background: '#0f1724', color: '#fbbf24', fontSize: 13, textAlign: 'right' }}
              />
              <input
                type="number"
                value={r.current}
                onChange={e => updateRow(r.id, { current: Number(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #2d3f5f', background: '#0f1724', color: '#22c55e', fontSize: 13, textAlign: 'right' }}
              />
              <input
                type="number"
                step="0.01"
                value={r.targetPercent}
                onChange={e => updateRow(r.id, { targetPercent: Number(e.target.value) || 0 })}
                style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid #2d3f5f', background: '#0f1724', color: '#a78bfa', fontSize: 13, textAlign: 'right' }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => removeRow(r.id)}
                  title="Delete holding"
                  style={{ background: '#ef4444', color: 'white', border: 'none', padding: '6px 10px', borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: 'pointer' }}
                  onMouseEnter={(e) => e.target.style.background = '#dc2626'}
                  onMouseLeave={(e) => e.target.style.background = '#ef4444'}
                >🗑️</button>
              </div>
            </div>
          ))}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 10 }}>
            <button
              type="button"
              onClick={addRow}
              style={{ background: 'linear-gradient(135deg, #22c55e, #16a34a)', color: '#ffffff', border: 'none', padding: '8px 14px', borderRadius: 10, fontSize: 13, fontWeight: 800, cursor: 'pointer', boxShadow: '0 3px 10px rgba(34,197,94,0.3)' }}
              onMouseEnter={(e) => e.target.style.transform = 'translateY(-2px)'}
              onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
            >➕ Add Holding</button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 12, marginTop: 8 }}>
          <button type="button" onClick={onClose} disabled={loading} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: '2px solid #2d3f5f', background: 'transparent', color: '#e6e9ef', fontWeight: 700, cursor: loading ? 'not-allowed' : 'pointer' }}>
            Cancel
          </button>
          <button type="submit" disabled={loading} style={{ flex: 1, padding: '12px 16px', borderRadius: 10, border: 'none', background: loading ? '#6b7280' : 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#ffffff', fontWeight: 800, cursor: loading ? 'not-allowed' : 'pointer', boxShadow: loading ? 'none' : '0 4px 12px rgba(14,165,233,0.3)' }}>
            {loading ? '⏳ Saving...' : '💾 Save All'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
