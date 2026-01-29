#!/usr/bin/env node
import { buildApplication, buildCommand, run } from "@stricli/core";
import { syncPhotos } from "./photo-sync.js";

const syncCommand = buildCommand({
  docs: {
    brief: "Copy photos from source to target, organizing by YYYY/MM based on EXIF date",
  },
  parameters: {
    positional: {
      kind: "tuple",
      parameters: [
        {
          brief: "Source directory (e.g., /mnt/android/DCIM)",
          parse: String,
          placeholder: "source",
        },
        {
          brief: "Target directory (e.g., /mnt/data/pictures)",
          parse: String,
          placeholder: "target",
        },
      ],
    },
    flags: {
      "dry-run": {
        kind: "boolean",
        brief: "Preview changes without copying files",
        default: false,
      },
    },
  },
  async func(flags, source: string, target: string) {
    console.log(`Photo Sync`);
    console.log(`==========`);
    console.log(`Source: ${source}`);
    console.log(`Target: ${target}`);
    console.log(`Mode:   ${flags["dry-run"] ? "DRY RUN (no files will be copied)" : "COPY"}`);
    console.log();

    const result = await syncPhotos(source, target, {
      dryRun: flags["dry-run"],
      onProgress: (message) => console.log(message),
    });

    console.log();
    console.log(`Summary`);
    console.log(`-------`);
    console.log(`${flags["dry-run"] ? "Would copy" : "Copied"}: ${result.copied} files`);
    console.log(`Skipped: ${result.skipped} files (already exist)`);
    if (result.errors.length > 0) {
      console.log(`Errors:  ${result.errors.length}`);
    }
  },
});

const app = buildApplication(syncCommand, {
  name: "photo-sync",
  versionInfo: {
    currentVersion: "1.0.0",
  },
});

run(app, process.argv.slice(2), { process });
