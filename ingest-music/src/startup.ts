import { execFile } from "node:child_process";
import { promisify } from "node:util";
import type { ProgressCallback } from "./types.js";

const execFileAsync = promisify(execFile);

interface RequiredTool {
  command: string;
  versionFlag: string;
  purpose: string;
  installHint: string;
}

const REQUIRED_TOOLS: RequiredTool[] = [
  {
    command: "ffmpeg",
    versionFlag: "-version",
    purpose: "audio conversion and tagging",
    installHint:
      "Ubuntu/Debian: sudo apt install ffmpeg\n" +
      "    macOS: brew install ffmpeg\n" +
      "    Windows: https://ffmpeg.org/download.html",
  },
  {
    command: "ffprobe",
    versionFlag: "-version",
    purpose: "audio analysis",
    installHint: "(installed with ffmpeg)",
  },
];

/**
 * Verify all required external tools are available on the system.
 * Throws with detailed install instructions on first missing tool.
 */
export async function verifyRequiredTools(
  onProgress?: ProgressCallback
): Promise<void> {
  onProgress?.("Checking required tools...");
  const missing: RequiredTool[] = [];

  for (const tool of REQUIRED_TOOLS) {
    try {
      await execFileAsync(tool.command, [tool.versionFlag]);
      onProgress?.(`  ${tool.command}: found`);
    } catch {
      onProgress?.(`  ${tool.command}: MISSING`);
      missing.push(tool);
    }
  }

  if (missing.length > 0) {
    const details = missing
      .map(
        (t) =>
          `  ${t.command} (${t.purpose}):\n    ${t.installHint}`
      )
      .join("\n\n");
    throw new Error(
      `Missing required tool(s):\n\n${details}`
    );
  }

  onProgress?.("All required tools found.\n");
}
