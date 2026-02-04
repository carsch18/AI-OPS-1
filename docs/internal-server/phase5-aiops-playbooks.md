# Phase 5: AIOps Playbooks for Internal Server

## Overview
Create automated response playbooks specifically for the internal WordPress server.

**Duration**: ~20 minutes  
**Risk Level**: Low (playbooks reviewed before execution)  
**Rollback**: Disable playbooks

---

## Playbook Architecture

**Playbooks will handle**:
1. WordPress site downtime → Restart DDEV + Nginx
2. High resource usage → Identify and alert
3. DDEV container failures → Restart containers
4. Disk space critical → Cleanup recommendations
5. Network connectivity issues → Diagnostic reporting

---

## Step 1: Create WordPress Site Downtime Playbook

```bash
cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/automation/playbooks

# Create internal server playbook
cat > internal_wordpress_downtime.yml <<'PLAYBOOK'
---
# Internal WordPress Server Downtime Response
# Diagnose and remediate WordPress/DDEV issues

- name: Internal WordPress Downtime Response
  hosts: localhost
  connection: local
  gather_facts: yes
  vars:
    server_ip: "{{ target_server | default('192.168.1.100') }}"
    wordpress_url: "{{ wp_url | default('http://192.168.1.100:8080') }}"
    callback_url: "{{ callback | default('http://localhost:8000/automation/callback') }}"
    action_id: "{{ action_id | default('unknown') }}"

  tasks:
    - name: Report playbook start
      uri:
        url: "{{ callback_url }}"
        method: POST
        body_format: json
        body:
          action_id: "{{ action_id }}"
          status: "running"
          message: "Internal WordPress downtime response started"
      ignore_errors: yes

    # ================================================
    # PHASE 1: Diagnostics
    # ================================================

    - name: Test WordPress HTTP connectivity
      uri:
        url: "{{ wordpress_url }}/health"
        method: GET
        timeout: 5
        status_code: [200, 301, 302]
      register: wp_health_check
      ignore_errors: yes

    - name: WordPress health status
      debug:
        msg: "WordPress {{ 'ACCESSIBLE' if wp_health_check.status is defined and wp_health_check.status in [200, 301, 302] else 'DOWN' }}"

    - name: Test Nginx proxy status
      delegate_to: "{{ server_ip }}"
      shell: systemctl is-active nginx
      register: nginx_status
      ignore_errors: yes
      changed_when: false

    - name: Check Nginx status
      debug:
        msg: "Nginx: {{ nginx_status.stdout }}"

    - name: Check DDEV containers (SSH to server)
      delegate_to: "{{ server_ip }}"
      shell: docker ps | grep ddev | wc -l
      register: ddev_containers
      ignore_errors: yes
      changed_when: false

    - name: DDEV container count
      debug:
        msg: "DDEV containers running: {{ ddev_containers.stdout }}"

    # ================================================
    # PHASE 2: Remediation
    # ================================================

    - name: Restart Nginx if not active
      delegate_to: "{{ server_ip }}"
      service:
        name: nginx
        state: restarted
      become: yes
      when: nginx_status.stdout != "active"
      register: nginx_restart
      ignore_errors: yes

    - name: Restart DDEV if containers down
      delegate_to: "{{ server_ip }}"
      shell: |
        cd ~/my-wordpress-site  # Adjust to actual DDEV project path
        ddev restart
      when: ddev_containers.stdout|int < 3
      register: ddev_restart
      ignore_errors: yes
      changed_when: true

    - name: Wait for services to stabilize
      wait_for:
        timeout: 10
      when: nginx_restart is changed or ddev_restart is changed

    # ================================================
    # PHASE 3: Post-Remediation Validation
    # ================================================

    - name: Re-test WordPress after remediation
      uri:
        url: "{{ wordpress_url }}/health"
        method: GET
        timeout: 5
        status_code: [200, 301, 302]
      register: wp_recheck
      ignore_errors: yes
      when: nginx_restart is changed or ddev_restart is changed

    - name: Compile diagnostic report
      set_fact:
        diagnostic_report:
          initial_status: "{{ 'UP' if wp_health_check.status is defined else 'DOWN' }}"
          nginx_restarted: "{{ nginx_restart is changed }}"
          ddev_restarted: "{{ ddev_restart is changed }}"
          final_status: "{{ 'UP' if wp_recheck.status is defined and wp_recheck.status in [200, 301, 302] else 'STILL DOWN' }}"
          ddev_containers_before: "{{ ddev_containers.stdout }}"
          recommendation: "{{ 'Site recovered' if wp_recheck.status is defined else 'Manual investigation required' }}"

    - name: Report results to AIOps
      uri:
        url: "{{ callback_url }}"
        method: POST
        body_format: json
        body:
          action_id: "{{ action_id }}"
          status: "completed"
          success: "{{ wp_recheck.status is defined if (nginx_restart is changed or ddev_restart is changed) else wp_health_check.status is defined }}"
          message: "WordPress downtime response completed"
          details: "{{ diagnostic_report }}"
      ignore_errors: yes
PLAYBOOK

echo "✓ WordPress downtime playbook created"
```

---

## Step 2: Create Resource Spike Playbook for Internal Server

```bash
cat > internal_resource_spike.yml <<'PLAYBOOK'
---
# Internal Server Resource Spike Response
# Diagnose high CPU/RAM/Disk usage

- name: Internal Server Resource Investigation
  hosts: localhost
  connection: local
  gather_facts: yes
  vars:
    server_ip: "{{ target_server | default('192.168.1.100') }}"
    netdata_url: "{{ netdata | default('http://192.168.1.100:19999/api/v1') }}"
    callback_url: "{{ callback | default('http://localhost:8000/automation/callback') }}"
    action_id: "{{ action_id | default('unknown') }}"
    resource_type: "{{ type | default('cpu') }}"

  tasks:
    - name: Report start
      uri:
        url: "{{ callback_url }}"
        method: POST
        body_format: json
        body:
          action_id: "{{ action_id }}"
          status: "running"
          message: "Investigating {{ resource_type }} spike on internal server"
      ignore_errors: yes

    # ================================================
    # Fetch current metrics from Netdata
    # ================================================

    - name: Get current CPU usage from Netdata
      uri:
        url: "{{ netdata_url }}/data"
        method: GET
        body_format: json
        return_content: yes
      vars:
        query:
          chart: "system.cpu"
          after: -10
          format: "json"
      register: cpu_data
      ignore_errors: yes

    - name: Get current memory usage from Netdata
      uri:
        url: "{{ netdata_url }}/data?chart=system.ram&after=-10&format=json"
        method: GET
        return_content: yes
      register: mem_data
      ignore_errors: yes

    - name: Get disk usage from Netdata
      uri:
        url: "{{ netdata_url }}/data?chart=disk_space._&after=-10&format=json"
        method: GET
        return_content: yes
      register: disk_data
      ignore_errors: yes

    # ================================================
    # Get top processes via SSH
    # ================================================

    - name: Get top CPU processes
      delegate_to: "{{ server_ip }}"
      shell: ps aux --sort=-%cpu | head -11 | tail -10
      register: top_cpu
      ignore_errors: yes
      changed_when: false

    - name: Get top memory processes
      delegate_to: "{{ server_ip }}"
      shell: ps aux --sort=-%mem | head -11 | tail -10
      register: top_mem
      ignore_errors: yes
      changed_when: false

    - name: Check Docker container resource usage
      delegate_to: "{{ server_ip }}"
      shell: docker stats --no-stream --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"
      register: docker_stats
      ignore_errors: yes
      changed_when: false

    - name: Check disk space
      delegate_to: "{{ server_ip }}"
      shell: df -h | grep -E "/$|/home"
      register: disk_space
      ignore_errors: yes
      changed_when: false

    # ================================================
    # Compile report
    # ================================================

    - name: Build resource analysis report
      set_fact:
        resource_report:
          resource_type: "{{ resource_type }}"
          top_cpu_processes: "{{ top_cpu.stdout_lines[:5] }}"
          top_memory_processes: "{{ top_mem.stdout_lines[:5] }}"
          docker_stats: "{{ docker_stats.stdout_lines }}"
          disk_space: "{{ disk_space.stdout_lines }}"
          netdata_available: "{{ cpu_data.status == 200 }}"
          recommendation: "Review top processes and consider resource limits"

    - name: Report analysis to AIOps
      uri:
        url: "{{ callback_url }}"
        method: POST
        body_format: json
        body:
          action_id: "{{ action_id }}"
          status: "completed"
          success: true
          message: "Resource spike analysis completed"
          details: "{{ resource_report }}"
      ignore_errors: yes
PLAYBOOK

echo "✓ Resource spike playbook created"
```

---

## Step 3: Create DDEV Container Health Check Playbook

```bash
cat > internal_ddev_health.yml <<'PLAYBOOK'
---
# DDEV Container Health Check and Recovery
# Ensures all DDEV containers are running

- name: DDEV Container Health Check
  hosts: localhost
  connection: local
  gather_facts: yes
  vars:
    server_ip: "{{ target_server | default('192.168.1.100') }}"
    ddev_path: "{{ project_path | default('~/my-wordpress-site') }}"
    callback_url: "{{ callback | default('http://localhost:8000/automation/callback') }}"
    action_id: "{{ action_id | default('unknown') }}"

  tasks:
    - name: Report start
      uri:
        url: "{{ callback_url }}"
        method: POST
        body_format: json
        body:
          action_id: "{{ action_id }}"
          status: "running"
          message: "Checking DDEV container health"
      ignore_errors: yes

    # ================================================
    # Check DDEV status
    # ================================================

    - name: Get DDEV status
      delegate_to: "{{ server_ip }}"
      shell: |
        cd {{ ddev_path }}
        ddev describe --json-output
      register: ddev_status
      ignore_errors: yes
      changed_when: false

    - name: List DDEV containers
      delegate_to: "{{ server_ip }}"
      shell: docker ps | grep ddev
      register: ddev_containers
      ignore_errors: yes
      changed_when: false

    - name: Count running DDEV containers
      set_fact:
        container_count: "{{ ddev_containers.stdout_lines | length }}"

    - name: DDEV container status
      debug:
        msg: "DDEV containers running: {{ container_count }}"

    # ================================================
    # Restart if needed
    # ================================================

    - name: Restart DDEV if containers missing
      delegate_to: "{{ server_ip }}"
      shell: |
        cd {{ ddev_path }}
        ddev restart
      when: container_count|int < 3
      register: ddev_restart
      ignore_errors: yes

    - name: Wait after restart
      wait_for:
        timeout: 15
      when: ddev_restart is changed

    - name: Re-check container count
      delegate_to: "{{ server_ip }}"
      shell: docker ps | grep ddev | wc -l
      register: containers_after
      ignore_errors: yes
      changed_when: false
      when: ddev_restart is changed

    # ================================================
    # Report results
    # ================================================

    - name: Compile health report
      set_fact:
        health_report:
          containers_before: "{{ container_count }}"
          containers_after: "{{ containers_after.stdout if ddev_restart is changed else container_count }}"
          restart_performed: "{{ ddev_restart is changed }}"
          status: "{{ 'HEALTHY' if containers_after.stdout|int >= 3 else 'DEGRADED' }}"

    - name: Report to AIOps
      uri:
        url: "{{ callback_url }}"
        method: POST
        body_format: json
        body:
          action_id: "{{ action_id }}"
          status: "completed"
          success: true
          message: "DDEV health check completed"
          details: "{{ health_report }}"
      ignore_errors: yes
PLAYBOOK

echo "✓ DDEV health check playbook created"
```

---

## Step 4: Register Playbooks in AIOps System

Update incident types to include internal server playbooks:

```bash
cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/brain

# Create internal server incident types
cat > internal_server_incidents.py <<'INCIDENTS'
"""
Internal Server Incident Type Configurations
"""

from incident_types import IncidentType, IncidentTypeConfig, Severity, EscalationRule

# Internal server incident types
INTERNAL_INCIDENT_TYPES = {
    "INTERNAL_WORDPRESS_DOWN": IncidentTypeConfig(
        incident_type="internal_wordpress_down",
        name="Internal WordPress Server Down",
        description="WordPress site on internal server is unavailable",
        default_severity=Severity.P0_CRITICAL,
        response_sla_minutes=10,
        resolution_sla_minutes=30,
        status_update_cadence_minutes=10,
        escalation_rules=[
            EscalationRule(
                level=1,
                trigger_after_minutes=15,
                notify_roles=["admin"],
                notify_channels=["console", "email"]
            )
        ],
        playbook_name="internal_wordpress_downtime.yml",
        auto_trigger_playbook=True,
        requires_human_approval=False,
        detection_rules={
            "alert_category": "internal_server",
            "metric_names": ["wordpress_available"],
            "severity": "critical"
        }
    ),
    
    "INTERNAL_RESOURCE_SPIKE": IncidentTypeConfig(
        incident_type="internal_resource_spike",
        name="Internal Server Resource Spike",
        description="CPU, RAM, or Disk usage spike on internal server",
        default_severity=Severity.P2_MEDIUM,
        response_sla_minutes=15,
        resolution_sla_minutes=60,
        status_update_cadence_minutes=20,
        escalation_rules=[
            EscalationRule(
                level=1,
                trigger_after_minutes=30,
                notify_roles=["admin"],
                notify_channels=["console"]
            )
        ],
        playbook_name="internal_resource_spike.yml",
        auto_trigger_playbook=True,
        requires_human_approval=False,
        detection_rules={
            "alert_category": "internal_server",
            "metric_names": ["server_cpu_percent", "server_memory_percent", "server_disk_percent"],
            "severity": "critical"
        }
    ),
    
    "INTERNAL_DDEV_UNHEALTHY": IncidentTypeConfig(
        incident_type="internal_ddev_unhealthy",
        name="DDEV Containers Unhealthy",
        description="DDEV containers are down or unhealthy",
        default_severity=Severity.P1_HIGH,
        response_sla_minutes=10,
        resolution_sla_minutes=20,
        status_update_cadence_minutes=10,
        escalation_rules=[
            EscalationRule(
                level=1,
                trigger_after_minutes=15,
                notify_roles=["admin"],
                notify_channels=["console", "email"]
            )
        ],
        playbook_name="internal_ddev_health.yml",
        auto_trigger_playbook=True,
        requires_human_approval=False,
        detection_rules={
            "alert_category": "internal_server",
            "metric_names": ["server_docker_containers"],
            "severity": "critical"
        }
    )
}
INCIDENTS

echo "✓ Internal server incident types defined"
```

---

## Step 5: Test Playbook Execution

```bash
# Test WordPress downtime playbook (dry run)
cd /home/adityatiwari/Documents/AIOPS/AI-OPS/apps/automation/playbooks

ansible-playbook internal_wordpress_downtime.yml --check \
  -e "target_server=192.168.1.100" \
  -e "action_id=test-001"

# Test resource spike playbook
ansible-playbook internal_resource_spike.yml --check \
  -e "target_server=192.168.1.100" \
  -e "type=cpu" \
  -e "action_id=test-002"

# Test DDEV health playbook
ansible-playbook internal_ddev_health.yml --check \
  -e "target_server=192.168.1.100" \
  -e "project_path=~/my-wordpress-site" \
  -e "action_id=test-003"
```

---

## Step 6: Configure Automated Playbook Triggers

In `monitoring_service.py`, playbooks will auto-trigger based on incident type:

```python
# When alert is triggered for internal server:
if alert["category"] == "internal_server" and alert["severity"] == "critical":
    # Create incident
    incident_id = await incident_manager.create_incident(...)
    
    # Auto-trigger playbook
    playbook_name = incident_config.playbook_name
    await automation_controller.execute_playbook(
        playbook=playbook_name,
        variables={
            "target_server": "192.168.1.100",
            "action_id": incident_id
        }
    )
```

---

## Step 7: Validation

Test end-to-end flow:

```bash
# 1. Simulate WordPress downtime
ssh user@192.168.1.100 'sudo systemctl stop nginx'

# 2. Wait for AIOps to detect (30-60 seconds)

# 3. Check if alert triggered
curl http://localhost:8000/api/alerts | jq '.[] | select(.category=="internal_server")'

# 4. Check if incident created
curl http://localhost:8000/api/incidents | jq '.[] | select(.incident_type=="internal_wordpress_down")'

# 5. Check if playbook executed
# Look for playbook execution logs in automation service

# 6. Verify site is back up
curl http://192.168.1.100:8080/health
```

---

## Next Steps

✅ **Phase 5 Complete!**

**What we accomplished**:
- ✅ Created 3 specialized playbooks for internal server
- ✅ Defined internal server incident types
- ✅ Configured automated playbook triggers
- ✅ Tested playbook execution

**Proceed to Phase 6**: End-to-End Validation and Testing
