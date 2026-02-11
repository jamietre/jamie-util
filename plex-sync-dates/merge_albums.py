#!/usr/bin/env python3
"""
Find and merge duplicate Plex album entries.

Plex sometimes creates multiple album entries for the same album (e.g. when
tracks are stored in different folders). This script finds those duplicates
and merges them via the Plex API.

Usage:
    venv/bin/python merge_albums.py [--library NAME] [--title PATTERN] [--album PATTERN]

Options:
    --library NAME    Only process this library section (default: all music sections)
    --title PATTERN   Filter by artist name (supports * and ?, case-insensitive)
    --album PATTERN   Filter by album name (supports * and ?, case-insensitive)

Config is read from a .env file in the same directory as this script.
See .env.example for required variables.
"""

import argparse
import fnmatch
import os
import sys
from collections import defaultdict
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

    return url, token


def match_pattern(title: str, pattern: str) -> bool:
    if not any(c in pattern for c in ("*", "?", "[")):
        pattern = f"*{pattern}*"
    return fnmatch.fnmatch(title.lower(), pattern.lower())


def first_file(album) -> str | None:
    """Return the file path of the first track in the album, or None."""
    try:
        tracks = album.tracks()
        if not tracks:
            return None
        part = next(tracks[0].iterParts(), None)
        return part.file if part else None
    except Exception:
        return None


def track_dirs(album) -> set[str]:
    """Return the set of parent directories containing this album's tracks."""
    dirs = set()
    try:
        for track in album.tracks():
            for part in track.iterParts():
                if part.file:
                    dirs.add(str(Path(part.file).parent))
    except Exception:
        pass
    return dirs


def choose_primary(albums: list) -> tuple:
    """Return (primary, others) — primary has the most tracks; tie breaks by ratingKey."""
    def sort_key(a):
        return (-len(a.tracks()), a.ratingKey)
    sorted_albums = sorted(albums, key=sort_key)
    return sorted_albums[0], sorted_albums[1:]


def find_duplicates(section, title_pattern: str | None, album_pattern: str | None) -> list[list]:
    """Return list of duplicate groups (each group is a list of albums with 2+ entries)."""
    artists = section.all()

    if title_pattern:
        artists = [a for a in artists if match_pattern(a.title, title_pattern)]
        if not artists:
            print(f"  No artists matched --title pattern: {title_pattern!r}")
            return []
        print(f"  Matched artists: {', '.join(a.title for a in artists)}\n")

    groups: dict[tuple, list] = defaultdict(list)
    for artist in artists:
        for album in artist.albums():
            if album_pattern and not match_pattern(album.title, album_pattern):
                continue
            key = (album.parentTitle.lower(), album.title.lower())
            groups[key].append(album)

    return [albums for albums in groups.values() if len(albums) > 1]


def prompt_merge(primary, others: list) -> str:
    """Print details about a duplicate group and prompt the user. Returns 'y', 'n', or 'q'."""
    all_albums = [primary] + others
    artist = primary.parentTitle
    title = primary.title

    # Collect all track dirs across all duplicates
    all_dirs: set[str] = set()
    for album in all_albums:
        all_dirs.update(track_dirs(album))

    print(f"\nDUPLICATE: {artist} - {title}")
    for album in all_albums:
        label = "[PRIMARY]" if album is primary else "[MERGE]  "
        track_count = len(album.tracks())
        plural = "track" if track_count == 1 else "tracks"
        sample_file = first_file(album) or "(no file)"
        print(f"  {label} ratingKey={album.ratingKey}  {track_count:3d} {plural}  {sample_file}")

    if len(all_dirs) > 1:
        print("  WARNING: tracks span multiple directories — may be different editions")

    while True:
        try:
            answer = input("Merge? [y/N/q]: ").strip().lower()
        except EOFError:
            return "q"
        if answer in ("y", "n", "", "q"):
            return answer if answer else "n"
        print("  Please enter y, n, or q.")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--library", metavar="NAME", help="Only process this library section")
    parser.add_argument("--title", metavar="PATTERN", help="Filter by artist name (supports * and ?, case-insensitive)")
    parser.add_argument("--album", metavar="PATTERN", help="Filter by album name (supports * and ?, case-insensitive)")
    args = parser.parse_args()

    plex_url, plex_token = get_config()
    plex = PlexServer(plex_url, plex_token)

    if args.library:
        sections = [plex.library.section(args.library)]
    else:
        sections = [s for s in plex.library.sections() if s.type == "artist"]

    for section in sections:
        print(f"=== {section.title} ===")
        duplicates = find_duplicates(section, args.title, args.album)

        if not duplicates:
            print("  No duplicates found.")
            continue

        quit_requested = False
        merged = 0
        skipped = 0

        for group in duplicates:
            primary, others = choose_primary(group)
            answer = prompt_merge(primary, others)

            if answer == "q":
                quit_requested = True
                break
            elif answer == "y":
                try:
                    primary.merge([o.ratingKey for o in others])
                    print(f"  Merged.")
                    merged += 1
                except Exception as e:
                    print(f"  ERROR merging: {e}")
            else:
                skipped += 1

        print(f"\n  Merged: {merged}, Skipped: {skipped}")

        if quit_requested:
            print("Quitting.")
            break


if __name__ == "__main__":
    main()
