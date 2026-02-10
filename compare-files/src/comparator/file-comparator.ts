import type { ComparisonResult, ComparisonStats } from './types.js';

/**
 * Compares two sets of files and returns the differences
 * @param sourceFiles - Array of file paths from source directories
 * @param targetFiles - Array of file paths from target directory
 * @returns Comparison result showing files unique to each set and common files
 */
export function compareFileSets(
  sourceFiles: string[],
  targetFiles: string[]
): ComparisonResult {
  // Convert to Sets for efficient lookups
  const sourceSet = new Set(sourceFiles);
  const targetSet = new Set(targetFiles);

  const inSourcesOnly: string[] = [];
  const inTargetOnly: string[] = [];
  const inBoth: string[] = [];

  // Find files in sources but not in target
  for (const file of sourceSet) {
    if (targetSet.has(file)) {
      inBoth.push(file);
    } else {
      inSourcesOnly.push(file);
    }
  }

  // Find files in target but not in sources
  for (const file of targetSet) {
    if (!sourceSet.has(file)) {
      inTargetOnly.push(file);
    }
  }

  // Sort results for consistent output
  inSourcesOnly.sort();
  inTargetOnly.sort();
  inBoth.sort();

  return {
    inSourcesOnly,
    inTargetOnly,
    inBoth
  };
}

/**
 * Generates statistics from a comparison result
 * @param result - Comparison result
 * @returns Statistics about the comparison
 */
export function getComparisonStats(result: ComparisonResult): ComparisonStats {
  return {
    totalSourceFiles: result.inSourcesOnly.length + result.inBoth.length,
    totalTargetFiles: result.inTargetOnly.length + result.inBoth.length,
    uniqueToSources: result.inSourcesOnly.length,
    uniqueToTarget: result.inTargetOnly.length,
    inBoth: result.inBoth.length
  };
}
