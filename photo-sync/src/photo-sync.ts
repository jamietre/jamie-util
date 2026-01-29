import * as fs from "node:fs";
import * as path from "node:path";
import { pipeline } from "node:stream/promises";
import ExifReader from "exifreader";

const SUPPORTED_EXTENSIONS = new Set([
  ".jpg",
  ".jpeg",
  ".png",
  ".heic",
  ".mp4",
  ".mov",
]);

export interface SyncOptions {
  dryRun?: boolean;
  onProgress?: (message: string) => void;
}

export interface SyncResult {
  copied: number;
  skipped: number;
  errors: string[];
}

/**
 * Extract photo date from EXIF metadata, returns null if not found
 */
export async function getExifDate(filePath: string): Promise<Date | null> {
  try {
    const buffer = await fs.promises.readFile(filePath);
    const tags = ExifReader.load(buffer, { expanded: true });

    // Try DateTimeOriginal first (when photo was taken)
    const dateTimeOriginal = tags.exif?.DateTimeOriginal?.description;
    if (dateTimeOriginal) {
      const parsed = parseExifDate(dateTimeOriginal);
      if (parsed) return parsed;
    }

    // Fall back to CreateDate
    const createDate = tags.exif?.CreateDate?.description;
    if (createDate) {
      const parsed = parseExifDate(createDate);
      if (parsed) return parsed;
    }
  } catch {
    // EXIF extraction failed
  }

  return null;
}

/**
 * Parse EXIF date string (format: "YYYY:MM:DD HH:MM:SS")
 */
export function parseExifDate(dateString: string): Date | null {
  // EXIF dates are in format "YYYY:MM:DD HH:MM:SS"
  const match = dateString.match(/^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})$/);
  if (!match) return null;

  const [, year, month, day, hour, minute, second] = match;
  const date = new Date(
    parseInt(year),
    parseInt(month) - 1,
    parseInt(day),
    parseInt(hour),
    parseInt(minute),
    parseInt(second)
  );

  // Validate the date is reasonable
  if (isNaN(date.getTime()) || date.getFullYear() < 1990) {
    return null;
  }

  return date;
}

/**
 * Build target path in YYYY/MM format
 */
export function buildTargetPath(
  sourceFile: string,
  targetDir: string,
  date: Date
): string {
  const year = date.getFullYear().toString();
  const month = (date.getMonth() + 1).toString().padStart(2, "0");
  const filename = path.basename(sourceFile);

  return path.join(targetDir, year, month, filename);
}

/**
 * Recursively find all supported media files in a directory (paths only, no stat)
 */
export async function findMediaFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  await walkDir(dir, (fullPath, entry) => {
    const ext = path.extname(entry.name).toLowerCase();
    if (SUPPORTED_EXTENSIONS.has(ext)) {
      files.push(fullPath);
    }
  });
  return files;
}

/**
 * Recursively find all files in a directory, returning paths relative to the base
 * and a set of just filenames for quick lookup
 */
export async function findAllFiles(dir: string): Promise<{ paths: Set<string>; filenames: Set<string> }> {
  const paths = new Set<string>();
  const filenames = new Set<string>();
  await walkDir(dir, (fullPath, entry) => {
    const relativePath = path.relative(dir, fullPath);
    paths.add(relativePath);
    filenames.add(entry.name.toLowerCase());
  });
  return { paths, filenames };
}

async function walkDir(
  dir: string,
  onFile: (fullPath: string, entry: fs.Dirent) => void | Promise<void>
): Promise<void> {
  let entries: fs.Dirent[];
  try {
    entries = await fs.promises.readdir(dir, { withFileTypes: true });
  } catch {
    return; // Directory doesn't exist or can't be read
  }

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      await walkDir(fullPath, onFile);
    } else if (entry.isFile()) {
      await onFile(fullPath, entry);
    }
  }
}

/**
 * Get the date for a photo: try EXIF first, fall back to mtime
 */
async function getPhotoDate(filePath: string): Promise<Date> {
  const exifDate = await getExifDate(filePath);
  if (exifDate) return exifDate;

  const stats = await fs.promises.stat(filePath);
  return stats.mtime;
}

/**
 * Main sync function
 */
export async function syncPhotos(
  sourceDir: string,
  targetDir: string,
  options: SyncOptions = {}
): Promise<SyncResult> {
  const { dryRun = false, onProgress } = options;
  const result: SyncResult = { copied: 0, skipped: 0, errors: [] };

  // Scan source and target in parallel
  onProgress?.(`Scanning directories...`);
  const [sourceFiles, existing] = await Promise.all([
    findMediaFiles(sourceDir),
    findAllFiles(targetDir),
  ]);
  onProgress?.(`Found ${sourceFiles.length} source files, ${existing.paths.size} existing files`);

  for (const sourcePath of sourceFiles) {
    try {
      const filename = path.basename(sourcePath);

      // Fast check: if filename exists anywhere in target, skip (no EXIF read needed)
      if (existing.filenames.has(filename.toLowerCase())) {
        result.skipped++;
        continue;
      }

      // File is new - read EXIF/mtime to determine target path
      const date = await getPhotoDate(sourcePath);
      const targetPath = buildTargetPath(sourcePath, targetDir, date);
      const relativePath = path.relative(targetDir, targetPath);

      if (dryRun) {
        onProgress?.(`WOULD COPY: ${sourcePath} -> ${targetPath}`);
        result.copied++;
      } else {
        // Create target directory if needed
        const targetDirPath = path.dirname(targetPath);
        await fs.promises.mkdir(targetDirPath, { recursive: true });

        // Copy the file using streams (more compatible with MTP)
        await pipeline(
          fs.createReadStream(sourcePath),
          fs.createWriteStream(targetPath)
        );
        onProgress?.(`COPIED: ${sourcePath} -> ${targetPath}`);
        result.copied++;

        // Add to cache so duplicates in source are handled
        existing.paths.add(relativePath);
        existing.filenames.add(filename.toLowerCase());
      }
    } catch (err) {
      const message = `ERROR: ${sourcePath}: ${err instanceof Error ? err.message : String(err)}`;
      onProgress?.(message);
      result.errors.push(message);
    }
  }

  return result;
}
