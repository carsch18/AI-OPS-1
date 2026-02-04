# Phase 3: Netdata Metrics Collection Setup

## Overview
Install and configure Netdata for comprehensive system and Docker container monitoring.

**Duration**: ~15 minutes  
**Risk Level**: Very Low (monitoring only, no system changes)  
**Rollback**: Uninstall Netdata

---

## What is Netdata?

**Real-time performance monitoring** with:
- CPU, RAM, Disk, Network metrics (per second)
- Docker container resource tracking
- Process-level monitoring
- REST API for metrics export
- Beautiful web dashboard
- Zero configuration required

**Why Netdata for AIOps**:
- High-resolution metrics (1-second granularity)
- Built-in health checks and alarms
- Easy API integration
- Minimal resource overhead (~1-2% CPU)

---

## Step 1: Install Netdata

**One-line installation** (recommended):

```bash
# Install with automatic updates enabled
bash <(curl -Ss https://my-netdata.io/kickstart.sh) --stable-channel --disable-telemetry

# Installation will:
# - Download and compile Netdata
# - Create systemd service
# - Start automatically
# - Open port 19999
```

**Installation output** (takes 2-5 minutes):
```
Installing netdata...
Netdata installed successfully!
Access the dashboard at: http://192.168.1.100:19999
```

**Verify installation**:

```bash
# Check service status
systemctl status netdata
# Should show: active (running)

# Check version
netdata -V

# Check listening port
sudo netstat -tlnp | grep 19999
# Should show: netdata listening on 0.0.0.0:19999
```

---

## Step 2: Configure Docker Monitoring

Netdata auto-detects Docker, but let's verify and optimize:

```bash
# Netdata needs access to Docker socket
sudo usermod -aG docker netdata

# Restart Netdata to apply group change
sudo systemctl restart netdata

# Verify Docker plugin is active
curl -s http://localhost:19999/api/v1/charts | grep -i docker

# Check Docker containers are detected
curl -s "http://localhost:19999/api/v1/charts" | jq '.charts | keys | map(select(contains("docker")))'
```

**Expected output**: Should show Docker-related charts like:
- `docker.cpu`
- `docker.mem`
- `docker.net`
- `docker_container_*.cpu`

---

## Step 3: Configure Netdata for Internal Network Access

By default, Netdata binds to all interfaces. Let's secure it:

```bash
# Edit Netdata configuration
sudo nano /etc/netdata/netdata.conf

# Find [web] section and modify:
[web]
    bind to = 0.0.0.0
    # Allow access from internal network only
    allow connections from = localhost 192.168.1.*
    
    # Optional: Disable gzip compression for faster API responses
    enable gzip compression = no
```

**Or use automated configuration**:

```bash
# Create custom config snippet
sudo tee /etc/netdata/netdata.conf.d/aiops.conf > /dev/null <<'NETDATA_CONFIG'
[web]
    bind to = 0.0.0.0:19999
    allow connections from = localhost 192.168.1.*
    enable gzip compression = no
    
[global]
    # Update every second (default)
    update every = 1
    
    # Keep metrics for 1 hour in memory
    history = 3600
    
    # Memory mode: save to disk on shutdown
    memory mode = dbengine
    
[plugins]
    # Ensure Docker plugin is enabled
    cgroups = yes
    
[plugin:cgroups]
    # Monitor Docker containers
    enable running cgroup network interfaces = yes
    enable running cgroup network bandwidth = yes
NETDATA_CONFIG

# Restart to apply
sudo systemctl restart netdata
```

---

## Step 4: Test Netdata API Access

**From server laptop**:

```bash
SERVER_IP=$(hostname -I | awk '{print $1}')

# Test Netdata info endpoint
curl -s "http://$SERVER_IP:19999/api/v1/info" | jq .

# Get available charts
curl -s "http://$SERVER_IP:19999/api/v1/charts" | jq '.charts | keys' | head -20

# Test CPU metrics
curl -s "http://$SERVER_IP:19999/api/v1/data?chart=system.cpu&after=-10&format=json" | jq .

# Test memory metrics
curl -s "http://$SERVER_IP:19999/api/v1/data?chart=system.ram&after=-10&format=json" | jq .

# Test Docker container metrics
curl -s "http://$SERVER_IP:19999/api/v1/charts" | jq '.charts | keys | map(select(contains("docker")))' | head -10
```

**From AIOps command center laptop**:

```bash
SERVER_IP="192.168.1.100"  # Your server IP

# Test connection
curl -I "http://$SERVER_IP:19999"
# Expected: HTTP/1.1 200 OK

# Get system info
curl -s "http://$SERVER_IP:19999/api/v1/info" | jq '{
  hostname,
  version,
  os_name,
  cpu_freq,
  total_ram,
  total_disk_space
}'

# Get real-time CPU usage
curl -s "http://$SERVER_IP:19999/api/v1/data?chart=system.cpu&after=-5&format=json" | jq '.data[-1]'
```

---

## Step 5: Access Netdata Dashboard

**From any device on internal network**:

Open browser and navigate to:
```
http://192.168.1.100:19999
```

**What you should see**:
- Real-time dashboard with all system metrics
- CPU, RAM, Disk, Network graphs
- Docker container section (if containers running)
- Process list with resource usage
- Alarms section (health checks)

**Key dashboard sections**:
1. **System Overview** - CPU, RAM, Disk at a glance
2. **CPUs** - Per-core usage
3. **Memory** - RAM and swap details
4. **Disks** - I/O and space usage
5. **Network** - Traffic and errors
6. **Docker Containers** - Per-container resources
7. **Applications** - Process-level monitoring

---

## Step 6: Configure Health Checks and Alarms

Netdata has built-in alarms. Let's customize for our use case:

```bash
# View active alarms
curl -s "http://localhost:19999/api/v1/alarms" | jq .

# Create custom alarm configuration
sudo tee /etc/netdata/health.d/aiops-wordpress.conf > /dev/null <<'ALARM_CONFIG'
# AIOPS WordPress Server Custom Alarms

# CPU usage alarm
alarm: cpu_usage_high
   on: system.cpu
class: System
 type: Utilization
component: CPU
   os: linux
hosts: *
 calc: $user + $system
units: %
every: 10s
 warn: $this > 70
 crit: $this > 90
delay: down 15m multiplier 1.5 max 1h
 info: System CPU utilization is high
   to: sysadmin

# Memory usage alarm  
alarm: ram_usage_high
   on: system.ram
class: System
 type: Utilization
component: Memory
   os: linux
hosts: *
 calc: ($used - $buffers - $cached) * 100 / $used
units: %
every: 10s
 warn: $this > 80
 crit: $this > 95
delay: down 15m multiplier 1.5 max 1h
 info: System memory utilization is high
   to: sysadmin

# Disk space alarm
alarm: disk_space_full
   on: disk_space._
class: Disk
 type: Utilization
component: Disk
   os: linux
hosts: *
 calc: $used * 100 / ($avail + $used)
units: %
every: 60s
 warn: $this > 80
 crit: $this > 95
delay: up 2m down 15m multiplier 1.5 max 1h
 info: Disk space utilization is high
   to: sysadmin

# DDEV container health
alarm: ddev_container_down
   on: docker.count
class: Container
 type: Availability
component: Docker
   os: linux
hosts: *
lookup: min -1m of running
units: containers
every: 10s
 warn: $this < 3
 crit: $this < 2
delay: down 5m multiplier 1.5 max 1h
 info: DDEV containers may be down
   to: sysadmin
ALARM_CONFIG

# Restart Netdata to load alarms
sudo systemctl restart netdata

# View active alarms
curl -s "http://localhost:19999/api/v1/alarms?active" | jq .
```

---

## Step 7: Enable Netdata API Access

Configure for programmatic access from AIOps:

```bash
# Netdata API is enabled by default
# Verify endpoints are accessible

# Health endpoint (for monitoring Netdata itself)
curl -s "http://localhost:19999/api/v1/info" | jq '.version'

# Badge endpoints (simple status)
curl "http://localhost:19999/api/v1/badge.svg?chart=system.cpu&alarm=cpu_usage_high"

# Data endpoint (time-series metrics)
curl -s "http://localhost:19999/api/v1/data?chart=system.cpu&format=json&after=-60" | jq '.data | length'
# Should return ~60 data points (1 per second for last minute)
```

---

## Step 8: Optimize Netdata for Production

```bash
# Create performance tuning config
sudo tee /etc/netdata/netdata.conf.d/performance.conf > /dev/null <<'PERF_CONFIG'
[global]
    # Update every 2 seconds instead of 1 (reduces overhead)
    update every = 2
    
    # Keep 2 hours of metrics in memory
    history = 7200
    
    # Use database engine for persistence
    memory mode = dbengine
    page cache size = 32
    dbengine disk space = 256

[web]
    # Web server threads
    web server threads = 4
    
    # Compression for bandwidth savings
    enable gzip compression = yes
    gzip compression level = 3

[plugins]
    # Disable unnecessary plugins
    apps = yes
    cgroups = yes
    diskspace = yes
    # Disable some less critical plugins
    tc = no
    idlejitter = no
PERF_CONFIG

sudo systemctl restart netdata
```

---

## Step 9: Firewall Configuration

Ensure port 19999 is accessible internally:

```bash
# Check if firewall is active
sudo ufw status

# If active, allow from internal network
sudo ufw allow from 192.168.1.0/24 to any port 19999 proto tcp

# Verify rule
sudo ufw status numbered
```

---

## Step 10: Validation Script

```bash
cat > ~/validate-phase3.sh <<'SCRIPT'
#!/bin/bash
set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m'

validate() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ $1${NC}"
  else
    echo -e "${RED}✗ $1${NC}"
    exit 1
  fi
}

echo "=== Phase 3 Validation ==="
echo ""

SERVER_IP=$(hostname -I | awk '{print $1}')

# 1. Netdata service running
systemctl is-active netdata > /dev/null 2>&1
validate "Netdata service running"

# 2. Port 19999 listening
sudo netstat -tlnp | grep :19999 | grep netdata > /dev/null 2>&1
validate "Netdata listening on port 19999"

# 3. API responding
curl -s -I "http://$SERVER_IP:19999/api/v1/info" | grep "HTTP" | grep "200" > /dev/null 2>&1
validate "Netdata API responding"

# 4. Charts available
CHARTS=$(curl -s "http://$SERVER_IP:19999/api/v1/charts" | jq '.charts | length')
[ "$CHARTS" -gt 50 ]
validate "Netdata has $CHARTS charts available"

# 5. Docker monitoring active
curl -s "http://$SERVER_IP:19999/api/v1/charts" | grep -i "docker" > /dev/null 2>&1
validate "Docker container monitoring active"

# 6. Alarms configured
curl -s "http://$SERVER_IP:19999/api/v1/alarms" | jq '.alarms | length' > /dev/null 2>&1
validate "Health alarms configured"

# 7. Data collection working
DATA_POINTS=$(curl -s "http://$SERVER_IP:19999/api/v1/data?chart=system.cpu&after=-60&format=json" | jq '.data | length')
[ "$DATA_POINTS" -gt 10 ]
validate "Time-series data collection active ($DATA_POINTS points/min)"

echo ""
echo "=== Phase 3 Complete ==="
echo "Netdata dashboard: http://$SERVER_IP:19999"
echo "API endpoint: http://$SERVER_IP:19999/api/v1/"
echo "Ready for Phase 4: AIOps Integration"
SCRIPT

chmod +x ~/validate-phase3.sh
./validate-phase3.sh
```

---

## Key Netdata API Endpoints for AIOps

Document these for Phase 4 integration:

```bash
SERVER_IP="192.168.1.100"

# System info
curl "http://$SERVER_IP:19999/api/v1/info"

# All available charts
curl "http://$SERVER_IP:19999/api/v1/charts"

# CPU usage (last 60 seconds)
curl "http://$SERVER_IP:19999/api/v1/data?chart=system.cpu&after=-60"

# Memory usage
curl "http://$SERVER_IP:19999/api/v1/data?chart=system.ram&after=-60"

# Disk I/O
curl "http://$SERVER_IP:19999/api/v1/data?chart=system.io&after=-60"

# Network traffic
curl "http://$SERVER_IP:19999/api/v1/data?chart=system.net&after=-60"

# Docker container CPU
curl "http://$SERVER_IP:19999/api/v1/charts" | grep docker_container

# Active alarms
curl "http://$SERVER_IP:19999/api/v1/alarms?active"

# All alarms with status
curl "http://$SERVER_IP:19999/api/v1/alarms?all"
```

---

## Troubleshooting

### Netdata won't start
```bash
# Check logs
sudo journalctl -u netdata -n 50 --no-pager

# Check permissions
ls -la /var/lib/netdata/
sudo chown -R netdata:netdata /var/lib/netdata/

# Rebuild configuration
sudo /usr/libexec/netdata/plugins.d/cgroup-network --debug
```

### Docker containers not showing
```bash
# Check netdata is in docker group
groups netdata | grep docker

# If not:
sudo usermod -aG docker netdata
sudo systemctl restart netdata

# Check cgroups are accessible
ls -la /sys/fs/cgroup/
```

### High CPU usage from Netdata
```bash
# Reduce update frequency
sudo nano /etc/netdata/netdata.conf
# Change: update every = 3  # Instead of 1

# Disable plugins
sudo nano /etc/netdata/netdata.conf
# Set plugins to "no" that you don't need

sudo systemctl restart netdata
```

---

## Rollback Procedure

```bash
# Stop Netdata
sudo systemctl stop netdata
sudo systemctl disable netdata

# Uninstall (if needed)
sudo /usr/libexec/netdata-uninstaller.sh --yes

# Remove configuration
sudo rm -rf /etc/netdata/
sudo rm -rf /var/lib/netdata/
sudo rm -rf /var/cache/netdata/
```

---

## Next Steps

✅ **Phase 3 Complete!**

**Netdata is now monitoring**:
- System resources (CPU, RAM, Disk, Network)
- Docker containers (including DDEV)
- Process-level metrics
- Health alarms

**Accessible at**: `http://192.168.1.100:19999`

**Proceed to Phase 4**: AIOps Integration

**What we accomplished**:
- ✅ Netdata installed and running
- ✅ Docker monitoring enabled
- ✅ API accessible from internal network
- ✅ Health alarms configured
- ✅ Real-time metrics collection active
