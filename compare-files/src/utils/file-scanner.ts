import fs from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import path from 'node:path';
import { logger } from './logger.js';

export interface ScanOptions {
  extensions?: string[];  // Filter by file extensions (e.g., ['.mkv', '.mp4'])
  minSizeBytes?: number;  // Minimum file size
  maxSizeBytes?: number | null;  // Maximum file size
  excludeDirs?: string[];  // Directory names to exclude (e.g., ['todo', 'temp'])
}

/**
 * Recursively scans a directory and returns all file paths
 * @param dirPath - Directory path to scan
 * @param options - Scan options for filtering
 * @returns Array of absolute file paths
 */
export async function scanDirectory(
  dirPath: string,
  options: ScanOptions = {}
): Promise<string[]> {
  const files: string[] = [];

  try {
    await scanDirectoryRecursive(dirPath, files, options);
  } catch (error) {
    logger.error(`Failed to scan directory: ${dirPath}`, error);
    throw error;
  }

  return files;
}

/**
 * Recursive helper function for scanning directories
 */
async function scanDirectoryRecursive(
  dirPath: string,
  files: string[],
  options: ScanOptions
): Promise<void> {
  let entries;

  try {
    entries = await fs.readdir(dirPath, { withFileTypes: true });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'EACCES') {
      logger.warn(`Permission denied: ${dirPath}`);
      return;
    }
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      logger.warn(`Directory not found: ${dirPath}`);
      return;
    }
    logger.warn(`Error reading directory ${dirPath}:`, error);
    return;
  }

  for (const entry of entries) {
    const fullPath = path.join(dirPath, entry.name);

    if (entry.isDirectory()) {
      // Check if directory should be excluded
      if (shouldExcludeDirectory(entry.name, options)) {
        logger.debug(`Excluding directory: ${fullPath}`);
        continue;
      }
      await scanDirectoryRecursive(fullPath, files, options);
    } else if (entry.isFile()) {
      // Apply filters
      if (shouldIncludeFile(fullPath, entry, options)) {
        files.push(fullPath);
      }
    }
  }
}

/**
 * Determines if a directory should be excluded
 */
function shouldExcludeDirectory(dirName: string, options: ScanOptions): boolean {
  if (!options.excludeDirs || options.excludeDirs.length === 0) {
    return false;
  }

  // Case-insensitive comparison
  const lowerDirName = dirName.toLowerCase();
  return options.excludeDirs.some(excluded => excluded.toLowerCase() === lowerDirName);
}

/**
 * Determines if a file should be included based on filters
 */
function shouldIncludeFile(
  filePath: string,
  entry: Dirent,
  options: ScanOptions
): boolean {
  // Extension filter
  if (options.extensions && options.extensions.length > 0) {
    const ext = path.extname(filePath).toLowerCase();
    if (!options.extensions.some(e => e.toLowerCase() === ext)) {
      return false;
    }
  }

  // Size filters will require stat, so we'll skip them for now
  // Can be added if needed in the future

  return true;
}

/**
 * Scans multiple directories and returns combined file list
 * @param dirPaths - Array of directory paths to scan
 * @param options - Scan options for filtering
 * @returns Array of absolute file paths from all directories
 */
export async function scanDirectories(
  dirPaths: string[],
  options: ScanOptions = {}
): Promise<string[]> {
  const allFiles: string[] = [];

  for (const dirPath of dirPaths) {
    logger.debug(`Scanning directory: ${dirPath}`);
    const files = await scanDirectory(dirPath, options);
    logger.debug(`Found ${files.length} files in ${dirPath}`);
    allFiles.push(...files);
  }

  return allFiles;
}
