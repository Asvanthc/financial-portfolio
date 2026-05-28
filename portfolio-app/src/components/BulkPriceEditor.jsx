import React, { useState, useMemo } from 'react'
import { api } from '../api'

const CURRENCIES = { USD:'$', GBP:'£', EUR:'€', SGD:'S$', AED:'د.إ', JPY:'¥', CHF:'Fr', CAD:'C$', AUD:'A$', HKD:'HK$' }
const ASSET_TYPES = { stock:'Stock', etf:'ETF', mf:'MF', fd:'FD', foreign:'Foreign', gold:'Gold' }
const PRICEABLE = new Set(['stock','etf','mf','foreign','gold'])

function fmt(n) {
  if (!n) return '₹0'
  return Math.abs(n) >= 1e7 ? `₹${(n/1e7).toFixed(2)}Cr`
    : Math.abs(n) >= 1e5 ? `₹${(n/1e5).toFixed(1)}L`
    : `₹${Math.round(n).toLocaleString('en-IN')}`
}

export default function BulkPriceEditor({ portfolio, onClose, onUpdate }) {
  const allHoldings = useMemo(() => {
    const list = []
    ;(portfolio.divisions || []).forEach(d => {
      ;(d.holdings || []).forEach(h => { if (PRICEABLE.has(h.assetType)) list.push({ ...h, divName: d.name, subName: null }) })
      ;(d.subdivisions || []).forEach(sd => {
        ;(sd.holdings || []).forEach(h => { if (PRICEABLE.has(h.assetType)) list.push({ ...h, divName: d.name, subName: sd.name }) })
      })
    })
    return list
  }, [portfolio])

  const [prices, setPrices] = useState(() => {
    const init = {}
    allHoldings.forEach(h => {
      const p = h.currency && h.foreignCurrentPrice > 0 ? h.foreignCurrentPrice : (h.currentPrice || 0)
      init[h.id] = p > 0 ? String(p) : ''
    })
    return init
  })
  const [saving, setSaving] = useState(false)

  const changedIds = useMemo(() => allHoldings.filter(h => {
    const orig = h.currency && h.foreignCurrentPrice > 0 ? h.foreignCurrentPrice : (h.currentPrice || 0)
    const cur = Number(prices[h.id])
    return cur > 0 && cur !== orig
  }).map(h => h.id), [prices, allHoldings])

  async function saveAll() {
    if (!changedIds.length || saving) return
    setSaving(true)
    try {
      const today = new Date().toISOString().split('T')[0]
      for (const id of changedIds) {
        const h = allHoldings.find(x => x.id === id)
        const val = Number(prices[id])
        let patch
        if (h.currency && h.exchangeRate) {
          const rate = h.exchangeRate
          const priceInr = Math.round(val * rate * 100) / 100
          patch = {
            foreignCurrentPrice: val, currentPrice: priceInr, priceDate: today,
            ...(h.units > 0 && {
              foreignCurrent: Math.round(h.units * val * 100) / 100,
              current: Math.round(h.units * priceInr * 100) / 100,
            }),
          }
        } else {
          patch = {
            currentPrice: val, priceDate: today,
            ...(h.units > 0 && { current: Math.round(h.units * val * 100) / 100 }),
          }
        }
        await api.updateHolding(id, patch)
      }
      await onUpdate()
      onClose()
    } catch (e) { alert('Save failed: ' + e.message) }
    finally { setSaving(false) }
  }

  const byDiv = useMemo(() => {
    const map = {}
    allHoldings.forEach(h => { if (!map[h.divName]) map[h.divName] = []; map[h.divName].push(h) })
    return map
  }, [allHoldings])

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(0,0,0,0.72)',
        display:'flex', alignItems:'flex-start', justifyContent:'center',
        padding:'32px 16px', overflowY:'auto' }}
      onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)',
        width:'100%', maxWidth:860, maxHeight:'85vh', display:'flex', flexDirection:'column' }}>

        {/* Header */}
        <div style={{ padding:'16px 20px', borderBottom:'1px solid var(--border)',
          display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <span style={{ fontWeight:700, fontSize:16 }}>Manual Price Update</span>
          <span style={{ fontSize:12, color:'var(--text3)' }}>
            {allHoldings.length} holdings
            {changedIds.length > 0 && <> · <span style={{ color:'var(--orange)', fontWeight:600 }}>{changedIds.length} changed</span></>}
          </span>
          <button onClick={onClose} style={{ marginLeft:'auto', background:'none', border:'none',
            color:'var(--text3)', fontSize:20, cursor:'pointer', lineHeight:1, padding:'0 2px' }}>✕</button>
        </div>

        {/* Body */}
        <div style={{ overflowY:'auto', flex:1 }}>
          {Object.entries(byDiv).map(([divName, holdings]) => (
            <div key={divName}>
              <div style={{ padding:'8px 20px 4px', fontSize:11, fontWeight:700, color:'var(--text3)',
                textTransform:'uppercase', letterSpacing:'0.06em', background:'var(--surface2)',
                borderBottom:'1px solid var(--border)', borderTop:'1px solid var(--border)' }}>
                {divName}
              </div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <colgroup>
                  <col /><col style={{ width:55 }} /><col style={{ width:58 }} />
                  <col style={{ width:140 }} /><col style={{ width:100 }} />
                </colgroup>
                <thead>
                  <tr style={{ fontSize:11, color:'var(--text3)' }}>
                    <th style={{ padding:'5px 20px', textAlign:'left', fontWeight:600 }}>Name</th>
                    <th style={{ padding:'5px 8px', textAlign:'left', fontWeight:600 }}>Type</th>
                    <th style={{ padding:'5px 8px', textAlign:'right', fontWeight:600 }}>Units</th>
                    <th style={{ padding:'5px 8px', textAlign:'right', fontWeight:600 }}>Current Price</th>
                    <th style={{ padding:'5px 20px', textAlign:'right', fontWeight:600 }}>New Value</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map(h => {
                    const isForeign = !!(h.currency && h.exchangeRate)
                    const currSym = isForeign ? (CURRENCIES[h.currency] || h.currency) : '₹'
                    const origPrice = isForeign && h.foreignCurrentPrice > 0 ? h.foreignCurrentPrice : (h.currentPrice || 0)
                    const newVal = Number(prices[h.id])
                    const isChanged = newVal > 0 && newVal !== origPrice
                    const newCurrentVal = (newVal > 0 && h.units > 0)
                      ? (isForeign ? Math.round(newVal * (h.exchangeRate || 0) * 100) / 100 : Math.round(h.units * newVal * 100) / 100)
                      : null

                    return (
                      <tr key={h.id} style={{ borderBottom:'1px solid var(--border)',
                        background: isChanged ? 'rgba(251,146,60,0.06)' : 'transparent' }}>
                        <td style={{ padding:'9px 20px' }}>
                          <div style={{ fontWeight:600 }}>{h.name}</div>
                          <div style={{ fontSize:11, color:'var(--text3)', marginTop:1 }}>
                            {h.subName && <span style={{ color:'var(--text3)' }}>↳ {h.subName} · </span>}
                            {h.ticker && <span>{h.ticker}</span>}
                            {h.schemeCode && !h.ticker && <span>#{h.schemeCode}</span>}
                            {isForeign && h.exchangeRate && <span> · @ ₹{h.exchangeRate.toFixed(2)}/{h.currency}</span>}
                          </div>
                        </td>
                        <td style={{ padding:'9px 8px' }}>
                          <span style={{ fontSize:11, color:'var(--text2)', background:'var(--surface2)',
                            padding:'2px 6px', borderRadius:4 }}>
                            {ASSET_TYPES[h.assetType] || h.assetType}
                          </span>
                        </td>
                        <td style={{ padding:'9px 8px', textAlign:'right', color:'var(--text3)', fontSize:12 }}>
                          {h.units > 0 ? h.units.toLocaleString('en-IN',{maximumFractionDigits:4}) : '—'}
                        </td>
                        <td style={{ padding:'9px 8px', textAlign:'right' }}>
                          <div style={{ display:'flex', alignItems:'center', justifyContent:'flex-end', gap:4 }}>
                            <span style={{ fontSize:12, color:'var(--text3)' }}>{currSym}</span>
                            <input
                              type="number" step="any"
                              value={prices[h.id]}
                              onChange={e => setPrices(p => ({ ...p, [h.id]: e.target.value }))}
                              onKeyDown={e => { if (e.key === 'Enter') e.target.blur() }}
                              style={{ width:90, padding:'4px 6px', textAlign:'right', fontSize:13,
                                background: isChanged ? 'rgba(251,146,60,0.1)' : 'var(--surface2)',
                                border:`1px solid ${isChanged ? 'var(--orange)' : 'var(--border)'}`,
                                borderRadius:6, color:'var(--text)', outline:'none', fontFamily:'inherit' }}
                              placeholder="0" />
                            {isChanged && <span style={{ color:'var(--orange)', fontSize:10 }}>●</span>}
                          </div>
                          {isForeign && newVal > 0 && (
                            <div style={{ fontSize:10, color:'var(--text3)', textAlign:'right', marginTop:2 }}>
                              ≈ ₹{(newVal * (h.exchangeRate || 0)).toFixed(2)}
                            </div>
                          )}
                        </td>
                        <td style={{ padding:'9px 20px', textAlign:'right', fontWeight:600 }}>
                          {newCurrentVal !== null
                            ? <span style={{ color: isChanged ? 'var(--orange)' : 'var(--text2)' }}>{fmt(newCurrentVal)}</span>
                            : <span style={{ color:'var(--text3)' }}>—</span>}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          ))}
          {!allHoldings.length && (
            <div style={{ padding:32, textAlign:'center', color:'var(--text3)' }}>No priceable holdings found.</div>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding:'12px 20px', borderTop:'1px solid var(--border)',
          display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <span style={{ fontSize:12, color:'var(--text3)' }}>
            {changedIds.length > 0
              ? `${changedIds.length} price${changedIds.length > 1 ? 's' : ''} will be updated`
              : 'Edit prices above then save'}
          </span>
          <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
            <button onClick={onClose} disabled={saving}
              style={{ padding:'6px 16px', borderRadius:6, border:'1px solid var(--border)',
                background:'var(--surface2)', color:'var(--text2)', cursor:'pointer', fontSize:13 }}>
              Cancel
            </button>
            <button onClick={saveAll} disabled={saving || !changedIds.length}
              style={{ padding:'6px 20px', borderRadius:6, border:'none', fontWeight:700, fontSize:13,
                background: changedIds.length ? 'var(--green)' : 'var(--surface2)',
                color: changedIds.length ? '#000' : 'var(--text3)',
                cursor: changedIds.length ? 'pointer' : 'default' }}>
              {saving ? 'Saving…' : changedIds.length ? `Save ${changedIds.length} Change${changedIds.length > 1 ? 's' : ''}` : 'No Changes'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
