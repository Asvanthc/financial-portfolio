import React, { useEffect, useState } from 'react'
import { api } from './api'
import DivisionCard from './components/DivisionCard'
import PortfolioCharts from './components/PortfolioCharts'
import AddDivisionForm from './components/AddDivisionForm'
import MonthlyPlanner from './components/MonthlyPlanner'
import DeepAnalytics from './components/DeepAnalytics'

export default function App() {
  const [portfolio, setPortfolio] = useState({ divisions: [] })
  const [analytics, setAnalytics] = useState({ totals: { invested: 0, current: 0, profit: 0 }, divisions: [] })
  const [subdivisionGoalSeek, setSubdivisionGoalSeek] = useState({})
  const [budget, setBudget] = useState('')
  const [showAddDivisionModal, setShowAddDivisionModal] = useState(false)
  const [activeTab, setActiveTab] = useState('overview')

  async function refreshAll() {
    const p = await api.getPortfolio()
    const a = await api.analytics(budget || undefined)
    const sgs = await api.subdivisionGoalSeek()
    setPortfolio(p)
    setAnalytics(a)
    setSubdivisionGoalSeek(sgs)
  }

  useEffect(() => { refreshAll() }, [])

  useEffect(() => { refreshAll() }, [budget])

  async function addDivision(data) {
    await api.addDivision(data)
    refreshAll()
  }

  async function deleteDivision(divId) {
    if (confirm('Delete division?')) {
      await api.deleteDivision(divId)
      refreshAll()
    }
  }

  const totalInvested = analytics.totals?.invested || 0
  const totalCurrent = analytics.totals?.current || 0
  const totalProfit = analytics.totals?.profit || 0
  const minRequired = analytics.requiredTotalAddition || 0
  const gainLossColor = totalProfit >= 0 ? '#22c55e' : '#ef4444'

  return (
    <div style={{ minHeight: '100vh', background: 'radial-gradient(circle at 20% 20%, rgba(34,211,238,0.15), transparent 40%), radial-gradient(circle at 80% 0%, rgba(168,139,250,0.12), transparent 40%), radial-gradient(circle at 50% 100%, rgba(99,102,241,0.1), transparent 35%), #050a12', padding: 'clamp(12px, 2vw, 20px) 0' }}>
      <div className="container" style={{ maxWidth: 1600, margin: '0 auto', padding: 'clamp(20px, 4vw, 36px) clamp(16px, 3vw, 28px) clamp(28px, 5vw, 44px)', background: 'linear-gradient(135deg, #0b1220 0%, #0a1018 100%)', borderRadius: 'clamp(14px, 2.5vw, 20px)', border: '2px solid #1e293b', boxShadow: '0 24px 60px rgba(0,0,0,0.5), inset 0 1px 0 rgba(255,255,255,0.03)' }}>
      {/* Header with KPIs */}
      <div style={{ marginBottom: 'clamp(20px, 3vw, 32px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 'clamp(10px, 2.5vw, 16px)', marginBottom: 'clamp(14px, 2.5vw, 20px)', flexWrap: 'wrap' }}>
          <h1 style={{ margin: 0, fontSize: 'clamp(22px, 5.5vw, 36px)', fontWeight: 900, color: '#f8fafc', letterSpacing: '-0.8px', textShadow: '0 2px 10px rgba(34,211,238,0.3)' }}>
            📊 Financial Portfolio
          </h1>
          <div style={{ display: 'flex', gap: 'clamp(6px, 1.5vw, 10px)', background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 'clamp(6px, 1.2vw, 8px)', borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 16px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)', flexShrink: 0 }}>
            {['overview', 'analytics', 'planner'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                style={{
                  padding: 'clamp(10px, 1.8vw, 12px) clamp(16px, 2.5vw, 20px)',
                  borderRadius: 10,
                  border: activeTab === tab ? '2px solid #22d3ee' : '2px solid transparent',
                  background: activeTab === tab ? 'linear-gradient(135deg, #22d3ee 0%, #06b6d4 100%)' : 'transparent',
                  color: activeTab === tab ? '#0a1018' : '#94a3b8',
                  fontWeight: activeTab === tab ? 900 : 700,
                  fontSize: 'clamp(11px, 2vw, 14px)',
                  letterSpacing: '0.5px',
                  cursor: 'pointer',
                  transition: 'all 0.3s ease',
                  minWidth: 'clamp(95px, 16vw, 130px)',
                  whiteSpace: 'nowrap',
                  textTransform: 'uppercase',
                  boxShadow: activeTab === tab ? '0 4px 16px rgba(34,211,238,0.4), inset 0 1px 0 rgba(255,255,255,0.3)' : 'none',
                }}
                onMouseEnter={(e) => {
                  if (activeTab !== tab) {
                    e.currentTarget.style.background = '#1e293b'
                    e.currentTarget.style.color = '#f1f5f9'
                  }
                }}
                onMouseLeave={(e) => {
                  if (activeTab !== tab) {
                    e.currentTarget.style.background = 'transparent'
                    e.currentTarget.style.color = '#94a3b8'
                  }
                }}
              >
                {tab === 'overview' ? '📊 Overview' : tab === 'analytics' ? '📈 Analytics' : '📅 Monthly Plan'}
              </button>
            ))}
          </div>
        </div>

        {activeTab === 'analytics' && (
          <DeepAnalytics divisions={portfolio.divisions} analytics={analytics} />
        )}

        {activeTab === 'overview' && (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 220px), 1fr))', gap: 'clamp(14px, 2.5vw, 20px)' }}>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(6,182,212,0.15) 0%, rgba(34,211,238,0.05) 100%), #0f1724', 
              padding: 'clamp(16px, 3vw, 22px)', 
              borderRadius: 'clamp(12px, 2.5vw, 16px)', 
              border: '2px solid rgba(34,211,238,0.3)',
              boxShadow: '0 8px 32px rgba(34,211,238,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
              transition: 'all 0.3s ease',
              cursor: 'default',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(34,211,238,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(34,211,238,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 'clamp(10px, 1.6vw, 12px)', color: '#7dd3fc', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>💰 Total Invested</div>
              <div style={{ fontSize: 'clamp(22px, 4.5vw, 32px)', fontWeight: 900, color: '#22d3ee', wordBreak: 'break-word', lineHeight: 1.2 }}>₹{totalInvested.toLocaleString()}</div>
            </div>
            <div style={{ 
              background: 'linear-gradient(135deg, rgba(139,92,246,0.15) 0%, rgba(168,139,250,0.05) 100%), #0f1724', 
              padding: 'clamp(16px, 3vw, 22px)', 
              borderRadius: 'clamp(12px, 2.5vw, 16px)', 
              border: '2px solid rgba(168,139,250,0.3)',
              boxShadow: '0 8px 32px rgba(168,139,250,0.2), inset 0 1px 0 rgba(255,255,255,0.1)',
              transition: 'all 0.3s ease',
              cursor: 'default',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = '0 12px 40px rgba(168,139,250,0.3), inset 0 1px 0 rgba(255,255,255,0.1)' }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 8px 32px rgba(168,139,250,0.2), inset 0 1px 0 rgba(255,255,255,0.1)' }}>
              <div style={{ fontSize: 'clamp(10px, 1.6vw, 12px)', color: '#c4b5fd', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>📈 Current Value</div>
              <div style={{ fontSize: 'clamp(22px, 4.5vw, 32px)', fontWeight: 900, color: '#a78bfa', wordBreak: 'break-word', lineHeight: 1.2 }}>₹{totalCurrent.toLocaleString()}</div>
            </div>
            <div style={{ 
              background: `linear-gradient(135deg, ${totalProfit >= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)'} 0%, ${totalProfit >= 0 ? 'rgba(34,197,94,0.05)' : 'rgba(239,68,68,0.05)'} 100%), #0f1724`, 
              padding: 'clamp(16px, 3vw, 22px)', 
              borderRadius: 'clamp(12px, 2.5vw, 16px)', 
              border: `2px solid ${totalProfit >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`,
              boxShadow: `0 8px 32px ${totalProfit >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}, inset 0 1px 0 rgba(255,255,255,0.1)`,
              transition: 'all 0.3s ease',
              cursor: 'default',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-4px)'; e.currentTarget.style.boxShadow = `0 12px 40px ${totalProfit >= 0 ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}, inset 0 1px 0 rgba(255,255,255,0.1)` }}
            onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = `0 8px 32px ${totalProfit >= 0 ? 'rgba(34,197,94,0.2)' : 'rgba(239,68,68,0.2)'}, inset 0 1px 0 rgba(255,255,255,0.1)` }}>
              <div style={{ fontSize: 'clamp(10px, 1.6vw, 12px)', color: totalProfit >= 0 ? '#86efac' : '#fca5a5', marginBottom: 8, textTransform: 'uppercase', fontWeight: 700, letterSpacing: '1px' }}>💵 Total P/L</div>
              <div style={{ fontSize: 'clamp(22px, 4.5vw, 32px)', fontWeight: 900, color: gainLossColor, wordBreak: 'break-word', lineHeight: 1.2 }}>
                {totalProfit >= 0 ? '+' : ''}₹{totalProfit.toLocaleString()}
              </div>
              <div style={{ fontSize: 'clamp(11px, 1.8vw, 13px)', color: totalProfit >= 0 ? '#86efac' : '#fca5a5', marginTop: 6, fontWeight: 600 }}>
                {totalInvested > 0 ? `${totalProfit >= 0 ? '+' : ''}${((totalProfit / totalInvested) * 100).toFixed(2)}%` : ''}
              </div>
            </div>
          </div>
        )}
      </div>

      {activeTab === 'overview' && (
      <>
      {/* Division & Subdivision Goal Seek */}
      <div style={{ 
        marginBottom: 32, 
        padding: 24, 
        background: 'radial-gradient(circle at 20% 10%, rgba(34,211,238,0.12), transparent 45%), radial-gradient(circle at 80% 0%, rgba(99,102,241,0.12), transparent 35%), #0c1423', 
        border: '1px solid #1f2d3f', 
        borderRadius: 16,
        boxShadow: '0 14px 40px rgba(0,0,0,0.35)' 
      }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 22, fontWeight: 800, color: '#6366f1', letterSpacing: '-0.3px' }}>
          🎯 Goal Seek: Balance ALL Divisions
        </h2>
        <p style={{ margin: '0 0 20px 0', fontSize: 13, color: '#9fb3c8', lineHeight: 1.7 }}>
          Calculates the <strong style={{ color: '#e6e9ef' }}>minimum total amount</strong> to invest across <strong style={{ color: '#e6e9ef' }}>ALL divisions</strong> so every division reaches its exact target.
        </p>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 180px), 1fr))', gap: 'clamp(12px, 2vw, 18px)', marginBottom: 24 }}>
          <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12) 0%, rgba(99,102,241,0.05) 100%), #0a1018', padding: 'clamp(14px, 2.5vw, 18px)', borderRadius: 12, border: '2px solid rgba(99,102,241,0.4)', boxShadow: '0 4px 20px rgba(99,102,241,0.2)', transition: 'all 0.3s ease' }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ fontSize: 'clamp(10px, 1.5vw, 11px)', color: '#a5b4fc', marginBottom: 8, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>💰 Minimum to Invest</div>
            <div style={{ fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 900, color: '#818cf8', lineHeight: 1.1 }}>₹{Math.ceil(minRequired).toLocaleString()}</div>
            <div style={{ fontSize: 'clamp(9px, 1.4vw, 10px)', color: '#818cf8', marginTop: 6, opacity: 0.8 }}>Across all divisions</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.12) 0%, rgba(34,197,94,0.05) 100%), #0a1018', padding: 'clamp(14px, 2.5vw, 18px)', borderRadius: 12, border: '2px solid rgba(34,197,94,0.4)', boxShadow: '0 4px 20px rgba(34,197,94,0.2)', transition: 'all 0.3s ease' }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ fontSize: 'clamp(10px, 1.5vw, 11px)', color: '#86efac', marginBottom: 8, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>📈 Portfolio After</div>
            <div style={{ fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 900, color: '#4ade80', lineHeight: 1.1 }}>₹{Math.ceil(totalCurrent + minRequired).toLocaleString()}</div>
            <div style={{ fontSize: 'clamp(9px, 1.4vw, 10px)', color: '#4ade80', marginTop: 6, opacity: 0.8 }}>Current + Investment</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, rgba(168,139,250,0.12) 0%, rgba(168,139,250,0.05) 100%), #0a1018', padding: 'clamp(14px, 2.5vw, 18px)', borderRadius: 12, border: '2px solid rgba(168,139,250,0.4)', boxShadow: '0 4px 20px rgba(168,139,250,0.2)', transition: 'all 0.3s ease' }}
          onMouseEnter={(e) => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={(e) => e.currentTarget.style.transform = 'translateY(0)'}>
            <div style={{ fontSize: 'clamp(10px, 1.5vw, 11px)', color: '#c4b5fd', marginBottom: 8, textTransform: 'uppercase', fontWeight: 800, letterSpacing: '0.8px' }}>📊 As % of Current</div>
            <div style={{ fontSize: 'clamp(22px, 4vw, 28px)', fontWeight: 900, color: '#c084fc', lineHeight: 1.1 }}>
              {totalCurrent > 0 ? ((minRequired / totalCurrent) * 100).toFixed(1) : 0}%
            </div>
            <div style={{ fontSize: 'clamp(9px, 1.4vw, 10px)', color: '#c084fc', marginTop: 6, opacity: 0.8 }}>of current portfolio</div>
          </div>
        </div>

        <div style={{ background: '#0a1018', borderRadius: 12, overflow: 'hidden', border: '2px solid #1e293b', boxShadow: '0 8px 32px rgba(0,0,0,0.4)' }}>
          <table style={{ width: '100%', fontSize: 'clamp(11px, 1.8vw, 12px)', borderCollapse: 'separate', borderSpacing: 0 }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #334155', background: 'linear-gradient(180deg, #1e293b 0%, #0f1724 100%)' }}>
                <th style={{ textAlign: 'left', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Division</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Current</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>P/L</th>
                <th style={{ textAlign: 'center', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Status</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Current %</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#94a3b8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Target %</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#818cf8', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>Add Here</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#c084fc', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>After Add</th>
                <th style={{ textAlign: 'right', padding: 'clamp(12px, 2vw, 14px)', color: '#4ade80', fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '1px' }}>New %</th>
              </tr>
            </thead>
            <tbody>
              {(analytics.divisions || []).map(d => {
                const addition = Math.ceil(Number(d.requiredAddition) || 0)
                const newValue = (Number(d.current) || 0) + addition
                const newTotal = totalCurrent + minRequired
                const newPercent = newTotal > 0 ? (newValue / newTotal) * 100 : 0
                
                // Check if this division has subdivisions needing investment
                const divGoalSeek = subdivisionGoalSeek[d.id]
                const hasSubdivisionGoalSeek = divGoalSeek && divGoalSeek.requiredAddition > 0
                const div = portfolio.divisions.find(div => div.id === d.id)
                
                return (
                  <React.Fragment key={d.id}>
                    {/* Division Row */}
                    <tr style={{ borderBottom: hasSubdivisionGoalSeek ? 'none' : '1px solid #1e293b', background: addition > 0 ? 'rgba(99, 102, 241, 0.1)' : 'transparent', transition: 'all 0.2s ease', cursor: 'default' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = addition > 0 ? 'rgba(99, 102, 241, 0.15)' : 'rgba(30, 41, 59, 0.5)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = addition > 0 ? 'rgba(99, 102, 241, 0.1)' : 'transparent'}>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#f1f5f9', fontWeight: 700, fontSize: 'clamp(12px, 2vw, 13px)' }}>{d.name}</td>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#818cf8', textAlign: 'right', fontWeight: 700 }}>₹{(Number(d.current) || 0).toLocaleString()}</td>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', textAlign: 'right' }}>
                        {(() => {
                          const invested = Number(d.invested) || 0
                          const profit = Number(d.profit) || 0
                          const pct = invested > 0 ? (profit / invested) * 100 : 0
                          const color = profit >= 0 ? '#22c55e' : '#ef4444'
                          return (
                            <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-end', lineHeight: 1.2 }}>
                              <span style={{ color, fontWeight: 800 }}> {profit >= 0 ? '+' : ''}₹{profit.toLocaleString()} </span>
                              <span style={{ color, fontWeight: 700, fontSize: '0.9em', opacity: 0.9 }}> {invested > 0 ? `${profit >= 0 ? '+' : ''}${pct.toFixed(2)}%` : '—'} </span>
                            </div>
                          )
                        })()}
                      </td>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', textAlign: 'center' }}>
                        {addition > 0 ? (
                          <span style={{ background: 'linear-gradient(135deg, #6366f1 0%, #4f46e5 100%)', color: 'white', padding: '4px 12px', borderRadius: 6, fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, letterSpacing: '0.5px', boxShadow: '0 2px 8px rgba(99,102,241,0.4)' }}>ADD</span>
                        ) : (
                          <span style={{ background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)', color: 'white', padding: '4px 12px', borderRadius: 6, fontSize: 'clamp(9px, 1.5vw, 10px)', fontWeight: 800, letterSpacing: '0.5px', boxShadow: '0 2px 8px rgba(34,197,94,0.4)' }}>TARGET</span>
                        )}
                      </td>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#22d3ee', textAlign: 'right', fontWeight: 700 }}>{(Number(d.currentPercent) || 0).toFixed(2)}%</td>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', color: '#4ade80', textAlign: 'right', fontWeight: 700 }}>{(Number(d.targetPercent) || 0).toFixed(1)}%</td>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', textAlign: 'right', color: addition > 0 ? '#818cf8' : '#64748b', fontWeight: 800 }}>
                        ₹{addition.toLocaleString()}
                      </td>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', textAlign: 'right', color: '#c084fc', fontWeight: 800 }}>₹{newValue.toLocaleString()}</td>
                      <td style={{ padding: 'clamp(12px, 2vw, 14px)', textAlign: 'right', color: '#4ade80', fontWeight: 800 }}>{newPercent.toFixed(2)}%</td>
                    </tr>
                    
                    {/* Subdivision Rows */}
                    {hasSubdivisionGoalSeek && (div?.subdivisions || []).map((sub, idx, arr) => {
                      const subAddition = Math.ceil(divGoalSeek.additionsBySubdivision[sub.id] || 0)
                      if (subAddition <= 0) return null
                      
                      const divAnalytics = analytics.divisions?.find(ad => ad.id === d.id) || {}
                      const subAnalytics = divAnalytics.subdivisions?.find(s => s.id === sub.id) || {}
                      const subCurrent = subAnalytics.current || 0
                      const subAfter = subCurrent + subAddition
                      const isLast = idx === arr.length - 1
                      
                      return (
                        <tr key={`${d.id}-${sub.id}`} style={{ borderBottom: isLast ? '1px solid #1e293b' : 'none', background: 'rgba(245,158,11,0.08)', transition: 'all 0.2s ease', cursor: 'default' }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(245,158,11,0.12)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(245,158,11,0.08)'}>
                          <td style={{ padding: 'clamp(10px, 1.8vw, 12px) clamp(10px, 1.8vw, 14px) clamp(10px, 1.8vw, 12px) clamp(28px, 4vw, 36px)', color: '#cbd5e1', fontWeight: 600, fontSize: 'clamp(10px, 1.6vw, 11px)', fontStyle: 'italic' }}>↳ {sub.name}</td>
                          <td style={{ padding: 'clamp(10px, 1.8vw, 12px) clamp(10px, 1.8vw, 14px)', color: '#22d3ee', textAlign: 'right', fontWeight: 700, fontSize: 'clamp(10px, 1.6vw, 11px)' }}>₹{subCurrent.toLocaleString()}</td>
                          <td style={{ padding: 'clamp(10px, 1.8vw, 12px) clamp(10px, 1.8vw, 14px)', textAlign: 'center' }}>
                            <span style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: 'white', padding: '3px 10px', borderRadius: 5, fontSize: 'clamp(8px, 1.3vw, 9px)', fontWeight: 800, letterSpacing: '0.5px', boxShadow: '0 2px 6px rgba(245,158,11,0.4)' }}>SUB</span>
                          </td>
                          <td style={{ padding: 'clamp(10px, 1.8vw, 12px) clamp(10px, 1.8vw, 14px)', color: '#64748b', textAlign: 'right', fontSize: 'clamp(10px, 1.6vw, 11px)' }}>—</td>
                          <td style={{ padding: 'clamp(10px, 1.8vw, 12px) clamp(10px, 1.8vw, 14px)', color: '#4ade80', textAlign: 'right', fontWeight: 700, fontSize: 'clamp(10px, 1.6vw, 11px)' }}>{(Number(sub.targetPercent) || 0).toFixed(1)}%</td>
                          <td style={{ padding: 'clamp(10px, 1.8vw, 12px) clamp(10px, 1.8vw, 14px)', textAlign: 'right', color: '#fb923c', fontWeight: 800, fontSize: 'clamp(10px, 1.6vw, 11px)' }}>₹{subAddition.toLocaleString()}</td>
                          <td style={{ padding: 'clamp(10px, 1.8vw, 12px) clamp(10px, 1.8vw, 14px)', textAlign: 'right', color: '#c084fc', fontWeight: 700, fontSize: 'clamp(10px, 1.6vw, 11px)' }}>₹{subAfter.toLocaleString()}</td>
                          <td style={{ padding: 'clamp(10px, 1.8vw, 12px) clamp(10px, 1.8vw, 14px)', color: '#64748b', textAlign: 'right', fontSize: 'clamp(10px, 1.6vw, 11px)' }}>—</td>
                        </tr>
                      )
                    })}
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 'clamp(16px, 2.5vw, 24px)', padding: 'clamp(16px, 2.5vw, 20px)', background: 'linear-gradient(135deg, rgba(251,146,60,0.12) 0%, rgba(245,158,11,0.06) 100%), #0a1018', borderRadius: 12, border: '2px solid rgba(251,146,60,0.3)', boxShadow: '0 4px 16px rgba(251,146,60,0.15), inset 0 1px 0 rgba(255,255,255,0.05)' }}>
          <div style={{ fontSize: 'clamp(11px, 1.8vw, 13px)', color: '#fb923c', fontWeight: 900, marginBottom: 12, textTransform: 'uppercase', letterSpacing: '1px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 'clamp(16px, 2.5vw, 18px)' }}>💡</span> How Goal Seek Works
          </div>
          <ul style={{ margin: 0, paddingLeft: 'clamp(20px, 3vw, 24px)', fontSize: 'clamp(11px, 1.8vw, 13px)', color: '#cbd5e1', lineHeight: 2, listStyle: 'none' }}>
            <li style={{ marginBottom: 10, position: 'relative', paddingLeft: 8 }}>
              <span style={{ position: 'absolute', left: -16, color: '#fb923c', fontWeight: 900 }}>▸</span>
              Finds minimum new total T_new where <strong style={{ color: '#f1f5f9' }}>ALL</strong> divisions reach targets
            </li>
            <li style={{ marginBottom: 10, position: 'relative', paddingLeft: 8 }}>
              <span style={{ position: 'absolute', left: -16, color: '#fb923c', fontWeight: 900 }}>▸</span>
              For each division: T_new must be ≥ current_value / target% (to bring overweights down)
            </li>
            <li style={{ marginBottom: 10, position: 'relative', paddingLeft: 8 }}>
              <span style={{ position: 'absolute', left: -16, color: '#fb923c', fontWeight: 900 }}>▸</span>
              Takes <strong style={{ color: '#f1f5f9' }}>MAXIMUM</strong> of these constraints (driven by most overweight)
            </li>
            <li style={{ marginBottom: 10, position: 'relative', paddingLeft: 8 }}>
              <span style={{ position: 'absolute', left: -16, color: '#fb923c', fontWeight: 900 }}>▸</span>
              Adds to ALL divisions: addition = target% × T_new − current_value
            </li>
            <li style={{ marginBottom: 10, position: 'relative', paddingLeft: 8 }}>
              <span style={{ position: 'absolute', left: -16, color: '#fb923c', fontWeight: 900 }}>▸</span>
              <strong style={{ color: '#f1f5f9' }}>Subdivisions</strong> (marked with ↳) show breakdown within each division to reach their targets
            </li>
            <li style={{ position: 'relative', paddingLeft: 8 }}>
              <span style={{ position: 'absolute', left: -16, color: '#fb923c', fontWeight: 900 }}>▸</span>
              Result: Every division hits target % exactly, achieving <strong style={{ color: '#4ade80' }}>perfect balance</strong>
            </li>
          </ul>
        </div>
      </div>

      <PortfolioCharts divisions={portfolio.divisions} analytics={analytics} />

      <div style={{ marginBottom: 32 }}>
        <h2 style={{ margin: '0 0 20px 0', fontSize: 24, fontWeight: 800, color: '#e6e9ef', letterSpacing: '-0.3px' }}>
          📁 Portfolio Divisions
        </h2>
        {(portfolio.divisions || []).map(div => (
          <DivisionCard key={div.id} division={div} analytics={analytics} subdivisionGoalSeek={subdivisionGoalSeek} onUpdate={refreshAll} />
        ))}
      </div>
      </>
      )}

      {activeTab === 'planner' && (
        <MonthlyPlanner
          analytics={analytics}
          divisions={portfolio.divisions || []}
        />
      )}

      {/* Add division button */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'clamp(24px, 4vw, 36px)' }}>
        <button
          onClick={() => setShowAddDivisionModal(true)}
          style={{
            padding: 'clamp(14px, 2.5vw, 18px) clamp(28px, 4vw, 40px)',
            background: 'linear-gradient(135deg, #22c55e 0%, #16a34a 100%)',
            color: 'white',
            border: '2px solid rgba(34,197,94,0.5)',
            borderRadius: 12,
            fontSize: 'clamp(14px, 2.2vw, 17px)',
            fontWeight: 900,
            cursor: 'pointer',
            boxShadow: '0 6px 24px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)',
            transition: 'all 0.3s ease',
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-3px)'
            e.target.style.boxShadow = '0 10px 32px rgba(34, 197, 94, 0.5), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)'
            e.target.style.boxShadow = '0 6px 24px rgba(34, 197, 94, 0.4), inset 0 1px 0 rgba(255,255,255,0.3)'
          }}
        >
          ➕ Add New Division
        </button>
      </div>

      <AddDivisionForm
        isOpen={showAddDivisionModal}
        onClose={() => setShowAddDivisionModal(false)}
        onAdd={addDivision}
      />

      <div style={{ 
        color: '#64748b', 
        marginTop: 'clamp(20px, 3vw, 28px)', 
        fontSize: 'clamp(11px, 1.8vw, 13px)', 
        padding: 'clamp(14px, 2.5vw, 18px)', 
        background: 'linear-gradient(135deg, rgba(99,102,241,0.08) 0%, rgba(59,130,246,0.05) 100%)', 
        borderRadius: 10, 
        border: '2px solid rgba(99,102,241,0.2)',
        lineHeight: 1.8,
        textAlign: 'center'
      }}>
        <strong style={{ color: '#818cf8', fontSize: 'clamp(13px, 2vw, 15px)' }}>💡 Pro Tip:</strong> All values are editable inline. Current % and gap are computed automatically. Enter a budget amount to see suggested allocations per division.
      </div>
    </div>
  </div>
  )
}
