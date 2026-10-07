import { create } from "zustand";
import type { House, PlacedObject, Room, Wall } from "../types/house";
import { createRoom, generateRoomWalls } from "../geometry/roomGeometry";

const MIN_ROOM_SIZE = 1;
const MAX_ROOM_SIZE = 60;
const MIN_WALL_HEIGHT = 1.5;
const MAX_WALL_HEIGHT = 6;
const MIN_WALL_THICKNESS = 0.05;
const MAX_WALL_THICKNESS = 0.5;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const firstRoom = createRoom({
  id: "room-1",
  name: "Room 1",
  origin: { x: -3, z: -2.5 },
  width: 6,
  depth: 5,
});

const sampleHouse: House = {
  version: 1,
  rooms: { [firstRoom.room.id]: firstRoom.room },
  walls: Object.fromEntries(firstRoom.walls.map((wall) => [wall.id, wall])),
  openings: {},
  objects: {},
};

export interface RoomDimensionsPatch {
  width?: number;
  depth?: number;
  wallHeight?: number;
  wallThickness?: number;
}

export interface HouseState {
  house: House;
  replaceHouse: (house: House) => void;
  setRoomDimensions: (roomId: string, patch: RoomDimensionsPatch) => void;
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

  setRoomDimensions: (roomId, patch) =>
    set((state) => {
      const room = state.house.rooms[roomId];
      if (!room) return state;

      const width =
        patch.width !== undefined && Number.isFinite(patch.width)
          ? clamp(patch.width, MIN_ROOM_SIZE, MAX_ROOM_SIZE)
          : room.width;
      const depth =
        patch.depth !== undefined && Number.isFinite(patch.depth)
          ? clamp(patch.depth, MIN_ROOM_SIZE, MAX_ROOM_SIZE)
          : room.depth;
      const wallHeight =
        patch.wallHeight !== undefined && Number.isFinite(patch.wallHeight)
          ? clamp(patch.wallHeight, MIN_WALL_HEIGHT, MAX_WALL_HEIGHT)
          : room.wallHeight;
      const wallThickness =
        patch.wallThickness !== undefined && Number.isFinite(patch.wallThickness)
          ? clamp(patch.wallThickness, MIN_WALL_THICKNESS, MAX_WALL_THICKNESS)
          : room.wallThickness;

      const centerX = room.origin.x + room.width / 2;
      const centerZ = room.origin.z + room.depth / 2;

      const updated: Room = {
        ...room,
        width,
        depth,
        wallHeight,
        wallThickness,
        origin: { x: centerX - width / 2, z: centerZ - depth / 2 },
      };

      const walls = generateRoomWalls(updated);
      const nextWalls = { ...state.house.walls };
      for (const wall of walls) {
        nextWalls[wall.id] = wall;
      }

      return {
        house: {
          ...state.house,
          rooms: { ...state.house.rooms, [roomId]: updated },
          walls: nextWalls,
        },
      };
    }),

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
