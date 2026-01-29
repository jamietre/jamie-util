import type {
  Setlist,
  SetlistSong,
  ShowInfo,
  BandConfig,
  Config,
  SetlistSourceConfig,
} from "./types.js";

/**
 * Fetch a setlist by trying each configured source in order.
 * Returns the first successful result. Throws if all sources fail.
 */
export async function fetchSetlist(
  showInfo: ShowInfo,
  bandConfig: BandConfig,
  config: Config
): Promise<Setlist> {
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
      } else if (sourceName === "setlist.fm") {
        return await fetchSetlistFm(showInfo, sourceConfig);
      } else {
        errors.push(`${sourceName}: unknown setlist source type`);
      }
    } catch (e) {
      errors.push(
        `${sourceName}: ${e instanceof Error ? e.message : String(e)}`
      );
    }
  }

  throw new Error(
    `Failed to fetch setlist from all sources:\n${errors.map((e) => `  - ${e}`).join("\n")}`
  );
}

/**
 * Fetch setlist from phish.net API.
 */
async function fetchPhishNet(
  showInfo: ShowInfo,
  sourceConfig: SetlistSourceConfig
): Promise<Setlist> {
  const baseUrl =
    sourceConfig.url ?? "https://api.phish.net/v5";
  const url = `${baseUrl}/setlists/showdate/${showInfo.date}.json?apikey=${encodeURIComponent(sourceConfig.apiKey)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`API error: ${response.status} ${response.statusText}`);
  }

  const data = (await response.json()) as PhishNetResponse;
  if (!data.data || data.data.length === 0) {
    throw new Error(`No setlist found for ${showInfo.date}`);
  }

  return parsePhishNetResponse(data, showInfo);
}

/**
 * Fetch setlist from setlist.fm API.
 */
async function fetchSetlistFm(
  showInfo: ShowInfo,
  sourceConfig: SetlistSourceConfig
): Promise<Setlist> {
  const baseUrl =
    sourceConfig.url ?? "https://api.setlist.fm/rest/1.0";

  // setlist.fm uses DD-MM-YYYY format
  const [y, m, d] = showInfo.date.split("-");
  const fmDate = `${d}-${m}-${y}`;

  const params = new URLSearchParams({
    artistName: showInfo.artist,
    date: fmDate,
  });

  const url = `${baseUrl}/search/setlists?${params}`;
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
      `No setlist found for ${showInfo.artist} on ${showInfo.date}`
    );
  }

  return parseSetlistFmResponse(data.setlist[0], showInfo);
}

// --- phish.net types and parsing ---

interface PhishNetResponse {
  data: PhishNetSong[];
}

interface PhishNetSong {
  song: string;
  set: string; // "1", "2", "3" (encore), "E", "E2"
  position: number;
  venuename?: string;
  city?: string;
  state?: string;
}

export function parsePhishNetResponse(
  data: PhishNetResponse,
  showInfo: ShowInfo
): Setlist {
  const songs: SetlistSong[] = data.data.map((item) => ({
    title: item.song,
    set: parsePhishNetSet(item.set),
    position: item.position,
  }));

  return {
    artist: showInfo.artist,
    date: showInfo.date,
    venue: data.data[0]?.venuename ?? showInfo.venue,
    city: data.data[0]?.city ?? showInfo.city,
    state: data.data[0]?.state ?? showInfo.state,
    songs,
  };
}

function parsePhishNetSet(set: string): number {
  if (set === "E" || set === "E2" || set === "3") return 3;
  const n = parseInt(set, 10);
  return isNaN(n) ? 1 : n;
}

// --- setlist.fm types and parsing ---

interface SetlistFmSearchResponse {
  setlist: SetlistFmSetlist[];
}

interface SetlistFmSetlist {
  artist: { name: string };
  venue: { name: string; city: { name: string; stateCode: string } };
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
  showInfo: ShowInfo
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

  return {
    artist: data.artist?.name ?? showInfo.artist,
    date: showInfo.date,
    venue: data.venue?.name ?? showInfo.venue,
    city: data.venue?.city?.name ?? showInfo.city,
    state: data.venue?.city?.stateCode ?? showInfo.state,
    songs,
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
