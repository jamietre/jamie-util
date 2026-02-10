import fs from 'fs/promises';
import path from 'path';
import type { CompareConfig } from './types.js';
import { defaultConfig } from './defaults.js';

/**
 * Loads configuration from a JSON file
 * @param configPath - Path to the configuration file
 * @returns Loaded configuration merged with defaults
 */
export async function loadConfig(configPath: string): Promise<CompareConfig> {
  try {
    const configContent = await fs.readFile(configPath, 'utf-8');
    const userConfig = JSON.parse(configContent) as Partial<CompareConfig>;

    // Deep merge with defaults
    const config: CompareConfig = {
      ...defaultConfig,
      ...userConfig,
      output: {
        ...defaultConfig.output,
        ...userConfig.output
      },
      pathNormalization: {
        ...defaultConfig.pathNormalization,
        ...userConfig.pathNormalization
      },
      filters: {
        ...defaultConfig.filters,
        ...userConfig.filters
      }
    };

    // Validate configuration
    validateConfig(config);

    return config;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Configuration file not found: ${configPath}`);
    }
    throw error;
  }
}

/**
 * Validates the configuration
 * @param config - Configuration to validate
 * @throws Error if configuration is invalid
 */
function validateConfig(config: CompareConfig): void {
  if (!config.sources || config.sources.length === 0) {
    throw new Error('Configuration error: sources must contain at least one directory');
  }

  if (!config.targets || config.targets.length === 0) {
    throw new Error('Configuration error: at least one target directory is required');
  }

  if (config.pathNormalization.segmentsToKeep < 1) {
    throw new Error('Configuration error: segmentsToKeep must be at least 1');
  }

  if (config.output.format !== 'text' && config.output.format !== 'json') {
    throw new Error('Configuration error: output format must be "text" or "json"');
  }
}

/**
 * Finds the configuration file path
 * @param providedPath - Optional path provided by user
 * @returns Path to configuration file
 */
export function resolveConfigPath(providedPath?: string): string {
  if (providedPath) {
    return path.resolve(providedPath);
  }

  // Default to compare-files.json in current directory
  return path.resolve('compare-files.json');
}
