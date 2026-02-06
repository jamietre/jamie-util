#!/usr/bin/env node

import { buildApplication, buildCommand, run } from '@stricli/core';
import type { CommandContext } from '@stricli/core';
import { compareFiles } from './compare-files.js';

interface CompareFlags {
  config?: string;
  output?: string;
  format?: 'text' | 'json';
  debug: boolean;
}

// Define the compare command
const compareCommand = buildCommand({
  docs: {
    brief: 'Compare file lists between directories with bidirectional diff'
  },
  parameters: {
    flags: {
      config: {
        kind: 'parsed',
        brief: 'Path to configuration file',
        parse: String,
        optional: true
      },
      output: {
        kind: 'parsed',
        brief: 'Override output file path',
        parse: String,
        optional: true
      },
      format: {
        kind: 'enum',
        brief: 'Override output format',
        values: ['text', 'json'] as const,
        optional: true
      },
      debug: {
        kind: 'boolean',
        brief: 'Enable debug logging',
        default: false
      }
    },
    aliases: {
      c: 'config',
      o: 'output',
      f: 'format',
      d: 'debug'
    }
  },
  async func(this: CommandContext, flags: CompareFlags): Promise<void> {
    try {
      await compareFiles({
        configPath: flags.config,
        outputOverride: flags.output,
        formatOverride: flags.format,
        debug: flags.debug
      });
    } catch (error) {
      console.error('Error:', error instanceof Error ? error.message : String(error));
      process.exitCode = 1;
    }
  }
});

// Build the application
const app = buildApplication(compareCommand, {
  name: 'compare-files',
  versionInfo: {
    currentVersion: '1.0.0'
  }
});

// Run the application
run(app, process.argv.slice(2), { process });
