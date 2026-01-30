import { describe, it, expect } from "vitest";
import { parseSplitSpec } from "./split.js";

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
