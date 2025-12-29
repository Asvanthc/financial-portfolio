import React, { useMemo, useState } from 'react'
import Papa from 'papaparse'
import * as XLSX from 'xlsx'
import { api } from '../api'

// Parse trades from uploaded rows
function parseTrades(rows, format) {
  const trades = []
  rows.forEach((raw) => {
    const row = {}
    Object.keys(raw || {}).forEach(k => { row[k.toLowerCase()] = raw[k] })

    // Groww: Symbol, Type, Quantity, Value (total), Execution date and time
    // Kite: symbol, trade_type, quantity, price, trade_date
    const symbol = (row.symbol || row.ticker || row['stock'] || '').toString().trim()
    const typeRaw = (row.trade_type || row.type || row.side || row.transaction_type || '').toString().toLowerCase()
    const side = typeRaw.includes('sell') ? 'sell' : typeRaw.includes('buy') ? 'buy' : ''
    const qty = Number(row.quantity || row.qty || row['qty.'] || row['filled quantity'] || 0)
    
    // Groww gives 'Value' (total), so divide by qty to get price; Kite gives price directly
    let price = Number(row.price || row.rate || row['avg. price'] || row['trade price'] || 0)
    if (!price && row.value && qty > 0) {
      price = Number(row.value) / qty
    }
    
    const dateStr = row.trade_date || row.date || row['trade date'] || row['order_execution_time'] || row['execution date and time'] || ''
    let date = null
    if (dateStr) {
      // Groww format: dd-mm-yyyy or dd/mm/yyyy
      // Kite format: yyyy-mm-dd or ISO timestamp
      const str = dateStr.toString().trim()
      if (str.match(/^\d{1,2}[/-]\d{1,2}[/-]\d{4}/)) {
        // Groww: dd-mm-yyyy or dd/mm/yyyy
        const parts = str.split(/[/-\s]/)
        const day = parseInt(parts[0])
        const month = parseInt(parts[1]) - 1
        const year = parseInt(parts[2])
        date = new Date(year, month, day)
      } else {
        // Kite: yyyy-mm-dd or ISO format
        date = new Date(str)
      }
    }

    if (!symbol || !side || !qty || !price || !date || Number.isNaN(date.getTime())) return
    trades.push({ symbol, side, qty, price, date })
  })
  return trades.sort((a, b) => a.date - b.date)
}

function computePositions(trades, quotes) {
  const now = new Date()
  const dayMs = 86400000
  const bySymbol = new Map()

  trades.forEach(t => {
    const sym = t.symbol.toUpperCase()
    if (!bySymbol.has(sym)) bySymbol.set(sym, { lots: [], realized: 0, realizedShort: 0, realizedLong: 0, lastTradePrice: t.price })
    const entry = bySymbol.get(sym)
    entry.lastTradePrice = t.price

    if (t.side === 'buy') {
      entry.lots.push({ qty: t.qty, price: t.price, date: t.date })
    } else if (t.side === 'sell') {
      let qtyToSell = t.qty
      while (qtyToSell > 0 && entry.lots.length > 0) {
        const lot = entry.lots[0]
        const take = Math.min(qtyToSell, lot.qty)
        const pnl = (t.price - lot.price) * take
        const holdDays = Math.floor((t.date - lot.date) / dayMs)
        entry.realized += pnl
        if (holdDays >= 365) entry.realizedLong += pnl
        else entry.realizedShort += pnl
        lot.qty -= take
        qtyToSell -= take
        if (lot.qty <= 0) entry.lots.shift()
      }
    }
  })

  const positions = []
  let summary = {
    invested: 0,
    current: 0,
    realized: 0,
    unrealized: 0,
    realizedShort: 0,
    realizedLong: 0,
    unrealizedShort: 0,
    unrealizedLong: 0,
  }

  bySymbol.forEach((entry, sym) => {
    const lots = entry.lots
    const quote = quotes[sym] || quotes[sym.replace(/\.(NS|BO)$/i, '')] || {}
    const livePrice = Number(quote.price) || entry.lastTradePrice || 0

    let qty = 0
    let invested = 0
    let current = 0
    let unrealized = 0
    let unrealizedLong = 0
    let unrealizedShort = 0

    lots.forEach(lot => {
      const lotCost = lot.qty * lot.price
      const lotCurrent = lot.qty * livePrice
      const lotPnL = lotCurrent - lotCost
      invested += lotCost
      current += lotCurrent
      unrealized += lotPnL
      qty += lot.qty
      const holdDays = Math.floor((now - lot.date) / dayMs)
      if (holdDays >= 365) unrealizedLong += lotPnL
      else unrealizedShort += lotPnL
    })

    const position = {
      symbol: sym,
      qty,
      avgCost: qty > 0 ? invested / qty : 0,
      invested,
      current,
      price: livePrice,
      unrealized,
      realized: entry.realized,
      realizedLong: entry.realizedLong,
      realizedShort: entry.realizedShort,
      unrealizedLong,
      unrealizedShort,
      lots,
    }

    // Only include positions with non-zero quantity
    if (qty > 0) {
      positions.push(position)
      summary.invested += invested
      summary.current += current
      summary.unrealized += unrealized
      summary.unrealizedLong += unrealizedLong
      summary.unrealizedShort += unrealizedShort
    }
    
    // Always include realized P/L in summary even if position is closed
    summary.realized += entry.realized
    summary.realizedLong += entry.realizedLong
    summary.realizedShort += entry.realizedShort
  })

  // Sort by current value desc
  positions.sort((a, b) => (b.current || 0) - (a.current || 0))
  return { positions, summary }
}

function formatINR(val) {
  if (!Number.isFinite(val)) return '—'
  return `₹${Math.round(val).toLocaleString()}`
}

export default function HoldingsTab() {
  const [format, setFormat] = useState('kite')
  const [trades, setTrades] = useState([])
  const [positions, setPositions] = useState([])
  const [summary, setSummary] = useState({ invested: 0, current: 0, realized: 0, unrealized: 0, realizedShort: 0, realizedLong: 0, unrealizedShort: 0, unrealizedLong: 0 })
  const [missing, setMissing] = useState([])
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function handleFile(file) {
    setError('')
    setLoading(true)
    try {
      const isXlsx = file.name.toLowerCase().endsWith('.xlsx') || file.name.toLowerCase().endsWith('.xls')
      let rows = []
      if (isXlsx) {
        const buf = await file.arrayBuffer()
        const wb = XLSX.read(buf, { type: 'array' })
        const sheet = wb.SheetNames[0]
        // Groww format: skip first rows and find header row
        const rawRows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '', header: 1 })
        let headerIdx = rawRows.findIndex(r => Array.isArray(r) && (r.includes('Symbol') || r.includes('symbol') || r.includes('Type') || r.includes('type')))
        if (headerIdx === -1) headerIdx = 0
        rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '', range: headerIdx })
      } else {
        const text = await file.text()
        const parsed = Papa.parse(text, { header: true, skipEmptyLines: true })
        rows = parsed.data || []
      }

      const parsedTrades = parseTrades(rows, format)
      setTrades(parsedTrades)
      const symbols = Array.from(new Set(parsedTrades.map(t => t.symbol.toUpperCase())))
      const quoteResp = await api.quotes(symbols)
      const { positions, summary } = computePositions(parsedTrades, quoteResp.quotes || {})
      setPositions(positions)
      setSummary(summary)
      setMissing(quoteResp.missing || [])
    } catch (e) {
      console.error(e)
      setError(e.message || 'Failed to parse file')
    } finally {
      setLoading(false)
    }
  }

  const totals = useMemo(() => {
    const totalValue = summary.current + summary.realized
    const totalPL = summary.realized + summary.unrealized
    return { totalValue, totalPL }
  }, [summary])

  return (
    <div style={{ marginTop: 12 }}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
        <div style={{ padding: 12, border: '1px solid #1e293b', borderRadius: 12, background: '#0a1018' }}>
          <div style={{ color: '#7c92ab', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Broker Format</div>
          <div style={{ display: 'flex', gap: 10 }}>
            {['kite', 'groww'].map(f => (
              <label key={f} style={{ display: 'flex', alignItems: 'center', gap: 6, color: '#e6e9ef', fontWeight: 700 }}>
                <input type="radio" name="format" value={f} checked={format === f} onChange={() => setFormat(f)} />
                {f === 'kite' ? 'Kite / Zerodha' : 'Groww'}
              </label>
            ))}
          </div>
        </div>

        <div style={{ padding: 12, border: '1px dashed #2d3f5f', borderRadius: 12, background: '#0f1724', flex: '1 1 260px' }}>
          <div style={{ color: '#7c92ab', fontSize: 12, fontWeight: 700, marginBottom: 8 }}>Upload tradebook (CSV/XLSX)</div>
          <input type="file" accept=".csv,.xlsx,.xls" onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])} disabled={loading} />
          {error && <div style={{ marginTop: 8, color: '#f87171', fontWeight: 700 }}>{error}</div>}
          {missing.length > 0 && (
            <div style={{ marginTop: 8, color: '#fbbf24', fontWeight: 700, fontSize: 12 }}>No live price for: {missing.join(', ')}</div>
          )}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 16 }}>
        <StatCard label="Invested" value={formatINR(summary.invested)} tone="#fbbf24" />
        <StatCard label="Current" value={formatINR(summary.current)} tone="#22d3ee" />
        <StatCard label="Unrealized P/L" value={`${summary.unrealized >= 0 ? '+' : ''}${formatINR(summary.unrealized)}`} tone={summary.unrealized >= 0 ? '#22c55e' : '#ef4444'} />
        <StatCard label="Realized P/L" value={`${summary.realized >= 0 ? '+' : ''}${formatINR(summary.realized)}`} tone={summary.realized >= 0 ? '#22c55e' : '#ef4444'} />
        <StatCard label="Total P/L" value={`${totals.totalPL >= 0 ? '+' : ''}${formatINR(totals.totalPL)}`} tone={totals.totalPL >= 0 ? '#22c55e' : '#ef4444'} />
      </div>

      {positions.length > 0 && (() => {
        const now = new Date()
        const dayMs = 86400000
        
        // Summary of all active holdings
        const summaryCard = (
          <div style={{ 
            background: 'linear-gradient(135deg, #0f1724 0%, #0a1018 100%)', 
            border: '1px solid #1e293b', 
            borderRadius: 12, 
            padding: 24, 
            marginBottom: 24,
            boxShadow: '0 10px 40px rgba(0,0,0,0.4)',
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 24
          }}>
            <div>
              <div style={{ color: '#7c92ab', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Total Invested</div>
              <div style={{ color: '#fbbf24', fontWeight: 900, fontSize: 28 }}>{formatINR(summary.invested)}</div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>{positions.length} active {positions.length === 1 ? 'position' : 'positions'}</div>
            </div>
            
            <div>
              <div style={{ color: '#7c92ab', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Current Value</div>
              <div style={{ color: '#22d3ee', fontWeight: 900, fontSize: 28 }}>{formatINR(summary.current)}</div>
              <div style={{ color: summary.unrealized >= 0 ? '#22c55e' : '#ef4444', fontSize: 12, marginTop: 4, fontWeight: 700 }}>
                {summary.unrealized >= 0 ? '↗' : '↘'} {formatINR(Math.abs(summary.unrealized))} ({((summary.unrealized / summary.invested) * 100).toFixed(1)}%)
              </div>
            </div>
            
            <div>
              <div style={{ color: '#7c92ab', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8 }}>Total Profit/Loss</div>
              <div style={{ color: totals.totalPL >= 0 ? '#10b981' : '#ef4444', fontWeight: 900, fontSize: 28 }}>
                {totals.totalPL >= 0 ? '+' : ''}{formatINR(totals.totalPL)}
              </div>
              <div style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                Realized: {summary.realized >= 0 ? '+' : ''}{formatINR(summary.realized)} | Unrealized: {summary.unrealized >= 0 ? '+' : ''}{formatINR(summary.unrealized)}
              </div>
            </div>
          </div>
        )
        
        return (
          <>
            {summaryCard}
          </>
        )
      })()}

      {trades.length > 0 && positions.length > 0 && (() => {
        const now = new Date()
        const dayMs = 86400000
        
        // Get active lots from positions (only show trades that still have holdings)
        const activeLots = []
        positions.forEach(p => {
          p.lots.forEach(lot => {
            activeLots.push({
              symbol: p.symbol,
              qty: lot.qty,
              price: lot.price,
              date: lot.date,
              side: 'buy' // Only buy lots remain in positions
            })
          })
        })
        
        // Group active lots by date
        const groupedByDate = activeLots.reduce((acc, t) => {
          const dateKey = new Date(t.date).toLocaleDateString()
          if (!acc[dateKey]) acc[dateKey] = []
          acc[dateKey].push(t)
          return acc
        }, {})
        const sortedDates = Object.keys(groupedByDate).sort((a, b) => new Date(b) - new Date(a))
        
        return (
          <div style={{ marginTop: 16, background: '#0a1018', border: '1px solid #1e293b', borderRadius: 12, padding: 16 }}>
            <h3 style={{ margin: '0 0 16px 0', color: '#e6e9ef', fontSize: 18, fontWeight: 900 }}>� Active Holdings Ledger</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {sortedDates.map(dateKey => {
                const dayTrades = groupedByDate[dateKey]
                const tradeDate = new Date(dayTrades[0].date)
                const daysAgo = Math.floor((now - tradeDate) / dayMs)
                const timeLabel = daysAgo === 0 ? 'Today' : daysAgo === 1 ? 'Yesterday' : `${daysAgo} days ago`
                const isLongTerm = daysAgo >= 365
                const daysIcon = daysAgo === 0 ? '🆕' : daysAgo < 7 ? '🔥' : daysAgo < 30 ? '⚡' : daysAgo < 90 ? '📈' : daysAgo < 365 ? '⏳' : '💎'
                const borderColor = isLongTerm ? '#10b981' : daysAgo >= 180 ? '#f59e0b' : daysAgo >= 30 ? '#3b82f6' : '#ec4899'
                const bgColor = isLongTerm ? 'rgba(16, 185, 129, 0.05)' : daysAgo >= 180 ? 'rgba(245, 158, 11, 0.05)' : daysAgo >= 30 ? 'rgba(59, 130, 246, 0.05)' : 'rgba(236, 72, 153, 0.05)'
                
                return (
                  <div key={dateKey} style={{ 
                    border: `2px solid ${borderColor}40`, 
                    borderRadius: 14, 
                    padding: 16, 
                    background: bgColor,
                    boxShadow: `0 4px 16px ${borderColor}15`,
                    transition: 'all 0.3s ease'
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, borderBottom: `1px solid ${borderColor}30`, paddingBottom: 10 }}>
                      <div style={{ fontSize: 24 }}>{daysIcon}</div>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 17, fontWeight: 900, color: borderColor, marginBottom: 2 }}>{dateKey}</div>
                        <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {timeLabel} {isLongTerm && '• 💎 LONG TERM (1+ year)'}
                        </div>
                      </div>
                      <div style={{ 
                        padding: '8px 14px', 
                        borderRadius: 10, 
                        background: `${borderColor}20`, 
                        border: `1.5px solid ${borderColor}50`,
                        textAlign: 'center'
                      }}>
                        <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px' }}>Holdings</div>
                        <div style={{ fontSize: 18, fontWeight: 900, color: borderColor }}>{dayTrades.length}</div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {dayTrades.map((t, idx) => {
                        const totalValue = t.qty * t.price
                        return (
                          <div key={idx} style={{ 
                            display: 'flex', 
                            alignItems: 'center', 
                            gap: 12, 
                            padding: '12px 14px', 
                            borderRadius: 10, 
                            background: 'rgba(255,255,255,0.03)', 
                            border: `1px solid ${borderColor}30`,
                            transition: 'all 0.2s ease',
                            cursor: 'pointer',
                            ':hover': { background: 'rgba(255,255,255,0.05)' }
                          }}>
                            <div style={{ 
                              width: 40,
                              height: 40,
                              borderRadius: 10,
                              background: `${borderColor}20`,
                              border: `1.5px solid ${borderColor}50`,
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              fontWeight: 900,
                              color: borderColor,
                              fontSize: 13
                            }}>
                              {t.symbol.slice(0, 2)}
                            </div>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <div style={{ color: '#e6e9ef', fontWeight: 800, fontSize: 15, marginBottom: 2 }}>{t.symbol}</div>
                              <div style={{ color: '#7c92ab', fontSize: 12, fontWeight: 600 }}>
                                {t.qty} @ ₹{t.price.toFixed(2)} = ₹{totalValue.toFixed(0)}
                              </div>
                            </div>
                            <div style={{ textAlign: 'right', minWidth: 'fit-content' }}>
                              <div style={{ color: '#94a3b8', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>Current</div>
                              <div style={{ color: '#22d3ee', fontWeight: 900, fontSize: 16 }}>₹{totalValue.toFixed(0)}</div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

function StatCard({ label, value, tone }) {
  return (
    <div style={{ padding: 12, borderRadius: 12, background: '#0f1724', border: `1px solid ${tone}33`, boxShadow: '0 6px 18px rgba(0,0,0,0.35)' }}>
      <div style={{ color: '#7c92ab', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 6 }}>{label}</div>
      <div style={{ color: tone, fontWeight: 900, fontSize: 18 }}>{value}</div>
    </div>
  )
}
