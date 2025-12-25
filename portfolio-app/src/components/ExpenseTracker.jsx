import React, { useState, useEffect } from 'react'
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js'
import { Bar } from 'react-chartjs-2'
import { api } from '../api'

ChartJS.register(CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend)

export default function ExpenseTracker({ expenses = [], onUpdate }) {
  const [newEntry, setNewEntry] = useState({ type: 'expense', category: '', amount: '', month: '', year: new Date().getFullYear(), description: '' })
  const [newCategory, setNewCategory] = useState('')
  const [categoryType, setCategoryType] = useState('expense')
  const [expenseCategories, setExpenseCategories] = useState(['Food', 'Transport', 'Entertainment', 'Bills', 'Healthcare', 'Shopping', 'Other'])
  const [incomeCategories, setIncomeCategories] = useState(['Salary', 'Investment Returns', 'Freelance', 'Other'])
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear())
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1)
  const [saving, setSaving] = useState(false)
  const [filterMode, setFilterMode] = useState('month') // 'month' or 'range'
  const [rangePreset, setRangePreset] = useState('custom') // 'custom', 'last3months', 'last6months', 'thisyear', 'lastyear'
  const [rangeStart, setRangeStart] = useState('')
  const [rangeEnd, setRangeEnd] = useState('')

  // Load categories on mount
  useEffect(() => {
    loadCategories()
  }, [])

  // Calculate range from preset
  useEffect(() => {
    if (filterMode === 'range' && rangePreset !== 'custom') {
      const now = new Date()
      const currentYear = now.getFullYear()
      const currentMonth = now.getMonth() + 1
      
      switch (rangePreset) {
        case 'last3months':
          const m3 = new Date(currentYear, currentMonth - 4, 1)
          setRangeStart(`${m3.getFullYear()}-${String(m3.getMonth() + 1).padStart(2, '0')}`)
          setRangeEnd(`${currentYear}-${String(currentMonth).padStart(2, '0')}`)
          break
        case 'last6months':
          const m6 = new Date(currentYear, currentMonth - 7, 1)
          setRangeStart(`${m6.getFullYear()}-${String(m6.getMonth() + 1).padStart(2, '0')}`)
          setRangeEnd(`${currentYear}-${String(currentMonth).padStart(2, '0')}`)
          break
        case 'thisyear':
          setRangeStart(`${currentYear}-01`)
          setRangeEnd(`${currentYear}-${String(currentMonth).padStart(2, '0')}`)
          break
        case 'lastyear':
          setRangeStart(`${currentYear - 1}-01`)
          setRangeEnd(`${currentYear - 1}-12`)
          break
      }
    }
  }, [filterMode, rangePreset])

  const loadCategories = async () => {
    try {
      const cats = await api.getCategories()
      if (cats.expense?.length > 0) setExpenseCategories(cats.expense)
      if (cats.income?.length > 0) setIncomeCategories(cats.income)
    } catch (error) {
      console.error('Failed to load categories:', error)
    }
  }

  const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
  const currentYear = new Date().getFullYear()
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i)

  // Helper: Convert year-month to date for range comparison
  const dateToComparable = (year, month) => year * 100 + month

  // Calculate totals with range filter
  const calculateTotals = (filterYear = null, filterMonth = null, useRange = false) => {
    const filtered = expenses.filter(e => {
      if (useRange && rangeStart && rangeEnd) {
        const [startYear, startMonth] = rangeStart.split('-').map(Number)
        const [endYear, endMonth] = rangeEnd.split('-').map(Number)
        const eDate = dateToComparable(e.year, e.month)
        const startDate = dateToComparable(startYear, startMonth)
        const endDate = dateToComparable(endYear, endMonth)
        return eDate >= startDate && eDate <= endDate
      }
      const matchYear = !filterYear || e.year === filterYear
      const matchMonth = !filterMonth || e.month === filterMonth
      return matchYear && matchMonth
    })
    
    const income = filtered.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0)
    const expense = filtered.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0)
    return { income, expense, balance: income - expense }
  }

  const monthlyTotal = filterMode === 'range' ? calculateTotals(null, null, true) : calculateTotals(selectedYear, selectedMonth)
  const yearlyTotal = filterMode === 'range' ? calculateTotals(null, null, true) : calculateTotals(selectedYear)
  const overallTotal = calculateTotals()

  // Category breakdown with range support
  const getCategoryBreakdown = (type) => {
    let filtered
    if (filterMode === 'range' && rangeStart && rangeEnd) {
      const [startYear, startMonth] = rangeStart.split('-').map(Number)
      const [endYear, endMonth] = rangeEnd.split('-').map(Number)
      filtered = expenses.filter(e => {
        const eDate = dateToComparable(e.year, e.month)
        const startDate = dateToComparable(startYear, startMonth)
        const endDate = dateToComparable(endYear, endMonth)
        return e.type === type && eDate >= startDate && eDate <= endDate
      })
    } else {
      filtered = expenses.filter(e => e.type === type && e.year === selectedYear && e.month === selectedMonth)
    }
    const breakdown = {}
    filtered.forEach(e => {
      breakdown[e.category] = (breakdown[e.category] || 0) + Number(e.amount)
    })
    return breakdown
  }

  const expenseBreakdown = getCategoryBreakdown('expense')
  const incomeBreakdown = getCategoryBreakdown('income')

  // Monthly trend data with range support
  const getMonthlyTrend = () => {
    if (filterMode === 'range' && rangeStart && rangeEnd) {
      const [startYear, startMonth] = rangeStart.split('-').map(Number)
      const [endYear, endMonth] = rangeEnd.split('-').map(Number)
      const monthlyData = []
      
      let currentYear = startYear, currentMonth = startMonth
      while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        const monthExpenses = expenses.filter(e => e.year === currentYear && e.month === currentMonth)
        const income = monthExpenses.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0)
        const expense = monthExpenses.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0)
        monthlyData.push({ income, expense, savings: income - expense })
        
        currentMonth++
        if (currentMonth > 12) { currentMonth = 1; currentYear++ }
      }
      return monthlyData
    } else {
      const monthlyData = months.map((_, idx) => {
        const monthNum = idx + 1
        const monthExpenses = expenses.filter(e => e.year === selectedYear && e.month === monthNum)
        const income = monthExpenses.filter(e => e.type === 'income').reduce((sum, e) => sum + Number(e.amount), 0)
        const expense = monthExpenses.filter(e => e.type === 'expense').reduce((sum, e) => sum + Number(e.amount), 0)
        return { income, expense, savings: income - expense }
      })
      return monthlyData
    }
  }

  const monthlyTrend = getMonthlyTrend()
  const trendLabels = filterMode === 'range' && rangeStart && rangeEnd ? 
    (() => {
      const [startYear, startMonth] = rangeStart.split('-').map(Number)
      const [endYear, endMonth] = rangeEnd.split('-').map(Number)
      const labels = []
      let currentYear = startYear, currentMonth = startMonth
      while (currentYear < endYear || (currentYear === endYear && currentMonth <= endMonth)) {
        labels.push(`${months[currentMonth - 1].substring(0, 3)} '${String(currentYear).substring(2)}`)
        currentMonth++
        if (currentMonth > 12) { currentMonth = 1; currentYear++ }
      }
      return labels
    })() : months

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

  const addCategory = async () => {
    if (!newCategory) return
    try {
      const type = categoryType || 'expense'
      const cats = type === 'income' ? incomeCategories : expenseCategories
      if (!cats.includes(newCategory)) {
        await api.addCategory(type, newCategory)
        if (type === 'income') {
          setIncomeCategories([...cats, newCategory])
        } else {
          setExpenseCategories([...cats, newCategory])
        }
      }
      setNewCategory('')
    } catch (error) {
      console.error('Failed to add category:', error)
      alert('Failed to add category')
    }
  }

  const deleteCategory = async (type, name) => {
    if (!confirm(`Delete category "${name}"?`)) return
    try {
      await api.deleteCategory(type, name)
      if (type === 'income') {
        setIncomeCategories(incomeCategories.filter(c => c !== name))
      } else {
        setExpenseCategories(expenseCategories.filter(c => c !== name))
      }
    } catch (error) {
      console.error('Failed to delete category:', error)
      alert('Failed to delete category')
    }
  }

  // Inferential Chart Data
  
  // Savings Rate Over Time
  const savingsRateData = {
    labels: trendLabels,
    datasets: [{
      label: 'Savings Rate %',
      data: monthlyTrend.map(m => m.income > 0 ? ((m.savings / m.income) * 100).toFixed(1) : 0),
      backgroundColor: monthlyTrend.map(m => m.savings >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
      borderColor: monthlyTrend.map(m => m.savings >= 0 ? '#22c55e' : '#ef4444'),
      borderWidth: 2
    }]
  }

  // Top Expense Categories (Bar Chart)
  const topExpenseCategories = Object.entries(expenseBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  
  const expenseCategoryBarData = {
    labels: topExpenseCategories.map(([cat]) => cat),
    datasets: [{
      label: 'Expense Amount (₹)',
      data: topExpenseCategories.map(([, amt]) => amt),
      backgroundColor: 'rgba(239, 68, 68, 0.7)',
      borderColor: '#ef4444',
      borderWidth: 2
    }]
  }

  // Income vs Expense Comparison (Bar Chart)
  const incomeVsExpenseData = {
    labels: trendLabels,
    datasets: [
      {
        label: 'Income',
        data: monthlyTrend.map(m => m.income),
        backgroundColor: 'rgba(34, 197, 94, 0.7)',
        borderColor: '#22c55e',
        borderWidth: 2
      },
      {
        label: 'Expense',
        data: monthlyTrend.map(m => m.expense),
        backgroundColor: 'rgba(239, 68, 68, 0.7)',
        borderColor: '#ef4444',
        borderWidth: 2
      }
    ]
  }

  // Expense Ratio Analysis - % of income consumed by each category (REPLACES Top Income Sources)
  const totalIncomeForRatio = filterMode === 'range' && rangeStart && rangeEnd ? monthlyTotal.income : monthlyTotal.income
  
  const expenseRatioData = Object.entries(expenseBreakdown)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([cat, amt]) => ({
      category: cat,
      amount: amt,
      percentOfIncome: totalIncomeForRatio > 0 ? ((amt / totalIncomeForRatio) * 100).toFixed(1) : 0
    }))

  const expenseRatioChartData = {
    labels: expenseRatioData.map(d => d.category),
    datasets: [{
      label: '% of Income',
      data: expenseRatioData.map(d => d.percentOfIncome),
      backgroundColor: [
        'rgba(239, 68, 68, 0.7)',
        'rgba(249, 115, 22, 0.7)',
        'rgba(245, 158, 11, 0.7)',
        'rgba(234, 179, 8, 0.7)',
        'rgba(132, 204, 22, 0.7)',
        'rgba(34, 197, 94, 0.7)',
        'rgba(16, 185, 129, 0.7)',
        'rgba(20, 184, 166, 0.7)'
      ],
      borderColor: [
        '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16', '#22c55e', '#10b981', '#14b8a6'
      ],
      borderWidth: 2
    }]
  }

  // Cumulative Cash Flow
  let cumulativeCashFlow = 0
  const cumulativeFlowData = {
    labels: trendLabels,
    datasets: [{
      label: 'Cumulative Cash Flow (₹)',
      data: monthlyTrend.map(m => {
        cumulativeCashFlow += m.savings
        return cumulativeCashFlow
      }),
      backgroundColor: monthlyTrend.map((m, idx) => {
        const cumulative = monthlyTrend.slice(0, idx + 1).reduce((sum, month) => sum + month.savings, 0)
        return cumulative >= 0 ? 'rgba(34, 197, 94, 0.7)' : 'rgba(239, 68, 68, 0.7)'
      }),
      borderColor: '#3b82f6',
      borderWidth: 2
    }]
  }

  // Financial Runway - How many months can savings sustain current expenses
  const avgMonthlyExpense = monthlyTrend.reduce((sum, m) => sum + m.expense, 0) / monthlyTrend.filter(m => m.expense > 0).length || 1
  const avgMonthlyIncome = monthlyTrend.reduce((sum, m) => sum + m.income, 0) / monthlyTrend.filter(m => m.income > 0).length || 1
  const avgMonthlySavings = avgMonthlyIncome - avgMonthlyExpense
  const totalSavings = overallTotal.balance
  const runwayMonths = avgMonthlyExpense > 0 ? (totalSavings / avgMonthlyExpense).toFixed(1) : 0
  const runwayColor = runwayMonths >= 6 ? '#22c55e' : runwayMonths >= 3 ? '#f59e0b' : '#ef4444'

  // Expense Stability Score - Coefficient of Variation (lower is more stable)
  const expenseValues = monthlyTrend.map(m => m.expense).filter(e => e > 0)
  const expenseMean = expenseValues.reduce((sum, val) => sum + val, 0) / expenseValues.length || 1
  const expenseStdDev = Math.sqrt(expenseValues.reduce((sum, val) => sum + Math.pow(val - expenseMean, 2), 0) / expenseValues.length)
  const expenseCV = (expenseStdDev / expenseMean) * 100
  const stabilityScore = Math.max(0, 100 - expenseCV).toFixed(0)
  const stabilityColor = stabilityScore >= 70 ? '#22c55e' : stabilityScore >= 50 ? '#f59e0b' : '#ef4444'

  // Expense Concentration Analysis (REPLACES Income Concentration since you have single income)
  const totalExpenseAmount = Object.values(expenseBreakdown).reduce((sum, amt) => sum + amt, 0)
  const expenseConcentration = Object.entries(expenseBreakdown).map(([cat, amt]) => ({
    category: cat,
    percentage: totalExpenseAmount > 0 ? ((amt / totalExpenseAmount) * 100).toFixed(1) : 0,
    amount: amt
  })).sort((a, b) => b.percentage - a.percentage)
  
  const topExpenseSource = expenseConcentration[0]
  const expenseConcentrationRisk = topExpenseSource ? parseFloat(topExpenseSource.percentage) : 0
  const expenseConcentrationColor = expenseConcentrationRisk < 40 ? '#22c55e' : expenseConcentrationRisk < 60 ? '#f59e0b' : '#ef4444'
  const expenseConcentrationRating = expenseConcentrationRisk < 40 ? 'Well Balanced' : expenseConcentrationRisk < 60 ? 'Moderate Concentration' : 'Highly Concentrated'

  // Expense Category Trends (comparing current period to overall average)
  const overallExpenseBreakdown = {}
  expenses.filter(e => e.type === 'expense').forEach(e => {
    overallExpenseBreakdown[e.category] = (overallExpenseBreakdown[e.category] || 0) + Number(e.amount)
  })
  const overallExpenseTotal = Object.values(overallExpenseBreakdown).reduce((sum, amt) => sum + amt, 0)
  
  const categoryTrendAnalysis = Object.keys(expenseBreakdown).map(cat => {
    const currentAmount = expenseBreakdown[cat]
    const overallAmount = overallExpenseBreakdown[cat] || 0
    const currentPercentage = monthlyTotal.expense > 0 ? (currentAmount / monthlyTotal.expense) * 100 : 0
    const overallPercentage = overallExpenseTotal > 0 ? (overallAmount / overallExpenseTotal) * 100 : 0
    const variance = currentPercentage - overallPercentage
    
    return {
      category: cat,
      currentPct: currentPercentage.toFixed(1),
      overallPct: overallPercentage.toFixed(1),
      variance: variance.toFixed(1),
      trend: variance > 5 ? '⬆️ Increasing' : variance < -5 ? '⬇️ Decreasing' : '➡️ Stable'
    }
  }).sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance))

  return (
    <div>
      {/* Filter Mode Selection */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 24, alignItems: 'center', flexWrap: 'wrap', background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 16, borderRadius: 12, border: '2px solid #1e293b' }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: '#e6e9ef' }}>📅 View Mode:</div>
        <button 
          onClick={() => setFilterMode('month')}
          style={{ 
            padding: '10px 20px', 
            borderRadius: 8, 
            border: 'none', 
            fontSize: 14, 
            fontWeight: 700, 
            cursor: 'pointer',
            background: filterMode === 'month' ? 'linear-gradient(135deg, #3b82f6, #2563eb)' : '#1e293b',
            color: filterMode === 'month' ? 'white' : '#94a3b8',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          📆 Month View
        </button>
        <button 
          onClick={() => setFilterMode('range')}
          style={{ 
            padding: '10px 20px', 
            borderRadius: 8, 
            border: 'none', 
            fontSize: 14, 
            fontWeight: 700, 
            cursor: 'pointer',
            background: filterMode === 'range' ? 'linear-gradient(135deg, #8b5cf6, #7c3aed)' : '#1e293b',
            color: filterMode === 'range' ? 'white' : '#94a3b8',
            transition: 'all 0.2s'
          }}
          onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}
        >
          📊 Range View
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(34,197,94,0.3)' }}>
          <div style={{ fontSize: 11, color: '#86efac', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>
            💰 {filterMode === 'range' ? 'Range Income' : `${months[selectedMonth - 1]} Income`}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#22c55e' }}>₹{monthlyTotal.income.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#86efac', marginTop: 6 }}>Overall Gross: ₹{overallTotal.income.toLocaleString()}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(239,68,68,0.15), rgba(239,68,68,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(239,68,68,0.3)' }}>
          <div style={{ fontSize: 11, color: '#fca5a5', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>
            💸 {filterMode === 'range' ? 'Range Expense' : `${months[selectedMonth - 1]} Expense`}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#ef4444' }}>₹{monthlyTotal.expense.toLocaleString()}</div>
          <div style={{ fontSize: 12, color: '#fca5a5', marginTop: 6 }}>Overall Gross: ₹{overallTotal.expense.toLocaleString()}</div>
        </div>
        <div style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.15), rgba(59,130,246,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(59,130,246,0.3)' }}>
          <div style={{ fontSize: 11, color: '#93c5fd', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>
            💎 {filterMode === 'range' ? 'Range Savings' : `${months[selectedMonth - 1]} Savings`}
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: monthlyTotal.balance >= 0 ? '#3b82f6' : '#ef4444' }}>
            {monthlyTotal.balance >= 0 ? '+' : ''}₹{monthlyTotal.balance.toLocaleString()}
          </div>
          <div style={{ fontSize: 12, color: '#93c5fd', marginTop: 6 }}>Overall Gross: ₹{overallTotal.balance.toLocaleString()}</div>
        </div>
      </div>

      {/* Financial Health Indicators */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div style={{ background: `linear-gradient(135deg, ${runwayColor === '#22c55e' ? 'rgba(34,197,94,0.15)' : runwayColor === '#f59e0b' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}, rgba(0,0,0,0.05)), #0f1724`, padding: 20, borderRadius: 12, border: `2px solid ${runwayColor}40`, boxShadow: `0 4px 16px ${runwayColor}30` }}>
          <div style={{ fontSize: 11, color: runwayColor, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            ⏱️ Financial Runway
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: runwayColor }}>{runwayMonths}</div>
          <div style={{ fontSize: 13, color: runwayColor, marginTop: 6, fontWeight: 600 }}>
            months of expenses covered
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            Based on avg monthly expense of ₹{avgMonthlyExpense.toLocaleString()}
          </div>
        </div>

        <div style={{ background: `linear-gradient(135deg, ${stabilityColor === '#22c55e' ? 'rgba(34,197,94,0.15)' : stabilityColor === '#f59e0b' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}, rgba(0,0,0,0.05)), #0f1724`, padding: 20, borderRadius: 12, border: `2px solid ${stabilityColor}40`, boxShadow: `0 4px 16px ${stabilityColor}30` }}>
          <div style={{ fontSize: 11, color: stabilityColor, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            📊 Expense Stability Score
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: stabilityColor }}>{stabilityScore}/100</div>
          <div style={{ fontSize: 13, color: stabilityColor, marginTop: 6, fontWeight: 600 }}>
            {stabilityScore >= 70 ? 'Highly Consistent' : stabilityScore >= 50 ? 'Moderately Stable' : 'Volatile Spending'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            Lower variation = better budget control
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.15), rgba(139,92,246,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(139,92,246,0.3)', boxShadow: '0 4px 16px rgba(139,92,246,0.3)' }}>
          <div style={{ fontSize: 11, color: '#c4b5fd', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            📈 Avg Monthly Savings
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: avgMonthlySavings >= 0 ? '#a78bfa' : '#ef4444' }}>
            {avgMonthlySavings >= 0 ? '+' : ''}₹{avgMonthlySavings.toLocaleString()}
          </div>
          <div style={{ fontSize: 13, color: '#c4b5fd', marginTop: 6, fontWeight: 600 }}>
            {avgMonthlyIncome > 0 ? `${((avgMonthlySavings / avgMonthlyIncome) * 100).toFixed(1)}% savings rate` : 'No data'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            Target: 20-30% for healthy finances
          </div>
        </div>

        <div style={{ background: `linear-gradient(135deg, ${concentrationColor === '#22c55e' ? 'rgba(34,197,94,0.15)' : concentrationColor === '#f59e0b' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)'}, rgba(0,0,0,0.05)), #0f1724`, padding: 20, borderRadius: 12, border: `2px solid ${concentrationColor}40`, boxShadow: `0 4px 16px ${concentrationColor}30` }}>
          <div style={{ fontSize: 11, color: concentrationColor, marginBottom: 8, fontWeight: 700, textTransform: 'uppercase', display: 'flex', alignItems: 'center', gap: 6 }}>
            🎯 Income Concentration
          </div>
          <div style={{ fontSize: 32, fontWeight: 900, color: concentrationColor }}>{concentrationRisk}%</div>
          <div style={{ fontSize: 13, color: concentrationColor, marginTop: 6, fontWeight: 600 }}>
            {concentrationRating}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            {topIncomeSource ? `Top source: ${topIncomeSource.category}` : 'No income data'}
          </div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display: 'flex', gap: 16, marginBottom: 24, flexWrap: 'wrap', alignItems: 'center' }}>
        {filterMode === 'month' ? (
          <>
            <select value={selectedYear} onChange={e => setSelectedYear(Number(e.target.value))} style={{ padding: '10px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
            <select value={selectedMonth} onChange={e => setSelectedMonth(Number(e.target.value))} style={{ padding: '10px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
              {months.map((m, idx) => <option key={idx} value={idx + 1}>{m}</option>)}
            </select>
          </>
        ) : (
          <>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#e6e9ef' }}>📊 Range Preset:</div>
            <select 
              value={rangePreset} 
              onChange={e => setRangePreset(e.target.value)}
              style={{ padding: '10px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
            >
              <option value="custom">Custom Range</option>
              <option value="last3months">Last 3 Months</option>
              <option value="last6months">Last 6 Months</option>
              <option value="thisyear">This Year</option>
              <option value="lastyear">Last Year</option>
            </select>
            
            {rangePreset === 'custom' && (
              <>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e6e9ef' }}>📍 Start:</div>
                <input 
                  type="month" 
                  value={rangeStart}
                  onChange={e => setRangeStart(e.target.value)}
                  style={{ padding: '10px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                />
                <div style={{ fontSize: 14, fontWeight: 700, color: '#e6e9ef' }}>📍 End:</div>
                <input 
                  type="month" 
                  value={rangeEnd}
                  onChange={e => setRangeEnd(e.target.value)}
                  style={{ padding: '10px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600, cursor: 'pointer' }}
                />
              </>
            )}
            
            {rangeStart && rangeEnd && (
              <div style={{ padding: '10px 20px', background: 'linear-gradient(135deg, #8b5cf6, #7c3aed)', borderRadius: 8, color: 'white', fontWeight: 700, fontSize: 14 }}>
                📊 {rangePreset !== 'custom' ? rangePreset.replace(/([A-Z])/g, ' $1').replace(/^./, str => str.toUpperCase()) : 'Custom'}: Income ₹{monthlyTotal.income.toLocaleString()} | Expense ₹{monthlyTotal.expense.toLocaleString()} | Net ₹{monthlyTotal.balance.toLocaleString()}
              </div>
            )}
          </>
        )}
      </div>

      {/* Inferential Charts */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(450px, 1fr))', gap: 24, marginBottom: 32 }}>
        {/* Savings Rate Over Time */}
        <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            📊 Savings Rate Trend {filterMode === 'range' ? '(Range)' : `(${selectedYear})`}
          </h3>
          <Bar data={savingsRateData} options={{ 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { 
              legend: { display: false },
              tooltip: { 
                callbacks: { 
                  label: (context) => `Savings Rate: ${context.parsed.y}%` 
                } 
              } 
            }, 
            scales: { 
              x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } }, 
              y: { ticks: { color: '#64748b', font: { size: 11 }, callback: (value) => value + '%' }, grid: { color: '#1e293b' }, beginAtZero: true } 
            } 
          }} />
        </div>

        {/* Income vs Expense Comparison */}
        <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            📈 Income vs Expense {filterMode === 'range' ? '(Range)' : `(${selectedYear})`}
          </h3>
          <Bar data={incomeVsExpenseData} options={{ 
            responsive: true, 
            maintainAspectRatio: true, 
            plugins: { 
              legend: { labels: { color: '#94a3b8', font: { size: 12, weight: '600' } } } 
            }, 
            scales: { 
              x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } }, 
              y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } } 
            } 
          }} />
        </div>
        
        {/* Top Expense Categories */}
        {Object.keys(expenseBreakdown).length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              💸 Top Expense Categories {filterMode === 'range' ? '(Range)' : `(${months[selectedMonth - 1]})`}
            </h3>
            <Bar data={expenseCategoryBarData} options={{ 
              indexAxis: 'y',
              responsive: true, 
              maintainAspectRatio: true, 
              plugins: { 
                legend: { display: false } 
              }, 
              scales: { 
                x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } }, 
                y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } } 
              } 
            }} />
          </div>
        )}
        
        {/* Top Income Sources */}
        {Object.keys(incomeBreakdown).length > 0 && (
          <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
            <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
              💰 Top Income Sources {filterMode === 'range' ? '(Range)' : `(${months[selectedMonth - 1]})`}
            </h3>
            <Bar data={incomeCategoryBarData} options={{ 
              indexAxis: 'y',
              responsive: true, 
              maintainAspectRatio: true, 
              plugins: { 
                legend: { display: false } 
              }, 
              scales: { 
                x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } }, 
                y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } } 
              } 
            }} />
          </div>
        )}
      </div>

      {/* Month-over-Month Growth Analysis */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          📊 Month-over-Month Growth Rates {filterMode === 'range' ? '(Range)' : `(${selectedYear})`}
        </h3>
        <Bar data={momGrowthData} options={{ 
          responsive: true, 
          maintainAspectRatio: true, 
          plugins: { 
            legend: { labels: { color: '#94a3b8', font: { size: 12, weight: '600' } } },
            tooltip: { 
              callbacks: { 
                label: (context) => `${context.dataset.label}: ${context.parsed.y}%` 
              } 
            }
          }, 
          scales: { 
            x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } }, 
            y: { ticks: { color: '#64748b', font: { size: 11 }, callback: (value) => value + '%' }, grid: { color: '#1e293b' } } 
          } 
        }} />
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(99,102,241,0.08)', borderRadius: 8, border: '1px solid rgba(99,102,241,0.2)' }}>
          <div style={{ fontSize: 12, color: '#c4b5fd', fontWeight: 700, marginBottom: 8 }}>💡 Financial Insights:</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 11, color: '#cbd5e1', lineHeight: 1.8 }}>
            <li>Positive income growth with controlled expense growth = healthy finances</li>
            <li>Income growth slower than expense growth = warning sign</li>
            <li>Negative income growth = consider diversifying income sources</li>
          </ul>
        </div>
      </div>

      {/* Cumulative Cash Flow Waterfall */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', marginBottom: 32 }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
          💰 Cumulative Cash Flow {filterMode === 'range' ? '(Range)' : `(${selectedYear})`}
        </h3>
        <Bar data={cumulativeFlowData} options={{ 
          responsive: true, 
          maintainAspectRatio: true, 
          plugins: { 
            legend: { display: false },
            tooltip: { 
              callbacks: { 
                label: (context) => `Cumulative: ₹${context.parsed.y.toLocaleString()}` 
              } 
            }
          }, 
          scales: { 
            x: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } }, 
            y: { ticks: { color: '#64748b', font: { size: 11 } }, grid: { color: '#1e293b' } } 
          } 
        }} />
        <div style={{ marginTop: 16, padding: 16, background: 'rgba(34,197,94,0.08)', borderRadius: 8, border: '1px solid rgba(34,197,94,0.2)' }}>
          <div style={{ fontSize: 12, color: '#86efac', fontWeight: 700, marginBottom: 8 }}>📊 Cash Flow Pattern:</div>
          <ul style={{ margin: 0, paddingLeft: 20, fontSize: 11, color: '#cbd5e1', lineHeight: 1.8 }}>
            <li>Rising cumulative flow = consistent wealth building</li>
            <li>Flat line = break-even lifestyle (no savings growth)</li>
            <li>Declining flow = burning through savings (action needed)</li>
          </ul>
        </div>
      </div>

      {/* Category Spending Trend Analysis */}
      {categoryTrendAnalysis.length > 0 && (
        <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', boxShadow: '0 4px 20px rgba(0,0,0,0.3)', marginBottom: 32 }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            📈 Category Spending Trends vs Overall Average
          </h3>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid #2d3f5f' }}>
                  <th style={{ padding: 14, textAlign: 'left', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Category</th>
                  <th style={{ padding: 14, textAlign: 'right', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Current %</th>
                  <th style={{ padding: 14, textAlign: 'right', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Overall %</th>
                  <th style={{ padding: 14, textAlign: 'right', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Variance</th>
                  <th style={{ padding: 14, textAlign: 'center', color: '#94a3b8', fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>Trend</th>
                </tr>
              </thead>
              <tbody>
                {categoryTrendAnalysis.slice(0, 8).map((trend, idx) => (
                  <tr key={idx} style={{ borderBottom: '1px solid #1e293b', transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.05)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                    <td style={{ padding: 14, color: '#e6e9ef', fontSize: 13, fontWeight: 600 }}>{trend.category}</td>
                    <td style={{ padding: 14, textAlign: 'right', color: '#22d3ee', fontSize: 13, fontWeight: 700 }}>{trend.currentPct}%</td>
                    <td style={{ padding: 14, textAlign: 'right', color: '#94a3b8', fontSize: 13 }}>{trend.overallPct}%</td>
                    <td style={{ padding: 14, textAlign: 'right', color: Math.abs(trend.variance) > 5 ? (trend.variance > 0 ? '#ef4444' : '#22c55e') : '#94a3b8', fontSize: 13, fontWeight: 700 }}>
                      {trend.variance > 0 ? '+' : ''}{trend.variance}%
                    </td>
                    <td style={{ padding: 14, textAlign: 'center', fontSize: 13 }}>{trend.trend}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ marginTop: 16, padding: 16, background: 'rgba(245,158,11,0.08)', borderRadius: 8, border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ fontSize: 12, color: '#fbbf24', fontWeight: 700, marginBottom: 8 }}>⚠️ What to Watch:</div>
            <ul style={{ margin: 0, paddingLeft: 20, fontSize: 11, color: '#cbd5e1', lineHeight: 1.8 }}>
              <li>Variance &gt;+5%: Spending more than usual in this category</li>
              <li>Variance &lt;-5%: Successfully reducing spending in this category</li>
              <li>Large variances may indicate lifestyle changes or one-time expenses</li>
            </ul>
          </div>
        </div>
      )}

      {/* Category Statistics for Selected Month/Range */}
      {(Object.keys(expenseBreakdown).length > 0 || Object.keys(incomeBreakdown).length > 0) && (
        <div style={{ background: 'linear-gradient(135deg, rgba(139,92,246,0.08), rgba(99,102,241,0.05)), #0f1724', padding: 24, borderRadius: 14, border: '2px solid rgba(139,92,246,0.3)', marginBottom: 32, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
          <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 20, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8 }}>
            📊 Category Breakdown {filterMode === 'range' ? `- ${rangeStart?.split('-')[0]}-${rangeStart?.split('-')[1]} to ${rangeEnd?.split('-')[0]}-${rangeEnd?.split('-')[1]}` : `- ${months[selectedMonth - 1]} ${selectedYear}`}
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
            {(newEntry.type === 'income' ? incomeCategories : expenseCategories).map(c => <option key={c} value={c}>{c}</option>)}
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
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 20, borderRadius: 10, border: '2px solid #1e293b', marginBottom: 24, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14, alignItems: 'center', boxShadow: '0 2px 10px rgba(0,0,0,0.2)' }}>
        <div>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>Category Type</div>
          <select value={categoryType} onChange={e => setCategoryType(e.target.value)} style={{ padding: '12px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }}>
            <option value="expense">💸 Expense</option>
            <option value="income">💰 Income</option>
          </select>
        </div>
        <div style={{ gridColumn: 'span 2' }}>
          <div style={{ fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 700 }}>Category Name</div>
          <input type="text" placeholder="➕ Add new category name" value={newCategory} onChange={e => setNewCategory(e.target.value)} 
            onKeyPress={e => e.key === 'Enter' && addCategory()}
            style={{ width: '100%', padding: '12px 16px', background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, fontWeight: 600 }} />
        </div>
        <div>
          <button onClick={addCategory} style={{ padding: '12px 24px', background: 'linear-gradient(135deg, #3b82f6, #2563eb)', color: 'white', border: 'none', borderRadius: 8, fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap', transition: 'all 0.2s', boxShadow: '0 4px 12px rgba(59,130,246,0.3)' }}
            onMouseEnter={e => e.currentTarget.style.transform = 'translateY(-2px)'}
            onMouseLeave={e => e.currentTarget.style.transform = 'translateY(0)'}>
            Add Category
          </button>
        </div>
      </div>

      {/* Category Management */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', marginBottom: 24, boxShadow: '0 4px 20px rgba(0,0,0,0.3)' }}>
        <h3 style={{ margin: '0 0 20px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 700 }}>📂 Manage Categories</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20 }}>
          <div>
            <h4 style={{ color: '#fca5a5', fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>💸 Expense Categories ({expenseCategories.length})</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {expenseCategories.map(cat => (
                <div key={cat} style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', padding: '8px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, color: '#fca5a5', fontSize: 13, fontWeight: 600 }}>
                  {cat}
                  <button onClick={() => deleteCategory('expense', cat)} style={{ background: 'rgba(239,68,68,0.3)', border: 'none', color: '#ef4444', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(239,68,68,0.5)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(239,68,68,0.3)'}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <h4 style={{ color: '#86efac', fontSize: 14, fontWeight: 700, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 8 }}>💰 Income Categories ({incomeCategories.length})</h4>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {incomeCategories.map(cat => (
                <div key={cat} style={{ background: 'rgba(34,197,94,0.15)', border: '1px solid rgba(34,197,94,0.3)', padding: '8px 12px', borderRadius: 6, display: 'flex', alignItems: 'center', gap: 8, color: '#86efac', fontSize: 13, fontWeight: 600 }}>
                  {cat}
                  <button onClick={() => deleteCategory('income', cat)} style={{ background: 'rgba(34,197,94,0.3)', border: 'none', color: '#22c55e', padding: '2px 8px', borderRadius: 4, cursor: 'pointer', fontSize: 12, fontWeight: 700, transition: 'all 0.2s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(34,197,94,0.5)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(34,197,94,0.3)'}>
                    ✕
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
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
