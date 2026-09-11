const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')
const gh = require('./githubStore')

// Backend priority: GitHub repo > MongoDB > local JSON file.
// The file path is only durable in local dev — on a Render free instance the
// filesystem is wiped on every deploy, restart and spin-down, so it must never be
// the last word in production. See githubStore.js for why GitHub is the default.
if (gh.isEnabled()) gh.verify().catch(() => {})

// MongoDB support (optional)
let db = null
let portfolioCollection = null
let expensesCollection = null
let categoriesCollection = null
let bankCollection = null
let brokersCollection = null
// 'connecting' | 'connected' | 'failed' — lets a handler tell "Mongo isn't ready yet"
// (wait) apart from "Mongo will never be ready" (use the file), instead of guessing
// from a null collection.
let mongoState = process.env.MONGODB_URI ? 'connecting' : 'absent'
let mongoError = null

if (process.env.MONGODB_URI) {
  const { MongoClient } = require('mongodb')
  const client = new MongoClient(process.env.MONGODB_URI)
  client.connect()
    .then(() => {
      db = client.db('financial-portfolio')
      portfolioCollection = db.collection('portfolio')
      expensesCollection = db.collection('expenses')
      categoriesCollection = db.collection('categories')
      bankCollection = db.collection('bank')
      brokersCollection = db.collection('brokers')
      mongoState = 'connected'
      console.log('[STORAGE] Connected to MongoDB with collections: portfolio, expenses, categories, bank, brokers')
    })
    .catch(err => {
      mongoState = 'failed'
      mongoError = err.message
      console.error('[STORAGE] MongoDB connection FAILED — falling back to the container filesystem,')
      console.error('[STORAGE] which a Render free instance wipes on restart. Reason:', err.message)
    })
}

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'portfolio.json')

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) {
    const seed = { divisions: [], updatedAt: new Date().toISOString() }
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2))
  }
}

async function loadPortfolio() {
  if (gh.isEnabled()) {
    const data = await gh.readJson(gh.FILES.portfolio, { divisions: [], updatedAt: null })
    if (!Array.isArray(data.divisions)) data.divisions = []
    return data
  }

  // Try MongoDB first
  if (portfolioCollection) {
    try {
      const doc = await portfolioCollection.findOne({ _id: 'main' })
      if (doc) {
        const data = { divisions: doc.divisions || [], updatedAt: doc.updatedAt }
        return data
      }
    } catch (e) {
      console.error('[STORAGE] MongoDB read failed:', e.message)
    }
  }
  
  // Fallback to file system
  ensureDataFile()
  const raw = fs.readFileSync(DATA_FILE, 'utf8')
  try {
    const data = JSON.parse(raw)
    if (!Array.isArray(data.divisions)) data.divisions = []
    return data
  } catch (e) {
    throw new Error('Failed to parse portfolio data: ' + e.message)
  }
}

async function loadExpenses() {
  if (gh.isEnabled()) return gh.readJson(gh.FILES.expenses, [])

  if (expensesCollection) {
    try {
      const count = await expensesCollection.countDocuments({})
      if (count > 0) {
        const expenses = await expensesCollection.find({}).toArray()
        console.log('[STORAGE] Loaded', expenses.length, 'expenses from MongoDB')
        return expenses
      }
      // If collection empty, check for legacy expenses in portfolio doc and migrate
      if (portfolioCollection) {
        const legacy = await portfolioCollection.findOne({ _id: 'main' })
        const legacyExpenses = Array.isArray(legacy?.expenses) ? legacy.expenses : []
        if (legacyExpenses.length > 0) {
          console.log('[STORAGE] Migrating', legacyExpenses.length, 'legacy expenses from portfolio document')
          const docs = legacyExpenses.map(exp => ({
            type: exp.type,
            category: exp.category,
            amount: Number(exp.amount) || 0,
            month: Number(exp.month) || 1,
            year: Number(exp.year) || new Date().getFullYear(),
            description: exp.description || '',
            createdAt: exp.createdAt || new Date().toISOString()
          }))
          if (docs.length > 0) {
            await expensesCollection.insertMany(docs)
          }
          await portfolioCollection.updateOne({ _id: 'main' }, { $unset: { expenses: '' } })
          console.log('[STORAGE] Legacy expenses migrated and removed from portfolio document')

          // Derive and persist categories
          if (categoriesCollection) {
            const expenseSet = new Set()
            const incomeSet = new Set()
            for (const exp of legacyExpenses) {
              if (exp.type === 'income') incomeSet.add(exp.category)
              else expenseSet.add(exp.category)
            }
            await categoriesCollection.updateOne(
              { _id: 'categories' },
              { $set: { 
                  expense: Array.from(expenseSet),
                  income: Array.from(incomeSet),
                  updatedAt: new Date().toISOString() 
                } },
              { upsert: true }
            )
            console.log('[STORAGE] Categories updated from legacy data')
          }
          const migrated = await expensesCollection.find({}).toArray()
          return migrated
        }
      }
      return []
    } catch (e) {
      console.error('[STORAGE] MongoDB expenses read/migrate failed:', e.message)
    }
  }
  
  // Fallback to file system
  ensureDataFile()
  const raw = fs.readFileSync(DATA_FILE, 'utf8')
  try {
    const data = JSON.parse(raw)
    return data.expenses || []
  } catch (e) {
    return []
  }
}

async function loadCategories() {
  if (gh.isEnabled()) {
    const c = await gh.readJson(gh.FILES.categories, { expense: [], income: [] })
    return { expense: c.expense || [], income: c.income || [] }
  }

  if (categoriesCollection) {
    try {
      const doc = await categoriesCollection.findOne({ _id: 'categories' })
      if (doc) {
        return { expense: doc.expense || [], income: doc.income || [] }
      }
      return { expense: [], income: [] }
    } catch (e) {
      console.error('[STORAGE] MongoDB categories read failed:', e.message)
    }
  }
  
  // Fallback to file system
  ensureDataFile()
  const raw = fs.readFileSync(DATA_FILE, 'utf8')
  try {
    const data = JSON.parse(raw)
    return {
      expense: data.categories?.expense || [],
      income: data.categories?.income || []
    }
  } catch (e) {
    return { expense: [], income: [] }
  }
}

// ── Bank cash ────────────────────────────────────────────────────────────────
// Money parked in bank accounts. Deliberately kept OUTSIDE portfolio.divisions so
// it can never be picked up by the allocation / target-% / rebalance math, which
// only ever walks divisions. Stored in its own Mongo collection (same pattern as
// categories) so savePortfolio's `$set: { divisions }` can't clobber it, and under
// a top-level `bankAccounts` key in the JSON file for the no-Mongo path.

// Resolves the bank collection, or null when the file path should be used.
// The important case: when Mongo IS the live backend, a failed READ must not fall
// through to the JSON file — that returns an empty list, and the next add would
// write that empty list straight over the real Mongo document. So read errors
// propagate (a 500 the user sees) rather than silently emptying the section.
async function bankStore(waitMs = 5000) {
  if (mongoState === 'absent' || mongoState === 'failed') return null
  const deadline = Date.now() + waitMs
  while (mongoState === 'connecting' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100))
  }
  return mongoState === 'connected' ? bankCollection : null
}

async function loadBankAccounts() {
  if (gh.isEnabled()) return gh.readJson(gh.FILES.bank, [])

  const coll = await bankStore()
  if (coll) {
    const doc = await coll.findOne({ _id: 'accounts' })
    return Array.isArray(doc?.accounts) ? doc.accounts : []
  }
  ensureDataFile()
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return Array.isArray(data.bankAccounts) ? data.bankAccounts : []
  } catch (_) {
    return []
  }
}

async function saveBankAccounts(accounts) {
  const list = Array.isArray(accounts) ? accounts : []
  if (gh.isEnabled()) {
    const total = list.reduce((s, a) => s + (Number(a.balance) || 0), 0)
    await gh.writeJson(gh.FILES.bank, list, `bank: ${list.length} accounts, total ${Math.round(total)}`)
    return list
  }

  const coll = await bankStore()
  if (coll) {
    // Let a write failure surface as a 500 instead of quietly landing in a file the
    // Mongo-backed reader will never look at.
    await coll.updateOne(
      { _id: 'accounts' },
      { $set: { accounts: list, updatedAt: new Date().toISOString() } },
      { upsert: true }
    )
    console.log('[STORAGE] Bank accounts saved to MongoDB:', list.length)
    return list
  }
  ensureDataFile()
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  data.bankAccounts = list
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  return list
}

// ── Broker ledgers ───────────────────────────────────────────────────────────
// One number the holdings table cannot know: the NET amount actually put into a broker.
// It is a running figure the user maintains themselves — already net of the profit and
// loss they have booked and of the brokerage and taxes paid — so booked P&L and charges
// are deliberately NOT separate fields here. Comparing that single figure against what
// the holdings are worth today is what turns the app's unrealised-only P/L into a real
// one. Dividends are tracked separately because they are income, not a price movement.
async function brokerStore(waitMs = 5000) {
  if (mongoState === 'absent' || mongoState === 'failed') return null
  const deadline = Date.now() + waitMs
  while (mongoState === 'connecting' && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 100))
  }
  return mongoState === 'connected' ? brokersCollection : null
}

async function loadBrokers() {
  if (gh.isEnabled()) return gh.readJson(gh.FILES.brokers, [])

  const coll = await brokerStore()
  if (coll) {
    const doc = await coll.findOne({ _id: 'ledgers' })
    return Array.isArray(doc?.brokers) ? doc.brokers : []
  }
  ensureDataFile()
  try {
    const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
    return Array.isArray(data.brokers) ? data.brokers : []
  } catch (_) {
    return []
  }
}

async function saveBrokers(brokers) {
  const list = Array.isArray(brokers) ? brokers : []
  if (gh.isEnabled()) {
    await gh.writeJson(gh.FILES.brokers, list, `brokers: ${list.length} ledgers`)
    return list
  }

  const coll = await brokerStore()
  if (coll) {
    await coll.updateOne(
      { _id: 'ledgers' },
      { $set: { brokers: list, updatedAt: new Date().toISOString() } },
      { upsert: true }
    )
    console.log('[STORAGE] Broker ledgers saved to MongoDB:', list.length)
    return list
  }
  ensureDataFile()
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  data.brokers = list
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  return list
}

const num0 = v => {
  const n = Number(v)
  return Number.isFinite(n) && n >= 0 ? n : 0
}

function createBroker({ platform = 'other', name = '', netDeposited = 0, dividends = 0, note = '' }) {
  return {
    id: randomUUID(),
    platform,
    name: String(name || '').trim(),
    // Net cash in, as the user tracks it: deposits minus withdrawals, already adjusted
    // for whatever they booked and whatever it cost. Never derived from holdings — the
    // whole point is to compare the two.
    netDeposited: num0(netDeposited),
    dividends: num0(dividends),             // net of TDS
    note: String(note || '').trim(),
    updatedAt: new Date().toISOString(),
  }
}

function createBankAccount({ name, bankName = '', accountType = 'savings', balance = 0, note = '' }) {
  const b = Number(balance)
  return {
    id: randomUUID(),
    name: String(name).trim(),
    bankName: String(bankName || '').trim(),
    accountType: accountType || 'savings',
    balance: Number.isFinite(b) && b >= 0 ? b : 0,
    note: String(note || '').trim(),
    updatedAt: new Date().toISOString(),
  }
}

async function savePortfolio(portfolio) {
  const data = { ...portfolio, updatedAt: new Date().toISOString() }

  if (gh.isEnabled()) {
    const holdings = (data.divisions || []).reduce((n, d) =>
      n + (d.holdings || []).length + (d.subdivisions || []).reduce((m, s) => m + (s.holdings || []).length, 0), 0)
    await gh.writeJson(
      gh.FILES.portfolio,
      { divisions: data.divisions || [], updatedAt: data.updatedAt },
      `portfolio: ${data.divisions?.length || 0} divisions, ${holdings} holdings`
    )
    return data
  }

  // Try MongoDB first
  if (portfolioCollection) {
    try {
      await portfolioCollection.updateOne(
        { _id: 'main' },
        { $set: { divisions: data.divisions, updatedAt: data.updatedAt } },
        { upsert: true }
      )
      console.log('[STORAGE] Portfolio saved to MongoDB at', data.updatedAt)
      return data
    } catch (e) {
      console.error('[STORAGE] MongoDB save failed:', e.message)
    }
  }
  
  // Fallback to file system. Write ONLY the keys the portfolio owns, on top of the
  // current file contents. loadPortfolio returns the whole document in file mode, so
  // spreading it back would re-persist a stale snapshot of the sibling keys and undo
  // any bankAccounts / expenses / categories write that landed while a slow handler
  // (e.g. Sync All, which spends seconds fetching prices) was in flight.
  ensureDataFile()
  console.log('[STORAGE] Saving portfolio to disk:', DATA_FILE)
  let onDisk = {}
  try { onDisk = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')) || {} } catch (_) { onDisk = {} }
  const merged = { ...onDisk, divisions: data.divisions, updatedAt: data.updatedAt }
  fs.writeFileSync(DATA_FILE, JSON.stringify(merged, null, 2))
  console.log('[STORAGE] Portfolio saved successfully at', data.updatedAt)
  return data
}

async function saveExpense(expense) {
  if (gh.isEnabled()) {
    const list = await gh.readJson(gh.FILES.expenses, [])
    const doc = { ...expense, _id: randomUUID(), createdAt: new Date().toISOString() }
    list.push(doc)
    await gh.writeJson(gh.FILES.expenses, list,
      `expense: +${doc.type || 'expense'} ${doc.category || ''} ${Math.round(Number(doc.amount) || 0)}`)
    return doc
  }

  if (expensesCollection) {
    try {
      const result = await expensesCollection.insertOne({ ...expense, createdAt: new Date().toISOString() })
      console.log('[STORAGE] Expense saved to MongoDB:', result.insertedId)
      return { ...expense, _id: result.insertedId }
    } catch (e) {
      console.error('[STORAGE] MongoDB expense save failed:', e.message)
    }
  }
  
  // Fallback: save to file
  ensureDataFile()
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  if (!data.expenses) data.expenses = []
  expense._id = randomUUID()
  data.expenses.push(expense)
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  return expense
}

async function deleteExpense(id) {
  if (gh.isEnabled()) {
    const list = await gh.readJson(gh.FILES.expenses, [])
    const next = list.filter(e => String(e._id ?? e.id) !== String(id))
    if (next.length === list.length) return false
    await gh.writeJson(gh.FILES.expenses, next, `expense: removed 1 entry`)
    return true
  }

  if (expensesCollection) {
    try {
      const { ObjectId } = require('mongodb')
      await expensesCollection.deleteOne({ _id: new ObjectId(id) })
      console.log('[STORAGE] Expense deleted from MongoDB:', id)
      return true
    } catch (e) {
      console.error('[STORAGE] MongoDB expense delete failed:', e.message)
    }
  }

  // File mode used to just `return false` here, so the delete button silently did
  // nothing whenever Mongo wasn't configured.
  ensureDataFile()
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  const list = Array.isArray(data.expenses) ? data.expenses : []
  const next = list.filter(e => String(e._id ?? e.id) !== String(id))
  if (next.length === list.length) return false
  data.expenses = next
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  return true
}

async function saveMonthExpenses(year, month, entries) {
  const y = Number(year), m = Number(month)

  if (gh.isEnabled()) {
    const list = await gh.readJson(gh.FILES.expenses, [])
    const kept = list.filter(e => !(Number(e.year) === y && Number(e.month) === m))
    const docs = entries.map(e => ({
      _id: randomUUID(), type: e.type, category: e.category,
      amount: Number(e.amount), month: m, year: y,
      description: e.description || '', createdAt: new Date().toISOString(),
    }))
    await gh.writeJson(gh.FILES.expenses, [...kept, ...docs],
      `expenses: ${y}-${String(m).padStart(2, '0')} set to ${docs.length} entries`)
    return entries
  }

  if (expensesCollection) {
    try {
      await expensesCollection.deleteMany({ year: y, month: m })
      if (entries.length > 0) {
        const docs = entries.map(e => ({
          type: e.type, category: e.category,
          amount: Number(e.amount), month: m, year: y,
          description: e.description || '', createdAt: new Date().toISOString()
        }))
        await expensesCollection.insertMany(docs)
      }
      console.log('[STORAGE] Month expenses saved:', y, m, entries.length, 'entries')
      return entries
    } catch (e) {
      console.error('[STORAGE] MongoDB saveMonthExpenses failed:', e.message)
    }
  }
  ensureDataFile()
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  if (!data.expenses) data.expenses = []
  data.expenses = data.expenses.filter(e => !(Number(e.year) === y && Number(e.month) === m))
  const docs = entries.map(e => ({
    _id: randomUUID(), type: e.type, category: e.category,
    amount: Number(e.amount), month: m, year: y,
    description: e.description || '', createdAt: new Date().toISOString()
  }))
  data.expenses.push(...docs)
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  return entries
}

async function saveCategories(categories) {
  const payload = { expense: categories.expense || [], income: categories.income || [] }
  if (gh.isEnabled()) {
    await gh.writeJson(gh.FILES.categories, payload,
      `categories: ${payload.expense.length} expense, ${payload.income.length} income`)
    return payload
  }

  if (categoriesCollection) {
    try {
      await categoriesCollection.updateOne(
        { _id: 'categories' },
        { $set: { expense: categories.expense || [], income: categories.income || [], updatedAt: new Date().toISOString() } },
        { upsert: true }
      )
      console.log('[STORAGE] Categories saved to MongoDB')
      return categories
    } catch (e) {
      console.error('[STORAGE] MongoDB categories save failed:', e.message)
    }
  }
  
  // Fallback: save to file
  ensureDataFile()
  const data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'))
  data.categories = categories
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  return categories
}

function createDivision({ name, targetPercent = 0 }) {
  return { id: randomUUID(), name, targetPercent: Number(targetPercent) || 0, holdings: [], subdivisions: [] }
}

function createSubdivision({ name, targetPercent = 0 }) {
  return { id: randomUUID(), name, targetPercent: Number(targetPercent) || 0, holdings: [] }
}

function createHolding({ name, invested = 0, current = 0, targetPercent = undefined, platform = 'other', assetType = 'stock', ticker = '', schemeCode = '', units = 0, buyPrice = 0, currentPrice = 0, note = '', sector = '', capCategory = '',
  currency, exchangeRate, foreignBuyPrice, foreignCurrentPrice, foreignInvested, foreignCurrent }) {
  const h = {
    id: randomUUID(),
    name,
    platform: platform || 'other',
    assetType: assetType || 'stock',
    ticker: ticker || '',
    schemeCode: schemeCode || '',
    units: Number(units) || 0,
    buyPrice: Number(buyPrice) || 0,
    currentPrice: Number(currentPrice) || 0,
    invested: Number(invested) || 0,
    current: Number(current) || 0,
    note: note || '',
    sector: sector || '',
    capCategory: capCategory || '',
    priceDate: null,
  }
  if (targetPercent !== undefined) h.targetPercent = Number(targetPercent) || 0
  if (currency) {
    h.currency = currency
    h.exchangeRate = Number(exchangeRate) || 0
    h.foreignBuyPrice = Number(foreignBuyPrice) || 0
    h.foreignCurrentPrice = Number(foreignCurrentPrice) || 0
    h.foreignInvested = Number(foreignInvested) || 0
    h.foreignCurrent = Number(foreignCurrent) || 0
  }
  return h
}

// The truth about Mongo, for /api/debug/storage. "Configured" is not the same as
// "connected": if the cluster is paused or unreachable, reads and writes quietly go to
// the ephemeral disk instead, and the endpoint must say so rather than reassure.
function mongoStatus() {
  return {
    configured: !!process.env.MONGODB_URI,
    state: mongoState,          // absent | connecting | connected | failed
    connected: mongoState === 'connected',
    lastError: mongoError,
  }
}

module.exports = {
  DATA_FILE,
  mongoStatus,
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
  loadBrokers,
  saveBrokers,
  createBroker,
  createDivision,
  createSubdivision,
  createHolding,
}
