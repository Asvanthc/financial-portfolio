// Shared taxonomy for holdings — sectors & market-cap categories.
// Stored on each holding as `sector` (string) and `capCategory` (string).
// Used by both the add/edit forms (DivisionCard) and the analysis (DeepAnalytics)
// so the dropdown options and the breakdown buckets never drift apart.

// Broad equity sectors (India-centric, with buckets for commodities/international).
export const SECTORS = [
  'Financial Services',
  'Information Technology',
  'Energy / Oil & Gas',
  'FMCG',
  'Healthcare & Pharma',
  'Automobile',
  'Metals & Mining',
  'Infrastructure',
  'Realty',
  'Telecom',
  'Power & Utilities',
  'Chemicals',
  'Consumer Durables',
  'Capital Goods',
  'Media & Entertainment',
  'Construction & Cement',
  'Textiles',
  'Services',
  'Diversified',
  'Commodities',
  'International',
  'Other',
]

// Market-cap categories (Gold/Misc are catch-alls for non-cap-graded holdings).
export const CAP_CATEGORIES = [
  'Large Cap',
  'Mid Cap',
  'Small Cap',
  'Micro Cap',
  'Multi / Flexi Cap',
  'Gold',
  'Misc',
]

// Fallback bucket label for holdings with no sector / cap set.
export const UNCLASSIFIED = 'Unclassified'

// Stable colors so a cap category looks the same in every chart, badge and table.
export const CAP_COLORS = {
  'Large Cap':          '#22d3ee', // cyan
  'Mid Cap':            '#a78bfa', // purple
  'Small Cap':          '#fb923c', // orange
  'Micro Cap':          '#f87171', // red
  'Multi / Flexi Cap':  '#4ade80', // green
  'Gold':               '#fbbf24', // amber/gold
  'Misc':               '#818cf8', // indigo
  [UNCLASSIFIED]:       '#64748b', // slate
}

// Palette reused for sector charts / badges (index into by position, wrap around).
export const SECTOR_PALETTE = [
  '#22d3ee', '#a78bfa', '#4ade80', '#fb923c', '#f472b6', '#818cf8',
  '#facc15', '#34d399', '#60a5fa', '#f87171', '#c084fc', '#2dd4bf',
  '#fbbf24', '#a3e635', '#38bdf8', '#fb7185', '#e879f9', '#5eead4',
  '#fdba74', '#93c5fd', '#d8b4fe', '#94a3b8',
]

// Deterministic color for any sector string (falls back to slate for unclassified).
export function sectorColor(sector) {
  if (!sector || sector === UNCLASSIFIED) return '#64748b'
  const idx = SECTORS.indexOf(sector)
  if (idx >= 0) return SECTOR_PALETTE[idx % SECTOR_PALETTE.length]
  // Unknown label — hash it so it still gets a stable color.
  let hash = 0
  for (let i = 0; i < sector.length; i++) hash = (hash * 31 + sector.charCodeAt(i)) >>> 0
  return SECTOR_PALETTE[hash % SECTOR_PALETTE.length]
}

export function capColor(cap) {
  return CAP_COLORS[cap] || CAP_COLORS[UNCLASSIFIED]
}

// Asset types that carry a meaningful sector / market-cap (equity-like).
// FD has neither; everything else can be tagged.
export const CAP_SECTOR_ELIGIBLE = ['stock', 'etf', 'foreign', 'mf', 'gold']
