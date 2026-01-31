/**
 * Types for the modular show identification system.
 */

import type { ShowInfo, AudioInfo, Config } from "../config/types.js";
import type { LLMService } from "../llm/service.js";
import type { WebSearchService } from "../websearch/service.js";

/**
 * Result from a show identification strategy.
 */
export interface ShowIdentificationResult {
  /** Partial show information (may be incomplete) */
  showInfo: Partial<ShowInfo>;

  /** Confidence score (0-100) */
  confidence: number;

  /** Which strategy produced this result */
  source: string;

  /** Evidence supporting this identification */
  evidence: string[];

  /** Optional: reasoning from LLM if applicable */
  reasoning?: string;
}

/**
 * Context provided to all identification strategies.
 */
export interface IdentificationContext {
  /** Path to the archive file */
  archivePath: string;

  /** Directory where archive was extracted (if extracted) */
  extractedDir?: string;

  /** Filename (without path) */
  filename: string;

  /** Text files found in archive (filename -> content) */
  textFiles?: Record<string, string>;

  /** Audio files with metadata */
  audioFiles?: AudioInfo[];

  /** Application configuration */
  config: Config;

  /** LLM service (if enabled) */
  llmService?: LLMService;

  /** Web search service (if enabled) */
  webSearchService?: WebSearchService;
}

/**
 * A strategy for identifying show information.
 */
export interface ShowIdentificationStrategy {
  /** Strategy name (e.g., "filename-parser", "web-search") */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Whether this strategy requires archive extraction */
  readonly requiresExtraction: boolean;

  /** Whether this strategy requires LLM */
  readonly requiresLLM: boolean;

  /** Whether this strategy requires web search */
  readonly requiresWebSearch: boolean;

  /**
   * Attempt to identify the show.
   * @returns Identification result, or null if strategy cannot determine anything
   */
  identify(context: IdentificationContext): Promise<ShowIdentificationResult | null>;
}
