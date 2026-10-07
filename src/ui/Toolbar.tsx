import { useEditorStore, type Tool } from "../store/editorStore";

const TOOLS: { id: Tool; label: string }[] = [
  { id: "select", label: "Select" },
  { id: "drawRoom", label: "Draw room" },
  { id: "drawWall", label: "Draw wall" },
  { id: "placeObject", label: "Place object" },
];

export function Toolbar() {
  const tool = useEditorStore((s) => s.tool);
  const setTool = useEditorStore((s) => s.setTool);
  const ceilingVisible = useEditorStore((s) => s.ceilingVisible);
  const toggleCeiling = useEditorStore((s) => s.toggleCeiling);

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
