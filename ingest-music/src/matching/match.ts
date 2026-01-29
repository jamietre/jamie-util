import type { AudioInfo, SetlistSong, MatchedTrack } from "../config/types.js";
import { parseTrackFilename } from "./parse-filename.js";
import * as path from "node:path";

/**
 * Normalize a string for fuzzy matching (lowercase, remove punctuation, etc.)
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, "") // Remove punctuation
    .replace(/\s+/g, " ") // Normalize whitespace
    .trim();
}

/**
 * Calculate similarity between two strings (0-1, where 1 is identical).
 * Uses a simple character-based similarity metric.
 */
function titleSimilarity(a: string, b: string): number {
  const normA = normalizeTitle(a);
  const normB = normalizeTitle(b);

  if (normA === normB) return 1.0;
  if (normA.length === 0 || normB.length === 0) return 0.0;

  // Simple substring matching - if one is contained in the other, high score
  if (normA.includes(normB) || normB.includes(normA)) {
    return 0.8;
  }

  // Character overlap ratio
  const aChars = new Set(normA);
  const bChars = new Set(normB);
  const intersection = new Set([...aChars].filter((c) => bChars.has(c)));
  const union = new Set([...aChars, ...bChars]);

  return intersection.size / union.size;
}

/**
 * Match audio files to setlist songs.
 *
 * Strategy:
 * 1. Validate count matches
 * 2. Try tag-based title matching (fuzzy match TITLE tag to setlist)
 * 3. Try filename-based title matching (fuzzy match parsed title to setlist)
 * 4. Try tag-based track number matching (TRACKNUMBER)
 * 5. Try filename-based positional matching (parsed set/track numbers)
 * 6. Fall back to positional order (natural sort)
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

  // Try tag-based title matching first
  const tagTitleMatched = tryTagTitleMatch(audioFiles, songs);
  if (tagTitleMatched) return tagTitleMatched;

  // Try filename-based title matching
  const filenameTitleMatched = tryFilenameTitleMatch(audioFiles, songs);
  if (filenameTitleMatched) return filenameTitleMatched;

  // Try tag-based track number matching
  const tagMatched = tryTagTrackNumberMatch(audioFiles, songs);
  if (tagMatched) return tagMatched;

  // Try filename-based positional matching
  const filenameMatched = tryFilenamePositionalMatch(audioFiles, songs);
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

/**
 * Try to match files to songs using TITLE tags with fuzzy matching.
 */
function tryTagTitleMatch(
  audioFiles: AudioInfo[],
  songs: SetlistSong[]
): MatchedTrack[] | null {
  // Check if all files have titles in tags
  const allHaveTitles = audioFiles.every((f) => f.title && f.title.trim().length > 0);
  if (!allHaveTitles) return null;

  return fuzzyTitleMatch(audioFiles, songs, (f) => f.title!);
}

/**
 * Try to match files to songs using titles parsed from filenames.
 */
function tryFilenameTitleMatch(
  audioFiles: AudioInfo[],
  songs: SetlistSong[]
): MatchedTrack[] | null {
  const parsed = audioFiles.map((f) => ({
    file: f,
    parsed: parseTrackFilename(path.basename(f.filePath)),
  }));

  // Check if all files have titles in filenames
  const allHaveTitles = parsed.every((p) => p.parsed.title && p.parsed.title.trim().length > 0);
  if (!allHaveTitles) return null;

  return fuzzyTitleMatch(audioFiles, songs, (f) => {
    const parsed = parseTrackFilename(path.basename(f.filePath));
    return parsed.title!;
  });
}

/**
 * Perform fuzzy title matching between files and songs.
 * Returns null if matching confidence is too low.
 */
function fuzzyTitleMatch(
  audioFiles: AudioInfo[],
  songs: SetlistSong[],
  getTitleFn: (file: AudioInfo) => string
): MatchedTrack[] | null {
  const matched: Array<{ file: AudioInfo; song: SetlistSong; score: number }> = [];
  const usedSongs = new Set<number>();

  // Match each file to best matching song
  for (const file of audioFiles) {
    const fileTitle = getTitleFn(file);
    let bestMatch: { songIndex: number; score: number } | null = null;

    for (let i = 0; i < songs.length; i++) {
      if (usedSongs.has(i)) continue;

      const score = titleSimilarity(fileTitle, songs[i].title);
      if (!bestMatch || score > bestMatch.score) {
        bestMatch = { songIndex: i, score };
      }
    }

    if (!bestMatch || bestMatch.score < 0.5) {
      // Confidence too low
      return null;
    }

    matched.push({
      file,
      song: songs[bestMatch.songIndex],
      score: bestMatch.score,
    });
    usedSongs.add(bestMatch.songIndex);
  }

  // Build matches in setlist order
  const sortedMatches = matched.sort((a, b) => {
    const aIndex = songs.indexOf(a.song);
    const bIndex = songs.indexOf(b.song);
    return aIndex - bIndex;
  });

  return sortedMatches.map((m, i) => {
    const song = m.song;
    const songsInSetBefore = songs
      .slice(0, songs.indexOf(song))
      .filter((s) => s.set === song.set).length;
    return {
      audioFile: m.file,
      song,
      effectiveSet: song.set,
      trackInSet: songsInSetBefore + 1,
    };
  });
}

function tryTagTrackNumberMatch(
  audioFiles: AudioInfo[],
  songs: SetlistSong[]
): MatchedTrack[] | null {
  // Check if all files have track numbers
  const allHaveTrackNumbers = audioFiles.every(
    (f) => f.trackNumber !== undefined
  );
  if (!allHaveTrackNumbers) return null;

  // Sort by disc number (if present) then track number
  const sorted = [...audioFiles].sort((a, b) => {
    // If both have disc numbers, sort by disc first
    if (a.discNumber !== undefined && b.discNumber !== undefined) {
      const discDiff = a.discNumber - b.discNumber;
      if (discDiff !== 0) return discDiff;
    }
    // Then by track number
    return (a.trackNumber ?? 0) - (b.trackNumber ?? 0);
  });

  return buildMatches(sorted, songs);
}

function tryFilenamePositionalMatch(
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
