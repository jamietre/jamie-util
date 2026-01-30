import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { ShowInfo, Setlist, MatchedTrack, BandConfig } from "../config/types.js";
import { renderTemplate, sanitize, zeroPad } from "./template.js";
import { buildTemplateVars } from "./tagger.js";

/**
 * Generate a log file documenting the ingest process.
 * Includes show info, setlist source, file mappings, and a link to the setlist.
 */
export function generateLogContent(
  showInfo: ShowInfo,
  setlist: Setlist,
  matched: MatchedTrack[],
  bandConfig: BandConfig,
  sourceArchive: string,
  nonAudioFiles: Array<{ fullPath: string; relativePath: string }>
): string {
  const lines: string[] = [];

  // Header
  lines.push("# Ingest Log");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Show info
  lines.push("## Show Information");
  lines.push("");
  lines.push(`- **Artist:** ${showInfo.artist}`);
  lines.push(`- **Date:** ${showInfo.date}`);
  lines.push(`- **Venue:** ${showInfo.venue}`);
  lines.push(`- **Location:** ${showInfo.city}, ${showInfo.state}`);
  lines.push("");

  // Source
  lines.push("## Source");
  lines.push("");
  lines.push(`- **Archive:** ${path.basename(sourceArchive)}`);
  lines.push(`- **Setlist Source:** ${setlist.source}`);
  lines.push(`- **Setlist URL:** ${setlist.url}`);
  lines.push("");

  // Setlist
  lines.push("## Setlist");
  lines.push("");
  let currentSet = 0;
  for (const song of setlist.songs) {
    if (song.set !== currentSet) {
      currentSet = song.set;
      const setLabel = currentSet === 3 ? "Encore" : `Set ${currentSet}`;
      lines.push(`### ${setLabel}`);
      lines.push("");
    }
    lines.push(`${song.position}. ${song.title}`);
  }
  lines.push("");

  // Tags - common to all tracks
  const album = sanitize(renderTemplate(bandConfig.albumTemplate, buildTemplateVars(matched[0], showInfo)));
  const albumArtist = sanitize(renderTemplate(bandConfig.albumArtist, buildTemplateVars(matched[0], showInfo)));
  const artist = sanitize(showInfo.artist);
  const genre = sanitize(bandConfig.genre);

  const year = showInfo.date.split("-")[0];

  // Determine which filename template to use
  const uniqueSets = new Set(matched.map((m) => m.effectiveSet)).size;
  const fileNameTemplate = (uniqueSets === 1 && bandConfig.fileNameTemplateSingleSet)
    ? bandConfig.fileNameTemplateSingleSet
    : bandConfig.fileNameTemplate;

  lines.push("## Tags (Common)");
  lines.push("");
  lines.push(`- **ARTIST:** ${artist}`);
  lines.push(`- **ALBUMARTIST:** ${albumArtist}`);
  lines.push(`- **ALBUM:** ${album}`);
  lines.push(`- **GENRE:** ${genre}`);
  lines.push(`- **DATE:** ${year}`);
  lines.push("");

  // File mapping with per-track tags
  lines.push("## Tracks");
  lines.push("");
  lines.push("| Original File | Output File | TITLE | TRACKNUMBER | DISCNUMBER |");
  lines.push("|---|---|---|---|---|");
  for (const m of matched) {
    const originalName = path.basename(m.audioFile.filePath);
    const vars = buildTemplateVars(m, showInfo);
    const outputName = renderTemplate(fileNameTemplate, vars);
    const title = sanitize(m.song.title);
    const trackNum = zeroPad(m.trackInSet);
    const discNum = m.effectiveSet;
    lines.push(`| ${originalName} | ${outputName} | ${title} | ${trackNum} | ${discNum} |`);
  }
  lines.push("");

  // Non-audio files
  if (nonAudioFiles.length > 0) {
    lines.push("## Supplementary Files");
    lines.push("");
    for (const f of nonAudioFiles) {
      lines.push(`- ${f.relativePath}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

/**
 * Write the log file to the target directory.
 */
export async function writeLogFile(
  targetDir: string,
  content: string
): Promise<string> {
  const logPath = path.join(targetDir, "ingest-log.md");
  await fs.writeFile(logPath, content, "utf-8");
  return logPath;
}
