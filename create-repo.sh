#!/bin/bash
set -e

echo "🔐 GitHub Repository Creator"
echo "=============================="
echo ""
echo "We need your GitHub Personal Access Token to create the repo."
echo "Get one at: https://github.com/settings/tokens/new"
echo "Required scopes: 'repo' (Full control of private repositories)"
echo ""
read -sp "Enter your GitHub token: " GITHUB_TOKEN
echo ""
echo ""

GITHUB_USER="Asvanthc"
REPO_NAME="financial-portfolio"

echo "Creating repository: $GITHUB_USER/$REPO_NAME"

# Create the repository
RESPONSE=$(curl -s -w "\n%{http_code}" -X POST \
  -H "Authorization: token $GITHUB_TOKEN" \
  -H "Accept: application/vnd.github.v3+json" \
  https://api.github.com/user/repos \
  -d "{\"name\":\"$REPO_NAME\",\"description\":\"Financial Portfolio Management App with Advanced Analytics\",\"private\":false}")

HTTP_CODE=$(echo "$RESPONSE" | tail -n1)
BODY=$(echo "$RESPONSE" | head -n-1)

if [ "$HTTP_CODE" = "201" ]; then
    echo "✅ Repository created successfully!"
    REPO_URL=$(echo "$BODY" | grep -o '"html_url": *"[^"]*"' | head -1 | cut -d'"' -f4)
    echo "📦 Repository URL: $REPO_URL"
    echo ""
    
    # Add remote and push
    echo "Adding remote and pushing code..."
    git remote remove origin 2>/dev/null || true
    git remote add origin "https://github.com/$GITHUB_USER/$REPO_NAME.git"
    git branch -M main
    
    # Push with token authentication
    git push "https://$GITHUB_TOKEN@github.com/$GITHUB_USER/$REPO_NAME.git" main
    
    echo ""
    echo "✅ Code pushed to GitHub!"
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🚀 FINAL STEP: Deploy to Free Hosting"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo ""
    echo "Choose ONE of these (all free, no credit card):"
    echo ""
    echo "1️⃣  RENDER (Recommended)"
    echo "   • Go to: https://dashboard.render.com/"
    echo "   • New + → Web Service"
    echo "   • Connect: $REPO_URL"
    echo "   • Click 'Create Web Service' (all settings auto-detected)"
    echo ""
    echo "2️⃣  RAILWAY (Fastest)"
    echo "   • Go to: https://railway.app/"
    echo "   • New Project → Deploy from GitHub"
    echo "   • Select: $REPO_NAME"
    echo ""
    echo "3️⃣  CYCLIC (Simplest)"
    echo "   • Go to: https://app.cyclic.sh/"
    echo "   • Connect GitHub Repo → $REPO_NAME"
    echo ""
    echo "Your app will be LIVE in 2-3 minutes! 🎉"
    echo ""
else
    echo "❌ Failed to create repository"
    echo "HTTP Status: $HTTP_CODE"
    echo "Response: $BODY"
    echo ""
    echo "Common issues:"
    echo "• Token doesn't have 'repo' scope"
    echo "• Repository already exists"
    echo "• Token is invalid or expired"
    echo ""
    echo "Get a new token at: https://github.com/settings/tokens/new"
fi
