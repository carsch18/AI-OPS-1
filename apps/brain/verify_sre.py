import asyncio
import os
import sys
import json
# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from incident_manager import incident_manager
from monitoring_service import metrics_collector

async def main():
    print("🚀 Starting SRE System Verification...")
    
    # 1. Initialize
    print("Initializing services...")
    await incident_manager.initialize()
    # Mocking DB pool for monitoring service by sharing the one from incident manager
    # or just initialize it too
    metrics_collector.db_pool = incident_manager.db_pool 
    
    # 2b. Verify Availability Metrics (Peekaping)
    print("\n🌍 collecting Availability Metrics from Peekaping...")
    avail = await metrics_collector.collect_availability_metrics()
    print("   Availability Metrics:", json.dumps(avail["metrics"], indent=2))

    # 2c. Verify Other Metrics
    print("\n📊 Collecting Performance Metrics (Peekaping 5xx check)...")
    perf = await metrics_collector.collect_performance_metrics()
    print("   Performance Metrics:", json.dumps(perf["metrics"], indent=2))
    
    print("\n💾 Collecting Database Metrics...")
    db = await metrics_collector.collect_database_metrics()
    print("   Database Metrics:", json.dumps(db["metrics"], indent=2))

    # 3. Simulate Monitoring Alert (Critical)
    print("\n🧪 Simulating Critical Security Alert...")
    
    # Manually trigger an alert to test the flow
    # This should print the email notification AND create an incident
    await metrics_collector._trigger_alert(
        category="security",
        metric_name="ddos_simulation_test",
        severity="critical",
        current_value=1500,
        threshold=1000,
        metadata={"source": "verify_script", "test": True}
    )
    
    # Allow some asyncio time for db ops
    await asyncio.sleep(1)
    
    # 3. Verify Incident Creation
    print("\n🔍 Verifying Incident Creation...")
    incidents = await incident_manager.list_incidents()
    
    # Filter for our test incident
    test_incident = None
    for inc in incidents:
        if "ddos_simulation_test" in inc['title'].lower() or "security" in inc['title'].lower():
            test_incident = inc
            break
            
    if test_incident:
        print(f"✅ Incident found: {test_incident['title']} (ID: {test_incident['id']})")
        print(f"   Status: {test_incident['status']}")
        print(f"   Severity: {test_incident['severity']}")
        
        # 4. Generate RCA
        print("\n📝 Generating RCA...")
        rca = await incident_manager.generate_rca(test_incident['id'])
        print("\n--- RCA PREVIEW ---")
        print(rca[:300] + "...")
        print("-------------------")
        
        print("\n✅ VERIFICATION SUCCESSFUL")
    else:
        print("❌ No matching incidents found! Integration failed.")
        print(f"Found {len(incidents)} total incidents.")

if __name__ == "__main__":
    asyncio.run(main())
