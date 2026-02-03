/**
 * Modular show identification system.
 * Provides strategy-based identification with confidence scoring.
 */

export { ShowIdentificationOrchestrator } from "./orchestrator.js";
export { presentIdentificationResults } from "./presenter.js";

// Types
export type {
  ShowIdentificationStrategy,
  ShowIdentificationResult,
  IdentificationContext,
} from "./types.js";

// Strategies
export { ArchiveStructureStrategy } from "./strategies/archive-structure.js";
export { FilenameStrategy } from "./strategies/filename.js";
export { AudioFileListStrategy } from "./strategies/audio-tracklist.js";
export { WebSearchStrategy } from "./strategies/websearch.js";
