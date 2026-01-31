/**
 * Search setlist APIs for shows matching various criteria.
 * Pure functions focused on API searching, no user interaction.
 */

import type { SetlistSourceConfig } from "../config/types.js";
import { logger } from "../utils/logger.js";

/** Search result for a single show */
export interface SetlistSearchResult {
  date: string; // YYYY-MM-DD format
  venue: string;
  city: string;
  state: string;
  country?: string;
  url: string;
}

/**
 * Search setlist.fm for shows by artist and city.
 *
 * @param artistName Artist name to search for
 * @param cityName City name to search for
 * @param sourceConfig setlist.fm API configuration
 * @returns Array of matching shows, sorted by date (newest first)
 */
export async function searchSetlistsByCity(
  artistName: string,
  cityName: string,
  sourceConfig: SetlistSourceConfig
): Promise<SetlistSearchResult[]> {
  const baseUrl = sourceConfig.url ?? "https://api.setlist.fm/rest/1.0";
  const params = new URLSearchParams({
    artistName,
    cityName,
    p: "1", // page 1
  });

  const url = `${baseUrl}/search/setlists?${params}`;

  logger.logCurl("GET", url, {
    Accept: "application/json",
    "x-api-key": sourceConfig.apiKey,
  });

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": sourceConfig.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`setlist.fm search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as SetlistFMSearchResponse;

  if (!data.setlist || data.setlist.length === 0) {
    return [];
  }

  // Convert to our format and sort by date (newest first)
  const results = data.setlist.map(convertSetlistFMResult);
  results.sort((a, b) => b.date.localeCompare(a.date));

  return results;
}

/**
 * Search setlist.fm for shows by artist and venue name.
 *
 * @param artistName Artist name to search for
 * @param venueName Venue name to search for
 * @param sourceConfig setlist.fm API configuration
 * @returns Array of matching shows, sorted by date (newest first)
 */
export async function searchSetlistsByVenue(
  artistName: string,
  venueName: string,
  sourceConfig: SetlistSourceConfig
): Promise<SetlistSearchResult[]> {
  const baseUrl = sourceConfig.url ?? "https://api.setlist.fm/rest/1.0";
  const params = new URLSearchParams({
    artistName,
    venueName,
    p: "1",
  });

  const url = `${baseUrl}/search/setlists?${params}`;

  logger.logCurl("GET", url, {
    Accept: "application/json",
    "x-api-key": sourceConfig.apiKey,
  });

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "x-api-key": sourceConfig.apiKey,
    },
  });

  if (!response.ok) {
    throw new Error(`setlist.fm search failed: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as SetlistFMSearchResponse;

  if (!data.setlist || data.setlist.length === 0) {
    return [];
  }

  const results = data.setlist.map(convertSetlistFMResult);
  results.sort((a, b) => b.date.localeCompare(a.date));

  return results;
}

/**
 * Convert setlist.fm date format (DD-MM-YYYY) to YYYY-MM-DD.
 */
function convertSetlistFMDate(fmDate: string): string {
  const [day, month, year] = fmDate.split("-");
  return `${year}-${month}-${day}`;
}

/**
 * Convert a setlist.fm search result to our standard format.
 */
function convertSetlistFMResult(item: SetlistFMItem): SetlistSearchResult {
  return {
    date: convertSetlistFMDate(item.eventDate),
    venue: item.venue.name,
    city: item.venue.city.name,
    state: item.venue.city.stateCode || item.venue.city.state || "",
    country: item.venue.city.country?.name,
    url: item.url || "",
  };
}

// setlist.fm API response types
interface SetlistFMSearchResponse {
  setlist: SetlistFMItem[];
  total: number;
  page: number;
  itemsPerPage: number;
}

interface SetlistFMItem {
  id: string;
  versionId: string;
  eventDate: string; // DD-MM-YYYY format
  url?: string;
  venue: {
    id: string;
    name: string;
    city: {
      id: string;
      name: string;
      state?: string;
      stateCode?: string;
      coords?: {
        lat: number;
        long: number;
      };
      country?: {
        code: string;
        name: string;
      };
    };
  };
}
