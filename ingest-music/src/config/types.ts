/** Show information parsed from zip filename or provided via CLI flags */
export interface ShowInfo {
  artist: string;
  date: string; // YYYY-MM-DD
  venue: string;
  city: string;
  state: string;
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
}

/** Top-level config file schema */
export interface Config {
  libraryBasePath: string;
  setlistSources: Record<string, SetlistSourceConfig>;
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
