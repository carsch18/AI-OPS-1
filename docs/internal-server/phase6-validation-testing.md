# Phase 6: End-to-End Validation & Testing

## Overview
Comprehensive testing of the entire internal server monitoring and response system.

**Duration**: ~45 minutes  
**Risk Level**: Medium (includes failure simulation)  
**Rollback**: Restore services after tests

---

## Pre-Test Checklist

Verify all phases are complete:

```bash
cat > ~/pre-test-checklist.sh <<'CHECKLIST'
#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Pre-Test Validation Checklist ==="
echo ""

# Phase 1: Server Setup
echo -n "Phase 1 - Server Static IP: "
SERVER_IP=$(ssh user@192.168.1.100 'hostname -I | awk "{print \$1}"' 2>/dev/null)
if [[ "$SERVER_IP" =~ ^192\.168\. ]]; then
  echo -e "${GREEN}✓ $SERVER_IP${NC}"
else
  echo -e "${RED}✗ Not configured${NC}"
fi

# Phase 2: Nginx Proxy
echo -n "Phase 2 - Nginx Proxy: "
if curl -s -I http://192.168.1.100:8080/health | grep "200" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${RED}✗ Not accessible${NC}"
fi

# Phase 3: Netdata
echo -n "Phase 3 - Netdata API: "
if curl -s -I http://192.168.1.100:19999/api/v1/info | grep "200" > /dev/null 2>&1; then
  echo -e "${GREEN}✓ Running${NC}"
else
  echo -e "${RED}✗ Not accessible${NC}"
fi

# Phase 4: AIOps Integration
echo -n "Phase 4 - AIOps Config: "
if [ -f "/home/adityatiwari/Documents/AIOPS/AI-OPS/apps/brain/internal_server_config.py" ]; then
  echo -e "${GREEN}✓ Configured${NC}"
else
  echo -e "${RED}✗ Not found${NC}"
fi

# Phase 5: Playbooks
echo -n "Phase 5 - Playbooks: "
PLAYBOOK_COUNT=$(ls /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/automation/playbooks/internal_*.yml 2>/dev/null | wc -l)
if [ "$PLAYBOOK_COUNT" -ge 3 ]; then
  echo -e "${GREEN}✓ $PLAYBOOK_COUNT playbooks${NC}"
else
  echo -e "${YELLOW}⚠ Only $PLAYBOOK_COUNT playbooks${NC}"
fi

echo ""
echo "=== Ready for Testing ===""
CHECKLIST

chmod +x ~/pre-test-checklist.sh
./pre-test-checklist.sh
```

---

## Test Suite 1: Availability Monitoring

### Test 1.1: WordPress Health Check

**Objective**: Verify WordPress availability monitoring

```bash
# From command center
cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/brain

# Test availability check
python3 <<'TEST'
import asyncio
from internal_server_monitor import internal_monitor

async def test():
    await internal_monitor.initialize()
    health = await internal_monitor.check_wordpress_health()
    print(f"WordPress Available: {health['available']}")
    print(f"Response Time: {health.get('response_time_ms')}ms")
    print(f"Status Code: {health.get('status_code')}")
    await internal_monitor.close()

asyncio.run(test())
TEST
```

**Expected**: Available=True, Response time < 500ms

### Test 1.2: Simulate WordPress Downtime

```bash
# Step 1: Stop Nginx on server
ssh user@192.168.1.100 'sudo systemctl stop nginx'

# Step 2: Wait 60 seconds for detection
echo "Waiting 60 seconds for AIOps detection..."
sleep 60

# Step 3: Check if alert was triggered
curl -s http://localhost:8000/api/alerts | jq '.[] | select(.category=="internal_server" and .metric_name=="wordpress_available")'

# Step 4: Verify incident was created
curl -s http://localhost:8000/api/incidents | jq '.[] | select(.incident_type | contains("wordpress"))'

# Step 5: Restore service
ssh user@192.168.1.100 'sudo systemctl start nginx'

# Step 6: Verify recovery detected
sleep 30
curl -I http://192.168.1.100:8080/health
```

**Expected**:
- Alert triggered within 60s
- Incident created with correct type
- Service recovery detected

---

## Test Suite 2: Resource Monitoring

### Test 2.1: CPU Metrics Collection

```bash
python3 <<'TEST'
import asyncio
from internal_server_monitor import internal_monitor

async def test():
    await internal_monitor.initialize()
    cpu = await internal_monitor.get_cpu_usage()
    print(f"CPU Usage: {cpu}%")
    
    mem = await internal_monitor.get_memory_usage()
    print(f"Memory Usage: {mem.get('used_percent')}%")
    
    disk = await internal_monitor.get_disk_usage()
    print(f"Disk Usage: {disk.get('used_percent')}%")
    
    await internal_monitor.close()

asyncio.run(test())
TEST
```

**Expected**: All metrics returned with valid percentages

### Test 2.2: Simulate High CPU Load

```bash
# On server: Generate CPU load
ssh user@192.168.1.100 'stress-ng --cpu 4 --timeout 120s &'

# Wait and check if detected
sleep 90

# Check for CPU alert
curl -s http://localhost:8000/api/alerts | jq '.[] | select(.metric_name=="server_cpu_percent")'

# Resource spike should trigger incident
curl -s http://localhost:8000/api/incidents | jq '.[] | select(.incident_type | contains("resource"))'
```

**Expected**:
- CPU spike detected
- Alert triggered if > 70%
- Incident created if > 90%

---

## Test Suite 3: Docker Container Monitoring

### Test 3.1: Docker Container Count

```bash
python3 <<'TEST'
import asyncio
from internal_server_monitor import internal_monitor

async def test():
    await internal_monitor.initialize()
    docker = await internal_monitor.get_docker_containers()
    print(f"Running Containers: {docker.get('running')}")
    print(f"Total Containers: {docker.get('total')}")
    await internal_monitor.close()

asyncio.run(test())
TEST
```

**Expected**: At least 3 DDEV containers running

### Test 3.2: Simulate DDEV Container Failure

```bash
# Stop one DDEV container
ssh user@192.168.1.100 'cd ~/my-wordpress-site && ddev stop'

# Wait for detection
sleep 60

# Check alert
curl -s http://localhost:8000/api/alerts | jq '.[] | select(.metric_name=="server_docker_containers")'

# Restart DDEV
ssh user@192.168.1.100 'cd ~/my-wordpress-site && ddev start'

# Verify recovery
sleep 30
ssh user@192.168.1.100 'docker ps | grep ddev | wc -l'
```

**Expected**:
- Container count drop detected
- Alert triggered
- Auto-recovery via playbook or manual restart

---

## Test Suite 4: Playbook Execution

### Test 4.1: Manual Playbook Test

```bash
cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/automation/playbooks

# Test WordPress downtime playbook
ansible-playbook internal_wordpress_downtime.yml \
  -e "target_server=192.168.1.100" \
  -e "wp_url=http://192.168.1.100:8080" \
  -e "action_id=manual-test-001"

# Check output for:
# - Diagnostic phase completed
# - WordPress status reported
# - Nginx status checked
# - DDEV containers counted
```

### Test 4.2: Automated Playbook Trigger

```bash
# Scenario: WordPress goes down, playbook auto-executes

# 1. Stop WordPress
ssh user@192.168.1.100 'sudo systemctl stop nginx'

# 2. Wait for detection and auto-remediation (90 seconds)
echo "Waiting for auto-remediation..."
sleep 90

# 3. Check if WordPress is back up
curl -I http://192.168.1.100:8080/health

# 4. Check incident timeline for playbook execution
curl -s http://localhost:8000/api/incidents | jq '.[0].timeline[] | select(.event | contains("Playbook"))'
```

**Expected**:
- Playbook auto-triggered
- Nginx restarted
- WordPress accessible again

---

## Test Suite 5: End-to-End Integration

### Test 5.1: Complete Failure and Recovery

```bash
# Comprehensive test script
cat > ~/test-e2e-integration.sh <<'E2E'
#!/bin/bash

echo "=== End-to-End Integration Test ==="
echo ""

# PHASE 1: Baseline
echo "PHASE 1: Establishing baseline..."
curl -s http://192.168.1.100:8080/health && echo "✓ WordPress up"
curl -s http://192.168.1.100:19999/api/v1/info > /dev/null && echo "✓ Netdata up"

# PHASE 2: Induce failure
echo ""
echo "PHASE 2: Inducing failure..."
ssh user@192.168.1.100 'sudo systemctl stop nginx'
echo "✓ Nginx stopped"

# PHASE 3: Monitor detection
echo ""
echo "PHASE 3: Monitoring for detection (60s)..."
sleep 60

# Check if alert triggered
ALERT_COUNT=$(curl -s http://localhost:8000/api/alerts | jq '[.[] | select(.category=="internal_server")] | length')
echo "Alerts triggered: $ALERT_COUNT"

# PHASE 4: Verify incident creation
INCIDENT_COUNT=$(curl -s http://localhost:8000/api/incidents | jq '[.[] | select(.incident_type | contains("wordpress"))] | length')
echo "Incidents created: $INCIDENT_COUNT"

# PHASE 5: Manual recovery (or wait for playbook)
echo ""
echo "PHASE 5: Recovering service..."
ssh user@192.168.1.100 'sudo systemctl start nginx'
sleep 10

# PHASE 6: Verify recovery
echo ""
echo "PHASE 6: Verifying recovery..."
if curl -s -I http://192.168.1.100:8080/health | grep "200" > /dev/null; then
  echo "✓ WordPress recovered"
else
  echo "✗ WordPress still down"
fi

echo ""
echo "=== Test Complete ==="
E2E

chmod +x ~/test-e2e-integration.sh
./test-e2e-integration.sh
```

---

## Test Suite 6: Performance Validation

### Test 6.1: Metric Collection Latency

```bash
python3 <<'PERF'
import asyncio
import time
from internal_server_monitor import internal_monitor

async def benchmark():
    await internal_monitor.initialize()
    
    iterations = 10
    start = time.time()
    
    for i in range(iterations):
        metrics = await internal_monitor.collect_all_metrics()
    
    duration = time.time() - start
    avg = duration / iterations
    
    print(f"Collected metrics {iterations} times")
    print(f"Total time: {duration:.2f}s")
    print(f"Average per collection: {avg:.2f}s")
    print(f"Target: < 2s per collection")
    
    if avg < 2:
        print("✓ Performance acceptable")
    else:
        print("✗ Performance too slow")
    
    await internal_monitor.close()

asyncio.run(benchmark())
PERF
```

**Target**: < 2 seconds per full metric collection

---

## Test Suite 7: Alert Threshold Accuracy

### Test 7.1: Threshold Boundary Testing

```bash
# Test CPU threshold (70% warning, 90% critical)
python3 <<'THRESHOLD'
import asyncio
from internal_server_monitor import internal_monitor

async def test():
    await internal_monitor.initialize()
    
    # Collect metrics
    metrics = await internal_monitor.collect_all_metrics()
    
    # Check thresholds
    alerts = await internal_monitor.check_thresholds(metrics)
    
    print(f"Current CPU: {metrics.get('cpu_percent')}%")
    print(f"Current Memory: {metrics.get('memory', {}).get('used_percent')}%")
    print(f"Current Disk: {metrics.get('disk', {}).get('used_percent')}%")
    print(f"Alerts triggered: {len(alerts)}")
    
    for alert in alerts:
        print(f"  - {alert['severity'].upper()}: {alert['message']}")
    
    await internal_monitor.close()

asyncio.run(test())
THRESHOLD
```

---

## Final Validation Script

```bash
cat > ~/final-validation.sh <<'FINAL'
#!/bin/bash

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo "=== Final System Validation ==="
echo ""

PASS=0
FAIL=0

# Test 1: Server reachable
if ping -c 2 192.168.1.100 > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Server pingable"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Server not reachable"
  ((FAIL++))
fi

# Test 2: WordPress accessible
if curl -s -I http://192.168.1.100:8080 | grep -E "200|301|302" > /dev/null; then
  echo -e "${GREEN}✓${NC} WordPress accessible"
  ((PASS++))
else
  echo -e "${RED}✗${NC} WordPress not accessible"
  ((FAIL++))
fi

# Test 3: Netdata API responding
if curl -s http://192.168.1.100:19999/api/v1/info | jq -e '.version' > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} Netdata API responding"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Netdata API not responding"
  ((FAIL++))
fi

# Test 4: AIOps brain running
if curl -s http://localhost:8000/health | grep "ok" > /dev/null 2>&1; then
  echo -e "${GREEN}✓${NC} AIOps brain service running"
  ((PASS++))
else
  echo -e "${YELLOW}⚠${NC} AIOps brain may not be running"
  ((FAIL++))
fi

# Test 5: Monitoring integration
if [ -f "/home/adityatiwari/Documents/AIOPS/AI-OPS/apps/brain/internal_server_monitor.py" ]; then
  echo -e "${GREEN}✓${NC} Monitor service configured"
  ((PASS++))
else
  echo -e "${RED}✗${NC} Monitor service not found"
  ((FAIL++))
fi

# Test 6: Playbooks exist
PLAYBOOKS=$(ls /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/automation/playbooks/internal_*.yml 2>/dev/null | wc -l)
if [ "$PLAYBOOKS" -ge 3 ]; then
  echo -e "${GREEN}✓${NC} Playbooks exist ($PLAYBOOKS found)"
  ((PASS++))
else
  echo -e "${YELLOW}⚠${NC} Incomplete playbooks ($PLAYBOOKS found)"
  ((FAIL++))
fi

# Summary
echo ""
echo "========================================="
echo -e "Results: ${GREEN}$PASS passed${NC}, ${RED}$FAIL failed${NC}"
echo "========================================="

if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}🎉 ALL SYSTEMS OPERATIONAL${NC}"
  exit 0
else
  echo -e "${YELLOW}⚠️  SOME ISSUES DETECTED${NC}"
  exit 1
fi
FINAL

chmod +x ~/final-validation.sh
./final-validation.sh
```

---

## Success Criteria

✅ **System is production-ready if**:
- All 6 phases validated
- WordPress accessible at http://192.168.1.100:8080
- Netdata metrics flowing
- Alerts trigger on failures
- Playbooks execute successfully
- Recovery automated or guided

---

## Post-Validation: Ongoing Monitoring

### Daily Health Check

```bash
# Run this daily
curl http://192.168.1.100:8080/health && echo "OK" || echo "FAIL"
curl http://192.168.1.100:19999/api/v1/info > /dev/null && echo "Netdata OK"
```

### Weekly Performance Review

```bash
# Check metrics history
curl -s http://192.168.1.100:19999/api/v1/data?chart=system.cpu&after=-86400 | jq '.data | length'
# Should return ~43200 data points (1 per 2 seconds for 24 hours)
```

---

## Next Steps After Validation

1. **Set up scheduled monitoring** (cron job or systemd timer)
2. **Configure email/Slack notifications**
3. **Create runbooks** for manual intervention scenarios
4. **Document network topology** for team reference
5. **Schedule quarterly disaster recovery drills**

---

## Troubleshooting Failed Tests

Refer to phase-specific troubleshooting sections:
- Phase 1: Network connectivity issues
- Phase 2: Nginx proxy problems
- Phase 3: Netdata installation/API issues
- Phase 4: AIOps integration errors
- Phase 5: Playbook execution failures

---

✅ **Phase 6 Complete - System Validated!**
