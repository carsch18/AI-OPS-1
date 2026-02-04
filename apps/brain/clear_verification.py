import asyncio
import asyncpg

DATABASE_URL = "postgres://aiops:aiops_password@localhost:5432/peekaping"

async def clear_db():
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        print("🧹 Clearing database for clean verification...")
        await conn.execute("DELETE FROM resolved_alerts")
        await conn.execute("DELETE FROM active_alerts")
        await conn.execute("DELETE FROM incidents")
        print("✅ Database cleared.")
    finally:
        await conn.close()

if __name__ == "__main__":
    asyncio.run(clear_db())
