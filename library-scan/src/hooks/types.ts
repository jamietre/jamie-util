import type { ScanContext, HookResult } from '../scanner/types.js';

/**
 * Hook interface for extensible scanning behavior
 *
 * To create a new hook:
 * 1. Implement this interface
 * 2. Define shouldExecute() logic based on file/directory characteristics
 * 3. Implement execute() with your custom logic
 * 4. Register hook in the orchestrator
 */
export interface ScanHook {
  /** Unique name for this hook */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Whether this hook processes files */
  readonly processesFiles: boolean;

  /** Whether this hook processes directories */
  readonly processesDirectories: boolean;

  /**
   * Determine if this hook should execute for the given context
   * Return false to skip execution
   */
  shouldExecute(context: ScanContext): Promise<boolean> | boolean;

  /**
   * Execute the hook logic
   * Return null to indicate no action taken, or HookResult with details
   */
  execute(context: ScanContext): Promise<HookResult | null>;
}
