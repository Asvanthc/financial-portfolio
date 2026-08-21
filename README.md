# Portfolio Dashboard

A lightweight app to replace your Excel workbook with interactive visualizations.

## What it includes
- Node/Express API reading `PORTFOLIO DIVISION.xlsx` and exposing JSON endpoints
- React + Vite frontend with chart panels (pie/bar/line)
- Quick grouping UI to visualize allocations by any column
- Upload endpoint to replace the workbook without redeploying

## Quick start

Requirements: Node 18+

```bash
# From the repo root
npm install
cd portfolio-app && npm install && cd ..

# Run API and frontend together
npm run dev
```

- API: http://localhost:3001
- App: http://localhost:5173

## API
- `GET /api/workbook` → `{ file, sheets: string[] }`
- `GET /api/data?sheet=SheetName` → `{ sheet, rows: object[] }`
- `GET /api/data` → `{ file, data: { [sheet]: rows } }`
- `GET /api/group?sheet=...&by=Sector&value=Amount` → `{ labels, values }`
- `POST /api/upload` (form-data: `file`) → replace workbook

Set `WORKBOOK` env var to point to another file if needed.

## Customizing charts
- Use the Grouping selectors in the UI to choose a categorical column (e.g., Sector, Asset Class, Category) and optionally a numeric column to sum.
- Edit `src/components/ChartPanel.jsx` to change chart types/colors.

## Price sources (all free, no API keys)

`server/prices.js` prices holdings bulk-first, so a 40-holding portfolio costs ~3 outbound
requests rather than ~120. That matters: the earlier version raced three providers per ticker
and got rate-limited into failing.

| Order | Source | Covers | Batch? |
|---|---|---|---|
| 1 | CNBC quote service (`SYMBOL-IN` for NSE) | Indian stocks + ETFs, US stocks + ETFs | yes, pipe-separated |
| 2 | Tickertape (`/search` → sid, then `/stocks/quotes`) | Indian stocks + ETFs | yes, by sid |
| 3 | NSE `quote-equity` (cookie session) | Indian | per symbol |
| 4 | Yahoo `v8/finance/chart` (query2 then query1) | everything | per symbol |
| 5 | Google Finance HTML | everything | per symbol |
| 6 | NSE bhavcopy CSV (whole market, EOD) | Indian | one request, all symbols |
| — | mfapi.in, then AMFI `NAVAll.txt` | mutual fund NAV | NAVAll is one request, all schemes |
| — | Frankfurter, then open.er-api | FX to INR | — |

Notes:
- Quotes are cached 5 min; the bhavcopy/NAVAll bulk files 30 min; ticker→sid a week.
- NSE and Tickertape may be blocked from a cloud datacenter IP. Hit
  `GET /api/debug/price-sources` on the deployed instance to see which providers *its* IP can
  reach; `GET /api/debug/price-cache` shows cache state and `POST /api/debug/price-cache/clear`
  resets it.
- `POST /api/holdings/refresh-all` will not overwrite a price that moved more than 60% — those
  come back in a `suspicious` array to confirm manually, since that size of jump is nearly always
  a mis-resolved symbol rather than a real move.

## Bank cash

Money sitting in a bank account lives outside the investment portfolio entirely — its own
`bank` Mongo collection (or a top-level `bankAccounts` key in `data/portfolio.json`), never a
division or a holding. It is displayed on the Overview tab and in the KPI row, and is excluded
from every allocation %, target %, goal-seek and rebalance figure. Endpoints:
`GET/POST /api/bank-accounts`, `PATCH/DELETE /api/bank-accounts/:id`.

This is distinct from holdings with `platform: 'bank'` or `assetType: 'fd'`, which *are* part of
the portfolio.

## Export & backup

The **Export** button in the header opens everything data-related.

| What | Endpoint | Restorable? |
|---|---|---|
| Excel workbook (.xlsx) | `GET /api/export/excel` | no — it's a model, not a backup |
| Holdings CSV | `GET /api/export/csv` | no |
| JSON backup | `GET /api/backup` | **yes** |
| Restore | `POST /api/backup/restore` `{backup, confirm:true}` | — |

The workbook is generated with ExcelJS and is *live*, not a snapshot: Holdings is the source
data and every other sheet (Divisions, Subdivisions, Breakdown, Bank cash, Monthly, Projection)
derives from it with real `SUMIF`/`SUMIFS` formulas, so editing a price in column I recalculates
the whole file. The Projection sheet has yellow input cells and reproduces the app's own
projection maths — verified to the rupee against it.

Restore is deliberately awkward: it needs `confirm: true`, it validates the file's shape before
touching anything, it tells you what's in the file *and* what will be overwritten, and it returns
the previous data as `rollback` in the response. Only the JSON backup can be restored.

## Notes
- The app reads the workbook on every request, ensuring it always reflects the latest file.
- If your workbook has time-series data (e.g., Year/Month), group by that and set a numeric value, then swap to a Line chart for trends.
