import type { LLMProvider } from "./provider.js";
import type {
  DateExtractionContext,
  DateSuggestion,
  SetlistMismatchContext,
  SetlistMismatchSuggestion,
  ArtistIdentificationContext,
  ArtistSuggestion,
} from "./types.js";

export class LLMService {
  constructor(private provider: LLMProvider) {}

  /**
   * Analyze a setlist mismatch and suggest merge/split operations
   */
  async resolveSetlistMismatch(
    context: SetlistMismatchContext
  ): Promise<SetlistMismatchSuggestion> {
    const prompt = this.buildSetlistMismatchPrompt(context);

    const response = await this.provider.query<SetlistMismatchSuggestion>({
      type: "setlist_mismatch",
      context,
      prompt,
    });

    if (!response.success) {
      return {
        type: "setlist_mismatch",
        reasoning: response.reasoning,
        confidence: 0,
      };
    }

    return {
      type: "setlist_mismatch",
      merges: response.data.merges,
      splits: response.data.splits,
      reasoning: response.data.reasoning || response.reasoning,
      confidence: response.data.confidence ?? response.confidence,
    };
  }

  /**
   * Extract date from filename and text files
   */
  async extractDate(context: DateExtractionContext): Promise<DateSuggestion> {
    const prompt = this.buildDateExtractionPrompt(context);

    const response = await this.provider.query<DateSuggestion>({
      type: "date_extraction",
      context,
      prompt,
    });

    if (!response.success) {
      return {
        type: "date_extraction",
        date: "",
        source: "error",
        reasoning: response.reasoning,
        confidence: 0,
      };
    }

    return {
      type: "date_extraction",
      date: response.data.date,
      source: response.data.source || "unknown",
      reasoning: response.data.reasoning || response.reasoning,
      confidence: response.data.confidence ?? response.confidence,
    };
  }

  /**
   * Identify artist from filename or text files
   */
  async identifyArtist(
    context: ArtistIdentificationContext
  ): Promise<ArtistSuggestion> {
    const prompt = this.buildArtistIdentificationPrompt(context);

    const response = await this.provider.query<ArtistSuggestion>({
      type: "artist_identification",
      context,
      prompt,
    });

    if (!response.success) {
      return {
        type: "artist_identification",
        artist: "",
        reasoning: response.reasoning,
        confidence: 0,
      };
    }

    return {
      type: "artist_identification",
      artist: response.data.artist,
      bandConfigKey: response.data.bandConfigKey,
      reasoning: response.data.reasoning || response.reasoning,
      confidence: response.data.confidence ?? response.confidence,
    };
  }

  /**
   * Build prompt for setlist mismatch analysis
   */
  private buildSetlistMismatchPrompt(
    context: SetlistMismatchContext
  ): string {
    const fileDiff = context.fileCount - context.setlistCount;
    const scenario = fileDiff > 0 ? "MORE_FILES" : fileDiff < 0 ? "FEWER_FILES" : "SAME_COUNT";

    return `You are analyzing why ${context.fileCount} audio files don't match a setlist with ${context.setlistCount} songs.

Audio files (${context.fileCount} total):
${context.audioFiles.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Official setlist (${context.setlistCount} songs):
${context.setlist.map((s) => `Set ${s.set}, #${s.position}: ${s.title}`).join("\n")}

SCENARIO ANALYSIS:
${scenario === "MORE_FILES" ? `
You have ${fileDiff} MORE audio files than setlist songs (${context.fileCount} > ${context.setlistCount}).
This means some files are intro/banter/talking tracks that need to be MERGED with actual songs.

STEP-BY-STEP PROCESS:

1. IDENTIFY NON-SONG TRACKS:
   Look for tracks with titles containing: "Intro", "Banter", "Talking", "DJ", "Outro", "Announcement"
   These tracks are NOT in the setlist - they are filler content between songs.
   You MUST identify ALL ${fileDiff} of them.

2. MERGE EVERY NON-SONG TRACK:
   - Each intro/banter track must merge with the NEXT track
   - If multiple intro/banter tracks are consecutive, they ALL merge with the next song
   - Example: Track 1 "DJ Intro" → merge [1, 2]
   - Example: Track 10 "Banter #1" → merge [10, 11]
   - IMPORTANT: Each merge is TWO tracks only: [intro_track, next_track]
   - DO NOT create duplicate merges for the same track numbers
   - After merging all ${fileDiff} intro/banter tracks, you'll have ${context.setlistCount} songs

3. VERIFY YOUR WORK:
   - Count: You should suggest exactly ${fileDiff} unique merges
   - Check: No duplicate track numbers in your merge list
   - Math: ${context.fileCount} files - ${fileDiff} merges = ${context.setlistCount} songs ✓` :
scenario === "FEWER_FILES" ? `
You have ${Math.abs(fileDiff)} FEWER audio files than setlist songs (${context.fileCount} < ${context.setlistCount}).
This means ${Math.abs(fileDiff)} audio files contain MULTIPLE setlist songs and need to be SPLIT.

CRITICAL: We CANNOT automatically split files because we don't know the timestamps.

Your response MUST:
1. Set "merges": [] (empty - no merges possible)
2. Set "splits": [] (empty - we can't proceed with splits)
3. Explain in "reasoning" which files likely contain multiple songs
4. Set "confidence": 0.0 (we cannot proceed automatically)

Example reasoning: "Audio file count (${context.fileCount}) is less than setlist count (${context.setlistCount}), suggesting ${Math.abs(fileDiff)} files contain multiple songs. Cannot proceed automatically - manual splitting required."` :
`
You have the SAME number of audio files and setlist songs (${context.fileCount} = ${context.setlistCount}).
The mismatch is likely due to title differences, not track count issues.

Check if track titles roughly match the setlist (partial matches OK).
If they match, suggest NO merges or splits - the issue is just naming.`}

MERGE FORMAT (only for MORE_FILES scenario):
- Each merge: { "tracks": [intro_track_num, next_track_num] }
- List merges from END to BEGINNING (highest track numbers first)
- NO DUPLICATES - each track number should appear in at most ONE merge
- Example: [{ "tracks": [23, 24] }, { "tracks": [17, 18] }, { "tracks": [10, 11] }]

TITLE MATCHING:
- "Mary" matches "Mary Won't You Call My Name?" (shortened OK)
- "A Head With Wings" matches "Head With Wings" (minor variations OK)

Respond with valid JSON only:
{
  "merges": [{ "tracks": [23, 24] }, { "tracks": [17, 18] }],  // Empty [] if FEWER_FILES or SAME_COUNT
  "splits": [],  // Always empty (we cannot auto-split)
  "reasoning": "Explain what you found and what should be done",
  "confidence": 0.95  // 0.0 if FEWER_FILES scenario
}`;
  }

  /**
   * Build prompt for date extraction
   */
  private buildDateExtractionPrompt(context: DateExtractionContext): string {
    const parts = [`Extract the concert date from the following information:`];
    parts.push(`\nFilename: ${context.filename}`);

    if (context.textFiles && Object.keys(context.textFiles).length > 0) {
      parts.push("\nText files found in archive:");
      for (const [filename, content] of Object.entries(context.textFiles)) {
        parts.push(`\n${filename}:\n${content.slice(0, 500)}`);
      }
    }

    if (context.audioMetadata) {
      parts.push("\nAudio metadata:");
      parts.push(JSON.stringify(context.audioMetadata, null, 2));
    }

    parts.push(`\nRespond with valid JSON only:
{
  "date": "YYYY-MM-DD",
  "source": "where you found the date (e.g., filename, info.txt, metadata)",
  "reasoning": "explanation of how you extracted the date",
  "confidence": 0.95
}`);

    return parts.join("\n");
  }

  /**
   * Build prompt for artist identification
   */
  private buildArtistIdentificationPrompt(
    context: ArtistIdentificationContext
  ): string {
    const parts = [`Identify the artist/band name from the following information:`];
    parts.push(`\nFilename: ${context.filename}`);

    if (context.possibleArtists && context.possibleArtists.length > 0) {
      parts.push("\nPossible artists from configuration:");
      parts.push(context.possibleArtists.join(", "));
    }

    if (context.textFiles && Object.keys(context.textFiles).length > 0) {
      parts.push("\nText files found in archive:");
      for (const [filename, content] of Object.entries(context.textFiles)) {
        parts.push(`\n${filename}:\n${content.slice(0, 500)}`);
      }
    }

    parts.push(`\nRespond with valid JSON only:
{
  "artist": "Full artist/band name",
  "bandConfigKey": "matching key from possible artists (if applicable)",
  "reasoning": "explanation of how you identified the artist",
  "confidence": 0.95
}`);

    return parts.join("\n");
  }
}
