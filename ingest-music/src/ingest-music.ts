import * as path from "node:path";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";

import type {
  CliFlags,
  Config,
  ShowInfo,
  IngestResult,
  ProgressCallback,
  MatchedTrack,
  BandConfig,
  AudioInfo,
  SourceFormatInfo,
  SetlistSong,
} from "./config/types.js";
import { loadConfig, resolveBandConfig } from "./config/config.js";
import { parseZipFilename } from "./matching/parse-filename.js";
import { parseLocation } from "./matching/location-parser.js";
import { extractArchive, listAudioFiles, listNonAudioFiles, cleanupTempDir, isArchive, readTextFiles, scanArchiveManifest, type ArchiveManifest } from "./utils/extract.js";
import { checkForSubdirectories, buildDirectoryTree, formatDirectoryTree, countNodes, countAudioNodes } from "./utils/directory-tree.js";
import { createLLMService } from "./llm/index.js";
import { createWebSearchService } from "./websearch/index.js";
import { ShowIdentificationOrchestrator, ArchiveStructureStrategy, FilenameStrategy, AudioFileListStrategy, WebSearchStrategy, presentIdentificationResults, type ShowIdentificationResult } from "./identification/index.js";
import { searchSetlistsByCity, searchSetlistsByVenue, type SetlistSearchResult } from "./setlist/search.js";
import { promptUserToSelectShow } from "./setlist/disambiguation.js";
import { downloadToTemp } from "./utils/download.js";
import { verifyRequiredTools } from "./utils/startup.js";
import { analyzeAllAudio, convertAllIfNeeded } from "./audio/audio.js";
import { isLosslessFormat, getAudioExtensions } from "./audio/formats.js";
import { findMatchingRule, ruleRequiresConversion } from "./config/conversion-rules.js";
import { applySplitsToFiles, parseSplitSpec, applyMergesToFiles, parseMergeSpec } from "./audio/split.js";
import { fetchSetlist } from "./setlist/setlist.js";
import { matchTracks, TrackCountMismatchError } from "./matching/match.js";
import { tagAllTracks, buildTemplateVars } from "./output/tagger.js";
import { renderTemplate, zeroPad, sanitize, sanitizeFilename } from "./output/template.js";
import { generateLogContent, writeLogFile } from "./output/log.js";

/**
 * Get the appropriate filename template based on the number of sets.
 * Uses fileNameTemplateSingleSet if there's only one set, otherwise fileNameTemplate.
 */
function getFileNameTemplate(
  matched: MatchedTrack[],
  bandConfig: BandConfig
): string {
  const uniqueSets = new Set(matched.map((m) => m.effectiveSet)).size;
  if (uniqueSets === 1 && bandConfig.fileNameTemplateSingleSet) {
    return bandConfig.fileNameTemplateSingleSet;
  }
  return bandConfig.fileNameTemplate;
}

/**
 * Check for existing shows with the same date in the library.
 * Returns paths to potentially duplicate shows.
 */
async function findExistingShows(
  targetDir: string,
  showDate: string,
  onProgress: ProgressCallback
): Promise<string[]> {
  const matches: string[] = [];

  // Check if exact target exists
  try {
    await fs.access(targetDir);
    matches.push(targetDir);
  } catch {
    // Target doesn't exist, which is good
  }

  // Search parent directory for folders with the same date
  const parentDir = path.dirname(targetDir);
  try {
    const entries = await fs.readdir(parentDir, { withFileTypes: true });

    // Extract date components for flexible matching (YYYY-MM-DD, YYYY.MM.DD, YYYYMMDD, etc.)
    const datePatterns = [
      showDate, // YYYY-MM-DD
      showDate.replace(/-/g, "."), // YYYY.MM.DD
      showDate.replace(/-/g, ""), // YYYYMMDD
      showDate.replace(/-/g, "_"), // YYYY_MM_DD
    ];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const fullPath = path.join(parentDir, entry.name);
        if (fullPath === targetDir) continue; // Skip if it's the exact target (already checked)

        // Check if folder name contains any date pattern
        for (const pattern of datePatterns) {
          if (entry.name.includes(pattern)) {
            matches.push(fullPath);
            break;
          }
        }
      }
    }
  } catch (e) {
    // Parent directory doesn't exist or can't be read - not an error, library might be empty
    onProgress(`Note: Could not check for existing shows in ${parentDir}`);
  }

  return matches;
}

/**
 * Main entry point: process a single zip file or batch of zips.
 */
export async function ingestMusic(
  zipPath: string,
  flags: CliFlags,
  onProgress: ProgressCallback = console.log
): Promise<IngestResult[]> {
  // Verify required tools are available (silent on success)
  await verifyRequiredTools();

  // Load config
  const config = await loadConfig(flags.config);
  if (flags.library) {
    config.libraryBasePath = flags.library;
  }

  // Handle URL download if --url flag is provided
  let actualPath = zipPath;
  let downloadCleanup: { path: string; shouldCleanup: boolean } | null = null;

  if (flags.url) {
    if (flags.batch) {
      throw new Error("Cannot use --url with --batch mode");
    }

    onProgress("Downloading from URL...");
    downloadCleanup = await downloadToTemp(flags.url, config.downloadDir, onProgress);
    actualPath = downloadCleanup.path;
    onProgress("");
  }

  try {
    if (flags.batch) {
      return await processBatch(actualPath, flags, config, onProgress);
    }
    return [await processSingleArchive(actualPath, flags, config, onProgress)];
  } finally {
    // Clean up downloaded file if needed
    if (downloadCleanup?.shouldCleanup) {
      onProgress("\nCleaning up downloaded file...");
      const downloadDir = path.dirname(downloadCleanup.path);
      await cleanupTempDir(downloadDir);
    }
  }
}

async function processBatch(
  dirPath: string,
  flags: CliFlags,
  config: Config,
  onProgress: ProgressCallback
): Promise<IngestResult[]> {
  const entries = await fs.readdir(dirPath);
  const archives = entries
    .filter((e) => isArchive(e))
    .map((e) => path.join(dirPath, e));

  if (archives.length === 0) {
    throw new Error(`No archive files found in ${dirPath}`);
  }

  onProgress(`Found ${archives.length} archive(s) in ${dirPath}\n`);

  const results: IngestResult[] = [];
  const errors: { zip: string; error: string }[] = [];

  for (const archive of archives) {
    onProgress(`\n${"=".repeat(60)}`);
    onProgress(`Processing: ${path.basename(archive)}`);
    onProgress("=".repeat(60));

    try {
      const result = await processSingleArchive(archive, flags, config, onProgress);
      results.push(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      onProgress(`ERROR: ${msg}`);
      errors.push({ zip: path.basename(archive), error: msg });
    }
  }

  // Summary
  onProgress(`\n${"=".repeat(60)}`);
  onProgress("Batch Summary");
  onProgress("=".repeat(60));
  onProgress(`Processed: ${results.length}/${archives.length}`);
  if (errors.length > 0) {
    onProgress(`Errors: ${errors.length}`);
    for (const err of errors) {
      onProgress(`  - ${err.zip}: ${err.error}`);
    }
  }

  return results;
}

/**
 * Pre-flight validation phase.
 * Scans archive, checks track counts, and determines if processing can succeed.
 * Returns planned merges and/or modified setlist if LLM suggests them.
 */
interface PreflightResult {
  canProceed: boolean;
  manifest: ArchiveManifest | null;
  plannedMerges?: Array<{ tracks: number[] }>;
  modifiedSetlist?: Array<{ title: string; set: number; position: number }>;
  reason?: string;
}

async function preflightValidation(
  zipPath: string,
  setlist: { songs: Array<{ title: string; set: number; position: number }> },
  config: Config,
  bandConfig: BandConfig,
  flags: CliFlags,
  onProgress: ProgressCallback
): Promise<PreflightResult> {
  // Step 1: Scan archive manifest (without extracting)
  onProgress("\nScanning archive contents...");
  const manifest = await scanArchiveManifest(zipPath, config.ignoreFilePatterns);

  if (!manifest) {
    // Archive format doesn't support scanning (e.g., tar.gz, rar)
    // We'll have to extract first and check later
    return { canProceed: true, manifest: null };
  }

  const audioFileCount = manifest.audioFiles.length;
  const setlistCount = setlist.songs.length;

  onProgress(`Found ${audioFileCount} audio file(s) in archive`);

  // Step 2: Check if track counts match
  if (audioFileCount === setlistCount) {
    // Counts match - proceed with extraction
    return { canProceed: true, manifest };
  }

  // Step 3: Track count mismatch - try LLM analysis
  const shouldUseLlm = flags["use-llm"] || (config.llm?.enabled ?? false);

  if (!shouldUseLlm || !config.llm) {
    // No LLM available - show files and fail fast
    onProgress("\nTrack count mismatch detected!");
    onProgress(`Audio files: ${audioFileCount}, Setlist songs: ${setlistCount}`);

    // Display audio files found in archive
    onProgress("\nAudio files in archive:");
    manifest.audioFiles.forEach((file, idx) => {
      onProgress(`  ${idx + 1}. ${file}`);
    });

    // Display setlist for comparison
    const songsBySet = new Map<number, typeof setlist.songs>();
    for (const song of setlist.songs) {
      if (!songsBySet.has(song.set)) {
        songsBySet.set(song.set, []);
      }
      songsBySet.get(song.set)!.push(song);
    }

    onProgress("\nSetlist from API:");
    for (const [setNum, songs] of Array.from(songsBySet.entries()).sort((a, b) => a[0] - b[0])) {
      const setName = setNum === 3 ? 'Encore' : `Set ${setNum}`;
      onProgress(`  ${setName}:`);
      for (const song of songs) {
        onProgress(`    ${song.position}. ${song.title}`);
      }
    }

    return {
      canProceed: false,
      manifest,
      reason: `\nTrack count mismatch: ${audioFileCount} audio files vs ${setlistCount} setlist songs. Enable LLM (--use-llm) to attempt auto-resolution.`,
    };
  }

  onProgress("\nTrack count mismatch detected!");
  onProgress(`Audio files: ${audioFileCount}, Setlist songs: ${setlistCount}`);

  // Display audio files found in archive
  onProgress("\nAudio files in archive:");
  manifest.audioFiles.forEach((file, idx) => {
    onProgress(`  ${idx + 1}. ${file}`);
  });

  // Display setlist for comparison
  const songsBySet = new Map<number, typeof setlist.songs>();
  for (const song of setlist.songs) {
    if (!songsBySet.has(song.set)) {
      songsBySet.set(song.set, []);
    }
    songsBySet.get(song.set)!.push(song);
  }

  onProgress("\nSetlist from API:");
  for (const [setNum, songs] of Array.from(songsBySet.entries()).sort((a, b) => a[0] - b[0])) {
    const setName = setNum === 3 ? 'Encore' : `Set ${setNum}`;
    onProgress(`  ${setName}:`);
    for (const song of songs) {
      onProgress(`    ${song.position}. ${song.title}`);
    }
  }

  onProgress("\nUsing LLM to analyze mismatch...");

  const llmService = createLLMService(config.llm);
  if (!llmService) {
    return {
      canProceed: false,
      manifest,
      reason: "LLM service could not be created.",
    };
  }

  // Step 4: Run LLM analysis on filenames
  const suggestion = await llmService.resolveSetlistMismatch({
    audioFiles: manifest.audioFiles,
    setlist: setlist.songs.map((s) => ({
      title: s.title,
      set: s.set,
      position: s.position,
    })),
    fileCount: audioFileCount,
    setlistCount,
  });

  // Always display LLM analysis (even if low confidence)
  onProgress("\n" + "=".repeat(60));
  onProgress("LLM Analysis:");
  onProgress("=".repeat(60));
  onProgress(suggestion.reasoning);
  onProgress(`Confidence: ${(suggestion.confidence * 100).toFixed(0)}%`);
  onProgress("=".repeat(60));

  // Check if LLM can provide an automatic solution
  const hasSplits = suggestion.splits && suggestion.splits.length > 0;
  const hasMerges = suggestion.merges && suggestion.merges.length > 0;
  const fewerFilesNoSolution = audioFileCount < setlistCount && !hasMerges;
  const countsMatch = audioFileCount === setlistCount;

  // Can only proceed automatically if:
  // 1. LLM has a valid solution (merges for MORE_FILES, or counts already match)
  // 2. No splits suggested
  // 3. High confidence (>= 0.5)
  const canProceedAutomatically = (hasMerges || countsMatch) && !hasSplits && !fewerFilesNoSolution && suggestion.confidence >= 0.5;

  // Always prompt user if we can't proceed automatically
  const needsUserInput = !canProceedAutomatically;

  if (needsUserInput) {
    // LLM couldn't figure it out OR suggested splits - ask user for instructions in interactive mode
    if (!flags.batch && !flags["dry-run"]) {
      if (suggestion.splits && suggestion.splits.length > 0) {
        onProgress("\nLLM suggests splitting files, but timestamps cannot be determined automatically.");
        onProgress("You can provide alternative instructions (e.g., remove songs from setlist, merge files instead).");
      } else if (suggestion.confidence < 0.5) {
        onProgress("\nLLM analysis has low confidence. You can provide manual instructions.");
      } else {
        onProgress("\nLLM could not determine how to resolve the mismatch. You can provide manual instructions.");
      }

      onProgress("Examples:");
      onProgress("  - 'remove drum solo from setlist'");
      onProgress("  - 'remove maddy jam, merge tracks 4 and 5'");
      onProgress("  - 'merge tracks 1, 2, 3'");
      onProgress("  - 'split track 5 at 3:30'");
      onProgress("  - or just press Enter to skip");

      const rl = readline.createInterface({ input: stdin, output: stdout });
      const userInstructions = await rl.question("\nEnter instructions: ");
      rl.close();

      if (userInstructions && userInstructions.trim().length > 0) {
        onProgress("\nParsing your instructions...");
        const parsedSuggestion = await llmService.parseCombinedInstructions({
          userInstructions: userInstructions.trim(),
          audioFiles: manifest.audioFiles,
          setlist: setlist.songs.map((s) => ({
            title: s.title,
            set: s.set,
            position: s.position,
          })),
          fileCount: audioFileCount,
          setlistCount,
        });

        onProgress("\n" + "=".repeat(60));
        onProgress("Parsed Instructions:");
        onProgress("=".repeat(60));
        onProgress(parsedSuggestion.reasoning);
        onProgress(`Confidence: ${(parsedSuggestion.confidence * 100).toFixed(0)}%`);
        onProgress("=".repeat(60));

        if (parsedSuggestion.confidence >= 0.5) {
          // Check for splits
          if (parsedSuggestion.splits && parsedSuggestion.splits.length > 0) {
            return {
              canProceed: false,
              manifest,
              reason: "Your instructions include track splits, but timestamps cannot be applied automatically. Please use the --split flag with manual extraction.",
            };
          }

          // Apply setlist modifications if present
          let resultSetlist = parsedSuggestion.modifiedSetlist;
          if (resultSetlist) {
            onProgress(`\n✓ Setlist modified: ${resultSetlist.length} songs`);
          }

          // Use parsed merges
          if (parsedSuggestion.merges && parsedSuggestion.merges.length > 0) {
            onProgress(`✓ Will apply ${parsedSuggestion.merges.length} merge(s)`);
          }

          // If we have either setlist modifications or merges, we can proceed
          if (resultSetlist || (parsedSuggestion.merges && parsedSuggestion.merges.length > 0)) {
            return {
              canProceed: true,
              manifest,
              plannedMerges: parsedSuggestion.merges,
              modifiedSetlist: resultSetlist,
            };
          }
        } else {
          onProgress("\nCould not parse your instructions. Please check the format and try again.");
        }
      }
    }

    // Failed to get valid user input or in batch mode
    if (suggestion.splits && suggestion.splits.length > 0) {
      return {
        canProceed: false,
        manifest,
        reason: "LLM suggested track splits, but timestamps cannot be determined automatically. Manual splitting required.",
      };
    }

    // Determine reason for failure (only reached if batch mode or no user input)
    let reason: string;
    if (flags.batch) {
      reason = `Cannot proceed in batch mode: LLM could not resolve mismatch automatically (${audioFileCount} files vs ${setlistCount} songs).`;
    } else {
      reason = `Cannot proceed: No valid instructions provided.`;
    }

    return {
      canProceed: false,
      manifest,
      reason,
    };
  }

  if (suggestion.merges && suggestion.merges.length > 0) {
    onProgress(`\n✓ LLM suggests merging ${suggestion.merges.length} track group(s):`);
    for (const merge of suggestion.merges) {
      const trackNums = merge.tracks.map((t) => `Track ${t}`).join(" + ");
      onProgress(`  - ${trackNums}`);
    }

    // Ask user for confirmation in interactive mode
    if (!flags.batch && !flags["dry-run"]) {
      const confirmed = await confirmLLMSuggestion("\nApply these merges during extraction?");
      if (!confirmed) {
        return {
          canProceed: false,
          manifest,
          reason: "User declined LLM merge suggestions.",
        };
      }
    }

    // Convert LLM suggestions to merge format
    const plannedMerges = suggestion.merges.map((m) => ({
      tracks: m.tracks,
    }));

    return {
      canProceed: true,
      manifest,
      plannedMerges,
    };
  }

  // No merges or splits suggested - counts don't match for another reason
  return {
    canProceed: false,
    manifest,
    reason: "LLM could not determine how to resolve track count mismatch.",
  };
}

async function processSingleArchive(
  zipPath: string,
  flags: CliFlags,
  config: Config,
  onProgress: ProgressCallback
): Promise<IngestResult> {
  // Step 1: Parse show info from filename/directory name
  let nameToParse;
  const stats = await fs.stat(zipPath);
  if (stats.isDirectory()) {
    // Use the directory's own name for parsing
    nameToParse = path.basename(zipPath);
  } else {
    // Use the archive filename for parsing
    nameToParse = path.basename(zipPath);
  }

  const parsed = parseZipFilename(nameToParse);
  const showInfo: ShowInfo = {
    artist: flags.artist ?? parsed.artist ?? "Unknown Artist",
    date: flags.date ?? parsed.date ?? "Unknown",
    venue: flags.venue ?? parsed.venue ?? "Unknown Venue",
    city: flags.city ?? parsed.city ?? "Unknown City",
    state: flags.state ?? parsed.state ?? "",
  };

  // Track extracted setlist from identification (Phase 2)
  let extractedSetlist: SetlistSong[] | undefined;
  let extractedSetlistConfidence: number | undefined;

  // Step 2: Run identification strategies FIRST if artist, date, or venue unknown
  // This allows ArchiveStructureStrategy to extract info before prompting user
  const needsIdentification =
    showInfo.artist === "Unknown Artist" ||
    showInfo.date === "Unknown" ||
    showInfo.date === "" ||
    !showInfo.venue;

  if (needsIdentification) {
    onProgress("\nRunning show identification strategies...");

    // CLI flags override config.enabled settings
    const shouldUseLlm = flags["use-llm"] || (config.llm?.enabled ?? false);
    const shouldUseWeb = flags["use-web"] || (config.webSearch?.enabled ?? false);

    // Create services if enabled
    const llmService = shouldUseLlm && config.llm ? createLLMService(config.llm) ?? undefined : undefined;
    const webSearchService = shouldUseWeb && config.webSearch ? createWebSearchService(config.webSearch) : undefined;

    // Create orchestrator and register strategies
    const orchestrator = new ShowIdentificationOrchestrator();

    // Register archive structure strategy first (highest priority) if LLM enabled
    if (shouldUseLlm && llmService) {
      orchestrator.registerStrategy(new ArchiveStructureStrategy());
    }

    orchestrator.registerStrategy(new FilenameStrategy());
    orchestrator.registerStrategy(new AudioFileListStrategy());

    // Register web search strategy if enabled
    if (shouldUseWeb && webSearchService) {
      orchestrator.registerStrategy(new WebSearchStrategy());
    }

    // Run identification
    const identificationResults = await orchestrator.identifyShow(
      zipPath,
      config,
      llmService,
      webSearchService
    );

    if (identificationResults.length > 0) {
      // Present results to user (or auto-select if high confidence)
      let selectedInfo: Partial<ShowInfo> | undefined;
      let selectedResult: ShowIdentificationResult | undefined;

      if (flags.batch || flags["dry-run"]) {
        // Batch/dry-run: auto-select highest confidence
        selectedResult = identificationResults[0];
        selectedInfo = selectedResult.showInfo;
        onProgress(`Auto-selected (${selectedResult.confidence}% confidence): ${selectedResult.source}`);
      } else {
        // Interactive: present options
        selectedInfo = await presentIdentificationResults(identificationResults, zipPath);
        // Find which result was selected
        selectedResult = identificationResults.find(r =>
          r.showInfo.artist === selectedInfo?.artist &&
          r.showInfo.date === selectedInfo?.date
        );
      }

      // Capture extracted setlist from selected result (Phase 2)
      if (selectedResult?.extractedSetlist && selectedResult.extractedSetlist.length > 0) {
        extractedSetlist = selectedResult.extractedSetlist;
        extractedSetlistConfidence = selectedResult.confidence / 100; // Convert from 0-100 to 0-1
        onProgress(`✓ Extracted setlist from archive (${selectedResult.extractedSetlist.length} songs)`);
      }

      // Apply selected info
      if (selectedInfo) {
        if (selectedInfo.artist) showInfo.artist = selectedInfo.artist;
        if (selectedInfo.date) showInfo.date = selectedInfo.date;
        if (selectedInfo.venue) showInfo.venue = selectedInfo.venue;
        if (selectedInfo.city) showInfo.city = selectedInfo.city;
        if (selectedInfo.state) showInfo.state = selectedInfo.state;
        if (selectedInfo.country) showInfo.country = selectedInfo.country;

        onProgress(`Using identified show: ${showInfo.artist} - ${showInfo.date}`);
      }
    } else {
      onProgress("No identification strategies found a match.");
    }
  }

  // Step 3: Prompt for artist if still unknown (after identification)
  if (showInfo.artist === "Unknown Artist") {
    onProgress("Artist not determined from filename/path or archive structure");

    if (!flags.batch && !flags["dry-run"]) {
      showInfo.artist = await promptForArtist(config);
      onProgress(`Using artist: ${showInfo.artist}`);
    } else {
      throw new Error(
        "Artist could not be determined. Please specify with --artist flag or include artist in filename."
      );
    }
  }

  // Step 4: Resolve band config
  const bandConfig = resolveBandConfig(config, showInfo.artist);

  // Use the band's display name if specified in config
  if (bandConfig.name) {
    showInfo.artist = bandConfig.name;
  }

  // Step 5: Prompt for date if still unknown (after identification)
  if (showInfo.date === "Unknown" || showInfo.date === "") {
    if (!flags.batch && !flags["dry-run"]) {
      // Interactive mode - prompt user
      showInfo.date = await promptForDate();
      onProgress(`Using date: ${showInfo.date}`);
    } else {
      throw new Error(
        "Show date could not be determined. Please specify with --date flag or include date in filename."
      );
    }
  }

  // Step 6: Fetch setlist early (now that we have artist + date)
  // This gives us complete venue info to show the user
  // Phase 2: If we have an extracted setlist from archive, pass it to fetchSetlist
  onProgress("\nFetching setlist...");
  const setlist = await fetchSetlist(
    showInfo,
    bandConfig,
    config,
    extractedSetlist,
    extractedSetlistConfidence
  );

  // Update showInfo with details from API (more accurate than filename parsing or LLM extraction)
  // CLI flags still take precedence
  // Note: Artist name corrections are handled by setlist transforms (see src/setlist/transforms.ts)

  // Update artist if API provides a different name (transforms have already been applied)
  if (!flags.artist && setlist.artist && setlist.artist !== showInfo.artist) {
    onProgress(`✓ Artist refined by API: "${showInfo.artist}" → "${setlist.artist}"`);
    showInfo.artist = setlist.artist;

    // Re-resolve band config with corrected artist name
    const correctedBandConfig = resolveBandConfig(config, showInfo.artist);
    if (correctedBandConfig.name) {
      showInfo.artist = correctedBandConfig.name;
    }
    // Update bandConfig for rest of pipeline
    Object.assign(bandConfig, correctedBandConfig);
  }

  if (!flags.venue && setlist.venue) {
    showInfo.venue = setlist.venue;
  }
  if (!flags.city && setlist.city) {
    showInfo.city = setlist.city;
  }
  if (!flags.state && setlist.state) {
    showInfo.state = setlist.state;
  }
  if (setlist.country) {
    showInfo.country = setlist.country;
  }

  // Show complete venue information
  const locationDisplay = showInfo.country && !(/^[A-Z]{2}$/i.test(showInfo.state))
    ? `${showInfo.city}, ${showInfo.country}`
    : `${showInfo.city}, ${showInfo.state}`;

  onProgress(`\nShow: ${showInfo.artist}`);
  onProgress(`Date: ${showInfo.date}`);
  onProgress(`Venue: ${showInfo.venue}, ${locationDisplay}`);

  // Display fetched setlist with songs
  const setCount = new Set(setlist.songs.map((s) => s.set)).size;
  onProgress(`\nSetlist from ${setlist.source} (${setlist.songs.length} song(s) across ${setCount} set(s)):`);
  if (setlist.url) {
    onProgress(`URL: ${setlist.url}`);
  }

  // Group songs by set
  const songsBySet = new Map<number, typeof setlist.songs>();
  for (const song of setlist.songs) {
    if (!songsBySet.has(song.set)) {
      songsBySet.set(song.set, []);
    }
    songsBySet.get(song.set)!.push(song);
  }

  // Display songs by set
  for (const [setNum, songs] of Array.from(songsBySet.entries()).sort((a, b) => a[0] - b[0])) {
    const setName = setNum === 3 ? 'Encore' : `Set ${setNum}`;
    onProgress(`\n  ${setName}:`);
    for (const song of songs) {
      onProgress(`    ${song.position}. ${song.title}`);
    }
  }

  // Step 5: Pre-flight validation (scan archive, check counts, plan merges)
  const preflight = await preflightValidation(zipPath, setlist, config, bandConfig, flags, onProgress);

  // Display text files found in archive (for comparison with fetched setlist)
  if (preflight.manifest && Object.keys(preflight.manifest.textFiles).length > 0) {
    onProgress("\n" + "=".repeat(60));
    onProgress("Text Files Found in Archive:");
    onProgress("=".repeat(60));
    for (const [filename, content] of Object.entries(preflight.manifest.textFiles)) {
      onProgress(`\n--- ${filename} ---`);
      // Truncate very long files
      const displayContent = content.length > 1000
        ? content.substring(0, 1000) + "\n... (truncated)"
        : content;
      onProgress(displayContent);
    }
    onProgress("=".repeat(60));
  }

  if (!preflight.canProceed) {
    throw new Error(preflight.reason || "Pre-flight validation failed");
  }

  // Apply modified setlist if user provided one
  if (preflight.modifiedSetlist) {
    onProgress("\nApplying modified setlist...");
    setlist.songs = preflight.modifiedSetlist;
    onProgress(`Updated setlist: ${setlist.songs.length} song(s)`);

    // Display the modified setlist
    const songsBySet = new Map<number, typeof setlist.songs>();
    for (const song of setlist.songs) {
      if (!songsBySet.has(song.set)) {
        songsBySet.set(song.set, []);
      }
      songsBySet.get(song.set)!.push(song);
    }

    for (const [setNum, songs] of Array.from(songsBySet.entries()).sort((a, b) => a[0] - b[0])) {
      const setName = setNum === 3 ? 'Encore' : `Set ${setNum}`;
      onProgress(`  ${setName}:`);
      for (const song of songs) {
        onProgress(`    ${song.position}. ${song.title}`);
      }
    }
  }

  // Step 6: Prepare working directory (extract archive or use directory)
  onProgress("\nPreparing working directory...");
  const workingDir = await extractArchive(zipPath, onProgress);
  // Keep track of original source directory for non-audio files
  let sourceDir = workingDir.path;

  // Step 5b: If --dir is specified, navigate to subdirectory
  if (flags.dir) {
    const subdir = path.join(workingDir.path, flags.dir);
    try {
      const stats = await fs.stat(subdir);
      if (!stats.isDirectory()) {
        throw new Error(`--dir "${flags.dir}" exists but is not a directory`);
      }
      onProgress(`Using subdirectory: ${flags.dir}`);
      workingDir.path = subdir;
      sourceDir = subdir;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(`Subdirectory "${flags.dir}" not found in archive`);
      }
      throw error;
    }
  }

  // Step 6a: LLM-assisted structure analysis (if enabled and --dir not specified)
  const extractedRoot = workingDir.path; // Save original extraction root
  let supplementaryFilePaths: string[] = []; // Paths to supplementary files identified by LLM

  // Check if LLM is enabled for structure analysis
  const shouldUseLlm = flags["use-llm"] || (config.llm?.enabled ?? false);
  const llmService = shouldUseLlm && config.llm ? createLLMService(config.llm) ?? undefined : undefined;

  if (!flags.dir && shouldUseLlm && config.llm && llmService) {
    // Optimization: Skip LLM if archive has no subdirectories
    const hasSubdirectories = await checkForSubdirectories(
      workingDir.path,
      config.ignoreFilePatterns
    );

    if (!hasSubdirectories) {
      onProgress("\nArchive has flat structure (no subdirectories), using root");
    } else {
      onProgress("\nAnalyzing archive structure with LLM...");

      try {
        // Build directory tree
        const directoryTree = await buildDirectoryTree(
          workingDir.path,
          config.ignoreFilePatterns,
          5 // Max depth 5
        );

        const analysis = await llmService.analyzeArchiveStructure({
          archiveName: path.basename(zipPath),
          directoryTreeText: formatDirectoryTree(directoryTree, 5),
          audioExtensions: Array.from(getAudioExtensions()),
          excludePatterns: config.ignoreFilePatterns,
          totalFiles: countNodes(directoryTree, "file"),
          totalAudioFiles: countAudioNodes(directoryTree),
        });

        // Display analysis
        onProgress(`  Confidence: ${(analysis.confidence * 100).toFixed(0)}%`);
        onProgress(`  ${analysis.reasoning}`);

        if (analysis.warnings && analysis.warnings.length > 0) {
          for (const warning of analysis.warnings) {
            onProgress(`  ⚠️  ${warning}`);
          }
        }

        // Apply suggestion if high confidence
        if (analysis.confidence >= 0.7) {
          const musicDir = path.join(workingDir.path, analysis.musicDirectory);

          // Verify directory exists
          try {
            const stats = await fs.stat(musicDir);
            if (stats.isDirectory()) {
              if (analysis.musicDirectory !== ".") {
                onProgress(`  ✓ Using music directory: ${analysis.musicDirectory}`);
                workingDir.path = musicDir;
                sourceDir = musicDir;
              } else {
                onProgress(`  ✓ Using root directory for music`);
              }

              // Store supplementary file paths for later
              if (analysis.supplementaryFiles.length > 0) {
                supplementaryFilePaths = analysis.supplementaryFiles.map((f: string) =>
                  path.join(extractedRoot, f)
                );
                onProgress(`  ✓ Identified ${supplementaryFilePaths.length} supplementary file(s)`);
              }
            } else {
              onProgress(`  ⚠️  Suggested path is not a directory, using root`);
            }
          } catch {
            onProgress(`  ⚠️  Suggested directory doesn't exist, using root`);
          }
        } else {
          onProgress(
            `  ⚠️  Low confidence (${(analysis.confidence * 100).toFixed(0)}%), using root directory`
          );
        }
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onProgress(`  ⚠️  Structure analysis failed: ${msg}`);
        onProgress(`  Using root directory`);
      }
    }
  }

  try {
    // Step 7: List audio files
    let audioFiles = await listAudioFiles(workingDir.path, config.ignoreFilePatterns);
    if (audioFiles.length === 0) {
      throw new Error("No audio files found in archive");
    }
    onProgress(`\nFound ${audioFiles.length} audio file(s)`);

    // Step 5: If merging or splitting is needed and we're in a source directory (not temp),
    // copy to temp first to avoid modifying user's files
    const needsManualMerge = flags.merge && flags.merge.length > 0;
    const needsPlannedMerge = preflight.plannedMerges && preflight.plannedMerges.length > 0;
    const needsSplit = flags.split && flags.split.length > 0;
    const needsMerge = needsManualMerge || needsPlannedMerge;

    if ((needsMerge || needsSplit) && !workingDir.shouldCleanup) {
      onProgress("\nCopying to temp directory for merging/splitting...");
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-music-"));

      // Copy all files to temp
      for (const audioFile of audioFiles) {
        const destPath = path.join(tmpDir, path.basename(audioFile));
        onProgress(`  Copying: ${path.basename(audioFile)}`);
        await fs.copyFile(audioFile, destPath);
      }

      // Update paths and working directory
      audioFiles = audioFiles.map(f => path.join(tmpDir, path.basename(f)));
      workingDir.path = tmpDir;
      workingDir.shouldCleanup = true;
    }

    // Step 6a: Apply track merges (BEFORE splits and analysis)
    // Apply both planned merges (from LLM pre-flight) and manual merges (from flags)
    if (needsMerge) {
      try {
        const merges: Array<{ tracks: Array<{ set: number; track: number }> }> = [];

        // Add planned merges from LLM pre-flight analysis
        if (needsPlannedMerge) {
          onProgress("\nApplying LLM-suggested merges...");
          for (const merge of preflight.plannedMerges!) {
            merges.push({
              tracks: merge.tracks.map((trackNum) => ({ set: 1, track: trackNum })),
            });
          }
        }

        // Add manual merges from command-line flags
        if (needsManualMerge) {
          onProgress("\nApplying manual merges...");
          merges.push(...flags.merge!.map(parseMergeSpec));
        }

        audioFiles = await applyMergesToFiles(
          audioFiles,
          merges,
          onProgress
        );
        onProgress(`After merges: ${audioFiles.length} audio file(s)`);
      } catch (error) {
        throw new Error(
          `Failed to apply track merges: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Step 6b: Apply track splits if specified (AFTER merges, BEFORE analysis)
    if (needsSplit) {
      try {
        const splits = flags.split!.map(parseSplitSpec);
        audioFiles = await applySplitsToFiles(
          audioFiles,
          splits,
          onProgress
        );
        onProgress(`After splits: ${audioFiles.length} audio file(s)`);
      } catch (error) {
        throw new Error(
          `Failed to apply track splits: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    // Step 7: Analyze audio files (including any merged/split parts)
    onProgress("\nAnalyzing audio...");
    let audioInfos = await analyzeAllAudio(audioFiles, onProgress);

    // Capture source format from first file (before conversion)
    const firstFile = audioInfos[0];
    const sourceFormat: SourceFormatInfo | undefined = firstFile ? {
      codec: firstFile.codec ?? path.extname(firstFile.filePath).substring(1).toUpperCase(),
      container: firstFile.container,
      bitsPerSample: firstFile.bitsPerSample ?? 16,
      sampleRate: firstFile.sampleRate ?? 44100,
      lossless: isLosslessFormat(firstFile.filePath),
    } : undefined;

    // Display source format info
    if (sourceFormat) {
      const codecDisplay = sourceFormat.container
        ? `${sourceFormat.codec} (${sourceFormat.container})`
        : sourceFormat.codec;
      const formatDesc = `${codecDisplay}, ${sourceFormat.bitsPerSample}-bit/${(sourceFormat.sampleRate / 1000).toFixed(1)}kHz, ${sourceFormat.lossless ? "lossless" : "lossy"}`;
      onProgress(`  Source format: ${formatDesc}`);
    }

    // Step 8: Convert if needed (creates temp dir if needed)
    onProgress("\nChecking conversion requirements...");

    // Determine conversion rule before converting
    let conversionApplied: string | undefined = undefined;
    if (firstFile && !flags["skip-conversion"]) {
      const rule = findMatchingRule(firstFile);
      if (ruleRequiresConversion(rule)) {
        conversionApplied = rule.name;
        if (rule.description) {
          conversionApplied += ` - ${rule.description}`;
        }
      }
    }

    const conversionResult = await convertAllIfNeeded(
      audioInfos,
      workingDir,
      bandConfig,
      flags["skip-conversion"],
      onProgress
    );
    audioInfos = conversionResult.audioInfos;
    // Update working directory if conversion created a temp dir
    Object.assign(workingDir, conversionResult.workingDir);

    // Step 9: Match tracks to setlist
    onProgress("\nMatching tracks to setlist...");
    let matched: MatchedTrack[];

    try {
      matched = matchTracks(audioInfos, setlist.songs, bandConfig.encoreInSet2);
    } catch (error) {
      // If pre-flight already analyzed and applied merges, matching should succeed
      // If we're here with a mismatch after pre-flight, something unexpected happened
      if (preflight.plannedMerges && preflight.plannedMerges.length > 0) {
        throw new Error(
          `Track matching failed even after applying LLM-suggested merges. ` +
          `This may indicate the LLM analysis was incorrect or audio files don't match the suggested pattern. ` +
          `Original error: ${error instanceof Error ? error.message : String(error)}`
        );
      }

      // Fallback: Handle track count mismatch with LLM assistance
      // This only happens for archives that couldn't be scanned in pre-flight (tar.gz, rar, etc.)
      const shouldUseLlm = flags["use-llm"] || (config.llm?.enabled ?? false);
      if (error instanceof TrackCountMismatchError && shouldUseLlm && config.llm) {
        onProgress("\nTrack count mismatch detected!");
        onProgress(`Audio files: ${error.audioFiles.length}, Setlist songs: ${error.songs.length}`);
        onProgress("\nUsing LLM to analyze mismatch...");

        const llmService = createLLMService(config.llm);
        if (llmService) {
          const suggestion = await llmService.resolveSetlistMismatch({
            audioFiles: error.audioFiles.map((f) => path.basename(f.filePath)),
            setlist: error.songs.map((s) => ({
              title: s.title,
              set: s.set,
              position: s.position,
            })),
            fileCount: error.audioFiles.length,
            setlistCount: error.songs.length,
          });

          if (suggestion.confidence > 0.5) {
            onProgress("\n" + "=".repeat(60));
            onProgress("LLM Analysis:");
            onProgress("=".repeat(60));
            onProgress(suggestion.reasoning);
            onProgress(`Confidence: ${(suggestion.confidence * 100).toFixed(0)}%`);
            onProgress("=".repeat(60));

            // Check for split suggestions - we can't handle these automatically
            if (suggestion.splits && suggestion.splits.length > 0) {
              onProgress("\n❌ LLM suggested track splits, but timestamps cannot be determined automatically.");
              onProgress("Track splitting requires manual intervention with --split flag.");
              throw error; // Can't proceed
            }

            // Handle merge suggestions
            if (suggestion.merges && suggestion.merges.length > 0) {
              onProgress(`\n✓ LLM suggests merging ${suggestion.merges.length} track group(s):`);
              for (const merge of suggestion.merges) {
                const trackNums = merge.tracks.map(t => `Track ${t}`).join(" + ");
                onProgress(`  - ${trackNums}`);
              }

              // Prompt user to confirm
              if (!flags.batch && !flags["dry-run"]) {
                const confirmed = await confirmLLMSuggestion("\nApply these merges and retry matching?");

                if (!confirmed) {
                  onProgress("Merge suggestions rejected.");
                  throw error;
                }
              } else {
                onProgress("\n✓ Auto-applying merges in batch/dry-run mode...");
              }

              // Apply merges to audio files
              onProgress("\nApplying merges...");
              try {
                // Convert LLM suggestions to TrackMerge format
                const mergeSpecs = suggestion.merges.map(m => ({
                  tracks: m.tracks.map(trackNum => ({
                    set: 1, // Assume all in set 1 (LLM doesn't know about sets)
                    track: trackNum
                  }))
                }));

                // Extract file paths from AudioInfo
                const filePaths = audioInfos.map(a => a.filePath);

                // Apply merges and get new file paths
                const mergedFilePaths = await applyMergesToFiles(filePaths, mergeSpecs, onProgress);

                // Re-analyze audio files to get new AudioInfo array
                audioInfos = await analyzeAllAudio(mergedFilePaths, onProgress);

                // Retry matching with merged files
                onProgress("\nRetrying track matching with merged files...");
                matched = matchTracks(audioInfos, setlist.songs, bandConfig.encoreInSet2);
                onProgress("✓ Matching successful after applying merges!");

              } catch (mergeError) {
                onProgress(`\n❌ Failed to apply merges: ${mergeError instanceof Error ? mergeError.message : String(mergeError)}`);
                throw error; // Re-throw original error
              }
            } else {
              onProgress("\n❌ LLM did not suggest any actionable operations.");
              throw error;
            }
          } else {
            onProgress(`\n❌ LLM could not suggest operations (confidence: ${(suggestion.confidence * 100).toFixed(0)}%)`);
            throw error;
          }
        } else {
          throw error; // LLM service creation failed
        }
      } else {
        // Either not a mismatch error, or LLM not enabled
        throw error;
      }
    }

    printMatchPreview(matched, onProgress);

    // Compute library path (sanitize values to avoid path issues - slashes → dashes)
    const sanitizedCity = sanitizeFilename(showInfo.city);
    const sanitizedState = sanitizeFilename(showInfo.state);
    const sanitizedCountry = showInfo.country ? sanitizeFilename(showInfo.country) : undefined;

    // Build location: "City, ST" for US, "City, Country" for international, or just "City"
    let location: string;
    if (sanitizedState && /^[A-Z]{2}$/i.test(showInfo.state.trim())) {
      // US show - include state
      location = `${sanitizedCity}, ${sanitizedState}`;
    } else if (sanitizedCountry) {
      // International show with country - include country
      location = `${sanitizedCity}, ${sanitizedCountry}`;
    } else {
      // Fallback - just city
      location = sanitizedCity;
    }

    const targetDir = path.join(
      config.libraryBasePath,
      renderTemplate(bandConfig.targetPathTemplate, {
        artist: sanitizeFilename(showInfo.artist),
        date: showInfo.date,
        venue: sanitizeFilename(showInfo.venue),
        city: sanitizedCity,
        state: sanitizedState,
        location: location,
      })
    );

    // Check for existing shows BEFORE confirmation
    const existingShows = await findExistingShows(targetDir, showInfo.date, onProgress);
    if (existingShows.length > 0) {
      onProgress("\n⚠️  WARNING: Potentially duplicate show(s) found:");
      for (const show of existingShows) {
        onProgress(`  - ${show}`);
      }
    }

    // Step 10: Interactive confirmation
    if (!flags["dry-run"] && !flags.batch) {
      const confirmed = await confirmContinue();
      if (!confirmed) {
        onProgress("Aborted by user.");
        return {
          zipPath,
          showInfo,
          tracksProcessed: 0,
          libraryPath: "",
          dryRun: false,
        };
      }
    }

    if (flags["dry-run"]) {
      onProgress("\n--- DRY RUN ---");
      const nonAudioFiles = await listNonAudioFiles(sourceDir, config.ignoreFilePatterns);
      printTagsSummary(matched, showInfo, bandConfig, onProgress);
      printDryRun(matched, showInfo, bandConfig, targetDir, nonAudioFiles, onProgress);
      return {
        zipPath,
        showInfo,
        tracksProcessed: matched.length,
        libraryPath: targetDir,
        dryRun: true,
      };
    }

    // Step 9b: Copy to temp if not already there (for tagging)
    if (!workingDir.shouldCleanup) {
      // Not in temp yet - need to copy files before tagging
      onProgress("\nCopying files to temp directory for tagging...");
      const tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-music-"));

      // Copy all audio files
      for (const info of audioInfos) {
        const destPath = path.join(tmpDir, path.basename(info.filePath));
        await fs.copyFile(info.filePath, destPath);
      }

      // Update audio infos with new paths
      audioInfos = audioInfos.map(info => ({
        ...info,
        filePath: path.join(tmpDir, path.basename(info.filePath))
      }));

      // Update working directory
      workingDir.path = tmpDir;
      workingDir.shouldCleanup = true;

      // Update matched tracks with new paths
      matched.forEach(m => {
        m.audioFile.filePath = path.join(tmpDir, path.basename(m.audioFile.filePath));
      });
    }

    // Step 11: Tag FLAC files
    onProgress("\nTagging files...");
    printTagsSummary(matched, showInfo, bandConfig, onProgress);
    await tagAllTracks(matched, showInfo, bandConfig, onProgress);

    // Step 12: Copy to library
    onProgress(`\nCopying to library: ${targetDir}`);
    await copyToLibrary(matched, showInfo, bandConfig, targetDir, onProgress);

    // Step 11b: Copy non-audio files (artwork, info.txt, etc.)
    // Collect all supplementary files to copy
    const allSupplementaryFiles: Array<{ fullPath: string; relativePath: string }> = [];

    // 1. Add LLM-identified supplementary files (if any)
    if (supplementaryFilePaths.length > 0) {
      for (const filePath of supplementaryFilePaths) {
        try {
          const stats = await fs.stat(filePath);
          if (stats.isFile()) {
            allSupplementaryFiles.push({
              fullPath: filePath,
              relativePath: path.basename(filePath), // Use just filename in target
            });
          }
        } catch {
          // Skip files that don't exist or can't be accessed
        }
      }
    }

    // 2. Add non-audio files from music directory
    const nonAudioFiles = await listNonAudioFiles(sourceDir, config.ignoreFilePatterns);
    allSupplementaryFiles.push(...nonAudioFiles);

    // Remove duplicates based on filename
    const uniqueFiles = new Map<string, { fullPath: string; relativePath: string }>();
    for (const file of allSupplementaryFiles) {
      const key = file.relativePath;
      if (!uniqueFiles.has(key)) {
        uniqueFiles.set(key, file);
      }
    }

    const filesToCopy = Array.from(uniqueFiles.values());
    if (filesToCopy.length > 0) {
      onProgress(`\nCopying ${filesToCopy.length} supplementary file(s)...`);
      await copyNonAudioFiles(filesToCopy, targetDir, onProgress);
    }

    // Step 11c: Generate and write log file
    onProgress("\nGenerating ingest log...");
    const logContent = generateLogContent(
      showInfo,
      setlist,
      matched,
      bandConfig,
      zipPath,
      nonAudioFiles,
      sourceFormat,
      conversionApplied
    );
    await writeLogFile(targetDir, logContent);
    onProgress(`  Created: ingest-log.md`);

    onProgress("\nDone!");
    return {
      zipPath,
      showInfo,
      tracksProcessed: matched.length,
      libraryPath: targetDir,
      dryRun: false,
    };
  } finally {
    // Step 13: Clean up temp directory (only if we created one)
    if (workingDir.shouldCleanup) {
      onProgress("\nCleaning up temp directory...");
      await cleanupTempDir(workingDir.path);
    }
  }
}

function printMatchPreview(
  matched: MatchedTrack[],
  onProgress: ProgressCallback
): void {
  onProgress("\nTrack matching preview:");
  for (const m of matched) {
    onProgress(
      `  Set ${m.effectiveSet}, Track ${zeroPad(m.trackInSet)}: ${m.song.title} <- ${path.basename(m.audioFile.filePath)}`
    );
  }
}

function printTagsSummary(
  matched: MatchedTrack[],
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  onProgress: ProgressCallback
): void {
  // Build common tags using first track for template vars
  const vars = buildTemplateVars(matched[0], showInfo);
  const album = sanitize(renderTemplate(bandConfig.albumTemplate, vars));
  const albumArtist = sanitize(renderTemplate(bandConfig.albumArtist, vars));
  const artist = sanitize(showInfo.artist);
  const genre = sanitize(bandConfig.genre);
  const year = showInfo.date.split("-")[0];

  onProgress("\nCommon tags:");
  onProgress(`  ARTIST: ${artist}`);
  onProgress(`  ALBUMARTIST: ${albumArtist}`);
  onProgress(`  ALBUM: ${album}`);
  onProgress(`  GENRE: ${genre}`);
  onProgress(`  DATE: ${year}`);

  onProgress("\nPer-track tags:");
  for (const m of matched) {
    const title = sanitize(m.song.title);
    const trackNum = zeroPad(m.trackInSet);
    const discNum = m.effectiveSet;
    onProgress(`  ${path.basename(m.audioFile.filePath)}: TITLE="${title}" TRACKNUMBER=${trackNum} DISCNUMBER=${discNum}`);
  }
}

function printDryRun(
  matched: MatchedTrack[],
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  targetDir: string,
  nonAudioFiles: Array<{ fullPath: string; relativePath: string }>,
  onProgress: ProgressCallback
): void {
  const fileNameTemplate = getFileNameTemplate(matched, bandConfig);
  onProgress(`Target directory: ${targetDir}`);
  onProgress("\nAudio files that would be created:");
  for (const m of matched) {
    const vars = buildTemplateVars(m, showInfo);
    const fileName = renderTemplate(fileNameTemplate, vars);
    onProgress(`  ${path.join(targetDir, fileName)}`);
  }
  if (nonAudioFiles.length > 0) {
    onProgress("\nSupplementary files that would be copied:");
    for (const f of nonAudioFiles) {
      onProgress(`  ${path.join(targetDir, f.relativePath)}`);
    }
  }
  onProgress(`\nLog file: ${path.join(targetDir, "ingest-log.md")}`);
}

async function copyToLibrary(
  matched: MatchedTrack[],
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  targetDir: string,
  onProgress: ProgressCallback
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });
  const fileNameTemplate = getFileNameTemplate(matched, bandConfig);

  for (const m of matched) {
    const vars = buildTemplateVars(m, showInfo);
    const fileName = renderTemplate(fileNameTemplate, vars);
    const destPath = path.join(targetDir, fileName);

    // Never overwrite existing files
    try {
      await fs.access(destPath);
      onProgress(`  SKIP (exists): ${fileName}`);
      continue;
    } catch {
      // File doesn't exist — proceed
    }

    onProgress(`  Copying: ${fileName}`);
    await fs.copyFile(m.audioFile.filePath, destPath);
  }
}

async function copyNonAudioFiles(
  files: Array<{ fullPath: string; relativePath: string }>,
  targetDir: string,
  onProgress: ProgressCallback
): Promise<void> {
  for (const file of files) {
    const destPath = path.join(targetDir, file.relativePath);
    const destDir = path.dirname(destPath);

    // Create directory structure if needed
    await fs.mkdir(destDir, { recursive: true });

    // Never overwrite existing files
    try {
      await fs.access(destPath);
      onProgress(`  SKIP (exists): ${file.relativePath}`);
      continue;
    } catch {
      // File doesn't exist — proceed
    }

    onProgress(`  Copying: ${file.relativePath}`);
    await fs.copyFile(file.fullPath, destPath);
  }
}

async function confirmContinue(): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(
      "\nProceed with tagging and copying? [y/N] "
    );
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

/**
 * Confirm an LLM suggestion with the user.
 */
async function confirmLLMSuggestion(question: string): Promise<boolean> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const answer = await rl.question(`\n${question} [y/N] `);
    return answer.trim().toLowerCase() === "y";
  } finally {
    rl.close();
  }
}

/**
 * Prompt the user for a show date.
 * Validates the format is YYYY-MM-DD.
 */
async function promptForDate(): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = await rl.question(
        "\nShow date could not be determined.\nPlease enter show date (YYYY-MM-DD): "
      );
      const trimmed = answer.trim();

      // Validate format
      if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
        // Basic validation - check if it's a reasonable date
        const [year, month, day] = trimmed.split("-").map(Number);
        if (year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31) {
          return trimmed;
        }
      }

      console.log("Invalid date format. Please use YYYY-MM-DD (e.g., 2024-08-16)");
    }
  } finally {
    rl.close();
  }
}

/**
 * Try to extract a date from audio file metadata.
 * Returns the first valid date found, or null if none.
 */
function extractDateFromMetadata(audioInfos: AudioInfo[]): string | null {
  for (const audio of audioInfos) {
    // Audio metadata might have a date field in the future
    // For now, this is a placeholder for potential enhancement
  }
  return null;
}

/**
 * Prompt the user to select an artist from configured bands.
 * If bands are configured, shows a numbered list for selection.
 * Otherwise, prompts for free text input.
 */
async function promptForArtist(config: Config): Promise<string> {
  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    const bandNames = Object.keys(config.bands || {});

    if (bandNames.length > 0) {
      // Show numbered list of bands
      console.log("\nSelect artist:");
      bandNames.forEach((key, index) => {
        // Use band's name field if specified, otherwise capitalize the key
        const bandConfig = config.bands[key];
        const displayName = bandConfig?.name ||
          key.split(' ')
            .map(w => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ');
        console.log(`  ${index + 1}. ${displayName}`);
      });
      console.log(`  ${bandNames.length + 1}. Other (enter custom name)`);

      while (true) {
        const answer = await rl.question("\nEnter selection (1-" + (bandNames.length + 1) + "): ");
        const selection = parseInt(answer.trim(), 10);

        if (selection >= 1 && selection <= bandNames.length) {
          return bandNames[selection - 1];
        } else if (selection === bandNames.length + 1) {
          // "Other" selected - prompt for custom name
          const customName = await rl.question("Enter artist name: ");
          const trimmed = customName.trim();
          if (trimmed) {
            return trimmed;
          }
          console.log("Artist name cannot be empty");
        } else {
          console.log(`Invalid selection. Please enter a number between 1 and ${bandNames.length + 1}`);
        }
      }
    } else {
      // No bands configured - just prompt for text
      while (true) {
        const answer = await rl.question("\nEnter artist name: ");
        const trimmed = answer.trim();
        if (trimmed) {
          return trimmed;
        }
        console.log("Artist name cannot be empty");
      }
    }
  } finally {
    rl.close();
  }
}
