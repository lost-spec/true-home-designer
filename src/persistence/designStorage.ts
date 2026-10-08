/**
 * Browser-storage layer for design autosaves.
 *
 * Every function takes an injectable storage (anything with the localStorage
 * getItem/setItem/removeItem shape) so the same code runs against the real
 * localStorage in the app and against a plain object in tests. All storage
 * access is guarded: privacy modes that throw on `localStorage`, quota
 * overflows and corrupted JSON degrade to a reported failure instead of an
 * exception that could break the editor.
 */
import {
  parseDesignJson,
  serializeDesign,
  type DesignDocument,
  type DesignValidation,
} from "./houseData";

export const AUTOSAVE_KEY = "true-home-designer:autosave";

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): KeyValueStorage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    // Accessing localStorage itself can throw in some privacy modes.
    return null;
  }
}

/** Write the autosave entry; returns false when storage is unavailable or full. */
export function writeAutosave(
  document: DesignDocument,
  storage: KeyValueStorage | null = browserStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(AUTOSAVE_KEY, serializeDesign(document));
    return true;
  } catch {
    return false;
  }
}

/**
 * Read the autosave entry.
 *  - null            → nothing saved (or storage unavailable)
 *  - ok:false result  → an entry exists but is corrupted or unsupported
 *  - ok:true result   → a validated document ready to apply
 */
export function readAutosave(
  storage: KeyValueStorage | null = browserStorage(),
): DesignValidation | null {
  if (!storage) return null;
  let text: string | null;
  try {
    text = storage.getItem(AUTOSAVE_KEY);
  } catch {
    return null;
  }
  if (text === null) return null;
  return parseDesignJson(text);
}

export function clearAutosave(
  storage: KeyValueStorage | null = browserStorage(),
): void {
  if (!storage) return;
  try {
    storage.removeItem(AUTOSAVE_KEY);
  } catch {
    // Nothing to recover from: the entry simply stays until it is overwritten.
  }
}
