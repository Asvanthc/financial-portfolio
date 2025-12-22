import React, { useEffect, useState } from 'react'
import { api } from '../api'

export default function PortfolioEditor({ onChange }) {
  const [portfolio, setPortfolio] = useState({ divisions: [] })
  const [newDiv, setNewDiv] = useState({ name: '', targetPercent: '' })
  const [expanded, setExpanded] = useState({})
  const [newSub, setNewSub] = useState({}) // keyed by division id

  async function refresh() {
    const p = await api.getPortfolio()
    setPortfolio(p)
    onChange?.(p)
  }

  useEffect(() => { refresh() }, [])

  async function addDivision(e) {
    e.preventDefault()
    if (!newDiv.name) return
    await api.addDivision({ name: newDiv.name, targetPercent: Number(newDiv.targetPercent) || 0 })
    setNewDiv({ name: '', targetPercent: '' })
    refresh()
  }

  async function updateDivision(id, patch) {
    await api.updateDivision(id, patch)
    refresh()
  }

  async function addHolding(divId) {
    const name = prompt('Holding name?')
    if (!name) return
    const invested = Number(prompt('Invested amount?') || '0')
    const currentValue = Number(prompt('Current value?') || invested)
    await api.addHolding(divId, { name, invested, currentValue })
    refresh()
  }

  async function deleteDivision(divId) {
    if (!confirm('Delete division?')) return
    await api.deleteDivision(divId)
    refresh()
  }

  function percent(n) {
    return Number.isFinite(n) ? n.toFixed(2) : '0.00'
  }

  return (
    <div className="card">
      <h3 style={{marginTop:0}}>Portfolio Setup</h3>
      <form onSubmit={addDivision} style={{display:'flex', gap:8, flexWrap:'wrap', marginBottom:12}}>
        <input placeholder="Division name" value={newDiv.name} onChange={e=>setNewDiv(v=>({...v, name:e.target.value}))} />
        <input placeholder="Target %" type="number" step="0.01" value={newDiv.targetPercent} onChange={e=>setNewDiv(v=>({...v, targetPercent:e.target.value}))} />
        <button type="submit">Add Division</button>
      </form>

      <div style={{overflow:'auto'}}>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Target %</th>
              <th>Holdings</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {portfolio.divisions?.map(d => (
              <>
                <tr key={d.id}>
                  <td>
                    <button type="button" onClick={()=>setExpanded(x=>({...x, [d.id]: !x[d.id]}))}>
                      {expanded[d.id] ? '▾' : '▸'}
                    </button>{' '}
                    {d.name}
                  </td>
                  <td>
                    <input style={{width:100}} type="number" step="0.01" value={d.targetPercent}
                      onChange={e=>updateDivision(d.id, { targetPercent: Number(e.target.value) || 0 })} />
                  </td>
                  <td>{(d.holdings?.length || 0) + (d.subdivisions?.reduce((a,b)=>a+(b.holdings?.length||0),0) || 0)}</td>
                  <td style={{display:'flex', gap:8}}>
                    <button type="button" onClick={()=>addHolding(d.id)}>Add Holding</button>
                    <button type="button" onClick={()=>{
                      const name = prompt('Rename division', d.name)
                      if (name) updateDivision(d.id, { name })
                    }}>Rename</button>
                    <button type="button" onClick={()=>deleteDivision(d.id)}>Delete</button>
                  </td>
                </tr>
                {expanded[d.id] && (
                  <tr>
                    <td colSpan={4}>
                      <div className="card" style={{background:'#0f1626'}}>
                        <div style={{display:'flex', gap:8, alignItems:'center', marginBottom:8}}>
                          <strong>Subdivisions</strong>
                          <input placeholder="Name" value={newSub[d.id]?.name || ''}
                            onChange={e=>setNewSub(v=>({...v, [d.id]: {...(v[d.id]||{}), name: e.target.value}}))} />
                          <input placeholder="Target %" type="number" step="0.01" value={newSub[d.id]?.targetPercent || ''}
                            onChange={e=>setNewSub(v=>({...v, [d.id]: {...(v[d.id]||{}), targetPercent: e.target.value}}))} />
                          <button type="button" onClick={async()=>{
                            const cfg = newSub[d.id] || {}
                            if (!cfg.name) return
                            await api.addSubdivision(d.id, { name: cfg.name, targetPercent: Number(cfg.targetPercent)||0 })
                            setNewSub(v=>({...v, [d.id]: {}}))
                            refresh()
                          }}>Add Subdivision</button>
                        </div>
                        <table>
                          <thead>
                            <tr>
                              <th>Name</th>
                              <th>Target %</th>
                              <th>Holdings</th>
                              <th>Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {(d.subdivisions || []).map(sd => (
                              <tr key={sd.id}>
                                <td>{sd.name}</td>
                                <td>
                                  <input style={{width:100}} type="number" step="0.01" value={sd.targetPercent || 0}
                                    onChange={e=>api.updateSubdivision(sd.id, { targetPercent: Number(e.target.value)||0 }).then(()=>refresh())} />
                                </td>
                                <td>{sd.holdings?.length || 0}</td>
                                <td style={{display:'flex', gap:8}}>
                                  <button type="button" onClick={async()=>{
                                    const name = prompt('Holding name?')
                                    if (!name) return
                                    const invested = Number(prompt('Invested amount?')||'0')
                                    const currentValue = Number(prompt('Current value?')||invested)
                                    await api.addHolding(d.id, { name, invested, currentValue, subdivisionId: sd.id })
                                    refresh()
                                  }}>Add Holding</button>
                                  <button type="button" onClick={async()=>{
                                    const name = prompt('Rename subdivision', sd.name)
                                    if (name) await api.updateSubdivision(sd.id, { name }); refresh()
                                  }}>Rename</button>
                                  <button type="button" onClick={async()=>{ if (confirm('Delete subdivision?')) { await api.deleteSubdivision(sd.id); refresh() } }}>Delete</button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </tbody>
        </table>
      </div>
      <div style={{marginTop:8, color:'#9fb3c8'}}>Tip: Add holdings under each division with invested and current values. Set targets to sum to 100% for precise allocations.</div>
    </div>
  )
}
