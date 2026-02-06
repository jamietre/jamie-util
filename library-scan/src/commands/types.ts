/**
 * Types for dpcmd integration
 */

export interface DuplicationStatus {
  isDuplicated: boolean;
  duplicationLevel?: number;
}

export interface CommandOptions {
  dryRun?: boolean;
  timeout?: number;
  retries?: number;
}
