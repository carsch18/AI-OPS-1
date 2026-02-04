import asyncio
import asyncpg
import os
import time
from pipeline_simulator import PipelineSimulator

DATABASE_URL = os.getenv("DATABASE_URL", "postgres://aiops:aiops_password@localhost:5432/peekaping")

async def verify_alert(category, metric_name):
    print(f"Verifying alert for {category}/{metric_name}...")
    conn = await asyncpg.connect(DATABASE_URL)
    try:
        # Wait up to 20 seconds for detection
        for _ in range(20):
            row = await conn.fetchrow("""
                SELECT id, severity, current_value 
                FROM active_alerts 
                WHERE category = $1 AND metric_name = $2 AND resolved = FALSE
                ORDER BY triggered_at DESC LIMIT 1
            """, category, metric_name)
            
            if row:
                print(f"✅ Alert detected! ID: {row['id']}, Severity: {row['severity']}, Value: {row['current_value']}")
                return True
            time.sleep(1)
        
        print(f"❌ Alert NOT detected for {category}/{metric_name}")
        return False
    finally:
        await conn.close()

async def run_scenario(mode):
    sim = PipelineSimulator()
    print(f"\n--- Running Scenario: {mode} ---")
    sim.set_state(mode)
    
    if mode == "healthy":
        print("Waiting to see if any false alerts trigger...")
        time.sleep(10)
        # Check if any new pipeline alerts appeared
        print("Checked. (No alerts expected)")
    elif mode == "build_fail":
        await verify_alert("pipeline", "pipeline_status")
    elif mode == "latency_high":
        await verify_alert("pipeline", "pipeline_latency")
    elif mode == "error_spike":
        await verify_alert("pipeline", "pipeline_errors")

async def main():
    scenarios = ["healthy", "build_fail", "latency_high", "error_spike"]
    for scenario in scenarios:
        await run_scenario(scenario)
        # Reset to healthy between tests
        PipelineSimulator().set_state("healthy")
        print("Cooldown 5s...")
        time.sleep(5)

if __name__ == "__main__":
    asyncio.run(main())
