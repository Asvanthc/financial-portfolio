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

    const symbol = (row.symbol || row.ticker || row['stock'] || '').toString().trim()
    const typeRaw = (row.trade_type || row.type || row.side || row.transaction_type || '').toString().toLowerCase()
    const side = typeRaw.includes('sell') ? 'sell' : typeRaw.includes('buy') ? 'buy' : ''
    const qty = Number(row.quantity || row.qty || row['qty.'] || row['filled quantity'] || 0)
    const price = Number(row.price || row.rate || row['avg. price'] || row['trade price'] || 0)
    const dateStr = row.trade_date || row.date || row['trade date'] || row['order_execution_time'] || ''
    const date = dateStr ? new Date(dateStr) : null

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

    positions.push(position)
    summary.invested += invested
    summary.current += current
    summary.realized += entry.realized
    summary.unrealized += unrealized
    summary.realizedLong += entry.realizedLong
    summary.realizedShort += entry.realizedShort
    summary.unrealizedLong += unrealizedLong
    summary.unrealizedShort += unrealizedShort
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
        rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: '' })
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

      {positions.length > 0 && (
        <div style={{ background: '#0a1018', border: '1px solid #1e293b', borderRadius: 12, padding: 12, boxShadow: '0 10px 30px rgba(0,0,0,0.35)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <h3 style={{ margin: 0, color: '#e6e9ef' }}>Holdings</h3>
            {loading && <span style={{ color: '#22d3ee', fontWeight: 700 }}>⏳ Updating prices…</span>}
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ borderBottom: '1px solid #1e293b', color: '#7c92ab', textTransform: 'uppercase', letterSpacing: '0.6px' }}>
                  <th style={{ textAlign: 'left', padding: '8px 6px' }}>Symbol</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Qty</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Avg Cost</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Invested</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>LTP</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Current</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Unrealized</th>
                  <th style={{ textAlign: 'right', padding: '8px 6px' }}>Realized</th>
                  <th style={{ textAlign: 'center', padding: '8px 6px' }}>ST/LT</th>
                </tr>
              </thead>
              <tbody>
                {positions.map(p => {
                  const mixLabel = (() => {
                    const hasLT = (p.unrealizedLong !== 0) || p.realizedLong !== 0
                    const hasST = (p.unrealizedShort !== 0) || p.realizedShort !== 0
                    if (hasLT && hasST) return 'Mixed'
                    if (hasLT) return 'Long'
                    if (hasST) return 'Short'
                    return '—'
                  })()
                  return (
                    <tr key={p.symbol} style={{ borderBottom: '1px solid #0f172a' }}>
                      <td style={{ padding: '8px 6px', color: '#e6e9ef', fontWeight: 700 }}>{p.symbol}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e6e9ef' }}>{p.qty}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#e6e9ef' }}>{formatINR(p.avgCost)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#fbbf24', fontWeight: 700 }}>{formatINR(p.invested)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#7dd3fc' }}>{formatINR(p.price)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: '#22d3ee', fontWeight: 700 }}>{formatINR(p.current)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: p.unrealized >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{p.unrealized >= 0 ? '+' : ''}{formatINR(p.unrealized)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'right', color: p.realized >= 0 ? '#22c55e' : '#ef4444', fontWeight: 700 }}>{p.realized >= 0 ? '+' : ''}{formatINR(p.realized)}</td>
                      <td style={{ padding: '8px 6px', textAlign: 'center' }}>
                        <span style={{ padding: '4px 8px', borderRadius: 8, background: '#1e293b', color: '#cbd5e1', fontWeight: 700, fontSize: 11 }}>{mixLabel}</span>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {trades.length > 0 && (
        <div style={{ marginTop: 16, background: '#0a1018', border: '1px solid #1e293b', borderRadius: 12, padding: 12 }}>
          <h3 style={{ margin: '0 0 10px 0', color: '#e6e9ef' }}>Trade Ledger</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 8, alignItems: 'center' }}>
            {trades.map((t, idx) => (
              <div key={idx} style={{ padding: 10, borderRadius: 10, border: '1px solid #1e293b', background: 'rgba(255,255,255,0.02)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#e6e9ef', fontWeight: 800 }}>{t.symbol}</div>
                <div style={{ color: t.side === 'buy' ? '#22c55e' : '#ef4444', fontWeight: 800 }}>{t.side.toUpperCase()}</div>
                <div style={{ color: '#7c92ab', fontWeight: 700 }}>Qty {t.qty}</div>
                <div style={{ color: '#7dd3fc', fontWeight: 800 }}>{formatINR(t.price)}</div>
                <div style={{ color: '#94a3b8', fontSize: 11 }}>{new Date(t.date).toLocaleDateString()}</div>
              </div>
            ))}
          </div>
        </div>
      )}
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
