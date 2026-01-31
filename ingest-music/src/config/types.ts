/** Show information parsed from zip filename or provided via CLI flags */
export interface ShowInfo {
  artist: string;
  date: string; // YYYY-MM-DD
  venue: string;
  city: string;
  state: string;
  country?: string; // Country name for international shows
}

/** Configuration for a single setlist source (API endpoint) */
export interface SetlistSourceConfig {
  apiKey: string;
  url?: string; // Optional override for the API base URL
}

/** Conversion configuration */
export interface ConversionConfig {
  flac?: {
    compressionLevel?: number; // 0-12, default 8
  };
}

/** LLM provider configuration */
export interface LLMConfig {
  /** Whether LLM assistance is enabled */
  enabled: boolean;
  /** LLM provider to use (e.g., "ollama", "anthropic", "openai") */
  provider: "ollama" | "anthropic" | "openai";
  /** Model name to use (e.g., "qwen2.5:7b", "claude-sonnet-4-5-20250929") */
  model: string;
  /** API endpoint URL (for ollama and self-hosted providers) */
  apiEndpoint?: string;
  /** API key (for cloud providers like anthropic, openai) */
  apiKey?: string;
  /** Maximum tokens per request */
  maxTokens?: number;
  /** Whether to automatically apply LLM suggestions without user confirmation */
  autoApply: boolean;
  /** Maximum tokens allowed per run (budget limit) */
  maxTokensPerRun?: number;
}

/** Web search provider configuration */
export interface WebSearchConfig {
  /** Whether web search is enabled */
  enabled: boolean;
  /** Web search provider to use */
  provider: "brave" | "serper";
  /** API key for the search provider */
  apiKey: string;
  /** Maximum number of search results to return (default: 10) */
  maxResults?: number;
}

/** Per-band configuration, merged with defaults */
export interface BandConfig {
  /** Display name for the artist (if different from config key) */
  name?: string;
  /** Patterns for matching artist names (case-insensitive). Required for each band. */
  patterns?: string[];
  setlistSources: string[]; // e.g. ["phish.net", "setlist.fm"] — tried in order
  albumTemplate: string;
  albumArtist: string;
  genre: string;
  targetPathTemplate: string;
  fileNameTemplate: string;
  fileNameTemplateSingleSet?: string; // Optional template for single-set shows
  encoreInSet2: boolean;
  conversion?: ConversionConfig;
  /** Regex patterns for files to exclude (e.g., macOS resource forks, system files) */
  excludePatterns?: string[];
  /** Tag names to preserve from original files (e.g., ["COMMENT", "ENCODER", "REPLAYGAIN_*"]) */
  keepTags?: string[];
}

/** Top-level config file schema */
export interface Config {
  libraryBasePath: string;
  downloadDir?: string; // Optional directory for downloaded files (defaults to OS temp)
  setlistSources: Record<string, SetlistSourceConfig>;
  llm?: LLMConfig; // Optional LLM configuration
  webSearch?: WebSearchConfig; // Optional web search configuration
  defaults: BandConfig;
  bands: Record<string, Partial<BandConfig>>;
}

/** Audio file properties from music-metadata */
export interface AudioInfo {
  filePath: string;
  bitsPerSample: number | undefined;
  sampleRate: number | undefined;
  trackNumber: number | undefined;
  discNumber: number | undefined;
  title: string | undefined;
  duration: number | undefined;
}

/** A single song in a setlist */
export interface SetlistSong {
  title: string;
  set: number; // 1, 2, or 3 (encore)
  position: number; // 1-indexed within the set
}

/** Full setlist for a show */
export interface Setlist {
  artist: string;
  date: string;
  venue: string;
  city: string;
  state: string;
  country?: string; // Country name for international shows
  songs: SetlistSong[];
  /** Which API source provided this setlist */
  source: string;
  /** URL to view the setlist online */
  url: string;
}

/** A matched track: audio file paired with setlist song */
export interface MatchedTrack {
  audioFile: AudioInfo;
  song: SetlistSong;
  /** Effective set number (after encore merging) */
  effectiveSet: number;
  /** Track number within the effective set */
  trackInSet: number;
}

/** CLI flags */
export interface CliFlags {
  config?: string;
  artist?: string;
  date?: string;
  venue?: string;
  city?: string;
  state?: string;
  library?: string;
  batch: boolean;
  "dry-run": boolean;
  "skip-conversion": boolean;
  "use-llm": boolean; // Enable LLM for identification (overrides config)
  "use-web": boolean; // Enable web search for identification (overrides config)
  debug: boolean; // Enable debug logging
  split?: string[]; // Track split specifications (e.g., "S2T17 12:22:00")
  merge?: string[]; // Track merge specifications (e.g., "S1T01 S1T02 S1T03")
  url?: string; // Download from URL instead of using local file
  dir?: string; // Subdirectory within archive to process
}

/** Parsed track split specification */
export interface TrackSplit {
  set: number;
  track: number;
  timestamp: number; // Time in seconds where to split
}

/** Parsed track merge specification */
export interface TrackMerge {
  tracks: Array<{ set: number; track: number }>; // Sequential tracks to merge
}

/** Result of processing a single zip */
export interface IngestResult {
  zipPath: string;
  showInfo: ShowInfo;
  tracksProcessed: number;
  libraryPath: string;
  dryRun: boolean;
}

/** Callback for progress updates */
export type ProgressCallback = (message: string) => void;
