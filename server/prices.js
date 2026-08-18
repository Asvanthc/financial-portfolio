// ─────────────────────────────────────────────────────────────────────────────
// Price fetching.
//
// Why this file exists: the previous implementation raced Yahoo + NSE + Stooq for
// EVERY ticker at concurrency 5. That meant ~3 outbound calls per holding, all at
// once, which got Yahoo to answer `429 Too Many Requests` (it works fine for a
// trickle of requests), while Stooq's CSV endpoint started 404-ing for every
// symbol. Net effect: prices "worked at first, then stopped".
//
// The fix is a different shape, not a different single provider:
//   1. BULK FIRST. One request that prices many symbols at once — CNBC accepts
//      pipe-separated symbols, Tickertape accepts comma-separated sids, the NSE
//      bhavcopy is the whole market in one CSV, AMFI publishes every MF NAV in one
//      text file. A 40-holding portfolio needs ~3 requests, not ~120.
//   2. Then a per-symbol fallback chain for whatever is still missing, run
//      SEQUENTIALLY per symbol with a small global concurrency cap, so no provider
//      ever sees a burst.
//   3. Then the EOD bulk sources as a floor, so "no price at all" is very unlikely.
//   4. Cache everything, so a repeated refresh inside the TTL costs nothing.
//
// Every provider here is free, keyless and unmetered. None requires signup.
// ─────────────────────────────────────────────────────────────────────────────

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const BASE_HEADERS = {
  'User-Agent': UA,
  'Accept-Language': 'en-US,en;q=0.9',
}

const NSE_HEADERS = {
  ...BASE_HEADERS,
  'Accept': 'application/json, text/plain, */*',
  'Referer': 'https://www.nseindia.com/',
}

// Every outbound call gets a hard timeout so one hung socket can't stall a request.
function fetchWithTimeout(url, options = {}, ms = 6000) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), ms)
  return fetch(url, { ...options, headers: { ...BASE_HEADERS, ...(options.headers || {}) }, signal: ctrl.signal })
    .finally(() => clearTimeout(timer))
}

async function getJson(url, options, ms) {
  const r = await fetchWithTimeout(url, options, ms)
  if (!r.ok) return null
  return r.json().catch(() => null)
}

async function getText(url, options, ms) {
  const r = await fetchWithTimeout(url, options, ms)
  if (!r.ok) return null
  return r.text().catch(() => null)
}

const num = v => {
  // Provider payloads mix numbers, "1,322.00" and "-" — normalise all of them.
  if (v == null) return null
  const n = Number(String(v).replace(/,/g, '').trim())
  return Number.isFinite(n) && n > 0 ? n : null
}

const bare = t => String(t || '').trim().toUpperCase().replace(/\.(NS|BO|NSE|BSE)$/i, '')

// Some venues quote in minor units: London prices come back as pence while the
// currency code still says GBP (Yahoo is at least honest about it and says "GBp"),
// Johannesburg quotes cents as ZAc, Tel Aviv as ILA. Left unconverted a London
// holding is priced 100x too high once we multiply by the GBP→INR rate.
const MINOR_UNIT_CODES = { GBP: 'GBP', GBX: 'GBP', ZAC: 'ZAR', ILA: 'ILS' }

function normaliseMinorUnits(price, currencyRaw, ticker = '') {
  const code = String(currencyRaw || '').trim()
  const upper = code.toUpperCase()
  const isPenceCode = code === 'GBp' || upper === 'GBX' || upper === 'ZAC' || upper === 'ILA'
  // A plain "GBP" from a .L listing is pence in practice.
  const isLondon = upper === 'GBP' && /\.(L|LON)$/i.test(String(ticker))
  if (!isPenceCode && !isLondon) return { price, currency: upper || null }
  return { price: price / 100, currency: MINOR_UNIT_CODES[upper] || 'GBP' }
}

// ── Caches ───────────────────────────────────────────────────────────────────
const QUOTE_TTL_MS = 5 * 60 * 1000       // live quotes
const BULK_TTL_MS = 30 * 60 * 1000       // AMFI NAVAll / bhavcopy parse
const SID_TTL_MS = 7 * 24 * 60 * 60 * 1000 // ticker -> tickertape sid barely changes
// A "no such ticker on Tickertape" answer expires quickly: it may just have been a
// timeout, or a newly listed symbol. Caching that for a week would silently drop
// Tickertape from the chain for that holding.
const SID_MISS_TTL_MS = 60 * 60 * 1000
// Remember failures too. Without this, every refresh re-walks the full sequential
// fallback chain for each dead ticker — a tradebook CSV with ten junk symbols cost
// ~25s of spinner on EVERY attempt.
const MISS_TTL_MS = 10 * 60 * 1000

const quoteCache = new Map()   // KEY -> { price, currency, source, asOf, at }
const sidCache = new Map()     // TICKER -> { sid, at, ttl }

function cacheGet(key, ttl = QUOTE_TTL_MS) {
  const hit = quoteCache.get(key)
  if (!hit) return null
  const age = Date.now() - hit.at
  if (hit.miss) return age < MISS_TTL_MS ? hit : null
  return age < ttl ? hit : null
}
function cacheSet(key, val) {
  quoteCache.set(key, { ...val, at: Date.now() })
  return val
}

// Simple promise pool — never more than `limit` outbound calls in flight.
async function pool(items, fn, limit = 3) {
  const out = new Array(items.length)
  let i = 0
  async function worker() {
    while (i < items.length) {
      const idx = i++
      try { out[idx] = await fn(items[idx], idx) } catch (_) { out[idx] = null }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return out
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// ── NSE session (their API needs cookies; blocked from most datacenter IPs) ───
const nseSession = { cookie: '', fetchedAt: 0, initInProgress: false, blocked: false }

async function ensureNseSession() {
  if (nseSession.blocked && Date.now() - nseSession.fetchedAt < 30 * 60 * 1000) return
  if (nseSession.cookie && Date.now() - nseSession.fetchedAt < 20 * 60 * 1000) return
  if (nseSession.initInProgress) {
    for (let i = 0; i < 16; i++) {
      await sleep(250)
      if (!nseSession.initInProgress) return
    }
    return
  }
  nseSession.initInProgress = true
  try {
    const r = await fetchWithTimeout('https://www.nseindia.com/', {
      headers: { ...NSE_HEADERS, Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8' },
    }, 8000)
    const setCookies = r.headers.getSetCookie ? r.headers.getSetCookie() : []
    const cookie = setCookies.map(c => c.split(';')[0].trim()).filter(c => c.includes('=')).join('; ')
    if (cookie) {
      nseSession.cookie = cookie
      nseSession.blocked = false
      console.log('[PRICES] NSE session ready (%d chars)', cookie.length)
    } else {
      nseSession.blocked = true
      console.warn('[PRICES] NSE gave no cookies — treating NSE as unavailable for 30m')
    }
    nseSession.fetchedAt = Date.now()
  } catch (e) {
    nseSession.blocked = true
    nseSession.fetchedAt = Date.now()
    console.warn('[PRICES] NSE session failed (%s) — skipping NSE for 30m', e.message)
  } finally {
    nseSession.initInProgress = false
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK PROVIDER 1 — CNBC. One request prices many symbols, Indian and foreign.
// Indian symbols take a `-IN` suffix. Symbols are pipe-separated.
// ─────────────────────────────────────────────────────────────────────────────
const CNBC_URL = 'https://quote.cnbc.com/quote-html-webservice/restQuote/symbolType/symbol'

function cnbcSymbol(item) {
  return item.indian ? `${bare(item.ticker)}-IN` : bare(item.ticker)
}

async function cnbcBatch(items) {
  const out = {}
  if (!items.length) return out
  // Keep URLs sane: 20 symbols per request.
  for (const chunk of chunks(items, 20)) {
    const symbols = chunk.map(cnbcSymbol)
    const url = `${CNBC_URL}?symbols=${encodeURIComponent(symbols.join('|'))}&requestMethod=itv&noform=1&partnerId=2&fund=1&exthrs=1&output=json`
    const data = await getJson(url, {}, 9000).catch(() => null)
    let quotes = data?.FormattedQuoteResult?.FormattedQuote
    if (!quotes) continue
    if (!Array.isArray(quotes)) quotes = [quotes]
    quotes.forEach(q => {
      if (!q || q.code !== 0) return          // code 1 = symbol not resolved
      const price = num(q.last) ?? num(q.previous_day_closing)
      if (price == null) return
      const item = chunk.find(x => cnbcSymbol(x) === String(q.symbol || '').toUpperCase())
      if (!item) return
      const norm = normaliseMinorUnits(price, q.currencyCode, item.ticker)
      const currency = norm.currency || (item.indian ? 'INR' : 'USD')
      // Guard against a symbol collision handing us the wrong market's price.
      if (item.indian && currency !== 'INR') return
      if (!item.indian && currency === 'INR') return
      out[item.ticker] = { price: norm.price, currency, source: 'CNBC', asOf: q.last_time || null }
    })
    await sleep(120)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK PROVIDER 2 — Tickertape. Indian stocks + ETFs. Two steps: resolve the
// internal `sid` for a ticker via search (GOLDBEES -> GBES, RELIANCE -> RELI),
// then batch-quote the sids. Sids are cached for a week.
// ─────────────────────────────────────────────────────────────────────────────
const sidFresh = hit => hit && Date.now() - hit.at < (hit.sid ? SID_TTL_MS : SID_MISS_TTL_MS)

async function tickertapeSid(ticker) {
  const key = bare(ticker)
  const hit = sidCache.get(key)
  if (sidFresh(hit)) return hit.sid

  const data = await getJson(
    `https://api.tickertape.in/search?text=${encodeURIComponent(key)}&types=stock,etf`, {}, 7000
  ).catch(() => null)
  const list = data?.data?.stocks || []
  // Only trust an EXACT ticker match — a fuzzy hit would price the wrong company.
  const exact = list.find(s => String(s.ticker || '').toUpperCase() === key)
  const sid = exact?.sid || null
  sidCache.set(key, { sid, at: Date.now() })
  // The search response already carries a live quote — use it, it's free.
  if (exact?.quote?.price != null) {
    const price = num(exact.quote.price)
    if (price) cacheSet(`TT:${key}`, { price, currency: 'INR', source: 'Tickertape', asOf: exact.quote.date || null })
  }
  return sid
}

async function tickertapeBatch(items) {
  const out = {}
  if (!items.length) return out

  // Resolve missing sids a few at a time.
  const needSid = items.filter(x => !sidFresh(sidCache.get(bare(x.ticker))))
  await pool(needSid, it => tickertapeSid(it.ticker), 3)

  const withSid = []
  items.forEach(it => {
    const key = bare(it.ticker)
    const sid = sidCache.get(key)?.sid
    if (!sid) return
    // The search step may already have cached a fresh price.
    const pre = cacheGet(`TT:${key}`)
    if (pre) { out[it.ticker] = { price: pre.price, currency: 'INR', source: 'Tickertape', asOf: pre.asOf }; return }
    withSid.push({ item: it, sid })
  })

  for (const chunk of chunks(withSid, 25)) {
    const sids = chunk.map(c => c.sid)
    const data = await getJson(
      `https://api.tickertape.in/stocks/quotes?sids=${encodeURIComponent(sids.join(','))}`, {}, 8000
    ).catch(() => null)
    const rows = Array.isArray(data?.data) ? data.data : []
    rows.forEach(row => {
      const price = num(row?.price) ?? num(row?.close)
      if (price == null) return
      const match = chunk.find(c => c.sid === row.sid)
      if (!match) return
      out[match.item.ticker] = { price, currency: 'INR', source: 'Tickertape', asOf: row.date || null }
    })
    await sleep(120)
  }
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// BULK PROVIDER 3 — NSE bhavcopy. The entire NSE end-of-day price list in ONE
// public CSV, no cookie needed. Not live, but it is the safety net that makes
// "price fetch failed" almost impossible for an Indian listing.
// ─────────────────────────────────────────────────────────────────────────────
let bhavcopy = { map: null, date: null, at: 0 }

function ddmmyyyy(d) {
  const p = n => String(n).padStart(2, '0')
  return `${p(d.getDate())}${p(d.getMonth() + 1)}${d.getFullYear()}`
}

function parseBhavcopy(csv) {
  const map = new Map()
  const lines = csv.split('\n')
  const header = (lines[0] || '').split(',').map(s => s.trim().toUpperCase())
  const iSym = header.indexOf('SYMBOL')
  const iSeries = header.indexOf('SERIES')
  const iClose = header.indexOf('CLOSE_PRICE')
  const iLast = header.indexOf('LAST_PRICE')
  if (iSym === -1 || (iClose === -1 && iLast === -1)) return map
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',')
    if (cols.length <= iSym) continue
    const sym = (cols[iSym] || '').trim().toUpperCase()
    if (!sym) continue
    const series = iSeries >= 0 ? (cols[iSeries] || '').trim().toUpperCase() : ''
    // EQ/BE/BZ = equity series; ETFs list under EQ. Skip debt (GS/TB), rights (RE) etc.
    if (series && !['EQ', 'BE', 'BZ', 'SM', 'ST'].includes(series)) continue
    const price = num(iClose >= 0 ? cols[iClose] : null) ?? num(iLast >= 0 ? cols[iLast] : null)
    if (price == null) continue
    if (!map.has(sym)) map.set(sym, price)
  }
  return map
}

// Walks back day by day (weekends / holidays have no file) up to 7 days.
async function loadBhavcopy() {
  if (bhavcopy.map && Date.now() - bhavcopy.at < BULK_TTL_MS) return bhavcopy
  const today = new Date()
  for (let back = 0; back < 8; back++) {
    const d = new Date(today.getTime() - back * 86400000)
    const day = d.getDay()
    if (day === 0 || day === 6) continue
    const stamp = ddmmyyyy(d)
    const csv = await getText(
      `https://archives.nseindia.com/products/content/sec_bhavdata_full_${stamp}.csv`,
      { headers: { Accept: 'text/csv,*/*' } }, 15000
    ).catch(() => null)
    if (!csv || csv.length < 5000 || /<html/i.test(csv)) continue
    const map = parseBhavcopy(csv)
    if (map.size > 100) {
      bhavcopy = { map, date: d.toISOString().split('T')[0], at: Date.now() }
      console.log('[PRICES] bhavcopy loaded: %d symbols for %s', map.size, bhavcopy.date)
      return bhavcopy
    }
  }
  bhavcopy = { map: bhavcopy.map || new Map(), date: bhavcopy.date, at: Date.now() }
  if (!bhavcopy.map.size) console.warn('[PRICES] bhavcopy unavailable')
  return bhavcopy
}

async function bhavcopyBatch(items) {
  const out = {}
  if (!items.length) return out
  const bc = await loadBhavcopy()
  if (!bc.map || !bc.map.size) return out
  items.forEach(it => {
    const price = bc.map.get(bare(it.ticker))
    if (price) out[it.ticker] = { price, currency: 'INR', source: 'NSE-EOD', asOf: bc.date }
  })
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// PER-SYMBOL PROVIDERS — used only for what the bulk passes missed.
// ─────────────────────────────────────────────────────────────────────────────

// Yahoo: works fine at a trickle. Alternate hosts so retries don't hit the same
// rate-limit bucket, and back off on 429 instead of hammering.
const yahooHosts = ['https://query2.finance.yahoo.com', 'https://query1.finance.yahoo.com']
let yahooCooldownUntil = 0

async function yahooPrice(symbol) {
  if (Date.now() < yahooCooldownUntil) return null
  for (let attempt = 0; attempt < yahooHosts.length; attempt++) {
    const host = yahooHosts[attempt]
    try {
      const r = await fetchWithTimeout(
        `${host}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d`,
        { headers: { Accept: 'application/json' } }, 7000
      )
      if (r.status === 429) {
        // Every symbol shares one bucket — stop asking for a while.
        yahooCooldownUntil = Date.now() + 5 * 60 * 1000
        console.warn('[PRICES] Yahoo 429 — cooling down 5m')
        return null
      }
      if (!r.ok) continue
      const data = await r.json().catch(() => null)
      const meta = data?.chart?.result?.[0]?.meta
      const price = num(meta?.regularMarketPrice) ?? num(meta?.previousClose)
      if (price == null) continue
      // Yahoo reports London prices as "GBp" (pence) — normalise before returning.
      return normaliseMinorUnits(price, meta?.currency, symbol)
    } catch (_) { /* try next host */ }
  }
  return null
}

async function nsePrice(symbol) {
  await ensureNseSession()
  if (!nseSession.cookie || nseSession.blocked) return null
  try {
    const r = await fetchWithTimeout(
      `https://www.nseindia.com/api/quote-equity?symbol=${encodeURIComponent(bare(symbol))}`,
      { headers: { ...NSE_HEADERS, Cookie: nseSession.cookie } }, 5000
    )
    if (!r.ok) {
      if (r.status === 401 || r.status === 403) { nseSession.cookie = ''; nseSession.fetchedAt = 0 }
      return null
    }
    const data = await r.json().catch(() => null)
    return num(data?.priceInfo?.lastPrice)
  } catch (_) { return null }
}

async function cnbcOne(item) {
  const got = await cnbcBatch([item])
  return got[item.ticker] || null
}

// Google Finance HTML. Last resort, but it answers for essentially anything listed
// and has no rate limiting worth worrying about at our volume.
//
// Two non-obvious guards, both necessary:
//  * A Google Finance quote page embeds ~66 `jsname="Pdsbrc"` price spans — market
//    index cards, movers, etc. Only the instrument's OWN price carries a currency
//    symbol, so the symbol in the regex is REQUIRED, not optional. Without it every
//    lookup returns the same index number (~29,264.55), i.e. a plausible-looking
//    wrong price for every holding.
//  * An unknown ticker still renders a 200 dashboard page. The <title> only contains
//    "(TICKER)" when the instrument actually resolved, so that's the existence check.
const GOOGLE_EXCHANGES = { indian: ['NSE', 'BOM'], foreign: ['NASDAQ', 'NYSE', 'NYSEARCA', 'BATS'] }
const CURRENCY_BY_SYMBOL = { '₹': 'INR', '$': 'USD', '€': 'EUR', '£': 'GBP' }

async function googlePrice(item) {
  const sym = bare(item.ticker)
  const exchanges = item.indian ? GOOGLE_EXCHANGES.indian : GOOGLE_EXCHANGES.foreign
  for (const ex of exchanges) {
    const html = await getText(`https://www.google.com/finance/quote/${encodeURIComponent(sym)}:${ex}`, {}, 9000)
      .catch(() => null)
    if (!html) continue

    // Decode the entities Google escapes into the title, or tickers containing '&'
    // (M&M, J&KBANK, IL&FSENGG, …) never match and lose their last fallback.
    const title = ((html.match(/<title>([^<]*)<\/title>/) || [])[1] || '')
      .replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    if (!title.toUpperCase().includes(`(${sym})`)) continue

    const m = html.match(/jsname="Pdsbrc"[^>]*>\s*<span[^>]*>\s*([₹$€£])\s*([\d,]+\.?\d*)\s*</)
    if (!m) continue
    const price = num(m[2])
    if (price == null) continue

    const currency = CURRENCY_BY_SYMBOL[m[1]] || null
    if (!currency) continue
    if (item.indian !== (currency === 'INR')) continue

    return { price, currency, source: `Google/${ex}` }
  }
  return null
}

// Sequential per-symbol chain. Order = most trustworthy/cheapest first; each step
// is only reached if the previous one came back empty.
async function singleSymbolChain(item) {
  if (item.indian) {
    const sym = bare(item.ticker)

    const nse = await nsePrice(sym)
    if (nse) return { price: nse, currency: 'INR', source: 'NSE' }

    const yf = await yahooPrice(`${sym}.NS`) || await yahooPrice(`${sym}.BO`)
    if (yf && (!yf.currency || yf.currency === 'INR')) return { price: yf.price, currency: 'INR', source: 'Yahoo' }

    const cn = await cnbcOne(item)
    if (cn) return cn

    const gg = await googlePrice(item)
    if (gg) return gg
    return null
  }

  const yf = await yahooPrice(bare(item.ticker))
  if (yf) return { price: yf.price, currency: yf.currency || 'USD', source: 'Yahoo' }

  const cn = await cnbcOne(item)
  if (cn) return cn

  const gg = await googlePrice(item)
  if (gg) return gg
  return null
}

function chunks(arr, size) {
  const out = []
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size))
  return out
}

// ─────────────────────────────────────────────────────────────────────────────
// Public: quotes for stocks / ETFs / foreign holdings.
// Accepts string[] or { ticker, assetType }[]. `assetType: 'foreign'` forces the
// foreign route regardless of ticker shape (e.g. "Qqq" with no suffix).
// ─────────────────────────────────────────────────────────────────────────────
async function fetchQuotes(symbolsOrItems, { force = false } = {}) {
  // The returned `quotes` map is keyed by ticker, so a ticker can only carry one
  // price. Dedupe on the ticker itself (NOT ticker+assetType): two items sharing a
  // ticker but routed differently — INFY as an NSE stock and INFY as the NYSE ADR —
  // would otherwise both write to `quotes['INFY']`, and the loser would silently
  // vanish from `missing` while poisoning the other's cache entry. An explicit
  // assetType wins over a bare string so the caller's intent decides the route.
  const byTicker = new Map()
  // Every spelling the caller used, per canonical ticker: 'infy' and 'INFY' collapse
  // to one lookup, but BOTH have to come back in `quotes` (or in `missing`), or a
  // holding whose ticker differs only in case is silently never priced.
  const spellings = new Map()
  ;(symbolsOrItems || []).forEach(s => {
    const raw = typeof s === 'string'
      ? { ticker: String(s).trim(), assetType: null }
      : { ticker: String(s?.ticker || '').trim(), assetType: s?.assetType || null }
    if (!raw.ticker) return
    const key = raw.ticker.toUpperCase()
    if (!spellings.has(key)) spellings.set(key, new Set())
    spellings.get(key).add(raw.ticker)
    const existing = byTicker.get(key)
    if (existing && (existing.assetType || !raw.assetType)) return
    byTicker.set(key, raw)
  })

  const items = [...byTicker.values()]
    .map(x => ({
      ...x,
      indian: x.assetType === 'foreign'
        ? false
        : (!x.ticker.includes('.') || /\.(NS|BO)$/i.test(x.ticker)),
    }))
    .slice(0, 120)

  if (!items.length) return { quotes: {}, missing: [], sources: {} }

  const quotes = {}
  const cacheKey = it => `${it.indian ? 'IN' : 'FX'}:${bare(it.ticker)}`

  // 0. Cache — including remembered misses, which skip the whole chain.
  let pending = []
  const knownMisses = []
  items.forEach(it => {
    if (!force) {
      const hit = cacheGet(cacheKey(it))
      if (hit?.miss) { knownMisses.push(it); return }
      if (hit) {
        quotes[it.ticker] = { price: hit.price, currency: hit.currency, source: hit.source, asOf: hit.asOf, cached: true }
        return
      }
    }
    pending.push(it)
  })

  // `from` is the item list the quotes were produced for — it matters for step 5,
  // where the route was flipped, so the cache entry must be written under the key
  // that actually produced the price rather than the original guess.
  const absorb = (got, from = pending) => {
    Object.entries(got).forEach(([ticker, q]) => {
      if (quotes[ticker]) return
      const it = from.find(x => x.ticker === ticker)
      quotes[ticker] = q
      if (it) cacheSet(cacheKey(it), q)
    })
    pending = pending.filter(it => !quotes[it.ticker])
  }

  // 1. CNBC — one request covers Indian + foreign together.
  if (pending.length) {
    absorb(await cnbcBatch(pending).catch(() => ({})))
  }

  // 2. Tickertape — Indian stocks & ETFs, batch by sid.
  if (pending.some(it => it.indian)) {
    absorb(await tickertapeBatch(pending.filter(it => it.indian)).catch(() => ({})))
  }

  // 3. Per-symbol chain for the stragglers, gently — but under a wall-clock budget.
  // Each unresolvable symbol costs 1-3s of sequential provider calls, so a CSV full
  // of junk tickers could otherwise hold a request open for half a minute. Whatever
  // the budget cuts off simply comes back in `missing`.
  const deadline = Date.now() + 20000
  const withinBudget = () => Date.now() < deadline
  if (pending.length) {
    const results = await pool(pending, it => (withinBudget() ? singleSymbolChain(it).catch(() => null) : null), 4)
    const got = {}
    pending.forEach((it, i) => { if (results[i]) got[it.ticker] = results[i] })
    absorb(got)
  }

  // 4. Last resort for Indian listings: end-of-day bhavcopy.
  if (pending.some(it => it.indian)) {
    absorb(await bhavcopyBatch(pending.filter(it => it.indian)).catch(() => ({})))
  }

  // 5. The Indian/foreign split is only a guess when the caller gave us a bare
  // ticker with no assetType ("QQQ" has no .NS/.BO suffix, so it looks Indian).
  // Anything still unpriced gets one attempt down the other route.
  const ambiguous = pending.filter(it => !it.assetType && it.indian)
  if (ambiguous.length && withinBudget()) {
    const flipped = ambiguous.map(it => ({ ...it, indian: false }))
    const results = await pool(flipped, it => (withinBudget() ? singleSymbolChain(it).catch(() => null) : null), 4)
    const got = {}
    // routeGuessed tells callers the Indian/foreign call was ours, not theirs — the
    // price may well be in a foreign currency, so don't store it as INR blindly.
    flipped.forEach((it, i) => { if (results[i]) got[it.ticker] = { ...results[i], routeGuessed: true } })
    absorb(got, flipped)
  }

  // Remember the failures so the next call doesn't re-walk the chain for them.
  pending.forEach(it => cacheSet(cacheKey(it), { miss: true }))

  // Count before expanding, so the log compares like with like.
  const pricedCount = Object.keys(quotes).length

  // Expand back onto every spelling the caller used.
  Object.entries({ ...quotes }).forEach(([t, q]) => {
    (spellings.get(t.toUpperCase()) || new Set([t])).forEach(s => { quotes[s] = q })
  })

  const missing = []
  ;[...pending, ...knownMisses].forEach(it => {
    (spellings.get(it.ticker.toUpperCase()) || new Set([it.ticker])).forEach(s => missing.push(s))
  })

  const sources = {}
  Object.entries(quotes).forEach(([t, q]) => { sources[t] = q.source })
  console.log('[PRICES] %d/%d priced%s', pricedCount, items.length,
    missing.length ? ` — missing: ${missing.join(', ')}` : '')
  return { quotes, missing, sources }
}

// ─────────────────────────────────────────────────────────────────────────────
// Mutual funds. mfapi.in per scheme, with AMFI's single NAVAll.txt (every scheme
// in the country, one request) as the fallback.
// ─────────────────────────────────────────────────────────────────────────────
// One 1.6MB download serves both the NAV fallback and the scheme-name search, cached
// for BULK_TTL_MS. Fetching it per search keystroke-batch (the MF autocomplete is
// debounced but still fires per query) meant megabytes of egress and ~750ms of added
// latency on every lookup.
let amfiAll = { map: null, schemes: null, at: 0 }

async function loadAmfiAll() {
  if (amfiAll.map && Date.now() - amfiAll.at < BULK_TTL_MS) return amfiAll
  const txt = await getText('https://www.amfiindia.com/spages/NAVAll.txt', {}, 20000).catch(() => null)
  if (!txt) {
    amfiAll = { map: amfiAll.map || new Map(), schemes: amfiAll.schemes || [], at: Date.now() }
    return amfiAll
  }
  const map = new Map()
  const schemes = []
  // Scheme Code;ISIN Div Payout;ISIN Reinvest;Scheme Name;Net Asset Value;Date
  txt.split('\n').forEach(line => {
    const parts = line.split(';')
    if (parts.length < 6) return
    const code = parts[0].trim()
    if (!/^\d+$/.test(code)) return
    const name = parts[3].trim()
    if (name) schemes.push({ schemeCode: Number(code), schemeName: name, lower: name.toLowerCase() })
    const nav = num(parts[4])
    if (nav == null) return
    map.set(code, { price: nav, date: parts[5].trim() })
  })
  amfiAll = { map, schemes, at: Date.now() }
  console.log('[PRICES] AMFI NAVAll loaded: %d schemes with NAV, %d names', map.size, schemes.length)
  return amfiAll
}

async function fetchMfNav(schemeCodes) {
  const codes = [...new Set((schemeCodes || []).map(c => String(c || '').trim()).filter(Boolean))]
  const results = {}
  if (!codes.length) return results

  const pending = []
  codes.forEach(code => {
    const hit = cacheGet(`MF:${code}`, BULK_TTL_MS)
    if (hit) results[code] = { price: hit.price, date: hit.asOf, currency: 'INR', source: hit.source, cached: true }
    else pending.push(code)
  })

  // mfapi.in is fast and per-scheme; 4 at a time is polite and plenty.
  const got = await pool(pending, async code => {
    const data = await getJson(`https://api.mfapi.in/mf/${encodeURIComponent(code)}/latest`, {}, 8000).catch(() => null)
    const nav = num(data?.data?.[0]?.nav)
    if (nav == null) return null
    return { price: nav, date: data?.data?.[0]?.date || null, source: 'mfapi' }
  }, 4)

  const stillMissing = []
  pending.forEach((code, i) => {
    if (got[i]) {
      results[code] = { ...got[i], currency: 'INR' }
      cacheSet(`MF:${code}`, { price: got[i].price, currency: 'INR', source: 'mfapi', asOf: got[i].date })
    } else stillMissing.push(code)
  })

  if (stillMissing.length) {
    const { map } = await loadAmfiAll()
    stillMissing.forEach(code => {
      const hit = map?.get(String(code))
      if (!hit) return
      results[code] = { price: hit.price, date: hit.date, currency: 'INR', source: 'AMFI' }
      cacheSet(`MF:${code}`, { price: hit.price, currency: 'INR', source: 'AMFI', asOf: hit.date })
    })
  }

  return results
}

// ── FX ───────────────────────────────────────────────────────────────────────
// Frankfurter (ECB data) first, exchangerate.host as backup. Cached 6h — daily
// reference rates don't move intraday.
const FX_TTL_MS = 6 * 60 * 60 * 1000
const fxCache = new Map()

async function fetchRateToInr(currency) {
  const cur = String(currency || '').toUpperCase()
  if (!cur || cur === 'INR') return { rate: 1, date: null, source: 'identity' }
  const hit = fxCache.get(cur)
  if (hit && Date.now() - hit.at < FX_TTL_MS) return hit

  const frank = await getJson(`https://api.frankfurter.app/latest?from=${cur}&to=INR`, {}, 8000).catch(() => null)
  let rate = num(frank?.rates?.INR)
  let source = 'frankfurter'
  let date = frank?.date || null

  if (rate == null) {
    const alt = await getJson(`https://open.er-api.com/v6/latest/${cur}`, {}, 8000).catch(() => null)
    rate = num(alt?.rates?.INR)
    source = 'er-api'
    date = alt?.time_last_update_utc || null
  }
  if (rate == null) return hit || null

  const val = { rate, date, source, at: Date.now() }
  fxCache.set(cur, val)
  return val
}

// ── Search ───────────────────────────────────────────────────────────────────
// NSE autocomplete is best for Indian names but is blocked from datacenter IPs;
// Tickertape and Yahoo both answer from anywhere. All three run in parallel and
// the first non-empty wins, in preference order. This must never throw.
async function searchStocks(q) {
  const query = String(q || '').trim()
  if (!query) return []

  const nse = (async () => {
    try {
      await ensureNseSession()
      if (!nseSession.cookie || nseSession.blocked) return []
      const data = await getJson(
        `https://www.nseindia.com/api/search/autocomplete?q=${encodeURIComponent(query)}`,
        { headers: { ...NSE_HEADERS, Cookie: nseSession.cookie } }, 5000
      )
      return (data?.symbols || []).filter(x => x.symbol).map(x => ({
        symbol: x.symbol,
        name: x.symbol_info || x.company_name || x.name || x.symbol,
        exchange: 'NSE',
        type: x.result_sub_type || x.type || 'EQUITY',
      })).slice(0, 12)
    } catch (_) { return [] }
  })()

  const tt = (async () => {
    try {
      const data = await getJson(`https://api.tickertape.in/search?text=${encodeURIComponent(query)}&types=stock,etf`, {}, 6000)
      return (data?.data?.stocks || []).filter(s => s.ticker).map(s => ({
        symbol: String(s.ticker).toUpperCase(),
        name: s.name || s.ticker,
        exchange: 'NSE',
        type: (s.type || 'stock').toUpperCase(),
      })).slice(0, 12)
    } catch (_) { return [] }
  })()

  const yahoo = (async () => {
    try {
      const data = await getJson(
        `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(query)}&quotesCount=15&newsCount=0&listsCount=0`,
        { headers: { Accept: 'application/json' } }, 8000
      )
      return (data?.quotes || [])
        .filter(x => x.symbol && ['EQUITY', 'ETF', 'MUTUALFUND', 'INDEX'].includes(x.quoteType))
        .map(x => {
          const indian = /\.(NS|BO)$/i.test(x.symbol)
          return {
            symbol: indian ? x.symbol.replace(/\.(NS|BO)$/i, '') : x.symbol,
            name: x.longname || x.shortname || x.symbol,
            exchange: x.exchange || (indian ? 'NSE' : ''),
            type: x.quoteType || 'EQUITY',
          }
        }).slice(0, 12)
    } catch (_) { return [] }
  })()

  const [nseItems, ttItems, yahooItems] = await Promise.all([nse, tt, yahoo])
  return nseItems.length ? nseItems : ttItems.length ? ttItems : yahooItems
}

async function searchMf(q) {
  const query = String(q || '').trim()
  if (!query) return []
  try {
    const data = await getJson(`https://api.mfapi.in/mf/search?q=${encodeURIComponent(query)}`, {}, 7000)
    if (Array.isArray(data) && data.length) return data.slice(0, 20)
  } catch (_) { /* fall through */ }
  // Fallback: scan AMFI's cached scheme list. mfapi returns 200 with an empty array
  // for anything it can't match, so this path runs often — it must not re-download.
  try {
    const { schemes } = await loadAmfiAll()
    if (!schemes?.length) return []
    const needle = query.toLowerCase()
    const out = []
    for (const s of schemes) {
      if (!s.lower.includes(needle)) continue
      out.push({ schemeCode: s.schemeCode, schemeName: s.schemeName })
      if (out.length >= 20) break
    }
    return out
  } catch (_) { return [] }
}

// ── Diagnostics ──────────────────────────────────────────────────────────────
// Hit /api/debug/price-sources on the deployed box to see which providers its IP
// can actually reach — NSE and Tickertape may be geo/datacenter-blocked there.
async function debugSources() {
  const out = {}
  const probe = async (name, fn) => {
    const t0 = Date.now()
    try {
      const v = await fn()
      out[name] = { ok: v != null && v !== false, value: v, ms: Date.now() - t0 }
    } catch (e) {
      out[name] = { ok: false, error: e.message, ms: Date.now() - t0 }
    }
  }
  await Promise.all([
    probe('cnbc_reliance_in', async () => (await cnbcBatch([{ ticker: 'RELIANCE', indian: true }]))['RELIANCE'] || null),
    probe('cnbc_qqq', async () => (await cnbcBatch([{ ticker: 'QQQ', indian: false }]))['QQQ'] || null),
    probe('tickertape_reliance', async () => (await tickertapeBatch([{ ticker: 'RELIANCE', indian: true }]))['RELIANCE'] || null),
    probe('tickertape_goldbees', async () => (await tickertapeBatch([{ ticker: 'GOLDBEES', indian: true }]))['GOLDBEES'] || null),
    probe('yahoo_reliance_ns', () => yahooPrice('RELIANCE.NS')),
    probe('yahoo_qqq', () => yahooPrice('QQQ')),
    probe('nse_reliance', () => nsePrice('RELIANCE')),
    probe('google_infy', () => googlePrice({ ticker: 'INFY', indian: true })),
    probe('bhavcopy', async () => {
      const bc = await loadBhavcopy()
      return bc.map?.size ? { symbols: bc.map.size, date: bc.date, reliance: bc.map.get('RELIANCE') } : null
    }),
    probe('mfapi_nav', async () => (await fetchMfNav(['119551']))['119551'] || null),
    probe('amfi_all', async () => {
      const { map, schemes } = await loadAmfiAll()
      return map?.size ? { withNav: map.size, names: schemes?.length || 0 } : null
    }),
    probe('fx_usd_inr', () => fetchRateToInr('USD')),
  ])
  out._meta = {
    nseBlocked: nseSession.blocked,
    yahooCoolingDown: Date.now() < yahooCooldownUntil,
    cachedQuotes: quoteCache.size,
    cachedSids: sidCache.size,
  }
  return out
}

function cacheStats() {
  return {
    quotes: quoteCache.size,
    sids: sidCache.size,
    bhavcopyDate: bhavcopy.date,
    bhavcopySymbols: bhavcopy.map?.size || 0,
    amfiSchemes: amfiAll.map?.size || 0,
    nseBlocked: nseSession.blocked,
  }
}

function clearCache() {
  quoteCache.clear()
  sidCache.clear()
  fxCache.clear()
  bhavcopy = { map: null, date: null, at: 0 }
  amfiAll = { map: null, schemes: null, at: 0 }
  yahooCooldownUntil = 0
}

// Warm the NSE session in the background; harmless if the IP is blocked.
ensureNseSession().catch(() => {})

module.exports = {
  fetchQuotes,
  fetchMfNav,
  fetchRateToInr,
  searchStocks,
  searchMf,
  debugSources,
  cacheStats,
  clearCache,
  ensureNseSession,
  NSE_HEADERS,
  nseSession,
  fetchWithTimeout,
}
