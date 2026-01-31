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
    return `You are analyzing why ${context.fileCount} audio files don't match a setlist with ${context.setlistCount} songs.

Audio files (${context.fileCount} total):
${context.audioFiles.map((f, i) => `${i + 1}. ${f}`).join("\n")}

Official setlist (${context.setlistCount} songs):
${context.setlist.map((s) => `Set ${s.set}, #${s.position}: ${s.title}`).join("\n")}

CRITICAL UNDERSTANDING:
The audio files include intro/banter/talking tracks that are NOT in the official setlist.
These non-song tracks must ALL be merged with the next actual song track.

STEP-BY-STEP PROCESS:

1. IDENTIFY NON-SONG TRACKS:
   Look for tracks with titles containing: "Intro", "Banter", "Talking", "DJ", "Outro", "Announcement"
   These tracks are NOT in the setlist - they are filler content between songs.
   You MUST identify ALL of them, not just some.

2. MERGE EVERY NON-SONG TRACK:
   - Each intro/banter track must merge with the NEXT track
   - If multiple intro/banter tracks are consecutive, they ALL merge with the next song
   - Example: Track 1 "DJ Intro" → merge with track 2
   - Example: Track 10 "Banter #1" → merge with track 11
   - Example: Track 13 "Billy Intro" → merge with track 14
   - IMPORTANT: After merging, there should be ZERO intro/banter tracks remaining

3. MERGE FORMAT:
   - Each merge: { "tracks": [track1, track2] } for merging track1 into track2
   - List merges from END to BEGINNING (highest track numbers first)
   - Example: [{ "tracks": [23, 24] }, { "tracks": [17, 18] }, { "tracks": [1, 2] }]

4. SPLITS (avoid if possible):
   - ONLY suggest splits if ONE audio file contains MULTIPLE setlist songs
   - DO NOT suggest splits for intro/banter - those should be MERGED
   - If you suggest any splits, we CANNOT proceed automatically

5. TITLE MATCHING:
   - "Mary" matches "Mary Won't You Call My Name?" (shortened titles are fine)
   - "A Head With Wings" matches "Head With Wings" (minor variations OK)
   - Focus on matching the COUNT of songs, not exact title matches

YOUR GOAL:
After your suggested merges are applied, the number of remaining tracks should equal the setlist count (${context.setlistCount}).
Check your work: ${context.fileCount} files - (number of intro/banter tracks) = ${context.setlistCount} songs

Respond with valid JSON only:
{
  "merges": [{ "tracks": [23, 24] }, { "tracks": [17, 18] }, { "tracks": [1, 2] }],  // END to BEGINNING
  "splits": [],
  "reasoning": "Found 7 intro/banter tracks: 1 (DJ Intro), 6 (Mark Sandman Intro), 8 (Dana Intro), 10 (Banter #1), 13 (Billy Intro), 17 (Banter #2), 23 (Banter #3). Each merges with next track. 26 files - 7 non-songs = 19 setlist songs.",
  "confidence": 0.95
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
