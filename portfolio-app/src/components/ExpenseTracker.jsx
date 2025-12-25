import React, { useState, useEffect } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend } from 'chart.js'
import { Bar, Line, Doughnut } from 'react-chartjs-2'
import { api } from '../api'

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, ArcElement, Title, Tooltip, Legend)

export default function ExpenseTracker({ expenses = [], onUpdate }) {
  const [newEntry, setNewEntry] = useState({ type: 'expense', category: '', amount: '', month: '', year: new Date().getFullYear(), description: '' })
  const [newCategory, setNewCategory] = useState('')
  const [categories, setCategories] = useState(['Food', 'Transport', 'Entertainment', 'Bills', 'Healthcare', 'Shopping', 'Salary', 'Investment Returns', 'Freelance', 'Other'])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [saving, setSaving] = useState(false)

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  // Calculate totals
  const calculateTotals = (filterYear = null, filterMonth = null) => {
    const filtered = expenses.filter(e => {
      const matchYear = !filterYear || e.year === filterYear
      const matchMonth = !filterMonth || e.month === filterMonth
      return matchYear && matchMonth
    })
    
    const income = filtered.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0)
    const expense = filtered.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0)
    return { income, expense, balance: income - expense }
  }

  const monthlyTotal = calculateTotals(selectedYear, selectedMonth)
  const yearlyTotal = calculateTotals(selectedYear)
  const overallTotal = calculateTotals()

  // Category breakdown
  const getCategoryBreakdown = (type) => {
    const filtered = expenses.filter(e => e.type === type && e.year === selectedYear && e.month === selectedMonth)
    const breakdown = {}
    filtered.forEach(e => {
      breakdown[e.category] = (breakdown[e.category] || 0) + Number(e.amount)
    })
    return breakdown
  }

  const expenseBreakdown = getCategoryBreakdown('expense')
  const incomeBreakdown = getCategoryBreakdown('income')

  // Monthly trend data
  const getMonthlyTrend = () => {
    const monthlyData = months.map((_, idx) => {
      const monthNum = idx + 1
      const monthExpenses = expenses.filter(e => e.year === selectedYear && e.month === monthNum)
      const income = monthExpenses.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0)
      const expense = monthExpenses.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0)
      return { income, expense, savings: income - expense }
    })
    return monthlyData
  }

  const monthlyTrend = getMonthlyTrend()

  const addEntry = async () => {
    if (!newEntry.category || !newEntry.amount || !newEntry.month) {
      alert('Please fill in category, amount, and month')
      return
    }
    setSaving(true)
    try {
      const entry = { ...newEntry, amount: Number(newEntry.amount), month: Number(newEntry.month), year: Number(newEntry.year) }
      await api.addExpense(entry)
      setNewEntry({ type: 'expense', category: '', amount: '', month: '', year: new Date().getFullYear(), description: '' })
      await onUpdate?.()
    } catch (error) {
      console.error('Failed to add expense:', error)
      alert('Failed to add expense. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const deleteEntry = async (id) => {
    if (confirm('Delete this entry?')) {
      try {
        await api.deleteExpense(id)
        await onUpdate?.()
      } catch (error) {
        console.error('Failed to delete expense:', error)
        alert('Failed to delete expense. Please try again.')
      }
    }
  }

  const addCategory = () => {
    if (newCategory && !categories.includes(newCategory)) {
      setCategories([...categories, newCategory])
      setNewCategory('')
    }
  }

  // Chart data
  const trendChartData = {
    labels: months,
    datasets: [
      { label: 'Income', data: monthlyTrend.map(m => m.income), borderColor: '#22c55e', backgroundColor: 'rgba(34, 197, 94, 0.1)', tension: 0.4 },
      { label: 'Expense', data: monthlyTrend.map(m => m.expense), borderColor: '#ef4444', backgroundColor: 'rgba(239, 68, 68, 0.1)', tension: 0.4 },
      { label: 'Savings', data: monthlyTrend.map(m => m.savings), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)', tension: 0.4 }
    ]
  }

  const expenseDoughnutData = {
    labels: Object.keys(expenseBreakdown),
    datasets: [{
      data: Object.values(expenseBreakdown),
      backgroundColor: ['#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9'],
      borderWidth: 2,
      borderColor: '#0a1018'
    }]
  }

  const incomeDoughnutData = {
    labels: Object.keys(incomeBreakdown),
    datasets: [{
      data: Object.values(incomeBreakdown),
      backgroundColor: ['#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9', '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef'],
      borderWidth: 2,
      borderColor: '#0a1018'
    }]
  }

  return (
    <div>
      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(34,197,94,0.3)' }}>
          <div style={{ fontSize: 11, color: '#86efac', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>💰 Total Income</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#22c55e' }}>₹{overallTotal.income.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#86efac', marginTop: 6 }}>Year: ₹{yearlyTotal.income.toLocaleString()}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>💸 Total Expense</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444' }}>₹{overallTotal.expense.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 6 }}>Year: ₹{yearlyTotal.expense.toLocaleString()}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(59,130,246,0.3)' }}>
          <div style={{ fontSize: 11, color: '#93c5fd', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>💎 Net Savings</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: overallTotal.balance >= 0 ? '#3b82f6' : '#ef4444' }}>
            {overallTotal.balance >= 0 ? '+' : ''}₹{overallTotal.balance.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 6 }}>Year: ₹{yearlyTotal.balance.toLocaleString()}</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap' }}>
        <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={{ padding: '10px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={{ padding: '10px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
          {months.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
        </select>
        <div style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #22c55e, #16a34a)', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 14 }}>
          {months[selectedMonth - 1]} {selectedYear}: Income ₹{monthlyTotal.income.toLocaleString()} | Expense ₹{monthlyTotal.expense.toLocaleString()} | Balance ₹{monthlyTotal.balance.toLocaleString()}
        </div>
      </div>

      {/* Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(400px, 1fr))', gap: 24, marginBottom: 32 }}>
        <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            📈 Monthly Trend ({selectedYear})
          </h3>
          <Line data={trendChartData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { labels: { color: '#94a3b8', font: { size: 12, weight: '600' } } } }, scales: { x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } }, y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } } } }} />
        </div>
        
        {Object.keys(expenseBreakdown).length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              💸 Expense Categories ({months[selectedMonth - 1]})
            </h3>
            <Doughnut data={expenseDoughnutData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11, weight: '600' }, padding: 12 } } } }} />
          </div>
        )}
        
        {Object.keys(incomeBreakdown).length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              💰 Income Sources ({months[selectedMonth - 1]})
            </h3>
            <Doughnut data={incomeDoughnutData} options={{ responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'right', labels: { color: '#94a3b8', font: { size: 11, weight: '600' }, padding: 12 } } } }} />
          </div>
        )}
      </div>

      {/* Category Statistics for Selected Month */}
      {(Object.keys(expenseBreakdown).length > 0 || Object.keys(incomeBreakdown).length > 0) && (
        <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.05)), #0f1724', padding: 24, borderRadius: 14, border: '2px solid rgba(139,92,246,0.3)', marginBottom: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            📊 Category Breakdown - {months[selectedMonth - 1]} {selectedYear}
          </h3>
          
          {Object.keys(expenseBreakdown).length > 0 && (
            <div style={{ marginBottom: 24 }}>
              <h4 style={{ color: '#fca5a5', fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                💸 Expense Categories
              </h4>
              <div style={{ display: 'grid', gap: 12 }}>
                {Object.entries(expenseBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => {
                    const percentage = ((amt / monthlyTotal.expense) * 100).toFixed(1)
                    return (
                      <div key={cat} style={{ background: 'rgba(239,68,68,0.08)', padding: '14px 18px', borderRadius: 10, border: '1px solid rgba(239,68,68,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}>
                        <div>
                          <div style={{ color: '#e6e9ef', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{cat}</div>
                          <div style={{ fontSize: 11, color: '#fca5a5', fontWeight: 500 }}>{percentage}% of total expenses</div>
                        </div>
                        <div style={{ color: '#ef4444', fontWeight: 800, fontSize: 18 }}>₹{amt.toLocaleString()}</div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}

          {Object.keys(incomeBreakdown).length > 0 && (
            <div>
              <h4 style={{ color: '#86efac', fontSize: 16, fontWeight: 700, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
                💰 Income Sources
              </h4>
              <div style={{ display: 'grid', gap: 12 }}>
                {Object.entries(incomeBreakdown)
                  .sort((a, b) => b[1] - a[1])
                  .map(([cat, amt]) => {
                    const percentage = ((amt / monthlyTotal.income) * 100).toFixed(1)
                    return (
                      <div key={cat} style={{ background: 'rgba(34,197,94,0.08)', padding: '14px 18px', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', transition: 'all 0.2s', cursor: 'pointer' }}
                        onMouseEnter={e => e.currentTarget.style.transform = 'translateX(4px)'}
                        onMouseLeave={e => e.currentTarget.style.transform = 'translateX(0)'}>
                        <div>
                          <div style={{ color: '#e6e9ef', fontWeight: 600, fontSize: 14, marginBottom: 4 }}>{cat}</div>
                          <div style={{ fontSize: 11, color: '#86efac', fontWeight: 500 }}>{percentage}% of total income</div>
                        </div>
                        <div style={{ color: '#22c55e', fontWeight: 800, fontSize: 18 }}>₹{amt.toLocaleString()}</div>
                      </div>
                    )
                  })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Add Entry Form */}
      <div style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.12), rgba(59,130,246,0.08)), #0f1724', padding: 28, borderRadius: 14, border: '2px solid rgba(99,102,241,0.4)', marginBottom: 24, boxShadow: '0 4px 20px rgba(99,102,241,0.15)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          ➕ Add New Entry
        </h3>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 16 }}>
          <select value={newEntry.type} onChange={e => setNewEntry({ ...newEntry, type: e.target.value })} style={{ padding: '12px 14px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
            <option value="expense">💸 Expense</option>
            <option value="income">💰 Income</option>
          </select>
          <select value={newEntry.category} onChange={e => setNewEntry({ ...newEntry, category: e.target.value })} style={{ padding: '12px 14px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s' }}>
            <option value="">Select Category</option>
            {categories.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <input type="number" placeholder="Amount (₹)" value={newEntry.amount} onChange={e => setNewEntry({ ...newEntry, amount: e.target.value })} style={{ padding: '12px 14px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }} />
          <select value={newEntry.month} onChange={e => setNewEntry({ ...newEntry, month: e.target.value })} style={{ padding: '12px 14px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}>
            <option value="">Select Month</option>
            {months.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
          </select>
          <input type="number" placeholder="Year" value={newEntry.year} onChange={e => setNewEntry({ ...newEntry, year: e.target.value })} style={{ padding: '12px 14px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }} />
          <input type="text" placeholder="Description (optional)" value={newEntry.description} onChange={e => setNewEntry({ ...newEntry, description: e.target.value })} style={{ padding: '12px 14px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600, gridColumn: 'span 2' }} />
        </div>
        <button onClick={addEntry} disabled={saving} style={{ padding: '14px 32px', background: saving ? '#64748b' : 'linear-gradient(135deg, #22c55e, #16a34a)', color: 'white', border: 'none', borderRadius: 10, fontSize: 15, fontWeight: 700, cursor: saving ? 'not-allowed' : 'pointer', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(34,197,94,0.3)', opacity: saving ? 0.6 : 1 }}
          onMouseEnter={e => !saving && (e.currentTarget.style.transform = 'translateY(-2px)')}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
          {saving ? '💾 Saving...' : '✨ Add Entry'}
        </button>
      </div>

      {/* Add Category */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 20, borderRadius: 10, border: '2px solid #1e293b', marginBottom: 24, display: 'flex', gap: 14, alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
        <div style={{ flex: 1 }}>
          <input type="text" placeholder="➕ Add new category name" value={newCategory} onChange={e => setNewCategory(e.target.value)} 
            onKeyPress={e => e.key === 'Enter' && addCategory()}
            style={{ width: '100%', padding: '12px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }} />
        </div>
        <button onClick={addCategory} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
          Add Category
        </button>
      </div>

      {/* Recent Entries */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>📋 Recent Entries</h3>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '2px solid #2d3f5f' }}>
                <th style={{ padding: 14, textAlign: 'left', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Date</th>
                <th style={{ padding: 14, textAlign: 'left', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Type</th>
                <th style={{ padding: 14, textAlign: 'left', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Category</th>
                <th style={{ padding: 14, textAlign: 'right', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Amount</th>
                <th style={{ padding: 14, textAlign: 'left', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Description</th>
                <th style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {expenses.length > 0 ? expenses.slice().reverse().slice(0, 20).map(e => (
                <tr key={e.id} style={{ borderBottom: '1px solid #1e293b', transition: 'all 0.2s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <td style={{ padding: 14, color: '#cbd5e1', fontSize: 13, fontWeight: 500 }}>{months[e.month - 1]?.substring(0, 3)} {e.year}</td>
                  <td style={{ padding: 14 }}>
                    <span style={{ 
                      padding: '5px 12px', 
                      borderRadius: 6, 
                      fontSize: 12, 
                      fontWeight: 700,
                      background: e.type === 'income' ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)',
                      color: e.type === 'income' ? '#22c55e' : '#ef4444',
                      border: `1px solid ${e.type === 'income' ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)'}`
                    }}>
                      {e.type === 'income' ? '💰 Income' : '💸 Expense'}
                    </span>
                  </td>
                  <td style={{ padding: 14, color: '#e6e9ef', fontSize: 14, fontWeight: 600 }}>{e.category}</td>
                  <td style={{ padding: 14, textAlign: 'right', color: e.type === 'income' ? '#22c55e' : '#ef4444', fontSize: 15, fontWeight: 800 }}>
                    {e.type === 'income' ? '+' : '-'}₹{Number(e.amount).toLocaleString()}
                  </td>
                  <td style={{ padding: 14, color: '#94a3b8', fontSize: 13 }}>{e.description || '—'}</td>
                  <td style={{ padding: 14, textAlign: 'center' }}>
                    <button onClick={() => deleteEntry(e.id)} style={{ padding: '8px 16px', background: 'linear-gradient(135deg, #ef4444, #dc2626)', color: 'white', border: 'none', borderRadius: 6, fontSize: 12, fontWeight: 700, cursor: 'pointer', transition: 'all 0.2s', boxShadow: '0 2px 8px rgba(239,68,68,0.3)' }}
                      onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
                      onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
                      🗑️ Delete
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan="6" style={{ padding: 40, textAlign: 'center', color: '#64748b', fontSize: 14 }}>
                    No entries yet. Add your first income or expense above! 📊
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
