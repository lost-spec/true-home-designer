import { useRef, type ChangeEvent } from "react";
import {
  loadDesignFile,
  newDesign,
  saveDesignFile,
} from "../persistence/designIO";
import { Icon } from "./Icon";

/**
 * New / Save / Load controls for the design document.
 *
 * Save downloads the validated JSON file and refreshes the autosave entry;
 * Load validates before touching the editor (a rejected file leaves the
 * current design untouched and reports why); New asks for confirmation
 * because it replaces the document.
 */
export function DesignControls() {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleNew = () => {
    const confirmed = window.confirm(
      "Start a new design?\n\nThe current design will be replaced with the default starting house.",
    );
    if (confirmed) newDesign();
  };

  const handleSave = () => {
    saveDesignFile();
  };

  const handleLoad = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so picking the same file again still fires a change event.
    event.target.value = "";
    if (!file) return;
    const result = await loadDesignFile(file);
    if (!result.ok) {
      window.alert(`Could not load the design.\n\n${result.error}`);
      return;
    }
    if (result.warnings.length > 0) {
      console.warn("Design loaded with warnings:", result.warnings);
    }
  };

  return (
    <div className="toolbar-group">
      <button onClick={handleNew} title="Start a fresh design (default house)">
        <Icon name="file" size={13} />
        New
      </button>
      <button
        onClick={handleSave}
        title="Download the design as a JSON file and update the autosave"
      >
        <Icon name="save" size={13} />
        Save
      </button>
      <button
        onClick={() => fileInputRef.current?.click()}
        title="Load a design from a JSON file (validated before applying)"
      >
        <Icon name="load" size={13} />
        Load
      </button>
      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        style={{ display: "none" }}
        onChange={handleLoad}
      />
    </div>
  );
}
