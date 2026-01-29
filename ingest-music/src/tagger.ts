import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import type { MatchedTrack, ShowInfo, BandConfig, ProgressCallback } from "./types.js";
import { renderTemplate, zeroPad } from "./template.js";

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
  const album = renderTemplate(bandConfig.albumTemplate, vars);
  const albumArtist = renderTemplate(bandConfig.albumArtist, vars);

  const inputPath = track.audioFile.filePath;
  const dir = path.dirname(inputPath);
  const outPath = path.join(dir, `tagged_${path.basename(inputPath)}`);

  onProgress?.(`  Tagging: ${track.song.title}`);

  await execFileAsync("ffmpeg", [
    "-i",
    inputPath,
    "-c",
    "copy",
    "-metadata",
    `ARTIST=${showInfo.artist}`,
    "-metadata",
    `ALBUM=${album}`,
    "-metadata",
    `ALBUMARTIST=${albumArtist}`,
    "-metadata",
    `TITLE=${track.song.title}`,
    "-metadata",
    `TRACKNUMBER=${zeroPad(track.trackInSet)}`,
    "-metadata",
    `DISCNUMBER=${track.effectiveSet}`,
    "-metadata",
    `GENRE=${bandConfig.genre}`,
    "-metadata",
    `DATE=${showInfo.date}`,
    "-y",
    outPath,
  ]);

  // Replace original with tagged version
  await fs.unlink(inputPath);
  await fs.rename(outPath, inputPath);
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
 * Build template variables from a matched track and show info.
 */
export function buildTemplateVars(
  track: MatchedTrack,
  showInfo: ShowInfo
): Record<string, string | number> {
  return {
    artist: showInfo.artist,
    date: showInfo.date,
    venue: showInfo.venue,
    city: showInfo.city,
    state: showInfo.state,
    title: track.song.title,
    track: zeroPad(track.trackInSet),
    set: track.effectiveSet,
    discnumber: track.effectiveSet,
  };
}
