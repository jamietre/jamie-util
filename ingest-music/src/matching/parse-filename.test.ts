import { describe, it, expect } from "vitest";
import { parseZipFilename, parseTrackFilename } from "./parse-filename.js";

describe("parseZipFilename", () => {
  it("parses King Gizzard format with M-D-YY date", () => {
    const result = parseZipFilename(
      "King Gizzard & The Lizard Wizard - Live at Forest Hills Stadium, Queens, NY 8-16-24 (washtub).zip"
    );
    expect(result.artist).toBe("King Gizzard & The Lizard Wizard");
    expect(result.date).toBe("2024-08-16");
    expect(result.venue).toBe("Forest Hills Stadium");
    expect(result.city).toBe("Queens");
    expect(result.state).toBe("NY");
  });

  it("parses ISO date format", () => {
    const result = parseZipFilename(
      "Phish - 2024-08-16 - Dick's Sporting Goods Park, Commerce City, CO.zip"
    );
    expect(result.artist).toBe("Phish");
    expect(result.date).toBe("2024-08-16");
    expect(result.venue).toBe("Dick's Sporting Goods Park");
    expect(result.city).toBe("Commerce City");
    expect(result.state).toBe("CO");
  });

  it("handles dot-separated date", () => {
    const result = parseZipFilename(
      "Goose - Live at Red Rocks, Morrison, CO 7.12.24.zip"
    );
    expect(result.artist).toBe("Goose");
    expect(result.date).toBe("2024-07-12");
    expect(result.venue).toBe("Red Rocks");
    expect(result.city).toBe("Morrison");
    expect(result.state).toBe("CO");
  });

  it("strips taper parenthetical", () => {
    const result = parseZipFilename("Phish - Show Name (taper).zip");
    expect(result.artist).toBe("Phish");
  });

  it("returns partial info when parsing fails", () => {
    const result = parseZipFilename("random-file.zip");
    // Should not throw, returns whatever it can parse
    expect(result).toBeDefined();
  });

  it("handles 4-digit year in M-D-YYYY format", () => {
    const result = parseZipFilename(
      "Band - Venue, City, ST 12-31-2023.zip"
    );
    expect(result.date).toBe("2023-12-31");
  });
});

describe("parseTrackFilename", () => {
  it("parses d1t01 pattern", () => {
    const result = parseTrackFilename("d1t01 Tweezer.flac");
    expect(result.set).toBe(1);
    expect(result.track).toBe(1);
    expect(result.title).toBe("Tweezer");
  });

  it("parses s1_01_Song pattern", () => {
    const result = parseTrackFilename("s1_01_Tweezer.flac");
    expect(result.set).toBe(1);
    expect(result.track).toBe(1);
    expect(result.title).toBe("Tweezer");
  });

  it("parses 01 - Song pattern", () => {
    const result = parseTrackFilename("01 - Tweezer.flac");
    expect(result.track).toBe(1);
    expect(result.title).toBe("Tweezer");
    expect(result.set).toBeUndefined();
  });

  it("parses 1-01 Song pattern", () => {
    const result = parseTrackFilename("1-01 Tweezer.flac");
    expect(result.set).toBe(1);
    expect(result.track).toBe(1);
    expect(result.title).toBe("Tweezer");
  });

  it("parses leading number pattern", () => {
    const result = parseTrackFilename("03 Tweezer.flac");
    expect(result.track).toBe(3);
    expect(result.title).toBe("Tweezer");
  });

  it("returns empty for unparseable filename", () => {
    const result = parseTrackFilename("Tweezer.flac");
    expect(result.set).toBeUndefined();
    expect(result.track).toBeUndefined();
  });

  it("handles d2t03 pattern", () => {
    const result = parseTrackFilename("d2t03.flac");
    expect(result.set).toBe(2);
    expect(result.track).toBe(3);
  });
});
