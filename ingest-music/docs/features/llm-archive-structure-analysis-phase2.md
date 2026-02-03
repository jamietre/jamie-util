# Feature: LLM Archive Structure Analysis - Phase 2

**Status:** Planned
**Created:** 2026-02-02
**Phase 1 Completed:** 2026-02-02
**Priority:** High
**Depends On:** Phase 1 (Implemented)

## Overview

Phase 2 moves archive structure analysis to the **beginning** of the pipeline and extends it to extract show information (artist, date, venue) from directory structure and manifest files. This reduces manual user input and provides richer data for show identification.

## Problem Statement

### Current Issues (After Phase 1)

1. **Analysis happens too late** - Structure analysis occurs AFTER:
   - User is prompted for artist (if unknown from filename)
   - Show identification strategies run
   - Setlist is fetched

2. **Wasted information** - Rich data in archive structure is ignored:
   - Directory names like `"Trey Anastasio Band - 2025-11-30 - New York, NY [FLAC24]/"`
   - Info files like `info.txt`, `setlist.txt`, `notes.txt`
   - Filename patterns across multiple files

3. **Manual intervention required** - User must provide artist even when it's obvious from the archive structure

### Example Scenario

**Archive:** `Trey 11-30-2025.zip`

**Structure:**
```
Multiple files/
└── Trey Anastasio Band - 2025-11-30 - New York, NY [FLAC24]/
    ├── info.txt ("Trey Anastasio Band at Beacon Theatre, NYC...")
    ├── setlist.txt (complete setlist)
    ├── poster.jpg
    └── *.flac files
```

**Current Behavior:**
- Filename "Trey 11-30-2025.zip" doesn't match artist patterns
- User is prompted: "Select artist: 1. Phish, 2. Trey Anastasio Band..."
- Later, structure analysis finds the obvious information

**Desired Behavior:**
- Scan archive structure immediately
- LLM extracts from directory name: "Trey Anastasio Band - 2025-11-30 - New York"
- LLM identifies info.txt and setlist.txt
- Read those files for complete show information
- Auto-select artist, skip user prompt
- Potentially skip setlist API call if setlist.txt is complete

## Proposed Solution

### Two-Phase LLM Approach

#### Phase 1: Archive Structure Analysis (Enhanced)
**When:** Immediately after archive is available (scan or extract)
**Input:** Directory tree structure
**Analysis:**
1. Identify music directory (existing)
2. Identify supplementary files (existing)
3. **NEW:** Identify manifest files (info.txt, setlist.txt, notes.txt, etc.)
4. **NEW:** Extract show information from directory/file names
5. **NEW:** Assess if archive contains complete show data

**Output:**
```typescript
{
  musicDirectory: string;
  supplementaryFiles: string[];
  manifestFiles: {  // NEW
    infoFiles: string[];      // Text files with show info
    setlistFiles: string[];   // Files that might contain setlists
    artworkFiles: string[];   // Images, PDFs
  };
  showInfoHints: {  // NEW - extracted from structure
    artist?: string;
    date?: string;
    venue?: string;
    city?: string;
    state?: string;
    source: string;  // e.g., "directory name", "filename pattern"
  };
  hasCompleteSetlist: boolean;  // NEW
  confidence: number;
  warnings?: string[];
}
```

#### Phase 2: Show Information Extraction (New Strategy)
**When:** After structure analysis, before user prompts
**Input:**
- Directory tree structure
- Content of identified manifest files
- Filename patterns

**Analysis:**
1. Parse directory names for show info
2. Read and analyze manifest file contents
3. Cross-reference information sources
4. Extract structured show data
5. Optionally extract setlist from manifest

**Output:**
```typescript
{
  artist: string;
  date: string;  // YYYY-MM-DD
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  setlist?: Array<{  // If found in manifest
    title: string;
    set: number;
    position: number;
  }>;
  source: string;  // Which files/structure provided this
  confidence: number;
}
```

## Architecture Changes

### New Pipeline Flow

```
┌─────────────────────────────────────────────────┐
│ 1. EARLY ARCHIVE ANALYSIS (NEW)                │
├─────────────────────────────────────────────────┤
│ • Download archive (if --url specified)        │
│ • Scan archive manifest (ZIP) OR extract       │
│ • LLM Structure Analysis → Enhanced output     │
│   - Music directory                             │
│   - Manifest files                              │
│   - Show info hints from structure             │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 2. SHOW INFORMATION EXTRACTION (NEW)           │
├─────────────────────────────────────────────────┤
│ • Read identified manifest files                │
│ • LLM Show Info Extraction                     │
│   - Combine directory hints + file contents    │
│   - Extract artist, date, venue                │
│   - Extract setlist (if available)             │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 3. ARTIST RESOLUTION                           │
├─────────────────────────────────────────────────┤
│ • Try: CLI flags (--artist)                    │
│ • Try: Archive structure hints (NEW)           │
│ • Try: Filename parsing                        │
│ • Fallback: Prompt user (if needed)            │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 4. SHOW IDENTIFICATION                         │
├─────────────────────────────────────────────────┤
│ • Try: Archive structure extraction (NEW)      │
│ • Try: Existing strategies (filename, audio)   │
│ • Try: Web search                              │
│ • Fallback: Prompt user                        │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 5. SETLIST ACQUISITION                         │
├─────────────────────────────────────────────────┤
│ • Try: Extracted from manifest (NEW)           │
│ • Try: Fetch from API (phish.net, setlist.fm)  │
│ • Fallback: Manual entry or skip               │
└─────────────────────────────────────────────────┘
                      ↓
┌─────────────────────────────────────────────────┐
│ 6. CONTINUE WITH EXISTING PIPELINE             │
├─────────────────────────────────────────────────┤
│ • Pre-flight validation                        │
│ • Extract to working directory (if needed)     │
│ • List audio files                             │
│ • Match tracks to setlist                      │
│ • Tag and copy to library                      │
└─────────────────────────────────────────────────┘
```

### Key Changes

1. **Archive scanning happens first**
   - Before artist prompts
   - Before show identification strategies
   - Can use pre-flight scan for ZIP files (no extraction needed)

2. **Structure analysis is enhanced**
   - Identifies manifest files specifically
   - Extracts hints from directory/file names
   - Assesses completeness of archive data

3. **New identification strategy: ArchiveStructureStrategy**
   - Registered alongside existing strategies
   - High priority (runs first)
   - Uses manifest files + directory structure

4. **Setlist can come from archive**
   - If manifest contains complete setlist
   - Skip API call (faster, no rate limits)
   - Still validate against API if confidence is low

## Implementation Plan

### Step 1: Enhance Structure Analysis LLM Prompt

Update `buildArchiveStructurePrompt()` to:
- Identify manifest files by type
- Extract show information from directory/file names
- Assess if setlist is present in structure

**New prompt sections:**
```
IDENTIFY MANIFEST FILES:
- Info files: *.txt, *.nfo, *info*, *description*
- Setlist files: *setlist*, *tracklist*, *songs*
- Artwork: *.jpg, *.png, *.pdf (poster, artwork)

EXTRACT SHOW INFORMATION FROM STRUCTURE:
Analyze directory and file names for patterns:
- Artist name (e.g., "Trey Anastasio Band")
- Date (YYYY-MM-DD format)
- Venue name
- Location (city, state)
- Format indicators ([FLAC24], [SBD], etc.)

Example: "Trey Anastasio Band - 2025-11-30 - New York, NY [FLAC24]/"
Extract: { artist: "Trey Anastasio Band", date: "2025-11-30", city: "New York", state: "NY" }
```

### Step 2: Create Show Information Extraction Service

New file: `src/llm/show-info-extractor.ts`

```typescript
export interface ShowInfoExtractionContext {
  archiveName: string;
  directoryStructure: string;  // Tree view
  manifestFiles: Record<string, string>;  // filename → content
  filenamePatterns: string[];  // All audio filenames
}

export interface ShowInfoExtractionResult {
  artist?: string;
  date?: string;
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
  setlist?: SetlistSong[];  // If extracted
  confidence: number;
  source: string;  // What provided this info
}

export async function extractShowInfo(
  context: ShowInfoExtractionContext,
  llmService: LLMService
): Promise<ShowInfoExtractionResult>
```

### Step 3: Create ArchiveStructureStrategy

New file: `src/identification/strategies/archive-structure.ts`

```typescript
export class ArchiveStructureStrategy implements ShowIdentificationStrategy {
  readonly name = "archive-structure";
  readonly description = "Extract show info from archive structure and manifest files";
  readonly requiresExtraction = true;  // Need to read files
  readonly requiresLLM = true;
  readonly requiresWebSearch = false;

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    // 1. Run structure analysis (enhanced)
    // 2. Read identified manifest files
    // 3. Call LLM to extract show info
    // 4. Return structured result
  }
}
```

**Priority:** HIGHEST - should run before FilenameStrategy

### Step 4: Refactor Pipeline Order

Modify `src/ingest-music.ts` `processSingleArchive()`:

**Current order:**
```typescript
// Step 1: Parse filename
// Step 2: Resolve band config
// Step 3: Show identification (if needed)
// Step 4: Fetch setlist
// Step 5: Pre-flight validation
// Step 6: Extract archive
// Step 6a: LLM structure analysis (Phase 1)
// Step 7: List audio files
```

**New order:**
```typescript
// Step 1: Download/locate archive
// Step 2: Scan or extract archive EARLY
// Step 3: LLM structure analysis (ENHANCED)
// Step 4: Extract show info from structure (NEW)
// Step 5: Resolve artist (using structure hints)
// Step 6: Show identification (using structure strategy)
// Step 7: Fetch setlist (or use extracted setlist)
// Step 8: Pre-flight validation
// Step 9: List audio files (already in right directory)
// Step 10: Continue with matching...
```

### Step 5: Handle Setlist Extraction

Add to `src/setlist/setlist.ts`:

```typescript
export interface ExtractedSetlist {
  songs: SetlistSong[];
  source: "manifest" | "api";
  confidence: number;
}

export async function getSetlist(
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  config: Config,
  extractedSetlist?: SetlistSong[]  // NEW parameter
): Promise<Setlist> {
  // If we have extracted setlist with high confidence, use it
  if (extractedSetlist && extractedSetlist.length > 0) {
    return {
      artist: showInfo.artist,
      date: showInfo.date,
      venue: showInfo.venue,
      city: showInfo.city,
      state: showInfo.state,
      songs: extractedSetlist,
      source: "archive-manifest",
      url: "", // No URL for extracted setlists
    };
  }

  // Otherwise, fetch from API as before
  return fetchSetlist(showInfo, bandConfig, config);
}
```

## LLM Prompts

### Enhanced Structure Analysis Prompt

```
You are analyzing a music archive directory structure.

Archive: ${archiveName}
Directory structure:
${directoryTree}

TASKS:

1. IDENTIFY MUSIC DIRECTORY
   [existing prompt]

2. IDENTIFY MANIFEST FILES BY TYPE:

   Info Files (show description, recording info):
   - Filenames: *info*, *.nfo, *description*, *notes*, README*
   - Examples: "info.txt", "show-info.nfo", "recording-notes.txt"

   Setlist Files (track listing, song order):
   - Filenames: *setlist*, *tracklist*, *songs*, *tracks*
   - Examples: "setlist.txt", "tracklist.nfo", "songs.txt"

   Artwork Files:
   - Images: *.jpg, *.jpeg, *.png, *.gif
   - Documents: *.pdf (posters, handbills)

3. EXTRACT SHOW INFORMATION FROM STRUCTURE:

   Analyze directory and file names for these patterns:
   - Artist name (band/performer)
   - Date in any format (YYYY-MM-DD, MM-DD-YYYY, etc.)
   - Venue name
   - City and state/country
   - Format indicators: [FLAC24], [SBD], [AUD], [MP3]

   Common patterns:
   - "Artist - YYYY-MM-DD - Venue, City, ST/"
   - "Artist/YYYY/YYYY-MM-DD Venue/"
   - "archive.org-Artist-Date-Venue-Source/"

   Example: "Trey Anastasio Band - 2025-11-30 - Beacon Theatre, New York, NY [FLAC24]/"
   Extract:
   {
     "artist": "Trey Anastasio Band",
     "date": "2025-11-30",
     "venue": "Beacon Theatre",
     "city": "New York",
     "state": "NY"
   }

4. ASSESS COMPLETENESS:
   Does this archive appear to contain complete show data?
   - Has setlist file?
   - Directory name has full show info?
   - Complete set of tracks?

RESPONSE FORMAT:
{
  "musicDirectory": "relative/path",
  "manifestFiles": {
    "infoFiles": ["info.txt"],
    "setlistFiles": ["setlist.txt"],
    "artworkFiles": ["poster.jpg"]
  },
  "showInfoHints": {
    "artist": "Trey Anastasio Band",
    "date": "2025-11-30",
    "venue": "Beacon Theatre",
    "city": "New York",
    "state": "NY",
    "source": "directory name: Trey Anastasio Band - 2025-11-30..."
  },
  "hasCompleteSetlist": true,
  "confidence": 0.95,
  "reasoning": "..."
}
```

### Show Info Extraction Prompt

```
You are extracting concert show information from archive files.

Archive: ${archiveName}

Directory structure shows:
${structureHints}

Manifest file contents:

--- info.txt ---
${infoFileContent}

--- setlist.txt ---
${setlistFileContent}

TASK:
Extract structured show information:
- Artist/band name
- Concert date (YYYY-MM-DD format)
- Venue name
- City, state/country
- Complete setlist (if available)

Cross-reference information from:
1. Directory structure
2. Info file content
3. Setlist file content
4. Filename patterns

SETLIST EXTRACTION:
If a setlist is present, extract it in this format:
[
  { "title": "Song Name", "set": 1, "position": 1 },
  { "title": "Another Song", "set": 1, "position": 2 },
  { "title": "Encore Song", "set": 3, "position": 1 }
]

Set numbers:
- 1 = First set
- 2 = Second set
- 3 = Encore

RESPONSE FORMAT:
{
  "artist": "Trey Anastasio Band",
  "date": "2025-11-30",
  "venue": "Beacon Theatre",
  "city": "New York",
  "state": "NY",
  "setlist": [ ... ],  // If available
  "source": "info.txt + directory structure",
  "confidence": 0.95,
  "reasoning": "Artist found in directory name and info.txt. Date confirmed in both sources..."
}
```

## Benefits

1. **Less manual intervention**
   - Auto-detect artist from structure 80%+ of the time
   - Auto-extract show info from manifests
   - Fewer user prompts

2. **Richer data sources**
   - Utilize info.txt, setlist.txt files
   - Parse directory naming conventions
   - Cross-reference multiple sources

3. **Faster processing**
   - Skip API calls when setlist is in archive
   - No rate limits on local files
   - Immediate access to complete show data

4. **Better accuracy**
   - Primary source (archive) more reliable than filename parsing
   - Manifest files often have complete, accurate info
   - Can validate API data against manifest

5. **Handles edge cases**
   - Archives with non-standard filenames
   - Multiple shows in one archive (future enhancement)
   - International shows with country names

## Challenges & Solutions

### Challenge 1: Early Extraction Performance
**Problem:** Extracting large archives early might slow down pipeline if show identification fails

**Solutions:**
- For ZIP: Use pre-flight scan (no extraction)
- Read only manifest files (partial extraction)
- Cache extraction results
- Only full-extract when ready to process

### Challenge 2: Incomplete Manifest Data
**Problem:** Manifest files might have partial or incorrect info

**Solutions:**
- Use confidence scoring
- Cross-reference with other sources
- Fall back to API when confidence < 0.7
- Validate extracted setlist against API

### Challenge 3: Multiple Shows in One Archive
**Problem:** Some archives contain multiple nights

**Future Enhancement:**
- Detect multi-show archives
- Prompt user to select which show to process
- Or process all shows in batch mode

### Challenge 4: Non-Standard Formats
**Problem:** Manifest files vary widely in format

**Solutions:**
- LLM handles format variations well
- Provide examples in prompt
- Fall back to existing identification if parsing fails

## Testing Strategy

### Test Cases

1. **Archive with complete manifest**
   - Structure: `Artist - Date - Venue/`
   - Files: `info.txt`, `setlist.txt`
   - Expected: Full auto-detection, no user prompts

2. **Archive with partial manifest**
   - Structure: `random-folder-name/`
   - Files: `info.txt` (has artist + date, no setlist)
   - Expected: Auto-detect artist/date, fetch setlist from API

3. **Archive with no manifest**
   - Structure: `download/`
   - Files: Only audio files
   - Expected: Fall back to filename/audio strategies

4. **Archive with nested structure**
   - Structure: `wrapper/actual-show-folder/set1/`, `wrapper/actual-show-folder/set2/`
   - Expected: Identify music directory, extract from folder name

5. **Multi-format archive**
   - Structure: `FLAC/`, `MP3/` (both with same show)
   - Expected: Choose FLAC, ignore MP3 duplicate

## Success Metrics

- **Automation:** Reduce user prompts by 70%+
- **Accuracy:** Show info extraction 90%+ correct when manifest exists
- **Performance:** Structure analysis + extraction < 5 seconds for typical archive
- **Coverage:** Handle 95%+ of common archive formats

## Implementation Phases

### Phase 2a: Enhanced Structure Analysis
- [ ] Update structure analysis prompt
- [ ] Add manifest file identification
- [ ] Extract show hints from directory names
- [ ] Update ArchiveStructureSuggestion type
- [ ] Test with real archives

### Phase 2b: Show Info Extraction
- [ ] Create show-info-extractor.ts
- [ ] Implement LLM prompt for extraction
- [ ] Add setlist parsing logic
- [ ] Unit tests for extraction
- [ ] Integration tests

### Phase 2c: New Identification Strategy
- [ ] Create ArchiveStructureStrategy
- [ ] Register with high priority
- [ ] Handle manifest file reading
- [ ] Combine structure + content analysis
- [ ] Test alongside existing strategies

### Phase 2d: Pipeline Refactoring
- [ ] Move archive scanning earlier
- [ ] Update processSingleArchive() flow
- [ ] Handle early extraction for non-ZIP
- [ ] Add caching for scanned archives
- [ ] Update progress messages

### Phase 2e: Setlist Integration
- [ ] Modify fetchSetlist() to accept extracted setlist
- [ ] Validate extracted setlist quality
- [ ] Add confidence thresholds
- [ ] Test API fallback behavior
- [ ] Document when to trust extracted vs API setlists

## Future Enhancements

1. **Multi-show detection**
   - Detect when archive has multiple shows
   - Batch process or prompt user

2. **Setlist validation**
   - Compare extracted setlist with API
   - Flag discrepancies
   - Allow user to choose

3. **Recording metadata extraction**
   - Source type (SBD, AUD, Matrix)
   - Taper/uploader info
   - Recording equipment
   - Lineage information

4. **Smart archive organization**
   - Suggest better organization
   - Detect and fix common issues
   - Recommend file renaming

## References

- Phase 1 Implementation: `docs/features/llm-archive-structure-analysis.md`
- Current pipeline: `src/ingest-music.ts`
- Identification system: `src/identification/`
- Pre-flight validation: `src/ingest-music.ts:215-484`
