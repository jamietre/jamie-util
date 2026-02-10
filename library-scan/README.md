# library-scan

Directory scanning application with configurable hooks for automated file/folder processing.

## Features

- **Strategy Pattern Architecture**: Extensible hook system for custom processing logic
- **Configurable Scanning**: JSON-based configuration with glob filtering, depth limits, and size constraints
- **Parallel Hook Execution**: Multiple hooks run concurrently with isolated error handling
- **Built-in Priority Detection**: Automatically sets duplication levels on directories containing `.priority` files
- **Retry Logic**: Robust command execution with exponential backoff
- **Dry Run Mode**: Preview actions before executing

## Installation

```bash
pnpm install
pnpm build
```

## Usage

```bash
# Build first
pnpm build

# Run with default config (./library-scan.json)
pnpm cli

# Run with custom config
pnpm cli --config /path/to/config.json

# Dry run mode (preview without making changes)
pnpm cli --dry-run

# Enable debug logging
pnpm cli --debug

# Combine flags
pnpm cli --config test-config.json --debug --dry-run
```

**Note**: The `dpcmd` commands (`get-duplication` and `set-duplication`) require administrator privileges. Always test with `--dry-run` or `"dryRun": true` in your config first to preview what actions will be taken.

## Configuration

Create a `library-scan.json` file in your project root or `~/.config/library-scan/config.json`:

```json
{
  "targets": [
    {
      "path": "/mnt/media/music",
      "maxDepth": 10,
      "filters": {
        "exclude": [
          "**/node_modules/**",
          "**/.git/**"
        ]
      }
    }
  ],
  "hooks": [
    {
      "name": "priority-detection",
      "enabled": true
    }
  ],
  "debug": false,
  "dryRun": false
}
```

### Configuration Options

- **targets**: Array of directories to scan
  - `path`: Absolute path to scan
  - `maxDepth`: Maximum recursion depth (optional)
  - `followSymlinks`: Follow symbolic links (default: false)
  - `filters`: Include/exclude patterns, size limits
- **globalFilters**: Filters applied to all targets
- **hooks**: Hook configurations
- **debug**: Enable debug logging
- **dryRun**: Preview mode
- **concurrency**: Maximum concurrent operations (default: 10)

## Built-in Hooks

### Priority Detection Hook

Detects `.priority` files and sets duplication level 2 on the parent directory using `dpcmd`.

**Trigger**: Any file named `.priority`

**Action**: Executes `dpcmd set-duplication "{parent_directory}" 2`

**Behavior**:
- Checks if parent directory is already duplicated
- Skips if duplication already set
- Sets duplication level 2 if not duplicated
- Respects `--dry-run` flag

## Creating Custom Hooks

Implement the `ScanHook` interface:

```typescript
import type { ScanHook } from './hooks/types.js';
import type { ScanContext, HookResult } from './scanner/types.js';

export class MyCustomHook implements ScanHook {
  readonly name = 'my-custom-hook';
  readonly description = 'Description of what this hook does';
  readonly processesFiles = true;
  readonly processesDirectories = false;

  shouldExecute(context: ScanContext): boolean {
    // Return true if hook should run for this file/directory
    return context.path.endsWith('.txt');
  }

  async execute(context: ScanContext): Promise<HookResult | null> {
    // Your custom logic here
    return {
      hookName: this.name,
      path: context.path,
      actionTaken: true,
      message: 'Processed successfully',
    };
  }
}
```

Register your hook in `src/index.ts`:

```typescript
switch (hookConfig.name) {
  case 'my-custom-hook':
    hooks.push(new MyCustomHook());
    break;
  // ...
}
```

## Architecture

```
ScanOrchestrator
  ├── Registers hooks (PriorityDetectionHook, etc.)
  ├── Traverses directory tree with filters
  ├── For each file/folder: executes applicable hooks in parallel
  └── Aggregates results and errors
```

**Key Design Principles**:
- Hooks execute in parallel using `Promise.allSettled`
- Hook failures are isolated and don't stop the scan
- Context-rich callbacks with file metadata (stats, creation date, etc.)
- Configurable retry logic for external commands

## Error Handling

- **Directory inaccessible**: Logged as warning, scan continues
- **Hook execution fails**: Caught by `Promise.allSettled`, logged, included in summary
- **dpcmd command fails**: Retries 3 times with exponential backoff, then fails gracefully
- **Invalid config**: Throws error immediately, prevents scan

## Development

```bash
# Run tests
pnpm test

# Type check
pnpm typecheck

# Build
pnpm build
```

### Testing Locally

A test configuration and directory structure are included:

```bash
# Test with dry-run (no admin required)
pnpm build
pnpm cli --config test-config.json

# The test-data directory contains:
# - test-data/artist1/album1/.priority (should trigger hook)
# - test-data/artist2/album2/ (no .priority file)
```

This will scan the test directory and show what actions would be taken without requiring admin privileges for `dpcmd`.

## Example Output

```
library-scan v0.1.0

Loading configuration...
Registering 1 hooks
Scanning target: /mnt/media/music

============================================================
SCAN SUMMARY
============================================================
Files scanned:        1523
Directories scanned:  127
Actions taken:        12
Errors:               0
Duration:             3.45s

HOOK RESULTS:
  ✓ /mnt/media/music/artist/album/.priority
    Set duplication level 2 on parent directory
  ...

Scan complete!
```

## License

MIT
