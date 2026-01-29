import { describe, it, expect } from "vitest";
import { detectArchiveFormat, isArchive } from "./extract.js";

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
