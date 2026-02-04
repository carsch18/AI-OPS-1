# Phase 2: Nginx Reverse Proxy Setup

## Overview
Set up Nginx as a stable reverse proxy in front of DDEV WordPress without modifying DDEV internals.

**Duration**: ~20 minutes  
**Risk Level**: Low (Nginx is separate from DDEV)  
**Rollback**: Stop Nginx service

---

## Architecture Diagram

```
External Request (192.168.1.100:8080)
         ↓
    Nginx Reverse Proxy (port 8080)
         ↓ (proxy_pass with Host header)
    DDEV Router (port 80, docker network)
         ↓
    WordPress Container
```

**Key Concept**: Nginx adds the correct `Host:` header that DDEV expects, enabling access via IP address.

---

## Step 1: Install Nginx

```bash
# Update package list
sudo apt update

# Install Nginx
sudo apt install -y nginx

# Verify installation
nginx -v
# Expected: nginx version: nginx/1.18.0 or higher

# Check status
systemctl status nginx
# Should be active (running)
```

---

## Step 2: Get DDEV Project Information

```bash
# Navigate to your DDEV project
cd ~/my-wordpress-site  # Adjust to your actual path

# Get critical DDEV details
echo "=== DDEV Configuration ==="
ddev describe

# Record these values:
DDEV_PROJECT_NAME=$(ddev describe | grep "Project name" | awk '{print $NF}')
DDEV_SITE_URL=$(ddev describe | grep "HTTP URL" | awk '{print $NF}' | sed 's|http://||')

echo "Project Name: $DDEV_PROJECT_NAME"
echo "Site URL: $DDEV_SITE_URL"

# Get DDEV router container info
DDEV_ROUTER_IP=$(docker inspect ddev-router | jq -r '.[0].NetworkSettings.Networks[].IPAddress' | head -1)
echo "DDEV Router IP: $DDEV_ROUTER_IP"

# Alternative if jq not installed:
docker inspect ddev-router | grep '"IPAddress"' | head -1

# Save these values for next steps!
```

**Record**:
- Project Name: `_______________`
- Site URL: `_______________` (e.g., `projectname.ddev.site`)
- Router IP: `_______________` (e.g., `172.18.0.2`)

---

## Step 3: Create Nginx Configuration

**Important**: We'll use a separate config file, not modify the default.

```bash
# Create configuration for DDEV proxy
sudo tee /etc/nginx/sites-available/ddev-wordpress-proxy > /dev/null <<'NGINX_CONFIG'
# AIOPS Internal Server - DDEV WordPress Proxy
# Port 8080 → DDEV WordPress site

upstream ddev_backend {
    # DDEV router runs on localhost:80
    server 127.0.0.1:80;
    
    # Health check settings
    keepalive 32;
    keepalive_timeout 60s;
}

server {
    listen 8080;
    listen [::]:8080;
    
    # Allow access from internal network only
    # Adjust subnet to match your network
    allow 192.168.1.0/24;
    allow 127.0.0.1;
    deny all;
    
    server_name _;  # Accept any server name
    
    # Logging for debugging
    access_log /var/log/nginx/ddev-proxy-access.log;
    error_log /var/log/nginx/ddev-proxy-error.log warn;
    
    # Health check endpoint
    location /health {
        access_log off;
        return 200 "OK\n";
        add_header Content-Type text/plain;
    }
    
    # Nginx status endpoint (optional)
    location /nginx-status {
        stub_status;
        allow 192.168.1.0/24;
        allow 127.0.0.1;
        deny all;
    }
    
    # Main proxy configuration
    location / {
        # Proxy to DDEV router on localhost:80
        proxy_pass http://ddev_backend;
        
        # CRITICAL: Set Host header to DDEV project URL
        # Replace with your actual DDEV site URL
        proxy_set_header Host DDEV_SITE_URL_PLACEHOLDER;
        
        # Standard proxy headers
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_set_header X-Forwarded-Host $host:$server_port;
        
        # Increase timeouts for WordPress admin
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 4k;
        proxy_buffers 8 4k;
        proxy_busy_buffers_size 8k;
        
        # Disable proxy redirect rewriting
        proxy_redirect off;
    }
    
    # PHP file upload size (match WordPress requirements)
    client_max_body_size 64M;
}
NGINX_CONFIG
```

**Now customize with your DDEV values**:

```bash
# Get your DDEV site URL again
cd ~/my-wordpress-site  # Your DDEV project path
DDEV_SITE_URL=$(ddev describe | grep "HTTP URL" | awk '{print $NF}' | sed 's|http://||')

# Replace placeholder in config
sudo sed -i "s/DDEV_SITE_URL_PLACEHOLDER/$DDEV_SITE_URL/" /etc/nginx/sites-available/ddev-wordpress-proxy

# Verify the replacement worked
sudo grep "proxy_set_header Host" /etc/nginx/sites-available/ddev-wordpress-proxy
# Should show: proxy_set_header Host projectname.ddev.site;
```

**If your network is NOT 192.168.1.0/24**, update the allow rules:

```bash
# Example for 192.168.0.0/24:
sudo sed -i 's/192.168.1.0\/24/192.168.0.0\/24/g' /etc/nginx/sites-available/ddev-wordpress-proxy
```

---

## Step 4: Enable the Configuration

```bash
# Create symbolic link to enable site
sudo ln -s /etc/nginx/sites-available/ddev-wordpress-proxy /etc/nginx/sites-enabled/

# Check for any syntax errors
sudo nginx -t
# Expected: nginx: configuration file /etc/nginx/nginx.conf test is successful

# If test fails, check error message and review config file
```

---

## Step 5: Disable Default Nginx Site (Optional but Recommended)

```bash
# Remove default site to avoid conflicts
sudo rm /etc/nginx/sites-enabled/default

# Verify only our config is enabled
ls -la /etc/nginx/sites-enabled/
# Should show only: ddev-wordpress-proxy
```

---

## Step 6: Reload Nginx

```bash
# Reload configuration
sudo systemctl reload nginx

# Verify it's running
systemctl status nginx
# Should show: active (running)

# Check if port 8080 is listening
sudo netstat -tlnp | grep 8080
# or
sudo ss -tlnp | grep 8080
# Should show: nginx listening on 0.0.0.0:8080
```

---

## Step 7: Test Access from Server Laptop

```bash
# Get your server's IP
SERVER_IP=$(hostname -I | awk '{print $1}')

# Test health check endpoint
curl http://$SERVER_IP:8080/health
# Expected: OK

# Test nginx status
curl http://$SERVER_IP:8080/nginx-status
# Expected: Active connections, server stats

# Test WordPress (HTML response)
curl -I http://$SERVER_IP:8080/
# Expected: HTTP/1.1 200 OK or 301/302 redirect

# Full page test
curl -s http://$SERVER_IP:8080/ | head -20
# Should show WordPress HTML

echo "Access WordPress at: http://$SERVER_IP:8080"
```

**Open in browser on server laptop**:
```bash
SERVER_IP=$(hostname -I | awk '{print $1}')
xdg-open "http://$SERVER_IP:8080"
```

---

## Step 8: Test Access from AIOps Command Center

**On your command center laptop**, run these tests:

```bash
# Set server IP
SERVER_IP="192.168.1.100"  # Replace with your server's IP

# Test ping
ping -c 3 $SERVER_IP

# Test health endpoint
curl http://$SERVER_IP:8080/health
# Expected: OK

# Test WordPress home page
curl -I http://$SERVER_IP:8080/
# Expected: HTTP/1.1 200 OK

# Access in browser
xdg-open "http://$SERVER_IP:8080"
# or on macOS: open "http://$SERVER_IP:8080"
# or on Windows: start "http://$SERVER_IP:8080"
```

**Expected behavior**:
- ✅ WordPress site loads correctly
- ✅ Images and CSS/JS assets load
- ✅ Can navigate to different pages
- ✅ WordPress admin accessible at `/wp-admin`

---

## Step 9: Validation Script

**Run on server laptop**:

```bash
cat > ~/validate-phase2.sh <<'SCRIPT'
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

echo "=== Phase 2 Validation ==="
echo ""

SERVER_IP=$(hostname -I | awk '{print $1}')
echo "Server IP: $SERVER_IP"
echo ""

# 1. Nginx installed and running
systemctl is-active nginx > /dev/null 2>&1
validate "Nginx service running"

# 2. Port 8080 listening
sudo netstat -tlnp | grep :8080 | grep nginx > /dev/null 2>&1
validate "Nginx listening on port 8080"

# 3. Health endpoint works
curl -s http://$SERVER_IP:8080/health | grep "OK" > /dev/null 2>&1
validate "Health check endpoint responding"

# 4. WordPress accessible
curl -s -I http://$SERVER_IP:8080/ | grep "HTTP" | grep -E "200|301|302" > /dev/null 2>&1
validate "WordPress site accessible via proxy"

# 5. DDEV still running
docker ps | grep ddev-router > /dev/null 2>&1
validate "DDEV router container still active"

# 6. DDEV site still accessible locally
curl -s -I http://127.0.0.1 | grep "HTTP" > /dev/null 2>&1
validate "DDEV site still accessible locally"

echo ""
echo "=== Phase 2 Complete ==="
echo "WordPress accessible at: http://$SERVER_IP:8080"
echo "Health check: http://$SERVER_IP:8080/health"
echo "Ready for Phase 3: Netdata Metrics Setup"
SCRIPT

chmod +x ~/validate-phase2.sh
./validate-phase2.sh
```

---

## Troubleshooting

### Port 8080 already in use
```bash
# Check what's using port 8080
sudo netstat -tlnp | grep 8080

# If another service is using it, change Nginx to use 8081:
sudo sed -i 's/listen 8080/listen 8081/g' /etc/nginx/sites-available/ddev-wordpress-proxy
sudo nginx -t
sudo systemctl reload nginx
```

### 502 Bad Gateway Error
```bash
# Check DDEV is running
ddev describe

# Check DDEV router is accessible
curl -I http://127.0.0.1
# Should return WordPress response

# Check Nginx error logs
sudo tail -f /var/log/nginx/ddev-proxy-error.log

# Verify Host header in Nginx config
sudo grep "proxy_set_header Host" /etc/nginx/sites-available/ddev-wordpress-proxy
# Should match your DDEV site URL exactly
```

### 403 Forbidden (from allow/deny rules)
```bash
# Check your command center's IP
# On command center laptop: hostname -I

# Add that IP to allowed list:
sudo nano /etc/nginx/sites-available/ddev-wordpress-proxy
# Add line: allow 192.168.1.50;  # Your command center IP

sudo nginx -t
sudo systemctl reload nginx
```

### WordPress loads but CSS/JS broken
```bash
# Check WordPress site URL in database
ddev ssh
wp option get siteurl
wp option get home
exit

# If URLs are http://localhost, update them:
ddev ssh
wp option update siteurl "http://192.168.1.100:8080"
wp option update home "http://192.168.1.100:8080"
exit

# Or use DDEV's router URL (recommended):
# Keep as http://projectname.ddev.site
```

---

## Rollback Procedure

```bash
# Stop Nginx
sudo systemctl stop nginx

# Disable our config
sudo rm /etc/nginx/sites-enabled/ddev-wordpress-proxy

# Restore default site
sudo ln -s /etc/nginx/sites-available/default /etc/nginx/sites-enabled/

# Start Nginx
sudo systemctl start nginx

# DDEV still works normally
# Access via http://localhost or http://projectname.ddev.site
```

---

## Performance Tuning (Optional)

If handling high traffic:

```bash
# Edit main nginx config
sudo nano /etc/nginx/nginx.conf

# Add/modify in http block:
worker_processes auto;
worker_connections 1024;
keepalive_timeout 65;

# Enable gzip compression
gzip on;
gzip_vary on;
gzip_proxied any;
gzip_types text/plain text/css text/xml text/javascript application/json application/javascript;

sudo nginx -t
sudo systemctl reload nginx
```

---

## Next Steps

✅ **Phase 2 Complete!**

Your WordPress site is now accessible at: `http://192.168.1.100:8080`

**Proceed to Phase 3**: Netdata Metrics Installation

**What we accomplished**:
- ✅ Nginx reverse proxy installed
- ✅ WordPress accessible via internal IP
- ✅ Health check endpoint available
- ✅ DDEV remains untouched and functional
- ✅ Internal network access control configured
