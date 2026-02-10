import path from 'path';

/**
 * Normalizes a file path to keep only the last N segments
 * @param absolutePath - Full absolute path to normalize
 * @param segmentsToKeep - Number of path segments to keep (default: 2)
 * @returns Normalized path with last N segments
 *
 * @example
 * normalizePath('/c/mount/network/media2/Movies/Action/Die Hard (1988)/movie.mkv', 2)
 * // Returns: 'Die Hard (1988)/movie.mkv'
 */
export function normalizePath(absolutePath: string, segmentsToKeep: number = 2): string {
  // Normalize to forward slashes for consistent handling
  const normalized = absolutePath.replace(/\\/g, '/');

  // Split into segments and filter out empty strings
  const segments = normalized.split('/').filter(s => s.length > 0);

  // Take the last N segments
  const lastSegments = segments.slice(-segmentsToKeep);

  // Join with forward slash
  return lastSegments.join('/');
}

/**
 * Normalizes multiple paths
 * @param paths - Array of absolute paths
 * @param segmentsToKeep - Number of path segments to keep
 * @returns Array of normalized paths
 */
export function normalizePaths(paths: string[], segmentsToKeep: number = 2): string[] {
  return paths.map(p => normalizePath(p, segmentsToKeep));
}
