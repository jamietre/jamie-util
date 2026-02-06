import type { CompareConfig } from './types.js';

/**
 * Default configuration values
 */
export const defaultConfig: CompareConfig = {
  sources: [],
  targets: [],
  output: {
    format: 'text',
    showSourcesOnly: true,
    showTargetOnly: true,
    outputFile: null
  },
  pathNormalization: {
    segmentsToKeep: 2
  },
  filters: {
    extensions: [],
    minSizeBytes: 0,
    maxSizeBytes: null,
    excludeDirs: []
  }
};
