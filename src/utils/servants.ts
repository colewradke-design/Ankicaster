/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure servant helpers: goblin names & looks, Summoning Chamber tier/pricing,
 * workplace capacities & staffing checks, and Janitor target picking.
 * Never imports engine.ts and never mutates FullGameState.
 */

import type {
  FullGameState,
  PlacedRoom,
  SchoolType,
  ServantInstance,
  ServantLook
} from '../types/ankicaster';
import { isRoomUnfinished } from './requiredFurniture';
import { creatureCategoryBonus } from './creatures';

export const GOBLIN_NAMES: readonly string[] = [
  'Brik',
  'Snag',
  'Pebble',
  'Grit',
  'Sprocket',
  'Krag',
  'Nibs',
  'Pip',
  'Tink',
  'Muck',
  'Bram',
  'Skiff',
  'Crump',
  'Flint',
  'Dreg',
  'Clink',
  'Fizz',
  'Soot',
  'Ruck',
  'Wick'
];

const GOBLIN_SKINS = ['#769656', '#67894d', '#86a260', '#5e7e4f', '#8d9b58'];
const GOBLIN_TUNICS = ['#6b4f3a', '#4a5d6e', '#785038', '#4f6249', '#6e4959'];
const GOBLIN_APRONS = ['#b78a52', '#9b7444', '#c9a66b', '#86633c'];
const GOBLIN_EARS: ReadonlyArray<ServantLook['ears']> = ['pointed', 'long', 'floppy'];
const GOBLIN_ACCESSORIES: ReadonlyArray<ServantLook['accessory']> = ['cap', 'goggles', 'scarf', 'none'];

export function uniqueServantId(servants: Array<Pick<ServantInstance, 'id'>> = []): number {
  let maxId = 0;
  for (const s of servants) {
    if (s.id > maxId) maxId = s.id;
  }
  return maxId + 1;
}

export function pickGoblinName(
  existing: Array<string | Pick<ServantInstance, 'name'>> = [],
  seed?: number
): string {
  const used = new Set(existing.map(item => (typeof item === 'string' ? item : item.name)));
  const s = seed !== undefined ? seed : existing.length + 1;
  const start = Math.abs(s) % GOBLIN_NAMES.length;
  for (let i = 0; i < GOBLIN_NAMES.length; i++) {
    const candidate = GOBLIN_NAMES[(start + i) % GOBLIN_NAMES.length];
    if (!used.has(candidate)) return candidate;
  }
  const base = GOBLIN_NAMES[start];
  let n = 2;
  while (used.has(`${base} ${n}`)) n++;
  return `${base} ${n}`;
}

export function generateServantLook(seed: number): ServantLook {
  const s = Math.abs(Math.floor(seed)) || 1;
  return {
    seed: s,
    skin: GOBLIN_SKINS[s % GOBLIN_SKINS.length],
    ears: GOBLIN_EARS[(s >> 2) % GOBLIN_EARS.length],
    tunicColor: GOBLIN_TUNICS[(s >> 3) % GOBLIN_TUNICS.length],
    apronColor: GOBLIN_APRONS[(s >> 4) % GOBLIN_APRONS.length],
    accessory: GOBLIN_ACCESSORIES[(s >> 5) % GOBLIN_ACCESSORIES.length]
  };
}

export const SERVANT_PLOT_IDS = new Set([
  'vegetable_patch',
  'herb_garden',
  'woodlot',
  'quarry',
  'pond',
  'orchard',
  'apiary'
]);

export const SERVANT_WORKPLACE_IDS = new Set([
  'workshop',
  'vegetable_patch',
  'herb_garden',
  'woodlot',
  'quarry',
  'pond',
  'orchard',
  'apiary',
  'kitchen',
  'refectory',
  'glassworks',
  'weaving_room',
  'janitors_closet'
]);

export function isServantWorkplaceDef(defId: string): boolean {
  return SERVANT_WORKPLACE_IDS.has(defId);
}

/**
 * Maximum servants that may be assigned to a room.
 * Workshop is unlimited (returns Infinity; up to 4 active crew work sites).
 * Janitor's Closet holds 1 / 2 / 3 by room level.
 * Plots, Kitchen, Refectory, Glassworks, Weaving Room hold 1 each.
 */
export function roomServantCapacity(room: Pick<PlacedRoom, 'defId' | 'level'>): number {
  if (room.defId === 'workshop') return Infinity;
  if (room.defId === 'janitors_closet') {
    const lvl = room.level || 1;
    return lvl >= 3 ? 3 : lvl === 2 ? 2 : 1;
  }
  if (SERVANT_WORKPLACE_IDS.has(room.defId)) return 1;
  return 0;
}

export function servantsAssignedToRoom(
  servants: ServantInstance[] = [],
  roomId: number,
  excludeServantId?: number
): ServantInstance[] {
  return servants.filter(s => s.workplaceRoomId === roomId && s.id !== excludeServantId);
}

export function isRoomOperationalForServant(
  state: Pick<FullGameState, 'reviewIndex'>,
  room: PlacedRoom | undefined
): boolean {
  if (!room || room.state !== 'built') return false;
  if (isRoomUnfinished(room)) return false;
  if ((room.lockedUntilReviewIndex ?? -1) > (state.reviewIndex ?? 0)) return false;
  if (room.hazard?.locksRoom) return false;
  return true;
}

/** True when at least one servant is assigned to this built, finished, unlocked room. */
export function isRoomStaffedByServant(
  state: Pick<FullGameState, 'servants' | 'rooms' | 'reviewIndex'>,
  roomId: number
): boolean {
  const room = state.rooms.find(r => r.id === roomId);
  if (!isRoomOperationalForServant(state, room)) return false;
  return (state.servants || []).some(s => s.workplaceRoomId === roomId);
}

const ALL_SCHOOLS: SchoolType[] = ['arcane', 'nature', 'light', 'shadow', 'alchemy'];

export function schoolsAtLevel5Count(levels: Partial<Record<SchoolType, number>> = {}): number {
  let count = 0;
  for (const sch of ALL_SCHOOLS) {
    if ((levels[sch] || 0) >= 5) count++;
  }
  return count;
}

export function summoningChamberUnlocked(
  levels: Partial<Record<SchoolType, number>> = {}
): boolean {
  return schoolsAtLevel5Count(levels) >= 1;
}

export function finishedSummoningChambers(
  state: Pick<FullGameState, 'rooms' | 'reviewIndex'>
): PlacedRoom[] {
  return (state.rooms || [])
    .filter(r => r.defId === 'summoning_chamber' && isRoomOperationalForServant(state, r))
    .sort((a, b) => (b.level || 1) - (a.level || 1) || a.id - b.id);
}

export function hasFinishedSummoningChamber(
  state: Pick<FullGameState, 'rooms' | 'reviewIndex'>
): boolean {
  return finishedSummoningChambers(state).length > 0;
}

/** Minimum number of Lv 5+ schools required to renovate a Summoning Chamber to `targetLevel`. */
export function requiredSchoolsForChamberLevel(targetLevel: number): number {
  if (targetLevel >= 3) return 3;
  if (targetLevel === 2) return 2;
  return 1;
}

export interface SummonQuote {
  tier: 1 | 2 | 3;
  mana: number;
  reviews: number;
  ownedServants: number;
}

/**
 * Mana & review price for the next servant summon based on Summoning Chamber tier (1/2/3):
 * - Lv 1: 500 + 100 * ownedServants Mana, 30 reviews
 * - Lv 2: ceil((500 + 100 * ownedServants) * 0.8) Mana, 30 reviews
 * - Lv 3: ceil((500 + 100 * ownedServants) * 0.8) Mana, 20 reviews
 */
export function summonServantQuote(
  ownedServants: number,
  chamberLevel: number
): SummonQuote {
  const tier: 1 | 2 | 3 = chamberLevel >= 3 ? 3 : chamberLevel === 2 ? 2 : 1;
  const count = Math.max(0, ownedServants);
  const baseMana = 500 + 100 * count;
  const mana = tier >= 2 ? Math.ceil(baseMana * 0.8) : baseMana;
  const reviews = tier >= 3 ? 20 : 30;
  return { tier, mana, reviews, ownedServants: count };
}

export function workshopBaseRate(level: number): number {
  if (level >= 3) return 1.5;
  if (level === 2) return 1.25;
  return 1;
}

/** Creature build-rate bonus (% as fraction 0..0.5): Bellows Toad 5%/copy, Geode Golem 10%/copy. */
export function workshopCreatureBuildBonus(
  state: Pick<FullGameState, 'creatures' | 'rooms' | 'spellbooks' | 'bellIndex'>
): number {
  if (!state.creatures?.length) return 0;
  return creatureCategoryBonus(
    {
      creatures: state.creatures,
      rooms: state.rooms || [],
      spellbooks: state.spellbooks,
      bellIndex: state.bellIndex
    },
    [
      { defId: 'bellows_toad', perCopy: 0.05 },
      { defId: 'geode_golem', perCopy: 0.1 }
    ],
    0.5
  );
}

export const JANITOR_CLEAN_PER_REVIEW = 5;

/**
 * Determine which room a janitor servant should clean next, preserving an existing
 * dirty unclaimed target until it reaches 100% cleanliness.
 */
export function resolveJanitorTargetRoomId(
  state: Pick<FullGameState, 'rooms' | 'servants' | 'reviewIndex'>,
  servantId: number,
  claimedByOthers: Set<number>
): number | undefined {
  const servant = (state.servants || []).find(s => s.id === servantId);
  if (!servant || servant.workplaceRoomId == null) return undefined;
  const closet = state.rooms.find(r => r.id === servant.workplaceRoomId && r.defId === 'janitors_closet');
  if (!isRoomOperationalForServant(state, closet)) return undefined;

  if (servant.cleaningRoomId != null && !claimedByOthers.has(servant.cleaningRoomId)) {
    const cur = state.rooms.find(r => r.id === servant.cleaningRoomId && r.state === 'built');
    if (cur && cur.cleanliness < 100) {
      return cur.id;
    }
  }

  const dirty = state.rooms
    .filter(r => r.state === 'built' && r.cleanliness < 100 && !claimedByOthers.has(r.id))
    .sort((a, b) => a.cleanliness - b.cleanliness || a.id - b.id);
  return dirty[0]?.id;
}

/**
 * Compute authoritative cleaning target IDs for every active janitor, ensuring
 * two janitors never claim the same room simultaneously.
 */
export function computeJanitorAssignments(
  state: Pick<FullGameState, 'rooms' | 'servants' | 'reviewIndex'>
): Map<number, number | undefined> {
  const result = new Map<number, number | undefined>();
  const claimed = new Set<number>();
  const janitors = (state.servants || [])
    .filter(s => {
      if (s.workplaceRoomId == null) return false;
      const r = state.rooms.find(rm => rm.id === s.workplaceRoomId && rm.defId === 'janitors_closet');
      return isRoomOperationalForServant(state, r);
    })
    .sort((a, b) => a.id - b.id);

  // First pass: preserve valid sticky targets in deterministic order
  for (const j of janitors) {
    if (j.cleaningRoomId != null && !claimed.has(j.cleaningRoomId)) {
      const cur = state.rooms.find(r => r.id === j.cleaningRoomId && r.state === 'built');
      if (cur && cur.cleanliness < 100) {
        claimed.add(cur.id);
        result.set(j.id, cur.id);
      }
    }
  }

  // Second pass: assign remaining janitors to the dirtiest unclaimed built rooms
  for (const j of janitors) {
    if (result.has(j.id)) continue;
    const nextRoomId = resolveJanitorTargetRoomId(state, j.id, claimed);
    if (nextRoomId !== undefined) {
      claimed.add(nextRoomId);
    }
    result.set(j.id, nextRoomId);
  }

  return result;
}
