import { describe, it, expect } from "vitest";
import { detectArchiveFormat, isArchive, extractArchive, listAudioFiles, listNonAudioFiles } from "./extract.js";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

describe("detectArchiveFormat", () => {
  it("detects .zip", () => {
    expect(detectArchiveFormat("show.zip")).toBe("zip");
    expect(detectArchiveFormat("Show Name.ZIP")).toBe("zip");
  });

  it("detects .tar.gz", () => {
    expect(detectArchiveFormat("show.tar.gz")).toBe("tar.gz");
  });

  it("detects .tgz", () => {
    expect(detectArchiveFormat("show.tgz")).toBe("tar.gz");
  });

  it("detects plain .gz", () => {
    expect(detectArchiveFormat("track.flac.gz")).toBe("gz");
  });

  it("detects .rar", () => {
    expect(detectArchiveFormat("show.rar")).toBe("rar");
    expect(detectArchiveFormat("SHOW.RAR")).toBe("rar");
  });

  it("returns null for unsupported formats", () => {
    expect(detectArchiveFormat("show.7z")).toBeNull();
    expect(detectArchiveFormat("readme.txt")).toBeNull();
  });
});

describe("isArchive", () => {
  it("recognizes supported archive extensions", () => {
    expect(isArchive("show.zip")).toBe(true);
    expect(isArchive("show.tar.gz")).toBe(true);
    expect(isArchive("show.tgz")).toBe(true);
    expect(isArchive("show.gz")).toBe(true);
    expect(isArchive("show.rar")).toBe(true);
  });

  it("rejects non-archive files", () => {
    expect(isArchive("show.flac")).toBe(false);
    expect(isArchive("readme.txt")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(isArchive("Show.ZIP")).toBe(true);
    expect(isArchive("SHOW.TAR.GZ")).toBe(true);
  });
});

describe("extractArchive", () => {
  it("uses directory directly with shouldCleanup=false", async () => {
    // Create a temporary directory with a test file
    const srcDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-extract-src-"));
    const testFile = path.join(srcDir, "test.txt");
    await fs.writeFile(testFile, "test content");

    try {
      const result = await extractArchive(srcDir);

      // Should use the same directory
      expect(result.path).toBe(srcDir);
      expect(result.shouldCleanup).toBe(false);

      // File should still be there
      const content = await fs.readFile(testFile, "utf-8");
      expect(content).toBe("test content");
    } finally {
      // Clean up source directory
      await fs.rm(srcDir, { recursive: true, force: true });
    }
  });

  it("throws error for non-existent path", async () => {
    const nonExistentPath = "/tmp/this-does-not-exist-12345678";
    await expect(extractArchive(nonExistentPath)).rejects.toThrow();
  });
});

describe("listAudioFiles", () => {
  it("uses natural sort for numeric filenames", async () => {
    // Create a temporary directory with files in wrong alphabetical order
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-natural-sort-"));

    try {
      // Create files in deliberately wrong alphabetical order
      await fs.writeFile(path.join(tmpDir, "10.flac"), "");
      await fs.writeFile(path.join(tmpDir, "2.flac"), "");
      await fs.writeFile(path.join(tmpDir, "1.flac"), "");
      await fs.writeFile(path.join(tmpDir, "20.flac"), "");
      await fs.writeFile(path.join(tmpDir, "3.flac"), "");

      const files = await listAudioFiles(tmpDir);
      const basenames = files.map(f => path.basename(f));

      // Should be in natural numeric order, not alphabetical
      expect(basenames).toEqual(["1.flac", "2.flac", "3.flac", "10.flac", "20.flac"]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("uses natural sort with prefix text", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-natural-sort-prefix-"));

    try {
      await fs.writeFile(path.join(tmpDir, "track10.flac"), "");
      await fs.writeFile(path.join(tmpDir, "track2.flac"), "");
      await fs.writeFile(path.join(tmpDir, "track1.flac"), "");

      const files = await listAudioFiles(tmpDir);
      const basenames = files.map(f => path.basename(f));

      expect(basenames).toEqual(["track1.flac", "track2.flac", "track10.flac"]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});

describe("listNonAudioFiles", () => {
  it("lists non-audio files with relative paths", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-non-audio-"));

    try {
      // Create test files
      await fs.writeFile(path.join(tmpDir, "info.txt"), "");
      await fs.writeFile(path.join(tmpDir, "artwork.jpg"), "");
      await fs.writeFile(path.join(tmpDir, "track.flac"), ""); // Should be excluded

      const files = await listNonAudioFiles(tmpDir);
      const relativePaths = files.map(f => f.relativePath).sort();

      expect(relativePaths).toEqual(["artwork.jpg", "info.txt"]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("recursively includes files from subdirectories", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-non-audio-recursive-"));

    try {
      // Create nested structure
      await fs.mkdir(path.join(tmpDir, "artwork"));
      await fs.mkdir(path.join(tmpDir, "docs"));

      await fs.writeFile(path.join(tmpDir, "info.txt"), "");
      await fs.writeFile(path.join(tmpDir, "artwork", "cover.jpg"), "");
      await fs.writeFile(path.join(tmpDir, "artwork", "back.jpg"), "");
      await fs.writeFile(path.join(tmpDir, "docs", "notes.md"), "");
      await fs.writeFile(path.join(tmpDir, "track.flac"), ""); // Should be excluded

      const files = await listNonAudioFiles(tmpDir);
      const relativePaths = files.map(f => f.relativePath).sort();

      expect(relativePaths).toEqual([
        path.join("artwork", "back.jpg"),
        path.join("artwork", "cover.jpg"),
        path.join("docs", "notes.md"),
        "info.txt",
      ]);

      // Verify fullPath is correct
      const coverFile = files.find(f => f.relativePath === path.join("artwork", "cover.jpg"));
      expect(coverFile?.fullPath).toBe(path.join(tmpDir, "artwork", "cover.jpg"));
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });

  it("respects exclude patterns", async () => {
    const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "test-non-audio-exclude-"));

    try {
      await fs.writeFile(path.join(tmpDir, "info.txt"), "");
      await fs.writeFile(path.join(tmpDir, "ffp.txt"), ""); // Should be excluded
      await fs.writeFile(path.join(tmpDir, "md5.txt"), ""); // Should be excluded

      const files = await listNonAudioFiles(tmpDir, ["ffp", "md5"]);
      const relativePaths = files.map(f => f.relativePath);

      expect(relativePaths).toEqual(["info.txt"]);
    } finally {
      await fs.rm(tmpDir, { recursive: true, force: true });
    }
  });
});
