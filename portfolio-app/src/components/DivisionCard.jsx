import React, { useState, useRef } from 'react'
import { api } from '../api'

const PLATFORMS = {
  kite:     { label: 'Kite',     cls: 'platform-kite',     icon: '⚡' },
  groww:    { label: 'Groww',    cls: 'platform-groww',    icon: '🌱' },
  indmoney: { label: 'IndMoney', cls: 'platform-indmoney', icon: '🌐' },
  bank:     { label: 'Bank',     cls: 'platform-bank',     icon: '🏦' },
  other:    { label: 'Other',    cls: 'platform-other',    icon: '•' },
}
const ASSET_TYPES = { stock:'Stock', etf:'ETF', mf:'MF', fd:'FD', foreign:'Foreign', gold:'Gold' }

const CURRENCIES = {
  USD: { symbol: '$',   name: 'US Dollar' },
  GBP: { symbol: '£',   name: 'British Pound' },
  EUR: { symbol: '€',   name: 'Euro' },
  SGD: { symbol: 'S$',  name: 'Singapore Dollar' },
  AED: { symbol: 'د.إ', name: 'UAE Dirham' },
  JPY: { symbol: '¥',   name: 'Japanese Yen' },
  CHF: { symbol: 'Fr',  name: 'Swiss Franc' },
  CAD: { symbol: 'C$',  name: 'Canadian Dollar' },
  AUD: { symbol: 'A$',  name: 'Australian Dollar' },
  HKD: { symbol: 'HK$', name: 'Hong Kong Dollar' },
}

async function fetchRateToInr(currency) {
  try {
    const data = await api.getExchangeRate(currency)
    return data.rateToInr || null
  } catch (_) { return null }
}

function fmt(n) {
  if (!n) return '₹0'
  return Math.abs(n) >= 1e7 ? `₹${(n/1e7).toFixed(2)}Cr`
    : Math.abs(n) >= 1e5 ? `₹${(n/1e5).toFixed(1)}L`
    : `₹${Math.round(n).toLocaleString('en-IN')}`
}

// Reusable searchable name input (MF or Stock/ETF autocomplete)
function NameSearch({ assetType, value, onChange, onSelectMf, onSelectStock }) {
  const [results, setResults] = useState([])
  const [searching, setSearching] = useState(false)
  const timer = useRef(null)
  const isMf = assetType === 'mf'
  const searchable = isMf || ['stock','etf','foreign'].includes(assetType)

  function handleInput(q) {
    onChange(q)
    clearTimeout(timer.current)
    if (!searchable || q.length < 2) { setResults([]); return }
    setSearching(true)
    timer.current = setTimeout(async () => {
      try {
        const res = isMf ? await api.mfSearch(q) : await api.stockSearch(q)
        setResults(res || [])
      } catch (_) {}
      setSearching(false)
    }, 350)
  }

  return (
    <div className="relative" style={{ flex:1, minWidth:180 }}>
      <input className="input input-sm" style={{ width:'100%' }}
        placeholder={isMf ? 'Search MF name…' : searchable ? 'Search stock / ETF…' : 'Name'}
        value={value} onChange={e => handleInput(e.target.value)} />
      {(results.length > 0 || searching) && (
        <div className="search-dropdown">
          {searching && <div className="search-item text-muted">Searching…</div>}
          {isMf && results.map(s => (
            <div key={s.schemeCode} className="search-item" onClick={() => { onSelectMf(s); setResults([]) }}>
              <div style={{ fontWeight:600, fontSize:12 }}>{s.schemeName}</div>
              <div style={{ fontSize:10, color:'var(--text3)' }}>#{s.schemeCode}</div>
            </div>
          ))}
          {!isMf && results.map(s => (
            <div key={s.symbol} className="search-item" onClick={() => { onSelectStock(s); setResults([]) }}>
              <div style={{ fontWeight:700, fontSize:12 }}>{s.symbol} <span style={{ fontWeight:400, color:'var(--text2)' }}>— {s.name}</span></div>
              <div style={{ fontSize:10, color:'var(--text3)' }}>{s.exchange} · {s.type}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export default function DivisionCard({ division, analytics, onUpdate }) {
  const [expanded, setExpanded] = useState(true)
  const [editingName, setEditingName] = useState(division.name)
  const [editingTarget, setEditingTarget] = useState(division.targetPercent)
  const [editingHeader, setEditingHeader] = useState(false)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null)
  const [addSubMode, setAddSubMode] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [newSubTarget, setNewSubTarget] = useState('')
  const [refreshingId, setRefreshingId] = useState(null)
  const isSaving = useRef(false)

  React.useEffect(() => {
    if (!isSaving.current) { setEditingName(division.name); setEditingTarget(division.targetPercent) }
  }, [division.name, division.targetPercent])

  const divAna = analytics.divisions?.find(d => d.id === division.id) || {}
  const totalPortfolioCurrent = analytics.totals?.current || 0
  const invested = divAna.invested || 0
  const current  = divAna.current  || 0
  const profit   = divAna.profit   || 0
  const profitPct   = invested > 0 ? (profit / invested) * 100 : 0
  const currentPct  = divAna.currentPercent || 0
  const targetPct   = Number(editingTarget) || 0
  const delta       = targetPct - currentPct

  // Sort direct holdings and subdivisions by current value desc
  const allDirectHoldings = [...(division.holdings || [])].sort((a,b) => (b.current||0)-(a.current||0))
  const sortedSubdivisions = [...(division.subdivisions || [])].sort((a,b) => {
    const aA = divAna.subdivisions?.find(s => s.id === a.id) || {}
    const bA = divAna.subdivisions?.find(s => s.id === b.id) || {}
    return (bA.current||0) - (aA.current||0)
  })

  async function saveHeader() {
    if (isSaving.current) return
    isSaving.current = true
    try {
      await api.updateDivision(division.id, { name: editingName, targetPercent: Number(editingTarget)||0 })
      onUpdate?.()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { isSaving.current = false; setEditingHeader(false) }
  }

  async function deleteDivision() {
    if (!confirm(`Delete division "${division.name}" and all its holdings?`)) return
    await api.deleteDivision(division.id); onUpdate?.()
  }

  async function addSubdivision() {
    if (!newSubName) return
    await api.addSubdivision(division.id, { name: newSubName, targetPercent: Number(newSubTarget)||0 })
    setNewSubName(''); setNewSubTarget(''); setAddSubMode(false); onUpdate?.()
  }

  async function refreshPrice(holding) {
    setRefreshingId(holding.id)
    try { await api.refreshHoldingPrice(holding.id); onUpdate?.() }
    catch (e) { alert('Price fetch failed: ' + e.message) }
    finally { setRefreshingId(null) }
  }

  return (
    <div className="div-card">
      <div className="div-header" onClick={() => !editingHeader && setExpanded(e => !e)}>
        <span className={`chevron${expanded ? ' open' : ''}`}>▶</span>
        {editingHeader ? (
          <div className="flex gap-2 items-center flex-1" onClick={e => e.stopPropagation()}>
            <input className="input input-sm" style={{ width:180 }} value={editingName} onChange={e => setEditingName(e.target.value)} autoFocus />
            <input className="input input-sm" style={{ width:70 }} type="number" placeholder="Target %" value={editingTarget} onChange={e => setEditingTarget(e.target.value)} />
            <button className="btn btn-primary btn-xs" onClick={saveHeader}>Save</button>
            <button className="btn btn-secondary btn-xs" onClick={() => { setEditingHeader(false); setEditingName(division.name); setEditingTarget(division.targetPercent) }}>Cancel</button>
          </div>
        ) : (
          <>
            <span className="div-name">{division.name}</span>
            <div className="div-stats">
              <span className="div-stat"><strong style={{ color:'var(--purple)' }}>{fmt(current)}</strong></span>
              <span className="div-stat" style={{ color: profit>=0 ? 'var(--green)' : 'var(--red)' }}>
                {profit>=0?'+':''}{fmt(profit)} ({profitPct>=0?'+':''}{profitPct.toFixed(1)}%)
              </span>
              <span className="div-stat">
                <span style={{ color:'var(--cyan)' }}>{currentPct.toFixed(1)}%</span>
                <span className="text-dim"> / {targetPct}% target</span>
              </span>
              {delta > 0.5 && <span className="div-stat" style={{ color:'var(--orange)' }}>↑ {fmt(divAna.requiredAddition||0)} needed</span>}
            </div>
            <div className="action-group" onClick={e => e.stopPropagation()}>
              <button className="btn-icon" title="Edit" onClick={() => setEditingHeader(true)}>✏️</button>
              <button className="btn-icon" title="Delete" onClick={deleteDivision}>🗑️</button>
            </div>
          </>
        )}
      </div>

      {expanded && (
        <div className="div-body">
          {sortedSubdivisions.map(sub => (
            <SubdivisionBlock key={sub.id} subdivision={sub} divisionId={division.id}
              analytics={divAna.subdivisions?.find(s => s.id === sub.id) || {}}
              divisionCurrent={current} totalPortfolioCurrent={totalPortfolioCurrent}
              onUpdate={onUpdate} onRefresh={refreshPrice} refreshingId={refreshingId}
              editingHolding={editingHolding} setEditingHolding={setEditingHolding} />
          ))}

          {allDirectHoldings.length > 0 && (
            <HoldingsTable holdings={allDirectHoldings} onUpdate={onUpdate}
              onRefresh={refreshPrice} refreshingId={refreshingId}
              editingHolding={editingHolding} setEditingHolding={setEditingHolding}
              parentCurrent={current} totalCurrent={totalPortfolioCurrent} />
          )}

          {showAddHolding ? (
            <div className="add-holding-panel">
              <AddHoldingForm divisionId={division.id} subdivisions={division.subdivisions||[]}
                onSave={() => { setShowAddHolding(false); onUpdate?.() }}
                onCancel={() => setShowAddHolding(false)} />
            </div>
          ) : (
            <div className="flex gap-2 items-center" style={{ padding:'10px 16px', borderTop: (allDirectHoldings.length>0||(division.subdivisions||[]).length>0) ? '1px solid var(--border)' : 'none' }}>
              <button className="btn btn-success btn-sm" onClick={() => setShowAddHolding(true)}>+ Add Holding</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddSubMode(m => !m)}>+ Subdivision</button>
              {addSubMode && (
                <div className="flex gap-2 items-center flex-1" style={{ marginLeft:8 }}>
                  <input className="input input-sm" style={{ width:160 }} placeholder="Subdivision name" value={newSubName} onChange={e => setNewSubName(e.target.value)} autoFocus />
                  <input className="input input-sm" style={{ width:70 }} type="number" placeholder="Target %" value={newSubTarget} onChange={e => setNewSubTarget(e.target.value)} />
                  <button className="btn btn-primary btn-xs" onClick={addSubdivision}>Add</button>
                  <button className="btn btn-secondary btn-xs" onClick={() => setAddSubMode(false)}>Cancel</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function SubdivisionBlock({ subdivision, divisionId, analytics, divisionCurrent, totalPortfolioCurrent, onUpdate, onRefresh, refreshingId, editingHolding, setEditingHolding }) {
  const [editMode, setEditMode] = useState(false)
  const [expanded, setExpanded] = useState(true)
  const [name, setName] = useState(subdivision.name)
  const [targetPct, setTargetPct] = useState(subdivision.targetPercent)
  const [showAdd, setShowAdd] = useState(false)

  async function save() {
    await api.updateSubdivision(subdivision.id, { name, targetPercent: Number(targetPct)||0 })
    setEditMode(false); onUpdate?.()
  }
  async function del() {
    if (!confirm(`Delete subdivision "${subdivision.name}"?`)) return
    await api.deleteSubdivision(subdivision.id); onUpdate?.()
  }

  const subCurrent  = analytics.current  || 0
  const subInvested = analytics.invested || 0
  const profit      = analytics.profit   || 0
  const profitPct   = subInvested > 0 ? (profit / subInvested * 100) : 0
  const count       = (subdivision.holdings || []).length
  const pctOfDiv    = divisionCurrent     > 0 ? (subCurrent / divisionCurrent     * 100) : 0
  const pctOfTotal  = totalPortfolioCurrent > 0 ? (subCurrent / totalPortfolioCurrent * 100) : 0
  const targetOfDiv = Number(subdivision.targetPercent) || 0
  const divGap      = targetOfDiv - pctOfDiv   // positive = under-weight vs division target
  const needed      = targetOfDiv > 0 && divisionCurrent > 0
    ? Math.max(0, (targetOfDiv / 100) * (divisionCurrent + Math.max(0, divGap / 100 * divisionCurrent)) - subCurrent)
    : 0

  // Sort holdings by current value desc
  const sortedHoldings = [...(subdivision.holdings||[])].sort((a,b) => (b.current||0)-(a.current||0))

  return (
    <div style={{ borderBottom:'1px solid var(--border)' }}>
      <div className="sub-row flex items-center gap-2" style={{ padding:'8px 16px', background:'rgba(255,255,255,0.02)', flexWrap:'wrap' }}>
        <button className="btn-icon" style={{ fontSize:11, padding:'2px 4px', color:'var(--text3)' }} onClick={() => setExpanded(e => !e)}>
          {expanded ? '▾' : '▸'}
        </button>
        <span style={{ fontSize:11, color:'var(--text3)', fontWeight:700 }}>↳</span>
        {editMode ? (
          <>
            <input className="input input-sm" style={{ width:150 }} value={name} onChange={e => setName(e.target.value)} autoFocus />
            <input className="input input-sm" style={{ width:65 }} type="number" placeholder="Target % of div" value={targetPct} onChange={e => setTargetPct(e.target.value)} />
            <button className="btn btn-primary btn-xs" onClick={save}>Save</button>
            <button className="btn btn-secondary btn-xs" onClick={() => setEditMode(false)}>Cancel</button>
          </>
        ) : (
          <>
            <span style={{ fontWeight:700, color:'var(--text)', fontSize:13 }}>{subdivision.name}</span>

            {/* Value */}
            <span style={{ fontWeight:700, fontSize:13, color:'var(--purple)' }}>{fmt(subCurrent)}</span>

            {/* P/L */}
            {profit !== 0 && (
              <span className={`text-xs ${profit>=0?'pos':'neg'}`}>
                {profit>=0?'+':''}{fmt(profit)} ({profitPct>=0?'+':''}{profitPct.toFixed(1)}%)
              </span>
            )}

            {/* Holdings count */}
            <span style={{ fontSize:11, color:'var(--text3)', background:'var(--surface2)', padding:'1px 6px', borderRadius:4 }}>
              {count} {count===1?'holding':'holdings'}
            </span>

            {/* Portfolio % */}
            {subCurrent > 0 && (
              <span style={{ fontSize:11 }}>
                <span style={{ color:'var(--indigo)' }}>{pctOfTotal.toFixed(1)}%</span>
                <span style={{ color:'var(--text3)' }}> portfolio</span>
              </span>
            )}

            {/* Division % vs target */}
            {subCurrent > 0 && (
              <span style={{ fontSize:11 }}>
                <span style={{ color:'var(--cyan)' }}>{pctOfDiv.toFixed(1)}%</span>
                {targetOfDiv > 0 && (
                  <>
                    <span style={{ color:'var(--text3)' }}> / </span>
                    <span style={{ color:'var(--green)' }}>{targetOfDiv}%</span>
                    <span style={{ color:'var(--text3)' }}> div target</span>
                    {Math.abs(divGap) > 0.5 && (
                      <span style={{ color: divGap > 0 ? 'var(--orange)' : 'var(--text3)', marginLeft:4 }}>
                        {divGap > 0 ? `↑ ${fmt(needed)} needed` : `↓ ${Math.abs(divGap).toFixed(1)}% over`}
                      </span>
                    )}
                  </>
                )}
              </span>
            )}

            <div className="action-group">
              <button className="btn-icon" title="Edit" onClick={() => setEditMode(true)}>✏️</button>
              <button className="btn-icon" title="Delete" onClick={del}>🗑️</button>
            </div>
          </>
        )}
        <div className="ml-auto">
          {showAdd
            ? <button className="btn btn-secondary btn-xs" onClick={() => setShowAdd(false)}>Cancel</button>
            : <button className="btn btn-success btn-xs" onClick={() => setShowAdd(true)}>+ Holding</button>}
        </div>
      </div>

      {expanded && showAdd && (
        <div className="add-holding-panel" style={{ paddingLeft:32 }}>
          <AddHoldingForm divisionId={divisionId} subdivisionId={subdivision.id} subdivisions={[]}
            onSave={() => { setShowAdd(false); onUpdate?.() }}
            onCancel={() => setShowAdd(false)} />
        </div>
      )}

      {expanded && sortedHoldings.length > 0 && (
        <HoldingsTable holdings={sortedHoldings} onUpdate={onUpdate}
          onRefresh={onRefresh} refreshingId={refreshingId}
          editingHolding={editingHolding} setEditingHolding={setEditingHolding}
          parentCurrent={subCurrent} totalCurrent={totalPortfolioCurrent} indent />
      )}
    </div>
  )
}

function HoldingsTable({ holdings, onUpdate, onRefresh, refreshingId, editingHolding, setEditingHolding, indent, parentCurrent, totalCurrent }) {
  return (
    <div style={{ overflowX:'auto', paddingLeft: indent ? 16 : 0 }}>
      <table className="holdings-table">
        <thead>
          <tr>
            <th>Name</th><th>Platform</th><th>Type</th>
            <th className="right">Units</th><th className="right">Avg ₹</th>
            <th className="right">Cur ₹</th><th className="right">Invested</th>
            <th className="right">Current</th><th className="right">P/L</th><th></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => (
            editingHolding === h.id
              ? <EditHoldingRow key={h.id} holding={h} onSave={() => { setEditingHolding(null); onUpdate?.() }} onCancel={() => setEditingHolding(null)} />
              : <HoldingRow key={h.id} holding={h} onEdit={() => setEditingHolding(h.id)} onRefresh={onRefresh}
                  refreshing={refreshingId === h.id} parentCurrent={parentCurrent} totalCurrent={totalCurrent}
                  onDelete={async () => { if (confirm(`Delete "${h.name}"?`)) { await api.deleteHolding(h.id); onUpdate?.() } }} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HoldingRow({ holding: h, onEdit, onRefresh, refreshing, onDelete, parentCurrent, totalCurrent }) {
  const profit    = (h.current||0) - (h.invested||0)
  const profitPct = h.invested > 0 ? (profit / h.invested) * 100 : 0
  const platform  = PLATFORMS[h.platform] || PLATFORMS.other
  const canRefresh = h.ticker || h.schemeCode
  const pctOfParent = parentCurrent > 0 && h.current > 0 ? (h.current / parentCurrent * 100) : 0
  const pctOfTotal  = totalCurrent  > 0 && h.current > 0 ? (h.current / totalCurrent  * 100) : 0

  return (
    <tr>
      <td>
        <div style={{ fontWeight:600, fontSize:13 }}>{h.name}</div>
        {h.ticker    && <div style={{ fontSize:11, color:'var(--text3)' }}>{h.ticker}</div>}
        {h.schemeCode && <div style={{ fontSize:11, color:'var(--text3)' }}>MF #{h.schemeCode}</div>}
        {h.note      && <div style={{ fontSize:11, color:'var(--text3)', fontStyle:'italic' }}>{h.note}</div>}
      </td>
      <td><span className={`platform-badge ${platform.cls}`}>{platform.icon} {platform.label}</span></td>
      <td><span className="asset-type">{ASSET_TYPES[h.assetType] || h.assetType || '—'}</span></td>
      <td className="right num">{h.units > 0 ? h.units.toLocaleString('en-IN',{maximumFractionDigits:4}) : '—'}</td>
      <td className="right num" style={{ color:'var(--text2)' }}>
        {h.buyPrice > 0 ? (
          h.currency && h.foreignBuyPrice > 0
            ? <div>
                <div>{CURRENCIES[h.currency]?.symbol || h.currency}{h.foreignBuyPrice.toLocaleString('en-IN',{maximumFractionDigits:4})}</div>
                <div style={{ fontSize:10, color:'var(--text3)' }}>₹{h.buyPrice.toLocaleString('en-IN',{maximumFractionDigits:2})}</div>
              </div>
            : `₹${h.buyPrice.toLocaleString('en-IN',{maximumFractionDigits:2})}`
        ) : '—'}
      </td>
      <td className="right num">
        {h.currentPrice > 0 ? (
          <div>
            {h.currency && h.foreignCurrentPrice > 0
              ? <div style={{ color:'var(--cyan)' }}>{CURRENCIES[h.currency]?.symbol || h.currency}{h.foreignCurrentPrice.toLocaleString('en-IN',{maximumFractionDigits:4})}</div>
              : <div style={{ color:'var(--cyan)' }}>₹{h.currentPrice.toLocaleString('en-IN',{maximumFractionDigits:2})}</div>}
            {h.exchangeRate && <div style={{ fontSize:10, color:'var(--text3)' }}>@ ₹{h.exchangeRate.toFixed(2)}/{h.currency}</div>}
            {h.priceDate && <div style={{ fontSize:10, color:'var(--text3)' }}>{h.priceDate}</div>}
          </div>
        ) : '—'}
      </td>
      <td className="right num" style={{ color:'var(--text2)' }}>
        {h.currency && h.foreignInvested > 0
          ? <div>
              <div>{CURRENCIES[h.currency]?.symbol || h.currency}{h.foreignInvested.toLocaleString('en-IN',{maximumFractionDigits:2})}</div>
              <div style={{ fontSize:10, color:'var(--text3)' }}>{fmt(h.invested)}</div>
            </div>
          : fmt(h.invested)}
      </td>
      <td className="right num">
        {h.currency && h.foreignCurrent > 0
          ? <div>
              <div style={{ color:'var(--purple)' }}>{CURRENCIES[h.currency]?.symbol || h.currency}{h.foreignCurrent.toLocaleString('en-IN',{maximumFractionDigits:2})}</div>
              <div style={{ fontSize:10, color:'var(--text3)' }}>{fmt(h.current)} INR</div>
            </div>
          : <div style={{ color:'var(--purple)' }}>{fmt(h.current)}</div>}
        {(pctOfParent > 0 || pctOfTotal > 0) && (
          <div style={{ fontSize:10, marginTop:2, lineHeight:1.4 }}>
            {pctOfParent > 0 && <span style={{ color:'var(--cyan)' }}>{pctOfParent.toFixed(1)}% grp</span>}
            {pctOfParent > 0 && pctOfTotal > 0 && <span style={{ color:'var(--text3)' }}> · </span>}
            {pctOfTotal  > 0 && <span style={{ color:'var(--indigo)' }}>{pctOfTotal.toFixed(1)}% all</span>}
          </div>
        )}
      </td>
      <td className="right num">
        <span className={profit>=0?'pos':'neg'}>
          {profit>=0?'+':''}{fmt(profit)}<br />
          <span className="text-xs">{profitPct>=0?'+':''}{profitPct.toFixed(1)}%</span>
        </span>
      </td>
      <td>
        <div className="flex gap-1 items-center">
          {canRefresh && <button className="btn-icon" title="Refresh price" onClick={() => onRefresh(h)}>{refreshing ? <span className="spin">⟳</span> : '⟳'}</button>}
          <button className="btn-icon" onClick={onEdit} title="Edit">✏️</button>
          <button className="btn-icon" onClick={onDelete} title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  )
}

function EditHoldingRow({ holding, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: holding.name || '', platform: holding.platform || 'other', assetType: holding.assetType || 'stock',
    ticker: holding.ticker || '', schemeCode: holding.schemeCode || '',
    units: holding.units ? String(holding.units) : '',
    buyPrice: holding.foreignBuyPrice ? String(holding.foreignBuyPrice) : (holding.buyPrice ? String(holding.buyPrice) : ''),
    currentPrice: holding.foreignCurrentPrice ? String(holding.foreignCurrentPrice) : (holding.currentPrice ? String(holding.currentPrice) : ''),
    invested: holding.foreignInvested ? String(holding.foreignInvested) : (holding.invested ? String(holding.invested) : ''),
    current: holding.foreignCurrent ? String(holding.foreignCurrent) : (holding.current ? String(holding.current) : ''),
    note: holding.note || '',
    currency: holding.currency || 'USD',
  })
  const [saving, setSaving] = useState(false)
  const [buyMore, setBuyMore] = useState(false)
  const [bmMode, setBmMode] = useState('units')
  const [bmQty, setBmQty] = useState('')
  const [bmPrice, setBmPrice] = useState('')

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const u   = Number(form.units)
  const p   = Number(form.buyPrice)
  const inv = Number(form.invested)
  const cp  = Number(form.currentPrice)
  const cur = Number(form.current)

  // Derive missing value from the other two
  const autoInvested  = u > 0 && p > 0 ? u * p : null
  const autoUnits     = !form.units && inv > 0 && p > 0 ? inv / p : null
  const autoBuyPrice  = !form.buyPrice && u > 0 && inv > 0 ? inv / u : null
  const autoCurrent   = (u > 0 || autoUnits) && cp > 0 ? (autoUnits || u) * cp : null

  // Effective values for Buy More
  const effUnits = autoUnits !== null ? autoUnits : u
  const effAvg   = autoBuyPrice !== null ? autoBuyPrice : p
  const effInv   = autoInvested !== null ? autoInvested : inv

  // Buy More calc
  const bmPriceN = Number(bmPrice)
  const bmQtyN   = Number(bmQty)
  const extraUnits  = bmMode === 'units' ? bmQtyN : (bmPriceN > 0 ? bmQtyN / bmPriceN : 0)
  const newTotalU   = effUnits + extraUnits
  const newTotalInv = effInv + (bmMode === 'units' ? extraUnits * bmPriceN : bmQtyN)
  const newAvg      = newTotalU > 0 ? newTotalInv / newTotalU : 0

  function applyBuyMore() {
    if (!bmPrice || !bmQty) return
    setForm(f => ({
      ...f,
      units:     String(Math.round(newTotalU * 10000) / 10000),
      buyPrice:  String(Math.round(newAvg * 100) / 100),
      invested:  String(Math.round(newTotalInv * 100) / 100),
    }))
    setBuyMore(false); setBmQty(''); setBmPrice('')
  }

  async function save() {
    setSaving(true)
    try {
      const finalUnits    = autoUnits    !== null ? autoUnits    : u
      const finalBuyPrice = autoBuyPrice !== null ? autoBuyPrice : p
      const finalInvested = autoInvested !== null ? autoInvested : inv
      const finalCurrent  = autoCurrent  !== null ? autoCurrent  : cur
      const isForeignType = form.assetType === 'foreign'
      let payload = {
        name: form.name, platform: form.platform, assetType: form.assetType,
        ticker: form.ticker, schemeCode: form.schemeCode,
        units: finalUnits, buyPrice: finalBuyPrice, currentPrice: cp || 0,
        invested: finalInvested, current: finalCurrent, note: form.note,
      }
      if (isForeignType) {
        const rate = await fetchRateToInr(form.currency)
        if (!rate) throw new Error(`Could not fetch ${form.currency}/INR rate`)
        payload = {
          ...payload,
          currency: form.currency,
          exchangeRate: rate,
          foreignBuyPrice: finalBuyPrice,
          foreignCurrentPrice: cp || 0,
          foreignInvested: finalInvested,
          foreignCurrent: finalCurrent,
          buyPrice: Math.round(finalBuyPrice * rate * 100) / 100,
          currentPrice: Math.round((cp || 0) * rate * 100) / 100,
          invested: Math.round(finalInvested * rate * 100) / 100,
          current: Math.round(finalCurrent * rate * 100) / 100,
        }
      }
      await api.updateHolding(holding.id, payload)
      onSave()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  const isMf = form.assetType === 'mf'
  const isFd = form.assetType === 'fd'
  const isForeign = form.assetType === 'foreign'
  const currSym = isForeign ? (CURRENCIES[form.currency]?.symbol || form.currency) : '₹'

  return (
    <tr style={{ background:'rgba(34,211,238,0.04)' }}>
      <td colSpan={10}>
        {/* Row 1: Platform / Type / Name / Ticker */}
        <div className="flex gap-2 flex-wrap items-center" style={{ padding:'8px 0 4px' }}>
          <select className="input input-sm" style={{ width:100 }} value={form.platform} onChange={e => set('platform', e.target.value)}>
            {Object.entries(PLATFORMS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input input-sm" style={{ width:88 }} value={form.assetType} onChange={e => set('assetType', e.target.value)}>
            {Object.entries(ASSET_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          <NameSearch assetType={form.assetType} value={form.name}
            onChange={v => set('name', v)}
            onSelectMf={async s => {
              setForm(f => ({ ...f, name: s.schemeName, schemeCode: String(s.schemeCode), ticker:'' }))
              try { const navs = await api.mfNav([String(s.schemeCode)]); const nav = navs[String(s.schemeCode)]?.price; if (nav) set('currentPrice', String(nav)) } catch(_) {}
            }}
            onSelectStock={s => setForm(f => ({ ...f, name: s.name, ticker: s.symbol }))}
          />
          {isMf
            ? <input className="input input-sm" style={{ width:95 }} placeholder="Scheme #" value={form.schemeCode} onChange={e => set('schemeCode', e.target.value)} />
            : <input className="input input-sm" style={{ width:110 }} placeholder="Ticker e.g. INFY" value={form.ticker} onChange={e => set('ticker', e.target.value)} />
          }
          {isForeign && (
            <select className="input input-sm" style={{ width:80 }} value={form.currency} onChange={e => set('currency', e.target.value)}>
              {Object.entries(CURRENCIES).map(([k,v]) => <option key={k} value={k}>{k} {v.symbol}</option>)}
            </select>
          )}
        </div>

        {isForeign && (
          <div style={{ fontSize:11, color:'var(--indigo)', padding:'2px 0 4px', fontStyle:'italic' }}>
            Enter amounts in {form.currency}. INR value will be computed using live exchange rate on save.
          </div>
        )}

        {/* Row 2: Price/value inputs */}
        {!isFd ? (
          <div className="flex gap-2 flex-wrap items-end" style={{ padding:'4px 0' }}>
            <div className="form-group">
              <label className="form-label">
                Units {autoUnits !== null && <span style={{ color:'var(--cyan)' }}>→ {autoUnits.toFixed(4)}</span>}
              </label>
              <input className="input input-sm" style={{ width:85 }} type="number" placeholder="qty" value={form.units} onChange={e => set('units', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">
                Avg Buy <span style={{ fontSize:10, color:'var(--text3)' }}>(per unit)</span> {currSym} {autoBuyPrice !== null && <span style={{ color:'var(--cyan)' }}>→ {autoBuyPrice.toFixed(4)}</span>}
              </label>
              <input className="input input-sm" style={{ width:95 }} type="number" placeholder={`${currSym}/unit`} value={form.buyPrice} onChange={e => set('buyPrice', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cur Price <span style={{ fontSize:10, color:'var(--text3)' }}>(per unit)</span> {currSym}</label>
              <input className="input input-sm" style={{ width:95 }} type="number" placeholder={`${currSym}/unit`} value={form.currentPrice} onChange={e => set('currentPrice', e.target.value)} />
            </div>
            {!form.units && (
              <div className="form-group">
                <label className="form-label">Invested {currSym}</label>
                <input className="input input-sm" style={{ width:100 }} type="number" placeholder={`${currSym} total`} value={form.invested} onChange={e => set('invested', e.target.value)} />
              </div>
            )}
            {!form.units && !form.currentPrice && (
              <div className="form-group">
                <label className="form-label">Current {currSym}</label>
                <input className="input input-sm" style={{ width:100 }} type="number" placeholder={`${currSym} total`} value={form.current} onChange={e => set('current', e.target.value)} />
              </div>
            )}
          </div>
        ) : (
          <div className="flex gap-2 flex-wrap items-end" style={{ padding:'4px 0' }}>
            <div className="form-group">
              <label className="form-label">Invested ₹</label>
              <input className="input input-sm" style={{ width:120 }} type="number" value={form.invested} onChange={e => set('invested', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Current ₹</label>
              <input className="input input-sm" style={{ width:120 }} type="number" value={form.current} onChange={e => set('current', e.target.value)} />
            </div>
          </div>
        )}

        {/* Auto-computed summary */}
        {(autoInvested || autoUnits || autoCurrent) && (
          <div className="flex gap-3 flex-wrap" style={{ padding:'4px 0 2px', fontSize:12, background:'rgba(34,211,238,0.06)', borderRadius:6, padding:'6px 10px', marginTop:2 }}>
            {autoUnits    && <span style={{ color:'var(--cyan)' }}>Units: {autoUnits.toFixed(4)}</span>}
            {autoInvested && <span style={{ color:'var(--cyan)' }}>Total Invested: <strong>{isForeign ? `${currSym}${autoInvested.toFixed(2)}` : fmt(autoInvested)}</strong></span>}
            {autoCurrent  && <span style={{ color:'var(--cyan)' }}>Total Current: <strong>{isForeign ? `${currSym}${autoCurrent.toFixed(2)}` : fmt(autoCurrent)}</strong></span>}
            {isForeign && autoCurrent && <span style={{ color:'var(--text3)', fontSize:11 }}>← verify this matches your platform's total</span>}
          </div>
        )}

        {/* Buy More */}
        {!isFd && effUnits > 0 && (
          <div style={{ padding:'4px 0' }}>
            {!buyMore ? (
              <button className="btn btn-ghost btn-xs" onClick={() => setBuyMore(true)}>+ Buy More (recalculate avg)</button>
            ) : (
              <div className="flex gap-2 flex-wrap items-center" style={{ background:'rgba(251,146,60,0.06)', padding:'8px 10px', borderRadius:6, marginTop:4 }}>
                <span style={{ fontSize:12, color:'var(--orange)', fontWeight:700 }}>Buy More</span>
                <div className="flex gap-1">
                  <button className={`btn btn-xs ${bmMode==='units'?'btn-primary':'btn-ghost'}`} onClick={() => setBmMode('units')}>By Units</button>
                  <button className={`btn btn-xs ${bmMode==='amount'?'btn-primary':'btn-ghost'}`} onClick={() => setBmMode('amount')}>By Amount</button>
                </div>
                <input className="input input-sm" style={{ width:100 }} type="number"
                  placeholder={bmMode==='units' ? 'Extra units' : 'Total ₹ invested'}
                  value={bmQty} onChange={e => setBmQty(e.target.value)} />
                <span className="text-dim" style={{ fontSize:12 }}>@</span>
                <input className="input input-sm" style={{ width:95 }} type="number"
                  placeholder="₹ per unit" value={bmPrice} onChange={e => setBmPrice(e.target.value)} />
                {newTotalU > effUnits && newAvg > 0 && (
                  <span style={{ fontSize:11, color:'var(--cyan)' }}>
                    → {newTotalU.toFixed(4)} units @ ₹{newAvg.toFixed(2)} avg
                  </span>
                )}
                <button className="btn btn-primary btn-xs" onClick={applyBuyMore} disabled={!bmPrice||!bmQty}>Apply</button>
                <button className="btn btn-ghost btn-xs" onClick={() => setBuyMore(false)}>✕</button>
              </div>
            )}
          </div>
        )}

        {/* Note + Save/Cancel */}
        <div className="flex gap-2 items-center" style={{ padding:'6px 0' }}>
          <input className="input input-sm" style={{ flex:1, maxWidth:200 }} placeholder="Note (optional)" value={form.note} onChange={e => set('note', e.target.value)} />
          <button className="btn btn-primary btn-xs" onClick={save} disabled={saving}>{saving?'...':'Save'}</button>
          <button className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
        </div>
      </td>
    </tr>
  )
}

function AddHoldingForm({ divisionId, subdivisionId, subdivisions, onSave, onCancel }) {
  const [form, setForm] = useState({
    name:'', platform:'kite', assetType:'stock', ticker:'', schemeCode:'',
    units:'', buyPrice:'', currentPrice:'', invested:'', current:'', note:'',
    subdivisionId: subdivisionId || '', currency: 'USD',
  })
  const [saving, setSaving] = useState(false)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const u   = Number(form.units)
  const p   = Number(form.buyPrice)
  const inv = Number(form.invested)
  const cp  = Number(form.currentPrice)

  const autoInvested = u > 0 && p > 0 ? u * p : null
  const autoUnits    = !form.units && inv > 0 && p > 0 ? inv / p : null
  const autoBuyPrice = !form.buyPrice && u > 0 && inv > 0 ? inv / u : null
  const autoCurrent  = (u > 0 || autoUnits) && cp > 0 ? (autoUnits || u) * cp : null

  const isMf = form.assetType === 'mf'
  const isFd = form.assetType === 'fd'
  const isForeign = form.assetType === 'foreign'
  const isStock = ['stock','etf','foreign','gold'].includes(form.assetType)
  const currSym = isForeign ? (CURRENCIES[form.currency]?.symbol || form.currency) : '₹'

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    try {
      const finalUnits    = autoUnits    !== null ? autoUnits    : u
      const finalBuyPrice = autoBuyPrice !== null ? autoBuyPrice : p
      const finalInvested = autoInvested !== null ? autoInvested : inv
      const finalCurrent  = autoCurrent  !== null ? autoCurrent  : Number(form.current) || 0
      let payload = {
        name: form.name, platform: form.platform, assetType: form.assetType,
        ticker: form.ticker, schemeCode: form.schemeCode,
        units: finalUnits, buyPrice: finalBuyPrice, currentPrice: cp || 0,
        invested: finalInvested, current: finalCurrent, note: form.note,
        subdivisionId: form.subdivisionId || subdivisionId || undefined,
      }
      if (isForeign) {
        const rate = await fetchRateToInr(form.currency)
        if (!rate) throw new Error(`Could not fetch ${form.currency}/INR rate`)
        payload = {
          ...payload,
          currency: form.currency,
          exchangeRate: rate,
          foreignBuyPrice: finalBuyPrice,
          foreignCurrentPrice: cp || 0,
          foreignInvested: finalInvested,
          foreignCurrent: finalCurrent,
          buyPrice: Math.round(finalBuyPrice * rate * 100) / 100,
          currentPrice: Math.round((cp || 0) * rate * 100) / 100,
          invested: Math.round(finalInvested * rate * 100) / 100,
          current: Math.round(finalCurrent * rate * 100) / 100,
        }
      }
      await api.addHolding(divisionId, payload)
      onSave()
    } catch (e) { alert('Failed to add: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <div>
      <div className="flex gap-2 flex-wrap items-end" style={{ marginBottom:8 }}>
        <div className="form-group">
          <label className="form-label">Platform</label>
          <select className="input input-sm" style={{ width:105 }} value={form.platform} onChange={e => set('platform', e.target.value)}>
            {Object.entries(PLATFORMS).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="input input-sm" style={{ width:90 }} value={form.assetType} onChange={e => set('assetType', e.target.value)}>
            {Object.entries(ASSET_TYPES).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="form-group relative" style={{ flex:1, minWidth:200 }}>
          <label className="form-label">{isMf ? 'Search MF Name' : isStock ? 'Search Stock / ETF' : 'Name'}</label>
          <NameSearch assetType={form.assetType} value={form.name}
            onChange={v => set('name', v)}
            onSelectMf={async s => {
              setForm(f => ({ ...f, name: s.schemeName, schemeCode: String(s.schemeCode), ticker:'' }))
              try { const navs = await api.mfNav([String(s.schemeCode)]); const nav = navs[String(s.schemeCode)]?.price; if (nav) set('currentPrice', String(nav)) } catch(_) {}
            }}
            onSelectStock={s => setForm(f => ({ ...f, name: s.name, ticker: s.symbol }))}
          />
        </div>
        {isStock && !isForeign && (
          <div className="form-group">
            <label className="form-label">Ticker</label>
            <input className="input input-sm" style={{ width:120 }} placeholder="e.g. INFY" value={form.ticker} onChange={e => set('ticker', e.target.value)} />
          </div>
        )}
        {isForeign && (
          <>
            <div className="form-group">
              <label className="form-label">Ticker</label>
              <input className="input input-sm" style={{ width:100 }} placeholder="e.g. AAPL" value={form.ticker} onChange={e => set('ticker', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Currency</label>
              <select className="input input-sm" style={{ width:85 }} value={form.currency} onChange={e => set('currency', e.target.value)}>
                {Object.entries(CURRENCIES).map(([k,v]) => <option key={k} value={k}>{k} {v.symbol}</option>)}
              </select>
            </div>
          </>
        )}
        {isMf && form.schemeCode && (
          <div className="form-group">
            <label className="form-label">Scheme #</label>
            <input className="input input-sm" style={{ width:90 }} value={form.schemeCode} onChange={e => set('schemeCode', e.target.value)} />
          </div>
        )}
        {!subdivisionId && subdivisions.length > 0 && (
          <div className="form-group">
            <label className="form-label">Subdivision</label>
            <select className="input input-sm" style={{ width:120 }} value={form.subdivisionId} onChange={e => set('subdivisionId', e.target.value)}>
              <option value="">Direct (none)</option>
              {subdivisions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      {isForeign && (
        <div style={{ fontSize:11, color:'var(--indigo)', padding:'0 0 6px', fontStyle:'italic' }}>
          Enter amounts in {form.currency} ({CURRENCIES[form.currency]?.name}). INR value computed via live rate on save.
        </div>
      )}

      <div className="flex gap-2 flex-wrap items-end">
        {!isFd && (
          <>
            <div className="form-group">
              <label className="form-label">
                Units {autoUnits !== null && <span style={{ color:'var(--cyan)' }}>→ {autoUnits.toFixed(4)}</span>}
              </label>
              <input className="input input-sm" style={{ width:80 }} type="number" placeholder="0" value={form.units} onChange={e => set('units', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">
                Avg Buy <span style={{ fontSize:10, color:'var(--text3)' }}>(per unit)</span> {currSym} {autoBuyPrice !== null && <span style={{ color:'var(--cyan)' }}>→ {autoBuyPrice.toFixed(4)}</span>}
              </label>
              <input className="input input-sm" style={{ width:90 }} type="number" placeholder="0" value={form.buyPrice} onChange={e => set('buyPrice', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cur Price <span style={{ fontSize:10, color:'var(--text3)' }}>(per unit)</span> {currSym}</label>
              <input className="input input-sm" style={{ width:90 }} type="number" placeholder="0" value={form.currentPrice} onChange={e => set('currentPrice', e.target.value)} />
            </div>
          </>
        )}
        {(isFd || !form.units) && (
          <div className="form-group">
            <label className="form-label">Invested {currSym}</label>
            <input className="input input-sm" style={{ width:100 }} type="number" placeholder="0" value={form.invested} onChange={e => set('invested', e.target.value)} />
          </div>
        )}
        {(isFd || (!form.units && !form.currentPrice)) && (
          <div className="form-group">
            <label className="form-label">Current {currSym}</label>
            <input className="input input-sm" style={{ width:100 }} type="number" placeholder="0" value={form.current} onChange={e => set('current', e.target.value)} />
          </div>
        )}
        <div className="form-group" style={{ flex:1, minWidth:120 }}>
          <label className="form-label">Note (optional)</label>
          <input className="input input-sm" placeholder="e.g. SIP" value={form.note} onChange={e => set('note', e.target.value)} />
        </div>
        <div className="flex gap-2 items-center" style={{ paddingBottom:2 }}>
          {autoInvested !== null && <span className="text-xs text-muted">Inv: {isForeign ? `${currSym}${autoInvested.toFixed(2)}` : fmt(autoInvested)}</span>}
          {autoCurrent  !== null && <span className="text-xs text-muted">Cur: {isForeign ? `${currSym}${autoCurrent.toFixed(2)}` : fmt(autoCurrent)}</span>}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.name}>{saving ? (isForeign ? '⟳ Fetching rate…' : '…') : '+ Add'}</button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}
