import React, { useState, useRef } from 'react'
import { api } from '../api'

const PLATFORMS = {
  kite:     { label: 'Kite',      cls: 'platform-kite',     icon: '⚡' },
  groww:    { label: 'Groww',     cls: 'platform-groww',    icon: '🌱' },
  indmoney: { label: 'IndMoney',  cls: 'platform-indmoney', icon: '🌐' },
  bank:     { label: 'Bank',      cls: 'platform-bank',     icon: '🏦' },
  other:    { label: 'Other',     cls: 'platform-other',    icon: '•' },
}
const ASSET_TYPES = {
  stock:   'Stock',
  etf:     'ETF',
  mf:      'MF',
  fd:      'FD',
  foreign: 'Foreign',
  gold:    'Gold',
}

function fmt(n) {
  if (!n) return '₹0'
  return Math.abs(n) >= 1e7 ? `₹${(n / 1e7).toFixed(2)}Cr`
    : Math.abs(n) >= 1e5 ? `₹${(n / 1e5).toFixed(1)}L`
    : `₹${Math.round(n).toLocaleString('en-IN')}`
}

export default function DivisionCard({ division, analytics, onUpdate }) {
  const [expanded, setExpanded] = useState(true)
  const [editingName, setEditingName] = useState(division.name)
  const [editingTarget, setEditingTarget] = useState(division.targetPercent)
  const [editingHeader, setEditingHeader] = useState(false)
  const [showAddHolding, setShowAddHolding] = useState(false)
  const [editingHolding, setEditingHolding] = useState(null) // holding id
  const [addSubMode, setAddSubMode] = useState(false)
  const [newSubName, setNewSubName] = useState('')
  const [newSubTarget, setNewSubTarget] = useState('')
  const [refreshingId, setRefreshingId] = useState(null)
  const isSaving = useRef(false)

  React.useEffect(() => {
    if (!isSaving.current) {
      setEditingName(division.name)
      setEditingTarget(division.targetPercent)
    }
  }, [division.name, division.targetPercent])

  const divAna = analytics.divisions?.find(d => d.id === division.id) || {}
  const invested = divAna.invested || 0
  const current = divAna.current || 0
  const profit = divAna.profit || 0
  const profitPct = invested > 0 ? (profit / invested) * 100 : 0
  const currentPct = divAna.currentPercent || 0
  const targetPct = Number(editingTarget) || 0
  const delta = targetPct - currentPct

  const allDirectHoldings = division.holdings || []

  async function saveHeader() {
    if (isSaving.current) return
    isSaving.current = true
    try {
      await api.updateDivision(division.id, { name: editingName, targetPercent: Number(editingTarget) || 0 })
      onUpdate?.()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { isSaving.current = false; setEditingHeader(false) }
  }

  async function deleteDivision() {
    if (!confirm(`Delete division "${division.name}" and all its holdings?`)) return
    await api.deleteDivision(division.id)
    onUpdate?.()
  }

  async function addSubdivision() {
    if (!newSubName) return
    await api.addSubdivision(division.id, { name: newSubName, targetPercent: Number(newSubTarget) || 0 })
    setNewSubName(''); setNewSubTarget(''); setAddSubMode(false)
    onUpdate?.()
  }

  async function refreshPrice(holding) {
    setRefreshingId(holding.id)
    try { await api.refreshHoldingPrice(holding.id); onUpdate?.() }
    catch (e) { alert('Price fetch failed: ' + e.message) }
    finally { setRefreshingId(null) }
  }

  return (
    <div className="div-card">
      {/* Header */}
      <div className="div-header" onClick={() => !editingHeader && setExpanded(e => !e)}>
        <span className={`chevron${expanded ? ' open' : ''}`}>▶</span>

        {editingHeader ? (
          <div className="flex gap-2 items-center flex-1" onClick={e => e.stopPropagation()}>
            <input className="input input-sm" style={{ width: 180 }} value={editingName} onChange={e => setEditingName(e.target.value)} autoFocus />
            <input className="input input-sm" style={{ width: 70 }} type="number" placeholder="Target %" value={editingTarget} onChange={e => setEditingTarget(e.target.value)} />
            <button className="btn btn-primary btn-xs" onClick={saveHeader}>Save</button>
            <button className="btn btn-secondary btn-xs" onClick={() => { setEditingHeader(false); setEditingName(division.name); setEditingTarget(division.targetPercent) }}>Cancel</button>
          </div>
        ) : (
          <>
            <span className="div-name">{division.name}</span>
            <div className="div-stats">
              <span className="div-stat"><strong style={{ color: 'var(--purple)' }}>{fmt(current)}</strong></span>
              <span className="div-stat" style={{ color: profit >= 0 ? 'var(--green)' : 'var(--red)' }}>
                {profit >= 0 ? '+' : ''}{fmt(profit)} ({profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%)
              </span>
              <span className="div-stat">
                <span style={{ color: 'var(--cyan)' }}>{currentPct.toFixed(1)}%</span>
                <span className="text-dim"> / {targetPct}% target</span>
              </span>
              {delta > 0.5 && <span className="div-stat" style={{ color: 'var(--orange)' }}>↑ {fmt(divAna.requiredAddition || 0)} needed</span>}
            </div>
            <div className="action-group" onClick={e => e.stopPropagation()}>
              <button className="btn-icon" title="Edit" onClick={() => setEditingHeader(true)}>✏️</button>
              <button className="btn-icon" title="Delete" onClick={deleteDivision}>🗑️</button>
            </div>
          </>
        )}
      </div>

      {/* Body */}
      {expanded && (
        <div className="div-body">
          {/* Subdivisions */}
          {(division.subdivisions || []).map(sub => (
            <SubdivisionBlock
              key={sub.id}
              subdivision={sub}
              divisionId={division.id}
              analytics={divAna.subdivisions?.find(s => s.id === sub.id) || {}}
              onUpdate={onUpdate}
              onRefresh={refreshPrice}
              refreshingId={refreshingId}
              editingHolding={editingHolding}
              setEditingHolding={setEditingHolding}
            />
          ))}

          {/* Direct holdings table */}
          {allDirectHoldings.length > 0 && (
            <HoldingsTable
              holdings={allDirectHoldings}
              onUpdate={onUpdate}
              onRefresh={refreshPrice}
              refreshingId={refreshingId}
              editingHolding={editingHolding}
              setEditingHolding={setEditingHolding}
            />
          )}

          {/* Add holding panel */}
          {showAddHolding ? (
            <div className="add-holding-panel">
              <AddHoldingForm
                divisionId={division.id}
                subdivisions={division.subdivisions || []}
                onSave={() => { setShowAddHolding(false); onUpdate?.() }}
                onCancel={() => setShowAddHolding(false)}
              />
            </div>
          ) : (
            <div className="flex gap-2 items-center" style={{ padding: '10px 16px', borderTop: allDirectHoldings.length > 0 || (division.subdivisions || []).length > 0 ? '1px solid var(--border)' : 'none' }}>
              <button className="btn btn-success btn-sm" onClick={() => setShowAddHolding(true)}>+ Add Holding</button>
              <button className="btn btn-ghost btn-sm" onClick={() => setAddSubMode(m => !m)}>+ Subdivision</button>
              {addSubMode && (
                <div className="flex gap-2 items-center flex-1" style={{ marginLeft: 8 }}>
                  <input className="input input-sm" style={{ width: 160 }} placeholder="Subdivision name" value={newSubName} onChange={e => setNewSubName(e.target.value)} autoFocus />
                  <input className="input input-sm" style={{ width: 70 }} type="number" placeholder="Target %" value={newSubTarget} onChange={e => setNewSubTarget(e.target.value)} />
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

function SubdivisionBlock({ subdivision, divisionId, analytics, onUpdate, onRefresh, refreshingId, editingHolding, setEditingHolding }) {
  const [editMode, setEditMode] = useState(false)
  const [name, setName] = useState(subdivision.name)
  const [targetPct, setTargetPct] = useState(subdivision.targetPercent)
  const [showAdd, setShowAdd] = useState(false)

  async function save() {
    await api.updateSubdivision(subdivision.id, { name, targetPercent: Number(targetPct) || 0 })
    setEditMode(false); onUpdate?.()
  }
  async function del() {
    if (!confirm(`Delete subdivision "${subdivision.name}"?`)) return
    await api.deleteSubdivision(subdivision.id); onUpdate?.()
  }

  const current = analytics.current || 0
  const profit = analytics.profit || 0

  return (
    <div style={{ borderBottom: '1px solid var(--border)' }}>
      <div className="flex items-center gap-2" style={{ padding: '8px 16px', background: 'rgba(255,255,255,0.02)' }}>
        <span style={{ fontSize: 11, color: 'var(--text3)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          ↳ Subdivision
        </span>
        {editMode ? (
          <>
            <input className="input input-sm" style={{ width: 150 }} value={name} onChange={e => setName(e.target.value)} autoFocus />
            <input className="input input-sm" style={{ width: 65 }} type="number" placeholder="%" value={targetPct} onChange={e => setTargetPct(e.target.value)} />
            <button className="btn btn-primary btn-xs" onClick={save}>Save</button>
            <button className="btn btn-secondary btn-xs" onClick={() => setEditMode(false)}>Cancel</button>
          </>
        ) : (
          <>
            <span style={{ fontWeight: 700, color: 'var(--text)', fontSize: 13 }}>{subdivision.name}</span>
            {subdivision.targetPercent > 0 && <span className="text-xs text-dim">Target: {subdivision.targetPercent}%</span>}
            <span className="text-xs" style={{ color: 'var(--purple)' }}>{fmt(current)}</span>
            {profit !== 0 && <span className={`text-xs ${profit >= 0 ? 'pos' : 'neg'}`}>{profit >= 0 ? '+' : ''}{fmt(profit)}</span>}
            <div className="action-group">
              <button className="btn-icon" onClick={() => setEditMode(true)}>✏️</button>
              <button className="btn-icon" onClick={del}>🗑️</button>
            </div>
          </>
        )}
        <div className="ml-auto">
          {showAdd ? (
            <button className="btn btn-secondary btn-xs" onClick={() => setShowAdd(false)}>Cancel</button>
          ) : (
            <button className="btn btn-success btn-xs" onClick={() => setShowAdd(true)}>+ Holding</button>
          )}
        </div>
      </div>

      {showAdd && (
        <div className="add-holding-panel" style={{ paddingLeft: 32 }}>
          <AddHoldingForm
            divisionId={divisionId}
            subdivisionId={subdivision.id}
            subdivisions={[]}
            onSave={() => { setShowAdd(false); onUpdate?.() }}
            onCancel={() => setShowAdd(false)}
          />
        </div>
      )}

      {(subdivision.holdings || []).length > 0 && (
        <HoldingsTable
          holdings={subdivision.holdings}
          onUpdate={onUpdate}
          onRefresh={onRefresh}
          refreshingId={refreshingId}
          editingHolding={editingHolding}
          setEditingHolding={setEditingHolding}
          indent
        />
      )}
    </div>
  )
}

function HoldingsTable({ holdings, onUpdate, onRefresh, refreshingId, editingHolding, setEditingHolding, indent }) {
  return (
    <div style={{ overflowX: 'auto', paddingLeft: indent ? 16 : 0 }}>
      <table className="holdings-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Platform</th>
            <th>Type</th>
            <th className="right">Units</th>
            <th className="right">Avg Price</th>
            <th className="right">Cur. Price</th>
            <th className="right">Invested</th>
            <th className="right">Current</th>
            <th className="right">P/L</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {holdings.map(h => (
            editingHolding === h.id
              ? <EditHoldingRow key={h.id} holding={h} onSave={() => { setEditingHolding(null); onUpdate?.() }} onCancel={() => setEditingHolding(null)} />
              : <HoldingRow key={h.id} holding={h} onEdit={() => setEditingHolding(h.id)} onRefresh={onRefresh} refreshing={refreshingId === h.id} onDelete={async () => { if (confirm(`Delete "${h.name}"?`)) { await api.deleteHolding(h.id); onUpdate?.() } }} />
          ))}
        </tbody>
      </table>
    </div>
  )
}

function HoldingRow({ holding: h, onEdit, onRefresh, refreshing, onDelete }) {
  const profit = (h.current || 0) - (h.invested || 0)
  const profitPct = h.invested > 0 ? (profit / h.invested) * 100 : 0
  const platform = PLATFORMS[h.platform] || PLATFORMS.other
  const canRefresh = h.ticker || h.schemeCode

  return (
    <tr>
      <td>
        <div style={{ fontWeight: 600, fontSize: 13 }}>{h.name}</div>
        {h.ticker && <div style={{ fontSize: 11, color: 'var(--text3)' }}>{h.ticker}</div>}
        {h.schemeCode && <div style={{ fontSize: 11, color: 'var(--text3)' }}>MF #{h.schemeCode}</div>}
        {h.note && <div style={{ fontSize: 11, color: 'var(--text3)', fontStyle: 'italic' }}>{h.note}</div>}
      </td>
      <td>
        <span className={`platform-badge ${platform.cls}`}>{platform.icon} {platform.label}</span>
      </td>
      <td>
        <span className="asset-type">{ASSET_TYPES[h.assetType] || h.assetType || '—'}</span>
      </td>
      <td className="right num">{h.units > 0 ? h.units.toLocaleString('en-IN', { maximumFractionDigits: 4 }) : '—'}</td>
      <td className="right num" style={{ color: 'var(--text2)' }}>{h.buyPrice > 0 ? `₹${h.buyPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}` : '—'}</td>
      <td className="right num">
        {h.currentPrice > 0 ? (
          <div>
            <div style={{ color: 'var(--cyan)' }}>₹{h.currentPrice.toLocaleString('en-IN', { maximumFractionDigits: 2 })}</div>
            {h.priceDate && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{h.priceDate}</div>}
          </div>
        ) : '—'}
      </td>
      <td className="right num" style={{ color: 'var(--text2)' }}>{fmt(h.invested)}</td>
      <td className="right num" style={{ color: 'var(--purple)' }}>{fmt(h.current)}</td>
      <td className="right num">
        <span className={profit >= 0 ? 'pos' : 'neg'}>
          {profit >= 0 ? '+' : ''}{fmt(profit)}<br />
          <span className="text-xs">{profitPct >= 0 ? '+' : ''}{profitPct.toFixed(1)}%</span>
        </span>
      </td>
      <td>
        <div className="flex gap-1 items-center">
          {canRefresh && (
            <button className="btn-icon" title="Refresh price" onClick={() => onRefresh(h)}>
              {refreshing ? <span className="spin">⟳</span> : '⟳'}
            </button>
          )}
          <button className="btn-icon" onClick={onEdit} title="Edit">✏️</button>
          <button className="btn-icon" onClick={onDelete} title="Delete">🗑️</button>
        </div>
      </td>
    </tr>
  )
}

function EditHoldingRow({ holding, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: holding.name || '',
    platform: holding.platform || 'other',
    assetType: holding.assetType || 'stock',
    ticker: holding.ticker || '',
    schemeCode: holding.schemeCode || '',
    units: holding.units || '',
    buyPrice: holding.buyPrice || '',
    currentPrice: holding.currentPrice || '',
    invested: holding.invested || '',
    current: holding.current || '',
    note: holding.note || '',
  })
  const [saving, setSaving] = useState(false)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  // Auto-calc invested/current from units+price
  const calcInvested = form.units && form.buyPrice ? (Number(form.units) * Number(form.buyPrice)) : null
  const calcCurrent = form.units && form.currentPrice ? (Number(form.units) * Number(form.currentPrice)) : null

  async function save() {
    setSaving(true)
    try {
      const patch = {
        name: form.name,
        platform: form.platform,
        assetType: form.assetType,
        ticker: form.ticker,
        schemeCode: form.schemeCode,
        units: Number(form.units) || 0,
        buyPrice: Number(form.buyPrice) || 0,
        currentPrice: Number(form.currentPrice) || 0,
        invested: calcInvested !== null ? calcInvested : Number(form.invested) || 0,
        current: calcCurrent !== null ? calcCurrent : Number(form.current) || 0,
        note: form.note,
      }
      await api.updateHolding(holding.id, patch)
      onSave()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  return (
    <tr style={{ background: 'rgba(34,211,238,0.04)' }}>
      <td colSpan={10}>
        <div className="flex gap-2 flex-wrap items-center" style={{ padding: '6px 0' }}>
          <input className="input input-sm" style={{ width: 150 }} placeholder="Name" value={form.name} onChange={e => set('name', e.target.value)} autoFocus />
          <select className="input input-sm" style={{ width: 100 }} value={form.platform} onChange={e => set('platform', e.target.value)}>
            {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
          <select className="input input-sm" style={{ width: 90 }} value={form.assetType} onChange={e => set('assetType', e.target.value)}>
            {Object.entries(ASSET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {['mf'].includes(form.assetType) ? (
            <input className="input input-sm" style={{ width: 100 }} placeholder="Scheme Code" value={form.schemeCode} onChange={e => set('schemeCode', e.target.value)} />
          ) : (
            <input className="input input-sm" style={{ width: 100 }} placeholder="Ticker (e.g. INFY.NS)" value={form.ticker} onChange={e => set('ticker', e.target.value)} />
          )}
          <input className="input input-sm" style={{ width: 75 }} type="number" placeholder="Units" value={form.units} onChange={e => set('units', e.target.value)} />
          <input className="input input-sm" style={{ width: 90 }} type="number" placeholder="Avg Buy ₹" value={form.buyPrice} onChange={e => set('buyPrice', e.target.value)} />
          <input className="input input-sm" style={{ width: 90 }} type="number" placeholder="Cur Price ₹" value={form.currentPrice} onChange={e => set('currentPrice', e.target.value)} />
          {(!form.units || !form.buyPrice) && (
            <input className="input input-sm" style={{ width: 90 }} type="number" placeholder="Invested ₹" value={form.invested} onChange={e => set('invested', e.target.value)} />
          )}
          {(!form.units || !form.currentPrice) && (
            <input className="input input-sm" style={{ width: 90 }} type="number" placeholder="Current ₹" value={form.current} onChange={e => set('current', e.target.value)} />
          )}
          {calcInvested !== null && <span className="text-xs text-muted">Invested: {fmt(calcInvested)}</span>}
          {calcCurrent !== null && <span className="text-xs text-muted">Current: {fmt(calcCurrent)}</span>}
          <button className="btn btn-primary btn-xs" onClick={save} disabled={saving}>{saving ? '...' : 'Save'}</button>
          <button className="btn btn-secondary btn-xs" onClick={onCancel}>Cancel</button>
        </div>
      </td>
    </tr>
  )
}

function AddHoldingForm({ divisionId, subdivisionId, subdivisions, onSave, onCancel }) {
  const [form, setForm] = useState({
    name: '', platform: 'kite', assetType: 'stock', ticker: '', schemeCode: '',
    units: '', buyPrice: '', currentPrice: '', invested: '', current: '',
    note: '', subdivisionId: subdivisionId || '',
  })
  const [mfResults, setMfResults] = useState([])
  const [searching, setSearching] = useState(false)
  const [saving, setSaving] = useState(false)
  const mfTimer = useRef(null)

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const calcInvested = form.units && form.buyPrice ? Number(form.units) * Number(form.buyPrice) : null
  const calcCurrent = form.units && form.currentPrice ? Number(form.units) * Number(form.currentPrice) : null

  function handleMfSearch(q) {
    set('name', q)
    clearTimeout(mfTimer.current)
    if (q.length < 2) { setMfResults([]); return }
    setSearching(true)
    mfTimer.current = setTimeout(async () => {
      try {
        const res = await api.mfSearch(q)
        setMfResults(res || [])
      } catch (_) {}
      setSearching(false)
    }, 350)
  }

  function selectMf(scheme) {
    setForm(f => ({ ...f, name: scheme.schemeName, schemeCode: String(scheme.schemeCode) }))
    setMfResults([])
  }

  async function handleSave() {
    if (!form.name) return
    setSaving(true)
    try {
      const payload = {
        name: form.name, platform: form.platform, assetType: form.assetType,
        ticker: form.ticker, schemeCode: form.schemeCode,
        units: Number(form.units) || 0, buyPrice: Number(form.buyPrice) || 0,
        currentPrice: Number(form.currentPrice) || 0,
        invested: calcInvested !== null ? calcInvested : Number(form.invested) || 0,
        current: calcCurrent !== null ? calcCurrent : Number(form.current) || 0,
        note: form.note,
        subdivisionId: form.subdivisionId || subdivisionId || undefined,
      }
      await api.addHolding(divisionId, payload)
      onSave()
    } catch (e) { alert('Failed to add: ' + e.message) }
    finally { setSaving(false) }
  }

  const isMf = form.assetType === 'mf'
  const isFd = form.assetType === 'fd'

  return (
    <div>
      <div className="flex gap-2 flex-wrap items-end mb-2">
        {/* Platform */}
        <div className="form-group">
          <label className="form-label">Platform</label>
          <select className="input input-sm" style={{ width: 105 }} value={form.platform} onChange={e => set('platform', e.target.value)}>
            {Object.entries(PLATFORMS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </select>
        </div>

        {/* Asset type */}
        <div className="form-group">
          <label className="form-label">Type</label>
          <select className="input input-sm" style={{ width: 90 }} value={form.assetType} onChange={e => set('assetType', e.target.value)}>
            {Object.entries(ASSET_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>

        {/* Name / MF search */}
        <div className="form-group relative" style={{ flex: 1, minWidth: 180 }}>
          <label className="form-label">{isMf ? 'Search MF Name' : 'Name'}</label>
          <input
            className="input input-sm"
            placeholder={isMf ? 'e.g. Nippon Nifty 50' : 'Holding name'}
            value={form.name}
            onChange={e => isMf ? handleMfSearch(e.target.value) : set('name', e.target.value)}
            autoFocus
          />
          {isMf && (mfResults.length > 0 || searching) && (
            <div className="search-dropdown">
              {searching && <div className="search-item text-muted">Searching…</div>}
              {mfResults.map(s => (
                <div key={s.schemeCode} className="search-item" onClick={() => selectMf(s)}>
                  <div style={{ fontWeight: 600 }}>{s.schemeName}</div>
                  <div style={{ fontSize: 10, color: 'var(--text3)' }}>#{s.schemeCode}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Ticker or scheme code */}
        {!isMf && !isFd && (
          <div className="form-group">
            <label className="form-label">Ticker</label>
            <input className="input input-sm" style={{ width: 120 }} placeholder="e.g. INFY.NS" value={form.ticker} onChange={e => set('ticker', e.target.value)} />
          </div>
        )}
        {isMf && form.schemeCode && (
          <div className="form-group">
            <label className="form-label">Scheme Code</label>
            <input className="input input-sm" style={{ width: 100 }} value={form.schemeCode} onChange={e => set('schemeCode', e.target.value)} />
          </div>
        )}

        {/* Subdivision selector */}
        {!subdivisionId && subdivisions.length > 0 && (
          <div className="form-group">
            <label className="form-label">Subdivision</label>
            <select className="input input-sm" style={{ width: 120 }} value={form.subdivisionId} onChange={e => set('subdivisionId', e.target.value)}>
              <option value="">Direct (none)</option>
              {subdivisions.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </div>
        )}
      </div>

      <div className="flex gap-2 flex-wrap items-end">
        {/* Units + prices (for stocks, ETF, MF, foreign, gold) */}
        {!isFd && (
          <>
            <div className="form-group">
              <label className="form-label">Units / Qty</label>
              <input className="input input-sm" style={{ width: 80 }} type="number" placeholder="0" value={form.units} onChange={e => set('units', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Avg Buy ₹</label>
              <input className="input input-sm" style={{ width: 90 }} type="number" placeholder="0" value={form.buyPrice} onChange={e => set('buyPrice', e.target.value)} />
            </div>
            <div className="form-group">
              <label className="form-label">Cur Price ₹</label>
              <input className="input input-sm" style={{ width: 90 }} type="number" placeholder="0" value={form.currentPrice} onChange={e => set('currentPrice', e.target.value)} />
            </div>
          </>
        )}

        {/* Or total amounts fallback */}
        {(isFd || !form.units || !form.buyPrice) && (
          <div className="form-group">
            <label className="form-label">Invested ₹</label>
            <input className="input input-sm" style={{ width: 100 }} type="number" placeholder="0" value={form.invested} onChange={e => set('invested', e.target.value)} />
          </div>
        )}
        {(isFd || !form.units || !form.currentPrice) && (
          <div className="form-group">
            <label className="form-label">Current ₹</label>
            <input className="input input-sm" style={{ width: 100 }} type="number" placeholder="0" value={form.current} onChange={e => set('current', e.target.value)} />
          </div>
        )}

        {/* Note */}
        <div className="form-group" style={{ flex: 1, minWidth: 120 }}>
          <label className="form-label">Note (optional)</label>
          <input className="input input-sm" placeholder="e.g. SIP, goal" value={form.note} onChange={e => set('note', e.target.value)} />
        </div>

        <div className="flex gap-2 items-center" style={{ paddingBottom: 2 }}>
          {calcInvested !== null && <span className="text-xs text-muted">Inv: {fmt(calcInvested)}</span>}
          {calcCurrent !== null && <span className="text-xs text-muted">Cur: {fmt(calcCurrent)}</span>}
          <button className="btn btn-primary btn-sm" onClick={handleSave} disabled={saving || !form.name}>
            {saving ? '…' : '+ Add'}
          </button>
          <button className="btn btn-ghost btn-sm" onClick={onCancel}>Cancel</button>
        </div>
      </div>
    </div>
  )
}


