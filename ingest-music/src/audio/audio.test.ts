import { describe, it, expect } from "vitest";
import { needsConversion } from "./audio.js";
import type { AudioInfo } from "../config/types.js";

function makeInfo(
  bitsPerSample: number | undefined,
  sampleRate: number | undefined
): AudioInfo {
  return {
    filePath: "/tmp/test.flac",
    bitsPerSample,
    sampleRate,
    trackNumber: undefined,
    discNumber: undefined,
    title: undefined,
    duration: 300,
  };
}

describe("needsConversion", () => {
  it("returns false for 16-bit/44.1kHz", () => {
    expect(needsConversion(makeInfo(16, 44100))).toBe(false);
  });

  it("returns false for 16-bit/48kHz", () => {
    expect(needsConversion(makeInfo(16, 48000))).toBe(false);
  });

  it("returns true for 24-bit", () => {
    expect(needsConversion(makeInfo(24, 44100))).toBe(true);
  });

  it("returns true for 96kHz", () => {
    expect(needsConversion(makeInfo(16, 96000))).toBe(true);
  });

  it("returns true for 24-bit/96kHz", () => {
    expect(needsConversion(makeInfo(24, 96000))).toBe(true);
  });

  it("returns false when both are undefined", () => {
    expect(needsConversion(makeInfo(undefined, undefined))).toBe(false);
  });
});
