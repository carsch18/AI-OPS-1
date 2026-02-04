#!/bin/bash
set -e

# AIOps System Start Script
# Starts:
# 1. Infrastructure (Netdata, Postgres, EDA) via Docker Compose
# 2. Brain (FastAPI Backend)
# 3. Web (Bun Frontend)

echo "🚀 Starting AIOps Command Center..."

# 1. Start Infrastructure
echo "📦 Starting Infrastructure (Netdata, Postgres, Ansible)..."
cd infra/local
docker compose up -d
cd ../..
echo "✅ Infrastructure started"

# 2. Start Brain in Background
echo "🧠 Starting Brain Service..."
cd apps/brain
# Check if venv exists
if [ ! -d ".venv" ]; then
    echo "Creating virtual environment..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

# Run in background
python3 main.py > brain.log 2>&1 &
BRAIN_PID=$!
echo "✅ Brain started (PID: $BRAIN_PID) - Logs: apps/brain/brain.log"
cd ../..

# 3. Start Frontend
echo "🖥️ Starting Web Dashboard..."
cd apps/web
# Check if node_modules exists
if [ ! -d "node_modules" ]; then
    bun install
fi
bun run dev

# Cleanup function
cleanup() {
    echo "🛑 Shutting down..."
    kill $BRAIN_PID
    exit
}

trap cleanup SIGINT
