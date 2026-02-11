# plex-sync-dates

Two scripts for keeping Plex music metadata tidy:

- **`sync_dates.py`** — Fixes Plex "Date Added" by setting it to the actual file creation time (falling back to modification time), rather than the date of the last library scan. Works with any Plex library section (TV shows, movies, music, etc.).
- **`merge_albums.py`** — Finds and merges duplicate album entries in music sections. Plex sometimes splits one album across multiple entries (e.g. when tracks are in different folders).

## Setup

**1. Install dependency**

```bash
python3 -m venv venv
venv/bin/pip install plexapi
```

**2. Configure**

```bash
cp .env.example .env
```

Edit `.env`:

```
PLEX_URL=http://192.168.2.20:32400
PLEX_TOKEN=your_token_here
MEDIA_ROOTS=/mnt/media2/video/tv/;/mnt/media3/video/tv/
```

To get your Plex token, run this on the Plex server:

```bash
grep -oP 'PlexOnlineToken="\K[^"]*' "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Preferences.xml"
```

## Usage

Set an alias for this session to keep commands short:

```bash
alias python=venv/bin/python
```

```
python sync_dates.py [--dry-run] [--library NAME] [--title PATTERN] [--limit N]
```

| Flag              | Description                                                  |
| ----------------- | ------------------------------------------------------------ |
| `--dry-run`       | Show what would change without applying anything             |
| `--library NAME`  | Only process this library section (default: all sections)    |
| `--title PATTERN` | Only process items whose top-level title matches the pattern |
| `--limit N`       | Stop after processing N items                                |

**Title matching** (`--title`) is case-insensitive. Plain text matches as a substring; `*` and `?` wildcards are supported:

| Example                        | Matches                                   |
| ------------------------------ | ----------------------------------------- |
| `--title "Animal Mechanicals"` | any title containing "Animal Mechanicals" |
| `--title "*Mechanicals"`       | titles ending with "Mechanicals"          |
| `--title "Animal*"`            | titles starting with "Animal"             |

## Examples

Preview changes for one show:

```bash
python sync_dates.py --dry-run --library "TV Shows" --title "Animal Mechanicals"
```

Preview the first 10 changes across all libraries:

```bash
python sync_dates.py --dry-run --limit 10
```

Apply changes to one library section:

```bash
python sync_dates.py --library "Movies"
```

Apply changes to all libraries:

```bash
python sync_dates.py
```

---

## merge_albums.py

Finds duplicate album entries in Plex music libraries and merges them interactively. Plex can create duplicates when tracks from the same album are stored in different folders, or when a featured-artist credit causes a second index entry.

### Usage

```
python merge_albums.py [--library NAME] [--title PATTERN] [--album PATTERN]
```

| Flag              | Description                                                     |
| ----------------- | --------------------------------------------------------------- |
| `--library NAME`  | Only process this library section (default: all music sections) |
| `--title PATTERN` | Filter by artist name                                           |
| `--album PATTERN` | Filter by album name                                            |

For each duplicate group, the script shows both entries with track counts and sample file paths, warns if tracks span multiple directories (possible different editions), then prompts:

```
Merge? [y/N/q]:
```

- `y` — merge the duplicates (the entry with the most tracks is kept as primary)
- `n` / Enter — skip this group
- `q` — quit

### Examples

Review all duplicates across all music sections:

```bash
python merge_albums.py
```

Scope to one library:

```bash
python merge_albums.py --library "Music"
```

Scope to one artist:

```bash
python merge_albums.py --title "Beck"
```
