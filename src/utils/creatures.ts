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
        const accepted = penAcceptedHabitats(explicit.defId);
        const isHabitatRoom = accepted.length > 0;
        const matchesHabitat = habitats.some(h => accepted.includes(h));
        if (!isHabitatRoom || matchesHabitat) {
          const bayIdx = explicit.defId === 'menagerie' ? Math.max(0, explicit.settings?.modules?.indexOf(habitats[0]) ?? 0) : 0;
          occupancyCount.set(explicit.id, (occupancyCount.get(explicit.id) ?? 0) + 1);
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
      const preferredDefs = HABITAT_TO_ROOM_DEF[h] ?? ['menagerie'];
      for (const defId of preferredDefs) {
        const candidates = rooms.filter(r => r.state === 'built' && r.defId === defId);
        for (const r of candidates) {
          const cap = penCreatureCapacity(r);
          const count = occupancyCount.get(r.id) ?? 0;
          if (count < cap) {
            const bay = r.defId === 'menagerie' ? Math.max(0, r.settings?.modules?.indexOf(h) ?? 0) : 0;
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
