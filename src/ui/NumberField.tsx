import type { FocusEvent } from "react";
import { beginHistoryBatch, endHistoryBatch } from "../store/history";
import { Icon } from "./Icon";

interface NumberFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  disabled?: boolean;
  className?: string;
  onChange: (raw: string) => void;
}

// Digits after the decimal point in a step like 0.05 or 1.
function decimalsOf(step: number): number {
  const text = String(step);
  const dot = text.indexOf(".");
  return dot === -1 ? 0 : text.length - dot - 1;
}

/**
 * Labelled numeric input with steppers, an optional unit suffix and hidden
 * native spinners. Focus starts an undo batch and blur clamps the value into
 * [min, max] so a typed out-of-range number settles on the valid result.
 */
export function NumberField({
  label,
  value,
  min,
  max,
  step,
  unit,
  disabled,
  className,
  onChange,
}: NumberFieldProps) {
  const clampTo = (n: number) => Math.min(max, Math.max(min, n));

  const nudge = (direction: 1 | -1) => {
    if (disabled) return;
    const precision = decimalsOf(step) + 1;
    const next = clampTo(Number((value + direction * step).toFixed(precision)));
    onChange(String(next));
  };

  const handleBlur = (event: FocusEvent<HTMLInputElement>) => {
    endHistoryBatch();
    const raw = event.target.value;
    if (raw.trim() === "") {
      onChange(String(clampTo(value)));
      return;
    }
    const parsed = Number(raw);
    if (!Number.isFinite(parsed)) return;
    const clamped = clampTo(parsed);
    if (clamped !== parsed) onChange(String(clamped));
  };

  const classes = className ? `number-field ${className}` : "number-field";

  return (
    <label className={classes}>
      <span className="number-label">{label}</span>
      <span className="number-box">
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          onFocus={() => beginHistoryBatch()}
          onBlur={handleBlur}
          onChange={(event) => onChange(event.target.value)}
        />
        {unit ? <span className="number-unit">{unit}</span> : null}
        <span className="number-steppers">
          <button
            type="button"
            className="step"
            tabIndex={-1}
            disabled={disabled || value >= max}
            aria-label={`Increase ${label}`}
            title={`Increase ${label}`}
            onClick={() => nudge(1)}
          >
            <Icon name="up" size={10} />
          </button>
          <button
            type="button"
            className="step"
            tabIndex={-1}
            disabled={disabled || value <= min}
            aria-label={`Decrease ${label}`}
            title={`Decrease ${label}`}
            onClick={() => nudge(-1)}
          >
            <Icon name="down" size={10} />
          </button>
        </span>
      </span>
    </label>
  );
}
