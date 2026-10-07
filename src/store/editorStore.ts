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
  setTool: (tool: Tool) => void;
  select: (selection: Selection) => void;
  toggleCeiling: () => void;
}

export const useEditorStore = create<EditorState>((set) => ({
  tool: "select",
  selection: null,
  ceilingVisible: false,
  setTool: (tool) => set({ tool }),
  select: (selection) => set({ selection }),
  toggleCeiling: () =>
    set((state) => ({ ceilingVisible: !state.ceilingVisible })),
}));
