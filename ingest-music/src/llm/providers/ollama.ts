import { Ollama } from "ollama";
import type { LLMProvider } from "../provider.js";
import type { LLMRequest, LLMResponse } from "../types.js";

export interface OllamaProviderConfig {
  model: string;
  apiEndpoint?: string; // Default: http://127.0.0.1:11434
  maxTokens?: number;
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
    try {
      // Generate the response from Ollama
      const response = await this.client.generate({
        model: this.config.model,
        prompt: request.prompt,
        format: "json", // Request JSON mode for structured outputs
        stream: false,
        options: {
          num_predict: this.config.maxTokens,
        },
      });

      // Parse the JSON response
      let parsedData: T;
      try {
        parsedData = JSON.parse(response.response) as T;
      } catch (parseError) {
        // If JSON parsing fails, treat the raw response as the data
        console.warn("Failed to parse LLM response as JSON:", parseError);
        parsedData = response.response as T;
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
