/**
 * Versioned on-disk format for house designs.
 *
 * A design file is a small JSON container (format tag + schemaVersion +
 * savedAt) wrapping the House document and the presentation settings that
 * belong to it. Furniture is referenced by `assetId` only — model files are
 * never embedded.
 *
 * Loading is a two-stage pipeline:
 *
 *  1. Structural validation — wrong types, missing maps or a broken container
 *     reject the file with a precise error so a corrupted design can never
 *     replace the user's current work.
 *  2. Repair — out-of-range numbers are clamped, dangling wall/opening
 *     references are rebuilt by reconcile(), and unknown assetIds are kept
 *     (the viewport shows a placeholder). Repairs are reported as warnings.
 *
 * Older files without the container ("bare house" documents) are migrated to
 * the current schema; files written by a newer schema are rejected with a
 * clear message instead of being loaded half-understood. Future schema bumps
 * add steps to the migration switch below.
 */
import type {
  House,
  Opening,
  PlacedObject,
  Room,
  RoomEdge,
  Wall,
} from "../types/house";
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
} from "../types/house";
import {
  MAX_ROOM_SIZE,
  MIN_ROOM_SIZE,
  ROOM_EDGES,
  reconcile,
} from "../geometry/roomGeometry";
import { assetRegistry } from "../assets/registry";
import { SNAP_OPTIONS } from "../store/editorStore";
import {
  MAX_OBJECT_ELEVATION,
  MAX_OBJECT_SCALE,
  MIN_OBJECT_ELEVATION,
  MIN_OBJECT_SCALE,
  normalizeAngle,
} from "../interaction/objectInteraction";

export const DESIGN_FORMAT = "true-home-designer/design";
export const DESIGN_SCHEMA_VERSION = 1;
export const HOUSE_SCHEMA_VERSION = 1;

export interface DesignSettings {
  ceilingVisible: boolean;
  viewMode: "2d" | "3d";
  snapSize: number;
}

export interface DesignDocument {
  format: typeof DESIGN_FORMAT;
  schemaVersion: number;
  savedAt: string;
  house: House;
  settings: DesignSettings;
}

export const DEFAULT_DESIGN_SETTINGS: DesignSettings = {
  ceilingVisible: true,
  viewMode: "3d",
  snapSize: 0.1,
};

export type DesignValidation =
  | { ok: true; document: DesignDocument; warnings: string[] }
  | { ok: false; error: string };

interface Issues {
  errors: string[];
  warnings: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function describe(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return "an array";
  return typeof value;
}

function requireRecord(
  value: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issues,
): Record<string, unknown> | null {
  const entry = value[key];
  if (!isRecord(entry)) {
    issues.errors.push(
      `${path}.${key} must be an object (got ${describe(entry)})`,
    );
    return null;
  }
  return entry;
}

function requireNumber(
  entry: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issues,
): number | null {
  const value = entry[key];
  if (!isFiniteNumber(value)) {
    issues.errors.push(
      `${path}.${key} must be a finite number (got ${describe(value)})`,
    );
    return null;
  }
  return value;
}

function readVec2(
  entry: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issues,
): { x: number; z: number } | null {
  const vector = requireRecord(entry, key, path, issues);
  if (!vector) return null;
  const x = requireNumber(vector, "x", `${path}.${key}`, issues);
  const z = requireNumber(vector, "z", `${path}.${key}`, issues);
  if (x === null || z === null) return null;
  return { x, z };
}

function readVec3(
  entry: Record<string, unknown>,
  key: string,
  path: string,
  issues: Issues,
): { x: number; y: number; z: number } | null {
  const vector = requireRecord(entry, key, path, issues);
  if (!vector) return null;
  const x = requireNumber(vector, "x", `${path}.${key}`, issues);
  const y = requireNumber(vector, "y", `${path}.${key}`, issues);
  const z = requireNumber(vector, "z", `${path}.${key}`, issues);
  if (x === null || y === null || z === null) return null;
  return { x, y, z };
}

function defaulted<T>(
  current: T,
  fallback: T,
  label: string,
  issues: Issues,
): T {
  if (current === fallback) return current;
  issues.warnings.push(`${label} was invalid; using ${JSON.stringify(fallback)}`);
  return fallback;
}

function sanitizedId(
  entry: Record<string, unknown>,
  key: string,
  label: string,
  issues: Issues,
): string {
  if (entry.id !== undefined && entry.id !== key) {
    issues.warnings.push(
      `${label}.id (${JSON.stringify(entry.id)}) did not match its key; using the key`,
    );
  }
  return key;
}

function sanitizeRoom(
  key: string,
  raw: unknown,
  issues: Issues,
): Room | null {
  const path = `house.rooms[${JSON.stringify(key)}]`;
  if (!isRecord(raw)) {
    issues.errors.push(`${path} must be an object (got ${describe(raw)})`);
    return null;
  }
  const position = readVec2(raw, "position", path, issues);
  const width = requireNumber(raw, "width", path, issues);
  const depth = requireNumber(raw, "depth", path, issues);
  const height = requireNumber(raw, "height", path, issues);
  const wallThickness = requireNumber(raw, "wallThickness", path, issues);
  if (
    !position ||
    width === null ||
    depth === null ||
    height === null ||
    wallThickness === null
  ) {
    return null;
  }

  let name = "Room";
  if (raw.name === undefined) {
    issues.warnings.push(`${path}.name was missing; using "Room"`);
  } else if (typeof raw.name === "string" && raw.name.length > 0) {
    name = raw.name;
  } else {
    issues.warnings.push(
      `${path}.name must be a non-empty string; using "Room"`,
    );
  }

  const edges: Partial<Record<RoomEdge, string>> = {};
  if (isRecord(raw.edges)) {
    for (const edge of ROOM_EDGES) {
      const wallId = raw.edges[edge];
      if (typeof wallId === "string" && wallId.length > 0) {
        edges[edge] = wallId;
      } else {
        issues.warnings.push(
          `${path}.edges.${edge} was invalid; the wall reference was rebuilt`,
        );
      }
    }
  } else {
    issues.warnings.push(`${path}.edges was missing; wall references were rebuilt`);
  }

  let safeWidth = width;
  if (width < MIN_ROOM_SIZE || width > MAX_ROOM_SIZE) {
    safeWidth = clamp(width, MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    issues.warnings.push(
      `${path}.width ${width} was out of range; clamped to ${safeWidth}`,
    );
  }
  let safeDepth = depth;
  if (depth < MIN_ROOM_SIZE || depth > MAX_ROOM_SIZE) {
    safeDepth = clamp(depth, MIN_ROOM_SIZE, MAX_ROOM_SIZE);
    issues.warnings.push(
      `${path}.depth ${depth} was out of range; clamped to ${safeDepth}`,
    );
  }
  const safeHeight =
    height > 0 ? height : defaulted(height, DEFAULT_WALL_HEIGHT, `${path}.height`, issues);
  const safeThickness =
    wallThickness > 0
      ? wallThickness
      : defaulted(
          wallThickness,
          DEFAULT_WALL_THICKNESS,
          `${path}.wallThickness`,
          issues,
        );

  return {
    id: sanitizedId(raw, key, path, issues),
    name,
    position,
    width: safeWidth,
    depth: safeDepth,
    height: safeHeight,
    wallThickness: safeThickness,
    edges: edges as Record<RoomEdge, string>,
  };
}

function sanitizeWall(
  key: string,
  raw: unknown,
  issues: Issues,
): Wall | null {
  const path = `house.walls[${JSON.stringify(key)}]`;
  if (!isRecord(raw)) {
    issues.errors.push(`${path} must be an object (got ${describe(raw)})`);
    return null;
  }
  const start = readVec2(raw, "start", path, issues);
  const end = readVec2(raw, "end", path, issues);
  const height = requireNumber(raw, "height", path, issues);
  const thickness = requireNumber(raw, "thickness", path, issues);
  if (!start || !end || height === null || thickness === null) return null;

  const safeHeight =
    height > 0 ? height : defaulted(height, DEFAULT_WALL_HEIGHT, `${path}.height`, issues);
  const safeThickness =
    thickness > 0
      ? thickness
      : defaulted(
          thickness,
          DEFAULT_WALL_THICKNESS,
          `${path}.thickness`,
          issues,
        );

  return {
    id: sanitizedId(raw, key, path, issues),
    start,
    end,
    height: safeHeight,
    thickness: safeThickness,
  };
}

function sanitizeOpening(
  key: string,
  raw: unknown,
  issues: Issues,
): Opening | null {
  const path = `house.openings[${JSON.stringify(key)}]`;
  if (!isRecord(raw)) {
    issues.errors.push(`${path} must be an object (got ${describe(raw)})`);
    return null;
  }
  const wallId = raw.wallId;
  if (typeof wallId !== "string" || wallId.length === 0) {
    issues.errors.push(`${path}.wallId must be a non-empty string`);
    return null;
  }
  const offset = requireNumber(raw, "offset", path, issues);
  const width = requireNumber(raw, "width", path, issues);
  const height = requireNumber(raw, "height", path, issues);
  const sillHeight = requireNumber(raw, "sillHeight", path, issues);
  if (
    offset === null ||
    width === null ||
    height === null ||
    sillHeight === null
  ) {
    return null;
  }

  let kind: Opening["kind"] = "door";
  if (raw.kind === "door" || raw.kind === "window") {
    kind = raw.kind;
  } else {
    issues.warnings.push(
      `${path}.kind must be "door" or "window"; using "door"`,
    );
  }

  const safeWidth = width > 0 ? width : defaulted(width, 0.9, `${path}.width`, issues);
  const safeHeight = height > 0 ? height : defaulted(height, 2.1, `${path}.height`, issues);
  const safeSill =
    sillHeight >= 0
      ? sillHeight
      : defaulted(sillHeight, 0, `${path}.sillHeight`, issues);

  return {
    id: sanitizedId(raw, key, path, issues),
    wallId,
    kind,
    offset,
    width: safeWidth,
    height: safeHeight,
    sillHeight: safeSill,
  };
}

function sanitizePlacedObject(
  key: string,
  raw: unknown,
  issues: Issues,
): PlacedObject | null {
  const path = `house.objects[${JSON.stringify(key)}]`;
  if (!isRecord(raw)) {
    issues.errors.push(`${path} must be an object (got ${describe(raw)})`);
    return null;
  }
  const assetId = raw.assetId;
  if (typeof assetId !== "string") {
    issues.errors.push(`${path}.assetId must be a string`);
    return null;
  }
  if (assetId.length === 0) {
    issues.warnings.push(`${path}.assetId was empty`);
  } else if (!assetRegistry.has(assetId)) {
    issues.warnings.push(
      `${path} references unknown asset "${assetId}"; kept and shown as a placeholder`,
    );
  }
  const position = readVec3(raw, "position", path, issues);
  const rotationY = requireNumber(raw, "rotationY", path, issues);
  const scale = requireNumber(raw, "scale", path, issues);
  if (!position || rotationY === null || scale === null) return null;

  let safeY = position.y;
  if (safeY < MIN_OBJECT_ELEVATION || safeY > MAX_OBJECT_ELEVATION) {
    safeY = clamp(safeY, MIN_OBJECT_ELEVATION, MAX_OBJECT_ELEVATION);
    issues.warnings.push(
      `${path}.position.y ${position.y} was out of range; clamped to ${safeY}`,
    );
  }
  let safeScale = scale;
  if (scale < MIN_OBJECT_SCALE || scale > MAX_OBJECT_SCALE) {
    safeScale = clamp(scale, MIN_OBJECT_SCALE, MAX_OBJECT_SCALE);
    issues.warnings.push(
      `${path}.scale ${scale} was out of range; clamped to ${safeScale}`,
    );
  }
  const safeRotation =
    rotationY < 0 || rotationY >= Math.PI * 2
      ? normalizeAngle(rotationY)
      : rotationY;

  return {
    id: sanitizedId(raw, key, path, issues),
    assetId,
    position: { x: position.x, y: safeY, z: position.z },
    rotationY: safeRotation,
    scale: safeScale,
  };
}

function collectEntities<T>(
  record: Record<string, unknown>,
  issues: Issues,
  sanitize: (key: string, raw: unknown, issues: Issues) => T | null,
): Record<string, T> | null {
  const out: Record<string, T> = {};
  for (const [key, raw] of Object.entries(record)) {
    const entity = sanitize(key, raw, issues);
    if (entity === null) return null;
    out[key] = entity;
  }
  return out;
}

function sanitizeHouse(raw: unknown, issues: Issues): House | null {
  if (!isRecord(raw)) {
    issues.errors.push(`house must be an object (got ${describe(raw)})`);
    return null;
  }

  if (raw.version === undefined) {
    issues.warnings.push(`house.version was missing; assuming ${HOUSE_SCHEMA_VERSION}`);
  } else if (!isFiniteNumber(raw.version)) {
    issues.errors.push("house.version must be a number");
    return null;
  } else if (raw.version > HOUSE_SCHEMA_VERSION) {
    issues.errors.push(
      `house schema ${raw.version} is newer than the supported ${HOUSE_SCHEMA_VERSION}`,
    );
    return null;
  } else if (raw.version < HOUSE_SCHEMA_VERSION) {
    issues.errors.push(`house schema ${raw.version} is not supported`);
    return null;
  }

  const roomsRaw = requireRecord(raw, "rooms", "house", issues);
  const wallsRaw = requireRecord(raw, "walls", "house", issues);
  const openingsRaw = requireRecord(raw, "openings", "house", issues);
  const objectsRaw = requireRecord(raw, "objects", "house", issues);
  if (!roomsRaw || !wallsRaw || !openingsRaw || !objectsRaw) return null;

  const rooms = collectEntities(roomsRaw, issues, sanitizeRoom);
  const walls = collectEntities(wallsRaw, issues, sanitizeWall);
  const openings = collectEntities(openingsRaw, issues, sanitizeOpening);
  const objects = collectEntities(objectsRaw, issues, sanitizePlacedObject);
  if (!rooms || !walls || !openings || !objects) return null;

  const candidate: House = {
    version: HOUSE_SCHEMA_VERSION,
    rooms,
    walls,
    openings,
    objects,
  };

  const before = JSON.stringify(candidate);
  const repaired = reconcile(candidate);
  if (JSON.stringify(repaired) !== before) {
    issues.warnings.push(
      "wall, room or opening references were inconsistent and have been rebuilt",
    );
  }
  return repaired;
}

function sanitizeSettings(raw: unknown, issues: Issues): DesignSettings {
  const settings: DesignSettings = { ...DEFAULT_DESIGN_SETTINGS };
  if (raw === undefined) {
    issues.warnings.push("settings were missing; using defaults");
    return settings;
  }
  if (!isRecord(raw)) {
    issues.warnings.push(
      `settings must be an object (got ${describe(raw)}); using defaults`,
    );
    return settings;
  }
  if (raw.ceilingVisible !== undefined) {
    if (typeof raw.ceilingVisible === "boolean") {
      settings.ceilingVisible = raw.ceilingVisible;
    } else {
      issues.warnings.push("settings.ceilingVisible must be a boolean; using default");
    }
  }
  if (raw.viewMode !== undefined) {
    if (raw.viewMode === "2d" || raw.viewMode === "3d") {
      settings.viewMode = raw.viewMode;
    } else {
      issues.warnings.push('settings.viewMode must be "2d" or "3d"; using default');
    }
  }
  if (raw.snapSize !== undefined) {
    if (
      isFiniteNumber(raw.snapSize) &&
      (SNAP_OPTIONS as readonly number[]).includes(raw.snapSize)
    ) {
      settings.snapSize = raw.snapSize;
    } else {
      issues.warnings.push(
        `settings.snapSize must be one of ${SNAP_OPTIONS.join(", ")}; using default`,
      );
    }
  }
  return settings;
}

function looksLikeHouse(value: Record<string, unknown>): boolean {
  return (
    isRecord(value.rooms) &&
    isRecord(value.walls) &&
    isRecord(value.openings) &&
    isRecord(value.objects)
  );
}

function failure(error: string): DesignValidation {
  return { ok: false, error };
}

/** Validate an already-parsed design value (container or legacy bare house). */
export function validateDesign(value: unknown): DesignValidation {
  if (!isRecord(value)) {
    return failure(`design must be an object (got ${describe(value)})`);
  }

  const issues: Issues = { errors: [], warnings: [] };
  let raw = value;

  if (raw.format === undefined) {
    if (!looksLikeHouse(raw)) {
      return failure(
        "not a True Home Designer file: missing the format tag and house data",
      );
    }
    issues.warnings.push(
      "unversioned legacy design; upgraded to schema 1 with default settings",
    );
    raw = {
      format: DESIGN_FORMAT,
      schemaVersion: DESIGN_SCHEMA_VERSION,
      house: value,
    };
  }

  if (raw.format !== DESIGN_FORMAT) {
    return failure(
      `unrecognised format ${JSON.stringify(raw.format)}; expected ${JSON.stringify(DESIGN_FORMAT)}`,
    );
  }

  const version = raw.schemaVersion;
  if (!isFiniteNumber(version) || !Number.isInteger(version) || version < 1) {
    return failure(
      `schemaVersion must be a positive integer (got ${JSON.stringify(version)})`,
    );
  }
  if (version > DESIGN_SCHEMA_VERSION) {
    return failure(
      `design was saved by a newer version of True Home Designer (schema ${version}, this build supports ${DESIGN_SCHEMA_VERSION})`,
    );
  }
  if (version < DESIGN_SCHEMA_VERSION) {
    // Migrations for older schema versions are added here as the format
    // evolves; version 1 is the first containerised schema and bare houses
    // (handled above) are its only predecessor.
    return failure(`unsupported older schema version ${version}`);
  }

  const house = sanitizeHouse(raw.house, issues);
  if (!house) {
    return failure(issues.errors.slice(0, 3).join("; "));
  }

  const settings = sanitizeSettings(raw.settings, issues);
  const savedAt = raw.savedAt === undefined ? "" : raw.savedAt;
  if (savedAt !== "" && typeof savedAt !== "string") {
    issues.warnings.push("savedAt must be an ISO timestamp string; ignored");
  }

  return {
    ok: true,
    document: {
      format: DESIGN_FORMAT,
      schemaVersion: DESIGN_SCHEMA_VERSION,
      savedAt: typeof savedAt === "string" ? savedAt : "",
      house,
      settings,
    },
    warnings: issues.warnings,
  };
}

/** Parse design text (a downloaded file or an autosave entry). */
export function parseDesignJson(text: string): DesignValidation {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return failure(`file is not valid JSON (${message})`);
  }
  return validateDesign(parsed);
}

/** Build the serialisable container for the current document state. */
export function createDesignDocument(
  house: House,
  settings: DesignSettings,
  savedAt: Date = new Date(),
): DesignDocument {
  return {
    format: DESIGN_FORMAT,
    schemaVersion: DESIGN_SCHEMA_VERSION,
    savedAt: savedAt.toISOString(),
    house,
    settings: { ...settings },
  };
}

/** Pretty-print a design document as download-ready JSON text. */
export function serializeDesign(document: DesignDocument): string {
  return JSON.stringify(document, null, 2);
}

/** Suggested download name, e.g. home-design-2026-10-08-1435.json. */
export function designFileName(date: Date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    "home-design",
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}`,
  ].join("-") + ".json";
}
