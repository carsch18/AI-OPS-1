"""
Comprehensive Incident Response System Tests
Tests all 9 incident types with their respective playbooks
"""

import asyncio
import sys
from pathlib import Path

# Add parent directory to path
sys.path.insert(0, str(Path(__file__).parent.parent))

from incident_manager import incident_manager
from incident_types import (
    IncidentType, get_incident_config, detect_incident_type_from_alert,
    get_escalation_for_age
)
from monitoring_service import metrics_collector


class IncidentResponseTester:
    """Test harness for incident response system"""
    
    def __init__(self):
        self.test_results = []
        self.incidents_created = []
    
    async def setup(self):
        """Initialize database connections"""
        print("🔧 Setting up test environment...")
        await incident_manager.initialize()
        await metrics_collector.initialize()
        print("✅ Test environment ready\n")
    
    async def cleanup(self):
        """Clean up test incidents"""
        print("\n🧹 Cleaning up test data...")
        # Test incidents can be left for inspection
        print("✅ Cleanup complete")
    
    def log_test_result(self, test_name: str, success: bool, message: str = ""):
        """Log test result"""
        status = "✅ PASS" if success else "❌ FAIL"
        self.test_results.append({
            "test": test_name,
            "success": success,
            "message": message
        })
        print(f"{status} | {test_name}")
        if message:
            print(f"     {message}")
    
    # ============================================================================
    # TEST 1: Incident Type Detection
    # ============================================================================
    
    async def test_incident_type_detection(self):
        """Test automatic incident type detection from alerts"""
        print("\n" + "="*70)
        print("TEST 1: Incident Type Detection")
        print("="*70)
        
        test_cases = [
            ("availability", "service_down", "critical", IncidentType.SITE_DOWNTIME),
            ("performance", "http_5xx_count", "critical", IncidentType.HTTP_5XX_SPIKE),
            ("security", "cdn_status", "critical", IncidentType.CDN_FAILURE),
            ("security", "ddos_detected", "critical", IncidentType.DDOS_ATTACK),
            ("infrastructure", "cpu_percent", "warning", IncidentType.RESOURCE_SPIKE),
            ("database", "query_latency_ms", "warning", IncidentType.DB_LATENCY),
            ("performance", "page_load_latency_max_ms", "warning", IncidentType.PAGE_LOAD_SLOW),
            ("application", "errors_per_hour", "warning", IncidentType.APP_ERROR_SPIKE),
        ]
        
        for category, metric, severity, expected_type in test_cases:
            detected = detect_incident_type_from_alert(category, metric, severity)
            success = detected == expected_type
            self.log_test_result(
                f"Detect {expected_type.value}",
                success,
                f"Got {detected.value if detected else 'None'}"
            )
    
    # ============================================================================
    # TEST 2: Incident Creation & Triage
    # ============================================================================
    
    async def test_incident_creation_and_triage(self):
        """Test incident creation with automatic triage"""
        print("\n" + "="*70)
        print("TEST 2: Incident Creation & Triage")
        print("="*70)
        
        config = get_incident_config(IncidentType.SITE_DOWNTIME)
        
        incident_id = await incident_manager.create_incident(
            title="Test Site Downtime",
            description="Testing incident creation",
            severity="CRITICAL",
            incident_type=IncidentType.SITE_DOWNTIME.value,
            response_sla_minutes=config.response_sla_minutes,
            resolution_sla_minutes=config.resolution_sla_minutes
        )
        
        self.incidents_created.append(incident_id)
        self.log_test_result("Create incident", incident_id is not None, f"ID: {incident_id[:8]}")
        
        # Test triage
        result = await incident_manager.triage_incident(incident_id)
        self.log_test_result("Triage incident", result.get("success", False))
        
        # Verify incident status
        incident = await incident_manager.get_incident(incident_id)
        self.log_test_result(
            "Incident status updated",
            incident['status'] == 'OPEN',
            f"Status: {incident['status']}"
        )
    
    # ============================================================================
    # TEST 3: Escalation Logic
    # ============================================================================
    
    async def test_escalation_logic(self):
        """Test incident escalation based on age"""
        print("\n" + "="*70)
        print("TEST 3: Escalation Logic")
        print("="*70)
        
        # Test escalation rules for site downtime
        escalation_10 = get_escalation_for_age(IncidentType.SITE_DOWNTIME, 10)
        escalation_20 = get_escalation_for_age(IncidentType.SITE_DOWNTIME, 20)
        
        self.log_test_result(
            "Level 1 escalation at 10 min",
            escalation_10 and escalation_10.level == 1
        )
        self.log_test_result(
            "Level 2 escalation at 20 min",
            escalation_20 and escalation_20.level == 2
        )
    
    # ============================================================================
    # TEST 4: Root Cause Detection
    # ============================================================================
    
    async def test_root_cause_detection(self):
        """Test AI-assisted root cause detection"""
        print("\n" + "="*70)
        print("TEST 4: Root Cause Detection")
        print("="*70)
        
        if not self.incidents_created:
            print("⚠️  No test incidents available, skipping RCA test")
            return
        
        incident_id = self.incidents_created[0]
        
        # Add some timeline events
        await incident_manager.add_timeline_event(
            incident_id,
            "Service Health Check Failed",
            "HTTP 503 returned from health endpoint"
        )
        await incident_manager.add_timeline_event(
            incident_id,
            "Nginx Service Restart Attempted",
            "systemctl restart nginx executed"
        )
        
        # Test root cause detection
        root_cause = await incident_manager.detect_root_cause(incident_id)
        self.log_test_result(
            "Root cause detected",
            root_cause is not None,
            f"RCA: {root_cause[:100] if root_cause else 'None'}..."
        )
    
    # ============================================================================
    # TEST 5: Preventive Measures Generation
    # ============================================================================
    
    async def test_preventive_measures(self):
        """Test preventive measures generation"""
        print("\n" + "="*70)
        print("TEST 5: Preventive Measures Generation")
        print("="*70)
        
        if not self.incidents_created:
            print("⚠️  No test incidents available")
            return
        
        incident_id = self.incidents_created[0]
        measures = await incident_manager.generate_preventive_measures(incident_id)
        
        self.log_test_result(
            "Preventive measures generated",
            len(measures) > 0,
            f"Generated {len(measures)} measures"
        )
        
        if measures:
            print(f"     Sample: {measures[0][:60]}...")
    
    # ============================================================================
    # TEST 6: Follow-up Tasks Creation
    # ============================================================================
    
    async def test_followup_tasks(self):
        """Test follow-up task generation"""
        print("\n" + "="*70)
        print("TEST 6: Follow-up Task Generation")
        print("="*70)
        
        if not self.incidents_created:
            print("⚠️  No test incidents available")
            return
        
        incident_id = self.incidents_created[0]
        tasks = await incident_manager.create_followup_tasks(incident_id)
        
        self.log_test_result(
            "Follow-up tasks created",
            len(tasks) > 0,
            f"Generated {len(tasks)} tasks"
        )
    
    # ============================================================================
    # TEST 7: Playbook Validation
    # ============================================================================
    
    async def test_playbook_existence(self):
        """Verify all playbooks exist"""
        print("\n" + "="*70)
        print("TEST 7: Playbook Existence")
        print("="*70)
        
        playbook_dir = Path(__file__).parent.parent / "automation" / "playbooks"
        
        for incident_type in IncidentType:
            config = get_incident_config(incident_type)
            playbook_path = playbook_dir / config.playbook_name
            exists = playbook_path.exists()
            
            self.log_test_result(
                f"Playbook: {config.playbook_name}",
                exists,
                f"Path: {playbook_path}"
            )
    
    # ============================================================================
    # TEST 8: Alert-to-Incident Integration
    # ============================================================================
    
    async def test_alert_to_incident_integration(self):
        """Test automatic incident creation from alerts"""
        print("\n" + "="*70)
        print("TEST 8: Alert-to-Incident Integration")
        print("="*70)
        
        # Simulate a critical alert
        await metrics_collector._trigger_alert(
            category="performance",
            metric_name="http_5xx_count",
            severity="critical",
            current_value=150,
            threshold=1,
            metadata={"source": "test"}
        )
        
        # Give it a moment to process
        await asyncio.sleep(0.5)
        
        # Check if incident was created
        incidents = await incident_manager.list_incidents(active_only=True)
        http_5xx_incidents = [
            inc for inc in incidents 
            if "HTTP_5XX" in inc.get('incident_type', '').upper() or "5xx" in inc.get('title', '')
        ]
        
        self.log_test_result(
            "Incident created from alert",
            len(http_5xx_incidents) > 0,
            f"Found {len(http_5xx_incidents)} HTTP 5xx incidents"
        )
    
    # ============================================================================
    # TEST 9: Complete Incident Lifecycle
    # ============================================================================
    
    async def test_complete_lifecycle(self):
        """Test complete incident lifecycle"""
        print("\n" + "="*70)
        print("TEST 9: Complete Incident Lifecycle")
        print("="*70)
        
        config = get_incident_config(IncidentType.DB_LATENCY)
        
        # 1. Create
        incident_id = await incident_manager.create_incident(
            title="Test DB Latency Incident",
            description="Testing complete lifecycle",
            severity="HIGH",
            incident_type=IncidentType.DB_LATENCY.value,
            response_sla_minutes=config.response_sla_minutes,
            resolution_sla_minutes=config.resolution_sla_minutes
        )
        self.incidents_created.append(incident_id)
        
        # 2. Triage
        await incident_manager.triage_incident(incident_id)
       
        # 3. Send status update
        await incident_manager.send_status_update(
            incident_id,
            "Investigating database slow query patterns"
        )
        
        # 4. Detect root cause
        await incident_manager.detect_root_cause(incident_id)
        
        # 5. Update to investigating
        await incident_manager.update_incident(
            incident_id,
            status="INVESTIGATING"
        )
        
        # 6. Resolve
        await incident_manager.update_incident(
            incident_id,
            status="RESOLVED",
            resolution="Optimized slow query, added index"
        )
        
        # Verify final state
        incident = await incident_manager.get_incident(incident_id)
        self.log_test_result(
            "Incident lifecycle complete",
            incident['status'] == 'RESOLVED',
            f"Final status: {incident['status']}"
        )
        
        # Generate RCA
        rca = await incident_manager.generate_rca(incident_id)
        self.log_test_result(
            "RCA generated",
            len(rca) > 100,
            f"RCA length: {len(rca)} chars"
        )
    
    # ============================================================================
    # TEST RUNNER
    # ============================================================================
    
    async def run_all_tests(self):
        """Run all test suites"""
        print("\n" + "="*70)
        print("🧪 INCIDENT RESPONSE SYSTEM - COMPREHENSIVE TEST SUITE")
        print("="*70)
        
        await self.setup()
        
        # Run all tests
        await self.test_incident_type_detection()
        await self.test_incident_creation_and_triage()
        await self.test_escalation_logic()
        await self.test_root_cause_detection()
        await self.test_preventive_measures()
        await self.test_followup_tasks()
        await self.test_playbook_existence()
        await self.test_alert_to_incident_integration()
        await self.test_complete_lifecycle()
        
        # Print summary
        self.print_summary()
        
        await self.cleanup()
    
    def print_summary(self):
        """Print test results summary"""
        print("\n" + "="*70)
        print("📊 TEST RESULTS SUMMARY")
        print("="*70)
        
        passed = sum(1 for r in self.test_results if r['success'])
        failed = sum(1 for r in self.test_results if not r['success'])
        total = len(self.test_results)
        
        print(f"\nTotal Tests: {total}")
        print(f"✅ Passed: {passed}")
        print(f"❌ Failed: {failed}")
        print(f"Success Rate: {(passed/total*100):.1f}%")
        
        if failed > 0:
            print("\nFailed Tests:")
            for result in self.test_results:
                if not result['success']:
                    print(f"  ❌ {result['test']}: {result.get('message', '')}")
        
        print(f"\n📋 Test Incidents Created: {len(self.incidents_created)}")
        for inc_id in self.incidents_created[:3]:
            print(f"   - {inc_id}")
        
        print("\n" + "="*70)
        if failed == 0:
            print("🎉 ALL TESTS PASSED!")
        else:
            print(f"⚠️  {failed} TEST(S) FAILED")
        print("="*70 + "\n")


async def main():
    """Main test runner"""
    tester = IncidentResponseTester()
    await tester.run_all_tests()


if __name__ == "__main__":
    asyncio.run(main())
