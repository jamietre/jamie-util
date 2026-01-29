import * as path from "node:path";
import * as fs from "node:fs/promises";
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
} from "./config/types.js";
import { loadConfig, resolveBandConfig } from "./config/config.js";
import { parseZipFilename } from "./matching/parse-filename.js";
import { extractArchive, listAudioFiles, listNonAudioFiles, cleanupTempDir, isArchive } from "./utils/extract.js";
import { verifyRequiredTools } from "./utils/startup.js";
import { analyzeAllAudio, convertAllIfNeeded } from "./audio/audio.js";
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
  // Step 1: Parse show info from filename
  const parsed = parseZipFilename(path.basename(zipPath));
  const showInfo: ShowInfo = {
    artist: flags.artist ?? parsed.artist ?? "Unknown Artist",
    date: flags.date ?? parsed.date ?? "Unknown",
    venue: flags.venue ?? parsed.venue ?? "Unknown Venue",
    city: flags.city ?? parsed.city ?? "Unknown City",
    state: flags.state ?? parsed.state ?? "",
  };

  onProgress(`Show: ${showInfo.artist}`);
  onProgress(`Date: ${showInfo.date}`);
  onProgress(`Venue: ${showInfo.venue}, ${showInfo.city}, ${showInfo.state}`);

  // Step 2: Resolve band config
  const bandConfig = resolveBandConfig(config, showInfo.artist);

  // Step 3: Extract archive
  onProgress("\nExtracting archive...");
  const tmpDir = await extractArchive(zipPath, onProgress);

  try {
    // Step 4: List and analyze audio files
    const audioFiles = await listAudioFiles(tmpDir, bandConfig.excludePatterns ?? []);
    if (audioFiles.length === 0) {
      throw new Error("No audio files found in archive");
    }
    onProgress(`\nFound ${audioFiles.length} audio file(s)`);

    onProgress("\nAnalyzing audio...");
    let audioInfos = await analyzeAllAudio(audioFiles, onProgress);

    // Step 5: Convert if needed
    onProgress("\nChecking conversion requirements...");
    audioInfos = await convertAllIfNeeded(
      audioInfos,
      bandConfig,
      flags["skip-conversion"],
      onProgress
    );

    // Step 6: Fetch setlist
    onProgress("\nFetching setlist...");
    const setlist = await fetchSetlist(showInfo, bandConfig, config);
    onProgress(
      `Found setlist: ${setlist.songs.length} song(s) across ${new Set(setlist.songs.map((s) => s.set)).size} set(s)`
    );
    if (setlist.url) {
      onProgress(`Setlist URL: ${setlist.url}`);
    }

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
    onProgress(`Venue: ${showInfo.venue}, ${showInfo.city}, ${showInfo.state}`);

    // Step 7: Match tracks to setlist
    onProgress("\nMatching tracks to setlist...");
    const matched = matchTracks(
      audioInfos,
      setlist.songs,
      bandConfig.encoreInSet2
    );
    printMatchPreview(matched, onProgress);

    // Step 8: Interactive confirmation
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

    // Compute library path (sanitize values to avoid path issues - slashes → dashes)
    const targetDir = path.join(
      config.libraryBasePath,
      renderTemplate(bandConfig.targetPathTemplate, {
        artist: sanitizeFilename(showInfo.artist),
        date: showInfo.date,
        venue: sanitizeFilename(showInfo.venue),
        city: sanitizeFilename(showInfo.city),
        state: sanitizeFilename(showInfo.state),
      })
    );

    // Check for existing shows
    const existingShows = await findExistingShows(targetDir, showInfo.date, onProgress);
    if (existingShows.length > 0) {
      onProgress("\n⚠️  WARNING: Potentially duplicate show(s) found:");
      for (const show of existingShows) {
        onProgress(`  - ${show}`);
      }
    }

    if (flags["dry-run"]) {
      onProgress("\n--- DRY RUN ---");
      const nonAudioFiles = await listNonAudioFiles(tmpDir, bandConfig.excludePatterns ?? []);
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

    // Step 9: Tag FLAC files
    onProgress("\nTagging files...");
    printTagsSummary(matched, showInfo, bandConfig, onProgress);
    await tagAllTracks(matched, showInfo, bandConfig, onProgress);

    // Step 10: Copy to library
    onProgress(`\nCopying to library: ${targetDir}`);
    await copyToLibrary(matched, showInfo, bandConfig, targetDir, onProgress);

    // Step 10b: Copy non-audio files (artwork, info.txt, etc.)
    const nonAudioFiles = await listNonAudioFiles(tmpDir, bandConfig.excludePatterns ?? []);
    if (nonAudioFiles.length > 0) {
      onProgress(`\nCopying ${nonAudioFiles.length} supplementary file(s)...`);
      await copyNonAudioFiles(nonAudioFiles, targetDir, onProgress);
    }

    // Step 10c: Generate and write log file
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
    // Step 11: Clean up
    onProgress("\nCleaning up temp directory...");
    await cleanupTempDir(tmpDir);
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
  nonAudioFiles: string[],
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
      onProgress(`  ${path.join(targetDir, path.basename(f))}`);
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
  files: string[],
  targetDir: string,
  onProgress: ProgressCallback
): Promise<void> {
  for (const filePath of files) {
    const fileName = path.basename(filePath);
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
    await fs.copyFile(filePath, destPath);
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
