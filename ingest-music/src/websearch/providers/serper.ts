/**
 * Serper.dev API provider implementation.
 * Uses Google Search results via Serper.dev API.
 */

import { SerperClient } from "@agentic/serper";
import type { WebSearchProvider } from "../provider.js";
import type { WebSearchRequest, WebSearchResponse, WebSearchResult } from "../types.js";
import type { WebSearchConfig } from "../../config/types.js";

/**
 * Serper.dev provider using Google Search results.
 * Free tier: 2,500 queries/month, no credit card required.
 */
export class SerperProvider implements WebSearchProvider {
  private client: SerperClient;
  private maxResults: number;

  constructor(config: WebSearchConfig) {
    this.client = new SerperClient({
      apiKey: config.apiKey,
    });
    this.maxResults = config.maxResults ?? 10;
  }

  async search(request: WebSearchRequest): Promise<WebSearchResponse> {
    const num = request.count ?? this.maxResults;

    // Call Serper API
    const response = await this.client.search({
      q: request.query,
      num,
      gl: request.country,
      hl: request.language,
    });

    // Convert Serper results to our format
    const results: WebSearchResult[] = (response.organic ?? []).map((result) => ({
      title: result.title,
      url: result.link,
      description: result.snippet,
      metadata: {
        // Serper doesn't provide publish date in organic results
        // Could extract from topStories if needed
      },
    }));

    return {
      query: request.query,
      results,
      totalResults: results.length,
    };
  }

  getName(): string {
    return "serper";
  }
}
