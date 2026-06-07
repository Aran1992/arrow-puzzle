#!/bin/bash
# Setup GitHub auth and create repo
set -e

TOKEN="$1"
if [ -z "$TOKEN" ]; then
  echo "Usage: setup.sh <token>"
  exit 1
fi

# Configure git credential helper
git config --global credential.helper store
echo "https://aran1992:${TOKEN}@github.com" > ~/.git-credentials

# Get username
GH_USER=$(curl -sf -H "Authorization: token ${TOKEN}" https://api.github.com/user | python3 -c "import sys,json; print(json.load(sys.stdin)['login'])")
echo "GitHub user: $GH_USER"

# Create repo
RESULT=$(curl -sf -X POST \
  -H "Authorization: token ${TOKEN}" \
  https://api.github.com/user/repos \
  -d '{
    "name": "arrow-puzzle",
    "description": "Arrow Puzzle Game - PixiJS grid puzzle prototype",
    "private": false,
    "auto_init": false
  }' 2>&1)

REPO_URL=$(echo "$RESULT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('html_url',''))" 2>/dev/null)
if [ -n "$REPO_URL" ]; then
  echo "Repo created: $REPO_URL"
else
  # Check if it already exists
  EXISTS=$(curl -sf -H "Authorization: token ${TOKEN}" "https://api.github.com/repos/${GH_USER}/arrow-puzzle" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('html_url',''))" 2>/dev/null)
  if [ -n "$EXISTS" ]; then
    echo "Repo already exists: $EXISTS"
  else
    echo "Failed to create repo:"
    echo "$RESULT"
    exit 1
  fi
fi

echo "GH_USER=$GH_USER"
