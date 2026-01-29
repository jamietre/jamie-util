import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Config, BandConfig } from "./types.js";

const DEFAULT_CONFIG: Config = {
  libraryBasePath: "",
  setlistSources: {},
  defaults: {
    setlistSources: ["setlist.fm"],
    albumTemplate: "{date} - {venue}, {city}, {state}",
    albumArtist: "{artist}",
    genre: "Live",
    targetPathTemplate: "{artist}/{date} - {venue}, {city}, {state}",
    fileNameTemplate: "{date} S{set} T{track} - {title}.flac",
    encoreInSet2: true,
  },
  bands: {},
};

/**
 * Load config from the first available source:
 * 1. Explicit path (--config flag)
 * 2. ~/.config/ingest-music/config.json
 * 3. ./ingest-music.json
 *
 * Falls back to defaults if no config found.
 */
export async function loadConfig(explicitPath?: string): Promise<Config> {
  const candidates = [
    explicitPath,
    path.join(os.homedir(), ".config", "ingest-music", "config.json"),
    path.resolve("ingest-music.json"),
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    try {
      const content = await fs.readFile(candidate, "utf-8");
      const parsed = JSON.parse(content) as Partial<Config>;
      return mergeConfig(DEFAULT_CONFIG, parsed);
    } catch {
      // File not found or invalid — try next
    }
  }

  return DEFAULT_CONFIG;
}

/**
 * Merge a partial config over defaults.
 */
export function mergeConfig(
  defaults: Config,
  override: Partial<Config>
): Config {
  return {
    libraryBasePath: override.libraryBasePath ?? defaults.libraryBasePath,
    setlistSources: {
      ...defaults.setlistSources,
      ...override.setlistSources,
    },
    defaults: {
      ...defaults.defaults,
      ...override.defaults,
    },
    bands: {
      ...defaults.bands,
      ...override.bands,
    },
  };
}

/**
 * Resolve band-specific config by looking up the artist name (lowercased)
 * in the bands map, then merging over defaults.
 */
export function resolveBandConfig(
  config: Config,
  artist: string
): BandConfig {
  const key = artist.toLowerCase();
  const bandOverride = config.bands[key];
  if (bandOverride) {
    return { ...config.defaults, ...bandOverride };
  }
  return { ...config.defaults };
}
