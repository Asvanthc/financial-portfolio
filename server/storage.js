const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

// MongoDB support (optional)
let db = null
let portfolioCollection = null
let expensesCollection = null
let categoriesCollection = null

if (process.env.MONGODB_URI) {
  const { MongoClient } = require('mongodb')
  const client = new MongoClient(process.env.MONGODB_URI)
  client.connect()
    .then(() => {
      db = client.db('financial-portfolio')
      portfolioCollection = db.collection('portfolio')
      expensesCollection = db.collection('expenses')
      categoriesCollection = db.collection('categories')
      console.log('[STORAGE] Connected to MongoDB with collections: portfolio, expenses, categories')
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
  if (expensesCollection) {
    try {
      const expenses = await expensesCollection.find({}).toArray()
      console.log('[STORAGE] Loaded', expenses.length, 'expenses from MongoDB')
      return expenses
    } catch (e) {
      console.error('[STORAGE] MongoDB expenses read failed:', e.message)
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

async function savePortfolio(portfolio) {
  const data = { ...portfolio, updatedAt: new Date().toISOString() }
  
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
  
  // Fallback to file system
  ensureDataFile()
  console.log('[STORAGE] Saving portfolio to disk:', DATA_FILE)
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
  console.log('[STORAGE] Portfolio saved successfully at', data.updatedAt)
  return data
}

async function saveExpense(expense) {
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
  return false
}

async function saveCategories(categories) {
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

function createHolding({ name, invested = 0, current = 0, targetPercent = undefined }) {
  const h = { id: randomUUID(), name, invested: Number(invested) || 0, current: Number(current) || 0 }
  if (targetPercent !== undefined) h.targetPercent = Number(targetPercent) || 0
  return h
}

module.exports = {
  DATA_FILE,
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
}
