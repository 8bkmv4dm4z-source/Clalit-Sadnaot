:: 🧠 High-Performance Search & Index Optimization — Local Setup
:: ------------------------------------------------------------
:: This script:
:: 1. Ensures all changes are committed.
:: 2. Merges your current branch into main (locally).
:: 3. Creates and switches to feature/search-index-optimization.
:: No GitHub push or pull commands included.

@echo off
echo 🔍 Checking current branch...
for /f "tokens=*" %%b in ('git rev-parse --abbrev-ref HEAD') do set current_branch=%%b
echo ✅ You are on branch: %current_branch%

echo.
echo 💾 Ensuring all work is saved...
git add -A
git commit -m "Auto-save before creating feature/search-index-optimization branch" || echo (nothing to commit)

echo.
echo 🧭 Switching to main branch...
git checkout main

echo.
echo 🔗 Merging your previous branch (%current_branch%) into main...
git merge %current_branch%

echo.
echo 🌿 Creating new branch: feature/search-index-optimization
git checkout -b feature/search-index-optimization

echo.
echo ✅ Done! You are now on feature/search-index-optimization (local only, no remote push)
git branch
git status
pause
