import React from 'react'
import { Pie, Bar, Doughnut } from 'react-chartjs-2'
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function PortfolioCharts({ divisions, analytics }) {
  if (!divisions || divisions.length === 0) return null

  // Data for allocation pie chart
  const allocationLabels = divisions.map(d => d.name)
  const allocationValues = divisions.map(d => {
    const div = analytics.divisions?.find(ad => ad.id === d.id) || {}
    return Number(div.current) || 0
  })

  const totalCurrent = analytics?.totals?.current || 0

  const palettePrimary = [
    'rgba(34, 211, 238, 0.9)',   // Cyan
    'rgba(168, 139, 250, 0.9)',  // Purple
    'rgba(249, 115, 22, 0.9)',   // Orange
    'rgba(34, 197, 94, 0.9)',    // Green
    'rgba(244, 63, 94, 0.9)',    // Pink
    'rgba(234, 179, 8, 0.9)',    // Yellow
    'rgba(56, 189, 248, 0.9)',   // Light Blue
  ]
  
  const paletteSecondary = [
    'rgba(14, 165, 233, 0.7)',
    'rgba(139, 92, 246, 0.7)',
    'rgba(251, 146, 60, 0.7)',
    'rgba(22, 163, 74, 0.7)',
    'rgba(249, 115, 22, 0.7)',
    'rgba(250, 204, 21, 0.7)',
    'rgba(6, 182, 212, 0.7)',
  ]

  const allocationData = {
    labels: allocationLabels,
    datasets: [{
      data: allocationValues,
      backgroundColor: palettePrimary,
      borderColor: '#0b1220',
      borderWidth: 3,
      hoverOffset: 15,
      hoverBorderWidth: 4,
      hoverBorderColor: '#ffffff',
    }],
  }

  // Data for target vs current bar chart
  const targetCurrentLabels = divisions.map(d => d.name)
  const targetValues = divisions.map(d => Number(d.targetPercent) || 0)
  const currentValues = divisions.map(d => {
    const div = analytics.divisions?.find(ad => ad.id === d.id) || {}
    return Number(div.currentPercent) || 0
  })

  const targetVsCurrentDoughnut = {
    labels: targetCurrentLabels,
    datasets: [
      {
        label: 'Target %',
        data: targetValues,
        backgroundColor: paletteSecondary,
        borderWidth: 3,
        borderColor: '#0b1220',
        hoverOffset: 12,
        hoverBorderWidth: 4,
        hoverBorderColor: '#22c55e',
      },
      {
        label: 'Current %',
        data: currentValues,
        backgroundColor: palettePrimary,
        borderWidth: 3,
        borderColor: '#0b1220',
        hoverOffset: 12,
        hoverBorderWidth: 4,
        hoverBorderColor: '#22d3ee',
      },
    ],
  }

  const targetCurrentData = {
    labels: targetCurrentLabels,
    datasets: [
      {
        label: 'Target %',
        data: targetValues,
        backgroundColor: 'rgba(34, 197, 94, 0.85)',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'rgba(34, 197, 94, 1)',
        hoverBackgroundColor: 'rgba(34, 197, 94, 1)',
      },
      {
        label: 'Current %',
        data: currentValues,
        backgroundColor: 'rgba(14, 165, 233, 0.85)',
        borderRadius: 8,
        borderWidth: 2,
        borderColor: 'rgba(14, 165, 233, 1)',
        hoverBackgroundColor: 'rgba(14, 165, 233, 1)',
      },
    ],
  }

  // Gap in ₹ relative to target at current total
  const targetValueCurrency = divisions.map(d => totalCurrent * ((Number(d.targetPercent) || 0) / 100))
  const gapValues = allocationValues.map((cur, idx) => cur - (targetValueCurrency[idx] || 0))
  const gapColors = gapValues.map(v => v >= 0 ? '#22c55e' : '#f97316')

  const gapData = {
    labels: allocationLabels,
    datasets: [
      {
        label: 'Gap (₹ current - target)',
        data: gapValues,
        backgroundColor: gapColors,
        borderRadius: 10,
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
        displayColors: true,
        boxPadding: 6,
      },
    },
  }

  const barOptions = {
    ...chartOptions,
    indexAxis: 'y',
    scales: {
      y: {
        beginAtZero: true,
        grid: { color: '#1a2436' },
        ticks: { color: '#7c92ab' },
      },
      x: {
        grid: { display: false },
        ticks: { color: '#7c92ab' },
      },
    },
  }

  const gapOptions = {
    ...chartOptions,
    indexAxis: 'y',
    plugins: {
      ...chartOptions.plugins,
      legend: { position: 'bottom', labels: { color: '#e6e9ef' } },
    },
    scales: {
      x: {
        grid: { color: '#1a2436' },
        ticks: { color: '#7c92ab', callback: value => `₹${value}` },
      },
      y: {
        grid: { display: false },
        ticks: { color: '#7c92ab' },
      },
    },
  }

  return (
    <div style={{ marginBottom: 32 }}>
      <h2 style={{ margin: '0 0 clamp(14px, 2.5vw, 20px) 0', fontSize: 'clamp(18px, 3.5vw, 24px)', fontWeight: 800, color: '#e6e9ef', letterSpacing: '-0.3px' }}>
        📊 Portfolio Visualization
      </h2>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'clamp(12px, 2vw, 18px)', marginBottom: 'clamp(12px, 2vw, 18px)' }}>
        {/* Allocation Pie */}
        <div style={{
          background: 'radial-gradient(circle at 20% 20%, rgba(34,211,238,0.12), transparent 45%), radial-gradient(circle at 80% 0%, rgba(168,139,250,0.1), transparent 40%), #0b1220',
          padding: 'clamp(14px, 2.5vw, 20px)',
          borderRadius: 'clamp(10px, 2vw, 14px)',
          border: '1px solid #122033',
          boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(8px, 1.5vw, 12px)', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 'clamp(13px, 2.2vw, 16px)', fontWeight: 700, color: '#e6e9ef' }}>💰 Current Allocation</h3>
            <span style={{ fontSize: 'clamp(9px, 1.5vw, 11px)', color: '#7c92ab' }}>Share by division</span>
          </div>
          <div style={{ height: 'clamp(220px, 40vw, 320px)' }}>
            <Pie data={allocationData} options={chartOptions} />
          </div>
        </div>

        {/* Target vs Current Doughnut layered */}
        <div style={{
          background: 'radial-gradient(circle at 70% 20%, rgba(244,63,94,0.12), transparent 40%), radial-gradient(circle at 20% 80%, rgba(34,197,94,0.12), transparent 40%), #0b1220',
          padding: 'clamp(14px, 2.5vw, 20px)',
          borderRadius: 'clamp(10px, 2vw, 14px)',
          border: '1px solid #122033',
          boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'clamp(8px, 1.5vw, 12px)', flexWrap: 'wrap', gap: 8 }}>
            <h3 style={{ margin: 0, fontSize: 'clamp(13px, 2.2vw, 16px)', fontWeight: 700, color: '#e6e9ef' }}>🎯 Target vs Current</h3>
            <span style={{ fontSize: 'clamp(9px, 1.5vw, 11px)', color: '#7c92ab' }}>Outer: Target, Inner: Current</span>
          </div>
          <div style={{ height: 'clamp(220px, 40vw, 320px)' }}>
            <Doughnut data={targetVsCurrentDoughnut} options={chartOptions} />
          </div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 300px), 1fr))', gap: 'clamp(12px, 2vw, 18px)', marginBottom: 'clamp(12px, 2vw, 18px)' }}>
        {/* Gap currency chart */}
        <div style={{
          background: 'radial-gradient(circle at 10% 10%, rgba(34,197,94,0.12), transparent 40%), radial-gradient(circle at 90% 90%, rgba(249,115,22,0.1), transparent 45%), #0b1220',
          padding: 20,
          borderRadius: 14,
          border: '1px solid #122033',
          boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e6e9ef' }}>🧭 Gap vs Target (₹)</h3>
            <span style={{ fontSize: 11, color: '#7c92ab' }}>Positive = Overweight</span>
          </div>
          <div style={{ height: 320 }}>
            <Bar data={gapData} options={gapOptions} />
          </div>
        </div>

        {/* Target vs Current bar (horizontal) */}
        <div style={{
          background: 'radial-gradient(circle at 80% 20%, rgba(14,165,233,0.12), transparent 45%), radial-gradient(circle at 20% 60%, rgba(34,197,94,0.12), transparent 35%), #0b1220',
          padding: 20,
          borderRadius: 14,
          border: '1px solid #122033',
          boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700, color: '#e6e9ef' }}>📐 Target vs Current %</h3>
            <span style={{ fontSize: 11, color: '#7c92ab' }}>Hover to compare</span>
          </div>
          <div style={{ height: 320 }}>
            <Bar data={targetCurrentData} options={barOptions} />
          </div>
        </div>
      </div>

      {/* Gap Analysis tiles */}
      <div style={{
        background: '#0b1220',
        padding: 18,
        borderRadius: 14,
        border: '1px solid #122033',
        boxShadow: '0 12px 30px rgba(0,0,0,0.35)',
      }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: 16, fontWeight: 700, color: '#e6e9ef' }}>
          📈 Gap Analysis
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
          {divisions.map(d => {
            const div = analytics.divisions?.find(ad => ad.id === d.id) || {}
            const delta = Number(div.deltaPercent) || 0
            const isOverweight = delta < 0
            const color = isOverweight ? '#f97316' : delta > 0 ? '#22c55e' : '#7c92ab'
            return (
              <div key={d.id} style={{
                background: 'linear-gradient(135deg, rgba(34,211,238,0.1), rgba(14,165,233,0.05))',
                padding: 14,
                borderRadius: 12,
                border: `1px solid ${color}33`,
                boxShadow: '0 8px 20px rgba(0,0,0,0.25)',
              }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: '#e6e9ef', marginBottom: 6 }}>
                  {d.name}
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: 10, color: '#7c92ab', marginBottom: 2 }}>Gap</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color }}>{delta > 0 ? '+' : ''}{delta.toFixed(2)}%</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 10, color: '#7c92ab', marginBottom: 2 }}>Status</div>
                    <div style={{ fontSize: 13, fontWeight: 800, color }}>
                      {isOverweight ? 'Over' : delta > 0 ? 'Under' : 'On Target'}
                    </div>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
