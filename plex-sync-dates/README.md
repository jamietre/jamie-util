# Fix Plex "Date Added" to Match File Modification Dates

## Problem

After moving files around on the server, Plex's "date added to library" is wrong for most TV shows. When Plex rescans, it sets `added_at` to the scan time rather than preserving the original date. For example:

- **Animal Mechanicals S3E01**: File mtime is **2016-05-03**, but Plex shows **2026-02-05** (the rescan date)
- This affects most of the TV library

We only care about the **date** (not hours/minutes/seconds).

## Plex Server Details

- **Host**: Plex LXC container on Proxmox
- **IP**: 172.16.2.19
- **OS**: Ubuntu 24.04
- **Database**: `/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Plug-in Support/Databases/com.plexapp.plugins.library.db`
- **Plex SQLite binary**: `/usr/lib/plexmediaserver/Plex SQLite`
- **Python 3.12** is available on the server; `plexapi` is NOT installed yet

## Library Sections

| ID | Name           | Type |
|----|----------------|------|
| 1  | Movies         | 1    |
| 3  | TV Shows       | 2    |
| 4  | Audio Books    | 8    |
| 5  | Music - Live   | 8    |
| 6  | Music          | 8    |
| 7  | Music Videos   | 2    |
| 9  | Other Videos   | 1    |
| 10 | Movies - Adult | 1    |

**Target: Library section 3 (TV Shows)**

## Media File Locations

Files are on two mount points:
- `/mnt/media2/video/tv/`
- `/mnt/media3/video/tv/`

## Chosen Approach: Python + plexapi

From a [Reddit thread](https://www.reddit.com/r/PleX/comments/12keplj/change_date_added_to_match_modified_date_on/) by SwiftPanda16 (Tautulli developer):

```python
import os
from plexapi.server import PlexServer

plex = PlexServer("http://localhost:32400", token="XXXXXXXXXXXXXXX")
for item in plex.library.section("TV Shows").all():
    part = next(item.iterParts())
    modified_time = int(os.path.getmtime(part.file))
    item.editAddedAt(modified_time)
```

### Why this approach (not SQL-only)

- Plex does NOT store the file's mtime in its database, so a pure SQL update can't use the real file dates
- The SQL approach `SET added_at = originally_available_at` uses the **release date**, not the file date
- The SQL approach `SET added_at = media_items.updated_at` uses Plex's internal update timestamp, which is also wrong after a rescan
- The Python/API approach reads the **actual file mtime** from the filesystem and sets it via the API
- **Does not require stopping Plex** (unlike direct DB edits)

### Requirements

- `pip3 install plexapi`
- The Plex auth token (can be extracted from `Preferences.xml` on the server)
- The script must run from a machine that can both **reach the Plex API** and **access the media files** (to `stat()` them for mtime)

### Adapting for TV Shows

The Reddit example was for Movies. For TV Shows, we need to iterate episodes, not just the section. Something like:

```python
import os
from plexapi.server import PlexServer

PLEX_URL = "http://172.16.2.19:32400"
PLEX_TOKEN = "YOUR_TOKEN_HERE"

plex = PlexServer(PLEX_URL, PLEX_TOKEN)
tv = plex.library.section("TV Shows")

for show in tv.all():
    for episode in show.episodes():
        try:
            part = next(episode.iterParts())
            file_mtime = int(os.path.getmtime(part.file))
            episode.editAddedAt(file_mtime)
            print(f"Updated: {show.title} - {episode.title} -> {file_mtime}")
        except Exception as e:
            print(f"Error: {show.title} - {episode.title}: {e}")
```

### Getting the Plex Token

On the Plex server:
```bash
grep -oP 'PlexOnlineToken="\K[^"]*' "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Preferences.xml"
```

## TODO

1. Get the Plex token
2. Install `plexapi` (`pip3 install plexapi`)
3. Ensure the machine running the script can access both the Plex API and the media file paths
4. Run the script (consider doing a dry run first to verify dates look correct)
5. Optionally do the same for Movies (section 1) and other libraries
