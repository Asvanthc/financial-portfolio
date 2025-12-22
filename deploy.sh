#!/bin/bash
set -e

echo "🚀 Financial Portfolio Deployment Script"
echo "=========================================="
echo ""

# Check if git remote exists
if git remote | grep -q "origin"; then
    echo "✓ Git remote 'origin' already configured"
else
    echo "Adding GitHub remote..."
    read -p "Enter your GitHub username: " github_user
    git remote add origin "https://github.com/${github_user}/financial-portfolio.git"
    echo "✓ Remote added: https://github.com/${github_user}/financial-portfolio.git"
fi

echo ""
echo "Pushing to GitHub..."
git branch -M main
git push -u origin main

echo ""
echo "✅ Code pushed to GitHub!"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📦 NEXT STEPS - Deploy to Render (Free Hosting)"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "1. Go to: https://dashboard.render.com/"
echo "2. Click 'New +' → 'Web Service'"
echo "3. Connect your GitHub account if needed"
echo "4. Select your 'financial-portfolio' repository"
echo "5. Render will auto-detect the settings from render.yaml:"
echo "   - Build Command: npm install && npm run build"
echo "   - Start Command: npm start"
echo "   - Environment: Node"
echo "6. Select 'Free' instance type"
echo "7. Click 'Create Web Service'"
echo ""
echo "⏱️  Your app will be live in 2-3 minutes!"
echo ""
echo "🌐 You'll get a URL like:"
echo "   https://financial-portfolio-xxxx.onrender.com"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
