import React, { useState, useEffect } from 'react'
import { api } from '../api'

const MS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MF = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmt(n) {
  if (!n) return '₹0'
  return Math.abs(n) >= 1e5 ? `₹${(n/1e5).toFixed(1)}L` : `₹${Math.round(n).toLocaleString('en-IN')}`
}

const DEFAULT_CATS = {
  expense: ['Food', 'Transport', 'Entertainment', 'Bills', 'Healthcare', 'Shopping', 'Other'],
  income: ['Salary', 'Investment Returns', 'Freelance', 'Other'],
}

export default function ExpenseTracker({ expenses = [], onUpdate }) {
  const now = new Date()
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth() + 1)
  const [cats, setCats] = useState(DEFAULT_CATS)
  const [sheet, setSheet] = useState({})
  const [dirty, setDirty] = useState(false)
  const [saving, setSaving] = useState(false)
  const [view, setView] = useState('entry')
  const [newCatType, setNewCatType] = useState('expense')
  const [newCatName, setNewCatName] = useState('')
  const [addingCat, setAddingCat] = useState(false)

  useEffect(() => { initCats() }, [])

  useEffect(() => {
    const me = expenses.filter(e => e.year === year && e.month === month)
    const s = {}
    me.forEach(e => { s[`${e.type}:${e.category}`] = String(e.amount || '') })
    setSheet(s)
    setDirty(false)
  }, [year, month, expenses])

  async function initCats() {
    try {
      const c = await api.getCategories()
      setCats({
        expense: c.expense?.length ? c.expense : DEFAULT_CATS.expense,
        income: c.income?.length ? c.income : DEFAULT_CATS.income,
      })
    } catch (_) {}
  }

  function setAmt(type, cat, val) {
    setSheet(s => ({ ...s, [`${type}:${cat}`]: val }))
    setDirty(true)
  }

  async function saveMonth() {
    const entries = Object.entries(sheet)
      .filter(([, v]) => v && Number(v) > 0)
      .map(([key, v]) => {
        const [type, ...rest] = key.split(':')
        return { type, category: rest.join(':'), amount: Number(v) }
      })
    setSaving(true)
    try {
      await api.saveMonthExpenses(year, month, entries)
      setDirty(false)
      await onUpdate?.()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  async function addCat() {
    const name = newCatName.trim()
    if (!name) return
    try {
      await api.addCategory(newCatType, name)
      setCats(c => ({ ...c, [newCatType]: [...c[newCatType], name] }))
      setNewCatName(''); setAddingCat(false)
    } catch (_) {}
  }

  const totalIncome  = cats.income.reduce((s, c)  => s + (Number(sheet[`income:${c}`])  || 0), 0)
  const totalExpense = cats.expense.reduce((s, c) => s + (Number(sheet[`expense:${c}`]) || 0), 0)
  const savings      = totalIncome - totalExpense
  const savingsRate  = totalIncome > 0 ? (savings / totalIncome * 100) : 0

  // Last 12 months for history
  const histMonths = Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, month - 1 - (11 - i), 1)
    const y2 = d.getFullYear(), m2 = d.getMonth() + 1
    const me = expenses.filter(e => e.year === y2 && e.month === m2)
    const inc = me.filter(e => e.type === 'income').reduce((s, e)  => s + Number(e.amount), 0)
    const exp = me.filter(e => e.type === 'expense').reduce((s, e) => s + Number(e.amount), 0)
    return { year: y2, month: m2, label: `${MS[m2-1]} '${String(y2).slice(2)}`, income: inc, expense: exp, savings: inc - exp }
  })

  const years = [now.getFullYear()-2, now.getFullYear()-1, now.getFullYear(), now.getFullYear()+1]

  return (
    <div>
      {/* Month selector bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <select className="input input-sm" style={{ width:78 }} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
          {MS.map((m, i) => (
            <button key={i} className={`btn btn-xs ${month === i+1 ? 'btn-primary' : 'btn-ghost'}`} onClick={() => setMonth(i+1)}>{m}</button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
          <button className={`btn btn-sm ${view==='entry' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('entry')}>Entry</button>
          <button className={`btn btn-sm ${view==='history' ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView('history')}>History</button>
        </div>
      </div>

      {view === 'entry' && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <h2 className="section-title">{MF[month-1]} {year}</h2>
            {dirty && <span style={{ fontSize:11, color:'var(--orange)', fontWeight:700 }}>● Unsaved</span>}
          </div>

          {/* Income + Expense sheets side by side */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16, marginBottom:14 }}>
            <CatSheet label="Income" type="income" categories={cats.income} sheet={sheet} setAmt={setAmt} />
            <CatSheet label="Expenses" type="expense" categories={cats.expense} sheet={sheet} setAmt={setAmt} />
          </div>

          {/* Add category */}
          {addingCat ? (
            <div style={{ display:'flex', gap:8, alignItems:'center', marginBottom:12 }}>
              <select className="input input-sm" style={{ width:95 }} value={newCatType} onChange={e => setNewCatType(e.target.value)}>
                <option value="expense">Expense</option>
                <option value="income">Income</option>
              </select>
              <input className="input input-sm" style={{ width:160 }} placeholder="Category name" value={newCatName} autoFocus
                onChange={e => setNewCatName(e.target.value)} onKeyDown={e => e.key==='Enter' && addCat()} />
              <button className="btn btn-primary btn-sm" onClick={addCat}>Add</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddingCat(false)}>Cancel</button>
            </div>
          ) : (
            <button className="btn btn-ghost btn-sm" style={{ marginBottom:12 }} onClick={() => setAddingCat(true)}>+ Add Category</button>
          )}

          {/* Summary + Save */}
          <div className="card-lg" style={{ display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
            <Stat label="Income"   value={fmt(totalIncome)}  color="var(--green)" />
            <Stat label="Expenses" value={fmt(totalExpense)} color="var(--red)"   />
            <div>
              <div className="kpi-label">Savings</div>
              <div style={{ fontSize:20, fontWeight:800, color: savings>=0 ? 'var(--cyan)' : 'var(--red)' }}>{fmt(savings)}</div>
              {totalIncome > 0 && <div style={{ fontSize:11, color:'var(--text3)' }}>{savingsRate.toFixed(1)}% rate</div>}
            </div>
            <div style={{ marginLeft:'auto' }}>
              <button className="btn btn-primary" onClick={saveMonth} disabled={saving} style={{ minWidth:130 }}>
                {saving ? 'Saving…' : `Save ${MS[month-1]} ${year}`}
              </button>
            </div>
          </div>
        </>
      )}

      {view === 'history' && (
        <div>
          <div className="section-header"><h2 className="section-title">Last 12 Months</h2></div>
          <div style={{ overflowX:'auto' }}>
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="right">Income</th>
                  <th className="right">Expenses</th>
                  <th className="right">Savings</th>
                  <th className="right">Rate</th>
                </tr>
              </thead>
              <tbody>
                {histMonths.map(hm => (
                  <tr key={`${hm.year}-${hm.month}`} style={{ cursor:'pointer' }} title="Click to edit"
                    onClick={() => { setYear(hm.year); setMonth(hm.month); setView('entry') }}>
                    <td style={{ fontWeight:600 }}>{hm.label}</td>
                    <td className="right num" style={{ color:'var(--green)' }}>{hm.income>0 ? fmt(hm.income) : <span className="text-dim">—</span>}</td>
                    <td className="right num" style={{ color:'var(--red)' }}>{hm.expense>0 ? fmt(hm.expense) : <span className="text-dim">—</span>}</td>
                    <td className="right num" style={{ color: hm.savings>=0 ? 'var(--cyan)' : 'var(--red)' }}>
                      {(hm.income>0||hm.expense>0) ? fmt(hm.savings) : <span className="text-dim">—</span>}
                    </td>
                    <td className="right" style={{ fontSize:12, color:'var(--text3)' }}>
                      {hm.income>0 ? `${((hm.savings/hm.income)*100).toFixed(0)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}

function CatSheet({ label, type, categories, sheet, setAmt }) {
  const color = type==='income' ? 'var(--green)' : 'var(--red)'
  const total = categories.reduce((s, c) => s + (Number(sheet[`${type}:${c}`]) || 0), 0)
  return (
    <div className="card">
      <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontWeight:700, fontSize:14, color }}>{label}</span>
        <span style={{ marginLeft:'auto', fontWeight:800, fontSize:16, color }}>{total > 0 ? fmt(total) : ''}</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {categories.map(cat => (
          <div key={cat} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <label style={{ flex:1, fontSize:13, color:'var(--text2)' }}>{cat}</label>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', fontSize:12, pointerEvents:'none' }}>₹</span>
              <input className="input input-sm" type="number" style={{ width:110, paddingLeft:20, textAlign:'right' }}
                placeholder="0" value={sheet[`${type}:${cat}`] || ''} onChange={e => setAmt(type, cat, e.target.value)} />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function Stat({ label, value, color }) {
  return (
    <div>
      <div className="kpi-label">{label}</div>
      <div style={{ fontSize:20, fontWeight:800, color }}>{value}</div>
    </div>
  )
}
