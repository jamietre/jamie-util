/**
 * Result of comparing two file sets
 */
export interface ComparisonResult {
  /** Files that exist in sources but not in target */
  inSourcesOnly: string[];

  /** Files that exist in target but not in sources */
  inTargetOnly: string[];

  /** Files that exist in both sources and target */
  inBoth: string[];
}

/**
 * Statistics about the comparison
 */
export interface ComparisonStats {
  totalSourceFiles: number;
  totalTargetFiles: number;
  uniqueToSources: number;
  uniqueToTarget: number;
  inBoth: number;
}
