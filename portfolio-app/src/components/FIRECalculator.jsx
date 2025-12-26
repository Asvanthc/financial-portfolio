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
    accumulationReturn: 11,      // Higher returns during working years (equity-heavy)
    withdrawalReturn: 8,          // Conservative returns post-retirement (balanced portfolio)
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

  // FIRE Calculations with edge case handling
  const fireNumber = inputs.annualExpenses > 0 && inputs.safeWithdrawalRate > 0 
    ? inputs.annualExpenses * (100 / inputs.safeWithdrawalRate)
    : 0
  const currentSavings = currentPortfolioValue + inputs.additionalSavings
  const gap = Math.max(0, fireNumber - currentSavings)
  const fireProgress = fireNumber > 0 ? (currentSavings / fireNumber) * 100 : 0

  // Time to FIRE calculation with compound growth (using accumulation phase returns)
  const monthlyReturn = inputs.accumulationReturn / 12 / 100
  const yearsToFIRE = (() => {
    if (fireNumber <= 0) return 'N/A'
    if (gap <= 0) return 0
    if (inputs.monthlyContribution <= 0) {
      // Only existing savings growing
      if (inputs.accumulationReturn <= 0) return 'Never'
      const years = Math.log(fireNumber / Math.max(1, currentSavings)) / Math.log(1 + inputs.accumulationReturn / 100)
      return years > 100 ? 'Never (100+ years)' : years.toFixed(1)
    }
    
    // FV = PV(1+r)^n + PMT * [((1+r)^n - 1) / r]
    let months = 0
    let balance = currentSavings
    const maxMonths = 100 * 12 // 100 years max
    
    while (balance < fireNumber && months < maxMonths) {
      balance = balance * (1 + monthlyReturn) + inputs.monthlyContribution
      months++
    }
    
    return months >= maxMonths ? 'Never (100+ years)' : (months / 12).toFixed(1)
  })()

  const targetAgeReached = typeof yearsToFIRE === 'number' ? inputs.currentAge + parseFloat(yearsToFIRE) : 'N/A'
  
  // Different FIRE levels
  const leanFIRE = inputs.annualExpenses * 0.7 * (100 / inputs.safeWithdrawalRate)
  const fatFIRE = inputs.annualExpenses * 2 * (100 / inputs.safeWithdrawalRate)
  const baristaFIRE = inputs.annualExpenses * 0.5 * (100 / inputs.safeWithdrawalRate)

  // Inflation adjusted
  const yearsUntilTarget = Math.max(0, inputs.targetAge - inputs.currentAge)
  const inflationMultiplier = Math.pow(1 + inputs.inflationRate / 100, yearsUntilTarget)
  const inflationAdjustedFIRE = fireNumber * inflationMultiplier

  // Present Value - what FIRE number means in today's money
  const presentValueFIRE = yearsUntilTarget > 0 
    ? inflationAdjustedFIRE / inflationMultiplier
    : fireNumber
  const futureValueNeeded = inflationAdjustedFIRE

  // Monthly income at FIRE (using withdrawal phase returns)
  const monthlyFIREIncome = fireNumber > 0 ? (fireNumber * (inputs.safeWithdrawalRate / 100)) / 12 : 0

  // Coast FIRE - amount needed now to reach FIRE by target age with no more contributions
  const coastFIRENumber = yearsUntilTarget > 0 && inputs.accumulationReturn > 0
    ? fireNumber / Math.pow(1 + inputs.accumulationReturn / 100, yearsUntilTarget)
    : fireNumber
  const coastFIREAchieved = currentSavings >= coastFIRENumber

  // Calculate needed monthly contribution to reach target in X years
  const calculateNeededContribution = (target, current, years, returnRate) => {
    if (years <= 0 || returnRate <= 0 || target <= current) return 0
    const monthlyRate = returnRate / 12 / 100
    const months = years * 12
    const futureValueOfCurrent = current * Math.pow(1 + monthlyRate, months)
    const gap = target - futureValueOfCurrent
    
    if (gap <= 0) return 0
    
    const numerator = gap * monthlyRate
    const denominator = Math.pow(1 + monthlyRate, months) - 1
    return denominator > 0 ? numerator / denominator : 0
  }

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
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>📈 Accumulation Return (%)</label>
            <input 
              type="number" 
              step="0.5"
              value={inputs.accumulationReturn}
              onChange={e => handleInputChange('accumulationReturn', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Expected returns BEFORE retirement (equity-heavy, 80-90%). India equity historical: 11-12%</div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: 12, color: '#94a3b8', marginBottom: 6, fontWeight: 600 }}>📉 Post-Retirement Return (%)</label>
            <input 
              type="number" 
              step="0.5"
              value={inputs.withdrawalReturn}
              onChange={e => handleInputChange('withdrawalReturn', e.target.value)}
              style={{ width: '100%', padding: 10, background: '#0a1018', color: '#e6e9ef', border: '2px solid #2d3f5f', borderRadius: 8, fontSize: 14 }}
            />
            <div style={{ fontSize: 11, color: '#64748b', marginTop: 4 }}>Expected returns AFTER retirement (balanced 60/40). Conservative: 7-8%</div>
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

        <div style={{ background: 'linear-gradient(135deg, rgba(168,85,247,0.15), rgba(168,85,247,0.05)), #0f1724', padding: 20, borderRadius: 12, border: '2px solid rgba(168,85,247,0.3)' }}>
          <div style={{ fontSize: 11, color: '#d8b4fe', marginBottom: 8, fontWeight: 700, textTransform: 'uppercase' }}>💎 In Today's Money</div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#a855f7' }}>₹{presentValueFIRE.toLocaleString()}</div>
          <div style={{ fontSize: 13, color: '#d8b4fe', marginTop: 6 }}>Present value of FIRE number</div>
          <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 8, lineHeight: 1.5 }}>
            Future ₹{futureValueNeeded.toLocaleString()} = Today's ₹{presentValueFIRE.toLocaleString()} in purchasing power. This is your real goal in current terms.
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

      {/* Will the Money Last? - Critical Question */}
      <div style={{ background: 'linear-gradient(135deg, rgba(34,197,94,0.08), rgba(34,197,94,0.02))', padding: 24, borderRadius: 14, border: '2px solid rgba(34,197,94,0.3)', marginBottom: 32 }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#22c55e' }}>⏳ Will the Money Last Forever?</h3>
        
        <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.8, marginBottom: 16 }}>
          <strong style={{ color: '#e6e9ef', fontSize: 14 }}>Yes, if you follow the 4% rule.</strong> Here's how the math works:
        </div>

        <div style={{ display: 'grid', gap: 14 }}>
          <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
              <strong style={{ color: '#22c55e' }}>📊 The Balance:</strong><br />
              • You withdraw <strong>{inputs.safeWithdrawalRate}%</strong> per year = ₹{Math.round(fireNumber * inputs.safeWithdrawalRate / 100).toLocaleString()}/year<br />
              • Your corpus earns <strong>{inputs.withdrawalReturn}%</strong> per year = ₹{Math.round(fireNumber * inputs.withdrawalReturn / 100).toLocaleString()}/year (post-retirement conservative portfolio)<br />
              • Net gain after withdrawal: ₹{Math.round(fireNumber * (inputs.withdrawalReturn - inputs.safeWithdrawalRate) / 100).toLocaleString()}/year
            </div>
          </div>

          <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
              <strong style={{ color: '#22c55e' }}>🔄 Compound Growth:</strong><br />
              Even after withdrawing for expenses, your corpus continues growing. At {inputs.withdrawalReturn}% returns and {inputs.safeWithdrawalRate}% withdrawal:
              <br /><br />
              <strong>Year 1:</strong> ₹{fireNumber.toLocaleString()} → Earn ₹{Math.round(fireNumber * inputs.withdrawalReturn / 100).toLocaleString()} → Withdraw ₹{Math.round(fireNumber * inputs.safeWithdrawalRate / 100).toLocaleString()} → Left with ₹{Math.round(fireNumber * (1 + (inputs.withdrawalReturn - inputs.safeWithdrawalRate) / 100)).toLocaleString()}<br />
              <strong>Year 10:</strong> Corpus grows to ~₹{Math.round(fireNumber * Math.pow(1 + (inputs.withdrawalReturn - inputs.safeWithdrawalRate - inputs.inflationRate) / 100, 10)).toLocaleString()} (after inflation)<br />
              <strong>Year 30:</strong> Still have ~₹{Math.round(fireNumber * Math.pow(1 + (inputs.withdrawalReturn - inputs.safeWithdrawalRate - inputs.inflationRate) / 100, 30)).toLocaleString()} (after inflation)
            </div>
          </div>

          <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(34,197,94,0.2)' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
              <strong style={{ color: '#22c55e' }}>✅ Historical Safety:</strong><br />
              The 4% rule has survived every 30-year retirement period in U.S. stock market history since 1926 - including the Great Depression, 2008 crash, and COVID-19.
              <br /><br />
              At {inputs.safeWithdrawalRate}% withdrawal:
              {inputs.safeWithdrawalRate <= 4 && (
                <span style={{ color: '#22c55e' }}><br />✓ <strong>Very safe</strong> - Conservative approach with high success probability</span>
              )}
              {inputs.safeWithdrawalRate > 4 && inputs.safeWithdrawalRate <= 5 && (
                <span style={{ color: '#f59e0b' }}><br />⚠️ <strong>Moderate risk</strong> - May need to adjust spending in market downturns</span>
              )}
              {inputs.safeWithdrawalRate > 5 && (
                <span style={{ color: '#ef4444' }}><br />⚠️ <strong>High risk</strong> - Consider reducing withdrawal rate to 4% for safety</span>
              )}
            </div>
          </div>

          <div style={{ padding: 14, background: 'rgba(255,255,255,0.03)', borderRadius: 10, border: '1px solid rgba(59,130,246,0.2)' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.7 }}>
              <strong style={{ color: '#3b82f6' }}>🎯 Your Situation:</strong><br />
              With ₹{fireNumber.toLocaleString()} at FIRE, you can withdraw ₹{Math.round(monthlyFIREIncome).toLocaleString()}/month forever.
              <br /><br />
              {currentSavings >= fireNumber ? (
                <span style={{ color: '#22c55e' }}>✅ You're already FIRE! Your money will last indefinitely at the safe withdrawal rate.</span>
              ) : (
                <span>In <strong>{typeof yearsToFIRE === 'number' ? yearsToFIRE : '?'} years</strong>, you'll have this corpus and can retire with confidence knowing your money will never run out.</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Additional Insights */}
      <div style={{ background: 'linear-gradient(135deg, #0a1018 0%, #0f1724 100%)', padding: 24, borderRadius: 14, border: '2px solid #1e293b' }}>
        <h3 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16, color: '#e6e9ef' }}>💡 Key Insights & Assumptions Check</h3>
        
        <div style={{ display: 'grid', gap: 12 }}>
          {/* Critical Edge Cases */}
          {inputs.annualExpenses <= 0 && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.15)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#ef4444' }}>❌ Invalid Input:</strong> Annual expenses must be greater than 0. Enter your expected yearly spending in retirement.
              </div>
            </div>
          )}

          {inputs.monthlyContribution < 0 && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.15)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#ef4444' }}>❌ Invalid Input:</strong> Monthly contribution cannot be negative. Enter 0 if not contributing.
              </div>
            </div>
          )}

          {inputs.withdrawalReturn < inputs.safeWithdrawalRate && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.15)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#ef4444' }}>🚨 CRITICAL: Corpus Will Deplete!</strong> Post-retirement return ({inputs.withdrawalReturn}%) is LESS than withdrawal rate ({inputs.safeWithdrawalRate}%). Your money will run out! Either increase returns or reduce withdrawal rate.
              </div>
            </div>
          )}

          {inputs.accumulationReturn <= inputs.inflationRate && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.15)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#ef4444' }}>🚨 CRITICAL: Negative Real Returns!</strong> Accumulation return ({inputs.accumulationReturn}%) ≤ inflation ({inputs.inflationRate}%). You're losing purchasing power. Increase investment returns or you'll never reach FIRE.
              </div>
            </div>
          )}

          {inputs.withdrawalReturn <= inputs.inflationRate && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.15)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#ef4444' }}>🚨 CRITICAL: Post-Retirement Negative Real Returns!</strong> Withdrawal return ({inputs.withdrawalReturn}%) ≤ inflation ({inputs.inflationRate}%). In retirement, inflation will erode your corpus even without withdrawals.
              </div>
            </div>
          )}

          {currentSavings === 0 && inputs.monthlyContribution === 0 && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.15)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#ef4444' }}>❌ Cannot Calculate:</strong> Both current savings and monthly contribution are 0. You need to either start saving monthly or have existing savings to reach FIRE.
              </div>
            </div>
          )}

          {/* Assumptions Validation */}
          {inputs.accumulationReturn > 13 && (
            <div style={{ padding: 12, background: 'rgba(245,158,11,0.12)', borderRadius: 8, borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 13, color: '#fcd34d', lineHeight: 1.6 }}>
                <strong style={{ color: '#f59e0b' }}>⚠️ Accumulation Return Too High:</strong> {inputs.accumulationReturn}% is very aggressive. Historical Indian equity (Nifty 50 TRI) averages ~12-13%. Consider using 11% for realistic planning.
              </div>
            </div>
          )}

          {inputs.withdrawalReturn > 10 && (
            <div style={{ padding: 12, background: 'rgba(245,158,11,0.12)', borderRadius: 8, borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 13, color: '#fcd34d', lineHeight: 1.6 }}>
                <strong style={{ color: '#f59e0b' }}>⚠️ Post-Retirement Return Too High:</strong> {inputs.withdrawalReturn}% in retirement is aggressive. Most use 60/40 balanced portfolios earning 7-8%. High equity increases sequence-of-returns risk.
              </div>
            </div>
          )}

          {inputs.accumulationReturn < inputs.inflationRate + 3 && inputs.accumulationReturn > inputs.inflationRate && (
            <div style={{ padding: 12, background: 'rgba(245,158,11,0.12)', borderRadius: 8, borderLeft: '4px solid #f59e0b' }}>
              <div style={{ fontSize: 13, color: '#fcd34d', lineHeight: 1.6 }}>
                <strong style={{ color: '#f59e0b' }}>⚠️ Low Real Returns:</strong> Accumulation ({inputs.accumulationReturn}%) - inflation ({inputs.inflationRate}%) = {(inputs.accumulationReturn - inputs.inflationRate).toFixed(1)}% real. Aim for 5-6% real returns.
              </div>
            </div>
          )}

          {inputs.safeWithdrawalRate > 5 && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.12)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#ef4444' }}>⚠️ Withdrawal Rate Too High:</strong> {inputs.safeWithdrawalRate}% withdrawal rate significantly increases risk of running out of money. 4% rule is considered safe for 30+ year retirements. Consider reducing to 4%.
              </div>
            </div>
          )}

          {(() => {
            const monthlySavingsRate = (inputs.monthlyContribution / ((inputs.annualExpenses / 12) + inputs.monthlyContribution)) * 100
            return monthlySavingsRate > 0 && monthlySavingsRate < 15 ? (
              <div style={{ padding: 12, background: 'rgba(245,158,11,0.12)', borderRadius: 8, borderLeft: '4px solid #f59e0b' }}>
                <div style={{ fontSize: 13, color: '#fcd34d', lineHeight: 1.6 }}>
                  <strong style={{ color: '#f59e0b' }}>⚠️ Low Savings Rate:</strong> You're saving only {monthlySavingsRate.toFixed(0)}% of your income. Financial experts recommend saving at least 20-30% to reach FIRE within a reasonable timeframe. Try to increase monthly contributions.
                </div>
              </div>
            ) : null
          })()}

          {inputs.targetAge - inputs.currentAge < 5 && fireProgress < 100 && (
            <div style={{ padding: 12, background: 'rgba(239,68,68,0.12)', borderRadius: 8, borderLeft: '4px solid #ef4444' }}>
              <div style={{ fontSize: 13, color: '#fca5a5', lineHeight: 1.6 }}>
                <strong style={{ color: '#ef4444' }}>⚠️ Unrealistic Timeline:</strong> Only {inputs.targetAge - inputs.currentAge} years until target age, but you're only {fireProgress.toFixed(0)}% to FIRE. Either increase contributions significantly or push target age further.
              </div>
            </div>
          )}

          {/* Positive Reinforcements */}
          {(() => {
            const monthlySavingsRate = (inputs.monthlyContribution / ((inputs.annualExpenses / 12) + inputs.monthlyContribution)) * 100
            return monthlySavingsRate >= 50 ? (
              <div style={{ padding: 12, background: 'rgba(34,197,94,0.12)', borderRadius: 8, borderLeft: '4px solid #22c55e' }}>
                <div style={{ fontSize: 13, color: '#86efac', lineHeight: 1.6 }}>
                  <strong style={{ color: '#22c55e' }}>🔥 Excellent Savings Rate:</strong> {monthlySavingsRate.toFixed(0)}% savings rate! At this pace, you'll reach FIRE much faster than average. Keep it up!
                </div>
              </div>
            ) : monthlySavingsRate >= 30 ? (
              <div style={{ padding: 12, background: 'rgba(34,197,94,0.12)', borderRadius: 8, borderLeft: '4px solid #22c55e' }}>
                <div style={{ fontSize: 13, color: '#86efac', lineHeight: 1.6 }}>
                  <strong style={{ color: '#22c55e' }}>👍 Good Savings Rate:</strong> {monthlySavingsRate.toFixed(0)}% is a sustainable pace. You're making solid progress toward FIRE.
                </div>
              </div>
            ) : null
          })()}

          {/* Standard Insights */}
          <div style={{ padding: 12, background: 'rgba(59,130,246,0.08)', borderRadius: 8, borderLeft: '4px solid #3b82f6' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong style={{ color: '#3b82f6' }}>4% Rule Foundation:</strong> Withdraw 4% annually from FIRE corpus. Based on Trinity Study analyzing US stock market 1926-2009. Historically safe for 30+ year retirements with 95%+ success rate.
            </div>
          </div>

          <div style={{ padding: 12, background: 'rgba(34,197,94,0.08)', borderRadius: 8, borderLeft: '4px solid #22c55e' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong style={{ color: '#22c55e' }}>Your Current Progress:</strong> Saving ₹{inputs.monthlyContribution.toLocaleString()}/month = ₹{(inputs.monthlyContribution * 12).toLocaleString()}/year towards FIRE number of ₹{fireNumber.toLocaleString()}
            </div>
          </div>

          <div style={{ padding: 12, background: 'rgba(245,158,11,0.08)', borderRadius: 8, borderLeft: '4px solid #f59e0b' }}>
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.6 }}>
              <strong style={{ color: '#f59e0b' }}>Target Achievement:</strong>{' '}
              {(() => {
                if (gap <= 0) return '✅ Already achieved! You can retire now.'
                if (yearsUntilTarget <= 0) return '⚠️ Target age is now/past. Update target age for accurate projections.'
                const neededPerMonth = calculateNeededContribution(fireNumber, currentSavings, yearsUntilTarget, inputs.accumulationReturn)
                if (neededPerMonth <= inputs.monthlyContribution + 1) return `✅ On track to hit FIRE by age ${inputs.targetAge}!`
                return `To reach FIRE by age ${inputs.targetAge}, need ₹${Math.round(neededPerMonth).toLocaleString()}/month (₹${Math.round(neededPerMonth - inputs.monthlyContribution).toLocaleString()}/month more)`
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
