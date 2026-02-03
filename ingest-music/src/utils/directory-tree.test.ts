import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  checkForSubdirectories,
  buildDirectoryTree,
  formatDirectoryTree,
  countNodes,
  countAudioNodes,
  findAudioFiles,
  type DirectoryNode,
} from "./directory-tree.js";

describe("directory-tree", () => {
  let tempDir: string;

  beforeEach(async () => {
    // Create a temporary directory for testing
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "directory-tree-test-"));
  });

  afterEach(async () => {
    // Clean up
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe("checkForSubdirectories", () => {
    it("returns false for empty directory", async () => {
      const result = await checkForSubdirectories(tempDir);
      expect(result).toBe(false);
    });

    it("returns false for directory with only files", async () => {
      await fs.writeFile(path.join(tempDir, "file1.txt"), "content");
      await fs.writeFile(path.join(tempDir, "file2.flac"), "audio");

      const result = await checkForSubdirectories(tempDir);
      expect(result).toBe(false);
    });

    it("returns true for directory with subdirectories", async () => {
      await fs.mkdir(path.join(tempDir, "subdir"));

      const result = await checkForSubdirectories(tempDir);
      expect(result).toBe(true);
    });

    it("excludes subdirectories matching exclude patterns", async () => {
      await fs.mkdir(path.join(tempDir, "__MACOSX"));
      await fs.mkdir(path.join(tempDir, ".git"));

      const result = await checkForSubdirectories(tempDir, ["__MACOSX", ".git"]);
      expect(result).toBe(false);
    });

    it("returns true if at least one subdirectory doesn't match exclude patterns", async () => {
      await fs.mkdir(path.join(tempDir, "__MACOSX"));
      await fs.mkdir(path.join(tempDir, "music"));

      const result = await checkForSubdirectories(tempDir, ["__MACOSX"]);
      expect(result).toBe(true);
    });
  });

  describe("buildDirectoryTree", () => {
    it("builds tree for flat directory", async () => {
      await fs.writeFile(path.join(tempDir, "track01.flac"), "audio1");
      await fs.writeFile(path.join(tempDir, "track02.flac"), "audio2");
      await fs.writeFile(path.join(tempDir, "info.txt"), "info");

      const tree = await buildDirectoryTree(tempDir);

      expect(tree.type).toBe("directory");
      expect(tree.name).toBe(".");
      expect(tree.children).toHaveLength(3);

      const flacFiles = tree.children!.filter((c) => c.extension === ".flac");
      expect(flacFiles).toHaveLength(2);

      const txtFiles = tree.children!.filter((c) => c.extension === ".txt");
      expect(txtFiles).toHaveLength(1);
    });

    it("builds tree for nested directory", async () => {
      await fs.mkdir(path.join(tempDir, "set1"));
      await fs.mkdir(path.join(tempDir, "set2"));
      await fs.writeFile(path.join(tempDir, "set1", "track01.flac"), "audio1");
      await fs.writeFile(path.join(tempDir, "set2", "track01.flac"), "audio2");
      await fs.writeFile(path.join(tempDir, "info.txt"), "info");

      const tree = await buildDirectoryTree(tempDir);

      expect(tree.children).toHaveLength(3);

      const directories = tree.children!.filter((c) => c.type === "directory");
      expect(directories).toHaveLength(2);
      expect(directories[0].name).toBe("set1");
      expect(directories[1].name).toBe("set2");

      const set1Children = directories[0].children!;
      expect(set1Children).toHaveLength(1);
      expect(set1Children[0].name).toBe("track01.flac");
      expect(set1Children[0].path).toBe("set1/track01.flac");
    });

    it("excludes files matching exclude patterns", async () => {
      await fs.mkdir(path.join(tempDir, "__MACOSX"));
      await fs.mkdir(path.join(tempDir, "music"));
      await fs.writeFile(path.join(tempDir, ".DS_Store"), "system");
      await fs.writeFile(path.join(tempDir, "music", "track.flac"), "audio");

      const tree = await buildDirectoryTree(tempDir, ["__MACOSX", ".DS_Store"]);

      expect(tree.children).toHaveLength(1);
      expect(tree.children![0].name).toBe("music");
    });

    it("respects max depth limit", async () => {
      await fs.mkdir(path.join(tempDir, "level1"));
      await fs.mkdir(path.join(tempDir, "level1", "level2"));
      await fs.mkdir(path.join(tempDir, "level1", "level2", "level3"));

      const tree = await buildDirectoryTree(tempDir, [], 2);

      expect(tree.children).toHaveLength(1);
      expect(tree.children![0].name).toBe("level1");
      expect(tree.children![0].children).toHaveLength(1);
      expect(tree.children![0].children![0].name).toBe("level2");
      // level3 should not be included (max depth = 2)
      expect(tree.children![0].children![0].children).toHaveLength(0);
    });

    it("stores file sizes", async () => {
      await fs.writeFile(path.join(tempDir, "small.txt"), "hello");
      await fs.writeFile(path.join(tempDir, "large.flac"), "x".repeat(1024 * 1024)); // 1MB

      const tree = await buildDirectoryTree(tempDir);

      const smallFile = tree.children!.find((c) => c.name === "small.txt");
      expect(smallFile?.size).toBe(5);

      const largeFile = tree.children!.find((c) => c.name === "large.flac");
      expect(largeFile?.size).toBe(1024 * 1024);
    });
  });

  describe("formatDirectoryTree", () => {
    it("formats flat directory", async () => {
      await fs.writeFile(path.join(tempDir, "track01.flac"), "audio1");
      await fs.writeFile(path.join(tempDir, "track02.flac"), "audio2");

      const tree = await buildDirectoryTree(tempDir);
      const formatted = formatDirectoryTree(tree);

      expect(formatted).toContain("./");
      expect(formatted).toContain("track01.flac");
      expect(formatted).toContain("track02.flac");
    });

    it("formats nested directory with tree structure", async () => {
      await fs.mkdir(path.join(tempDir, "set1"));
      await fs.writeFile(path.join(tempDir, "set1", "track01.flac"), "audio");

      const tree = await buildDirectoryTree(tempDir);
      const formatted = formatDirectoryTree(tree);

      expect(formatted).toContain("./");
      expect(formatted).toContain("set1/");
      expect(formatted).toContain("track01.flac");
      expect(formatted).toContain("└──");
    });

    it("shows file sizes in human-readable format", async () => {
      await fs.writeFile(path.join(tempDir, "small.txt"), "hello"); // 5 bytes
      await fs.writeFile(path.join(tempDir, "medium.txt"), "x".repeat(1024 * 10)); // 10 KB
      await fs.writeFile(path.join(tempDir, "large.flac"), "x".repeat(1024 * 1024)); // 1 MB

      const tree = await buildDirectoryTree(tempDir);
      const formatted = formatDirectoryTree(tree);

      expect(formatted).toMatch(/small\.txt.*5 B/);
      expect(formatted).toMatch(/medium\.txt.*10\.0 KB/);
      expect(formatted).toMatch(/large\.flac.*1\.0 MB/);
    });
  });

  describe("countNodes", () => {
    it("counts files", async () => {
      await fs.writeFile(path.join(tempDir, "file1.txt"), "");
      await fs.writeFile(path.join(tempDir, "file2.flac"), "");
      await fs.mkdir(path.join(tempDir, "subdir"));

      const tree = await buildDirectoryTree(tempDir);
      const fileCount = countNodes(tree, "file");

      expect(fileCount).toBe(2);
    });

    it("counts directories", async () => {
      await fs.mkdir(path.join(tempDir, "dir1"));
      await fs.mkdir(path.join(tempDir, "dir2"));
      await fs.mkdir(path.join(tempDir, "dir1", "nested"));

      const tree = await buildDirectoryTree(tempDir);
      const dirCount = countNodes(tree, "directory");

      expect(dirCount).toBe(4); // root + dir1 + dir2 + nested
    });
  });

  describe("countAudioNodes", () => {
    it("counts only audio files", async () => {
      await fs.writeFile(path.join(tempDir, "track01.flac"), "");
      await fs.writeFile(path.join(tempDir, "track02.mp3"), "");
      await fs.writeFile(path.join(tempDir, "info.txt"), "");
      await fs.writeFile(path.join(tempDir, "image.jpg"), "");

      const tree = await buildDirectoryTree(tempDir);
      const audioCount = countAudioNodes(tree);

      expect(audioCount).toBe(2); // Only .flac and .mp3
    });

    it("counts audio files in nested directories", async () => {
      await fs.mkdir(path.join(tempDir, "set1"));
      await fs.mkdir(path.join(tempDir, "set2"));
      await fs.writeFile(path.join(tempDir, "set1", "track01.flac"), "");
      await fs.writeFile(path.join(tempDir, "set1", "track02.flac"), "");
      await fs.writeFile(path.join(tempDir, "set2", "track01.flac"), "");

      const tree = await buildDirectoryTree(tempDir);
      const audioCount = countAudioNodes(tree);

      expect(audioCount).toBe(3);
    });
  });

  describe("findAudioFiles", () => {
    it("returns paths to all audio files", async () => {
      await fs.mkdir(path.join(tempDir, "set1"));
      await fs.writeFile(path.join(tempDir, "track01.flac"), "");
      await fs.writeFile(path.join(tempDir, "set1", "track02.mp3"), "");
      await fs.writeFile(path.join(tempDir, "info.txt"), "");

      const tree = await buildDirectoryTree(tempDir);
      const audioPaths = findAudioFiles(tree);

      expect(audioPaths).toHaveLength(2);
      expect(audioPaths).toContain("track01.flac");
      expect(audioPaths).toContain("set1/track02.mp3");
    });

    it("returns empty array when no audio files", async () => {
      await fs.writeFile(path.join(tempDir, "info.txt"), "");
      await fs.writeFile(path.join(tempDir, "image.jpg"), "");

      const tree = await buildDirectoryTree(tempDir);
      const audioPaths = findAudioFiles(tree);

      expect(audioPaths).toHaveLength(0);
    });
  });
});
