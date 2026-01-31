import type { LLMConfig } from "../config/types.js";
import { LLMService } from "./service.js";
import { OllamaProvider } from "./providers/ollama.js";

// Export main service and provider interface
export { LLMService } from "./service.js";
export type { LLMProvider } from "./provider.js";

// Export all types
export type {
  LLMRequest,
  LLMResponse,
  LLMRequestType,
  SetlistMismatchSuggestion,
  DateSuggestion,
  ArtistSuggestion,
  SetlistMismatchContext,
  DateExtractionContext,
  ArtistIdentificationContext,
  MergeSuggestion,
  SplitSuggestion,
} from "./types.js";

// Export providers
export { OllamaProvider } from "./providers/ollama.js";
export type { OllamaProviderConfig } from "./providers/ollama.js";

/**
 * Create an LLM service from config.
 * Returns null if LLM is not enabled or config is missing.
 */
export function createLLMService(config?: LLMConfig): LLMService | null {
  if (!config?.enabled) {
    return null;
  }

  switch (config.provider) {
    case "ollama":
      const provider = new OllamaProvider({
        model: config.model,
        apiEndpoint: config.apiEndpoint,
        maxTokens: config.maxTokens,
      });
      return new LLMService(provider);

    case "anthropic":
    case "openai":
      // Not implemented yet
      throw new Error(`Provider "${config.provider}" is not implemented yet. Use "ollama" for now.`);

    default:
      throw new Error(`Unknown LLM provider: ${config.provider}`);
  }
}
