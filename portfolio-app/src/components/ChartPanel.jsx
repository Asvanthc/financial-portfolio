import React from 'react'
import { Pie, Bar, Line } from 'react-chartjs-2'
import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
  Legend,
  CategoryScale,
  LinearScale,
  BarElement,
  PointElement,
  LineElement
} from 'chart.js'

ChartJS.register(ArcElement, Tooltip, Legend, CategoryScale, LinearScale, BarElement, PointElement, LineElement)

export function ChartPanel({ title, type = 'pie', labels = [], values = [] }) {
  const palette = ['#4f46e5','#06b6d4','#22c55e','#f59e0b','#ef4444','#a855f7','#14b8a6','#eab308','#f97316','#3b82f6']
  const data = {
    labels,
    datasets: [
      {
        label: title,
        data: values,
        backgroundColor: labels.map((_, i) => palette[i % palette.length]),
        borderColor: '#0b1220',
      },
    ],
  }

  const options = { plugins: { legend: { labels: { color: '#cbd5e1' } } }, scales: { x: { ticks: { color: '#94a3b8' } }, y: { ticks: { color: '#94a3b8' } } } }

  return (
    <div className="card">
      <h3 style={{marginTop:0}}>{title}</h3>
      {type === 'pie' && <Pie data={data} />}
      {type === 'bar' && <Bar data={data} options={options} />}
      {type === 'line' && <Line data={data} options={options} />}
    </div>
  )
}
