const ACCENT = "#5b9cff";

/** Accent used by every selection state so UI and scene stay in sync. */
export const SELECTION_ACCENT = ACCENT;

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [(value >> 16) & 255, (value >> 8) & 255, value & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  const part = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${part(r)}${part(g)}${part(b)}`;
}

/**
 * Blend `base` toward `tint` by `t` (0 = base, 1 = tint). Selected geometry
 * keeps its material identity while reading clearly as the active element —
 * a solid accent fill over an entire floor or wall is too loud.
 */
export function mixHex(base: string, tint: string, t: number): string {
  const a = hexToRgb(base);
  const b = hexToRgb(tint);
  const clamped = Math.min(1, Math.max(0, t));
  return rgbToHex([
    a[0] + (b[0] - a[0]) * clamped,
    a[1] + (b[1] - a[1]) * clamped,
    a[2] + (b[2] - a[2]) * clamped,
  ]);
}

/** Blend a scene colour toward the selection accent. */
export function towardSelection(base: string, t: number): string {
  return mixHex(base, ACCENT, t);
}
