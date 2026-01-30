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
} from "./config/types.js";
import { loadConfig, resolveBandConfig } from "./config/config.js";
import { parseZipFilename } from "./matching/parse-filename.js";
import { extractArchive, listAudioFiles, listNonAudioFiles, cleanupTempDir, isArchive } from "./utils/extract.js";
import { verifyRequiredTools } from "./utils/startup.js";
import { analyzeAllAudio, convertAllIfNeeded } from "./audio/audio.js";
import { applySplitsToFiles, parseSplitSpec, applyMergesToFiles, parseMergeSpec } from "./audio/split.js";
import { fetchSetlist } from "./setlist/setlist.js";
import { matchTracks } from "./matching/match.js";
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

  if (flags.batch) {
    return processBatch(zipPath, flags, config, onProgress);
  }
  return [await processSingleArchive(zipPath, flags, config, onProgress)];
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

async function processSingleArchive(
  zipPath: string,
  flags: CliFlags,
  config: Config,
  onProgress: ProgressCallback
): Promise<IngestResult> {
  // Step 1: Parse show info from filename/directory name
  // For directories, parse the parent directory name (which usually has show info)
  // For archives, parse the archive filename
  let nameToParse;
  const stats = await fs.stat(zipPath);
  if (stats.isDirectory()) {
    // Use parent directory name for parsing (e.g., "King Gizzard... - Live in Berlin '25")
    // The subdirectory (e.g., "SOUNDBOARD MIX") usually doesn't have show info
    const parent = path.dirname(zipPath);
    nameToParse = path.basename(parent);
  } else {
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

  // Prompt for artist if unknown
  if (showInfo.artist === "Unknown Artist") {
    onProgress("Artist not determined from filename/path");

    if (!flags.batch && !flags["dry-run"]) {
      showInfo.artist = await promptForArtist(config);
      onProgress(`Using artist: ${showInfo.artist}`);
    } else {
      throw new Error(
        "Artist could not be determined. Please specify with --artist flag or include artist in filename."
      );
    }
  }

  // Step 2: Resolve band config
  const bandConfig = resolveBandConfig(config, showInfo.artist);

  // Use the band's display name if specified in config
  if (bandConfig.name) {
    showInfo.artist = bandConfig.name;
  }

  // Step 3: Determine show date early (before processing files)
  // We need date + artist to fetch setlist
  if (showInfo.date === "Unknown" || showInfo.date === "") {
    onProgress("\nShow date not determined from filename/path");

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

  // Step 4: Fetch setlist early (now that we have artist + date)
  // This gives us complete venue info to show the user
  onProgress("\nFetching setlist...");
  const setlist = await fetchSetlist(showInfo, bandConfig, config);

  // Update showInfo with venue details from API (more accurate than filename parsing)
  // CLI flags still take precedence
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
  onProgress(`Setlist: ${setlist.songs.length} song(s) across ${new Set(setlist.songs.map((s) => s.set)).size} set(s)`);
  if (setlist.url) {
    onProgress(`Setlist URL: ${setlist.url}`);
  }

  // Step 5: Prepare working directory (extract archive or use directory)
  onProgress("\nPreparing working directory...");
  const workingDir = await extractArchive(zipPath, onProgress);

  try {
    // Step 4: List audio files
    let audioFiles = await listAudioFiles(workingDir.path, bandConfig.excludePatterns ?? []);
    if (audioFiles.length === 0) {
      throw new Error("No audio files found in archive");
    }
    onProgress(`\nFound ${audioFiles.length} audio file(s)`);

    // Step 5: If merging or splitting is needed and we're in a source directory (not temp),
    // copy to temp first to avoid modifying user's files
    const needsMerge = flags.merge && flags.merge.length > 0;
    const needsSplit = flags.split && flags.split.length > 0;
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

    // Step 6a: Apply track merges if specified (BEFORE splits and analysis)
    if (needsMerge) {
      try {
        const merges = flags.merge!.map(parseMergeSpec);
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

    // Step 8: Convert if needed (creates temp dir if needed)
    onProgress("\nChecking conversion requirements...");
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
    const matched = matchTracks(
      audioInfos,
      setlist.songs,
      bandConfig.encoreInSet2
    );
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
      const nonAudioFiles = await listNonAudioFiles(workingDir.path, bandConfig.excludePatterns ?? []);
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
    const nonAudioFiles = await listNonAudioFiles(workingDir.path, bandConfig.excludePatterns ?? []);
    if (nonAudioFiles.length > 0) {
      onProgress(`\nCopying ${nonAudioFiles.length} supplementary file(s)...`);
      await copyNonAudioFiles(nonAudioFiles, targetDir, onProgress);
    }

    // Step 11c: Generate and write log file
    onProgress("\nGenerating ingest log...");
    const logContent = generateLogContent(
      showInfo,
      setlist,
      matched,
      bandConfig,
      zipPath,
      nonAudioFiles
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
