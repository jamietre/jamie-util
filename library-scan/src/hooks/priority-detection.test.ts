import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PriorityDetectionHook } from './priority-detection.js';
import type { ScanContext } from '../scanner/types.js';
import * as dpcmd from '../commands/dpcmd.js';

describe('PriorityDetectionHook', () => {
  let hook: PriorityDetectionHook;

  beforeEach(() => {
    hook = new PriorityDetectionHook();
    vi.clearAllMocks();
  });

  describe('shouldExecute', () => {
    it('should return true for files named .priority', () => {
      const context: ScanContext = {
        path: '/path/to/.priority',
        type: 'file',
        stats: {
          size: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
          accessedAt: new Date(),
        },
        relativePath: '.priority',
        parentPath: '/path/to',
        config: {} as any,
      };

      expect(hook.shouldExecute(context)).toBe(true);
    });

    it('should return false for files not named .priority', () => {
      const context: ScanContext = {
        path: '/path/to/file.txt',
        type: 'file',
        stats: {
          size: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
          accessedAt: new Date(),
        },
        relativePath: 'file.txt',
        parentPath: '/path/to',
        config: {} as any,
      };

      expect(hook.shouldExecute(context)).toBe(false);
    });

    it('should return false for directories', () => {
      const context: ScanContext = {
        path: '/path/to/.priority',
        type: 'directory',
        stats: {
          size: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
          accessedAt: new Date(),
        },
        relativePath: '.priority',
        parentPath: '/path/to',
        config: {} as any,
      };

      expect(hook.shouldExecute(context)).toBe(false);
    });
  });

  describe('execute', () => {
    it('should not set duplication if already duplicated', async () => {
      const context: ScanContext = {
        path: '/path/to/album/.priority',
        type: 'file',
        stats: {
          size: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
          accessedAt: new Date(),
        },
        relativePath: 'album/.priority',
        parentPath: '/path/to/album',
        config: { dryRun: false } as any,
      };

      vi.spyOn(dpcmd, 'getDuplicationStatus').mockResolvedValue({
        isDuplicated: true,
        duplicationLevel: 3,
      });

      const setDuplicationSpy = vi.spyOn(dpcmd, 'setDuplication');

      const result = await hook.execute(context);

      expect(dpcmd.getDuplicationStatus).toHaveBeenCalledWith(
        '/path/to/album',
        expect.objectContaining({ dryRun: false })
      );
      expect(setDuplicationSpy).not.toHaveBeenCalled();
      expect(result).toMatchObject({
        hookName: 'priority-detection',
        path: '/path/to/album/.priority',
        actionTaken: false,
        message: expect.stringContaining('already duplicated'),
      });
    });

    it('should set duplication if not already duplicated', async () => {
      const context: ScanContext = {
        path: '/path/to/album/.priority',
        type: 'file',
        stats: {
          size: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
          accessedAt: new Date(),
        },
        relativePath: 'album/.priority',
        parentPath: '/path/to/album',
        config: { dryRun: false } as any,
      };

      vi.spyOn(dpcmd, 'getDuplicationStatus').mockResolvedValue({
        isDuplicated: false,
      });

      const setDuplicationSpy = vi.spyOn(dpcmd, 'setDuplication').mockResolvedValue();

      const result = await hook.execute(context);

      expect(dpcmd.getDuplicationStatus).toHaveBeenCalledWith(
        '/path/to/album',
        expect.objectContaining({ dryRun: false })
      );
      expect(setDuplicationSpy).toHaveBeenCalledWith(
        '/path/to/album',
        2,
        expect.objectContaining({ dryRun: false })
      );
      expect(result).toMatchObject({
        hookName: 'priority-detection',
        path: '/path/to/album/.priority',
        actionTaken: true,
        message: expect.stringContaining('Set duplication level 2'),
      });
    });

    it('should respect dry-run mode', async () => {
      const context: ScanContext = {
        path: '/path/to/album/.priority',
        type: 'file',
        stats: {
          size: 0,
          createdAt: new Date(),
          modifiedAt: new Date(),
          accessedAt: new Date(),
        },
        relativePath: 'album/.priority',
        parentPath: '/path/to/album',
        config: { dryRun: true } as any,
      };

      vi.spyOn(dpcmd, 'getDuplicationStatus').mockResolvedValue({
        isDuplicated: false,
      });

      const setDuplicationSpy = vi.spyOn(dpcmd, 'setDuplication').mockResolvedValue();

      const result = await hook.execute(context);

      expect(dpcmd.getDuplicationStatus).toHaveBeenCalledWith(
        '/path/to/album',
        expect.objectContaining({ dryRun: true })
      );
      expect(setDuplicationSpy).toHaveBeenCalledWith(
        '/path/to/album',
        2,
        expect.objectContaining({ dryRun: true })
      );
      expect(result?.message).toContain('Would set duplication level 2');
    });
  });
});
