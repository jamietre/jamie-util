import type { AudioInfo } from "./types.js";

/**
 * Defines a rule for when and how to convert audio files.
 */
export interface ConversionRule {
  /** Human-readable name for this rule */
  name: string;

  /** Optional description explaining what this rule does */
  description?: string;

  /**
   * Predicate function to determine if this rule applies to a given audio file.
   * Returns true if the file should be converted according to this rule.
   */
  matches: (audio: AudioInfo) => boolean;

  /** Target audio format specifications */
  target: {
    /** Target bit depth (e.g., 16, 24) */
    bitDepth?: number;

    /** Target sample rate in Hz (e.g., 44100, 48000) */
    sampleRate?: number;

    /** Target codec (currently only 'flac' supported) */
    codec?: "flac";
  };

  /** FFmpeg-specific conversion options */
  ffmpegOptions: {
    /** Enable dithering when reducing bit depth (recommended for 24→16) */
    dither?: boolean;

    /**
     * Resampling quality (SoXR precision):
     * - low: precision=16 (fast)
     * - medium: precision=20 (default SoXR)
     * - high: precision=28 (archival quality, recommended)
     */
    resampleQuality?: "high" | "medium" | "low";

    /** Custom FFmpeg arguments to append */
    customArgs?: string[];
  };
}

/**
 * Default conversion rules.
 * These are evaluated in order; the first matching rule is used.
 * If no rule matches, conversion will fail with an error.
 */
export const CONVERSION_RULES: ConversionRule[] = [
  {
    name: "Reduce bit depth and resample",
    description: "Convert >16-bit AND >48kHz to 16-bit/48kHz (dither for bit reduction, high-quality resample)",
    matches: (audio) => {
      const bits = audio.bitsPerSample ?? 16;
      const rate = audio.sampleRate ?? 48000;
      return bits > 16 && rate > 48000;
    },
    target: {
      bitDepth: 16,
      sampleRate: 48000,
      codec: "flac",
    },
    ffmpegOptions: {
      dither: true, // Needed for bit depth reduction
      resampleQuality: "high",
    },
  },

  {
    name: "Reduce bit depth only",
    description: "Convert >16-bit to 16-bit with dithering (sample rate already acceptable)",
    matches: (audio) => {
      const bits = audio.bitsPerSample ?? 16;
      const rate = audio.sampleRate ?? 48000;
      return bits > 16 && rate <= 48000;
    },
    target: {
      bitDepth: 16,
      codec: "flac",
    },
    ffmpegOptions: {
      dither: true, // Needed for bit depth reduction
    },
  },

  {
    name: "Resample only",
    description: "Resample >48kHz to 48kHz (bit depth already 16-bit, no dithering needed)",
    matches: (audio) => {
      const bits = audio.bitsPerSample ?? 16;
      const rate = audio.sampleRate ?? 48000;
      return bits === 16 && rate > 48000;
    },
    target: {
      sampleRate: 48000,
      codec: "flac",
    },
    ffmpegOptions: {
      resampleQuality: "high",
      // No dithering - only resampling, not bit depth reduction
    },
  },

  {
    name: "Keep CD quality as-is",
    description: "16-bit/44.1kHz files (CD quality) don't need conversion",
    matches: (audio) => {
      const bits = audio.bitsPerSample ?? 16;
      const rate = audio.sampleRate ?? 44100;
      return bits === 16 && rate === 44100;
    },
    target: {},
    ffmpegOptions: {},
  },

  {
    name: "Keep 16/48 as-is",
    description: "16-bit/48kHz files are already at target quality",
    matches: (audio) => {
      const bits = audio.bitsPerSample ?? 16;
      const rate = audio.sampleRate ?? 48000;
      return bits === 16 && rate === 48000;
    },
    target: {},
    ffmpegOptions: {},
  },
];

/**
 * Find the first conversion rule that matches the given audio file.
 * Throws an error if no rule matches.
 */
export function findMatchingRule(audio: AudioInfo): ConversionRule {
  const rule = CONVERSION_RULES.find((r) => r.matches(audio));
  if (!rule) {
    const bits = audio.bitsPerSample ?? "unknown";
    const rate = audio.sampleRate ?? "unknown";
    throw new Error(
      `No conversion rule matched for audio file: ${audio.filePath}\n` +
      `  Bit depth: ${bits}, Sample rate: ${rate}Hz\n` +
      `  Please add a conversion rule in src/config/conversion-rules.ts`
    );
  }
  return rule;
}

/**
 * Check if a conversion rule requires any actual conversion.
 */
export function ruleRequiresConversion(rule: ConversionRule): boolean {
  return (
    rule.target.bitDepth !== undefined ||
    rule.target.sampleRate !== undefined ||
    rule.target.codec !== undefined
  );
}
