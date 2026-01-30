# ingest-music

Process concert recording archives or directories into an organized, tagged music library. Parses show info from filenames/directory names, fetches setlists from phish.net, kglw.net, or setlist.fm, matches tracks to songs, tags FLAC files, and copies them into a structured library.

## Why

I download live recordings a lot, but they come in all different formats depending on who created them. I want filenames, mp3 tags, encoding, and folder structure to be consistent and to my tastes. This is a command-line tool to simplify the process of ingesting things I download into my music library.

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
# Preview what would happen (dry run) - archive
pnpm cli --dry-run ~/downloads/show.zip

# Preview what would happen (dry run) - directory
pnpm cli --dry-run ~/downloads/show-files/

# Process a single archive
pnpm cli ~/downloads/show.zip

# Process a directory of audio files directly
pnpm cli ~/downloads/show-files/

# Process all archives in a directory (batch mode)
pnpm cli --batch ~/downloads/shows/

# Override parsed show info
pnpm cli --artist "Phish" --date 2024-08-16 --venue "Dick's" ~/downloads/show.zip

# Split tracks to match official setlist
pnpm cli --split "S2T16 12:22" ~/downloads/phish-1999-12-02.zip

# Use a specific config file
pnpm cli --config ~/my-config.json ~/downloads/show.zip
```

### Options

```
USAGE
  ingest-music [flags] <path>
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
     --split             Split track at timestamp (e.g., S2T17 12:22 or 2-17 12:22:00)
                         Can be specified multiple times for multiple splits
  -h --help              Print help information and exit
  -v --version           Print version information and exit

ARGUMENTS
  path  Path to archive file or directory of audio files
```

### Supported input formats

- **Archives**: `.zip`, `.rar`, `.tar.gz` / `.tgz`, `.gz` - extracted to temp directory
- **Directories**: Pass a folder path directly - contents copied to temp directory for processing

**Note:**
- Archives are always extracted to a temporary directory
- For directories: files are only copied to temp if needed (for conversion or tagging)
- If conversion is needed, files are transcoded directly to temp (no unnecessary copying)
- Your original files are never modified

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
    },
    "kglw.net": {
      "apiKey": ""
    }
  },
  "defaults": {
    "setlistSources": ["setlist.fm"],
    "albumTemplate": "{date} - {venue}, {city}, {state}",
    "albumArtist": "{artist}",
    "genre": "Live",
    "targetPathTemplate": "{artist}/{date} - {venue}, {city}, {state}",
    "fileNameTemplate": "{date} S{set} T{track} - {title}.flac",
    "encoreInSet2": true,
    "keepTags": ["COMMENT", "DESCRIPTION", "ENCODER", "REPLAYGAIN_.*", "R128_.*"]
  },
  "bands": {
    "phish": {
      "name": "Phish",
      "patterns": ["^phish$"],
      "setlistSources": ["phish.net", "setlist.fm"],
      "genre": "Jam"
    },
    "kglw": {
      "name": "King Gizzard & The Lizard Wizard",
      "patterns": ["^king gizzard (& |and )?(the )?lizard wizard$", "^kglw$"],
      "setlistSources": ["kglw.net", "setlist.fm"],
      "genre": "Psychedelic Rock"
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
| `bands` | Per-band overrides, keyed by a unique identifier (not used for matching) |

**Band keys**: The key (e.g., `"phish"`, `"kglw"`) is just a unique identifier for the band configuration. It is **not** used for matching artist names. Use the `patterns` array within each band config to specify which artist names should match this band. Use the `name` field to specify the display name.

#### Setlist sources

Each entry under `setlistSources` has:

| Field | Description |
|---|---|
| `apiKey` | API key for the service (empty string for kglw.net) |
| `url` | (Optional) Override the API base URL |

Supported sources: `phish.net`, `kglw.net`, `setlist.fm`.

**Notes:**
- kglw.net does not require an API key. Use an empty string for the `apiKey` field.
- phish.net automatically filters by artist when multiple shows exist on the same date (e.g., Phish vs. Trey Anastasio Band on 2000-09-30).

#### Band/default settings

These fields can appear in `defaults` or in any `bands` entry (band values override defaults):

| Field | Default | Description |
|---|---|---|
| `name` | (none) | **Band-only**: Display name for the artist. If set, used as the artist name in all output. |
| `patterns` | (none) | **Band-only, required**: Array of regex patterns (case-insensitive) for matching artist names. Use regex to match variations flexibly. |
| `setlistSources` | `["setlist.fm"]` | Setlist APIs to try, in order. First success wins. |
| `albumTemplate` | `{date} - {venue}, {city}, {state}` | ALBUM tag value |
| `albumArtist` | `{artist}` | ALBUMARTIST tag value |
| `genre` | `Live` | GENRE tag value |
| `targetPathTemplate` | `{artist}/{date} - {venue}, {city}, {state}` | Directory structure under `libraryBasePath` |
| `fileNameTemplate` | `{date} S{set} T{track} - {title}.flac` | Output filename for each track |
| `encoreInSet2` | `true` | Merge encore songs into set 2 numbering |
| `keepTags` | `["COMMENT", "ENCODER", "REPLAYGAIN_.*", ...]` | Tag patterns to preserve from original files (supports wildcards) |

#### Artist matching with patterns

Each band config uses the `patterns` array for **regex-based, case-insensitive** artist name matching:

```json
"kglw": {
  "name": "King Gizzard & The Lizard Wizard",
  "patterns": ["^king gizzard (& |and )?(the )?lizard wizard$", "^kglw$"],
  ...
}
```

**How it works:**
1. Artist name is extracted from the zip filename or entered manually
2. The name is matched against all `patterns` (as regexes, case-insensitive) in all band configs
3. First matching band config is used
4. If the band has a `name` field, it replaces the artist name in all output

**Example:**
- Input: `"King Gizzard & Lizard Wizard - 2024-08-16.zip"`
- Matches pattern: `"^king gizzard (& |and )?(the )?lizard wizard$"` (case-insensitive regex)
- Uses band config: `"kglw"`
- Artist name becomes: `"King Gizzard & The Lizard Wizard"` (from `name` field)

**Regex pattern examples:**
- `"^phish$"` - Exact match for "phish" (case-insensitive)
- `"^king gizzard (& |and )?(the )?lizard wizard$"` - Matches all these variations:
  - "King Gizzard & The Lizard Wizard"
  - "King Gizzard & Lizard Wizard"
  - "King Gizzard and The Lizard Wizard"
  - "King Gizzard and Lizard Wizard"
- `"^(kglw|kgatlw)$"` - Matches "kglw" or "kgatlw"
- `"goose"` - Matches any artist containing "goose"

**Tips:**
- Use `^` and `$` anchors for exact matches
- Use `(option1|option2)` for alternatives
- Use `?` for optional parts (e.g., `(the )?` matches "the " or nothing)
- All matching is case-insensitive (uses `/pattern/i` flag)
- First match wins, so order bands strategically if patterns might overlap
- Invalid regex patterns fall back to exact string matching

#### Tag preservation with keepTags

The `keepTags` option controls which tags from original files are preserved during tagging. By default, common metadata tags are preserved:

```json
"keepTags": [
  "COMMENT",
  "DESCRIPTION",
  "ENCODER",
  "REPLAYGAIN_.*",
  "R128_.*"
]
```

**How it works:**
1. Before tagging, existing tags are read from the FLAC file
2. Tags matching any pattern in `keepTags` are saved
3. All tags are removed
4. New tags (ARTIST, ALBUM, TITLE, etc.) are written
5. Preserved tags are restored

**Pattern matching:**
- Exact match: `"COMMENT"` preserves only the COMMENT tag
- Wildcard: `"REPLAYGAIN_.*"` preserves REPLAYGAIN_TRACK_GAIN, REPLAYGAIN_ALBUM_GAIN, etc.
- Case-insensitive: `"encoder"` matches "ENCODER", "Encoder", "encoder"

**Example custom configuration:**
```json
"bands": {
  "phish": {
    "keepTags": ["COMMENT", "ENCODER", "REPLAYGAIN_.*", "MY_CUSTOM_TAG"]
  }
}
```

**To remove all original tags** (fresh start):
```json
"keepTags": []
```

### Template variables

Templates use `{variable}` substitution. Available variables:

| Variable | Example | Description |
|---|---|---|
| `{artist}` | `Phish` | Artist name |
| `{date}` | `2024-08-16` | Show date (YYYY-MM-DD) |
| `{date:FORMAT}` | varies | Formatted date (see below) |
| `{venue}` | `Dick's Sporting Goods Park` | Venue name |
| `{city}` | `Commerce City` | City |
| `{state}` | `CO` | State code |
| `{location}` | `Commerce City, CO` or `Berlin` | Smart location (see below) |
| `{title}` | `Tweezer` | Song title |
| `{set}` | `1` | Set number |
| `{track}` | `01` | Zero-padded track number within the set |
| `{discnumber}` | `1` | Same as set number |

#### Date formatting

Use `{date:FORMAT}` to customize the date format. Format tokens:

| Token | Description | Example |
|---|---|---|
| `YYYY` | 4-digit year | `2024` |
| `MM` | 2-digit month | `08` |
| `DD` | 2-digit day | `16` |

Examples:
- `{date:YYYY-MM-DD}` → `2024-08-16`
- `{date:YYYY.MM.DD}` → `2024.08.16`
- `{date:MM/DD/YYYY}` → `08/16/2024`

#### Location formatting

The `{location}` variable intelligently formats the location based on whether it's a US or international show:

**US shows** (2-letter state code):
- Input: `city="Commerce City"`, `state="CO"`
- Output: `"Commerce City, CO"`

**International shows with country** (from setlist API):
- Input: `city="Berlin"`, `state="16"`, `country="Germany"`
- Output: `"Berlin, Germany"`
- Input: `city="London"`, `state=""`, `country="United Kingdom"`
- Output: `"London, United Kingdom"`

**International shows without country**:
- Input: `city="Berlin"`, `state="16"` (no country data)
- Output: `"Berlin"`

**Priority:** US state (2 letters) > Country > City only

**Why use `{location}` instead of `{city}, {state}`:**
- Avoids awkward trailing commas for international shows
- Automatically detects US state codes (2 uppercase letters)
- Includes country names for international shows (from setlist API)
- Cleaner output for mixed US/international show libraries

**Example templates:**
- `{date} {venue}, {location}` → `"2024-08-16 Dick's, Commerce City, CO"` (US)
- `{date} {venue}, {location}` → `"2025-11-10 Columbiahalle, Berlin, Germany"` (International with country)
- `{date} {venue}, {location}` → `"2025-11-10 Venue, Tokyo"` (International, no country data)

## Track Splitting

Sometimes tapers split tracks differently than the official setlist. For example:
- **Taper's split**: Track 16: "You Enjoy Myself" (15:00)
- **Official setlist**: Track 16: "You Enjoy Myself" (12:22), Track 17: "The Little Drummer Boy" (2:38)

Use `--split` to split a single audio file into multiple tracks to match the official setlist:

```bash
pnpm cli --split "S2T17 12:22" phish-1999-12-02.zip
```

### Split Format

```
--split <track-id> <timestamp>
```

**Track ID formats:**
- `S2T17` - Set 2, Track 17
- `2-17` - Alternative format (set 2, track 17)
- Case-insensitive

**Timestamp formats:**
- `HH:MM:SS` - Hours:Minutes:Seconds (e.g., `1:23:45`)
- `MM:SS` - Minutes:Seconds (e.g., `12:22`)
- `742` - Raw seconds
- Fractional seconds supported (e.g., `742.5`)

### Multiple Splits

Specify `--split` multiple times to split multiple tracks:

```bash
pnpm cli \
  --split "S1T5 5:30" \
  --split "S2T17 12:22" \
  phish-1999-12-02.zip
```

### How It Works

1. **Before** audio analysis, splits are applied to file paths based on file position
2. The Nth file in the sorted list is split into two files using `ffmpeg -c copy` (fast, no re-encoding)
3. The file list is updated with both split parts
4. All files (including split parts) are analyzed and matched to the setlist
5. Files are tagged and copied to the library

**Important:** Track numbers refer to **file position** in the sorted file list, not metadata tags. `S2T16` means "split the 16th file", regardless of what TRACKNUMBER tag it has.

**Example:**
```bash
# Input files (sorted)
1. track_01.flac
2. track_02.flac
...
16. track_16.flac  ← "You Enjoy Myself" (15:00 total)
17. track_17.flac  ← "Contact"

# After --split "16 12:22"  (or "S1T16 12:22" if specifying set)
1. track_01.flac
...
16. track_16_part1.flac  ← First 12:22 of track 16
17. track_16_part2.flac  ← Remaining 2:38 of track 16
18. track_17.flac        ← Original track 17 (now at position 18)

# Matched to setlist
track_16_part1.flac → "You Enjoy Myself"
track_16_part2.flac → "The Little Drummer Boy"
track_17.flac       → "Contact"
```

## Pipeline

1. Parse show info from input name (artist, date, venue, city, state)
   - For directories: parses parent directory name (usually contains show info)
   - For archives: parses archive filename
2. Determine artist if not already known:
   - Prompt user to select from configured bands (in interactive mode)
   - Fail with error (in batch/dry-run mode)
3. Load config and resolve band-specific settings
4. Prepare working directory:
   - Archives: extract to temp directory
   - Directories: use directly (no copy yet)
5. Analyze audio files (bit depth, sample rate, existing tags)
6. Determine show date if not already known:
   - Try to extract from audio metadata
   - Prompt user interactively (in interactive mode)
   - Fail with error (in batch/dry-run mode)
7. Convert to 16-bit/48kHz FLAC if needed:
   - If conversion needed: transcode directly to temp directory (efficient - no pre-copy)
   - If no conversion: files remain in original location
8. Fetch setlist from configured APIs
9. Match tracks to setlist songs
10. Interactive confirmation (skipped in batch/dry-run mode)
11. Copy to temp for tagging (if not already there)
12. Tag FLAC files with metadata (via ffmpeg in temp directory)
13. Copy to library using rendered path/filename templates
14. Clean up temp directory (if created)

### Input name parsing

The archive filename or directory name is parsed for show info. Patterns like:

```
King Gizzard & The Lizard Wizard - Live at Forest Hills Stadium, Queens, NY 8-16-24 (washtub).zip
Phish - 2024-08-16 - Dick's Sporting Goods Park, Commerce City, CO.zip
2024-08-16 - Dick's Sporting Goods Park/
```

CLI flags (`--artist`, `--date`, etc.) override any parsed value.

**Artist determination:**
If the artist cannot be determined from the filename or directory name:
1. In **interactive mode**: You'll be prompted to select from configured bands or enter a custom artist name
2. In **batch mode**: The process will fail with an error - use the `--artist` flag to specify it
3. In **dry-run mode**: The process will fail with an error - use the `--artist` flag to specify it

**Date determination:**
If the show date cannot be determined from the filename or directory name:
1. In **interactive mode**: You'll be prompted to enter the date (YYYY-MM-DD format)
2. In **batch mode**: The process will fail with an error - use the `--date` flag to specify it
3. In **dry-run mode**: The process will fail with an error - use the `--date` flag to specify it

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


## TODO

- if a file is not FLAC, it must be converted, even if no audio samling conversion is needed
- Splitting tracks cannot be done in the source folder. If we have to split tracks, they must be first copied to tmp
- We need to sort numbers correctly when they are part of the original track - if it starts with a #, then parse it after
- similar to our "--split" option, let's add "--merge" to merge tracks like '--merge "D1T01 D1T02 ...". This should error if merging non-sequential tracks
- Phish imports don't handle country correctly, missing from api?
- We should be able to handle incomplete shows (e.g. one set) - as long as there are fewer tracks and we match them all by name
- When we enter a previously unknown band, add config for it
- Preprocss an archive by extracting any text or markdown files and try to identify the artist with using regex pattern matching. If multiple matches occur, ask
- Add a --debug options; emit curl statement for API calls
- Allow downloading a show direct from a URL. Provide config for temporary location in case conversion fails.
- Add code using our callbacl/plugin pattern to parse artist & date from filenames
- Allow choosing an image; resize to 400x400 and save as "cover.jpg"