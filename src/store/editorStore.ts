import { create } from "zustand";
import type { Vec2 } from "../types/house";

export type Tool = "select" | "drawRoom" | "drawWall" | "placeObject";

export type ViewMode = "3d" | "2d";

export type Selection =
  | { kind: "wall"; id: string }
  | { kind: "room"; id: string }
  | { kind: "opening"; id: string }
  | { kind: "object"; id: string }
  | null;

/** Snap sizes offered by the toolbar and accepted by saved designs. */
export const SNAP_OPTIONS = [0.05, 0.1, 0.25, 0.5] as const;

export interface EditorState {
  tool: Tool;
  selection: Selection;
  viewMode: ViewMode;
  ceilingVisible: boolean;
  snapSize: number;
  draggingWallId: string | null;
  placingAssetId: string | null;
  placingRotationY: number;
  ghostPosition: Vec2 | null;
  draggingObjectId: string | null;
  draggingOpeningId: string | null;
  setTool: (tool: Tool) => void;
  select: (selection: Selection) => void;
  setViewMode: (viewMode: ViewMode) => void;
  toggleCeiling: () => void;
  setCeilingVisible: (ceilingVisible: boolean) => void;
  setSnapSize: (snapSize: number) => void;
  setDraggingWallId: (wallId: string | null) => void;
  setPlacingAssetId: (assetId: string | null) => void;
  setPlacingRotationY: (rotationY: number) => void;
  setGhostPosition: (position: Vec2 | null) => void;
  setDraggingObjectId: (objectId: string | null) => void;
  setDraggingOpeningId: (openingId: string | null) => void;
}

const IDLE_PLACEMENT = {
  placingAssetId: null,
  placingRotationY: 0,
  ghostPosition: null,
} as const;

export const useEditorStore = create<EditorState>((set) => ({
  tool: "select",
  selection: null,
  viewMode: "3d",
  ceilingVisible: true,
  snapSize: 0.1,
  draggingWallId: null,
  placingAssetId: null,
  placingRotationY: 0,
  ghostPosition: null,
  draggingObjectId: null,
  draggingOpeningId: null,
  setTool: (tool) => set({ tool, ...IDLE_PLACEMENT }),
  select: (selection) => set({ selection }),
  setViewMode: (viewMode) => {
    if (viewMode !== "3d" && viewMode !== "2d") return;
    set({ viewMode });
  },
  toggleCeiling: () =>
    set((state) => ({ ceilingVisible: !state.ceilingVisible })),
  setCeilingVisible: (ceilingVisible) => set({ ceilingVisible }),
  setSnapSize: (snapSize) =>
    set({ snapSize: Number.isFinite(snapSize) && snapSize > 0 ? snapSize : 0.1 }),
  setDraggingWallId: (draggingWallId) => set({ draggingWallId }),
  setPlacingAssetId: (assetId) =>
    set({
      placingAssetId: assetId,
      placingRotationY: 0,
      ghostPosition: null,
      selection: null,
    }),
  setPlacingRotationY: (rotationY) =>
    set({
      placingRotationY: Number.isFinite(rotationY) ? rotationY : 0,
    }),
  setGhostPosition: (position) => set({ ghostPosition: position }),
  setDraggingObjectId: (objectId) => set({ draggingObjectId: objectId }),
  setDraggingOpeningId: (openingId) => set({ draggingOpeningId: openingId }),
}));
