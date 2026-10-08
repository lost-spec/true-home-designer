import * as THREE from "three";
import type { AssetMetadata, MaterialOverrides, MaterialSlot } from "./types";
import { slotState, targetColorFor, type SlotState } from "./materialSlots";

export interface AssetInstance {
  root: THREE.Group;
  base: Map<string, THREE.Material[]>;
  clones: Map<string, THREE.Material[]>;
}

function materialList(
  material: THREE.Material | THREE.Material[],
): THREE.Material[] {
  return Array.isArray(material) ? material : [material];
}

function mapMaterials(
  root: THREE.Object3D,
  mapping: Map<THREE.Material, THREE.Material>,
): void {
  if (mapping.size === 0) return;
  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    const current = mesh.material;
    if (Array.isArray(current)) {
      let changed = false;
      const next = current.map((material) => {
        const replacement = mapping.get(material);
        if (!replacement) return material;
        changed = true;
        return replacement;
      });
      if (changed) mesh.material = next;
    } else {
      const replacement = mapping.get(current);
      if (replacement) mesh.material = replacement;
    }
  });
}

export function buildAssetInstance(source: THREE.Object3D): AssetInstance {
  const root = source.clone(true) as THREE.Group;
  const base = new Map<string, THREE.Material[]>();

  root.traverse((node) => {
    const mesh = node as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    for (const material of materialList(mesh.material)) {
      const list = base.get(material.name);
      if (list) {
        if (!list.includes(material)) list.push(material);
      } else {
        base.set(material.name, [material]);
      }
    }
  });

  return { root, base, clones: new Map() };
}

function ensureClones(
  instance: AssetInstance,
  name: string,
  sources: THREE.Material[],
): THREE.Material[] {
  const existing = instance.clones.get(name);
  if (existing) return existing;
  const clones = sources.map((material) => material.clone());
  instance.clones.set(name, clones);
  const mapping = new Map<THREE.Material, THREE.Material>();
  sources.forEach((material, index) => mapping.set(material, clones[index]));
  mapMaterials(instance.root, mapping);
  return clones;
}

function releaseMaterial(instance: AssetInstance, name: string): void {
  const clones = instance.clones.get(name);
  const sources = instance.base.get(name);
  if (!clones || !sources) return;
  const mapping = new Map<THREE.Material, THREE.Material>();
  clones.forEach((clone, index) => {
    const source = sources[index];
    if (source) mapping.set(clone, source);
  });
  mapMaterials(instance.root, mapping);
  for (const clone of clones) clone.dispose();
  instance.clones.delete(name);
}

function applyTarget(
  clone: THREE.Material,
  source: THREE.Material,
  slot: MaterialSlot,
  state: SlotState,
  targetColor: string | undefined,
): void {
  clone.copy(source);
  const material = clone as THREE.MeshStandardMaterial;
  if (state.chosenColor !== null && material.color) {
    material.color.set(
      targetColorFor(
        state.chosenColor,
        slot.originalColor,
        targetColor ?? slot.originalColor,
      ),
    );
  }
  const finish = state.finish;
  if (finish && typeof material.roughness === "number" && finish.roughness !== undefined) {
    material.roughness = finish.roughness;
  }
  if (finish && typeof material.metalness === "number" && finish.metalness !== undefined) {
    material.metalness = finish.metalness;
  }
}

function applySlot(
  instance: AssetInstance,
  slot: MaterialSlot,
  state: SlotState,
): void {
  for (const target of slot.targets) {
    const sources = instance.base.get(target.name);
    if (!sources) continue;
    const clones = ensureClones(instance, target.name, sources);
    for (let index = 0; index < clones.length; index += 1) {
      applyTarget(clones[index], sources[index], slot, state, target.color);
    }
  }
}

export function applyMaterialOverrides(
  instance: AssetInstance,
  asset: AssetMetadata,
  overrides: MaterialOverrides | undefined,
): void {
  for (const slot of asset.materialSlots ?? []) {
    const state = slotState(slot, overrides);
    if (state.isDefault) {
      for (const target of slot.targets) releaseMaterial(instance, target.name);
      continue;
    }
    applySlot(instance, slot, state);
  }
}

export function disposeAssetInstance(instance: AssetInstance): void {
  for (const name of Array.from(instance.clones.keys())) {
    releaseMaterial(instance, name);
  }
  instance.clones.clear();
  // The base map indexes the shared GLB materials and stays valid for as long
  // as the instance exists; clearing it would break the remount cycle React
  // StrictMode performs (mount -> cleanup -> mount) in development.
}
