interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export type IconName =
  | "home"
  | "file"
  | "save"
  | "load"
  | "undo"
  | "redo"
  | "cursor"
  | "room"
  | "wall"
  | "place"
  | "roomAdd"
  | "door"
  | "window"
  | "layers"
  | "zoomIn"
  | "zoomOut"
  | "plan"
  | "cube"
  | "search"
  | "magnet"
  | "chevron"
  | "chevronLeft"
  | "chevronRight"
  | "panelLeft"
  | "panelRight"
  | "trash"
  | "rotate"
  | "up"
  | "down"
  | "plus"
  | "minus"
  | "walk"
  | "close";

const PATHS: Record<IconName, string> = {
  home: "M4 11.5 12 4l8 7.5M6 10.5V20h12v-9.5M10 20v-5h4v5",
  file: "M13 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9zM13 3v6h6M12 12v6M9 15h6",
  save: "M5 4h11l4 4v12a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zM8 4v5h7M8 14h8v7H8z",
  load: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2zM12 11v6M9.5 14.5 12 17l2.5-2.5",
  undo: "M9 14 4 9l5-5M4 9h10a6 6 0 0 1 0 12h-3",
  redo: "m15 14 5-5-5-5M20 9H10a6 6 0 0 0 0 12h3",
  cursor: "M5 3l14 8-6.5 1.5L10 19z",
  room: "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3",
  wall: "M4 10h16v4H4zM8 10v4M16 10v4",
  place: "M4 9l8-4 8 4v8l-8 4-8-4zM4 9l8 4 8-4M12 13v9",
  roomAdd:
    "M4 8V5a1 1 0 0 1 1-1h3M16 4h3a1 1 0 0 1 1 1v3M20 16v3a1 1 0 0 1-1 1h-3M8 20H5a1 1 0 0 1-1-1v-3M12 9v6M9 12h6",
  door: "M6 21V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v17M3 21h18M14.5 12.5h.01",
  window: "M4 4h16v16H4zM12 4v16M4 12h16",
  layers: "M12 3 3 7.5l9 4.5 9-4.5zM3 12l9 4.5 9-4.5M3 16.5 12 21l9-4.5",
  zoomIn: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2M8 11h6M11 8v6",
  zoomOut: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2M8 11h6",
  plan: "M4 4h16v16H4zM4 10h16M10 4v16",
  cube: "M12 3l8 4.5v9L12 21l-8-4.5v-9zM12 12l8-4.5M12 12v9M12 12 4 7.5",
  search: "M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4.2-4.2",
  magnet: "M6 4v7a6 6 0 0 0 12 0V4h-4v7a2 2 0 0 1-4 0V4z",
  chevron: "m7 10 5 5 5-5",
  chevronLeft: "m14 6-6 6 6 6",
  chevronRight: "m10 6 6 6-6 6",
  panelLeft: "M3 5h18v14H3zM9 5v14",
  panelRight: "M3 5h18v14H3zM15 5v14",
  trash: "M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M10 11v6M14 11v6",
  rotate: "M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5",
  up: "m6 14 6-6 6 6",
  down: "m6 10 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  walk: "M13 3.1a1.5 1.5 0 1 0 0.01 0M13 6.6l-2 5.4M11 12l-1.7 4.4L7 21M11 12l2.7 3.5L15 21M12.4 8.7 8.8 10M12.6 8.7 16.2 10.4",
  close: "M6 6l12 12M18 6 6 18",
};

export function Icon({ name, size = 14, className }: IconProps) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
