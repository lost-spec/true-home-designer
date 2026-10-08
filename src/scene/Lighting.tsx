import { useLayoutEffect, useMemo, useRef } from "react";
import { useThree } from "@react-three/fiber";
import { ContactShadows, Environment } from "@react-three/drei";
import * as THREE from "three";
import { useHouseStore } from "../store/houseStore";
import { assetRegistry } from "../assets/registry";
import { CEILING_THICKNESS } from "../types/house";

const SUN_DIRECTION = new THREE.Vector3(-0.9, 1.6, 0.42);
SUN_DIRECTION.normalize();

const SUN_COLOR = "#fff2df";
const SUN_INTENSITY = 2.6;

const SHADOW_MAP_SIZE = 2048;
const SHADOW_PADDING = 2.5;
const SHADOW_RADIUS = 9;
const SHADOW_BIAS = -0.0003;
const SHADOW_NORMAL_BIAS = 0.02;
const SUN_DISTANCE_PADDING = 12;

const SKY_WIDTH = 128;
const SKY_HEIGHT = 64;
const SUN_DISC_SIGMA = 0.04;
const SUN_DISC_RADIANCE = 10;

// Soft daylight fill: neutral-warm so interiors and sunlit surfaces stay in
// the warm palette of the house materials instead of going blue.
const SKY_ZENITH: [number, number, number] = [0.36, 0.37, 0.4];
const SKY_HORIZON: [number, number, number] = [0.6, 0.57, 0.53];
const SKY_GROUND: [number, number, number] = [0.17, 0.15, 0.13];

function computeSceneBounds(): THREE.Box3 {
  const box = new THREE.Box3();
  const { rooms, objects } = useHouseStore.getState().house;

  for (const room of Object.values(rooms)) {
    box.expandByPoint(
      new THREE.Vector3(room.position.x, 0, room.position.z),
    );
    box.expandByPoint(
      new THREE.Vector3(
        room.position.x + room.width,
        room.height + CEILING_THICKNESS,
        room.position.z + room.depth,
      ),
    );
  }

  for (const object of Object.values(objects)) {
    const asset = assetRegistry.get(object.assetId);
    const width = (asset?.dimensions.width ?? 1) * object.scale;
    const depth = (asset?.dimensions.depth ?? 1) * object.scale;
    const height = (asset?.dimensions.height ?? 1) * object.scale;
    const radius = Math.max(width, depth) * 0.71;
    box.expandByPoint(
      new THREE.Vector3(
        object.position.x - radius,
        object.position.y,
        object.position.z - radius,
      ),
    );
    box.expandByPoint(
      new THREE.Vector3(
        object.position.x + radius,
        object.position.y + height,
        object.position.z + radius,
      ),
    );
  }

  if (box.isEmpty()) {
    box.set(new THREE.Vector3(-4, 0, -4), new THREE.Vector3(4, 3, 4));
  }
  return box;
}

function createSkyTexture(): THREE.DataTexture {
  const data = new Float32Array(SKY_WIDTH * SKY_HEIGHT * 4);
  const smooth = (t: number) => t * t * (3 - 2 * t);

  for (let y = 0; y < SKY_HEIGHT; y += 1) {
    const v = (y + 0.5) / SKY_HEIGHT;
    const latitude = (v - 0.5) * Math.PI;
    const cosLat = Math.cos(latitude);
    const dirY = Math.sin(latitude);

    for (let x = 0; x < SKY_WIDTH; x += 1) {
      const u = (x + 0.5) / SKY_WIDTH;
      const longitude = (u - 0.5) * Math.PI * 2;
      const dirX = cosLat * Math.cos(longitude);
      const dirZ = cosLat * Math.sin(longitude);

      let r: number;
      let g: number;
      let b: number;

      if (dirY >= 0) {
        const t = smooth(dirY);
        r =
          SKY_HORIZON[0] + (SKY_ZENITH[0] - SKY_HORIZON[0]) * t;
        g =
          SKY_HORIZON[1] + (SKY_ZENITH[1] - SKY_HORIZON[1]) * t;
        b =
          SKY_HORIZON[2] + (SKY_ZENITH[2] - SKY_HORIZON[2]) * t;
      } else {
        const t = smooth(-dirY);
        r = SKY_HORIZON[0] + (SKY_GROUND[0] - SKY_HORIZON[0]) * t;
        g = SKY_HORIZON[1] + (SKY_GROUND[1] - SKY_HORIZON[1]) * t;
        b = SKY_HORIZON[2] + (SKY_GROUND[2] - SKY_HORIZON[2]) * t;
      }

      const dot = dirX * SUN_DIRECTION.x + dirY * SUN_DIRECTION.y + dirZ * SUN_DIRECTION.z;
      if (dot > 0) {
        const angle = Math.acos(Math.min(1, dot));
        const sigma = angle / SUN_DISC_SIGMA;
        const disc = Math.exp(-sigma * sigma);
        r += disc * SUN_DISC_RADIANCE;
        g += disc * SUN_DISC_RADIANCE * 0.888;
        b += disc * SUN_DISC_RADIANCE * 0.734;
      }

      const index = (y * SKY_WIDTH + x) * 4;
      data[index] = r;
      data[index + 1] = g;
      data[index + 2] = b;
      data[index + 3] = 1;
    }
  }

  const texture = new THREE.DataTexture(
    data,
    SKY_WIDTH,
    SKY_HEIGHT,
    THREE.RGBAFormat,
    THREE.FloatType,
  );
  texture.mapping = THREE.EquirectangularReflectionMapping;
  texture.colorSpace = THREE.NoColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  texture.needsUpdate = true;
  return texture;
}

export function Lighting() {
  const rooms = useHouseStore((s) => s.house.rooms);
  const objects = useHouseStore((s) => s.house.objects);
  const sunRef = useRef<THREE.DirectionalLight>(null);
  const gl = useThree((s) => s.gl);

  const sunTarget = useMemo(() => new THREE.Object3D(), []);
  const skyTexture = useMemo(() => createSkyTexture(), []);

  useLayoutEffect(() => () => skyTexture.dispose(), [skyTexture]);

  useLayoutEffect(() => {
    gl.toneMapping = THREE.ACESFilmicToneMapping;
    gl.toneMappingExposure = 1;
  }, [gl]);

  const bounds = useMemo(() => computeSceneBounds(), [rooms, objects]);
  const contact = useMemo(() => {
    const center = bounds.getCenter(new THREE.Vector3());
    const size = bounds.getSize(new THREE.Vector3());
    return { x: center.x, z: center.z, w: Math.max(size.x, 4), d: Math.max(size.z, 4) };
  }, [bounds]);

  // ContactShadows recreates its render targets whenever its `scale` prop
  // changes identity, and Lighting re-renders on every object edit. Keep a
  // stable, metre-quantised tuple so resource recreation only happens when the
  // scene bounds genuinely cross a metre boundary.
  const contactScale = useRef<[number, number]>([4, 4]);
  const scaleW = Math.ceil(contact.w);
  const scaleD = Math.ceil(contact.d);
  if (contactScale.current[0] !== scaleW || contactScale.current[1] !== scaleD) {
    contactScale.current = [scaleW, scaleD];
  }

  useLayoutEffect(() => {
    const sun = sunRef.current;
    if (!sun) return;

    const center = bounds.getCenter(new THREE.Vector3());
    const radius = Math.max(
      bounds.getBoundingSphere(new THREE.Sphere()).radius,
      3,
    );
    const extent = radius + SHADOW_PADDING;
    const distance = extent + radius + SUN_DISTANCE_PADDING;

    sun.position.copy(center).addScaledVector(SUN_DIRECTION, distance);
    sunTarget.position.copy(center);
    sunTarget.updateMatrixWorld();

    const camera = sun.shadow.camera;
    camera.left = -extent;
    camera.right = extent;
    camera.top = extent;
    camera.bottom = -extent;
    camera.near = Math.max(0.5, distance - radius - 5);
    camera.far = distance + radius + 5;
    camera.updateProjectionMatrix();

    if (
      sun.shadow.map &&
      (sun.shadow.mapSize.x !== SHADOW_MAP_SIZE ||
        sun.shadow.mapSize.y !== SHADOW_MAP_SIZE)
    ) {
      sun.shadow.map.dispose();
      sun.shadow.map = null;
    }
    sun.shadow.mapSize.set(SHADOW_MAP_SIZE, SHADOW_MAP_SIZE);
    sun.shadow.bias = SHADOW_BIAS;
    sun.shadow.normalBias = SHADOW_NORMAL_BIAS;
    sun.shadow.radius = SHADOW_RADIUS;
    sun.shadow.needsUpdate = true;
  }, [bounds, sunTarget]);

  return (
    <group>
      <Environment map={skyTexture} />
      <ContactShadows
        position={[contact.x, 0.035, contact.z]}
        scale={contactScale.current}
        resolution={512}
        blur={2.5}
        far={0.6}
        opacity={0.45}
      />
      <primitive object={sunTarget} />
      <directionalLight
        ref={sunRef}
        color={SUN_COLOR}
        intensity={SUN_INTENSITY}
        position={[
          SUN_DIRECTION.x * 30,
          SUN_DIRECTION.y * 30,
          SUN_DIRECTION.z * 30,
        ]}
        target={sunTarget}
        castShadow
      />
    </group>
  );
}
