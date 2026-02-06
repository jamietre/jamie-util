# Implementation Plan: compare-files

## Overview
Create a new TypeScript project that compares file lists between two locations, showing files that exist in one location but not the other (bidirectional comparison). The tool will normalize paths to show only the last directory segment and filename for easy comparison.

## Requirements
1. Recursively list all files in multiple source directories (`/c/mount/network/media2` and `/c/mount/network/media3`)
2. Recursively list all files in a target directory (`u:\`)
3. Perform bidirectional set exclusion:
   - Files in sources but NOT in target
   - Files in target but NOT in sources
4. Normalize paths to "LastFolder/filename.ext" format for comparison
5. Make configuration flexible for future use cases
6. Follow existing codebase patterns (TypeScript, JSON config, @stricli/core CLI)

## Architecture Design

### Project Structure
```
compare-files/
├── src/
│   ├── index.ts                 # CLI entry point with @stricli/core
│   ├── compare-files.ts         # Main comparison logic
│   ├── config/
│   │   ├── types.ts            # CompareConfig interface
│   │   ├── config.ts           # Config loading logic
│   │   └── defaults.ts         # Default configuration
│   ├── utils/
│   │   ├── logger.ts           # Logging utility (borrowed from library-scan)
│   │   ├── file-scanner.ts     # Recursive file listing
│   │   └── path-normalizer.ts  # Path normalization logic
│   └── comparator/
│       ├── types.ts            # Comparison result types
│       └── file-comparator.ts  # Set comparison logic
├── dist/                        # Compiled output (gitignored)
├── package.json
├── tsconfig.json
├── compare-files.example.json   # Example configuration
├── README.md
└── .gitignore
```

### Configuration Structure

**compare-files.json:**
```json
{
  "sources": [
    "/c/mount/network/media2",
    "/c/mount/network/media3"
  ],
  "target": "u:\\",
  "output": {
    "format": "text",  // or "json"
    "showSourcesOnly": true,
    "showTargetOnly": true,
    "outputFile": null  // or path to write results
  },
  "pathNormalization": {
    "segmentsToKeep": 2  // Keep last N segments (e.g., 2 = "Folder/file.ext")
  },
  "filters": {
    "extensions": [],  // Empty = all files, or [".mkv", ".mp4"] for specific
    "minSizeBytes": 0,
    "maxSizeBytes": null
  }
}
```

### Core Modules

#### 1. file-scanner.ts
**Purpose:** Recursively scan directories and build file lists
**Key Functions:**
- `scanDirectory(path: string, options: ScanOptions): Promise<string[]>`
- Returns array of absolute file paths
- Handles errors gracefully (permission denied, missing dirs)
- Can filter by extensions and size (for future flexibility)

#### 2. path-normalizer.ts
**Purpose:** Normalize paths to comparable format
**Key Functions:**
- `normalizePath(absolutePath: string, segmentsToKeep: number): string`
- Example: `/c/mount/network/media2/Movies/Action/Die Hard (1988)/movie.mkv`
  → `Die Hard (1988)/movie.mkv`
- Handles both Windows and Unix path separators
- Preserves case for accurate comparison

#### 3. file-comparator.ts
**Purpose:** Perform set operations on file lists
**Key Functions:**
- `compareFileSets(sources: Set<string>, target: Set<string>): ComparisonResult`
- Returns:
  ```typescript
  {
    inSourcesOnly: string[],  // Files in sources but not in target
    inTargetOnly: string[],   // Files in target but not in sources
    inBoth: string[]          // Files in both (optional, for stats)
  }
  ```

#### 4. compare-files.ts (Main Logic)
**Purpose:** Orchestrate the comparison process
**Flow:**
1. Load configuration
2. Scan all source directories (media2, media3)
3. Scan target directory (u:\)
4. Normalize all paths
5. Build Sets for efficient comparison
6. Perform set operations
7. Format and output results

#### 5. index.ts (CLI)
**Purpose:** Command-line interface using @stricli/core
**Commands:**
- `compare` (default) - Run comparison with config file
- Flags:
  - `--config <path>` - Path to config file (default: ./compare-files.json)
  - `--output <path>` - Override output file
  - `--format <text|json>` - Override output format
  - `--debug` - Enable debug logging

### Output Format

**Text Format (default):**
```
Files in sources but NOT in target (1234 files):
  Die Hard (1988)/movie.1080p.mkv
  Inception (2010)/movie.2160p.mkv
  ...

Files in target but NOT in sources (56 files):
  Old Movie (1950)/film.mkv
  Another Film (2000)/video.mp4
  ...

Summary:
  Source locations: 2 directories
  Total source files: 5678
  Total target files: 4500
  Unique to sources: 1234
  Unique to target: 56
  In both: 3444
```

**JSON Format:**
```json
{
  "timestamp": "2026-02-05T...",
  "config": { /* config used */ },
  "results": {
    "inSourcesOnly": ["Die Hard (1988)/movie.1080p.mkv", ...],
    "inTargetOnly": ["Old Movie (1950)/film.mkv", ...],
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

## Implementation Steps

### Phase 1: Project Setup
1. Create `compare-files` directory
2. Initialize `package.json` with TypeScript, Vitest, @stricli/core dependencies
3. Create `tsconfig.json` with ES modules and strict mode
4. Create `.gitignore` (dist/, node_modules/, *.json except example)
5. Create `compare-files.example.json` with initial config

### Phase 2: Core Utilities
1. Implement `utils/logger.ts` (copy/adapt from library-scan)
2. Implement `utils/file-scanner.ts` with recursive directory traversal
3. Write tests for file-scanner with mock file system
4. Implement `utils/path-normalizer.ts` with path manipulation
5. Write tests for path-normalizer with various path formats

### Phase 3: Comparison Logic
1. Define types in `comparator/types.ts` (ComparisonResult, etc.)
2. Implement `comparator/file-comparator.ts` with Set operations
3. Write tests for file-comparator with sample data

### Phase 4: Configuration
1. Define types in `config/types.ts` (CompareConfig interface)
2. Implement `config/defaults.ts` with sensible defaults
3. Implement `config/config.ts` with loading and validation
4. Write tests for config loading

### Phase 5: Main Logic
1. Implement `compare-files.ts` orchestrating all components
2. Handle errors gracefully (missing directories, permission issues)
3. Add progress indicators for large directories
4. Write integration tests

### Phase 6: CLI
1. Implement `index.ts` with @stricli/core command structure
2. Add flags for config path, output override, format
3. Wire up main comparison logic
4. Test CLI with various flag combinations

### Phase 7: Documentation
1. Write comprehensive `README.md` with:
   - Installation instructions
   - Configuration guide
   - Usage examples
   - Troubleshooting
2. Document initial use case (media2/media3 vs u:\)

## Key Design Decisions

### 1. Path Normalization Strategy
**Decision:** Keep last N segments (default 2: folder + filename)
**Rationale:**
- Movie files typically organized as "Movie Title (Year)/filename.ext"
- Flexible for other use cases (can configure segments to keep)
- Works across different drive mappings

### 2. Set-based Comparison
**Decision:** Use JavaScript Set for O(1) lookups
**Rationale:**
- Efficient for large file lists (thousands of files)
- Built-in Set operations make code clean
- Memory efficient compared to nested loops

### 3. Bidirectional Comparison
**Decision:** Show both "sources only" and "target only" by default
**Rationale:**
- User explicitly requested both directions
- Helpful for identifying orphaned files in either location
- Can be toggled in config if only one direction needed

### 4. Configuration Flexibility
**Decision:** JSON config with multiple source directories
**Rationale:**
- User has 2 source directories (media2, media3) combined vs 1 target
- Future use cases might have different directory combinations
- Filters (extensions, size) enable reuse for different file types

### 5. Output Formats
**Decision:** Support both text (human-readable) and JSON (machine-parseable)
**Rationale:**
- Text for immediate review
- JSON for further processing or integration with other tools
- Optional file output for persistence

## Testing Strategy
1. **Unit tests** for each utility module (scanner, normalizer, comparator)
2. **Integration tests** for full comparison flow with mock directories
3. **Edge cases:**
   - Empty directories
   - Permission denied errors
   - Very long paths
   - Special characters in filenames
   - Windows vs Unix path separators
   - Duplicate filenames in different folders

## Dependencies
```json
{
  "dependencies": {
    "@stricli/core": "^3.x",
    "chalk": "^5.x"  // for colored terminal output
  },
  "devDependencies": {
    "@types/node": "^22.x",
    "typescript": "^5.x",
    "vitest": "^2.x",
    "tsx": "^4.x"
  }
}
```

## Potential Enhancements (Future)
- Parallel directory scanning for performance
- Fuzzy matching for similar filenames
- Size/hash comparison for files with same name
- Interactive mode to select which files to copy/move
- Progress bars for large directories (using `cli-progress`)
- Exclude patterns (e.g., ignore .nfo, .txt files)
- Dry-run sync mode to actually move/copy missing files

## Success Criteria
1. Tool successfully lists all files in media2 and media3
2. Tool successfully lists all files in u:\
3. Accurately identifies files present in media2/media3 but not in u:\
4. Accurately identifies files present in u:\ but not in media2/media3
5. Paths normalized to "Folder/filename" format
6. Results are easy to read and actionable
7. Configuration can be easily modified for other use cases
8. Code follows existing codebase patterns and quality standards

## Timeline Estimate
- Phase 1 (Setup): 15 minutes
- Phase 2 (Utilities): 30 minutes
- Phase 3 (Comparison): 20 minutes
- Phase 4 (Config): 20 minutes
- Phase 5 (Main Logic): 25 minutes
- Phase 6 (CLI): 20 minutes
- Phase 7 (Docs): 15 minutes
- **Total: ~2-3 hours** for full implementation with tests

## Risk Mitigation
1. **Large directories:** Use streaming/chunking if performance issues arise
2. **Path separator issues:** Normalize early, test on Windows paths
3. **Permission errors:** Graceful error handling, skip inaccessible files
4. **Memory usage:** Use Sets instead of arrays for large file lists
5. **Network drive timeouts:** Add retry logic or timeout configuration
