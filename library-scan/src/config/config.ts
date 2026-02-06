import { readFile } from 'fs/promises';
import { join } from 'path';
import { homedir } from 'os';
import type { Config } from './types.js';
import { DEFAULT_CONFIG } from './defaults.js';
import { logger } from '../utils/logger.js';
import { isAccessible } from '../utils/fs-utils.js';

/**
 * Load configuration from file
 */
async function loadConfigFile(path: string): Promise<Partial<Config> | null> {
  if (!(await isAccessible(path))) {
    return null;
  }

  try {
    const content = await readFile(path, 'utf-8');
    const config = JSON.parse(content) as Partial<Config>;
    logger.debug(`Loaded config from: ${path}`);
    return config;
  } catch (error) {
    logger.warn(`Failed to parse config file: ${path}`);
    logger.debug(`Error: ${error instanceof Error ? error.message : String(error)}`);
    return null;
  }
}

/**
 * Merge configurations with precedence
 */
function mergeConfigs(...configs: Array<Partial<Config> | null>): Config {
  const merged: Config = { ...DEFAULT_CONFIG };

  for (const config of configs) {
    if (!config) continue;

    if (config.targets) merged.targets = config.targets;
    if (config.globalFilters) {
      merged.globalFilters = {
        ...merged.globalFilters,
        ...config.globalFilters,
      };
    }
    if (config.hooks) merged.hooks = config.hooks;
    if (config.debug !== undefined) merged.debug = config.debug;
    if (config.dryRun !== undefined) merged.dryRun = config.dryRun;
    if (config.concurrency !== undefined) merged.concurrency = config.concurrency;
  }

  return merged;
}

/**
 * Load configuration with hierarchy:
 * 1. Explicit config file path (highest priority)
 * 2. ~/.config/library-scan/config.json
 * 3. ./library-scan.json
 * 4. Default config (lowest priority)
 */
export async function loadConfig(configPath?: string): Promise<Config> {
  const configs: Array<Partial<Config> | null> = [];

  // Try local config
  configs.push(await loadConfigFile('./library-scan.json'));

  // Try user config
  const userConfigPath = join(homedir(), '.config', 'library-scan', 'config.json');
  configs.push(await loadConfigFile(userConfigPath));

  // Try explicit config path (highest priority)
  if (configPath) {
    const explicitConfig = await loadConfigFile(configPath);
    if (!explicitConfig) {
      throw new Error(`Config file not found or invalid: ${configPath}`);
    }
    configs.push(explicitConfig);
  }

  const config = mergeConfigs(...configs);

  // Validate required fields
  if (config.targets.length === 0) {
    throw new Error('No scan targets specified in configuration');
  }

  return config;
}
