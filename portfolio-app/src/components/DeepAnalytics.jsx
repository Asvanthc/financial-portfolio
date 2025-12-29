import React, { useMemo } from 'react'
import { Pie, Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function DeepAnalytics({ divisions, analytics }) {
  const totalCurrent = analytics?.totals?.current || 0
  const totalInvested = analytics?.totals?.invested || 0
  const totalPL = analytics?.totals?.pl || 0

  // Advanced metrics computation
  const advancedMetrics = useMemo(() => {
    const items = []
    let totalPositions = 0
    let profitablePositions = 0
    let maxGain = 0
    let maxLoss = 0
    let totalVolatility = 0
    
    divisions.forEach(div => {
      const divAnalytics = analytics.divisions?.find(d => d.id === div.id)
      const divCurrent = divAnalytics?.current || 0
      const divInvested = divAnalytics?.invested || 0
      const divPL = divAnalytics?.pl || 0
      const divTargetPct = Number(div.targetPercent) || 0
      
      ;(div.subdivisions || []).forEach(sub => {
        const subAnalytics = divAnalytics?.subdivisions?.find(s => s.id === sub.id) || {}
        const subCurrent = subAnalytics.current || 0
        const subInvested = subAnalytics.invested || 0
        const subPL = subAnalytics.pl || 0
        const subTargetPct = Number(sub.targetPercent) || 0
        
        // Calculate metrics
        const overallCurrentPct = totalCurrent > 0 ? (subCurrent / totalCurrent) * 100 : 0
        const overallTargetPct = (divTargetPct / 100) * subTargetPct
        const roi = subInvested > 0 ? (subPL / subInvested) * 100 : 0
        const deviation = overallTargetPct > 0 ? ((overallCurrentPct - overallTargetPct) / overallTargetPct) * 100 : 0
        
        totalPositions++
        if (subPL > 0) profitablePositions++
        if (roi > maxGain) maxGain = roi
        if (roi < maxLoss) maxLoss = roi
        totalVolatility += Math.abs(deviation)
        
        items.push({
          id: sub.id,
          name: sub.name,
          divisionName: div.name,
          current: subCurrent,
          invested: subInvested,
          pl: subPL,
          roi,
          overallCurrentPct,
          overallTargetPct,
          deviation,
          risk: Math.abs(deviation) > 30 ? 'High' : Math.abs(deviation) > 15 ? 'Medium' : 'Low'
        })
      })
    })
    
    const winRate = totalPositions > 0 ? (profitablePositions / totalPositions) * 100 : 0
    const avgVolatility = totalPositions > 0 ? totalVolatility / totalPositions : 0
    const diversificationScore = totalPositions > 0 ? Math.min(100, (totalPositions / 15) * 100) : 0
    const portfolioHealth = ((winRate * 0.4) + (diversificationScore * 0.3) + (Math.max(0, 100 - avgVolatility) * 0.3))
    
    return { 
      items, 
      totalPositions, 
      profitablePositions, 
      winRate, 
      maxGain, 
      maxLoss, 
      avgVolatility,
      diversificationScore,
      portfolioHealth
    }
  }, [divisions, analytics, totalCurrent])

  // Portfolio Health Score Card
  const healthColor = advancedMetrics.portfolioHealth >= 70 ? '#10b981' : advancedMetrics.portfolioHealth >= 40 ? '#f59e0b' : '#ef4444'
  const riskLevel = advancedMetrics.avgVolatility > 25 ? '🔴 High Risk' : advancedMetrics.avgVolatility > 15 ? '🟡 Medium Risk' : '🟢 Low Risk'
  
  // Risk Distribution
  const riskDist = advancedMetrics.items.reduce((acc, item) => {
    acc[item.risk] = (acc[item.risk] || 0) + 1
    return acc
  }, {})

  // ROI Distribution Chart
  const roiData = {
    labels: advancedMetrics.items.map(s => s.name).slice(0, 10),
    datasets: [{
      label: 'ROI %',
      data: advancedMetrics.items.map(s => s.roi).slice(0, 10),
      backgroundColor: advancedMetrics.items.map(s => s.roi >= 0 ? 'rgba(16, 185, 129, 0.8)' : 'rgba(239, 68, 68, 0.8)'),
      borderColor: advancedMetrics.items.map(s => s.roi >= 0 ? '#10b981' : '#ef4444'),
      borderWidth: 2,
      borderRadius: 8,
    }]
  }

  // Risk Distribution Pie
  const riskDistData = {
    labels: ['Low Risk', 'Medium Risk', 'High Risk'],
    datasets: [{
      data: [riskDist['Low'] || 0, riskDist['Medium'] || 0, riskDist['High'] || 0],
      backgroundColor: ['rgba(16, 185, 129, 0.9)', 'rgba(245, 158, 11, 0.9)', 'rgba(239, 68, 68, 0.9)'],
      borderColor: '#0b1220',
      borderWidth: 3,
      hoverOffset: 15,
    }]
  }

  // Allocation vs Target
  const allocationData = {
    labels: advancedMetrics.items.map(s => s.name).slice(0, 8),
    datasets: [
      {
        label: 'Target %',
        data: advancedMetrics.items.map(s => s.overallTargetPct).slice(0, 8),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: '#22c55e',
        borderWidth: 2,
        borderRadius: 6,
      },
      {
        label: 'Current %',
        data: advancedMetrics.items.map(s => s.overallCurrentPct).slice(0, 8),
        backgroundColor: 'rgba(34, 211, 238, 0.7)',
        borderColor: '#22d3ee',
        borderWidth: 2,
        borderRadius: 6,
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: { duration: 1000, easing: 'easeInOutQuart' },
    plugins: {
      legend: {
        labels: { 
          color: '#e6e9ef', 
          font: { size: 12, weight: '700' },
          padding: 12,
          usePointStyle: true,
        },
      },
      tooltip: {
        backgroundColor: 'rgba(15, 23, 36, 0.95)',
        titleColor: '#22d3ee',
        bodyColor: '#e6e9ef',
        borderColor: '#22d3ee',
        borderWidth: 2,
        padding: 12,
        cornerRadius: 8,
      },
    },
  }

  const barOptions = {
    ...chartOptions,
    indexAxis: 'y',
    scales: {
      x: {
        grid: { color: 'rgba(26, 36, 54, 0.4)' },
        ticks: { color: '#9fb3c8', font: { size: 11 } },
      },
      y: {
        grid: { display: false },
        ticks: { color: '#9fb3c8', font: { size: 10 } },
      },
    },
  }

  return (
    <div style={{ padding: '20px', background: '#0a0f1a' }}>
      {/* Header */}
      <div style={{ marginBottom: 24 }}>
        <h2 style={{ margin: '0 0 8px 0', fontSize: 28, fontWeight: 900, color: '#e6e9ef', letterSpacing: '-0.5px' }}>
          🧠 Advanced Portfolio Analytics
        </h2>
        <p style={{ color: '#94a3b8', fontSize: 14, margin: 0 }}>
          Deep insights into risk, performance, diversification, and rebalancing opportunities
        </p>
      </div>

      {/* Portfolio Health Dashboard */}
      <div style={{ 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', 
        gap: 16, 
        marginBottom: 24 
      }}>
        <div style={{ 
          background: `linear-gradient(135deg, ${healthColor}15, transparent)`,
          border: `2px solid ${healthColor}40`,
          borderRadius: 16,
          padding: 20,
          boxShadow: `0 8px 24px ${healthColor}20`
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>
            Portfolio Health Score
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: healthColor, marginBottom: 4 }}>
            {advancedMetrics.portfolioHealth.toFixed(0)}%
          </div>
          <div style={{ fontSize: 11, color: '#7c92ab' }}>
            {advancedMetrics.portfolioHealth >= 70 ? '🎉 Excellent' : advancedMetrics.portfolioHealth >= 40 ? '👍 Good' : '⚠️ Needs Attention'}
          </div>
        </div>

        <div style={{ 
          background: 'linear-gradient(135deg, rgba(34, 211, 238, 0.1), transparent)',
          border: '2px solid rgba(34, 211, 238, 0.3)',
          borderRadius: 16,
          padding: 20,
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>
            Win Rate
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#22d3ee', marginBottom: 4 }}>
            {advancedMetrics.winRate.toFixed(0)}%
          </div>
          <div style={{ fontSize: 11, color: '#7c92ab' }}>
            {advancedMetrics.profitablePositions}/{advancedMetrics.totalPositions} profitable
          </div>
        </div>

        <div style={{ 
          background: 'linear-gradient(135deg, rgba(168, 139, 250, 0.1), transparent)',
          border: '2px solid rgba(168, 139, 250, 0.3)',
          borderRadius: 16,
          padding: 20,
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>
            Diversification
          </div>
          <div style={{ fontSize: 40, fontWeight: 900, color: '#a78bfa', marginBottom: 4 }}>
            {advancedMetrics.diversificationScore.toFixed(0)}%
          </div>
          <div style={{ fontSize: 11, color: '#7c92ab' }}>
            {advancedMetrics.totalPositions} positions
          </div>
        </div>

        <div style={{ 
          background: `linear-gradient(135deg, ${advancedMetrics.avgVolatility > 25 ? 'rgba(239, 68, 68, 0.1)' : 'rgba(34, 197, 94, 0.1)'}, transparent)`,
          border: `2px solid ${advancedMetrics.avgVolatility > 25 ? 'rgba(239, 68, 68, 0.3)' : 'rgba(34, 197, 94, 0.3)'}`,
          borderRadius: 16,
          padding: 20,
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', marginBottom: 8 }}>
            Risk Level
          </div>
          <div style={{ fontSize: 24, fontWeight: 900, color: advancedMetrics.avgVolatility > 25 ? '#ef4444' : '#10b981', marginBottom: 4 }}>
            {riskLevel}
          </div>
          <div style={{ fontSize: 11, color: '#7c92ab' }}>
            Avg deviation: {advancedMetrics.avgVolatility.toFixed(1)}%
          </div>
        </div>
      </div>

      {/* Charts Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 20, marginBottom: 24 }}>
        
        {/* ROI Performance */}
        <div style={{
          background: 'linear-gradient(135deg, #0f1724 0%, #0a1018 100%)',
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1e293b',
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#e6e9ef' }}>
            📊 Top ROI Performance
          </h3>
          <div style={{ height: 320 }}>
            <Bar data={roiData} options={barOptions} />
          </div>
        </div>

        {/* Risk Distribution */}
        <div style={{
          background: 'linear-gradient(135deg, #0f1724 0%, #0a1018 100%)',
          padding: 20,
          borderRadius: 16,
          border: '1px solid #1e293b',
          boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        }}>
          <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#e6e9ef' }}>
            🎯 Risk Distribution
          </h3>
          <div style={{ height: 320, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Doughnut data={riskDistData} options={chartOptions} />
          </div>
        </div>

      </div>

      {/* Allocation vs Target */}
      <div style={{
        background: 'linear-gradient(135deg, #0f1724 0%, #0a1018 100%)',
        padding: 20,
        borderRadius: 16,
        border: '1px solid #1e293b',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
        marginBottom: 24,
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#e6e9ef' }}>
          ⚖️ Allocation vs Target (Top Holdings)
        </h3>
        <div style={{ height: 350 }}>
          <Bar data={allocationData} options={barOptions} />
        </div>
      </div>

      {/* Detailed Insights Table */}
      <div style={{
        background: '#0c1423',
        padding: 20,
        borderRadius: 16,
        border: '1px solid #1f2d3f',
        boxShadow: '0 12px 32px rgba(0,0,0,0.4)',
      }}>
        <h3 style={{ margin: '0 0 16px 0', fontSize: 18, fontWeight: 800, color: '#e6e9ef' }}>
          📈 Detailed Position Analysis
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 12, minWidth: 900, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1f2d3f', background: '#0a1018' }}>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>Position</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>Invested</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>Current</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>P/L</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>ROI %</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>Portfolio %</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>Target %</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>Deviation</th>
                <th style={{ textAlign: 'center', padding: '12px 10px', color: '#7c92ab', fontSize: 10, textTransform: 'uppercase' }}>Risk</th>
              </tr>
            </thead>
            <tbody>
              {advancedMetrics.items
                .sort((a, b) => b.current - a.current)
                .map(item => {
                  const plColor = item.pl >= 0 ? '#10b981' : '#ef4444'
                  const riskColor = item.risk === 'High' ? '#ef4444' : item.risk === 'Medium' ? '#f59e0b' : '#10b981'
                  const devColor = Math.abs(item.deviation) > 30 ? '#ef4444' : Math.abs(item.deviation) > 15 ? '#f59e0b' : '#10b981'
                  
                  return (
                    <tr key={item.id} style={{ borderBottom: '1px solid #1a2436' }}>
                      <td style={{ padding: '12px 10px', color: '#e6e9ef', fontWeight: 700 }}>
                        {item.name}
                        <div style={{ fontSize: 10, color: '#7c92ab', fontWeight: 600 }}>{item.divisionName}</div>
                      </td>
                      <td style={{ padding: '12px 10px', color: '#fbbf24', textAlign: 'right', fontWeight: 700 }}>₹{item.invested.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px', color: '#22d3ee', textAlign: 'right', fontWeight: 700 }}>₹{item.current.toLocaleString()}</td>
                      <td style={{ padding: '12px 10px', color: plColor, textAlign: 'right', fontWeight: 800 }}>
                        {item.pl >= 0 ? '+' : ''}₹{item.pl.toLocaleString()}
                      </td>
                      <td style={{ padding: '12px 10px', color: plColor, textAlign: 'right', fontWeight: 800 }}>
                        {item.roi >= 0 ? '+' : ''}{item.roi.toFixed(1)}%
                      </td>
                      <td style={{ padding: '12px 10px', color: '#a78bfa', textAlign: 'right', fontWeight: 700 }}>{item.overallCurrentPct.toFixed(2)}%</td>
                      <td style={{ padding: '12px 10px', color: '#22c55e', textAlign: 'right', fontWeight: 700 }}>{item.overallTargetPct.toFixed(2)}%</td>
                      <td style={{ padding: '12px 10px', color: devColor, textAlign: 'right', fontWeight: 800 }}>
                        {item.deviation > 0 ? '+' : ''}{item.deviation.toFixed(1)}%
                      </td>
                      <td style={{ padding: '12px 10px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: 6,
                          background: `${riskColor}20`,
                          border: `1px solid ${riskColor}`,
                          color: riskColor,
                          fontSize: 10,
                          fontWeight: 900,
                        }}>
                          {item.risk}
                        </span>
                      </td>
                    </tr>
                  )
                })}
            </tbody>
          </table>
        </div>

        {/* Insights Panel */}
        <div style={{ marginTop: 20, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 12 }}>
          <div style={{ padding: 14, background: '#0a1018', borderRadius: 10, borderLeft: '3px solid #10b981' }}>
            <div style={{ fontSize: 11, color: '#10b981', fontWeight: 800, marginBottom: 6 }}>🎯 Best Performer</div>
            <div style={{ fontSize: 13, color: '#e6e9ef', fontWeight: 700 }}>
              {advancedMetrics.items.length > 0 ? 
                advancedMetrics.items.reduce((max, item) => item.roi > max.roi ? item : max).name 
                : 'N/A'}
            </div>
            <div style={{ fontSize: 11, color: '#7c92ab' }}>ROI: +{advancedMetrics.maxGain.toFixed(1)}%</div>
          </div>

          <div style={{ padding: 14, background: '#0a1018', borderRadius: 10, borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: 11, color: '#ef4444', fontWeight: 800, marginBottom: 6 }}>⚠️ Needs Attention</div>
            <div style={{ fontSize: 13, color: '#e6e9ef', fontWeight: 700 }}>
              {advancedMetrics.items.length > 0 ? 
                advancedMetrics.items.reduce((min, item) => item.roi < min.roi ? item : min).name 
                : 'N/A'}
            </div>
            <div style={{ fontSize: 11, color: '#7c92ab' }}>ROI: {advancedMetrics.maxLoss.toFixed(1)}%</div>
          </div>

          <div style={{ padding: 14, background: '#0a1018', borderRadius: 10, borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: 11, color: '#f59e0b', fontWeight: 800, marginBottom: 6 }}>📊 Rebalance Needed</div>
            <div style={{ fontSize: 13, color: '#e6e9ef', fontWeight: 700 }}>
              {advancedMetrics.items.filter(i => Math.abs(i.deviation) > 20).length} positions
            </div>
            <div style={{ fontSize: 11, color: '#7c92ab' }}>Deviation &gt; 20%</div>
          </div>
        </div>
      </div>
    </div>
  )
}
