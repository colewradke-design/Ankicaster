/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Pure creature helpers shared across engine, UI (Bestiary / RoomWindow), and visual layer.
 * Keeps pen capacity, occupancy resolution, discovery tracking, and origin/stage labels consistent.
 */

import { CREATURE_DEFINITIONS, ROOM_DEFINITIONS } from '../data/content';
import type {
  CreatureDefinition,
  CreatureInstance,
  CreatureOrigin,
  FullGameState,
  HabitatType,
  PlacedRoom
} from '../types/ankicaster';
import { isRoomUnfinished } from './requiredFurniture';
import { computeAlumniBonuses } from './formulas';

export const ONE_BY_ONE_PEN_CAP = 3;
export const LARGE_PEN_CAP = 5;

export const HABITAT_TO_ROOM_DEF: Record<HabitatType, string[]> = {
  meadow: ['meadow_paddock', 'menagerie'],
  tide: ['tide_tank', 'pond', 'menagerie'],
  sky: ['aviary', 'menagerie'],
  gloom: ['gloom_hutch', 'menagerie'],
  ember: ['ember_pit', 'menagerie'],
  crystal: ['crystal_vivarium', 'menagerie']
};

export const HABITAT_LABELS: Record<HabitatType, { label: string; badge: string }> = {
  meadow: { label: 'Meadow', badge: '🌿' },
  tide: { label: 'Tide', badge: '🌊' },
  sky: { label: 'Sky', badge: '🕊️' },
  gloom: { label: 'Gloom', badge: '🌙' },
  ember: { label: 'Ember', badge: '🔥' },
  crystal: { label: 'Crystal', badge: '💎' }
};

export const ORIGIN_LABELS: Record<CreatureOrigin, string> = {
  egg: 'Egg',
  sapling: 'Seedling',
  litter: 'Sleeping pup',
  cocoon: 'Cocoon',
  geode: 'Uncut geode',
  wisp: 'Faint wisp'
};

export function originLabel(origin: CreatureOrigin | undefined, defId?: string): string {
  const o = origin ?? (defId ? CREATURE_DEFINITIONS[defId]?.origin : undefined) ?? 'egg';
  if (o === 'egg' && defId) {
    const aquaticSpawn = ['puddlewyrm', 'coral_kelpie', 'mopslime', 'cinder_newt', 'bellows_toad', 'alembic_salamander'];
    if (aquaticSpawn.includes(defId)) return 'Spawn';
  }
  return ORIGIN_LABELS[o] ?? 'Egg';
}

/** 5 arrival stages across 0-20, 20-40, 40-60, 60-80, 80-100%. */
export function arrivalStage(hatchProgress: number): 0 | 1 | 2 | 3 | 4 {
  const p = Math.max(0, Math.min(100, Number.isFinite(hatchProgress) ? hatchProgress : 0));
  if (p < 20) return 0;
  if (p < 40) return 1;
  if (p < 60) return 2;
  if (p < 80) return 3;
  return 4;
}

export function arrivalStageLabel(stage: 0 | 1 | 2 | 3 | 4): string {
  switch (stage) {
    case 0: return 'Dormant';
    case 1: return 'Stirring';
    case 2: return 'Sprouting';
    case 3: return 'Emerging';
    case 4: return 'About to emerge';
  }
}

export const ALL_HABITATS: HabitatType[] = ['meadow', 'tide', 'sky', 'gloom', 'ember', 'crystal'];
export const DEFAULT_MENAGERIE_MODULES: HabitatType[] = ['meadow', 'tide'];

export function menagerieModuleCap(level: number): number {
  if (level >= 3) return 4;
  if (level === 2) return 3;
  return 2;
}

export function menagerieModules(room: Pick<PlacedRoom, 'defId' | 'level' | 'settings'>): HabitatType[] {
  const configured = room.settings?.modules?.filter((m): m is HabitatType => ALL_HABITATS.includes(m as HabitatType));
  if (configured && configured.length > 0) return Array.from(new Set(configured));
  return [...DEFAULT_MENAGERIE_MODULES];
}

export function roomAcceptedHabitats(room: Pick<PlacedRoom, 'defId' | 'level' | 'settings'>): HabitatType[] {
  if (room.defId === 'menagerie') return menagerieModules(room);
  return penAcceptedHabitats(room.defId);
}

export function penAcceptedHabitats(roomDefId: string): HabitatType[] {
  if (roomDefId === 'menagerie') return ['meadow', 'tide', 'sky', 'gloom', 'ember', 'crystal'];
  const out: HabitatType[] = [];
  for (const [hab, defs] of Object.entries(HABITAT_TO_ROOM_DEF) as Array<[HabitatType, string[]]>) {
    if (defs.includes(roomDefId)) out.push(hab);
  }
  return out;
}

export function compatiblePenRoomDefs(def: Pick<CreatureDefinition, 'habitats'>): string[] {
  const seen = new Set<string>();
  for (const h of def.habitats) {
    for (const rId of HABITAT_TO_ROOM_DEF[h] ?? ['menagerie']) seen.add(rId);
  }
  return Array.from(seen);
}

export function compatiblePenNames(def: Pick<CreatureDefinition, 'habitats'>): string[] {
  return compatiblePenRoomDefs(def).map(id => ROOM_DEFINITIONS[id]?.name ?? id);
}

export function penCreatureCapacity(room: Pick<PlacedRoom, 'defId' | 'w' | 'h'>): number {
  const defCap = ROOM_DEFINITIONS[room.defId]?.capacity?.creatures;
  const isOneByOne = room.w === 1 && room.h === 1;
  if (defCap !== undefined) return Math.min(isOneByOne ? ONE_BY_ONE_PEN_CAP : LARGE_PEN_CAP, defCap);
  return isOneByOne ? ONE_BY_ONE_PEN_CAP : LARGE_PEN_CAP;
}

export function isRoamingCompanion(c: Pick<CreatureInstance, 'defId' | 'status' | 'debugUnhomed'>): boolean {
  if (c.debugUnhomed) return false;
  if (c.status !== 'tamed') return false;
  return !!CREATURE_DEFINITIONS[c.defId]?.roamsFreely;
}

export function creatureNeedsPenSlot(c: Pick<CreatureInstance, 'defId' | 'status' | 'debugUnhomed'>): boolean {
  if (c.status === 'away' || c.status === 'loose') return false;
  if (isRoamingCompanion(c)) return false;
  return true;
}

export interface CreatureRoomResolution {
  room: PlacedRoom | undefined;
  unhomed: boolean;
  roaming: boolean;
  subBayIndex: number;
}

function roomMatchesCreature(room: PlacedRoom, c: CreatureInstance, habitats: HabitatType[]): boolean {
  const accepted = roomAcceptedHabitats(room);
  if (accepted.length === 0) return true;
  if (c.defId === 'philosophers_chimera') {
    return room.defId === 'menagerie' && accepted.includes('ember') && accepted.includes('crystal');
  }
  return habitats.some(h => accepted.includes(h));
}

/**
 * Deterministic room resolution shared between RoomWindow and CreatureChoreographer.
 * - Tamed `roamsFreely` companions need NO pen slot (`roaming: true`, `room: undefined`, `unhomed: false`).
 * - Pre-tamed (`egg`), `wary`, and tamed non-roamers resolve to explicit valid matching habitat or first matching built pen with spare slots.
 * - `egg` falls back to Storage Vault -> Entrance Hall (`unhomed: !eh`).
 * - `wary` / non-roaming `tamed` without matching pen wait outside Entrance Hall (`unhomed: true`).
 */
export function resolveAllCreatureRooms(
  creatures: CreatureInstance[],
  rooms: PlacedRoom[]
): Map<number, CreatureRoomResolution> {
  const result = new Map<number, CreatureRoomResolution>();
  const occupancyCount = new Map<number, number>();
  const eh = rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall');
  const vault = rooms.find(r => r.state === 'built' && r.defId === 'storage_vault');

  const ordered = [...creatures].sort((a, b) => a.id - b.id);

  // Pass 1: assign creatures with explicit valid built roomId first (respecting non-roamers)
  const deferred: CreatureInstance[] = [];
  for (const c of ordered) {
    if (!c) continue;
    if (c.status === 'away' || c.status === 'loose') {
      result.set(c.id, { room: undefined, unhomed: false, roaming: false, subBayIndex: 0 });
      continue;
    }
    if (c.debugUnhomed) {
      result.set(c.id, { room: eh, unhomed: true, roaming: false, subBayIndex: 0 });
      continue;
    }
    if (isRoamingCompanion(c)) {
      result.set(c.id, { room: undefined, unhomed: false, roaming: true, subBayIndex: 0 });
      continue;
    }

    const def = CREATURE_DEFINITIONS[c.defId];
    const habitats = def?.habitats ?? ['meadow'];

    if (c.roomId !== undefined) {
      const explicit = rooms.find(r => r.id === c.roomId && r.state === 'built');
      if (explicit) {
        const accepted = roomAcceptedHabitats(explicit);
        const isHabitatRoom = accepted.length > 0 || penAcceptedHabitats(explicit.defId).length > 0;
        const matchesHabitat = roomMatchesCreature(explicit, c, habitats);
        const cap = penCreatureCapacity(explicit);
        const count = occupancyCount.get(explicit.id) ?? 0;
        if ((!isHabitatRoom || matchesHabitat) && (!isHabitatRoom || count < cap)) {
          let bayIdx = 0;
          if (explicit.defId === 'menagerie') {
            const mods = menagerieModules(explicit);
            const foundIdx = mods.findIndex(m => habitats.includes(m));
            bayIdx = foundIdx >= 0 ? foundIdx : 0;
          }
          if (isHabitatRoom) {
            occupancyCount.set(explicit.id, count + 1);
          }
          result.set(c.id, { room: explicit, unhomed: false, roaming: false, subBayIndex: bayIdx });
          continue;
        }
      }
    }
    deferred.push(c);
  }

  // Pass 2: assign creatures without an explicit matching pen
  for (const c of deferred) {
    const def = CREATURE_DEFINITIONS[c.defId];
    const habitats = def?.habitats ?? ['meadow'];

    let matched: { room: PlacedRoom; bay: number } | undefined;
    outer: for (const h of habitats) {
      const preferredDefs = c.defId === 'philosophers_chimera'
        ? ['menagerie']
        : (HABITAT_TO_ROOM_DEF[h] ?? ['menagerie']);
      for (const defId of preferredDefs) {
        const candidates = rooms.filter(r => r.state === 'built' && r.defId === defId);
        for (const r of candidates) {
          if (!roomMatchesCreature(r, c, habitats)) continue;
          const cap = penCreatureCapacity(r);
          const count = occupancyCount.get(r.id) ?? 0;
          if (count < cap) {
            let bay = 0;
            if (r.defId === 'menagerie') {
              const mods = menagerieModules(r);
              const modIdx = mods.indexOf(h);
              if (modIdx < 0) continue;
              bay = modIdx;
            }
            matched = { room: r, bay };
            break outer;
          }
        }
      }
    }

    if (matched) {
      occupancyCount.set(matched.room.id, (occupancyCount.get(matched.room.id) ?? 0) + 1);
      result.set(c.id, { room: matched.room, unhomed: false, roaming: false, subBayIndex: matched.bay });
      continue;
    }

    if (c.status === 'egg') {
      if (vault) {
        result.set(c.id, { room: vault, unhomed: false, roaming: false, subBayIndex: 0 });
      } else {
        result.set(c.id, { room: eh, unhomed: !eh, roaming: false, subBayIndex: 0 });
      }
      continue;
    }

    result.set(c.id, { room: eh, unhomed: true, roaming: false, subBayIndex: 0 });
  }

  return result;
}

export function getPenOccupants(state: Pick<FullGameState, 'creatures' | 'rooms'>, room: PlacedRoom): CreatureInstance[] {
  const map = resolveAllCreatureRooms(state.creatures || [], state.rooms || []);
  return (state.creatures || []).filter(c => {
    const res = map.get(c.id);
    return !!res && !res.unhomed && !res.roaming && res.room?.id === room.id;
  });
}

export function getDiscoveredCreatureIds(
  state: Pick<FullGameState, 'discoveredCreatures' | 'creatures'>
): Set<string> {
  const set = new Set<string>(state.discoveredCreatures || []);
  for (const c of state.creatures || []) {
    if (c?.defId && CREATURE_DEFINITIONS[c.defId]) set.add(c.defId);
  }
  return set;
}

export function syncDiscoveredCreatures(state: FullGameState): string[] {
  const set = getDiscoveredCreatureIds(state);
  const arr = Array.from(set);
  state.discoveredCreatures = arr;
  return arr;
}

export function isCreatureBuffEligible(c: CreatureInstance, bellIndex = 0): boolean {
  if (c.status !== 'tamed') return false;
  if (c.injury) return false;
  if (c.tiredUntilBell !== undefined && c.tiredUntilBell > bellIndex) return false;
  return true;
}

export function bondBuffMultiplier(bondLevel: number | undefined): number {
  if ((bondLevel ?? 1) >= 3) return 1.5;
  if (bondLevel === 2) return 1.25;
  return 1.0;
}

/**
 * Effective buff multiplier for a single creature copy:
 * - 0 if not tamed or tired after non-safe expedition
 * - Bond Lv 1/2/3 => x1.0 / x1.25 / x1.5 (when includeBond !== false)
 * - Hungry => x0.5
 * - Housed in built, finished Menagerie => +10% (x1.1)
 * - Menagerie Royale spellbook => +15% (x1.15)
 */
export function creatureCopyBuffScale(
  c: CreatureInstance,
  opts: {
    bellIndex?: number;
    resolvedRoom?: PlacedRoom;
    menagerieRoyale?: boolean;
    includeBond?: boolean;
  } = {}
): number {
  if (!isCreatureBuffEligible(c, opts.bellIndex ?? 0)) return 0;
  let mult = opts.includeBond === false ? 1 : bondBuffMultiplier(c.bondLevel);
  if (c.hungry) mult *= 0.5;
  if (opts.resolvedRoom && opts.resolvedRoom.defId === 'menagerie' && opts.resolvedRoom.state === 'built' && !isRoomUnfinished(opts.resolvedRoom)) {
    mult *= 1.1;
  }
  if (opts.menagerieRoyale) mult *= 1.15;
  return mult;
}

/**
 * Summed buff scale across top-2 (or top-3 with Menagerie Royale) active copies of a species.
 */
export function creatureSpeciesBuffSum(
  state: Pick<FullGameState, 'creatures' | 'rooms'> & {
    spellbooks?: string[];
    bellIndex?: number;
    alumniGallery?: FullGameState['alumniGallery'];
  },
  defId: string,
  opts: { includeBond?: boolean } = {}
): number {
  const creatures = state.creatures || [];
  const candidates = creatures.filter(c => c.defId === defId && isCreatureBuffEligible(c, state.bellIndex ?? 0));
  if (candidates.length === 0) return 0;
  const menagerieRoyale = !!state.spellbooks?.includes('menagerie_royale');
  const maxStack = menagerieRoyale ? 3 : 2;
  const resolution = state.rooms?.length ? resolveAllCreatureRooms(creatures, state.rooms) : undefined;
  const tamerMult = 1 + (state.alumniGallery?.length ? computeAlumniBonuses(state.alumniGallery).tamerCreatureBuffPct : 0);
  const scales = candidates
    .map(c =>
      creatureCopyBuffScale(c, {
        bellIndex: state.bellIndex ?? 0,
        resolvedRoom: resolution?.get(c.id)?.room,
        menagerieRoyale,
        includeBond: opts.includeBond
      }) * tamerMult
    )
    .filter(s => s > 0)
    .sort((a, b) => b - a);
  let sum = 0;
  for (let i = 0; i < Math.min(maxStack, scales.length); i++) {
    sum += scales[i];
  }
  return sum;
}

/**
 * Computes a combined percentage buff across one or more creature species, enforcing §33.6's
 * "+50% Creature buff bonuses (Bond multipliers are separate)" cap on the non-bond portion.
 */
export function creatureCategoryBonus(
  state: Pick<FullGameState, 'creatures' | 'rooms'> & {
    spellbooks?: string[];
    bellIndex?: number;
    alumniGallery?: FullGameState['alumniGallery'];
  },
  entries: Array<{ defId: string; perCopy: number }>,
  categoryCap = 0.5
): number {
  let rawBaseSum = 0;
  const parts: Array<{ base: number; bonded: number }> = [];
  for (const e of entries) {
    const base = e.perCopy * creatureSpeciesBuffSum(state, e.defId, { includeBond: false });
    if (base <= 0) continue;
    const bonded = e.perCopy * creatureSpeciesBuffSum(state, e.defId, { includeBond: true });
    rawBaseSum += base;
    parts.push({ base, bonded });
  }
  if (rawBaseSum <= 0) return 0;
  const capScale = rawBaseSum > categoryCap ? categoryCap / rawBaseSum : 1;
  let total = 0;
  for (const p of parts) {
    total += p.bonded * capScale;
  }
  return total;
}

/**
 * Grant one-time taming bonuses (Gilded Pangolin +5 Renown when tamed).
 */
export function grantTamingOneTimeBonuses(
  state: FullGameState,
  creature: CreatureInstance,
  notifications?: string[]
): void {
  if (creature.status !== 'tamed') return;
  if (creature.defId === 'gilded_pangolin' && !creature.tamedRenownGranted) {
    creature.tamedRenownGranted = true;
    state.renown += 5;
    const msg = `✨ Gilded Pangolin ${creature.nickname} brought +5 Renown upon taming!`;
    notifications?.push(msg);
    state.notices.push({
      id: `pangolin-renown-${creature.id}-${state.reviewIndex}`,
      time: Date.now(),
      type: 'creature_tamed',
      text: msg,
      data: { roomId: creature.roomId, creatureId: creature.id }
    });
  }
}
