/** LLM request types */
export type LLMRequestType =
  | "setlist_mismatch"
  | "date_extraction"
  | "artist_identification"
  | "track_matching"
  | "parse_merge_instructions";

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
