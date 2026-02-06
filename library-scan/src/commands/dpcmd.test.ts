import { describe, it, expect, vi } from 'vitest';
import { getDuplicationStatus } from './dpcmd.js';
import { exec } from 'child_process';
import { promisify } from 'util';

vi.mock('child_process', () => ({
  exec: vi.fn(),
}));

vi.mock('util', () => ({
  promisify: vi.fn((fn) => fn),
}));

describe('dpcmd', () => {
  describe('getDuplicationStatus', () => {
    it('should parse "Not duplicated" output', async () => {
      const execMock = exec as any;
      execMock.mockResolvedValue({
        stdout: 'Not duplicated',
        stderr: '',
      });

      const result = await getDuplicationStatus('/test/path', { retries: 1 });

      expect(result).toEqual({
        isDuplicated: false,
      });
    });

    it('should parse duplication level from output', async () => {
      const execMock = exec as any;
      execMock.mockResolvedValue({
        stdout: 'Duplicated at level 2',
        stderr: '',
      });

      const result = await getDuplicationStatus('/test/path', { retries: 1 });

      expect(result).toEqual({
        isDuplicated: true,
        duplicationLevel: 2,
      });
    });

    it('should parse "Duplication level: 3" format', async () => {
      const execMock = exec as any;
      execMock.mockResolvedValue({
        stdout: 'Duplication level: 3',
        stderr: '',
      });

      const result = await getDuplicationStatus('/test/path', { retries: 1 });

      expect(result).toEqual({
        isDuplicated: true,
        duplicationLevel: 3,
      });
    });

    it('should return not duplicated for dry run', async () => {
      const result = await getDuplicationStatus('/test/path', {
        dryRun: true,
        retries: 1,
      });

      expect(result).toEqual({
        isDuplicated: false,
      });
    });
  });
});
