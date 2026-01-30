import { execFile } from "node:child_process";
import { promisify } from "node:util";
import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import { parseFile } from "music-metadata";
import type { AudioInfo, ProgressCallback, BandConfig } from "../config/types.js";
import {
  findMatchingRule,
  ruleRequiresConversion,
  type ConversionRule,
} from "../config/conversion-rules.js";
import { validateAudioFormat } from "./formats.js";

const execFileAsync = promisify(execFile);

/**
 * Analyze an audio file using music-metadata.
 * Returns audio properties and any existing tags.
 * Throws an error if the audio format is unknown.
 */
export async function analyzeAudio(filePath: string): Promise<AudioInfo> {
  // Validate that we know this format
  validateAudioFormat(filePath);

  const metadata = await parseFile(filePath);

  return {
    filePath,
    bitsPerSample: metadata.format.bitsPerSample,
    sampleRate: metadata.format.sampleRate,
    trackNumber: metadata.common.track?.no ?? undefined,
    discNumber: metadata.common.disk?.no ?? undefined,
    title: metadata.common.title,
    duration: metadata.format.duration,
  };
}

/**
 * Analyze all audio files in a list.
 * Skips files that cannot be analyzed with a warning.
 */
export async function analyzeAllAudio(
  filePaths: string[],
  onProgress?: ProgressCallback
): Promise<AudioInfo[]> {
  const results: AudioInfo[] = [];
  for (const filePath of filePaths) {
    onProgress?.(`  Analyzing: ${path.basename(filePath)}`);
    try {
      results.push(await analyzeAudio(filePath));
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onProgress?.(`  WARNING: Skipping ${path.basename(filePath)}: ${msg}`);
    }
  }

  if (results.length === 0) {
    throw new Error("No valid audio files found after analysis");
  }

  return results;
}

/**
 * Check whether an audio file needs conversion based on conversion rules.
 */
export function needsConversion(info: AudioInfo): boolean {
  const rule = findMatchingRule(info);
  return ruleRequiresConversion(rule);
}

/**
 * Build FFmpeg arguments for audio conversion based on a conversion rule.
 */
function buildConversionArgs(
  rule: ConversionRule,
  bandConfig: BandConfig,
  inputPath: string,
  outputPath: string
): string[] {
  const args: string[] = ["-i", inputPath];

  // Codec
  if (rule.target.codec === "flac") {
    args.push("-c:a", "flac");

    // FLAC compression level
    const compressionLevel = bandConfig.conversion?.flac?.compressionLevel ?? 8;
    args.push("-compression_level", compressionLevel.toString());
  } else {
    args.push("-c:a", "flac"); // Default to FLAC
    const compressionLevel = bandConfig.conversion?.flac?.compressionLevel ?? 8;
    args.push("-compression_level", compressionLevel.toString());
  }

  // Bit depth
  if (rule.target.bitDepth) {
    const sampleFmt = rule.target.bitDepth === 16 ? "s16" : `s${rule.target.bitDepth}`;
    args.push("-sample_fmt", sampleFmt);
  }

  // Sample rate with resampling quality
  if (rule.target.sampleRate) {
    args.push("-ar", rule.target.sampleRate.toString());

    // Add resampling quality if specified
    // SoXR precision: 0 (fastest) to 33 (best quality)
    // For archival quality, use 28+ (VHQ = Very High Quality)
    if (rule.ffmpegOptions.resampleQuality) {
      const qualityMap = {
        low: "16",    // Low quality (fast)
        medium: "20", // Medium quality (default SoXR)
        high: "28",   // Very high quality (archival, recommended)
      };
      args.push("-af", `aresample=resampler=soxr:precision=${qualityMap[rule.ffmpegOptions.resampleQuality]}`);
    }
  }

  // Dithering (when reducing bit depth)
  if (rule.ffmpegOptions.dither && rule.target.bitDepth && rule.target.bitDepth < 24) {
    // Explicitly use triangular dithering for high quality bit depth reduction
    // triangular_hp = high-pass triangular dither (recommended for 24→16 conversion)
    args.push("-dither_method", "triangular_hp");
  }

  // Custom arguments
  if (rule.ffmpegOptions.customArgs) {
    args.push(...rule.ffmpegOptions.customArgs);
  }

  // Output file
  args.push("-y", outputPath);

  return args;
}

/**
 * Convert an audio file according to conversion rules.
 * Returns the path to the converted file (replaces original in same directory).
 */
export async function convertAudio(
  info: AudioInfo,
  bandConfig: BandConfig,
  onProgress?: ProgressCallback
): Promise<string> {
  const rule = findMatchingRule(info);
  const filePath = info.filePath;
  const dir = path.dirname(filePath);
  const base = path.basename(filePath, path.extname(filePath));
  const outPath = path.join(dir, `${base}_converted.flac`);

  // Build conversion description
  const targetDesc: string[] = [];
  if (rule.target.bitDepth) targetDesc.push(`${rule.target.bitDepth}-bit`);
  if (rule.target.sampleRate) targetDesc.push(`${rule.target.sampleRate / 1000}kHz`);
  const desc = targetDesc.length > 0 ? targetDesc.join("/") : "FLAC";

  onProgress?.(`  Converting: ${path.basename(filePath)} -> ${desc} (${rule.name})`);

  const args = buildConversionArgs(rule, bandConfig, filePath, outPath);
  await execFileAsync("ffmpeg", args);

  // Replace original with converted
  await fs.unlink(filePath);
  await fs.rename(outPath, filePath);

  return filePath;
}

/**
 * Convert an audio file to a specific target directory.
 * Returns the path to the converted file in the target directory.
 */
export async function convertAudioToTarget(
  info: AudioInfo,
  targetDir: string,
  bandConfig: BandConfig,
  onProgress?: ProgressCallback
): Promise<string> {
  const rule = findMatchingRule(info);
  const filePath = info.filePath;
  const base = path.basename(filePath, path.extname(filePath));

  // If converting in the same directory, use a temp filename to avoid in-place conversion
  const inputDir = path.dirname(filePath);
  const useTempName = path.resolve(inputDir) === path.resolve(targetDir);
  const tempOutPath = path.join(targetDir, `${base}_converting.flac`);
  const finalOutPath = path.join(targetDir, `${base}.flac`);
  const outPath = useTempName ? tempOutPath : finalOutPath;

  // Build conversion description
  const targetDesc: string[] = [];
  if (rule.target.bitDepth) targetDesc.push(`${rule.target.bitDepth}-bit`);
  if (rule.target.sampleRate) targetDesc.push(`${rule.target.sampleRate / 1000}kHz`);
  const desc = targetDesc.length > 0 ? targetDesc.join("/") : "FLAC";

  onProgress?.(`  Converting: ${path.basename(filePath)} -> ${desc} (${rule.name})`);

  const args = buildConversionArgs(rule, bandConfig, filePath, outPath);
  await execFileAsync("ffmpeg", args);

  // If we used a temp name, replace the original
  if (useTempName) {
    await fs.unlink(filePath);
    await fs.rename(tempOutPath, finalOutPath);
  }

  return finalOutPath;
}

/**
 * Convert all audio files that need it based on conversion rules.
 * If conversion is needed and files are not in temp, creates a temp directory.
 * Returns updated audio infos and working directory info.
 */
export async function convertAllIfNeeded(
  audioInfos: AudioInfo[],
  workingDir: { path: string; shouldCleanup: boolean },
  bandConfig: BandConfig,
  skipConversion: boolean,
  onProgress?: ProgressCallback
): Promise<{ audioInfos: AudioInfo[]; workingDir: { path: string; shouldCleanup: boolean } }> {
  if (skipConversion) {
    onProgress?.("Skipping audio conversion (--skip-conversion)");
    return { audioInfos, workingDir };
  }

  const toConvert = audioInfos.filter(needsConversion);
  if (toConvert.length === 0) {
    onProgress?.("No conversion needed");
    return { audioInfos, workingDir };
  }

  // Check if we're already in a temp directory
  const isInTemp = workingDir.path.startsWith(os.tmpdir());

  let targetDir = workingDir.path;
  let shouldCleanup = workingDir.shouldCleanup;

  if (!isInTemp) {
    // Create temp directory for converted files
    targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-music-"));
    shouldCleanup = true;
    onProgress?.(`Converting to temp directory: ${targetDir}`);
  }

  onProgress?.(`Converting ${toConvert.length} file(s)...`);
  const convertedPaths: Map<string, string> = new Map();

  for (const info of toConvert) {
    const newPath = await convertAudioToTarget(info, targetDir, bandConfig, onProgress);
    convertedPaths.set(info.filePath, newPath);
  }

  // Update audio infos with new paths
  const updatedInfos = audioInfos.map(info => {
    const newPath = convertedPaths.get(info.filePath);
    if (newPath) {
      return { ...info, filePath: newPath };
    }
    // If not converted, copy to temp if we created a temp dir
    if (!isInTemp && targetDir !== workingDir.path) {
      return { ...info, filePath: path.join(targetDir, path.basename(info.filePath)) };
    }
    return info;
  });

  // Copy non-converted files to temp if needed
  if (!isInTemp && targetDir !== workingDir.path) {
    for (const info of audioInfos) {
      if (!convertedPaths.has(info.filePath)) {
        const destPath = path.join(targetDir, path.basename(info.filePath));
        onProgress?.(`  Copying: ${path.basename(info.filePath)}`);
        await fs.copyFile(info.filePath, destPath);
      }
    }
  }

  // Re-analyze all files in the target directory
  onProgress?.("Re-analyzing converted files...");
  const finalInfos = await analyzeAllAudio(
    updatedInfos.map((i) => i.filePath),
    onProgress
  );

  return {
    audioInfos: finalInfos,
    workingDir: { path: targetDir, shouldCleanup }
  };
}
