# Plex Mount Recovery

Automatically recovers Plex media mounts after power failures or boot-order issues.

## Problem

When a Plex server (LXC container, VM, etc.) boots before the file server hosting its media shares, Plex starts without library access. This requires a manual restart to recover.

This solution lets Plex start normally (so its UI and other services remain available), then automatically mounts the shares and restarts Plex once they become available.

## How It Works

A **systemd timer** triggers a **oneshot service** that checks if the configured mounts are accessible. If they're not, it attempts to mount them. If all mounts succeed, it restarts Plex.

- **On boot:** Timer fires 2 minutes after boot
- **On failure:** Timer retries every 30 seconds, indefinitely
- **On success:** The service stays active (`RemainAfterExit=yes`), so the timer stops firing automatically
- **Stale mount detection:** The script doesn't just check if a mount exists - it verifies the mount is actually accessible with a 5-second timeout

### Why not use systemd mount dependencies?

We intentionally avoid `Requires=`/`After=` on mount units for Plex. It's better to have Plex running without library access than not running at all - the UI remains available for diagnostics and other Plex services keep working.

## Files

| File                               | Installs to                                      |
| ---------------------------------- | ------------------------------------------------ |
| `files/check-media-mounts.sh`      | `/usr/local/bin/check-media-mounts.sh`           |
| `files/check-media-mounts.service` | `/etc/systemd/system/check-media-mounts.service` |
| `files/check-media-mounts.timer`   | `/etc/systemd/system/check-media-mounts.timer`   |

## Customization

Edit `files/check-media-mounts.sh` before installing:

```bash
# Mount points to check (space-separated in the array)
MOUNTS=("/mnt/media2" "/mnt/media3")

# Service to restart once mounts are available
PLEX_SERVICE="plexmediaserver.service"
```

The mounts themselves should be configured in `/etc/fstab` with the `nofail` option so the system boots even when mounts are unavailable.

## Install

```bash
sudo bash install.sh
```

## Uninstall

```bash
sudo bash uninstall.sh
```

## Monitoring

```bash
# Timer status (shows if/when it will next fire)
systemctl status check-media-mounts.timer

# Service status (shows last run result)
systemctl status check-media-mounts.service

# Live logs
journalctl -u check-media-mounts.service -f
```

## Testing

```bash
# Simulate mount failure
sudo umount /mnt/media2 /mnt/media3

# Trigger manually
sudo systemctl start check-media-mounts.service

# Watch it retry via the timer
journalctl -u check-media-mounts.service -f
```
