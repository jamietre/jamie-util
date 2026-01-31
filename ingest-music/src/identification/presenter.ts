/**
 * User interface for presenting identification results and getting selection.
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import * as path from "node:path";
import type { ShowIdentificationResult } from "./types.js";
import type { ShowInfo } from "../config/types.js";

/**
 * Present identification results to user and get their selection.
 *
 * @param results Identification results sorted by confidence
 * @param archivePath Path to the archive being identified
 * @returns Selected show info, or undefined if user cancelled
 */
export async function presentIdentificationResults(
  results: ShowIdentificationResult[],
  archivePath: string
): Promise<Partial<ShowInfo> | undefined> {
  if (results.length === 0) {
    console.log("\n❌ No identification strategies found a match.");
    return undefined;
  }

  const filename = path.basename(archivePath);

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Found ${results.length} possible identification(s) for:`);
  console.log(`  ${filename}`);
  console.log("=".repeat(70));

  // Show top 5 results
  const maxResults = Math.min(results.length, 5);

  for (let i = 0; i < maxResults; i++) {
    const result = results[i];
    console.log(`\n${i + 1}. [${result.confidence}% confident] ${formatShowInfo(result.showInfo)}`);
    console.log(`   Source: ${result.source}`);
    console.log(`   Evidence:`);
    result.evidence.forEach(e => console.log(`     - ${e}`));

    if (result.reasoning) {
      console.log(`   Reasoning: ${result.reasoning}`);
    }
  }

  console.log(""); // Blank line before prompt

  // Auto-select if very high confidence and complete
  const topResult = results[0];
  if (topResult.confidence >= 95 && isCompleteShowInfo(topResult.showInfo)) {
    console.log(`\n✓ Auto-selecting highest confidence result (${topResult.confidence}%)`);
    return topResult.showInfo;
  }

  // Otherwise, ask user
  const rl = readline.createInterface({ input: stdin, output: stdout });

  try {
    while (true) {
      const answer = await rl.question(
        `Select a result [1-${maxResults}], 'm' for manual entry, or 'n' to skip: `
      );

      const trimmed = answer.trim().toLowerCase();

      if (trimmed === "n" || trimmed === "no" || trimmed === "skip") {
        return undefined;
      }

      if (trimmed === "m" || trimmed === "manual") {
        // Return empty object to signal manual entry needed
        return {};
      }

      const num = parseInt(trimmed, 10);
      if (num >= 1 && num <= maxResults) {
        const selected = results[num - 1];
        console.log(`\n✓ Using: ${formatShowInfo(selected.showInfo)}\n`);
        return selected.showInfo;
      }

      console.log(`Invalid selection. Please choose 1-${maxResults}, 'm', or 'n'.`);
    }
  } finally {
    rl.close();
  }
}

/**
 * Format show info for display.
 */
function formatShowInfo(showInfo: Partial<ShowInfo>): string {
  const parts: string[] = [];

  if (showInfo.artist) {
    parts.push(showInfo.artist);
  }

  if (showInfo.date) {
    parts.push(showInfo.date);
  }

  if (showInfo.venue) {
    parts.push(showInfo.venue);
  }

  const location = [showInfo.city, showInfo.state].filter(Boolean).join(", ");
  if (location) {
    parts.push(location);
  }

  return parts.join(" - ") || "(incomplete info)";
}

/**
 * Check if show info is complete enough for auto-selection.
 */
function isCompleteShowInfo(showInfo: Partial<ShowInfo>): boolean {
  return !!(
    showInfo.artist &&
    showInfo.date &&
    (showInfo.venue || showInfo.city)
  );
}
