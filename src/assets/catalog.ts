export interface AssetDef {
  id: string;
  name: string;
  path: string;
  category: string;
}

export const ASSET_CATALOG: AssetDef[] = [
  {
    id: "sofa",
    name: "Sofa",
    path: "/assets/furniture/sofa.glb",
    category: "Seating",
  },
  {
    id: "racing_gaming_chair",
    name: "Gaming chair",
    path: "/assets/furniture/racing_gaming_chair.glb",
    category: "Seating",
  },
  {
    id: "modern_table",
    name: "Modern table",
    path: "/assets/furniture/modern_table.glb",
    category: "Tables",
  },
  {
    id: "bed",
    name: "Bed",
    path: "/assets/furniture/bed.glb",
    category: "Bedroom",
  },
  {
    id: "modern_closet",
    name: "Closet",
    path: "/assets/furniture/modern_closet.glb",
    category: "Bedroom",
  },
  {
    id: "cabinet",
    name: "Cabinet",
    path: "/assets/furniture/cabinet.glb",
    category: "Storage",
  },
  {
    id: "fridge",
    name: "Fridge",
    path: "/assets/furniture/fridge.glb",
    category: "Kitchen",
  },
  {
    id: "modern_tv",
    name: "TV",
    path: "/assets/furniture/modern_tv.glb",
    category: "Electronics",
  },
  {
    id: "round_clock",
    name: "Clock",
    path: "/assets/furniture/round_clock.glb",
    category: "Decor",
  },
];

export const ASSET_BY_ID: Record<string, AssetDef> = Object.fromEntries(
  ASSET_CATALOG.map((asset) => [asset.id, asset]),
);
