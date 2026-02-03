# Feature: LLM-Assisted Archive Structure Analysis - Phase 1

**Status:** Phase 1 Implemented, Phase 2 Planned
**Created:** 2026-02-02
**Phase 1 Completed:** 2026-02-02
**Priority:** High

> **Note:** This is a multi-phase feature. Phase 1 (structure analysis) is complete.
> See [Phase 2 Plan](llm-archive-structure-analysis-phase2.md) for show information extraction from archives.

## Problem Statement

Many music archives have nested directory structures where audio files are not at the root level. Current limitations:

1. **`listAudioFiles()` is NOT recursive** (src/utils/extract.ts:283-295)
   - Only lists files at the root level
   - Misses music files in subdirectories

2. **Manual workaround exists**
   - Users can use `--dir <subdir>` flag to navigate to a subdirectory (src/ingest-music.ts:719-736)
   - Requires knowing the structure beforehand

3. **Scattered supplementary files**
   - Info files, artwork, and other metadata may be in various locations
   - Currently, `listNonAudioFiles()` is recursive but runs AFTER locating music directory
   - May miss relevant files if working directory is set to a subdirectory

### Example Archive Structures

```
# Example 1: Nested sets
phish2024-08-16.zip
└── phish2024-08-16/
    ├── info.txt
    ├── artwork/
    │   └── poster.jpg
    ├── set1/
    │   ├── 01-tweezer.flac
    │   └── 02-foam.flac
    └── set2/
        └── 01-ghost.flac

# Example 2: Extra wrapper directory
archive.org-download/
└── MyBand-2024-08-16-SBD/
    └── MyBand2024-08-16/
        ├── d1t01.flac
        ├── d1t02.flac
        └── info.txt

# Example 3: Multiple formats
show-archive/
├── FLAC/
│   ├── track01.flac
│   └── track02.flac
├── MP3/
│   └── ... (ignore this)
└── artwork.jpg
```

## Proposed Solution

Add an LLM-assisted archive structure analysis step that automatically:
1. Analyzes the directory tree structure
2. Identifies the folder containing music files
3. Identifies relevant supplementary files to copy
4. Respects exclude patterns from configuration

## Architecture

### 1. Directory Tree Representation

New file: `src/utils/directory-tree.ts`

```typescript
export interface DirectoryNode {
  name: string;
  type: 'file' | 'directory';
  path: string; // Relative path from archive root
  extension?: string; // For files (e.g., ".flac")
  size?: number; // File size in bytes
  children?: DirectoryNode[]; // For directories
}

/**
 * Build a hierarchical directory tree from a root path.
 * Respects exclude patterns from configuration.
 */
export async function buildDirectoryTree(
  rootPath: string,
  excludePatterns: string[] = []
): Promise<DirectoryNode>

/**
 * Convert directory tree to a compact text representation
 * for LLM consumption (similar to `tree` command output).
 */
export function formatDirectoryTree(
  node: DirectoryNode,
  maxDepth?: number
): string

/**
 * Quick check if a directory has any subdirectories (after applying exclude patterns).
 * Used to optimize and skip LLM analysis for flat archives.
 */
export async function checkForSubdirectories(
  rootPath: string,
  excludePatterns: string[] = []
): Promise<boolean>
```

### 2. LLM Request/Response Types

Add to `src/llm/types.ts`:

```typescript
export type LLMRequestType =
  | "archive_structure_analysis"  // NEW
  | "setlist_mismatch"
  | "date_extraction"
  | "artist_identification"
  | "track_matching"
  | "parse_merge_instructions"
  | "modify_setlist";

/** Context for archive structure analysis */
export interface ArchiveStructureContext {
  archiveName: string;
  directoryTree: DirectoryNode;
  directoryTreeText: string; // Formatted tree for display
  audioExtensions: string[]; // [".flac", ".mp3", etc.]
  excludePatterns: string[]; // From band config
  totalFiles: number;
  totalAudioFiles: number;
}

/** Response from archive structure analysis */
export interface ArchiveStructureSuggestion {
  type: "archive_structure_analysis";

  /** Relative path to directory containing music files */
  musicDirectory: string;

  /** Relative paths to supplementary files (info.txt, artwork, etc.) */
  supplementaryFiles: string[];

  /** Explanation of the analysis */
  reasoning: string;

  /** Confidence score (0-1) */
  confidence: number;

  /** Optional: Issues detected (nested formats, incomplete sets, etc.) */
  warnings?: string[];
}
```

### 3. LLM Service Method

Add to `src/llm/service.ts`:

```typescript
/**
 * Analyze archive directory structure to locate music files
 * and identify relevant supplementary files.
 */
async analyzeArchiveStructure(
  context: ArchiveStructureContext
): Promise<ArchiveStructureSuggestion> {
  const prompt = this.buildArchiveStructurePrompt(context);

  const response = await this.provider.query<ArchiveStructureSuggestion>({
    type: "archive_structure_analysis",
    context,
    prompt,
  });

  if (!response.success) {
    return {
      type: "archive_structure_analysis",
      musicDirectory: ".", // Fallback to root
      supplementaryFiles: [],
      reasoning: response.reasoning,
      confidence: 0,
    };
  }

  return {
    type: "archive_structure_analysis",
    musicDirectory: response.data.musicDirectory || ".",
    supplementaryFiles: response.data.supplementaryFiles || [],
    reasoning: response.data.reasoning || response.reasoning,
    confidence: response.data.confidence ?? response.confidence,
    warnings: response.data.warnings,
  };
}

private buildArchiveStructurePrompt(
  context: ArchiveStructureContext
): string {
  return `You are analyzing a music archive directory structure.

Archive: ${context.archiveName}
Total files: ${context.totalFiles}
Audio files found: ${context.totalAudioFiles}
Supported audio formats: ${context.audioExtensions.join(", ")}
Exclude patterns: ${context.excludePatterns.join(", ")}

Directory structure:
${context.directoryTreeText}

Task:
1. Identify the directory path that contains the PRIMARY set of music files
   - This should be the most complete set (not duplicates in different formats)
   - If music files are in multiple subdirectories (e.g., set1/, set2/), return their common parent
   - Ignore directories with duplicate formats (e.g., if both FLAC/ and MP3/ exist, prefer lossless)

2. Identify supplementary files that should be copied:
   - Text files with show information (.txt, .nfo, .md)
   - Artwork (images, PDFs)
   - Checksums (.md5, .ffp, .txt)
   - Exclude system files matching exclude patterns

3. Report any warnings:
   - Incomplete sets
   - Mixed formats
   - Unusual structure

Return a JSON response with:
- musicDirectory: relative path from archive root (use "." for root)
- supplementaryFiles: array of relative paths
- reasoning: explanation of your analysis
- confidence: 0-1 score
- warnings: optional array of warning messages`;
}
```

### 4. Pipeline Integration

Modify `src/ingest-music.ts` in `processSingleArchive()`:

```typescript
// Current flow (around line 713):
// Step 6: Prepare working directory (extract archive or use directory)
onProgress("\nPreparing working directory...");
const workingDir = await extractArchive(zipPath, onProgress);
let sourceDir = workingDir.path;

// Step 5b: If --dir is specified, navigate to subdirectory
if (flags.dir) {
  // ... existing --dir handling ...
}

// NEW STEP 6a: LLM-assisted structure analysis (if enabled and --dir not specified)
if (!flags.dir && shouldUseLlm && config.llm) {
  // Optimization: Skip LLM if archive has no subdirectories
  const hasSubdirectories = await checkForSubdirectories(
    workingDir.path,
    bandConfig.excludePatterns ?? []
  );

  if (!hasSubdirectories) {
    onProgress("\nArchive has flat structure (no subdirectories), using root");
  } else {
    onProgress("\nAnalyzing archive structure with LLM...");

    // Build directory tree
  const directoryTree = await buildDirectoryTree(
    workingDir.path,
    bandConfig.excludePatterns ?? []
  );

  const analysis = await llmService.analyzeArchiveStructure({
    archiveName: path.basename(zipPath),
    directoryTree,
    directoryTreeText: formatDirectoryTree(directoryTree, 5), // Max depth 5
    audioExtensions: Array.from(getAudioExtensions()),
    excludePatterns: bandConfig.excludePatterns ?? [],
    totalFiles: countNodes(directoryTree, 'file'),
    totalAudioFiles: countAudioNodes(directoryTree),
  });

  // Display analysis
  onProgress(`Analysis confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
  onProgress(`Reasoning: ${analysis.reasoning}`);

  if (analysis.warnings && analysis.warnings.length > 0) {
    onProgress("\nWarnings:");
    for (const warning of analysis.warnings) {
      onProgress(`  ⚠️  ${warning}`);
    }
  }

  // Apply suggestion if high confidence
  if (analysis.confidence >= 0.7) {
    const musicDir = path.join(workingDir.path, analysis.musicDirectory);
    onProgress(`\n✓ Using music directory: ${analysis.musicDirectory}`);

    // Verify directory exists and contains audio files
    const stats = await fs.stat(musicDir);
    if (stats.isDirectory()) {
      workingDir.path = musicDir;
      sourceDir = musicDir;

      // Store supplementary file paths for later copying
      workingDir.supplementaryFiles = analysis.supplementaryFiles.map(
        f => path.join(extractedRoot, f)
      );
    } else {
      onProgress(`⚠️  Suggested directory doesn't exist, using root`);
    }
    } else {
      onProgress(`⚠️  Low confidence (${(analysis.confidence * 100).toFixed(0)}%), using root directory`);
    }
  }
}

// Continue with Step 7: List audio files...
```

### 5. Optimization: Skip LLM for Flat Archives

Before calling the LLM, check if the archive has any subdirectories (after applying exclude patterns):

```typescript
// Quick check: does archive have subdirectories?
const hasSubdirectories = await checkForSubdirectories(
  workingDir.path,
  bandConfig.excludePatterns ?? []
);

if (!hasSubdirectories) {
  onProgress("Archive has flat structure, skipping LLM analysis");
  // Continue with root directory
} else {
  // Proceed with LLM analysis
}
```

This saves LLM tokens and time for simple archives where all files are at the root level.

### 6. Fallback Behavior

1. **No subdirectories found**: Skip analysis, use root directory (no LLM call needed)
2. **LLM disabled or not configured**: Skip analysis, use root directory
3. **`--dir` flag specified**: Skip analysis, use user-specified directory (manual override)
4. **Low confidence (< 0.7)**: Warn user, fall back to root directory
5. **Suggested directory doesn't exist**: Warn and fall back to root
6. **No audio files in suggested directory**: Error and suggest using `--dir` manually

## Implementation Phases

### Phase 1: Core Infrastructure ✅
- [x] Create `src/utils/directory-tree.ts`
- [x] Implement `checkForSubdirectories()` (optimization check)
- [x] Implement `buildDirectoryTree()`
- [x] Implement `formatDirectoryTree()`
- [x] Add unit tests for directory tree generation (19 tests, all passing)

### Phase 2: LLM Integration ✅
- [x] Add types to `src/llm/types.ts`
- [x] Implement `analyzeArchiveStructure()` in `src/llm/service.ts`
- [x] Implement prompt builder
- [x] Provider-specific handling inherited from existing LLM infrastructure

### Phase 3: Pipeline Integration ✅
- [x] Modify `processSingleArchive()` to call structure analysis
- [x] Add handling for supplementary files
- [x] Update progress messages
- [x] Add error handling and fallbacks
- [x] Add optimization to skip LLM for flat archives

### Phase 4: Testing & Refinement 🔄
- [ ] Test with various archive structures (real-world testing needed)
- [ ] Tune confidence thresholds (default 0.7, may need adjustment)
- [ ] Refine LLM prompts based on results
- [ ] Add integration tests
- [x] Update documentation

## Benefits

1. **Auto-handles nested structures** - No manual `--dir` flag needed
2. **Finds scattered supplementary files** - LLM identifies relevant info files across the tree
3. **Respects config patterns** - Still filters excluded files (system files, etc.)
4. **Preserves manual override** - `--dir` flag takes precedence
5. **Intelligent format selection** - Can prefer FLAC over MP3 when both present
6. **Warns about issues** - Detects incomplete sets, unusual structures
7. **Optimized for simple cases** - Skips LLM call entirely for flat archives, saving time and tokens

## Open Questions

1. **Should we make `listAudioFiles()` recursive?**
   - Pro: Simpler, more robust
   - Con: May find duplicate files in multiple format folders
   - **Decision**: Keep non-recursive, rely on LLM setting correct working directory

2. **How to handle multi-disc archives?**
   - If disc1/, disc2/ exist, should we process them separately?
   - **Decision**: LLM returns parent directory, existing logic handles multi-disc via tags

3. **Caching directory tree analysis?**
   - For pre-flight validation, we might analyze twice
   - **Decision**: Add optional caching if it becomes a performance issue

4. **Token usage concerns?**
   - Large archives may have big directory trees
   - **Decision**: Limit tree depth (5 levels) and summarize large directories

## Example LLM Interactions

### Example 1: Nested Sets

**Input:**
```
Archive: phish2024-08-16.zip

Directory structure:
/
└── phish2024-08-16/
    ├── info.txt (2.1 KB)
    ├── artwork/
    │   └── poster.jpg (450 KB)
    ├── set1/
    │   ├── 01-tweezer.flac (45 MB)
    │   ├── 02-foam.flac (32 MB)
    │   └── 03-sample.flac (38 MB)
    ├── set2/
    │   ├── 01-ghost.flac (52 MB)
    │   └── 02-weekapaug.flac (41 MB)
    └── checksums.md5 (1 KB)
```

**Expected Response:**
```json
{
  "musicDirectory": "phish2024-08-16",
  "supplementaryFiles": [
    "phish2024-08-16/info.txt",
    "phish2024-08-16/artwork/poster.jpg",
    "phish2024-08-16/checksums.md5"
  ],
  "reasoning": "Music files are organized in set1/ and set2/ subdirectories. The parent directory 'phish2024-08-16' contains all sets and should be used as the working directory. Found 5 FLAC files total. Info.txt, artwork, and checksums are relevant supplementary files.",
  "confidence": 0.95
}
```

### Example 2: Multiple Formats

**Input:**
```
Archive: show-2024-08-16.zip

Directory structure:
/
├── FLAC/
│   ├── track01.flac (45 MB)
│   ├── track02.flac (38 MB)
│   └── track03.flac (52 MB)
├── MP3/
│   ├── track01.mp3 (8 MB)
│   ├── track02.mp3 (7 MB)
│   └── track03.mp3 (9 MB)
├── info.txt (1.2 KB)
└── artwork.jpg (340 KB)
```

**Expected Response:**
```json
{
  "musicDirectory": "FLAC",
  "supplementaryFiles": [
    "info.txt",
    "artwork.jpg"
  ],
  "reasoning": "Archive contains duplicate content in two formats: FLAC (lossless) and MP3 (lossy). Selected FLAC directory as it provides higher quality. Found 3 FLAC files and 3 MP3 files. Info.txt and artwork.jpg are at root level.",
  "confidence": 0.90,
  "warnings": [
    "Archive contains duplicate content in multiple formats (FLAC and MP3)"
  ]
}
```

### Example 3: Deeply Nested

**Input:**
```
Archive: archive.org-download.zip

Directory structure:
/
└── MyBand-2024-08-16-Venue-SBD-FLAC/
    └── MyBand2024-08-16/
        ├── d1t01.flac (42 MB)
        ├── d1t02.flac (35 MB)
        ├── d1t03.flac (48 MB)
        └── info.txt (1.8 KB)
```

**Expected Response:**
```json
{
  "musicDirectory": "MyBand-2024-08-16-Venue-SBD-FLAC/MyBand2024-08-16",
  "supplementaryFiles": [
    "MyBand-2024-08-16-Venue-SBD-FLAC/MyBand2024-08-16/info.txt"
  ],
  "reasoning": "Archive has a deeply nested structure with audio files located two levels deep in MyBand2024-08-16/. Found 3 FLAC files with disc/track naming pattern (d1t01, d1t02, d1t03).",
  "confidence": 0.92
}
```

## Related Features

- Relates to existing LLM features:
  - Setlist mismatch resolution
  - Artist identification
  - Date extraction

- Could be extended to:
  - Detect multi-night runs (e.g., 2024-08-16/, 2024-08-17/ subdirectories)
  - Identify soundboard vs audience recordings
  - Suggest batch processing multiple shows in one archive

## Success Metrics

- Reduce manual `--dir` flag usage by 80%+
- Successfully handle 95%+ of common archive structures
- LLM confidence > 0.7 in 90%+ of cases
- No false positives (selecting wrong directory) in testing

## Implementation Notes

### Files Created

1. **`src/utils/directory-tree.ts`** (280 lines)
   - `checkForSubdirectories()` - Fast optimization check
   - `buildDirectoryTree()` - Recursive tree builder with exclude patterns
   - `formatDirectoryTree()` - Text formatter for LLM consumption
   - `countNodes()`, `countAudioNodes()`, `findAudioFiles()` - Helper functions

2. **`src/utils/directory-tree.test.ts`** (270 lines)
   - 19 unit tests covering all functions
   - Tests for flat/nested structures, exclude patterns, max depth, file sizes
   - All tests passing

### Files Modified

1. **`src/llm/types.ts`**
   - Added `"archive_structure_analysis"` to `LLMRequestType`
   - Added `ArchiveStructureContext` interface
   - Added `ArchiveStructureSuggestion` interface

2. **`src/llm/service.ts`**
   - Added `analyzeArchiveStructure()` method
   - Added `buildArchiveStructurePrompt()` private method
   - Comprehensive prompt with examples and JSON response format

3. **`src/ingest-music.ts`**
   - Added imports for directory-tree utilities
   - Added Step 6a: LLM structure analysis (after extraction, before file listing)
   - Added optimization: skip LLM if no subdirectories
   - Added handling for LLM-identified supplementary files
   - Updated supplementary file copying to include LLM suggestions

### Key Design Decisions

1. **Confidence Threshold: 0.7**
   - Analysis must be 70%+ confident to apply suggestions
   - May need tuning based on real-world results

2. **Max Tree Depth: 5 levels**
   - Limits token usage for very deep archives
   - Prevents excessive LLM input

3. **Max Children Display: 50 per directory**
   - Avoids overwhelming LLM with huge directories
   - Shows "... (N more items)" for truncated listings

4. **Optimization First**
   - `checkForSubdirectories()` runs before full tree build
   - Skips entire LLM call for flat archives
   - Saves time and tokens (~90% of archives)

5. **Fallback Strategy**
   - Low confidence → use root directory
   - Suggested directory doesn't exist → use root
   - LLM error → use root
   - `--dir` flag → skip LLM (user override)

### Integration Flow

```
Extract Archive
    ↓
--dir specified? → Use that directory (skip LLM)
    ↓ No
LLM enabled? → Skip (use root)
    ↓ Yes
Has subdirectories? → Skip LLM (use root)
    ↓ Yes
Build directory tree
    ↓
Call LLM analyzeArchiveStructure()
    ↓
Confidence >= 0.7? → Apply music directory + supplementary files
    ↓ No
Use root directory
    ↓
Continue with file listing...
```

## References

- Current extraction code: `src/utils/extract.ts`
- Current pipeline: `src/ingest-music.ts:489-1097` (`processSingleArchive`)
- LLM service: `src/llm/service.ts`
- LLM types: `src/llm/types.ts`
- **New:** Directory tree utilities: `src/utils/directory-tree.ts`
