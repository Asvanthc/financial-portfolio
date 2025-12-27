import React, { useState, useRef, useCallback } from 'react'
import { api } from '../api'
import HoldingsEditor from './HoldingsEditor'

import EditSubdivisionForm from './EditSubdivisionForm'

export default function DivisionCard({ division, analytics, subdivisionGoalSeek, onUpdate }) {
  const [expanded, setExpanded] = useState(true)
  const [newSubDiv, setNewSubDiv] = useState({ name: '', targetPercent: '' })
  const [hoveredDiv, setHoveredDiv] = useState(false)
  const [hoveredSub, setHoveredSub] = useState(null)
  const [editingName, setEditingName] = useState(division.name)
  const [editingTarget, setEditingTarget] = useState(division.targetPercent)
  const isSavingRef = useRef(false)

  // Sync editing state when division prop changes (from server or initial load)
  React.useEffect(() => {
    if (!isSavingRef.current) {
      setEditingName(division.name)
      setEditingTarget(division.targetPercent)
    }
  }, [division.name, division.targetPercent])

  const divAnalytics = analytics.divisions?.find(d => d.id === division.id) || {}
  const invested = divAnalytics.invested || 0
  const current = divAnalytics.current || 0
  const profit = divAnalytics.profit || 0
  const profitPercent = invested > 0 ? (profit / invested) * 100 : 0
  const targetPercent = Number(editingTarget) || 0
  const currentPercent = divAnalytics.currentPercent || 0
  const delta = divAnalytics.deltaPercent || 0
  const requiredAdd = divAnalytics.requiredAddition || 0
  const projected = current + requiredAdd
  const gainLoss = profit >= 0 ? '22c55e' : 'ef4444'

  // Get subdivision analytics from backend
  const subdivisionAnalytics = divAnalytics.subdivisions || []
  
  // Get subdivision goal seek data for this division
  const divSubGoalSeek = subdivisionGoalSeek?.[division.id] || {}
  const subGoalSeekAdds = divSubGoalSeek.additionsBySubdivision || {}
  const totalSubGoalSeek = divSubGoalSeek.requiredAddition || 0

  // Direct save without debounce to ensure persistence
  const updateDivision = useCallback(async (patch) => {
    // Skip if already saving
    if (isSavingRef.current) return
    
    isSavingRef.current = true
    console.log('Saving division update:', division.id, patch)
    
    try {
      await api.updateDivision(division.id, patch)
      console.log('Division update saved successfully')
      onUpdate?.()
    } catch (e) {
      console.error('Failed to update division:', e)
      alert('Failed to save changes: ' + e.message)
    } finally {
      isSavingRef.current = false
    }
  }, [division.id, onUpdate])

  async function deleteDivision() {
    if (confirm(`Delete division "${division.name}"?`)) {
      await api.deleteDivision(division.id)
      onUpdate?.()
    }
  }

  const [editingSubdivision, setEditingSubdivision] = useState(null)

  async function addSubdivision() {
    if (!newSubDiv.name) return
    await api.addSubdivision(division.id, newSubDiv)
    setNewSubDiv({ name: '', targetPercent: '' })
    onUpdate?.()
  }

  async function updateSubdivision(sid, patch) {
    await api.updateSubdivision(sid, patch)
    onUpdate?.()
  }

  async function deleteSubdivision(sid) {
    if (confirm('Delete subdivision?')) {
      await api.deleteSubdivision(sid)
      onUpdate?.()
    }
  }

  return (
    <div 
      style={{ marginBottom: 'clamp(16px, 2.5vw, 24px)', borderRadius: 'clamp(12px, 2.5vw, 16px)', background: 'linear-gradient(135deg, rgba(34,211,238,0.08) 0%, rgba(168,139,250,0.08) 50%, rgba(99,102,241,0.06) 100%), #0f1724', border: '2px solid #1e293b', overflow: 'hidden', boxShadow: hoveredDiv ? '0 16px 40px rgba(34,211,238,0.2), 0 0 0 1px rgba(34,211,238,0.1)' : '0 8px 24px rgba(0,0,0,0.4)', transition: 'all 0.3s ease', transform: hoveredDiv ? 'translateY(-2px)' : 'translateY(0)' }}
      onMouseEnter={() => setHoveredDiv(true)}
      onMouseLeave={() => setHoveredDiv(false)}
    >
      <div
        onClick={() => setExpanded(!expanded)}
        style={{
          padding: 'clamp(14px, 2.5vw, 20px) clamp(16px, 3vw, 24px)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 'clamp(10px, 2vw, 18px)',
          flexWrap: 'wrap',
          background: hoveredDiv ? 'linear-gradient(135deg, #1e293b 0%, #0f1724 100%)' : 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)',
          borderBottom: expanded ? '2px solid #334155' : 'none',
          transition: 'all 0.3s ease',
        }}
      >
        <span style={{ fontSize: 18, color: '#7c92ab', transition: 'transform 0.2s ease', transform: expanded ? 'rotate(0deg)' : 'rotate(-90deg)' }}>▾</span>
        <div style={{ flex: 1 }}>
          <input
            onClick={e => e.stopPropagation()}
            type="text"
            value={editingName}
            onChange={e => setEditingName(e.target.value)}
            onBlur={e => {
              if (e.target.value !== division.name) {
                updateDivision({ name: e.target.value })
              }
            }}
            style={{
              background: 'transparent',
              color: '#e6e9ef',
              border: 'none',
              fontSize: 'clamp(16px, 2.5vw, 20px)',
              fontWeight: 700,
              outline: 'none',
              padding: 0,
              letterSpacing: '0.3px',
              width: '100%',
            }}
          />
        </div>

        <div style={{ display: 'flex', gap: 'clamp(12px, 2vw, 24px)', alignItems: 'center', overflowX: 'auto', flex: '1 1 auto', minWidth: 0, paddingBottom: 4 }}>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 10, color: '#7c92ab', marginBottom: 4, textTransform: 'uppercase', fontWeight: 600, letterSpacing: '0.5px' }}>Target %</div>
            <input
              onClick={e => e.stopPropagation()}
              type="number"
              step="0.01"
              value={editingTarget}
              onChange={e => setEditingTarget(e.target.value)}
              onBlur={e => {
                const newVal = Number(e.target.value) || 0
                if (newVal !== division.targetPercent) {
                  updateDivision({ targetPercent: newVal })
                }
              }}
              style={{
                width: 65,
                padding: '6px 8px',
                background: '#0a1018',
                color: '#e6e9ef',
                border: '1px solid #1f2d3f',
                borderRadius: 6,
                textAlign: 'center',
                fontSize: 13,
                fontWeight: 600,
              }}
            />
          </div>

            <div style={{ textAlign: 'right', minWidth: 'clamp(80px, 12vw, 95px)' }}>
            <div style={{ fontSize: 'clamp(9px, 1.5vw, 10px)', color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>💼 Current</div>
            <div style={{ fontSize: 'clamp(14px, 2.2vw, 16px)', fontWeight: 900, color: '#22d3ee' }}>₹{current.toLocaleString()}</div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 'clamp(60px, 10vw, 75px)' }}>
            <div style={{ fontSize: 'clamp(9px, 1.5vw, 10px)', color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>📊 Now %</div>
            <div style={{ fontSize: 'clamp(14px, 2.2vw, 16px)', fontWeight: 800, color: '#3b82f6' }}>{currentPercent.toFixed(2)}%</div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 'clamp(60px, 10vw, 75px)' }}>
            <div style={{ fontSize: 'clamp(9px, 1.5vw, 10px)', color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>🎯 Gap</div>
            <div style={{ fontSize: 'clamp(14px, 2.2vw, 16px)', fontWeight: 800, color: delta >= 0 ? '#4ade80' : '#f87171', textShadow: delta >= 0 ? '0 0 10px rgba(74,222,128,0.3)' : '0 0 10px rgba(248,113,113,0.3)' }}>{delta > 0 ? '+' : ''}{delta.toFixed(2)}%</div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 'clamp(90px, 13vw, 110px)' }}>
            <div style={{ fontSize: 'clamp(9px, 1.5vw, 10px)', color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>💵 P/L</div>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
              <div style={{ fontSize: 'clamp(14px, 2.2vw, 16px)', fontWeight: 800, color: `#${gainLoss}`, textShadow: profit >= 0 ? '0 0 10px rgba(34,197,94,0.3)' : '0 0 10px rgba(239,68,68,0.3)' }}>
                {profit >= 0 ? '+' : ''}₹{profit.toLocaleString()}
              </div>
              <div style={{ fontSize: 'clamp(11px, 1.8vw, 12px)', fontWeight: 700, color: `#${gainLoss}`, opacity: 0.9 }}>
                {invested > 0 ? `${profit >= 0 ? '+' : ''}${profitPercent.toFixed(2)}%` : '—'}
              </div>
            </div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 'clamp(80px, 12vw, 95px)' }}>
            <div style={{ fontSize: 'clamp(9px, 1.5vw, 10px)', color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>➕ Invest</div>
            <div style={{ fontSize: 'clamp(14px, 2.2vw, 16px)', fontWeight: 900, color: '#fb923c' }}>₹{Math.ceil(requiredAdd).toLocaleString()}</div>
          </div>

          <div style={{ textAlign: 'right', minWidth: 'clamp(80px, 12vw, 95px)' }}>
            <div style={{ fontSize: 'clamp(9px, 1.5vw, 10px)', color: '#94a3b8', marginBottom: 5, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>🚀 After</div>
            <div style={{ fontSize: 'clamp(14px, 2.2vw, 16px)', fontWeight: 900, color: '#c084fc' }}>₹{Math.ceil(projected).toLocaleString()}</div>
          </div>
        </div>

        {hoveredDiv && (
          <button
            onClick={(e) => { e.stopPropagation(); deleteDivision() }}
            style={{
              background: '#ef4444',
              color: 'white',
              border: 'none',
              borderRadius: 6,
              padding: '6px 12px',
              fontSize: 11,
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
            onMouseEnter={(e) => e.target.style.background = '#dc2626'}
            onMouseLeave={(e) => e.target.style.background = '#ef4444'}
          >
            Delete
          </button>
        )}
      </div>

      {expanded && (
        <div style={{ padding: 20 }}>
          {/* Subdivision Goal Seek Summary */}
          {totalSubGoalSeek > 0 && (
            <div style={{
              marginBottom: 'clamp(16px, 2.5vw, 24px)',
              padding: 'clamp(14px, 2.5vw, 18px)',
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(251,146,60,0.08) 100%), #0a1018',
              borderRadius: 12,
              border: '2px solid rgba(245,158,11,0.4)',
              boxShadow: '0 6px 20px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
              transition: 'all 0.3s ease',
              cursor: 'default',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(245,158,11,0.3), inset 0 1px 0 rgba(255,255,255,0.05)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(245,158,11,0.2), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
              <div style={{ fontSize: 'clamp(10px, 1.6vw, 12px)', color: '#fb923c', fontWeight: 900, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: 8 }}>
                🎯 Subdivision Goal Seek
              </div>
              <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#f1f5f9', lineHeight: 1.7 }}>
                Invest <strong style={{ color: '#fb923c', fontSize: 'clamp(15px, 2.5vw, 17px)', textShadow: '0 0 10px rgba(251,146,60,0.3)' }}>₹{Math.ceil(totalSubGoalSeek).toLocaleString()}</strong> in this division to balance all subdivisions to their targets
              </div>
            </div>
          )}
          
          {/* Direct holdings */}
          {(division.holdings || []).length > 0 && (
            <div style={{ marginBottom: 20 }}>
              <div style={{ fontSize: 11, color: '#7c92ab', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Holdings</div>
              <HoldingsEditor divId={division.id} holdings={division.holdings} onUpdate={onUpdate} readOnly />
            </div>
          )}

          {/* Subdivisions */}
          {(division.subdivisions || []).length > 0 && (
            <div style={{ marginTop: 20 }}>
              <div style={{ fontSize: 11, color: '#7c92ab', marginBottom: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.8px' }}>Sub-divisions</div>
              {[...(division.subdivisions || [])]
                .sort((a, b) => {
                  const aAnalytics = subdivisionAnalytics.find(sa => sa.id === a.id) || {}
                  const bAnalytics = subdivisionAnalytics.find(sa => sa.id === b.id) || {}
                  const aCurrent = Number(aAnalytics.current) || 0
                  const bCurrent = Number(bAnalytics.current) || 0
                  // Descending by current value
                  return bCurrent - aCurrent
                })
                .map(sub => {
                const subAnalytics = subdivisionAnalytics.find(sa => sa.id === sub.id) || {}
                const subInvested = subAnalytics.invested || 0
                const subCurrent = subAnalytics.current || 0
                const subProfit = subAnalytics.profit || 0
                const subCurrentPct = subAnalytics.currentPercent || 0
                const subTargetPct = subAnalytics.targetPercent || 0
                const subDelta = subAnalytics.deltaPercent || 0
                const subProfitPercent = subInvested > 0 ? (subProfit / subInvested) * 100 : 0

                return (
                  <div 
                    key={sub.id} 
                    style={{ 
                      marginBottom: 'clamp(14px, 2.5vw, 18px)', 
                      background: hoveredSub === sub.id ? 'linear-gradient(135deg, #1e293b 0%, #0f1724 100%)' : 'linear-gradient(135deg, #0f1724 0%, #0a1018 100%)', 
                      borderRadius: 12, 
                      padding: 'clamp(14px, 2.5vw, 18px)', 
                      border: hoveredSub === sub.id ? '2px solid #3b82f6' : '2px solid #1e293b',
                      boxShadow: hoveredSub === sub.id ? '0 6px 20px rgba(59,130,246,0.2), inset 0 1px 0 rgba(255,255,255,0.05)' : '0 4px 12px rgba(0,0,0,0.3)',
                      transition: 'all 0.3s ease',
                      transform: hoveredSub === sub.id ? 'translateY(-1px)' : 'translateY(0)',
                    }}
                    onMouseEnter={() => setHoveredSub(sub.id)}
                    onMouseLeave={() => setHoveredSub(null)}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
                      <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10 }}>
                        <span style={{ color: '#e6e9ef', fontSize: 16, fontWeight: 700 }}>{sub.name}</span>
                        <span style={{ color: '#a78bfa', fontSize: 12, fontWeight: 700 }}>🎯 {subTargetPct.toFixed(2)}%</span>
                        <button
                          type="button"
                          onClick={() => setEditingSubdivision({ ...sub })}
                          style={{ background: 'linear-gradient(135deg, #0ea5e9, #0284c7)', color: '#ffffff', border: 'none', borderRadius: 6, padding: '6px 10px', fontSize: 12, fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 6px rgba(14,165,233,0.3)' }}
                          onMouseEnter={(e) => e.target.style.transform = 'translateY(-1px)'}
                          onMouseLeave={(e) => e.target.style.transform = 'translateY(0)'}
                        >
                          ✏️ Edit Subdivision
                        </button>
                      </div>
                      <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
                        <div style={{ textAlign: 'right', minWidth: 'clamp(65px, 10vw, 75px)' }}>
                          <div style={{ fontSize: 'clamp(8px, 1.4vw, 9px)', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px' }}>💰 Current</div>
                          <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', fontWeight: 900, color: '#22d3ee' }}>₹{subCurrent.toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 'clamp(50px, 8vw, 60px)' }}>
                          <div style={{ fontSize: 'clamp(8px, 1.4vw, 9px)', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px' }}>📈 %</div>
                          <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', fontWeight: 800, color: '#3b82f6' }}>{subCurrentPct.toFixed(2)}%</div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 'clamp(55px, 9vw, 65px)' }}>
                          <div style={{ fontSize: 'clamp(8px, 1.4vw, 9px)', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px' }}>⚡ Gap</div>
                          <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', fontWeight: 800, color: subDelta >= 0 ? '#4ade80' : '#f87171' }}>{subDelta > 0 ? '+' : ''}{subDelta.toFixed(2)}%</div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 'clamp(65px, 10vw, 75px)' }}>
                          <div style={{ fontSize: 'clamp(8px, 1.4vw, 9px)', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px' }}>➕ To Add</div>
                          <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', fontWeight: 900, color: '#fb923c' }}>₹{Math.ceil(subGoalSeekAdds[sub.id] || 0).toLocaleString()}</div>
                        </div>
                        <div style={{ textAlign: 'right', minWidth: 'clamp(85px, 12vw, 100px)' }}>
                          <div style={{ fontSize: 'clamp(8px, 1.4vw, 9px)', color: '#94a3b8', marginBottom: 4, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.6px' }}>💸 P/L</div>
                          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 2 }}>
                            <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', fontWeight: 800, color: subProfit >= 0 ? '#4ade80' : '#f87171' }}>
                              {subProfit >= 0 ? '+' : ''}₹{subProfit.toLocaleString()}
                            </div>
                            <div style={{ fontSize: 'clamp(10px, 1.6vw, 11px)', fontWeight: 700, color: subProfit >= 0 ? '#4ade80' : '#f87171', opacity: 0.9 }}>
                              {subInvested > 0 ? `${subProfit >= 0 ? '+' : ''}${subProfitPercent.toFixed(2)}%` : '—'}
                            </div>
                          </div>
                        </div>
                        {hoveredSub === sub.id && (
                          <button
                            onClick={() => deleteSubdivision(sub.id)}
                            style={{
                              background: '#ef4444',
                              color: 'white',
                              border: 'none',
                              borderRadius: 5,
                              padding: '4px 10px',
                              fontSize: 10,
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'all 0.2s ease',
                            }}
                            onMouseEnter={(e) => e.target.style.background = '#dc2626'}
                            onMouseLeave={(e) => e.target.style.background = '#ef4444'}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Holdings actions moved to Edit Subdivision modal for cleaner UX */}
                    {/* Removed per-holding inline controls here to avoid duplication */}
                  </div>
                )
              })}
            </div>
          )}

          {/* Add Subdivision */}
          <div style={{ marginTop: 20, display: 'flex', gap: 10, padding: '12px', background: '#0f1724', borderRadius: 8, border: '1px dashed #2d3f5f' }}>
            <input
              type="text"
              placeholder="New subdivision name"
              value={newSubDiv.name}
              onChange={e => setNewSubDiv({ ...newSubDiv, name: e.target.value })}
              style={{
                flex: 1,
                padding: '8px 12px',
                background: '#0a1018',
                color: '#e6e9ef',
                border: '1px solid #2d3f5f',
                borderRadius: 6,
                fontSize: 13,
              }}
            />
            <input
              type="number"
              placeholder="Target %"
              step="0.01"
              value={newSubDiv.targetPercent}
              onChange={e => setNewSubDiv({ ...newSubDiv, targetPercent: e.target.value })}
              style={{
                width: 100,
                padding: '8px 12px',
                background: '#0a1018',
                color: '#e6e9ef',
                border: '1px solid #2d3f5f',
                borderRadius: 6,
                textAlign: 'center',
                fontSize: 13,
              }}
            />
            <button
              onClick={addSubdivision}
              style={{
                padding: '8px 16px',
                background: '#22c55e',
                color: 'white',
                border: 'none',
                borderRadius: 6,
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
              onMouseEnter={(e) => e.target.style.background = '#16a34a'}
              onMouseLeave={(e) => e.target.style.background = '#22c55e'}
            >
              Add
            </button>
          </div>

          {/* Edit Subdivision Modal */}
          {editingSubdivision && (
            <EditSubdivisionForm
              isOpen={!!editingSubdivision}
              onClose={() => setEditingSubdivision(null)}
              subdivision={editingSubdivision}
              holdings={editingSubdivision.holdings || []}
              onSaved={onUpdate}
              divisionId={division.id}
            />
          )}
        </div>
      )}
    </div>
  )
}
