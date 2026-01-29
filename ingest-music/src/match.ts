import type { AudioInfo, SetlistSong, MatchedTrack } from "./types.js";
import { parseTrackFilename } from "./parse-filename.js";
import * as path from "node:path";

/**
 * Match audio files to setlist songs.
 *
 * Strategy:
 * 1. Validate count matches
 * 2. Try tag-based matching (TRACKNUMBER)
 * 3. Try filename-based matching (parsed set/track numbers)
 * 4. Fall back to positional order (natural sort)
 *
 * @param encoreInSet2 - If true, encore songs are merged into set 2
 */
export function matchTracks(
  audioFiles: AudioInfo[],
  setlist: SetlistSong[],
  encoreInSet2: boolean
): MatchedTrack[] {
  const songs = encoreInSet2 ? mergeEncoreIntoSet2(setlist) : setlist;

  if (audioFiles.length !== songs.length) {
    throw new TrackCountMismatchError(audioFiles, songs);
  }

  // Try tag-based matching (by track number ordering)
  const tagMatched = tryTagMatch(audioFiles, songs);
  if (tagMatched) return tagMatched;

  // Try filename-based matching
  const filenameMatched = tryFilenameMatch(audioFiles, songs);
  if (filenameMatched) return filenameMatched;

  // Fall back to positional match (natural sort)
  return positionalMatch(audioFiles, songs);
}

/**
 * When encoreInSet2 is true, reassign encore songs (set 3) into set 2,
 * continuing the track numbering.
 */
export function mergeEncoreIntoSet2(songs: SetlistSong[]): SetlistSong[] {
  const set2Count = songs.filter((s) => s.set === 2).length;
  return songs.map((song) => {
    if (song.set === 3) {
      return {
        ...song,
        set: 2,
        position: set2Count + song.position,
      };
    }
    return song;
  });
}

function tryTagMatch(
  audioFiles: AudioInfo[],
  songs: SetlistSong[]
): MatchedTrack[] | null {
  // Check if all files have track numbers
  const allHaveTrackNumbers = audioFiles.every(
    (f) => f.trackNumber !== undefined
  );
  if (!allHaveTrackNumbers) return null;

  const sorted = [...audioFiles].sort(
    (a, b) => (a.trackNumber ?? 0) - (b.trackNumber ?? 0)
  );
  return buildMatches(sorted, songs);
}

function tryFilenameMatch(
  audioFiles: AudioInfo[],
  songs: SetlistSong[]
): MatchedTrack[] | null {
  const parsed = audioFiles.map((f) => ({
    file: f,
    parsed: parseTrackFilename(path.basename(f.filePath)),
  }));

  // Check if all files have a track number from filename
  const allHaveTrack = parsed.every((p) => p.parsed.track !== undefined);
  if (!allHaveTrack) return null;

  // If any have set numbers, sort by set then track; otherwise just track
  const anyHaveSet = parsed.some((p) => p.parsed.set !== undefined);

  const sorted = [...parsed].sort((a, b) => {
    if (anyHaveSet) {
      const setDiff = (a.parsed.set ?? 1) - (b.parsed.set ?? 1);
      if (setDiff !== 0) return setDiff;
    }
    return (a.parsed.track ?? 0) - (b.parsed.track ?? 0);
  });

  return buildMatches(
    sorted.map((p) => p.file),
    songs
  );
}

function positionalMatch(
  audioFiles: AudioInfo[],
  songs: SetlistSong[]
): MatchedTrack[] {
  const sorted = [...audioFiles].sort((a, b) =>
    naturalCompare(path.basename(a.filePath), path.basename(b.filePath))
  );
  return buildMatches(sorted, songs);
}

function buildMatches(
  sortedFiles: AudioInfo[],
  songs: SetlistSong[]
): MatchedTrack[] {
  return sortedFiles.map((file, i) => {
    const song = songs[i];
    // Track set-level numbering
    const songsInSetBefore = songs
      .slice(0, i)
      .filter((s) => s.set === song.set).length;
    return {
      audioFile: file,
      song,
      effectiveSet: song.set,
      trackInSet: songsInSetBefore + 1,
    };
  });
}

/**
 * Natural sort comparison for filenames (handles numeric parts).
 */
export function naturalCompare(a: string, b: string): number {
  const aParts = a.split(/(\d+)/);
  const bParts = b.split(/(\d+)/);
  const len = Math.min(aParts.length, bParts.length);

  for (let i = 0; i < len; i++) {
    const aNum = parseInt(aParts[i], 10);
    const bNum = parseInt(bParts[i], 10);
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum - bNum;
    } else {
      const cmp = aParts[i].localeCompare(bParts[i]);
      if (cmp !== 0) return cmp;
    }
  }
  return aParts.length - bParts.length;
}

export class TrackCountMismatchError extends Error {
  constructor(
    public audioFiles: AudioInfo[],
    public songs: SetlistSong[]
  ) {
    const fileNames = audioFiles
      .map((f) => `  ${path.basename(f.filePath)}`)
      .join("\n");
    const songNames = songs
      .map((s) => `  Set ${s.set}, #${s.position}: ${s.title}`)
      .join("\n");
    super(
      `Track count mismatch: ${audioFiles.length} audio files vs ${songs.length} setlist songs.\n\n` +
        `Audio files:\n${fileNames}\n\nSetlist:\n${songNames}`
    );
    this.name = "TrackCountMismatchError";
  }
}
