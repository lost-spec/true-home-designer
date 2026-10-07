import { ASSET_CATALOG } from "../assets/catalog";

export function AssetPanel() {
  return (
    <aside className="side-panel">
      <h2>Assets</h2>
      <p className="panel-hint">
        Drag &amp; place lands in the next milestone. Clicking is disabled for
        now.
      </p>
      <ul className="asset-list">
        {ASSET_CATALOG.map((asset) => (
          <li key={asset.id}>
            <button disabled title="Placement comes in the next milestone">
              <span className="asset-name">{asset.name}</span>
              <span className="asset-category">{asset.category}</span>
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
