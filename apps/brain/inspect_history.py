import asyncio
import asyncpg

DATABASE_URL = "postgres://aiops:aiops_password@localhost:5432/peekaping"

async def inspect_history():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        print("🔍 Inspecting latest 5 rows of metrics_history...")
        rows = await conn.fetch("SELECT * FROM metrics_history ORDER BY id DESC LIMIT 5")
        for r in rows:
            print(f"| {r['id']} | {r['timestamp']} | {r['category']} | {r['metric_name']} | {r['value']} | {r['threshold']} | {r['severity']} | {r['metadata']} |")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(inspect_history())
