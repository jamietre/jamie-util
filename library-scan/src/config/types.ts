/**
 * Configuration types for library-scan
 */

export interface Config {
  targets: ScanTarget[];
  globalFilters?: ScanFilter;
  hooks: HookConfig[];
  debug?: boolean;
  dryRun?: boolean;
  concurrency?: number;
}

export interface ScanTarget {
  path: string;
  maxDepth?: number;
  followSymlinks?: boolean;
  filters?: ScanFilter;
}

export interface ScanFilter {
  include?: string[];
  exclude?: string[];
  minSize?: number;
  maxSize?: number;
}

export interface HookConfig {
  name: string;
  enabled: boolean;
  params?: Record<string, unknown>;
}
