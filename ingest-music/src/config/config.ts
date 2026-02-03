import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import type { Config, BandConfig } from "./types.js";
import { logger } from "../utils/logger.js";

const DEFAULT_CONFIG: Config = {
  libraryBasePath: "",
  ignoreFilePatterns: [
    "^\\._", // macOS resource fork files (AppleDouble format)
    "^\\.DS_Store$", // macOS folder metadata
    "^Thumbs\\.db$", // Windows thumbnails
    "^\\.", // Other hidden files
  ],
  setlistSources: {},
  defaults: {
    setlistSources: ["setlist.fm"],
    albumTemplate: "{date} - {venue}, {city}, {state}",
    albumArtist: "{artist}",
    genre: "Live",
    targetPathTemplate: "{artist}/{date} - {venue}, {city}, {state}",
    fileNameTemplate: "{date} S{set} T{track} - {title}.flac",
    fileNameTemplateSingleSet: "{date} T{track} - {title}.flac",
    encoreInSet2: true,
    conversion: {
      flac: {
        compressionLevel: 8,
      },
    },
    keepTags: [
      "COMMENT",
      "DESCRIPTION",
      "ENCODER",
      "REPLAYGAIN_.*", // ReplayGain tags (with wildcard support)
      "R128_.*", // EBU R128 loudness tags
    ],
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
      logger.info(`Found config at ${candidate}`);
      return mergeConfig(DEFAULT_CONFIG, parsed);
    } catch {
      // File not found or invalid — try next
    }
  }

  throw new Error(
    `Could not find a valid config file. Please create one at ~/.config/ingest-music/config.json or ./ingest-music.json, or specify a path with the --config flag.`,
  );
}

/**
 * Merge a partial config over defaults.
 */
export function mergeConfig(
  defaults: Config,
  override: Partial<Config>,
): Config {
  return {
    libraryBasePath: override.libraryBasePath ?? defaults.libraryBasePath,
    ignoreFilePatterns: override.ignoreFilePatterns ?? defaults.ignoreFilePatterns,
    downloadDir: override.downloadDir ?? defaults.downloadDir,
    setlistSources: {
      ...defaults.setlistSources,
      ...override.setlistSources,
    },
    llm: override.llm ?? defaults.llm,
    webSearch: override.webSearch ?? defaults.webSearch,
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
 * Resolve band-specific config by matching the artist name against
 * each band's patterns (regex, case-insensitive), then merging over defaults.
 */
export function resolveBandConfig(config: Config, artist: string): BandConfig {
  // Search through all bands for a pattern match
  for (const [key, bandOverride] of Object.entries(config.bands)) {
    if (bandOverride.patterns) {
      const matches = bandOverride.patterns.some(pattern => {
        try {
          // Treat pattern as a regular expression (case-insensitive)
          const regex = new RegExp(pattern, 'i');
          return regex.test(artist);
        } catch (e) {
          // If regex is invalid, fall back to exact match (case-insensitive)
          console.warn(`Invalid regex pattern "${pattern}": ${e instanceof Error ? e.message : String(e)}`);
          return pattern.toLowerCase() === artist.toLowerCase();
        }
      });
      if (matches) {
        return { ...config.defaults, ...bandOverride };
      }
    }
  }

  // No match found, return defaults
  return { ...config.defaults };
}
