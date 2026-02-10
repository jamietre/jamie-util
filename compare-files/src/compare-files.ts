import { loadConfig, resolveConfigPath } from './config/config.js';
import type { CompareConfig } from './config/types.js';
import { scanDirectory, scanDirectories } from './utils/file-scanner.js';
import { normalizePaths } from './utils/path-normalizer.js';
import { compareFileSets, getComparisonStats } from './comparator/file-comparator.js';
import type { ComparisonResult } from './comparator/types.js';
import { logger } from './utils/logger.js';
import fs from 'fs/promises';
import chalk from 'chalk';

export interface CompareFilesOptions {
  configPath?: string;
  outputOverride?: string;
  formatOverride?: 'text' | 'json';
  debug?: boolean;
}

/**
 * Main entry point for file comparison
 */
export async function compareFiles(options: CompareFilesOptions = {}): Promise<void> {
  try {
    // Enable debug logging if requested
    if (options.debug) {
      logger.enableDebug();
    }

    // Load configuration
    const configPath = resolveConfigPath(options.configPath);
    logger.info(`Loading configuration from: ${configPath}`);
    const config = await loadConfig(configPath);

    // Apply overrides
    if (options.outputOverride) {
      config.output.outputFile = options.outputOverride;
    }
    if (options.formatOverride) {
      config.output.format = options.formatOverride;
    }

    // Perform comparison
    const result = await performComparison(config);

    // Format and output results
    await outputResults(result, config);

    logger.success('Comparison complete!');
  } catch (error) {
    logger.error('Comparison failed:', error);
    throw error;
  }
}

/**
 * Performs the actual file comparison
 */
async function performComparison(config: CompareConfig): Promise<ComparisonResult> {
  logger.info(`Scanning ${config.sources.length} source director${config.sources.length === 1 ? 'y' : 'ies'}...`);

  // Scan source directories
  const sourceFilePaths = await scanDirectories(config.sources, {
    extensions: config.filters.extensions,
    minSizeBytes: config.filters.minSizeBytes,
    maxSizeBytes: config.filters.maxSizeBytes,
    excludeDirs: config.filters.excludeDirs
  });

  logger.info(`Found ${sourceFilePaths.length} files in source directories`);

  // Scan target directories
  logger.info(`Scanning ${config.targets.length} target director${config.targets.length === 1 ? 'y' : 'ies'}...`);
  const targetFilePaths = await scanDirectories(config.targets, {
    extensions: config.filters.extensions,
    minSizeBytes: config.filters.minSizeBytes,
    maxSizeBytes: config.filters.maxSizeBytes,
    excludeDirs: config.filters.excludeDirs
  });

  logger.info(`Found ${targetFilePaths.length} files in target directories`);

  // Normalize paths
  logger.info('Normalizing paths...');
  const normalizedSources = normalizePaths(
    sourceFilePaths,
    config.pathNormalization.segmentsToKeep
  );
  const normalizedTarget = normalizePaths(
    targetFilePaths,
    config.pathNormalization.segmentsToKeep
  );

  logger.debug(`Sample normalized source paths: ${normalizedSources.slice(0, 3).join(', ')}`);
  logger.debug(`Sample normalized target paths: ${normalizedTarget.slice(0, 3).join(', ')}`);

  // Compare file sets
  logger.info('Comparing file sets...');
  const result = compareFileSets(normalizedSources, normalizedTarget);

  return result;
}

/**
 * Outputs the comparison results
 */
async function outputResults(result: ComparisonResult, config: CompareConfig): Promise<void> {
  const stats = getComparisonStats(result);
  let output: string;

  if (config.output.format === 'json') {
    output = formatJsonOutput(result, stats, config);
  } else {
    output = formatTextOutput(result, stats, config);
  }

  // Write to file or stdout
  if (config.output.outputFile) {
    logger.info(`Writing results to: ${config.output.outputFile}`);
    await fs.writeFile(config.output.outputFile, output, 'utf-8');
  } else {
    console.log('\n' + output);
  }
}

/**
 * Formats output as human-readable text
 */
function formatTextOutput(
  result: ComparisonResult,
  stats: ReturnType<typeof getComparisonStats>,
  config: CompareConfig
): string {
  const lines: string[] = [];

  lines.push(chalk.bold.cyan('='.repeat(80)));
  lines.push(chalk.bold.cyan('FILE COMPARISON RESULTS'));
  lines.push(chalk.bold.cyan('='.repeat(80)));
  lines.push('');

  // Show files in sources but not in target(s)
  if (config.output.showSourcesOnly) {
    lines.push(chalk.bold.yellow(`Files in SOURCES but NOT in target(s) (${result.inSourcesOnly.length} files):`));
    lines.push(chalk.yellow('-'.repeat(80)));

    if (result.inSourcesOnly.length === 0) {
      lines.push(chalk.gray('  (none)'));
    } else {
      for (const file of result.inSourcesOnly) {
        lines.push(`  ${file}`);
      }
    }
    lines.push('');
  }

  // Show files in target(s) but not in sources
  if (config.output.showTargetOnly) {
    lines.push(chalk.bold.magenta(`Files in TARGET(S) but NOT in sources (${result.inTargetOnly.length} files):`));
    lines.push(chalk.magenta('-'.repeat(80)));

    if (result.inTargetOnly.length === 0) {
      lines.push(chalk.gray('  (none)'));
    } else {
      for (const file of result.inTargetOnly) {
        lines.push(`  ${file}`);
      }
    }
    lines.push('');
  }

  // Summary
  lines.push(chalk.bold.cyan('SUMMARY'));
  lines.push(chalk.cyan('-'.repeat(80)));
  lines.push(`  Source directories: ${config.sources.length}`);
  lines.push(`  Target directories: ${config.targets.length}`);
  lines.push(`  Total source files: ${stats.totalSourceFiles}`);
  lines.push(`  Total target files: ${stats.totalTargetFiles}`);
  lines.push(`  Unique to sources:  ${chalk.yellow(stats.uniqueToSources.toString())}`);
  lines.push(`  Unique to target:   ${chalk.magenta(stats.uniqueToTarget.toString())}`);
  lines.push(`  In both:            ${chalk.green(stats.inBoth.toString())}`);
  lines.push(chalk.bold.cyan('='.repeat(80)));

  return lines.join('\n');
}

/**
 * Formats output as JSON
 */
function formatJsonOutput(
  result: ComparisonResult,
  stats: ReturnType<typeof getComparisonStats>,
  config: CompareConfig
): string {
  const output = {
    timestamp: new Date().toISOString(),
    config: {
      sources: config.sources,
      targets: config.targets,
      pathNormalization: config.pathNormalization,
      filters: config.filters
    },
    results: {
      inSourcesOnly: result.inSourcesOnly,
      inTargetOnly: result.inTargetOnly,
      summary: stats
    }
  };

  return JSON.stringify(output, null, 2);
}
