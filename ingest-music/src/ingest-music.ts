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
} from "./types.js";
import { loadConfig, resolveBandConfig } from "./config.js";
import { parseZipFilename } from "./parse-filename.js";
import { extractArchive, listAudioFiles, cleanupTempDir, isArchive } from "./extract.js";
import { verifyRequiredTools } from "./startup.js";
import { analyzeAllAudio, convertAllIfNeeded } from "./audio.js";
import { fetchSetlist } from "./setlist.js";
import { matchTracks } from "./match.js";
import { tagAllTracks, buildTemplateVars } from "./tagger.js";
import { renderTemplate, zeroPad } from "./template.js";

/**
 * Main entry point: process a single zip file or batch of zips.
 */
export async function ingestMusic(
  zipPath: string,
  flags: CliFlags,
  onProgress: ProgressCallback = console.log
): Promise<IngestResult[]> {
  // Verify required tools are available
  await verifyRequiredTools(onProgress);

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
    const audioFiles = await listAudioFiles(tmpDir);
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
      flags["skip-conversion"],
      onProgress
    );

    // Step 6: Fetch setlist
    onProgress("\nFetching setlist...");
    const setlist = await fetchSetlist(showInfo, bandConfig, config);
    onProgress(
      `Found setlist: ${setlist.songs.length} song(s) across ${new Set(setlist.songs.map((s) => s.set)).size} set(s)`
    );

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

    // Compute library path
    const targetDir = path.join(
      config.libraryBasePath,
      renderTemplate(bandConfig.targetPathTemplate, {
        artist: showInfo.artist,
        date: showInfo.date,
        venue: showInfo.venue,
        city: showInfo.city,
        state: showInfo.state,
      })
    );

    if (flags["dry-run"]) {
      onProgress("\n--- DRY RUN ---");
      printDryRun(matched, showInfo, bandConfig, targetDir, onProgress);
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
    await tagAllTracks(matched, showInfo, bandConfig, onProgress);

    // Step 10: Copy to library
    onProgress(`\nCopying to library: ${targetDir}`);
    await copyToLibrary(matched, showInfo, bandConfig, targetDir, onProgress);

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

function printDryRun(
  matched: MatchedTrack[],
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  targetDir: string,
  onProgress: ProgressCallback
): void {
  onProgress(`Target directory: ${targetDir}`);
  onProgress("\nFiles that would be created:");
  for (const m of matched) {
    const vars = buildTemplateVars(m, showInfo);
    const fileName = renderTemplate(bandConfig.fileNameTemplate, vars);
    onProgress(`  ${path.join(targetDir, fileName)}`);
  }
}

async function copyToLibrary(
  matched: MatchedTrack[],
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  targetDir: string,
  onProgress: ProgressCallback
): Promise<void> {
  await fs.mkdir(targetDir, { recursive: true });

  for (const m of matched) {
    const vars = buildTemplateVars(m, showInfo);
    const fileName = renderTemplate(bandConfig.fileNameTemplate, vars);
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
