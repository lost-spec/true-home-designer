import type {
  AssetMetadata,
  MaterialFinish,
  MaterialOverrides,
  MaterialSlot,
} from "./types";

const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

export function normalizeHex(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!HEX_PATTERN.test(trimmed)) return null;
  return trimmed.toLowerCase();
}

export function isHex(value: unknown): boolean {
  return normalizeHex(value) !== null;
}

export function findSlot(
  asset: AssetMetadata | undefined,
  slotId: string,
): MaterialSlot | undefined {
  return asset?.materialSlots?.find((slot) => slot.id === slotId);
}

export function findFinish(
  slot: MaterialSlot,
  finishId: string | undefined,
): MaterialFinish | undefined {
  if (finishId === undefined) return undefined;
  return slot.finishes?.find((finish) => finish.id === finishId);
}

export interface SlotState {
  color: string;
  chosenColor: string | null;
  customColor: boolean;
  finish?: MaterialFinish;
  isDefault: boolean;
}

export function slotState(
  slot: MaterialSlot,
  overrides: MaterialOverrides | undefined,
): SlotState {
  const customColor = normalizeHex(overrides?.colors?.[slot.id]);
  const finish = findFinish(slot, overrides?.finishes?.[slot.id]);
  const chosenColor = customColor ?? finish?.color ?? null;
  return {
    color: chosenColor ?? slot.originalColor,
    chosenColor,
    customColor: customColor !== null,
    finish,
    isDefault: customColor === null && finish === undefined,
  };
}

function mergeOverrides(
  colors: Record<string, string>,
  finishes: Record<string, string>,
): MaterialOverrides | undefined {
  const next: MaterialOverrides = {};
  if (Object.keys(colors).length > 0) next.colors = colors;
  if (Object.keys(finishes).length > 0) next.finishes = finishes;
  return Object.keys(next).length > 0 ? next : undefined;
}

export function withSlotColor(
  overrides: MaterialOverrides | undefined,
  slotId: string,
  color: string | null,
): MaterialOverrides | undefined {
  const colors = { ...(overrides?.colors ?? {}) };
  const normalized = color === null ? null : normalizeHex(color);
  if (normalized === null) delete colors[slotId];
  else colors[slotId] = normalized;
  return mergeOverrides(colors, { ...(overrides?.finishes ?? {}) });
}

export function withSlotFinish(
  overrides: MaterialOverrides | undefined,
  slotId: string,
  finishId: string | null,
): MaterialOverrides | undefined {
  const finishes = { ...(overrides?.finishes ?? {}) };
  if (finishId === null || finishId === "") delete finishes[slotId];
  else finishes[slotId] = finishId;
  return mergeOverrides({ ...(overrides?.colors ?? {}) }, finishes);
}

function hexToRgb(hex: string): [number, number, number] {
  const value = parseInt(hex.slice(1), 16);
  return [((value >> 16) & 255) / 255, ((value >> 8) & 255) / 255, (value & 255) / 255];
}

function rgbToHex(rgb: readonly number[]): string {
  const part = (value: number) =>
    Math.round(Math.min(1, Math.max(0, value)) * 255)
      .toString(16)
      .padStart(2, "0");
  return `#${part(rgb[0])}${part(rgb[1])}${part(rgb[2])}`;
}

const RATIO_MIN = 0.5;
const RATIO_MAX = 2;

/**
 * A chosen slot colour is applied to every material in the slot while keeping
 * each material's own tone: the target keeps its brightness ratio relative to
 * the slot's original colour, so a darker shadow fabric stays darker.
 */
export function targetColorFor(
  chosenHex: string,
  slotOriginalHex: string,
  targetHex: string,
): string {
  const chosen = hexToRgb(chosenHex);
  const original = hexToRgb(slotOriginalHex);
  const target = hexToRgb(targetHex);
  const out = chosen.map((channel, index) => {
    const denominator = original[index];
    const ratio =
      denominator < 0.01
        ? 1
        : Math.min(RATIO_MAX, Math.max(RATIO_MIN, target[index] / denominator));
    return Math.min(1, Math.max(0, channel * ratio));
  });
  return rgbToHex(out);
}

export function validateMaterialSlots(
  assetId: string,
  slots: readonly MaterialSlot[] | undefined,
): string[] {
  const errors: string[] = [];
  if (slots === undefined) return errors;
  if (slots.length === 0) {
    errors.push(`asset ${assetId}: materialSlots must be a non-empty array`);
    return errors;
  }

  const slotIds = new Set<string>();
  const materialNames = new Set<string>();

  for (const slot of slots) {
    const label = `asset ${assetId} slot ${JSON.stringify(slot?.id)}`;
    if (!slot || typeof slot.id !== "string" || slot.id.length === 0) {
      errors.push(`asset ${assetId}: every material slot needs a non-empty id`);
      continue;
    }
    if (slotIds.has(slot.id)) errors.push(`${label}: duplicate slot id`);
    slotIds.add(slot.id);
    if (typeof slot.label !== "string" || slot.label.length === 0) {
      errors.push(`${label}: needs a non-empty label`);
    }
    if (!isHex(slot.originalColor)) {
      errors.push(`${label}: originalColor must be a #rrggbb colour`);
    }
    if (slot.targets.length === 0) {
      errors.push(`${label}: needs at least one target material`);
      continue;
    }
    for (const target of slot.targets) {
      if (!target || typeof target.name !== "string" || target.name.length === 0) {
        errors.push(`${label}: every target needs a non-empty material name`);
        continue;
      }
      if (materialNames.has(target.name)) {
        errors.push(`${label}: material ${target.name} is already used by another slot`);
      }
      materialNames.add(target.name);
      if (target.color !== undefined && !isHex(target.color)) {
        errors.push(`${label}: target ${target.name} color must be a #rrggbb colour`);
      }
    }
    if (slot.palette !== undefined) {
      if (slot.palette.length === 0 || slot.palette.some((hex) => !isHex(hex))) {
        errors.push(`${label}: palette entries must be #rrggbb colours`);
      }
    }
    if (slot.finishes !== undefined) {
      if (slot.finishes.length === 0) {
        errors.push(`${label}: finishes must be a non-empty array when present`);
        continue;
      }
      const finishIds = new Set<string>();
      for (const finish of slot.finishes) {
        if (!finish || typeof finish.id !== "string" || finish.id.length === 0) {
          errors.push(`${label}: every finish needs a non-empty id`);
          continue;
        }
        if (finishIds.has(finish.id)) errors.push(`${label}: duplicate finish id ${finish.id}`);
        finishIds.add(finish.id);
        if (typeof finish.label !== "string" || finish.label.length === 0) {
          errors.push(`${label}: finish ${finish.id} needs a label`);
        }
        if (finish.color !== undefined && !isHex(finish.color)) {
          errors.push(`${label}: finish ${finish.id} color must be a #rrggbb colour`);
        }
        for (const key of ["roughness", "metalness"] as const) {
          const value = finish[key];
          if (value !== undefined && (typeof value !== "number" || value < 0 || value > 1)) {
            errors.push(`${label}: finish ${finish.id} ${key} must be between 0 and 1`);
          }
        }
      }
    }
  }

  return errors;
}
