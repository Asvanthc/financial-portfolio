const fs = require('fs')
const path = require('path')
const { randomUUID } = require('crypto')

const DATA_DIR = path.resolve(process.cwd(), 'data')
const DATA_FILE = path.join(DATA_DIR, 'portfolio.json')

function ensureDataFile() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(DATA_FILE)) {
    const seed = { divisions: [], updatedAt: new Date().toISOString() }
    fs.writeFileSync(DATA_FILE, JSON.stringify(seed, null, 2))
  }
}

function loadPortfolio() {
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

function savePortfolio(portfolio) {
  ensureDataFile()
  const data = { ...portfolio, updatedAt: new Date().toISOString() }
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2))
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
