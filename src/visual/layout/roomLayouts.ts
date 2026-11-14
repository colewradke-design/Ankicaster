/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room layouts (Addendum 5.3 / 13.3 `roomLayouts`): where furniture sits inside a room.
 * Anchors are art-px offsets from the room's left edge on a floor (0 = bottom floor of the room).
 * Required furniture gets fixed anchors spaced along the bottom floor; optional / bed slots fill
 * the free floor, wall and ceiling anchors left to right. Pure functions of the room's content
 * definition and its placed furniture; nothing here touches game state.
 */
import { PlacedRoom, PlacedFurniture } from '../../types/ankicaster';
import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../../data/content';
import { CELL_W, CELL_H } from './gridToWorld';
import { getFurnitureArt, FurnitureAnchor } from '../rooms/furnitureArt';
import { fillsRole, requiredSlots, requiredSlotStatus } from '../../utils/requiredFurniture';

// One shared notion of 'filled' (engine, room window and this layout agree)
export { fillsRole };

export interface LayoutAnchor {
  x: number; // art px from the room's left edge (centre of the sprite)
  floor: number; // 0 = bottom floor of the room
  kind: FurnitureAnchor;
  role?: string; // required role this anchor is reserved for
}

export interface RoomLayout {
  required: LayoutAnchor[];
  floor: LayoutAnchor[];
  wall: LayoutAnchor[];
  ceiling: LayoutAnchor[];
  /** Floors with a walkable mezzanine slab inside a multi-floor room. */
  mezzanine: boolean;
}

const MEZZANINE = new Set(['wizard_study', 'menagerie']);
/** Rooms whose dressing fills the floor (stairs, pier): furniture is hidden behind the dressing. */
export const NO_FURNITURE_ROOMS = new Set(['spiral_stair', 'support_pillar']);

const cache = new Map<string, RoomLayout>();

/**
 * Required anchor x (art px, in required-slot order) where the even spread would put a piece on top
 * of the room's own landmark (5.5 audit). Only used at the room's default size.
 * - Faculty Quarters: one bed per nook, the desk beside the left bed, the hearth keeps the centre gap.
 * - Sunlit Sanctum: the Sun Window is the oculus over the centre; cushions sit outside the light cone.
 */
const REQUIRED_X: Record<string, number[]> = {
  faculty_quarters: [24, 104, 47],
  sunlit_sanctum: [64, 24, 104]
};

/** Floor spans (art px) that optional floor pieces never take: a landmark or a light already lives there. */
const FLOOR_KEEP_CLEAR: Record<string, Array<[number, number]>> = {
  faculty_quarters: [[56, 72]], // shared hearth
  sunlit_sanctum: [[44, 84]], // sun cone
  woodlot: [[24, 40]], // stump
  pond: [[32, 58]], // jetty
  orchard: [[108, 128]], // ladder
  standing_stones: [[18, 30]], // tallest lit monolith
  moonwell: [[18, 46]] // well body & water
};

export function getRoomLayout(defId: string, w?: number, h?: number): RoomLayout {
  const def = ROOM_DEFINITIONS[defId];
  const cw = w ?? def?.size[0] ?? 1;
  const ch = h ?? def?.size[1] ?? 1;
  const key = `${defId}:${cw}x${ch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = cw * CELL_W;
  const defaultSize = !def || (def.size[0] === cw && def.size[1] === ch);
  const required: LayoutAnchor[] = [];
  const roles: string[] = requiredSlots(defId).map(r => r.role);
  const n = roles.length;
  const override = defaultSize ? REQUIRED_X[defId] : undefined;
  roles.forEach((role, i) => {
    const art = getFurnitureArt(role);
    // Spread across the bottom floor; wall-anchored roles sit on the wall above the same spot
    const x = override && override.length === n ? override[i] : Math.round((W * (i + 1)) / (n + 1));
    required.push({ x, floor: 0, kind: art.anchor, role });
  });
  const keepClear = defaultSize ? FLOOR_KEEP_CLEAR[defId] || [] : [];
  // A required floor piece reserves its whole width (wide beds and tables included)
  const blocked = (x: number) =>
    required.some(a => a.kind === 'floor' && Math.abs(a.x - x) < Math.max(15, getFurnitureArt(a.role!).w / 2 + 6)) ||
    keepClear.some(([x0, x1]) => x >= x0 && x <= x1);
  const floor: LayoutAnchor[] = [];
  const floors = MEZZANINE.has(defId) ? ch : 1;
  for (let f = 0; f < floors; f++) {
    for (let x = 12; x <= W - 12; x += 18) {
      if (f === 0 && blocked(x)) continue;
      floor.push({ x, floor: f, kind: 'floor' });
    }
  }
  if (floor.length === 0) {
    // A fully reserved floor still needs somewhere for an optional floor piece: use the open grid
    for (let x = 12; x <= W - 12; x += 18) {
      if (!keepClear.some(([x0, x1]) => x >= x0 && x <= x1)) floor.push({ x, floor: 0, kind: 'floor' });
    }
  }
  // Interleave so the first optional items spread out instead of bunching on the left
  floor.sort((a, b) => spreadKey(a.x, W) - spreadKey(b.x, W) || a.floor - b.floor);
  const wall: LayoutAnchor[] = [];
  for (let f = 0; f < ch; f++) {
    for (let x = 16; x <= W - 16; x += 24) {
      if (f === 0 && required.some(a => a.kind === 'wall' && Math.abs(a.x - x) < 12)) continue;
      wall.push({ x, floor: f, kind: 'wall' });
    }
  }
  wall.sort((a, b) => sideKey(a.x, W) - sideKey(b.x, W) || a.floor - b.floor);
  const ceiling: LayoutAnchor[] = [];
  for (let x = 20; x <= W - 20; x += 32) ceiling.push({ x, floor: ch - 1, kind: 'ceiling' });
  ceiling.sort((a, b) => sideKey(a.x, W) - sideKey(b.x, W));
  const layout = { required, floor, wall, ceiling, mezzanine: MEZZANINE.has(defId) && ch > 1 };
  cache.set(key, layout);
  return layout;
}

/** Wall / ceiling anchors fill from the sides inward so items stay clear of the centred room label. */
function sideKey(x: number, W: number): number {
  const d = Math.abs(x - W / 2);
  return -Math.round(d) * 10 + (x < W / 2 ? 0 : 1);
}

function spreadKey(x: number, W: number): number {
  // bit-reversal-ish ordering: centre-ish first, then the gaps
  const t = x / W;
  const order = [0.5, 0.25, 0.75, 0.125, 0.375, 0.625, 0.875];
  let best = 99;
  order.forEach((o, i) => { if (Math.abs(o - t) < 0.07 && i < best) best = i; });
  return best * 1000 + x;
}

export interface PlacedFurnitureView {
  furniture: PlacedFurniture;
  x: number; // art px from room left
  floor: number;
  kind: FurnitureAnchor;
  wallY?: number;
  tableId?: number;
  markIndex?: number;
}

export interface RoomFurnitureView {
  items: PlacedFurnitureView[];
  /** Required roles with nothing installed: drawn as ghost outlines with a "+" (Unfinished). */
  missing: LayoutAnchor[];
}

/** Legacy grid layout generator (used for one-time save migration and un-migrated test fixtures). */
export function legacyLayoutRoomFurniture(room: PlacedRoom): RoomFurnitureView {
  const layout = getRoomLayout(room.defId, room.w, room.h);
  const items: PlacedFurnitureView[] = [];
  const missing: LayoutAnchor[] = [];
  const used = new Set<number>();
  if (NO_FURNITURE_ROOMS.has(room.defId)) return { items, missing };
  // 1. Required anchors
  const status = requiredSlotStatus(room);
  layout.required.forEach((anchor, k) => {
    const idx = status[k]?.furnitureIndex ?? -1;
    if (idx >= 0) {
      used.add(idx);
      const art = getFurnitureArt(room.furniture[idx].defId);
      items.push({ furniture: room.furniture[idx], x: anchor.x, floor: 0, kind: art.anchor });
    } else {
      missing.push(anchor);
    }
  });
  // 2. Everything else, by the sprite's own anchor kind
  const next: Record<FurnitureAnchor, number> = { floor: 0, wall: 0, ceiling: 0 };
  const lists: Record<FurnitureAnchor, LayoutAnchor[]> = { floor: layout.floor, wall: layout.wall, ceiling: layout.ceiling };
  room.furniture.forEach((f, i) => {
    if (used.has(i)) return;
    const art = getFurnitureArt(f.defId);
    let kind: FurnitureAnchor = art.anchor;
    if (next[kind] >= lists[kind].length) kind = 'floor';
    const list = lists[kind];
    if (list.length === 0) return;
    const k = next[kind]++;
    const a = list[k % list.length];
    // Overflow beyond the anchor list stacks with a small offset (rare: more items than anchors)
    const lap = Math.floor(k / list.length);
    items.push({ furniture: f, x: a.x + lap * 5, floor: a.floor, kind });
  });
  return { items, missing };
}

const MARK_X_OFFSETS = [-10, 0, 10] as const;

/**
 * Resolve each placed piece in the room. Pieces with saved manual coordinates use their exact
 * saved (x, floor, plane, wallY, tableId, markIndex); un-migrated legacy pieces fall back to the
 * legacy grid layout so old saves/fixtures don't jump.
 */
export function layoutRoomFurniture(room: PlacedRoom): RoomFurnitureView {
  if (NO_FURNITURE_ROOMS.has(room.defId)) return { items: [], missing: [] };
  const legacy = room.furniture.some(f => typeof f.x !== 'number') ? legacyLayoutRoomFurniture(room) : null;
  const legacyById = legacy ? new Map(legacy.items.map(v => [v.furniture.id, v])) : null;
  const layout = getRoomLayout(room.defId, room.w, room.h);
  const status = requiredSlotStatus(room);
  const missing: LayoutAnchor[] = legacy
    ? legacy.missing
    : layout.required.filter((_, k) => (status[k]?.furnitureIndex ?? -1) < 0);

  const items: PlacedFurnitureView[] = [];
  const tablePosById = new Map<number, { x: number; floor: number }>();

  // First resolve all non-snapped items (including long_table)
  for (const f of room.furniture) {
    const art = getFurnitureArt(f.defId);
    const hit = legacyById?.get(f.id);
    const x = typeof f.x === 'number' && Number.isFinite(f.x) ? f.x : hit?.x ?? Math.round((room.w * CELL_W) / 2);
    const floor = typeof f.floor === 'number' && Number.isFinite(f.floor) ? f.floor : hit?.floor ?? 0;
    const kind = f.plane ?? hit?.kind ?? art.anchor;
    if (f.defId === 'long_table') {
      tablePosById.set(f.id, { x, floor });
    }
    items.push({
      furniture: f,
      x,
      floor,
      kind,
      wallY: kind === 'wall' ? f.wallY : undefined,
      tableId: f.tableId,
      markIndex: f.markIndex
    });
  }

  // Sync any snapped wooden_chair items directly onto their table's seat mark
  for (const it of items) {
    if (
      it.furniture.defId === 'wooden_chair' &&
      typeof it.tableId === 'number' &&
      typeof it.markIndex === 'number'
    ) {
      const tbl = tablePosById.get(it.tableId);
      if (tbl) {
        const col = ((it.markIndex % 3) + 3) % 3;
        it.x = tbl.x + MARK_X_OFFSETS[col];
        it.floor = tbl.floor;
      }
    }
  }

  return { items, missing };
}

/** Floor-line y (world) for floor index f of a room whose bottom floor line is floorLineY. */
export function floorLineFor(floorLineY: number, f: number): number {
  return floorLineY - f * CELL_H;
}
