/**
 * Brave Search API provider implementation.
 */

import { BraveSearch } from "brave-search";
import type { WebSearchProvider } from "../provider.js";
import type { WebSearchRequest, WebSearchResponse, WebSearchResult } from "../types.js";
import type { WebSearchConfig } from "../../config/types.js";

/**
 * Brave Search provider using the official Brave Search API.
 */
export class BraveSearchProvider implements WebSearchProvider {
  private client: BraveSearch;
  private maxResults: number;

  constructor(config: WebSearchConfig) {
    this.client = new BraveSearch(config.apiKey);
    this.maxResults = config.maxResults ?? 10;
  }

  async search(request: WebSearchRequest): Promise<WebSearchResponse> {
    const count = request.count ?? this.maxResults;

    // Call Brave Search API
    const response = await this.client.webSearch(request.query, {
      count,
      country: request.country,
      search_lang: request.language,
    });

    // Convert Brave Search results to our format
    const results: WebSearchResult[] = (response.web?.results ?? []).map((result) => ({
      title: result.title,
      url: result.url,
      description: result.description,
      metadata: {
        published: result.page_age,
        author: result.profile?.name,
      },
    }));

    return {
      query: request.query,
      results,
      totalResults: results.length,
    };
  }

  getName(): string {
    return "brave";
  }
}
