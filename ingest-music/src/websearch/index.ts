/**
 * Web search integration module.
 * Provides a provider-based abstraction for web search APIs.
 */

import type { WebSearchConfig } from "../config/types.js";
import type { WebSearchProvider } from "./provider.js";
import { WebSearchService } from "./service.js";
import { BraveSearchProvider } from "./providers/brave.js";
import { SerperProvider } from "./providers/serper.js";

/**
 * Create a web search service from configuration.
 *
 * @param config Web search configuration
 * @returns Configured WebSearchService instance
 * @throws Error if provider is not supported
 */
export function createWebSearchService(config: WebSearchConfig): WebSearchService {
  const provider = createProvider(config);
  return new WebSearchService(provider);
}

/**
 * Create a web search provider from configuration.
 *
 * @param config Web search configuration
 * @returns WebSearchProvider instance
 * @throws Error if provider is not supported
 */
function createProvider(config: WebSearchConfig): WebSearchProvider {
  switch (config.provider) {
    case "brave":
      return new BraveSearchProvider(config);
    case "serper":
      return new SerperProvider(config);
    default:
      throw new Error(`Unsupported web search provider: ${config.provider}`);
  }
}

// Re-export types and classes for convenience
export { WebSearchService } from "./service.js";
export type { WebSearchProvider } from "./provider.js";
export type {
  WebSearchRequest,
  WebSearchResponse,
  WebSearchResult,
} from "./types.js";
