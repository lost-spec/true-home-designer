import type { House } from "../types/house";

/**
 * Undo/redo history for the house document.
 *
 * Every entry is a plain JSON-serialisable House snapshot, so history can
 * never drift from what the stores actually hold and restore is a single
 * replaceHouse-style write. Three rules keep entries meaningful:
 *
 *  - A change made while a batch is open is coalesced into one entry whose
 *    "before" state is the state at batch start (continuous drags, typing in
 *    a focused field, held key repeats).
 *  - A batch whose final state equals its initial state records nothing.
 *  - Changes made while suppressed (undo/redo applying a snapshot) are never
 *    recorded.
 *
 * The stack is capped at MAX_HISTORY_ENTRIES; the oldest entries are dropped.
 * The module keeps its own plain state (no zustand store) so applying a
 * snapshot cannot recursively feed the history it popped from.
 */

export const MAX_HISTORY_ENTRIES = 100;

export interface HistoryFlags {
  canUndo: boolean;
  canRedo: boolean;
}

let past: House[] = [];
let future: House[] = [];
let batchDepth = 0;
let batchBefore: House | null = null;
let latestHouse: House | null = null;
let suppressDepth = 0;
let cachedFlags: HistoryFlags | null = null;
const listeners = new Set<() => void>();

function emit(): void {
  cachedFlags = null;
  for (const listener of listeners) listener();
}

export function subscribeHistory(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getHistoryFlags(): HistoryFlags {
  if (cachedFlags === null) {
    cachedFlags = { canUndo: past.length > 0, canRedo: future.length > 0 };
  }
  return cachedFlags;
}

export function historySizes(): { past: number; future: number } {
  return { past: past.length, future: future.length };
}

function pushPast(house: House): void {
  past.push(house);
  if (past.length > MAX_HISTORY_ENTRIES) {
    past.splice(0, past.length - MAX_HISTORY_ENTRIES);
  }
}

function pushFuture(house: House): void {
  future.push(house);
  if (future.length > MAX_HISTORY_ENTRIES) {
    future.splice(0, future.length - MAX_HISTORY_ENTRIES);
  }
}

function sameHouse(a: House, b: House): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Record one house change; called by the store's wrapped set(). */
export function recordHouseChange(previous: House, current: House): void {
  if (previous === current) return;
  latestHouse = current;
  if (suppressDepth > 0) return;
  if (batchDepth > 0) {
    if (batchBefore === null) batchBefore = previous;
    return;
  }
  pushPast(previous);
  future = [];
  emit();
}

/** Open a coalescing batch. Batches nest; only the outermost commits. */
export function beginHistoryBatch(): void {
  if (batchDepth === 0) batchBefore = null;
  batchDepth += 1;
}

function commitBatch(): void {
  const before = batchBefore;
  batchBefore = null;
  if (before === null) return;
  const after = latestHouse;
  if (after !== null && sameHouse(before, after)) return;
  pushPast(before);
  future = [];
  emit();
}

/** Close a batch; the outermost end commits one history entry if it changed. */
export function endHistoryBatch(): void {
  if (batchDepth === 0) return;
  batchDepth -= 1;
  if (batchDepth > 0) return;
  commitBatch();
}

/**
 * Safety net for a batch whose end may have been missed (window blur, an
 * input unmounted without firing blur). Commits whatever is open and resets
 * the depth so undo can never be blocked by a leaked batch.
 */
export function forceEndHistoryBatches(): void {
  if (batchDepth === 0 && batchBefore === null) return;
  batchDepth = 0;
  commitBatch();
}

/** Run a mutation without recording it (used when applying history). */
export function suppressHistory<T>(operation: () => T): T {
  suppressDepth += 1;
  try {
    return operation();
  } finally {
    suppressDepth -= 1;
  };
}

/**
 * Pop the previous snapshot, pushing `current` onto the redo stack.
 * Refuses while a batch is open so a snapshot can never be captured
 * mid-drag and the stacks stay balanced with running interactions.
 */
export function takeUndo(current: House): House | null {
  if (batchDepth > 0) return null;
  const previous = past.pop();
  if (previous === undefined) return null;
  pushFuture(current);
  emit();
  return previous;
}

/** Pop the next snapshot, pushing `current` back onto the undo stack. */
export function takeRedo(current: House): House | null {
  if (batchDepth > 0) return null;
  const next = future.pop();
  if (next === undefined) return null;
  pushPast(current);
  emit();
  return next;
}

/** Drop all history and reset any open batch. Used when loading a document. */
export function clearHistory(): void {
  past = [];
  future = [];
  batchDepth = 0;
  batchBefore = null;
  latestHouse = null;
  emit();
}

interface KeyLikeEvent {
  key: string;
  ctrlKey: boolean;
  metaKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
}

/**
 * Map a keyboard event to an undo/redo command: Ctrl/Cmd+Z undoes and
 * Ctrl/Cmd+Shift+Z redoes. Plain typing, Alt combinations and anything else
 * return null so the caller falls through to its usual bindings.
 */
export function undoRedoAction(event: KeyLikeEvent): "undo" | "redo" | null {
  const modifier = event.ctrlKey || event.metaKey;
  if (!modifier || event.altKey) return null;
  if (event.key !== "z" && event.key !== "Z") return null;
  return event.shiftKey ? "redo" : "undo";
}
