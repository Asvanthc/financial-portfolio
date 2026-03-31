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

// Fetch MF NAV from AMFI via mfapi.in
async function fetchMfNav(schemeCodes) {
  const results = {}
  await Promise.all(schemeCodes.map(async code => {
    try {
      const resp = await fetch(`https://api.mfapi.in/mf/${code}/latest`)
      if (!resp.ok) return
      const data = await resp.json()
      const nav = Number(data?.data?.[0]?.nav)
      if (nav > 0) results[code] = { price: nav, date: data?.data?.[0]?.date || null, currency: 'INR' }
    } catch (_) {}
  }))
  return results
}

// ── NSE India session (cookie required for their API) ───────────────────────
const nseSession = { cookie: '', fetchedAt: 0, initInProgress: false }
const NSE_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-US,en;q=0.9',
  'Referer': 'https://www.nseindia.com/',
}

async function ensureNseSession() {
  if (nseSession.cookie && Date.now() - nseSession.fetchedAt < 30 * 60 * 1000) return
  if (nseSession.initInProgress) {
    for (let i = 0; i < 20; i++) {
      await new Promise(r => setTimeout(r, 500))
      if (!nseSession.initInProgress) return
    }
    return
  }
  nseSession.initInProgress = true
  try {
    const r = await fetch('https://www.nseindia.com/', {
      headers: { ...NSE_HEADERS, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    })
    const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : []
    const cookie = setCookies.map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ')
    if (cookie) {
      nseSession.cookie = cookie
      nseSession.fetchedAt = Date.now()
      console.log('[NSE] Session ready, cookies:', cookie.length, 'chars')
    } else {
      console.warn('[NSE] No cookies received from homepage')
    }
  } catch (e) {
    console.error('[NSE] Session init failed:', e.message)
  } finally {
    nseSession.initInProgress = false
  }
}

async function fetchNsePrice(symbol) {
  // NSE uses bare symbol without exchange suffix
  const nseSymbol = symbol.replace(/\.(NS|BO|NSE|BSE)$/i, '').toUpperCase()
  await ensureNseSession()
  try {
    const r = await fetch(`https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(nseSymbol)}`, {
      headers: { ...NSE_HEADERS, Cookie: nseSession.cookie },
    })
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) nseSession.fetchedAt = 0
      console.warn(`[NSE] ${nseSymbol} → HTTP ${r.status}`)
      return null
    }
    const data = await r.json()
    const price = Number(data?.priceInfo?.lastPrice)
    if (Number.isFinite(price) && price > 0) {
      console.log(`[NSE] ${nseSymbol} → ₹${price}`)
      return price
    }
    return null
  } catch (e) {
    console.error('[NSE] fetchNsePrice error:', nseSymbol, e.message)
    return null
  }
}

// Yahoo Finance — used only for foreign stocks (no .NS/.BO suffix expected)
const yfSession = { cookie: '', crumb: '', fetchedAt: 0, initInProgress: false }
const YF_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
  'Accept-Language': 'en-US,en;q=0.9',
}

async function ensureYfSession() {
  if (yfSession.crumb && Date.now() - yfSession.fetchedAt < 55 * 60 * 1000) return
  if (yfSession.initInProgress) return
  yfSession.initInProgress = true
  try {
    const r1 = await fetch('https://finance.yahoo.com/', { headers: YF_HEADERS })
    const setCookieHeader = r1.headers.getSetCookie ? r1.headers.getSetCookie() : []
    const cookie = setCookieHeader.map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ')
    let crumb = ''
    for (let attempt = 0; attempt < 2; attempt++) {
      if (attempt > 0) await new Promise(r => setTimeout(r, 3000))
      const r2 = await fetch('https://query2.finance.yahoo.com/v1/test/getcrumb', {
        headers: { ...YF_HEADERS, Accept: '*/*', Cookie: cookie },
      })
      crumb = (await r2.text()).trim()
      if (crumb && !crumb.toLowerCase().includes('request') && crumb.length < 40) break
    }
    if (crumb && !crumb.toLowerCase().includes('request') && crumb.length < 40) {
      yfSession.cookie = cookie
      yfSession.crumb = crumb
      yfSession.fetchedAt = Date.now()
      console.log('[YF] Session ready, crumb length:', crumb.length)
    }
  } catch (e) {
    console.error('[YF] Session init failed:', e.message)
  } finally {
    yfSession.initInProgress = false
  }
}

async function fetchYfPrice(symbol) {
  await ensureYfSession()
  if (!yfSession.crumb) return null
  try {
    const url = `https://query2.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbol)}&crumb=${encodeURIComponent(yfSession.crumb)}`
    const resp = await fetch(url, { headers: { ...YF_HEADERS, Cookie: yfSession.cookie } })
    if (!resp.ok) {
      if (resp.status === 401 || resp.status === 403) yfSession.fetchedAt = 0
      return null
    }
    const data = await resp.json()
    const r = data?.quoteResponse?.result?.[0]
    if (!r) return null
    const price = Number(r.regularMarketPrice ?? r.regularMarketPreviousClose)
    return (Number.isFinite(price) && price > 0) ? price : null
  } catch (e) {
    console.error('[YF] fetchYfPrice error:', symbol, e.message)
    return null
  }
}

// Warm up NSE session at startup
ensureNseSession().catch(() => {})

// Fetch live quotes — NSE primary for Indian stocks, Yahoo Finance for foreign
async function fetchQuotes(symbols) {
  const cleaned = symbols.map(s => (s || '').trim()).filter(Boolean).slice(0, 50)
  if (cleaned.length === 0) return { quotes: {}, missing: [] }

  const results = await Promise.all(cleaned.map(async sym => {
    const upper = sym.toUpperCase()
    const isIndian = !upper.includes('.') || /\.(NS|BO)$/i.test(upper)
    let price = null
    let source = null

    if (isIndian) {
      price = await fetchNsePrice(upper)
      source = 'NSE'
      // NSE failed — try BSE/equity ETF variant if plain symbol
      if (price === null && !/\.(NS|BO)$/i.test(upper)) {
        price = await fetchNsePrice(upper + '.BO')
        source = 'NSE/BSE'
      }
    } else {
      price = await fetchYfPrice(upper)
      source = 'Yahoo Finance'
    }

    return { sym, price, source }
  }))

  const quotes = {}
  const missing = []
  results.forEach(({ sym, price, source }) => {
    if (price !== null) quotes[sym] = { price, currency: isIndian(sym) ? 'INR' : 'USD', source }
    else missing.push(sym)
  })

  function isIndian(s) { return !s.includes('.') || /\.(NS|BO)$/i.test(s) }

  console.log('[QUOTES] Fetched', Object.keys(quotes).length, '/', cleaned.length, '; missing:', missing)
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

// Stock/ETF ticker search via Yahoo Finance autocomplete
app.get('/api/stock/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.json([])
    await ensureYfSession()
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=10&newsCount=0&listsCount=0&crumb=${encodeURIComponent(yfSession.crumb)}`
    const resp = await fetch(url, { headers: { ...YF_HEADERS, 'Cookie': yfSession.cookie } })
    if (!resp.ok) return res.json([])
    const data = await resp.json()
    const quotes = (data?.quotes || [])
      .filter(q => q.symbol && ['EQUITY', 'ETF', 'MUTUALFUND'].includes(q.quoteType))
      .map(q => ({
        symbol: q.symbol,
        name: q.longname || q.shortname || q.symbol,
        exchange: q.exchDisp || q.exchange || '',
        type: q.quoteType,
      }))
      .slice(0, 10)
    res.json(quotes)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// MF search via mfapi.in
app.get('/api/mf/search', async (req, res) => {
  try {
    const q = (req.query.q || '').trim()
    if (!q) return res.json([])
    const resp = await fetch(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(q)}`)
    if (!resp.ok) return res.json([])
    const data = await resp.json()
    res.json((data || []).slice(0, 20))
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// MF latest NAV
app.get('/api/mf/nav', async (req, res) => {
  try {
    const codes = (req.query.codes || '').split(',').map(s => s.trim()).filter(Boolean)
    if (!codes.length) return res.json({})
    const navs = await fetchMfNav(codes)
    res.json(navs)
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Refresh price for a single holding based on its assetType + ticker/schemeCode
app.post('/api/holdings/:hid/refresh-price', async (req, res) => {
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

    let newPrice = null
    let debugInfo = {}
    const at = found.assetType || 'stock'

    if (at === 'mf' && found.schemeCode) {
      const navs = await fetchMfNav([found.schemeCode])
      newPrice = navs[found.schemeCode]?.price ?? null
      debugInfo = { source: 'AMFI', schemeCode: found.schemeCode, navResult: navs[found.schemeCode] || null }
    } else if (['stock', 'etf', 'foreign', 'gold'].includes(at) && found.ticker) {
      const { quotes, missing } = await fetchQuotes([found.ticker])
      const q = quotes[found.ticker]
      newPrice = q?.price ?? null
      debugInfo = {
        source: q?.source || 'NSE',
        tickerQueried: found.ticker,
        found: !!q,
        missing,
        hint: !q ? `"${found.ticker}" not found. For Indian stocks use the NSE symbol e.g. INFY, RELIANCE, TMPV. For foreign stocks use Yahoo ticker e.g. AAPL, VOO.` : null,
      }
    } else {
      debugInfo = { reason: at === 'fd' ? 'FD has no live price — update manually' : 'No ticker or scheme code set on this holding' }
    }

    if (newPrice !== null) {
      found.currentPrice = newPrice
      found.priceDate = new Date().toISOString().split('T')[0]
      if (found.units > 0) found.current = Math.round(found.units * newPrice * 100) / 100
      await savePortfolio(p)
    }

    res.json({ holding: found, newPrice, ...debugInfo })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

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
    const { name, invested, current, subdivisionId, platform, assetType, ticker, schemeCode, units, buyPrice, currentPrice, note } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const h = createHolding({ name, invested, current, platform, assetType, ticker, schemeCode, units, buyPrice, currentPrice, note })
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
    const { name, invested, current, targetPercent, platform, assetType, ticker, schemeCode, units, buyPrice, currentPrice, priceDate, note } = req.body || {}
    if (name !== undefined) found.name = name
    if (invested !== undefined) found.invested = Number(invested) || 0
    if (current !== undefined) found.current = Number(current) || 0
    if (targetPercent !== undefined) found.targetPercent = Number(targetPercent) || 0
    if (platform !== undefined) found.platform = platform
    if (assetType !== undefined) found.assetType = assetType
    if (ticker !== undefined) found.ticker = ticker
    if (schemeCode !== undefined) found.schemeCode = schemeCode
    if (units !== undefined) found.units = Number(units) || 0
    if (buyPrice !== undefined) found.buyPrice = Number(buyPrice) || 0
    if (currentPrice !== undefined) found.currentPrice = Number(currentPrice) || 0
    if (priceDate !== undefined) found.priceDate = priceDate
    if (note !== undefined) found.note = note
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
