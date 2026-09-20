#!/usr/bin/env bash
# Start the app locally on http://localhost:3001
set -euo pipefail

cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "Node.js and npm are required." >&2
  exit 1
fi

if [[ ! -d node_modules ]]; then
  echo "Installing dependencies..."
  npm install
fi

if [[ ! -f .env.local && -f .env.example ]]; then
  cp .env.example .env.local
  echo "Created .env.local from .env.example — fill in credentials for auth and database."
fi

npm run db:migrate

echo "Starting http://localhost:3001"
exec npm run dev
