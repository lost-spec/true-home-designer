import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import * as THREE from "three";
import { assetRegistry } from "../src/assets/registry";
import { ASSET_CATEGORIES } from "../src/assets/types";
import { useHouseStore } from "../src/store/houseStore";

const root = resolve(join(import.meta.dirname, ".."));

interface GlbJson {
  scenes?: { nodes?: number[] }[];
  scene?: number;
  nodes?: {
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  meshes?: { primitives: { attributes: { POSITION?: number } }[] }[];
  accessors?: {
    min?: number[];
    max?: number[];
    attributes?: Record<string, number>;
  }[];
}

function parseGlb(path: string): GlbJson {
  const buf = readFileSync(path);
  if (buf.length < 20 || buf.readUInt32LE(0) !== 0x46546c67) {
    throw new Error("not a GLB (bad magic)");
  }
  let offset = 12;
  let json: GlbJson | null = null;
  while (offset + 8 <= buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const data = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(data.toString("utf8"));
    offset += 8 + length;
  }
  if (!json) throw new Error("GLB has no JSON chunk");
  return json;
}

function modelBounds(path: string) {
  const json = parseGlb(path);
  const scenes = json.scenes ?? [];
  const scene = scenes[json.scene ?? 0];
  if (!scene) throw new Error("GLB has no default scene");
  const box = new THREE.Box3();

  const visit = (nodeIndex: number, parent: THREE.Matrix4) => {
    const node = json.nodes?.[nodeIndex];
    if (!node) throw new Error(`missing node ${nodeIndex}`);
    const local = new THREE.Matrix4();
    if (node.matrix) {
      local.fromArray(node.matrix);
    } else {
      local.compose(
        new THREE.Vector3(...(node.translation ?? [0, 0, 0])),
        new THREE.Quaternion(...(node.rotation ?? [0, 0, 0, 1])),
        new THREE.Vector3(...(node.scale ?? [1, 1, 1])),
      );
    }
    const world = parent.clone().multiply(local);
    if (node.mesh !== undefined) {
      const mesh = json.meshes?.[node.mesh];
      if (!mesh) throw new Error(`missing mesh ${node.mesh}`);
      for (const prim of mesh.primitives) {
        const posIndex = prim.attributes.POSITION;
        if (posIndex === undefined) throw new Error("primitive without POSITION");
        const accessor = json.accessors?.[posIndex];
        if (!accessor?.min || !accessor?.max) {
          throw new Error("POSITION accessor without min/max");
        }
        const corner = new THREE.Vector3();
        for (const x of [accessor.min[0], accessor.max[0]]) {
          for (const y of [accessor.min[1], accessor.max[1]]) {
            for (const z of [accessor.min[2], accessor.max[2]]) {
              corner.set(x, y, z).applyMatrix4(world);
              box.expandByPoint(corner);
            }
          }
        }
      }
    }
    for (const child of node.children ?? []) visit(child, world);
  };

  for (const nodeIndex of scene.nodes ?? []) visit(nodeIndex, new THREE.Matrix4());
  if (box.isEmpty()) throw new Error("model has no POSITION data");
  return box;
}

const checks: { label: string; ok: boolean; detail?: string }[] = [];
const check = (label: string, ok: boolean, detail?: string) =>
  checks.push({ label, ok, detail });

let registryError: unknown = null;
try {
  assetRegistry.list();
} catch (error) {
  registryError = error;
}
check("registry builds without validation errors", registryError === null, String(registryError));

const assets = assetRegistry.list();
check("registry has 10 assets", assets.length === 10, String(assets.length));
check(
  "registry index returns 2 living-room assets",
  assetRegistry.byCategory("living-room").length === 2,
  String(assetRegistry.byCategory("living-room").length),
);
check(
  "registry index returns empty for lighting",
  assetRegistry.byCategory("lighting").length === 0,
);
check(
  "every catalog category is a known union member",
  assets.every((a) => (ASSET_CATEGORIES as readonly string[]).includes(a.category)),
);
check("registry serves the test asset", assetRegistry.has("test_crate"));

const DIMENSION_TOLERANCE = 0.02;
const OFFSET_TOLERANCE = 0.05;

for (const asset of assets) {
  const filePath = join(root, "public", asset.modelPath.slice(1));
  const exists = existsSync(filePath);
  check(`${asset.assetId}: model file exists`, exists, filePath);

  let bounds: THREE.Box3 | null = null;
  let boundsError: unknown = null;
  if (exists) {
    try {
      bounds = modelBounds(filePath);
    } catch (error) {
      boundsError = error;
    }
  }
  check(
    `${asset.assetId}: GLB parses (magic, JSON chunk, POSITION data)`,
    bounds !== null,
    boundsError ? String(boundsError) : undefined,
  );
  if (!bounds) continue;

  const size = bounds.getSize(new THREE.Vector3());
  const declared = asset.dimensions;
  const dimsOk =
    Math.abs(size.x - declared.width) <= DIMENSION_TOLERANCE &&
    Math.abs(size.y - declared.height) <= DIMENSION_TOLERANCE &&
    Math.abs(size.z - declared.depth) <= DIMENSION_TOLERANCE;
  check(
    `${asset.assetId}: declared dimensions match model (${declared.width}×${declared.height}×${declared.depth} vs ${size.x.toFixed(3)}×${size.y.toFixed(3)}×${size.z.toFixed(3)})`,
    dimsOk,
  );

  const centerX = (bounds.min.x + bounds.max.x) / 2;
  const centerZ = (bounds.min.z + bounds.max.z) / 2;
  const offset = asset.footprintOffset;
  const offsetOk =
    Math.abs(-centerX - offset.x) <= OFFSET_TOLERANCE &&
    Math.abs(-centerZ - offset.z) <= OFFSET_TOLERANCE;
  check(
    `${asset.assetId}: footprintOffset centers model (declared ${offset.x},${offset.z} vs needed ${(-centerX).toFixed(3)},${(-centerZ).toFixed(3)})`,
    offsetOk,
  );
}

const sampleObjects = Object.values(useHouseStore.getState().house.objects);
check(
  "sample house places exactly one test object",
  sampleObjects.length === 1 && sampleObjects[0].assetId === "test_crate",
  JSON.stringify(sampleObjects.map((o) => o.assetId)),
);
check(
  "every placed object in the sample house resolves in the registry",
  sampleObjects.every((o) => assetRegistry.has(o.assetId)),
);
check(
  "sample test object sits inside room-1",
  sampleObjects.every((o) => {
    const room = useHouseStore.getState().house.rooms["room-1"];
    return (
      o.position.x > room.position.x &&
      o.position.x < room.position.x + room.width &&
      o.position.z > room.position.z &&
      o.position.z < room.position.z + room.depth
    );
  }),
);

let failed = 0;
for (const c of checks) {
  console.log(`${c.ok ? "PASS" : "FAIL"}  ${c.label}${c.ok || !c.detail ? "" : `  [${c.detail}]`}`);
  if (!c.ok) failed += 1;
}
console.log(`\nasset-check: ${checks.length - failed}/${checks.length} passed`);
process.exit(failed === 0 ? 0 : 1);
