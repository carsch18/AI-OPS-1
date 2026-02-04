import asyncio
import asyncpg

DATABASE_URL = "postgres://aiops:aiops_password@localhost:5432/peekaping"

async def update_thresholds():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        print("🔄 Updating alert thresholds in DB...")
        updates = [
            ('uptime_percentage', 95.0),
            ('page_load_time_ms', 2000),
            ('query_latency_ms', 1000),
            ('cpu_percent', 70),
            ('memory_percent', 70),
            ('disk_percent', 80)
        ]
        
        for metric, thresh in updates:
            await conn.execute("UPDATE alert_rules SET threshold = $1 WHERE metric_name = $2", float(thresh), metric)
            print(f"✅ Updated {metric} to {thresh}")
            
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(update_thresholds())
