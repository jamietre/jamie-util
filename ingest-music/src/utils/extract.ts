import * as fs from "node:fs/promises";
import { createReadStream, createWriteStream } from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { pipeline } from "node:stream/promises";
import { createGunzip } from "node:zlib";
import { open } from "yauzl-promise";
import * as tar from "tar";
import { createExtractorFromFile } from "node-unrar-js";
import type { ProgressCallback } from "../config/types.js";
import { naturalCompare } from "../matching/match.js";
import { getAudioExtensions } from "../audio/formats.js";

const AUDIO_EXTENSIONS = getAudioExtensions();

/** Supported archive extensions and their format identifiers */
type ArchiveFormat = "zip" | "tar.gz" | "gz" | "rar";

/**
 * Detect archive format from filename.
 */
export function detectArchiveFormat(filePath: string): ArchiveFormat | null {
  const lower = filePath.toLowerCase();
  if (lower.endsWith(".zip")) return "zip";
  if (lower.endsWith(".tar.gz") || lower.endsWith(".tgz")) return "tar.gz";
  if (lower.endsWith(".gz") && !lower.endsWith(".tar.gz")) return "gz";
  if (lower.endsWith(".rar")) return "rar";
  return null;
}

/**
 * List of file extensions recognized as archives for batch mode.
 */
export const ARCHIVE_EXTENSIONS = [".zip", ".tar.gz", ".tgz", ".gz", ".rar"];

/**
 * Check if a filename is a supported archive.
 */
export function isArchive(filename: string): boolean {
  const lower = filename.toLowerCase();
  return ARCHIVE_EXTENSIONS.some((ext) => lower.endsWith(ext));
}

/**
 * Result of preparing a working directory for processing.
 */
export interface WorkingDirectory {
  /** Path to the directory containing audio files */
  path: string;
  /** Whether this directory should be cleaned up after processing */
  shouldCleanup: boolean;
}

/**
 * Prepare a working directory from either an archive or a directory.
 * - If given an archive (.zip, .tar.gz, .gz): extracts to temp directory (requires cleanup)
 * - If given a directory: uses it directly (no copy, no cleanup yet)
 * Returns the directory path and whether cleanup is needed.
 */
export async function extractArchive(
  inputPath: string,
  onProgress?: ProgressCallback,
): Promise<WorkingDirectory> {
  // Check if input is a directory
  const stats = await fs.stat(inputPath);
  if (stats.isDirectory()) {
    onProgress?.(`Using directory: ${inputPath}`);
    return { path: inputPath, shouldCleanup: false };
  }

  // Input is a file - must be an archive
  const format = detectArchiveFormat(inputPath);
  if (!format) {
    throw new Error(
      `Unsupported input: ${path.basename(inputPath)}\n` +
        `Expected a directory or archive (.zip, .tar.gz, .tgz, .gz, .rar)`,
    );
  }

  const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-music-"));
  onProgress?.(`Extracting to ${tmpDir}`);

  switch (format) {
    case "zip":
      await extractZip(inputPath, tmpDir, onProgress);
      break;
    case "tar.gz":
      await extractTarGz(inputPath, tmpDir, onProgress);
      break;
    case "gz":
      await extractGz(inputPath, tmpDir, onProgress);
      break;
    case "rar":
      await extractRar(inputPath, tmpDir, onProgress);
      break;
  }

  // Flatten: move all files up to tmpDir root
  await flattenAllFiles(tmpDir, onProgress);

  return { path: tmpDir, shouldCleanup: true };
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
 * Extract a .rar archive using node-unrar-js.
 */
async function extractRar(
  archivePath: string,
  destDir: string,
  onProgress?: ProgressCallback,
): Promise<void> {
  onProgress?.("  Extracting RAR archive...");

  // Create extractor
  const extractor = await createExtractorFromFile({
    filepath: archivePath,
    targetPath: destDir,
  });

  // Get file list and extract all
  const { fileHeaders } = extractor.getFileList();
  const extracted = extractor.extract();

  // Log progress for each file
  for (const file of extracted.files) {
    if (file.fileHeader.flags.directory) continue;
    onProgress?.(`  Extracting: ${path.basename(file.fileHeader.name)}`);
  }
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
 * Recursively copy a directory and all its contents.
 */
async function copyDirectory(
  srcDir: string,
  destDir: string,
  onProgress?: ProgressCallback
): Promise<void> {
  await fs.mkdir(destDir, { recursive: true });

  const entries = await fs.readdir(srcDir);
  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry);
    const destPath = path.join(destDir, entry);
    const stats = await fs.stat(srcPath);

    if (stats.isDirectory()) {
      await copyDirectory(srcPath, destPath, onProgress);
    } else {
      onProgress?.(`  Copying: ${entry}`);
      await fs.copyFile(srcPath, destPath);
    }
  }
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
    // Exclude temporary conversion files (artifacts from previous runs)
    .filter((e) => !e.endsWith("_converted.flac"))
    .sort(naturalCompare) // Natural sort: "2.flac" before "10.flac"
    .map((e) => path.join(dir, e));
}

/**
 * List non-audio files in a directory recursively.
 * These are supplementary files like artwork, info.txt, checksums, etc.
 * Excludes files matching the provided exclude patterns.
 * Returns relative paths from the base directory.
 */
export async function listNonAudioFiles(
  dir: string,
  excludePatterns: string[] = []
): Promise<Array<{ fullPath: string; relativePath: string }>> {
  const results: Array<{ fullPath: string; relativePath: string }> = [];

  async function walk(currentDir: string, relativePath: string = ""): Promise<void> {
    const entries = await fs.readdir(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      const entryRelative = relativePath ? path.join(relativePath, entry.name) : entry.name;
      const entryFull = path.join(currentDir, entry.name);

      // Skip excluded patterns
      if (shouldExcludeFile(entry.name, excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        // Recurse into subdirectories
        await walk(entryFull, entryRelative);
      } else if (!AUDIO_EXTENSIONS.has(path.extname(entry.name).toLowerCase())) {
        // Non-audio file - include it
        results.push({ fullPath: entryFull, relativePath: entryRelative });
      }
    }
  }

  await walk(dir);
  return results.sort((a, b) => naturalCompare(a.relativePath, b.relativePath));
}

/**
 * Clean up a temporary directory.
 */
export async function cleanupTempDir(dir: string): Promise<void> {
  await fs.rm(dir, { recursive: true, force: true });
}

/**
 * Read text files from a directory (for LLM context).
 * Looks for common text file extensions: .txt, .md, .nfo, .info
 * Returns a map of filename -> content.
 * Limits file size to 10KB to avoid reading large files.
 */
export async function readTextFiles(dir: string): Promise<Record<string, string>> {
  const textExtensions = new Set([".txt", ".md", ".nfo", ".info"]);
  const maxFileSize = 10 * 1024; // 10KB
  const results: Record<string, string> = {};

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.isFile()) {
        const ext = path.extname(entry.name).toLowerCase();
        if (textExtensions.has(ext)) {
          const filePath = path.join(dir, entry.name);
          try {
            const stats = await fs.stat(filePath);
            if (stats.size <= maxFileSize) {
              const content = await fs.readFile(filePath, "utf-8");
              results[entry.name] = content;
            }
          } catch {
            // Skip files that can't be read
          }
        }
      }
    }
  } catch {
    // If directory can't be read, return empty results
  }

  return results;
}
