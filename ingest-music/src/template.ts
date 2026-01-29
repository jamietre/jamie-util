/**
 * Simple template rendering: replaces {var} placeholders with values.
 * Unknown placeholders are left as-is.
 */
export function renderTemplate(
  template: string,
  vars: Record<string, string | number>
): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = vars[key];
    if (value === undefined) return match;
    return String(value);
  });
}

/**
 * Pad a number to at least `width` digits with leading zeros.
 */
export function zeroPad(n: number, width: number = 2): string {
  return String(n).padStart(width, "0");
}
