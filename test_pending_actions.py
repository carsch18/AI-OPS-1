#!/usr/bin/env python3
"""
Quick test script to verify pending actions flow
"""
import requests
import json
import time

BASE_URL = "http://localhost:8000"

def test_clean_logs():
    """Test asking the AI to clean logs"""
    print("\n🧪 Testing: Ask AI to clean logs")
    print("=" * 60)
    
    payload = {
        "message": "I need to clean the postgres logs from the database"
    }
    
    response = requests.post(f"{BASE_URL}/chat", json=payload)
    print(f"Status: {response.status_code}")
    
    data = response.json()
    print(f"\nAI Response:\n{data.get('response')}")
    print(f"\nTools Used: {data.get('tools_used')}")
    
    if data.get('pending_action'):
        print(f"\n✅ PENDING ACTION FOUND:")
        print(json.dumps(data.get('pending_action'), indent=2))
    else:
        print(f"\n❌ NO PENDING ACTION IN RESPONSE")
    
    return data.get('pending_action')

def test_get_pending_actions():
    """Test getting pending actions"""
    print("\n🧪 Testing: Get pending actions from endpoint")
    print("=" * 60)
    
    response = requests.get(f"{BASE_URL}/pending-actions")
    print(f"Status: {response.status_code}")
    
    data = response.json()
    actions = data.get('actions', [])
    
    print(f"Found {len(actions)} pending actions:")
    for action in actions:
        print(json.dumps(action, indent=2, default=str))
    
    return actions

if __name__ == "__main__":
    print("🚀 Starting Pending Actions Test")
    
    # Test 1: Ask AI to clean logs
    pending = test_clean_logs()
    
    # Wait a moment
    time.sleep(1)
    
    # Test 2: Check pending actions endpoint
    actions = test_get_pending_actions()
    
    print("\n" + "=" * 60)
    if pending:
        print("✅ Test PASSED - Pending action appeared in chat response")
    else:
        print("❌ Test FAILED - Pending action missing from chat response")
    
    if actions:
        print("✅ Pending actions visible in endpoint")
    else:
        print("❌ No pending actions in endpoint")
