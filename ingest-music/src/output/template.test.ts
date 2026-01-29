import { describe, it, expect } from "vitest";
import { renderTemplate, zeroPad, sanitize, sanitizeFilename, formatDate } from "./template.js";

describe("renderTemplate", () => {
  it("replaces known variables", () => {
    expect(
      renderTemplate("{artist} - {date}", { artist: "Phish", date: "2024-08-16" })
    ).toBe("Phish - 2024-08-16");
  });

  it("leaves unknown variables as-is", () => {
    expect(renderTemplate("{artist} - {unknown}", { artist: "Phish" })).toBe(
      "Phish - {unknown}"
    );
  });

  it("handles numeric values", () => {
    expect(renderTemplate("S{set} T{track}", { set: 1, track: 3 })).toBe(
      "S1 T3"
    );
  });

  it("handles empty template", () => {
    expect(renderTemplate("", { artist: "Phish" })).toBe("");
  });

  it("handles template with no placeholders", () => {
    expect(renderTemplate("plain text", { artist: "Phish" })).toBe("plain text");
  });

  it("handles multiple occurrences of same variable", () => {
    expect(renderTemplate("{a} and {a}", { a: "x" })).toBe("x and x");
  });

  it("formats date with {date:FORMAT} syntax", () => {
    expect(
      renderTemplate("{date:YYYY-MM-DD}", { date: "2024-08-16" })
    ).toBe("2024-08-16");
  });

  it("formats date with custom format", () => {
    expect(
      renderTemplate("{date:YYYY.MM.DD}", { date: "2024-08-16" })
    ).toBe("2024.08.16");
  });

  it("formats date as MM/DD/YYYY", () => {
    expect(
      renderTemplate("{date:MM/DD/YYYY}", { date: "2024-08-16" })
    ).toBe("08/16/2024");
  });

  it("uses raw date value when no format specified", () => {
    expect(
      renderTemplate("{date}", { date: "2024-08-16" })
    ).toBe("2024-08-16");
  });

  it("combines date formatting with other variables", () => {
    expect(
      renderTemplate("{artist} - {date:YYYY.MM.DD}", { artist: "Phish", date: "2024-08-16" })
    ).toBe("Phish - 2024.08.16");
  });
});

describe("zeroPad", () => {
  it("pads single digit", () => {
    expect(zeroPad(3)).toBe("03");
  });

  it("does not pad if already wide enough", () => {
    expect(zeroPad(12)).toBe("12");
  });

  it("pads to custom width", () => {
    expect(zeroPad(5, 3)).toBe("005");
  });
});

describe("sanitize (for tags)", () => {
  it("preserves forward slashes (allowed in tags)", () => {
    expect(sanitize("AC/DC")).toBe("AC/DC");
  });

  it("removes backslashes", () => {
    expect(sanitize("back\\slash")).toBe("backslash");
  });

  it("removes backticks", () => {
    expect(sanitize("song `title`")).toBe("song title");
  });

  it("converts accented characters to ASCII", () => {
    expect(sanitize("Café René")).toBe("Cafe Rene");
  });

  it("removes other non-ASCII characters", () => {
    expect(sanitize("Song → Title")).toBe("Song  Title");
  });

  it("preserves normal punctuation", () => {
    expect(sanitize("It's a song, isn't it?")).toBe("It's a song, isn't it?");
  });

  it("preserves hyphens and underscores", () => {
    expect(sanitize("song-title_v2")).toBe("song-title_v2");
  });

  it("handles empty string", () => {
    expect(sanitize("")).toBe("");
  });
});

describe("sanitizeFilename (for filenames)", () => {
  it("replaces forward slashes with dashes", () => {
    expect(sanitizeFilename("AC/DC")).toBe("AC-DC");
  });

  it("replaces backslashes with dashes", () => {
    expect(sanitizeFilename("back\\slash")).toBe("back-slash");
  });

  it("removes backticks", () => {
    expect(sanitizeFilename("song `title`")).toBe("song title");
  });

  it("converts accented characters to ASCII", () => {
    expect(sanitizeFilename("Café René")).toBe("Cafe Rene");
  });

  it("removes other non-ASCII characters", () => {
    expect(sanitizeFilename("Song → Title")).toBe("Song  Title");
  });

  it("preserves normal punctuation", () => {
    expect(sanitizeFilename("It's a song, isn't it?")).toBe("It's a song, isn't it?");
  });

  it("preserves hyphens and underscores", () => {
    expect(sanitizeFilename("song-title_v2")).toBe("song-title_v2");
  });

  it("handles multiple slashes", () => {
    expect(sanitizeFilename("7/4 Time/Tempo")).toBe("7-4 Time-Tempo");
  });

  it("handles empty string", () => {
    expect(sanitizeFilename("")).toBe("");
  });
});
