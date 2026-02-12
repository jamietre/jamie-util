#!/bin/bash

# Script to check and mount media shares, then ensure Plex is running
# Exits 0 if mounts are available, 1 if not (timer will retry)

# Update with whatever mount points you need to check.
# These should match your fstab entries for auto-mounting.
MOUNTS=("/mnt/media1" "/mnt/media2")
PLEX_SERVICE="plexmediaserver.service"
LOG_TAG="check-media-mounts"

log() {
    logger -t "$LOG_TAG" "$1"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $1"
}

check_mount() {
    local mount_point=$1

    # Check if mountpoint exists and is actually mounted
    if mountpoint -q "$mount_point"; then
        # Try to actually access it (sometimes mount appears up but is stale)
        if timeout 5 ls "$mount_point" > /dev/null 2>&1; then
            return 0
        else
            log "WARNING: $mount_point is mounted but not accessible"
            return 1
        fi
    else
        return 1
    fi
}

attempt_mount() {
    local mount_point=$1
    log "Attempting to mount $mount_point"

    if mount "$mount_point" 2>&1 | logger -t "$LOG_TAG"; then
        log "Successfully mounted $mount_point"
        return 0
    else
        log "Failed to mount $mount_point"
        return 1
    fi
}

# Check all mounts
all_mounted=true
for mount_point in "${MOUNTS[@]}"; do
    if ! check_mount "$mount_point"; then
        log "$mount_point is not available, attempting to mount..."
        if ! attempt_mount "$mount_point"; then
            all_mounted=false
        fi
    else
        log "$mount_point is available"
    fi
done

# If all mounts are now available, ensure Plex is running
if $all_mounted; then
    log "All mounts are available"

    # Check if Plex is active
    if systemctl is-active --quiet "$PLEX_SERVICE"; then
        # When plex is running as a service (not in docker) it
        # can recover from mount points that weren't available at start time.
        # This could be changed to restart always if this doesn't seem to work for you.
        log "Plex is already running"
    else
        # This normally wouldn't happen - plex should start even if the mounts
        # aren't available.
        log "Restarting Plex Media Server..."
        systemctl restart "$PLEX_SERVICE"
        if [ $? -eq 0 ]; then
            log "Plex Media Server restarted successfully"
        else
            log "ERROR: Failed to restart Plex Media Server"
            exit 1
        fi
    fi
    exit 0
else
    log "Not all mounts are available yet, timer will retry"
    exit 1
fi
