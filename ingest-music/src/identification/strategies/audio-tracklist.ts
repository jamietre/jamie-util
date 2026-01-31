/**
 * Audio file list strategy.
 * Analyzes track filenames and metadata to extract show information.
 */

import type { ShowIdentificationStrategy, ShowIdentificationResult, IdentificationContext } from "../types.js";
import { logger } from "../../utils/logger.js";

/**
 * Strategy that analyzes audio file names/metadata.
 * Confidence: 70-90% depending on pattern quality.
 */
export class AudioFileListStrategy implements ShowIdentificationStrategy {
  readonly name = "audio-tracklist";
  readonly description = "Extract info from track filenames and metadata";
  readonly requiresExtraction = true;
  readonly requiresLLM = false;
  readonly requiresWebSearch = false;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    if (!context.audioFiles || context.audioFiles.length === 0) {
      logger.debug("No audio files available");
      return null;
    }

    // Look for date/venue info in track filenames
    const extracted = this.extractFromFilenames(context.audioFiles.map(f => f.filePath));

    if (!extracted.date && !extracted.venue) {
      return null; // Didn't find anything useful
    }

    // Calculate confidence
    const confidence = this.calculateConfidence(extracted, context.audioFiles.length);

    // Build evidence
    const evidence: string[] = [
      `Analyzed ${context.audioFiles.length} audio files`,
    ];

    if (extracted.date) {
      evidence.push(`Date found in track filenames: ${extracted.date}`);
      evidence.push(`Example: ${extracted.exampleFilename}`);
    }

    if (extracted.venue) {
      evidence.push(`Venue: ${extracted.venue}`);
    }

    if (extracted.city) {
      evidence.push(`City: ${extracted.city}`);
    }

    return {
      showInfo: {
        date: extracted.date,
        venue: extracted.venue,
        city: extracted.city,
        state: extracted.state,
      },
      confidence,
      source: this.name,
      evidence,
    };
  }

  /**
   * Extract show info from track filenames.
   * Many bootlegs include venue/date in each track filename.
   */
  private extractFromFilenames(filePaths: string[]): {
    date?: string;
    venue?: string;
    city?: string;
    state?: string;
    exampleFilename?: string;
  } {
    const result: {
      date?: string;
      venue?: string;
      city?: string;
      state?: string;
      exampleFilename?: string;
    } = {};

    for (const filePath of filePaths) {
      const filename = filePath.split('/').pop() || '';

      // Pattern: "Live at [Venue], [City], [State], [Date]"
      const liveAtMatch = filename.match(
        /Live at ([^,]+),\s*([^,]+),\s*([A-Z]{2}),\s*(\d{1,2})[_\/](\d{1,2})[_\/](\d{4})/i
      );

      if (liveAtMatch) {
        const [, venue, city, state, month, day, year] = liveAtMatch;

        result.venue = venue.trim();
        result.city = city.trim();
        result.state = state.trim();
        result.date = `${year}-${this.pad(month)}-${this.pad(day)}`;
        result.exampleFilename = filename;
        break; // Found it!
      }

      // Pattern: "([City], [State] [Date])"
      const cityStateMatch = filename.match(
        /\(([^,]+),\s*([A-Z]{2}),?\s*(\d{1,2})[_\/](\d{1,2})[_\/](\d{4})\)/i
      );

      if (cityStateMatch) {
        const [, city, state, month, day, year] = cityStateMatch;

        result.city = city.trim();
        result.state = state.trim();
        result.date = `${year}-${this.pad(month)}-${this.pad(day)}`;
        result.exampleFilename = filename;
        break;
      }

      // Pattern: Simple date in filename M_D_YYYY or M-D-YYYY
      const dateMatch = filename.match(/(\d{1,2})[_\/-](\d{1,2})[_\/-](\d{4})/);

      if (dateMatch && !result.date) {
        const [, month, day, year] = dateMatch;
        result.date = `${year}-${this.pad(month)}-${this.pad(day)}`;
        result.exampleFilename = filename;
      }
    }

    return result;
  }

  /**
   * Calculate confidence based on what was extracted.
   */
  private calculateConfidence(
    extracted: { date?: string; venue?: string; city?: string; state?: string },
    fileCount: number
  ): number {
    let confidence = 60; // Base confidence

    if (extracted.date) {
      confidence += 20; // Date is very important
    }

    if (extracted.venue) {
      confidence += 10; // Venue adds certainty
    }

    if (extracted.city && extracted.state) {
      confidence += 10; // Complete location
    }

    // Bonus for having multiple files (more likely to be consistent)
    if (fileCount >= 10) {
      confidence += 5;
    }

    return Math.min(confidence, 90); // Cap at 90%
  }

  /**
   * Pad single-digit numbers with leading zero.
   */
  private pad(num: string): string {
    return num.padStart(2, '0');
  }
}
