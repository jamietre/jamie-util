import { stat, readdir } from 'fs/promises';
import { join, relative, dirname, basename } from 'path';
import type { ScanTarget, ScanFilter, Config } from '../config/types.js';
import type { ScanContext } from './types.js';
import { logger } from '../utils/logger.js';
import { getFileStats, readDirSafe } from '../utils/fs-utils.js';

/**
 * Check if a path matches glob patterns
 */
function matchesPatterns(path: string, patterns?: string[]): boolean {
  if (!patterns || patterns.length === 0) return false;

  for (const pattern of patterns) {
    // Simple glob matching - convert to regex
    const regexPattern = pattern
      .replace(/\./g, '\\.')
      .replace(/\*\*/g, '.*')
      .replace(/\*/g, '[^/]*')
      .replace(/\?/g, '.');

    const regex = new RegExp(`^${regexPattern}$`);
    if (regex.test(path)) {
      return true;
    }
  }

  return false;
}

/**
 * Check if a path should be filtered based on filter rules
 */
function shouldFilter(
  relativePath: string,
  stats: { size: number },
  targetFilter?: ScanFilter,
  globalFilter?: ScanFilter
): boolean {
  const filter = { ...globalFilter, ...targetFilter };

  // Check exclude patterns
  if (filter.exclude && matchesPatterns(relativePath, filter.exclude)) {
    logger.debug(`Filtered out (exclude): ${relativePath}`);
    return true;
  }

  // Check include patterns (if specified, path must match)
  if (filter.include && filter.include.length > 0) {
    if (!matchesPatterns(relativePath, filter.include)) {
      logger.debug(`Filtered out (not in include): ${relativePath}`);
      return true;
    }
  }

  // Check size limits
  if (filter.minSize !== undefined && stats.size < filter.minSize) {
    logger.debug(`Filtered out (too small): ${relativePath}`);
    return true;
  }

  if (filter.maxSize !== undefined && stats.size > filter.maxSize) {
    logger.debug(`Filtered out (too large): ${relativePath}`);
    return true;
  }

  return false;
}

/**
 * Walk directory tree and yield scan contexts
 */
export async function* walkDirectory(
  target: ScanTarget,
  config: Config,
  rootPath: string = target.path,
  currentDepth: number = 0
): AsyncGenerator<ScanContext> {
  // Check depth limit
  if (target.maxDepth !== undefined && currentDepth > target.maxDepth) {
    return;
  }

  // Get stats
  let stats;
  try {
    stats = await stat(rootPath);
  } catch (error) {
    logger.warn(`Cannot access path: ${rootPath}`);
    logger.debug(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return;
  }

  // Handle symlinks
  if (stats.isSymbolicLink() && !target.followSymlinks) {
    logger.debug(`Skipping symlink: ${rootPath}`);
    return;
  }

  const relativePath = relative(target.path, rootPath);
  const fileStats = await getFileStats(rootPath);

  // Check filters
  if (shouldFilter(relativePath, fileStats, target.filters, config.globalFilters)) {
    return;
  }

  const parentPath = dirname(rootPath);
  const context: ScanContext = {
    path: rootPath,
    type: stats.isDirectory() ? 'directory' : 'file',
    stats: fileStats,
    relativePath,
    parentPath,
    config,
  };

  // Yield current item
  yield context;

  // Recurse into directories
  if (stats.isDirectory()) {
    const entries = await readDirSafe(rootPath);
    if (entries === null) {
      return;
    }

    for (const entry of entries) {
      const fullPath = join(rootPath, entry);
      yield* walkDirectory(target, config, fullPath, currentDepth + 1);
    }
  }
}
