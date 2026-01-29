import { describe, it, expect } from "vitest";
import { renderTemplate, zeroPad } from "./template.js";

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
