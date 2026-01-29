import { describe, it, expect } from "vitest";
import { mergeConfig, resolveBandConfig } from "./config.js";
import type { Config } from "./types.js";

const baseConfig: Config = {
  libraryBasePath: "/music",
  setlistSources: {
    "setlist.fm": { apiKey: "default-key" },
  },
  defaults: {
    setlistSources: ["setlist.fm"],
    albumTemplate: "{date} - {venue}",
    albumArtist: "{artist}",
    genre: "Live",
    targetPathTemplate: "{artist}/{date}",
    fileNameTemplate: "{date} T{track} - {title}.flac",
    encoreInSet2: true,
  },
  bands: {},
};

describe("mergeConfig", () => {
  it("overrides libraryBasePath", () => {
    const result = mergeConfig(baseConfig, { libraryBasePath: "/new" });
    expect(result.libraryBasePath).toBe("/new");
  });

  it("merges defaults partially", () => {
    const result = mergeConfig(baseConfig, {
      defaults: { genre: "Jam" } as any,
    });
    expect(result.defaults.genre).toBe("Jam");
    expect(result.defaults.setlistSources).toEqual(["setlist.fm"]);
  });

  it("merges bands", () => {
    const result = mergeConfig(baseConfig, {
      bands: { phish: { genre: "Jam" } },
    });
    expect(result.bands.phish).toEqual({ genre: "Jam" });
  });

  it("keeps defaults when override is empty", () => {
    const result = mergeConfig(baseConfig, {});
    expect(result.libraryBasePath).toBe("/music");
    expect(result.defaults.genre).toBe("Live");
  });

  it("merges setlistSources from both", () => {
    const result = mergeConfig(baseConfig, {
      setlistSources: {
        "phish.net": { apiKey: "phish-key" },
      },
    });
    expect(result.setlistSources["setlist.fm"].apiKey).toBe("default-key");
    expect(result.setlistSources["phish.net"].apiKey).toBe("phish-key");
  });
});

describe("resolveBandConfig", () => {
  const config: Config = {
    ...baseConfig,
    setlistSources: {
      "setlist.fm": { apiKey: "fm-key" },
      "phish.net": { apiKey: "phish-key" },
    },
    bands: {
      phish: {
        setlistSources: ["phish.net", "setlist.fm"],
        genre: "Jam",
      },
    },
  };

  it("resolves band-specific overrides", () => {
    const result = resolveBandConfig(config, "Phish");
    expect(result.setlistSources).toEqual(["phish.net", "setlist.fm"]);
    expect(result.genre).toBe("Jam");
    // Defaults still present
    expect(result.albumTemplate).toBe("{date} - {venue}");
  });

  it("returns defaults for unknown band", () => {
    const result = resolveBandConfig(config, "Goose");
    expect(result.setlistSources).toEqual(["setlist.fm"]);
    expect(result.genre).toBe("Live");
  });

  it("matches case-insensitively", () => {
    const result = resolveBandConfig(config, "PHISH");
    expect(result.setlistSources).toEqual(["phish.net", "setlist.fm"]);
  });
});
