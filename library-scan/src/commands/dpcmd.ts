import { exec } from 'child_process';
import { promisify } from 'util';
import type { DuplicationStatus, CommandOptions } from './types.js';
import { logger } from '../utils/logger.js';

const execAsync = promisify(exec);

const DEFAULT_TIMEOUT = 30000; // 30 seconds
const DEFAULT_RETRIES = 3;
const RETRY_DELAY_MS = 1000; // Start with 1 second

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Execute a command with retry logic
 */
async function executeWithRetry<T>(
  fn: () => Promise<T>,
  options: CommandOptions,
  commandDescription: string
): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.debug(`${commandDescription} failed (attempt ${attempt}/${retries}): ${lastError.message}`);

      if (attempt < retries) {
        const delay = RETRY_DELAY_MS * Math.pow(2, attempt - 1); // Exponential backoff
        logger.debug(`Retrying in ${delay}ms...`);
        await sleep(delay);
      }
    }
  }

  throw new Error(`${commandDescription} failed after ${retries} attempts: ${lastError?.message}`);
}

/**
 * Execute dpcmd command
 */
async function executeDpcmd(
  args: string[],
  options: CommandOptions
): Promise<string> {
  const command = `dpcmd ${args.join(' ')}`;

  if (options.dryRun) {
    logger.info(`[DRY RUN] ${command}`);
    return '';
  }

  logger.debug(`Executing: ${command}`);

  const timeout = options.timeout ?? DEFAULT_TIMEOUT;
  const { stdout, stderr } = await execAsync(command, {
    timeout,
    encoding: 'utf-8',
  });

  if (stderr) {
    logger.debug(`dpcmd stderr: ${stderr}`);
  }

  return stdout.trim();
}

/**
 * Get duplication status for a path
 */
export async function getDuplicationStatus(
  path: string,
  options: CommandOptions = {}
): Promise<DuplicationStatus> {
  return executeWithRetry(
    async () => {
      const output = await executeDpcmd(['get-duplication', `"${path}"`], options);

      if (options.dryRun) {
        return { isDuplicated: false };
      }

      // Parse output to determine duplication status
      // Expected format examples:
      // "Not duplicated"
      // "Duplicated at level 2"
      // "Duplication level: 3"

      const lowerOutput = output.toLowerCase();

      if (lowerOutput.includes('not duplicated') || lowerOutput.includes('no duplication')) {
        return { isDuplicated: false };
      }

      // Try to extract duplication level
      const levelMatch = output.match(/level[:\s]+(\d+)/i);
      if (levelMatch) {
        return {
          isDuplicated: true,
          duplicationLevel: parseInt(levelMatch[1], 10),
        };
      }

      // If we see "duplicated" but no level, assume it's duplicated
      if (lowerOutput.includes('duplicat')) {
        return { isDuplicated: true };
      }

      // Default to not duplicated if we can't parse
      logger.warn(`Could not parse duplication status from output: ${output}`);
      return { isDuplicated: false };
    },
    options,
    `getDuplicationStatus("${path}")`
  );
}

/**
 * Set duplication level for a path
 */
export async function setDuplication(
  path: string,
  level: number,
  options: CommandOptions = {}
): Promise<void> {
  return executeWithRetry(
    async () => {
      await executeDpcmd(['set-duplication', `"${path}"`, String(level)], options);
    },
    options,
    `setDuplication("${path}", ${level})`
  );
}
