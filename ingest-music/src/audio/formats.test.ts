import { describe, it, expect } from "vitest";
import {
  getAudioFormat,
  isKnownAudioFormat,
  isLosslessFormat,
  validateAudioFormat,
} from "./formats.js";

describe("getAudioFormat", () => {
  it("returns format info for known lossless formats", () => {
    expect(getAudioFormat("file.flac")?.compression).toBe("lossless");
    expect(getAudioFormat("file.wav")?.compression).toBe("lossless");
    expect(getAudioFormat("file.shn")?.compression).toBe("lossless");
    expect(getAudioFormat("file.ape")?.compression).toBe("lossless");
  });

  it("returns format info for known lossy formats", () => {
    expect(getAudioFormat("file.mp3")?.compression).toBe("lossy");
    expect(getAudioFormat("file.aac")?.compression).toBe("lossy");
    expect(getAudioFormat("file.ogg")?.compression).toBe("lossy");
  });

  it("is case-insensitive", () => {
    expect(getAudioFormat("FILE.FLAC")?.compression).toBe("lossless");
    expect(getAudioFormat("FILE.MP3")?.compression).toBe("lossy");
  });

  it("returns undefined for unknown formats", () => {
    expect(getAudioFormat("file.xyz")).toBeUndefined();
    expect(getAudioFormat("file.txt")).toBeUndefined();
  });
});

describe("isKnownAudioFormat", () => {
  it("returns true for known formats", () => {
    expect(isKnownAudioFormat("file.flac")).toBe(true);
    expect(isKnownAudioFormat("file.mp3")).toBe(true);
    expect(isKnownAudioFormat("file.wav")).toBe(true);
  });

  it("returns false for unknown formats", () => {
    expect(isKnownAudioFormat("file.xyz")).toBe(false);
    expect(isKnownAudioFormat("file.txt")).toBe(false);
  });
});

describe("isLosslessFormat", () => {
  it("returns true for lossless formats", () => {
    expect(isLosslessFormat("file.flac")).toBe(true);
    expect(isLosslessFormat("file.wav")).toBe(true);
    expect(isLosslessFormat("file.shn")).toBe(true);
    expect(isLosslessFormat("file.ape")).toBe(true);
  });

  it("returns false for lossy formats", () => {
    expect(isLosslessFormat("file.mp3")).toBe(false);
    expect(isLosslessFormat("file.aac")).toBe(false);
    expect(isLosslessFormat("file.ogg")).toBe(false);
  });

  it("returns false for unknown formats", () => {
    expect(isLosslessFormat("file.xyz")).toBe(false);
  });
});

describe("validateAudioFormat", () => {
  it("returns format info for known formats", () => {
    const format = validateAudioFormat("file.flac");
    expect(format.extension).toBe(".flac");
    expect(format.compression).toBe("lossless");
  });

  it("throws for unknown formats", () => {
    expect(() => validateAudioFormat("file.xyz")).toThrow("Unknown audio format");
    expect(() => validateAudioFormat("file.txt")).toThrow("Unknown audio format");
  });

  it("includes helpful error message with supported formats", () => {
    expect(() => validateAudioFormat("file.xyz")).toThrow("Supported formats:");
  });
});
