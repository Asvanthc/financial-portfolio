function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0) }

function computeSubdivisionTotals(subdivision) {
  const holdings = subdivision.holdings || []
  const invested = sum(holdings.map(h => Number(h.invested) || 0))
  const current = sum(holdings.map(h => Number(h.current) || 0))
  return { invested, current, profit: current - invested }
}

function computeDivisionTotals(division) {
  const holdings = division.holdings || []
  const subTotals = (division.subdivisions || []).map(sd => computeSubdivisionTotals(sd))
  const invested = sum(holdings.map(h => h.invested)) + sum(subTotals.map(t => t.invested))
  const current = sum(holdings.map(h => h.current)) + sum(subTotals.map(t => t.current))
  const profit = current - invested
  return { invested, current, profit, subTotals }
}

function computeSubdivisionTotals(sub) {
  const holdings = sub.holdings || []
  const invested = sum(holdings.map(h => h.invested))
  const current = sum(holdings.map(h => h.current))
  const profit = current - invested
  return { invested, current, profit }
}

function computeAnalytics(portfolio) {
  const divisions = (portfolio.divisions || []).map(d => ({ ...d }))
  const totals = divisions.map(d => ({ id: d.id, ...computeDivisionTotals(d) }))
  const totalCurrent = sum(totals.map(t => t.current))
  const totalInvested = sum(totals.map(t => t.invested))

  const items = divisions.map((d, i) => {
    const t = totals[i]
    const targetPercent = Number(d.targetPercent) || 0
    const currentPercent = totalCurrent > 0 ? (t.current / totalCurrent) * 100 : 0
    const deltaPercent = targetPercent - currentPercent
    
    // Add subdivision analytics
    const subdivisionAnalytics = (d.subdivisions || []).map(sd => {
      const sdTotals = computeSubdivisionTotals(sd)
      const sdCurrentPercent = t.current > 0 ? (sdTotals.current / t.current) * 100 : 0
      const sdTargetPercent = Number(sd.targetPercent) || 0
      const sdDelta = sdTargetPercent - sdCurrentPercent
      return {
        id: sd.id,
        name: sd.name,
        invested: sdTotals.invested,
        current: sdTotals.current,
        profit: sdTotals.profit,
        targetPercent: sdTargetPercent,
        currentPercent: sdCurrentPercent,
        deltaPercent: sdDelta
      }
    })
    
    return {
      id: d.id,
      name: d.name,
      targetPercent,
      invested: t.invested,
      current: t.current,
      profit: t.profit,
      currentPercent,
      deltaPercent,
      subdivisions: subdivisionAnalytics
    }
  })

  const { requiredTotalAddition, additionsByDivision } = computeRequiredAdditions(items)

  return {
    totals: { invested: totalInvested, current: totalCurrent, profit: totalCurrent - totalInvested },
    divisions: items.map(it => ({ ...it, requiredAddition: additionsByDivision[it.id] || 0 })),
    requiredTotalAddition,
  }
}

// Computes minimal total addition X so that ALL divisions reach their target %.
// This works by finding the minimum T_new where each division can hit its target,
// then distributing additions to ALL divisions (not just underweights).
function computeRequiredAdditions(divisions) {
  const T = sum(divisions.map(d => d.current))
  if (T <= 0) return { requiredTotalAddition: 0, additionsByDivision: Object.fromEntries(divisions.map(d => [d.id, 0])) }
  
  // For each division to hit target: current_i / T_new = target_i
  // Therefore: T_new >= current_i / target_i for all divisions
  // We need the MAXIMUM of these to satisfy all constraints
  let maxRequiredTotal = T
  for (const d of divisions) {
    const targetPercent = (Number(d.targetPercent) || 0) / 100
    if (targetPercent > 0) {
      const requiredTotal = d.current / targetPercent
      if (requiredTotal > maxRequiredTotal) {
        maxRequiredTotal = requiredTotal
      }
    }
  }
  
  const T_new = maxRequiredTotal
  const X = T_new - T
  
  const adds = {}
  divisions.forEach(d => {
    const targetPercent = (Number(d.targetPercent) || 0) / 100
    const targetValue = targetPercent * T_new
    const addition = Math.max(0, targetValue - d.current)
    adds[d.id] = addition
  })
  
  return { requiredTotalAddition: X, additionsByDivision: adds }
}

// Given optional budget B, compute suggested adds: x_i = max(0, p_i*(T+B) - v_i).
function computeBudgetAllocation(divisions, budget) {
  const T = sum(divisions.map(d => d.current))
  const B = Math.max(0, Number(budget) || 0)
  if (B <= 0) return Object.fromEntries(divisions.map(d => [d.id, 0]))
  const weights = divisions.map(d => ({ id: d.id, v: d.current, p: (Number(d.targetPercent) || 0) / 100 }))
  const desiredAdds = weights.map(w => ({ id: w.id, x: Math.max(0, w.p * (T + B) - w.v) }))
  let sumX = sum(desiredAdds.map(d => d.x))
  if (sumX <= 0) return Object.fromEntries(divisions.map(d => [d.id, 0]))
  // If over budget due to clamping at 0, scale down proportionally
  const scale = B / sumX
  const out = {}
  desiredAdds.forEach(d => { out[d.id] = d.x * scale })
  return out
}

// Compute subdivision goal seek: minimum addition needed for a division to balance its subdivisions
function computeSubdivisionGoalSeek(division) {
  const subdivisions = division.subdivisions || []
  if (subdivisions.length === 0) return { requiredAddition: 0, additionsBySubdivision: {} }
  
  const subdivisionsWithTarget = subdivisions.filter(s => (Number(s.targetPercent) || 0) > 0)
  if (subdivisionsWithTarget.length === 0) return { requiredAddition: 0, additionsBySubdivision: {} }
  
  // Compute current total for the division
  const T = subdivisions.reduce((acc, s) => {
    const subTotals = computeSubdivisionTotals(s)
    return acc + subTotals.current
  }, 0)
  
  if (T <= 0) {
    // No current value, distribute evenly by target if we have any budget
    return { requiredAddition: 0, additionsBySubdivision: {} }
  }
  
  // For each subdivision with target, compute T_new needed
  const requiredTotals = subdivisionsWithTarget.map(s => {
    const subTotals = computeSubdivisionTotals(s)
    const targetPct = (Number(s.targetPercent) || 0) / 100
    if (targetPct <= 0) return 0
    return subTotals.current / targetPct
  })
  
  const maxRequiredTotal = Math.max(...requiredTotals, T)
  const requiredAddition = Math.max(0, maxRequiredTotal - T)
  
  // Compute how much to add to each subdivision
  const adds = {}
  subdivisions.forEach(s => {
    const subTotals = computeSubdivisionTotals(s)
    const targetPct = (Number(s.targetPercent) || 0) / 100
    const targetValue = targetPct * maxRequiredTotal
    const addition = Math.max(0, targetValue - subTotals.current)
    adds[s.id] = addition
  })
  
  return { requiredAddition, additionsBySubdivision: adds }
}

module.exports = { computeAnalytics, computeBudgetAllocation, computeSubdivisionGoalSeek }
