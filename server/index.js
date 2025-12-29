const express = require('express');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const XLSX = require('xlsx');
const {
  loadPortfolio,
  savePortfolio,
  loadExpenses,
  saveExpense,
  deleteExpense,
  loadCategories,
  saveCategories,
  createDivision,
  createSubdivision,
  createHolding,
} = require('./storage')
const { computeAnalytics, computeBudgetAllocation, computeSubdivisionGoalSeek } = require('./analytics')

const app = express();
const PORT = process.env.PORT || 3001;

const WORKBOOK_FILENAME = process.env.WORKBOOK || 'PORTFOLIO DIVISION.xlsx';
const WORKBOOK_PATH = path.resolve(process.cwd(), WORKBOOK_FILENAME);

// CORS configuration - allow all origins in production
const corsOptions = {
  origin: process.env.NODE_ENV === 'production' ? '*' : ['http://localhost:5173', 'http://127.0.0.1:5173'],
  credentials: false
};
app.use(cors(corsOptions));
app.use(express.json());

// Serve static files from React app in production
if (process.env.NODE_ENV === 'production') {
  const distPath = path.resolve(process.cwd(), 'portfolio-app', 'dist');
  console.log('Serving static files from:', distPath);
  app.use(express.static(distPath));
}

// Optional: mirror API under a hidden prefix in production and block direct /api
// Set API_BASE_PATH to a custom path like /t/a/s/d/xyz123 and DISABLE_DIRECT_API=true
const API_BASE_PATH = process.env.API_BASE_PATH
if (process.env.NODE_ENV === 'production' && API_BASE_PATH && API_BASE_PATH !== '/api') {
  // Rewrite requests under hidden prefix to /api while marking them trusted
  app.use(API_BASE_PATH, (req, res, next) => {
    req.url = '/api' + req.url
    req.skipApiBlock = true
    next()
  })
  // Block direct /api access unless coming via the hidden prefix
  app.use((req, res, next) => {
    if (process.env.DISABLE_DIRECT_API === 'true' && req.url.startsWith('/api') && !req.skipApiBlock) {
      return res.status(404).json({ error: 'not found' })
    }
    next()
  })
}

// Storage for uploads: place next to existing workbook and replace it atomically
const upload = multer({ dest: path.resolve(process.cwd(), 'uploads') });

// Fetch live quotes from Alpha Vantage (server-side to avoid CORS)
const ALPHA_VANTAGE_API_KEY = 'W907DOM8IQ7AOTZC'

async function fetchQuotes(symbols) {
  const cleaned = symbols
    .map(s => (s || '').trim())
    .filter(Boolean)
    .slice(0, 25) // Alpha Vantage free tier: 25 requests/day limit, be conservative
    .map(s => s.toUpperCase())

  if (cleaned.length === 0) return { quotes: {}, missing: [] }

  const quotes = {}
  const missing = []

  // Alpha Vantage requires individual requests per symbol
  // For Indian stocks, try with .BSE suffix first (Bombay Stock Exchange)
  for (const symbol of cleaned) {
    try {
      // Prepare symbol for Alpha Vantage (NSE/BSE stocks)
      let avSymbol = symbol.replace(/\.(NS|BO)$/i, '')
      
      // Alpha Vantage format for Indian stocks: SYMBOL.BSE (Bombay) or use base symbol
      const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(avSymbol)}.BSE&apikey=${ALPHA_VANTAGE_API_KEY}`
      
      const resp = await fetch(url)
      if (!resp.ok) throw new Error(`Quote fetch failed ${resp.status}`)
      
      const data = await resp.json()
      const quote = data['Global Quote']
      
      if (quote && quote['05. price']) {
        const price = Number(quote['05. price'])
        if (Number.isFinite(price) && price > 0) {
          quotes[symbol] = { 
            price, 
            currency: 'INR',
            sourceSymbol: `${avSymbol}.BSE`,
            change: Number(quote['09. change'] || 0),
            changePercent: quote['10. change percent'] || '0%'
          }
          console.log(`[QUOTES] ${symbol}: ₹${price.toFixed(2)}`)
          continue
        }
      }
      
      // If .BSE fails, try without suffix (for non-Indian stocks)
      const fallbackUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(avSymbol)}&apikey=${ALPHA_VANTAGE_API_KEY}`
      const fallbackResp = await fetch(fallbackUrl)
      if (fallbackResp.ok) {
        const fallbackData = await fallbackResp.json()
        const fallbackQuote = fallbackData['Global Quote']
        
        if (fallbackQuote && fallbackQuote['05. price']) {
          const price = Number(fallbackQuote['05. price'])
          if (Number.isFinite(price) && price > 0) {
            quotes[symbol] = { 
              price, 
              currency: fallbackQuote['09. change'] ? 'USD' : 'INR',
              sourceSymbol: avSymbol,
              change: Number(fallbackQuote['09. change'] || 0),
              changePercent: fallbackQuote['10. change percent'] || '0%'
            }
            console.log(`[QUOTES] ${symbol}: ${quotes[symbol].currency}${price.toFixed(2)}`)
            continue
          }
        }
      }
      
      missing.push(symbol)
      console.log(`[QUOTES] ${symbol}: not found`)
      
    } catch (e) {
      console.error(`[QUOTES] ${symbol} fetch failed:`, e.message)
      missing.push(symbol)
    }
    
    // Rate limiting: Alpha Vantage free tier allows 5 API requests per minute
    await new Promise(resolve => setTimeout(resolve, 12000)) // 12 seconds between requests
  }

  console.log('[QUOTES] Fetched', Object.keys(quotes).length, 'prices; missing:', missing.length)
  return { quotes, missing }
}

function readWorkbook(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Workbook not found at ${filePath}`);
  }
  const wb = XLSX.readFile(filePath, { cellDates: true });
  return wb;
}

function sheetToJson(sheet) {
  // Use header from first row, preserve raw values
  return XLSX.utils.sheet_to_json(sheet, { defval: null });
}

function getAllData() {
  const wb = readWorkbook(WORKBOOK_PATH);
  const sheets = {};
  wb.SheetNames.forEach((name) => {
    try {
      sheets[name] = sheetToJson(wb.Sheets[name]);
    } catch (e) {
      sheets[name] = { error: e.message };
    }
  });
  return { file: path.basename(WORKBOOK_PATH), sheets: Object.keys(sheets), data: sheets };
}

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, workbook: path.basename(WORKBOOK_PATH) });
});

app.get('/api/workbook', (_req, res) => {
  try {
    const wb = readWorkbook(WORKBOOK_PATH);
    res.json({ file: path.basename(WORKBOOK_PATH), sheets: wb.SheetNames });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/data', (req, res) => {
  try {
    const wb = readWorkbook(WORKBOOK_PATH);
    const { sheet } = req.query;
    if (sheet) {
      if (!wb.SheetNames.includes(sheet)) {
        return res.status(404).json({ error: `Sheet ${sheet} not found` });
      }
      return res.json({ sheet, rows: sheetToJson(wb.Sheets[sheet]) });
    }
    // All data
    const result = {};
    wb.SheetNames.forEach((name) => {
      result[name] = sheetToJson(wb.Sheets[name]);
    });
    res.json({ file: path.basename(WORKBOOK_PATH), data: result });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/upload', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
  const uploaded = req.file.path;
  const target = WORKBOOK_PATH;
  const backup = `${target}.bak`;
  try {
    if (fs.existsSync(target)) fs.renameSync(target, backup);
    fs.renameSync(uploaded, target);
    if (fs.existsSync(backup)) fs.unlinkSync(backup);
    res.json({ ok: true, file: path.basename(target) });
  } catch (e) {
    // Restore backup on failure
    try {
      if (fs.existsSync(backup)) fs.renameSync(backup, target);
    } catch (_) {}
    res.status(500).json({ error: e.message });
  }
});

// Simple grouping utility for charts: /api/group?sheet=...&by=Sector&value=Amount
app.get('/api/group', (req, res) => {
  try {
    const { sheet, by, value } = req.query;
    if (!sheet || !by) return res.status(400).json({ error: 'sheet and by are required' });
    const wb = readWorkbook(WORKBOOK_PATH);
    if (!wb.SheetNames.includes(sheet)) {
      return res.status(404).json({ error: `Sheet ${sheet} not found` });
    }
    const rows = sheetToJson(wb.Sheets[sheet]);
    const map = new Map();
    rows.forEach((r) => {
      const key = r[by] ?? 'Unknown';
      const amt = value ? Number(r[value] || 0) : 1;
      map.set(key, (map.get(key) || 0) + (Number.isFinite(amt) ? amt : 0));
    });
    const labels = Array.from(map.keys());
    const values = Array.from(map.values());
    res.json({ labels, values, by, value: value || 'count' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Live quotes endpoint
app.get('/api/quotes', async (req, res) => {
  try {
    const symbolsParam = req.query.symbols || ''
    const symbols = symbolsParam.split(',').map(s => s.trim()).filter(Boolean)
    const { quotes, missing } = await fetchQuotes(symbols)
    res.json({ quotes, missing })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
});

// Portfolio JSON storage CRUD
app.get('/api/portfolio', async (_req, res) => {
  try {
    const p = await loadPortfolio()
    res.json(p)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/portfolio', async (req, res) => {
  try {
    const body = req.body || {}
    const next = await savePortfolio({ divisions: Array.isArray(body.divisions) ? body.divisions : [], updatedAt: new Date().toISOString() })
    res.json(next)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/divisions', async (req, res) => {
  try {
    const { name, targetPercent } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const p = await loadPortfolio()
    const d = createDivision({ name, targetPercent })
    p.divisions.push(d)
    await savePortfolio(p)
    res.json(d)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/divisions/:id', async (req, res) => {
  try {
    const p = await loadPortfolio()
    const d = p.divisions.find(x => x.id === req.params.id)
    if (!d) return res.status(404).json({ error: 'division not found' })
    const { name, targetPercent } = req.body || {}
    if (name !== undefined) d.name = name
    if (targetPercent !== undefined) d.targetPercent = Number(targetPercent) || 0
    await savePortfolio(p)
    res.json(d)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/divisions/:id', async (req, res) => {
  try {
    const p = await loadPortfolio()
    const idx = p.divisions.findIndex(x => x.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'division not found' })
    const [removed] = p.divisions.splice(idx, 1)
    await savePortfolio(p)
    res.json(removed)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/divisions/:id/subdivisions', async (req, res) => {
  try {
    const p = await loadPortfolio()
    const d = p.divisions.find(x => x.id === req.params.id)
    if (!d) return res.status(404).json({ error: 'division not found' })
    const { name, targetPercent } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const sd = createSubdivision({ name, targetPercent })
    d.subdivisions = d.subdivisions || []
    d.subdivisions.push(sd)
    await savePortfolio(p)
    res.json(sd)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.post('/api/divisions/:id/holdings', async (req, res) => {
  try {
    const p = await loadPortfolio()
    const d = p.divisions.find(x => x.id === req.params.id)
    if (!d) return res.status(404).json({ error: 'division not found' })
    const { name, invested, current, subdivisionId } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const h = createHolding({ name, invested, current })
    if (subdivisionId) {
      const sd = (d.subdivisions || []).find(s => s.id === subdivisionId)
      if (!sd) return res.status(404).json({ error: 'subdivision not found' })
      sd.holdings = sd.holdings || []
      sd.holdings.push(h)
    } else {
      d.holdings = d.holdings || []
      d.holdings.push(h)
    }
    await savePortfolio(p)
    res.json(h)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/holdings/:hid', async (req, res) => {
  try {
    const p = await loadPortfolio()
    let found
    for (const d of p.divisions) {
      if (d.holdings) {
        const h = d.holdings.find(x => x.id === req.params.hid)
        if (h) { found = h; break }
      }
      for (const sd of (d.subdivisions || [])) {
        const h = (sd.holdings || []).find(x => x.id === req.params.hid)
        if (h) { found = h; break }
      }
      if (found) break
    }
    if (!found) return res.status(404).json({ error: 'holding not found' })
    const { name, invested, current, targetPercent } = req.body || {}
    if (name !== undefined) found.name = name
    if (invested !== undefined) found.invested = Number(invested) || 0
    if (current !== undefined) found.current = Number(current) || 0
    if (targetPercent !== undefined) found.targetPercent = Number(targetPercent) || 0
    await savePortfolio(p)
    res.json(found)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/holdings/:hid', async (req, res) => {
  try {
    const p = await loadPortfolio()
    for (const d of p.divisions) {
      if (d.holdings) {
        const idx = d.holdings.findIndex(x => x.id === req.params.hid)
        if (idx !== -1) { const [rm] = d.holdings.splice(idx, 1); await savePortfolio(p); return res.json(rm) }
      }
      for (const sd of (d.subdivisions || [])) {
        const idx = (sd.holdings || []).findIndex(x => x.id === req.params.hid)
        if (idx !== -1) { const [rm] = sd.holdings.splice(idx, 1); await savePortfolio(p); return res.json(rm) }
      }
    }
    return res.status(404).json({ error: 'holding not found' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.get('/api/portfolio/analytics', async (req, res) => {
  try {
    const budget = req.query.budget
    const p = await loadPortfolio()
    const analytics = computeAnalytics(p)
    const budgetAdds = budget !== undefined ? computeBudgetAllocation(analytics.divisions, budget) : {}
    res.json({ ...analytics, budget, budgetAdditions: budgetAdds })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Subdivision goal seek for each division
app.get('/api/subdivision-goal-seek', async (req, res) => {
  try {
    const p = await loadPortfolio()
    const result = {}
    for (const div of p.divisions) {
      const goalSeek = computeSubdivisionGoalSeek(div)
      result[div.id] = goalSeek
    }
    res.json(result)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Subdivision update/delete
app.patch('/api/subdivisions/:sid', async (req, res) => {
  try {
    const p = await loadPortfolio()
    let sub
    for (const d of p.divisions) {
      for (const sd of (d.subdivisions || [])) {
        if (sd.id === req.params.sid) { sub = sd; break }
      }
      if (sub) break
    }
    if (!sub) return res.status(404).json({ error: 'subdivision not found' })
    const { name, targetPercent } = req.body || {}
    if (name !== undefined) sub.name = name
    if (targetPercent !== undefined) sub.targetPercent = Number(targetPercent) || 0
    await savePortfolio(p)
    res.json(sub)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/subdivisions/:sid', async (req, res) => {
  try {
    const p = await loadPortfolio()
    for (const d of p.divisions) {
      const arr = d.subdivisions || []
      const idx = arr.findIndex(sd => sd.id === req.params.sid)
      if (idx !== -1) {
        const [rm] = arr.splice(idx, 1)
        d.subdivisions = arr
        await savePortfolio(p)
        return res.json(rm)
      }
    }
    res.status(404).json({ error: 'subdivision not found' })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ===== EXPENSES ROUTES =====

// Get all expenses
app.get('/api/expenses', async (req, res) => {
  try {
    const expenses = await loadExpenses()
    const normalized = (expenses || []).map(e => {
      const { _id, id, ...rest } = e || {}
      return { id: String(id || _id || ''), ...rest }
    })
    res.json(normalized)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Add new expense
app.post('/api/expenses', async (req, res) => {
  try {
    const newExpense = {
      type: req.body.type,
      category: req.body.category,
      amount: Number(req.body.amount),
      month: Number(req.body.month),
      year: Number(req.body.year),
      description: req.body.description || ''
    }
    
    const saved = await saveExpense(newExpense)
    const { _id, id, ...rest } = saved || {}
    res.json({ id: String(id || _id || ''), ...rest })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Delete expense
app.delete('/api/expenses/:id', async (req, res) => {
  try {
    const result = await deleteExpense(req.params.id)
    if (!result) return res.status(404).json({ error: 'Expense not found' })
    res.json({ success: true })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ===== CATEGORIES ROUTES =====

// Get categories
app.get('/api/categories', async (req, res) => {
  try {
    const categories = await loadCategories()
    res.json(categories)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Save categories
app.post('/api/categories', async (req, res) => {
  try {
    const { expense = [], income = [] } = req.body
    const categories = await saveCategories({ expense, income })
    res.json(categories)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Add category to list
app.post('/api/categories/:type', async (req, res) => {
  try {
    const { type } = req.params
    const { name } = req.body
    
    if (!['expense', 'income'].includes(type)) {
      return res.status(400).json({ error: 'Invalid category type' })
    }
    if (!name || typeof name !== 'string') {
      return res.status(400).json({ error: 'Category name required' })
    }
    
    const categories = await loadCategories()
    if (!categories[type].includes(name)) {
      categories[type].push(name)
      await saveCategories(categories)
    }
    res.json(categories)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Delete category from list
app.delete('/api/categories/:type/:name', async (req, res) => {
  try {
    const { type, name } = req.params
    const decodedName = decodeURIComponent(name)
    
    if (!['expense', 'income'].includes(type)) {
      return res.status(400).json({ error: 'Invalid category type' })
    }
    
    const categories = await loadCategories()
    categories[type] = categories[type].filter(c => c !== decodedName)
    await saveCategories(categories)
    res.json(categories)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Catch-all route to serve React app for client-side routing (production only)
// Only for non-API routes
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res) => {
    // Don't intercept API routes
    if (req.path.startsWith('/api')) {
      return res.status(404).json({ error: 'API endpoint not found' });
    }
    const indexPath = path.resolve(process.cwd(), 'portfolio-app', 'dist', 'index.html');
    console.log('Serving index.html from:', indexPath, 'for path:', req.path);
    res.sendFile(indexPath);
  });
}

app.listen(PORT, () => {
  console.log(`API listening on http://localhost:${PORT}`);
});
