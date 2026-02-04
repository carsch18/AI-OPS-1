import asyncio
import asyncpg
import uuid
import json
from datetime import datetime

DATABASE_URL = "postgres://aiops:aiops_password@localhost:5432/peekaping"

async def trigger_manual_alerts():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        print("🚀 Triggering manual alerts for verification...")
        
        # 1. Manual Slow Query Alert
        await conn.execute("""
            INSERT INTO active_alerts (category, metric_name, severity, threshold, current_value, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, 'database', 'query_latency_ms', 'warning', 1000, 1500, json.dumps({"query": "SELECT * FROM large_table", "source": "verification_script"}))
        print("✅ Inserted: Slow Query Alert")
        
        # 2. Manual Page Load Alert
        await conn.execute("""
            INSERT INTO active_alerts (category, metric_name, severity, threshold, current_value, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, 'performance', 'page_load_time_ms', 'warning', 2000, 3500, json.dumps({"url": "/dashboard", "source": "verification_script"}))
        print("✅ Inserted: Long Page Load Alert")
        
        # 3. Manual High CPU Alert
        await conn.execute("""
            INSERT INTO active_alerts (category, metric_name, severity, threshold, current_value, metadata)
            VALUES ($1, $2, $3, $4, $5, $6)
        """, 'infrastructure', 'cpu_percent', 'critical', 70, 85, json.dumps({"core": "all", "source": "verification_script"}))
        print("✅ Inserted: High CPU Alert")
        
        print("\n🔔 Verification alerts triggered! Please check the dashboard at http://localhost:3001")
        
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(trigger_manual_alerts())
