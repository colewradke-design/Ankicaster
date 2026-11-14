/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Manual Furniture Placement Rules & Geometry (manual-furniture.md)
 * Pure module (never imports engine.ts, never mutates state).
 * Shared 1:1 by both engine drop/move validation and canvas ghost/anchor rendering.
 */

import { FurniturePlane, PlacedFurniture, PlacedRoom } from '../../types/ankicaster';
import { ROOM_DEFINITIONS } from '../../data/content';
import { CELL_W } from './gridToWorld';
import { getFurnitureArt } from '../rooms/furnitureArt';
import { computeReachability } from '../../utils/reachability';
import { legacyLayoutRoomFurniture } from './roomLayouts';

export type FurnitureFootprintKind = 'bulk' | 'background';

export const FURNITURE_SNAP_GRID = 4;
export const WALL_BORDER_PX = 2;
export const DOOR_GAP_PX = 10;
export const WIZARD_STAIR_KEEP_OUT = 18;
export const PEN_EDGE_KEEP_OUT = 6;
export const BULK_GAP_PX = 2;
export const DEFAULT_WALL_Y = -26;
export const WALL_MIN_TOP_FROM_FLOOR = -44;
export const WALL_MAX_BOTTOM_FROM_FLOOR = -2;
export const ROOM_LABEL_BOTTOM_FROM_FLOOR = -35;
export const LONG_TABLE_MARK_OFFSETS = [-10, 0, 10] as const;

/** Castle rooms that have walkable upper floors above floor 0. */
export const MEZZANINE_ROOMS = new Set(['wizard_study', 'menagerie']);

/** Floor-anchored pieces that lie flat on the floor (Background) rather than Bulk obstacles. */
const FLAT_FLOOR_BACKGROUND_DEFS = new Set(['woven_rug']);

/** Bulk pieces a person can actually sit or lie on. */
const SEAT_DEFS = new Set([
  'wooden_chair',
  'armchair',
  'couch',
  'couch_or_hearth',
  'student_desk',
  'student_desks',
  'reading_desk',
  'writing_desk',
  'scribes_desk',
  'silent_quill',
  'meditation_cushions',
  'penitent_benches',
  'heartwood_bench',
  'simple_cot',
  'feather_bed',
  'faculty_bed',
  'canopy_bed',
  'dreamcatcher_bed',
  'mossbed',
  'bunk_bed',
  'infirmary_cot',
  'hammock',
  'bed'
]);

/** Non-seat bulk pieces with a dedicated standing spot (teachers at lectern, readers beside bookshelf). */
const STANDING_SPOT_DEFS = new Set([
  'teachers_lectern',
  'master_lectern',
  'lectern',
  'bookshelf'
]);

export function piecePlane(defId: string): FurniturePlane {
  return getFurnitureArt(defId).anchor;
}

export function pieceKind(defId: string): FurnitureFootprintKind {
  const plane = piecePlane(defId);
  if (plane === 'wall' || plane === 'ceiling') return 'background';
  return FLAT_FLOOR_BACKGROUND_DEFS.has(defId) ? 'background' : 'bulk';
}

export function isSeatDef(defId: string): boolean {
  return SEAT_DEFS.has(defId);
}

export function isStandingSpotDef(defId: string): boolean {
  return STANDING_SPOT_DEFS.has(defId);
}

export function isCreaturePenRoom(defId: string): boolean {
  return !!ROOM_DEFINITIONS[defId]?.capacity?.creatures;
}

export function snapFurnitureX(rawX: number): number {
  return Math.round(rawX / FURNITURE_SNAP_GRID) * FURNITURE_SNAP_GRID;
}

export function snapWallOffsetY(rawWallY: number): number {
  return Math.round(rawWallY / FURNITURE_SNAP_GRID) * FURNITURE_SNAP_GRID;
}

export function maxFloorForPlane(room: Pick<PlacedRoom, 'defId' | 'h'>, plane: FurniturePlane): number {
  if (plane === 'floor') {
    return MEZZANINE_ROOMS.has(room.defId) ? Math.max(0, room.h - 1) : 0;
  }
  return Math.max(0, room.h - 1);
}

export function getRoomDoors(
  room: PlacedRoom,
  allRooms: PlacedRoom[],
  reach?: Set<number>
): { hasLeftDoor: boolean; hasRightDoor: boolean } {
  if (room.area !== 'castle' || room.state !== 'built') {
    return { hasLeftDoor: false, hasRightDoor: false };
  }
  let isReachable: boolean;
  if (reach) {
    isReachable = reach.has(room.id);
  } else if (allRooms.some(r => r.defId === 'entrance_hall' && r.state === 'built')) {
    const info = computeReachability(allRooms).get(room.id);
    isReachable = !!info?.reachable;
  } else {
    isReachable = true;
  }
  if (!isReachable) return { hasLeftDoor: false, hasRightDoor: false };
  const leftNeighbour = allRooms.find(
    r => r.area === 'castle' && r.state === 'built' && r.x + r.w === room.x && r.y === room.y
  );
  const rightNeighbour = allRooms.find(
    r => r.area === 'castle' && r.state === 'built' && r.x === room.x + room.w && r.y === room.y
  );
  return {
    hasLeftDoor: !!leftNeighbour,
    hasRightDoor: !!rightNeighbour
  };
}

export interface LongTableMark {
  markIndex: number;
  row: 'back' | 'front';
  x: number;
  floor: number;
}

/** Six seat marks around a long table: 0..2 back row, 3..5 front row. */
export function longTableSeatMarks(tableX: number, tableFloor: number): LongTableMark[] {
  const marks: LongTableMark[] = [];
  for (let i = 0; i < 3; i++) {
    marks.push({ markIndex: i, row: 'back', x: tableX + LONG_TABLE_MARK_OFFSETS[i], floor: tableFloor });
  }
  for (let i = 0; i < 3; i++) {
    marks.push({ markIndex: 3 + i, row: 'front', x: tableX + LONG_TABLE_MARK_OFFSETS[i], floor: tableFloor });
  }
  return marks;
}

export interface ResolvedFurniturePosition {
  x: number;
  floor: number;
  plane: FurniturePlane;
  wallY?: number;
  tableId?: number;
  markIndex?: number;
}

/**
 * Resolve the placed position of an item in room.furniture, using saved coordinates when present
 * or the legacy deterministic grid when un-migrated (read-only).
 */
export function resolveFurniturePosition(
  room: PlacedRoom,
  item: PlacedFurniture,
  legacyCache?: Map<number, { x: number; floor: number; kind: FurniturePlane }>
): ResolvedFurniturePosition {
  const plane = item.plane ?? piecePlane(item.defId);
  if (typeof item.x === 'number' && Number.isFinite(item.x)) {
    // If this chair is snapped to a long_table in this room, keep aligned with the table's current pos
    if (item.defId === 'wooden_chair' && typeof item.tableId === 'number' && typeof item.markIndex === 'number') {
      const tbl = room.furniture.find(f => f.id === item.tableId && f.defId === 'long_table');
      if (tbl && typeof tbl.x === 'number' && Number.isFinite(tbl.x)) {
        const col = Math.max(0, Math.min(2, item.markIndex % 3));
        return {
          x: tbl.x + LONG_TABLE_MARK_OFFSETS[col],
          floor: tbl.floor ?? 0,
          plane: 'floor',
          tableId: tbl.id,
          markIndex: item.markIndex
        };
      }
    }
    return {
      x: item.x,
      floor: item.floor ?? 0,
      plane,
      wallY: plane === 'wall' ? (item.wallY ?? DEFAULT_WALL_Y) : undefined,
      tableId: item.tableId,
      markIndex: item.markIndex
    };
  }
  let cache = legacyCache;
  if (!cache) {
    cache = new Map();
    const view = legacyLayoutRoomFurniture(room);
    for (const v of view.items) {
      cache.set(v.furniture.id, { x: v.x, floor: v.floor, kind: v.kind });
    }
  }
  const hit = cache.get(item.id);
  const x = hit ? hit.x : Math.round((room.w * CELL_W) / 2);
  const floor = hit ? hit.floor : 0;
  return {
    x,
    floor,
    plane,
    wallY: plane === 'wall' ? DEFAULT_WALL_Y : undefined
  };
}

export function buildResolvedMap(room: PlacedRoom): Map<number, ResolvedFurniturePosition> {
  const legacyCache = new Map<number, { x: number; floor: number; kind: FurniturePlane }>();
  if (room.furniture.some(f => typeof f.x !== 'number')) {
    const view = legacyLayoutRoomFurniture(room);
    for (const v of view.items) {
      legacyCache.set(v.furniture.id, { x: v.x, floor: v.floor, kind: v.kind });
    }
  }
  const map = new Map<number, ResolvedFurniturePosition>();
  for (const f of room.furniture) {
    map.set(f.id, resolveFurniturePosition(room, f, legacyCache));
  }
  return map;
}

export interface RoomLabelKeepOut {
  left: number;
  right: number;
  topFromFloor: number;
  bottomFromFloor: number;
}

/** Room label banner keep-out on the top floor of built castle rooms. */
export function roomLabelKeepOutRect(room: PlacedRoom): RoomLabelKeepOut | null {
  if (room.area !== 'castle') return null;
  const W = room.w * CELL_W;
  const def = ROOM_DEFINITIONS[room.defId];
  const nameLen = (def?.name || room.defId).length;
  const halfW = Math.min(W / 2 - 4, Math.max(14, Math.round(nameLen * 2.0)));
  return {
    left: W / 2 - halfW,
    right: W / 2 + halfW,
    topFromFloor: -48,
    bottomFromFloor: ROOM_LABEL_BOTTOM_FROM_FLOOR
  };
}

export interface DropTargetInput {
  x: number;
  floor?: number;
  wallY?: number;
  plane?: FurniturePlane;
  /** Optional explicit seat mark target (for tests or keyboard/precise snap). */
  tableId?: number;
  markIndex?: number;
}

export interface DropValidationResult {
  valid: boolean;
  x: number;
  floor: number;
  plane: FurniturePlane;
  wallY?: number;
  tableId?: number;
  markIndex?: number;
  collidingIds: number[];
  error?: string;
}

interface OccupiedBox {
  id: number;
  defId: string;
  kind: FurnitureFootprintKind;
  plane: FurniturePlane;
  floor: number;
  left: number;
  right: number;
  top: number;
  bottom: number;
  tableId?: number;
  markIndex?: number;
}

function makeBoxForPiece(
  id: number,
  defId: string,
  pos: ResolvedFurniturePosition,
  isSnappedChair = false
): OccupiedBox {
  const art = getFurnitureArt(defId);
  const w = isSnappedChair ? 8 : art.w;
  const halfW = w / 2;
  const left = pos.x - halfW;
  const right = pos.x + halfW;
  let top = 0;
  let bottom = 0;
  if (pos.plane === 'wall') {
    const wy = pos.wallY ?? DEFAULT_WALL_Y;
    top = wy - art.h / 2;
    bottom = wy + art.h / 2;
  } else if (pos.plane === 'ceiling') {
    top = -45;
    bottom = -45 + art.h;
  } else {
    top = -art.h;
    bottom = 0;
  }
  return {
    id,
    defId,
    kind: pieceKind(defId),
    plane: pos.plane,
    floor: pos.floor,
    left,
    right,
    top,
    bottom,
    tableId: pos.tableId,
    markIndex: pos.markIndex
  };
}

function checkBoundsAndKeepOuts(
  room: PlacedRoom,
  allRooms: PlacedRoom[],
  defId: string,
  box: OccupiedBox,
  reach?: Set<number>
): string | undefined {
  const W = room.w * CELL_W;
  if (box.left < WALL_BORDER_PX || box.right > W - WALL_BORDER_PX) {
    return 'Outside room bounds';
  }
  if (box.plane === 'wall') {
    if (box.top < WALL_MIN_TOP_FROM_FLOOR || box.bottom > WALL_MAX_BOTTOM_FROM_FLOOR) {
      return 'Wall piece must sit below the beam and above the floor';
    }
    if (box.floor === room.h - 1) {
      const label = roomLabelKeepOutRect(room);
      if (
        label &&
        box.left < label.right &&
        box.right > label.left &&
        box.top < label.bottomFromFloor &&
        box.bottom > label.topFromFloor
      ) {
        return 'Cannot block the room name';
      }
    }
    return undefined;
  }
  if (box.plane === 'ceiling') {
    if (box.floor !== Math.max(0, room.h - 1)) {
      return 'Ceiling pieces must hang on the top floor';
    }
    return undefined;
  }

  // Floor checks (door gap on ground floor + private keep-outs)
  if (room.area === 'castle' && box.floor === 0) {
    const doors = getRoomDoors(room, allRooms, reach);
    if (doors.hasLeftDoor && box.left < DOOR_GAP_PX) {
      return 'Keep the left doorway clear';
    }
    if (doors.hasRightDoor && box.right > W - DOOR_GAP_PX) {
      return 'Keep the right doorway clear';
    }
  }
  if (room.defId === 'wizard_study' && box.left < WIZARD_STAIR_KEEP_OUT) {
    return "Keep the Wizard's Study stair column clear";
  }
  if (isCreaturePenRoom(room.defId)) {
    if (box.left < PEN_EDGE_KEEP_OUT || box.right > W - PEN_EDGE_KEEP_OUT) {
      return "Keep the pen's walkable edge clear";
    }
  }
  return undefined;
}

/**
 * Find the seat mark on an existing undamaged long_table if cursor hovers near one.
 */
export function findHoveredLongTableMark(
  room: PlacedRoom,
  resolved: Map<number, ResolvedFurniturePosition>,
  floor: number,
  rawX: number,
  rawWallY?: number,
  excludeFurnitureId?: number,
  explicit?: { tableId?: number; markIndex?: number }
): { table: PlacedFurniture; tablePos: ResolvedFurniturePosition; mark: LongTableMark; occupantId?: number } | null {
  const tables = room.furniture.filter(
    f => f.defId === 'long_table' && !f.damaged && f.id !== excludeFurnitureId
  );
  if (tables.length === 0) return null;

  if (typeof explicit?.tableId === 'number' && typeof explicit?.markIndex === 'number') {
    const tbl = tables.find(t => t.id === explicit.tableId);
    if (!tbl) return null;
    const tpos = resolved.get(tbl.id)!;
    if (tpos.floor !== floor) return null;
    const marks = longTableSeatMarks(tpos.x, tpos.floor);
    const mark = marks[explicit.markIndex];
    if (!mark) return null;
    const occ = room.furniture.find(
      f =>
        f.id !== excludeFurnitureId &&
        f.defId === 'wooden_chair' &&
        f.tableId === tbl.id &&
        f.markIndex === mark.markIndex
    );
    return { table: tbl, tablePos: tpos, mark, occupantId: occ?.id };
  }

  let bestTable: PlacedFurniture | null = null;
  let bestPos: ResolvedFurniturePosition | null = null;
  let bestDist = Infinity;
  for (const tbl of tables) {
    const tpos = resolved.get(tbl.id)!;
    if (tpos.floor !== floor) continue;
    const dist = Math.abs(rawX - tpos.x);
    if (dist <= 20 && dist < bestDist) {
      bestDist = dist;
      bestTable = tbl;
      bestPos = tpos;
    }
  }
  if (!bestTable || !bestPos) return null;

  const marks = longTableSeatMarks(bestPos.x, bestPos.floor);
  const sideYSpecified = typeof rawWallY === 'number' && Number.isFinite(rawWallY);
  const preferBack = sideYSpecified ? rawWallY! < -14 : false;

  // Closest column 0, 1, 2
  let bestCol = 1;
  let minColDist = Infinity;
  for (let c = 0; c < 3; c++) {
    const d = Math.abs(rawX - marks[c].x);
    if (d < minColDist) {
      minColDist = d;
      bestCol = c;
    }
  }

  const occupantFor = (mIdx: number) =>
    room.furniture.find(
      f =>
        f.id !== excludeFurnitureId &&
        f.defId === 'wooden_chair' &&
        f.tableId === bestTable!.id &&
        f.markIndex === mIdx
    )?.id;

  const preferredIdx = (preferBack ? 0 : 3) + bestCol;
  const alternateIdx = (preferBack ? 3 : 0) + bestCol;
  const prefOcc = occupantFor(preferredIdx);
  if (prefOcc == null) {
    return { table: bestTable, tablePos: bestPos, mark: marks[preferredIdx] };
  }
  if (!sideYSpecified) {
    const altOcc = occupantFor(alternateIdx);
    if (altOcc == null) {
      return { table: bestTable, tablePos: bestPos, mark: marks[alternateIdx] };
    }
  }
  return { table: bestTable, tablePos: bestPos, mark: marks[preferredIdx], occupantId: prefOcc };
}

/** Validate dropping or moving a piece onto (x, floor, wallY) inside a room. */
export function validateFurnitureDrop(
  room: PlacedRoom,
  allRooms: PlacedRoom[],
  defId: string,
  target: DropTargetInput,
  options: { excludeFurnitureId?: number; reach?: Set<number> } = {}
): DropValidationResult {
  const plane = piecePlane(defId);
  const requestedFloor = Number.isFinite(target.floor) ? Math.round(target.floor!) : plane === 'ceiling' ? Math.max(0, room.h - 1) : 0;

  if (target.plane && target.plane !== plane) {
    return {
      valid: false,
      x: snapFurnitureX(target.x),
      floor: requestedFloor,
      plane,
      collidingIds: [],
      error: `Must be placed on ${plane}`
    };
  }

  if (requestedFloor < 0 || requestedFloor >= room.h) {
    return {
      valid: false,
      x: snapFurnitureX(target.x),
      floor: requestedFloor,
      plane,
      collidingIds: [],
      error: 'Floor out of bounds'
    };
  }

  if (plane === 'ceiling' && requestedFloor !== Math.max(0, room.h - 1)) {
    return {
      valid: false,
      x: snapFurnitureX(target.x),
      floor: requestedFloor,
      plane,
      collidingIds: [],
      error: 'Ceiling pieces must hang on the top floor'
    };
  }

  if (plane === 'floor' && requestedFloor > maxFloorForPlane(room, 'floor')) {
    return {
      valid: false,
      x: snapFurnitureX(target.x),
      floor: requestedFloor,
      plane,
      collidingIds: [],
      error: 'No walkable floor on that level'
    };
  }

  const resolved = buildResolvedMap(room);
  const existingBoxes: OccupiedBox[] = [];
  for (const f of room.furniture) {
    if (f.id === options.excludeFurnitureId) continue;
    const fpos = resolved.get(f.id)!;
    const isSnappedChair = f.defId === 'wooden_chair' && typeof f.tableId === 'number';
    existingBoxes.push(makeBoxForPiece(f.id, f.defId, fpos, isSnappedChair));
  }

  // Chair snap to long_table marks
  if (defId === 'wooden_chair') {
    const markHit = findHoveredLongTableMark(
      room,
      resolved,
      requestedFloor,
      target.x,
      target.wallY,
      options.excludeFurnitureId,
      typeof target.tableId === 'number' && typeof target.markIndex === 'number'
        ? { tableId: target.tableId, markIndex: target.markIndex }
        : undefined
    );
    if (markHit) {
      const snappedPos: ResolvedFurniturePosition = {
        x: markHit.mark.x,
        floor: requestedFloor,
        plane: 'floor',
        tableId: markHit.table.id,
        markIndex: markHit.mark.markIndex
      };
      const box = makeBoxForPiece(-1, defId, snappedPos, true);
      if (markHit.occupantId != null) {
        return {
          valid: false,
          x: snappedPos.x,
          floor: requestedFloor,
          plane: 'floor',
          tableId: markHit.table.id,
          markIndex: markHit.mark.markIndex,
          collidingIds: [markHit.occupantId],
          error: 'Seat mark is already taken'
        };
      }
      const boundErr = checkBoundsAndKeepOuts(room, allRooms, defId, box, options.reach);
      if (boundErr) {
        return {
          valid: false,
          x: snappedPos.x,
          floor: requestedFloor,
          plane: 'floor',
          tableId: markHit.table.id,
          markIndex: markHit.mark.markIndex,
          collidingIds: [],
          error: boundErr
        };
      }
      // Collide only against unrelated bulk items (ignore our table & chairs snapped to our table)
      const collisions: number[] = [];
      for (const other of existingBoxes) {
        if (other.floor !== requestedFloor || other.kind !== 'bulk') continue;
        if (other.id === markHit.table.id) continue;
        if (other.tableId === markHit.table.id) continue;
        if (box.left < other.right + BULK_GAP_PX && box.right > other.left - BULK_GAP_PX) {
          collisions.push(other.id);
        }
      }
      if (collisions.length > 0) {
        return {
          valid: false,
          x: snappedPos.x,
          floor: requestedFloor,
          plane: 'floor',
          tableId: markHit.table.id,
          markIndex: markHit.mark.markIndex,
          collidingIds: collisions,
          error: 'Blocked by nearby furniture'
        };
      }
      return {
        valid: true,
        x: snappedPos.x,
        floor: requestedFloor,
        plane: 'floor',
        tableId: markHit.table.id,
        markIndex: markHit.mark.markIndex,
        collidingIds: []
      };
    }
  }

  const x = snapFurnitureX(target.x);
  const wallY = plane === 'wall' ? snapWallOffsetY(target.wallY ?? DEFAULT_WALL_Y) : undefined;
  const candidatePos: ResolvedFurniturePosition = { x, floor: requestedFloor, plane, wallY };
  const candidateBox = makeBoxForPiece(-1, defId, candidatePos, false);

  const boundErr = checkBoundsAndKeepOuts(room, allRooms, defId, candidateBox, options.reach);
  if (boundErr) {
    return {
      valid: false,
      x,
      floor: requestedFloor,
      plane,
      wallY,
      collidingIds: [],
      error: boundErr
    };
  }

  // Gather attached snapped chairs if moving an existing long_table
  const attachedChairIds = new Set<number>();
  let oldTablePos: ResolvedFurniturePosition | undefined;
  if (defId === 'long_table' && typeof options.excludeFurnitureId === 'number') {
    const oldTbl = room.furniture.find(f => f.id === options.excludeFurnitureId);
    if (oldTbl) {
      oldTablePos = resolveFurniturePosition(room, oldTbl);
      for (const f of room.furniture) {
        if (f.defId === 'wooden_chair' && f.tableId === options.excludeFurnitureId) {
          attachedChairIds.add(f.id);
        }
      }
    }
  }

  const collisions: number[] = [];
  for (const other of existingBoxes) {
    if (attachedChairIds.has(other.id)) continue; // Attached chairs move with the table
    if (other.floor !== requestedFloor) continue;
    if (candidateBox.kind === 'bulk') {
      if (other.kind !== 'bulk') continue;
      if (candidateBox.left < other.right + BULK_GAP_PX && candidateBox.right > other.left - BULK_GAP_PX) {
        collisions.push(other.id);
      }
    } else {
      // Background: collides only with background on the same plane
      if (other.kind !== 'background' || other.plane !== candidateBox.plane) continue;
      if (candidateBox.plane === 'wall') {
        if (
          candidateBox.left < other.right &&
          candidateBox.right > other.left &&
          candidateBox.top < other.bottom &&
          candidateBox.bottom > other.top
        ) {
          collisions.push(other.id);
        }
      } else {
        if (candidateBox.left < other.right && candidateBox.right > other.left) {
          collisions.push(other.id);
        }
      }
    }
  }

  // Also ensure any attached chairs would remain inside room / door gap / clear of other bulk
  if (attachedChairIds.size > 0 && oldTablePos) {
    for (const cid of attachedChairIds) {
      const chair = room.furniture.find(f => f.id === cid)!;
      const col = Math.max(0, Math.min(2, (chair.markIndex ?? 0) % 3));
      const newChairX = x + LONG_TABLE_MARK_OFFSETS[col];
      const cBox = makeBoxForPiece(cid, chair.defId, {
        x: newChairX,
        floor: requestedFloor,
        plane: 'floor',
        tableId: options.excludeFurnitureId,
        markIndex: chair.markIndex
      }, true);
      const chairBoundErr = checkBoundsAndKeepOuts(room, allRooms, chair.defId, cBox, options.reach);
      if (chairBoundErr) {
        return {
          valid: false,
          x,
          floor: requestedFloor,
          plane,
          collidingIds: collisions,
          error: `Attached chair: ${chairBoundErr}`
        };
      }
      for (const other of existingBoxes) {
        if (attachedChairIds.has(other.id) || other.floor !== requestedFloor || other.kind !== 'bulk') continue;
        if (cBox.left < other.right + BULK_GAP_PX && cBox.right > other.left - BULK_GAP_PX) {
          collisions.push(other.id);
        }
      }
    }
  }

  if (collisions.length > 0) {
    return {
      valid: false,
      x,
      floor: requestedFloor,
      plane,
      wallY,
      collidingIds: [...new Set(collisions)],
      error: candidateBox.kind === 'bulk' ? 'Too close to existing furniture' : 'Overlaps item on same surface'
    };
  }

  return {
    valid: true,
    x,
    floor: requestedFloor,
    plane,
    wallY,
    collidingIds: []
  };
}

/**
 * Find a legal drop spot in a room (used for instant-built starting rooms and programmatic test calls
 * that omit manual coordinates). New interactive purchases always use canvas placement.
 */
export function findFirstValidFurnitureDrop(
  room: PlacedRoom,
  allRooms: PlacedRoom[],
  defId: string,
  reach?: Set<number>,
  excludeFurnitureId?: number
): DropValidationResult | null {
  const plane = piecePlane(defId);
  const W = room.w * CELL_W;

  // Special case: wooden_chair tries free marks on existing undamaged long_table first
  if (defId === 'wooden_chair') {
    const resolved = buildResolvedMap(room);
    const tables = room.furniture.filter(
      f => f.defId === 'long_table' && !f.damaged && f.id !== excludeFurnitureId
    );
    for (const tbl of tables) {
      const tpos = resolved.get(tbl.id)!;
      const marks = longTableSeatMarks(tpos.x, tpos.floor);
      for (const m of marks) {
        const res = validateFurnitureDrop(
          room,
          allRooms,
          defId,
          { x: m.x, floor: tpos.floor, tableId: tbl.id, markIndex: m.markIndex },
          { excludeFurnitureId, reach }
        );
        if (res.valid) return res;
      }
    }
  }

  const maxF = maxFloorForPlane(room, plane);
  const minF = plane === 'ceiling' ? maxF : 0;

  // Order candidate Xs from near center/alternating out or clean left-to-right 4px grid
  const xs: number[] = [];
  for (let x = 8; x <= W - 8; x += FURNITURE_SNAP_GRID) xs.push(x);

  const wallYs = plane === 'wall' ? [-26, -24, -28, -20, -32, -16] : [undefined];

  for (let f = minF; f <= maxF; f++) {
    for (const wy of wallYs) {
      for (const x of xs) {
        const res = validateFurnitureDrop(
          room,
          allRooms,
          defId,
          { x, floor: f, wallY: wy },
          { excludeFurnitureId, reach }
        );
        if (res.valid) return res;
      }
    }
  }
  return null;
}

/**
 * One-time migration: backfill saved (x, floor, plane, wallY) on existing built rooms
 * using the exact legacy layout so already-built rooms never jump.
 */
export function migrateRoomFurniturePositions(room: PlacedRoom): boolean {
  if (room.state !== 'built' || room.furniture.length === 0) return false;
  const needs = room.furniture.some(f => typeof f.x !== 'number');
  if (!needs) return false;
  const view = legacyLayoutRoomFurniture(room);
  const byId = new Map(view.items.map(v => [v.furniture.id, v]));
  let changed = false;
  for (const f of room.furniture) {
    if (typeof f.x === 'number') continue;
    const hit = byId.get(f.id);
    const plane = hit?.kind ?? piecePlane(f.defId);
    f.x = hit ? hit.x : Math.round((room.w * CELL_W) / 2);
    f.floor = hit ? hit.floor : 0;
    f.plane = plane;
    if (plane === 'wall' && f.wallY == null) f.wallY = DEFAULT_WALL_Y;
    changed = true;
  }
  return changed;
}
