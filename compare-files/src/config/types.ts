/**
 * Configuration for file comparison
 */
export interface CompareConfig {
  /** Source directories to scan (combined into one set) */
  sources: string[];

  /** Target directories to compare against (combined into one set) */
  targets: string[];

  /** Output configuration */
  output: {
    /** Output format: 'text' or 'json' */
    format: 'text' | 'json';

    /** Whether to show files unique to sources */
    showSourcesOnly: boolean;

    /** Whether to show files unique to target */
    showTargetOnly: boolean;

    /** Optional file path to write output to (null = stdout) */
    outputFile: string | null;
  };

  /** Path normalization settings */
  pathNormalization: {
    /** Number of path segments to keep (e.g., 2 = 'Folder/file.ext') */
    segmentsToKeep: number;
  };

  /** File filtering options */
  filters: {
    /** File extensions to include (empty = all files) */
    extensions: string[];

    /** Minimum file size in bytes */
    minSizeBytes: number;

    /** Maximum file size in bytes (null = no limit) */
    maxSizeBytes: number | null;

    /** Directory names to exclude (e.g., ["todo", "temp", ".git"]) */
    excludeDirs: string[];
  };
}
