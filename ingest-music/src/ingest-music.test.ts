import { describe, it, expect, vi } from "vitest";

// Test the pure helper logic that's exported from tagger (buildTemplateVars)
// and the integration of match + template rendering
import { buildTemplateVars } from "./output/tagger.js";
import { renderTemplate } from "./output/template.js";
import type { MatchedTrack, ShowInfo, BandConfig } from "./config/types.js";

describe("ingest-music pipeline helpers", () => {
  const showInfo: ShowInfo = {
    artist: "Phish",
    date: "2024-08-16",
    venue: "Dick's Sporting Goods Park",
    city: "Commerce City",
    state: "CO",
  };

  const track: MatchedTrack = {
    audioFile: {
      filePath: "/tmp/d1t01.flac",
      bitsPerSample: 16,
      sampleRate: 44100,
      trackNumber: 1,
      discNumber: undefined,
      title: undefined,
      duration: 600,
    },
    song: { title: "Tweezer", set: 1, position: 1 },
    effectiveSet: 1,
    trackInSet: 1,
  };

  const bandConfig: BandConfig = {
    setlistSources: ["phish.net"],
    albumTemplate: "{date} - {venue}, {city}, {state}",
    albumArtist: "{artist}",
    genre: "Jam",
    targetPathTemplate: "{artist}/{date} - {venue}, {city}, {state}",
    fileNameTemplate: "{date} S{set} T{track} - {title}.flac",
    encoreInSet2: true,
  };

  it("builds template vars from matched track", () => {
    const vars = buildTemplateVars(track, showInfo);
    expect(vars.artist).toBe("Phish");
    expect(vars.date).toBe("2024-08-16");
    expect(vars.title).toBe("Tweezer");
    expect(vars.track).toBe("01");
    expect(vars.set).toBe(1);
  });

  it("renders custom date format using {date:FORMAT} syntax", () => {
    const vars = buildTemplateVars(track, showInfo);
    const result = renderTemplate("{date:YYYY.MM.DD}", vars);
    expect(result).toBe("2024.08.16");
  });

  it("renders target path template", () => {
    const vars = buildTemplateVars(track, showInfo);
    const result = renderTemplate(bandConfig.targetPathTemplate, vars);
    expect(result).toBe(
      "Phish/2024-08-16 - Dick's Sporting Goods Park, Commerce City, CO"
    );
  });

  it("renders filename template", () => {
    const vars = buildTemplateVars(track, showInfo);
    const result = renderTemplate(bandConfig.fileNameTemplate, vars);
    expect(result).toBe("2024-08-16 S1 T01 - Tweezer.flac");
  });

  it("renders album template", () => {
    const vars = buildTemplateVars(track, showInfo);
    const result = renderTemplate(bandConfig.albumTemplate, vars);
    expect(result).toBe(
      "2024-08-16 - Dick's Sporting Goods Park, Commerce City, CO"
    );
  });
});
