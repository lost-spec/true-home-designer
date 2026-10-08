import { useEffect } from "react";
import { useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useHouseStore } from "./store/houseStore";
import { useEditorStore } from "./store/editorStore";
import { getHistoryFlags } from "./store/history";
import { currentDesignDocument, loadDesignText } from "./persistence/designIO";
import { serializeDesign } from "./persistence/houseData";
import {
  clearAutosave as clearAutosaveEntry,
  readAutosave,
} from "./persistence/designStorage";
import {
  clientToNdc,
  groundHitFromClient,
  projectToClient,
} from "./interaction/pointerProjection";

interface BoxBounds {
  min: { x: number; y: number; z: number };
  max: { x: number; y: number; z: number };
}

declare global {
  interface Window {
    __homeDesigner?: {
      getHouse: () => unknown;
      getSelection: () => unknown;
      getSnapSize: () => number;
      setSnapSize: (value: number) => void;
      getDraggingWallId: () => string | null;
      getDraggingObjectId: () => string | null;
      getDraggingOpeningId: () => string | null;
      getTool: () => string;
      getViewMode: () => string;
      getPlacingAssetId: () => string | null;
      getGhostPosition: () => { x: number; z: number } | null;
      getPlacingRotationY: () => number;
      project: (x: number, y: number, z: number) => { x: number; y: number } | null;
      groundAt: (clientX: number, clientY: number) => { x: number; z: number } | null;
      measure: (name: string) => BoxBounds | null;
      getCameraDistance: () => number;
      pickWall: (clientX: number, clientY: number) => string | null;
      pickTop: (clientX: number, clientY: number) => string | null;
      pickObject: (clientX: number, clientY: number) => string | null;
      pickOpening: (clientX: number, clientY: number) => string | null;
      getCanUndo: () => boolean;
      getCanRedo: () => boolean;
      undo: () => void;
      redo: () => void;
      getDesignJson: () => string;
      loadDesignJson: (text: string) => {
        ok: boolean;
        error: string | null;
        warnings: string[];
      };
      hasAutosave: () => boolean;
      clearAutosave: () => void;
    };
  }
}

function ancestorName(object: THREE.Object3D): string | null {
  let current: THREE.Object3D | null = object;
  while (current) {
    if (current.name) return current.name;
    current = current.parent;
  }
  return null;
}

export function DevBridge() {
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const internal = useThree((s) => s.internal);
  const controls = useThree((s) => s.controls) as unknown as {
    target: THREE.Vector3;
  } | null;

  useEffect(() => {
    const raycaster = new THREE.Raycaster();
    const box = new THREE.Box3();
    const ndc = new THREE.Vector2();

    const castInteractive = (clientX: number, clientY: number) => {
      const point = clientToNdc(gl.domElement, clientX, clientY);
      ndc.set(point.x, point.y);
      raycaster.setFromCamera(ndc, camera);
      const hits: THREE.Intersection[] = [];
      for (const object of internal.interaction) {
        hits.push(...raycaster.intersectObject(object, true));
      }
      hits.sort((a, b) => a.distance - b.distance);
      return hits;
    };

    window.__homeDesigner = {
      getHouse: () => useHouseStore.getState().house,
      getSelection: () => useEditorStore.getState().selection,
      getSnapSize: () => useEditorStore.getState().snapSize,
      setSnapSize: (value) => useEditorStore.getState().setSnapSize(value),
      getDraggingWallId: () => useEditorStore.getState().draggingWallId,
      getDraggingObjectId: () => useEditorStore.getState().draggingObjectId,
      getDraggingOpeningId: () => useEditorStore.getState().draggingOpeningId,
      getTool: () => useEditorStore.getState().tool,
      getViewMode: () => useEditorStore.getState().viewMode,
      getPlacingAssetId: () => useEditorStore.getState().placingAssetId,
      getGhostPosition: () => useEditorStore.getState().ghostPosition,
      getPlacingRotationY: () => useEditorStore.getState().placingRotationY,
      project: (x, y, z) => projectToClient(camera, gl.domElement, x, y, z),
      groundAt: (clientX, clientY) =>
        groundHitFromClient(camera, gl.domElement, clientX, clientY),
      measure: (name) => {
        const target = scene.getObjectByName(name);
        if (!target) return null;
        box.setFromObject(target);
        if (box.isEmpty()) return null;
        return {
          min: { x: box.min.x, y: box.min.y, z: box.min.z },
          max: { x: box.max.x, y: box.max.y, z: box.max.z },
        };
      },
      getCameraDistance: () =>
        camera.position.distanceTo(controls?.target ?? new THREE.Vector3()),
      pickWall: (clientX, clientY) => {
        const hits = castInteractive(clientX, clientY);
        if (!hits.length) return null;
        const wallIds = Object.keys(useHouseStore.getState().house.walls);
        let current: THREE.Object3D | null = hits[0].object;
        while (current) {
          if (current.name && wallIds.includes(current.name)) return current.name;
          current = current.parent;
        }
        return null;
      },
      pickTop: (clientX, clientY) => {
        const hits = castInteractive(clientX, clientY);
        if (!hits.length) return null;
        return ancestorName(hits[0].object);
      },
      pickObject: (clientX, clientY) => {
        const hits = castInteractive(clientX, clientY);
        if (!hits.length) return null;
        let current: THREE.Object3D | null = hits[0].object;
        while (current) {
          if (current.name.startsWith("object-")) {
            return current.name.slice("object-".length);
          }
          current = current.parent;
        }
        return null;
      },
      pickOpening: (clientX, clientY) => {
        const hits = castInteractive(clientX, clientY);
        if (!hits.length) return null;
        let current: THREE.Object3D | null = hits[0].object;
        while (current) {
          if (current.name.startsWith("opening-")) {
            return current.name.slice("opening-".length);
          }
          current = current.parent;
        }
        return null;
      },
      getCanUndo: () => getHistoryFlags().canUndo,
      getCanRedo: () => getHistoryFlags().canRedo,
      undo: () => useHouseStore.getState().undo(),
      redo: () => useHouseStore.getState().redo(),
      getDesignJson: () => serializeDesign(currentDesignDocument()),
      loadDesignJson: (text) => {
        const result = loadDesignText(text);
        return result.ok
          ? { ok: true, error: null, warnings: result.warnings }
          : { ok: false, error: result.error, warnings: [] };
      },
      hasAutosave: () => readAutosave() !== null,
      clearAutosave: () => clearAutosaveEntry(),
    };

    return () => {
      delete window.__homeDesigner;
    };
  }, [scene, camera, gl, internal, controls]);

  return null;
}
