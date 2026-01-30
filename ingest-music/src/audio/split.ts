import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import type { TrackSplit, TrackMerge, ProgressCallback } from "../config/types.js";

const execFileAsync = promisify(execFile);

/**
 * Parse a split specification string into a TrackSplit object.
 * Supports formats:
 * - "S2T17 12:22:00" (set 2, track 17, split at 12:22:00)
 * - "S2T17 12:22" (MM:SS)
 * - "S2T17 742" (seconds)
 * - "2-17 12:22:00" (alternative format)
 */
export function parseSplitSpec(spec: string): TrackSplit {
  const parts = spec.trim().split(/\s+/);
  if (parts.length !== 2) {
    throw new Error(`Invalid split specification: "${spec}". Expected format: "S2T17 12:22:00"`);
  }

  const [trackId, timeStr] = parts;

  // Parse track identifier (S2T17 or 2-17)
  let set: number;
  let track: number;

  const setTrackMatch = trackId.match(/^S(\d+)T(\d+)$/i);
  const dashMatch = trackId.match(/^(\d+)-(\d+)$/);

  if (setTrackMatch) {
    set = parseInt(setTrackMatch[1], 10);
    track = parseInt(setTrackMatch[2], 10);
  } else if (dashMatch) {
    set = parseInt(dashMatch[1], 10);
    track = parseInt(dashMatch[2], 10);
  } else {
    throw new Error(`Invalid track identifier: "${trackId}". Use "S2T17" or "2-17" format.`);
  }

  // Parse timestamp (HH:MM:SS, MM:SS, or seconds)
  const timestamp = parseTimestamp(timeStr);

  return { set, track, timestamp };
}

/**
 * Parse a timestamp string into seconds.
 * Supports: HH:MM:SS, MM:SS, or raw seconds.
 */
function parseTimestamp(timeStr: string): number {
  // Try parsing as raw seconds first
  const asNumber = parseFloat(timeStr);
  if (!isNaN(asNumber) && !timeStr.includes(":")) {
    return asNumber;
  }

  // Parse HH:MM:SS or MM:SS format
  const parts = timeStr.split(":").map((p) => parseInt(p, 10));
  if (parts.some(isNaN)) {
    throw new Error(`Invalid timestamp: "${timeStr}". Use HH:MM:SS, MM:SS, or seconds.`);
  }

  if (parts.length === 3) {
    // HH:MM:SS
    const [hours, minutes, seconds] = parts;
    return hours * 3600 + minutes * 60 + seconds;
  } else if (parts.length === 2) {
    // MM:SS
    const [minutes, seconds] = parts;
    return minutes * 60 + seconds;
  } else {
    throw new Error(`Invalid timestamp: "${timeStr}". Use HH:MM:SS, MM:SS, or seconds.`);
  }
}

/**
 * Format seconds into HH:MM:SS or MM:SS string.
 */
function formatTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  } else {
    return `${minutes}:${String(secs).padStart(2, "0")}`;
  }
}

/**
 * Split an audio file at a specific timestamp using ffmpeg.
 * Creates two new files and returns their paths.
 * The original file is NOT deleted.
 */
async function splitAudioFile(
  inputPath: string,
  timestamp: number,
  onProgress?: ProgressCallback
): Promise<{ part1: string; part2: string }> {
  const dir = path.dirname(inputPath);
  const ext = path.extname(inputPath);
  const base = path.basename(inputPath, ext);

  // Create unique names for the split parts
  const part1Path = path.join(dir, `${base}_part1${ext}`);
  const part2Path = path.join(dir, `${base}_part2${ext}`);

  onProgress?.(
    `    Splitting at ${formatTimestamp(timestamp)}: ${path.basename(inputPath)}`
  );

  // Part 1: from start to timestamp
  await execFileAsync("ffmpeg", [
    "-i", inputPath,
    "-t", timestamp.toString(),
    "-c", "copy",
    "-y", part1Path,
  ]);

  // Part 2: from timestamp to end
  await execFileAsync("ffmpeg", [
    "-i", inputPath,
    "-ss", timestamp.toString(),
    "-c", "copy",
    "-y", part2Path,
  ]);

  return { part1: part1Path, part2: part2Path };
}

/**
 * Find a file by set and track position in a sorted file list.
 * Uses simple position-based indexing: all files are numbered 1, 2, 3...
 * Set parameter is currently ignored (assumes single-set or combined list).
 * Returns the index in the array, or -1 if not found.
 */
function findFileByPosition(
  filePaths: string[],
  set: number,
  track: number
): number {
  // For now, use simple 1-based indexing across all files
  // TODO: Could enhance to group by set based on filename patterns (d1, d2, etc.)
  const index = track - 1; // Convert 1-based to 0-based
  if (index >= 0 && index < filePaths.length) {
    return index;
  }
  return -1;
}

/**
 * Apply track splits to audio file paths.
 * Splits specified files and returns an updated file list.
 * This should be called BEFORE analyzing audio files.
 */
export async function applySplitsToFiles(
  filePaths: string[],
  splits: TrackSplit[],
  onProgress?: ProgressCallback
): Promise<string[]> {
  if (splits.length === 0) {
    return filePaths;
  }

  onProgress?.(`\nApplying ${splits.length} track split(s)...`);

  let updatedPaths = [...filePaths];

  // Process splits in reverse order to avoid index shifting issues
  const sortedSplits = [...splits].sort((a, b) => {
    if (a.set !== b.set) return b.set - a.set;
    return b.track - a.track;
  });

  for (const split of sortedSplits) {
    const fileIndex = findFileByPosition(updatedPaths, split.set, split.track);

    if (fileIndex === -1) {
      onProgress?.(
        `  Warning: Track S${split.set}T${split.track} not found (only ${updatedPaths.length} files), skipping split`
      );
      continue;
    }

    const filePath = updatedPaths[fileIndex];
    onProgress?.(
      `  Splitting track ${split.track}: ${path.basename(filePath)} at ${formatTimestamp(split.timestamp)}`
    );

    try {
      // Split the audio file
      const { part1, part2 } = await splitAudioFile(
        filePath,
        split.timestamp,
        onProgress
      );

      // Replace the original file with the two parts in the file list
      updatedPaths.splice(fileIndex, 1, part1, part2);

      onProgress?.(
        `    Created: ${path.basename(part1)} + ${path.basename(part2)}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onProgress?.(
        `  Error splitting track ${split.track}: ${msg}`
      );
      // Continue with other splits even if one fails
    }
  }

  return updatedPaths;
}

// --- Track Merging ---

/**
 * Parse a merge specification string into a TrackMerge object.
 * Supports formats:
 * - "S1T01 S1T02 S1T03" (set 1, tracks 1-3)
 * - "D1T01 D1T02" (alternative format with D for disc)
 * - "1 2 3" (simple track numbers, assumes same set)
 */
export function parseMergeSpec(spec: string): TrackMerge {
  const parts = spec.trim().split(/\s+/);
  if (parts.length < 2) {
    throw new Error(`Invalid merge specification: "${spec}". Expected at least 2 tracks like "S1T01 S1T02"`);
  }

  const tracks: Array<{ set: number; track: number }> = [];

  for (const part of parts) {
    // Try S1T01 format
    const setTrackMatch = part.match(/^[SD](\d+)T(\d+)$/i);
    if (setTrackMatch) {
      tracks.push({
        set: parseInt(setTrackMatch[1], 10),
        track: parseInt(setTrackMatch[2], 10),
      });
      continue;
    }

    // Try simple number format
    const numMatch = part.match(/^(\d+)$/);
    if (numMatch) {
      tracks.push({
        set: 1, // Default to set 1 for simple numbers
        track: parseInt(numMatch[1], 10),
      });
      continue;
    }

    throw new Error(`Invalid track identifier in merge spec: "${part}". Use "S1T01" or number format.`);
  }

  return { tracks };
}

/**
 * Validate that tracks are sequential (consecutive track numbers in same set).
 */
function validateSequentialTracks(merge: TrackMerge): void {
  const { tracks } = merge;

  // Check all tracks are in same set
  const sets = new Set(tracks.map((t) => t.set));
  if (sets.size > 1) {
    throw new Error(
      `Cannot merge tracks from different sets: ${Array.from(sets).join(", ")}`
    );
  }

  // Check tracks are consecutive
  const trackNumbers = tracks.map((t) => t.track).sort((a, b) => a - b);
  for (let i = 1; i < trackNumbers.length; i++) {
    if (trackNumbers[i] !== trackNumbers[i - 1] + 1) {
      throw new Error(
        `Tracks must be sequential. Gap found between ${trackNumbers[i - 1]} and ${trackNumbers[i]}`
      );
    }
  }
}

/**
 * Merge multiple audio files into one using ffmpeg concat.
 * Returns the path to the merged file.
 */
async function mergeAudioFiles(
  inputPaths: string[],
  outputPath: string,
  onProgress?: ProgressCallback
): Promise<string> {
  // Create a concat list file for ffmpeg
  const tmpDir = path.dirname(outputPath);
  const concatFile = path.join(tmpDir, `concat-${Date.now()}.txt`);

  try {
    // Write concat file with format: file '/path/to/file.flac'
    const concatContent = inputPaths
      .map((p) => `file '${p.replace(/'/g, "'\\''")}'`) // Escape single quotes
      .join("\n");
    await fs.writeFile(concatFile, concatContent, "utf-8");

    onProgress?.(
      `    Merging ${inputPaths.length} files: ${inputPaths.map(p => path.basename(p)).join(", ")}`
    );

    // Use ffmpeg concat demuxer for lossless concatenation
    await execFileAsync("ffmpeg", [
      "-f", "concat",
      "-safe", "0",
      "-i", concatFile,
      "-c", "copy", // Copy streams without re-encoding
      "-y", outputPath,
    ]);

    return outputPath;
  } finally {
    // Clean up concat file
    await fs.unlink(concatFile).catch(() => {
      // Ignore errors during cleanup
    });
  }
}

/**
 * Apply track merges to audio file paths.
 * Merges specified files and returns an updated file list.
 * This should be called BEFORE analyzing audio files.
 */
export async function applyMergesToFiles(
  filePaths: string[],
  merges: TrackMerge[],
  onProgress?: ProgressCallback
): Promise<string[]> {
  if (merges.length === 0) {
    return filePaths;
  }

  onProgress?.(`\nApplying ${merges.length} track merge(s)...`);

  let updatedPaths = [...filePaths];

  // Process merges in reverse order of first track to avoid index shifting
  const sortedMerges = [...merges].sort((a, b) => {
    const aFirst = a.tracks[0];
    const bFirst = b.tracks[0];
    if (aFirst.set !== bFirst.set) return bFirst.set - aFirst.set;
    return bFirst.track - aFirst.track;
  });

  for (const merge of sortedMerges) {
    try {
      // Validate tracks are sequential
      validateSequentialTracks(merge);

      // Find file indices for all tracks in the merge
      const firstTrack = merge.tracks[0];
      const firstIndex = firstTrack.track - 1; // Convert 1-based to 0-based

      if (firstIndex < 0 || firstIndex >= updatedPaths.length) {
        onProgress?.(
          `  Warning: Track ${firstTrack.track} out of range (only ${updatedPaths.length} files), skipping merge`
        );
        continue;
      }

      // Get all files to merge
      const filesToMerge: string[] = [];
      for (const track of merge.tracks) {
        const idx = track.track - 1;
        if (idx >= updatedPaths.length) {
          throw new Error(
            `Track ${track.track} out of range (only ${updatedPaths.length} files)`
          );
        }
        filesToMerge.push(updatedPaths[idx]);
      }

      onProgress?.(
        `  Merging tracks ${merge.tracks.map(t => t.track).join(", ")}`
      );

      // Create merged file path
      const firstFile = filesToMerge[0];
      const dir = path.dirname(firstFile);
      const ext = path.extname(firstFile);
      const base = path.basename(firstFile, ext);
      const mergedPath = path.join(dir, `${base}_merged${ext}`);

      // Merge the files
      await mergeAudioFiles(filesToMerge, mergedPath, onProgress);

      // Update file list: remove individual files, add merged file
      const lastTrackIdx = merge.tracks[merge.tracks.length - 1].track - 1;
      updatedPaths.splice(
        firstIndex,
        lastTrackIdx - firstIndex + 1,
        mergedPath
      );

      onProgress?.(
        `    Created: ${path.basename(mergedPath)}`
      );
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      onProgress?.(
        `  Error merging tracks: ${msg}`
      );
      // Continue with other merges even if one fails
    }
  }

  return updatedPaths;
}
