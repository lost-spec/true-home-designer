import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./styles.css";
import { restoreAutosave, startDesignAutosave } from "./persistence/designIO";

// Restore before the first render so the saved design appears immediately,
// then keep the autosave in sync while the user edits.
const restored = restoreAutosave();
if (restored && !restored.ok) {
  console.warn("Autosave could not be restored:", restored.error);
} else if (restored && restored.warnings.length > 0) {
  console.warn("Autosave restored with warnings:", restored.warnings);
}
startDesignAutosave();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
