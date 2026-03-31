import React, { useState, useEffect } from 'react'
import { api } from '../api'

const MS  = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
const MFL = ['January','February','March','April','May','June','July','August','September','October','November','December']

function fmt(n) {
  if (!n && n !== 0) return '₹0'
  const abs = Math.abs(n)
  const s = abs >= 1e5 ? `₹${(abs/1e5).toFixed(1)}L` : `₹${Math.round(abs).toLocaleString('en-IN')}`
  return n < 0 ? `-${s}` : s
}
function pctFmt(n) { return `${n >= 0 ? '' : ''}${n.toFixed(1)}%` }

const DEFAULT_CATS = {
  expense: ['Food','Transport','Entertainment','Bills','Healthcare','Shopping','Other'],
  income:  ['Salary','Investment Returns','Freelance','Other'],
}

// Build a list of {year, month} objects going back N months from given anchor
function lastNMonths(anchorYear, anchorMonth, n) {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(anchorYear, anchorMonth - 1 - (n - 1 - i), 1)
    return { year: d.getFullYear(), month: d.getMonth() + 1 }
  })
}

function monthLabel(y, m) { return `${MS[m-1]} '${String(y).slice(2)}` }

function aggregateMonths(expenses, months) {
  const inc = {}, exp = {}
  let totalInc = 0, totalExp = 0
  months.forEach(({ year, month }) => {
    expenses.filter(e => e.year === year && e.month === month).forEach(e => {
      const amt = Number(e.amount) || 0
      if (e.type === 'income')  { inc[e.category] = (inc[e.category] || 0) + amt; totalInc += amt }
      else                      { exp[e.category] = (exp[e.category] || 0) + amt; totalExp += amt }
    })
  })
  return { inc, exp, totalInc, totalExp, savings: totalInc - totalExp }
}

const PERIODS = [
  { id: '3m',     label: '3M',      months: 3  },
  { id: '6m',     label: '6M',      months: 6  },
  { id: 'ytd',    label: 'YTD',     months: null },
  { id: '12m',    label: '12M',     months: 12 },
  { id: 'all',    label: 'All',     months: null },
  { id: 'custom', label: 'Custom',  months: null },
]

export default function ExpenseTracker({ expenses = [], onUpdate }) {
  const now = new Date()
  const curYear  = now.getFullYear()
  const curMonth = now.getMonth() + 1

  const [year,    setYear]    = useState(curYear)
  const [month,   setMonth]   = useState(curMonth)
  const [cats,    setCats]    = useState(DEFAULT_CATS)
  const [sheet,   setSheet]   = useState({})
  const [dirty,   setDirty]   = useState(false)
  const [saving,  setSaving]  = useState(false)
  const [view,    setView]    = useState('entry')
  const [period,  setPeriod]  = useState('6m')
  const [customFrom, setCustomFrom] = useState({ year: curYear, month: 1 })
  const [customTo,   setCustomTo]   = useState({ year: curYear, month: curMonth })
  const [newCatType, setNewCatType] = useState('expense')
  const [newCatName, setNewCatName] = useState('')
  const [addingCat,  setAddingCat]  = useState(false)

  useEffect(() => { initCats() }, [])
  useEffect(() => {
    const s = {}
    expenses.filter(e => e.year === year && e.month === month)
      .forEach(e => { s[`${e.type}:${e.category}`] = String(e.amount || '') })
    setSheet(s); setDirty(false)
  }, [year, month, expenses])

  async function initCats() {
    try {
      const c = await api.getCategories()
      setCats({ expense: c.expense?.length ? c.expense : DEFAULT_CATS.expense, income: c.income?.length ? c.income : DEFAULT_CATS.income })
    } catch (_) {}
  }

  function setAmt(type, cat, val) { setSheet(s => ({ ...s, [`${type}:${cat}`]: val })); setDirty(true) }

  async function saveMonth() {
    const entries = Object.entries(sheet).filter(([,v]) => v && Number(v) > 0).map(([key, v]) => {
      const [type, ...rest] = key.split(':')
      return { type, category: rest.join(':'), amount: Number(v) }
    })
    setSaving(true)
    try { await api.saveMonthExpenses(year, month, entries); setDirty(false); await onUpdate?.() }
    catch (e) { alert('Save failed: ' + e.message) }
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

  const totalIncome  = cats.income.reduce((s,c)  => s + (Number(sheet[`income:${c}`])  || 0), 0)
  const totalExpense = cats.expense.reduce((s,c) => s + (Number(sheet[`expense:${c}`]) || 0), 0)
  const savings      = totalIncome - totalExpense
  const savingsRate  = totalIncome > 0 ? (savings / totalIncome * 100) : 0

  const years = [curYear-2, curYear-1, curYear, curYear+1]

  // ── Summary calculations ──────────────────────────────────────────────────
  // All unique {year,month} combos present in expenses
  const allExpenseMonths = (() => {
    const seen = new Set()
    const out = []
    expenses.forEach(e => {
      const k = `${e.year}-${e.month}`
      if (!seen.has(k)) { seen.add(k); out.push({ year: e.year, month: e.month }) }
    })
    return out.sort((a, b) => a.year !== b.year ? a.year - b.year : a.month - b.month)
  })()

  const summaryMonths = (() => {
    if (period === 'ytd') return Array.from({ length: curMonth }, (_, i) => ({ year: curYear, month: i + 1 }))
    if (period === 'all') return allExpenseMonths.length ? allExpenseMonths : [{ year: curYear, month: curMonth }]
    if (period === 'custom') {
      const from = customFrom.year * 100 + customFrom.month
      const to   = customTo.year   * 100 + customTo.month
      const months = []
      let y = customFrom.year, m = customFrom.month
      while (y * 100 + m <= to) {
        months.push({ year: y, month: m })
        m++; if (m > 12) { m = 1; y++ }
      }
      return months
    }
    const p = PERIODS.find(p => p.id === period)
    return lastNMonths(curYear, curMonth, p.months)
  })()

  const { inc: pInc, exp: pExp, totalInc: pTotalInc, totalExp: pTotalExp, savings: pSavings } = aggregateMonths(expenses, summaryMonths)
  const nMonths       = summaryMonths.length
  const avgMonthlyInc = nMonths > 0 ? pTotalInc / nMonths : 0
  const avgMonthlyExp = nMonths > 0 ? pTotalExp / nMonths : 0
  const pSavingsRate  = pTotalInc > 0 ? (pSavings / pTotalInc * 100) : 0

  // Per-month data for trend table and insights
  const monthRows = summaryMonths.map(({ year: y, month: m }) => {
    const me = expenses.filter(e => e.year === y && e.month === m)
    const inc = me.filter(e => e.type === 'income').reduce((s,e)  => s + Number(e.amount), 0)
    const exp = me.filter(e => e.type === 'expense').reduce((s,e) => s + Number(e.amount), 0)
    const catExp = {}
    me.filter(e => e.type === 'expense').forEach(e => { catExp[e.category] = (catExp[e.category]||0) + Number(e.amount) })
    return { year: y, month: m, label: monthLabel(y, m), inc, exp, savings: inc - exp, catExp }
  }).reverse() // newest first

  // Expense categories sorted by total spend desc
  const expCatsSorted = Object.entries(pExp).sort((a,b) => b[1]-a[1])
  const incCatsSorted = Object.entries(pInc).sort((a,b) => b[1]-a[1])

  // Insights
  const activeMos   = monthRows.filter(r => r.inc > 0 || r.exp > 0)
  const highestExp  = activeMos.length ? activeMos.reduce((a,b) => b.exp > a.exp ? b : a) : null
  const bestSaving  = activeMos.length ? activeMos.reduce((a,b) => b.savings > a.savings ? b : a) : null
  const topExpCat   = expCatsSorted[0]

  return (
    <div>
      {/* Top bar */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:16, flexWrap:'wrap' }}>
        <select className="input input-sm" style={{ width:78 }} value={year} onChange={e => setYear(Number(e.target.value))}>
          {years.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
        <div style={{ display:'flex', gap:3, flexWrap:'wrap' }}>
          {MS.map((m, i) => (
            <button key={i} className={`btn btn-xs ${month===i+1 && view==='entry' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => { setMonth(i+1); setView('entry') }}>{m}</button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          {['entry','summary','history'].map(v => (
            <button key={v} className={`btn btn-sm ${view===v ? 'btn-primary' : 'btn-secondary'}`} onClick={() => setView(v)}>
              {v.charAt(0).toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {/* ── ENTRY VIEW ─────────────────────────────────────────────────────── */}
      {view === 'entry' && (
        <>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
            <h2 className="section-title">{MFL[month-1]} {year}</h2>
            {dirty && <span style={{ fontSize:11, color:'var(--orange)', fontWeight:700 }}>● Unsaved</span>}
          </div>

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(260px,1fr))', gap:16, marginBottom:14 }}>
            <CatSheet label="Income"   type="income"  categories={cats.income}  sheet={sheet} setAmt={setAmt} />
            <CatSheet label="Expenses" type="expense" categories={cats.expense} sheet={sheet} setAmt={setAmt} />
          </div>

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

          <div className="card-lg" style={{ display:'flex', alignItems:'center', gap:24, flexWrap:'wrap' }}>
            <Stat label="Income"   value={fmt(totalIncome)}  color="var(--green)" />
            <Stat label="Expenses" value={fmt(totalExpense)} color="var(--red)"   />
            <div>
              <div className="kpi-label">Savings</div>
              <div style={{ fontSize:20, fontWeight:800, color: savings>=0?'var(--cyan)':'var(--red)' }}>{fmt(savings)}</div>
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

      {/* ── SUMMARY VIEW ───────────────────────────────────────────────────── */}
      {view === 'summary' && (
        <div>
          {/* Period selector */}
          <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom: period==='custom' ? 10 : 18, flexWrap:'wrap' }}>
            <span style={{ fontSize:12, color:'var(--text3)', fontWeight:700 }}>Period:</span>
            {PERIODS.map(p => (
              <button key={p.id} className={`btn btn-sm ${period===p.id?'btn-primary':'btn-secondary'}`} onClick={() => setPeriod(p.id)}>
                {p.label}
              </button>
            ))}
            {period !== 'custom' && summaryMonths[0] && (
              <span style={{ fontSize:12, color:'var(--text3)', marginLeft:4 }}>
                {nMonths > 1
                  ? `${monthLabel(summaryMonths[0].year, summaryMonths[0].month)} – ${monthLabel(summaryMonths[nMonths-1].year, summaryMonths[nMonths-1].month)}`
                  : monthLabel(summaryMonths[0].year, summaryMonths[0].month)}
              </span>
            )}
          </div>

          {/* Custom range picker */}
          {period === 'custom' && (
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18, flexWrap:'wrap', background:'var(--surface2)', padding:'10px 14px', borderRadius:'var(--radius-sm)' }}>
              <span style={{ fontSize:12, color:'var(--text3)', fontWeight:700 }}>From:</span>
              <select className="input input-sm" style={{ width:80 }} value={customFrom.month} onChange={e => setCustomFrom(f => ({ ...f, month: Number(e.target.value) }))}>
                {MS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select className="input input-sm" style={{ width:75 }} value={customFrom.year} onChange={e => setCustomFrom(f => ({ ...f, year: Number(e.target.value) }))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <span style={{ fontSize:12, color:'var(--text3)', fontWeight:700 }}>To:</span>
              <select className="input input-sm" style={{ width:80 }} value={customTo.month} onChange={e => setCustomTo(f => ({ ...f, month: Number(e.target.value) }))}>
                {MS.map((m,i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select className="input input-sm" style={{ width:75 }} value={customTo.year} onChange={e => setCustomTo(f => ({ ...f, year: Number(e.target.value) }))}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              {summaryMonths.length > 0 && (
                <span style={{ fontSize:12, color:'var(--cyan)' }}>
                  {nMonths} month{nMonths!==1?'s':''}
                </span>
              )}
            </div>
          )}

          {/* KPI bar */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
            <KpiCard label="Total Income"    value={fmt(pTotalInc)}     color="var(--green)"  sub={`avg ${fmt(avgMonthlyInc)}/mo`} />
            <KpiCard label="Total Expenses"  value={fmt(pTotalExp)}     color="var(--red)"    sub={`avg ${fmt(avgMonthlyExp)}/mo`} />
            <KpiCard label="Net Savings"     value={fmt(pSavings)}      color={pSavings>=0?'var(--cyan)':'var(--red)'} sub={pTotalInc>0?`${pSavingsRate.toFixed(1)}% rate`:''} />
            <KpiCard label="Months Tracked"  value={activeMos.length}   color="var(--indigo)" sub={`of ${nMonths} in period`} />
          </div>

          {/* Insights row */}
          {activeMos.length > 0 && (
            <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20 }}>
              {topExpCat && (
                <div className="card" style={{ flex:1, minWidth:180 }}>
                  <div className="kpi-label">Top Expense</div>
                  <div style={{ fontWeight:800, fontSize:16, color:'var(--red)' }}>{topExpCat[0]}</div>
                  <div style={{ fontSize:12, color:'var(--text3)' }}>{fmt(topExpCat[1])} · {pTotalExp>0?(topExpCat[1]/pTotalExp*100).toFixed(1):0}% of expenses</div>
                </div>
              )}
              {highestExp && (
                <div className="card" style={{ flex:1, minWidth:180 }}>
                  <div className="kpi-label">Highest Spend Month</div>
                  <div style={{ fontWeight:800, fontSize:16, color:'var(--orange)' }}>{highestExp.label}</div>
                  <div style={{ fontSize:12, color:'var(--text3)' }}>{fmt(highestExp.exp)} expenses</div>
                </div>
              )}
              {bestSaving && (
                <div className="card" style={{ flex:1, minWidth:180 }}>
                  <div className="kpi-label">Best Savings Month</div>
                  <div style={{ fontWeight:800, fontSize:16, color:'var(--green)' }}>{bestSaving.label}</div>
                  <div style={{ fontSize:12, color:'var(--text3)' }}>{fmt(bestSaving.savings)} saved</div>
                </div>
              )}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(280px,1fr))', gap:16, marginBottom:20 }}>
            {/* Expense breakdown */}
            <div className="card">
              <div style={{ fontWeight:700, fontSize:14, color:'var(--red)', marginBottom:12 }}>
                Expense Breakdown <span style={{ fontWeight:400, color:'var(--text3)', fontSize:12 }}>({fmt(pTotalExp)} total)</span>
              </div>
              {expCatsSorted.length === 0 && <div className="text-dim" style={{ fontSize:12 }}>No expense data</div>}
              {expCatsSorted.map(([cat, amt]) => {
                const pct = pTotalExp > 0 ? amt / pTotalExp * 100 : 0
                const incPct = pTotalInc > 0 ? amt / pTotalInc * 100 : 0
                return (
                  <div key={cat} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:3 }}>
                      <span style={{ color:'var(--text)' }}>{cat}</span>
                      <span style={{ fontWeight:700 }}>
                        {fmt(amt)}
                        <span style={{ color:'var(--text3)', fontWeight:400, fontSize:11, marginLeft:6 }}>{pct.toFixed(1)}% of exp</span>
                        {pTotalInc > 0 && <span style={{ color:'var(--text3)', fontWeight:400, fontSize:11, marginLeft:4 }}>· {incPct.toFixed(1)}% of inc</span>}
                      </span>
                    </div>
                    <div style={{ height:5, background:'var(--surface2)', borderRadius:99 }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'var(--red)', borderRadius:99, opacity:0.7 }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>avg {fmt(amt/nMonths)}/mo</div>
                  </div>
                )
              })}
            </div>

            {/* Income breakdown */}
            <div className="card">
              <div style={{ fontWeight:700, fontSize:14, color:'var(--green)', marginBottom:12 }}>
                Income Breakdown <span style={{ fontWeight:400, color:'var(--text3)', fontSize:12 }}>({fmt(pTotalInc)} total)</span>
              </div>
              {incCatsSorted.length === 0 && <div className="text-dim" style={{ fontSize:12 }}>No income data</div>}
              {incCatsSorted.map(([cat, amt]) => {
                const pct = pTotalInc > 0 ? amt / pTotalInc * 100 : 0
                return (
                  <div key={cat} style={{ marginBottom:10 }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:13, marginBottom:3 }}>
                      <span style={{ color:'var(--text)' }}>{cat}</span>
                      <span style={{ fontWeight:700 }}>
                        {fmt(amt)}
                        <span style={{ color:'var(--text3)', fontWeight:400, fontSize:11, marginLeft:6 }}>{pct.toFixed(1)}%</span>
                      </span>
                    </div>
                    <div style={{ height:5, background:'var(--surface2)', borderRadius:99 }}>
                      <div style={{ height:'100%', width:`${pct}%`, background:'var(--green)', borderRadius:99, opacity:0.7 }} />
                    </div>
                    <div style={{ fontSize:10, color:'var(--text3)', marginTop:2 }}>avg {fmt(amt/nMonths)}/mo</div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Month-by-month trend table */}
          <div className="card" style={{ overflowX:'auto' }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:12 }}>Month-by-Month</div>
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>Month</th>
                  <th className="right">Income</th>
                  <th className="right">Expenses</th>
                  <th className="right">Savings</th>
                  <th className="right">Rate</th>
                  {expCatsSorted.slice(0, 5).map(([cat]) => <th key={cat} className="right" style={{ fontSize:10 }}>{cat}</th>)}
                </tr>
              </thead>
              <tbody>
                {monthRows.map(r => (
                  <tr key={`${r.year}-${r.month}`} style={{ cursor:'pointer' }} title="Click to enter data"
                    onClick={() => { setYear(r.year); setMonth(r.month); setView('entry') }}>
                    <td style={{ fontWeight:600, whiteSpace:'nowrap' }}>{r.label}</td>
                    <td className="right num" style={{ color:'var(--green)' }}>{r.inc>0?fmt(r.inc):<span className="text-dim">—</span>}</td>
                    <td className="right num" style={{ color:'var(--red)' }}>{r.exp>0?fmt(r.exp):<span className="text-dim">—</span>}</td>
                    <td className="right num" style={{ color:r.savings>=0?'var(--cyan)':'var(--red)' }}>
                      {(r.inc>0||r.exp>0)?fmt(r.savings):<span className="text-dim">—</span>}
                    </td>
                    <td className="right" style={{ fontSize:12 }}>
                      {r.inc>0
                        ? <span style={{ color: r.savings/r.inc>=0.3?'var(--green)':r.savings/r.inc>=0?'var(--text2)':'var(--red)' }}>
                            {(r.savings/r.inc*100).toFixed(0)}%
                          </span>
                        : <span className="text-dim">—</span>}
                    </td>
                    {expCatsSorted.slice(0,5).map(([cat]) => (
                      <td key={cat} className="right" style={{ fontSize:12, color:'var(--text2)' }}>
                        {r.catExp[cat]>0 ? fmt(r.catExp[cat]) : <span className="text-dim">—</span>}
                      </td>
                    ))}
                  </tr>
                ))}
                {/* Totals row */}
                {monthRows.some(r => r.inc>0||r.exp>0) && (
                  <tr style={{ background:'rgba(129,140,248,0.05)', fontWeight:700 }}>
                    <td style={{ color:'var(--indigo)', fontSize:12 }}>Total / Avg</td>
                    <td className="right num" style={{ color:'var(--green)' }}>
                      {fmt(pTotalInc)}<div style={{ fontSize:10, color:'var(--text3)', fontWeight:400 }}>avg {fmt(avgMonthlyInc)}</div>
                    </td>
                    <td className="right num" style={{ color:'var(--red)' }}>
                      {fmt(pTotalExp)}<div style={{ fontSize:10, color:'var(--text3)', fontWeight:400 }}>avg {fmt(avgMonthlyExp)}</div>
                    </td>
                    <td className="right num" style={{ color:pSavings>=0?'var(--cyan)':'var(--red)' }}>{fmt(pSavings)}</td>
                    <td className="right" style={{ color:pSavingsRate>=30?'var(--green)':pSavingsRate>=0?'var(--text2)':'var(--red)', fontSize:12 }}>
                      {pTotalInc>0?`${pSavingsRate.toFixed(1)}%`:'—'}
                    </td>
                    {expCatsSorted.slice(0,5).map(([cat, amt]) => (
                      <td key={cat} className="right" style={{ fontSize:12, color:'var(--text2)' }}>{amt>0?fmt(amt):'—'}</td>
                    ))}
                  </tr>
                )}
              </tbody>
            </table>
            {monthRows.every(r => r.inc===0 && r.exp===0) && (
              <div style={{ textAlign:'center', padding:'20px 0', color:'var(--text3)', fontSize:13 }}>
                No data for this period. Switch to Entry to add expenses.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── HISTORY VIEW ───────────────────────────────────────────────────── */}
      {view === 'history' && (
        <div>
          <div className="section-header"><h2 className="section-title">All Months</h2></div>
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
                {lastNMonths(curYear, curMonth, 24).reverse().map(({ year: y, month: m }) => {
                  const me  = expenses.filter(e => e.year===y && e.month===m)
                  const inc = me.filter(e => e.type==='income').reduce((s,e)  => s+Number(e.amount), 0)
                  const exp = me.filter(e => e.type==='expense').reduce((s,e) => s+Number(e.amount), 0)
                  const sav = inc - exp
                  return (
                    <tr key={`${y}-${m}`} style={{ cursor:'pointer', opacity:(inc>0||exp>0)?1:0.4 }}
                      onClick={() => { setYear(y); setMonth(m); setView('entry') }}>
                      <td style={{ fontWeight:600 }}>{monthLabel(y, m)}</td>
                      <td className="right num" style={{ color:'var(--green)' }}>{inc>0?fmt(inc):<span className="text-dim">—</span>}</td>
                      <td className="right num" style={{ color:'var(--red)' }}>{exp>0?fmt(exp):<span className="text-dim">—</span>}</td>
                      <td className="right num" style={{ color:sav>=0?'var(--cyan)':'var(--red)' }}>
                        {(inc>0||exp>0)?fmt(sav):<span className="text-dim">—</span>}
                      </td>
                      <td className="right" style={{ fontSize:12, color:'var(--text3)' }}>
                        {inc>0?`${(sav/inc*100).toFixed(0)}%`:'—'}
                      </td>
                    </tr>
                  )
                })}
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
  const total = categories.reduce((s,c) => s + (Number(sheet[`${type}:${c}`]) || 0), 0)
  return (
    <div className="card">
      <div style={{ display:'flex', alignItems:'center', marginBottom:12 }}>
        <span style={{ fontWeight:700, fontSize:14, color }}>{label}</span>
        <span style={{ marginLeft:'auto', fontWeight:800, fontSize:16, color }}>{total>0?fmt(total):''}</span>
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
        {categories.map(cat => (
          <div key={cat} style={{ display:'flex', alignItems:'center', gap:8 }}>
            <label style={{ flex:1, fontSize:13, color:'var(--text2)' }}>{cat}</label>
            <div style={{ position:'relative' }}>
              <span style={{ position:'absolute', left:8, top:'50%', transform:'translateY(-50%)', color:'var(--text3)', fontSize:12, pointerEvents:'none' }}>₹</span>
              <input className="input input-sm" type="number" style={{ width:110, paddingLeft:20, textAlign:'right' }}
                placeholder="0" value={sheet[`${type}:${cat}`]||''} onChange={e => setAmt(type, cat, e.target.value)} />
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

function KpiCard({ label, value, color, sub }) {
  return (
    <div className="card">
      <div className="kpi-label">{label}</div>
      <div style={{ fontSize:22, fontWeight:900, color, lineHeight:1.2 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color:'var(--text3)', marginTop:4 }}>{sub}</div>}
    </div>
  )
}
