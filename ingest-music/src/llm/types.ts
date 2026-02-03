/** LLM request types */
export type LLMRequestType =
  | "archive_structure_analysis"
  | "show_info_extraction"
  | "setlist_mismatch"
  | "date_extraction"
  | "artist_identification"
  | "track_matching"
  | "parse_merge_instructions"
  | "modify_setlist";

/** Base LLM request */
export interface LLMRequest {
  type: LLMRequestType;
  context: unknown;
  prompt: string;
}

/** Base LLM response */
export interface LLMResponse<T = unknown> {
  success: boolean;
  data: T;
  reasoning: string;
  confidence: number; // 0-1
}

/** Suggestion for merging tracks */
export interface MergeSuggestion {
  tracks: number[]; // Track numbers to merge (1-indexed)
}

/** Suggestion for splitting a track */
export interface SplitSuggestion {
  track: number; // Track number to split (1-indexed)
  timestamp: string; // Timestamp where to split (e.g., "12:22")
}

/** Response for setlist mismatch analysis */
export interface SetlistMismatchSuggestion {
  type: "setlist_mismatch";
  merges?: MergeSuggestion[];
  splits?: SplitSuggestion[];
  reasoning: string;
  confidence: number;
}

/** Response for date extraction */
export interface DateSuggestion {
  type: "date_extraction";
  date: string; // YYYY-MM-DD
  source: string; // Where the date was found
  reasoning: string;
  confidence: number;
}

/** Response for artist identification */
export interface ArtistSuggestion {
  type: "artist_identification";
  artist: string;
  bandConfigKey?: string; // Matching band from config
  reasoning: string;
  confidence: number;
}

/** Context for setlist mismatch request */
export interface SetlistMismatchContext {
  audioFiles: string[]; // List of audio file names
  setlist: Array<{ title: string; set: number; position: number }>;
  fileCount: number;
  setlistCount: number;
}

/** Context for date extraction request */
export interface DateExtractionContext {
  filename: string;
  textFiles?: Record<string, string>; // filename -> content
  audioMetadata?: {
    title?: string;
    album?: string;
    date?: string;
    comment?: string;
  };
}

/** Context for artist identification request */
export interface ArtistIdentificationContext {
  filename: string;
  possibleArtists?: string[]; // List of band names from config
  textFiles?: Record<string, string>;
}

/** Context for parsing user merge instructions */
export interface ParseMergeInstructionsContext {
  userInstructions: string; // Natural language instructions from user
  audioFiles: string[]; // List of audio file names
  setlist: Array<{ title: string; set: number; position: number }>;
  fileCount: number;
  setlistCount: number;
}

/** Response for parsing user merge instructions */
export interface ParseMergeInstructionsSuggestion {
  type: "parse_merge_instructions";
  merges?: MergeSuggestion[];
  splits?: SplitSuggestion[];
  reasoning: string;
  confidence: number;
}

/** Context for modifying setlist */
export interface ModifySetlistContext {
  userInstructions: string; // Natural language instructions from user
  currentSetlist: Array<{ title: string; set: number; position: number }>;
}

/** Response for modifying setlist */
export interface ModifySetlistSuggestion {
  type: "modify_setlist";
  modifiedSetlist: Array<{ title: string; set: number; position: number }>;
  reasoning: string;
  confidence: number;
}

/** Extended context that combines setlist modification and merge instructions */
export interface CombinedInstructionsContext {
  userInstructions: string; // Natural language instructions from user
  audioFiles: string[]; // List of audio file names
  setlist: Array<{ title: string; set: number; position: number }>;
  fileCount: number;
  setlistCount: number;
}

/** Extended response that can include setlist modifications AND merge/split operations */
export interface CombinedInstructionsSuggestion {
  type: "combined_instructions";
  modifiedSetlist?: Array<{ title: string; set: number; position: number }>; // If setlist was modified
  merges?: MergeSuggestion[];
  splits?: SplitSuggestion[];
  reasoning: string;
  confidence: number;
}

/** Context for archive structure analysis */
export interface ArchiveStructureContext {
  archiveName: string;
  directoryTreeText: string; // Formatted tree for display
  audioExtensions: string[]; // [".flac", ".mp3", etc.]
  excludePatterns: string[]; // From config.ignoreFilePatterns
  totalFiles: number;
  totalAudioFiles: number;
}

/** Context for show information extraction from archive (Phase 2) */
export interface ShowInfoExtractionContext {
  archiveName: string;
  directoryStructure: string;  // Tree view
  manifestFiles: Record<string, string>;  // filename → content
  filenamePatterns: string[];  // All audio filenames
  showInfoHints?: {  // Hints from structure analysis
    artist?: string;
    date?: string;
    venue?: string;
    city?: string;
    state?: string;
    source: string;
  };
}

/** Song in a setlist */
export interface SetlistSong {
  title: string;
  set: number;     // 1 = first set, 2 = second set, 3 = encore
  position: number;
}

/** Response from show information extraction (Phase 2) */
export interface ShowInfoExtractionResult {
  type: "show_info_extraction";
  artist?: string;
  date?: string;  // YYYY-MM-DD format
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  setlist?: SetlistSong[];  // If extracted from manifest
  confidence: number;
  source: string;  // What provided this info
  reasoning: string;
}

/** Response from archive structure analysis */
export interface ArchiveStructureSuggestion {
  type: "archive_structure_analysis";
  /** Relative path to directory containing music files */
  musicDirectory: string;
  /** Relative paths to supplementary files (info.txt, artwork, etc.) */
  supplementaryFiles: string[];
  /** Manifest files identified by type (Phase 2) */
  manifestFiles?: {
    infoFiles: string[];      // Text files with show info
    setlistFiles: string[];   // Files that might contain setlists
    artworkFiles: string[];   // Images, PDFs
  };
  /** Show information hints extracted from structure (Phase 2) */
  showInfoHints?: {
    artist?: string;
    date?: string;
    venue?: string;
    city?: string;
    state?: string;
    source: string;  // e.g., "directory name", "filename pattern"
  };
  /** Whether archive appears to contain a complete setlist (Phase 2) */
  hasCompleteSetlist?: boolean;
  /** Explanation of the analysis */
  reasoning: string;
  /** Confidence score (0-1) */
  confidence: number;
  /** Optional: Issues detected (nested formats, incomplete sets, etc.) */
  warnings?: string[];
}
