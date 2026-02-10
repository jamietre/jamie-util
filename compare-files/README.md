# compare-files

A TypeScript utility for comparing file lists between directories with bidirectional diff support. This tool helps identify files that exist in one location but not another, making it easy to find missing files or orphaned content.

## Features

- **Bidirectional Comparison**: Shows files unique to sources, unique to target, or both
- **Path Normalization**: Compares files based on their last path segments (e.g., "Movie (1999)/file.mkv")
- **Multiple Sources**: Combine multiple source directories into a single comparison
- **Flexible Configuration**: JSON-based config with filters for extensions and file sizes
- **Multiple Output Formats**: Human-readable text or machine-parseable JSON
- **Recursive Scanning**: Automatically traverses all subdirectories
- **Error Handling**: Gracefully handles permission errors and missing directories

## Use Cases

- Finding media files that exist on network storage but not in local backup
- Identifying orphaned files in backup locations
- Syncing large file collections across different drives
- Auditing file migrations between storage systems

## Installation

```bash
cd compare-files
pnpm install
```

## Configuration

Create a `compare-files.json` file based on `compare-files.example.json`:

```json
{
  "sources": [
    "/c/mount/network/media2",
    "/c/mount/network/media3"
  ],
  "target": "u:\\",
  "output": {
    "format": "text",
    "showSourcesOnly": true,
    "showTargetOnly": true,
    "outputFile": null
  },
  "pathNormalization": {
    "segmentsToKeep": 2
  },
  "filters": {
    "extensions": [],
    "minSizeBytes": 0,
    "maxSizeBytes": null
  }
}
```

### Configuration Options

#### `sources` (required)
Array of source directory paths to scan. All files from these directories will be combined into a single set for comparison.

#### `target` (required)
Target directory path to compare against.

#### `output`
- `format`: Output format (`"text"` or `"json"`)
- `showSourcesOnly`: Show files in sources but not in target
- `showTargetOnly`: Show files in target but not in sources
- `outputFile`: Path to write output file (null = stdout)

#### `pathNormalization`
- `segmentsToKeep`: Number of path segments to keep for comparison
  - `1`: Just filename (e.g., `movie.mkv`)
  - `2`: Parent folder + filename (e.g., `Die Hard (1988)/movie.mkv`)
  - `3`: Grandparent + parent + filename (e.g., `Action/Die Hard (1988)/movie.mkv`)

#### `filters`
- `extensions`: Array of file extensions to include (e.g., `[".mkv", ".mp4"]`). Empty array = all files
- `minSizeBytes`: Minimum file size in bytes (default: 0)
- `maxSizeBytes`: Maximum file size in bytes (null = no limit)

## Usage

### Development Mode

```bash
# Use default config (compare-files.json)
pnpm cli compare

# Use custom config file
pnpm cli compare -c /path/to/config.json

# Write output to file
pnpm cli compare -o results.txt

# Output as JSON
pnpm cli compare -f json

# Enable debug logging
pnpm cli compare --debug

# Combine options
pnpm cli compare -c custom.json -o output.txt -f json --debug
```

### Production Mode

```bash
# Build first
pnpm build

# Run compiled version
node dist/index.js compare
```

## Example Output

### Text Format

```
================================================================================
FILE COMPARISON RESULTS
================================================================================

Files in SOURCES but NOT in target (1234 files):
--------------------------------------------------------------------------------
  Die Hard (1988)/movie.1080p.mkv
  Inception (2010)/movie.2160p.mkv
  The Matrix (1999)/movie.4k.mkv
  ...

Files in TARGET but NOT in sources (56 files):
--------------------------------------------------------------------------------
  Old Movie (1950)/film.mkv
  Another Film (2000)/video.mp4
  ...

SUMMARY
--------------------------------------------------------------------------------
  Source directories: 2
  Total source files: 5678
  Total target files: 4500
  Unique to sources:  1234
  Unique to target:   56
  In both:            3444
================================================================================
```

### JSON Format

```json
{
  "timestamp": "2026-02-05T12:34:56.789Z",
  "config": {
    "sources": ["/c/mount/network/media2", "/c/mount/network/media3"],
    "target": "u:\\",
    "pathNormalization": { "segmentsToKeep": 2 },
    "filters": { "extensions": [], "minSizeBytes": 0, "maxSizeBytes": null }
  },
  "results": {
    "inSourcesOnly": [
      "Die Hard (1988)/movie.1080p.mkv",
      "Inception (2010)/movie.2160p.mkv"
    ],
    "inTargetOnly": [
      "Old Movie (1950)/film.mkv"
    ],
    "summary": {
      "totalSourceFiles": 5678,
      "totalTargetFiles": 4500,
      "uniqueToSources": 1234,
      "uniqueToTarget": 56,
      "inBoth": 3444
    }
  }
}
```

## Testing

```bash
# Run tests in watch mode
pnpm test

# Run tests once
pnpm test:run
```

## How It Works

1. **Scan**: Recursively scans all source and target directories
2. **Normalize**: Converts full paths to normalized format (e.g., "Folder/file.ext")
3. **Compare**: Uses Set operations for efficient O(1) lookups
4. **Report**: Generates human-readable or JSON output

### Path Normalization Example

Given these absolute paths:
- `/c/mount/network/media2/Movies/Action/Die Hard (1988)/movie.1080p.mkv`
- `u:\\Movies\\Die Hard (1988)\\movie.1080p.mkv`

With `segmentsToKeep: 2`, both normalize to:
- `Die Hard (1988)/movie.1080p.mkv`

This allows comparison across different drive mappings and directory structures.

## Common Use Cases

### Find Missing Media Files

Compare network storage against local backup to find files that need to be backed up:

```json
{
  "sources": ["/mnt/nas/media"],
  "target": "/backup/media",
  "output": { "showSourcesOnly": true, "showTargetOnly": false }
}
```

### Find Orphaned Backup Files

Find files in backup that no longer exist in source:

```json
{
  "sources": ["/mnt/nas/media"],
  "target": "/backup/media",
  "output": { "showSourcesOnly": false, "showTargetOnly": true }
}
```

### Compare Specific File Types

Only compare video files:

```json
{
  "sources": ["/media"],
  "target": "/backup",
  "filters": { "extensions": [".mkv", ".mp4", ".avi", ".mov"] }
}
```

## Troubleshooting

### Permission Errors

If you see "Permission denied" warnings, ensure you have read access to all directories. The tool will skip inaccessible directories and continue scanning.

### Missing Files

If expected files don't appear in results:
1. Check that paths in config are correct
2. Verify `segmentsToKeep` matches your directory structure
3. Enable `--debug` to see sample normalized paths
4. Check `filters.extensions` if using extension filtering

### Large Directories

For directories with many files (100k+):
- Consider using extension filters to reduce file count
- The tool uses Sets for O(1) lookups, so performance should remain good
- Memory usage is proportional to number of files × average path length

## Architecture

```
compare-files/
├── src/
│   ├── index.ts                 # CLI entry point
│   ├── compare-files.ts         # Main orchestration logic
│   ├── config/                  # Configuration handling
│   │   ├── types.ts
│   │   ├── config.ts
│   │   └── defaults.ts
│   ├── utils/                   # Utility functions
│   │   ├── logger.ts
│   │   ├── file-scanner.ts
│   │   └── path-normalizer.ts
│   └── comparator/              # Comparison logic
│       ├── types.ts
│       └── file-comparator.ts
└── dist/                        # Compiled output
```

## Development

```bash
# Install dependencies
pnpm install

# Run tests
pnpm test

# Build
pnpm build

# Run CLI in dev mode
pnpm cli compare --debug
```

## License

ISC
