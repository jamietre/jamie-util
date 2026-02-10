import type { Config } from '../config/types.js';

/**
 * Context provided to hooks for each file/directory
 */
export interface ScanContext {
  path: string;
  type: 'file' | 'directory';
  stats: {
    size: number;
    createdAt: Date;
    modifiedAt: Date;
    accessedAt: Date;
  };
  relativePath: string;
  parentPath: string;
  config: Config;
}

/**
 * Result from hook execution
 */
export interface HookResult {
  hookName: string;
  path: string;
  actionTaken: boolean;
  message: string;
  metadata?: Record<string, unknown>;
}

/**
 * Error during hook execution
 */
export interface HookError {
  hookName: string;
  path: string;
  error: Error;
}

/**
 * Aggregated scan results
 */
export interface ScanResults {
  filesScanned: number;
  directoriesScanned: number;
  hookResults: HookResult[];
  errors: HookError[];
  duration: number;
  startTime: Date;
  endTime: Date;
}

/**
 * Progress callback for scan operations
 */
export type ScanProgressCallback = (context: ScanContext) => void;
