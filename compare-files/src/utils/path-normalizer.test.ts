import { describe, it, expect } from 'vitest';
import { normalizePath, normalizePaths } from './path-normalizer.js';

describe('normalizePath', () => {
  it('should normalize Unix-style paths', () => {
    const input = '/c/mount/network/media2/Movies/Action/Die Hard (1988)/movie.mkv';
    const result = normalizePath(input, 2);
    expect(result).toBe('Die Hard (1988)/movie.mkv');
  });

  it('should normalize Windows-style paths', () => {
    const input = 'C:\\mount\\network\\media2\\Movies\\Action\\Die Hard (1988)\\movie.mkv';
    const result = normalizePath(input, 2);
    expect(result).toBe('Die Hard (1988)/movie.mkv');
  });

  it('should handle different segment counts', () => {
    const input = '/a/b/c/d/e/f.txt';

    expect(normalizePath(input, 1)).toBe('f.txt');
    expect(normalizePath(input, 2)).toBe('e/f.txt');
    expect(normalizePath(input, 3)).toBe('d/e/f.txt');
  });

  it('should handle paths shorter than segments to keep', () => {
    const input = '/a/b.txt';
    const result = normalizePath(input, 5);
    expect(result).toBe('a/b.txt');
  });

  it('should handle paths with spaces and special characters', () => {
    const input = '/media/Movies/The Matrix (1999) [1080p]/movie.mkv';
    const result = normalizePath(input, 2);
    expect(result).toBe('The Matrix (1999) [1080p]/movie.mkv');
  });

  it('should handle trailing slashes', () => {
    const input = '/a/b/c/';
    const result = normalizePath(input, 2);
    expect(result).toBe('b/c');
  });

  it('should use forward slashes in output', () => {
    const input = 'C:\\Users\\Test\\file.txt';
    const result = normalizePath(input, 2);
    expect(result).toBe('Test/file.txt');
    expect(result).not.toContain('\\');
  });
});

describe('normalizePaths', () => {
  it('should normalize multiple paths', () => {
    const inputs = [
      '/a/b/c/d/file1.txt',
      '/x/y/z/file2.txt',
      'C:\\path\\to\\file3.txt'
    ];

    const results = normalizePaths(inputs, 2);

    expect(results).toEqual([
      'd/file1.txt',
      'z/file2.txt',
      'to/file3.txt'
    ]);
  });

  it('should handle empty array', () => {
    const results = normalizePaths([], 2);
    expect(results).toEqual([]);
  });
});
