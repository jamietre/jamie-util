# ingest-music

Process concert recording zip archives into an organized, tagged music library. Parses show info from filenames, fetches setlists from phish.net or setlist.fm, matches tracks to songs, tags FLAC files, and copies them into a structured library.

## Prerequisites

- Node.js 18+
- `ffmpeg` and `ffprobe` installed and on PATH

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

## Installation

```bash
pnpm install
```

## Usage

```bash
# Preview what would happen (dry run)
pnpm cli --dry-run ~/downloads/show.zip

# Process a single archive
pnpm cli ~/downloads/show.zip

# Process all archives in a directory
pnpm cli --batch ~/downloads/shows/

# Override parsed show info
pnpm cli --artist "Phish" --date 2024-08-16 --venue "Dick's" ~/downloads/show.zip

# Use a specific config file
pnpm cli --config ~/my-config.json ~/downloads/show.zip
```

### Options

```
USAGE
  ingest-music [flags] <zipPath>
  ingest-music --help
  ingest-music --version

FLAGS
     --config            Path to config JSON file
     --artist            Override artist name
     --date              Override show date (YYYY-MM-DD)
     --venue             Override venue
     --city              Override city
     --state             Override state
     --library           Override library base path
     --batch             Process all archives in directory
     --dry-run           Preview without writing
     --skip-conversion   Skip audio format conversion
  -h --help              Print help information and exit
  -v --version           Print version information and exit

ARGUMENTS
  zipPath  Path to archive file (or directory in batch mode)
```

### Supported archive formats

- `.zip`
- `.tar.gz` / `.tgz`
- `.gz`

## Configuration

Config is loaded from the first location found:

1. `--config` flag (explicit path)
2. `~/.config/ingest-music/config.json`
3. `./ingest-music.json` (current working directory)

Copy `config-example.json` to get started:

```bash
mkdir -p ~/.config/ingest-music
cp config-example.json ~/.config/ingest-music/config.json
```

Then edit with your API keys and library path.

### Config file structure

```json
{
  "libraryBasePath": "P:/MusicLibrary/LiveMusic",
  "setlistSources": {
    "setlist.fm": {
      "apiKey": "your-setlist-fm-api-key"
    },
    "phish.net": {
      "apiKey": "your-phish-net-api-key"
    }
  },
  "defaults": {
    "setlistSources": ["setlist.fm"],
    "albumTemplate": "{date} - {venue}, {city}, {state}",
    "albumArtist": "{artist}",
    "genre": "Live",
    "targetPathTemplate": "{artist}/{date} - {venue}, {city}, {state}",
    "fileNameTemplate": "{date} S{set} T{track} - {title}.flac",
    "encoreInSet2": true
  },
  "bands": {
    "phish": {
      "setlistSources": ["phish.net", "setlist.fm"],
      "genre": "Jam"
    }
  }
}
```

### Config fields

#### Top level

| Field | Description |
|---|---|
| `libraryBasePath` | Root directory for the organized library output |
| `setlistSources` | API credentials for each setlist provider |
| `defaults` | Default settings applied to all bands |
| `bands` | Per-band overrides, keyed by lowercase artist name |

#### Setlist sources

Each entry under `setlistSources` has:

| Field | Description |
|---|---|
| `apiKey` | API key for the service |
| `url` | (Optional) Override the API base URL |

Supported sources: `setlist.fm`, `phish.net`.

#### Band/default settings

These fields can appear in `defaults` or in any `bands` entry (band values override defaults):

| Field | Default | Description |
|---|---|---|
| `setlistSources` | `["setlist.fm"]` | Setlist APIs to try, in order. First success wins. |
| `albumTemplate` | `{date} - {venue}, {city}, {state}` | ALBUM tag value |
| `albumArtist` | `{artist}` | ALBUMARTIST tag value |
| `genre` | `Live` | GENRE tag value |
| `targetPathTemplate` | `{artist}/{date} - {venue}, {city}, {state}` | Directory structure under `libraryBasePath` |
| `fileNameTemplate` | `{date} S{set} T{track} - {title}.flac` | Output filename for each track |
| `encoreInSet2` | `true` | Merge encore songs into set 2 numbering |

### Template variables

Templates use `{variable}` substitution. Available variables:

| Variable | Example | Description |
|---|---|---|
| `{artist}` | `Phish` | Artist name |
| `{date}` | `2024-08-16` | Show date (YYYY-MM-DD) |
| `{venue}` | `Dick's Sporting Goods Park` | Venue name |
| `{city}` | `Commerce City` | City |
| `{state}` | `CO` | State code |
| `{title}` | `Tweezer` | Song title |
| `{set}` | `1` | Set number |
| `{track}` | `01` | Zero-padded track number within the set |
| `{discnumber}` | `1` | Same as set number |

## Pipeline

1. Parse show info from archive filename (artist, date, venue, city, state)
2. Load config and resolve band-specific settings
3. Extract archive to temp directory
4. Analyze audio files (bit depth, sample rate, existing tags)
5. Convert to 16-bit/48kHz FLAC if needed (via ffmpeg)
6. Fetch setlist from configured APIs
7. Match tracks to setlist songs
8. Interactive confirmation (skipped in batch/dry-run mode)
9. Tag FLAC files with metadata (via ffmpeg)
10. Copy to library using rendered path/filename templates
11. Clean up temp directory

### Filename parsing

The archive filename is parsed for show info. Patterns like:

```
King Gizzard & The Lizard Wizard - Live at Forest Hills Stadium, Queens, NY 8-16-24 (washtub).zip
Phish - 2024-08-16 - Dick's Sporting Goods Park, Commerce City, CO.zip
```

CLI flags (`--artist`, `--date`, etc.) override any parsed value.

### Track matching

Tracks are matched to the setlist using the first strategy that works:

1. **Tag-based** - existing TRACKNUMBER metadata
2. **Filename-based** - patterns like `d1t01`, `s1_01_Song`, `01 - Song`
3. **Positional** - natural sort order of filenames

Track count must match the setlist song count exactly, or the process fails with a detailed comparison.

## Development

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```
