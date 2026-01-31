/**
 * High-level web search service.
 * Provides convenient methods for common search tasks.
 */

import type { WebSearchProvider } from "./provider.js";
import type { WebSearchRequest, WebSearchResponse, WebSearchResult } from "./types.js";

/**
 * Service for performing web searches.
 * Wraps a WebSearchProvider and provides higher-level search methods.
 */
export class WebSearchService {
  constructor(private provider: WebSearchProvider) {}

  /**
   * Search the web with a query string.
   *
   * @param query Search query
   * @param options Optional search parameters
   * @returns Search results
   */
  async search(query: string, options?: Partial<WebSearchRequest>): Promise<WebSearchResponse> {
    return this.provider.search({
      query,
      ...options,
    });
  }

  /**
   * Search for concert/show information.
   * Optimized for finding live music event details.
   *
   * @param artist Artist name
   * @param location Optional location (city, venue)
   * @param date Optional date or year
   * @param additionalTerms Additional search terms (e.g., "setlist", "concert")
   * @returns Search results
   */
  async searchConcert(
    artist: string,
    location?: string,
    date?: string,
    additionalTerms?: string[]
  ): Promise<WebSearchResponse> {
    const terms = [artist];

    if (location) {
      terms.push(location);
    }

    if (date) {
      terms.push(date);
    }

    // Add common concert-related terms
    const defaultTerms = ["concert", "setlist", "live"];
    const searchTerms = additionalTerms ?? defaultTerms;
    terms.push(...searchTerms);

    const query = terms.join(" ");
    return this.search(query);
  }

  /**
   * Format search results as text for passing to an LLM.
   * Creates a concise summary of search results with titles, URLs, and descriptions.
   *
   * @param response Search results
   * @param maxResults Maximum number of results to include (default: 10)
   * @returns Formatted text suitable for LLM context
   */
  formatResultsForLLM(response: WebSearchResponse, maxResults: number = 10): string {
    const results = response.results.slice(0, maxResults);

    const formatted = results.map((result, index) => {
      let text = `${index + 1}. ${result.title}\n`;
      text += `   URL: ${result.url}\n`;
      text += `   ${result.description}`;

      if (result.metadata?.published) {
        text += `\n   Published: ${result.metadata.published}`;
      }

      return text;
    }).join("\n\n");

    return `Search results for "${response.query}":\n\n${formatted}`;
  }

  /**
   * Get the provider name.
   */
  getProviderName(): string {
    return this.provider.getName();
  }
}
