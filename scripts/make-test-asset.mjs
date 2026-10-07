import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const outPath = join(root, "public", "assets", "decoration", "test_crate.glb");

const s = 0.25;
const h = 0.25;
const faces = [
  { c: [0.5, 0.25, 0.25], u: [0, h, 0], v: [0, 0, s] },
  { c: [0, 0.25, 0.25], u: [0, h, 0], v: [0, 0, -s] },
  { c: [0.25, 0.5, 0.25], u: [s, 0, 0], v: [0, 0, -s] },
  { c: [0.25, 0, 0.25], u: [s, 0, 0], v: [0, 0, s] },
  { c: [0.25, 0.25, 0.5], u: [s, 0, 0], v: [0, h, 0] },
  { c: [0.25, 0.25, 0], u: [s, 0, 0], v: [0, -h, 0] },
];

const positions = [];
const normals = [];
const indices = [];
const min = [Infinity, Infinity, Infinity];
const max = [-Infinity, -Infinity, -Infinity];

const add = (arr, x, y, z) => arr.push(x, y, z);
const cross = (a, b) => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const sum = (a, b, ca = 1, cb = 1) => [
  a[0] * ca + b[0] * cb,
  a[1] * ca + b[1] * cb,
  a[2] * ca + b[2] * cb,
];

for (const { c, u, v } of faces) {
  const corners = [
    sum(sum(c, u, 1, -1), v, 1, -1),
    sum(sum(c, u, 1, 1), v, 1, -1),
    sum(sum(c, u, 1, 1), v, 1, 1),
    sum(sum(c, u, 1, -1), v, 1, 1),
  ];
  const n = cross(u, v);
  const len = Math.hypot(n[0], n[1], n[2]);
  const normal = [n[0] / len, n[1] / len, n[2] / len];
  const base = positions.length / 3;
  for (const corner of corners) {
    add(positions, corner[0], corner[1], corner[2]);
    add(normals, normal[0], normal[1], normal[2]);
    for (let i = 0; i < 3; i += 1) {
      min[i] = Math.min(min[i], corner[i]);
      max[i] = Math.max(max[i], corner[i]);
    }
  }
  indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

const posBuf = Buffer.from(new Float32Array(positions).buffer);
const normBuf = Buffer.from(new Float32Array(normals).buffer);
const idxBuf = Buffer.from(new Uint16Array(indices).buffer);
const bin = Buffer.concat([posBuf, normBuf, idxBuf]);

const gltf = {
  asset: { version: "2.0", generator: "true-home-designer make-test-asset" },
  scene: 0,
  scenes: [{ nodes: [0] }],
  nodes: [{ mesh: 0, name: "TestCrate" }],
  meshes: [
    {
      name: "TestCrateMesh",
      primitives: [
        { attributes: { POSITION: 0, NORMAL: 1 }, indices: 2, material: 0 },
      ],
    },
  ],
  materials: [
    {
      name: "CrateWood",
      pbrMetallicRoughness: {
        baseColorFactor: [0.62, 0.4, 0.22, 1],
        metallicFactor: 0,
        roughnessFactor: 0.85,
      },
    },
  ],
  accessors: [
    {
      bufferView: 0,
      componentType: 5126,
      count: positions.length / 3,
      type: "VEC3",
      min,
      max,
    },
    {
      bufferView: 1,
      componentType: 5126,
      count: normals.length / 3,
      type: "VEC3",
    },
    {
      bufferView: 2,
      componentType: 5123,
      count: indices.length,
      type: "SCALAR",
    },
  ],
  bufferViews: [
    { buffer: 0, byteOffset: 0, byteLength: posBuf.length, target: 34962 },
    {
      buffer: 0,
      byteOffset: posBuf.length,
      byteLength: normBuf.length,
      target: 34962,
    },
    {
      buffer: 0,
      byteOffset: posBuf.length + normBuf.length,
      byteLength: idxBuf.length,
      target: 34963,
    },
  ],
  buffers: [{ byteLength: bin.length }],
};

const pad = (buf, fill) => {
  const rem = buf.length % 4;
  return rem === 0 ? buf : Buffer.concat([buf, Buffer.alloc(4 - rem, fill)]);
};

const jsonChunk = pad(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
const binChunk = pad(bin, 0x00);
const total = 12 + 8 + jsonChunk.length + 8 + binChunk.length;

const out = Buffer.alloc(total);
out.writeUInt32LE(0x46546c67, 0);
out.writeUInt32LE(2, 4);
out.writeUInt32LE(total, 8);
out.writeUInt32LE(jsonChunk.length, 12);
out.writeUInt32LE(0x4e4f534a, 16);
jsonChunk.copy(out, 20);
const binHeader = 20 + jsonChunk.length;
out.writeUInt32LE(binChunk.length, binHeader);
out.writeUInt32LE(0x004e4942, binHeader + 4);
binChunk.copy(out, binHeader + 8);

mkdirSync(dirname(outPath), { recursive: true });
writeFileSync(outPath, out);

console.log(
  `wrote ${outPath} (${total} bytes, ${positions.length / 3} verts, min=${min.join(",")} max=${max.join(",")})`,
);
