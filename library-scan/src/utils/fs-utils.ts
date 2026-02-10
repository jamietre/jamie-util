import { readdir, stat } from 'fs/promises';
import { join } from 'path';
import { logger } from './logger.js';

export interface FileStats {
  size: number;
  createdAt: Date;
  modifiedAt: Date;
  accessedAt: Date;
}

/**
 * Get file statistics
 */
export async function getFileStats(path: string): Promise<FileStats> {
  const stats = await stat(path);
  return {
    size: stats.size,
    createdAt: stats.birthtime,
    modifiedAt: stats.mtime,
    accessedAt: stats.atime,
  };
}

/**
 * Check if a path is accessible
 */
export async function isAccessible(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read directory contents safely
 */
export async function readDirSafe(path: string): Promise<string[] | null> {
  try {
    return await readdir(path);
  } catch (error) {
    logger.warn(`Cannot read directory: ${path}`);
    logger.debug(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Get full path by joining parent and child
 */
export function joinPath(parent: string, child: string): string {
  return join(parent, child);
}
