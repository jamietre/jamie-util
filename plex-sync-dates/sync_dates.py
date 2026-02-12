#!/usr/bin/env python3
"""
Sync Plex 'date added' to match file creation dates.

Works with any Plex library section (TV shows, movies, music, etc.).
For music libraries, the album's date is set to the oldest track creation time
(uses the earlier of birth time and modification time for each file).

Usage:
    python3 sync_dates.py [--dry-run] [--library NAME] [--title PATTERN] [--limit N]

Options:
    --dry-run         Print what would be changed without applying anything
    --library NAME    Only process this library section (default: all sections)
    --title PATTERN   Filter by artist or show name (supports * and ?, case-insensitive)
    --album PATTERN   Filter by album name, music sections only (supports * and ?)
    --limit N         Stop after processing N items (applies to both live and dry-run)

Config is read from a .env file in the same directory as this script.
See .env.example for required variables.
"""

import argparse
import ctypes
import ctypes.util
import fnmatch
import os
import sys
from datetime import date, datetime
from pathlib import Path

try:
    from plexapi.server import PlexServer
except ImportError:
    print("Error: plexapi not installed. Run: pip3 install plexapi")
    sys.exit(1)


def load_dotenv(path: Path) -> None:
    """Minimal .env loader — no external dependencies required."""
    if not path.exists():
        return
    with path.open() as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            os.environ.setdefault(key.strip(), value.strip())


load_dotenv(Path(__file__).parent / ".env")


def get_config():
    token = os.environ.get("PLEX_TOKEN", "")
    if not token:
        print("Error: PLEX_TOKEN not set in .env or environment.")
        print("  To get your token on the Plex server:")
        print('  grep -oP \'PlexOnlineToken="\\K[^"]*\' "/var/lib/plexmediaserver/Library/Application Support/Plex Media Server/Preferences.xml"')
        sys.exit(1)

    url = os.environ.get("PLEX_URL", "")
    if not url:
        print("Error: PLEX_URL not set in .env or environment.")
        sys.exit(1)

    raw_roots = os.environ.get("MEDIA_ROOTS", "")
    media_roots = [r.strip() for r in raw_roots.split(";") if r.strip()]

    return url, token, media_roots


def ts_to_date(ts: int) -> date:
    return datetime.fromtimestamp(ts).date()


def match_pattern(title: str, pattern: str) -> bool:
    if not any(c in pattern for c in ("*", "?", "[")):
        pattern = f"*{pattern}*"
    return fnmatch.fnmatch(title.lower(), pattern.lower())


def iter_items(section, title_pattern: str | None, album_pattern: str | None):
    """Yield items to process from a section, optionally filtered by title/album pattern.

    For music sections, yields albums (date is set at album level).
      --title filters by artist name; --album filters by album name.
    For show sections, yields episodes; --title filters by show name.
    For movie/other sections, yields items directly; --title filters by item title.
    """
    top_level = section.all()

    if title_pattern:
        top_level = [i for i in top_level if match_pattern(i.title, title_pattern)]
        if not top_level:
            print(f"  No items matched --title pattern: {title_pattern!r}")
            return
        print(f"  Matched artists/shows: {', '.join(i.title for i in top_level)}\n")

    if section.type == "show":
        for show in top_level:
            yield from show.episodes()
    elif section.type == "artist":
        seen = set()
        for artist in top_level:
            albums = artist.albums()
            if album_pattern:
                albums = [a for a in albums if match_pattern(a.title, album_pattern)]
            for album in albums:
                if album.ratingKey not in seen:
                    seen.add(album.ratingKey)
                    yield album
    else:
        yield from top_level


def item_label(item) -> str:
    if item.type == "episode":
        return f"{item.grandparentTitle} - {item.title}"
    if item.type == "album":
        return f"{item.parentTitle} - {item.title}"
    return item.title


_NR_STATX = 332      # x86_64 syscall number
_AT_FDCWD = -100
_STATX_BTIME = 0x800


class _StatxTimestamp(ctypes.Structure):
    _fields_ = [
        ("tv_sec",     ctypes.c_int64),
        ("tv_nsec",    ctypes.c_uint32),
        ("_reserved",  ctypes.c_int32),
    ]


class _Statx(ctypes.Structure):
    # Full struct is 256 bytes; _padding covers the tail fields we don't use.
    _fields_ = [
        ("stx_mask",             ctypes.c_uint32),
        ("stx_blksize",          ctypes.c_uint32),
        ("stx_attributes",       ctypes.c_uint64),
        ("stx_nlink",            ctypes.c_uint32),
        ("stx_uid",              ctypes.c_uint32),
        ("stx_gid",              ctypes.c_uint32),
        ("stx_mode",             ctypes.c_uint16),
        ("_spare0",              ctypes.c_uint16 * 1),
        ("stx_ino",              ctypes.c_uint64),
        ("stx_size",             ctypes.c_uint64),
        ("stx_blocks",           ctypes.c_uint64),
        ("stx_attributes_mask",  ctypes.c_uint64),
        ("stx_atime",            _StatxTimestamp),  # offset 64
        ("stx_btime",            _StatxTimestamp),  # offset 80
        ("stx_ctime",            _StatxTimestamp),  # offset 96
        ("stx_mtime",            _StatxTimestamp),  # offset 112
        ("_padding",             ctypes.c_uint8 * 128),  # offsets 128–255
    ]


_libc = ctypes.CDLL(ctypes.util.find_library("c"), use_errno=True)


def file_birthtime(path: str) -> int:
    """Return the file creation (birth) time via statx() syscall.

    Falls back to mtime if the syscall fails or the filesystem doesn't
    support birth time (stx_btime not set in stx_mask).
    """
    buf = _Statx()
    ret = _libc.syscall(
        _NR_STATX,
        ctypes.c_int(_AT_FDCWD),
        ctypes.c_char_p(path.encode()),
        ctypes.c_int(0),
        ctypes.c_uint(_STATX_BTIME),
        ctypes.byref(buf),
    )
    mtime = int(os.path.getmtime(path))
    if ret == 0 and (buf.stx_mask & _STATX_BTIME) and buf.stx_btime.tv_sec:
        return min(buf.stx_btime.tv_sec, mtime)
    return mtime


def get_file_mtime(item, media_roots: list[str]) -> tuple[int, str] | tuple[None, str]:
    """Return (birthtime, description) for an item.

    For albums, scans all tracks and returns the oldest birth time.
    For everything else, uses the first media part's file.
    Returns (None, reason) if no usable file was found.
    """
    if item.type == "album":
        mtimes = []
        for track in item.tracks():
            try:
                part = next(track.iterParts())
                if not part.file:
                    continue
                if media_roots and not any(part.file.startswith(r) for r in media_roots):
                    continue
                mtimes.append(file_birthtime(part.file))
            except Exception:
                pass
        if not mtimes:
            return None, "no accessible track files"
        return min(mtimes), f"{len(mtimes)} tracks scanned"

    part = next(item.iterParts())
    if not part.file:
        return None, "no file"
    if media_roots and not any(part.file.startswith(r) for r in media_roots):
        return None, f"outside media roots ({part.file})"
    return file_birthtime(part.file), part.file


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--dry-run", action="store_true", help="Print changes without applying them")
    parser.add_argument("--library", metavar="NAME", help="Only process this library section")
    parser.add_argument("--title", metavar="PATTERN", help="Filter by artist/show name (supports * and ?, case-insensitive)")
    parser.add_argument("--album", metavar="PATTERN", help="Filter by album name for music sections (supports * and ?, case-insensitive)")
    parser.add_argument("--limit", metavar="N", type=int, help="Stop after processing N items")
    args = parser.parse_args()

    if args.dry_run:
        print("[DRY RUN] No changes will be made.\n")
    if args.limit:
        print(f"[LIMIT] Will stop after {args.limit} items.\n")

    plex_url, plex_token, media_roots = get_config()

    plex = PlexServer(plex_url, plex_token)

    if args.library:
        sections = [plex.library.section(args.library)]
    else:
        sections = plex.library.sections()

    updated = 0
    skipped = 0
    errors = 0
    done = False

    for section in sections:
        print(f"=== {section.title} ===")
        for item in iter_items(section, args.title, args.album):
            label = item_label(item)
            try:
                file_mtime, detail = get_file_mtime(item, media_roots)

                if file_mtime is None:
                    print(f"  SKIP ({detail}): {label}")
                    skipped += 1
                    continue

                file_date = ts_to_date(file_mtime)
                current_date = ts_to_date(int(item.addedAt.timestamp())) if item.addedAt else None

                if current_date == file_date:
                    skipped += 1
                    continue

                print(f"  {'WOULD UPDATE' if args.dry_run else 'UPDATE'}: "
                      f"{label}  {current_date} -> {file_date}  [{detail}]")

                if not args.dry_run:
                    item.editAddedAt(file_mtime)

                updated += 1
                if args.limit and updated >= args.limit:
                    done = True
                    break

            except Exception as e:
                print(f"  ERROR: {label}: {e}")
                errors += 1

        if done:
            break

    print(f"\nDone. Updated: {updated}, Skipped (already correct): {skipped}, Errors: {errors}")


if __name__ == "__main__":
    main()
