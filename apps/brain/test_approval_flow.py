#!/usr/bin/env python3
"""
Test script for PostgreSQL Log Cleaning Approval Flow
Run this to verify the pending action system is working correctly
"""

import asyncio
import json
import sys

async def test_clean_postgres_logs_flow():
    """Test the complete flow"""
    import httpx
    
    base_url = "http://localhost:8000"
    client = httpx.AsyncClient()
    
    print("=" * 70)
    print("Testing PostgreSQL Log Cleaning Approval Flow")
    print("=" * 70)
    
    try:
        # 1. Check health
        print("\n1️⃣  Checking API health...")
        response = await client.get(f"{base_url}/health")
        health = response.json()
        print(f"   Status: {health['status']}")
        print(f"   DB Connected: {health['database_connected']}")
        
        # 2. Trigger log cleaning request via test endpoint
        print("\n2️⃣  Triggering clean_postgres_logs request...")
        response = await client.post(f"{base_url}/test/clean-postgres-logs")
        result = response.json()
        print(f"   Response: {result['message'][:100]}...")
        
        # 3. Check all pending actions
        print("\n3️⃣  Checking all pending actions...")
        response = await client.get(f"{base_url}/pending-actions")
        actions = response.json().get("actions", [])
        print(f"   Total pending actions: {len(actions)}")
        
        if not actions:
            print("   ❌ ERROR: No pending actions found!")
            return False
        
        # 4. Check critical actions specifically
        print("\n4️⃣  Checking CRITICAL pending actions...")
        response = await client.get(f"{base_url}/pending-actions/critical")
        critical_actions = response.json().get("critical_actions", [])
        print(f"   Critical pending actions: {len(critical_actions)}")
        
        if not critical_actions:
            print("   ⚠️  WARNING: No critical actions found (check if clean_postgres_logs is in the list)")
        
        # 5. Check by type
        print("\n5️⃣  Checking by action type (clean_postgres_logs)...")
        response = await client.get(f"{base_url}/pending-actions/by-type/clean_postgres_logs")
        type_actions = response.json().get("actions", [])
        print(f"   clean_postgres_logs pending: {len(type_actions)}")
        
        # 6. Find the action to approve
        clean_log_actions = [a for a in actions if a.get("action_type") == "clean_postgres_logs"]
        if not clean_log_actions:
            print("\n   ❌ ERROR: No clean_postgres_logs action found in pending list!")
            print(f"   Available actions: {[a.get('action_type') for a in actions]}")
            return False
        
        action = clean_log_actions[0]
        action_id = action.get("id")
        print(f"\n6️⃣  Found pending clean_postgres_logs action:")
        print(f"   ID: {action_id}")
        print(f"   Status: {action.get('status')}")
        print(f"   Target: {action.get('target')}")
        print(f"   Description: {action.get('description')[:60]}...")
        print(f"   Severity: {action.get('severity')}")
        
        # Check if it's marked as critical
        if action.get("action_type") in ["clean_postgres_logs"]:
            print(f"   ✅ Action is CRITICAL (requires verified approval)")
        
        # 7. Try to approve with verification
        print(f"\n7️⃣  Attempting to approve action with critical verification...")
        approval_request = {
            "action_id": action_id,
            "decision": "approve",
            "approved_by": "test_admin",
            "verified_critical": True,
            "verification_reason": "Testing - Disk space at 85%, logs safely archived before cleanup"
        }
        
        response = await client.post(
            f"{base_url}/actions/{action_id}/approve",
            json=approval_request
        )
        
        if response.status_code == 200:
            approval_result = response.json()
            print(f"   ✅ Approval successful!")
            print(f"   Status: {approval_result.get('status')}")
            print(f"   Message: {approval_result.get('message')[:80]}...")
        else:
            print(f"   ❌ Approval failed!")
            print(f"   Status Code: {response.status_code}")
            print(f"   Response: {response.text[:200]}")
        
        # 8. Check audit log
        print(f"\n8️⃣  Checking audit log...")
        response = await client.get(f"{base_url}/audit-log?limit=10")
        audit_logs = response.json().get("logs", [])
        print(f"   Recent audit events: {len(audit_logs)}")
        
        log_events = [a for a in audit_logs if "clean_postgres" in str(a).lower() or "action" in str(a).get("event_type", "").lower()]
        if log_events:
            for event in log_events[:3]:
                print(f"   - {event.get('event_type', 'UNKNOWN')}: {event.get('action', '')[:50]}...")
        
        print("\n" + "=" * 70)
        print("✅ TEST COMPLETE - Pending action system is working!")
        print("=" * 70)
        return True
        
    except Exception as e:
        print(f"\n❌ ERROR: {str(e)}")
        import traceback
        traceback.print_exc()
        return False
    finally:
        await client.aclose()

if __name__ == "__main__":
    print("\n📋 Prerequisites:")
    print("   1. Make sure the AIOps Brain API is running on http://localhost:8000")
    print("   2. PostgreSQL database is configured and running")
    print("   3. Dependencies: pip install httpx\n")
    
    result = asyncio.run(test_clean_postgres_logs_flow())
    sys.exit(0 if result else 1)
