import { useEditorStore } from "../store/editorStore";
import { useHouseStore } from "../store/houseStore";
import { ROOM_TEMPLATES, type RoomTemplate } from "../assets/roomTemplates";
import { SINGLE_ROOM_ID } from "../types/house";
import { Icon } from "./Icon";

function TemplateSwatches({ template }: { template: RoomTemplate }) {
  const { wall, floor, ceiling } = template.surfaces;
  return (
    <span className="template-swatches" aria-hidden="true">
      <span style={{ background: wall }} />
      <span style={{ background: floor }} />
      <span style={{ background: ceiling }} />
    </span>
  );
}

export function StartScreen() {
  const closeStartScreen = useEditorStore((s) => s.closeStartScreen);
  const applyRoomTemplate = useHouseStore((s) => s.applyRoomTemplate);

  const start = (templateId: string) => {
    applyRoomTemplate(templateId);
    const roomId =
      Object.keys(useHouseStore.getState().house.rooms)[0] ?? SINGLE_ROOM_ID;
    useEditorStore.getState().select({ kind: "room", id: roomId });
    closeStartScreen();
  };

  const hasDesign = Object.keys(useHouseStore.getState().house.rooms).length > 0;

  return (
    <div className="start-screen" role="dialog" aria-modal="true" aria-label="Choose a room template">
      <div className="start-card">
        <header className="start-head">
          <span className="toolbar-title">
            <Icon name="home" size={16} />
            <span className="toolbar-title-text">True Home Designer</span>
          </span>
          <button
            type="button"
            className="start-close"
            title={hasDesign ? "Keep my current room" : "Close"}
            aria-label="Close"
            onClick={closeStartScreen}
          >
            <Icon name="close" size={15} />
          </button>
        </header>

        <div className="start-intro">
          <h1>Pick a room to design</h1>
          <p>
            Start from a template — it sets the room's size, finish and starter
            furniture. You can change everything afterwards.
          </p>
        </div>

        <div className="template-grid">
          {ROOM_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="template-card"
              title={`Start with the ${template.name}`}
              onClick={() => start(template.id)}
            >
              <TemplateSwatches template={template} />
              <span className="template-name">{template.name}</span>
              <span className="template-size">
                {template.width} × {template.depth} m
              </span>
              <span className="template-desc">{template.description}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
