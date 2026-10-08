export const ASSET_CATEGORIES = [
  "furniture",
  "bedroom",
  "living-room",
  "kitchen",
  "bathroom",
  "decoration",
  "lighting",
] as const;

export type AssetCategory = (typeof ASSET_CATEGORIES)[number];

export interface AssetDimensions {
  width: number;
  height: number;
  depth: number;
}

export interface MaterialTarget {
  name: string;
  color?: string;
}

export interface MaterialFinish {
  id: string;
  label: string;
  color?: string;
  roughness?: number;
  metalness?: number;
}

export interface MaterialSlot {
  id: string;
  label: string;
  originalColor: string;
  targets: MaterialTarget[];
  palette?: readonly string[];
  finishes?: readonly MaterialFinish[];
}

export interface MaterialOverrides {
  colors?: Record<string, string>;
  finishes?: Record<string, string>;
}

export interface AssetMetadata {
  assetId: string;
  name: string;
  category: AssetCategory;
  modelPath: string;
  dimensions: AssetDimensions;
  footprintOffset: { x: number; z: number };
  thumbnailPath?: string;
  allowRotation: boolean;
  allowScaling: boolean;
  materialSlots?: readonly MaterialSlot[];
}
