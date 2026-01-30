import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { MatchedTrack, ShowInfo, BandConfig, ProgressCallback } from "../config/types.js";
import { renderTemplate, zeroPad, sanitize, sanitizeFilename } from "./template.js";

const execFileAsync = promisify(execFile);

/**
 * Read existing tags from a FLAC file and filter based on keepTags patterns.
 * Returns an array of "TAG=value" strings for tags that should be preserved.
 */
async function readAndFilterTags(
  filePath: string,
  keepTags: string[]
): Promise<string[]> {
  if (!keepTags || keepTags.length === 0) {
    return [];
  }

  try {
    // Export all tags to stdout
    const { stdout } = await execFileAsync("metaflac", [
      "--export-tags-to=-",
      filePath,
    ]);

    // Parse tags (format: "TAG=value")
    const allTags = stdout
      .trim()
      .split("\n")
      .filter((line) => line.includes("="));

    // Filter tags based on keepTags patterns (with wildcard support)
    const tagsToKeep = allTags.filter((tagLine) => {
      const tagName = tagLine.split("=")[0];
      return keepTags.some((pattern) => {
        // Convert pattern to regex (support wildcards like "REPLAYGAIN_.*")
        const regex = new RegExp(`^${pattern.replace(/\*/g, ".*")}$`, "i");
        return regex.test(tagName);
      });
    });

    return tagsToKeep;
  } catch (error) {
    // If reading tags fails, just continue without preserving tags
    return [];
  }
}

/**
 * Tag a FLAC file with metadata using metaflac.
 * Uses metaflac for proper Vorbis comment support (compatible with all FLAC players).
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

  onProgress?.(`  Tagging: ${track.song.title}`);

  // Use metaflac for proper FLAC Vorbis comment tagging
  // metaflac modifies files in-place
  try {
    // Step 1: Read existing tags that should be preserved (based on keepTags patterns)
    const keepTagsPatterns = bandConfig.keepTags ?? [];
    const tagsToKeep = await readAndFilterTags(inputPath, keepTagsPatterns);

    // Step 2: Remove all tags
    await execFileAsync("metaflac", [
      "--remove-all-tags",
      "--preserve-modtime",
      inputPath,
    ]);

    // Step 3: Add our managed tags
    await execFileAsync("metaflac", [
      `--set-tag=ARTIST=${artist}`,
      `--set-tag=ALBUM=${album}`,
      `--set-tag=ALBUMARTIST=${albumArtist}`,
      `--set-tag=TITLE=${title}`,
      `--set-tag=TRACKNUMBER=${zeroPad(track.trackInSet)}`,
      `--set-tag=DISCNUMBER=${track.effectiveSet}`,
      `--set-tag=GENRE=${genre}`,
      `--set-tag=DATE=${year}`,
      "--preserve-modtime",
      inputPath,
    ]);

    // Step 4: Re-add preserved tags (if any)
    if (tagsToKeep.length > 0) {
      const setTagArgs = tagsToKeep.map((tag) => `--set-tag=${tag}`);
      await execFileAsync("metaflac", [
        ...setTagArgs,
        "--preserve-modtime",
        inputPath,
      ]);
    }
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
 * Build a location string from city, state, and country.
 * For US shows (2-letter state codes), returns "City, ST".
 * For international shows with country, returns "City, Country".
 * Otherwise, returns just "City".
 */
function buildLocation(city: string, state: string, country?: string): string {
  const sanitizedCity = sanitizeFilename(city);
  const sanitizedState = sanitizeFilename(state);
  const sanitizedCountry = country ? sanitizeFilename(country) : undefined;

  // US show - include state
  if (sanitizedState && isUsState(state)) {
    return `${sanitizedCity}, ${sanitizedState}`;
  }

  // International show with country - include country
  if (sanitizedCountry) {
    return `${sanitizedCity}, ${sanitizedCountry}`;
  }

  // Fallback - just city
  return sanitizedCity;
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
    location: buildLocation(showInfo.city, showInfo.state, showInfo.country),
    title: sanitizeFilename(track.song.title),
    track: zeroPad(track.trackInSet),
    set: track.effectiveSet,
    discnumber: track.effectiveSet,
  };
}
