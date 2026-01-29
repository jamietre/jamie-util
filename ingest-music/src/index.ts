#!/usr/bin/env node
import { buildApplication, buildCommand, run } from "@stricli/core";
import { ingestMusic } from "./ingest-music.js";

const ingestCommand = buildCommand({
  docs: {
    brief:
      "Process concert recording zip archives into an organized, tagged music library",
  },
  parameters: {
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Path to zip file (or directory in batch mode)",
          parse: String,
          placeholder: "zipPath",
        },
      ],
    },
    flags: {
      config: {
        kind: "parsed",
        brief: "Path to config JSON file",
        parse: String,
        optional: true,
      },
      artist: {
        kind: "parsed",
        brief: "Override artist name",
        parse: String,
        optional: true,
      },
      date: {
        kind: "parsed",
        brief: "Override show date (YYYY-MM-DD)",
        parse: String,
        optional: true,
      },
      venue: {
        kind: "parsed",
        brief: "Override venue",
        parse: String,
        optional: true,
      },
      city: {
        kind: "parsed",
        brief: "Override city",
        parse: String,
        optional: true,
      },
      state: {
        kind: "parsed",
        brief: "Override state",
        parse: String,
        optional: true,
      },
      library: {
        kind: "parsed",
        brief: "Override library base path",
        parse: String,
        optional: true,
      },
      batch: {
        kind: "boolean",
        brief: "Process all zips in directory",
        default: false,
      },
      "dry-run": {
        kind: "boolean",
        brief: "Preview without writing",
        default: false,
      },
      "skip-conversion": {
        kind: "boolean",
        brief: "Skip audio format conversion",
        default: false,
      },
    },
  },
  async func(flags, zipPath: string) {
    console.log("Ingest Music");
    console.log("============");
    console.log(`Input: ${zipPath}`);
    console.log(
      `Mode:  ${flags["dry-run"] ? "DRY RUN" : flags.batch ? "BATCH" : "SINGLE"}`
    );
    console.log();

    try {
      const results = await ingestMusic(zipPath, flags);

      console.log();
      console.log("Results");
      console.log("-------");
      for (const r of results) {
        console.log(
          `${r.dryRun ? "[DRY RUN] " : ""}${r.showInfo.artist} - ${r.showInfo.date}: ${r.tracksProcessed} tracks -> ${r.libraryPath}`
        );
      }
    } catch (e) {
      console.error(
        `\nFATAL: ${e instanceof Error ? e.message : String(e)}`
      );
      process.exitCode = 1;
    }
  },
});

const app = buildApplication(ingestCommand, {
  name: "ingest-music",
  versionInfo: {
    currentVersion: "1.0.0",
  },
});

run(app, process.argv.slice(2), { process });
