import type {
  Setlist,
  SetlistSong,
  ShowInfo,
  BandConfig,
  Config,
  SetlistSourceConfig,
} from "../config/types.js";
import { logger } from "../utils/logger.js";

/**
 * Fetch a setlist by trying each configured source in order.
 * Returns the first successful result. Throws if all sources fail.
 *
 * Phase 2: If an extracted setlist is provided from archive manifest files
 * with sufficient confidence, it will be used instead of fetching from APIs.
 *
 * @param extractedSetlist - Optional setlist extracted from archive manifest
 * @param extractedSetlistConfidence - Confidence score (0-1) for extracted setlist
 */
export async function fetchSetlist(
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  config: Config,
  extractedSetlist?: SetlistSong[],
  extractedSetlistConfidence?: number,
): Promise<Setlist> {
  // Phase 2: Use extracted setlist if available and confident
  if (extractedSetlist && extractedSetlist.length > 0) {
    const confidence = extractedSetlistConfidence ?? 0;
    const confidenceThreshold = 0.7; // Require 70% confidence

    if (confidence >= confidenceThreshold) {
      logger.info(`Using setlist extracted from archive manifest (${(confidence * 100).toFixed(0)}% confidence)`);
      return {
        artist: showInfo.artist,
        date: showInfo.date,
        venue: showInfo.venue || "Unknown Venue",
        city: showInfo.city || "Unknown City",
        state: showInfo.state || "",
        country: showInfo.country,
        songs: extractedSetlist,
        source: "archive-manifest",
        url: "", // No URL for extracted setlists
      };
    } else {
      logger.info(
        `Extracted setlist confidence (${(confidence * 100).toFixed(0)}%) below threshold (${(confidenceThreshold * 100).toFixed(0)}%), fetching from API instead`
      );
    }
  }

  // Standard API fetching logic
  const errors: string[] = [];

  for (const sourceName of bandConfig.setlistSources) {
    const sourceConfig = config.setlistSources[sourceName];
    if (!sourceConfig) {
      errors.push(`${sourceName}: not configured in setlistSources`);
      continue;
    }

    try {
      if (sourceName === "phish.net") {
        return await fetchPhishNet(showInfo, sourceConfig);
      } else if (sourceName === "kglw.net") {
        return await fetchKGLW(showInfo, sourceConfig);
      } else if (sourceName === "setlist.fm") {
        return await fetchSetlistFm(showInfo, sourceConfig);
      } else {
        errors.push(`${sourceName}: unknown setlist source type`);
      }
    } catch (e) {
      errors.push(
        `${sourceName}: ${e instanceof Error ? e.message : String(e)}`,
      );
    }
  }

  throw new Error(
    `Failed to fetch setlist from all sources:\n${errors.map((e) => `  - ${e}`).join("\n")}`,
  );
}

/**
 * Fetch setlist from phish.net API.
 * First fetches show metadata to identify the correct show (when multiple shows on same date),
 * then fetches the actual setlist data.
 */
async function fetchPhishNet(
  showInfo: ShowInfo,
  sourceConfig: SetlistSourceConfig,
): Promise<Setlist> {
  const baseUrl = sourceConfig.url ?? "https://api.phish.net/v5";

  // Step 1: Get show metadata to identify the correct show
  const showsUrl = `${baseUrl}/shows/showdate/${showInfo.date}.json?apikey=${encodeURIComponent(sourceConfig.apiKey)}`;
  logger.logCurl("GET", showsUrl);
  const showsResponse = await fetch(showsUrl);
  if (!showsResponse.ok) {
    throw new Error(`API error: ${showsResponse.status} ${showsResponse.statusText}`);
  }

  const showsData = (await showsResponse.json()) as PhishNetShowsResponse;
  if (!showsData.data || showsData.data.length === 0) {
    throw new Error(`No show found for ${showInfo.date}`);
  }

  // Filter shows by artist name if multiple shows on same date
  let show = showsData.data[0];
  if (showsData.data.length > 1) {
    const matchingShow = showsData.data.find((s) =>
      s.artist_name?.toLowerCase() === showInfo.artist.toLowerCase()
    );
    if (!matchingShow) {
      const artists = showsData.data.map((s) => s.artist_name).join(", ");
      throw new Error(
        `Multiple shows found for ${showInfo.date} (${artists}), but none match artist "${showInfo.artist}"`
      );
    }
    show = matchingShow;
  }

  // Step 2: Fetch the actual setlist data using showid
  const setlistUrl = `${baseUrl}/setlists/showid/${show.showid}.json?apikey=${encodeURIComponent(sourceConfig.apiKey)}`;
  logger.logCurl("GET", setlistUrl);
  const setlistResponse = await fetch(setlistUrl);
  if (!setlistResponse.ok) {
    throw new Error(`API error fetching setlist: ${setlistResponse.status} ${setlistResponse.statusText}`);
  }

  const setlistData = (await setlistResponse.json()) as PhishNetSetlistResponse;
  if (!setlistData.data || setlistData.data.length === 0) {
    throw new Error(`No setlist data found for show ${show.showid}`);
  }

  return parsePhishNetSetlistResponse(show, setlistData.data, showInfo);
}

/**
 * Fetch setlist from kglw.net API.
 */
async function fetchKGLW(
  showInfo: ShowInfo,
  sourceConfig: SetlistSourceConfig,
): Promise<Setlist> {
  const baseUrl = sourceConfig.url ?? "https://kglw.net/api/v2";
  const url = `${baseUrl}/setlists/showdate/${showInfo.date}.json`;

  logger.logCurl("GET", url);
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as KGLWResponse;
  if (!data.data || data.data.length === 0) {
    throw new Error(`No setlist found for ${showInfo.date}`);
  }

  return parseKGLWResponse(data, showInfo);
}

/**
 * Fetch setlist from setlist.fm API.
 */
async function fetchSetlistFm(
  showInfo: ShowInfo,
  sourceConfig: SetlistSourceConfig,
): Promise<Setlist> {
  const baseUrl = sourceConfig.url ?? "https://api.setlist.fm/rest/1.0";

  // setlist.fm uses DD-MM-YYYY format
  const [y, m, d] = showInfo.date.split("-");
  const fmDate = `${d}-${m}-${y}`;

  const params = new URLSearchParams({
    artistName: showInfo.artist,
    date: fmDate,
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
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as SetlistFmSearchResponse;
  if (!data.setlist || data.setlist.length === 0) {
    throw new Error(
      `No setlist found for ${showInfo.artist} on ${showInfo.date}`,
    );
  }

  return parseSetlistFmResponse(data.setlist[0], showInfo);
}

// --- phish.net types and parsing ---

interface PhishNetShowsResponse {
  data: PhishNetShow[];
}

interface PhishNetShow {
  showid: string;
  showdate: string;
  artist_name?: string;
  artistid?: number;
  venuename?: string;
  venue?: string;
  city?: string;
  state?: string;
  country?: string;
}

interface PhishNetSetlistResponse {
  data: PhishNetSong[];
}

interface PhishNetSong {
  song: string;
  set: string; // "1", "2", "3" (encore), "E", "E2"
  position: number;
  venue?: string;
  city?: string;
  state?: string;
}

export function parsePhishNetSetlistResponse(
  show: PhishNetShow,
  songs: PhishNetSong[],
  showInfo: ShowInfo,
): Setlist {
  const setlistSongs: SetlistSong[] = songs.map((item) => ({
    title: item.song,
    set: parsePhishNetSet(item.set),
    position: item.position,
  }));

  // Build phish.net URL for this show
  const setlistUrl = `https://phish.net/setlists/?d=${showInfo.date}`;

  return {
    artist: show.artist_name ?? showInfo.artist,
    date: showInfo.date,
    venue: show.venuename ?? show.venue ?? showInfo.venue,
    city: show.city ?? showInfo.city,
    state: show.state ?? showInfo.state,
    country: show.country,
    songs: setlistSongs,
    source: "phish.net",
    url: setlistUrl,
  };
}

// Legacy function for backward compatibility with old show response format
export function parsePhishNetShowResponse(
  show: PhishNetShow & { setlistdata?: PhishNetSong[] },
  showInfo: ShowInfo,
): Setlist {
  const setlistData = show.setlistdata ?? [];
  const songs: SetlistSong[] = setlistData.map((item) => ({
    title: item.song,
    set: parsePhishNetSet(item.set),
    position: item.position,
  }));

  // Build phish.net URL for this show
  const setlistUrl = `https://phish.net/setlists/?d=${showInfo.date}`;

  return {
    artist: show.artist_name ?? showInfo.artist,
    date: showInfo.date,
    venue: show.venuename ?? show.venue ?? showInfo.venue,
    city: show.city ?? showInfo.city,
    state: show.state ?? showInfo.state,
    country: show.country,
    songs,
    source: "phish.net",
    url: setlistUrl,
  };
}

// Legacy function for backward compatibility with tests
export function parsePhishNetResponse(
  data: { data: Array<PhishNetSong & { venue?: string; city?: string; state?: string }> },
  showInfo: ShowInfo,
): Setlist {
  const songs: SetlistSong[] = data.data.map((item) => ({
    title: item.song,
    set: parsePhishNetSet(item.set),
    position: item.position,
  }));

  const setlistUrl = `https://phish.net/setlists/?d=${showInfo.date}`;

  return {
    artist: showInfo.artist,
    date: showInfo.date,
    venue: data.data[0]?.venue ?? showInfo.venue,
    city: data.data[0]?.city ?? showInfo.city,
    state: data.data[0]?.state ?? showInfo.state,
    songs,
    source: "phish.net",
    url: setlistUrl,
  };
}

function parsePhishNetSet(set: string): number {
  const s = set.toUpperCase();
  if (s === "E" || s === "E2" || s === "3") return 3;
  const n = parseInt(set, 10);
  return isNaN(n) ? 1 : n;
}

// --- kglw.net types and parsing ---

interface KGLWResponse {
  data: KGLWSong[];
}

interface KGLWSong {
  songname: string;
  setnumber: string; // "1", "2", "Encore", etc.
  position: number;
  venuename?: string;
  city?: string;
  state?: string;
  country?: string;
  permalink?: string;
}

export function parseKGLWResponse(
  data: KGLWResponse,
  showInfo: ShowInfo,
): Setlist {
  const songs: SetlistSong[] = data.data.map((item) => ({
    title: item.songname,
    set: parseKGLWSet(item.setnumber),
    position: item.position,
  }));

  // Build kglw.net URL from permalink if available
  let setlistUrl: string;
  if (data.data[0]?.permalink) {
    const permalink = data.data[0].permalink;
    // Ensure permalink starts with /
    const path = permalink.startsWith('/') ? permalink : `/${permalink}`;
    // If permalink doesn't include /setlists/, add it
    const fullPath = path.startsWith('/setlists/') ? path : `/setlists${path}`;
    setlistUrl = `https://kglw.net${fullPath}`;
  } else {
    setlistUrl = `https://kglw.net/setlists/${showInfo.date}`;
  }

  return {
    artist: showInfo.artist,
    date: showInfo.date,
    venue: data.data[0]?.venuename ?? showInfo.venue,
    city: data.data[0]?.city ?? showInfo.city,
    state: data.data[0]?.state ?? showInfo.state,
    country: data.data[0]?.country,
    songs,
    source: "kglw.net",
    url: setlistUrl,
  };
}

function parseKGLWSet(setNumber: string): number {
  const s = setNumber.toLowerCase();
  if (s === "encore" || s === "e" || s === "3") return 3;
  const n = parseInt(setNumber, 10);
  return isNaN(n) ? 1 : n;
}

// --- setlist.fm types and parsing ---

interface SetlistFmSearchResponse {
  setlist: SetlistFmSetlist[];
}

interface SetlistFmSetlist {
  id: string;
  url: string;
  artist: { name: string };
  venue: {
    name: string;
    city: {
      name: string;
      stateCode: string;
      country?: { name: string };
    }
  };
  eventDate: string;
  sets: {
    set: SetlistFmSet[];
  };
}

interface SetlistFmSet {
  name?: string;
  encore?: number;
  song: SetlistFmSong[];
}

interface SetlistFmSong {
  name: string;
}

export function parseSetlistFmResponse(
  data: SetlistFmSetlist,
  showInfo: ShowInfo,
): Setlist {
  const songs: SetlistSong[] = [];

  for (const set of data.sets.set) {
    const setNumber = resolveSetlistFmSetNumber(set);

    for (let i = 0; i < set.song.length; i++) {
      songs.push({
        title: set.song[i].name,
        set: setNumber,
        position: i + 1,
      });
    }
  }

  // setlist.fm provides a URL directly, or we can construct one from the ID
  const setlistUrl = data.url ?? `https://www.setlist.fm/setlist/-/${data.id}.html`;

  return {
    artist: data.artist?.name ?? showInfo.artist,
    date: showInfo.date,
    venue: data.venue?.name ?? showInfo.venue,
    city: data.venue?.city?.name ?? showInfo.city,
    state: data.venue?.city?.stateCode ?? showInfo.state,
    country: data.venue?.city?.country?.name,
    songs,
    source: "setlist.fm",
    url: setlistUrl,
  };
}

function resolveSetlistFmSetNumber(set: SetlistFmSet): number {
  if (set.encore !== undefined) return 3;
  const name = (set.name ?? "").toLowerCase();
  if (name.includes("encore")) return 3;
  if (name.includes("2") || name === "set 2") return 2;
  if (name.includes("3") || name === "set 3") return 3;
  return 1;
}
