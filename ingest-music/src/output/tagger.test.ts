import { describe, it, expect } from "vitest";
import { buildTemplateVars } from "./tagger.js";
import type { MatchedTrack, ShowInfo, AudioInfo, SetlistSong } from "../config/types.js";

describe("buildTemplateVars", () => {
  const baseAudioInfo: AudioInfo = {
    filePath: "/path/to/file.flac",
    codec: undefined,
    container: undefined,
    bitsPerSample: 16,
    sampleRate: 48000,
    trackNumber: 1,
    discNumber: 1,
    title: "Test Song",
    duration: 300,
  };

  const baseSong: SetlistSong = {
    title: "Tweezer",
    set: 1,
    position: 1,
  };

  const baseTrack: MatchedTrack = {
    audioFile: baseAudioInfo,
    song: baseSong,
    effectiveSet: 1,
    trackInSet: 1,
  };

  describe("location variable", () => {
    it("includes state for US shows (2-letter state code)", () => {
      const showInfo: ShowInfo = {
        artist: "Phish",
        date: "2024-08-16",
        venue: "Dick's Sporting Goods Park",
        city: "Commerce City",
        state: "CO",
      };

      const vars = buildTemplateVars(baseTrack, showInfo);
      expect(vars.location).toBe("Commerce City, CO");
    });

    it("omits state for international shows (non-US state code)", () => {
      const showInfo: ShowInfo = {
        artist: "King Gizzard",
        date: "2025-11-10",
        venue: "Columbiahalle",
        city: "Berlin",
        state: "16", // Not a US state
      };

      const vars = buildTemplateVars(baseTrack, showInfo);
      expect(vars.location).toBe("Berlin");
    });

    it("omits state when state is empty", () => {
      const showInfo: ShowInfo = {
        artist: "Phish",
        date: "2024-08-16",
        venue: "Royal Albert Hall",
        city: "London",
        state: "",
      };

      const vars = buildTemplateVars(baseTrack, showInfo);
      expect(vars.location).toBe("London");
    });

    it("handles lowercase state codes", () => {
      const showInfo: ShowInfo = {
        artist: "Phish",
        date: "2024-08-16",
        venue: "Madison Square Garden",
        city: "New York",
        state: "ny",
      };

      const vars = buildTemplateVars(baseTrack, showInfo);
      expect(vars.location).toBe("New York, ny");
    });

    it("omits state for 3+ letter codes", () => {
      const showInfo: ShowInfo = {
        artist: "Phish",
        date: "2024-08-16",
        venue: "Venue",
        city: "City",
        state: "ABC",
      };

      const vars = buildTemplateVars(baseTrack, showInfo);
      expect(vars.location).toBe("City");
    });

    it("omits state for single letter codes", () => {
      const showInfo: ShowInfo = {
        artist: "Phish",
        date: "2024-08-16",
        venue: "Venue",
        city: "City",
        state: "X",
      };

      const vars = buildTemplateVars(baseTrack, showInfo);
      expect(vars.location).toBe("City");
    });

    it("includes country for international shows", () => {
      const showInfo: ShowInfo = {
        artist: "King Gizzard",
        date: "2025-11-10",
        venue: "Columbiahalle",
        city: "Berlin",
        state: "16", // Not a US state
        country: "Germany",
      };

      const vars = buildTemplateVars(baseTrack, showInfo);
      expect(vars.location).toBe("Berlin, Germany");
    });

    it("prefers state over country for US shows", () => {
      const showInfo: ShowInfo = {
        artist: "Phish",
        date: "2024-08-16",
        venue: "Venue",
        city: "New York",
        state: "NY",
        country: "United States",
      };

      const vars = buildTemplateVars(baseTrack, showInfo);
      expect(vars.location).toBe("New York, NY");
    });
  });

  describe("all template variables", () => {
    it("includes all expected variables", () => {
      const showInfo: ShowInfo = {
        artist: "Phish",
        date: "2024-08-16",
        venue: "Dick's",
        city: "Commerce City",
        state: "CO",
      };

      const vars = buildTemplateVars(baseTrack, showInfo);

      expect(vars).toHaveProperty("artist");
      expect(vars).toHaveProperty("date");
      expect(vars).toHaveProperty("venue");
      expect(vars).toHaveProperty("city");
      expect(vars).toHaveProperty("state");
      expect(vars).toHaveProperty("location");
      expect(vars).toHaveProperty("title");
      expect(vars).toHaveProperty("track");
      expect(vars).toHaveProperty("set");
      expect(vars).toHaveProperty("discnumber");
    });
  });
});
