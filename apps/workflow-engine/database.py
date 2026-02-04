"""
Database Schema and Connection for Workflow Engine
Creates all tables needed for visual workflow automation
"""

import os
import asyncpg
from typing import Optional

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://aiops:aiops_password@localhost:5432/peekaping")

# Global connection pool
db_pool: Optional[asyncpg.Pool] = None


async def init_db():
    """Initialize database connection and create tables"""
    global db_pool
    
    try:
        db_pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        
        async with db_pool.acquire() as conn:
            # ============================================================
            # WORKFLOWS TABLE - The canvas/workflow definition
            # ============================================================
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS workflows (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    trigger_type VARCHAR(50) NOT NULL,
                    trigger_config JSONB DEFAULT '{}',
                    is_active BOOLEAN DEFAULT false,
                    created_at TIMESTAMPTZ DEFAULT NOW(),
                    updated_at TIMESTAMPTZ DEFAULT NOW(),
                    created_by VARCHAR(100),
                    version INT DEFAULT 1
                )
            ''')
            print("✅ Created workflows table")
            
            # ============================================================
            # WORKFLOW_NODES TABLE - Visual blocks on the canvas
            # ============================================================
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS workflow_nodes (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
                    node_type VARCHAR(50) NOT NULL,
                    node_subtype VARCHAR(50),
                    label VARCHAR(100),
                    position_x INT DEFAULT 0,
                    position_y INT DEFAULT 0,
                    config JSONB DEFAULT '{}',
                    is_start_node BOOLEAN DEFAULT false,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            ''')
            print("✅ Created workflow_nodes table")
            
            # ============================================================
            # WORKFLOW_EDGES TABLE - Connections between nodes
            # ============================================================
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS workflow_edges (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
                    source_node_id UUID REFERENCES workflow_nodes(id) ON DELETE CASCADE,
                    target_node_id UUID REFERENCES workflow_nodes(id) ON DELETE CASCADE,
                    source_handle VARCHAR(50) DEFAULT 'default',
                    condition JSONB,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            ''')
            print("✅ Created workflow_edges table")
            
            # ============================================================
            # WORKFLOW_EXECUTIONS TABLE - Runtime execution tracking
            # ============================================================
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS workflow_executions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
                    workflow_name VARCHAR(100),
                    trigger_data JSONB DEFAULT '{}',
                    status VARCHAR(20) DEFAULT 'running',
                    started_at TIMESTAMPTZ DEFAULT NOW(),
                    completed_at TIMESTAMPTZ,
                    current_node_id UUID,
                    execution_log JSONB DEFAULT '[]',
                    error_message TEXT
                )
            ''')
            print("✅ Created workflow_executions table")
            
            # ============================================================
            # NODE_EXECUTIONS TABLE - Individual node execution results
            # ============================================================
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS node_executions (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
                    node_id UUID,
                    node_type VARCHAR(50),
                    node_label VARCHAR(100),
                    status VARCHAR(20) DEFAULT 'pending',
                    started_at TIMESTAMPTZ DEFAULT NOW(),
                    completed_at TIMESTAMPTZ,
                    input_data JSONB DEFAULT '{}',
                    output_data JSONB DEFAULT '{}',
                    error_message TEXT
                )
            ''')
            print("✅ Created node_executions table")
            
            # ============================================================
            # WORKFLOW_TEMPLATES TABLE - Pre-built workflow templates
            # ============================================================
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS workflow_templates (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    name VARCHAR(100) NOT NULL,
                    description TEXT,
                    category VARCHAR(50),
                    template_data JSONB NOT NULL,
                    is_system BOOLEAN DEFAULT false,
                    created_at TIMESTAMPTZ DEFAULT NOW()
                )
            ''')
            print("✅ Created workflow_templates table")
            
            # ============================================================
            # APPROVAL_REQUESTS TABLE - Human approval gate tracking
            # ============================================================
            await conn.execute('''
                CREATE TABLE IF NOT EXISTS approval_requests (
                    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
                    execution_id UUID REFERENCES workflow_executions(id) ON DELETE CASCADE,
                    workflow_id UUID REFERENCES workflows(id) ON DELETE SET NULL,
                    workflow_name VARCHAR(100),
                    node_id UUID,
                    node_label VARCHAR(100),
                    requested_at TIMESTAMPTZ DEFAULT NOW(),
                    expires_at TIMESTAMPTZ,
                    approvers JSONB DEFAULT '[]',
                    status VARCHAR(20) DEFAULT 'pending',
                    description TEXT,
                    context JSONB DEFAULT '{}',
                    resolved_at TIMESTAMPTZ,
                    resolved_by VARCHAR(100),
                    comment TEXT
                )
            ''')
            print("✅ Created approval_requests table")
            
            # Create indexes for performance
            await conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_workflow_nodes_workflow 
                ON workflow_nodes(workflow_id)
            ''')
            await conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_workflow_edges_workflow 
                ON workflow_edges(workflow_id)
            ''')
            await conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_workflow_executions_status 
                ON workflow_executions(status)
            ''')
            await conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_node_executions_execution 
                ON node_executions(execution_id)
            ''')
            await conn.execute('''
                CREATE INDEX IF NOT EXISTS idx_approval_requests_status 
                ON approval_requests(status)
            ''')
            print("✅ Created database indexes")
            
        print("🚀 Workflow Engine database initialized successfully")
        return True
        
    except Exception as e:
        print(f"❌ Database initialization failed: {e}")
        return False


async def close_db():
    """Close database connection pool"""
    global db_pool
    if db_pool:
        await db_pool.close()
        print("Database connection closed")


async def get_db():
    """Get database connection from pool"""
    if not db_pool:
        await init_db()
    return db_pool
