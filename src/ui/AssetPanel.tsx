import { useState } from "react";
import { ASSET_CATEGORIES } from "../assets/types";
import { assetRegistry } from "../assets/registry";
import { preloadAsset } from "../assets/useAssetModel";
import { useEditorStore } from "../store/editorStore";
import { Icon } from "./Icon";

const CATEGORY_LABELS: Record<string, string> = {
  furniture: "Furniture",
  bedroom: "Bedroom",
  "living-room": "Living room",
  kitchen: "Kitchen",
  bathroom: "Bathroom",
  decoration: "Decoration",
  lighting: "Lighting",
};

function categoryLabel(category: string): string {
  return CATEGORY_LABELS[category] ?? category;
}

function dimsLabel(asset: {
  dimensions: { width: number; height: number; depth: number };
}) {
  const { width, height, depth } = asset.dimensions;
  return `${width.toFixed(1)} × ${height.toFixed(1)} × ${depth.toFixed(1)} m`;
}

export function AssetPanel() {
  const placingAssetId = useEditorStore((s) => s.placingAssetId);
  const open = useEditorStore((s) => s.leftPanelOpen);
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string>("all");

  const normalizedQuery = query.trim().toLowerCase();
  const groups = ASSET_CATEGORIES.map((entry) => ({
    category: entry,
    assets: assetRegistry.byCategory(entry),
  }))
    .filter(
      (group) =>
        group.assets.length > 0 && (category === "all" || group.category === category),
    )
    .map((group) => ({
      ...group,
      assets: group.assets.filter(
        (asset) =>
          normalizedQuery === "" ||
          asset.name.toLowerCase().includes(normalizedQuery),
      ),
    }))
    .filter((group) => group.assets.length > 0);

  const resultCount = groups.reduce((total, group) => total + group.assets.length, 0);

  return (
    <aside className={open ? "side-panel" : "side-panel collapsed"}>
      <div className="panel-header">
        <h2 className="panel-title">Assets</h2>
        <button
          type="button"
          className="panel-toggle"
          title={open ? "Hide the assets panel" : "Show the assets panel"}
          aria-label={open ? "Hide the assets panel" : "Show the assets panel"}
          onClick={() => useEditorStore.getState().toggleLeftPanel()}
        >
          <Icon name="chevronLeft" size={14} />
        </button>
      </div>
      <div className="panel-body">
        <div className="asset-search">
          <Icon name="search" size={13} />
          <input
            type="search"
            placeholder="Search assets"
            aria-label="Search assets"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="asset-chips" role="group" aria-label="Asset categories">
          <button
            type="button"
            className={`asset-chip${category === "all" ? " active" : ""}`}
            onClick={() => setCategory("all")}
          >
            All
          </button>
          {ASSET_CATEGORIES.map((entry) => (
            <button
              key={entry}
              type="button"
              className={`asset-chip${category === entry ? " active" : ""}`}
              onClick={() => setCategory(entry)}
            >
              {categoryLabel(entry)}
            </button>
          ))}
        </div>
        {resultCount === 0 ? (
          <div className="asset-empty">
            <strong>No assets found</strong>
            Try a different search or category.
          </div>
        ) : (
          groups.map(({ category: entry, assets }) => (
            <section key={entry} className="asset-group">
              <h3 className="asset-group-title">{categoryLabel(entry)}</h3>
              <ul className="asset-list">
                {assets.map((asset) => (
                  <li
                    key={asset.assetId}
                    onMouseEnter={() => preloadAsset(asset.modelPath)}
                  >
                    <button
                      className={
                        placingAssetId === asset.assetId ? "active" : ""
                      }
                      onClick={(event) => {
                        event.stopPropagation();
                        const state = useEditorStore.getState();
                        if (
                          state.tool === "placeObject" &&
                          state.placingAssetId === asset.assetId
                        ) {
                          return;
                        }
                        state.setTool("placeObject");
                        state.setPlacingAssetId(asset.assetId);
                      }}
                      title={`Place ${asset.name}`}
                    >
                      {asset.thumbnailPath ? (
                        <img
                          className="asset-thumb"
                          src={asset.thumbnailPath}
                          alt=""
                          loading="lazy"
                        />
                      ) : null}
                      <span className="asset-info">
                        <span className="asset-name">{asset.name}</span>
                        <span className="asset-dims">{dimsLabel(asset)}</span>
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </div>
    </aside>
  );
}
