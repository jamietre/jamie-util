/**
 * Archive structure identification strategy.
 * Extracts show information from archive directory structure and manifest files.
 * This is a Phase 2 feature that runs early and has high priority.
 */

import * as path from "node:path";
import type {
  ShowIdentificationStrategy,
  ShowIdentificationResult,
  IdentificationContext,
} from "../types.js";
import type { ArchiveStructureSuggestion } from "../../llm/types.js";
import { extractShowInfo, readManifestFiles } from "../../llm/show-info-extractor.js";
import { buildDirectoryTree, formatDirectoryTree, findAudioFiles } from "../../utils/directory-tree.js";

/**
 * Strategy that extracts show info from archive structure and manifest files.
 * Priority: HIGHEST - should run before FilenameStrategy
 * Confidence: 75-95% depending on completeness of manifest files
 */
export class ArchiveStructureStrategy implements ShowIdentificationStrategy {
  readonly name = "archive-structure";
  readonly description = "Extract show info from archive structure and manifest files";
  readonly requiresExtraction = true;  // Need to read manifest files
  readonly requiresLLM = true;
  readonly requiresWebSearch = false;

  /**
   * Cached structure analysis result to avoid re-analyzing.
   * Set by the pipeline when it performs early structure analysis.
   */
  private cachedStructureAnalysis?: ArchiveStructureSuggestion;

  /**
   * Set cached structure analysis from pipeline's early scan.
   */
  setCachedStructureAnalysis(analysis: ArchiveStructureSuggestion): void {
    this.cachedStructureAnalysis = analysis;
  }

  async identify(context: IdentificationContext): Promise<ShowIdentificationResult | null> {
    // Requires LLM service
    if (!context.llmService) {
      return null;
    }

    // Requires extraction
    if (!context.extractedDir) {
      return null;
    }

    // Get or perform structure analysis
    const structureAnalysis = await this.getStructureAnalysis(context);

    // Check if structure analysis found any show info hints or manifest files
    if (!structureAnalysis.showInfoHints &&
        !structureAnalysis.manifestFiles?.infoFiles?.length &&
        !structureAnalysis.manifestFiles?.setlistFiles?.length) {
      // No useful information in structure
      return null;
    }

    // Gather manifest files to read
    const manifestFilePaths = this.gatherManifestFilePaths(structureAnalysis);

    // If no manifest files and no hints, can't extract anything
    if (manifestFilePaths.length === 0 && !structureAnalysis.showInfoHints) {
      return null;
    }

    // Read manifest file contents
    const manifestFiles = await readManifestFiles(
      context.extractedDir,
      manifestFilePaths,
    );

    // Get audio file patterns
    const musicDir = path.join(
      context.extractedDir,
      structureAnalysis.musicDirectory,
    );
    const directoryTree = await buildDirectoryTree(musicDir, [], 3);
    const audioFilePaths = findAudioFiles(directoryTree);
    const filenamePatterns = audioFilePaths.map((p) => path.basename(p));

    // Extract show information using LLM
    const showInfoResult = await extractShowInfo(
      {
        archiveName: context.filename,
        directoryStructure: formatDirectoryTree(directoryTree, 3),
        manifestFiles,
        filenamePatterns,
        showInfoHints: structureAnalysis.showInfoHints,
      },
      context.llmService,
    );

    // If extraction failed or has very low confidence, return null
    if (showInfoResult.confidence < 0.6) {
      return null;
    }

    // Build evidence list
    const evidence: string[] = [
      `Source: ${showInfoResult.source}`,
    ];

    if (structureAnalysis.showInfoHints) {
      evidence.push(`Structure hints: ${structureAnalysis.showInfoHints.source}`);
    }

    if (Object.keys(manifestFiles).length > 0) {
      evidence.push(
        `Manifest files: ${Object.keys(manifestFiles).join(", ")}`,
      );
    }

    if (showInfoResult.artist) {
      evidence.push(`Artist: ${showInfoResult.artist}`);
    }
    if (showInfoResult.date) {
      evidence.push(`Date: ${showInfoResult.date}`);
    }
    if (showInfoResult.venue) {
      evidence.push(`Venue: ${showInfoResult.venue}`);
    }
    if (showInfoResult.city || showInfoResult.state) {
      const location = [showInfoResult.city, showInfoResult.state]
        .filter(Boolean)
        .join(", ");
      evidence.push(`Location: ${location}`);
    }
    if (showInfoResult.setlist && showInfoResult.setlist.length > 0) {
      evidence.push(`Setlist: ${showInfoResult.setlist.length} songs extracted`);
    }

    // Convert LLM confidence (0-1) to strategy confidence (0-100)
    const confidence = Math.round(showInfoResult.confidence * 100);

    return {
      showInfo: {
        artist: showInfoResult.artist,
        date: showInfoResult.date,
        venue: showInfoResult.venue,
        city: showInfoResult.city,
        state: showInfoResult.state,
      },
      confidence,
      source: this.name,
      evidence,
      reasoning: showInfoResult.reasoning,
      extractedSetlist: showInfoResult.setlist, // Include extracted setlist (Phase 2)
    };
  }

  /**
   * Get structure analysis (use cached if available, otherwise analyze).
   */
  private async getStructureAnalysis(
    context: IdentificationContext,
  ): Promise<ArchiveStructureSuggestion> {
    if (this.cachedStructureAnalysis) {
      return this.cachedStructureAnalysis;
    }

    // Analyze structure if not cached
    if (!context.llmService || !context.extractedDir) {
      throw new Error("Cannot analyze structure without LLM service and extracted directory");
    }

    const directoryTree = await buildDirectoryTree(context.extractedDir);
    const audioExtensions = [".flac", ".mp3", ".wav", ".m4a", ".ogg", ".ape"];

    return context.llmService.analyzeArchiveStructure({
      archiveName: context.filename,
      directoryTreeText: formatDirectoryTree(directoryTree, 5),
      audioExtensions,
      excludePatterns: [],
      totalFiles: this.countFiles(directoryTree),
      totalAudioFiles: this.countAudioFiles(directoryTree),
    });
  }

  /**
   * Gather all manifest file paths from structure analysis.
   */
  private gatherManifestFilePaths(analysis: ArchiveStructureSuggestion): string[] {
    const paths: string[] = [];

    if (!analysis.manifestFiles) {
      return paths;
    }

    if (analysis.manifestFiles.infoFiles) {
      paths.push(...analysis.manifestFiles.infoFiles);
    }
    if (analysis.manifestFiles.setlistFiles) {
      paths.push(...analysis.manifestFiles.setlistFiles);
    }
    // Note: We don't read artwork files for show info extraction

    return paths;
  }

  /**
   * Count total files in directory tree.
   */
  private countFiles(node: { type: string; children?: Array<unknown> }): number {
    let count = node.type === "file" ? 1 : 0;
    if (node.children) {
      for (const child of node.children) {
        count += this.countFiles(child as { type: string; children?: Array<unknown> });
      }
    }
    return count;
  }

  /**
   * Count audio files in directory tree.
   */
  private countAudioFiles(node: { type: string; extension?: string; children?: Array<unknown> }): number {
    const audioExtensions = new Set([".flac", ".mp3", ".wav", ".m4a", ".ogg", ".ape"]);
    let count = 0;
    if (node.type === "file" && node.extension && audioExtensions.has(node.extension)) {
      count = 1;
    }
    if (node.children) {
      for (const child of node.children) {
        count += this.countAudioFiles(child as { type: string; extension?: string; children?: Array<unknown> });
      }
    }
    return count;
  }
}
