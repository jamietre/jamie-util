import { describe, it, expect } from "vitest";
import { detectArchiveFormat, isArchive, extractArchive } from "./extract.js";
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

  it("returns null for unsupported formats", () => {
    expect(detectArchiveFormat("show.rar")).toBeNull();
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
  });

  it("rejects non-archive files", () => {
    expect(isArchive("show.flac")).toBe(false);
    expect(isArchive("show.rar")).toBe(false);
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
