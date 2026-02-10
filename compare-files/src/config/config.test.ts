import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { loadConfig, resolveConfigPath } from './config.js';
import type { CompareConfig } from './types.js';

describe('loadConfig', () => {
  let tempDir: string;

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compare-files-config-test-'));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should load valid configuration', async () => {
    const configPath = path.join(tempDir, 'config.json');
    const testConfig = {
      sources: ['/path/to/source1', '/path/to/source2'],
      targets: ['/path/to/target'],
      output: {
        format: 'text' as const,
        showSourcesOnly: true,
        showTargetOnly: true,
        outputFile: null
      },
      pathNormalization: {
        segmentsToKeep: 2
      },
      filters: {
        extensions: ['.mkv', '.mp4'],
        minSizeBytes: 0,
        maxSizeBytes: null,
        excludeDirs: []
      }
    };

    await fs.writeFile(configPath, JSON.stringify(testConfig, null, 2));

    const config = await loadConfig(configPath);

    expect(config.sources).toEqual(['/path/to/source1', '/path/to/source2']);
    expect(config.targets).toEqual(['/path/to/target']);
    expect(config.output.format).toBe('text');
    expect(config.filters.extensions).toEqual(['.mkv', '.mp4']);
  });

  it('should merge with defaults for partial config', async () => {
    const configPath = path.join(tempDir, 'config.json');
    const partialConfig = {
      sources: ['/source'],
      targets: ['/target']
    };

    await fs.writeFile(configPath, JSON.stringify(partialConfig, null, 2));

    const config = await loadConfig(configPath);

    expect(config.sources).toEqual(['/source']);
    expect(config.targets).toEqual(['/target']);
    expect(config.output.format).toBe('text'); // from defaults
    expect(config.pathNormalization.segmentsToKeep).toBe(2); // from defaults
  });

  it('should throw error for missing file', async () => {
    const configPath = path.join(tempDir, 'nonexistent.json');

    await expect(loadConfig(configPath)).rejects.toThrow('Configuration file not found');
  });

  it('should throw error for invalid JSON', async () => {
    const configPath = path.join(tempDir, 'invalid.json');
    await fs.writeFile(configPath, 'invalid json{{{');

    await expect(loadConfig(configPath)).rejects.toThrow();
  });

  it('should validate sources are provided', async () => {
    const configPath = path.join(tempDir, 'config.json');
    const invalidConfig = {
      sources: [],
      target: '/target'
    };

    await fs.writeFile(configPath, JSON.stringify(invalidConfig, null, 2));

    await expect(loadConfig(configPath)).rejects.toThrow('sources must contain at least one directory');
  });

  it('should validate targets are provided', async () => {
    const configPath = path.join(tempDir, 'config.json');
    const invalidConfig = {
      sources: ['/source'],
      targets: []
    };

    await fs.writeFile(configPath, JSON.stringify(invalidConfig, null, 2));

    await expect(loadConfig(configPath)).rejects.toThrow('at least one target directory is required');
  });

  it('should validate segmentsToKeep is at least 1', async () => {
    const configPath = path.join(tempDir, 'config.json');
    const invalidConfig = {
      sources: ['/source'],
      targets: ['/target'],
      pathNormalization: {
        segmentsToKeep: 0
      }
    };

    await fs.writeFile(configPath, JSON.stringify(invalidConfig, null, 2));

    await expect(loadConfig(configPath)).rejects.toThrow('segmentsToKeep must be at least 1');
  });

  it('should validate output format', async () => {
    const configPath = path.join(tempDir, 'config.json');
    const invalidConfig = {
      sources: ['/source'],
      targets: ['/target'],
      output: {
        format: 'invalid' as any
      }
    };

    await fs.writeFile(configPath, JSON.stringify(invalidConfig, null, 2));

    await expect(loadConfig(configPath)).rejects.toThrow('output format must be "text" or "json"');
  });
});

describe('resolveConfigPath', () => {
  it('should use provided path', () => {
    const providedPath = '/custom/path/to/config.json';
    const resolved = resolveConfigPath(providedPath);

    expect(resolved).toBe(path.resolve(providedPath));
  });

  it('should default to compare-files.json in current directory', () => {
    const resolved = resolveConfigPath();

    expect(resolved).toBe(path.resolve('compare-files.json'));
  });
});
