/**
 * Parse location information (city, venue) from filenames.
 * Pure functions with no side effects.
 */

export interface LocationInfo {
  city?: string;
  venue?: string;
  state?: string;
}

/**
 * Common city names to look for in filenames.
 * Ordered by specificity (longer/more specific names first).
 */
const KNOWN_CITIES = [
  // Multi-word cities (check these first)
  "New York", "Los Angeles", "San Francisco", "San Diego", "San Jose",
  "Salt Lake City", "Kansas City", "Oklahoma City", "Jersey City",
  "Colorado Springs", "Virginia Beach", "Long Beach", "Baton Rouge",
  "Saint Louis", "St Louis", "Saint Paul", "St Paul",
  "Fort Worth", "Fort Wayne", "Fort Lauderdale",
  "Palo Alto", "Santa Fe", "Santa Barbara", "Santa Cruz",
  "Commerce City", "Atlantic City", "Lake Tahoe",

  // Single-word cities
  "Detroit", "Chicago", "Boston", "Philadelphia", "Phoenix", "Houston",
  "Seattle", "Portland", "Denver", "Austin", "Nashville", "Atlanta",
  "Miami", "Dallas", "Minneapolis", "Cleveland", "Cincinnati",
  "Pittsburgh", "Baltimore", "Milwaukee", "Buffalo", "Albany",
  "Rochester", "Syracuse", "Hartford", "Providence", "Raleigh",
  "Charlotte", "Richmond", "Norfolk", "Jacksonville", "Tampa",
  "Orlando", "Memphis", "Louisville", "Indianapolis", "Columbus",
  "Toledo", "Akron", "Omaha", "Tulsa", "Albuquerque", "Tucson",
  "Mesa", "Fresno", "Sacramento", "Oakland", "Berkeley",
  "Anaheim", "Bakersfield", "Stockton", "Riverside", "Irvine",

  // International cities
  "London", "Paris", "Berlin", "Amsterdam", "Brussels", "Prague",
  "Vienna", "Budapest", "Warsaw", "Madrid", "Barcelona", "Rome",
  "Milan", "Zurich", "Geneva", "Stockholm", "Copenhagen", "Oslo",
  "Helsinki", "Dublin", "Manchester", "Glasgow", "Edinburgh",
  "Montreal", "Toronto", "Vancouver", "Calgary", "Ottawa",
  "Tokyo", "Sydney", "Melbourne", "Brisbane", "Auckland",
  "Mexico City", "Buenos Aires", "Sao Paulo", "Rio de Janeiro",
];

/**
 * Extract city name from a filename or text.
 * Uses a list of known cities to find matches.
 *
 * @param text Filename or text to parse
 * @returns City name if found, undefined otherwise
 */
export function parseCity(text: string): string | undefined {
  const normalized = text.replace(/[-_]/g, " ");

  for (const city of KNOWN_CITIES) {
    // Case-insensitive regex with word boundaries
    const regex = new RegExp(`\\b${escapeRegex(city)}\\b`, "i");
    if (regex.test(normalized)) {
      return city;
    }
  }

  return undefined;
}

/**
 * Extract venue name from filename using common patterns.
 * Looks for venue indicators like "at", "live at", venue suffixes, etc.
 *
 * @param text Filename or text to parse
 * @returns Venue name if found, undefined otherwise
 */
export function parseVenue(text: string): string | undefined {
  const normalized = text.replace(/[-_]/g, " ");

  // Pattern: "at [venue]" or "live at [venue]"
  const atMatch = normalized.match(/\b(?:live\s+)?at\s+([^,\(\)\[\]]+?)(?:,|\(|\[|$)/i);
  if (atMatch) {
    return atMatch[1].trim();
  }

  // Pattern: venue names with common suffixes
  const venuePattern = /\b([A-Z][^,\(\)\[\]]*?(?:Hall|Theater|Theatre|Arena|Stadium|Amphitheatre|Amphitheater|Garden|Center|Centre|Pavilion|Ballroom|Club|House))\b/;
  const venueMatch = normalized.match(venuePattern);
  if (venueMatch) {
    return venueMatch[1].trim();
  }

  return undefined;
}

/**
 * Parse all location information from a filename.
 *
 * @param filename Filename or text to parse
 * @returns Parsed location information
 */
export function parseLocation(filename: string): LocationInfo {
  return {
    city: parseCity(filename),
    venue: parseVenue(filename),
  };
}

/**
 * Escape special regex characters in a string.
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
