/**
 * User interaction for show disambiguation.
 * Presents options and gets user input.
 */

import * as readline from "node:readline/promises";
import { stdin, stdout } from "node:process";
import type { SetlistSearchResult } from "./search.js";

/**
 * Prompt the user to select a show from a list of candidates.
 *
 * @param candidates List of shows to choose from
 * @param context Additional context to show (e.g., "found in filename: Detroit")
 * @returns Selected show, or undefined if user cancelled
 */
export async function promptUserToSelectShow(
  candidates: SetlistSearchResult[],
  context?: string
): Promise<SetlistSearchResult | undefined> {
  if (candidates.length === 0) {
    return undefined;
  }

  console.log("\nMultiple shows found.");
  if (context) {
    console.log(context);
  }
  console.log("");

  // Display numbered list
  for (let i = 0; i < candidates.length; i++) {
    const show = candidates[i];
    const location = formatLocation(show);
    console.log(`  ${i + 1}. ${show.date} - ${show.venue}, ${location}`);
  }

  const rl = readline.createInterface({ input: stdin, output: stdout });
  try {
    while (true) {
      const answer = await rl.question(
        `\nWhich show is this? [1-${candidates.length}, or 'n' to skip]: `
      );
      const trimmed = answer.trim().toLowerCase();

      // User cancelled
      if (trimmed === "n" || trimmed === "no" || trimmed === "skip") {
        return undefined;
      }

      // Try to parse as number
      const num = parseInt(trimmed, 10);
      if (!isNaN(num) && num >= 1 && num <= candidates.length) {
        return candidates[num - 1];
      }

      console.log(`Invalid choice. Please enter a number between 1 and ${candidates.length}, or 'n' to skip.`);
    }
  } finally {
    rl.close();
  }
}

/**
 * Format location for display.
 * US shows: "City, ST"
 * International with country: "City, Country"
 * Otherwise: "City"
 */
function formatLocation(show: SetlistSearchResult): string {
  // US show with 2-letter state code
  if (show.state && /^[A-Z]{2}$/i.test(show.state)) {
    return `${show.city}, ${show.state}`;
  }

  // International show with country
  if (show.country) {
    return `${show.city}, ${show.country}`;
  }

  // Just city
  return show.city;
}
