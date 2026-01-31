/**
 * Types for web search integration.
 */

/**
 * A single web search result.
 */
export interface WebSearchResult {
  /** Title of the web page */
  title: string;
  /** URL of the result */
  url: string;
  /** Snippet/description of the result */
  description: string;
  /** Optional additional metadata */
  metadata?: {
    /** Published date if available */
    published?: string;
    /** Author/source if available */
    author?: string;
  };
}

/**
 * Web search request parameters.
 */
export interface WebSearchRequest {
  /** Search query string */
  query: string;
  /** Maximum number of results to return */
  count?: number;
  /** Optional language preference (e.g., "en") */
  language?: string;
  /** Optional country/region for search results (e.g., "US") */
  country?: string;
}

/**
 * Web search response.
 */
export interface WebSearchResponse {
  /** Search query that was executed */
  query: string;
  /** Array of search results */
  results: WebSearchResult[];
  /** Total number of results available (may be more than returned) */
  totalResults?: number;
}
