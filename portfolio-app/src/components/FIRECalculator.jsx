import React, { useState, useEffect } from 'react'

export default function FIRECalculator({ currentPortfolioValue, expenses }) {
  // Calculate current age from DOB (13/04/2002)
  const calculateAge = () => {
    const dob = new Date(2002, 3, 13) // April 13, 2002 (0-indexed month)
    const today = new Date()
    let age = today.getFullYear() - dob.getFullYear()
    const monthDiff = today.getMonth() - dob.getMonth()
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
      age--
    }
    return age
  }

  const currentAge = calculateAge()
  const [inputs, setInputs] = useState({
    currentAge: currentAge,
    targetAge: currentAge + 20,
    annualExpenses: 0,
    expectedReturn: 8,
    inflationRate: 6,
    safeWithdrawalRate: 4,
    monthlyContribution: 0,
    additionalSavings: 0
  })

  // Calculate annual expenses from expense tracker data
  useEffect(() => {
    if (expenses && expenses.length > 0) {
      const yearlyExpense = expenses
        .filter(e => e.type === 'expense')
        .reduce((sum, e) => sum + Number(e.amount || 0), 0)
      
      // Estimate annual if we have less than 12 months of data
      const uniqueMonths = new Set(expenses.map(e => `${e.year}-${e.month}`)).size
      const annualized = uniqueMonths > 0 ? (yearlyExpense / uniqueMonths) * 12 : 0
      
      setInputs(prev => ({ ...prev, annualExpenses: Math.round(annualized) }))
    }
  }, [expenses])

  const handleInputChange = (field, value) => {
    setInputs(prev => ({ ...prev, [field]: Number(value) }))
  }

  // FIRE Calculations
  const fireNumber = inputs.annualExpenses * (100 / inputs.safeWithdrawalRate)
  const currentSavings = currentPortfolioValue + inputs.additionalSavings
  const gap = Math.max(0, fireNumber - currentSavings)
  const fireProgress = fireNumber > 0 ? (currentSavings / fireNumber) * 100 : 0

  // Time to FIRE calculation with compound growth
  const monthlyReturn = inputs.expectedReturn / 12 / 100
  const yearsToFIRE = (() => {
    if (gap <= 0) return 0
    if (inputs.monthlyContribution <= 0) return 'Never (no contributions)'
    
    // FV = PV(1+r)^n + PMT * [((1+r)^n - 1) / r]
    // Solve for n when FV = fireNumber
    let months = 0
    let balance = currentSavings
    const maxMonths = 600 // 50 years max
    
    while (balance < fireNumber && months < maxMonths) {
      balance = balance * (1 + monthlyReturn) + inputs.monthlyContribution
      months++
    }
    
    return months >= maxMonths ? 'Never (insufficient rate)' : (months / 12).toFixed(1)
  })()

  const targetAgeReached = typeof yearsToFIRE === 'number' ? inputs.currentAge + parseFloat(yearsToFIRE) : 'N/A'
  
  // Different FIRE levels
  const leanFIRE = inputs.annualExpenses * 0.7 * (100 / inputs.safeWithdrawalRate)
  const fatFIRE = inputs.annualExpenses * 2 * (100 / inputs.safeWithdrawalRate)
  const baristaFIRE = inputs.annualExpenses * 0.5 * (100 / inputs.safeWithdrawalRate)

  // Inflation adjusted
  const yearsUntilTarget = inputs.targetAge - inputs.currentAge
  const inflationMultiplier = Math.pow(1 + inputs.inflationRate / 100, yearsUntilTarget)
  const inflationAdjustedFIRE = fireNumber * inflationMultiplier

  // Monthly income at FIRE
  const monthlyFIREIncome = (fireNumber * (inputs.safeWithdrawalRate / 100)) / 12

  // Coast FIRE - amount needed now to reach FIRE by target age with no more contributions
  const coastFIRENumber = fireNumber / Math.pow(1 + inputs.expectedReturn / 100, yearsUntilTarget)
  const coastFIREAchieved = currentSavings >= coastFIRENumber

  // Simple coverage if you stopped working today (no growth, brute run-down)
  const yearsCoverageNoGrowth = inputs.annualExpenses > 0
    ? (currentSavings / inputs.annualExpenses).toFixed(1)
    : '∞'

  return (
    <div style={{ color: '#e6e9ef' }}>
      {/* Header */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 28, fontWeight: 900, color: '#22d3ee', marginBottom: 8 }}>
          🔥 FIRE Calculator
        </h2>
        <p style={{ color: '#94a3b8', fontSize: 14, lineHeight: 1.6, marginBottom: 16 }}>
          Financial Independence, Retire Early - Calculate your path to financial freedom
        </p>
        
        {/* What is FIRE - Educational Block */}
        <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))', padding: 20, borderRadius: 12, border: '2px solid rgba(34,197,94,0.2)', marginBottom: 16 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#22c55e', marginBottom: 12 }}>💡 What is FIRE?</div>
          <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8 }}>
            <strong style={{ color: '#e6e9ef' }}>Financial Independence</strong> means you have enough money invested that the returns cover all your expenses - you don't <em>need</em> to work anymore.
            <br /><br />
            <strong style={{ color: '#e6e9ef' }}>The 4% Rule:</strong> If you save <strong>25 times your annual expenses</strong>, you can safely withdraw 4% per year (adjusted for inflation) and your money will last 30+ years - likely forever. 
            <br /><br />
            <strong style={{ color: '#e6e9ef' }}>Example:</strong> If you spend ₹5,00,000/year → FIRE Number = ₹5,00,000 × 25 = ₹1.25 crore. At 4% withdrawal, you get ₹5,00,000/year while your corpus keeps growing at ~8-10%.
          </div>
        </div>

        <div style={{ marginTop: 12, padding: 12, background: 'rgba(59,130,246,0.08)', border: '1px solid rgba(59,130,246,0.2)', borderRadius: 10, color: '#cbd5e1', fontSize: 12, lineHeight: 1.6 }}>
          <strong style={{ color: '#22d3ee' }}>How this calculator works:</strong>
          <ul style={{ margin: '6px 0 0 16px', padding: 0, lineHeight: 1.6 }}>
            <li><strong>FIRE Number</strong> = Annual expenses ÷ Safe withdrawal rate (25x expenses at 4%).</li>
            <li><strong>Time to FIRE</strong> = Years until your current savings + monthly investments (with compound growth) reaches the FIRE number.</li>
            <li><strong>Monthly FIRE Income</strong> = What you can safely withdraw each month forever.</li>
            <li><strong>If stopped today</strong> = How many years your current savings covers expenses (with no growth).</li>
          </ul>
        </div>
      </div>

      {/* Input Section */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#e6e9ef' }}>📋 Your Information</h3>
        
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>📅 Current Age (Auto-calculated)</label>
            <input 
              type="number" 
              value={inputs.currentAge}
              disabled
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#7dd3fc', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14, opacity: 0.7 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Calculated from DOB: 13/04/2002</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>🎯 Target FIRE Age</label>
            <input 
              type="number" 
              value={inputs.targetAge}
              onChange={e => handleInputChange('targetAge', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Age at which you want to retire. Adjust to see impact on savings needed.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>💰 Annual Expenses (₹)</label>
            <input 
              type="number" 
              value={inputs.annualExpenses}
              onChange={e => handleInputChange('annualExpenses', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Auto-calculated from your expense tracker. Adjust if you plan to spend differently in retirement.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>📈 Monthly Contribution (₹)</label>
            <input 
              type="number" 
              value={inputs.monthlyContribution}
              onChange={e => handleInputChange('monthlyContribution', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Amount you save & invest each month. Higher = faster path to FIRE.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>📊 Expected Annual Return (%)</label>
            <input 
              type="number" 
              step="0.1"
              value={inputs.expectedReturn}
              onChange={e => handleInputChange('expectedReturn', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Long-term average returns on your portfolio. Stock market ~10%, conservative ~6-8%.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>📉 Inflation Rate (%)</label>
            <input 
              type="number" 
              step="0.1"
              value={inputs.inflationRate}
              onChange={e => handleInputChange('inflationRate', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Estimated annual inflation. India ~5-6%. Higher inflation = higher FIRE number needed.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>💎 Safe Withdrawal Rate (%)</label>
            <input 
              type="number" 
              step="0.1"
              value={inputs.safeWithdrawalRate}
              onChange={e => handleInputChange('safeWithdrawalRate', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>% of corpus you withdraw annually. 4% rule (25x expenses) is historically safe for 30+ years.</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>🏦 Additional Savings (₹)</label>
            <input 
              type="number" 
              value={inputs.additionalSavings}
              onChange={e => handleInputChange('additionalSavings', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Liquid savings outside portfolio (emergency fund, bank FD, cash). Adds to FIRE corpus.</div>
          </div>
        </div>
      </div>

      {/* FIRE Progress */}
      <div style={{ background: `linear-gradient(135deg, ${fireProgress >= 100 ? 'rgba(34,197,94,0.15)' : fireProgress >= 50 ? 'rgba(245,158,11,0.15)' : 'rgba(59,130,246,0.15)'}, rgba(0,0,0,0.05)), #0f1724`, padding: 24, borderRadius: 14, border: `2px solid ${fireProgress >= 100 ? '#22c55e' : fireProgress >= 50 ? '#f59e0b' : '#3b82f6'}`, marginBottom: 32, boxShadow: `0 4px 20px ${fireProgress >= 100 ? 'rgba(34,197,94,0.3)' : fireProgress >= 50 ? 'rgba(245,158,11,0.3)' : 'rgba(59,130,246,0.3)'}` }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e6e9ef' }}>🎯 FIRE Progress</h3>
        
        <div style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 14, color: '#94a3b8' }}>Progress to FIRE Number</span>
            <span style={{ fontSize: 16, fontWeight: 700, color: fireProgress >= 100 ? '#22c55e' : '#e6e9ef' }}>
              {fireProgress.toFixed(1)}%
            </span>
          </div>
          <div style={{ width: '100%', height: 12, background: '#1e293b', borderRadius: 6, overflow: 'hidden' }}>
            <div style={{ 
              width: `${Math.min(100, fireProgress)}%`, 
              height: '100%', 
              background: fireProgress >= 100 ? 'linear-gradient(90deg, #22c55e, #16a34a)' : fireProgress >= 50 ? 'linear-gradient(90deg, #f59e0b, #d97706)' : 'linear-gradient(90deg, #3b82f6, #2563eb)',
              transition: 'width 0.5s ease'
            }} />
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Current Savings</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#22d3ee' }}>₹{currentSavings.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>FIRE Number</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: '#a78bfa' }}>₹{fireNumber.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>Gap to FIRE</div>
            <div style={{ fontSize: 24, fontWeight: 900, color: gap > 0 ? '#ef4444' : '#22c55e' }}>₹{gap.toLocaleString()}</div>
          </div>
          <div>
            <div style={{ fontSize: 11, color: '#94a3b8', textTransform: 'uppercase', marginBottom: 4 }}>If you stopped today</div>
            <div style={{ fontSize: 20, fontWeight: 900, color: '#f59e0b' }}>{yearsCoverageNoGrowth} yrs</div>
            <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>Coverage with no growth, spending today’s annual expenses.</div>
          </div>
        </div>
      </div>

      {/* Key Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 20, marginBottom: 32 }}>
        <div style={{ background: 'linear-gradient(135deg, rgba(34,211,238,0.15), rgba(34,211,238,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(34,211,238,0.3)' }}>
          <div style={{ fontSize: 11, color: '#7dd3fc', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>⏱️ Time to FIRE</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#22d3ee' }}>{typeof yearsToFIRE === 'string' ? yearsToFIRE : `${yearsToFIRE} yrs`}</div>
          {typeof yearsToFIRE === 'number' && (
            <>
              <div style={{ fontSize: 13, color: '#7dd3fc', marginTop: 6 }}>You'll reach FIRE at age {targetAgeReached}</div>
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
                {targetAgeReached < inputs.targetAge ? 
                  `🎉 Excellent! You'll hit FIRE ${inputs.targetAge - targetAgeReached} years before your target!` :
                  targetAgeReached == inputs.targetAge ?
                  `Perfect! On track to hit your target age.` :
                  `⚠️ Will take ${targetAgeReached - inputs.targetAge} years longer than target. Increase savings or reduce target age.`}
              </div>
            </>
          )}
        </div>

        <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(34,197,94,0.3)' }}>
          <div style={{ fontSize: 11, color: '#86efac', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>💰 Monthly FIRE Income</div>
          <div style={{ fontSize: 32, fontWeight: 900, color: '#22c55e' }}>₹{monthlyFIREIncome.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: '#86efac', marginTop: 6 }}>You can withdraw this every month</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            At {inputs.safeWithdrawalRate}% annual withdrawal, your corpus keeps growing with market returns while covering expenses.
          </div>
        </div>

        <div style={{ background: `linear-gradient(135deg, ${coastFIREAchieved ? 'rgba(34,197,94,0.15)' : 'rgba(139,92,246,0.15)'}, ${coastFIREAchieved ? 'rgba(34,197,94,0.05)' : 'rgba(139,92,246,0.05)'}), #0f1724`, padding: 20, borderRadius: 12, border: `2px solid ${coastFIREAchieved ? 'rgba(34,197,94,0.3)' : 'rgba(139,92,246,0.3)'}` }}>
          <div style={{ fontSize: 11, color: coastFIREAchieved ? '#86efac' : '#c4b5fd', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>🏖️ Coast FIRE Status</div>
          <div style={{ fontSize: 24, fontWeight: 900, color: coastFIREAchieved ? '#22c55e' : '#a78bfa' }}>
            {coastFIREAchieved ? '✅ Achieved!' : `₹${coastFIRENumber.toLocaleString()}`}
          </div>
          <div style={{ fontSize: 13, color: coastFIREAchieved ? '#86efac' : '#c4b5fd', marginTop: 6 }}>
            {coastFIREAchieved ? 'You can stop saving now' : 'Needed to stop contributing'}
          </div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            {coastFIREAchieved ? 
              `Your current savings will grow to FIRE number by age ${inputs.targetAge} with zero additional contributions.` :
              `Save this much, then let compound growth do the rest until age ${inputs.targetAge}.`}
          </div>
        </div>

        <div style={{ background: 'linear-gradient(135deg, rgba(245,158,11,0.15), rgba(245,158,11,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(245,158,11,0.3)' }}>
          <div style={{ fontSize: 11, color: '#fcd34d', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>📈 Inflation Adjusted</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#f59e0b' }}>₹{inflationAdjustedFIRE.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: '#fcd34d', marginTop: 6 }}>FIRE number in {yearsUntilTarget} years</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            At {inputs.inflationRate}% inflation, your expenses will increase. Today's ₹{inputs.annualExpenses.toLocaleString()} = ₹{Math.round(inputs.annualExpenses * inflationMultiplier).toLocaleString()} by age {inputs.targetAge}.
          </div>
        </div>
      </div>

      {/* FIRE Types */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b', marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 20, color: '#e6e9ef' }}>🎨 FIRE Flavors</h3>
        
        <div style={{ display: 'grid', gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12, padding: 16, background: 'rgba(34,197,94,0.08)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#22c55e' }}>Lean FIRE</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>Minimalist lifestyle, 70% of current expenses</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#22c55e', textAlign: 'right' }}>₹{leanFIRE.toLocaleString()}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12, padding: 16, background: 'rgba(59,130,246,0.08)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#3b82f6' }}>Regular FIRE</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>Maintain current lifestyle</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#3b82f6', textAlign: 'right' }}>₹{fireNumber.toLocaleString()}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12, padding: 16, background: 'rgba(139,92,246,0.08)', borderRadius: 10, border: '1px solid rgba(139,92,246,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#8b5cf6' }}>Fat FIRE</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>Luxury lifestyle, 2x current expenses</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#8b5cf6', textAlign: 'right' }}>₹{fatFIRE.toLocaleString()}</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 1fr', gap: 12, padding: 16, background: 'rgba(245,158,11,0.08)', borderRadius: 10, border: '1px solid rgba(245,158,11,0.2)' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: '#f59e0b' }}>Barista FIRE</div>
            <div style={{ fontSize: 12, color: '#cbd5e1' }}>Part-time work covers 50% of expenses</div>
            <div style={{ fontSize: 16, fontWeight: 900, color: '#f59e0b', textAlign: 'right' }}>₹{baristaFIRE.toLocaleString()}</div>
          </div>
        </div>
      </div>

      {/* Additional Insights */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e6e9ef' }}>💡 Key Insights</h3>
        
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ padding: 12, background: 'rgba(59,130,246,0.08)', borderRadius: 8, borderLeft: '4px solid #3b82f6' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong style={{ color: '#3b82f6' }}>4% Rule:</strong> Withdraw 4% annually from your FIRE corpus. Historically safe for 30+ year retirements.
            </div>
          </div>

          <div style={{ padding: 12, background: 'rgba(34,197,94,0.08)', borderRadius: 8, borderLeft: '4px solid #22c55e' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong style={{ color: '#22c55e' }}>Your monthly savings rate:</strong> ₹{inputs.monthlyContribution.toLocaleString()} × 12 = ₹{(inputs.monthlyContribution * 12).toLocaleString()}/year
            </div>
          </div>

          <div style={{ padding: 12, background: 'rgba(245,158,11,0.08)', borderRadius: 8, borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong style={{ color: '#f59e0b' }}>To reach FIRE by age {inputs.targetAge}:</strong>{' '}
              {(() => {
                if (gap <= 0) return 'Already on track!'
                if (yearsUntilTarget <= 0) return 'Target age is now or past; increase contributions or push target age.'
                const neededPerMonth = gap / yearsUntilTarget / 12
                if (neededPerMonth <= inputs.monthlyContribution + 1) return 'Already on track!'
                return `Need to save ₹${Math.round(neededPerMonth).toLocaleString()}/month`
              })()}
            </div>
          </div>

          {fireProgress >= 100 && (
            <div style={{ padding: 12, background: 'rgba(34,197,94,0.15)', borderRadius: 8, borderLeft: '4px solid #22c55e' }}>
              <div style={{ fontSize: 14, color: '#22c55e', lineHeight: 1.6, fontWeight: 700 }}>
                🎉 Congratulations! You've achieved FIRE! You can sustain your current lifestyle indefinitely.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
