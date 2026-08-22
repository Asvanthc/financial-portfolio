// ─────────────────────────────────────────────────────────────────────────────
// Portfolio analytics, targets and goal seek.
//
// TARGET MODEL — one rule at every level:
//   a target is a percentage of the immediate parent, and it competes with all of
//   that parent's other children.
//
//   portfolio → divisions          (division.targetPercent = % of portfolio)
//   division  → subdivisions AND direct holdings   (both are siblings sharing 100%)
//   subdivision → its holdings
//
// Treating a division's subdivisions and its direct holdings as one sibling group is
// what makes the mixed case work: a division with three funds in subdivisions plus one
// stock held directly still has a single, complete set of weights adding to 100%.
// ─────────────────────────────────────────────────────────────────────────────

function sum(arr) { return arr.reduce((a, b) => a + (Number(b) || 0), 0) }
const n = v => Number(v) || 0
const round2 = v => Math.round(v * 100) / 100

function computeSubdivisionTotals(sub) {
  const holdings = sub.holdings || []
  const invested = sum(holdings.map(h => h.invested))
  const current = sum(holdings.map(h => h.current))
  return { invested, current, profit: current - invested }
}

function computeDivisionTotals(division) {
  const holdings = division.holdings || []
  const subTotals = (division.subdivisions || []).map(sd => computeSubdivisionTotals(sd))
  const invested = sum(holdings.map(h => h.invested)) + sum(subTotals.map(t => t.invested))
  const current = sum(holdings.map(h => h.current)) + sum(subTotals.map(t => t.current))
  return { invested, current, profit: current - invested, subTotals }
}

// ── Generic sibling maths ────────────────────────────────────────────────────
// Every level uses these two, so division / subdivision / holding rebalancing can
// never drift apart in behaviour.

// Add-only goal seek: the least new money such that EVERY sibling reaches its target
// share, given we can buy but never sell. The binding sibling is the one already
// over its target — it sets the floor for the new total.
function goalSeekSiblings(children) {
  const withTarget = children.filter(c => n(c.targetPercent) > 0)
  const T = sum(children.map(c => n(c.current)))
  const targetSum = sum(children.map(c => n(c.targetPercent)))
  const base = {
    targetSum: round2(targetSum),
    requiredAddition: 0,
    newTotal: T,
    additions: Object.fromEntries(children.map(c => [c.id, 0])),
    bindingId: null,
  }
  if (!withTarget.length || T <= 0) return base

  let newTotal = T
  let bindingId = null
  withTarget.forEach(c => {
    const needed = n(c.current) / (n(c.targetPercent) / 100)
    if (needed > newTotal) { newTotal = needed; bindingId = c.id }
  })

  const additions = {}
  children.forEach(c => {
    const target = (n(c.targetPercent) / 100) * newTotal
    additions[c.id] = Math.max(0, round2(target - n(c.current)))
  })

  return {
    targetSum: round2(targetSum),
    requiredAddition: round2(newTotal - T),
    newTotal: round2(newTotal),
    additions,
    bindingId,
  }
}

// Full rebalance: what to buy AND sell to land exactly on target, using a given pot
// (the siblings' current total plus any new money). Targets are normalised by their
// own sum, so a set adding to 80% or 120% still yields a complete plan — the caller
// gets `targetSum` and can warn.
function rebalanceSiblings(children, extra = 0) {
  const curSum = sum(children.map(c => n(c.current)))
  const T = curSum + Math.max(0, n(extra))
  const targetSum = sum(children.map(c => n(c.targetPercent)))
  const moves = {}
  let tradeVolume = 0

  if (!children.length || T <= 0) {
    children.forEach(c => { moves[c.id] = { ideal: 0, delta: round2(-n(c.current)) } })
    // Nothing here can absorb money — the caller needs to know so it isn't lost.
    return { moves, targetSum: round2(targetSum), pot: round2(T), tradeVolume: 0, unplaced: round2(T), proportional: false }
  }

  if (targetSum <= 0) {
    // No targets in this group: keep its existing internal mix and let it absorb its
    // full share. Returning `ideal = current` here instead would silently drop the
    // incoming money, because the pot counts it but the ideals wouldn't.
    children.forEach(c => {
      const ideal = curSum > 0 ? (n(c.current) / curSum) * T : T / children.length
      const delta = ideal - n(c.current)
      moves[c.id] = { ideal: round2(ideal), delta: round2(delta) }
      if (delta > 0) tradeVolume += delta
    })
    return { moves, targetSum: 0, pot: round2(T), tradeVolume: round2(tradeVolume), unplaced: 0, proportional: true }
  }

  children.forEach(c => {
    const ideal = (n(c.targetPercent) / targetSum) * T
    const delta = ideal - n(c.current)
    moves[c.id] = { ideal: round2(ideal), delta: round2(delta) }
    if (delta > 0) tradeVolume += delta
  })
  return { moves, targetSum: round2(targetSum), pot: round2(T), tradeVolume: round2(tradeVolume), unplaced: 0, proportional: false }
}

// Split a budget across siblings in proportion to how far each is below target.
// Whatever comes in must go out: every branch below distributes the full budget, or
// the money silently disappears somewhere down the tree.
function budgetSplit(children, budget) {
  const B = Math.max(0, n(budget))
  const out = Object.fromEntries(children.map(c => [c.id, 0]))
  if (B <= 0 || !children.length) return out

  const T = sum(children.map(c => n(c.current)))
  const targetSum = sum(children.map(c => n(c.targetPercent)))

  // No targets anywhere in this group: keep its current mix (or split evenly if it's
  // empty). Returning zeroes here would strand the money at the parent.
  if (targetSum <= 0) {
    children.forEach(c => {
      out[c.id] = round2(T > 0 ? (n(c.current) / T) * B : B / children.length)
    })
    return out
  }

  const desired = children.map(c => ({
    id: c.id,
    want: Math.max(0, (n(c.targetPercent) / 100) * (T + B) - n(c.current)),
  }))
  const totalWant = sum(desired.map(d => d.want))
  if (totalWant <= 0) {
    // Everything already at or above target — fall back to plain target weights.
    children.forEach(c => { out[c.id] = round2((n(c.targetPercent) / targetSum) * B) })
    return out
  }
  // Clamping at zero can leave the shares summing to more than the budget; scale back.
  const scale = B / totalWant
  desired.forEach(d => { out[d.id] = round2(d.want * scale) })
  return out
}

// A division's children are its subdivisions AND its direct holdings, together.
function divisionChildren(division) {
  const subs = (division.subdivisions || []).map(sd => {
    const t = computeSubdivisionTotals(sd)
    return { id: sd.id, kind: 'subdivision', name: sd.name, current: t.current, invested: t.invested, targetPercent: n(sd.targetPercent), ref: sd }
  })
  const direct = (division.holdings || []).map(h => ({
    id: h.id, kind: 'holding', name: h.name, current: n(h.current), invested: n(h.invested), targetPercent: n(h.targetPercent), ref: h,
  }))
  return [...subs, ...direct]
}

function holdingChildren(parent) {
  return (parent.holdings || []).map(h => ({
    id: h.id, kind: 'holding', name: h.name, current: n(h.current), invested: n(h.invested), targetPercent: n(h.targetPercent), ref: h,
  }))
}

// ── Analytics ────────────────────────────────────────────────────────────────
function holdingAnalytics(h, parentCurrent, totalCurrent) {
  const invested = n(h.invested)
  const current = n(h.current)
  const targetPercent = n(h.targetPercent)
  const currentPercent = parentCurrent > 0 ? (current / parentCurrent) * 100 : 0
  return {
    id: h.id,
    name: h.name,
    ticker: h.ticker || '',
    schemeCode: h.schemeCode || '',
    assetType: h.assetType || '',
    invested,
    current,
    profit: current - invested,
    returnPercent: invested > 0 ? ((current - invested) / invested) * 100 : 0,
    targetPercent,
    currentPercent,
    deltaPercent: targetPercent > 0 ? targetPercent - currentPercent : 0,
    portfolioPercent: totalCurrent > 0 ? (current / totalCurrent) * 100 : 0,
    hasTarget: targetPercent > 0,
  }
}

function computeAnalytics(portfolio) {
  const divisions = (portfolio.divisions || []).map(d => ({ ...d }))
  const totals = divisions.map(d => ({ id: d.id, ...computeDivisionTotals(d) }))
  const totalCurrent = sum(totals.map(t => t.current))
  const totalInvested = sum(totals.map(t => t.invested))

  const items = divisions.map((d, i) => {
    const t = totals[i]
    const targetPercent = n(d.targetPercent)
    const currentPercent = totalCurrent > 0 ? (t.current / totalCurrent) * 100 : 0

    const subdivisionAnalytics = (d.subdivisions || []).map(sd => {
      const sdTotals = computeSubdivisionTotals(sd)
      const sdTargetPercent = n(sd.targetPercent)
      const sdCurrentPercent = t.current > 0 ? (sdTotals.current / t.current) * 100 : 0
      const sdHoldings = (sd.holdings || []).map(h => holdingAnalytics(h, sdTotals.current, totalCurrent))
      return {
        id: sd.id,
        name: sd.name,
        invested: sdTotals.invested,
        current: sdTotals.current,
        profit: sdTotals.profit,
        targetPercent: sdTargetPercent,
        currentPercent: sdCurrentPercent,
        deltaPercent: sdTargetPercent - sdCurrentPercent,
        holdings: sdHoldings,
        // How much of this subdivision's holdings carry a target at all.
        targetSum: round2(sum(sdHoldings.map(h => h.targetPercent))),
        targetedCount: sdHoldings.filter(h => h.hasTarget).length,
      }
    })

    // Direct holdings are siblings of the subdivisions, so their percentages are of
    // the division as a whole.
    const directHoldings = (d.holdings || []).map(h => holdingAnalytics(h, t.current, totalCurrent))
    const childTargetSum = round2(
      sum(subdivisionAnalytics.map(s => s.targetPercent)) + sum(directHoldings.map(h => h.targetPercent))
    )

    return {
      id: d.id,
      name: d.name,
      targetPercent,
      invested: t.invested,
      current: t.current,
      profit: t.profit,
      currentPercent,
      deltaPercent: targetPercent - currentPercent,
      subdivisions: subdivisionAnalytics,
      holdings: directHoldings,
      childTargetSum,
    }
  })

  const gs = goalSeekSiblings(items.map(it => ({ id: it.id, current: it.current, targetPercent: it.targetPercent })))

  return {
    totals: { invested: totalInvested, current: totalCurrent, profit: totalCurrent - totalInvested },
    divisions: items.map(it => ({ ...it, requiredAddition: gs.additions[it.id] || 0 })),
    requiredTotalAddition: gs.requiredAddition,
    divisionTargetSum: gs.targetSum,
    bindingDivisionId: gs.bindingId,
    concentration: computeConcentration(items, totalCurrent),
    drift: computeDrift(items),
  }
}

// ── Concentration ────────────────────────────────────────────────────────────
// Answers "how much does this portfolio actually depend on one bet?" — a portfolio
// of 30 holdings where one is 60% is not diversified, and position count alone
// (which the old Diversification score used) can't see that.
function computeConcentration(items, totalCurrent) {
  const positions = []
  items.forEach(d => {
    d.holdings.forEach(h => positions.push({ name: h.name, current: h.current, division: d.name }))
    d.subdivisions.forEach(s => s.holdings.forEach(h => positions.push({ name: h.name, current: h.current, division: `${d.name} / ${s.name}` })))
  })
  const sorted = positions.filter(p => p.current > 0).sort((a, b) => b.current - a.current)
  if (!sorted.length || totalCurrent <= 0) {
    return { positions: 0, top1: 0, top3: 0, top5: 0, hhi: 0, effectiveHoldings: 0, largest: null }
  }
  const weight = p => p.current / totalCurrent
  const topN = k => round2(sorted.slice(0, k).reduce((s, p) => s + weight(p), 0) * 100)
  // Herfindahl index; its reciprocal is the "effective number of holdings" — the
  // count of equal-sized positions that would be this concentrated.
  const hhi = sorted.reduce((s, p) => s + Math.pow(weight(p), 2), 0)
  return {
    positions: sorted.length,
    top1: topN(1),
    top3: topN(3),
    top5: topN(5),
    hhi: Math.round(hhi * 10000),
    effectiveHoldings: hhi > 0 ? round2(1 / hhi) : 0,
    largest: { name: sorted[0].name, division: sorted[0].division, percent: topN(1) },
  }
}

// ── Drift ────────────────────────────────────────────────────────────────────
// Half the sum of absolute gaps is the share of the portfolio that would have to
// change hands to be on target — a single honest "how far off am I" number.
function computeDrift(items) {
  const gaps = items.filter(d => d.targetPercent > 0).map(d => Math.abs(d.currentPercent - d.targetPercent))
  const divisionDrift = round2(sum(gaps) / 2)
  const worst = items
    .filter(d => d.targetPercent > 0)
    .map(d => ({ name: d.name, deltaPercent: round2(d.deltaPercent) }))
    .sort((a, b) => Math.abs(b.deltaPercent) - Math.abs(a.deltaPercent))[0] || null
  return { divisionDrift, maxGap: gaps.length ? round2(Math.max(...gaps)) : 0, worst }
}

// ── Goal seek, all three levels ──────────────────────────────────────────────
// Returns a tree keyed by id so the UI can render it without re-deriving anything.
function computeGoalSeekTree(portfolio, { budget = 0 } = {}) {
  const divisions = portfolio.divisions || []
  const divChildren = divisions.map(d => {
    const t = computeDivisionTotals(d)
    return { id: d.id, current: t.current, targetPercent: n(d.targetPercent) }
  })
  const top = goalSeekSiblings(divChildren)
  const budgetByDivision = budgetSplit(divChildren, budget)

  const out = {
    requiredTotalAddition: top.requiredAddition,
    divisionTargetSum: top.targetSum,
    bindingDivisionId: top.bindingId,
    budget: Math.max(0, n(budget)),
    divisions: {},
  }

  divisions.forEach(d => {
    const children = divisionChildren(d)
    const level = goalSeekSiblings(children)
    // Money arriving at this division — from the budget if one was given, else the
    // minimum the top level says it needs.
    const incoming = n(budget) > 0 ? (budgetByDivision[d.id] || 0) : (top.additions[d.id] || 0)
    const childSplit = budgetSplit(children, incoming)

    const subs = {}
    ;(d.subdivisions || []).forEach(sd => {
      const holdKids = holdingChildren(sd)
      const subLevel = goalSeekSiblings(holdKids)
      const subIncoming = childSplit[sd.id] || 0
      out.divisions[d.id] = out.divisions[d.id] || {}
      subs[sd.id] = {
        requiredAddition: subLevel.requiredAddition,
        targetSum: subLevel.targetSum,
        bindingId: subLevel.bindingId,
        // What each holding needs to balance the subdivision on its own…
        additionsByHolding: subLevel.additions,
        // …and how the money actually flowing in gets split between them.
        allocationByHolding: budgetSplit(holdKids, subIncoming),
        incoming: round2(subIncoming),
        untargeted: holdKids.filter(h => h.targetPercent <= 0).length,
      }
    })

    out.divisions[d.id] = {
      requiredAddition: level.requiredAddition,
      targetSum: level.targetSum,
      bindingId: level.bindingId,
      incoming: round2(incoming),
      // Keyed by child id — subdivisions and direct holdings alike.
      additionsByChild: level.additions,
      allocationByChild: childSplit,
      subdivisions: subs,
      untargeted: children.filter(c => c.targetPercent <= 0).length,
    }
  })

  return out
}

// ── Full rebalance plan (allows selling) ─────────────────────────────────────
// Cascades ideal values down the tree: portfolio → division → subdivision/holding.
// With no extra money this is a pure "sell these, buy those" plan; with a budget it
// is "where should this money go to land exactly on target".
function computeRebalancePlan(portfolio, { budget = 0 } = {}) {
  const divisions = portfolio.divisions || []
  const divChildren = divisions.map(d => {
    const t = computeDivisionTotals(d)
    return { id: d.id, name: d.name, current: t.current, targetPercent: n(d.targetPercent), ref: d }
  })
  const top = rebalanceSiblings(divChildren, budget)

  const actions = []
  let totalBuy = 0, totalSell = 0
  // Money the plan can't place: a group with a target but nothing in it to buy.
  const unplaced = []

  divisions.forEach(d => {
    const divMove = top.moves[d.id] || { ideal: 0, delta: 0 }
    const children = divisionChildren(d)
    // Each child's ideal is a share of the division's ideal value, not of what it
    // holds today — that's what makes the plan land on target end to end.
    const childPlan = rebalanceSiblings(children, Math.max(0, divMove.ideal - sum(children.map(c => c.current))))
    const childScale = children.length && childPlan.pot > 0 ? divMove.ideal / childPlan.pot : 1

    children.forEach(c => {
      const raw = childPlan.moves[c.id] || { ideal: 0, delta: 0 }
      const ideal = round2(raw.ideal * childScale)
      if (c.kind === 'holding') {
        const delta = round2(ideal - c.current)
        if (Math.abs(delta) >= 1) {
          actions.push({
            holdingId: c.id, name: c.name, path: d.name, current: c.current,
            ideal, delta, action: delta > 0 ? 'buy' : 'sell',
            targetPercent: c.targetPercent, divisionId: d.id,
          })
          if (delta > 0) totalBuy += delta; else totalSell += -delta
        }
        return
      }
      // Subdivision: push its ideal down to its holdings.
      const sd = c.ref
      const holdKids = holdingChildren(sd)
      if (!holdKids.length) {
        if (ideal >= 1) unplaced.push({ name: `${d.name} / ${sd.name}`, amount: round2(ideal), reason: 'no holdings to buy' })
        return
      }
      const inner = rebalanceSiblings(holdKids, Math.max(0, ideal - sum(holdKids.map(h => h.current))))
      const innerScale = inner.pot > 0 ? ideal / inner.pot : 1
      holdKids.forEach(h => {
        const rawH = inner.moves[h.id] || { ideal: 0, delta: 0 }
        const idealH = round2(rawH.ideal * innerScale)
        const delta = round2(idealH - h.current)
        if (Math.abs(delta) >= 1) {
          actions.push({
            holdingId: h.id, name: h.name, path: `${d.name} / ${sd.name}`, current: h.current,
            ideal: idealH, delta, action: delta > 0 ? 'buy' : 'sell',
            targetPercent: h.targetPercent, divisionId: d.id, subdivisionId: sd.id,
          })
          if (delta > 0) totalBuy += delta; else totalSell += -delta
        }
      })
    })
  })

  actions.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta))
  return {
    budget: Math.max(0, n(budget)),
    divisionTargetSum: top.targetSum,
    actions,
    totalBuy: round2(totalBuy),
    totalSell: round2(totalSell),
    // With no new money a balanced plan has buys == sells; the difference is the
    // budget being deployed (plus anything the plan couldn't place).
    netCash: round2(totalBuy - totalSell),
    unplaced,
  }
}

// Kept for the existing /api/portfolio/analytics?budget= behaviour.
function computeBudgetAllocation(divisions, budget) {
  return budgetSplit(divisions.map(d => ({ id: d.id, current: d.current, targetPercent: d.targetPercent })), budget)
}

// Kept for the existing /api/subdivision-goal-seek shape.
function computeSubdivisionGoalSeek(division) {
  const subs = division.subdivisions || []
  if (!subs.length) return { requiredAddition: 0, additionsBySubdivision: {} }
  const children = subs.map(sd => {
    const t = computeSubdivisionTotals(sd)
    return { id: sd.id, current: t.current, targetPercent: n(sd.targetPercent) }
  })
  const gs = goalSeekSiblings(children)
  return {
    requiredAddition: gs.requiredAddition,
    additionsBySubdivision: gs.additions,
    targetSum: gs.targetSum,
  }
}

module.exports = {
  computeAnalytics,
  computeBudgetAllocation,
  computeSubdivisionGoalSeek,
  computeGoalSeekTree,
  computeRebalancePlan,
  goalSeekSiblings,
  rebalanceSiblings,
  divisionChildren,
  computeDivisionTotals,
  computeSubdivisionTotals,
}
