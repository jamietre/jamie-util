#!/bin/bash
set -e

echo "Uninstalling plex-mount-recovery..."

systemctl stop check-media-mounts.timer 2>/dev/null || true
systemctl disable check-media-mounts.timer 2>/dev/null || true
systemctl stop check-media-mounts.service 2>/dev/null || true
systemctl disable check-media-mounts.service 2>/dev/null || true

rm -f /etc/systemd/system/check-media-mounts.service
rm -f /etc/systemd/system/check-media-mounts.timer
rm -f /usr/local/bin/check-media-mounts.sh

systemctl daemon-reload

echo "Uninstalled."
