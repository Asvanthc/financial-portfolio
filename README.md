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

## Notes
- The app reads the workbook on every request, ensuring it always reflects the latest file.
- If your workbook has time-series data (e.g., Year/Month), group by that and set a numeric value, then swap to a Line chart for trends.
