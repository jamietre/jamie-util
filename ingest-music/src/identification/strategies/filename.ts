/**
 * Filename parsing strategy.
 * Extracts show information from filename patterns.
 */

import type { ShowIdentificationStrategy, ShowIdentificationResult, IdentificationContext } from "../types.js";
import { parseZipFilename } from "../../matching/parse-filename.js";
import { parseLocation } from "../../matching/location-parser.js";

/**
 * Strategy that parses structured information from filenames.
 * Confidence: 60-90% depending on completeness and pattern quality.
 */
export class FilenameStrategy implements ShowIdentificationStrategy {
  readonly name = "filename-parser";
  readonly description = "Extract date, artist, venue from filename patterns";
  readonly requiresExtraction = false;
  readonly requiresLLM = false;
  readonly requiresWebSearch = false;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    // Parse filename for structured info
    let parsed = parseZipFilename(context.filename);

    // If standard parser didn't find much, try underscore-separated pattern
    if (!parsed.artist && !parsed.date) {
      parsed = this.parseUnderscoreFormat(context.filename);
    }

    // Also try to extract location
    const location = parseLocation(context.filename);

    // Merge location info if not already present
    if (location.city && !parsed.city) {
      parsed.city = location.city;
    }
    if (location.venue && !parsed.venue) {
      parsed.venue = location.venue;
    }
    if (location.state && !parsed.state) {
      parsed.state = location.state;
    }

    // Need at least artist OR date to be useful
    if (!parsed.artist && !parsed.date) {
      return null;
    }

    // Calculate confidence based on what we extracted
    const confidence = this.calculateConfidence(parsed);

    // Build evidence list
    const evidence: string[] = [
      `Filename: ${context.filename}`,
    ];

    if (parsed.artist) {
      evidence.push(`Artist: ${parsed.artist}`);
    }
    if (parsed.date) {
      evidence.push(`Date: ${parsed.date}`);
    }
    if (parsed.venue) {
      evidence.push(`Venue: ${parsed.venue}`);
    }
    if (parsed.city || parsed.state) {
      const location = [parsed.city, parsed.state].filter(Boolean).join(", ");
      evidence.push(`Location: ${location}`);
    }

    return {
      showInfo: {
        artist: parsed.artist,
        date: parsed.date,
        venue: parsed.venue,
        city: parsed.city,
        state: parsed.state,
      },
      confidence,
      source: this.name,
      evidence,
    };
  }

  /**
   * Calculate confidence score based on parsed information.
   * Higher score = more complete and well-formatted information.
   */
  private calculateConfidence(parsed: {
    artist?: string;
    date?: string;
    venue?: string;
    city?: string;
    state?: string;
  }): number {
    let confidence = 50; // Base confidence for any extraction

    // Date quality scoring
    if (parsed.date) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
        // Perfect ISO format (YYYY-MM-DD)
        confidence += 20;
      } else if (/^\d{4}[-_]\d{2}[-_]\d{2}$/.test(parsed.date)) {
        // ISO-like format with different separators
        confidence += 15;
      } else if (/^\d{4}/.test(parsed.date)) {
        // Has year at least
        confidence += 10;
      } else {
        // Some date info but unclear format
        confidence += 5;
      }
    }

    // Artist presence
    if (parsed.artist) {
      confidence += 10;
    }

    // Venue info
    if (parsed.venue) {
      confidence += 10;
    }

    // Location info
    if (parsed.city && parsed.state) {
      confidence += 10; // Both city and state
    } else if (parsed.city || parsed.state) {
      confidence += 5; // Just one
    }

    // Completeness bonus: if we have all major fields
    if (parsed.artist && parsed.date && (parsed.venue || parsed.city)) {
      confidence += 10; // Bonus for complete info
    }

    // Cap at 90 - filename alone shouldn't be 100% confident
    return Math.min(confidence, 90);
  }

  /**
   * Parse underscore-separated filename format.
   * Common in bootleg archives: "Artist_YYYY-MM-DD_Venue_City.zip"
   */
  private parseUnderscoreFormat(filename: string): Partial<{
    artist?: string;
    date?: string;
    venue?: string;
    city?: string;
    state?: string;
  }> {
    // Remove .zip extension
    const base = filename.replace(/\.zip$/i, "").trim();

    // Split by underscores
    const parts = base.split("_");

    if (parts.length < 2) {
      return {}; // Not enough parts
    }

    const result: Partial<{
      artist?: string;
      date?: string;
      venue?: string;
      city?: string;
      state?: string;
    }> = {};

    // First part is usually artist
    result.artist = parts[0].trim();

    // Look for date in any part (YYYY-MM-DD format)
    for (const part of parts) {
      const dateMatch = part.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
      if (dateMatch) {
        result.date = dateMatch[0];
        break;
      }
    }

    // Remaining parts might be venue/location info
    // Skip parts that look like: SBD, AUD, FLAC, dates, etc.
    const skipPatterns = /^(SBD|AUD|FLAC|MP3|WAV|\d{4}-\d{2}-\d{2})$/i;

    for (let i = 1; i < parts.length; i++) {
      const part = parts[i].trim();

      if (skipPatterns.test(part)) {
        continue; // Skip technical info
      }

      if (!result.venue && part.length > 2) {
        result.venue = part;
      }
    }

    return result;
  }
}
