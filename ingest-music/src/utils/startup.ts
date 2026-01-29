import { execFile } from "node:child_process";
import { promisify } from "node:util";

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
 * Throws with detailed install instructions if any are missing.
 * Silent on success.
 */
export async function verifyRequiredTools(): Promise<void> {
  const missing: RequiredTool[] = [];

  for (const tool of REQUIRED_TOOLS) {
    try {
      await execFileAsync(tool.command, [tool.versionFlag]);
    } catch {
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
}
