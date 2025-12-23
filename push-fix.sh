#!/bin/bash
read -sp "Enter your GitHub token again: " TOKEN
echo ""
git push "https://$TOKEN@github.com/Asvanthc/financial-portfolio.git" main
