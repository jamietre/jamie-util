import * as path from "node:path";

/**
 * Audio format classification
 */
export type AudioCompression = "lossless" | "lossy";

export interface AudioFormat {
  extension: string;
  name: string;
  compression: AudioCompression;
  description?: string;
}

/**
 * Registry of known audio formats with compression type.
 * Only lossless formats should be converted to FLAC.
 * Lossy formats should be kept as-is (converting lossy to lossless doesn't recover lost quality).
 */
export const AUDIO_FORMATS: AudioFormat[] = [
  // Lossless formats
  {
    extension: ".flac",
    name: "FLAC",
    compression: "lossless",
    description: "Free Lossless Audio Codec",
  },
  {
    extension: ".wav",
    name: "WAV",
    compression: "lossless",
    description: "Waveform Audio File Format",
  },
  {
    extension: ".shn",
    name: "Shorten",
    compression: "lossless",
    description: "Shorten lossless compression",
  },
  {
    extension: ".ape",
    name: "APE",
    compression: "lossless",
    description: "Monkey's Audio",
  },
  {
    extension: ".alac",
    name: "ALAC",
    compression: "lossless",
    description: "Apple Lossless Audio Codec",
  },
  {
    extension: ".m4a",
    name: "M4A",
    compression: "lossless",
    description: "MPEG-4 Audio (can be lossless ALAC or lossy AAC - treated as lossless)",
  },
  {
    extension: ".aiff",
    name: "AIFF",
    compression: "lossless",
    description: "Audio Interchange File Format",
  },
  {
    extension: ".aif",
    name: "AIFF",
    compression: "lossless",
    description: "Audio Interchange File Format",
  },

  // Lossy formats (should NOT be converted to FLAC)
  {
    extension: ".mp3",
    name: "MP3",
    compression: "lossy",
    description: "MPEG Audio Layer III",
  },
  {
    extension: ".aac",
    name: "AAC",
    compression: "lossy",
    description: "Advanced Audio Coding",
  },
  {
    extension: ".ogg",
    name: "OGG",
    compression: "lossy",
    description: "Ogg Vorbis",
  },
  {
    extension: ".opus",
    name: "Opus",
    compression: "lossy",
    description: "Opus codec",
  },
  {
    extension: ".wma",
    name: "WMA",
    compression: "lossy",
    description: "Windows Media Audio",
  },
];

// Build a map for quick lookups
const FORMAT_MAP = new Map<string, AudioFormat>(
  AUDIO_FORMATS.map((f) => [f.extension.toLowerCase(), f])
);

/**
 * Get all known audio file extensions.
 */
export function getAudioExtensions(): Set<string> {
  return new Set(AUDIO_FORMATS.map((f) => f.extension));
}

/**
 * Check if a file is a known audio format.
 */
export function isKnownAudioFormat(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return FORMAT_MAP.has(ext);
}

/**
 * Get format information for a file.
 * Returns undefined if the format is unknown.
 */
export function getAudioFormat(filePath: string): AudioFormat | undefined {
  const ext = path.extname(filePath).toLowerCase();
  return FORMAT_MAP.get(ext);
}

/**
 * Check if a file is a lossless audio format.
 * Returns false for unknown formats.
 */
export function isLosslessFormat(filePath: string): boolean {
  const format = getAudioFormat(filePath);
  return format?.compression === "lossless" || false;
}

/**
 * Validate that a file is a known audio format.
 * Throws an error if the format is unknown.
 */
export function validateAudioFormat(filePath: string): AudioFormat {
  const format = getAudioFormat(filePath);
  if (!format) {
    const ext = path.extname(filePath);
    throw new Error(
      `Unknown audio format: ${ext}\n` +
      `File: ${path.basename(filePath)}\n` +
      `Supported formats: ${Array.from(FORMAT_MAP.keys()).join(", ")}`
    );
  }
  return format;
}
