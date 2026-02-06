# Quick Start Guide - USB SMART Monitor

## Prerequisites

- Linux machine or WSL2 on Windows
- Docker installed and running
- Git installed
- SSH access to Synology NAS (synology2)

## Step 1: Setup Build Environment

```bash
# Navigate to project directory (WSL path)
cd /mnt/c/code/jamie-util/usb-status

# Clone spksrc
git clone https://github.com/SynoCommunity/spksrc.git
cd spksrc

# Build Docker image (takes 5-10 minutes)
docker build -t spksrc-builder .
```

## Step 2: Create Directory Structure

```bash
# Create package directories
mkdir -p cross/usb-smart-monitor/src/bin
mkdir -p cross/usb-smart-monitor/src/server
mkdir -p cross/usb-smart-monitor/src/cli
mkdir -p cross/usb-smart-monitor/src/ui
mkdir -p spk/usb-smart-monitor/src
```

## Step 3: Copy Binaries from NAS

```bash
# Copy hdsentinel binaries
scp admin@synology2:/volume1/homes/admin/scripts/hdsentinel/hdsentinel \
    cross/usb-smart-monitor/src/bin/

scp admin@synology2:/volume1/homes/admin/scripts/hdsentinel/detjm \
    cross/usb-smart-monitor/src/bin/

# Make executable
chmod +x cross/usb-smart-monitor/src/bin/*

# Verify
ls -lh cross/usb-smart-monitor/src/bin/
```

## Step 4: Create Core Files

### 4.1 SPK Makefile

```bash
# Create spk/usb-smart-monitor/Makefile
cat > spk/usb-smart-monitor/Makefile << 'EOF'
SPK_NAME = usb-smart-monitor
SPK_VERS = 1.0.0
SPK_REV = 1
SPK_ICON = src/usb-smart-monitor.png

DEPENDS = cross/usb-smart-monitor cross/node

MAINTAINER = Jamie
DESCRIPTION = Monitor USB device SMART status using hdsentinel. Provides web dashboard and CLI tools.
DISPLAY_NAME = USB SMART Monitor
HOMEPAGE = https://github.com/jamie-util/usb-status
LICENSE = MIT

STARTABLE = yes
SERVICE_USER = auto
SERVICE_SETUP = src/service-setup.sh
SERVICE_PORT = 8280
SERVICE_PORT_PROTOCOL = http
SERVICE_URL = /
SERVICE_COMMAND = $${SYNOPKG_PKGDEST}/share/usb-smart-monitor/server/server.js

SPK_COMMANDS = bin/usb-smart-check

SUPPORTED_ARCHS = x86_64
REQUIRED_MIN_DSM = 7.0

include ../../mk/spksrc.spk.mk
EOF
```

### 4.2 Service Setup Script

```bash
# Create spk/usb-smart-monitor/src/service-setup.sh
cat > spk/usb-smart-monitor/src/service-setup.sh << 'EOF'
#!/bin/bash

service_postinst() {
    mkdir -p ${SYNOPKG_PKGDEST}/etc
    mkdir -p ${SYNOPKG_PKGDEST}/var/db

    if [ ! -f ${SYNOPKG_PKGDEST}/etc/config.json ]; then
        cat > ${SYNOPKG_PKGDEST}/etc/config.json <<'CONFIGEOF'
{
  "monitoring": {
    "enabled": true,
    "checkInterval": 3600,
    "autoDetect": true,
    "devices": []
  },
  "thresholds": {
    "healthMin": 100,
    "interfaceRequired": "JMICRON"
  },
  "notifications": {
    "enabled": true,
    "methods": ["dsm", "syslog"],
    "onFailure": true
  },
  "server": {
    "port": 8280
  }
}
CONFIGEOF
    fi

    chown -R ${EFF_USER}:${USER} ${SYNOPKG_PKGDEST}/etc
    chown -R ${EFF_USER}:${USER} ${SYNOPKG_PKGDEST}/var
    chmod 755 ${SYNOPKG_PKGDEST}/bin/*

    echo "${EFF_USER} ALL=(ALL) NOPASSWD: ${SYNOPKG_PKGDEST}/bin/hdsentinel" > /etc/sudoers.d/usb-smart-monitor
    chmod 440 /etc/sudoers.d/usb-smart-monitor
}

service_prestart() {
    echo "Starting USB SMART Monitor service..."
}

service_postuninst() {
    rm -f /etc/sudoers.d/usb-smart-monitor
}
EOF

chmod +x spk/usb-smart-monitor/src/service-setup.sh
```

### 4.3 Cross Package Makefile

```bash
# Create cross/usb-smart-monitor/Makefile
cat > cross/usb-smart-monitor/Makefile << 'EOF'
PKG_NAME = usb-smart-monitor
PKG_VERS = 1.0.0
PKG_EXT = tar.gz
PKG_DIR = $(PKG_NAME)-$(PKG_VERS)

DEPENDS = cross/node

HOMEPAGE = https://github.com/jamie-util/usb-status
COMMENT = USB SMART monitoring tool using hdsentinel
LICENSE = MIT

INSTALL_TARGET = usb_smart_monitor_install

include ../../mk/spksrc.cross-cc.mk

.PHONY: usb_smart_monitor_install
usb_smart_monitor_install:
	mkdir -p $(STAGING_INSTALL_PREFIX)/bin
	mkdir -p $(STAGING_INSTALL_PREFIX)/share/usb-smart-monitor

	cp -p $(WORK_DIR)/src/bin/* $(STAGING_INSTALL_PREFIX)/bin/
	chmod 755 $(STAGING_INSTALL_PREFIX)/bin/*

	cp -r $(WORK_DIR)/src/server $(STAGING_INSTALL_PREFIX)/share/usb-smart-monitor/
	cp -r $(WORK_DIR)/src/ui $(STAGING_INSTALL_PREFIX)/share/usb-smart-monitor/

	cd $(STAGING_INSTALL_PREFIX)/share/usb-smart-monitor/server && npm install --production
EOF
```

### 4.4 CLI Wrapper Script

```bash
# Create cross/usb-smart-monitor/src/cli/usb-smart-check
cat > cross/usb-smart-monitor/src/cli/usb-smart-check << 'EOF'
#!/bin/bash
HDSENTINEL_BIN="/var/packages/usb-smart-monitor/target/bin/hdsentinel"
DEVICE=""
JSON_OUTPUT=0
VERBOSE=0

while [[ $# -gt 0 ]]; do
    case $1 in
        --device) DEVICE="$2"; shift 2 ;;
        --json) JSON_OUTPUT=1; shift ;;
        --verbose) VERBOSE=1; shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

if [ -z "$DEVICE" ]; then
    echo "Error: --device required"
    exit 1
fi

cd "$(dirname "$HDSENTINEL_BIN")"
output=$(sudo ./hdsentinel -onlydevs "$DEVICE" 2>&1)
exit_code=$?

if [ $exit_code -ne 0 ]; then
    if [ $JSON_OUTPUT -eq 1 ]; then
        echo "{\"error\": \"hdsentinel failed\", \"exitCode\": $exit_code}"
    else
        echo "Error: hdsentinel failed"
    fi
    exit 1
fi

health=$(echo "$output" | grep "Health" | awk '{print $3}' | tr -d '%')
interface=$(echo "$output" | grep "Interface" | awk -F': ' '{print $2}')

if [ $JSON_OUTPUT -eq 1 ]; then
    echo "{\"path\": \"$DEVICE\", \"health\": $health, \"interface\": \"$interface\", \"timestamp\": \"$(date -Iseconds)\", \"status\": \"$([ $health -eq 100 ] && echo 'healthy' || echo 'warning')\"}"
else
    echo "Device: $DEVICE"
    echo "Health: $health%"
    echo "Interface: $interface"
fi

exit 0
EOF

chmod +x cross/usb-smart-monitor/src/cli/usb-smart-check
```

## Step 5: Create Node.js Backend

```bash
# Initialize Node.js project
cd cross/usb-smart-monitor/src/server
npm init -y
npm install express sqlite3 body-parser

# Create server.js (see full plan for complete code)
cat > server.js << 'EOF'
const express = require('express');
const path = require('path');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 8280;

app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../ui')));

app.get('/api/status', (req, res) => {
    res.json({ status: 'ok', version: '1.0.0' });
});

app.get('/api/devices', (req, res) => {
    // TODO: Implement device listing
    res.json({ devices: [] });
});

app.listen(PORT, () => {
    console.log(`USB SMART Monitor listening on port ${PORT}`);
});
EOF

cd ../../../../
```

## Step 6: Create Basic Web UI

```bash
# Create index.html
mkdir -p cross/usb-smart-monitor/src/ui/css
mkdir -p cross/usb-smart-monitor/src/ui/js

cat > cross/usb-smart-monitor/src/ui/index.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>USB SMART Monitor</title>
    <link rel="stylesheet" href="css/styles.css">
</head>
<body>
    <div class="container">
        <header>
            <h1>USB SMART Monitor</h1>
            <button id="refresh-btn" class="btn-primary">Refresh</button>
        </header>
        <section class="devices">
            <h2>Devices</h2>
            <div id="device-list"></div>
        </section>
    </div>
    <script src="js/app.js"></script>
</body>
</html>
EOF

cat > cross/usb-smart-monitor/src/ui/css/styles.css << 'EOF'
body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    margin: 0;
    padding: 20px;
    background: #f5f5f5;
}
.container { max-width: 1200px; margin: 0 auto; }
header { display: flex; justify-content: space-between; align-items: center; }
.btn-primary { background: #0066cc; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
.devices { margin-top: 20px; }
#device-list { display: grid; gap: 15px; margin-top: 15px; }
EOF

cat > cross/usb-smart-monitor/src/ui/js/app.js << 'EOF'
async function loadDevices() {
    const response = await fetch('/api/devices');
    const data = await response.json();
    document.getElementById('device-list').innerHTML =
        data.devices.length === 0 ? 'No devices found' :
        data.devices.map(d => `<div>${d.path} - ${d.health}%</div>`).join('');
}

document.getElementById('refresh-btn').addEventListener('click', loadDevices);
loadDevices();
EOF
```

## Step 7: Build the Package

```bash
# Run Docker container
docker run -it -v $(pwd):/spksrc spksrc-builder /bin/bash

# Inside Docker container:
cd /spksrc/cross/usb-smart-monitor
make arch-x64-7.1

cd /spksrc/spk/usb-smart-monitor
make arch-x64-7.1

# Exit container
exit

# Package will be in packages/ directory
ls -lh packages/usb-smart-monitor-*.spk
```

## Step 8: Install on Synology

```bash
# Copy to NAS
scp packages/usb-smart-monitor-1.0.0-1.spk admin@synology2:/tmp/

# SSH to NAS
ssh admin@synology2

# Install package
sudo synopkg install /tmp/usb-smart-monitor-1.0.0-1.spk

# Start service
sudo synopkg start usb-smart-monitor

# Check status
sudo synopkg status usb-smart-monitor

# Test CLI
/var/packages/usb-smart-monitor/target/bin/usb-smart-check --device /dev/usb1 --verbose
```

## Step 9: Access Web UI

Open browser to: `http://synology2:8280`

## Troubleshooting

### Check Logs
```bash
# Package logs
tail -f /var/log/packages/usb-smart-monitor.log

# System logs
tail -f /var/log/messages | grep usb-smart
```

### Verify Installation
```bash
# Check files
ls -la /var/packages/usb-smart-monitor/target/

# Check service
sudo synopkg status usb-smart-monitor

# Check port
netstat -tulpn | grep 8280
```

### Reinstall
```bash
sudo synopkg stop usb-smart-monitor
sudo synopkg uninstall usb-smart-monitor
sudo synopkg install /tmp/usb-smart-monitor-1.0.0-1.spk
sudo synopkg start usb-smart-monitor
```

## Next Steps

1. Enhance backend with full monitoring logic
2. Improve web UI with device details and charts
3. Add notification system
4. Test with multiple devices
5. Create package icons

See full plan at: `C:\Users\jamie\.claude\plans\inherited-stargazing-sketch.md`
