import asyncio
import asyncpg

DATABASE_URL = "postgres://aiops:aiops_password@localhost:5432/peekaping"

async def inspect_rules():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        print("🔍 Inspecting alert_rules in DB...")
        rows = await conn.fetch("SELECT metric_name, threshold, comparison FROM alert_rules")
        for r in rows:
            print(f"Metric: {r['metric_name']}, Threshold: {r['threshold']}, Comparison: {r['comparison']}")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(inspect_rules())
