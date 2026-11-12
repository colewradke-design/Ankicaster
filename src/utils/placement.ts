/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room placement rules (GDD 15.2 grid, 15.3 placement rules P1-P7, 15.4 demolish).
 * Pure functions used by the engine (authoritative) and by the Build ghost (preview).
 *
 * Coordinates: castle rooms use x = column (0..cols-1) and y = floor (0 = ground), a room
 * covers columns x..x+w-1 and floors y..y+h-1. Grounds rooms use x = plot index (0..17,
 * see groundsLayout.ts) and cover plots x..x+w-1; y is always 0.
 */

import { FullGameState, PlacedRoom, RoomDefinition } from '../types/ankicaster';
import { ROOM_DEFINITIONS } from '../data/content';
import { computeReachability } from './reachability';
import { unlockedPlotIndices, adjacentPlots } from './groundsLayout';

/** GDD 15.2: the castle starts at 8 columns x 5 floors (expansion plans are not implemented yet). */
export const CASTLE_START_COLS = 8;
export const CASTLE_START_FLOORS = 5;

export interface GridSize {
  castleCols: number;
  castleFloors: number;
  plotCount: number;
}

/** GDD 15.2 grounds: 6 plots, +4 at total wizard level 3 and at 20 (Land Grant cards not implemented). */
export function getGridSize(state: Pick<FullGameState, 'wizard'>): GridSize {
  const total = Object.values(state.wizard?.levels || {}).reduce((a, b) => a + (b || 0), 0);
  const plotCount = 6 + (total >= 3 ? 4 : 0) + (total >= 20 ? 4 : 0);
  return { castleCols: CASTLE_START_COLS, castleFloors: CASTLE_START_FLOORS, plotCount };
}

export interface PlacementCheck {
  valid: boolean;
  /** Rule violations (red ghost). */
  errors: string[];
  /** Allowed but worth knowing (e.g. P4: shows Unreachable until connected). */
  warnings: string[];
}

type Footprint = { x: number; y: number; w: number; h: number; area: 'castle' | 'grounds' };

function overlaps(a: Footprint, b: Footprint): boolean {
  if (a.area !== b.area) return false;
  if (a.area === 'grounds') return a.x < b.x + b.w && b.x < a.x + a.w;
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function occupiesCastleTile(r: Footprint, col: number, floor: number): boolean {
  return r.area === 'castle' && col >= r.x && col < r.x + r.w && floor >= r.y && floor < r.y + r.h;
}

function name(defId: string): string {
  return ROOM_DEFINITIONS[defId]?.name || defId;
}

/** P3: every bottom-row tile on floor 0 or directly above an occupied tile. */
export function isSupported(room: Footprint, others: Footprint[]): boolean {
  if (room.area !== 'castle' || room.y === 0) return true;
  for (let col = room.x; col < room.x + room.w; col++) {
    if (!others.some(o => occupiesCastleTile(o, col, room.y - 1))) return false;
  }
  return true;
}

export function countRoomsOfType(rooms: PlacedRoom[], defId: string, ignoreRoomId?: number): number {
  return rooms.filter(r => r.defId === defId && r.id !== ignoreRoomId).length;
}

/** Per-room limit (content `maxCount`). Construction sites count. */
export function roomLimitStatus(rooms: PlacedRoom[], defId: string, ignoreRoomId?: number) {
  const def = ROOM_DEFINITIONS[defId];
  const max = def?.maxCount;
  const count = countRoomsOfType(rooms, defId, ignoreRoomId);
  const capped = max !== undefined && count >= max;
  return {
    count,
    max,
    capped,
    reason: capped ? (max === 1 ? `Only one ${def?.name || defId} per Academy` : `Limit reached (${count}/${max})`) : undefined
  };
}

/**
 * Validate a footprint for `def` at (x, y). `ignoreRoomId` is the room being moved (it does not
 * collide with itself or support itself).
 */
export function validatePlacement(
  state: Pick<FullGameState, 'rooms' | 'wizard'>,
  defId: string,
  area: 'castle' | 'grounds',
  x: number,
  y: number,
  ignoreRoomId?: number
): PlacementCheck {
  const errors: string[] = [];
  const warnings: string[] = [];
  const def: RoomDefinition | undefined = ROOM_DEFINITIONS[defId];
  if (!def) return { valid: false, errors: ['Unknown room.'], warnings };

  const grid = getGridSize(state);
  const [w, h] = def.size;
  const fp: Footprint = { x, y: area === 'grounds' ? 0 : y, w, h, area };
  const others = state.rooms.filter(r => r.id !== ignoreRoomId);

  // P1 bounds and area
  if (area !== def.area) {
    errors.push(def.area === 'grounds' ? `${def.name} goes on a grounds plot` : `${def.name} must be inside the castle`);
    return { valid: false, errors, warnings };
  }
  if (!Number.isInteger(x) || !Number.isInteger(fp.y)) errors.push('Not on the grid');

  if (area === 'castle') {
    if (x < 0 || x + w > grid.castleCols || fp.y < 0 || fp.y + h > grid.castleFloors) {
      errors.push('Outside the castle grid');
    }
  } else {
    const unlocked = new Set(unlockedPlotIndices(grid.plotCount));
    for (let p = x; p < x + w; p++) {
      if (!unlocked.has(p)) { errors.push('Not on an unlocked plot'); break; }
    }
    for (let p = x; p < x + w - 1; p++) {
      if (!adjacentPlots(p, p + 1)) { errors.push('Needs adjacent plots on one side of the castle'); break; }
    }
  }

  // P2 free tiles
  const hit = others.find(o => overlaps(fp, o));
  if (hit) errors.push(`Overlaps ${name(hit.defId)}`);

  if (area === 'castle') {
    // P3 support
    if (!isSupported(fp, others)) errors.push('Needs support below (a room, site or Support Pillar)');

    // P5 sky access: nothing above a needs_sky room; a needs_sky room needs open sky
    for (let col = fp.x; col < fp.x + w; col++) {
      const skyBelow = others.find(o => o.area === 'castle' && ROOM_DEFINITIONS[o.defId]?.needsSky &&
        col >= o.x && col < o.x + o.w && o.y + o.h <= fp.y);
      if (skyBelow) { errors.push(`Would block the sky over ${name(skyBelow.defId)}`); break; }
    }
    if (def.needsSky || def.floorRule === 'highest_floor') {
      const above = others.find(o => o.area === 'castle' && o.x < fp.x + w && fp.x < o.x + o.w && o.y >= fp.y + h);
      if (above) errors.push(def.needsSky ? `Needs open sky (${name(above.defId)} is above)` : 'Must be on the highest floor of its column');
    }

    // P6 floor limits (+ the Entrance Hall is the floor-0 root of reachability)
    if ((def.floorRule === 'floor_0' || defId === 'entrance_hall') && fp.y !== 0) errors.push('Ground floor only');
    if (def.floorRule === 'floors_0_1' && fp.y + h - 1 > 1) errors.push('Floors 0-1 only');
  }

  // P4 connection: allowed, but the room shows Unreachable and runs at 0% until connected
  if (errors.length === 0 && area === 'castle') {
    const probe: PlacedRoom = {
      id: -1, defId, x: fp.x, y: fp.y, w, h, area, level: 1, state: 'built',
      buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
    };
    const reach = computeReachability([...others.map(o => (o.state === 'built' ? o : { ...o, state: 'built' as const })), probe]);
    if (!reach.get(-1)?.reachable) warnings.push('Not connected yet: it will show Unreachable and run at 0% until a neighbour or stair links it (P4)');
  }

  return { valid: errors.length === 0, errors, warnings };
}

/** Rooms that are reachable now but would not be after `nextRooms` (P4 disconnection check). */
export function newlyCutOffRooms(before: PlacedRoom[], after: PlacedRoom[]): PlacedRoom[] {
  const rb = computeReachability(before);
  const ra = computeReachability(after);
  return after.filter(r => rb.get(r.id)?.reachable && !ra.get(r.id)?.reachable);
}

/** Rooms that are supported now but would lose support in `after` (P3). */
export function newlyUnsupportedRooms(before: PlacedRoom[], after: PlacedRoom[]): PlacedRoom[] {
  return after.filter(r => {
    const prev = before.find(b => b.id === r.id);
    if (!prev) return false;
    const wasOk = isSupported(prev, before.filter(b => b.id !== r.id));
    const nowOk = isSupported(r, after.filter(a => a.id !== r.id));
    return wasOk && !nowOk;
  });
}

/**
 * Auto-placement: the first valid free spot, preferring connected (reachable) spots, then
 * lower floors, then spots near the castle centre. Returns null when there is no space.
 */
export function findAutoPlacement(
  state: Pick<FullGameState, 'rooms' | 'wizard'>,
  defId: string
): { x: number; y: number; area: 'castle' | 'grounds'; warnings: string[] } | null {
  const def = ROOM_DEFINITIONS[defId];
  if (!def) return null;
  const grid = getGridSize(state);
  const area = def.area;
  const candidates: Array<{ x: number; y: number; warnings: string[]; score: number }> = [];
  if (area === 'castle') {
    const centre = grid.castleCols / 2;
    for (let y = 0; y < grid.castleFloors; y++) {
      for (let x = 0; x < grid.castleCols; x++) {
        const c = validatePlacement(state, defId, 'castle', x, y);
        if (!c.valid) continue;
        const dist = Math.abs(x + def.size[0] / 2 - centre);
        candidates.push({ x, y, warnings: c.warnings, score: (c.warnings.length ? 1000 : 0) + y * 100 + dist });
      }
    }
  } else {
    for (const p of unlockedPlotIndices(grid.plotCount)) {
      const c = validatePlacement(state, defId, 'grounds', p, 0);
      if (!c.valid) continue;
      candidates.push({ x: p, y: 0, warnings: c.warnings, score: Math.abs(p + def.size[0] / 2 - 9) });
    }
  }
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => a.score - b.score);
  return { x: candidates[0].x, y: candidates[0].y, area, warnings: candidates[0].warnings };
}

export const REFUND_MATERIALS = ['timber', 'stone', 'glass', 'cloth'] as const;

/** Every material a room cost can list. Mana is not a build cost. */
export const BUILD_MATERIALS = [
  'timber', 'stone', 'glass', 'cloth', 'insight', 'herbs', 'radiance', 'umbra',
  'reagents', 'crystal', 'heartwood', 'sunstone', 'void_pearl', 'ember_salt'
] as const;

/** What placing `defId` charges. Rooms cost materials only; mana is never charged. */
export function placementCharge(defId: string): NonNullable<PlacedRoom['spent']> {
  const c = ROOM_DEFINITIONS[defId]?.cost || { mana: 0 };
  const out: NonNullable<PlacedRoom['spent']> = {
    mana: 0,
    timber: c.timber || 0,
    stone: c.stone || 0,
    glass: c.glass || 0,
    cloth: c.cloth || 0
  };
  for (const k of BUILD_MATERIALS) {
    const n = (c as unknown as Record<string, number | undefined>)[k] || 0;
    if (n) (out as unknown as Record<string, number>)[k] = n;
  }
  return out;
}

/** Pre-built starter rooms (createNewAcademy ids 1-6) were never paid for. */
export function defaultSpent(room: PlacedRoom): NonNullable<PlacedRoom['spent']> {
  if (room.id <= 6 || (ROOM_DEFINITIONS[room.defId]?.cost.mana || 0) === 0) {
    return { mana: 0, timber: 0, stone: 0, glass: 0, cloth: 0 };
  }
  return placementCharge(room.defId);
}

/**
 * GDD 15.4 refunds. Cancel a site before any progress: 100% of what was paid.
 * Demolish anything else: 50% of the materials paid (rounded down), 0% mana.
 */
export function demolishRefund(room: PlacedRoom) {
  const spent = room.spent || defaultSpent(room);
  const cancel = room.state === 'site' && (room.buildProgress || 0) === 0;
  const out: { mana: number; timber: number; stone: number; glass: number; cloth: number; cancel: boolean } & Record<string, number | boolean> = {
    mana: 0, timber: 0, stone: 0, glass: 0, cloth: 0, cancel
  };
  for (const k of BUILD_MATERIALS) {
    const paid = (spent as unknown as Record<string, number | undefined>)[k] || 0;
    out[k] = cancel ? paid : Math.floor(paid * 0.5);
  }
  return out;
}
