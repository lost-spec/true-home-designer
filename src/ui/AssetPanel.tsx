import { ASSET_CATEGORIES } from "../assets/types";
import { assetRegistry } from "../assets/registry";
import { preloadAsset } from "../assets/useAssetModel";
import { useEditorStore } from "../store/editorStore";

function dimsLabel(asset: {
  dimensions: { width: number; height: number; depth: number };
}) {
  const { width, height, depth } = asset.dimensions;
  return `${width.toFixed(1)} × ${height.toFixed(1)} × ${depth.toFixed(1)} m`;
}

export function AssetPanel() {
  const placingAssetId = useEditorStore((s) => s.placingAssetId);
  const groups = ASSET_CATEGORIES.map((category) => ({
    category,
    assets: assetRegistry.byCategory(category),
  })).filter((group) => group.assets.length > 0);

  return (
    <aside className="side-panel">
      <h2>Assets</h2>
      <p className="panel-hint">
        Pick an asset, then click the floor to place it. Move: drag the object.
        Rotate: R. Cancel: Esc.
      </p>
      {groups.map(({ category, assets }) => (
        <section key={category} className="asset-group">
          <h3 className="asset-group-title">{category}</h3>
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
                  <span className="asset-name">{asset.name}</span>
                  <span className="asset-dims">{dimsLabel(asset)}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </aside>
  );
}
