# Phase 1: Server Laptop Preparation & Network Setup

## Overview
This phase establishes a stable network foundation and verifies DDEV WordPress is operational.

**Duration**: ~30 minutes  
**Risk Level**: Low  
**Rollback**: Simple (just revert network config)

---

## Prerequisites Check

Run these commands on the **server laptop** to verify readiness:

```bash
# 1. Check OS version
lsb_release -a

# 2. Check DDEV is installed
ddev version

# 3. Check Docker is running
docker ps

# 4. Check current IP address
ip addr show | grep 'inet ' | grep -v '127.0.0.1'

# 5. Check network interface name (usually wlan0 or wlp*)
ip link show | grep -E "wlan|wlp"
```

**Expected outputs**:
- OS: Ubuntu 20.04+ or Debian-based
- DDEV: Any version (e.g., v1.22.x)
- Docker: Running with containers listed
- IP: Something like `192.168.1.x` or `192.168.0.x`
- Interface: `wlan0` or `wlp3s0` or similar

---

## Step 1: Identify Your Network Configuration

```bash
# Get your current network details
echo "=== Current Network Configuration ==="
echo "IP Address:"
hostname -I

echo -e "\nDefault Gateway:"
ip route | grep default

echo -e "\nDNS Servers:"
cat /etc/resolv.conf | grep nameserver

echo -e "\nSubnet/Netmask:"
ip addr show | grep 'inet ' | grep -v '127.0.0.1'

# Save this info - you'll need it!
```

**Record these values**:
- Current IP: `_________________` (e.g., 192.168.1.105)
- Gateway: `_________________` (e.g., 192.168.1.1)
- Subnet: `_________________` (e.g., 192.168.1.0/24)
- DNS: `_________________` (e.g., 192.168.1.1 or 8.8.8.8)
- Interface: `_________________` (e.g., wlan0)

---

## Step 2: Choose Static IP Approach

### Option A: DHCP Reservation (Recommended)

**Advantages**: Survives reboots, managed centrally, reversible  
**Requirement**: Router admin access

1. Find your MAC address:
```bash
ip link show wlan0 | grep link/ether
# Output: link/ether aa:bb:cc:dd:ee:ff
```

2. Log into your router (usually http://192.168.1.1)
3. Navigate to DHCP settings → DHCP Reservation
4. Add reservation:
   - MAC Address: `aa:bb:cc:dd:ee:ff`
   - IP Address: `192.168.1.100` (choose unused IP)
   - Hostname: `aiops-server`

5. Reboot server laptop:
```bash
sudo reboot
```

6. After reboot, verify:
```bash
hostname -I
# Should show 192.168.1.100
```

### Option B: Manual Static IP (If no router access)

**⚠️ Warning**: Can cause IP conflicts if not careful

1. Create netplan configuration backup:
```bash
sudo cp /etc/netplan/*.yaml /etc/netplan/backup-$(date +%Y%m%d).yaml
```

2. Identify your netplan file:
```bash
ls -la /etc/netplan/
# Usually: 01-netcfg.yaml or 50-cloud-init.yaml
```

3. Create new static IP configuration:
```bash
# Replace <INTERFACE> with your wireless interface (e.g., wlan0)
# Replace IPs with values recorded in Step 1

sudo tee /etc/netplan/99-aiops-static.yaml > /dev/null <<'EOF'
network:
  version: 2
  renderer: networkd
  wifis:
    <INTERFACE>:
      dhcp4: no
      addresses:
        - 192.168.1.100/24
      routes:
        - to: default
          via: 192.168.1.1
      nameservers:
        addresses:
          - 192.168.1.1
          - 8.8.8.8
      access-points:
        "YOUR_WIFI_SSID":
          password: "YOUR_WIFI_PASSWORD"
EOF
```

4. **IMPORTANT**: Edit the file with your actual values:
```bash
sudo nano /etc/netplan/99-aiops-static.yaml
# Replace:
# - <INTERFACE> with wlan0 (or your interface name)
# - 192.168.1.100 with your chosen static IP
# - 192.168.1.1 with your gateway
# - YOUR_WIFI_SSID with your network name
# - YOUR_WIFI_PASSWORD with your password
```

5. Test configuration (dry-run):
```bash
sudo netplan try
# Press ENTER to accept if network works, Ctrl+C to revert
```

6. Apply permanently:
```bash
sudo netplan apply
```

7. Verify new IP:
```bash
ip addr show | grep 'inet '
ping -c 3 8.8.8.8
ping -c 3 192.168.1.1
```

---

## Step 3: Verify DDEV WordPress Site

```bash
# Navigate to your DDEV project
cd ~/my-wordpress-site  # Adjust path as needed

# Check DDEV status
ddev describe

# Record these values:
# - Project name: _______________
# - HTTP URL: _______________
# - HTTPS URL: _______________
# - Router HTTP port: _______________
# - Router HTTPS port: _______________
```

**Start DDEV if not running**:
```bash
ddev start
```

**Test WordPress locally**:
```bash
# Test HTTP access
curl -I http://127.0.0.1

# Or use the DDEV URL
curl -I $(ddev describe | grep "HTTP URL" | awk '{print $NF}')

# Should return: HTTP/1.1 200 OK or 301/302
```

**Access from browser on server laptop**:
```bash
# Get the DDEV URL
ddev describe | grep "HTTP URL"

# Open in browser (if running GUI):
xdg-open $(ddev describe | grep "HTTP URL" | awk '{print $NF}')
```

---

## Step 4: Understand DDEV's Network Architecture

**Critical Understanding** (read carefully):

```bash
# DDEV creates a Docker network
docker network ls | grep ddev

# DDEV containers
docker ps | grep ddev

# DDEV router (traefik/nginx-proxy)
docker ps | grep ddev-router
```

**How DDEV routing works**:
1. DDEV binds ports 80/443 to `ddev-router` container
2. Router uses virtual hosts (server names) to route traffic
3. Your site URL: `http://projectname.ddev.site`
4. Router proxies based on `Host:` header

**Why we need Nginx reverse proxy**:
- DDEV's router expects `projectname.ddev.site` hostname
- We need stable access via `http://192.168.1.100:8080`
- Cannot modify DDEV router (breaks DDEV updates)
- Solution: External Nginx → DDEV router with proper headers

---

## Step 5: Test Internal Network Access

**From server laptop**, verify you can reach yourself:

```bash
# Test ping
ping -c 3 192.168.1.100

# Test SSH (if enabled)
ssh localhost

# Test HTTP port 80 (DDEV)
curl -H "Host: projectname.ddev.site" http://127.0.0.1
```

**From AIOps command center laptop**, test server access:

```bash
# Replace with your server's static IP
SERVER_IP="192.168.1.100"

# Test ping
ping -c 3 $SERVER_IP

# Test SSH
ssh user@$SERVER_IP

# Test if port 80 responds
curl -I http://$SERVER_IP
# Should get: Empty reply or connection refused (expected - DDEV needs proper Host header)
```

---

## Step 6: Validation Checklist

Run this validation script on **server laptop**:

```bash
cat > ~/validate-phase1.sh <<'SCRIPT'
#!/bin/bash
set -e

echo "=== Phase 1 Validation Script ==="
echo ""

# Color codes
GREEN='\033[0;32m'
RED='\033[0;31m'
NC='\033[0m' # No Color

validate() {
  if [ $? -eq 0 ]; then
    echo -e "${GREEN}✓ $1${NC}"
  else
    echo -e "${RED}✗ $1${NC}"
    exit 1
  fi
}

# 1. Check static IP
CURRENT_IP=$(hostname -I | awk '{print $1}')
echo "Current IP: $CURRENT_IP"
[[ "$CURRENT_IP" =~ ^192\.168\. ]] || exit 1
validate "Static IP configured (192.168.x.x range)"

# 2. Check internet connectivity
ping -c 2 8.8.8.8 > /dev/null 2>&1
validate "Internet connectivity"

# 3. Check gateway reachable
GATEWAY=$(ip route | grep default | awk '{print $3}')
ping -c 2 $GATEWAY > /dev/null 2>&1
validate "Gateway reachable ($GATEWAY)"

# 4. Check DDEV running
ddev version > /dev/null 2>&1
validate "DDEV installed"

# 5. Check Docker running
docker ps > /dev/null 2>&1
validate "Docker running"

# 6. Check DDEV site running
if [ -d "~/my-wordpress-site" ]; then  # Adjust path
  cd ~/my-wordpress-site
  ddev describe > /dev/null 2>&1
  validate "DDEV site running"
fi

# 7. Check DDEV router
docker ps | grep ddev-router > /dev/null 2>&1
validate "DDEV router container active"

echo ""
echo "=== Phase 1 Complete ==="
echo "Server IP: $CURRENT_IP"
echo "Ready for Phase 2: Nginx Reverse Proxy Setup"
SCRIPT

chmod +x ~/validate-phase1.sh
./validate-phase1.sh
```

**Expected output**:
```
=== Phase 1 Validation Script ===

Current IP: 192.168.1.100
✓ Static IP configured (192.168.x.x range)
✓ Internet connectivity
✓ Gateway reachable (192.168.1.1)
✓ DDEV installed
✓ Docker running
✓ DDEV site running
✓ DDEV router container active

=== Phase 1 Complete ===
Server IP: 192.168.1.100
Ready for Phase 2: Nginx Reverse Proxy Setup
```

---

## Troubleshooting

### Static IP not working
```bash
# Check netplan syntax
sudo netplan --debug try

# Check NetworkManager conflicts
systemctl status NetworkManager
# If active, you may need to use NetworkManager instead of netplan

# Revert to DHCP
sudo rm /etc/netplan/99-aiops-static.yaml
sudo netplan apply
```

### DDEV site not accessible
```bash
# Restart DDEV
ddev restart

# Check logs
ddev logs

# Rebuild containers
ddev poweroff
ddev start
```

### Cannot ping server from command center
```bash
# Check firewall on server
sudo ufw status
# If active, allow from internal network:
sudo ufw allow from 192.168.1.0/24

# Check iptables
sudo iptables -L -n
```

---

## Rollback Procedure

If anything goes wrong:

```bash
# 1. Revert network config
sudo rm /etc/netplan/99-aiops-static.yaml
sudo netplan apply

# 2. Or use DHCP reservation rollback
# Remove reservation from router settings

# 3. Restart DDEV
ddev poweroff
ddev start
```

---

## Next Steps

Once validation passes:
1. Record your server's static IP: `192.168.1.100`
2. Proceed to **Phase 2: Nginx Reverse Proxy Setup**
3. Keep this terminal session open for reference

**Important values to carry forward**:
- Server Static IP: `192.168.1.100`
- DDEV Project Name: `_____________`
- DDEV HTTP Port: Usually `80`
- Internal network subnet: `192.168.1.0/24`
