import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { MatchedTrack, ShowInfo, BandConfig, ProgressCallback } from "../config/types.js";
import { renderTemplate, zeroPad, sanitize, sanitizeFilename } from "./template.js";

const execFileAsync = promisify(execFile);

/**
 * Tag a FLAC file with metadata using ffmpeg.
 * Uses -c copy to avoid re-encoding.
 */
export async function tagFlac(
  track: MatchedTrack,
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  onProgress?: ProgressCallback
): Promise<void> {
  const vars = buildTemplateVars(track, showInfo);
  const album = sanitize(renderTemplate(bandConfig.albumTemplate, vars));
  const albumArtist = sanitize(renderTemplate(bandConfig.albumArtist, vars));
  const artist = sanitize(showInfo.artist);
  const title = sanitize(track.song.title);
  const genre = sanitize(bandConfig.genre);
  const year = showInfo.date.split("-")[0]; // Extract YYYY from YYYY-MM-DD

  const inputPath = track.audioFile.filePath;
  const dir = path.dirname(inputPath);
  const outPath = path.join(dir, `tagged_${path.basename(inputPath)}`);

  onProgress?.(`  Tagging: ${track.song.title}`);

  // Clear each tag we're about to write (setting to empty string), then write new value
  // This ensures we replace existing tags rather than creating duplicates
  try {
    const { stdout, stderr } = await execFileAsync("ffmpeg", [
      "-i",
      inputPath,
      "-c",
      "copy",
      // Clear existing tags
      "-metadata", "ARTIST=",
      "-metadata", "ALBUM=",
      "-metadata", "ALBUMARTIST=",
      "-metadata", "TITLE=",
      "-metadata", "TRACKNUMBER=",
      "-metadata", "DISCNUMBER=",
      "-metadata", "GENRE=",
      "-metadata", "DATE=",
      "-metadata", "YEAR=", // Also clear YEAR in case it exists
      // Write new tags
      "-metadata", `ARTIST=${artist}`,
      "-metadata", `ALBUM=${album}`,
      "-metadata", `ALBUMARTIST=${albumArtist}`,
      "-metadata", `TITLE=${title}`,
      "-metadata", `TRACKNUMBER=${zeroPad(track.trackInSet)}`,
      "-metadata", `DISCNUMBER=${track.effectiveSet}`,
      "-metadata", `GENRE=${genre}`,
      "-metadata", `DATE=${year}`,
      "-y",
      outPath,
    ]);

    // Replace original with tagged version
    await fs.unlink(inputPath);
    await fs.rename(outPath, inputPath);
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    throw new Error(`Failed to tag ${path.basename(inputPath)}: ${msg}`);
  }
}

/**
 * Tag all matched tracks.
 */
export async function tagAllTracks(
  tracks: MatchedTrack[],
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.(`Tagging ${tracks.length} track(s)...`);
  for (const track of tracks) {
    await tagFlac(track, showInfo, bandConfig, onProgress);
  }
}

/**
 * Determine if a state code looks like a US state (2 uppercase letters).
 */
function isUsState(state: string): boolean {
  return /^[A-Z]{2}$/i.test(state.trim());
}

/**
 * Build a location string from city and state.
 * For US shows (2-letter state codes), returns "City, ST".
 * For international shows, returns just "City".
 */
function buildLocation(city: string, state: string): string {
  const sanitizedCity = sanitizeFilename(city);
  const sanitizedState = sanitizeFilename(state);

  // If state is empty or doesn't look like a US state, just use city
  if (!sanitizedState || !isUsState(state)) {
    return sanitizedCity;
  }

  // US show - include state
  return `${sanitizedCity}, ${sanitizedState}`;
}

/**
 * Build template variables from a matched track and show info.
 * All string values are sanitized for safe use in filenames (slashes → dashes).
 */
export function buildTemplateVars(
  track: MatchedTrack,
  showInfo: ShowInfo
): Record<string, string | number> {
  return {
    artist: sanitizeFilename(showInfo.artist),
    date: showInfo.date,
    venue: sanitizeFilename(showInfo.venue),
    city: sanitizeFilename(showInfo.city),
    state: sanitizeFilename(showInfo.state),
    location: buildLocation(showInfo.city, showInfo.state),
    title: sanitizeFilename(track.song.title),
    track: zeroPad(track.trackInSet),
    set: track.effectiveSet,
    discnumber: track.effectiveSet,
  };
}
