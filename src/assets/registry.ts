import { ASSET_CATEGORIES, type AssetCategory, type AssetMetadata } from "./types";
import { ASSET_CATALOG } from "./catalog";
import { validateMaterialSlots } from "./materialSlots";

export interface AssetRegistry {
  get: (assetId: string) => AssetMetadata | undefined;
  has: (assetId: string) => boolean;
  list: () => readonly AssetMetadata[];
  byCategory: (category: AssetCategory) => readonly AssetMetadata[];
}

export function createAssetRegistry(
  assets: readonly AssetMetadata[],
): AssetRegistry {
  const seen = new Set<string>();
  for (const asset of assets) {
    if (seen.has(asset.assetId)) {
      throw new Error(`duplicate asset id: ${asset.assetId}`);
    }
    seen.add(asset.assetId);
    if (!ASSET_CATEGORIES.includes(asset.category)) {
      throw new Error(
        `asset ${asset.assetId} has unknown category: ${asset.category}`,
      );
    }
    if (!asset.modelPath.startsWith("/")) {
      throw new Error(
        `asset ${asset.assetId} modelPath must start with "/": ${asset.modelPath}`,
      );
    }
    const { width, height, depth } = asset.dimensions;
    if (!(width > 0 && height > 0 && depth > 0)) {
      throw new Error(`asset ${asset.assetId} has invalid dimensions`);
    }
    const slotErrors = validateMaterialSlots(asset.assetId, asset.materialSlots);
    if (slotErrors.length > 0) {
      throw new Error(`asset ${asset.assetId} material slots: ${slotErrors[0]}`);
    }
  }

  const byId = new Map<string, AssetMetadata>(assets.map((a) => [a.assetId, a]));
  const byCat = new Map<AssetCategory, readonly AssetMetadata[]>();
  for (const category of ASSET_CATEGORIES) {
    const group = assets.filter((a) => a.category === category);
    if (group.length > 0) byCat.set(category, group);
  }

  return Object.freeze({
    get: (assetId: string) => byId.get(assetId),
    has: (assetId: string) => byId.has(assetId),
    list: () => Object.freeze([...byId.values()]),
    byCategory: (category: AssetCategory) =>
      byCat.get(category) ?? Object.freeze([]),
  });
}

export const assetRegistry: AssetRegistry = createAssetRegistry(ASSET_CATALOG);
