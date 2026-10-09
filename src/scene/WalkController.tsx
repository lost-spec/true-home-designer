import { useEffect, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useEditorStore } from "../store/editorStore";

const EYE_HEIGHT = 1.62;
const WALK_SPEED = 3.4;
const RUN_SPEED = 6.8;
const VERTICAL_SPEED = 2.8;
const ACCEL_LAMBDA = 9;
const LOOK_SENSITIVITY = 0.0022;
const PITCH_LIMIT = Math.PI / 2 - 0.05;
const MIN_Y = 0.35;
const MAX_Y = 60;

interface OrbitLikeControls {
  enabled: boolean;
  target: THREE.Vector3;
  update?: () => void;
}

/**
 * First-person navigation. While active it owns the camera: WASD/arrows move,
 * the mouse looks, Shift runs and Q/E (or Space) change altitude. OrbitControls
 * is disabled from Scene so the two never fight over the camera.
 */
export function WalkController() {
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const controls = useThree((s) => s.controls) as unknown as
    | OrbitLikeControls
    | null;
  const active = useEditorStore((s) => s.navigationMode === "walk");

  const keys = useRef<Record<string, boolean>>({});
  const yaw = useRef(0);
  const pitch = useRef(0);
  const velocity = useRef(new THREE.Vector3());
  const locked = useRef(false);

  useEffect(() => {
    if (!active) return;
    const dom = gl.domElement;

    // Seed the look direction from wherever the orbit camera was pointing,
    // then stand the walker up: ground-level eye height, looking straight ahead.
    const direction = new THREE.Vector3();
    camera.getWorldDirection(direction);
    yaw.current = Math.atan2(-direction.x, -direction.z);
    pitch.current = 0;
    camera.position.y = EYE_HEIGHT;
    velocity.current.set(0, 0, 0);

    if (controls) controls.enabled = false;
    locked.current = document.pointerLockElement === dom;

    const requestLock = () => {
      try {
        const result = dom.requestPointerLock?.() as unknown as
          | Promise<void>
          | undefined;
        if (result && typeof result.catch === "function") result.catch(() => {});
      } catch {
        // Pointer lock is best-effort; movement still works without it.
      }
    };
    const onLockChange = () => {
      locked.current = document.pointerLockElement === dom;
    };
    const onMouseMove = (event: MouseEvent) => {
      if (!locked.current) return;
      yaw.current -= event.movementX * LOOK_SENSITIVITY;
      pitch.current = THREE.MathUtils.clamp(
        pitch.current - event.movementY * LOOK_SENSITIVITY,
        -PITCH_LIMIT,
        PITCH_LIMIT,
      );
    };
    const onKeyDown = (event: KeyboardEvent) => {
      keys.current[event.code] = true;
    };
    const onKeyUp = (event: KeyboardEvent) => {
      keys.current[event.code] = false;
    };
    const clearKeys = () => {
      keys.current = {};
    };

    dom.addEventListener("click", requestLock);
    document.addEventListener("pointerlockchange", onLockChange);
    document.addEventListener("mousemove", onMouseMove);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", clearKeys);

    return () => {
      dom.removeEventListener("click", requestLock);
      document.removeEventListener("pointerlockchange", onLockChange);
      document.removeEventListener("mousemove", onMouseMove);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", clearKeys);
      keys.current = {};
      locked.current = false;
      if (document.pointerLockElement === dom) document.exitPointerLock?.();

      // Hand the camera back to orbit, aimed where the walker was looking.
      if (controls) {
        const forward = new THREE.Vector3();
        camera.getWorldDirection(forward);
        controls.target.copy(camera.position).addScaledVector(forward, 5);
        controls.enabled = true;
        controls.update?.();
      }
    };
  }, [active, camera, gl, controls]);

  useFrame((_, delta) => {
    if (!active) return;
    const dt = Math.min(delta, 0.05);
    const k = keys.current;

    const forwardInput =
      (k["KeyW"] || k["ArrowUp"] ? 1 : 0) - (k["KeyS"] || k["ArrowDown"] ? 1 : 0);
    const strafeInput =
      (k["KeyD"] || k["ArrowRight"] ? 1 : 0) -
      (k["KeyA"] || k["ArrowLeft"] ? 1 : 0);
    const liftInput = (k["KeyE"] || k["Space"] ? 1 : 0) - (k["KeyQ"] ? 1 : 0);

    const speed = k["ShiftLeft"] || k["ShiftRight"] ? RUN_SPEED : WALK_SPEED;

    const sin = Math.sin(yaw.current);
    const cos = Math.cos(yaw.current);
    const desired = new THREE.Vector3(
      -sin * forwardInput + cos * strafeInput,
      liftInput * VERTICAL_SPEED,
      -cos * forwardInput - sin * strafeInput,
    );
    if (desired.x !== 0 || desired.z !== 0) {
      const planar = Math.hypot(desired.x, desired.z);
      desired.x = (desired.x / planar) * speed;
      desired.z = (desired.z / planar) * speed;
    }

    const damp = THREE.MathUtils.damp;
    velocity.current.x = damp(velocity.current.x, desired.x, ACCEL_LAMBDA, dt);
    velocity.current.y = damp(velocity.current.y, desired.y, ACCEL_LAMBDA, dt);
    velocity.current.z = damp(velocity.current.z, desired.z, ACCEL_LAMBDA, dt);

    camera.position.addScaledVector(velocity.current, dt);
    camera.position.y = THREE.MathUtils.clamp(
      camera.position.y,
      MIN_Y,
      MAX_Y,
    );

    camera.rotation.order = "YXZ";
    camera.rotation.set(pitch.current, yaw.current, 0);
  });

  return null;
}
