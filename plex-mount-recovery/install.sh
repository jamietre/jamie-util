#!/bin/bash
set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "Installing plex-mount-recovery..."

# Install script
cp "$SCRIPT_DIR/files/check-media-mounts.sh" /usr/local/bin/check-media-mounts.sh
chmod +x /usr/local/bin/check-media-mounts.sh

# Install systemd units
cp "$SCRIPT_DIR/files/check-media-mounts.service" /etc/systemd/system/check-media-mounts.service
cp "$SCRIPT_DIR/files/check-media-mounts.timer" /etc/systemd/system/check-media-mounts.timer

# Reload and enable
systemctl daemon-reload
systemctl enable check-media-mounts.timer
systemctl start check-media-mounts.timer

echo "Installed and started. Check status with:"
echo "  systemctl status check-media-mounts.timer"
echo "  systemctl status check-media-mounts.service"
