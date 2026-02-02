import type { LLMProvider } from "./provider.js";
import type {
  DateExtractionContext,
  DateSuggestion,
  SetlistMismatchContext,
  SetlistMismatchSuggestion,
  ArtistIdentificationContext,
  ArtistSuggestion,
  ParseMergeInstructionsContext,
  ParseMergeInstructionsSuggestion,
  ModifySetlistContext,
  ModifySetlistSuggestion,
  CombinedInstructionsContext,
  CombinedInstructionsSuggestion,
} from "./types.js";

export class LLMService {
  constructor(private provider: LLMProvider) {}

  /**
   * Analyze a setlist mismatch and suggest merge/split operations
   */
  async resolveSetlistMismatch(
    context: SetlistMismatchContext,
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
    context: ArtistIdentificationContext,
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
   * Parse user's natural language merge/split instructions.
   * Converts instructions like "merge tracks 4 and 5 into 3" into structured operations.
   * @deprecated Use parseCombinedInstructions instead
   */
  async parseMergeInstructions(
    context: ParseMergeInstructionsContext,
  ): Promise<ParseMergeInstructionsSuggestion> {
    const prompt = this.buildParseMergeInstructionsPrompt(context);

    const response =
      await this.provider.query<ParseMergeInstructionsSuggestion>({
        type: "parse_merge_instructions",
        context,
        prompt,
      });

    if (!response.success) {
      return {
        type: "parse_merge_instructions",
        reasoning: response.reasoning,
        confidence: 0,
      };
    }

    return {
      type: "parse_merge_instructions",
      merges: response.data.merges,
      splits: response.data.splits,
      reasoning: response.data.reasoning || response.reasoning,
      confidence: response.data.confidence ?? response.confidence,
    };
  }

  /**
   * Parse user's combined natural language instructions.
   * Can handle both setlist modifications AND merge/split operations in one prompt.
   * Examples:
   *   "remove drum solo from setlist, merge tracks 4 and 5"
   *   "remove maddy jam, split track 3 at 12:30"
   */
  async parseCombinedInstructions(
    context: CombinedInstructionsContext,
  ): Promise<CombinedInstructionsSuggestion> {
    const prompt = this.buildCombinedInstructionsPrompt(context);

    const response = await this.provider.query<CombinedInstructionsSuggestion>({
      type: "combined_instructions" as any, // Type not in union yet
      context,
      prompt,
    });

    if (!response.success) {
      return {
        type: "combined_instructions",
        reasoning: response.reasoning,
        confidence: 0,
      };
    }

    return {
      type: "combined_instructions",
      modifiedSetlist: response.data.modifiedSetlist,
      merges: response.data.merges,
      splits: response.data.splits,
      reasoning: response.data.reasoning || response.reasoning,
      confidence: response.data.confidence ?? response.confidence,
    };
  }

  /**
   * Build prompt for setlist mismatch analysis
   */
  private buildSetlistMismatchPrompt(context: SetlistMismatchContext): string {
    const fileDiff = context.fileCount - context.setlistCount;
    const scenario =
      fileDiff > 0 ? "MORE_FILES" : fileDiff < 0 ? "FEWER_FILES" : "SAME_COUNT";

    return `You are analyzing why ${context.fileCount} audio files don't match a setlist with ${context.setlistCount} songs.

Audio files (${context.fileCount} total):
${context.audioFiles.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Official setlist (${context.setlistCount} songs):
${context.setlist.map((s) => `Set ${s.set}, #${s.position}: ${s.title}`).join("\n")}

SCENARIO ANALYSIS:
${
  scenario === "MORE_FILES"
    ? `
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
   - Math: ${context.fileCount} files - ${fileDiff} merges = ${context.setlistCount} songs ✓`
    : scenario === "FEWER_FILES"
      ? `
You have ${Math.abs(fileDiff)} FEWER audio files than setlist songs (${context.fileCount} < ${context.setlistCount}).
This means ${Math.abs(fileDiff)} audio files contain MULTIPLE setlist songs and need to be SPLIT.

CRITICAL: We CANNOT automatically split files because we don't know the timestamps.

Your response MUST:
1. Set "merges": [] (empty - no merges possible)
2. Set "splits": [] (empty - we can't proceed with splits)
3. Explain in "reasoning" which files likely contain multiple songs
4. Set "confidence": 0.0 (we cannot proceed automatically)

Example reasoning: "Audio file count (${context.fileCount}) is less than setlist count (${context.setlistCount}), suggesting ${Math.abs(fileDiff)} files contain multiple songs. Cannot proceed automatically - manual splitting required."`
      : `
You have the SAME number of audio files and setlist songs (${context.fileCount} = ${context.setlistCount}).
The mismatch is likely due to title differences, not track count issues.

Check if track titles roughly match the setlist (partial matches OK).
If they match, suggest NO merges or splits - the issue is just naming.`
}

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
    context: ArtistIdentificationContext,
  ): string {
    const parts = [
      `Identify the artist/band name from the following information:`,
    ];
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

  /**
   * Build prompt for parsing user merge instructions
   */
  private buildParseMergeInstructionsPrompt(
    context: ParseMergeInstructionsContext,
  ): string {
    return `You are helping parse user's natural language instructions for merging or splitting audio tracks.

User's instructions:
"${context.userInstructions}"

Audio files (${context.fileCount} total):
${context.audioFiles.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Official setlist (${context.setlistCount} songs):
${context.setlist.map((s) => `Set ${s.set}, #${s.position}: ${s.title}`).join("\n")}

Parse the user's instructions and convert them to structured merge/split operations.

Common instruction patterns:
- "merge tracks 4 and 5 into 3" → means merge tracks 4 and 5 together (resulting track becomes track 3)
- "merge 1, 2, 3" → means merge tracks 1, 2, and 3 together
- "combine tracks 10 and 11" → means merge tracks 10 and 11
- "split track 5 at 3:30" → means split track 5 at timestamp 3:30

IMPORTANT MERGE FORMAT:
- Track numbers are 1-indexed (first track is 1, not 0)
- Each merge specifies which consecutive tracks to merge
- Format: { "tracks": [track1, track2, ...] }
- Example: Merge tracks 4 and 5 → { "tracks": [4, 5] }
- Example: Merge tracks 1, 2, 3 → { "tracks": [1, 2, 3] }

IMPORTANT SPLIT FORMAT:
- Track number is 1-indexed
- Timestamp format: "MM:SS" or "HH:MM:SS"
- Format: { "track": trackNum, "timestamp": "MM:SS" }
- Example: Split track 5 at 3:30 → { "track": 5, "timestamp": "3:30" }

Respond with valid JSON only:
{
  "merges": [{ "tracks": [4, 5] }],
  "splits": [{ "track": 3, "timestamp": "12:22" }],
  "reasoning": "Parsed user instructions: merge tracks 4 and 5, split track 3 at 12:22",
  "confidence": 0.9
}

If you cannot parse the instructions, set confidence to 0 and explain why in reasoning.`;
  }

  /**
   * Build prompt for parsing combined setlist modification and merge instructions
   */
  private buildCombinedInstructionsPrompt(
    context: CombinedInstructionsContext,
  ): string {
    return `You are helping parse user's natural language instructions for modifying a setlist AND/OR merging/splitting audio tracks.

User's instructions:
"${context.userInstructions}"

Audio files (${context.fileCount} total):
${context.audioFiles.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Official setlist (${context.setlistCount} songs):
${context.setlist.map((s, i) => `${i + 1}. Set ${s.set}, #${s.position}: ${s.title}`).join("\n")}

Parse the user's instructions and convert them to:
1. A modified setlist (if they want to add/remove/rename songs)
2. Merge/split operations (if they want to merge or split audio files)

SETLIST MODIFICATION INSTRUCTIONS:

Common patterns:
- "remove drum solo from setlist" → remove the song titled "Drum Solo" from the setlist
- "remove drum solo and maddy jam" → remove both songs
- "rename track 3 to intro" → change the title of position 3
- "add intro before song 1" → insert a new song at the beginning
- "use the songs from the archive" / "ignore official setlist" → CREATE NEW setlist from archive files


When parsing song lists:

- Include ALL songs from lists, even if they have names like "Set", "Intro", "Outro" - these are actual song titles!

When user says "use archive" or "ignore official setlist":
- Create a NEW setlist with EXACTLY ${context.fileCount} songs (one for EACH of the ${context.fileCount} audio files)
- Extract song titles from the audio filenames:
  - Strip leading track numbers: "1. Swan Song.wav" → "Swan Song"
  - Strip file extensions: "Swan Song.wav" → "Swan Song"
  - Keep the exact titles from filenames
- Match files 1-to-1: File 1 → Position 1, File 2 → Position 2, etc.
- Your modifiedSetlist array MUST have exactly ${context.fileCount} entries
- DO NOT suggest any merges or splits - the archive is already correct as-is
- Set "merges": [] and "splits": []
- Example: If archive has ["1. Song A.wav", "2. Set.wav", "3. Song B.wav"], create setlist with 3 entries:
  [
    { "title": "Song A", "set": 1, "position": 1 },
    { "title": "Set", "set": 1, "position": 2 },
    { "title": "Song B", "set": 1, "position": 3 }
  ]
  with "merges": [] and "splits": []

When removing songs:
- Remove the matching song(s) from the setlist array
- Renumber remaining songs' positions sequentially
- Update the setlistCount accordingly

MERGE/SPLIT INSTRUCTIONS:
Common patterns:
- "merge tracks 4 and 5" → merge audio files 4 and 5
- "split track 3 at 12:30" → split audio file 3 at timestamp 12:30

IMPORTANT: Track numbers refer to AUDIO FILES (1-indexed), not setlist positions!

RESPONSE FORMAT:
{
  "modifiedSetlist": [
    { "title": "Song Name", "set": 1, "position": 1 },
    ...
  ],
  "merges": [{ "tracks": [4, 5] }],
  "splits": [{ "track": 3, "timestamp": "12:30" }],
  "reasoning": "Removed 'Drum Solo' from setlist (was position 5), merged audio tracks 4 and 5",
  "confidence": 0.9
}

If no setlist changes requested, omit "modifiedSetlist" (or set to null).
If no merges/splits requested, set those to empty arrays.
If you cannot parse the instructions, set confidence to 0 and explain why in reasoning.`;
  }
}
