import { describe, it, expect } from "vitest";
import {
  matchTracks,
  mergeEncoreIntoSet2,
  naturalCompare,
  TrackCountMismatchError,
} from "./match.js";
import type { AudioInfo, SetlistSong } from "./types.js";

function makeAudio(name: string, trackNumber?: number): AudioInfo {
  return {
    filePath: `/tmp/${name}`,
    bitsPerSample: 16,
    sampleRate: 44100,
    trackNumber,
    title: undefined,
    duration: 300,
  };
}

function makeSong(title: string, set: number, position: number): SetlistSong {
  return { title, set, position };
}

describe("mergeEncoreIntoSet2", () => {
  it("moves encore songs into set 2 with continued numbering", () => {
    const songs: SetlistSong[] = [
      makeSong("A", 1, 1),
      makeSong("B", 2, 1),
      makeSong("C", 2, 2),
      makeSong("D", 3, 1), // encore
      makeSong("E", 3, 2), // encore
    ];
    const result = mergeEncoreIntoSet2(songs);
    expect(result[3].set).toBe(2);
    expect(result[3].position).toBe(3); // 2 set2 songs + position 1
    expect(result[4].set).toBe(2);
    expect(result[4].position).toBe(4); // 2 set2 songs + position 2
    // Set 1 and 2 unchanged
    expect(result[0].set).toBe(1);
    expect(result[1].set).toBe(2);
  });

  it("handles no encore", () => {
    const songs = [makeSong("A", 1, 1), makeSong("B", 2, 1)];
    const result = mergeEncoreIntoSet2(songs);
    expect(result).toEqual(songs);
  });
});

describe("matchTracks", () => {
  it("matches by tag track numbers", () => {
    const files = [
      makeAudio("03.flac", 3),
      makeAudio("01.flac", 1),
      makeAudio("02.flac", 2),
    ];
    const songs = [
      makeSong("First", 1, 1),
      makeSong("Second", 1, 2),
      makeSong("Third", 1, 3),
    ];
    const result = matchTracks(files, songs, false);
    expect(result[0].audioFile.trackNumber).toBe(1);
    expect(result[0].song.title).toBe("First");
    expect(result[2].audioFile.trackNumber).toBe(3);
    expect(result[2].song.title).toBe("Third");
  });

  it("falls back to positional match with natural sort", () => {
    const files = [
      makeAudio("track2.flac"),
      makeAudio("track10.flac"),
      makeAudio("track1.flac"),
    ];
    const songs = [
      makeSong("First", 1, 1),
      makeSong("Second", 1, 2),
      makeSong("Third", 1, 3),
    ];
    const result = matchTracks(files, songs, false);
    // Natural sort: track1, track2, track10
    expect(result[0].audioFile.filePath).toContain("track1.flac");
    expect(result[0].song.title).toBe("First");
    expect(result[1].audioFile.filePath).toContain("track2.flac");
    expect(result[2].audioFile.filePath).toContain("track10.flac");
  });

  it("throws on count mismatch", () => {
    const files = [makeAudio("01.flac"), makeAudio("02.flac")];
    const songs = [makeSong("Only", 1, 1)];
    expect(() => matchTracks(files, songs, false)).toThrow(
      TrackCountMismatchError
    );
  });

  it("matches by filename parsing", () => {
    const files = [
      makeAudio("d1t02 Song.flac"),
      makeAudio("d1t01 Song.flac"),
    ];
    const songs = [makeSong("First", 1, 1), makeSong("Second", 1, 2)];
    const result = matchTracks(files, songs, false);
    expect(result[0].audioFile.filePath).toContain("d1t01");
    expect(result[0].song.title).toBe("First");
  });

  it("merges encore into set 2 when configured", () => {
    const files = [makeAudio("01.flac", 1), makeAudio("02.flac", 2)];
    const songs = [makeSong("Set1", 1, 1), makeSong("Encore", 3, 1)];
    const result = matchTracks(files, songs, true);
    expect(result[1].effectiveSet).toBe(2);
  });
});

describe("naturalCompare", () => {
  it("sorts numerically within strings", () => {
    const items = ["track10", "track2", "track1"];
    items.sort(naturalCompare);
    expect(items).toEqual(["track1", "track2", "track10"]);
  });

  it("handles equal strings", () => {
    expect(naturalCompare("abc", "abc")).toBe(0);
  });

  it("handles pure numeric strings", () => {
    const items = ["10", "2", "1"];
    items.sort(naturalCompare);
    expect(items).toEqual(["1", "2", "10"]);
  });
});
