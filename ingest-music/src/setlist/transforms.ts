/**
 * Setlist API response transformations.
 * Applies post-processing to normalized Setlist objects to fix edge cases.
 */

import type { Setlist } from "../config/types.js";

/**
 * A transform that modifies a Setlist object.
 */
export interface SetlistTransform {
  /** Transform name for debugging */
  name: string;

  /** Which API sources this transform applies to */
  appliesTo: string[];

  /** Transform function */
  transform(setlist: Setlist, rawResponse?: unknown): Setlist;
}

/**
 * Trey Anastasio Band detection transform.
 * phish.net and setlist.fm use "Trey Anastasio" as the generic artist name
 * for both solo Trey and TAB shows. This transform detects TAB shows by
 * checking the URL and description for "trey anastasio band" indicators.
 */
export const treyAnastasiBandTransform: SetlistTransform = {
  name: "trey-anastasio-band-detection",
  appliesTo: ["phish.net", "setlist.fm"],

  transform(setlist: Setlist, rawResponse?: unknown): Setlist {
    // Only apply if artist is "Trey Anastasio"
    if (setlist.artist !== "Trey Anastasio") {
      return setlist;
    }

    // Check URL for "trey-anastasio-band"
    const urlIndicatesTab = setlist.url &&
      (setlist.url.toLowerCase().includes("trey-anastasio-band") ||
       setlist.url.toLowerCase().includes("trey anastasio band"));

    // Check for TAB indicators in raw response (phish.net specific)
    let rawIndicatesTab = false;
    if (rawResponse && typeof rawResponse === "object") {
      const rawStr = JSON.stringify(rawResponse).toLowerCase();
      rawIndicatesTab =
        rawStr.includes("trey anastasio band") ||
        rawStr.includes("trey-anastasio-band") ||
        rawStr.includes('"tour_name":"tab') ||
        rawStr.includes("tab -") ||
        rawStr.includes("tab performances");
    }

    // If indicators suggest TAB, update artist name
    if (urlIndicatesTab || rawIndicatesTab) {
      return {
        ...setlist,
        artist: "Trey Anastasio Band",
      };
    }

    return setlist;
  },
};

/**
 * Registry of all available transforms.
 */
export const availableTransforms: SetlistTransform[] = [
  treyAnastasiBandTransform,
];

/**
 * Apply all applicable transforms to a setlist.
 *
 * @param setlist - The normalized setlist object
 * @param sourceName - The API source name (e.g., "phish.net")
 * @param rawResponse - Optional raw API response for advanced transforms
 * @returns Transformed setlist
 */
export function applyTransforms(
  setlist: Setlist,
  sourceName: string,
  rawResponse?: unknown,
): Setlist {
  let result = setlist;

  for (const transform of availableTransforms) {
    // Check if transform applies to this source
    if (transform.appliesTo.includes(sourceName)) {
      result = transform.transform(result, rawResponse);
    }
  }

  return result;
}
