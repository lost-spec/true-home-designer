import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { restoreAutosave, startDesignAutosave } from "./persistence/designIO";
import { useEditorStore } from "./store/editorStore";

// Restore before the first render so the saved design appears immediately,
// then keep the autosave in sync while the user edits.
const restored = restoreAutosave();
if (restored && !restored.ok) {
  console.warn("Autosave could not be restored:", restored.error);
} else if (restored && restored.warnings.length > 0) {
  console.warn("Autosave restored with warnings:", restored.warnings);
} else if (restored && restored.ok) {
  // A saved design was restored — skip the first-run template picker.
  useEditorStore.getState().closeStartScreen();
}
startDesignAutosave();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
