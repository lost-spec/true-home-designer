import { create } from "zustand";

export type Tool = "select" | "drawRoom" | "drawWall" | "placeObject";

export type Selection =
  | { kind: "wall"; id: string }
  | { kind: "room"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "object"; id: string }
  | null;

export interface EditorState {
  tool: Tool;
  selection: Selection;
  ceilingVisible: boolean;
  snapSize: number;
  draggingWallId: string | null;
  setTool: (tool: Tool) => void;
  select: (selection: Selection) => void;
  toggleCeiling: () => void;
  setSnapSize: (snapSize: number) => void;
  setDraggingWallId: (wallId: string | null) => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: "select",
  selection: null,
  ceilingVisible: true,
  snapSize: 0.1,
  draggingWallId: null,
  setTool: (tool) => set({ tool }),
  select: (selection) => set({ selection }),
  toggleCeiling: () =>
    set((state) => ({ ceilingVisible: !state.ceilingVisible })),
  setSnapSize: (snapSize) =>
    set({ snapSize: Number.isFinite(snapSize) && snapSize > 0 ? snapSize : 0.1 }),
  setDraggingWallId: (draggingWallId) => set({ draggingWallId }),
}));
