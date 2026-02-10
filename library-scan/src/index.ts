#!/usr/bin/env node

import { buildApplication, buildCommand, run } from '@stricli/core';
import type { CommandContext } from '@stricli/core';
import { loadConfig } from './config/config.js';
import { ScanOrchestrator } from './scanner/orchestrator.js';
import { PriorityDetectionHook } from './hooks/priority-detection.js';
import type { ScanHook } from './hooks/types.js';
import type { Config } from './config/types.js';
import { logger } from './utils/logger.js';

interface ScanFlags {
  config?: string;
  debug: boolean;
  'dry-run': boolean;
}

/**
 * Create hook instances based on configuration
 */
function createHooks(config: Config): ScanHook[] {
  const hooks: ScanHook[] = [];

  for (const hookConfig of config.hooks) {
    if (!hookConfig.enabled) {
      continue;
    }

    switch (hookConfig.name) {
      case 'priority-detection':
        hooks.push(new PriorityDetectionHook());
        break;
      default:
        logger.warn(`Unknown hook: ${hookConfig.name}`);
    }
  }

  return hooks;
}

/**
 * Format duration in human-readable format
 */
function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Main scan command
 */
const scanCommand = buildCommand({
  docs: {
    brief: 'Scan directories with configurable hooks',
  },
  parameters: {
    positional: {
      kind: 'tuple',
      parameters: [],
    },
    flags: {
      config: {
        kind: 'parsed',
        brief: 'Path to configuration file',
        parse: String,
        optional: true,
      },
      debug: {
        kind: 'boolean',
        brief: 'Enable debug logging',
        default: false,
      },
      'dry-run': {
        kind: 'boolean',
        brief: 'Preview actions without executing',
        default: false,
      },
    },
  },
  async func(this: CommandContext, flags: ScanFlags): Promise<void> {
    // Set debug mode
    if (flags.debug) {
      logger.setDebug(true);
    }

    logger.info('library-scan v0.1.0');
    logger.info('');

    // Load configuration
    logger.info('Loading configuration...');
    let config;
    try {
      config = await loadConfig(flags.config);
    } catch (error) {
      logger.error(`Failed to load configuration: ${error instanceof Error ? error.message : String(error)}`);
      process.exitCode = 1;
      return;
    }

    // Override config with CLI flags (only if explicitly set, not just defaults)
    // Since stricli always provides defaults, we need to be smarter about overrides
    // The config file values should take precedence unless CLI flag is explicitly passed
    // For now, we'll use CLI flags to override config values when they're true
    if (flags.debug) {
      config.debug = true;
    }
    if (flags['dry-run']) {
      config.dryRun = true;
    }

    if (config.dryRun) {
      logger.info('[DRY RUN MODE] - No changes will be made');
    }

    logger.debug(`Config: ${JSON.stringify(config, null, 2)}`);

    // Create orchestrator
    const orchestrator = new ScanOrchestrator();

    // Register hooks
    const hooks = createHooks(config);
    logger.info(`Registering ${hooks.length} hooks`);
    orchestrator.registerHooks(hooks);

    // Execute scan
    logger.info('');
    const results = await orchestrator.scan(config, (context) => {
      if (logger.isDebugEnabled()) {
        logger.debug(`Scanning: ${context.relativePath}`);
      }
    });

    // Display summary
    logger.info('');
    logger.info('='.repeat(60));
    logger.info('SCAN SUMMARY');
    logger.info('='.repeat(60));
    logger.info(`Files scanned:        ${results.filesScanned}`);
    logger.info(`Directories scanned:  ${results.directoriesScanned}`);
    logger.info(`Actions taken:        ${results.hookResults.filter(r => r.actionTaken).length}`);
    logger.info(`Errors:               ${results.errors.length}`);
    logger.info(`Duration:             ${formatDuration(results.duration)}`);
    logger.info('');

    // Show hook results
    if (results.hookResults.length > 0) {
      logger.info('HOOK RESULTS:');
      for (const result of results.hookResults) {
        if (result.actionTaken) {
          logger.info(`  ✓ ${result.path}`);
          logger.info(`    ${result.message}`);
        }
      }
      logger.info('');
    }

    // Show errors
    if (results.errors.length > 0) {
      logger.error('ERRORS:');
      for (const error of results.errors) {
        logger.error(`  ✗ ${error.path}`);
        logger.error(`    [${error.hookName}] ${error.error.message}`);
      }
      logger.info('');
    }

    // Exit with error code if errors occurred
    if (results.errors.length > 0) {
      process.exitCode = 1;
      return;
    }

    logger.info('Scan complete!');
  },
});

const app = buildApplication(scanCommand, {
  name: 'library-scan',
  versionInfo: {
    currentVersion: '0.1.0',
  },
});

run(app, process.argv.slice(2), { process });
