/**
 * Editor-facing save/load/new/autosave actions.
 *
 * Everything that touches the stores lives here so the toolbar stays presentational
 * and the flows are testable headlessly:
 *
 *  - saveDesignFile: download the current document as pretty JSON and refresh
 *    the autosave entry.
 *  - loadDesignFile / loadDesignText: parse + validate, apply only on success.
 *  - newDesign: reset to the sample house with default settings.
 *  - restoreAutosave: called once at startup before the first render.
 * - startDesignAutosave: debounced writes while the user edits, flushed on
 *    page unload.
 *
 * Loading and resetting replace the house under history suppression and then
 * clear history — undo never crosses a document boundary.
 */
import {
  createDesignDocument,
  designFileName,
  parseDesignJson,
  serializeDesign,
  DEFAULT_DESIGN_SETTINGS,
  type DesignDocument,
  type DesignSettings,
  type DesignValidation,
} from "./houseData";
import {
  readAutosave,
  writeAutosave,
  type KeyValueStorage,
} from "./designStorage";
import { createSampleHouse, useHouseStore } from "../store/houseStore";
import { useEditorStore } from "../store/editorStore";
import { clearHistory, suppressHistory } from "../store/history";

function currentSettings(): DesignSettings {
  const editor = useEditorStore.getState();
  return {
    ceilingVisible: editor.ceilingVisible,
    viewMode: editor.viewMode,
    snapSize: editor.snapSize,
  };
}

/** The serialisable document for whatever is on screen right now. */
export function currentDesignDocument(date: Date = new Date()): DesignDocument {
  return createDesignDocument(
    useHouseStore.getState().house,
    currentSettings(),
    date,
  );
}

/**
 * Replace the editor's document with a validated one. Editor state that
 * references the old document (selection, placement, dragging) is reset; view
 * settings come from the document itself.
 */
export function applyDesignDocument(document: DesignDocument): void {
  const editor = useEditorStore.getState();
  suppressHistory(() => {
    useHouseStore.getState().replaceHouse(document.house);
  });
  clearHistory();
  editor.setTool("select");
  editor.select(null);
  editor.setDraggingWallId(null);
  editor.setDraggingObjectId(null);
  editor.setDraggingOpeningId(null);
  editor.setViewMode(document.settings.viewMode);
  editor.setCeilingVisible(document.settings.ceilingVisible);
  editor.setSnapSize(document.settings.snapSize);
}

/** Reset to the sample house and default settings. */
export function newDesign(): void {
  applyDesignDocument(
    createDesignDocument(createSampleHouse(), DEFAULT_DESIGN_SETTINGS),
  );
}

/** Validate design text and apply it when it is usable. */
export function loadDesignText(text: string): DesignValidation {
  const result = parseDesignJson(text);
  if (result.ok) applyDesignDocument(result.document);
  return result;
}

export async function loadDesignFile(file: File): Promise<DesignValidation> {
  let text: string;
  try {
    text = await file.text();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, error: `file could not be read (${message})` };
  }
  return loadDesignText(text);
}

function downloadTextFile(filename: string, text: string): void {
  if (typeof document === "undefined" || typeof URL.createObjectURL !== "function") {
    return;
  }
  const blob = new Blob([text], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

/**
 * Download the current design as a JSON file and refresh the autosave entry.
 * Returns the payload so callers and tests can inspect exactly what was saved.
 */
export function saveDesignFile(date: Date = new Date()): {
  filename: string;
  text: string;
} {
  const document = currentDesignDocument(date);
  const text = serializeDesign(document);
  downloadTextFile(designFileName(date), text);
  writeAutosave(document);
  return { filename: designFileName(date), text };
}

/**
 * Restore the autosave entry at startup.
 *  - null           → nothing stored; start fresh
 *  - ok:true        → document applied, warnings reported to the caller
 *  - ok:false       → entry is unusable; current state left untouched
 */
export function restoreAutosave(
  storage?: KeyValueStorage,
): DesignValidation | null {
  const result = readAutosave(storage);
  if (result === null) return null;
  if (result.ok) applyDesignDocument(result.document);
  return result;
}

export interface AutosaveOptions {
  storage?: KeyValueStorage;
  /** Delay after the last edit before the autosave entry is written. */
  debounceMs?: number;
}

/**
 * Subscribe to document changes and write a debounced autosave entry.
 * Returns a stop function that also flushes a pending write.
 */
export function startDesignAutosave(options: AutosaveOptions = {}): () => void {
  const debounceMs = options.debounceMs ?? 800;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const writeNow = () => {
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    writeAutosave(currentDesignDocument(), options.storage);
  };
  const schedule = () => {
    if (timer !== null) clearTimeout(timer);
    timer = setTimeout(writeNow, debounceMs);
  };

  const unsubscribeHouse = useHouseStore.subscribe((state, previous) => {
    if (state.house !== previous.house) schedule();
  });
  const unsubscribeEditor = useEditorStore.subscribe((state, previous) => {
    if (
      state.ceilingVisible !== previous.ceilingVisible ||
      state.viewMode !== previous.viewMode ||
      state.snapSize !== previous.snapSize
    ) {
      schedule();
    }
  });

  let removeUnload: (() => void) | null = null;
  if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", writeNow);
    removeUnload = () => window.removeEventListener("beforeunload", writeNow);
  }

  return () => {
    unsubscribeHouse();
    unsubscribeEditor();
    removeUnload?.();
    if (timer !== null) writeNow();
  };
}
