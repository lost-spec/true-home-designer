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
}
