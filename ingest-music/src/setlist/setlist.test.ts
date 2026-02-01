import { describe, it, expect } from "vitest";
import {
  parsePhishNetResponse,
  parsePhishNetShowResponse,
  parsePhishNetSetlistResponse,
  parseKGLWResponse,
  parseSetlistFmResponse,
} from "./setlist.js";
import type { ShowInfo } from "../config/types.js";

const showInfo: ShowInfo = {
  artist: "Phish",
  date: "2024-08-16",
  venue: "Dick's Sporting Goods Park",
  city: "Commerce City",
  state: "CO",
};

describe("parsePhishNetResponse", () => {
  it("parses songs with set and position", () => {
    const data = {
      data: [
        { song: "Tweezer", set: "1", position: 1, venuename: "Dick's", city: "Commerce City", state: "CO" },
        { song: "Blaze On", set: "1", position: 2 },
        { song: "Fluffhead", set: "2", position: 1 },
        { song: "First Tube", set: "E", position: 1 },
      ],
    };
    const result = parsePhishNetResponse(data, showInfo);
    expect(result.songs).toHaveLength(4);
    expect(result.songs[0]).toEqual({
      title: "Tweezer",
      set: 1,
      position: 1,
    });
    expect(result.songs[2]).toEqual({
      title: "Fluffhead",
      set: 2,
      position: 1,
    });
    expect(result.songs[3]).toEqual({
      title: "First Tube",
      set: 3,
      position: 1,
    });
  });

  it("uses venue info from API when available", () => {
    const data = {
      data: [
        { song: "Song", set: "1", position: 1, venue: "API Venue", city: "API City", state: "NY" },
      ],
    };
    const result = parsePhishNetResponse(data, showInfo);
    expect(result.venue).toBe("API Venue");
    expect(result.city).toBe("API City");
    expect(result.state).toBe("NY");
  });

  it("falls back to showInfo for missing venue data", () => {
    const data = {
      data: [{ song: "Song", set: "1", position: 1 }],
    };
    const result = parsePhishNetResponse(data, showInfo);
    expect(result.venue).toBe("Dick's Sporting Goods Park");
  });

  it("handles E2 as encore (set 3)", () => {
    const data = {
      data: [{ song: "Song", set: "E2", position: 1 }],
    };
    const result = parsePhishNetResponse(data, showInfo);
    expect(result.songs[0].set).toBe(3);
  });

  it("includes source and URL", () => {
    const data = {
      data: [{ song: "Song", set: "1", position: 1 }],
    };
    const result = parsePhishNetResponse(data, showInfo);
    expect(result.source).toBe("phish.net");
    expect(result.url).toBe("https://phish.net/setlists/?d=2024-08-16");
  });
});

describe("parsePhishNetSetlistResponse", () => {
  it("combines show metadata with setlist songs", () => {
    const show = {
      showid: "123",
      showdate: "2024-08-16",
      artist_name: "Phish",
      artistid: 1,
      venuename: "Dick's Sporting Goods Park",
      city: "Commerce City",
      state: "CO",
    };
    const songs = [
      { song: "Tweezer", set: "1", position: 1 },
      { song: "Fluffhead", set: "2", position: 1 },
      { song: "First Tube", set: "E", position: 1 },
    ];
    const result = parsePhishNetSetlistResponse(show, songs, showInfo);
    expect(result.artist).toBe("Phish");
    expect(result.venue).toBe("Dick's Sporting Goods Park");
    expect(result.songs).toHaveLength(3);
    expect(result.songs[0]).toEqual({ title: "Tweezer", set: 1, position: 1 });
    expect(result.songs[2]).toEqual({ title: "First Tube", set: 3, position: 1 });
  });

  it("handles empty setlist", () => {
    const show = {
      showid: "123",
      showdate: "2024-08-16",
      artist_name: "Phish",
      artistid: 1,
    };
    const result = parsePhishNetSetlistResponse(show, [], showInfo);
    expect(result.songs).toHaveLength(0);
  });

  it("falls back to showInfo when show data is missing", () => {
    const show = {
      showid: "123",
      showdate: "2024-08-16",
    };
    const songs = [{ song: "Song", set: "1", position: 1 }];
    const result = parsePhishNetSetlistResponse(show, songs, showInfo);
    expect(result.artist).toBe("Phish");
    expect(result.venue).toBe("Dick's Sporting Goods Park");
    expect(result.city).toBe("Commerce City");
  });

  it("includes correct source and URL", () => {
    const show = {
      showid: "123",
      showdate: "2024-08-16",
    };
    const songs = [{ song: "Song", set: "1", position: 1 }];
    const result = parsePhishNetSetlistResponse(show, songs, showInfo);
    expect(result.source).toBe("phish.net");
    expect(result.url).toBe("https://phish.net/setlists/?d=2024-08-16");
  });

  it("includes country when provided by API", () => {
    const show = {
      showid: "123",
      showdate: "2024-08-16",
      country: "USA",
    };
    const songs = [{ song: "Song", set: "1", position: 1 }];
    const result = parsePhishNetSetlistResponse(show, songs, showInfo);
    expect(result.country).toBe("USA");
  });

  it("handles missing country gracefully", () => {
    const show = {
      showid: "123",
      showdate: "2024-08-16",
    };
    const songs = [{ song: "Song", set: "1", position: 1 }];
    const result = parsePhishNetSetlistResponse(show, songs, showInfo);
    expect(result.country).toBeUndefined();
  });
});

describe("parsePhishNetShowResponse (legacy)", () => {
  it("parses show with artist_name and setlistdata", () => {
    const show = {
      showid: "123",
      showdate: "2024-08-16",
      artist_name: "Phish",
      artistid: 1,
      venuename: "Dick's Sporting Goods Park",
      city: "Commerce City",
      state: "CO",
      setlistdata: [
        { song: "Tweezer", set: "1", position: 1 },
        { song: "Fluffhead", set: "2", position: 1 },
      ],
    };
    const result = parsePhishNetShowResponse(show, showInfo);
    expect(result.artist).toBe("Phish");
    expect(result.venue).toBe("Dick's Sporting Goods Park");
    expect(result.songs).toHaveLength(2);
    expect(result.songs[0].title).toBe("Tweezer");
  });

  it("handles missing setlistdata", () => {
    const show = {
      showid: "123",
      showdate: "2024-08-16",
      artist_name: "Phish",
      artistid: 1,
    };
    const result = parsePhishNetShowResponse(show, showInfo);
    expect(result.songs).toHaveLength(0);
  });
});

describe("parseKGLWResponse", () => {
  const kglwShowInfo: ShowInfo = {
    artist: "King Gizzard & the Lizard Wizard",
    date: "2024-08-16",
    venue: "Forest Hills Stadium",
    city: "Queens",
    state: "NY",
  };

  it("parses songs with set and position", () => {
    const data = {
      data: [
        { songname: "The Dripping Tap", setnumber: "1", position: 1, venuename: "Forest Hills Stadium", city: "Queens", state: "NY" },
        { songname: "Magma", setnumber: "1", position: 2 },
        { songname: "Gaia", setnumber: "2", position: 1 },
        { songname: "The River", setnumber: "Encore", position: 1 },
      ],
    };
    const result = parseKGLWResponse(data, kglwShowInfo);
    expect(result.songs).toHaveLength(4);
    expect(result.songs[0]).toEqual({
      title: "The Dripping Tap",
      set: 1,
      position: 1,
    });
    expect(result.songs[2]).toEqual({
      title: "Gaia",
      set: 2,
      position: 1,
    });
    expect(result.songs[3]).toEqual({
      title: "The River",
      set: 3,
      position: 1,
    });
  });

  it("uses venue info from API when available", () => {
    const data = {
      data: [
        { songname: "Song", setnumber: "1", position: 1, venuename: "API Venue", city: "API City", state: "CA" },
      ],
    };
    const result = parseKGLWResponse(data, kglwShowInfo);
    expect(result.venue).toBe("API Venue");
    expect(result.city).toBe("API City");
    expect(result.state).toBe("CA");
  });

  it("falls back to showInfo for missing venue data", () => {
    const data = {
      data: [{ songname: "Song", setnumber: "1", position: 1 }],
    };
    const result = parseKGLWResponse(data, kglwShowInfo);
    expect(result.venue).toBe("Forest Hills Stadium");
  });

  it("includes source and URL with permalink", () => {
    const data = {
      data: [{ songname: "Song", setnumber: "1", position: 1, permalink: "/setlists/2024-08-16-forest-hills" }],
    };
    const result = parseKGLWResponse(data, kglwShowInfo);
    expect(result.source).toBe("kglw.net");
    expect(result.url).toBe("https://kglw.net/setlists/2024-08-16-forest-hills");
  });

  it("includes source and URL without permalink", () => {
    const data = {
      data: [{ songname: "Song", setnumber: "1", position: 1 }],
    };
    const result = parseKGLWResponse(data, kglwShowInfo);
    expect(result.source).toBe("kglw.net");
    expect(result.url).toBe("https://kglw.net/setlists/2024-08-16");
  });

  it("handles permalink without leading slash", () => {
    const data = {
      data: [{ songname: "Song", setnumber: "1", position: 1, permalink: "king-gizzard-the-lizard-wizard-november-14-2025-poolen-copenhagen-denmark.html" }],
    };
    const result = parseKGLWResponse(data, kglwShowInfo);
    expect(result.url).toBe("https://kglw.net/setlists/king-gizzard-the-lizard-wizard-november-14-2025-poolen-copenhagen-denmark.html");
  });

  it("handles permalink with slash but without /setlists/", () => {
    const data = {
      data: [{ songname: "Song", setnumber: "1", position: 1, permalink: "/2024-08-16-forest-hills" }],
    };
    const result = parseKGLWResponse(data, kglwShowInfo);
    expect(result.url).toBe("https://kglw.net/setlists/2024-08-16-forest-hills");
  });
});

describe("parseSetlistFmResponse", () => {
  it("parses multi-set show with encore", () => {
    const data = {
      id: "abc123",
      url: "https://www.setlist.fm/setlist/king-gizzard/2024/abc123.html",
      artist: { name: "King Gizzard" },
      venue: {
        name: "Forest Hills Stadium",
        city: { name: "Queens", stateCode: "NY" },
      },
      eventDate: "16-08-2024",
      sets: {
        set: [
          {
            name: "Set 1",
            song: [{ name: "Mars for the Rich" }, { name: "Gamma Knife" }],
          },
          {
            name: "Set 2",
            song: [{ name: "Robot Stop" }],
          },
          {
            name: "Encore",
            encore: 1,
            song: [{ name: "Am I in Heaven?" }],
          },
        ],
      },
    };

    const result = parseSetlistFmResponse(data, {
      ...showInfo,
      artist: "King Gizzard",
    });

    expect(result.artist).toBe("King Gizzard");
    expect(result.venue).toBe("Forest Hills Stadium");
    expect(result.songs).toHaveLength(4);
    expect(result.songs[0]).toEqual({
      title: "Mars for the Rich",
      set: 1,
      position: 1,
    });
    expect(result.songs[2]).toEqual({
      title: "Robot Stop",
      set: 2,
      position: 1,
    });
    expect(result.songs[3]).toEqual({
      title: "Am I in Heaven?",
      set: 3,
      position: 1,
    });
  });

  it("falls back to showInfo when API data is missing", () => {
    const data = {
      id: "xyz789",
      url: "",
      artist: undefined as any,
      venue: undefined as any,
      eventDate: "16-08-2024",
      sets: { set: [] },
    };
    const result = parseSetlistFmResponse(data, showInfo);
    expect(result.artist).toBe("Phish");
    expect(result.venue).toBe("Dick's Sporting Goods Park");
  });

  it("includes source and URL", () => {
    const data = {
      id: "abc123",
      url: "https://www.setlist.fm/setlist/king-gizzard/2024/abc123.html",
      artist: { name: "King Gizzard" },
      venue: {
        name: "Forest Hills Stadium",
        city: { name: "Queens", stateCode: "NY" },
      },
      eventDate: "16-08-2024",
      sets: { set: [] },
    };
    const result = parseSetlistFmResponse(data, showInfo);
    expect(result.source).toBe("setlist.fm");
    expect(result.url).toBe("https://www.setlist.fm/setlist/king-gizzard/2024/abc123.html");
  });
});
