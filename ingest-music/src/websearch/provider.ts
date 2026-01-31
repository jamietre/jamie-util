/**
 * Web search provider interface.
 * All web search providers must implement this interface.
 */

import type { WebSearchRequest, WebSearchResponse } from "./types.js";

/**
 * Interface for web search providers (Brave, Google, etc.).
 */
export interface WebSearchProvider {
  /**
   * Execute a web search query.
   *
   * @param request Search parameters
   * @returns Search results
   */
  search(request: WebSearchRequest): Promise<WebSearchResponse>;

  /**
   * Get the name of this provider (e.g., "brave", "google").
   */
  getName(): string;
}
