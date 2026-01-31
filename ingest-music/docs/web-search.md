# Web Search Integration

The web search integration allows the tool to search the web for concert information when local data is insufficient. This is particularly useful when:

- Show date is missing from the archive
- No metadata is available in audio files
- LLM needs additional context to identify shows

## Architecture

The web search feature follows a **provider abstraction pattern**:

```
src/websearch/
├── types.ts              # Request/response types
├── provider.ts           # Provider interface
├── service.ts            # High-level service wrapper
├── providers/
│   └── brave.ts          # Brave Search implementation
└── index.ts              # Factory function & exports
```

### Provider Interface

All web search providers implement the `WebSearchProvider` interface:

```typescript
export interface WebSearchProvider {
  search(request: WebSearchRequest): Promise<WebSearchResponse>;
  getName(): string;
}
```

This design allows easy addition of new search providers (Google, DuckDuckGo, etc.) without changing the core logic.

## Supported Providers

### Brave Search (Recommended)

**Configuration:**
```json
{
  "webSearch": {
    "enabled": true,
    "provider": "brave",
    "apiKey": "your-brave-search-api-key",
    "maxResults": 10
  }
}
```

**Get API Key:**
1. Go to https://brave.com/search/api/
2. Sign up for a free account
3. Get your API key (2,000 free searches/month)

**Why Brave?**
- Generous free tier (2,000 searches/month)
- Independent search index (30B+ pages)
- Privacy-focused
- Official API with TypeScript SDK
- Affordable pricing ($3-5 per 1,000 searches)

## Usage

### Basic Usage

```typescript
import { createWebSearchService } from "./websearch/index.js";

const service = createWebSearchService(config.webSearch);

// Simple search
const results = await service.search("Morphine band Detroit 1994 concert");

// Concert-specific search
const concertResults = await service.searchConcert(
  "Morphine",
  "Detroit",
  "1994",
  ["State Theatre", "setlist"]
);
```

### Integration with LLM

The service provides a helper method to format results for LLM consumption:

```typescript
// Search for concert info
const searchResults = await webSearchService.searchConcert(
  artist,
  location,
  year
);

// Format for LLM
const context = webSearchService.formatResultsForLLM(searchResults, 10);

// Pass to LLM
const llmPrompt = `
Based on these web search results, identify the concert date and venue:

${context}

Extract: date (YYYY-MM-DD), venue name, city, state
`;

const showInfo = await llmService.extractDate(llmPrompt, textFiles);
```

### Response Format

```typescript
interface WebSearchResponse {
  query: string;                    // Original search query
  results: WebSearchResult[];       // Array of results
  totalResults?: number;            // Total available results
}

interface WebSearchResult {
  title: string;                    // Page title
  url: string;                      // URL
  description: string;              // Snippet/summary
  metadata?: {
    published?: string;             // Published date
    author?: string;                // Author/source
  };
}
```

## Adding New Providers

To add a new search provider (e.g., Google, DuckDuckGo):

1. **Create provider implementation:**
   ```typescript
   // src/websearch/providers/google.ts
   export class GoogleSearchProvider implements WebSearchProvider {
     async search(request: WebSearchRequest): Promise<WebSearchResponse> {
       // Implementation
     }

     getName(): string {
       return "google";
     }
   }
   ```

2. **Update config types:**
   ```typescript
   // src/config/types.ts
   export interface WebSearchConfig {
     provider: "brave" | "google";  // Add new provider
     // ...
   }
   ```

3. **Register in factory:**
   ```typescript
   // src/websearch/index.ts
   function createProvider(config: WebSearchConfig): WebSearchProvider {
     switch (config.provider) {
       case "brave":
         return new BraveSearchProvider(config);
       case "google":
         return new GoogleSearchProvider(config);
       // ...
     }
   }
   ```

## API Comparison

| Provider | Free Tier | Cost | Quality | Notes |
|----------|-----------|------|---------|-------|
| **Brave** | 2,000/month | $3-5/1K | Excellent | Independent index, privacy-focused |
| Tavily | 1,000/month | $8/1K | Excellent | AI-optimized results |
| SerpAPI | Limited | Varies | Excellent | Aggregates multiple engines |
| DuckDuckGo | Unlimited | Free | Good | Unofficial/scraping (may break) |

## Best Practices

### 1. Construct Specific Queries
```typescript
// Good - Specific query
"Morphine band Detroit State Theatre 1994 concert setlist"

// Bad - Too vague
"Morphine Detroit"
```

### 2. Use Concert-Specific Search
```typescript
// Preferred - optimized for concert searches
await service.searchConcert("Morphine", "Detroit", "1994", ["State Theatre"]);

// vs generic search
await service.search("Morphine Detroit 1994");
```

### 3. Limit Results for LLM
```typescript
// Format only top 5-10 results for LLM to avoid token bloat
const context = service.formatResultsForLLM(results, 10);
```

### 4. Handle Errors Gracefully
```typescript
try {
  const results = await service.search(query);
  if (results.results.length === 0) {
    console.log("No results found, falling back to manual input");
  }
} catch (error) {
  console.error("Search failed:", error);
  // Fall back to manual input or cached data
}
```

## Rate Limiting

**Brave Search:**
- Free tier: 2,000 queries/month
- Rate limit: ~1 query/second (not strictly enforced)
- Exceeding limits returns HTTP 429

**Recommendations:**
- Cache search results locally
- Don't search for the same query multiple times
- Consider implementing exponential backoff for retries

## Privacy Considerations

**Brave Search:**
- No user tracking
- No search history stored
- API key is required but queries are anonymized
- Privacy-focused company

**Best Practices:**
- Don't include sensitive information in queries
- API keys should be stored in config files (not committed to git)
- Consider using environment variables for API keys

## Testing

```bash
# Test the integration
pnpm test:websearch  # TODO: Add tests

# Manual testing
node -e "
import { createWebSearchService } from './src/websearch/index.js';

const config = {
  enabled: true,
  provider: 'brave',
  apiKey: 'YOUR_API_KEY',
  maxResults: 5
};

const service = createWebSearchService(config);
const results = await service.search('Phish Madison Square Garden 2024');
console.log(JSON.stringify(results, null, 2));
"
```

## Future Enhancements

- [ ] Add caching layer to avoid redundant searches
- [ ] Implement retry logic with exponential backoff
- [ ] Add support for Google Custom Search API
- [ ] Add support for Tavily (AI-optimized search)
- [ ] Integration with show picker workflow
- [ ] Automatic LLM integration when search results are available

## Related Documentation

- [LLM Integration](./llm-integration-plan.md) - How web search integrates with LLM features
- [Ollama Setup](./ollama-setup.md) - Local LLM configuration
- [Brave Search API Docs](https://brave.com/search/api/) - Official API documentation
