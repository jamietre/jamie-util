import * as fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { open } from "yauzl-promise";
import * as tar from "tar";
import type { ProgressCallback } from "../config/types.js";

const AUDIO_EXTENSIONS = new Set([".flac", ".wav", ".shn"]);

/** Supported archive extensions and their format identifiers */
type ArchiveFormat = "zip" | "tar.gz" | "gz";

/**
 * Detect archive format from filename.
 */
export function detectArchiveFormat(filePath: string): ArchiveFormat | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".gz") && !lower.endsWith(".tar.gz")) return "gz";
  return null;
}

/**
 * List of file extensions recognized as archives for batch mode.
 */
export const ARCHIVE_EXTENSIONS = [".zip", ".tar.gz", ".tgz", ".gz"];

/**
 * Check if a filename is a supported archive.
 */
export function isArchive(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Extract an archive to a temporary directory.
 * Supports .zip, .tar.gz/.tgz, and .gz formats.
 * Returns the path to the temp directory containing extracted audio files.
 */
export async function extractArchive(
  archivePath: string,
  onProgress?: ProgressCallback,
): Promise<string> {
  const format = detectArchiveFormat(archivePath);
  if (!format) {
    throw new Error(
      `Unsupported archive format: ${path.basename(archivePath)}\n` +
        `Supported formats: .zip, .tar.gz, .tgz, .gz`,
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-music-"));
  onProgress?.(`Extracting to ${tmpDir}`);

  switch (format) {
    case "zip":
      await extractZip(archivePath, tmpDir, onProgress);
      break;
    case "tar.gz":
      await extractTarGz(archivePath, tmpDir, onProgress);
      break;
    case "gz":
      await extractGz(archivePath, tmpDir, onProgress);
      break;
  }

  // Flatten: move all files up to tmpDir root
  await flattenAllFiles(tmpDir, onProgress);

  return tmpDir;
}

/**
 * Extract a .zip archive using yauzl-promise.
 */
async function extractZip(
  archivePath: string,
  destDir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const zipFile = await open(archivePath);
  try {
    for await (const entry of zipFile) {
      if (entry.filename.endsWith("/")) continue;

      const outName = path.basename(entry.filename);
      const outPath = path.join(destDir, outName);

      onProgress?.(`  Extracting: ${outName}`);
      const readStream = await entry.openReadStream();
      const writeStream = createWriteStream(outPath);
      await pipeline(readStream, writeStream);
    }
  } finally {
    await zipFile.close();
  }
}

/**
 * Extract a .tar.gz or .tgz archive using the tar package.
 */
async function extractTarGz(
  archivePath: string,
  destDir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.("  Extracting tar.gz...");
  await tar.extract({ file: archivePath, cwd: destDir });
}

/**
 * Extract a single .gz file using Node's built-in zlib.
 * Decompresses to destDir with the .gz extension stripped.
 */
async function extractGz(
  archivePath: string,
  destDir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.("  Decompressing .gz...");
  const baseName = path.basename(archivePath, ".gz");
  const outPath = path.join(destDir, baseName);
  await pipeline(
    createReadStream(archivePath),
    createGunzip(),
    createWriteStream(outPath),
  );
}

/**
 * Walk a directory tree and move all files to the root level.
 * Removes emptied subdirectories afterward.
 */
async function flattenAllFiles(
  dir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  const allFiles = await walkDir(dir);
  for (const filePath of allFiles) {
    // Already in root
    if (path.dirname(filePath) === dir) continue;

    const destPath = path.join(dir, path.basename(filePath));
    onProgress?.(`  Flattening: ${path.basename(filePath)}`);
    await fs.rename(filePath, destPath);
  }

  // Remove any now-empty subdirectories
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.isDirectory()) {
      await fs.rm(path.join(dir, entry.name), { recursive: true, force: true });
    }
  }
}

async function walkDir(dir: string): Promise<string[]> {
  const results: string[] = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...(await walkDir(fullPath)));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

/**
 * List audio files in a directory (non-recursive, root level only).
 */
/**
 * Check if a filename should be excluded based on regex patterns.
 */
function shouldExcludeFile(filename: string, patterns: string[]): boolean {
  const base = path.basename(filename);
  return patterns.some((pattern) => {
    try {
      const regex = new RegExp(pattern);
      return regex.test(base);
    } catch (e) {
      console.warn(`Invalid exclude pattern: ${pattern}`);
      return false;
    }
  });
}

export async function listAudioFiles(
  dir: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries
    .filter((e) => !shouldExcludeFile(e, excludePatterns))
    .filter((e) => AUDIO_EXTENSIONS.has(path.extname(e).toLowerCase()))
    .map((e) => path.join(dir, e));
}

/**
 * List non-audio files in a directory (non-recursive, root level only).
 * These are supplementary files like artwork, info.txt, checksums, etc.
 * Excludes files matching the provided exclude patterns.
 */
export async function listNonAudioFiles(
  dir: string,
  excludePatterns: string[] = []
): Promise<string[]> {
  const entries = await fs.readdir(dir);
  return entries
    .filter((e) => !shouldExcludeFile(e, excludePatterns))
    .filter((e) => !AUDIO_EXTENSIONS.has(path.extname(e).toLowerCase()))
    .map((e) => path.join(dir, e));
}

/**
 * Clean up a temporary directory.
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}
