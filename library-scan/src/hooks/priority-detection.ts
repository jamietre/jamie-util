import { basename } from "path";
import type { ScanHook } from "./types.js";
import type { ScanContext, HookResult } from "../scanner/types.js";
import { getDuplicationStatus, setDuplication } from "../commands/dpcmd.js";
import { logger } from "../utils/logger.js";

/**
 * Hook that detects .priority files and sets duplication on parent directory
 */
export class PriorityDetectionHook implements ScanHook {
  readonly name = "priority-detection";
  readonly description = "Detects .priority files and sets duplication level on parent directory";
  readonly processesFiles = true;
  readonly processesDirectories = false;

  /**
   * Execute only for files named ".priority"
   */
  shouldExecute(context: ScanContext): boolean {
    if (context.type !== "file") {
      return false;
    }

    const fileName = basename(context.path);
    return fileName === ".priority";
  }

  /**
   * Check parent directory duplication and set if needed
   */
  async execute(context: ScanContext): Promise<HookResult | null> {
    const parentPath = context.parentPath;
    logger.debug(`Processing .priority file: ${context.path}`);
    logger.debug(`Parent directory: ${parentPath}`);

    // Get current duplication status
    const status = await getDuplicationStatus(parentPath, {
      dryRun: context.config.dryRun,
      timeout: 30000,
      retries: 3,
    });

    // If already duplicated, no action needed
    if (status.isDuplicated) {
      logger.debug(`Directory already duplicated: ${parentPath} (level: ${status.duplicationLevel ?? "unknown"})`);
      return {
        hookName: this.name,
        path: context.path,
        actionTaken: false,
        message: `Parent directory already duplicated at level ${status.duplicationLevel ?? "unknown"}`,
        metadata: {
          parentPath,
          existingLevel: status.duplicationLevel,
        },
      };
    }

    // Set duplication level 2
    logger.info(`Setting duplication level 2 on: ${parentPath}`);
    await setDuplication(parentPath, 2, {
      dryRun: context.config.dryRun,
      timeout: 30000,
      retries: 3,
    });

    return {
      hookName: this.name,
      path: context.path,
      actionTaken: true,
      message: context.config.dryRun
        ? `Would set duplication level 2 on parent directory`
        : `Set duplication level 2 on parent directory`,
      metadata: {
        parentPath,
        newLevel: 2,
      },
    };
  }
}
