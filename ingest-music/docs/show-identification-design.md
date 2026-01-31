# Show Identification Architecture

## Overview

A modular, strategy-based system for identifying concert shows from archives. Each identification method is encapsulated as a **strategy** that returns results with **confidence scores**. Multiple strategies run in parallel or sequence, and results are presented to the user ranked by confidence.

## Core Design: Strategy Pattern

### Key Interfaces

```typescript
/**
 * Result from a show identification strategy.
 */
interface ShowIdentificationResult {
  /** Partial show information (may be incomplete) */
  showInfo: Partial<ShowInfo>;

  /** Confidence score (0-100) */
  confidence: number;

  /** Which strategy produced this result */
  source: string;

  /** Evidence supporting this identification */
  evidence: string[];

  /** Optional: reasoning from LLM if applicable */
  reasoning?: string;
}

/**
 * Context provided to all identification strategies.
 */
interface IdentificationContext {
  /** Path to the archive file */
  archivePath: string;

  /** Directory where archive was extracted (if extracted) */
  extractedDir?: string;

  /** Filename (without path) */
  filename: string;

  /** Text files found in archive (filename -> content) */
  textFiles?: Record<string, string>;

  /** Audio files with metadata */
  audioFiles?: AudioInfo[];

  /** Application configuration */
  config: Config;

  /** LLM service (if enabled) */
  llmService?: LLMService;

  /** Web search service (if enabled) */
  webSearchService?: WebSearchService;
}

/**
 * A strategy for identifying show information.
 */
interface ShowIdentificationStrategy {
  /** Strategy name (e.g., "filename-parser", "web-search") */
  readonly name: string;

  /** Human-readable description */
  readonly description: string;

  /** Whether this strategy requires archive extraction */
  readonly requiresExtraction: boolean;

  /** Whether this strategy requires LLM */
  readonly requiresLLM: boolean;

  /** Whether this strategy requires web search */
  readonly requiresWebSearch: boolean;

  /**
   * Attempt to identify the show.
   * @returns Identification result, or null if strategy cannot determine anything
   */
  identify(context: IdentificationContext): Promise<ShowIdentificationResult | null>;
}
```

## Identification Strategies

### 1. FilenameStrategy
**Description**: Parse structured information from filename
**Requires**: None
**Confidence**: 60-90 (depending on pattern match quality)

```typescript
class FilenameStrategy implements ShowIdentificationStrategy {
  name = "filename-parser";
  description = "Extract date, artist, venue from filename patterns";
  requiresExtraction = false;
  requiresLLM = false;
  requiresWebSearch = false;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    const parsed = parseZipFilename(context.filename);

    if (!parsed.artist && !parsed.date) {
      return null; // No usable info
    }

    const confidence = calculateFilenameConfidence(parsed);

    return {
      showInfo: {
        artist: parsed.artist,
        date: parsed.date,
        venue: parsed.venue,
        city: parsed.city,
        state: parsed.state,
      },
      confidence,
      source: this.name,
      evidence: [
        `Filename pattern: ${context.filename}`,
        `Extracted artist: ${parsed.artist}`,
        parsed.date ? `Extracted date: ${parsed.date}` : null,
      ].filter(Boolean),
    };
  }
}

function calculateFilenameConfidence(parsed: any): number {
  let confidence = 50; // Base

  if (parsed.date && /^\d{4}-\d{2}-\d{2}$/.test(parsed.date)) {
    confidence += 20; // Valid date format
  }
  if (parsed.artist) {
    confidence += 10; // Has artist
  }
  if (parsed.venue) {
    confidence += 10; // Has venue
  }
  if (parsed.city || parsed.state) {
    confidence += 10; // Has location
  }

  return Math.min(confidence, 90); // Max 90 from filename alone
}
```

### 2. TextFileStrategy
**Description**: Extract text files from archive, analyze with LLM
**Requires**: Archive extraction, LLM
**Confidence**: 70-95 (depending on LLM confidence)

```typescript
class TextFileStrategy implements ShowIdentificationStrategy {
  name = "text-file-analysis";
  description = "Analyze .txt, .nfo, .md files with LLM";
  requiresExtraction = true;
  requiresLLM = true;
  requiresWebSearch = false;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    if (!context.llmService || !context.textFiles) {
      return null;
    }

    if (Object.keys(context.textFiles).length === 0) {
      return null; // No text files
    }

    const result = await context.llmService.extractDate(
      "Extract concert information from these files.",
      context.textFiles
    );

    if (!result.date && !result.venue) {
      return null; // LLM found nothing useful
    }

    return {
      showInfo: {
        date: result.date,
        venue: result.venue,
        city: result.city,
        state: result.state,
      },
      confidence: result.confidence,
      source: this.name,
      evidence: [
        `Found ${Object.keys(context.textFiles).length} text file(s)`,
        result.reasoning,
      ],
      reasoning: result.reasoning,
    };
  }
}
```

### 3. AudioFileListStrategy
**Description**: Analyze track names, derive setlist, search for matches
**Requires**: Archive extraction
**Confidence**: 50-80 (fuzzy matching)

```typescript
class AudioFileListStrategy implements ShowIdentificationStrategy {
  name = "audio-tracklist";
  description = "Match track names against known setlists";
  requiresExtraction = true;
  requiresLLM = false;
  requiresWebSearch = false;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    if (!context.audioFiles || context.audioFiles.length === 0) {
      return null;
    }

    // Extract track titles from filenames or metadata
    const trackTitles = context.audioFiles
      .map(f => f.title || extractTitleFromFilename(f.filePath))
      .filter(Boolean);

    if (trackTitles.length < 3) {
      return null; // Not enough tracks
    }

    // If we have artist from filename, search for matching setlists
    // (This would integrate with setlist APIs)

    return {
      showInfo: {
        // Partial info derived from track matching
      },
      confidence: 60,
      source: this.name,
      evidence: [
        `Analyzed ${trackTitles.length} track names`,
        `Track examples: ${trackTitles.slice(0, 3).join(', ')}`,
      ],
    };
  }
}
```

### 4. WebSearchFilenameStrategy
**Description**: Search web with filename-derived info
**Requires**: Web search
**Confidence**: 65-85 (depending on result quality)

```typescript
class WebSearchFilenameStrategy implements ShowIdentificationStrategy {
  name = "web-search-filename";
  description = "Search web using filename information";
  requiresExtraction = false;
  requiresLLM = false;
  requiresWebSearch = true;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    if (!context.webSearchService) {
      return null;
    }

    // Parse filename first
    const parsed = parseZipFilename(context.filename);

    if (!parsed.artist) {
      return null; // Need at least artist
    }

    // Construct search query
    const query = buildSearchQuery(parsed);

    const searchResults = await context.webSearchService.search(query, {
      count: 10,
    });

    if (searchResults.results.length === 0) {
      return null;
    }

    // Analyze top results for concert info
    const extracted = extractFromSearchResults(searchResults.results);

    if (!extracted) {
      return null;
    }

    return {
      showInfo: extracted,
      confidence: 75,
      source: this.name,
      evidence: [
        `Search query: "${query}"`,
        `Found ${searchResults.results.length} results`,
        `Top result: ${searchResults.results[0].title}`,
      ],
    };
  }
}
```

### 5. WebSearchLLMStrategy
**Description**: Search web, analyze results with LLM
**Requires**: Web search, LLM
**Confidence**: 80-95 (high quality combined approach)

```typescript
class WebSearchLLMStrategy implements ShowIdentificationStrategy {
  name = "web-search-llm";
  description = "Search web and analyze results with LLM";
  requiresExtraction = false;
  requiresLLM = true;
  requiresWebSearch = true;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    if (!context.webSearchService || !context.llmService) {
      return null;
    }

    const parsed = parseZipFilename(context.filename);

    // Build comprehensive search query
    const query = buildSearchQuery(parsed);

    const searchResults = await context.webSearchService.search(query, {
      count: 10,
    });

    if (searchResults.results.length === 0) {
      return null;
    }

    // Format results for LLM
    const searchContext = context.webSearchService.formatResultsForLLM(
      searchResults,
      10
    );

    // Ask LLM to analyze
    const llmPrompt = `
Based on these web search results, identify the concert date and venue.

Filename: ${context.filename}

${searchContext}

Return the concert information with your confidence level (0-100).
`;

    const result = await context.llmService.extractDate(llmPrompt, {});

    if (!result.date) {
      return null;
    }

    return {
      showInfo: {
        date: result.date,
        venue: result.venue,
        city: result.city,
        state: result.state,
      },
      confidence: Math.min(result.confidence + 10, 95), // Boost for web confirmation
      source: this.name,
      evidence: [
        `Web search: "${query}"`,
        `Analyzed ${searchResults.results.length} search results`,
        result.reasoning,
      ],
      reasoning: result.reasoning,
    };
  }
}
```

### 6. LocationWebSearchStrategy
**Description**: Extract location from filename, search for shows
**Requires**: Web search
**Confidence**: 70-85

```typescript
class LocationWebSearchStrategy implements ShowIdentificationStrategy {
  name = "location-web-search";
  description = "Extract location, search for shows in that area";
  requiresExtraction = false;
  requiresLLM = false;
  requiresWebSearch = true;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    if (!context.webSearchService) {
      return null;
    }

    const location = parseLocation(context.filename);
    const parsed = parseZipFilename(context.filename);

    if (!location.city && !location.venue) {
      return null;
    }

    if (!parsed.artist) {
      return null;
    }

    // Search for shows in that location
    const results = await context.webSearchService.searchConcert(
      parsed.artist,
      location.city || location.venue!,
      parsed.date?.substring(0, 4) // Year if available
    );

    // Analyze results...

    return {
      showInfo: {
        // Extracted from search
      },
      confidence: 75,
      source: this.name,
      evidence: [
        `Location: ${location.city || location.venue}`,
        `Found ${results.results.length} search results`,
      ],
    };
  }
}
```

## Orchestration

### Strategy Orchestrator

```typescript
class ShowIdentificationOrchestrator {
  private strategies: ShowIdentificationStrategy[] = [];

  constructor(config: Config) {
    // Register strategies based on config
    this.strategies.push(new FilenameStrategy());

    if (config.llm?.enabled) {
      this.strategies.push(new TextFileStrategy());
      this.strategies.push(new WebSearchLLMStrategy());
    }

    if (config.webSearch?.enabled) {
      this.strategies.push(new WebSearchFilenameStrategy());
      this.strategies.push(new LocationWebSearchStrategy());
    }
  }

  /**
   * Run all applicable strategies and return results sorted by confidence.
   */
  async identifyShow(
    archivePath: string,
    config: Config,
    llmService?: LLMService,
    webSearchService?: WebSearchService
  ): Promise<ShowIdentificationResult[]> {
    const filename = path.basename(archivePath);

    // Build context
    const context: IdentificationContext = {
      archivePath,
      filename,
      config,
      llmService,
      webSearchService,
    };

    // Determine if we need to extract archive
    const needsExtraction = this.strategies.some(s => s.requiresExtraction);

    if (needsExtraction) {
      const extractedDir = await extractArchive(archivePath, config);
      context.extractedDir = extractedDir;
      context.textFiles = await readTextFiles(extractedDir);
      context.audioFiles = await listAudioFiles(extractedDir);
    }

    // Run strategies in parallel
    const results = await Promise.all(
      this.strategies.map(strategy =>
        this.runStrategy(strategy, context)
      )
    );

    // Filter out nulls, sort by confidence
    const validResults = results
      .filter((r): r is ShowIdentificationResult => r !== null)
      .sort((a, b) => b.confidence - a.confidence);

    // Deduplicate and consolidate similar results
    return this.consolidateResults(validResults);
  }

  private async runStrategy(
    strategy: ShowIdentificationStrategy,
    context: IdentificationContext
  ): Promise<ShowIdentificationResult | null> {
    try {
      // Check if dependencies are met
      if (strategy.requiresLLM && !context.llmService) return null;
      if (strategy.requiresWebSearch && !context.webSearchService) return null;
      if (strategy.requiresExtraction && !context.extractedDir) return null;

      return await strategy.identify(context);
    } catch (error) {
      console.warn(`Strategy ${strategy.name} failed:`, error);
      return null;
    }
  }

  /**
   * Consolidate results that identify the same show.
   */
  private consolidateResults(
    results: ShowIdentificationResult[]
  ): ShowIdentificationResult[] {
    const consolidated: ShowIdentificationResult[] = [];

    for (const result of results) {
      // Check if we already have a very similar result
      const similar = consolidated.find(r =>
        this.areResultsSimilar(r, result)
      );

      if (similar) {
        // Merge evidence and boost confidence
        similar.evidence.push(...result.evidence);
        similar.confidence = Math.min(
          (similar.confidence + result.confidence) / 2 + 10,
          100
        );
        similar.source += ` + ${result.source}`;
      } else {
        consolidated.push(result);
      }
    }

    return consolidated.sort((a, b) => b.confidence - a.confidence);
  }

  private areResultsSimilar(
    a: ShowIdentificationResult,
    b: ShowIdentificationResult
  ): boolean {
    // Same date and artist = similar
    if (a.showInfo.date && b.showInfo.date && a.showInfo.artist && b.showInfo.artist) {
      return (
        a.showInfo.date === b.showInfo.date &&
        a.showInfo.artist === b.showInfo.artist
      );
    }
    return false;
  }
}
```

## User Interaction

### Present Results to User

```typescript
async function presentIdentificationResults(
  results: ShowIdentificationResult[],
  archivePath: string
): Promise<ShowInfo | undefined> {
  if (results.length === 0) {
    console.log("No identification strategies found a match.");
    return undefined;
  }

  console.log(`\nFound ${results.length} possible identification(s) for:`);
  console.log(`  ${path.basename(archivePath)}\n`);

  // Show top 5 results
  results.slice(0, 5).forEach((result, i) => {
    console.log(`${i + 1}. [${result.confidence}% confident] ${formatShowInfo(result.showInfo)}`);
    console.log(`   Source: ${result.source}`);
    console.log(`   Evidence:`);
    result.evidence.forEach(e => console.log(`     - ${e}`));
    if (result.reasoning) {
      console.log(`   Reasoning: ${result.reasoning}`);
    }
    console.log('');
  });

  // Auto-select if very high confidence
  if (results[0].confidence >= 95 && isCompleteShowInfo(results[0].showInfo)) {
    console.log(`\nAuto-selecting highest confidence result (${results[0].confidence}%)`);
    return fillShowInfo(results[0].showInfo);
  }

  // Otherwise, ask user
  const rl = readline.createInterface({ input: stdin, output: stdout });

  while (true) {
    const answer = await rl.question(
      `\nSelect a result [1-${results.length}], 'm' for manual entry, or 'n' to skip: `
    );

    if (answer === 'n') {
      rl.close();
      return undefined;
    }

    if (answer === 'm') {
      rl.close();
      return await promptForManualEntry();
    }

    const num = parseInt(answer, 10);
    if (num >= 1 && num <= results.length) {
      rl.close();
      const selected = results[num - 1];
      return fillShowInfo(selected.showInfo);
    }

    console.log(`Invalid selection. Please choose 1-${results.length}, 'm', or 'n'.`);
  }
}
```

## Confidence Scoring Guidelines

### Confidence Ranges

| Range | Interpretation | Action |
|-------|----------------|--------|
| 95-100 | Very high confidence | Auto-select if complete info |
| 85-94 | High confidence | Recommend to user |
| 70-84 | Medium confidence | Present as option |
| 50-69 | Low confidence | Present but mark uncertain |
| 0-49 | Very low confidence | Don't present to user |

### Factors that Increase Confidence

1. **Multiple confirming sources** (+10-20 per confirmation)
2. **Complete information** (has date, venue, city, state) (+10)
3. **Structured date format** (YYYY-MM-DD) (+10)
4. **LLM expresses high confidence** (use LLM's score)
5. **Web search finds exact match** (e.g., setlist.fm link) (+15)
6. **Pattern matches known format** (e.g., artist_date_venue) (+10)

### Factors that Decrease Confidence

1. **Incomplete information** (missing key fields) (-20)
2. **Date format ambiguous** (e.g., "summer 1994") (-15)
3. **Conflicting information between sources** (-30)
4. **LLM expresses uncertainty** (use LLM's score)
5. **No web results found** (-10)

## Implementation Plan

### Phase 1: Core Infrastructure
- [ ] Create `src/identification/` module
- [ ] Define interfaces (strategy, result, context)
- [ ] Implement `ShowIdentificationOrchestrator`
- [ ] Create base strategy class

### Phase 2: Basic Strategies
- [ ] Implement `FilenameStrategy`
- [ ] Implement `TextFileStrategy`
- [ ] Implement `WebSearchFilenameStrategy`

### Phase 3: Advanced Strategies
- [ ] Implement `WebSearchLLMStrategy`
- [ ] Implement `LocationWebSearchStrategy`
- [ ] Implement `AudioFileListStrategy`

### Phase 4: Integration
- [ ] Integrate into main workflow
- [ ] Add user prompt for results
- [ ] Add confidence-based auto-selection
- [ ] Update tests

### Phase 5: Enhancement
- [ ] Add result caching
- [ ] Add strategy performance metrics
- [ ] Allow users to configure strategy order
- [ ] Add custom strategies via plugins

## Benefits

1. **Modularity**: Easy to add new identification methods
2. **Transparency**: User sees why each result was suggested
3. **Flexibility**: Strategies can be enabled/disabled based on config
4. **Accuracy**: Multiple strategies increase chance of correct ID
5. **User Control**: User chooses final result with full context
6. **Confidence**: Quantified uncertainty helps user decide

## Example Flow

```
Archive: Morphine_2011-03-09_SBD_RichardBurton.zip

Running identification strategies...

Results:
1. [85% confident] Morphine - 1994-11-05 - Saint Andrew's Hall, Detroit, MI
   Source: web-search-llm
   Evidence:
     - Web search: "Morphine band Detroit concert setlist"
     - Analyzed 10 search results
     - Found setlist.fm match for 1994-11-05
     - LLM reasoning: "The 2011 date in filename is impossible as Morphine
       disbanded in 1999. Found Detroit show from 1994 which matches location."

2. [60% confident] Morphine - 2011-03-09 - Unknown Venue
   Source: filename-parser
   Evidence:
     - Filename pattern: Morphine_2011-03-09_SBD_RichardBurton.zip
     - Extracted artist: Morphine
     - Extracted date: 2011-03-09

Select a result [1-2], 'm' for manual entry, or 'n' to skip: 1

✓ Using: Morphine - 1994-11-05 - Saint Andrew's Hall, Detroit, MI
```

## Future Enhancements

- **Strategy learning**: Track which strategies work best per band
- **Community strategies**: Share custom strategies
- **Interactive refinement**: User provides hints, strategies re-run
- **Batch mode confidence threshold**: Auto-skip low confidence in batch mode
- **Strategy combinations**: Meta-strategies that combine results
