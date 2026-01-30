import { describe, it, expect } from "vitest";
import { parseSplitSpec, parseMergeSpec } from "./split.js";

describe("parseSplitSpec", () => {
  it("parses S2T17 format with HH:MM:SS", () => {
    const result = parseSplitSpec("S2T17 12:22:30");
    expect(result).toEqual({
      set: 2,
      track: 17,
      timestamp: 12 * 3600 + 22 * 60 + 30, // 44550 seconds
    });
  });

  it("parses S2T17 format with MM:SS", () => {
    const result = parseSplitSpec("S2T17 12:22");
    expect(result).toEqual({
      set: 2,
      track: 17,
      timestamp: 12 * 60 + 22, // 742 seconds
    });
  });

  it("parses S2T17 format with raw seconds", () => {
    const result = parseSplitSpec("S2T17 742");
    expect(result).toEqual({
      set: 2,
      track: 17,
      timestamp: 742,
    });
  });

  it("parses dash format (2-17)", () => {
    const result = parseSplitSpec("2-17 12:22");
    expect(result).toEqual({
      set: 2,
      track: 17,
      timestamp: 12 * 60 + 22,
    });
  });

  it("is case-insensitive for set/track format", () => {
    const result = parseSplitSpec("s2t17 12:22");
    expect(result).toEqual({
      set: 2,
      track: 17,
      timestamp: 12 * 60 + 22,
    });
  });

  it("throws on invalid format", () => {
    expect(() => parseSplitSpec("invalid")).toThrow("Invalid split specification");
    expect(() => parseSplitSpec("S2T17")).toThrow("Invalid split specification");
    expect(() => parseSplitSpec("S2T17 12:22 extra")).toThrow("Invalid split specification");
  });

  it("throws on invalid track identifier", () => {
    expect(() => parseSplitSpec("invalid 12:22")).toThrow("Invalid track identifier");
    expect(() => parseSplitSpec("S2 12:22")).toThrow("Invalid track identifier");
    expect(() => parseSplitSpec("T17 12:22")).toThrow("Invalid track identifier");
  });

  it("throws on invalid timestamp", () => {
    expect(() => parseSplitSpec("S2T17 invalid")).toThrow("Invalid timestamp");
    expect(() => parseSplitSpec("S2T17 12:invalid")).toThrow("Invalid timestamp");
  });

  it("handles HH:MM:SS correctly", () => {
    const result = parseSplitSpec("S1T1 1:02:03");
    expect(result.timestamp).toBe(1 * 3600 + 2 * 60 + 3); // 3723 seconds
  });

  it("handles zero-padded times", () => {
    const result = parseSplitSpec("S1T1 01:02:03");
    expect(result.timestamp).toBe(1 * 3600 + 2 * 60 + 3);
  });

  it("handles fractional seconds", () => {
    const result = parseSplitSpec("S1T1 742.5");
    expect(result.timestamp).toBe(742.5);
  });
});

describe("parseMergeSpec", () => {
  it("parses S1T01 S1T02 format", () => {
    const result = parseMergeSpec("S1T01 S1T02 S1T03");
    expect(result).toEqual({
      tracks: [
        { set: 1, track: 1 },
        { set: 1, track: 2 },
        { set: 1, track: 3 },
      ],
    });
  });

  it("parses D1T01 D1T02 format (D for disc)", () => {
    const result = parseMergeSpec("D1T01 D1T02");
    expect(result).toEqual({
      tracks: [
        { set: 1, track: 1 },
        { set: 1, track: 2 },
      ],
    });
  });

  it("parses simple number format", () => {
    const result = parseMergeSpec("1 2 3");
    expect(result).toEqual({
      tracks: [
        { set: 1, track: 1 },
        { set: 1, track: 2 },
        { set: 1, track: 3 },
      ],
    });
  });

  it("is case-insensitive", () => {
    const result = parseMergeSpec("s1t01 s1t02");
    expect(result).toEqual({
      tracks: [
        { set: 1, track: 1 },
        { set: 1, track: 2 },
      ],
    });
  });

  it("throws on single track", () => {
    expect(() => parseMergeSpec("S1T01")).toThrow(
      "Expected at least 2 tracks"
    );
  });

  it("throws on empty string", () => {
    expect(() => parseMergeSpec("")).toThrow("Expected at least 2 tracks");
  });

  it("throws on invalid track identifier", () => {
    expect(() => parseMergeSpec("S1T01 invalid S1T03")).toThrow(
      "Invalid track identifier"
    );
  });

  it("handles mixed valid formats", () => {
    const result = parseMergeSpec("S1T01 1 2");
    expect(result).toEqual({
      tracks: [
        { set: 1, track: 1 },
        { set: 1, track: 1 },
        { set: 1, track: 2 },
      ],
    });
  });
});
