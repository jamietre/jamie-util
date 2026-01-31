# LLM Integration Plan

## Overview

Integrate LLM capabilities (Claude, OpenAI, or local models) to assist with difficult parsing and matching decisions during music ingestion.

## Use Cases for LLM Assistance

### 1. Setlist Mismatch Resolution
- Analyze audio files vs setlist
- Suggest --merge or --split operations
- Identify intro tracks, banter, segues
- **Example:** 26 audio files vs 19 setlist songs → suggest merging intro/banter tracks

### 2. Date Extraction
- Parse complex filenames
- Read text files (info.txt, notes.md)
- Extract from audio metadata
- **Example:** "Live in Berlin '25" → "2025-11-10"

### 3. Artist/Venue/Location Parsing
- Handle unusual formats
- Disambiguate similar band names
- Parse international venues
- **Example:** "KGATLW" → "King Gizzard & The Lizard Wizard"

### 4. Track Name Fuzzy Matching
- Match variations in track names
- Handle typos, abbreviations
- **Example:** "Mary" → "Mary Won't You Call My Name?"

## Proposed Architecture

### 1. Configuration (config.json)

```json
{
  "llm": {
    "enabled": false,
    "provider": "anthropic",  // or "openai", "ollama"
    "apiKey": "sk-ant-...",
    "model": "claude-sonnet-4-5-20250929",
    "maxTokens": 4000,
    "autoApply": false  // If true, auto-apply suggestions; if false, prompt user
  }
}
```

### 2. Provider Abstraction

```typescript
interface LLMProvider {
  name: string;
  query(request: LLMRequest): Promise<LLMResponse>;
}

interface LLMRequest {
  type: "setlist_mismatch" | "date_extraction" | "artist_identification" | "track_matching";
  context: Record<string, unknown>;
  prompt: string;
}

interface LLMResponse {
  success: boolean;
  data: unknown;  // Type depends on request type
  reasoning: string;
  confidence: number;  // 0-1
}
```

### 3. Structured Response Types

```typescript
// For setlist mismatch
interface SetlistMismatchSuggestion {
  type: "setlist_mismatch";
  merges?: Array<{ tracks: number[] }>;
  splits?: Array<{ track: number; timestamp: string }>;
  reasoning: string;
  confidence: number;
}

// For date extraction
interface DateSuggestion {
  type: "date_extraction";
  date: string;  // YYYY-MM-DD
  source: string;  // Where it was found
  reasoning: string;
  confidence: number;
}

// For artist identification
interface ArtistSuggestion {
  type: "artist_identification";
  artist: string;
  bandConfigKey?: string;  // Matching band from config
  reasoning: string;
  confidence: number;
}
```

### 4. Integration Points

```typescript
// In ingest-music.ts

// Integration point 1: Date extraction
if (showInfo.date === "Unknown") {
  if (config.llm?.enabled) {
    const suggestion = await llmService.extractDate({
      filename: zipPath,
      textFiles: await readTextFiles(workingDir.path),
      audioMetadata: audioInfos[0]?.metadata
    });

    if (suggestion.confidence > 0.8 && config.llm.autoApply) {
      showInfo.date = suggestion.date;
      onProgress(`LLM suggested date: ${suggestion.date} (${suggestion.reasoning})`);
    } else {
      // Prompt user to confirm
      const confirmed = await confirmLLMSuggestion(suggestion);
      if (confirmed) showInfo.date = suggestion.date;
    }
  } else {
    // Existing interactive prompt
  }
}

// Integration point 2: Setlist mismatch
if (audioFiles.length !== setlist.songs.length) {
  if (config.llm?.enabled) {
    const suggestion = await llmService.resolveSetlistMismatch({
      audioFiles: audioFiles.map(f => path.basename(f)),
      setlist: setlist.songs,
      fileCount: audioFiles.length,
      setlistCount: setlist.songs.length
    });

    // Present suggestion to user
    onProgress(`\nLLM Analysis:`);
    onProgress(suggestion.reasoning);
    if (suggestion.merges?.length) {
      onProgress(`\nSuggested merges:`);
      for (const m of suggestion.merges) {
        onProgress(`  --merge "${m.tracks.join(' ')}"`);
      }
    }

    // User decides whether to accept or proceed manually
  }
}
```

### 5. Example Prompt (Setlist Mismatch)

```typescript
const systemPrompt = `You are an expert at analyzing concert recordings and setlists.
Your task is to identify why audio files don't match a setlist and suggest merge/split operations.

Common patterns:
- Intro tracks, banter, or stage announcements should be merged with the following song
- Long jams sometimes split into multiple tracks but appear as one song on setlist
- Encores are sometimes labeled differently

Respond with valid JSON only.`;

const userPrompt = `
Audio files (${audioFiles.length} total):
${audioFiles.map((f, i) => `${i + 1}. ${f}`).join('\n')}

Official setlist (${setlist.songs.length} songs):
${setlist.songs.map(s => `Set ${s.set}, #${s.position}: ${s.title}`).join('\n')}

Analyze the mismatch and suggest --merge or --split operations to align them.

Respond with JSON:
{
  "merges": [{ "tracks": [1, 2] }],  // List from end to beginning
  "splits": [{ "track": 16, "timestamp": "12:22" }],
  "reasoning": "Track 1 is a DJ intro that should merge with track 2...",
  "confidence": 0.95
}`;
```

### 6. CLI Flag

Add `--llm-assist` flag to enable per-run:
```bash
pnpm cli --llm-assist show.zip
```

## Implementation Plan

### Phase 1: Foundation
- [ ] Add LLM config schema to `config/types.ts`
- [ ] Create `src/llm/` directory structure
- [ ] Create LLM provider abstraction (`src/llm/provider.ts`)
- [ ] Implement Anthropic provider (using `@anthropic-ai/sdk`)
- [ ] Add request/response types (`src/llm/types.ts`)
- [ ] Add `--llm-assist` CLI flag

### Phase 2: Core Use Cases
- [ ] Implement setlist mismatch resolver
  - [ ] Create prompt templates
  - [ ] Parse and validate responses
  - [ ] Add user confirmation UI
- [ ] Implement date extractor
  - [ ] Read text files from archive
  - [ ] Build context for LLM
  - [ ] Parse date responses
- [ ] Implement artist identifier
  - [ ] Include band config patterns in context
  - [ ] Suggest matching band config

### Phase 3: Polish
- [ ] User confirmation prompts for suggestions
- [ ] Cost tracking (token usage logging)
- [ ] Response caching (avoid re-asking same question)
- [ ] Add OpenAI provider
- [ ] Add Ollama provider (local models)
- [ ] Error handling and retries
- [ ] Add confidence threshold config

### Phase 4: Advanced Features
- [ ] Read and analyze text files (info.txt, notes.md)
- [ ] Track name fuzzy matching with edit distance
- [ ] Multi-step reasoning (ask follow-up questions)
- [ ] Learn from user corrections (fine-tuning data collection)
- [ ] Batch processing with LLM suggestions

## Design Decisions

### Should this be opt-in or opt-out?
**Decision: Opt-in**
- Requires explicit `llm.enabled: true` in config
- Can be enabled per-run with `--llm-assist` flag
- Respects user privacy and API costs

### Auto-apply vs user confirmation?
**Decision: User confirmation by default**
- `llm.autoApply: false` by default
- Show reasoning and confidence score
- User chooses to accept/reject
- Can be set to `true` for fully automated workflows

### Cost limits?
**Decision: Add max token budget**
- `llm.maxTokensPerRun` config option
- Track and log token usage
- Warn when approaching limit
- Fail gracefully if exceeded

### Offline mode?
**Decision: Support local models via Ollama**
- Add Ollama provider for privacy-conscious users
- No API costs, runs locally
- Potentially lower quality but good enough for many cases

### Structured outputs?
**Decision: Use JSON mode for reliable parsing**
- Use Claude/OpenAI's JSON mode features
- Include JSON schema in prompts
- Validate responses against TypeScript types
- Fallback to text parsing if JSON mode unavailable

## File Structure

```
src/llm/
├── index.ts              # Main LLM service exports
├── types.ts              # Request/response types
├── provider.ts           # Provider interface
├── providers/
│   ├── anthropic.ts      # Claude implementation
│   ├── openai.ts         # OpenAI implementation
│   └── ollama.ts         # Local model implementation
├── prompts/
│   ├── setlist-mismatch.ts
│   ├── date-extraction.ts
│   └── artist-identification.ts
└── service.ts            # Main LLM service class
```

## Example Usage

### Setlist Mismatch
```bash
# LLM suggests merge operations
pnpm cli --llm-assist morphine-1994-03-07.zip

# Output:
# LLM Analysis:
# The audio files include several intro tracks and banter segments that should
# be merged with the following songs to match the official setlist.
#
# Suggested merges (apply in reverse order):
#   --merge "23 24"
#   --merge "17 18"
#   --merge "13 14"
#   --merge "10 11"
#   --merge "8 9"
#   --merge "6 7"
#   --merge "1 2"
#
# Apply these suggestions? [y/N]
```

### Date Extraction
```bash
# Can't parse date from filename
pnpm cli --llm-assist "phish-dicks.zip"

# LLM reads info.txt and suggests:
# LLM suggested date: 2024-08-16
# Source: info.txt mentions "August 16, 2024"
# Confidence: 0.95
# Use this date? [y/N]
```

## Testing Strategy

1. **Unit tests** for each provider
2. **Integration tests** with mock LLM responses
3. **Snapshot tests** for prompt templates
4. **Manual testing** with real API calls (limited)
5. **Cost monitoring** in CI/CD

## Future Enhancements

- [ ] Support for vision models (analyze scanned setlists, ticket stubs)
- [ ] Multi-language support for international shows
- [ ] Learning from corrections (build training dataset)
- [ ] Confidence-based auto-apply threshold
- [ ] Support for additional LLM providers (Gemini, etc.)
- [ ] Interactive chat mode for complex cases
- [ ] Setlist prediction when API unavailable

## Security Considerations

- Never send API keys in prompts
- Sanitize file paths before sending to LLM
- Validate all LLM responses before applying
- Rate limiting to prevent abuse
- Opt-in telemetry for improvement (with user consent)

## Cost Estimation

### Anthropic Claude Sonnet 4.5
- Input: $3 per million tokens
- Output: $15 per million tokens

### Typical request sizes
- Setlist mismatch: ~2000 input tokens, ~500 output tokens
- Date extraction: ~1000 input tokens, ~200 output tokens
- Cost per request: ~$0.01-0.02

### Budget recommendations
- Set `maxTokensPerRun: 50000` (roughly 10-20 requests)
- Estimated cost: $0.20-0.40 per show
- Reasonable for occasional use, high for batch processing
