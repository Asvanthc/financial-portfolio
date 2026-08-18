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
  saveMonthExpenses,
  loadBankAccounts,
  saveBankAccounts,
  createBankAccount,
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

// All price/quote/search/FX plumbing lives in ./prices — see the header comment
// there for why the old "race 3 providers per ticker" approach kept getting
// rate-limited into failure.
const prices = require('./prices')
const {
  fetchQuotes,
  fetchMfNav,
  fetchRateToInr,
  searchStocks,
  searchMf,
  ensureNseSession,
  fetchWithTimeout,
  NSE_HEADERS,
  nseSession,
} = prices

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

// Exchange rate: foreign currency -> INR. Frankfurter (ECB) with an open.er-api
// fallback, cached 6h inside ./prices.
app.get('/api/exchange-rate/:currency', async (req, res) => {
  const currency = req.params.currency.toUpperCase()
  try {
    const fx = await fetchRateToInr(currency)
    if (!fx || !fx.rate) return res.status(404).json({ error: `No INR rate for ${currency}` })
    res.json({ currency, rateToInr: fx.rate, date: fx.date, source: fx.source })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// Stock/ETF ticker search — NSE autocomplete, Tickertape and Yahoo run in parallel
// inside ./prices and the first non-empty result wins (NSE is best for Indian names
// but is blocked from datacenter IPs like Render's).
// NEVER 500s: search failing must not break the form; the user can always type manually.
app.get('/api/stock/search', async (req, res) => {
  try {
    res.json(await searchStocks(req.query.q))
  } catch (_) { res.json([]) }
})

// MF search — mfapi.in, falling back to a scan of AMFI's full scheme list.
app.get('/api/mf/search', async (req, res) => {
  try {
    res.json(await searchMf(req.query.q))
  } catch (_) { res.json([]) }
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

// A price that moves more than this against the stored one is almost always a
// mis-resolved symbol or a currency mix-up rather than a real move. Shared by both
// refresh paths: the batch refresh refuses the write, the single refresh flags it.
const SANITY_LIMIT = 0.6
function isSanePriceMove(prev, next) {
  const p = Number(prev) || 0
  if (p <= 0 || !(next > 0)) return true
  return Math.abs(next / p - 1) <= SANITY_LIMIT
}

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
    // A single-holding refresh is an explicit user action, so bypass the cache.
    const opts = { force: true }

    if (at === 'mf' && found.schemeCode) {
      const navs = await fetchMfNav([found.schemeCode])
      const nav = navs[found.schemeCode]
      newPrice = nav?.price ?? null
      debugInfo = { source: nav?.source || 'AMFI', schemeCode: found.schemeCode, navResult: nav || null, asOf: nav?.date || null }
    } else if (['stock', 'etf', 'foreign', 'gold'].includes(at) && found.ticker) {
      const { quotes, missing } = await fetchQuotes([{ ticker: found.ticker, assetType: found.assetType }], opts)
      const q = quotes[found.ticker]
      newPrice = q?.price ?? null
      debugInfo = {
        source: q?.source || null,
        asOf: q?.asOf || null,
        currency: q?.currency || null,
        tickerQueried: found.ticker,
        found: !!q,
        missing,
        hint: !q ? `"${found.ticker}" not found on any source. For Indian stocks use the NSE symbol e.g. INFY, RELIANCE, TMPV. For foreign stocks use the Yahoo ticker e.g. AAPL, VOO. Check /api/debug/price-sources to see which providers this server can reach.` : null,
      }
      // currentPrice is always INR. A non-INR quote therefore has to be converted —
      // and if it can't be, it must NOT be written, or a $717 price lands in a rupee
      // field and understates the holding ~95x.
      const quoteCcy = q?.currency ? String(q.currency).toUpperCase() : null
      if (q?.price != null && quoteCcy && quoteCcy !== 'INR') {
        const currency = quoteCcy
        const fx = await fetchRateToInr(currency)
        const rate = fx?.rate || found.exchangeRate || 0
        if (rate) {
          found.foreignCurrentPrice = q.price
          found.currency = currency
          found.exchangeRate = rate
          if (found.units > 0) found.foreignCurrent = Math.round(found.units * q.price * 100) / 100
          newPrice = Math.round(q.price * rate * 100) / 100
          debugInfo.exchangeRate = rate
          debugInfo.nativePrice = q.price
        } else {
          newPrice = null
          debugInfo.found = false
          debugInfo.hint = `Got a ${q.currency} price (${q.price}) for "${found.ticker}" but no ${currency}→INR rate was available, so nothing was saved. Try again, or set the price manually.`
        }
      }
      if (newPrice !== null && q?.routeGuessed) debugInfo.routeGuessed = true
    } else {
      debugInfo = { reason: at === 'fd' ? 'FD has no live price — update manually' : 'No ticker or scheme code set on this holding' }
    }

    if (newPrice !== null) {
      // Unlike the batch refresh, a single-holding refresh still writes an
      // implausible price — the user is looking at that one row and would otherwise
      // see "nothing happened" — but it comes back flagged so the UI can warn.
      const prevPrice = Number(found.currentPrice) || 0
      if (!isSanePriceMove(prevPrice, newPrice)) {
        debugInfo.suspicious = { oldPrice: prevPrice, newPrice, source: debugInfo.source || null }
      }
      found.currentPrice = newPrice
      found.priceDate = new Date().toISOString().split('T')[0]
      found.priceSource = debugInfo.source || null
      if (found.units > 0) found.current = Math.round(found.units * newPrice * 100) / 100
      await savePortfolio(p)
    }

    res.json({ holding: found, newPrice, ...debugInfo })
  } catch (e) {
    res.status(500).json({ error: e.message })
  }
})

// ── Batch refresh all holdings ──────────────────────────────────────────────
app.post('/api/holdings/refresh-all', async (req, res) => {
  try {
    const p = await loadPortfolio()
    const allH = []
    p.divisions.forEach(d => {
      ;(d.holdings || []).forEach(h => allH.push(h))
      ;(d.subdivisions || []).forEach(sd => (sd.holdings || []).forEach(h => allH.push(h)))
    })

    const stocks = allH.filter(h => h.ticker && ['stock','etf','foreign','gold'].includes(h.assetType))
    const mfs    = allH.filter(h => h.schemeCode && h.assetType === 'mf')

    // Deduplicate by ticker; carry assetType so foreign holdings route correctly
    const uniqueStockItems = [...new Map(stocks.map(h => [h.ticker, { ticker: h.ticker, assetType: h.assetType }])).values()]
    const [quotesRes, navsRes] = await Promise.all([
      stocks.length ? fetchQuotes(uniqueStockItems) : Promise.resolve({ quotes: {}, missing: [] }),
      mfs.length    ? fetchMfNav([...new Set(mfs.map(h => h.schemeCode))]) : Promise.resolve({}),
    ])

    // What currency is this holding priced in? Only 'foreign' holdings are anything
    // other than INR; one with no currency set adopts whatever its quote came back in.
    const holdingCurrency = h => (h.assetType === 'foreign'
      ? String(h.currency || quotesRes.quotes[h.ticker]?.currency || 'INR')
      : 'INR').toUpperCase()

    // Fetch fresh exchange rates for every currency we might need.
    const foreignCurrencies = [...new Set(
      stocks.map(holdingCurrency).filter(c => c && c !== 'INR')
    )]
    const freshRates = {}
    await Promise.all(foreignCurrencies.map(async cur => {
      const fx = await fetchRateToInr(cur).catch(() => null)
      if (fx?.rate) freshRates[cur] = fx.rate
    }))

    let updated = 0, failed = 0, skipped = 0
    const failedNames = []
    const suspicious = []
    const bySource = {}
    const today = new Date().toISOString().split('T')[0]

    const isSane = (h, next) => isSanePriceMove(h.currentPrice, next)

    stocks.forEach(h => {
      const q = quotesRes.quotes[h.ticker]
      if (q?.price) {
        // currentPrice is an INR field. Compare the currency the quote came back in
        // against the currency this holding is priced in: if they disagree, refuse.
        // Converting when we shouldn't (INR quote × 95.69) and not converting when we
        // should ($718 into a rupee field) are both ~95x errors, so guard both ways.
        const quoteCcy = String(q.currency || 'INR').toUpperCase()
        const holdingCcy = holdingCurrency(h)
        if (quoteCcy !== holdingCcy) {
          suspicious.push({
            name: h.name, ticker: h.ticker, oldPrice: h.currentPrice, newPrice: q.price,
            source: q.source,
            reason: `quote came back in ${quoteCcy} but this holding is priced in ${holdingCcy} — check the ticker and asset type`,
          })
          return
        }
        const isForeign = holdingCcy !== 'INR'
        const rate = isForeign ? (freshRates[holdingCcy] || h.exchangeRate || 0) : 1
        if (isForeign && !rate) {
          suspicious.push({
            name: h.name, ticker: h.ticker, oldPrice: h.currentPrice, newPrice: q.price,
            source: q.source, reason: `no ${holdingCcy}→INR rate available right now`,
          })
          return
        }
        const priceInr = isForeign ? Math.round(q.price * rate * 100) / 100 : q.price
        if (!isSane(h, priceInr)) {
          suspicious.push({ name: h.name, ticker: h.ticker, oldPrice: h.currentPrice, newPrice: priceInr, source: q.source, reason: 'moved more than 60%' })
          return
        }
        h.currentPrice = priceInr
        h.priceDate = today
        h.priceSource = q.source || null
        if (isForeign) {
          h.foreignCurrentPrice = q.price
          h.currency = holdingCcy   // adopt the quote's currency if the holding had none
          if (rate) h.exchangeRate = rate
          if (h.units > 0) h.foreignCurrent = Math.round(h.units * q.price * 100) / 100
        }
        if (h.units > 0) h.current = Math.round(h.units * priceInr * 100) / 100
        updated++
        bySource[q.source || 'unknown'] = (bySource[q.source || 'unknown'] || 0) + 1
      } else { failed++; failedNames.push(h.ticker || h.name) }
    })
    mfs.forEach(h => {
      const navInfo = navsRes[h.schemeCode]
      const nav = navInfo?.price
      if (nav) {
        if (!isSane(h, nav)) {
          suspicious.push({ name: h.name, schemeCode: h.schemeCode, oldPrice: h.currentPrice, newPrice: nav, source: navInfo.source, reason: 'moved more than 60%' })
          return
        }
        h.currentPrice = nav
        h.priceDate = today
        h.priceSource = navInfo.source || null
        if (h.units > 0) h.current = Math.round(h.units * nav * 100) / 100
        updated++
        bySource[navInfo.source || 'unknown'] = (bySource[navInfo.source || 'unknown'] || 0) + 1
      } else { failed++; failedNames.push(h.schemeCode || h.name) }
    })
    allH.filter(h => !h.ticker && !h.schemeCode).forEach(() => skipped++)

    await savePortfolio(p)
    res.json({
      updated, failed, skipped,
      total: stocks.length + mfs.length,
      failedNames,
      suspicious,
      bySource,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ── ETF → Index mapping ──────────────────────────────────────────────────────
const ETF_INDEX_MAP = {
  // ── NIFTY 50 ──────────────────────────────────────────────────────────────
  NIFTYBEES:'NIFTY 50', SETFNIF50:'NIFTY 50', N50IETF:'NIFTY 50',
  HDFCNIFETF:'NIFTY 50', ICICINIFTY:'NIFTY 50', KOTAKNIFTY:'NIFTY 50',
  AXISN50ETF:'NIFTY 50', SBIETFNIFTY:'NIFTY 50', BSLNIFTY:'NIFTY 50',
  UTINIFTETF:'NIFTY 50', LICNFNHGP:'NIFTY 50', ABSLBANETF:'NIFTY 50',
  EDELWEISSETF:'NIFTY 50',

  // ── NIFTY NEXT 50 ─────────────────────────────────────────────────────────
  JUNIORBEES:'NIFTY NEXT 50', SETFNN50:'NIFTY NEXT 50',
  ICICINN50:'NIFTY NEXT 50', HDFCNEXT50:'NIFTY NEXT 50',
  KOTAKNXT50:'NIFTY NEXT 50', SBIETFQLTY:'NIFTY NEXT 50',
  UTINEXT50:'NIFTY NEXT 50',

  // ── NIFTY 100 ─────────────────────────────────────────────────────────────
  NIF100BEES:'NIFTY 100', LICNETF100:'NIFTY 100',
  ICICINF100:'NIFTY 100', KOTAKNIF100:'NIFTY 100',

  // ── NIFTY 200 / 500 ───────────────────────────────────────────────────────
  SETFNIF200:'NIFTY 200',

  // ── NIFTY MIDCAP ──────────────────────────────────────────────────────────
  NIFTYMID150BEES:'NIFTY MIDCAP 150', MIDCAPETF:'NIFTY MIDCAP 100',
  LICNMID100:'NIFTY MIDCAP 100', ICICINMID150:'NIFTY MIDCAP 150',
  HDFCMID150:'NIFTY MIDCAP 150', KOTAKMIDCAP:'NIFTY MIDCAP 100',
  MID150BEES:'NIFTY MIDCAP 150', MAFSETFMID:'NIFTY MIDCAP 150',

  // ── NIFTY SMALLCAP ────────────────────────────────────────────────────────
  SMALLCAPBEES:'NIFTY SMALLCAP 250', SMALLCAP:'NIFTY SMALLCAP 250',
  SETFNIFSMCP:'NIFTY SMALLCAP 100', ICICISMLCAP:'NIFTY SMALLCAP 250',

  // ── NIFTY BANK ────────────────────────────────────────────────────────────
  BANKBEES:'NIFTY BANK', BANKETF:'NIFTY BANK',
  HDFCBANKSETF:'NIFTY BANK', KOTAKBKETF:'NIFTY BANK',
  ICICIBANK:'NIFTY BANK', PSUBNKETF:'NIFTY PSU BANK',
  SETFBANKIB:'NIFTY BANK', LICNFBANK:'NIFTY BANK',

  // ── NIFTY IT ──────────────────────────────────────────────────────────────
  ITBEES:'NIFTY IT', ITETF:'NIFTY IT',
  HDFCIT:'NIFTY IT', ICICIIT:'NIFTY IT', KOTAKIT:'NIFTY IT',

  // ── NIFTY PHARMA ──────────────────────────────────────────────────────────
  PHARMABEES:'NIFTY PHARMA', PHARMIETF:'NIFTY PHARMA',
  HDFCPHARMA:'NIFTY PHARMA', ICICIPHARM:'NIFTY PHARMA',

  // ── NIFTY AUTO ────────────────────────────────────────────────────────────
  AUTOBEES:'NIFTY AUTO', AUTOIETF:'NIFTY AUTO',

  // ── NIFTY FMCG ────────────────────────────────────────────────────────────
  FMCGIETF:'NIFTY FMCG', HDFCFMCG:'NIFTY FMCG',

  // ── NIFTY METAL ───────────────────────────────────────────────────────────
  METALIETF:'NIFTY METAL', HDFCMETAL:'NIFTY METAL',

  // ── NIFTY REALTY ──────────────────────────────────────────────────────────
  REALTYBEES:'NIFTY REALTY',

  // ── NIFTY INFRA / DEFENCE ─────────────────────────────────────────────────
  INFRAIETF:'NIFTY INFRASTRUCTURE', INDIAINF:'NIFTY INFRASTRUCTURE',
  DEFENCEIETF:'NIFTY INDIA DEFENCE', INDIANDEF:'NIFTY INDIA DEFENCE',

  // ── NIFTY MOMENTUM / FACTOR ───────────────────────────────────────────────
  MOM50:'NIFTY200 MOMENTUM 50', MOMENTUM:'NIFTY200 MOMENTUM 50',
  MOMNIFTY:'NIFTY200 MOMENTUM 50', ALPHAETF:'NIFTY ALPHA 50',
  QUAL30IETF:'NIFTY QUALITY 30', LOWVOLIETF:'NIFTY100 LOW VOLATILITY 30',

  // ── NIFTY PSU / CPSE ──────────────────────────────────────────────────────
  CPSEETF:'NIFTY CPSE INDEX', LICNFCPSE:'NIFTY CPSE INDEX',

  // ── NIFTY CONSUMPTION / ENERGY ────────────────────────────────────────────
  CONSUMBEES:'NIFTY INDIA CONSUMPTION', ENERGYIETF:'NIFTY ENERGY',

  // ── NIFTY HEALTHCARE ──────────────────────────────────────────────────────
  HEALTHIETF:'NIFTY HEALTHCARE INDEX',
}

// ETFs that track non-equity or international indices (no NSE constituent lookup possible)
const ETF_NON_EQUITY = {
  // Gold
  GOLDBEES:'gold', SBIGOLD:'gold', HDFCGOLD:'gold', AXISGOLD:'gold',
  KOTAKGOLD:'gold', NIPGOLD:'gold', ICICIGOLD:'gold', UTINIFGOLD:'gold',
  MGOLD:'gold', BSLGOLDETF:'gold', LICNFGOLD:'gold', QGOLDHALF:'gold',
  // Silver
  SILVERBEES:'silver', SILVERIETF:'silver',
  // International
  MON100:'international', MAFANG:'international', HNGSNGBEES:'international',
  NASDAQ100:'international', MOGSEC:'international', NIFTYBEES50:'international',
  N100:'international', ENEXT100:'international', MOGS:'international',
  MIRAE:'international',
}

// Fetch active MF portfolio from AMFI monthly disclosure (best-effort, may be a month old)
async function fetchAmfiPortfolio(schemeCode) {
  try {
    // AMFI portfolio API used by mfapi.in — returns holdings for some schemes
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), 8000)
    const r = await fetch(`https://api.mfapi.in/mf/${schemeCode}/portfolio`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!r.ok) return []
    const d = await r.json()
    // Expected: { portfolio: [ { isin, name, market_value, percentage, ... } ] }
    if (Array.isArray(d?.portfolio)) {
      return d.portfolio
        .filter(p => p.isin || p.name)
        .map(p => ({
          symbol: (p.nseSymbol || p.bseCode || p.isin || p.name || '').toString().toUpperCase(),
          name: p.name || p.schemeName || '',
          sector: p.sector || null,
          weight: p.percentage != null ? Number(p.percentage) : null,
          rank: null,
          isin: p.isin || null,
        }))
        .filter(p => p.symbol)
    }
    return []
  } catch (_) { return [] }
}

async function fetchIndexConstituents(indexName) {
  await ensureNseSession()
  if (!nseSession.cookie) return []
  try {
    // Hard timeout: without one, a hung NSE connection stalls the whole overlap request.
    const r = await fetchWithTimeout(`https://www.nseindia.com/api/equity-stockIndices?index=${encodeURIComponent(indexName)}`, {
      headers: { ...NSE_HEADERS, Cookie: nseSession.cookie }
    }, 8000)
    if (!r.ok) return []
    const data = await r.json()
    const stocks = (data?.data || []).filter(s => s.symbol && !s.symbol.includes(' '))
    // Index weights are based on free-float market cap (ffmCap), not traded volume.
    // Use ffmCap if available, else marketCap, else totalTradedValue as last resort.
    const totalFfm = stocks.reduce((s, x) => s + (Number(x.ffmCap) || 0), 0)
    const totalMktCap = stocks.reduce((s, x) => s + (Number(x.marketCap) || 0), 0)
    const totalTraded = stocks.reduce((s, x) => s + (Number(x.totalTradedValue) || 0), 0)
    return stocks.map((s, i) => {
      let weight = null
      if (s.weightPercentage != null) {
        weight = Number(s.weightPercentage)
      } else if (s.ffmCap && totalFfm > 0) {
        weight = Number(((Number(s.ffmCap) / totalFfm) * 100).toFixed(2))
      } else if (s.marketCap && totalMktCap > 0) {
        weight = Number(((Number(s.marketCap) / totalMktCap) * 100).toFixed(2))
      } else if (s.totalTradedValue && totalTraded > 0) {
        weight = Number(((Number(s.totalTradedValue) / totalTraded) * 100).toFixed(2))
      }
      return {
        symbol: s.symbol,
        name: s.meta?.companyName || s.symbol,
        sector: s.meta?.industry || null,
        weight,
        rank: i + 1,
      }
    })
  } catch (_) { return [] }
}

// Infer the NSE index an MF/ETF-via-MF-route tracks from its scheme name
// Called for ALL mf-type holdings (many ETFs bought via MF route have schemeCode, not ticker)
function inferMfIndex(schemeName = '', schemeCategory = '') {
  const n  = schemeName.toLowerCase()
  const sc = schemeCategory.toLowerCase()
  // Skip BSE-tracking schemes up front
  if (n.includes('sensex') || n.includes('bse')) return null
  // Skip gold/silver/debt/liquid/overnight
  if (n.includes('gold') || n.includes('silver') || n.includes('liquid') ||
      n.includes('overnight') || n.includes('debt') || n.includes('gilt') ||
      n.includes('credit risk') || n.includes('banking and psu') || n.includes('arbitrage')) return null
  // Skip international/US/nasdaq/hang seng
  if (n.includes('nasdaq') || n.includes('s&p') || n.includes('sp500') ||
      n.includes('hang seng') || n.includes('global') || n.includes('us equity') ||
      n.includes('japan') || n.includes('europe') || n.includes('china') || n.includes('world')) return null

  // Only process index funds and ETFs (covers "Other Scheme - ETF", "Equity Scheme - Index Funds", etc.)
  const isIndexOrEtf = sc.includes('index') || sc.includes('etf') || n.includes('index') || n.includes('etf')
  if (!isIndexOrEtf) return null

  // ── Specific index detection — order matters (most specific first) ──────────
  if (n.includes('nifty next 50') || n.includes('junior') || n.includes('nifty junior')) return 'NIFTY NEXT 50'
  if (n.includes('nifty 500'))    return 'NIFTY 500'
  if (n.includes('nifty 200'))    return 'NIFTY 200'
  if (n.includes('nifty 100'))    return 'NIFTY 100'
  if (n.includes('nifty 50') || n.includes('nifty50') || (n.includes('nifty') && n.includes(' 50'))) return 'NIFTY 50'
  // Midcap
  if (n.includes('midcap 150'))   return 'NIFTY MIDCAP 150'
  if (n.includes('midcap 100'))   return 'NIFTY MIDCAP 100'
  if (n.includes('midsmallcap') || n.includes('mid small')) return 'NIFTY MIDCAP 150'
  if (n.includes('midcap'))       return 'NIFTY MIDCAP 150'
  // Smallcap
  if (n.includes('smallcap 250')) return 'NIFTY SMALLCAP 250'
  if (n.includes('smallcap 100')) return 'NIFTY SMALLCAP 100'
  if (n.includes('smallcap'))     return 'NIFTY SMALLCAP 250'
  // Sectoral — must come before generic 'bank' check
  if (n.includes('psu bank') || n.includes('public sector bank')) return 'NIFTY PSU BANK'
  if (n.includes('nifty bank') || n.includes('banking')) return 'NIFTY BANK'
  if (n.includes('nifty it') || n.includes(' it etf') || n.includes('information technology')) return 'NIFTY IT'
  if (n.includes('nifty pharma') || n.includes('pharma')) return 'NIFTY PHARMA'
  if (n.includes('nifty auto') || n.includes('automobile')) return 'NIFTY AUTO'
  if (n.includes('nifty fmcg') || n.includes('fmcg')) return 'NIFTY FMCG'
  if (n.includes('nifty metal') || n.includes(' metal')) return 'NIFTY METAL'
  if (n.includes('nifty realty') || n.includes('real estate')) return 'NIFTY REALTY'
  if (n.includes('healthcare'))   return 'NIFTY HEALTHCARE INDEX'
  if (n.includes('defence') || n.includes('defense')) return 'NIFTY INDIA DEFENCE'
  if (n.includes('infrastructure') || n.includes('infra')) return 'NIFTY INFRASTRUCTURE'
  if (n.includes('energy'))       return 'NIFTY ENERGY'
  if (n.includes('consumption'))  return 'NIFTY INDIA CONSUMPTION'
  if (n.includes('cpse'))         return 'NIFTY CPSE INDEX'
  if (n.includes('psu'))          return 'NIFTY CPSE INDEX'
  // Factor / smart beta
  if (n.includes('momentum'))     return 'NIFTY200 MOMENTUM 50'
  if (n.includes('quality'))      return 'NIFTY QUALITY 30'
  if (n.includes('alpha'))        return 'NIFTY ALPHA 50'
  if (n.includes('low vol') || n.includes('low volatility')) return 'NIFTY100 LOW VOLATILITY 30'
  if (n.includes('value'))        return 'NIFTY500 VALUE 50'
  return null
}

// ── Portfolio overlap analysis ───────────────────────────────────────────────
app.get('/api/portfolio/overlap', async (req, res) => {
  try {
    const portfolio = await loadPortfolio()
    const allH = []
    portfolio.divisions.forEach(d => {
      ;(d.holdings || []).forEach(h => allH.push({ ...h, divName: d.name, subName: null }))
      ;(d.subdivisions || []).forEach(sd => (sd.holdings || []).forEach(h => allH.push({ ...h, divName: d.name, subName: sd.name })))
    })

    const directStocks = allH.filter(h => h.assetType === 'stock' && h.ticker)
    const etfHoldings  = allH.filter(h => h.assetType === 'etf'   && h.ticker)
    const mfHoldings   = allH.filter(h => h.assetType === 'mf'    && h.schemeCode)

    // Fetch index constituents for each ETF
    const etfData = {}
    await Promise.all(etfHoldings.map(async etf => {
      const sym = etf.ticker.replace(/\.(NS|BO)$/i, '').toUpperCase()
      const indexName = ETF_INDEX_MAP[sym]
      const nonEquityType = ETF_NON_EQUITY[sym]
      if (indexName) {
        const constituents = await fetchIndexConstituents(indexName)
        etfData[sym] = { indexName, constituents, holding: etf, etfType: 'equity' }
      } else if (nonEquityType) {
        etfData[sym] = { indexName: null, constituents: [], holding: etf, etfType: nonEquityType }
      } else {
        // Unknown — store ticker so frontend can display it
        etfData[sym] = { indexName: null, constituents: [], holding: etf, etfType: 'unknown', rawTicker: sym }
      }
    }))

    // Fetch MF scheme info + infer index for index funds / ETF-via-MF-route
    const mfData = {}
    await Promise.all(mfHoldings.map(async mf => {
      try {
        const ctrl = new AbortController()
        const timer = setTimeout(() => ctrl.abort(), 8000)
        const r = await fetch(`https://api.mfapi.in/mf/${mf.schemeCode}`, { signal: ctrl.signal })
        clearTimeout(timer)
        const d = await r.json()
        const meta = d?.meta || {}
        // Try scheme name from API first, fall back to stored name
        const nameForInfer = meta.scheme_name || mf.name || ''
        const catForInfer  = meta.scheme_category || ''
        const inferredIndex = inferMfIndex(nameForInfer, catForInfer)
        let constituents = []
        if (inferredIndex) {
          constituents = await fetchIndexConstituents(inferredIndex)
        } else {
          // Try AMFI portfolio disclosure for active MFs
          constituents = await fetchAmfiPortfolio(mf.schemeCode)
        }
        mfData[mf.schemeCode] = { ...meta, nameUsed: nameForInfer, inferredIndex, constituents, fromAmfi: !inferredIndex && constituents.length > 0 }
      } catch (_) { mfData[mf.schemeCode] = { inferredIndex: null, constituents: [] } }
    }))

    // Company exposure map — tracks direct value + estimated value from ETF/MF weights
    const exposure = {}
    const addExposure = (symbol, name, sector, source, directVal, estimatedVal) => {
      const key = symbol.toUpperCase()
      if (!exposure[key]) exposure[key] = {
        symbol: key, name, sector,
        directValue: 0, estimatedEtfValue: 0, estimatedMfValue: 0,
        etfCount: 0, mfCount: 0, sources: [],
      }
      if (source.type === 'stock') exposure[key].directValue += directVal || 0
      if (source.type === 'etf') { exposure[key].etfCount++; exposure[key].estimatedEtfValue += estimatedVal || 0 }
      if (source.type === 'mf')  { exposure[key].mfCount++;  exposure[key].estimatedMfValue  += estimatedVal || 0 }
      // Merge sector if missing
      if (!exposure[key].sector && sector) exposure[key].sector = sector
      exposure[key].sources.push({ ...source, estimatedVal })
    }

    directStocks.forEach(h => {
      const sym = h.ticker.replace(/\.(NS|BO)$/i, '').toUpperCase()
      addExposure(sym, h.name, null, { type: 'stock', name: h.name }, h.current || 0, 0)
    })
    Object.entries(etfData).forEach(([etfSym, etfInfo]) => {
      const holdingCurrent = etfInfo.holding?.current || 0
      ;(etfInfo.constituents || []).forEach(c => {
        const est = c.weight != null ? (c.weight / 100) * holdingCurrent : 0
        addExposure(c.symbol, c.name, c.sector, { type: 'etf', etf: etfSym, index: etfInfo.indexName, weight: c.weight, rank: c.rank }, 0, est)
      })
    })
    Object.entries(mfData).forEach(([code, info]) => {
      if (!info.constituents?.length) return
      const mfHolding = mfHoldings.find(m => m.schemeCode == code)
      const holdingCurrent = mfHolding?.current || 0
      const mfLabel = info.scheme_name || mfHolding?.name || code
      info.constituents.forEach(c => {
        const est = c.weight != null ? (c.weight / 100) * holdingCurrent : 0
        addExposure(c.symbol, c.name, c.sector, { type: 'mf', mf: mfLabel, index: info.inferredIndex, weight: c.weight, rank: c.rank }, 0, est)
      })
    })

    // Sort by total estimated exposure descending
    const companyExposure = Object.values(exposure).map(c => ({
      ...c,
      totalExposure: c.directValue + c.estimatedEtfValue + c.estimatedMfValue,
    })).sort((a, b) => b.totalExposure - a.totalExposure)

    res.json({
      directStocks,
      etfHoldings: etfHoldings.map(e => ({ ...e, ...etfData[e.ticker?.replace(/\.(NS|BO)$/i,'').toUpperCase()] })),
      mfHoldings:  mfHoldings.map(m  => ({ ...m, schemeInfo: mfData[m.schemeCode] || {} })),
      etfData,
      mfData,
      companyExposure,
    })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Diagnostic endpoint — probes every price provider from THIS server's IP and
// reports which ones answer. Useful after deploying: NSE and Tickertape may be
// reachable from an Indian IP but blocked from a US datacenter.
app.get('/api/debug/price-sources', async (_req, res) => {
  try {
    res.json(await prices.debugSources())
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Price cache state / manual invalidation
app.get('/api/debug/price-cache', (_req, res) => res.json(prices.cacheStats()))
app.post('/api/debug/price-cache/clear', (_req, res) => { prices.clearCache(); res.json(prices.cacheStats()) })

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
    // Spread the existing doc first: in file-storage mode savePortfolio writes the
    // whole object, so building a fresh { divisions } would wipe sibling keys
    // (expenses, categories, bankAccounts).
    const existing = await loadPortfolio()
    const next = await savePortfolio({
      ...existing,
      divisions: Array.isArray(body.divisions) ? body.divisions : [],
      updatedAt: new Date().toISOString(),
    })
    res.json(next)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// ===== BANK CASH ROUTES =====
// Plain money in the bank. It is intentionally NOT a division and NOT a holding:
// nothing here feeds the allocation %, target %, goal-seek or rebalance numbers.

app.get('/api/bank-accounts', async (_req, res) => {
  try {
    const accounts = await loadBankAccounts()
    const total = accounts.reduce((s, a) => s + (Number(a.balance) || 0), 0)
    res.json({ accounts, total })
  } catch (e) { res.status(500).json({ error: e.message }) }
})

// Validate up front: an object where a string is expected would be stored verbatim
// and then throw "Objects are not valid as a React child" on the Overview tab,
// taking down the very UI that could delete the bad row.
const BANK_ACCOUNT_TYPES = ['savings', 'current', 'salary', 'emergency', 'wallet', 'cash', 'other']
function validateBankFields(body, { requireName }) {
  const { name, bankName, accountType, balance, note } = body
  if (requireName || name !== undefined) {
    if (typeof name !== 'string' || !name.trim()) return { error: 'name must be a non-empty string' }
  }
  for (const [k, v] of Object.entries({ bankName, note })) {
    if (v !== undefined && typeof v !== 'string') return { error: `${k} must be a string` }
  }
  if (accountType !== undefined && !BANK_ACCOUNT_TYPES.includes(accountType)) {
    return { error: `accountType must be one of: ${BANK_ACCOUNT_TYPES.join(', ')}` }
  }
  if (balance !== undefined) {
    const b = Number(balance)
    if (!Number.isFinite(b) || b < 0) return { error: 'balance must be a non-negative number' }
  }
  return null
}

app.post('/api/bank-accounts', async (req, res) => {
  try {
    const body = req.body || {}
    const bad = validateBankFields(body, { requireName: true })
    if (bad) return res.status(400).json(bad)
    const accounts = await loadBankAccounts()
    const acc = createBankAccount(body)
    accounts.push(acc)
    await saveBankAccounts(accounts)
    res.json(acc)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.patch('/api/bank-accounts/:id', async (req, res) => {
  try {
    const body = req.body || {}
    const bad = validateBankFields(body, { requireName: false })
    if (bad) return res.status(400).json(bad)
    const accounts = await loadBankAccounts()
    const acc = accounts.find(a => a.id === req.params.id)
    if (!acc) return res.status(404).json({ error: 'bank account not found' })
    const { name, bankName, accountType, balance, note } = body
    if (name !== undefined) acc.name = name.trim()
    if (bankName !== undefined) acc.bankName = bankName.trim()
    if (accountType !== undefined) acc.accountType = accountType
    if (balance !== undefined) acc.balance = Number(balance)
    if (note !== undefined) acc.note = note.trim()
    acc.updatedAt = new Date().toISOString()
    await saveBankAccounts(accounts)
    res.json(acc)
  } catch (e) { res.status(500).json({ error: e.message }) }
})

app.delete('/api/bank-accounts/:id', async (req, res) => {
  try {
    const accounts = await loadBankAccounts()
    const idx = accounts.findIndex(a => a.id === req.params.id)
    if (idx === -1) return res.status(404).json({ error: 'bank account not found' })
    const [removed] = accounts.splice(idx, 1)
    await saveBankAccounts(accounts)
    res.json(removed)
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
    const { name, invested, current, subdivisionId, platform, assetType, ticker, schemeCode, units, buyPrice, currentPrice, note, sector, capCategory,
      currency, exchangeRate, foreignBuyPrice, foreignCurrentPrice, foreignInvested, foreignCurrent, targetPercent } = req.body || {}
    if (!name) return res.status(400).json({ error: 'name required' })
    const h = createHolding({ name, invested, current, platform, assetType, ticker, schemeCode, units, buyPrice, currentPrice, note, sector, capCategory, targetPercent,
      currency, exchangeRate, foreignBuyPrice, foreignCurrentPrice, foreignInvested, foreignCurrent })
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
    const { name, invested, current, targetPercent, platform, assetType, ticker, schemeCode, units, buyPrice, currentPrice, priceDate, note, sector, capCategory,
      currency, exchangeRate, foreignBuyPrice, foreignCurrentPrice, foreignInvested, foreignCurrent } = req.body || {}
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
    if (sector !== undefined) found.sector = sector
    if (capCategory !== undefined) found.capCategory = capCategory
    if (currency !== undefined) found.currency = currency
    if (exchangeRate !== undefined) found.exchangeRate = Number(exchangeRate) || 0
    if (foreignBuyPrice !== undefined) found.foreignBuyPrice = Number(foreignBuyPrice) || 0
    if (foreignCurrentPrice !== undefined) found.foreignCurrentPrice = Number(foreignCurrentPrice) || 0
    if (foreignInvested !== undefined) found.foreignInvested = Number(foreignInvested) || 0
    if (foreignCurrent !== undefined) found.foreignCurrent = Number(foreignCurrent) || 0
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

// Save entire month's expenses atomically (replaces all existing for that month)
app.post('/api/expenses/month', async (req, res) => {
  try {
    const { year, month, entries } = req.body
    if (!year || !month || !Array.isArray(entries)) return res.status(400).json({ error: 'Invalid request' })
    const result = await saveMonthExpenses(year, month, entries)
    res.json({ ok: true, count: result.length })
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
