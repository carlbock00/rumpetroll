#!/bin/bash

# Quick deploy script for Rumpetroll

echo "📦 Adding changes to git..."
git add .

echo "💬 Enter commit message (or press Enter for default):"
read commit_message

if [ -z "$commit_message" ]; then
  commit_message="Update game - $(date '+%Y-%m-%d %H:%M')"
fi

echo "📝 Committing: $commit_message"
git commit -m "$commit_message"

echo "🚀 Pushing to GitHub..."
git push origin main

echo "✅ Deployed! Your game will update at https://lifeformsio.onrender.com/ in 2-3 minutes."
