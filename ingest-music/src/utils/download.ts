import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { pipeline } from "node:stream/promises";
import { createWriteStream } from "node:fs";
import type { ProgressCallback } from "../config/types.js";

/**
 * Download a file from a URL to a local path.
 * Shows progress updates during download.
 */
export async function downloadFile(
  url: string,
  destPath: string,
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.(`Downloading from ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to download: ${response.status} ${response.statusText}`);
  }

  if (!response.body) {
    throw new Error("No response body received");
  }

  // Get content length for progress reporting
  const contentLength = response.headers.get("content-length");
  const totalBytes = contentLength ? parseInt(contentLength, 10) : null;

  // Create write stream
  const fileStream = createWriteStream(destPath);

  // Convert Web ReadableStream to Node.js Readable
  const reader = response.body.getReader();
  let downloadedBytes = 0;
  let lastProgressPercent = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      fileStream.write(value);
      downloadedBytes += value.length;

      // Report progress every 10%
      if (totalBytes) {
        const percent = Math.floor((downloadedBytes / totalBytes) * 100);
        if (percent >= lastProgressPercent + 10) {
          const mb = (downloadedBytes / 1024 / 1024).toFixed(1);
          const totalMb = (totalBytes / 1024 / 1024).toFixed(1);
          onProgress?.(`  Downloaded ${mb}MB / ${totalMb}MB (${percent}%)`);
          lastProgressPercent = percent;
        }
      }
    }

    // Close the file stream
    await new Promise<void>((resolve, reject) => {
      fileStream.end((err?: Error) => {
        if (err) reject(err);
        else resolve();
      });
    });

    const finalMb = (downloadedBytes / 1024 / 1024).toFixed(1);
    onProgress?.(`  Download complete: ${finalMb}MB`);
  } catch (error) {
    // Clean up partial download on error
    await fs.unlink(destPath).catch(() => {});
    throw error;
  }
}

/**
 * Download a file from URL to a temporary directory.
 * Returns the path to the downloaded file.
 */
export async function downloadToTemp(
  url: string,
  downloadDir: string | undefined,
  onProgress?: ProgressCallback
): Promise<{ path: string; shouldCleanup: boolean }> {
  // Determine download directory
  let targetDir: string;
  let shouldCleanup: boolean;

  if (downloadDir) {
    // User specified a download directory - use it and don't clean up
    targetDir = downloadDir;
    shouldCleanup = false;
    await fs.mkdir(targetDir, { recursive: true });
  } else {
    // No download dir specified - use OS temp and clean up after
    targetDir = await fs.mkdtemp(path.join(os.tmpdir(), "ingest-download-"));
    shouldCleanup = true;
  }

  // Extract filename from URL
  const urlPath = new URL(url).pathname;
  const fileName = path.basename(urlPath) || "download.zip";
  const destPath = path.join(targetDir, fileName);

  onProgress?.(`\nDownloading to: ${destPath}`);

  // Download the file
  await downloadFile(url, destPath, onProgress);

  return { path: destPath, shouldCleanup };
}
