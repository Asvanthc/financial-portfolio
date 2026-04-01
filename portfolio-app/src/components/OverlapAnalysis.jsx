import React, { useState, useEffect } from 'react'
import { api } from '../api'

function fmt(n) {
  if (!n && n !== 0) return '—'
  const abs = Math.abs(n)
  if (abs >= 1e7) return `₹${(n/1e7).toFixed(2)}Cr`
  if (abs >= 1e5) return `₹${(n/1e5).toFixed(1)}L`
  return `₹${Math.round(n).toLocaleString('en-IN')}`
}

function pct(n, d) { return d > 0 ? (n/d*100).toFixed(1)+'%' : '—' }

const MF_CATEGORY_RISK = {
  'Equity Scheme - Large Cap Fund':         { risk: 'Low-Med',   tag: 'Large Cap',    color: 'var(--cyan)'   },
  'Equity Scheme - Mid Cap Fund':           { risk: 'Medium',    tag: 'Mid Cap',      color: 'var(--indigo)' },
  'Equity Scheme - Small Cap Fund':         { risk: 'High',      tag: 'Small Cap',    color: 'var(--orange)' },
  'Equity Scheme - Flexi Cap Fund':         { risk: 'Medium',    tag: 'Flexi Cap',    color: 'var(--purple)' },
  'Equity Scheme - Multi Cap Fund':         { risk: 'Medium',    tag: 'Multi Cap',    color: 'var(--purple)' },
  'Equity Scheme - ELSS':                   { risk: 'Medium',    tag: 'ELSS (Tax)',   color: 'var(--green)'  },
  'Equity Scheme - Sectoral/Thematic':      { risk: 'High',      tag: 'Sectoral',     color: 'var(--red)'    },
  'Equity Scheme - Index Funds':            { risk: 'Low-Med',   tag: 'Index',        color: 'var(--cyan)'   },
  'Other Scheme - Index Funds':             { risk: 'Low-Med',   tag: 'Index',        color: 'var(--cyan)'   },
  'Equity Scheme - Focused Fund':           { risk: 'High',      tag: 'Focused',      color: 'var(--orange)' },
  'Hybrid Scheme - Aggressive Hybrid Fund': { risk: 'Medium',    tag: 'Hybrid',       color: 'var(--indigo)' },
  'Debt Scheme - Corporate Bond Fund':      { risk: 'Low',       tag: 'Debt/Corp',    color: 'var(--green)'  },
}

function categoryInfo(cat) {
  return MF_CATEGORY_RISK[cat] || { risk: '—', tag: cat?.split(' - ').pop() || 'Unknown', color: 'var(--text3)' }
}

export default function OverlapAnalysis({ totalCurrent }) {
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(false)
  const [activeSection, setActiveSection] = useState('overlap')
  const [expandedEtf, setExpandedEtf] = useState({})

  const totalPortfolio = totalCurrent || 0

  async function load() {
    setLoading(true)
    try { setData(await api.portfolioOverlap()) }
    catch (e) { alert('Failed to load overlap data: ' + e.message) }
    finally { setLoading(false) }
  }

  useEffect(() => { load() }, [])

  if (loading) return (
    <div style={{ padding: 40, textAlign: 'center', color: 'var(--text3)' }}>
      <div className="spin" style={{ fontSize: 24 }}>⟳</div>
      <div style={{ marginTop: 12 }}>Fetching index constituents from NSE…</div>
    </div>
  )

  if (!data) return <div style={{ padding: 20, color: 'var(--text3)' }}>No data loaded. <button className="btn btn-primary btn-sm" onClick={load}>Load Analysis</button></div>

  const { directStocks, etfHoldings, mfHoldings, etfData, mfData = {}, companyExposure } = data

  // Stocks that also appear in ETF or MF indices
  const directSymbols = new Set(directStocks.map(h => h.ticker?.replace(/\.(NS|BO)$/i,'').toUpperCase()))
  const overlappingStocks = companyExposure.filter(c => c.directValue > 0 && (c.etfCount > 0 || c.mfCount > 0))
  const etfOnlyStocks = companyExposure.filter(c => c.directValue === 0 && c.etfCount > 0 && c.mfCount === 0)
  const mfOnlyStocks  = companyExposure.filter(c => c.directValue === 0 && c.etfCount === 0 && c.mfCount > 0)
  const directOnlyStocks = companyExposure.filter(c => c.directValue > 0 && c.etfCount === 0 && c.mfCount === 0)
  const indexMfs = mfHoldings.filter(m => mfData[m.schemeCode]?.inferredIndex)

  // Sector grouping from ETF/MF index constituents
  const sectorMap = {}
  companyExposure.forEach(c => {
    const sector = c.sector || null
    if (!sector) return
    if (!sectorMap[sector]) sectorMap[sector] = { sector, count: 0, hasDirectHolding: false, companies: [] }
    sectorMap[sector].count++
    sectorMap[sector].companies.push(c)
    if (c.directValue > 0) sectorMap[sector].hasDirectHolding = true
  })
  const topSectors = Object.values(sectorMap).sort((a,b) => b.count - a.count)

  // MF holdings that are actually ETFs (bought via MF route — have schemeCode, name contains ETF)
  const etfViaMf = mfHoldings.filter(m => {
    const md = mfData[m.schemeCode] || {}
    const nameHasEtf = (md.scheme_name || m.name || '').toLowerCase().includes('etf')
    const catIsEtf = (md.scheme_category || '').toLowerCase().includes('etf')
    return nameHasEtf || catIsEtf
  })

  // Insights
  const insights = generateInsights(directStocks, etfHoldings, mfHoldings, overlappingStocks, totalPortfolio, data)

  const SECTIONS = ['overlap', 'etfs', 'mfs', 'companies', 'insights']

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, flexWrap: 'wrap' }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 800 }}>Holdings Overlap & Exposure</h2>
        <button className="btn btn-ghost btn-sm" onClick={load} style={{ marginLeft: 'auto' }}>↻ Refresh</button>
      </div>

      {/* Section tabs */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, flexWrap: 'wrap' }}>
        {SECTIONS.map(s => (
          <button key={s} className={`btn btn-sm ${activeSection===s?'btn-primary':'btn-secondary'}`} onClick={() => setActiveSection(s)}>
            {s.charAt(0).toUpperCase() + s.slice(1)}
            {s === 'overlap' && overlappingStocks.length > 0 && (
              <span style={{ marginLeft: 4, background: 'var(--orange)', color: '#000', borderRadius: 99, padding: '0 5px', fontSize: 10 }}>
                {overlappingStocks.length}
              </span>
            )}
            {s === 'insights' && (
              <span style={{ marginLeft: 4, background: 'var(--green)', color: '#000', borderRadius: 99, padding: '0 5px', fontSize: 10 }}>
                {insights.length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ── OVERLAP ──────────────────────────────────────────────────── */}
      {activeSection === 'overlap' && (
        <div>
          {/* KPI summary */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 20 }}>
            <Kpi label="Direct Stocks"   value={directStocks.length}      color="var(--cyan)"   sub="individual picks" />
            <Kpi label="ETFs"            value={etfHoldings.length}       color="var(--purple)" sub="index exposure" />
            <Kpi label="Mutual Funds"    value={mfHoldings.length}        color="var(--indigo)" sub="managed funds" />
            <Kpi label="Overlap"         value={overlappingStocks.length} color="var(--orange)" sub="stock + ETF/MF" />
            <Kpi label="ETF Companies"   value={etfOnlyStocks.length}     color="var(--green)"  sub="via ETF index only" />
            <Kpi label="MF Companies"    value={mfOnlyStocks.length}      color="var(--indigo)" sub="via index MF only" />
          </div>

          {overlappingStocks.length > 0 ? (
            <div className="card" style={{ marginBottom: 16 }}>
              <div style={{ fontWeight: 700, marginBottom: 12 }}>
                ⚠️ Double Exposure — {overlappingStocks.length} stocks held directly AND via ETF/MF index
              </div>
              <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
                You own these individually AND they're constituents of your ETF(s) or index MF(s). Your actual exposure is higher than the direct holding suggests.
              </div>
              <table className="holdings-table">
                <thead>
                  <tr>
                    <th>Company</th>
                    <th className="right">Direct Value</th>
                    <th className="right">% Portfolio</th>
                    <th>Also via</th>
                  </tr>
                </thead>
                <tbody>
                  {overlappingStocks.map(c => (
                    <tr key={c.symbol}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{c.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.symbol}</div>
                      </td>
                      <td className="right num" style={{ color: 'var(--cyan)' }}>{fmt(c.directValue)}</td>
                      <td className="right" style={{ fontSize: 12, color: 'var(--purple)' }}>{pct(c.directValue, totalPortfolio)}</td>
                      <td style={{ fontSize: 11 }}>
                        {c.sources.filter(s => s.type === 'etf').map((s, i) => (
                          <span key={`e${i}`} style={{ display: 'inline-block', marginRight: 4, marginBottom: 2, padding: '1px 6px', background: 'var(--purple-dim)', color: 'var(--purple)', borderRadius: 4 }}>
                            {s.etf} ({s.index?.replace('NIFTY ','')})
                          </span>
                        ))}
                        {c.sources.filter(s => s.type === 'mf').map((s, i) => (
                          <span key={`m${i}`} style={{ display: 'inline-block', marginRight: 4, marginBottom: 2, padding: '1px 6px', background: 'var(--indigo)22', color: 'var(--indigo)', borderRadius: 4 }}>
                            MF · {s.index?.replace('NIFTY ','')}
                          </span>
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="card" style={{ color: 'var(--green)', fontWeight: 600, marginBottom: 16 }}>
              ✓ No direct overlap — your individual stocks aren't also in your ETF indices.
            </div>
          )}

          {/* Index instruments summary — ETFs + index MFs */}
          <div className="card" style={{ marginBottom: 16 }}>
            <div style={{ fontWeight: 700, marginBottom: 14 }}>Your Index Instruments</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>

              {/* ETF-type holdings (ticker-based) */}
              {etfHoldings.map(etf => {
                const sym = etf.ticker?.replace(/\.(NS|BO)$/i,'').toUpperCase()
                const info = etfData[sym] || {}
                const overlapStocks = (info.constituents || []).filter(c => directSymbols.has(c.symbol))
                return (
                  <InstrumentRow key={etf.id}
                    badge="ETF" badgeColor="var(--purple)"
                    name={etf.name}
                    sub={`${sym} · ${info.indexName ? `Tracks ${info.indexName}` : info.etfType === 'gold' ? '🥇 Gold ETF' : info.etfType === 'silver' ? '🥈 Silver ETF' : info.etfType === 'international' ? '🌐 International ETF' : 'Index unknown'}`}
                    value={etf.current} valueColor="var(--purple)"
                    totalStocks={info.constituents?.length || 0}
                    overlapStocks={overlapStocks}
                    directStocks={directStocks}
                    totalPortfolio={totalPortfolio}
                  />
                )
              })}

              {/* MF-type holdings — index MFs and ETF-via-MF-route */}
              {mfHoldings.map(mf => {
                const md = mfData[mf.schemeCode] || {}
                const overlapStocks = (md.constituents || []).filter(c => directSymbols.has(c.symbol))
                const isIndex = !!md.inferredIndex
                return (
                  <InstrumentRow key={mf.id}
                    badge={isIndex ? 'IDX MF' : 'MF'} badgeColor={isIndex ? 'var(--indigo)' : 'var(--text3)'}
                    name={mf.name}
                    sub={`#${mf.schemeCode} · ${md.inferredIndex ? `Tracks ${md.inferredIndex}` : (md.scheme_category || 'Active fund')}`}
                    value={mf.current} valueColor="var(--indigo)"
                    totalStocks={md.constituents?.length || 0}
                    overlapStocks={overlapStocks}
                    directStocks={directStocks}
                    isActive={!isIndex}
                    totalPortfolio={totalPortfolio}
                  />
                )
              })}

            </div>
          </div>

          {/* Sector spread — expandable */}
          {topSectors.length > 0 && (
            <SectorSpread sectors={topSectors} />
          )}
        </div>
      )}

      {/* ── ETFs ──────────────────────────────────────────────────────── */}
      {activeSection === 'etfs' && (
        <div>
          {etfHoldings.length === 0 && <div className="card" style={{ color: 'var(--text3)' }}>No ETF holdings found. Add ETFs with asset type "ETF" and a ticker.</div>}
          {etfHoldings.map(etf => {
            const sym = etf.ticker?.replace(/\.(NS|BO)$/i,'').toUpperCase()
            const info = etfData[sym] || {}
            const overlap = (info.constituents || []).filter(c => directSymbols.has(c.symbol))
            const expanded = expandedEtf[sym]
            return (
              <div key={etf.id} className="card" style={{ marginBottom: 12 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontWeight: 700, fontSize: 14 }}>{etf.name}</div>
                    <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                      {sym} ·{' '}
                      {info.indexName
                        ? `Tracks ${info.indexName}`
                        : info.etfType === 'gold' ? '🥇 Gold ETF — tracks gold price'
                        : info.etfType === 'silver' ? '🥈 Silver ETF — tracks silver price'
                        : info.etfType === 'international' ? '🌐 International ETF — foreign index'
                        : `Index unknown (${sym}) — add to ETF_INDEX_MAP`}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 800, color: 'var(--purple)' }}>{fmt(etf.current)}</div>
                    <div style={{ fontSize: 11, color: 'var(--text3)' }}>{pct(etf.current, totalPortfolio)} of portfolio</div>
                  </div>
                  {info.constituents?.length > 0 && (
                    <button className="btn btn-ghost btn-sm" onClick={() => setExpandedEtf(e => ({ ...e, [sym]: !e[sym] }))}>
                      {expanded ? 'Hide' : `Show ${info.constituents.length} stocks ▾`}
                    </button>
                  )}
                </div>

                {info.etfType && info.etfType !== 'equity' && (
                  <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--surface2)', borderRadius: 6, fontSize: 12, color: 'var(--text3)' }}>
                    {info.etfType === 'gold' && '🥇 Gold ETF — no equity overlap analysis applicable. Tracks spot gold price (MCX).'}
                    {info.etfType === 'silver' && '🥈 Silver ETF — no equity overlap applicable. Tracks spot silver price.'}
                    {info.etfType === 'international' && '🌐 International ETF — tracks a foreign index. No NSE constituent data available.'}
                    {info.etfType === 'unknown' && `⚠ Ticker "${info.rawTicker}" not in index map. No constituent data available. Please raise an issue to add this ETF.`}
                  </div>
                )}
                {overlap.length > 0 && (
                  <div style={{ marginTop: 10, borderRadius: 6, overflow: 'hidden', border: '1px solid rgba(251,146,60,0.3)' }}>
                    <div style={{ padding: '6px 10px', background: 'var(--orange-dim)', fontSize: 12, fontWeight: 700, color: 'var(--orange)' }}>
                      ⚠ {overlap.length} stocks held directly AND in this index
                    </div>
                    <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                      <thead><tr style={{ background: 'var(--surface2)', fontSize: 11, color: 'var(--text3)' }}>
                        <th style={{ textAlign: 'left', padding: '4px 10px' }}>Stock</th>
                        <th style={{ textAlign: 'right', padding: '4px 10px' }}>Index Weight</th>
                        <th style={{ textAlign: 'right', padding: '4px 10px' }}>Your Direct Value</th>
                        <th style={{ textAlign: 'right', padding: '4px 10px' }}>% Portfolio</th>
                      </tr></thead>
                      <tbody>
                        {overlap.map(c => {
                          const h = directStocks.find(h => h.ticker?.replace(/\.(NS|BO)$/i,'').toUpperCase() === c.symbol)
                          return (
                            <tr key={c.symbol} style={{ borderTop: '1px solid var(--border)' }}>
                              <td style={{ padding: '5px 10px' }}>
                                <span style={{ fontWeight: 600 }}>{c.symbol}</span>
                                <span style={{ fontSize: 10, color: 'var(--text3)', marginLeft: 6 }}>{c.name}</span>
                              </td>
                              <td style={{ textAlign: 'right', padding: '5px 10px', color: 'var(--cyan)', fontWeight: 700 }}>
                                {c.weight != null ? `${c.weight.toFixed(2)}%` : `#${c.rank}`}
                              </td>
                              <td style={{ textAlign: 'right', padding: '5px 10px', color: 'var(--purple)' }}>{fmt(h?.current)}</td>
                              <td style={{ textAlign: 'right', padding: '5px 10px', color: 'var(--text3)' }}>{pct(h?.current || 0, totalPortfolio)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  </div>
                )}

                {expanded && info.constituents?.length > 0 && (
                  <div style={{ marginTop: 12, maxHeight: 300, overflowY: 'auto' }}>
                    <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                      {info.constituents.length} stocks in {info.indexName}
                      {overlap.length > 0 && <span style={{ color: 'var(--orange)', marginLeft: 8 }}>{overlap.length} in your direct holdings ★</span>}
                    </div>
                    <table style={{ width: '100%', fontSize: 11, borderCollapse: 'collapse' }}>
                      <thead><tr style={{ color: 'var(--text3)', borderBottom: '1px solid var(--border)' }}>
                        <th style={{ textAlign: 'left', padding: '2px 6px' }}>Symbol</th>
                        <th style={{ textAlign: 'left', padding: '2px 6px' }}>Name</th>
                        <th style={{ textAlign: 'right', padding: '2px 6px' }}>Weight</th>
                      </tr></thead>
                      <tbody>
                        {info.constituents.map(c => (
                          <tr key={c.symbol} style={{
                            background: directSymbols.has(c.symbol) ? 'rgba(251,146,60,0.07)' : 'transparent',
                            borderBottom: '1px solid var(--border)',
                          }}>
                            <td style={{ padding: '3px 6px', fontWeight: directSymbols.has(c.symbol) ? 700 : 400,
                              color: directSymbols.has(c.symbol) ? 'var(--orange)' : 'var(--text2)' }}>
                              {c.symbol} {directSymbols.has(c.symbol) ? '★' : ''}
                            </td>
                            <td style={{ padding: '3px 6px', color: 'var(--text3)', fontSize: 10 }}>{c.name}</td>
                            <td style={{ padding: '3px 6px', textAlign: 'right', color: 'var(--cyan)', fontWeight: 600 }}>
                              {c.weight != null ? `${c.weight.toFixed(2)}%` : `#${c.rank}`}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            )
          })}

          {/* ETFs bought via MF route (schemeCode, no ticker) */}
          {etfViaMf.length > 0 && (
            <div style={{ marginTop: etfHoldings.length > 0 ? 8 : 0 }}>
              {etfHoldings.length > 0 && (
                <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8, marginTop: 4 }}>
                  ↓ ETFs held via MF route (schemeCode, no exchange ticker)
                </div>
              )}
              {etfViaMf.map(mf => {
                const md = mfData[mf.schemeCode] || {}
                const overlap = (md.constituents || []).filter(c => directSymbols.has(c.symbol))
                const expanded = expandedEtf[mf.schemeCode]
                return (
                  <div key={mf.id} className="card" style={{ marginBottom: 12 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{mf.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text3)', marginTop: 2 }}>
                          #{mf.schemeCode} · {md.inferredIndex ? `Tracks ${md.inferredIndex}` : 'Index unknown'}
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: 800, color: 'var(--purple)' }}>{fmt(mf.current)}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{pct(mf.current, totalPortfolio)} of portfolio</div>
                      </div>
                      {md.constituents?.length > 0 && (
                        <button className="btn btn-ghost btn-sm" onClick={() => setExpandedEtf(e => ({ ...e, [mf.schemeCode]: !e[mf.schemeCode] }))}>
                          {expanded ? 'Hide' : `Show ${md.constituents.length} stocks ▾`}
                        </button>
                      )}
                    </div>

                    {overlap.length > 0 && (
                      <div style={{ marginTop: 10, padding: '8px 10px', background: 'var(--orange-dim)', borderRadius: 6, fontSize: 12 }}>
                        <span style={{ color: 'var(--orange)', fontWeight: 700 }}>⚠ {overlap.length} overlap with direct holdings: </span>
                        {overlap.map(c => c.symbol).join(', ')}
                      </div>
                    )}

                    {expanded && md.constituents?.length > 0 && (
                      <div style={{ marginTop: 12, maxHeight: 260, overflowY: 'auto' }}>
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                          {md.constituents.length} stocks in {md.inferredIndex}
                          {overlap.length > 0 && <span style={{ color: 'var(--orange)', marginLeft: 8 }}>{overlap.length} in your direct holdings ★</span>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                          {md.constituents.map(c => (
                            <span key={c.symbol} style={{
                              padding: '2px 7px', borderRadius: 4, fontSize: 11,
                              background: directSymbols.has(c.symbol) ? 'var(--orange-dim)' : 'var(--surface2)',
                              color: directSymbols.has(c.symbol) ? 'var(--orange)' : 'var(--text2)',
                              border: directSymbols.has(c.symbol) ? '1px solid rgba(251,146,60,0.3)' : '1px solid transparent',
                              fontWeight: directSymbols.has(c.symbol) ? 700 : 400,
                            }}>
                              {c.symbol} {directSymbols.has(c.symbol) ? '★' : ''}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ── MFs ───────────────────────────────────────────────────────── */}
      {activeSection === 'mfs' && (
        <div>
          {mfHoldings.length === 0 && <div className="card" style={{ color: 'var(--text3)' }}>No MF holdings found. Add MFs with asset type "MF" and scheme code.</div>}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(300px,1fr))', gap: 12 }}>
            {mfHoldings.filter(mf => !etfViaMf.find(e => e.id === mf.id)).map(mf => {
              const info = mf.schemeInfo || {}
              const catInfo = categoryInfo(info.scheme_category)
              const profit = (mf.current || 0) - (mf.invested || 0)
              const profitPct = mf.invested > 0 ? profit/mf.invested*100 : 0
              return (
                <div key={mf.id} className="card">
                  <div style={{ fontWeight: 700, fontSize: 13, marginBottom: 4, lineHeight: 1.4 }}>{mf.name}</div>
                  <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
                    {info.fund_house || 'Unknown AMC'} · Scheme #{mf.schemeCode}
                  </div>

                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, fontWeight: 700, background: `${catInfo.color}22`, color: catInfo.color, border: `1px solid ${catInfo.color}44` }}>
                      {catInfo.tag}
                    </span>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, background: 'var(--surface2)', color: 'var(--text3)' }}>
                      Risk: {catInfo.risk}
                    </span>
                    <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, background: 'var(--surface2)', color: 'var(--text3)' }}>
                      {info.scheme_type?.includes('Open') ? 'Open-Ended' : info.scheme_type || '—'}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
                    <MiniStat label="Invested" value={fmt(mf.invested)} color="var(--text2)" />
                    <MiniStat label="Current"  value={fmt(mf.current)}  color="var(--purple)" />
                    <MiniStat label="P/L" value={`${profit>=0?'+':''}${fmt(profit)}`} color={profit>=0?'var(--green)':'var(--red)'} sub={`${profitPct>=0?'+':''}${profitPct.toFixed(1)}%`} />
                  </div>

                  <div style={{ marginTop: 10, padding: '8px', background: 'var(--surface2)', borderRadius: 6, fontSize: 11, color: 'var(--text3)', lineHeight: 1.6 }}>
                    {catInfo.tag === 'Large Cap' && '⚡ Invests predominantly in top 100 companies. Lower volatility, lower return potential.'}
                    {catInfo.tag === 'Mid Cap' && '📈 Invests in 101–250 ranked companies. Higher growth potential, moderate risk.'}
                    {catInfo.tag === 'Small Cap' && '🚀 Invests beyond top 250 companies. High risk/reward, illiquid in downturns.'}
                    {catInfo.tag === 'Flexi Cap' && '🔄 Fund manager can shift freely between Large/Mid/Small. Returns depend on manager skill.'}
                    {catInfo.tag === 'Multi Cap' && '🔄 Mandatory 25% min in each cap. Balanced exposure across market caps.'}
                    {catInfo.tag === 'Index' && '📊 Passive. Tracks an index. Low cost, no manager risk.'}
                    {catInfo.tag === 'ELSS (Tax)' && '💸 Tax saving under 80C. 3-year lock-in. Equity exposure like Flexi-cap.'}
                    {catInfo.tag === 'Sectoral' && '⚠ High concentration risk. Returns highly cyclical. Only for believers in the sector thesis.'}
                    {catInfo.tag === 'Focused' && '⚠ Max 30 stocks. Concentrated bets. Higher risk, higher potential alpha.'}
                    {catInfo.tag === 'Hybrid' && '⚖ Mix of equity and debt. Lower downside but capped upside.'}
                    {!['Large Cap','Mid Cap','Small Cap','Flexi Cap','Multi Cap','Index','ELSS (Tax)','Sectoral','Focused','Hybrid'].includes(catInfo.tag) && (info.scheme_category || 'Category details not available.')}
                    {!mfData[mf.schemeCode]?.inferredIndex && (
                      <span style={{ color: 'var(--text3)' }}>
                        {' '}Holdings breakdown not available via free API.
                        {mfData[mf.schemeCode]?.nameUsed && (
                          <span style={{ fontSize: 10, display: 'block', marginTop: 2, color: 'var(--text3)', opacity: 0.6 }}>
                            Matched name: "{mfData[mf.schemeCode].nameUsed}"
                          </span>
                        )}
                      </span>
                    )}
                  </div>

                  {/* Index MF: show constituent chips */}
                  {(() => {
                    const md = mfData[mf.schemeCode] || {}
                    if (!md.inferredIndex || !md.constituents?.length) return null
                    const overlap = md.constituents.filter(c => directSymbols.has(c.symbol))
                    return (
                      <div style={{ marginTop: 10 }}>
                        {overlap.length > 0 && (
                          <div style={{ padding: '6px 10px', background: 'var(--orange-dim)', borderRadius: 6, fontSize: 12, marginBottom: 8 }}>
                            <span style={{ color: 'var(--orange)', fontWeight: 700 }}>⚠ {overlap.length} overlap with your direct holdings: </span>
                            {overlap.map(c => c.symbol).join(', ')}
                          </div>
                        )}
                        <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 6 }}>
                          Tracks {md.inferredIndex} — {md.constituents.length} stocks
                          {overlap.length > 0 && <span style={{ color: 'var(--orange)', marginLeft: 8 }}>{overlap.length} in your direct holdings ★</span>}
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
                          {md.constituents.map(c => (
                            <span key={c.symbol} style={{
                              padding: '2px 7px', borderRadius: 4, fontSize: 11,
                              background: directSymbols.has(c.symbol) ? 'var(--orange-dim)' : 'var(--surface2)',
                              color: directSymbols.has(c.symbol) ? 'var(--orange)' : 'var(--text2)',
                              fontWeight: directSymbols.has(c.symbol) ? 700 : 400,
                            }}>{c.symbol}{directSymbols.has(c.symbol) ? ' ★' : ''}</span>
                          ))}
                        </div>
                      </div>
                    )
                  })()}
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* ── COMPANIES ─────────────────────────────────────────────────── */}
      {activeSection === 'companies' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 14 }}>
            All companies you have exposure to — directly, via ETF index, or via index MF. Orange = double exposure. Index MF constituents shown only for mapped index funds.
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="holdings-table">
              <thead>
                <tr>
                  <th>Company</th>
                  <th>Sector</th>
                  <th className="right">Direct Value</th>
                  <th className="right">% Portfolio</th>
                  <th>Via ETF</th>
                  <th>Via MF</th>
                </tr>
              </thead>
              <tbody>
                {directStocks.map(h => {
                  const sym = h.ticker?.replace(/\.(NS|BO)$/i,'').toUpperCase()
                  const c = companyExposure.find(x => x.symbol === sym)
                  const hasOverlap = c && (c.etfCount > 0 || c.mfCount > 0)
                  return (
                    <tr key={h.id} style={{ background: hasOverlap ? 'rgba(251,146,60,0.04)' : 'transparent' }}>
                      <td>
                        <div style={{ fontWeight: 600 }}>{h.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text3)' }}>{sym}</div>
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text3)' }}>{c?.sector || '—'}</td>
                      <td className="right num" style={{ color: 'var(--cyan)' }}>{fmt(h.current)}</td>
                      <td className="right" style={{ fontSize: 12, color: 'var(--purple)' }}>{pct(h.current, totalPortfolio)}</td>
                      <td style={{ fontSize: 11 }}>
                        {c?.etfCount > 0
                          ? c.sources.filter(s=>s.type==='etf').map((s,i) => (
                              <span key={i} style={{ marginRight: 4, padding: '1px 5px', background: 'var(--orange-dim)', color: 'var(--orange)', borderRadius: 4 }}>{s.etf}</span>
                            ))
                          : <span className="text-dim">—</span>}
                      </td>
                      <td style={{ fontSize: 11 }}>
                        {c?.mfCount > 0
                          ? <span style={{ padding: '1px 5px', background: 'var(--indigo)22', color: 'var(--indigo)', borderRadius: 4 }}>
                              {[...new Set(c.sources.filter(s=>s.type==='mf').map(s=>s.index?.replace('NIFTY ','')))].join(', ')}
                            </span>
                          : <span className="text-dim">—</span>}
                      </td>
                    </tr>
                  )
                })}

                {etfOnlyStocks.length > 0 && (
                  <tr><td colSpan={6} style={{ paddingTop: 10, paddingBottom: 4, fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>
                    Via ETF index only ({etfOnlyStocks.length} companies)
                  </td></tr>
                )}
                {etfOnlyStocks.slice(0, 50).map(c => (
                  <tr key={c.symbol} style={{ opacity: 0.55 }}>
                    <td><div style={{ fontSize: 12 }}>{c.name}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.symbol}</div></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{c.sector || '—'}</td>
                    <td className="right" style={{ fontSize: 12, color: 'var(--text3)' }}>—</td>
                    <td className="right" style={{ fontSize: 12, color: 'var(--text3)' }}>—</td>
                    <td style={{ fontSize: 11 }}>
                      {c.sources.filter(s=>s.type==='etf').map((s,i) => (
                        <span key={i} style={{ marginRight: 4, padding: '1px 5px', background: 'var(--purple-dim)', color: 'var(--purple)', borderRadius: 4 }}>{s.etf}</span>
                      ))}
                    </td>
                    <td style={{ fontSize: 11, color: 'var(--text3)' }}>—</td>
                  </tr>
                ))}

                {mfOnlyStocks.length > 0 && (
                  <tr><td colSpan={6} style={{ paddingTop: 10, paddingBottom: 4, fontSize: 11, fontWeight: 700, color: 'var(--text3)' }}>
                    Via index MF only ({mfOnlyStocks.length} companies)
                  </td></tr>
                )}
                {mfOnlyStocks.slice(0, 50).map(c => (
                  <tr key={c.symbol} style={{ opacity: 0.55 }}>
                    <td><div style={{ fontSize: 12 }}>{c.name}</div><div style={{ fontSize: 11, color: 'var(--text3)' }}>{c.symbol}</div></td>
                    <td style={{ fontSize: 12, color: 'var(--text3)' }}>{c.sector || '—'}</td>
                    <td className="right" style={{ fontSize: 12, color: 'var(--text3)' }}>—</td>
                    <td className="right" style={{ fontSize: 12, color: 'var(--text3)' }}>—</td>
                    <td style={{ fontSize: 11, color: 'var(--text3)' }}>—</td>
                    <td style={{ fontSize: 11 }}>
                      {[...new Set(c.sources.filter(s=>s.type==='mf').map(s=>s.index?.replace('NIFTY ','')))].map((idx,i) => (
                        <span key={i} style={{ marginRight: 4, padding: '1px 5px', background: 'var(--indigo)22', color: 'var(--indigo)', borderRadius: 4 }}>{idx}</span>
                      ))}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ── INSIGHTS ──────────────────────────────────────────────────── */}
      {activeSection === 'insights' && (
        <div>
          <div style={{ fontSize: 12, color: 'var(--text3)', marginBottom: 16 }}>
            Data-driven observations from your portfolio structure. Not financial advice.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {insights.map((ins, i) => (
              <div key={i} className="card" style={{ borderLeft: `3px solid ${ins.color}`, padding: '12px 16px' }}>
                <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 18, lineHeight: 1 }}>{ins.icon}</span>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 13, color: ins.color, marginBottom: 3 }}>{ins.title}</div>
                    <div style={{ fontSize: 13, color: 'var(--text2)', lineHeight: 1.6 }}>{ins.body}</div>
                    {ins.action && <div style={{ marginTop: 6, fontSize: 12, color: 'var(--cyan)', fontWeight: 600 }}>→ {ins.action}</div>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

function generateInsights(directStocks, etfHoldings, mfHoldings, overlappingStocks, totalPortfolio, data) {
  const insights = []
  const { companyExposure, etfData } = data

  // 1. Single stock concentration
  const heavyStocks = directStocks.filter(h => totalPortfolio > 0 && (h.current/totalPortfolio*100) > 5)
  if (heavyStocks.length > 0) {
    insights.push({
      icon: '⚠️', color: 'var(--orange)',
      title: `Concentration Risk — ${heavyStocks.length} stock${heavyStocks.length>1?'s':''} above 5% of portfolio`,
      body: `${heavyStocks.map(h => `${h.name} (${(h.current/totalPortfolio*100).toFixed(1)}%)`).join(', ')}. Single-stock positions above 5% create idiosyncratic risk that can't be diversified away — a bad earnings or sector event can materially impact your total returns.`,
      action: 'Consider trimming and deploying into diversified instruments if this is unintentional concentration.',
    })
  }

  // 2. Overlap double exposure
  if (overlappingStocks.length > 0) {
    insights.push({
      icon: '🔁', color: 'var(--purple)',
      title: `Double Exposure on ${overlappingStocks.length} stock${overlappingStocks.length>1?'s':''}`,
      body: `${overlappingStocks.map(c=>c.name).join(', ')} are held directly AND included in your ETF indices. Your real exposure to these companies is the direct holding + the ETF allocation to them. This isn't necessarily bad — it means you have a strong conviction bet on top of the index weight.`,
      action: 'If the overlap is unintentional, consider replacing the direct position with more exposure to non-overlapping assets.',
    })
  }

  // 3. Too many index ETFs tracking same/similar indices
  const indexNames = Object.values(etfData).map(e => e.indexName).filter(Boolean)
  const uniqueIndices = new Set(indexNames)
  if (indexNames.length > uniqueIndices.size) {
    insights.push({
      icon: '♻️', color: 'var(--orange)',
      title: 'Redundant ETF overlap',
      body: `You hold multiple ETFs tracking overlapping or similar indices (${[...uniqueIndices].join(', ')}). NIFTY 50 and NIFTY NEXT 50 together form NIFTY 100. Multiple large-cap index ETFs add tracking error cost without additional diversification.`,
      action: 'Consolidate into a single broad-market ETF (e.g. Nifty 500 index fund) unless you have a specific allocation intent.',
    })
  }

  // 4. MF + Large cap ETF overlap
  const hasLargeCapMf = mfHoldings.some(m => m.schemeInfo?.scheme_category?.includes('Large Cap'))
  const hasNifty50Etf = etfHoldings.some(e => {
    const sym = e.ticker?.replace(/\.(NS|BO)$/i,'').toUpperCase()
    return etfData[sym]?.indexName?.includes('NIFTY 50')
  })
  if (hasLargeCapMf && hasNifty50Etf) {
    insights.push({
      icon: '🔂', color: 'var(--orange)',
      title: 'Large-cap overlap: ETF + Active MF',
      body: `You have both a Nifty 50 ETF and a Large Cap active MF. Research shows active large-cap funds rarely beat the Nifty 50 index consistently after costs. The ETF is likely giving you identical exposure at 0.05–0.1% expense ratio vs 1–1.5% for the active fund.`,
      action: 'Consider migrating the large-cap active MF allocation to the Nifty 50 ETF to reduce cost drag.',
    })
  }

  // 5. Foreign equity exposure
  const foreignHoldings = [...directStocks, ...(data.directStocks || [])].filter(h => h.assetType === 'foreign')
  const foreignValue = foreignHoldings.reduce((s,h) => s+(h.current||0), 0)
  if (foreignValue === 0 && totalPortfolio > 0) {
    insights.push({
      icon: '🌐', color: 'var(--indigo)',
      title: 'No international diversification',
      body: `100% of your portfolio is in Indian markets. The US market (S&P 500) and global indices are less correlated with Indian markets, providing true diversification. Indian markets had near-zero correlation with US markets during 2020–2022.`,
      action: 'Consider 5–10% allocation to international index funds (S&P 500 / Nasdaq ETFs available via IndMoney, INDmoney).',
    })
  } else if (foreignValue > 0 && totalPortfolio > 0) {
    const fPct = foreignValue/totalPortfolio*100
    insights.push({
      icon: '🌐', color: 'var(--green)',
      title: `${fPct.toFixed(1)}% international exposure — good for diversification`,
      body: `Your foreign equity allocation adds currency and geographic diversification. USD-denominated assets provide natural INR depreciation hedge (INR weakens ~3–5% annually vs USD historically).`,
    })
  }

  // 6. MF count
  if (mfHoldings.length > 5) {
    insights.push({
      icon: '📦', color: 'var(--orange)',
      title: `Over-diversification — ${mfHoldings.length} MFs`,
      body: `More than 5 mutual funds usually leads to portfolio overlap, higher monitoring overhead, and returns that mirror a generic index. Beyond 3–4 well-chosen funds, additional funds rarely add meaningful diversification and often increase the same underlying stock exposure.`,
      action: 'Audit MF categories. Merge similar-category funds. Aim for ≤4 MFs with distinct mandates.',
    })
  }

  // 7. FD vs inflation
  const fdHoldings = (data.directStocks || []).filter(h => h.assetType === 'fd')
  const fdValue = fdHoldings.reduce((s,h) => s+(h.current||0), 0)
  if (fdValue > 0 && totalPortfolio > 0 && fdValue/totalPortfolio > 0.3) {
    insights.push({
      icon: '🏦', color: 'var(--red)',
      title: `${(fdValue/totalPortfolio*100).toFixed(0)}% in FD — high cash drag`,
      body: `FD rates (~7%) barely beat inflation (~5–6%) in real terms, and returns are fully taxable as income. Equity/MF long-term capital gains are taxed at 10% with indexation benefit. Over 10+ years, the compounding difference is massive.`,
      action: "Review if FD allocation is for an emergency fund (3\u20136 months expenses is sufficient). Excess FD could be SIP'd into debt/hybrid funds.",
    })
  }

  // 8. No SIP / all lump-sum
  const allHoldings = [...directStocks, ...etfHoldings, ...mfHoldings]
  const hasUnits = allHoldings.some(h => h.units > 0 && h.buyPrice > 0)
  if (mfHoldings.length > 0 && !hasUnits) {
    insights.push({
      icon: '📅', color: 'var(--cyan)',
      title: 'Consider SIPs for rupee cost averaging',
      body: `Systematic Investment Plans (SIPs) in your MFs reduce timing risk. Investing a fixed amount monthly means you buy more units when markets are down and fewer when they're up — this averages down your buy cost over time without requiring market timing.`,
    })
  }

  // 9. Small cap / mid cap allocation check
  const highRiskMfs = mfHoldings.filter(m => ['Small Cap','Mid Cap','Sectoral','Focused'].includes(categoryInfo(m.schemeInfo?.scheme_category).tag))
  const highRiskMfValue = highRiskMfs.reduce((s,m) => s+(m.current||0), 0)
  if (highRiskMfValue > 0 && totalPortfolio > 0 && highRiskMfValue/totalPortfolio > 0.4) {
    insights.push({
      icon: '📉', color: 'var(--red)',
      title: `${(highRiskMfValue/totalPortfolio*100).toFixed(0)}% in high-risk MF categories`,
      body: `Small-cap and mid-cap funds can fall 50–60% in a bear market and may take 3–5 years to recover. Your allocation to these categories (${highRiskMfs.map(m=>m.name).join(', ')}) is on the higher side.`,
      action: 'Ensure this allocation matches your investment horizon (10+ years preferred for small/mid cap).',
    })
  }

  if (insights.length === 0) {
    insights.push({
      icon: '✅', color: 'var(--green)',
      title: 'Portfolio looks clean — no major issues detected',
      body: 'No significant concentration, redundancy, or structural issues found based on available data.',
    })
  }

  return insights
}

function InstrumentRow({ badge, badgeColor, name, sub, value, valueColor, totalStocks, overlapStocks, directStocks, isActive, totalPortfolio }) {
  const [expanded, setExpanded] = React.useState(false)
  return (
    <div style={{ background: 'var(--surface2)', borderRadius: 8, overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', flexWrap: 'wrap' }}>
        <span style={{ padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700, background: `${badgeColor}22`, color: badgeColor, flexShrink: 0 }}>
          {badge}
        </span>
        <div style={{ flex: 1, minWidth: 140 }}>
          <div style={{ fontWeight: 600, fontSize: 13 }}>{name}</div>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 1 }}>{sub}</div>
        </div>
        <div style={{ textAlign: 'right', fontSize: 12, flexShrink: 0 }}>
          <div style={{ color: valueColor, fontWeight: 700 }}>{fmt(value)}</div>
          {totalStocks > 0 && <div style={{ color: 'var(--text3)' }}>{totalStocks} stocks in index</div>}
          {isActive && <div style={{ color: 'var(--text3)', fontSize: 11 }}>Active fund</div>}
        </div>
        {overlapStocks.length > 0 ? (
          <button
            onClick={() => setExpanded(x => !x)}
            style={{ padding: '3px 10px', borderRadius: 99, fontSize: 11, background: 'var(--orange-dim)', color: 'var(--orange)', fontWeight: 700, border: 'none', cursor: 'pointer', flexShrink: 0 }}
          >
            ⚠ {overlapStocks.length} overlap {expanded ? '▲' : '▼'}
          </button>
        ) : totalStocks > 0 ? (
          <span style={{ padding: '2px 8px', borderRadius: 99, fontSize: 11, background: 'var(--green)22', color: 'var(--green)', flexShrink: 0 }}>✓ no overlap</span>
        ) : null}
      </div>
      {expanded && overlapStocks.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 12px' }}>
          <div style={{ fontSize: 11, color: 'var(--text3)', marginBottom: 8 }}>
            These stocks are in the index AND you hold them directly — your real exposure is higher than it looks:
          </div>
          <table style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ color: 'var(--text3)', fontSize: 11 }}>
                <th style={{ textAlign: 'left', paddingBottom: 4 }}>Stock</th>
                <th style={{ textAlign: 'right', paddingBottom: 4 }}>Direct Value</th>
                <th style={{ textAlign: 'right', paddingBottom: 4 }}>% of Portfolio</th>
              </tr>
            </thead>
            <tbody>
              {overlapStocks.map(c => {
                const holding = directStocks.find(h => h.ticker?.replace(/\.(NS|BO)$/i,'').toUpperCase() === c.symbol)
                return (
                  <tr key={c.symbol}>
                    <td style={{ paddingBottom: 4 }}>
                      <span style={{ fontWeight: 600 }}>{c.name || c.symbol}</span>
                      <span style={{ color: 'var(--text3)', marginLeft: 6, fontSize: 11 }}>{c.symbol}</span>
                    </td>
                    <td style={{ textAlign: 'right', color: 'var(--cyan)', fontWeight: 600 }}>{fmt(holding?.current || 0)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--purple)' }}>
                      {holding?.current ? pct(holding.current, totalPortfolio || 1) : '—'}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

function SectorSpread({ sectors }) {
  const [expanded, setExpanded] = React.useState({})
  return (
    <div className="card">
      <div style={{ fontWeight: 700, marginBottom: 12 }}>
        Sector Spread ({sectors.length} sectors via ETF / index MF)
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {sectors.map(s => {
          const isOpen = expanded[s.sector]
          const direct = s.companies.filter(c => c.directValue > 0)
          return (
            <div key={s.sector} style={{ borderRadius: 6, overflow: 'hidden', border: `1px solid ${s.hasDirectHolding ? 'rgba(251,146,60,0.3)' : 'var(--border)'}` }}>
              <div
                onClick={() => setExpanded(e => ({ ...e, [s.sector]: !e[s.sector] }))}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '6px 10px', cursor: 'pointer',
                  background: s.hasDirectHolding ? 'var(--orange-dim)' : 'var(--surface2)' }}
              >
                <span style={{ flex: 1, fontWeight: s.hasDirectHolding ? 700 : 400, fontSize: 13,
                  color: s.hasDirectHolding ? 'var(--orange)' : 'var(--text2)' }}>{s.sector}</span>
                <span style={{ fontSize: 12, color: 'var(--text3)' }}>{s.count} stocks</span>
                {s.hasDirectHolding && (
                  <span style={{ fontSize: 11, color: 'var(--orange)' }}>★ {direct.length} direct</span>
                )}
                <span style={{ fontSize: 11, color: 'var(--text3)' }}>{isOpen ? '▲' : '▼'}</span>
              </div>
              {isOpen && (
                <div style={{ padding: '8px 10px', background: 'var(--surface1,var(--surface2))', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {s.companies.sort((a,b) => (b.directValue||0)-(a.directValue||0)).map(c => {
                    const isDirect = c.directValue > 0
                    return (
                      <span key={c.symbol} style={{
                        padding: '2px 8px', borderRadius: 4, fontSize: 11,
                        background: isDirect ? 'var(--orange-dim)' : 'var(--surface2)',
                        color: isDirect ? 'var(--orange)' : 'var(--text2)',
                        fontWeight: isDirect ? 700 : 400,
                        border: `1px solid ${isDirect ? 'rgba(251,146,60,0.3)' : 'transparent'}`,
                      }}>
                        {c.symbol}{isDirect ? ' ★' : ''}
                        {c.weight != null && <span style={{ marginLeft: 4, fontSize: 9, color: isDirect ? 'var(--orange)' : 'var(--text3)' }}>{c.weight.toFixed(1)}%</span>}
                      </span>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

function Kpi({ label, value, color, sub }) {
  return (
    <div className="card">
      <div className="kpi-label">{label}</div>
      <div style={{ fontSize: 24, fontWeight: 900, color }}>{value}</div>
      {sub && <div style={{ fontSize: 11, color: 'var(--text3)', marginTop: 3 }}>{sub}</div>}
    </div>
  )
}

function MiniStat({ label, value, color, sub }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', color: 'var(--text3)', marginBottom: 2 }}>{label}</div>
      <div style={{ fontWeight: 700, color, fontSize: 13 }}>{value}</div>
      {sub && <div style={{ fontSize: 10, color: 'var(--text3)' }}>{sub}</div>}
    </div>
  )
}
