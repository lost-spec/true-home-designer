import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

interface SectionProps {
  title: string;
  hint?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

/**
 * Collapsible panel group. Starts open so every control is reachable without
 * an extra click; the chevron is a single button that toggles the body.
 */
export function Section({ title, hint, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className={`section${open ? "" : " closed"}`}>
      <button
        type="button"
        className="section-head"
        aria-expanded={open}
        title={open ? `Collapse ${title}` : `Expand ${title}`}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="chevron" size={13} className="section-chevron" />
        <span className="section-title">{title}</span>
        {hint ? <span className="section-hint">{hint}</span> : null}
      </button>
      {open ? <div className="section-body">{children}</div> : null}
    </section>
  );
}
