# photo-sync

Copy photos from an Android phone mount to an organized archive, sorting by year/month based on EXIF metadata.

## Installation

```bash
pnpm install
```

## Usage

```bash
# Preview what would be copied (dry run)
pnpm cli /mnt/android/DCIM /mnt/data/pictures --dry-run

# Actually copy files
pnpm cli /mnt/android/DCIM /mnt/data/pictures
```

### Options

```
USAGE
  photo-sync [--dry-run] <source> <target>
  photo-sync --help
  photo-sync --version

FLAGS
     [--dry-run]  Preview changes without copying files
  -h  --help      Print help information and exit
  -v  --version   Print version information and exit

ARGUMENTS
  source  Source directory (e.g., /mnt/android/DCIM)
  target  Target directory (e.g., /mnt/data/pictures)
```

## Features

- Extracts photo date from EXIF metadata (DateTimeOriginal, CreateDate)
- Falls back to file modification date if no EXIF data
- Organizes into `YYYY/MM` folder structure (e.g., `2025/01/IMG_001.jpg`)
- Skips files that already exist in target location
- Supports JPG, JPEG, PNG, HEIC, MP4, MOV

## Development

```bash
# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch
```
