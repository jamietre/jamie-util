# Quick Start Guide

Get started with library-scan in 5 minutes.

## Installation

```bash
cd C:/code/jamie-util/library-scan
pnpm install
pnpm build
```

## Quick Test

Test the scanner without admin privileges using dry-run mode:

```bash
# This will scan the test-data directory and preview actions
pnpm cli --config test-config.json
```

Expected output:
- Scans the test directory structure
- Finds `.priority` file in `test-data/artist1/album1/`
- Shows it would set duplication level 2 on the parent directory
- Completes without errors

## Create Your First Config

1. Copy the example config:
```bash
cp library-scan.example.json library-scan.json
```

2. Edit `library-scan.json` to point to your music library:
```json
{
  "targets": [
    {
      "path": "C:/your/music/library",
      "maxDepth": 10
    }
  ],
  "hooks": [
    {
      "name": "priority-detection",
      "enabled": true
    }
  ],
  "dryRun": true
}
```

3. Run in dry-run mode first:
```bash
pnpm cli
```

4. If everything looks good, disable dry-run and run as admin:
```json
{
  "dryRun": false
}
```

```bash
# Run as administrator
pnpm cli
```

## Common Tasks

### Preview Changes
```bash
pnpm cli --dry-run
```

### Enable Debug Logging
```bash
pnpm cli --debug
```

### Scan Specific Directory
```bash
pnpm cli --config custom-config.json
```

### Combine Flags
```bash
pnpm cli --config custom-config.json --debug --dry-run
```

## What Does Priority Detection Do?

The Priority Detection hook:
1. Finds any file named `.priority` in your library
2. Checks if the parent directory has duplication set
3. If not, sets duplication level 2 using `dpcmd`

This is useful for marking important albums that should be kept duplicated for data protection.

## Troubleshooting

### "Command failed: dpcmd"
- Make sure you're running as administrator (unless using --dry-run)
- Verify dpcmd is installed and in your PATH
- Try with --dry-run first to verify the scan logic works

### "No scan targets specified"
- Check your config file exists and is valid JSON
- Ensure the "targets" array has at least one entry

### "Cannot read directory"
- Verify the path in your config exists
- Check you have read permissions for the target directory

## Next Steps

- Read [README.md](README.md) for detailed documentation
- Check [IMPLEMENTATION.md](IMPLEMENTATION.md) for architecture details
- Learn to create custom hooks in the README's "Creating Custom Hooks" section
