const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

// MongoDB support (optional)
let db = null
let portfolioCollection = null

if (process.env.MONGODB_URI) {
  const { MongoClient } = require('mongodb')
  const client = new MongoClient(process.env.MONGODB_URI)
  client.connect()
    .then(() => {
      db = client.db('financial-portfolio')
      portfolioCollection = db.collection('portfolio')
      console.log('[STORAGE] Connected to MongoDB')
    })
    .catch(err => {
      console.error('[STORAGE] MongoDB connection failed, using file system:', err.message)
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
  // Try MongoDB first
  if (portfolioCollection) {
    try {
      const doc = await portfolioCollection.findOne({ _id: 'main' })
      if (doc) {
        const data = { divisions: doc.divisions || [], expenses: doc.expenses || [], updatedAt: doc.updatedAt }
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
    if (!Array.isArray(data.expenses)) data.expenses = []
    return data
  } catch (e) {
    throw new Error('Failed to parse portfolio data: ' + e.message)
  }
}

async function savePortfolio(portfolio) {
  const data = { ...portfolio, updatedAt: new Date().toISOString() }
  
  // Try MongoDB first
  if (portfolioCollection) {
    try {
      await portfolioCollection.updateOne(
        { _id: 'main' },
        { $set: { divisions: data.divisions, expenses: data.expenses || [], updatedAt: data.updatedAt } },
        { upsert: true }
      )
      console.log('[STORAGE] Portfolio saved to MongoDB at', data.updatedAt)
      return data
    } catch (e) {
      console.error('[STORAGE] MongoDB save failed:', e.message)
    }
  }
  
  // Fallback to file system
  ensureDataFile()
  console.log('[STORAGE] Saving portfolio to disk:', DATA_FILE)
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  console.log('[STORAGE] Portfolio saved successfully at', data.updatedAt)
  return data
}

function createDivision({ name, targetPercent = 0 }) {
  return { id: randomUUID(), name, targetPercent: Number(targetPercent) || 0, holdings: [], subdivisions: [] }
}

function createSubdivision({ name, targetPercent = 0 }) {
  return { id: randomUUID(), name, targetPercent: Number(targetPercent) || 0, holdings: [] }
}

function createHolding({ name, invested = 0, current = 0, targetPercent = undefined }) {
  const h = { id: randomUUID(), name, invested: Number(invested) || 0, current: Number(current) || 0 }
  if (targetPercent !== undefined) h.targetPercent = Number(targetPercent) || 0
  return h
}

module.exports = {
  DATA_FILE,
  loadPortfolio,
  savePortfolio,
  createDivision,
  createSubdivision,
  createHolding,
}
