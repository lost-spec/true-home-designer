import { useCallback, useEffect, useMemo, useRef } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";
import { useHouseStore } from "../store/houseStore";
import { useEditorStore, type Selection } from "../store/editorStore";
import { assetRegistry } from "../assets/registry";
import type { Opening } from "../types/house";
import {
  CLICK_DRIFT_PX,
  normalizeAngle,
  resolveObjectMove,
  snapObjectPosition,
} from "../interaction/objectInteraction";
import {
  createWallDragAnchor,
  findRoomEdgeForWall,
  resolveWallDrag,
  type WallDragAnchor,
} from "../interaction/wallInteraction";
import { resolveOpeningOffset } from "../interaction/openingInteraction";
import { beginHistoryBatch, endHistoryBatch } from "../store/history";
import {
  doorPlanGeometry,
  objectPlanRect,
  openingPlanQuad,
  planViewBox,
  planToWorld,
  roomPlanRect,
  wallPlanSegments,
  type PlanPoint,
} from "../geometry/planGeometry";

const VIEW_PADDING = 4;

interface PlanDrag {
  kind: "wall" | "opening" | "object";
  id: string;
  moved: boolean;
  anchor?: WallDragAnchor;
  grabOffset?: { x: number; z: number };
}

type PlanEntity = Exclude<Selection, null>;

function entityFromTarget(target: EventTarget | null): PlanEntity | null {
  if (!(target instanceof Element)) return null;
  const element = target.closest("[data-entity]");
  if (!element) return null;
  const id = element.getAttribute("data-id");
  if (!id) return null;
  switch (element.getAttribute("data-entity")) {
    case "wall":
      return { kind: "wall", id };
    case "room":
      return { kind: "room", id };
    case "opening":
      return { kind: "opening", id };
    case "object":
      return { kind: "object", id };
    default:
      return null;
  }
}

function clientToPlan(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
): PlanPoint | null {
  const ctm = svg.getScreenCTM();
  if (!ctm) return null;
  const point = new DOMPoint(clientX, clientY).matrixTransform(ctm.inverse());
  if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
  return { x: point.x, y: point.y };
}

function toPolygon(points: PlanPoint[]): string {
  return points.map((point) => `${point.x},${point.y}`).join(" ");
}

function isSelected(selection: Selection, kind: PlanEntity["kind"], id: string): boolean {
  return selection?.kind === kind && selection.id === id;
}

/**
 * The 2D floor plan: a standalone SVG renderer over the same house state the
 * 3D scene uses, with its own central pointer controller. Entities carry
 * data-entity/data-id attributes and a single set of handlers on the svg root
 * resolves drags, selections and placements through the shared pure
 * interaction helpers — so an edit here is an ordinary store write that the 3D
 * view already reacts to, and vice versa.
 */
export function FloorPlan2D() {
  const house = useHouseStore((s) => s.house);
  const selection = useEditorStore((s) => s.selection);
  const placing = useEditorStore(
    (s) => s.tool === "placeObject" && s.placingAssetId !== null,
  );
  const placingAssetId = useEditorStore((s) => s.placingAssetId);
  const placingRotationY = useEditorStore((s) => s.placingRotationY);
  const ghostPosition = useEditorStore((s) => s.ghostPosition);
  const dragging = useEditorStore(
    (s) =>
      s.draggingWallId !== null ||
      s.draggingOpeningId !== null ||
      s.draggingObjectId !== null,
  );

  const svgRef = useRef<SVGSVGElement>(null);
  const dragRef = useRef<PlanDrag | null>(null);
  const downPointRef = useRef<{ x: number; y: number } | null>(null);
  const suppressClickRef = useRef(false);

  const rooms = useMemo(() => Object.values(house.rooms), [house.rooms]);
  const walls = useMemo(() => Object.values(house.walls), [house.walls]);
  const openings = useMemo(
    () => Object.values(house.openings),
    [house.openings],
  );
  const objects = useMemo(() => Object.values(house.objects), [house.objects]);
  const openingsByWall = useMemo(() => {
    const map = new Map<string, Opening[]>();
    for (const opening of openings) {
      const list = map.get(opening.wallId);
      if (list) list.push(opening);
      else map.set(opening.wallId, [opening]);
    }
    return map;
  }, [openings]);
  const viewBox = useMemo(() => planViewBox(rooms, VIEW_PADDING), [rooms]);
  const viewBoxString = `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`;

  const ghost =
    placing && placingAssetId && ghostPosition
      ? objectPlanRect(
          {
            position: { x: ghostPosition.x, y: 0, z: ghostPosition.z },
            rotationY: placingRotationY,
            scale: 1,
          },
          assetRegistry.get(placingAssetId),
        )
      : null;

  const finishDrag = useCallback((suppressClick: boolean) => {
    const drag = dragRef.current;
    if (!drag) return;
    dragRef.current = null;
    // Pair with the beginHistoryBatch() that opened with this drag: every
    // exit path (pointerup, cancel, blur, unmount, mid-move abort) lands here,
    // so one drag always collapses into exactly one history entry.
    endHistoryBatch();
    if (suppressClick) suppressClickRef.current = true;
    const editor = useEditorStore.getState();
    if (drag.kind === "wall") editor.setDraggingWallId(null);
    else if (drag.kind === "opening") editor.setDraggingOpeningId(null);
    else editor.setDraggingObjectId(null);
  }, []);

  const handlePointerDown = (event: ReactPointerEvent<SVGSVGElement>) => {
    if (event.button !== 0) return;
    suppressClickRef.current = false;
    downPointRef.current = { x: event.clientX, y: event.clientY };

    const editor = useEditorStore.getState();
    if (editor.tool === "placeObject" && editor.placingAssetId) return;
    if (editor.tool !== "select") return;
    if (editor.draggingWallId || editor.draggingOpeningId || editor.draggingObjectId) {
      return;
    }

    const entity = entityFromTarget(event.target);
    if (!entity) return;

    const svg = svgRef.current;
    if (!svg) return;
    const plan = clientToPlan(svg, event.clientX, event.clientY);
    if (!plan) return;
    const world = planToWorld(plan.x, plan.y);
    const current = useHouseStore.getState().house;

    if (entity.kind === "room") {
      editor.select({ kind: "room", id: entity.id });
      return;
    }

    if (entity.kind === "wall") {
      editor.select({ kind: "wall", id: entity.id });
      const target = findRoomEdgeForWall(current, entity.id);
      const room = target ? current.rooms[target.roomId] : undefined;
      if (!target || !room) return;
      dragRef.current = {
        kind: "wall",
        id: entity.id,
        moved: false,
        anchor: createWallDragAnchor(target, room, world),
      };
      beginHistoryBatch();
      editor.setDraggingWallId(entity.id);
      return;
    }

    if (entity.kind === "opening") {
      if (!current.openings[entity.id]) return;
      editor.select({ kind: "opening", id: entity.id });
      dragRef.current = { kind: "opening", id: entity.id, moved: false };
      beginHistoryBatch();
      editor.setDraggingOpeningId(entity.id);
      return;
    }

    const object = current.objects[entity.id];
    if (!object) return;
    editor.select({ kind: "object", id: entity.id });
    dragRef.current = {
      kind: "object",
      id: entity.id,
      moved: false,
      grabOffset: {
        x: world.x - object.position.x,
        z: world.z - object.position.z,
      },
    };
    beginHistoryBatch();
    editor.setDraggingObjectId(entity.id);
  };

  const handlePointerMove = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (!svg) return;
    const editor = useEditorStore.getState();
    const drag = dragRef.current;

    if (!drag) {
      if (editor.tool === "placeObject" && editor.placingAssetId) {
        const plan = clientToPlan(svg, event.clientX, event.clientY);
        if (!plan) return;
        const world = planToWorld(plan.x, plan.y);
        editor.setGhostPosition(
          snapObjectPosition(world.x, world.z, editor.snapSize),
        );
      }
      return;
    }

    if (!drag.moved && downPointRef.current) {
      const drift = Math.hypot(
        event.clientX - downPointRef.current.x,
        event.clientY - downPointRef.current.y,
      );
      if (drift > CLICK_DRIFT_PX) {
        drag.moved = true;
        svg.setPointerCapture(event.pointerId);
      }
    }
    if (!drag.moved) return;

    const plan = clientToPlan(svg, event.clientX, event.clientY);
    if (!plan) return;
    const world = planToWorld(plan.x, plan.y);
    const current = useHouseStore.getState().house;

    if (drag.kind === "wall" && drag.anchor) {
      const position = resolveWallDrag(drag.anchor, world, editor.snapSize);
      useHouseStore
        .getState()
        .moveRoomEdge(drag.anchor.roomId, drag.anchor.edge, position);
      return;
    }

    if (drag.kind === "opening") {
      const opening = current.openings[drag.id];
      const wall = opening ? current.walls[opening.wallId] : undefined;
      if (!opening || !wall) {
        finishDrag(true);
        return;
      }
      const others = Object.values(current.openings).filter(
        (other) => other.wallId === opening.wallId && other.id !== drag.id,
      );
      const offset = resolveOpeningOffset(
        wall,
        opening,
        world,
        editor.snapSize,
        others,
      );
      useHouseStore.getState().updateOpening(drag.id, { offset });
      return;
    }

    const object = current.objects[drag.id];
    if (!object || !drag.grabOffset) {
      finishDrag(true);
      return;
    }
    const position = resolveObjectMove(world, drag.grabOffset, editor.snapSize);
    useHouseStore.getState().updatePlacedObject(drag.id, {
      position: { x: position.x, y: object.position.y, z: position.z },
    });
  };

  const handlePointerUp = (event: ReactPointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current;
    if (svg && svg.hasPointerCapture(event.pointerId)) {
      svg.releasePointerCapture(event.pointerId);
    }
    const drag = dragRef.current;
    if (drag) finishDrag(drag.moved);
  };

  const handleClick = (event: ReactMouseEvent<SVGSVGElement>) => {
    if (suppressClickRef.current) {
      suppressClickRef.current = false;
      return;
    }
    const svg = svgRef.current;
    if (!svg) return;
    const editor = useEditorStore.getState();

    if (editor.tool === "placeObject" && editor.placingAssetId) {
      const down = downPointRef.current;
      const drift = down
        ? Math.hypot(event.clientX - down.x, event.clientY - down.y)
        : 0;
      if (drift > CLICK_DRIFT_PX) return;

      const plan = clientToPlan(svg, event.clientX, event.clientY);
      if (!plan) return;
      const world = planToWorld(plan.x, plan.y);
      const assetId = editor.placingAssetId;
      const asset = assetRegistry.get(assetId);
      const position = snapObjectPosition(world.x, world.z, editor.snapSize);
      const rotationY = asset?.allowRotation
        ? normalizeAngle(editor.placingRotationY)
        : 0;
      const id = useHouseStore
        .getState()
        .createPlacedObject(assetId, position, rotationY);
      editor.setGhostPosition(position);
      editor.select({ kind: "object", id });
      return;
    }

    if (editor.tool !== "select") return;

    const entity = entityFromTarget(event.target);
    if (entity) editor.select(entity);
    else editor.select(null);
  };

  useEffect(() => {
    const cancel = () => finishDrag(true);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("blur", cancel);
      finishDrag(false);
    };
  }, [finishDrag]);

  const className = [
    "plan2d",
    dragging ? "dragging" : "",
    placing ? "placing" : "",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <svg
      ref={svgRef}
      className={className}
      viewBox={viewBoxString}
      preserveAspectRatio="xMidYMid meet"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onClick={handleClick}
    >
      {rooms.map((room) => {
        const rect = roomPlanRect(room);
        return (
          <rect
            key={room.id}
            data-entity="room"
            data-id={room.id}
            className={`plan-room${isSelected(selection, "room", room.id) ? " selected" : ""}`}
            x={rect.x}
            y={rect.y}
            width={rect.width}
            height={rect.height}
          />
        );
      })}

      {walls.map((wall) => {
        const segments = wallPlanSegments(wall, openingsByWall.get(wall.id) ?? []);
        const selected = isSelected(selection, "wall", wall.id);
        return segments.map((segment, index) => (
          <line
            key={`${wall.id}:${index}`}
            data-entity="wall"
            data-id={wall.id}
            className={`plan-wall${selected ? " selected" : ""}`}
            x1={segment.x1}
            y1={segment.y1}
            x2={segment.x2}
            y2={segment.y2}
            strokeWidth={wall.thickness}
          />
        ));
      })}

      {openings.map((opening) => {
        const wall = house.walls[opening.wallId];
        if (!wall) return null;
        const quad = openingPlanQuad(wall, opening);
        if (quad.length === 0) return null;
        const selected = isSelected(selection, "opening", opening.id);
        const door =
          opening.kind === "door" ? doorPlanGeometry(wall, opening) : null;
        const arcRadius = door
          ? Math.hypot(
              door.jamb.x - door.hinge.x,
              door.jamb.y - door.hinge.y,
            )
          : 0;
        return (
          <g key={opening.id} data-entity="opening" data-id={opening.id}>
            <polygon
              className={`plan-opening${selected ? " selected" : ""}`}
              points={toPolygon(quad)}
            />
            {opening.kind === "window" ? (
              <polygon className="plan-window" points={toPolygon(quad)} />
            ) : door ? (
              <>
                <line
                  className="plan-door-leaf"
                  x1={door.hinge.x}
                  y1={door.hinge.y}
                  x2={door.tip.x}
                  y2={door.tip.y}
                />
                <path
                  className="plan-door-arc"
                  d={`M ${door.jamb.x} ${door.jamb.y} A ${arcRadius} ${arcRadius} 0 0 ${door.sweep} ${door.tip.x} ${door.tip.y}`}
                />
              </>
            ) : null}
          </g>
        );
      })}

      {objects.map((object) => {
        const footprint = objectPlanRect(
          object,
          assetRegistry.get(object.assetId),
        );
        const selected = isSelected(selection, "object", object.id);
        return (
          <g
            key={object.id}
            data-entity="object"
            data-id={object.id}
            transform={`rotate(${footprint.rotationDeg} ${footprint.cx} ${footprint.cy})`}
          >
            <rect
              className={`plan-object${selected ? " selected" : ""}`}
              x={footprint.cx - footprint.width / 2}
              y={footprint.cy - footprint.height / 2}
              width={footprint.width}
              height={footprint.height}
              rx={0.07}
            />
          </g>
        );
      })}

      {ghost ? (
        <rect
          className="plan-ghost"
          x={ghost.cx - ghost.width / 2}
          y={ghost.cy - ghost.height / 2}
          width={ghost.width}
          height={ghost.height}
          rx={0.07}
          transform={`rotate(${ghost.rotationDeg} ${ghost.cx} ${ghost.cy})`}
        />
      ) : null}

      {rooms.map((room) => {
        const rect = roomPlanRect(room);
        return (
          <text
            key={`label-${room.id}`}
            className="plan-label"
            x={rect.x + rect.width / 2}
            y={rect.y + rect.height / 2}
            fontSize={0.34}
          >
            {room.name}
          </text>
        );
      })}
    </svg>
  );
}
