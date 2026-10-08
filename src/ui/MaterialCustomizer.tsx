import { useHouseStore } from "../store/houseStore";
import { beginHistoryBatch, endHistoryBatch } from "../store/history";
import { assetRegistry } from "../assets/registry";
import { slotState } from "../assets/materialSlots";
import type { MaterialOverrides, MaterialSlot } from "../assets/types";

function SlotRow({
  objectId,
  slot,
  overrides,
}: {
  objectId: string;
  slot: MaterialSlot;
  overrides: MaterialOverrides | undefined;
}) {
  const state = slotState(slot, overrides);
  const update = (patch: {
    color?: string | null;
    finish?: string | null;
  }) => useHouseStore.getState().setMaterialOverride(objectId, slot.id, patch);

  return (
    <div className="material-slot" data-slot={slot.id}>
      <div className="material-slot-head">
        <span className="material-slot-label">{slot.label}</span>
        <label
          className="material-swatch"
          title={`Pick a ${slot.label.toLowerCase()} colour`}
        >
          <span className="swatch-chip" style={{ backgroundColor: state.color }} />
          <input
            type="color"
            value={state.color}
            aria-label={`${slot.label} colour`}
            onFocus={() => beginHistoryBatch()}
            onBlur={() => endHistoryBatch()}
            onChange={(event) => update({ color: event.target.value })}
          />
        </label>
        <button
          type="button"
          className="material-reset"
          disabled={state.isDefault}
          title="Reset this material to the model's original"
          onClick={() => update({ color: null, finish: null })}
        >
          Reset
        </button>
      </div>

      {slot.palette && (
        <div className="material-chips">
          {slot.palette.map((hex) => (
            <button
              key={hex}
              type="button"
              className={
                state.color.toLowerCase() === hex.toLowerCase()
                  ? "palette-chip active"
                  : "palette-chip"
              }
              style={{ backgroundColor: hex }}
              title={hex}
              aria-label={`Set ${slot.label} colour to ${hex}`}
              onClick={() => update({ color: hex })}
            />
          ))}
        </div>
      )}

      {slot.finishes && (
        <label className="material-finish">
          <span>Finish</span>
          <select
            value={state.finish?.id ?? ""}
            aria-label={`${slot.label} finish`}
            onChange={(event) =>
              update({
                finish: event.target.value === "" ? null : event.target.value,
              })
            }
          >
            <option value="">Original finish</option>
            {slot.finishes.map((finish) => (
              <option key={finish.id} value={finish.id}>
                {finish.label}
              </option>
            ))}
          </select>
        </label>
      )}
    </div>
  );
}

export function MaterialCustomizer({
  objectId,
  assetId,
}: {
  objectId: string;
  assetId: string;
}) {
  const slots = assetRegistry.get(assetId)?.materialSlots;
  const overrides = useHouseStore(
    (s) => s.house.objects[objectId]?.materialOverrides,
  );

  if (!slots || slots.length === 0) return null;

  return (
    <section className="material-section">
      <h3 className="material-title">Materials</h3>
      {slots.map((slot) => (
        <SlotRow
          key={slot.id}
          objectId={objectId}
          slot={slot}
          overrides={overrides}
        />
      ))}
    </section>
  );
}
