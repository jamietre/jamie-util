import { describe, it, expect } from 'vitest';
import { compareFileSets, getComparisonStats } from './file-comparator.js';

describe('compareFileSets', () => {
  it('should find files unique to sources', () => {
    const sources = ['Movie A/file.mkv', 'Movie B/file.mkv', 'Movie C/file.mkv'];
    const target = ['Movie A/file.mkv'];

    const result = compareFileSets(sources, target);

    expect(result.inSourcesOnly).toEqual(['Movie B/file.mkv', 'Movie C/file.mkv']);
    expect(result.inBoth).toEqual(['Movie A/file.mkv']);
    expect(result.inTargetOnly).toEqual([]);
  });

  it('should find files unique to target', () => {
    const sources = ['Movie A/file.mkv'];
    const target = ['Movie A/file.mkv', 'Movie B/file.mkv', 'Movie C/file.mkv'];

    const result = compareFileSets(sources, target);

    expect(result.inSourcesOnly).toEqual([]);
    expect(result.inBoth).toEqual(['Movie A/file.mkv']);
    expect(result.inTargetOnly).toEqual(['Movie B/file.mkv', 'Movie C/file.mkv']);
  });

  it('should find files in both directions', () => {
    const sources = ['Movie A/file.mkv', 'Movie B/file.mkv', 'Movie D/file.mkv'];
    const target = ['Movie A/file.mkv', 'Movie C/file.mkv', 'Movie D/file.mkv'];

    const result = compareFileSets(sources, target);

    expect(result.inSourcesOnly).toEqual(['Movie B/file.mkv']);
    expect(result.inTargetOnly).toEqual(['Movie C/file.mkv']);
    expect(result.inBoth).toEqual(['Movie A/file.mkv', 'Movie D/file.mkv']);
  });

  it('should handle empty source set', () => {
    const sources: string[] = [];
    const target = ['Movie A/file.mkv', 'Movie B/file.mkv'];

    const result = compareFileSets(sources, target);

    expect(result.inSourcesOnly).toEqual([]);
    expect(result.inTargetOnly).toEqual(['Movie A/file.mkv', 'Movie B/file.mkv']);
    expect(result.inBoth).toEqual([]);
  });

  it('should handle empty target set', () => {
    const sources = ['Movie A/file.mkv', 'Movie B/file.mkv'];
    const target: string[] = [];

    const result = compareFileSets(sources, target);

    expect(result.inSourcesOnly).toEqual(['Movie A/file.mkv', 'Movie B/file.mkv']);
    expect(result.inTargetOnly).toEqual([]);
    expect(result.inBoth).toEqual([]);
  });

  it('should handle both sets empty', () => {
    const result = compareFileSets([], []);

    expect(result.inSourcesOnly).toEqual([]);
    expect(result.inTargetOnly).toEqual([]);
    expect(result.inBoth).toEqual([]);
  });

  it('should handle identical sets', () => {
    const files = ['Movie A/file.mkv', 'Movie B/file.mkv'];
    const result = compareFileSets(files, files);

    expect(result.inSourcesOnly).toEqual([]);
    expect(result.inTargetOnly).toEqual([]);
    expect(result.inBoth).toEqual(files);
  });

  it('should sort results alphabetically', () => {
    const sources = ['Z/file.mkv', 'A/file.mkv', 'M/file.mkv'];
    const target: string[] = [];

    const result = compareFileSets(sources, target);

    expect(result.inSourcesOnly).toEqual(['A/file.mkv', 'M/file.mkv', 'Z/file.mkv']);
  });

  it('should handle duplicate entries correctly', () => {
    // Sets automatically handle duplicates
    const sources = ['Movie A/file.mkv', 'Movie A/file.mkv', 'Movie B/file.mkv'];
    const target = ['Movie A/file.mkv'];

    const result = compareFileSets(sources, target);

    expect(result.inSourcesOnly).toEqual(['Movie B/file.mkv']);
    expect(result.inBoth).toEqual(['Movie A/file.mkv']);
  });
});

describe('getComparisonStats', () => {
  it('should calculate correct statistics', () => {
    const result = {
      inSourcesOnly: ['A/file.mkv', 'B/file.mkv'],
      inTargetOnly: ['C/file.mkv'],
      inBoth: ['D/file.mkv', 'E/file.mkv', 'F/file.mkv']
    };

    const stats = getComparisonStats(result);

    expect(stats.totalSourceFiles).toBe(5); // 2 unique + 3 in both
    expect(stats.totalTargetFiles).toBe(4); // 1 unique + 3 in both
    expect(stats.uniqueToSources).toBe(2);
    expect(stats.uniqueToTarget).toBe(1);
    expect(stats.inBoth).toBe(3);
  });

  it('should handle all files unique', () => {
    const result = {
      inSourcesOnly: ['A/file.mkv', 'B/file.mkv'],
      inTargetOnly: ['C/file.mkv', 'D/file.mkv'],
      inBoth: []
    };

    const stats = getComparisonStats(result);

    expect(stats.totalSourceFiles).toBe(2);
    expect(stats.totalTargetFiles).toBe(2);
    expect(stats.uniqueToSources).toBe(2);
    expect(stats.uniqueToTarget).toBe(2);
    expect(stats.inBoth).toBe(0);
  });
});
