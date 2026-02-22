#!/bin/bash
set -e

# ==============================================================================
# 🚀 AIOps Platform - Unified Startup Script
# ==============================================================================
# Starts all components:
# 1. Infrastructure (Docker: Postgres, Netdata)
# 2. Brain Service (FastAPI :8000)
# 3. Workflow Engine (FastAPI :8001)
# 4. Workflow UI (React/Vite :5173)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m'

echo -e "${BLUE}🚀 Starting AIOps Command Center...${NC}"

# Cleanup function to kill all background processes on exit
cleanup() {
    echo -e "\n${RED}🛑 Shutting down all services...${NC}"
    kill $(jobs -p) 2>/dev/null || true
    echo -e "${GREEN}✅ Shutdown complete${NC}"
    exit
}

trap cleanup SIGINT SIGTERM

# ==============================================================================
# 1. INFRASTRUCTURE (Docker Compose)
# ==============================================================================
echo -e "\n${BLUE}📦 Checking Infrastructure...${NC}"
cd infra/local
if ! docker info >/dev/null 2>&1; then
    echo -e "${RED}❌ Docker is not running. Please start Docker Desktop.${NC}"
    exit 1
fi
docker compose up -d
cd ../..
echo -e "${GREEN}✅ Infrastructure ready${NC}"

# ==============================================================================
# 2. BRAIN SERVICE (Port 8000)
# ==============================================================================
echo -e "\n${BLUE}🧠 Starting Brain Service (Port 8000)...${NC}"
cd apps/brain
if [ ! -d ".venv" ]; then
    echo "Creating venv for Brain..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi
# Load env vars
export $(cat ../../.env | xargs) 2>/dev/null || true
python3 main.py > ../../brain.log 2>&1 &
BRAIN_PID=$!
echo -e "${GREEN}✅ Brain API running (PID: $BRAIN_PID)${NC}"
cd ../..

# ==============================================================================
# 3. WORKFLOW ENGINE (Port 8001)
# ==============================================================================
echo -e "\n${BLUE}⚙️ Starting Workflow Engine (Port 8001)...${NC}"
cd apps/workflow-engine
if [ ! -d ".venv" ]; then
    echo "Creating venv for Workflow Engine..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi
# Load env vars
export $(cat ../../.env | xargs) 2>/dev/null || true
python3 main.py > ../../workflow-engine.log 2>&1 &
ENGINE_PID=$!
echo -e "${GREEN}✅ Workflow Engine running (PID: $ENGINE_PID)${NC}"
cd ../..

# ==============================================================================
# 4. FRONTEND UI (Port 5173)
# ==============================================================================
echo -e "\n${BLUE}🖥️ Starting Frontend UI (Port 5173)...${NC}"
cd apps/workflow-ui
if [ ! -d "node_modules" ]; then
    echo "Installing UI dependencies..."
    npm install
fi
npm run dev -- --host 0.0.0.0 > ../../workflow-ui.log 2>&1 &
UI_PID=$!
echo -e "${GREEN}✅ Frontend UI running (PID: $UI_PID)${NC}"
cd ../..

# ==============================================================================
# SUMMARY & LOGS
# ==============================================================================
echo -e "\n${GREEN}✨ All services started successfully!${NC}"
echo -e "   ├─ 🖥️ Platform UI:      http://localhost:5173"
echo -e "   ├─ 🧠 Brain API:        http://localhost:8000"
echo -e "   └─ ⚙️ Workflow Engine:  http://localhost:8001"
echo -e "\n${BLUE}📝 Logs (written to project root):${NC}"
echo -e "   ├─ tail -f brain.log"
echo -e "   ├─ tail -f workflow-engine.log"
echo -e "   └─ tail -f workflow-ui.log"
echo -e "\n${RED}Press Ctrl+C to stop all services and perform cleanup.${NC}"

# Keep script running to maintain background processes and catch SIGINT
wait
