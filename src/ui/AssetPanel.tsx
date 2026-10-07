import { ASSET_CATEGORIES } from "../assets/types";
import { assetRegistry } from "../assets/registry";
import { preloadAsset } from "../assets/useAssetModel";

function dimsLabel(asset: {
  dimensions: { width: number; height: number; depth: number };
}) {
  const { width, height, depth } = asset.dimensions;
  return `${width.toFixed(1)} × ${height.toFixed(1)} × ${depth.toFixed(1)} m`;
}

export function AssetPanel() {
  const groups = ASSET_CATEGORIES.map((category) => ({
    category,
    assets: assetRegistry.byCategory(category),
  })).filter((group) => group.assets.length > 0);

  return (
    <aside className="side-panel">
      <h2>Assets</h2>
      <p className="panel-hint">
        Drag &amp; place lands in the next milestone. Clicking is disabled for
        now.
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
                <button disabled title="Placement comes in the next milestone">
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
