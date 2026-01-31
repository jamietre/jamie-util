# TODO List

## Features

### High Priority

- [ ] **Modular Show Identification System** (NEW ARCHITECTURE)
  - [ ] Design: Strategy pattern with confidence scoring (see `docs/show-identification-design.md`)
  - [ ] Phase 1: Core infrastructure (`src/identification/` module)
  - [ ] Phase 2: Basic strategies (Filename, TextFile, WebSearch)
  - [ ] Phase 3: Advanced strategies (WebSearchLLM, Location, AudioTracklist)
  - [ ] Phase 4: Integration into main workflow
  - [ ] Phase 5: User interface for selecting from ranked results

- [x] ~~Interactive show picker~~ → SUPERSEDED by modular identification system
- [ ] Handle incomplete shows (e.g., one set) - Match by track names if count doesn't match exactly
- [x] ~~Debug mode with curl logging~~ (Completed)
- [x] ~~LLM integration for date extraction and setlist mismatch analysis~~ (Completed)
- [x] ~~Web search integration~~ (Completed - Serper.dev)

### Medium Priority

- [ ] When entering a previously unknown band, add config for it automatically
- [ ] Preprocess archive by extracting text/markdown files and try to identify artist using regex pattern matching
- [ ] Add code using callback/plugin pattern to parse artist & date from filenames
- [ ] Allow choosing an image; resize to 400x400 and save as "cover.jpg"

### Low Priority

- [ ] Support for vision models (analyze scanned setlists, ticket stubs) - LLM enhancement
- [ ] Multi-language support for international shows - LLM enhancement
- [ ] Setlist prediction when API unavailable - LLM enhancement
- [ ] Interactive chat mode for complex cases - LLM enhancement

## Refactoring & Code Quality

### Architecture Improvements

- [ ] **Refactor `ingest-music.ts` (899 lines)** - Too large, mixed concerns
  - [ ] Extract user interaction functions to `src/ui/prompts.ts`
  - [ ] Extract workflow orchestration to separate functions
  - [ ] Move business logic to domain modules
  - [ ] Keep main file focused on high-level flow only

- [ ] **Split `setlist.ts` into provider modules**
  - [ ] Create `src/setlist/providers/setlistfm.ts`
  - [ ] Create `src/setlist/providers/phishnet.ts`
  - [ ] Create `src/setlist/providers/kglw.ts`
  - [ ] Create `src/setlist/types.ts` for shared types
  - [ ] Create provider interface (similar to LLM providers)

### Modularity & Decoupling

- [ ] **Separate search/disambiguation logic**
  - [ ] Create `src/setlist/search.ts` - Pure search functions
  - [ ] Create `src/setlist/disambiguation.ts` - User interaction for show selection
  - [ ] Make testable without mocking CLI prompts

- [ ] **Extract location parsing**
  - [ ] Enhance `src/matching/parse-filename.ts` to extract city/venue
  - [ ] Create reusable location parsing utilities
  - [ ] Support multiple filename patterns

### Testing

- [ ] Add unit tests for setlist search functions
- [ ] Add unit tests for location parsing
- [ ] Add integration tests for show disambiguation flow
- [ ] Add tests for LLM provider integrations
- [ ] Mock API responses for setlist provider tests

## Documentation

- [ ] Add JSDoc comments to public APIs
- [ ] Document provider interfaces
- [ ] Add architecture decision records (ADR) for major patterns
- [ ] Create contributing guide
- [ ] Document testing strategy

## Performance

- [ ] Add caching for setlist API responses
- [ ] Optimize archive extraction for large files
- [ ] Profile and optimize audio analysis
- [ ] Consider parallelizing track matching

## User Experience

- [ ] Better error messages with actionable suggestions
- [ ] Progress indicators for long operations
- [ ] Color-coded output for better readability
- [ ] Summary statistics at the end of batch processing
- [ ] Dry-run mode should show more details about what would happen

## Modular Show Identification System

### Architecture

See `docs/show-identification-design.md` for full design.

**Core Concept**: Strategy pattern where each identification method is a self-contained strategy that returns results with confidence scores. Multiple strategies run and results are ranked for user selection.

### Identification Strategies

1. **FilenameStrategy** - Parse structured info from filename (60-90% confidence)
2. **TextFileStrategy** - Extract text files, analyze with LLM (70-95% confidence)
3. **AudioFileListStrategy** - Match track names against setlists (50-80% confidence)
4. **WebSearchFilenameStrategy** - Search web with filename info (65-85% confidence)
5. **WebSearchLLMStrategy** - Search web + LLM analysis (80-95% confidence)
6. **LocationWebSearchStrategy** - Extract location, search for shows (70-85% confidence)
7. **MetadataStrategy** - Check audio file metadata (60-85% confidence)

### Implementation Phases

**Phase 1: Core Infrastructure**
- [ ] Create `src/identification/types.ts` - Interfaces for strategy, result, context
- [ ] Create `src/identification/orchestrator.ts` - Main orchestrator class
- [ ] Create `src/identification/base-strategy.ts` - Abstract base class
- [ ] Create `src/identification/index.ts` - Public exports

**Phase 2: Basic Strategies**
- [ ] `src/identification/strategies/filename.ts`
- [ ] `src/identification/strategies/text-file.ts`
- [ ] `src/identification/strategies/web-search-filename.ts`

**Phase 3: Advanced Strategies**
- [ ] `src/identification/strategies/web-search-llm.ts`
- [ ] `src/identification/strategies/location-search.ts`
- [ ] `src/identification/strategies/audio-tracklist.ts`
- [ ] `src/identification/strategies/metadata.ts`

**Phase 4: Integration**
- [ ] Replace manual date prompting with orchestrator
- [ ] Add UI for presenting ranked results
- [ ] Add confidence-based auto-selection (95%+ → auto-select)
- [ ] Add manual entry fallback
- [ ] Update dry-run mode to show all strategies

**Phase 5: Enhancement**
- [ ] Add result caching to avoid re-running strategies
- [ ] Add strategy performance metrics
- [ ] Allow configuration of strategy order/priority
- [ ] Add ability to disable specific strategies
- [ ] Strategy combination/meta-strategies

### Benefits

- **Modularity**: Easy to add new identification methods
- **Transparency**: User sees evidence for each result
- **Flexibility**: Strategies enabled/disabled based on config
- **Accuracy**: Multiple strategies increase success rate
- **User Control**: User chooses from ranked options
- **Confidence Scoring**: Quantified uncertainty

## Completed

- [x] FLAC conversion for non-FLAC files
- [x] Track splitting with `--split`
- [x] Track merging with `--merge`
- [x] Natural number sorting for track filenames
- [x] Phish country handling
- [x] URL download support with `--url`
- [x] Debug mode with `--debug` flag
- [x] LLM integration foundation (Phase 1)
- [x] LLM date extraction (Phase 2)
- [x] LLM setlist mismatch analysis (Phase 2)

## Notes

### Modularity Principles

When adding new features, follow these principles:

1. **Single Responsibility** - Each module/file should have one clear purpose
2. **Decoupling** - Minimize dependencies between modules
3. **Testability** - Design for easy unit testing without complex mocks
4. **Provider Pattern** - Use interfaces for swappable implementations (like LLM providers)
5. **Pure Functions** - Prefer pure functions for business logic (easier to test)

### Code Organization

```
src/
├── audio/           # Audio processing (well-modularized)
├── config/          # Configuration (well-modularized)
├── llm/             # LLM integration (well-modularized) ✅
├── matching/        # Track matching (could be improved)
├── output/          # Tagging and templating (good)
├── setlist/         # Setlist fetching (needs refactoring) ⚠️
├── ui/              # User interaction (should be created) 🆕
├── utils/           # Utilities (good)
├── index.ts         # CLI entry point (good)
└── ingest-music.ts  # Main orchestrator (needs refactoring) ⚠️
```

### Anti-Patterns to Avoid

- ❌ Mixing business logic with UI/prompting
- ❌ Large files (>500 lines) with multiple responsibilities
- ❌ Hard-to-test code that requires mocking CLI input
- ❌ Tight coupling between unrelated modules
- ❌ Monolithic files that do "everything"
