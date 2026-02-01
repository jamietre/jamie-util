/**
 * Web search strategy for finding show dates.
 * Uses web search to find missing date information when artist and venue/city are known.
 */

import type {
  ShowIdentificationStrategy,
  ShowIdentificationResult,
  IdentificationContext,
} from "../types.js";

/**
 * Strategy that uses web search to find complete show dates.
 * Useful when filename has artist and venue but incomplete date (e.g., "'25" instead of "2025-01-15").
 * Confidence: 70-85% depending on search result quality.
 */
export class WebSearchStrategy implements ShowIdentificationStrategy {
  readonly name = "web-search";
  readonly description = "Find show dates using web search";
  readonly requiresExtraction = false;
  readonly requiresLLM = false;
  readonly requiresWebSearch = true;

  async identify(
    context: IdentificationContext
  ): Promise<ShowIdentificationResult | null> {
    // Require web search service
    if (!context.webSearchService) {
      return null;
    }

    // Try to extract artist from filename (before " - " separator)
    const artistMatch = context.filename.match(/^([^-]+?)\s*-\s*/);
    const artist = artistMatch?.[1]?.trim();
    if (!artist) {
      return null; // Need artist to search
    }

    // Try to extract location info from filename
    const locationMatch =
      context.filename.match(/(?:Live (?:in|at) |@\s*)([^'"\d]+?)(?:\s*['"]?\d{2})?$/i);
    const location = locationMatch?.[1]?.trim();

    // Extract year hint from filename (e.g., "'25" or "2025")
    const yearMatch = context.filename.match(/['"]?(\d{2,4})/);
    let yearHint = yearMatch?.[1];
    if (yearHint && yearHint.length === 2) {
      // Convert '25 to 2025
      const num = parseInt(yearHint, 10);
      yearHint = num < 50 ? `20${yearHint}` : `19${yearHint}`;
    }

    try {
      // Perform web search using the convenient searchConcert method
      const searchResults = await context.webSearchService.searchConcert(
        artist,
        location,
        yearHint,
        ["setlist", "date"]
      );

      // Look for date patterns in search results
      let foundDate: string | undefined;
      let foundVenue: string | undefined;
      let foundCity: string | undefined;

      for (const result of searchResults.results.slice(0, 5)) {
        // Look for date in title or description
        const text = `${result.title} ${result.description}`;

        // Match various date formats
        const datePatterns = [
          /\b(\d{4})-(\d{2})-(\d{2})\b/, // YYYY-MM-DD
          /\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2}),?\s+(\d{4})/i, // Month DD, YYYY
          /\b(\d{1,2})\s+(January|February|March|April|May|June|July|August|September|October|November|December),?\s+(\d{4})/i, // DD Month YYYY
        ];

        for (const pattern of datePatterns) {
          const dateMatch = text.match(pattern);
          if (dateMatch) {
            foundDate = this.normalizeDate(dateMatch);
            break;
          }
        }

        if (foundDate) {
          break;
        }
      }

      if (!foundDate) {
        return null; // No date found in search results
      }

      // Calculate confidence based on search result quality
      const confidence = this.calculateConfidence({
        hasDate: !!foundDate,
        hasLocation: !!location,
        hasYearHint: !!yearHint,
        searchResultCount: searchResults.results.length,
      });

      // Build evidence list
      const searchTerms = [artist, location, yearHint].filter(Boolean).join(" ");
      const evidence: string[] = [
        `Web search: ${searchTerms}`,
        `Found ${searchResults.results.length} results`,
      ];

      if (foundDate) {
        evidence.push(`Extracted date: ${foundDate}`);
      }
      if (location) {
        evidence.push(`Location from filename: ${location}`);
      }

      return {
        showInfo: {
          artist,
          date: foundDate,
          venue: foundVenue,
          city: foundCity || location,
        },
        confidence,
        source: this.name,
        evidence,
      };
    } catch (error) {
      // Web search failed
      return null;
    }
  }

  /**
   * Normalize date to YYYY-MM-DD format.
   */
  private normalizeDate(match: RegExpMatchArray): string {
    if (match[0].includes("-")) {
      // Already in YYYY-MM-DD format
      return match[0];
    }

    // Month name formats
    const monthNames = {
      january: "01",
      february: "02",
      march: "03",
      april: "04",
      may: "05",
      june: "06",
      july: "07",
      august: "08",
      september: "09",
      october: "10",
      november: "11",
      december: "12",
    };

    if (match[1] && isNaN(Number(match[1]))) {
      // Format: "Month DD, YYYY"
      const month = monthNames[match[1].toLowerCase() as keyof typeof monthNames];
      const day = match[2].padStart(2, "0");
      const year = match[3];
      return `${year}-${month}-${day}`;
    } else if (match[2] && isNaN(Number(match[2]))) {
      // Format: "DD Month YYYY"
      const day = match[1].padStart(2, "0");
      const month = monthNames[match[2].toLowerCase() as keyof typeof monthNames];
      const year = match[3];
      return `${year}-${month}-${day}`;
    }

    return match[0]; // Fallback
  }

  /**
   * Calculate confidence score.
   */
  private calculateConfidence(factors: {
    hasDate: boolean;
    hasLocation: boolean;
    hasYearHint: boolean;
    searchResultCount: number;
  }): number {
    let confidence = 50; // Base confidence for web search

    if (factors.hasDate) {
      confidence += 20; // Found a date
    }

    if (factors.hasLocation) {
      confidence += 10; // Had location info to search with
    }

    if (factors.hasYearHint) {
      confidence += 5; // Had year hint to narrow search
    }

    if (factors.searchResultCount >= 5) {
      confidence += 5; // Good number of results
    }

    // Cap at 85 - web search alone shouldn't be 100% confident
    return Math.min(confidence, 85);
  }
}
