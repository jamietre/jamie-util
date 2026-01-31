/**
 * Orchestrates multiple identification strategies.
 * Runs strategies, consolidates results, and ranks by confidence.
 */

import * as path from "node:path";
import type { ShowIdentificationStrategy, ShowIdentificationResult, IdentificationContext } from "./types.js";
import type { Config } from "../config/types.js";
import type { LLMService } from "../llm/service.js";
import type { WebSearchService } from "../websearch/service.js";
import { extractArchive, listAudioFiles, readTextFiles } from "../utils/extract.js";
import { analyzeAllAudio } from "../audio/audio.js";
import { logger } from "../utils/logger.js";

/**
 * Orchestrates show identification strategies.
 */
export class ShowIdentificationOrchestrator {
  private strategies: ShowIdentificationStrategy[] = [];

  /**
   * Register an identification strategy.
   */
  registerStrategy(strategy: ShowIdentificationStrategy): void {
    this.strategies.push(strategy);
    logger.debug(`Registered strategy: ${strategy.name}`);
  }

  /**
   * Register multiple strategies at once.
   */
  registerStrategies(strategies: ShowIdentificationStrategy[]): void {
    strategies.forEach(s => this.registerStrategy(s));
  }

  /**
   * Run all applicable strategies and return results sorted by confidence.
   *
   * @param archivePath Path to the archive file
   * @param config Application configuration
   * @param llmService Optional LLM service
   * @param webSearchService Optional web search service
   * @returns Array of results sorted by confidence (highest first)
   */
  async identifyShow(
    archivePath: string,
    config: Config,
    llmService?: LLMService,
    webSearchService?: WebSearchService
  ): Promise<ShowIdentificationResult[]> {
    const filename = path.basename(archivePath);

    logger.info(`Running ${this.strategies.length} identification strategies...`);

    // Build initial context
    const context: IdentificationContext = {
      archivePath,
      filename,
      config,
      llmService,
      webSearchService,
    };

    // Determine if we need to extract archive
    const needsExtraction = this.strategies.some(s => s.requiresExtraction);

    if (needsExtraction) {
      logger.debug("Extracting archive for strategies that require it...");
      const workingDir = await extractArchive(archivePath);
      context.extractedDir = workingDir.path;

      // Read text files from extracted directory
      context.textFiles = await readTextFiles(workingDir.path);

      // Get audio file paths and analyze them
      const audioFilePaths = await listAudioFiles(workingDir.path);
      if (audioFilePaths.length > 0) {
        context.audioFiles = await analyzeAllAudio(audioFilePaths, () => {});
      }

      logger.debug(`Extracted: ${Object.keys(context.textFiles || {}).length} text files, ${context.audioFiles?.length || 0} audio files`);
    }

    // Run strategies in parallel
    const results = await Promise.allSettled(
      this.strategies.map(strategy =>
        this.runStrategy(strategy, context)
      )
    );

    // Collect successful results
    const validResults: ShowIdentificationResult[] = [];

    for (let i = 0; i < results.length; i++) {
      const result = results[i];
      const strategy = this.strategies[i];

      if (result.status === 'fulfilled' && result.value !== null) {
        validResults.push(result.value);
        logger.info(`✓ ${strategy.name}: ${result.value.confidence}% confident`);
      } else if (result.status === 'fulfilled') {
        logger.debug(`- ${strategy.name}: No result`);
      } else {
        logger.warn(`✗ ${strategy.name}: ${result.reason}`);
      }
    }

    // Sort by confidence (highest first)
    validResults.sort((a, b) => b.confidence - a.confidence);

    // Consolidate similar results
    const consolidated = this.consolidateResults(validResults);

    logger.info(`Found ${consolidated.length} identification result(s)`);

    return consolidated;
  }

  /**
   * Run a single strategy with error handling.
   */
  private async runStrategy(
    strategy: ShowIdentificationStrategy,
    context: IdentificationContext
  ): Promise<ShowIdentificationResult | null> {
    // Check if dependencies are met
    if (strategy.requiresLLM && !context.llmService) {
      logger.debug(`Skipping ${strategy.name}: LLM not available`);
      return null;
    }

    if (strategy.requiresWebSearch && !context.webSearchService) {
      logger.debug(`Skipping ${strategy.name}: Web search not available`);
      return null;
    }

    if (strategy.requiresExtraction && !context.extractedDir) {
      logger.debug(`Skipping ${strategy.name}: Archive not extracted`);
      return null;
    }

    logger.debug(`Running strategy: ${strategy.name}`);
    return await strategy.identify(context);
  }

  /**
   * Consolidate results that identify the same show.
   * Merges evidence and boosts confidence for confirmed results.
   */
  private consolidateResults(
    results: ShowIdentificationResult[]
  ): ShowIdentificationResult[] {
    if (results.length <= 1) {
      return results;
    }

    const consolidated: ShowIdentificationResult[] = [];

    for (const result of results) {
      // Check if we already have a very similar result
      const similar = consolidated.find(r =>
        this.areResultsSimilar(r, result)
      );

      if (similar) {
        // Merge showInfo fields (fill in gaps)
        similar.showInfo = {
          artist: similar.showInfo.artist || result.showInfo.artist,
          date: similar.showInfo.date || result.showInfo.date,
          venue: similar.showInfo.venue || result.showInfo.venue,
          city: similar.showInfo.city || result.showInfo.city,
          state: similar.showInfo.state || result.showInfo.state,
          country: similar.showInfo.country || result.showInfo.country,
        };

        // Merge evidence
        similar.evidence.push(`--- From ${result.source} ---`, ...result.evidence);

        // Boost confidence: average of both + bonus for confirmation
        const averageConfidence = (similar.confidence + result.confidence) / 2;
        similar.confidence = Math.min(averageConfidence + 15, 100);

        // Update source to show combination
        similar.source = `${similar.source} + ${result.source}`;

        logger.debug(`Consolidated ${result.source} into ${similar.source} (new confidence: ${similar.confidence}%)`);
      } else {
        consolidated.push(result);
      }
    }

    // Re-sort after consolidation
    return consolidated.sort((a, b) => b.confidence - a.confidence);
  }

  /**
   * Check if two results identify the same show or are complementary.
   */
  private areResultsSimilar(
    a: ShowIdentificationResult,
    b: ShowIdentificationResult
  ): boolean {
    // Case 1: Both have same date and artist = definitely same show
    if (a.showInfo.date && b.showInfo.date && a.showInfo.artist && b.showInfo.artist) {
      const sameDate = a.showInfo.date === b.showInfo.date;
      const sameArtist = a.showInfo.artist.toLowerCase() === b.showInfo.artist.toLowerCase();
      return sameDate && sameArtist;
    }

    // Case 2: Complementary results - one has artist, other has date, but location matches
    const locationMatches = this.locationsMatch(a.showInfo, b.showInfo);

    if (locationMatches) {
      // If locations match and one has date, other has artist = likely same show
      const aHasDate = !!a.showInfo.date;
      const bHasDate = !!b.showInfo.date;
      const aHasArtist = !!a.showInfo.artist;
      const bHasArtist = !!b.showInfo.artist;

      // Complementary: A has artist but not date, B has date but not artist (or vice versa)
      if ((aHasArtist && !aHasDate && bHasDate) || (bHasArtist && !bHasDate && aHasDate)) {
        logger.debug(`Found complementary results: ${a.source} + ${b.source}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if two show infos have matching locations.
   */
  private locationsMatch(
    a: Partial<{ city?: string; venue?: string; state?: string }>,
    b: Partial<{ city?: string; venue?: string; state?: string }>
  ): boolean {
    // Check city match
    if (a.city && b.city) {
      return a.city.toLowerCase() === b.city.toLowerCase();
    }

    // Check venue match
    if (a.venue && b.venue) {
      return a.venue.toLowerCase().includes(b.venue.toLowerCase()) ||
             b.venue.toLowerCase().includes(a.venue.toLowerCase());
    }

    return false;
  }

  /**
   * Get the number of registered strategies.
   */
  getStrategyCount(): number {
    return this.strategies.length;
  }

  /**
   * Get list of registered strategy names.
   */
  getStrategyNames(): string[] {
    return this.strategies.map(s => s.name);
  }
}
