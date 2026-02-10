import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs/promises';
import path from 'path';
import { scanDirectory, scanDirectories } from './file-scanner.js';
import os from 'os';

describe('file-scanner', () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for tests
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'compare-files-test-'));
  });

  afterEach(async () => {
    // Clean up temporary directory
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('scanDirectory', () => {
    it('should find all files in a flat directory', async () => {
      // Create test files
      await fs.writeFile(path.join(tempDir, 'file1.txt'), 'test');
      await fs.writeFile(path.join(tempDir, 'file2.txt'), 'test');
      await fs.writeFile(path.join(tempDir, 'file3.mkv'), 'test');

      const files = await scanDirectory(tempDir);

      expect(files).toHaveLength(3);
      expect(files.some(f => f.endsWith('file1.txt'))).toBe(true);
      expect(files.some(f => f.endsWith('file2.txt'))).toBe(true);
      expect(files.some(f => f.endsWith('file3.mkv'))).toBe(true);
    });

    it('should recursively find files in subdirectories', async () => {
      // Create nested structure
      const subDir1 = path.join(tempDir, 'Movies');
      const subDir2 = path.join(subDir1, 'Action');

      await fs.mkdir(subDir1);
      await fs.mkdir(subDir2);

      await fs.writeFile(path.join(tempDir, 'root.txt'), 'test');
      await fs.writeFile(path.join(subDir1, 'movie1.mkv'), 'test');
      await fs.writeFile(path.join(subDir2, 'movie2.mkv'), 'test');

      const files = await scanDirectory(tempDir);

      expect(files).toHaveLength(3);
      expect(files.some(f => f.endsWith('root.txt'))).toBe(true);
      expect(files.some(f => f.includes('Movies') && f.endsWith('movie1.mkv'))).toBe(true);
      expect(files.some(f => f.includes('Action') && f.endsWith('movie2.mkv'))).toBe(true);
    });

    it('should filter by extensions', async () => {
      await fs.writeFile(path.join(tempDir, 'video.mkv'), 'test');
      await fs.writeFile(path.join(tempDir, 'video.mp4'), 'test');
      await fs.writeFile(path.join(tempDir, 'subtitle.srt'), 'test');
      await fs.writeFile(path.join(tempDir, 'info.txt'), 'test');

      const files = await scanDirectory(tempDir, {
        extensions: ['.mkv', '.mp4']
      });

      expect(files).toHaveLength(2);
      expect(files.some(f => f.endsWith('.mkv'))).toBe(true);
      expect(files.some(f => f.endsWith('.mp4'))).toBe(true);
      expect(files.some(f => f.endsWith('.srt'))).toBe(false);
      expect(files.some(f => f.endsWith('.txt'))).toBe(false);
    });

    it('should return empty array for empty directory', async () => {
      const files = await scanDirectory(tempDir);
      expect(files).toEqual([]);
    });

    it('should handle directory with only subdirectories', async () => {
      await fs.mkdir(path.join(tempDir, 'empty1'));
      await fs.mkdir(path.join(tempDir, 'empty2'));

      const files = await scanDirectory(tempDir);
      expect(files).toEqual([]);
    });
  });

  describe('scanDirectories', () => {
    it('should scan multiple directories', async () => {
      const dir1 = path.join(tempDir, 'dir1');
      const dir2 = path.join(tempDir, 'dir2');

      await fs.mkdir(dir1);
      await fs.mkdir(dir2);

      await fs.writeFile(path.join(dir1, 'file1.txt'), 'test');
      await fs.writeFile(path.join(dir1, 'file2.txt'), 'test');
      await fs.writeFile(path.join(dir2, 'file3.txt'), 'test');

      const files = await scanDirectories([dir1, dir2]);

      expect(files).toHaveLength(3);
    });

    it('should handle empty directory list', async () => {
      const files = await scanDirectories([]);
      expect(files).toEqual([]);
    });
  });
});
