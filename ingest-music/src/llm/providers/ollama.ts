import { Ollama } from "ollama";
import type { LLMProvider } from "../provider.js";
import type { LLMRequest, LLMResponse } from "../types.js";

export interface OllamaProviderConfig {
  model: string;
  apiEndpoint?: string; // Default: http://127.0.0.1:11434
  maxTokens?: number;
}

/**
 * Clean LLM response to extract valid JSON.
 * Removes markdown code blocks, extra whitespace, and other common formatting issues.
 */
function cleanJsonResponse(response: string): string {
  let cleaned = response.trim();

  // Remove markdown code blocks (```json ... ``` or ``` ... ```)
  cleaned = cleaned.replace(/^```(?:json)?\s*/i, "");
  cleaned = cleaned.replace(/\s*```\s*$/, "");

  // Remove any leading/trailing text that's not part of the JSON
  // Look for first { or [ and last } or ]
  const firstBrace = Math.max(cleaned.indexOf("{"), 0);
  const firstBracket = cleaned.indexOf("[");
  const start = firstBracket >= 0 && firstBracket < firstBrace ? firstBracket : firstBrace;

  const lastBrace = cleaned.lastIndexOf("}");
  const lastBracket = cleaned.lastIndexOf("]");
  const end = Math.max(lastBrace, lastBracket);

  if (start >= 0 && end >= start) {
    cleaned = cleaned.substring(start, end + 1);
  }

  return cleaned.trim();
}

export class OllamaProvider implements LLMProvider {
  name = "ollama";
  private client: Ollama;
  private config: OllamaProviderConfig;

  constructor(config: OllamaProviderConfig) {
    this.config = config;
    this.client = new Ollama({
      host: config.apiEndpoint || "http://127.0.0.1:11434",
    });
  }

  async query<T = unknown>(request: LLMRequest): Promise<LLMResponse<T>> {
    return this.queryWithRetry(request, false);
  }

  private async queryWithRetry<T = unknown>(
    request: LLMRequest,
    isRetry: boolean,
  ): Promise<LLMResponse<T>> {
    try {
      // Add JSON instruction to prompt if this is a retry
      const prompt = isRetry
        ? `${request.prompt}\n\nIMPORTANT: Your previous response was not valid JSON. Please respond with ONLY valid JSON, no markdown formatting, no code blocks, no extra text. Start with { and end with }.`
        : request.prompt;

      // Generate the response from Ollama
      const response = await this.client.generate({
        model: this.config.model,
        prompt,
        format: "json", // Request JSON mode for structured outputs
        stream: false,
        options: {
          num_predict: this.config.maxTokens,
        },
      });

      // Parse the JSON response
      let parsedData: T;
      try {
        // Try parsing raw response first
        parsedData = JSON.parse(response.response) as T;
      } catch (parseError) {
        // Try cleaning the response and parsing again
        const cleaned = cleanJsonResponse(response.response);
        try {
          parsedData = JSON.parse(cleaned) as T;
        } catch (cleanedParseError) {
          // If this is already a retry, give up
          if (isRetry) {
            console.error("Failed to parse LLM response after retry:", cleanedParseError);
            console.error("Raw response:", response.response);
            console.error("Cleaned response:", cleaned);
            return {
              success: false,
              data: {} as T,
              reasoning: `Failed to parse JSON response after retry. Parse error: ${cleanedParseError instanceof Error ? cleanedParseError.message : String(cleanedParseError)}`,
              confidence: 0,
            };
          }

          // First attempt failed - retry with explicit JSON instruction
          console.warn("JSON parse failed, retrying with explicit instruction...");
          console.warn("Original response:", response.response);
          return this.queryWithRetry<T>(request, true);
        }
      }

      // Extract reasoning and confidence if present in the response
      const dataWithMetadata = parsedData as {
        reasoning?: string;
        confidence?: number;
      };

      return {
        success: true,
        data: parsedData,
        reasoning: dataWithMetadata.reasoning || "No reasoning provided",
        confidence: dataWithMetadata.confidence ?? 0.5,
      };
    } catch (error) {
      console.error("Ollama query failed:", error);
      return {
        success: false,
        data: {} as T,
        reasoning: `Error: ${error instanceof Error ? error.message : String(error)}`,
        confidence: 0,
      };
    }
  }
}
