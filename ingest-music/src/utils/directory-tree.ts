import * as fs from "node:fs/promises";
import * as path from "node:path";
import { getAudioExtensions } from "../audio/formats.js";

/**
 * Represents a node in the directory tree.
 */
export interface DirectoryNode {
  name: string;
  type: "file" | "directory";
  path: string; // Relative path from tree root
  extension?: string; // File extension (e.g., ".flac")
  size?: number; // File size in bytes
  children?: DirectoryNode[]; // Child nodes for directories
}

/**
 * Check if a file should be excluded based on regex patterns.
 */
function shouldExclude(name: string, excludePatterns: string[]): boolean {
  return excludePatterns.some((pattern) => {
    try {
      const regex = new RegExp(pattern);
      return regex.test(name);
    } catch (e) {
      console.warn(`Invalid exclude pattern: ${pattern}`);
      return false;
    }
  });
}

/**
 * Quick check if a directory contains any subdirectories (after applying exclude patterns).
 * Used to optimize and skip LLM analysis for flat archives.
 */
export async function checkForSubdirectories(
  rootPath: string,
  excludePatterns: string[] = []
): Promise<boolean> {
  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });

    for (const entry of entries) {
      if (shouldExclude(entry.name, excludePatterns)) {
        continue;
      }

      if (entry.isDirectory()) {
        return true; // Found at least one subdirectory
      }
    }

    return false; // No subdirectories found
  } catch {
    return false; // If can't read directory, assume no subdirectories
  }
}

/**
 * Build a hierarchical directory tree from a root path.
 * Respects exclude patterns from configuration.
 */
export async function buildDirectoryTree(
  rootPath: string,
  excludePatterns: string[] = [],
  maxDepth: number = 10,
  currentDepth: number = 0,
  relativePath: string = "."
): Promise<DirectoryNode> {
  const stats = await fs.stat(rootPath);
  const name = path.basename(rootPath);

  // Root node
  const node: DirectoryNode = {
    name: relativePath === "." ? "." : name,
    type: stats.isDirectory() ? "directory" : "file",
    path: relativePath,
  };

  if (stats.isFile()) {
    node.extension = path.extname(name).toLowerCase();
    node.size = stats.size;
    return node;
  }

  // Directory - recurse into children if not at max depth
  if (currentDepth >= maxDepth) {
    node.children = [];
    return node;
  }

  try {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    const children: DirectoryNode[] = [];

    for (const entry of entries) {
      // Skip excluded patterns
      if (shouldExclude(entry.name, excludePatterns)) {
        continue;
      }

      const childPath = path.join(rootPath, entry.name);
      const childRelativePath =
        relativePath === "." ? entry.name : path.join(relativePath, entry.name);

      try {
        const childNode = await buildDirectoryTree(
          childPath,
          excludePatterns,
          maxDepth,
          currentDepth + 1,
          childRelativePath
        );
        children.push(childNode);
      } catch {
        // Skip files/directories that can't be accessed
        continue;
      }
    }

    // Sort children: directories first, then files, alphabetically within each group
    children.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "directory" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });

    node.children = children;
  } catch {
    node.children = [];
  }

  return node;
}

/**
 * Convert directory tree to a compact text representation for LLM consumption.
 * Similar to the `tree` command output.
 */
export function formatDirectoryTree(
  node: DirectoryNode,
  maxDepth: number = 5,
  currentDepth: number = 0,
  prefix: string = "",
  isLast: boolean = true
): string {
  const lines: string[] = [];

  if (currentDepth >= maxDepth) {
    return lines.join("\n");
  }

  // Format current node
  const connector = currentDepth === 0 ? "" : isLast ? "└── " : "├── ";
  let displayName = node.name;

  if (node.type === "file") {
    // Show file size in human-readable format
    const sizeStr = node.size !== undefined ? formatFileSize(node.size) : "";
    displayName = sizeStr ? `${node.name} (${sizeStr})` : node.name;
  } else if (node.type === "directory") {
    displayName = `${node.name}/`;
  }

  lines.push(`${prefix}${connector}${displayName}`);

  // Recurse into children
  if (node.children && node.children.length > 0) {
    const childPrefix = currentDepth === 0 ? "" : prefix + (isLast ? "    " : "│   ");

    // Limit number of children shown at each level to avoid huge output
    const maxChildrenToShow = 50;
    const childrenToShow = node.children.slice(0, maxChildrenToShow);
    const hasMore = node.children.length > maxChildrenToShow;

    for (let i = 0; i < childrenToShow.length; i++) {
      const child = childrenToShow[i];
      const childIsLast = i === childrenToShow.length - 1 && !hasMore;

      const childLines = formatDirectoryTree(
        child,
        maxDepth,
        currentDepth + 1,
        childPrefix,
        childIsLast
      );

      if (childLines) {
        lines.push(childLines);
      }
    }

    if (hasMore) {
      const connector = "└── ";
      lines.push(`${childPrefix}${connector}... (${node.children.length - maxChildrenToShow} more items)`);
    }
  }

  return lines.join("\n");
}

/**
 * Format file size in human-readable format.
 */
function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";

  const units = ["B", "KB", "MB", "GB"];
  const k = 1024;
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  if (i >= units.length) {
    return `${(bytes / Math.pow(k, units.length - 1)).toFixed(1)} ${units[units.length - 1]}`;
  }

  return `${(bytes / Math.pow(k, i)).toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

/**
 * Count total nodes of a specific type in the tree.
 */
export function countNodes(node: DirectoryNode, type: "file" | "directory"): number {
  let count = node.type === type ? 1 : 0;

  if (node.children) {
    for (const child of node.children) {
      count += countNodes(child, type);
    }
  }

  return count;
}

/**
 * Count total audio files in the tree.
 */
export function countAudioNodes(node: DirectoryNode): number {
  const audioExtensions = getAudioExtensions();

  let count = 0;

  if (node.type === "file" && node.extension && audioExtensions.has(node.extension)) {
    count = 1;
  }

  if (node.children) {
    for (const child of node.children) {
      count += countAudioNodes(child);
    }
  }

  return count;
}

/**
 * Find all audio files in the tree and return their paths.
 */
export function findAudioFiles(node: DirectoryNode): string[] {
  const audioExtensions = getAudioExtensions();
  const paths: string[] = [];

  if (node.type === "file" && node.extension && audioExtensions.has(node.extension)) {
    paths.push(node.path);
  }

  if (node.children) {
    for (const child of node.children) {
      paths.push(...findAudioFiles(child));
    }
  }

  return paths;
}
