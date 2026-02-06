import type { Config } from './types.js';

/**
 * Default configuration
 */
export const DEFAULT_CONFIG: Config = {
  targets: [],
  globalFilters: {
    exclude: [
      '**/node_modules/**',
      '**/.git/**',
      '**/dist/**',
      '**/build/**',
    ],
  },
  hooks: [],
  debug: false,
  dryRun: false,
  concurrency: 10,
};
