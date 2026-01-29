/**
 * Render a template by replacing {var} placeholders with values.
 *
 * Supports date formatting with {date:FORMAT} syntax where FORMAT uses:
 *   YYYY = 4-digit year
 *   MM   = 2-digit month
 *   DD   = 2-digit day
 *
 * Examples:
 *   {date}           -> "2024-08-16" (raw value)
 *   {date:YYYY-MM-DD} -> "2024-08-16"
 *   {date:YYYY.MM.DD} -> "2024.08.16"
 *   {date:MM/DD/YYYY} -> "08/16/2024"
 *
 * Unknown placeholders are left as-is.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  // Match {var} or {var:format}
  return template.replace(/\{(\w+)(?::([^}]+))?\}/g, (match, key: string, format?: string) => {
    const value = vars[key];
    if (value === undefined) return match;

    // If format is specified and this is a date value, apply date formatting
    if (format && key === "date" && typeof value === "string") {
      return formatDate(value, format);
    }

    return String(value);
  });
}

/**
 * Format a date string (YYYY-MM-DD) using a format pattern.
 * Replaces YYYY, MM, DD tokens with actual values.
 */
export function formatDate(dateStr: string, format: string): string {
  const [year, month, day] = dateStr.split("-");
  if (!year || !month || !day) return dateStr;

  return format
    .replace(/YYYY/g, year)
    .replace(/MM/g, month)
    .replace(/DD/g, day);
}

/**
 * Pad a number to at least `width` digits with leading zeros.
 */
export function zeroPad(n: number, width: number = 2): string {
  return String(n).padStart(width, "0");
}

/**
 * Sanitize a string for use in tags.
 * - Preserves slashes (allowed in tags)
 * - Removes backslashes and backticks
 * - Replaces non-ASCII characters with ASCII equivalents where possible
 * - Preserves normal punctuation (commas, apostrophes, hyphens, etc.)
 */
export function sanitize(str: string): string {
  return str
    // Remove backslashes and backticks (but keep slashes for tags like "AC/DC")
    .replace(/[\\`]/g, "")
    // Normalize unicode to decomposed form, then strip combining marks
    // This converts accented chars like "é" to "e"
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Replace other non-ASCII with empty string
    .replace(/[^\x00-\x7F]/g, "");
}

/**
 * Sanitize a string for use in filenames.
 * - Replaces slashes and backslashes with dashes (not allowed in filenames)
 * - Removes backticks
 * - Replaces non-ASCII characters with ASCII equivalents where possible
 * - Preserves normal punctuation (commas, apostrophes, hyphens, etc.)
 */
export function sanitizeFilename(str: string): string {
  return str
    // Replace slashes and backslashes with dashes (not allowed in filenames)
    .replace(/[/\\]/g, "-")
    // Remove backticks
    .replace(/`/g, "")
    // Normalize unicode to decomposed form, then strip combining marks
    // This converts accented chars like "é" to "e"
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    // Replace other non-ASCII with empty string
    .replace(/[^\x00-\x7F]/g, "");
}
