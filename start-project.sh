#!/bin/bash
set -e

# 🚀 AIOps Platform - Unified Startup Script
#
# Starts all components:
# 1. Infrastructure (Docker: Postgres, Netdata, etc.)
# 2. Brain Service (Python FastAPI)
# 3. Workflow Engine (Python)
# 4. Web Command Center (Bun/Next.js)
# 5. Workflow Builder UI (Vite/React)

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${BLUE}🚀 Starting AIOps Platform...${NC}"

# Function to kill all background processes on exit
cleanup() {
    echo -e "\n${RED}🛑 Shutting down all services...${NC}"
    kill $(jobs -p) 2>/dev/null
    echo -e "${GREEN}✅ Shutdown complete${NC}"
    exit
}

trap cleanup SIGINT SIGTERM

# ==============================================================================
# 1. INFRASTRUCTURE
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
echo -e "\n${BLUE}🧠 Starting Brain Service...${NC}"
cd apps/brain
if [ ! -d ".venv" ]; then
    echo "Creating venv for Brain..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi
python3 main.py > ../../brain.log 2>&1 &
BRAIN_PID=$!
echo -e "${GREEN}✅ Brain running (PID: $BRAIN_PID)${NC}"
cd ../..

# ==============================================================================
# 3. WORKFLOW ENGINE (Port 8001 - Assuming, checking logs)
# ==============================================================================
echo -e "\n${BLUE}⚙️ Starting Workflow Engine...${NC}"
cd apps/workflow-engine
if [ ! -d ".venv" ]; then
    echo "Creating venv for Workflow Engine..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi
python3 main.py > ../../workflow-engine.log 2>&1 &
ENGINE_PID=$!
echo -e "${GREEN}✅ Workflow Engine running (PID: $ENGINE_PID)${NC}"
cd ../..

# ==============================================================================
# 4. WEB COMMAND CENTER (Port 3001)
# ==============================================================================
echo -e "\n${BLUE}🖥️ Starting Command Center...${NC}"
cd apps/web
if [ ! -d "node_modules" ]; then
    echo "Installing Web dependencies..."
    bun install
fi
bun run dev > ../../web.log 2>&1 &
WEB_PID=$!
echo -e "${GREEN}✅ Command Center running (PID: $WEB_PID) -> http://localhost:3001${NC}"
cd ../..

# ==============================================================================
# 5. WORKFLOW BUILDER (Port 5173)
# ==============================================================================
echo -e "\n${BLUE}🎨 Starting Workflow Builder...${NC}"
cd apps/workflow-ui
if [ ! -d "node_modules" ]; then
    echo "Installing UI dependencies..."
    npm install
fi
npm run dev > ../../workflow-ui.log 2>&1 &
UI_PID=$!
echo -e "${GREEN}✅ Workflow Builder running (PID: $UI_PID) -> http://localhost:5173${NC}"
cd ../..

# ==============================================================================
# SUMMARY
# ==============================================================================
echo -e "\n${GREEN}✨ All services started!${NC}"
echo -e "   ├─ 🧠 Brain API:        http://localhost:8000"
echo -e "   ├─ ⚙️ Workflow Engine:  http://localhost:8001"
echo -e "   ├─ 🖥️ Command Center:   http://localhost:3001"
echo -e "   └─ 🎨 Workflow Builder: http://localhost:5173"
echo -e "\n${BLUE}📝 Logs:${NC}"
echo -e "   ├─ brain.log"
echo -e "   ├─ workflow-engine.log"
echo -e "   ├─ web.log"
echo -e "   └─ workflow-ui.log"
echo -e "\nPress Ctrl+C to stop all services."

# Keep script running to maintain background processes
wait
