import { describe, it, expect } from "vitest";
import { parseExifDate, buildTargetPath } from "./photo-sync.js";

describe("parseExifDate", () => {
  it("parses valid EXIF date format", () => {
    const result = parseExifDate("2024:03:15 14:30:45");
    expect(result).toBeInstanceOf(Date);
    expect(result?.getFullYear()).toBe(2024);
    expect(result?.getMonth()).toBe(2); // 0-indexed
    expect(result?.getDate()).toBe(15);
    expect(result?.getHours()).toBe(14);
    expect(result?.getMinutes()).toBe(30);
    expect(result?.getSeconds()).toBe(45);
  });

  it("returns null for invalid format", () => {
    expect(parseExifDate("2024-03-15 14:30:45")).toBeNull();
    expect(parseExifDate("invalid")).toBeNull();
    expect(parseExifDate("")).toBeNull();
  });

  it("returns null for dates before 1990", () => {
    expect(parseExifDate("1980:01:01 00:00:00")).toBeNull();
  });
});

describe("buildTargetPath", () => {
  it("builds correct path with YYYY/MM structure", () => {
    const date = new Date(2024, 2, 15); // March 15, 2024
    const result = buildTargetPath(
      "/source/DCIM/IMG_001.jpg",
      "/target/photos",
      date
    );
    expect(result).toBe("/target/photos/2024/03/IMG_001.jpg");
  });

  it("pads single-digit months with zero", () => {
    const date = new Date(2024, 0, 5); // January 5, 2024
    const result = buildTargetPath("/source/photo.jpg", "/target", date);
    expect(result).toBe("/target/2024/01/photo.jpg");
  });

  it("handles December correctly", () => {
    const date = new Date(2023, 11, 25); // December 25, 2023
    const result = buildTargetPath("/source/photo.heic", "/target", date);
    expect(result).toBe("/target/2023/12/photo.heic");
  });
});
