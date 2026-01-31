import type { LLMRequest, LLMResponse } from "./types.js";

/** LLM provider interface */
export interface LLMProvider {
  /** Provider name (e.g., "ollama", "anthropic", "openai") */
  name: string;

  /**
   * Send a query to the LLM provider
   * @param request The LLM request with type, context, and prompt
   * @returns The LLM response with parsed data, reasoning, and confidence
   */
  query<T = unknown>(request: LLMRequest): Promise<LLMResponse<T>>;
}
