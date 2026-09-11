// ─────────────────────────────────────────────────────────────────────────────
// Excel export.
//
// The point of this workbook is that it is LIVE, not a screenshot: P/L, returns,
// weights, division roll-ups, sector splits and the projection are all real Excel
// formulas over the raw data. Change a price on the Holdings sheet and every total,
// percentage and chart figure recalculates — so it doubles as a spreadsheet model
// and as a human-readable backup.
// ─────────────────────────────────────────────────────────────────────────────

const ExcelJS = require('exceljs')

// ── Look & feel ──────────────────────────────────────────────────────────────
const INK = 'FF0F172A'          // near-black text
const MUTED = 'FF64748B'
const HEADER_BG = 'FF0F172A'
const HEADER_FG = 'FFF8FAFC'
const BAND = 'FFF1F5F9'         // zebra stripe
const ACCENT = 'FF0EA5E9'
const GREEN = 'FF15803D'
const RED = 'FFB91C1C'
const TITLE_BG = 'FFE0F2FE'

const INR = '₹#,##0;[Red]-₹#,##0'
const INR2 = '₹#,##0.00;[Red]-₹#,##0.00'
const PCT = '0.0%;[Red]-0.0%'
const NUM4 = '#,##0.####'

const thin = { style: 'thin', color: { argb: 'FFCBD5E1' } }
const ALL_BORDERS = { top: thin, left: thin, bottom: thin, right: thin }

function titleBlock(ws, title, subtitle, width) {
  ws.mergeCells(1, 1, 1, width)
  const t = ws.getCell(1, 1)
  t.value = title
  t.font = { bold: true, size: 15, color: { argb: INK } }
  t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: TITLE_BG } }
  t.alignment = { vertical: 'middle' }
  ws.getRow(1).height = 26

  ws.mergeCells(2, 1, 2, width)
  const s = ws.getCell(2, 1)
  s.value = subtitle
  s.font = { size: 9, italic: true, color: { argb: MUTED } }
  ws.getRow(2).height = 14
  ws.getRow(3).height = 6
}

function headerRow(ws, rowIdx, labels) {
  const row = ws.getRow(rowIdx)
  labels.forEach((label, i) => {
    const c = row.getCell(i + 1)
    c.value = label
    c.font = { bold: true, size: 9, color: { argb: HEADER_FG } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HEADER_BG } }
    c.alignment = { vertical: 'middle', horizontal: i === 0 ? 'left' : 'center', wrapText: true }
    c.border = ALL_BORDERS
  })
  row.height = 26
  return row
}

// Zebra-stripe + border a data range, and freeze the header.
function finishTable(ws, headerIdx, lastRow, lastCol, { freezeCols = 1 } = {}) {
  for (let r = headerIdx + 1; r <= lastRow; r++) {
    const row = ws.getRow(r)
    for (let c = 1; c <= lastCol; c++) {
      const cell = row.getCell(c)
      cell.border = ALL_BORDERS
      if ((r - headerIdx) % 2 === 0) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
      }
    }
  }
  ws.views = [{ state: 'frozen', xSplit: freezeCols, ySplit: headerIdx }]
  if (lastRow > headerIdx) {
    ws.autoFilter = {
      from: { row: headerIdx, column: 1 },
      to: { row: lastRow, column: lastCol },
    }
  }
}

function totalRow(ws, rowIdx, lastCol, label, formulas) {
  const row = ws.getRow(rowIdx)
  row.getCell(1).value = label
  for (let c = 1; c <= lastCol; c++) {
    const cell = row.getCell(c)
    cell.font = { bold: true, size: 10, color: { argb: INK } }
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDBEAFE' } }
    cell.border = { ...ALL_BORDERS, top: { style: 'double', color: { argb: 'FF94A3B8' } } }
  }
  Object.entries(formulas).forEach(([col, spec]) => {
    const cell = row.getCell(Number(col))
    cell.value = { formula: spec.f }
    if (spec.z) cell.numFmt = spec.z
  })
  row.height = 20
  return row
}

function flattenHoldings(portfolio) {
  const out = []
  ;(portfolio.divisions || []).forEach(d => {
    ;(d.holdings || []).forEach(h => out.push({ ...h, divisionName: d.name, subdivisionName: '' }))
    ;(d.subdivisions || []).forEach(sd => (sd.holdings || []).forEach(h =>
      out.push({ ...h, divisionName: d.name, subdivisionName: sd.name })))
  })
  return out
}

const ASSET_LABEL = { stock: 'Stock', etf: 'ETF', mf: 'Mutual fund', foreign: 'Foreign', gold: 'Gold', fd: 'Fixed deposit' }
const PLATFORM_LABEL = { kite: 'Kite', groww: 'Groww', indmoney: 'IndMoney', bank: 'Bank', other: 'Other' }

// ─────────────────────────────────────────────────────────────────────────────
async function buildWorkbook({ portfolio, bankAccounts = [], expenses = [], brokers = [], analytics }) {
  const wb = new ExcelJS.Workbook()
  wb.creator = 'FinFolio'
  wb.lastModifiedBy = 'FinFolio'
  wb.created = new Date()
  wb.properties.date1904 = false

  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ')
  const holdings = flattenHoldings(portfolio)
  const divisions = portfolio.divisions || []

  // ══ HOLDINGS ═══════════════════════════════════════════════════════════════
  // The source of truth every other sheet points at.
  const hs = wb.addWorksheet('Holdings', { properties: { tabColor: { argb: ACCENT } } })
  const H_COLS = [
    'Division', 'Subdivision', 'Holding', 'Type', 'Platform', 'Ticker / Scheme',
    'Units', 'Avg buy ₹', 'Current ₹', 'Invested ₹', 'Current value ₹',
    'P/L ₹', 'Return %', 'Weight %', 'Target % of group', 'Drift %',
    'Sector', 'Market cap', 'Priced on', 'Source',
  ]
  titleBlock(hs, 'Holdings', `Every position. P/L, return and weight are live formulas — edit "Current ₹" and everything recalculates. Exported ${stamp}.`, H_COLS.length)
  const H_HEAD = 4
  headerRow(hs, H_HEAD, H_COLS)

  const H_FIRST = H_HEAD + 1
  const H_LAST = H_FIRST + holdings.length - 1
  const H_TOTAL = H_FIRST + holdings.length   // the TOTAL row; weights divide by it
  holdings.forEach((h, i) => {
    const r = H_FIRST + i
    const row = hs.getRow(r)
    row.getCell(1).value = h.divisionName
    row.getCell(2).value = h.subdivisionName || '—'
    row.getCell(3).value = h.name
    row.getCell(4).value = ASSET_LABEL[h.assetType] || h.assetType || '—'
    row.getCell(5).value = PLATFORM_LABEL[h.platform] || h.platform || '—'
    row.getCell(6).value = h.ticker || h.schemeCode || '—'
    row.getCell(7).value = Number(h.units) || 0
    row.getCell(8).value = Number(h.buyPrice) || 0
    row.getCell(9).value = Number(h.currentPrice) || 0
    row.getCell(10).value = Number(h.invested) || 0
    // Value = units × price when we have both, else the stored figure.
    row.getCell(11).value = (Number(h.units) > 0 && Number(h.currentPrice) > 0)
      ? { formula: `G${r}*I${r}` }
      : Number(h.current) || 0
    row.getCell(12).value = { formula: `K${r}-J${r}` }
    row.getCell(13).value = { formula: `IF(J${r}=0,"",L${r}/J${r})` }
    row.getCell(14).value = { formula: `IF($K$${H_TOTAL}=0,"",K${r}/$K$${H_TOTAL})` }
    // Target is a share of the holding's own group (its subdivision, or its division
    // when held directly), so the "now" side of the drift is a group-scoped SUMIFS.
    row.getCell(15).value = (Number(h.targetPercent) || 0) / 100
    const groupNow = h.subdivisionName
      ? `K${r}/SUMIFS($K$${H_FIRST}:$K$${Math.max(H_LAST, H_FIRST)},$A$${H_FIRST}:$A$${Math.max(H_LAST, H_FIRST)},A${r},$B$${H_FIRST}:$B$${Math.max(H_LAST, H_FIRST)},B${r})`
      : `K${r}/SUMIF($A$${H_FIRST}:$A$${Math.max(H_LAST, H_FIRST)},A${r},$K$${H_FIRST}:$K$${Math.max(H_LAST, H_FIRST)})`
    row.getCell(16).value = { formula: `IF(O${r}=0,"",O${r}-IFERROR(${groupNow},0))` }
    row.getCell(17).value = h.sector || '—'
    row.getCell(18).value = h.capCategory || '—'
    row.getCell(19).value = h.priceDate || '—'
    row.getCell(20).value = h.priceSource || '—'

    row.getCell(7).numFmt = NUM4
    row.getCell(8).numFmt = INR2
    row.getCell(9).numFmt = INR2
    row.getCell(10).numFmt = INR
    row.getCell(11).numFmt = INR
    row.getCell(12).numFmt = INR
    row.getCell(13).numFmt = PCT
    row.getCell(14).numFmt = PCT
    row.getCell(15).numFmt = PCT
    row.getCell(16).numFmt = PCT
    row.getCell(3).font = { bold: true, color: { argb: INK } }
    for (let c = 7; c <= 16; c++) row.getCell(c).alignment = { horizontal: 'right' }
  })

  finishTable(hs, H_HEAD, Math.max(H_LAST, H_HEAD), H_COLS.length, { freezeCols: 3 })
  if (holdings.length) {
    totalRow(hs, H_TOTAL, H_COLS.length, 'TOTAL', {
      10: { f: `SUM(J${H_FIRST}:J${H_LAST})`, z: INR },
      11: { f: `SUM(K${H_FIRST}:K${H_LAST})`, z: INR },
      12: { f: `K${H_TOTAL}-J${H_TOTAL}`, z: INR },
      13: { f: `IF(J${H_TOTAL}=0,"",L${H_TOTAL}/J${H_TOTAL})`, z: PCT },
      14: { f: `IF(K${H_TOTAL}=0,"",SUM(N${H_FIRST}:N${H_LAST}))`, z: PCT },
    })
    // Colour the P/L and Return columns by sign.
    ;['L', 'M', 'P'].forEach(col => {
      hs.addConditionalFormatting({
        ref: `${col}${H_FIRST}:${col}${H_TOTAL}`,
        rules: [
          { type: 'cellIs', operator: 'lessThan', formulae: [0], style: { font: { color: { argb: RED } } }, priority: 1 },
          { type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { color: { argb: GREEN } } }, priority: 2 },
        ],
      })
    })
    // A data bar makes the weight column readable at a glance.
    hs.addConditionalFormatting({
      ref: `N${H_FIRST}:N${H_LAST}`,
      rules: [{ type: 'dataBar', cfvo: [{ type: 'min' }, { type: 'max' }], color: { argb: ACCENT }, priority: 3 }],
    })
  }
  hs.columns.forEach((c, i) => { c.width = [18, 18, 30, 13, 11, 18, 11, 12, 12, 14, 15, 14, 10, 10, 15, 10, 20, 14, 12, 11][i] || 12 })

  // ══ DIVISIONS ══════════════════════════════════════════════════════════════
  // Rolled up from Holdings with SUMIF, so it stays correct if you edit prices.
  const ds = wb.addWorksheet('Divisions', { properties: { tabColor: { argb: 'FFA78BFA' } } })
  const D_COLS = ['Division', 'Invested ₹', 'Current ₹', 'P/L ₹', 'Return %', 'Now %', 'Target %', 'Gap %', 'To invest ₹']
  titleBlock(ds, 'Divisions vs targets', 'Rolled up from the Holdings sheet with SUMIF. "To invest" is what the division needs to reach its target weight at the current total.', D_COLS.length)
  const D_HEAD = 4
  headerRow(ds, D_HEAD, D_COLS)
  const D_FIRST = D_HEAD + 1
  const hRange = `Holdings!$A$${H_FIRST}:$A$${Math.max(H_LAST, H_FIRST)}`
  const hInv = `Holdings!$J$${H_FIRST}:$J$${Math.max(H_LAST, H_FIRST)}`
  const hCur = `Holdings!$K$${H_FIRST}:$K$${Math.max(H_LAST, H_FIRST)}`
  const D_TOTAL = D_FIRST + divisions.length

  divisions.forEach((d, i) => {
    const r = D_FIRST + i
    const row = ds.getRow(r)
    row.getCell(1).value = d.name
    row.getCell(1).font = { bold: true, color: { argb: INK } }
    row.getCell(2).value = { formula: `SUMIF(${hRange},A${r},${hInv})` }
    row.getCell(3).value = { formula: `SUMIF(${hRange},A${r},${hCur})` }
    row.getCell(4).value = { formula: `C${r}-B${r}` }
    row.getCell(5).value = { formula: `IF(B${r}=0,"",D${r}/B${r})` }
    row.getCell(6).value = { formula: `IF($C$${D_TOTAL}=0,"",C${r}/$C$${D_TOTAL})` }
    row.getCell(7).value = (Number(d.targetPercent) || 0) / 100
    row.getCell(8).value = { formula: `G${r}-F${r}` }
    // Amount needed so this division hits its target of the (grown) total.
    row.getCell(9).value = { formula: `IF(G${r}=0,0,MAX(0,G${r}*$C$${D_TOTAL}-C${r}))` }
    ;[2, 3, 4, 9].forEach(c => { row.getCell(c).numFmt = INR })
    ;[5, 6, 7, 8].forEach(c => { row.getCell(c).numFmt = PCT })
  })
  const D_LAST = D_FIRST + divisions.length - 1
  finishTable(ds, D_HEAD, Math.max(D_LAST, D_HEAD), D_COLS.length)
  if (divisions.length) {
    totalRow(ds, D_TOTAL, D_COLS.length, 'TOTAL', {
      2: { f: `SUM(B${D_FIRST}:B${D_LAST})`, z: INR },
      3: { f: `SUM(C${D_FIRST}:C${D_LAST})`, z: INR },
      4: { f: `C${D_TOTAL}-B${D_TOTAL}`, z: INR },
      5: { f: `IF(B${D_TOTAL}=0,"",D${D_TOTAL}/B${D_TOTAL})`, z: PCT },
      6: { f: `SUM(F${D_FIRST}:F${D_LAST})`, z: PCT },
      7: { f: `SUM(G${D_FIRST}:G${D_LAST})`, z: PCT },
      9: { f: `SUM(I${D_FIRST}:I${D_LAST})`, z: INR },
    })
    ds.addConditionalFormatting({
      ref: `H${D_FIRST}:H${D_LAST}`,
      rules: [
        { type: 'cellIs', operator: 'lessThan', formulae: [0], style: { font: { color: { argb: RED } } }, priority: 1 },
        { type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { color: { argb: GREEN } } }, priority: 2 },
      ],
    })
  }
  ds.columns.forEach((c, i) => { c.width = [24, 15, 15, 14, 11, 10, 10, 10, 15][i] || 12 })

  // ══ SUBDIVISIONS ═══════════════════════════════════════════════════════════
  const subRows = []
  divisions.forEach(d => (d.subdivisions || []).forEach(sd => subRows.push({ d, sd })))
  if (subRows.length) {
    const ss = wb.addWorksheet('Subdivisions', { properties: { tabColor: { argb: 'FF34D399' } } })
    const S_COLS = ['Division', 'Subdivision', 'Invested ₹', 'Current ₹', 'P/L ₹', 'Return %', '% of division', 'Target % of division', 'Gap %']
    titleBlock(ss, 'Subdivisions', 'Targets here are a share of the parent division, matching how the app reads them.', S_COLS.length)
    const S_HEAD = 4
    headerRow(ss, S_HEAD, S_COLS)
    const hSub = `Holdings!$B$${H_FIRST}:$B$${Math.max(H_LAST, H_FIRST)}`
    subRows.forEach(({ d, sd }, i) => {
      const r = S_HEAD + 1 + i
      const row = ss.getRow(r)
      row.getCell(1).value = d.name
      row.getCell(2).value = sd.name
      row.getCell(2).font = { bold: true, color: { argb: INK } }
      row.getCell(3).value = { formula: `SUMIFS(${hInv},${hRange},A${r},${hSub},B${r})` }
      row.getCell(4).value = { formula: `SUMIFS(${hCur},${hRange},A${r},${hSub},B${r})` }
      row.getCell(5).value = { formula: `D${r}-C${r}` }
      row.getCell(6).value = { formula: `IF(C${r}=0,"",E${r}/C${r})` }
      row.getCell(7).value = { formula: `IFERROR(D${r}/SUMIF(${hRange},A${r},${hCur}),"")` }
      row.getCell(8).value = (Number(sd.targetPercent) || 0) / 100
      row.getCell(9).value = { formula: `IFERROR(H${r}-G${r},"")` }
      ;[3, 4, 5].forEach(c => { row.getCell(c).numFmt = INR })
      ;[6, 7, 8, 9].forEach(c => { row.getCell(c).numFmt = PCT })
    })
    finishTable(ss, S_HEAD, S_HEAD + subRows.length, S_COLS.length, { freezeCols: 2 })
    ss.columns.forEach((c, i) => { c.width = [20, 26, 15, 15, 14, 11, 13, 18, 10][i] || 12 })
  }

  // ══ BANK CASH ══════════════════════════════════════════════════════════════
  const bs = wb.addWorksheet('Bank cash', { properties: { tabColor: { argb: 'FF4ADE80' } } })
  const B_COLS = ['Account', 'Bank', 'Type', 'Balance ₹', 'Share of cash %', 'Note', 'Updated']
  titleBlock(bs, 'Bank cash', 'Money held outside the investment portfolio. Deliberately excluded from every allocation and target percentage.', B_COLS.length)
  const B_HEAD = 4
  headerRow(bs, B_HEAD, B_COLS)
  const B_FIRST = B_HEAD + 1
  const B_TOTAL = B_FIRST + bankAccounts.length
  bankAccounts.forEach((a, i) => {
    const r = B_FIRST + i
    const row = bs.getRow(r)
    row.getCell(1).value = a.name
    row.getCell(1).font = { bold: true, color: { argb: INK } }
    row.getCell(2).value = a.bankName || '—'
    row.getCell(3).value = a.accountType || '—'
    row.getCell(4).value = Number(a.balance) || 0
    row.getCell(4).numFmt = INR
    row.getCell(5).value = { formula: `IF($D$${B_TOTAL}=0,"",D${r}/$D$${B_TOTAL})` }
    row.getCell(5).numFmt = PCT
    row.getCell(6).value = a.note || ''
    row.getCell(7).value = (a.updatedAt || '').slice(0, 10)
  })
  finishTable(bs, B_HEAD, Math.max(B_FIRST + bankAccounts.length - 1, B_HEAD), B_COLS.length)
  if (bankAccounts.length) {
    totalRow(bs, B_TOTAL, B_COLS.length, 'TOTAL', {
      4: { f: `SUM(D${B_FIRST}:D${B_TOTAL - 1})`, z: INR },
      5: { f: `IF(D${B_TOTAL}=0,"",1)`, z: PCT },
    })
  }
  bs.columns.forEach((c, i) => { c.width = [26, 18, 16, 16, 15, 30, 12][i] || 12 })

  // ══ BROKERS ════════════════════════════════════════════════════════════════
  // The workbook would otherwise repeat the app's old mistake of showing only the
  // unrealised gain; true net profit is a formula over these columns.
  let brokerTotalRow = null
  if (brokers.length) {
    const ks = wb.addWorksheet('Brokers', { properties: { tabColor: { argb: 'FF818CF8' } } })
    const K_COLS = ['Broker', 'Net amount put in ₹', 'Worth now ₹', 'Capital gain ₹',
      'Dividends ₹', 'Actual return ₹', 'Return %', 'App-recorded invested ₹', 'Gap ₹', 'Note']
    titleBlock(ks, 'Brokers', 'The net amount actually put into each broker — already net of booked profit, losses and charges — against what those holdings are worth today. Capital gain, return and the gap are formulas.', K_COLS.length)
    const K_HEAD = 4
    headerRow(ks, K_HEAD, K_COLS)
    const K_FIRST = K_HEAD + 1
    brokers.forEach((b, i) => {
      const r = K_FIRST + i
      const row = ks.getRow(r)
      row.getCell(1).value = b.name || b.platform
      row.getCell(1).font = { bold: true, color: { argb: INK } }
      row.getCell(2).value = Number(b.netDeposited) || 0
      row.getCell(3).value = Number(b.holdingsValue) || 0
      row.getCell(4).value = { formula: `C${r}-B${r}` }              // worth now − put in
      row.getCell(5).value = Number(b.dividends) || 0
      row.getCell(6).value = { formula: `D${r}+E${r}` }              // + dividends
      row.getCell(7).value = { formula: `IF(B${r}=0,"",F${r}/B${r})` }
      row.getCell(8).value = Number(b.holdingsInvested) || 0
      row.getCell(9).value = { formula: `H${r}-B${r}` }
      row.getCell(10).value = b.note || ''
      for (const c of [2, 3, 4, 5, 6, 8, 9]) row.getCell(c).numFmt = INR
      row.getCell(7).numFmt = PCT
    })
    const K_LAST = K_FIRST + brokers.length - 1
    brokerTotalRow = K_LAST + 1
    finishTable(ks, K_HEAD, K_LAST, K_COLS.length)
    totalRow(ks, brokerTotalRow, K_COLS.length, 'TOTAL', Object.fromEntries(
      [2, 3, 4, 5, 6, 8, 9].map(c => {
        const col = String.fromCharCode(64 + c)
        return [c, { f: `SUM(${col}${K_FIRST}:${col}${K_LAST})`, z: INR }]
      }).concat([[7, { f: `IF(B${brokerTotalRow}=0,"",F${brokerTotalRow}/B${brokerTotalRow})`, z: PCT }]])
    ))
    ks.addConditionalFormatting({
      ref: `D${K_FIRST}:F${brokerTotalRow}`,
      rules: [
        { type: 'cellIs', operator: 'lessThan', formulae: [0], style: { font: { color: { argb: RED } } }, priority: 1 },
        { type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { color: { argb: GREEN } } }, priority: 2 },
      ],
    })
    ks.columns.forEach((c, i) => { c.width = [22, 19, 15, 15, 13, 16, 10, 20, 13, 28][i] || 12 })
  }

  // ══ SUMMARY ════════════════════════════════════════════════════════════════
  // Built last but moved to the front: it only references the other sheets.
  const sum = wb.addWorksheet('Summary', { properties: { tabColor: { argb: 'FFFBBF24' } } })
  titleBlock(sum, 'Portfolio summary', `Every figure below is a formula over the other sheets. Exported ${stamp}.`, 2)
  const kpis = [
    ['Invested', `Divisions!B${D_TOTAL}`, INR],
    ['Current value', `Divisions!C${D_TOTAL}`, INR],
    ['Profit / loss', `Divisions!D${D_TOTAL}`, INR],
    ['Return', `IF(Divisions!B${D_TOTAL}=0,"",Divisions!D${D_TOTAL}/Divisions!B${D_TOTAL})`, PCT],
    ['Positions', `COUNTA(Holdings!C${H_FIRST}:C${Math.max(H_LAST, H_FIRST)})`, '#,##0'],
    ['Winners', `COUNTIF(Holdings!L${H_FIRST}:L${Math.max(H_LAST, H_FIRST)},">0")`, '#,##0'],
    ['Losers', `COUNTIF(Holdings!L${H_FIRST}:L${Math.max(H_LAST, H_FIRST)},"<0")`, '#,##0'],
    ['Biggest position', `IFERROR(INDEX(Holdings!C${H_FIRST}:C${Math.max(H_LAST, H_FIRST)},MATCH(MAX(Holdings!K${H_FIRST}:K${Math.max(H_LAST, H_FIRST)}),Holdings!K${H_FIRST}:K${Math.max(H_LAST, H_FIRST)},0)),"—")`, null],
    ['To invest to hit all targets', `Divisions!I${D_TOTAL}`, INR],
    ...(brokerTotalRow ? [
      [null, null, null],
      ['Net amount put in (brokers)', `Brokers!B${brokerTotalRow}`, INR],
      ['Capital gain vs amount put in', `Brokers!D${brokerTotalRow}`, INR],
      ['Dividends received', `Brokers!E${brokerTotalRow}`, INR],
      ['Actual return', `Brokers!F${brokerTotalRow}`, INR],
    ] : []),
    [null, null, null],
    ['Bank cash (outside portfolio)', bankAccounts.length ? `'Bank cash'!D${B_TOTAL}` : null, INR],
    ['Net worth (portfolio + bank)', bankAccounts.length ? `Divisions!C${D_TOTAL}+'Bank cash'!D${B_TOTAL}` : `Divisions!C${D_TOTAL}`, INR],
  ]
  let sr = 4
  kpis.forEach(([label, formula, fmt]) => {
    if (!label) { sr++; return }
    const row = sum.getRow(sr)
    row.getCell(1).value = label
    row.getCell(1).font = { bold: true, size: 10, color: { argb: INK } }
    row.getCell(1).alignment = { vertical: 'middle' }
    const v = row.getCell(2)
    if (formula) v.value = { formula }
    else v.value = 0
    if (fmt) v.numFmt = fmt
    v.font = { bold: true, size: 12, color: { argb: INK } }
    v.alignment = { horizontal: 'right', vertical: 'middle' }
    ;[1, 2].forEach(c => { row.getCell(c).border = ALL_BORDERS })
    row.height = 20
    sr++
  })
  sum.getColumn(1).width = 46
  sum.getColumn(2).width = 22

  // A short reading guide directly under the figures, so the file explains itself a
  // year from now. Kept in column A (merged across) rather than off to the side —
  // a side column lands on its own page when printed.
  const notes = [
    'How to use this file',
    '• Holdings is the source data. Edit "Current ₹" (column I) and every other sheet updates.',
    '• Divisions and Subdivisions roll up from Holdings with SUMIF, so nothing is hard-coded.',
    '• Bank cash is tracked separately and is never part of an allocation percentage.',
    '• Projection has yellow input cells — change them to model different assumptions.',
    '• To restore this data into the app, use the JSON backup instead: Export → JSON backup.',
  ]
  sr += 1
  notes.forEach((line, i) => {
    const r = sr + i
    sum.mergeCells(r, 1, r, 2)
    const c = sum.getCell(r, 1)
    c.value = line
    c.font = i === 0
      ? { bold: true, size: 11, color: { argb: INK } }
      : { size: 9, color: { argb: MUTED } }
    c.alignment = { wrapText: true, vertical: 'middle' }
    sum.getRow(r).height = i === 0 ? 22 : 14
  })
  sum.pageSetup = { fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.4, right: 0.4, top: 0.5, bottom: 0.5, header: 0.2, footer: 0.2 } }

  // ══ SECTOR / MARKET CAP ════════════════════════════════════════════════════
  const analysable = holdings.filter(h => h.platform !== 'bank' && h.assetType !== 'fd')
  const sectors = [...new Set(analysable.map(h => h.sector || '—'))].sort()
  const caps = [...new Set(analysable.map(h => h.capCategory || '—'))].sort()
  if (sectors.length || caps.length) {
    const bk = wb.addWorksheet('Breakdown', { properties: { tabColor: { argb: 'FFF472B6' } } })
    titleBlock(bk, 'Sector & market-cap split', 'SUMIF over the Holdings sheet. Bank deposits and FDs are excluded, matching the app.', 5)
    let r = 4
    const block = (heading, keys, col) => {
      const hRow = bk.getRow(r)
      hRow.getCell(1).value = heading
      hRow.getCell(1).font = { bold: true, size: 11, color: { argb: INK } }
      r++
      headerRow(bk, r, ['Category', 'Invested ₹', 'Current ₹', 'P/L ₹', 'Share %'])
      const head = r
      r++
      const first = r
      keys.forEach(k => {
        const row = bk.getRow(r)
        row.getCell(1).value = k
        row.getCell(2).value = { formula: `SUMIF(Holdings!$${col}$${H_FIRST}:$${col}$${Math.max(H_LAST, H_FIRST)},A${r},${hInv})` }
        row.getCell(3).value = { formula: `SUMIF(Holdings!$${col}$${H_FIRST}:$${col}$${Math.max(H_LAST, H_FIRST)},A${r},${hCur})` }
        row.getCell(4).value = { formula: `C${r}-B${r}` }
        row.getCell(5).value = { formula: `IF(SUM($C$${first}:$C$${first + keys.length - 1})=0,"",C${r}/SUM($C$${first}:$C$${first + keys.length - 1}))` }
        ;[2, 3, 4].forEach(c => { row.getCell(c).numFmt = INR })
        row.getCell(5).numFmt = PCT
        r++
      })
      const last = r - 1
      for (let rr = first; rr <= last; rr++) {
        for (let c = 1; c <= 5; c++) {
          bk.getRow(rr).getCell(c).border = ALL_BORDERS
          if ((rr - head) % 2 === 0) bk.getRow(rr).getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: BAND } }
        }
      }
      bk.addConditionalFormatting({
        ref: `E${first}:E${last}`,
        rules: [{ type: 'dataBar', cfvo: [{ type: 'num', value: 0 }, { type: 'max' }], color: { argb: ACCENT }, priority: 1 }],
      })
      r += 2
      return { first, last }
    }
    block('By sector', sectors, 'Q')
    block('By market cap', caps, 'R')
    bk.columns.forEach((c, i) => { c.width = [28, 16, 16, 15, 12][i] || 12 })
  }

  // ══ EXPENSES ═══════════════════════════════════════════════════════════════
  if (expenses.length) {
    const es = wb.addWorksheet('Expenses', { properties: { tabColor: { argb: 'FFFB923C' } } })
    const E_COLS = ['Year', 'Month', 'Type', 'Category', 'Amount ₹', 'Description']
    titleBlock(es, 'Income & expenses', 'Raw entries. The Monthly sheet pivots these with SUMIFS.', E_COLS.length)
    const E_HEAD = 4
    headerRow(es, E_HEAD, E_COLS)
    const MONTHS = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
    const sorted = [...expenses].sort((a, b) => (b.year - a.year) || (b.month - a.month) || String(a.category).localeCompare(String(b.category)))
    sorted.forEach((e, i) => {
      const r = E_HEAD + 1 + i
      const row = es.getRow(r)
      row.getCell(1).value = Number(e.year) || 0
      row.getCell(2).value = MONTHS[Number(e.month)] || e.month
      row.getCell(3).value = e.type === 'income' ? 'Income' : 'Expense'
      row.getCell(4).value = e.category || '—'
      row.getCell(5).value = Number(e.amount) || 0
      row.getCell(5).numFmt = INR
      row.getCell(6).value = e.description || ''
    })
    const E_LAST = E_HEAD + sorted.length
    finishTable(es, E_HEAD, E_LAST, E_COLS.length, { freezeCols: 2 })
    es.columns.forEach((c, i) => { c.width = [9, 9, 12, 24, 15, 40][i] || 12 })

    // Monthly pivot: income, expense, savings, savings rate — all formulas.
    const ms = wb.addWorksheet('Monthly', { properties: { tabColor: { argb: 'FFFB923C' } } })
    const M_COLS = ['Year', 'Month', 'Income ₹', 'Expenses ₹', 'Saved ₹', 'Savings rate %']
    titleBlock(ms, 'Month by month', 'SUMIFS over the Expenses sheet — add rows there and these totals follow.', M_COLS.length)
    const M_HEAD = 4
    headerRow(ms, M_HEAD, M_COLS)
    const periods = [...new Set(expenses.map(e => `${e.year}-${e.month}`))]
      .map(k => ({ year: Number(k.split('-')[0]), month: Number(k.split('-')[1]) }))
      .sort((a, b) => (b.year - a.year) || (b.month - a.month))
    const eYear = `Expenses!$A$${E_HEAD + 1}:$A$${E_LAST}`
    const eMonth = `Expenses!$B$${E_HEAD + 1}:$B$${E_LAST}`
    const eType = `Expenses!$C$${E_HEAD + 1}:$C$${E_LAST}`
    const eAmt = `Expenses!$E$${E_HEAD + 1}:$E$${E_LAST}`
    periods.forEach((p, i) => {
      const r = M_HEAD + 1 + i
      const row = ms.getRow(r)
      row.getCell(1).value = p.year
      row.getCell(2).value = MONTHS[p.month] || p.month
      row.getCell(3).value = { formula: `SUMIFS(${eAmt},${eYear},A${r},${eMonth},B${r},${eType},"Income")` }
      row.getCell(4).value = { formula: `SUMIFS(${eAmt},${eYear},A${r},${eMonth},B${r},${eType},"Expense")` }
      row.getCell(5).value = { formula: `C${r}-D${r}` }
      row.getCell(6).value = { formula: `IF(C${r}=0,"",E${r}/C${r})` }
      ;[3, 4, 5].forEach(c => { row.getCell(c).numFmt = INR })
      row.getCell(6).numFmt = PCT
    })
    const M_LAST = M_HEAD + periods.length
    finishTable(ms, M_HEAD, M_LAST, M_COLS.length, { freezeCols: 2 })
    if (periods.length) {
      totalRow(ms, M_LAST + 1, M_COLS.length, 'TOTAL', {
        3: { f: `SUM(C${M_HEAD + 1}:C${M_LAST})`, z: INR },
        4: { f: `SUM(D${M_HEAD + 1}:D${M_LAST})`, z: INR },
        5: { f: `C${M_LAST + 1}-D${M_LAST + 1}`, z: INR },
        6: { f: `IF(C${M_LAST + 1}=0,"",E${M_LAST + 1}/C${M_LAST + 1})`, z: PCT },
      })
      ms.addConditionalFormatting({
        ref: `E${M_HEAD + 1}:E${M_LAST}`,
        rules: [
          { type: 'cellIs', operator: 'lessThan', formulae: [0], style: { font: { color: { argb: RED } } }, priority: 1 },
          { type: 'cellIs', operator: 'greaterThan', formulae: [0], style: { font: { color: { argb: GREEN } } }, priority: 2 },
        ],
      })
    }
    ms.columns.forEach((c, i) => { c.width = [9, 9, 16, 16, 16, 15][i] || 12 })
  }

  // ══ PROJECTION ═════════════════════════════════════════════════════════════
  // A live model: yellow input cells, everything else formulas.
  const ps = wb.addWorksheet('Projection', { properties: { tabColor: { argb: 'FF22D3EE' } } })
  titleBlock(ps, 'Projection', 'Change any yellow cell and the whole table recalculates. Monthly rate is (1+r)^(1/12)-1, so 12% means 12% a year.', 6)
  const inputs = [
    ['Starting corpus ₹', { formula: `Divisions!C${D_TOTAL}` }, INR],
    ['Expected annual return', 0.12, PCT],
    ['Monthly addition (SIP) ₹', 0, INR],
    ['Annual SIP step-up', 0.1, PCT],
    ['Yearly lumpsum ₹', 0, INR],
    ['Inflation', 0.06, PCT],
    ['Horizon (years)', 15, '#,##0'],
  ]
  let ir = 4
  inputs.forEach(([label, val, fmt]) => {
    const row = ps.getRow(ir)
    row.getCell(1).value = label
    row.getCell(1).font = { bold: true, size: 10, color: { argb: INK } }
    const c = row.getCell(2)
    c.value = val
    c.numFmt = fmt
    c.font = { bold: true, size: 11, color: { argb: INK } }
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF9C3' } }  // input = yellow
    c.border = ALL_BORDERS
    c.alignment = { horizontal: 'right' }
    row.getCell(1).border = ALL_BORDERS
    ir++
  })
  const P = { start: 'B4', ret: 'B5', sip: 'B6', step: 'B7', lump: 'B8', infl: 'B9', years: 'B10' }

  const P_HEAD = 13
  ps.getCell(12, 1).value = 'Year by year'
  ps.getCell(12, 1).font = { bold: true, size: 11, color: { argb: INK } }
  headerRow(ps, P_HEAD, ['Year', 'Monthly SIP that year ₹', 'Put in to date ₹', 'Value ₹', 'Gain ₹', "In today's ₹"])
  const P_FIRST = P_HEAD + 1
  const YEARS = 40
  // 12 end-of-month contributions compounded to the year end. With the effective
  // monthly rate rm = (1+r)^(1/12)-1, the annuity factor collapses to r/rm — and at
  // r = 0 it is simply 12 payments, which the IF guards (rm would be 0).
  const annuity = sipRef => `IF($${P.ret}=0,${sipRef}*12,${sipRef}*$${P.ret}/((1+$${P.ret})^(1/12)-1))`
  for (let y = 0; y <= YEARS; y++) {
    const r = P_FIRST + y
    const row = ps.getRow(r)
    row.getCell(1).value = y
    if (y === 0) {
      row.getCell(2).value = null
      row.getCell(3).value = { formula: `$${P.start}` }
      row.getCell(4).value = { formula: `$${P.start}` }
    } else {
      const beyond = `A${r}>$${P.years}`
      // The SIP steps up on each anniversary, so year y runs at sip*(1+step)^(y-1).
      row.getCell(2).value = { formula: `IF(${beyond},"",$${P.sip}*(1+$${P.step})^(A${r}-1))` }
      row.getCell(3).value = { formula: `IF(${beyond},"",C${r - 1}+B${r}*12+$${P.lump})` }
      row.getCell(4).value = { formula: `IF(${beyond},"",D${r - 1}*(1+$${P.ret})+${annuity(`B${r}`)}+$${P.lump})` }
    }
    row.getCell(5).value = { formula: `IF(D${r}="","",D${r}-C${r})` }
    row.getCell(6).value = { formula: `IF(D${r}="","",D${r}/(1+$${P.infl})^A${r})` }
    ;[2, 3, 4, 5, 6].forEach(c => { row.getCell(c).numFmt = INR })
  }
  const P_LAST = P_FIRST + YEARS
  finishTable(ps, P_HEAD, P_LAST, 6)
  ps.columns.forEach((c, i) => { c.width = [8, 24, 18, 18, 18, 18][i] || 12 })

  // Present the sheets in reading order. `wb.worksheets` hands back a copy, so
  // sorting it does nothing — the writer orders by each sheet's orderNo.
  const order = ['Summary', 'Holdings', 'Divisions', 'Subdivisions', 'Breakdown', 'Brokers', 'Bank cash', 'Expenses', 'Monthly', 'Projection']
  wb.worksheets.forEach(w => {
    const i = order.indexOf(w.name)
    w.orderNo = i === -1 ? order.length : i
  })

  return wb
}

module.exports = { buildWorkbook, flattenHoldings }
