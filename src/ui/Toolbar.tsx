import { useEditorStore, type Tool } from "../store/editorStore";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "drawRoom", label: "Draw room" },
  { id: "drawWall", label: "Draw wall" },
  { id: "placeObject", label: "Place object" },
];

const SNAP_OPTIONS = [0.05, 0.1, 0.25, 0.5];

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const ceilingVisible = useEditorStore((s) => s.ceilingVisible);
  const toggleCeiling = useEditorStore((s) => s.toggleCeiling);
  const snapSize = useEditorStore((s) => s.snapSize);
  const setSnapSize = useEditorStore((s) => s.setSnapSize);

  return (
    <header className="toolbar">
      <span className="toolbar-title">True Home Designer</span>
      <div className="toolbar-group">
        {TOOLS.map((entry) => (
          <button
            key={entry.id}
            className={tool === entry.id ? "active" : ""}
            disabled={entry.id !== "select"}
            title={
              entry.id === "select"
                ? "Click geometry to select it"
                : "Coming in a later milestone"
            }
            onClick={() => setTool(entry.id)}
          >
            {entry.label}
          </button>
        ))}
      </div>
      <div className="toolbar-group">
        <label className="toolbar-snap">
          Snap
          <select
            value={snapSize}
            onChange={(event) => setSnapSize(Number(event.target.value))}
            title="Grid snapping for wall drags"
          >
            {SNAP_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option} m
              </option>
            ))}
          </select>
        </label>
        <button
          className={ceilingVisible ? "active" : ""}
          onClick={toggleCeiling}
          title="Toggle ceiling visibility"
        >
          {ceilingVisible ? "Hide ceiling" : "Show ceiling"}
        </button>
      </div>
    </header>
  );
}
