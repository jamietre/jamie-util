import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { compareFiles } from './compare-files.js';

describe('compareFiles integration', () => {
  let tempDir: string;
  let sourceDir1: string;
  let sourceDir2: string;
  let targetDir: string;
  let configPath: string;

  beforeEach(async () => {
    // Create temporary directories
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compare-files-integration-test-'));
    sourceDir1 = path.join(tempDir, 'source1');
    sourceDir2 = path.join(tempDir, 'source2');
    targetDir = path.join(tempDir, 'target');

    await fs.mkdir(sourceDir1, { recursive: true });
    await fs.mkdir(sourceDir2, { recursive: true });
    await fs.mkdir(targetDir, { recursive: true });

    // Create test file structure
    // Source 1: Movies/Action/Die Hard (1988)/movie.mkv
    const source1MovieDir = path.join(sourceDir1, 'Movies', 'Action', 'Die Hard (1988)');
    await fs.mkdir(source1MovieDir, { recursive: true });
    await fs.writeFile(path.join(source1MovieDir, 'movie.mkv'), 'test');

    // Source 2: Movies/SciFi/Inception (2010)/movie.mkv
    const source2MovieDir = path.join(sourceDir2, 'Movies', 'SciFi', 'Inception (2010)');
    await fs.mkdir(source2MovieDir, { recursive: true });
    await fs.writeFile(path.join(source2MovieDir, 'movie.mkv'), 'test');

    // Target: Die Hard (1988)/movie.mkv (matching source1)
    const targetMovieDir = path.join(targetDir, 'Die Hard (1988)');
    await fs.mkdir(targetMovieDir, { recursive: true });
    await fs.writeFile(path.join(targetMovieDir, 'movie.mkv'), 'test');

    // Target: Old Movie (1950)/film.mkv (unique to target)
    const targetOldMovieDir = path.join(targetDir, 'Old Movie (1950)');
    await fs.mkdir(targetOldMovieDir, { recursive: true });
    await fs.writeFile(path.join(targetOldMovieDir, 'film.mkv'), 'test');

    // Create config file
    configPath = path.join(tempDir, 'compare-files.json');
    const config = {
      sources: [sourceDir1, sourceDir2],
      targets: [targetDir],
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

    await fs.writeFile(configPath, JSON.stringify(config, null, 2));
  });

  afterEach(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('should perform end-to-end comparison', async () => {
    // This test verifies the integration works without errors
    // The actual comparison logic is tested in unit tests
    await expect(compareFiles({ configPath })).resolves.not.toThrow();
  });

  it('should write JSON output to file', async () => {
    const outputPath = path.join(tempDir, 'output.json');

    await compareFiles({
      configPath,
      outputOverride: outputPath,
      formatOverride: 'json'
    });

    const outputContent = await fs.readFile(outputPath, 'utf-8');
    const output = JSON.parse(outputContent);

    expect(output).toHaveProperty('timestamp');
    expect(output).toHaveProperty('results');
    expect(output.results).toHaveProperty('inSourcesOnly');
    expect(output.results).toHaveProperty('inTargetOnly');
    expect(output.results).toHaveProperty('summary');
  });
});
