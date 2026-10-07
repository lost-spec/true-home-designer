import { create } from "zustand";
import type { House, PlacedObject, Wall } from "../types/house";
import {
  DEFAULT_WALL_HEIGHT,
  DEFAULT_WALL_THICKNESS,
} from "../types/house";

const sampleHouse: House = {
  version: 1,
  rooms: {
    living: {
      id: "living",
      name: "Living room",
      origin: { x: 0, z: 0 },
      width: 6,
      depth: 5,
      wallIds: ["w-south", "w-west", "w-partition", "w-north"],
    },
    bedroom: {
      id: "bedroom",
      name: "Bedroom",
      origin: { x: 6, z: 0 },
      width: 4,
      depth: 5,
      wallIds: ["w-south", "w-partition", "w-east", "w-north"],
    },
  },
  walls: {
    "w-south": {
      id: "w-south",
      start: { x: 0, z: 0 },
      end: { x: 10, z: 0 },
      height: DEFAULT_WALL_HEIGHT,
      thickness: DEFAULT_WALL_THICKNESS,
    },
    "w-east": {
      id: "w-east",
      start: { x: 10, z: 0 },
      end: { x: 10, z: 5 },
      height: DEFAULT_WALL_HEIGHT,
      thickness: DEFAULT_WALL_THICKNESS,
    },
    "w-north": {
      id: "w-north",
      start: { x: 10, z: 5 },
      end: { x: 0, z: 5 },
      height: DEFAULT_WALL_HEIGHT,
      thickness: DEFAULT_WALL_THICKNESS,
    },
    "w-west": {
      id: "w-west",
      start: { x: 0, z: 5 },
      end: { x: 0, z: 0 },
      height: DEFAULT_WALL_HEIGHT,
      thickness: DEFAULT_WALL_THICKNESS,
    },
    "w-partition": {
      id: "w-partition",
      start: { x: 6, z: 0 },
      end: { x: 6, z: 5 },
      height: DEFAULT_WALL_HEIGHT,
      thickness: DEFAULT_WALL_THICKNESS,
    },
  },
  openings: {
    "o-entry": {
      id: "o-entry",
      wallId: "w-south",
      kind: "door",
      offset: 4.5,
      width: 1,
      height: 2.1,
      sillHeight: 0,
    },
    "o-inner": {
      id: "o-inner",
      wallId: "w-partition",
      kind: "door",
      offset: 1.8,
      width: 0.9,
      height: 2.1,
      sillHeight: 0,
    },
    "o-win-1": {
      id: "o-win-1",
      wallId: "w-north",
      kind: "window",
      offset: 1.5,
      width: 1.5,
      height: 1.4,
      sillHeight: 0.9,
    },
    "o-win-2": {
      id: "o-win-2",
      wallId: "w-north",
      kind: "window",
      offset: 7.2,
      width: 1.5,
      height: 1.4,
      sillHeight: 0.9,
    },
  },
  objects: {
    "obj-sofa": {
      id: "obj-sofa",
      assetId: "sofa",
      position: { x: 2.6, z: 2.4 },
      rotationY: Math.PI,
    },
    "obj-table": {
      id: "obj-table",
      assetId: "modern_table",
      position: { x: 2.6, z: 4.0 },
      rotationY: 0,
    },
    "obj-tv": {
      id: "obj-tv",
      assetId: "modern_tv",
      position: { x: 0.4, z: 2.6 },
      rotationY: Math.PI / 2,
    },
    "obj-bed": {
      id: "obj-bed",
      assetId: "bed",
      position: { x: 8, z: 3.2 },
      rotationY: Math.PI,
    },
  },
};

export interface HouseState {
  house: House;
  replaceHouse: (house: House) => void;
  updateWall: (id: string, patch: Partial<Omit<Wall, "id">>) => void;
  addPlacedObject: (object: PlacedObject) => void;
  updatePlacedObject: (
    id: string,
    patch: Partial<Omit<PlacedObject, "id">>,
  ) => void;
  removePlacedObject: (id: string) => void;
}

export const useHouseStore = create<HouseState>((set) => ({
  house: sampleHouse,

  replaceHouse: (house) => set({ house }),

  updateWall: (id, patch) =>
    set((state) => {
      const wall = state.house.walls[id];
      if (!wall) return state;
      return {
        house: {
          ...state.house,
          walls: { ...state.house.walls, [id]: { ...wall, ...patch } },
        },
      };
    }),

  addPlacedObject: (object) =>
    set((state) => ({
      house: {
        ...state.house,
        objects: { ...state.house.objects, [object.id]: object },
      },
    })),

  updatePlacedObject: (id, patch) =>
    set((state) => {
      const existing = state.house.objects[id];
      if (!existing) return state;
      return {
        house: {
          ...state.house,
          objects: {
            ...state.house.objects,
            [id]: { ...existing, ...patch },
          },
        },
      };
    }),

  removePlacedObject: (id) =>
    set((state) => {
      const objects = { ...state.house.objects };
      delete objects[id];
      return { house: { ...state.house, objects } };
    }),
}));
