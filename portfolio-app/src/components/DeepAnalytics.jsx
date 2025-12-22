import React, { useMemo } from 'react'
import { Pie, Bar } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function DeepAnalytics({ divisions, analytics }) {
  const totalCurrent = analytics?.totals?.current || 0

  // Compute subdivision data relative to total portfolio
  const subdivisionData = useMemo(() => {
    const items = []
    divisions.forEach(div => {
      const divAnalytics = analytics.divisions?.find(d => d.id === div.id)
      const divCurrent = divAnalytics?.current || 0
      const divTargetPct = Number(div.targetPercent) || 0
      
      ;(div.subdivisions || []).forEach(sub => {
        const subAnalytics = divAnalytics?.subdivisions?.find(s => s.id === sub.id) || {}
        const subCurrent = subAnalytics.current || 0
        const subTargetPct = Number(sub.targetPercent) || 0
        
        // Calculate relative to total portfolio
        const overallCurrentPct = totalCurrent > 0 ? (subCurrent / totalCurrent) * 100 : 0
        const overallTargetPct = (divTargetPct / 100) * subTargetPct
        
        // Within parent division
        const withinDivCurrentPct = divCurrent > 0 ? (subCurrent / divCurrent) * 100 : 0
        
        items.push({
          id: sub.id,
          name: sub.name,
          divisionName: div.name,
          current: subCurrent,
          targetPctWithinDiv: subTargetPct,
          currentPctWithinDiv: withinDivCurrentPct,
          overallCurrentPct,
          overallTargetPct,
          gapOverall: overallTargetPct - overallCurrentPct,
          gapWithinDiv: subTargetPct - withinDivCurrentPct,
        })
      })
    })
    return items
  }, [divisions, analytics, totalCurrent])

  // Chart: Overall portfolio allocation by subdivision
  const overallAllocationData = {
    labels: subdivisionData.map(s => `${s.divisionName} - ${s.name}`),
    datasets: [{
      label: 'Current % of Portfolio',
      data: subdivisionData.map(s => s.overallCurrentPct),
      backgroundColor: [
        'rgba(34, 211, 238, 0.9)',
        'rgba(168, 139, 250, 0.9)',
        'rgba(249, 115, 22, 0.9)',
        'rgba(34, 197, 94, 0.9)',
        'rgba(244, 63, 94, 0.9)',
        'rgba(234, 179, 8, 0.9)',
        'rgba(56, 189, 248, 0.9)',
        'rgba(251, 146, 60, 0.9)',
        'rgba(250, 204, 21, 0.9)',
      ],
      borderColor: '#0b1220',
      borderWidth: 3,
      hoverOffset: 15,
      hoverBorderWidth: 4,
      hoverBorderColor: '#ffffff',
    }],
  }

  // Chart: Overall target vs current
  const targetVsCurrentData = {
    labels: subdivisionData.map(s => `${s.name}`),
    datasets: [
      {
        label: 'Target % (of total)',
        data: subdivisionData.map(s => s.overallTargetPct),
        backgroundColor: 'rgba(34, 197, 94, 0.85)',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'rgba(34, 197, 94, 1)',
        hoverBackgroundColor: 'rgba(34, 197, 94, 1)',
      },
      {
        label: 'Current % (of total)',
        data: subdivisionData.map(s => s.overallCurrentPct),
        backgroundColor: 'rgba(34, 211, 238, 0.85)',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'rgba(34, 211, 238, 1)',
        hoverBackgroundColor: 'rgba(34, 211, 238, 1)',
      },
    ],
  }

  const chartOptions = {
    responsive: true,
    maintainAspectRatio: true,
    animation: {
      animateRotate: true,
      animateScale: true,
      duration: 1000,
      easing: 'easeInOutQuart',
    },
    plugins: {
      legend: {
        labels: { 
          color: '#e6e9ef', 
          font: { size: 12, weight: '700' },
          padding: 15,
          usePointStyle: true,
          pointStyle: 'circle',
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
        titleFont: { size: 13, weight: '700' },
        bodyFont: { size: 12, weight: '600' },
        callbacks: {
          label: (ctx) => {
            const val = ctx.parsed || ctx.parsed.y || 0
            return `${ctx.dataset.label}: ${val.toFixed(2)}%`
          }
        }
      },
    },
  }

  const barOptions = {
    ...chartOptions,
    indexAxis: 'y',
    animation: {
      duration: 1200,
      easing: 'easeInOutCubic',
    },
    scales: {
      x: {
        grid: { 
          color: 'rgba(26, 36, 54, 0.6)',
          lineWidth: 1,
        },
        ticks: { 
          color: '#9fb3c8',
          font: { size: 11, weight: '600' },
          callback: v => `${v}%`,
        },
        border: { display: false },
      },
      y: {
        grid: { display: false },
        ticks: { 
          color: '#9fb3c8',
          font: { size: 10, weight: '600' },
        },
        border: { display: false },
      },
    },
  }

  return (
    <div style={{ padding: 'clamp(16px, 3vw, 24px)' }}>
      <h2 style={{ margin: '0 0 clamp(14px, 2.5vw, 20px) 0', fontSize: 'clamp(18px, 3.5vw, 24px)', fontWeight: 800, color: '#e6e9ef' }}>
        🔬 Deep Subdivision Analysis
      </h2>
      <p style={{ color: '#9fb3c8', fontSize: 'clamp(11px, 1.8vw, 13px)', marginBottom: 'clamp(16px, 3vw, 24px)' }}>
        Analyze subdivisions relative to both parent division and overall portfolio
      </p>

      {/* Overall Allocation Pie */}
      <div style={{
        background: 'radial-gradient(circle at 20% 20%, rgba(34,211,238,0.12), transparent 45%), #0c1423',
        padding: 'clamp(16px, 3vw, 20px)',
        borderRadius: 'clamp(12px, 2vw, 14px)',
        border: '1px solid #1f2d3f',
        boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
        marginBottom: 'clamp(16px, 3vw, 20px)',
      }}>
        <h3 style={{ margin: '0 0 clamp(12px, 2vw, 16px) 0', fontSize: 'clamp(14px, 2.5vw, 16px)', fontWeight: 700, color: '#e6e9ef' }}>
          🌐 Overall Portfolio Breakdown by Subdivision
        </h3>
        <div style={{ height: 'clamp(250px, 45vw, 350px)' }}>
          <Pie data={overallAllocationData} options={chartOptions} />
        </div>
      </div>

      {/* Target vs Current Bar */}
      <div style={{
        background: 'radial-gradient(circle at 80% 20%, rgba(34,197,94,0.12), transparent 45%), #0c1423',
        padding: 'clamp(16px, 3vw, 20px)',
        borderRadius: 'clamp(12px, 2vw, 14px)',
        border: '1px solid #1f2d3f',
        boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
        marginBottom: 'clamp(16px, 3vw, 20px)',
      }}>
        <h3 style={{ margin: '0 0 clamp(12px, 2vw, 16px) 0', fontSize: 'clamp(14px, 2.5vw, 16px)', fontWeight: 700, color: '#e6e9ef' }}>
          🎯 Target vs Current (% of Total Portfolio)
        </h3>
        <div style={{ height: 'clamp(300px, 50vw, 400px)' }}>
          <Bar data={targetVsCurrentData} options={barOptions} />
        </div>
      </div>

      {/* Detailed Table */}
      <div style={{
        background: '#0c1423',
        padding: 'clamp(16px, 3vw, 20px)',
        borderRadius: 'clamp(12px, 2vw, 14px)',
        border: '1px solid #1f2d3f',
        boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      }}>
        <h3 style={{ margin: '0 0 clamp(12px, 2vw, 16px) 0', fontSize: 'clamp(14px, 2.5vw, 16px)', fontWeight: 700, color: '#e6e9ef' }}>
          📊 Subdivision Insights
        </h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', fontSize: 'clamp(10px, 1.5vw, 12px)', minWidth: 800, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #1f2d3f', background: '#0a1018' }}>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', textTransform: 'uppercase' }}>Division</th>
                <th style={{ textAlign: 'left', padding: '12px 10px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', textTransform: 'uppercase' }}>Subdivision</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', textTransform: 'uppercase' }}>Current ₹</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', textTransform: 'uppercase' }}>Within Div %</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', textTransform: 'uppercase' }}>Target (Div %)</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', textTransform: 'uppercase' }}>Overall %</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', textTransform: 'uppercase' }}>Overall Target %</th>
                <th style={{ textAlign: 'right', padding: '12px 10px', color: '#7c92ab', fontSize: 'clamp(9px, 1.3vw, 10px)', textTransform: 'uppercase' }}>Gap (Overall)</th>
              </tr>
            </thead>
            <tbody>
              {subdivisionData.map(sub => {
                const gapColor = sub.gapOverall < 0 ? '#f97316' : sub.gapOverall > 0 ? '#22c55e' : '#7c92ab'
                return (
                  <tr key={sub.id} style={{ borderBottom: '1px solid #1a2436' }}>
                    <td style={{ padding: '12px 10px', color: '#9fb3c8', fontWeight: 600 }}>{sub.divisionName}</td>
                    <td style={{ padding: '12px 10px', color: '#e6e9ef', fontWeight: 700 }}>{sub.name}</td>
                    <td style={{ padding: '12px 10px', color: '#a78bfa', textAlign: 'right', fontWeight: 700 }}>₹{sub.current.toLocaleString()}</td>
                    <td style={{ padding: '12px 10px', color: '#22d3ee', textAlign: 'right', fontWeight: 700 }}>{sub.currentPctWithinDiv.toFixed(2)}%</td>
                    <td style={{ padding: '12px 10px', color: '#9fb3c8', textAlign: 'right' }}>{sub.targetPctWithinDiv.toFixed(1)}%</td>
                    <td style={{ padding: '12px 10px', color: '#0ea5e9', textAlign: 'right', fontWeight: 700 }}>{sub.overallCurrentPct.toFixed(2)}%</td>
                    <td style={{ padding: '12px 10px', color: '#22c55e', textAlign: 'right', fontWeight: 700 }}>{sub.overallTargetPct.toFixed(2)}%</td>
                    <td style={{ padding: '12px 10px', color: gapColor, textAlign: 'right', fontWeight: 800 }}>
                      {sub.gapOverall > 0 ? '+' : ''}{sub.gapOverall.toFixed(2)}%
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        <div style={{ marginTop: 'clamp(14px, 2.5vw, 18px)', padding: 'clamp(12px, 2vw, 14px)', background: '#0a1018', borderRadius: 10, borderLeft: '3px solid #22d3ee' }}>
          <div style={{ fontSize: 'clamp(10px, 1.6vw, 11px)', color: '#22d3ee', fontWeight: 700, marginBottom: 8, textTransform: 'uppercase' }}>💡 Key Insights</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 'clamp(10px, 1.6vw, 11px)', color: '#9fb3c8', lineHeight: 2 }}>
            <li><strong style={{ color: '#e6e9ef' }}>Within Div %</strong>: Subdivision's share within its parent division</li>
            <li><strong style={{ color: '#e6e9ef' }}>Overall %</strong>: Subdivision's actual share of total portfolio</li>
            <li><strong style={{ color: '#e6e9ef' }}>Overall Target %</strong>: (Division Target %) × (Subdivision Target within Div) / 100</li>
            <li><strong style={{ color: '#e6e9ef' }}>Gap</strong>: Positive = underweight in portfolio, Negative = overweight</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
