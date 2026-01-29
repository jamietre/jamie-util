import type { ShowInfo } from "../config/types.js";

/**
 * Parse show info from a zip filename.
 *
 * Expected patterns like:
 *   "King Gizzard & The Lizard Wizard - Live at Forest Hills Stadium, Queens, NY 8-16-24 (washtub).zip"
 *   "Phish - 2024-08-16 - Dick's Sporting Goods Park, Commerce City, CO.zip"
 *
 * Best-effort: returns partial info. CLI flags should override any parsed value.
 */
export function parseZipFilename(filename: string): Partial<ShowInfo> {
  // Strip .zip extension and any trailing parenthetical (taper info)
  const base = filename.replace(/\.zip$/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();

  const result: Partial<ShowInfo> = {};

  // Try to split on " - " to get artist and the rest
  const dashSplit = base.split(" - ");

  if (dashSplit.length >= 2) {
    result.artist = dashSplit[0].trim();
    const rest = dashSplit.slice(1).join(" - ").trim();
    parseRest(rest, result);
  } else {
    // No dash separator; try to extract what we can
    parseRest(base, result);
  }

  return result;
}

function parseRest(rest: string, result: Partial<ShowInfo>): void {
  // Strip "Live at " or "Live @ " prefix
  const withoutLiveAt = rest.replace(/^Live\s+(?:at|@)\s+/i, "");

  // Try to extract date in various formats
  const dateMatch = extractDate(withoutLiveAt);
  if (dateMatch) {
    result.date = dateMatch.date;
    // Remove the date from the string to parse venue/location
    const remaining = withoutLiveAt
      .replace(dateMatch.original, "")
      .replace(/^[\s,\-]+|[\s,\-]+$/g, "")
      .trim();
    if (remaining) {
      parseVenueLocation(remaining, result);
    }
  } else {
    parseVenueLocation(withoutLiveAt, result);
  }
}

interface DateExtraction {
  date: string; // YYYY-MM-DD
  original: string; // the matched substring
}

function extractDate(text: string): DateExtraction | null {
  // YYYY-MM-DD
  const isoMatch = text.match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
  if (isoMatch) {
    const [original, y, m, d] = isoMatch;
    return { date: `${y}-${pad(m)}-${pad(d)}`, original };
  }

  // M-D-YY or M-D-YYYY (American format, common in taper filenames)
  const mdyMatch = text.match(/\b(\d{1,2})-(\d{1,2})-(\d{2,4})\b/);
  if (mdyMatch) {
    const [original, m, d, y] = mdyMatch;
    const fullYear = y.length === 2 ? expandYear(y) : y;
    return { date: `${fullYear}-${pad(m)}-${pad(d)}`, original };
  }

  // M.D.YY or M.D.YYYY
  const dotMatch = text.match(/\b(\d{1,2})\.(\d{1,2})\.(\d{2,4})\b/);
  if (dotMatch) {
    const [original, m, d, y] = dotMatch;
    const fullYear = y.length === 2 ? expandYear(y) : y;
    return { date: `${fullYear}-${pad(m)}-${pad(d)}`, original };
  }

  return null;
}

function expandYear(twoDigit: string): string {
  const n = parseInt(twoDigit, 10);
  // 00-49 → 2000-2049, 50-99 → 1950-1999
  return n < 50 ? `20${twoDigit}` : `19${twoDigit}`;
}

function pad(s: string): string {
  return s.padStart(2, "0");
}

/**
 * Parse "Venue, City, ST" from a string.
 * Expects the state to be a 2-letter code at the end.
 */
function parseVenueLocation(text: string, result: Partial<ShowInfo>): void {
  // Split by comma
  const parts = text.split(",").map((p) => p.trim()).filter(Boolean);

  if (parts.length >= 3) {
    result.venue = parts.slice(0, -2).join(", ");
    result.city = parts[parts.length - 2];
    result.state = parts[parts.length - 1];
  } else if (parts.length === 2) {
    // Could be "Venue, City ST" or "City, ST"
    const lastPart = parts[1];
    const stateMatch = lastPart.match(/^(.+?)\s+([A-Z]{2})$/);
    if (stateMatch) {
      result.venue = parts[0];
      result.city = stateMatch[1];
      result.state = stateMatch[2];
    } else {
      result.venue = parts[0];
      result.city = parts[1];
    }
  } else if (parts.length === 1) {
    result.venue = parts[0];
  }
}

/**
 * Parse track info from an audio filename.
 * Patterns: "d1t01", "01 - Song", "s1_01_Song", "1-01 Song", etc.
 * Returns set number and track number if found.
 */
export function parseTrackFilename(filename: string): {
  set?: number;
  track?: number;
  title?: string;
} {
  const base = filename.replace(/\.\w+$/, ""); // strip extension

  // Pattern: d{set}t{track} (e.g., d1t01, d2t03)
  const dtMatch = base.match(/d(\d+)t(\d+)/i);
  if (dtMatch) {
    const rest = base.replace(dtMatch[0], "").replace(/^[\s_\-]+/, "").trim();
    return {
      set: parseInt(dtMatch[1], 10),
      track: parseInt(dtMatch[2], 10),
      title: rest || undefined,
    };
  }

  // Pattern: s{set}_{track}_ or s{set}t{track} (e.g., s1_01_Song, s2t03)
  const stMatch = base.match(/s(\d+)[_t](\d+)/i);
  if (stMatch) {
    const rest = base
      .slice(base.indexOf(stMatch[0]) + stMatch[0].length)
      .replace(/^[\s_\-]+/, "")
      .trim();
    return {
      set: parseInt(stMatch[1], 10),
      track: parseInt(stMatch[2], 10),
      title: rest || undefined,
    };
  }

  // Pattern: {set}-{track} (e.g., 1-01 Song Name)
  const setTrackMatch = base.match(/^(\d+)-(\d{2})\s+(.*)/);
  if (setTrackMatch) {
    return {
      set: parseInt(setTrackMatch[1], 10),
      track: parseInt(setTrackMatch[2], 10),
      title: setTrackMatch[3] || undefined,
    };
  }

  // Pattern: {track} - Title (e.g., 01 - Song Name)
  const numTitleMatch = base.match(/^(\d+)\s*-\s*(.*)/);
  if (numTitleMatch) {
    return {
      track: parseInt(numTitleMatch[1], 10),
      title: numTitleMatch[2] || undefined,
    };
  }

  // Pattern: just leading number (e.g., 01 Song Name)
  const leadingNum = base.match(/^(\d+)\s+(.*)/);
  if (leadingNum) {
    return {
      track: parseInt(leadingNum[1], 10),
      title: leadingNum[2] || undefined,
    };
  }

  return {};
}
