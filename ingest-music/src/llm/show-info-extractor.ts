import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { LLMService } from "./service.js";
import type {
  ShowInfoExtractionContext,
  ShowInfoExtractionResult,
  SetlistSong,
} from "./types.js";

/**
 * Extract show information from archive structure and manifest files.
 * This combines directory structure hints with actual file contents
 * to extract artist, date, venue, and optionally setlist information.
 *
 * Phase 2 feature: Extracts show info early in the pipeline to reduce
 * manual user input and provide richer data for show identification.
 */
export async function extractShowInfo(
  context: ShowInfoExtractionContext,
  llmService: LLMService,
): Promise<ShowInfoExtractionResult> {
  const result = await llmService.extractShowInfo(context);
  return result;
}

/**
 * Read manifest files from the archive and prepare them for extraction.
 * Returns a map of filename → content for files that exist and are readable.
 */
export async function readManifestFiles(
  archivePath: string,
  manifestFilePaths: string[],
  maxFileSize: number = 100 * 1024, // 100 KB limit for text files
): Promise<Record<string, string>> {
  const manifestFiles: Record<string, string> = {};

  for (const relativePath of manifestFilePaths) {
    try {
      const fullPath = path.join(archivePath, relativePath);
      const stats = await fs.stat(fullPath);

      // Skip files that are too large (likely not text)
      if (stats.size > maxFileSize) {
        continue;
      }

      // Read file content
      const content = await fs.readFile(fullPath, "utf-8");
      const filename = path.basename(relativePath);
      manifestFiles[filename] = content;
    } catch {
      // Skip files that can't be read
      continue;
    }
  }

  return manifestFiles;
}

/**
 * Build the LLM prompt for show information extraction.
 */
function buildShowInfoExtractionPrompt(
  context: ShowInfoExtractionContext,
): string {
  const parts = [
    "You are extracting concert show information from music archive files.",
    "",
    `Archive: ${context.archiveName}`,
    "",
  ];

  // Include structure hints if available
  if (context.showInfoHints) {
    parts.push("Directory structure analysis suggests:");
    if (context.showInfoHints.artist) {
      parts.push(`  Artist: ${context.showInfoHints.artist}`);
    }
    if (context.showInfoHints.date) {
      parts.push(`  Date: ${context.showInfoHints.date}`);
    }
    if (context.showInfoHints.venue) {
      parts.push(`  Venue: ${context.showInfoHints.venue}`);
    }
    if (context.showInfoHints.city) {
      parts.push(`  City: ${context.showInfoHints.city}`);
    }
    if (context.showInfoHints.state) {
      parts.push(`  State: ${context.showInfoHints.state}`);
    }
    parts.push(`  Source: ${context.showInfoHints.source}`);
    parts.push("");
  }

  // Include directory structure
  if (context.directoryStructure) {
    parts.push("Directory structure:");
    parts.push(context.directoryStructure);
    parts.push("");
  }

  // Include manifest file contents
  if (Object.keys(context.manifestFiles).length > 0) {
    parts.push("Manifest file contents:");
    parts.push("");
    for (const [filename, content] of Object.entries(context.manifestFiles)) {
      parts.push(`--- ${filename} ---`);
      // Limit content length to avoid huge prompts
      const truncatedContent =
        content.length > 2000 ? content.slice(0, 2000) + "\n[... truncated]" : content;
      parts.push(truncatedContent);
      parts.push("");
    }
  }

  // Include filename patterns
  if (context.filenamePatterns.length > 0) {
    parts.push("Audio filenames (first 10):");
    for (const filename of context.filenamePatterns.slice(0, 10)) {
      parts.push(`  - ${filename}`);
    }
    if (context.filenamePatterns.length > 10) {
      parts.push(`  ... (${context.filenamePatterns.length - 10} more files)`);
    }
    parts.push("");
  }

  parts.push(`TASK:

Extract structured show information by cross-referencing all available sources:
1. Directory structure and names
2. Manifest file content (info.txt, setlist.txt, etc.)
3. Audio filename patterns

REQUIRED FIELDS:
- artist: Full artist/band name
- date: Concert date in YYYY-MM-DD format
- venue: Venue name (if available)
- city: City name (if available)
- state: State/province code (if available, e.g., "NY", "CA")
- country: Country name (if available, especially for non-US shows)

OPTIONAL SETLIST EXTRACTION:
If a setlist is present in the manifest files, extract it in this format:
- Parse song names and their order
- Identify set boundaries (Set 1, Set 2, Encore)
- Assign set numbers: 1 = First set, 2 = Second set, 3 = Encore
- Number songs within each set starting at 1

Example setlist format:
[
  { "title": "Wilson", "set": 1, "position": 1 },
  { "title": "Reba", "set": 1, "position": 2 },
  { "title": "Tweezer", "set": 2, "position": 1 },
  { "title": "Julius", "set": 3, "position": 1 }
]

CONFIDENCE SCORING:
- 0.95+: Multiple sources confirm the same information
- 0.85-0.94: Single reliable source (detailed info.txt or clear directory name)
- 0.70-0.84: Partial information or some ambiguity
- <0.70: Uncertain or conflicting information

RESPONSE FORMAT:

Respond with valid JSON only:
{
  "artist": "Phish",
  "date": "2023-07-14",
  "venue": "Madison Square Garden",
  "city": "New York",
  "state": "NY",
  "country": "USA",
  "setlist": [
    { "title": "Wilson", "set": 1, "position": 1 },
    { "title": "Reba", "set": 1, "position": 2 }
  ],
  "source": "info.txt + directory structure",
  "confidence": 0.95,
  "reasoning": "Artist 'Phish' found in both directory name and info.txt. Date '2023-07-14' confirmed in info.txt and matches directory pattern. Venue and location extracted from info.txt header. Setlist parsed from setlist.txt with clear set breaks."
}

IMPORTANT NOTES:
- Cross-reference information from multiple sources for higher confidence
- If date format is ambiguous, prefer YYYY-MM-DD interpretation
- If setlist file exists but is incomplete/unclear, omit the setlist field
- Normalize artist names (e.g., "TAB" → "Trey Anastasio Band" if context suggests it)
- Include reasoning that explains which sources provided which information`);

  return parts.join("\n");
}
