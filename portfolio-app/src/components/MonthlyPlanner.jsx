import React, { useMemo, useState } from 'react'

export default function MonthlyPlanner({ analytics, divisions }) {
  const [monthlyAmount, setMonthlyAmount] = useState('25000')
  const [mode, setMode] = useState('weighted')
  const [gapBias, setGapBias] = useState(60)

  const totalCurrent = analytics?.totals?.current || 0

  // Calculate goal seek timeline
  const goalSeekTimeline = useMemo(() => {
    const amount = Number(monthlyAmount) || 0
    if (amount <= 0) return { months: [], totalMonths: 0, totalRequired: 0 }

    const divisionGoalSeek = (analytics.divisions || []).map(divAna => {
      const div = divisions.find(d => d.id === divAna.id)
      return {
        id: divAna.id,
        name: div?.name || 'Unknown',
        requiredAddition: divAna.requiredAddition || 0,
        subdivisions: (divAna.subdivisions || []).map(subAna => {
          const sub = (div?.subdivisions || []).find(s => s.id === subAna.id)
          return {
            id: subAna.id,
            name: sub?.name || 'Unknown',
            parentId: divAna.id,
            requiredAddition: subAna.requiredAddition || 0
          }
        }).filter(s => s.requiredAddition > 0)
      }
    })

    const totalRequired = analytics.requiredTotalAddition || 0
    
    if (totalRequired <= 0) {
      return { months: [], totalMonths: 0, totalRequired: 0, isBalanced: true }
    }

    const months = []
    let remainingDivisions = divisionGoalSeek.map(d => ({
      ...d,
      remaining: d.requiredAddition,
      subdivisions: d.subdivisions.map(s => ({ ...s, remaining: s.requiredAddition }))
    })).filter(d => d.remaining > 0)

    let monthIndex = 0
    let totalInvested = 0

    while (remainingDivisions.length > 0 && monthIndex < 120) {
      const monthlyAllocations = []
      let monthlyTotal = 0

      const totalRemaining = remainingDivisions.reduce((sum, d) => sum + d.remaining, 0)
      
      remainingDivisions.forEach(div => {
        const divShare = div.remaining / totalRemaining
        let divAllocation = Math.min(amount * divShare, div.remaining)
        
        if (monthlyTotal + divAllocation > amount) {
          divAllocation = amount - monthlyTotal
        }

        if (divAllocation > 0) {
          if (div.subdivisions.length > 0) {
            const subAllocations = []
            const totalSubRemaining = div.subdivisions.reduce((sum, s) => sum + s.remaining, 0)
            let divAllocRemaining = divAllocation

            div.subdivisions.forEach(sub => {
              const subShare = sub.remaining / totalSubRemaining
              let subAlloc = Math.min(divAllocRemaining * subShare, sub.remaining)
              
              if (subAlloc > 0) {
                subAllocations.push({
                  id: sub.id,
                  name: sub.name,
                  amount: subAlloc,
                  isSub: true
                })
                sub.remaining -= subAlloc
                divAllocRemaining -= subAlloc
              }
            })

            monthlyAllocations.push({
              id: div.id,
              name: div.name,
              amount: divAllocation,
              subdivisions: subAllocations
            })
          } else {
            monthlyAllocations.push({
              id: div.id,
              name: div.name,
              amount: divAllocation,
              subdivisions: []
            })
          }

          div.remaining -= divAllocation
          monthlyTotal += divAllocation
        }
      })

      totalInvested += monthlyTotal
      months.push({
        month: monthIndex + 1,
        allocations: monthlyAllocations,
        total: monthlyTotal,
        cumulativeInvested: totalInvested,
        remainingTotal: totalRequired - totalInvested
      })

      remainingDivisions = remainingDivisions.filter(d => d.remaining > 0.01)
      remainingDivisions.forEach(d => {
        d.subdivisions = d.subdivisions.filter(s => s.remaining > 0.01)
      })

      monthIndex++

      if (monthlyTotal < 0.01) break
    }

    return {
      months,
      totalMonths: months.length,
      totalRequired,
      isBalanced: false
    }
  }, [monthlyAmount, analytics, divisions])

  const plan = useMemo(() => {
    const amount = Number(monthlyAmount) || 0
    const biasPct = Math.min(100, Math.max(0, Number(gapBias) || 0))
    const gapFrac = biasPct / 100
    const baseFrac = 1 - gapFrac

    const items = (divisions || []).map(d => {
      const divAna = analytics.divisions?.find(ad => ad.id === d.id) || {}
      const current = Number(divAna.current) || 0
      const targetPct = Number(d.targetPercent) || 0
      const targetValue = totalCurrent * (targetPct / 100)
      const gap = targetValue - current
      return {
        id: d.id,
        name: d.name,
        targetPct,
        current,
        gap,
      }
    })

    const positiveGaps = items.filter(i => i.gap > 0)
    const sumPositive = positiveGaps.reduce((a, b) => a + b.gap, 0)

    let allocations = []
    if (mode === 'weighted' && sumPositive > 0) {
      const targetSum = items.reduce((a, b) => a + (b.targetPct || 0), 0) || 100
      const basePool = amount * baseFrac
      const gapPool = amount * gapFrac

      allocations = items.map(i => {
        const baseShare = (i.targetPct || 0) / targetSum
        const baseAlloc = basePool * baseShare

        let gapAlloc = 0
        if (i.gap > 0 && gapPool > 0) {
          const gapShare = i.gap / sumPositive
          gapAlloc = gapPool * gapShare
        }

        const recommended = baseAlloc + gapAlloc
        const note = gapAlloc > 0
          ? `Base + gap boost (${biasPct}% to gaps)`
          : basePool > 0
            ? 'Base by target %'
            : 'Over / on target'
        return { ...i, recommended, note }
      })
    } else {
      const targetSum = items.reduce((a, b) => a + (b.targetPct || 0), 0) || 100
      allocations = items.map(i => {
        const share = (i.targetPct || 0) / targetSum
        const recommended = amount * share
        return { ...i, recommended, note: mode === 'weighted' ? 'Balanced already' : 'By target %' }
      })
    }

    const totalReco = allocations.reduce((a, b) => a + (b.recommended || 0), 0)

    return { allocations, totalReco }
  }, [monthlyAmount, divisions, analytics, mode, totalCurrent, gapBias])

  return (
    <div style={{
      padding: 'clamp(16px, 3vw, 24px)',
      background: 'radial-gradient(circle at 20% 0%, rgba(34,211,238,0.12), transparent 45%), radial-gradient(circle at 70% 40%, rgba(168,139,250,0.12), transparent 40%), #0c1423',
      borderRadius: 'clamp(12px, 2vw, 16px)',
      border: '2px solid #1e293b',
      boxShadow: '0 14px 40px rgba(0,0,0,0.35), inset 0 1px 0 rgba(255,255,255,0.03)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'clamp(10px, 2vw, 12px)', flexWrap: 'wrap' }}>
        <div style={{ flex: '1 1 100%', minWidth: 0 }}>
          <h2 style={{ margin: 0, fontSize: 'clamp(20px, 4vw, 28px)', fontWeight: 900, color: '#f8fafc', textShadow: '0 2px 10px rgba(34,211,238,0.3)' }}>📅 Monthly Investment Planner</h2>
          <p style={{ margin: '8px 0 0 0', color: '#94a3b8', fontSize: 'clamp(11px, 1.8vw, 13px)', lineHeight: 1.7 }}>
            Enter your monthly investable amount to see the timeline and breakdown for achieving perfect portfolio balance.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 'clamp(8px, 1.5vw, 10px)', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-start', width: '100%' }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center', background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', borderRadius: 12, padding: '8px 12px', border: '2px solid #1e293b', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
            <span style={{ color: '#94a3b8', fontSize: 'clamp(11px, 1.8vw, 13px)', fontWeight: 700, whiteSpace: 'nowrap' }}>💰 Monthly Budget:</span>
            <input
              type="number"
              value={monthlyAmount}
              onChange={e => setMonthlyAmount(e.target.value)}
              style={{
                width: 'clamp(110px, 18vw, 140px)',
                padding: 'clamp(8px, 1.5vw, 10px) clamp(10px, 1.8vw, 12px)',
                borderRadius: 10,
                border: '2px solid #3b82f6',
                background: '#0a1018',
                color: '#22d3ee',
                fontWeight: 900,
                fontSize: 'clamp(13px, 2.2vw, 16px)',
                textAlign: 'right',
              }}
              placeholder="₹ / month"
            />
          </div>
        </div>
      </div>

      {goalSeekTimeline.isBalanced ? (
        <div style={{ 
          marginTop: 'clamp(20px, 3vw, 28px)', 
          padding: 'clamp(18px, 3vw, 24px)', 
          background: 'linear-gradient(135deg, rgba(34,197,94,0.15) 0%, rgba(34,197,94,0.05) 100%), #0a1018', 
          borderRadius: 14, 
          border: '2px solid rgba(34,197,94,0.4)',
          boxShadow: '0 6px 20px rgba(34,197,94,0.2), inset 0 1px 0 rgba(255,255,255,0.05)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 'clamp(20px, 3.5vw, 28px)', marginBottom: 8 }}>🎉</div>
          <div style={{ fontSize: 'clamp(16px, 2.8vw, 20px)', fontWeight: 900, color: '#4ade80', marginBottom: 8 }}>
            Portfolio Already Balanced!
          </div>
          <div style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: '#86efac' }}>
            All divisions are at or above their target allocations
          </div>
        </div>
      ) : (
        <>
          <div style={{ 
            marginTop: 'clamp(20px, 3vw, 28px)', 
            display: 'grid', 
            gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', 
            gap: 'clamp(12px, 2vw, 16px)' 
          }}>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(99,102,241,0.05) 100%), #0a1018', 
              padding: 'clamp(16px, 2.5vw, 20px)', 
              borderRadius: 12, 
              border: '2px solid rgba(99,102,241,0.4)',
              boxShadow: '0 4px 16px rgba(99,102,241,0.2)',
              transition: 'all 0.3s ease',
              cursor: 'default'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: 'clamp(10px, 1.6vw, 11px)', color: '#a5b4fc', marginBottom: 8, textTransform: 'uppercase', fontWeight: 900, letterSpacing: '1px' }}>⏱️ Time to Balance</div>
              <div style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 900, color: '#818cf8', lineHeight: 1.1 }}>
                {goalSeekTimeline.totalMonths} {goalSeekTimeline.totalMonths === 1 ? 'Month' : 'Months'}
              </div>
            </div>
            
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 100%), #0a1018', 
              padding: 'clamp(16px, 2.5vw, 20px)', 
              borderRadius: 12, 
              border: '2px solid rgba(245,158,11,0.4)',
              boxShadow: '0 4px 16px rgba(245,158,11,0.2)',
              transition: 'all 0.3s ease',
              cursor: 'default'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: 'clamp(10px, 1.6vw, 11px)', color: '#fbbf24', marginBottom: 8, textTransform: 'uppercase', fontWeight: 900, letterSpacing: '1px' }}>💰 Total Required</div>
              <div style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 900, color: '#fb923c', lineHeight: 1.1 }}>
                ₹{Math.ceil(goalSeekTimeline.totalRequired).toLocaleString()}
              </div>
            </div>

            <div style={{ 
              background: 'linear-gradient(135deg, rgba(34,211,238,0.15) 0%, rgba(34,211,238,0.05) 100%), #0a1018', 
              padding: 'clamp(16px, 2.5vw, 20px)', 
              borderRadius: 12, 
              border: '2px solid rgba(34,211,238,0.4)',
              boxShadow: '0 4px 16px rgba(34,211,238,0.2)',
              transition: 'all 0.3s ease',
              cursor: 'default'
            }}
            onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
              <div style={{ fontSize: 'clamp(10px, 1.6vw, 11px)', color: '#7dd3fc', marginBottom: 8, textTransform: 'uppercase', fontWeight: 900, letterSpacing: '1px' }}>📊 Per Month</div>
              <div style={{ fontSize: 'clamp(26px, 5vw, 36px)', fontWeight: 900, color: '#22d3ee', lineHeight: 1.1 }}>
                ₹{Number(monthlyAmount || 0).toLocaleString()}
              </div>
            </div>
          </div>

          <div style={{ marginTop: 'clamp(24px, 3.5vw, 32px)' }}>
            <h3 style={{ 
              margin: '0 0 16px 0', 
              fontSize: 'clamp(16px, 2.8vw, 20px)', 
              fontWeight: 900, 
              color: '#f1f5f9',
              display: 'flex',
              alignItems: 'center',
              gap: 8
            }}>
              📈 Month-by-Month Investment Timeline
            </h3>
            
            <div style={{ 
              maxHeight: '600px', 
              overflowY: 'auto', 
              background: '#0a1018', 
              borderRadius: 12, 
              border: '2px solid #1e293b',
              padding: 'clamp(12px, 2vw, 16px)'
            }}>
              {goalSeekTimeline.months.map((month, idx) => (
                <div 
                  key={idx} 
                  style={{ 
                    marginBottom: idx === goalSeekTimeline.months.length - 1 ? 0 : 'clamp(14px, 2.5vw, 18px)',
                    padding: 'clamp(14px, 2.5vw, 18px)',
                    background: 'linear-gradient(135deg, #0f1724 0%, #0a1018 100%)',
                    borderRadius: 10,
                    border: '2px solid #1e293b',
                    position: 'relative',
                    transition: 'all 0.3s ease'
                  }}
                  onMouseEnter={(e) => { 
                    e.currentTarget.style.borderColor = '#3b82f6'
                    e.currentTarget.style.boxShadow = '0 4px 16px rgba(59,130,246,0.2)'
                  }}
                  onMouseLeave={(e) => { 
                    e.currentTarget.style.borderColor = '#1e293b'
                    e.currentTarget.style.boxShadow = 'none'
                  }}
                >
                  <div style={{ 
                    display: 'flex', 
                    justifyContent: 'space-between', 
                    alignItems: 'center', 
                    marginBottom: 12,
                    flexWrap: 'wrap',
                    gap: 8
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <span style={{ 
                        background: 'linear-gradient(135deg, #3b82f6 0%, #2563eb 100%)', 
                        color: 'white', 
                        padding: '6px 14px', 
                        borderRadius: 8, 
                        fontSize: 'clamp(11px, 1.8vw, 13px)', 
                        fontWeight: 900,
                        boxShadow: '0 2px 8px rgba(59,130,246,0.4)'
                      }}>
                        Month {month.month}
                      </span>
                      <span style={{ 
                        color: '#22d3ee', 
                        fontSize: 'clamp(14px, 2.2vw, 16px)', 
                        fontWeight: 900 
                      }}>
                        ₹{Math.ceil(month.total).toLocaleString()}
                      </span>
                    </div>
                    <div style={{ fontSize: 'clamp(10px, 1.6vw, 11px)', color: '#64748b' }}>
                      Cumulative: <span style={{ color: '#c084fc', fontWeight: 800 }}>₹{Math.ceil(month.cumulativeInvested).toLocaleString()}</span>
                      {' '} | Remaining: <span style={{ color: '#fb923c', fontWeight: 800 }}>₹{Math.ceil(month.remainingTotal).toLocaleString()}</span>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {month.allocations.map(alloc => (
                      <div key={alloc.id}>
                        <div style={{ 
                          display: 'flex', 
                          justifyContent: 'space-between', 
                          alignItems: 'center',
                          padding: '8px 12px',
                          background: 'rgba(59,130,246,0.08)',
                          borderRadius: 8,
                          border: '1px solid rgba(59,130,246,0.2)'
                        }}>
                          <span style={{ color: '#f1f5f9', fontSize: 'clamp(11px, 1.8vw, 13px)', fontWeight: 700 }}>
                            {alloc.name}
                          </span>
                          <span style={{ color: '#3b82f6', fontSize: 'clamp(12px, 2vw, 14px)', fontWeight: 900 }}>
                            ₹{Math.ceil(alloc.amount).toLocaleString()}
                          </span>
                        </div>

                        {alloc.subdivisions.length > 0 && (
                          <div style={{ marginTop: 6, marginLeft: 'clamp(16px, 3vw, 24px)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                            {alloc.subdivisions.map(sub => (
                              <div 
                                key={sub.id}
                                style={{ 
                                  display: 'flex', 
                                  justifyContent: 'space-between', 
                                  alignItems: 'center',
                                  padding: '6px 10px',
                                  background: 'rgba(251,146,60,0.08)',
                                  borderRadius: 6,
                                  border: '1px solid rgba(251,146,60,0.2)'
                                }}
                              >
                                <span style={{ color: '#cbd5e1', fontSize: 'clamp(10px, 1.6vw, 11px)', fontWeight: 600, fontStyle: 'italic' }}>
                                  ↳ {sub.name}
                                </span>
                                <span style={{ color: '#fb923c', fontSize: 'clamp(11px, 1.8vw, 12px)', fontWeight: 800 }}>
                                  ₹{Math.ceil(sub.amount).toLocaleString()}
                                </span>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  <div style={{ marginTop: 12, background: '#1e293b', borderRadius: 8, height: 8, overflow: 'hidden' }}>
                    <div style={{ 
                      height: '100%', 
                      width: `${(month.cumulativeInvested / goalSeekTimeline.totalRequired) * 100}%`,
                      background: 'linear-gradient(90deg, #22d3ee 0%, #3b82f6 50%, #c084fc 100%)',
                      transition: 'width 0.5s ease',
                      boxShadow: '0 0 10px rgba(34,211,238,0.5)'
                    }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      <div style={{ marginTop: 'clamp(28px, 4vw, 36px)' }}>
        <h3 style={{ 
          margin: '0 0 16px 0', 
          fontSize: 'clamp(16px, 2.8vw, 20px)', 
          fontWeight: 900, 
          color: '#f1f5f9',
          display: 'flex',
          alignItems: 'center',
          gap: 8
        }}>
          📋 Current Month Allocation Strategy
        </h3>

        <div style={{ display: 'flex', gap: 'clamp(8px, 1.5vw, 10px)', alignItems: 'center', flexWrap: 'wrap', marginBottom: 16 }}>
          <div style={{ display: 'flex', background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', borderRadius: 12, border: '2px solid #1e293b', flexWrap: 'wrap', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
            {[
              { key: 'weighted', label: 'Weighted to gaps' },
              { key: 'target', label: 'By target %' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setMode(opt.key)}
                style={{
                  padding: 'clamp(8px, 1.5vw, 10px) clamp(14px, 2.2vw, 16px)',
                  border: 'none',
                  background: mode === opt.key ? 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)' : 'transparent',
                  color: mode === opt.key ? '#0a1018' : '#94a3b8',
                  borderRadius: 10,
                  fontWeight: mode === opt.key ? 900 : 700,
                  fontSize: 'clamp(10px, 1.6vw, 12px)',
                  cursor: 'pointer',
                  minWidth: 'clamp(115px, 18vw, 140px)',
                  whiteSpace: 'nowrap',
                  transition: 'all 0.3s ease',
                  boxShadow: mode === opt.key ? '0 2px 8px rgba(34,211,238,0.4)' : 'none'
                }}
                onMouseEnter={(e) => {
                  if (mode !== opt.key) {
                    e.currentTarget.style.background = '#1e293b'
                    e.currentTarget.style.color = '#f1f5f9'
                  }
                }}
                onMouseLeave={(e) => {
                  if (mode !== opt.key) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#94a3b8'
                  }
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {mode === 'weighted' && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'clamp(8px, 1.5vw, 10px)', color: '#94a3b8', fontSize: 'clamp(10px, 1.6vw, 12px)', background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', borderRadius: 12, padding: 'clamp(8px, 1.5vw, 10px) clamp(12px, 2vw, 14px)', border: '2px solid #1e293b', flexWrap: 'wrap', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
              <span style={{ fontWeight: 800, whiteSpace: 'nowrap', color: '#f1f5f9' }}>Gap emphasis</span>
              <input
                type="range"
                min="0"
                max="100"
                value={gapBias}
                onChange={e => setGapBias(Number(e.target.value))}
                style={{ width: 'clamp(100px, 20vw, 140px)', flex: '1 1 auto', minWidth: 100 }}
              />
              <span style={{ fontWeight: 900, color: '#22d3ee', minWidth: 40 }}>{gapBias}%</span>
            </div>
          )}
        </div>

        <div style={{ overflowX: 'auto', background: '#0a1018', borderRadius: 12, border: '2px solid #1e293b', boxShadow: '0 4px 12px rgba(0,0,0,0.3)' }}>
          <table style={{ width: '100%', fontSize: 'clamp(10px, 1.6vw, 12px)', minWidth: 700, borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #334155', background: 'linear-gradient(180deg, #1e293b 0%, #0f1724 100%)' }}>
                <th style={{ textAlign: 'left', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Division</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Target %</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Current ₹</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Gap to target ₹</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#818cf8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Recommended this month</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Note</th>
              </tr>
            </thead>
            <tbody>
              {plan.allocations.map(row => {
                const isPositive = row.gap > 0
                return (
                  <tr key={row.id} style={{ 
                    borderBottom: '1px solid #1e293b', 
                    background: isPositive ? 'rgba(99,102,241,0.08)' : 'transparent',
                    transition: 'all 0.2s ease'
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = isPositive ? 'rgba(99,102,241,0.12)' : 'rgba(30,41,59,0.5)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = isPositive ? 'rgba(99,102,241,0.08)' : 'transparent'}>
                    <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#f1f5f9', fontWeight: 700 }}>{row.name}</td>
                    <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#22d3ee', textAlign: 'right', fontWeight: 700 }}>{row.targetPct.toFixed(1)}%</td>
                    <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#c084fc', textAlign: 'right', fontWeight: 700 }}>₹{row.current.toLocaleString()}</td>
                    <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: isPositive ? '#fb923c' : '#4ade80', textAlign: 'right', fontWeight: 700 }}>₹{Math.max(0, row.gap).toLocaleString()}</td>
                    <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#818cf8', textAlign: 'right', fontWeight: 900 }}>₹{Math.round(row.recommended).toLocaleString()}</td>
                    <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', textAlign: 'right', fontSize: 'clamp(9px, 1.5vw, 10px)' }}>{row.note}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot>
              <tr style={{ background: 'linear-gradient(180deg, #1e293b 0%, #0f1724 100%)', borderTop: '2px solid #334155' }}>
                <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', fontSize: 'clamp(10px, 1.6vw, 11px)' }} colSpan={4}>Total</td>
                <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#22d3ee', textAlign: 'right', fontWeight: 900 }}>₹{Math.round(plan.totalReco).toLocaleString()}</td>
                <td></td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  )
}
