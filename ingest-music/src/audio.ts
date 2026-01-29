import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import { parseFile } from "music-metadata";
import type { AudioInfo, ProgressCallback } from "./types.js";

const execFileAsync = promisify(execFile);

/**
 * Analyze an audio file using music-metadata.
 * Returns audio properties and any existing tags.
 */
export async function analyzeAudio(filePath: string): Promise<AudioInfo> {
  const metadata = await parseFile(filePath);

  return {
    filePath,
    bitsPerSample: metadata.format.bitsPerSample,
    sampleRate: metadata.format.sampleRate,
    trackNumber: metadata.common.track?.no ?? undefined,
    title: metadata.common.title,
    duration: metadata.format.duration,
  };
}

/**
 * Analyze all audio files in a list.
 */
export async function analyzeAllAudio(
  filePaths: string[],
  onProgress?: ProgressCallback
): Promise<AudioInfo[]> {
  const results: AudioInfo[] = [];
  for (const filePath of filePaths) {
    onProgress?.(`  Analyzing: ${path.basename(filePath)}`);
    results.push(await analyzeAudio(filePath));
  }
  return results;
}

/**
 * Check whether an audio file needs conversion (>16-bit or >48kHz).
 */
export function needsConversion(info: AudioInfo): boolean {
  return (
    (info.bitsPerSample !== undefined && info.bitsPerSample > 16) ||
    (info.sampleRate !== undefined && info.sampleRate > 48000)
  );
}

/**
 * Convert an audio file to 16-bit/48kHz FLAC using ffmpeg.
 * Returns the path to the converted file (replaces original in same directory).
 */
export async function convertAudio(
  filePath: string,
  onProgress?: ProgressCallback
): Promise<string> {
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(dir, `${base}_converted.flac`);

  onProgress?.(`  Converting: ${path.basename(filePath)} -> 16-bit/48kHz FLAC`);

  await execFileAsync("ffmpeg", [
    "-i",
    filePath,
    "-c:a",
    "flac",
    "-sample_fmt",
    "s16",
    "-ar",
    "48000",
    "-y",
    outPath,
  ]);

  // Replace original with converted
  await fs.unlink(filePath);
  await fs.rename(outPath, filePath);

  return filePath;
}

/**
 * Convert all audio files that need it.
 */
export async function convertAllIfNeeded(
  audioInfos: AudioInfo[],
  skipConversion: boolean,
  onProgress?: ProgressCallback
): Promise<AudioInfo[]> {
  if (skipConversion) {
    onProgress?.("Skipping audio conversion (--skip-conversion)");
    return audioInfos;
  }

  const toConvert = audioInfos.filter(needsConversion);
  if (toConvert.length === 0) {
    onProgress?.("No conversion needed (all files are 16-bit/48kHz or lower)");
    return audioInfos;
  }

  onProgress?.(`Converting ${toConvert.length} file(s) to 16-bit/48kHz FLAC`);
  for (const info of toConvert) {
    await convertAudio(info.filePath, onProgress);
  }

  // Re-analyze converted files
  onProgress?.("Re-analyzing converted files...");
  return analyzeAllAudio(
    audioInfos.map((i) => i.filePath),
    onProgress
  );
}
