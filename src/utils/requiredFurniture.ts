/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Required furniture ("fixtures"): the one shared notion of which required slots of a room are
 * filled (GDD 15.4 step 6, 15.7 overrides, 17.1). Used by the engine (efficiency, outputs,
 * install, save migration), the room window and the visual layout, so they always agree.
 *
 * - A room's required slots are its `requiredFurniture` rows expanded by `count`.
 * - An item fills a slot when it is tagged `required:<role>`, its id is the role, its
 *   definition's role is the role, or the role is "a_or_b" and the item is a or b.
 * - Items are matched to slots greedily in slot order; each item fills at most one slot.
 * - A built room with any empty required slot is Unfinished and runs at 0% (GDD 15.7).
 */

import { FURNITURE_DEFINITIONS, ROOM_DEFINITIONS } from '../data/content';
import type { FullGameState, FurnitureDefinition, PlacedFurniture, PlacedRoom } from '../types/ankicaster';

export interface RequiredSlot {
  role: string;
  name: string;
  /** Index among the room's expanded required slots. */
  index: number;
}

export interface RequiredSlotStatus extends RequiredSlot {
  /** Index into room.furniture of the item filling this slot, or -1. */
  furnitureIndex: number;
  filled: boolean;
}

/** Does a placed furniture item fill this required role? */
export function fillsRole(f: PlacedFurniture, role: string): boolean {
  if (f.slotKind === `required:${role}`) return true;
  if (f.defId === role) return true;
  const def = FURNITURE_DEFINITIONS[f.defId];
  if (def && def.role === role) return true;
  if (role.includes('_or_')) return role.split('_or_').includes(f.defId);
  return false;
}

/** The room type's required slots, expanded by count. */
export function requiredSlots(defId: string): RequiredSlot[] {
  const out: RequiredSlot[] = [];
  for (const r of ROOM_DEFINITIONS[defId]?.requiredFurniture || []) {
    for (let i = 0; i < (r.count ?? 1); i++) out.push({ role: r.role, name: r.name, index: out.length });
  }
  return out;
}

/** Filled / missing status of every required slot (greedy, in slot order). */
export function requiredSlotStatus(room: Pick<PlacedRoom, 'defId' | 'furniture'>): RequiredSlotStatus[] {
  const used = new Set<number>();
  // Items tagged for a role claim first, so a tagged fixture is never stolen by another slot
  const slots = requiredSlots(room.defId);
  const result: RequiredSlotStatus[] = slots.map(s => ({ ...s, furnitureIndex: -1, filled: false }));
  for (const pass of [0, 1]) {
    for (const s of result) {
      if (s.filled) continue;
      const idx = room.furniture.findIndex((f, i) =>
        !used.has(i) && (pass === 0 ? f.slotKind === `required:${s.role}` : fillsRole(f, s.role)));
      if (idx >= 0) { used.add(idx); s.furnitureIndex = idx; s.filled = true; }
    }
  }
  return result;
}

export function missingRequiredSlots(room: Pick<PlacedRoom, 'defId' | 'furniture'>): RequiredSlotStatus[] {
  return requiredSlotStatus(room).filter(s => !s.filled);
}

/** A built room missing any required furniture (GDD 15.4 step 6). Sites are not "Unfinished". */
export function isRoomUnfinished(room: PlacedRoom): boolean {
  return room.state === 'built' && missingRequiredSlots(room).length > 0;
}

export type Cost = Record<string, number | undefined> & { mana: number };

export interface RequiredInstallOption {
  /** defId that will be stored on the placed item. */
  defId: string;
  name: string;
  cost: Cost;
  /** No content cost exists for this role: installing is free (decision, see report). */
  free: boolean;
}

function cheaper(a: Cost, b: Cost): boolean {
  const total = (c: Cost) => Object.values(c).reduce<number>((s, v) => s + (v || 0), 0);
  return a.mana < b.mana || (a.mana === b.mana && total(a) < total(b));
}

/**
 * What installing a required slot costs, from the content catalog (GDD Section 17):
 * 1. a furniture definition with the role's own id (e.g. long_table);
 * 2. for "a_or_b" roles, the cheapest defined alternative;
 * 3. the cheapest definition whose role is this role (e.g. any bed for a "bed" slot);
 * 4. otherwise nothing is defined: the fixture is free and keeps the role as its id.
 */
export function requiredInstallOption(role: string): RequiredInstallOption {
  const own = FURNITURE_DEFINITIONS[role];
  if (own) return { defId: own.id, name: own.name, cost: { ...own.cost } as Cost, free: false };
  let best: { id: string; name: string; cost: Cost } | undefined;
  const consider = (id: string) => {
    const d = FURNITURE_DEFINITIONS[id];
    if (!d) return;
    const c = { ...d.cost } as Cost;
    if (!best || cheaper(c, best.cost)) best = { id: d.id, name: d.name, cost: c };
  };
  if (role.includes('_or_')) role.split('_or_').forEach(consider);
  if (!best) for (const d of Object.values(FURNITURE_DEFINITIONS)) if (d.role === role) consider(d.id);
  if (best) return { defId: best.id, name: best.name, cost: best.cost, free: false };
  return { defId: role, name: role.replace(/_/g, ' '), cost: { mana: 0 }, free: true };
}

/** Human cost text, e.g. "120m · 15 timber" or "Free". */
export function costText(c: Cost): string {
  const parts: string[] = [];
  if (c.mana) parts.push(`${c.mana}m`);
  for (const [k, v] of Object.entries(c)) if (k !== 'mana' && v) parts.push(`${v} ${k}`);
  return parts.length ? parts.join(' · ') : 'Free';
}

/** First unaffordable part of a cost, or undefined when the state can pay it. */
export function unaffordable(state: FullGameState, c: Cost): string | undefined {
  if ((c.mana || 0) > state.mana) return `Need ${c.mana} Mana.`;
  const res = state.resources as unknown as Record<string, number>;
  for (const [k, v] of Object.entries(c)) {
    if (k === 'mana' || !v) continue;
    if ((res[k] ?? 0) < v) return `Need ${v} ${k[0].toUpperCase()}${k.slice(1)}.`;
  }
  return undefined;
}

/** Every furniture id in the save (for unique ids). */
export function allFurnitureIds(rooms: PlacedRoom[]): Set<number> {
  const ids = new Set<number>();
  for (const r of rooms) {
    for (const f of r.furniture || []) ids.add(f.id);
    for (const u of r.unplacedFurniture || []) ids.add(u.id);
  }
  return ids;
}

/** Next free id near `preferred`, never reusing one already in the save. */
export function uniqueFurnitureId(ids: Set<number>, preferred: number): number {
  let id = preferred;
  if (ids.has(id)) {
    id = Math.max(0, ...ids) + 1;
  }
  ids.add(id);
  return id;
}

/**
 * Fill every empty required slot with the instant-build shape
 * (defId = role, slotKind `required:<role>`, unique id). Mutates `room`; idempotent.
 * Returns how many fixtures were added.
 */
export function fillRequiredFixtures(room: PlacedRoom, ids: Set<number>): number {
  if (!Array.isArray(room.furniture)) room.furniture = [];
  const missing = missingRequiredSlots(room);
  for (const s of missing) {
    room.furniture.push({
      id: uniqueFurnitureId(ids, room.id * 10 + s.index + 1),
      defId: s.role,
      slotKind: `required:${s.role}`,
      damaged: false
    });
  }
  return missing.length;
}

/** Whether a furniture definition can legally be placed in `roomDefId`. */
export function isFurnitureCompatibleWithRoom(fDef: FurnitureDefinition, roomDefId: string): boolean {
  if (fDef.rooms === 'any') return true;
  if (Array.isArray(fDef.rooms) && fDef.rooms.includes(roomDefId)) return true;
  if (fDef.role === 'bed' && roomDefId.includes('dorm')) return true;
  return false;
}

/** Number of long_table items (placed or awaiting placement) in a refectory, capped at 2. */
export function refectoryTableTotal(room: Pick<PlacedRoom, 'defId' | 'furniture' | 'unplacedFurniture'>): number {
  if (room.defId !== 'refectory') return 0;
  const count = [...(room.furniture || []), ...(room.unplacedFurniture || [])]
    .filter(f => f.defId === 'long_table' || f.slotKind === 'required:long_table')
    .length;
  return Math.min(2, count);
}

/**
 * Optional slots currently consumed (both placed and awaiting-placement).
 * In a refectory, up to 6 wooden_chair items per long_table (max 12 across 2 tables)
 * are exempt from optional slot limits.
 */
export function optionalSlotsUsed(room: Pick<PlacedRoom, 'defId' | 'furniture' | 'unplacedFurniture'>): number {
  const allOptional = [...(room.furniture || []), ...(room.unplacedFurniture || [])]
    .filter(f => !f.slotKind.startsWith('required:'));
  let freeChairsLeft = room.defId === 'refectory' ? 6 * refectoryTableTotal(room) : 0;
  let used = 0;
  for (const f of allOptional) {
    if (f.defId === 'wooden_chair' && freeChairsLeft > 0) {
      freeChairsLeft -= 1;
      continue;
    }
    used += FURNITURE_DEFINITIONS[f.defId]?.slots || 1;
  }
  return used;
}

/** Max allowed copies of `furnitureDefId` in `room`. */
export function maxSameFurnitureInRoom(
  room: Pick<PlacedRoom, 'defId' | 'furniture' | 'unplacedFurniture'>,
  furnitureDefId: string
): number {
  if (furnitureDefId === 'student_desk' || furnitureDefId === 'reading_desk') return 4;
  if (furnitureDefId === 'wooden_chair' && room.defId === 'refectory') {
    return Math.max(2, 6 * refectoryTableTotal(room));
  }
  return 2;
}

/** Effective optional slots added if buying/acquiring `furnitureDefId` in `room`. */
export function optionalSlotsCostForNewPiece(
  room: Pick<PlacedRoom, 'defId' | 'furniture' | 'unplacedFurniture'>,
  furnitureDefId: string
): number {
  if (furnitureDefId === 'wooden_chair' && room.defId === 'refectory') {
    const existingChairs = [...(room.furniture || []), ...(room.unplacedFurniture || [])]
      .filter(f => !f.slotKind.startsWith('required:') && f.defId === 'wooden_chair')
      .length;
    if (existingChairs < 6 * refectoryTableTotal(room)) return 0;
  }
  return FURNITURE_DEFINITIONS[furnitureDefId]?.slots || 1;
}

/** Map unfilled required slot index -> queued unplaced furniture id waiting to be dropped. */
export function queuedRequiredBySlot(
  room: Pick<PlacedRoom, 'defId' | 'furniture' | 'unplacedFurniture'>
): Map<number, number> {
  const unplaced = room.unplacedFurniture || [];
  const usedUnplacedIds = new Set<number>();
  const out = new Map<number, number>();
  for (const s of requiredSlotStatus(room)) {
    if (s.filled) continue;
    const hit = unplaced.find(u => !usedUnplacedIds.has(u.id) && u.slotKind === `required:${s.role}`);
    if (hit) {
      usedUnplacedIds.add(hit.id);
      out.set(s.index, hit.id);
    }
  }
  return out;
}
