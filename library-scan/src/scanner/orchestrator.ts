import type { Config } from '../config/types.js';
import type { ScanHook } from '../hooks/types.js';
import type {
  ScanContext,
  ScanResults,
  HookResult,
  HookError,
  ScanProgressCallback,
} from './types.js';
import { walkDirectory } from './traverser.js';
import { logger } from '../utils/logger.js';

/**
 * Result from Promise.allSettled
 */
interface SettledResult {
  status: 'fulfilled' | 'rejected';
  value?: HookResult | null;
  reason?: Error;
}

/**
 * Orchestrates scanning with registered hooks
 */
export class ScanOrchestrator {
  private hooks: ScanHook[] = [];

  /**
   * Register a single hook
   */
  registerHook(hook: ScanHook): void {
    logger.debug(`Registering hook: ${hook.name}`);
    this.hooks.push(hook);
  }

  /**
   * Register multiple hooks
   */
  registerHooks(hooks: ScanHook[]): void {
    for (const hook of hooks) {
      this.registerHook(hook);
    }
  }

  /**
   * Get applicable hooks for a scan context
   */
  private getApplicableHooks(context: ScanContext): ScanHook[] {
    return this.hooks.filter(hook => {
      if (context.type === 'file' && !hook.processesFiles) {
        return false;
      }
      if (context.type === 'directory' && !hook.processesDirectories) {
        return false;
      }
      return true;
    });
  }

  /**
   * Process a single item (file or directory)
   */
  private async processItem(context: ScanContext): Promise<{
    results: HookResult[];
    errors: HookError[];
  }> {
    const results: HookResult[] = [];
    const errors: HookError[] = [];

    // Get applicable hooks
    const applicableHooks = this.getApplicableHooks(context);

    if (applicableHooks.length === 0) {
      return { results, errors };
    }

    // Filter hooks that should execute
    const hooksToExecute: ScanHook[] = [];
    for (const hook of applicableHooks) {
      try {
        const shouldExecute = await hook.shouldExecute(context);
        if (shouldExecute) {
          hooksToExecute.push(hook);
        }
      } catch (error) {
        logger.warn(`Hook ${hook.name} failed in shouldExecute: ${error instanceof Error ? error.message : String(error)}`);
        errors.push({
          hookName: hook.name,
          path: context.path,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    if (hooksToExecute.length === 0) {
      return { results, errors };
    }

    // Execute hooks in parallel
    logger.debug(`Executing ${hooksToExecute.length} hooks for: ${context.path}`);
    const promises = hooksToExecute.map(hook => hook.execute(context));
    const settled = await Promise.allSettled(promises) as SettledResult[];

    // Process results
    for (let i = 0; i < settled.length; i++) {
      const result = settled[i];
      const hook = hooksToExecute[i];

      if (result.status === 'fulfilled') {
        if (result.value) {
          results.push(result.value);
        }
      } else {
        logger.warn(`Hook ${hook.name} failed: ${result.reason?.message}`);
        errors.push({
          hookName: hook.name,
          path: context.path,
          error: result.reason ?? new Error('Unknown error'),
        });
      }
    }

    return { results, errors };
  }

  /**
   * Scan directories with registered hooks
   */
  async scan(
    config: Config,
    progressCallback?: ScanProgressCallback
  ): Promise<ScanResults> {
    const startTime = new Date();
    let filesScanned = 0;
    let directoriesScanned = 0;
    const hookResults: HookResult[] = [];
    const errors: HookError[] = [];

    logger.info(`Starting scan with ${this.hooks.length} registered hooks`);
    logger.debug(`Scanning ${config.targets.length} targets`);

    for (const target of config.targets) {
      logger.info(`Scanning target: ${target.path}`);

      try {
        for await (const context of walkDirectory(target, config)) {
          // Update counts
          if (context.type === 'file') {
            filesScanned++;
          } else {
            directoriesScanned++;
          }

          // Progress callback
          if (progressCallback) {
            progressCallback(context);
          }

          // Process item
          const { results, errors: itemErrors } = await this.processItem(context);
          hookResults.push(...results);
          errors.push(...itemErrors);
        }
      } catch (error) {
        logger.error(`Failed to scan target ${target.path}: ${error instanceof Error ? error.message : String(error)}`);
        errors.push({
          hookName: 'scanner',
          path: target.path,
          error: error instanceof Error ? error : new Error(String(error)),
        });
      }
    }

    const endTime = new Date();
    const duration = endTime.getTime() - startTime.getTime();

    logger.info(`Scan complete in ${duration}ms`);

    return {
      filesScanned,
      directoriesScanned,
      hookResults,
      errors,
      duration,
      startTime,
      endTime,
    };
  }
}
