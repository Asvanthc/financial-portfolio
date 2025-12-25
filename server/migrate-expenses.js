/**
 * Migration script to move expenses from old format (in portfolio document) 
 * to new scalable format (separate collections)
 * 
 * Run with: node server/migrate-expenses.js
 */

const fs = require('fs')
const path = require('path')
const { MongoClient } = require('mongodb')

const DATA_FILE = path.join(__dirname, '../data/portfolio.json')

async function migrate() {
  if (!process.env.MONGODB_URI) {
    console.log('[MIGRATE] MONGODB_URI not set, skipping migration')
    return
  }

  const client = new MongoClient(process.env.MONGODB_URI)
  
  try {
    await client.connect()
    const db = client.db('financial-portfolio')
    const portfolioCollection = db.collection('portfolio')
    const expensesCollection = db.collection('expenses')
    const categoriesCollection = db.collection('categories')

    console.log('[MIGRATE] Connected to MongoDB')

    // Load old portfolio document
    const oldDoc = await portfolioCollection.findOne({ _id: 'main' })
    if (!oldDoc || !oldDoc.expenses || oldDoc.expenses.length === 0) {
      console.log('[MIGRATE] No old expenses found to migrate')
      await client.close()
      return
    }

    console.log(`[MIGRATE] Found ${oldDoc.expenses.length} old expenses to migrate`)

    // Extract categories from expenses
    const expenseCategories = new Set()
    const incomeCategories = new Set()
    
    oldDoc.expenses.forEach(exp => {
      if (exp.type === 'income') {
        incomeCategories.add(exp.category)
      } else {
        expenseCategories.add(exp.category)
      }
    })

    // Default categories if none found
    if (expenseCategories.size === 0) {
      ['Food', 'Transport', 'Entertainment', 'Bills', 'Healthcare', 'Shopping', 'Other'].forEach(c => expenseCategories.add(c))
    }
    if (incomeCategories.size === 0) {
      ['Salary', 'Investment Returns', 'Freelance', 'Other'].forEach(c => incomeCategories.add(c))
    }

    // Save categories
    await categoriesCollection.updateOne(
      { _id: 'categories' },
      {
        $set: {
          expense: Array.from(expenseCategories),
          income: Array.from(incomeCategories),
          updatedAt: new Date().toISOString()
        }
      },
      { upsert: true }
    )
    console.log(`[MIGRATE] Saved ${expenseCategories.size} expense categories and ${incomeCategories.size} income categories`)

    // Migrate expenses to new collection
    const oldExpenses = oldDoc.expenses.map(exp => ({
      type: exp.type,
      category: exp.category,
      amount: Number(exp.amount) || 0,
      month: Number(exp.month) || 1,
      year: Number(exp.year) || new Date().getFullYear(),
      description: exp.description || '',
      createdAt: exp.createdAt || new Date().toISOString()
    }))

    // Clear old expenses collection to avoid duplicates
    await expensesCollection.deleteMany({})
    
    // Insert all expenses
    const result = await expensesCollection.insertMany(oldExpenses)
    console.log(`[MIGRATE] Migrated ${result.insertedIds.length} expenses to new collection`)

    // Remove expenses from portfolio document
    await portfolioCollection.updateOne(
      { _id: 'main' },
      { $unset: { expenses: '' } }
    )
    console.log('[MIGRATE] Removed expenses array from portfolio document')

    console.log('[MIGRATE] ✅ Migration completed successfully!')
    console.log(`
    Schema Changes:
    - Old: expenses array in portfolio document
    - New: separate 'expenses' collection with individual documents
    - Categories: stored in 'categories' collection with _id: 'categories'
    
    Benefits:
    ✓ Each expense as separate document (better scalability)
    ✓ Faster queries with database indexes
    ✓ Easier to implement pagination
    ✓ Better for large datasets
    ✓ Categories persisted and manageable
    `)

  } catch (error) {
    console.error('[MIGRATE] Error during migration:', error.message)
    process.exit(1)
  } finally {
    await client.close()
    process.exit(0)
  }
}

migrate()
