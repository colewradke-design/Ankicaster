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

export function getRoomLayout(defId: string, w?: number, h?: number): RoomLayout {
  const def = ROOM_DEFINITIONS[defId];
  const cw = w ?? def?.size[0] ?? 1;
  const ch = h ?? def?.size[1] ?? 1;
  const key = `${defId}:${cw}x${ch}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const W = cw * CELL_W;
  const required: LayoutAnchor[] = [];
  const roles: string[] = requiredSlots(defId).map(r => r.role);
  const n = roles.length;
  roles.forEach((role, i) => {
    const art = getFurnitureArt(role);
    // Spread across the bottom floor; wall-anchored roles sit on the wall above the same spot
    required.push({ x: Math.round((W * (i + 1)) / (n + 1)), floor: 0, kind: art.anchor, role });
  });
  const floor: LayoutAnchor[] = [];
  const floors = MEZZANINE.has(defId) ? ch : 1;
  for (let f = 0; f < floors; f++) {
    for (let x = 12; x <= W - 12; x += 18) {
      if (f === 0 && required.some(a => a.kind === 'floor' && Math.abs(a.x - x) < 15)) continue;
      floor.push({ x, floor: f, kind: 'floor' });
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
}

export interface RoomFurnitureView {
  items: PlacedFurnitureView[];
  /** Required roles with nothing installed: drawn as ghost outlines with a "+" (Unfinished). */
  missing: LayoutAnchor[];
}

/** Assign each installed item to an anchor (stable: depends only on the room's furniture list). */
export function layoutRoomFurniture(room: PlacedRoom): RoomFurnitureView {
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

/** Floor-line y (world) for floor index f of a room whose bottom floor line is floorLineY. */
export function floorLineFor(floorLineY: number, f: number): number {
  return floorLineY - f * CELL_H;
}
