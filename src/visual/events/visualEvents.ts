/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * V5 Part B — Diff-based Visual Events, Rate-Limited Queue, Hazard Vignettes & Messenger Owl
 * Pure state-diffing + Painter drawing helpers. Read-only on FullGameState (VR-01).
 */

import type {
  FullGameState,
  NoticeData,
  PlacedRoom,
  SchoolType
} from '../../types/ankicaster';

export type CelebrationSizeSetting = 'full' | 'small' | 'off';
import { isMasteryReady } from '../../utils/formulas';
import { roomToWorldBox, type RoomWorldBox } from '../layout/gridToWorld';
import type { Painter } from '../rooms/painter';
import { line } from '../rooms/painter';

export type WorldBox = RoomWorldBox;

export type VisualEventType =
  // Academy rhythm
  | 'bell_swing'
  | 'meal_window'
  | 'day_tick_paid'
  | 'day_tick_unpaid'
  // Wizard
  | 'wizard_session'
  | 'wizard_level_up'
  | 'wizard_new_spell'
  | 'spell_cast'
  // People
  | 'student_enrolled'
  | 'mastery_ready'
  | 'master_graduated'
  | 'mastery_granted'
  | 'career_taken'
  | 'character_injured'
  | 'character_healed'
  | 'character_retired'
  | 'detention'
  // Rift & expeditions
  | 'rift_open'
  | 'expedition_launch'
  | 'expedition_safe'
  | 'expedition_return_safe'
  | 'expedition_minor_injury'
  | 'expedition_serious_injury'
  | 'expedition_return_injury'
  | 'expedition_curse'
  | 'expedition_return_curse'
  | 'expedition_retreat'
  | 'creature_egg'
  // Creatures
  | 'creature_arrival'
  | 'creature_hatch'
  | 'creature_tamed'
  | 'creature_bond_up'
  | 'creature_escape'
  // Builds & fallback
  | 'room_built'
  | 'generic_sparkle';

export interface VisualEventCatalogueEntry {
  type: VisualEventType;
  category: 'rhythm' | 'wizard' | 'people' | 'rift' | 'creature' | 'build' | 'fallback';
  label: string;
  size: 'big' | 'small';
  isBig: boolean;
  isCelebration: boolean;
  durationMs: number;
  defaultColor: number;
  props: {
    hasTrunk?: boolean;
    hasStar?: boolean;
    hasDomeRipple?: boolean;
    hasDomeDim?: boolean;
    hasBanner?: boolean;
    hasEggParcel?: boolean;
  };
}

export const VISUAL_EVENT_CATALOGUE: Record<VisualEventType, VisualEventCatalogueEntry> = {
  // Academy rhythm
  bell_swing: {
    type: 'bell_swing',
    category: 'rhythm',
    label: 'Bell Swing',
    size: 'small',
    isBig: false,
    isCelebration: false,
    durationMs: 1400,
    defaultColor: 0xe8c547,
    props: {}
  },
  meal_window: {
    type: 'meal_window',
    category: 'rhythm',
    label: 'Meal Window',
    size: 'small',
    isBig: false,
    isCelebration: false,
    durationMs: 2200,
    defaultColor: 0xf5ce7a,
    props: {}
  },
  day_tick_paid: {
    type: 'day_tick_paid',
    category: 'rhythm',
    label: 'Day Tick (Paid Veil Ripple)',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 1800,
    defaultColor: 0x9bd4ff,
    props: { hasDomeRipple: true }
  },
  day_tick_unpaid: {
    type: 'day_tick_unpaid',
    category: 'rhythm',
    label: 'Day Tick (Unpaid Veil Dim)',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 1000,
    defaultColor: 0x7d5ba6,
    props: { hasDomeDim: true }
  },

  // Wizard
  wizard_session: {
    type: 'wizard_session',
    category: 'wizard',
    label: 'Wizard Study Session',
    size: 'small',
    isBig: false,
    isCelebration: false,
    durationMs: 1500,
    defaultColor: 0x9c86e0,
    props: {}
  },
  wizard_level_up: {
    type: 'wizard_level_up',
    category: 'wizard',
    label: 'Wizard School Level Up',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2200,
    defaultColor: 0xf7e39a,
    props: { hasBanner: true }
  },
  wizard_new_spell: {
    type: 'wizard_new_spell',
    category: 'wizard',
    label: 'New Spell Learned',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2000,
    defaultColor: 0x9c86e0,
    props: {}
  },
  spell_cast: {
    type: 'spell_cast',
    category: 'wizard',
    label: 'Spell Cast',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 1800,
    defaultColor: 0x6b4fbb,
    props: {}
  },

  // People
  student_enrolled: {
    type: 'student_enrolled',
    category: 'people',
    label: 'Student Enrolled (With Trunk)',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2200,
    defaultColor: 0x7db861,
    props: { hasTrunk: true }
  },
  mastery_ready: {
    type: 'mastery_ready',
    category: 'people',
    label: 'Mastery Ready Star',
    size: 'small',
    isBig: false,
    isCelebration: true,
    durationMs: 2000,
    defaultColor: 0xf7e39a,
    props: { hasStar: true }
  },
  master_graduated: {
    type: 'master_graduated',
    category: 'people',
    label: 'Graduated as Master',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2500,
    defaultColor: 0xf7e39a,
    props: { hasBanner: true, hasStar: true }
  },
  mastery_granted: {
    type: 'mastery_granted',
    category: 'people',
    label: 'Graduated as Master',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2500,
    defaultColor: 0xf7e39a,
    props: { hasBanner: true, hasStar: true }
  },
  career_taken: {
    type: 'career_taken',
    category: 'people',
    label: 'Career Assigned',
    size: 'small',
    isBig: false,
    isCelebration: true,
    durationMs: 1600,
    defaultColor: 0xe0a33a,
    props: {}
  },
  character_injured: {
    type: 'character_injured',
    category: 'people',
    label: 'Character Injured',
    size: 'small',
    isBig: false,
    isCelebration: false,
    durationMs: 1600,
    defaultColor: 0xd9472b,
    props: {}
  },
  character_healed: {
    type: 'character_healed',
    category: 'people',
    label: 'Character Healed',
    size: 'small',
    isBig: false,
    isCelebration: true,
    durationMs: 1600,
    defaultColor: 0x7db861,
    props: {}
  },
  character_retired: {
    type: 'character_retired',
    category: 'people',
    label: 'Character Retired',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2400,
    defaultColor: 0xf6e08c,
    props: { hasBanner: true }
  },
  detention: {
    type: 'detention',
    category: 'people',
    label: 'Detention Vignette',
    size: 'small',
    isBig: false,
    isCelebration: false,
    durationMs: 1800,
    defaultColor: 0x8a8994,
    props: {}
  },

  // Rift & expeditions
  rift_open: {
    type: 'rift_open',
    category: 'rift',
    label: 'Rift Gate Awakened',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2400,
    defaultColor: 0xb9a6ff,
    props: {}
  },
  expedition_launch: {
    type: 'expedition_launch',
    category: 'rift',
    label: 'Expedition Launched',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2200,
    defaultColor: 0x5fc2c2,
    props: { hasBanner: true }
  },
  expedition_safe: {
    type: 'expedition_safe',
    category: 'rift',
    label: 'Expedition Returned (Safe)',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2400,
    defaultColor: 0xf7e39a,
    props: { hasBanner: true }
  },
  expedition_return_safe: {
    type: 'expedition_return_safe',
    category: 'rift',
    label: 'Expedition Returned (Safe)',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2400,
    defaultColor: 0xf7e39a,
    props: { hasBanner: true }
  },
  expedition_minor_injury: {
    type: 'expedition_minor_injury',
    category: 'rift',
    label: 'Expedition Returned (Minor Injury)',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 2200,
    defaultColor: 0xe0a33a,
    props: {}
  },
  expedition_serious_injury: {
    type: 'expedition_serious_injury',
    category: 'rift',
    label: 'Expedition Returned (Serious Injury)',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 2400,
    defaultColor: 0xd9472b,
    props: {}
  },
  expedition_return_injury: {
    type: 'expedition_return_injury',
    category: 'rift',
    label: 'Expedition Returned (Injury)',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 2300,
    defaultColor: 0xd9472b,
    props: {}
  },
  expedition_curse: {
    type: 'expedition_curse',
    category: 'rift',
    label: 'Expedition Returned (Curse)',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 2400,
    defaultColor: 0x7d5ba6,
    props: {}
  },
  expedition_return_curse: {
    type: 'expedition_return_curse',
    category: 'rift',
    label: 'Expedition Returned (Curse)',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 2400,
    defaultColor: 0x7d5ba6,
    props: {}
  },
  expedition_retreat: {
    type: 'expedition_retreat',
    category: 'rift',
    label: 'Expedition Returned (Retreat)',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 2000,
    defaultColor: 0x8a909b,
    props: {}
  },
  creature_egg: {
    type: 'creature_egg',
    category: 'rift',
    label: 'Creature Egg / Origin Found',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2200,
    defaultColor: 0xf5ce7a,
    props: { hasEggParcel: true }
  },

  // Creatures
  creature_arrival: {
    type: 'creature_arrival',
    category: 'creature',
    label: 'Wild Creature Arrived',
    size: 'small',
    isBig: false,
    isCelebration: true,
    durationMs: 1800,
    defaultColor: 0x7db861,
    props: {}
  },
  creature_hatch: {
    type: 'creature_hatch',
    category: 'creature',
    label: 'Creature Hatched',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2200,
    defaultColor: 0xf7e39a,
    props: { hasStar: true }
  },
  creature_tamed: {
    type: 'creature_tamed',
    category: 'creature',
    label: 'Creature Tamed',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 2200,
    defaultColor: 0x7db861,
    props: { hasStar: true }
  },
  creature_bond_up: {
    type: 'creature_bond_up',
    category: 'creature',
    label: 'Creature Bond Increased',
    size: 'small',
    isBig: false,
    isCelebration: true,
    durationMs: 1600,
    defaultColor: 0xd97a9a,
    props: {}
  },
  creature_escape: {
    type: 'creature_escape',
    category: 'creature',
    label: 'Creature Escaped',
    size: 'big',
    isBig: true,
    isCelebration: false,
    durationMs: 2000,
    defaultColor: 0xf07a5c,
    props: {}
  },

  // Builds & fallback
  room_built: {
    type: 'room_built',
    category: 'build',
    label: 'Room Construction Complete',
    size: 'big',
    isBig: true,
    isCelebration: true,
    durationMs: 1800,
    defaultColor: 0xf7e39a,
    props: {}
  },
  generic_sparkle: {
    type: 'generic_sparkle',
    category: 'fallback',
    label: 'Entrance Hall Sparkle',
    size: 'small',
    isBig: false,
    isCelebration: false,
    durationMs: 1200,
    defaultColor: 0xf7e39a,
    props: {}
  }
};

export type HazardOrIncidentId =
  | NonNullable<PlacedRoom['hazard']>['type']
  | 'misbehavior'
  | 'honey_rolls'
  | 'sulfur_spark'
  | 'inkpot_sleep'
  | 'chalk_duel'
  | 'creature_trouble'
  | 'night_ink'
  | 'alch_spill'
  | 'frost_draught'
  | 'hex_damp'
  | 'loose_creature';

export interface HazardVignetteSpec {
  id: HazardOrIncidentId;
  kind: 'hazard' | 'incident';
  visualLook: string;
  primaryColor: number;
  secondaryColor: number;
  description: string;
}

/**
 * Registry of every PlacedRoom['hazard']['type'] and every engine incident id.
 * - spill_of_night uses the `night_ink` look
 * - breach uses a small violet crack and drifting wisps
 */
export const HAZARD_VIGNETTE_REGISTRY: Record<string, HazardVignetteSpec> = {
  spill_of_night: {
    id: 'spill_of_night',
    kind: 'hazard',
    visualLook: 'night_ink',
    primaryColor: 0x151a38,
    secondaryColor: 0x4c5ba3,
    description: 'Dark night_ink blotches and rising shadow droplets'
  },
  hex_fog: {
    id: 'hex_fog',
    kind: 'hazard',
    visualLook: 'corrosive_mist',
    primaryColor: 0x7d5ba6,
    secondaryColor: 0x9c86e0,
    description: 'Low purple-green mist banks drifting across the floorboards'
  },
  echo_loop: {
    id: 'echo_loop',
    kind: 'hazard',
    visualLook: 'temporal_rings',
    primaryColor: 0xa78bfa,
    secondaryColor: 0x7dd3fc,
    description: 'Concentric temporal chime rings pulsing in place'
  },
  cold_snap: {
    id: 'cold_snap',
    kind: 'hazard',
    visualLook: 'frost_rime',
    primaryColor: 0xd8eef7,
    secondaryColor: 0xffffff,
    description: 'Crystalline frost needles and pale ice glaze'
  },
  breach: {
    id: 'breach',
    kind: 'hazard',
    visualLook: 'violet_crack_wisps',
    primaryColor: 0x7d5ba6,
    secondaryColor: 0xb9a6ff,
    description: 'Small violet crack and drifting wisps'
  },
  misbehavior: {
    id: 'misbehavior',
    kind: 'incident',
    visualLook: 'chalk_sparks',
    primaryColor: 0xe0a33a,
    secondaryColor: 0xf6f1e8,
    description: 'Mischievous chalk puffs and scattered paper motes'
  },
  honey_rolls: {
    id: 'honey_rolls',
    kind: 'incident',
    visualLook: 'crumb_sparkles',
    primaryColor: 0xe8c547,
    secondaryColor: 0xc28e5c,
    description: 'Warm pastry crumbs and golden laughter motes'
  },
  sulfur_spark: {
    id: 'sulfur_spark',
    kind: 'incident',
    visualLook: 'sulfur_puff',
    primaryColor: 0xf07a5c,
    secondaryColor: 0x8a8994,
    description: 'Orange sulfur spark and sooty smoke ring'
  },
  inkpot_sleep: {
    id: 'inkpot_sleep',
    kind: 'incident',
    visualLook: 'ink_splat_zzz',
    primaryColor: 0x222b57,
    secondaryColor: 0xc9ced6,
    description: 'Tipped inkpot puddle and sleepy floating Zs'
  },
  chalk_duel: {
    id: 'chalk_duel',
    kind: 'incident',
    visualLook: 'crossed_wands_dust',
    primaryColor: 0x9c86e0,
    secondaryColor: 0xf6e08c,
    description: 'Dueling wand sparks and drifting chalk cloud'
  },
  creature_trouble: {
    id: 'creature_trouble',
    kind: 'incident',
    visualLook: 'paw_tracks',
    primaryColor: 0xdb8c46,
    secondaryColor: 0x7db861,
    description: 'Startled paw tracks and rustling leaves'
  },
  night_ink: {
    id: 'night_ink',
    kind: 'incident',
    visualLook: 'night_ink',
    primaryColor: 0x151a38,
    secondaryColor: 0x4c5ba3,
    description: 'Spilled night ink blotches'
  },
  alch_spill: {
    id: 'alch_spill',
    kind: 'incident',
    visualLook: 'sulfur_puff',
    primaryColor: 0xf07a5c,
    secondaryColor: 0x8a8994,
    description: 'Alchemical spill fumes'
  },
  frost_draught: {
    id: 'frost_draught',
    kind: 'incident',
    visualLook: 'frost_rime',
    primaryColor: 0xd8eef7,
    secondaryColor: 0xffffff,
    description: 'Chilled draught frost'
  },
  hex_damp: {
    id: 'hex_damp',
    kind: 'incident',
    visualLook: 'corrosive_mist',
    primaryColor: 0x7d5ba6,
    secondaryColor: 0x9c86e0,
    description: 'Damp hex mist'
  },
  loose_creature: {
    id: 'loose_creature',
    kind: 'incident',
    visualLook: 'paw_tracks',
    primaryColor: 0xdb8c46,
    secondaryColor: 0x7db861,
    description: 'Loose creature tracks'
  }
};

export interface ActiveVisualEvent {
  id: string;
  type: VisualEventType;
  roomId: number;
  usedEntranceHallFallback: boolean;
  size: 'big' | 'small';
  isBig: boolean;
  isCelebration: boolean;
  startTimeMs: number;
  startMs: number;
  durationMs: number;
  color: number;
  mergedCount: number;
  scale: number; // 1 = full, 0.5 = small
  props: VisualEventCatalogueEntry['props'];
  data?: NoticeData;
}

export interface ActiveHazardVignette {
  roomId: number;
  hazardId: HazardOrIncidentId;
  key: HazardOrIncidentId;
  spec: HazardVignetteSpec;
  def: HazardVignetteSpec;
}

export interface MessengerOwlState {
  visible: boolean;
  eventId: string | null;
  roomId: number | null;
  x: number;
  y: number;
  hitBox: { left: number; top: number; right: number; bottom: number };
}

interface SnapshotSummary {
  day: number;
  bellIndex: number;
  reviewIndex: number;
  lastSessionTimeMs: number;
  veilStrength: number;
  veilPaidToday: number;
  veilCostToday: number;
  wizardLevels: Record<SchoolType, number>;
  knownSpellsCount: number;
  activeSessionId?: number;
  builtRoomIds: Set<number>;
  roomHazards: Map<number, string>;
  characterIds: Set<number>;
  characterStatus: Map<number, string>;
  characterCareer: Map<number, string | undefined>;
  characterInjury: Map<number, string | undefined>;
  characterMasteredCount: Map<number, number>;
  characterMasteryReady: Set<number>;
  creatureIds: Set<number>;
  creatureStatus: Map<number, string>;
  creatureBond: Map<number, number>;
  expeditionIds: Set<number>;
  riftGateUnlocked: boolean;
  noticeIds: Set<string>;
  debugPreviewNonce?: number;
}

const SCHOOL_COLOR_HEX: Record<SchoolType, number> = {
  arcane: 0x6b4fbb,
  nature: 0x4e8b3a,
  light: 0xe8c547,
  shadow: 0x2f3a73,
  alchemy: 0xb5651d
};

export const BIG_EFFECT_ROOM_COOLDOWN_MS = 2000;
export const MAX_ACTIVE_BIG_EFFECTS = 4;
export const MEAL_WINDOW_DEBOUNCE_MS = 300_000; // 5 minutes

export function findEntranceHallRoom(rooms: PlacedRoom[]): PlacedRoom | undefined {
  return rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || rooms[0];
}

export function resolveTargetRoom(
  rooms: PlacedRoom[],
  requestedRoomId?: number
): { roomId: number; usedFallback: boolean } {
  if (typeof requestedRoomId === 'number') {
    const found = rooms.find(r => r.id === requestedRoomId && r.state === 'built');
    if (found) {
      return { roomId: found.id, usedFallback: false };
    }
  }
  const eh = findEntranceHallRoom(rooms);
  return { roomId: eh ? eh.id : 1, usedFallback: true };
}

function summarizeState(state: FullGameState): SnapshotSummary {
  const builtRoomIds = new Set<number>();
  const roomHazards = new Map<number, string>();
  for (const r of state.rooms) {
    if (r.state === 'built') builtRoomIds.add(r.id);
    if (r.hazard?.type) roomHazards.set(r.id, r.hazard.type);
  }

  const characterIds = new Set<number>();
  const characterStatus = new Map<number, string>();
  const characterCareer = new Map<number, string | undefined>();
  const characterInjury = new Map<number, string | undefined>();
  const characterMasteredCount = new Map<number, number>();
  const characterMasteryReady = new Set<number>();

  for (const c of state.characters) {
    characterIds.add(c.id);
    characterStatus.set(c.id, c.status);
    characterCareer.set(c.id, c.career);
    characterInjury.set(c.id, c.injury?.type);
    characterMasteredCount.set(c.id, c.masteredSchools.length);
    if (c.status === 'student' && c.studySetId) {
      const set = state.cardSets.find(s => s.id === c.studySetId);
      if (set) {
        const ivls = set.cardIds.map(id => state.allCards[id]?.honestIvl || 0);
        if (isMasteryReady(ivls, state.settings.cardsPerStudent)) {
          characterMasteryReady.add(c.id);
        }
      }
    }
  }

  const creatureIds = new Set<number>();
  const creatureStatus = new Map<number, string>();
  const creatureBond = new Map<number, number>();
  for (const cr of state.creatures) {
    creatureIds.add(cr.id);
    creatureStatus.set(cr.id, cr.status);
    creatureBond.set(cr.id, cr.bondLevel);
  }

  const expeditionIds = new Set<number>(state.expeditions.map(e => e.id));
  const mastersCount = state.characters.filter(c => c.masteredSchools.length > 0).length;
  const riftGateUnlocked =
    !state.debugRiftLock &&
    (Boolean(state.riftGateGranted) ||
      mastersCount >= 3 ||
      state.rooms.some(r => r.defId === 'rift_gate' && r.state === 'built'));

  return {
    day: state.day,
    bellIndex: state.bellIndex,
    reviewIndex: state.reviewIndex,
    lastSessionTimeMs: state.lastSessionTimeMs,
    veilStrength: state.veil.strength,
    veilPaidToday: state.veil.paidToday,
    veilCostToday: state.veil.costToday,
    wizardLevels: { ...state.wizard.levels },
    knownSpellsCount: state.wizard.knownSpells.length,
    activeSessionId: state.wizard.activeSession?.id,
    builtRoomIds,
    roomHazards,
    characterIds,
    characterStatus,
    characterCareer,
    characterInjury,
    characterMasteredCount,
    characterMasteryReady,
    creatureIds,
    creatureStatus,
    creatureBond,
    expeditionIds,
    riftGateUnlocked,
    noticeIds: new Set(state.notices.map(n => n.id)),
    debugPreviewNonce: state.debugPreviewEvent?.nonce
  };
}

/**
 * Compute active hazard vignettes directly from current state rooms (stops immediately when cleared).
 */
export function getActiveHazardVignettes(state: FullGameState): ActiveHazardVignette[] {
  const list: ActiveHazardVignette[] = [];
  for (const room of state.rooms) {
    if (room.state !== 'built') continue;
    if (room.hazard?.type) {
      const spec = HAZARD_VIGNETTE_REGISTRY[room.hazard.type];
      if (spec) {
        list.push({
          roomId: room.id,
          hazardId: room.hazard.type,
          key: room.hazard.type,
          spec,
          def: spec
        });
      }
    }
  }
  return list;
}

/**
 * Compute Messenger Owl perched on the Entrance Hall roof whenever state.activeEvents.length > 0.
 */
export function computeMessengerOwlState(
  state: FullGameState,
  groundY: number
): MessengerOwlState {
  const eh = findEntranceHallRoom(state.rooms);
  const firstEvent = state.activeEvents[0];
  if (!eh || !firstEvent) {
    return {
      visible: false,
      eventId: null,
      roomId: eh?.id ?? null,
      x: 0,
      y: 0,
      hitBox: { left: 0, top: 0, right: 0, bottom: 0 }
    };
  }
  const box: WorldBox = roomToWorldBox(eh, groundY);
  const owlX = box.left + box.width - 14;
  const owlY = box.top - 4;
  return {
    visible: true,
    eventId: firstEvent.eventId,
    roomId: eh.id,
    x: owlX,
    y: owlY,
    hitBox: {
      left: owlX - 10,
      top: owlY - 12,
      right: owlX + 10,
      bottom: owlY + 6
    }
  };
}

export class VisualEventDispatcher {
  private prev: SnapshotSummary | null = null;
  public active: ActiveVisualEvent[] = [];
  public queued: ActiveVisualEvent[] = [];
  private lastBigByRoom = new Map<number, number>();
  private lastMealWindowMs = -Infinity;
  private seq = 1;
  public rippleStartMs: number | null = null;
  public unpaidDimUntilMs = 0;

  public getActiveEffects(): ActiveVisualEvent[] {
    return this.active;
  }

  public getQueuedEffects(): ActiveVisualEvent[] {
    return this.queued;
  }

  /**
   * Explicitly seed snapshot from state without emitting any events (used on initial open or away sync).
   */
  public seedFromState(state: FullGameState): void {
    this.prev = summarizeState(state);
  }

  public reset(): void {
    this.prev = null;
    this.active = [];
    this.queued = [];
    this.lastBigByRoom.clear();
    this.lastMealWindowMs = -Infinity;
    this.rippleStartMs = null;
    this.unpaidDimUntilMs = 0;
  }

  /**
   * Trigger a meal window visual event, debounced to at most 1 per 5 minutes (300,000 ms).
   */
  public notifyMealWindow(state: FullGameState, nowMs: number): boolean {
    if (nowMs - this.lastMealWindowMs < MEAL_WINDOW_DEBOUNCE_MS) {
      return false;
    }
    this.lastMealWindowMs = nowMs;
    const refectory =
      state.rooms.find(r => r.state === 'built' && (r.defId === 'refectory' || r.defId === 'great_hall')) ||
      findEntranceHallRoom(state.rooms);
    this.enqueueEvent(state, 'meal_window', refectory?.id, nowMs);
    return true;
  }

  /**
   * Fire a single visual event by type with no state change ("preview vignette").
   */
  public firePreviewVignette(
    state: FullGameState,
    type: VisualEventType,
    nowMs: number,
    roomId?: number,
    data?: NoticeData
  ): ActiveVisualEvent | null {
    return this.enqueueEvent(state, type, roomId, nowMs, data, true);
  }

  /**
   * Trigger a preview vignette directly on the dispatcher (used by debug panel with zero state mutation).
   */
  public triggerPreview(
    type: VisualEventType,
    roomId: number = 1,
    nowMs: number = 0
  ): ActiveVisualEvent | null {
    const spec = VISUAL_EVENT_CATALOGUE[type];
    if (!spec) return null;
    if (type === 'day_tick_paid') {
      this.rippleStartMs = nowMs;
    } else if (type === 'day_tick_unpaid') {
      this.unpaidDimUntilMs = nowMs + 1000;
    }
    const ev: ActiveVisualEvent = {
      id: `vev-preview-${this.seq++}-${nowMs}`,
      type,
      roomId,
      usedEntranceHallFallback: false,
      size: spec.size,
      isBig: spec.isBig,
      isCelebration: spec.isCelebration,
      startTimeMs: nowMs,
      startMs: nowMs,
      durationMs: spec.durationMs,
      color: spec.defaultColor,
      mergedCount: 1,
      scale: 1.0,
      props: { ...spec.props }
    };
    this.active.push(ev);
    return ev;
  }

  /**
   * Diff `state` against previous snapshot and queue resulting visual events.
   * - Never replays on first open or after multi-day away gaps (`isAwaySync` or `day - prev.day > 1`).
   * - Honest reviews alone emit 0 events.
   */
  public ingestSnapshot(
    state: FullGameState,
    nowMs: number = Date.now(),
    options?: { isAwaySync?: boolean }
  ): ActiveVisualEvent[] {
    if (!this.prev) {
      // First load: seed snapshot from current state so nothing from away time replays on open.
      this.prev = summarizeState(state);
      return [];
    }

    const next = summarizeState(state);
    const prev = this.prev;

    // Away-time sync guard: if multi-day away jump or explicit away sync flag, re-seed without replaying.
    const timeJumpMs = next.lastSessionTimeMs - prev.lastSessionTimeMs;
    if (options?.isAwaySync || next.day - prev.day > 1 || timeJumpMs >= 86_400_000 * 1.5) {
      this.prev = next;
      return [];
    }

    const newlyAdded: ActiveVisualEvent[] = [];
    const studyRoom = state.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built');
    const riftRoom = state.rooms.find(r => r.defId === 'rift_gate' && r.state === 'built');
    const infirmaryRoom = state.rooms.find(r => r.defId === 'infirmary' && r.state === 'built');
    const ehRoom = findEntranceHallRoom(state.rooms);

    // Check debug preview vignette trigger
    if (
      state.debugPreviewEvent &&
      state.debugPreviewEvent.nonce !== prev.debugPreviewNonce &&
      state.debugPreviewEvent.type in VISUAL_EVENT_CATALOGUE
    ) {
      const ev = this.enqueueEvent(
        state,
        state.debugPreviewEvent.type as VisualEventType,
        state.debugPreviewEvent.roomId ?? ehRoom?.id,
        nowMs,
        undefined,
        true
      );
      if (ev) newlyAdded.push(ev);
    }

    // 1. Inspect new notices with structured `data`
    const handledTypesThisTurn = new Set<string>();
    for (const notice of state.notices) {
      if (prev.noticeIds.has(notice.id)) continue;

      const d = notice.data;
      const mappedType = this.mapNoticeToVisualEventType(notice.type, notice.text, d);
      if (!mappedType) continue;

      if (!d || typeof d.roomId !== 'number') {
        const ev = this.enqueueEvent(state, mappedType, undefined, nowMs, d);
        if (ev) newlyAdded.push(ev);
      } else {
        const ev = this.enqueueEvent(state, mappedType, d.roomId, nowMs, d);
        if (ev) newlyAdded.push(ev);
      }
      handledTypesThisTurn.add(mappedType);
      if (mappedType === 'mastery_granted') handledTypesThisTurn.add('master_graduated');
      if (mappedType === 'master_graduated') handledTypesThisTurn.add('mastery_granted');
    }

    // 2. Academy rhythm diffs: Bell swing & single-day tick
    if (next.bellIndex > prev.bellIndex && !handledTypesThisTurn.has('bell_swing')) {
      const ev = this.enqueueEvent(state, 'bell_swing', ehRoom?.id, nowMs);
      if (ev) newlyAdded.push(ev);
    }

    if (next.day === prev.day + 1) {
      const paidFull =
        state.veil.costToday <= 0 ||
        (state.veil.paidToday >= state.veil.costToday && state.veil.strength >= prev.veilStrength);
      const tickType: VisualEventType = paidFull ? 'day_tick_paid' : 'day_tick_unpaid';
      if (!handledTypesThisTurn.has(tickType)) {
        const ev = this.enqueueEvent(state, tickType, ehRoom?.id, nowMs);
        if (ev) newlyAdded.push(ev);
      }
    }

    // 3. Wizard diffs
    if (
      next.activeSessionId &&
      next.activeSessionId !== prev.activeSessionId &&
      !handledTypesThisTurn.has('wizard_session')
    ) {
      const ev = this.enqueueEvent(state, 'wizard_session', studyRoom?.id ?? ehRoom?.id, nowMs);
      if (ev) newlyAdded.push(ev);
    }

    for (const school of Object.keys(next.wizardLevels) as SchoolType[]) {
      if (
        next.wizardLevels[school] > (prev.wizardLevels[school] || 0) &&
        !handledTypesThisTurn.has('wizard_level_up')
      ) {
        const ev = this.enqueueEvent(
          state,
          'wizard_level_up',
          studyRoom?.id ?? ehRoom?.id,
          nowMs,
          { roomId: studyRoom?.id, school, level: next.wizardLevels[school] }
        );
        if (ev) newlyAdded.push(ev);
      }
    }

    if (next.knownSpellsCount > prev.knownSpellsCount && !handledTypesThisTurn.has('wizard_new_spell')) {
      const ev = this.enqueueEvent(state, 'wizard_new_spell', studyRoom?.id ?? ehRoom?.id, nowMs);
      if (ev) newlyAdded.push(ev);
    }

    // 4. Built rooms diff
    for (const roomId of next.builtRoomIds) {
      if (!prev.builtRoomIds.has(roomId) && !handledTypesThisTurn.has('room_built')) {
        const ev = this.enqueueEvent(state, 'room_built', roomId, nowMs, { roomId });
        if (ev) newlyAdded.push(ev);
      }
    }

    // 5. People diffs (enrollment, mastery-ready, master graduated, career, injury, heal, retirement)
    for (const char of state.characters) {
      if (!prev.characterIds.has(char.id) && !handledTypesThisTurn.has('student_enrolled')) {
        const ev = this.enqueueEvent(
          state,
          'student_enrolled',
          char.seatRoomId ?? ehRoom?.id,
          nowMs,
          { roomId: char.seatRoomId ?? ehRoom?.id, characterIds: [char.id] }
        );
        if (ev) newlyAdded.push(ev);
      }

      if (
        next.characterMasteryReady.has(char.id) &&
        !prev.characterMasteryReady.has(char.id) &&
        !handledTypesThisTurn.has('mastery_ready')
      ) {
        const ev = this.enqueueEvent(
          state,
          'mastery_ready',
          char.seatRoomId ?? ehRoom?.id,
          nowMs,
          { roomId: char.seatRoomId ?? ehRoom?.id, characterIds: [char.id] }
        );
        if (ev) newlyAdded.push(ev);
      }

      const prevMastered = prev.characterMasteredCount.get(char.id) ?? 0;
      if (char.masteredSchools.length > prevMastered && !handledTypesThisTurn.has('master_graduated')) {
        const ev = this.enqueueEvent(
          state,
          'master_graduated',
          char.seatRoomId ?? ehRoom?.id,
          nowMs,
          { roomId: char.seatRoomId ?? ehRoom?.id, characterIds: [char.id] }
        );
        if (ev) newlyAdded.push(ev);
      }

      const prevCareer = prev.characterCareer.get(char.id);
      if (char.career && char.career !== prevCareer && !handledTypesThisTurn.has('career_taken')) {
        const ev = this.enqueueEvent(
          state,
          'career_taken',
          char.workplaceRoomId ?? ehRoom?.id,
          nowMs,
          { roomId: char.workplaceRoomId ?? ehRoom?.id, characterIds: [char.id], career: char.career }
        );
        if (ev) newlyAdded.push(ev);
      }

      const prevInj = prev.characterInjury.get(char.id);
      if (char.injury && !prevInj && !handledTypesThisTurn.has('character_injured')) {
        const ev = this.enqueueEvent(
          state,
          'character_injured',
          infirmaryRoom?.id ?? char.bedRoomId ?? ehRoom?.id,
          nowMs,
          { roomId: infirmaryRoom?.id ?? char.bedRoomId, characterIds: [char.id] }
        );
        if (ev) newlyAdded.push(ev);
      } else if (!char.injury && prevInj && !handledTypesThisTurn.has('character_healed')) {
        const ev = this.enqueueEvent(
          state,
          'character_healed',
          infirmaryRoom?.id ?? char.bedRoomId ?? ehRoom?.id,
          nowMs,
          { roomId: infirmaryRoom?.id ?? char.bedRoomId, characterIds: [char.id] }
        );
        if (ev) newlyAdded.push(ev);
      }

      const prevStatus = prev.characterStatus.get(char.id);
      if (char.status === 'alumnus' && prevStatus && prevStatus !== 'alumnus' && !handledTypesThisTurn.has('character_retired')) {
        const ev = this.enqueueEvent(
          state,
          'character_retired',
          ehRoom?.id,
          nowMs,
          { roomId: ehRoom?.id, characterIds: [char.id] }
        );
        if (ev) newlyAdded.push(ev);
      }
    }

    // 6. Rift & expeditions diffs
    if (next.riftGateUnlocked && !prev.riftGateUnlocked && !handledTypesThisTurn.has('rift_open')) {
      const ev = this.enqueueEvent(state, 'rift_open', riftRoom?.id ?? ehRoom?.id, nowMs);
      if (ev) newlyAdded.push(ev);
    }

    for (const exp of state.expeditions) {
      if (!prev.expeditionIds.has(exp.id) && !handledTypesThisTurn.has('expedition_launch')) {
        const ev = this.enqueueEvent(
          state,
          'expedition_launch',
          riftRoom?.id ?? ehRoom?.id,
          nowMs,
          { roomId: riftRoom?.id ?? ehRoom?.id, characterIds: exp.teamIds }
        );
        if (ev) newlyAdded.push(ev);
      }
    }

    // 7. Creature diffs (arrival, egg, hatch, tamed, bond up, escape)
    for (const cr of state.creatures) {
      const prevSt = prev.creatureStatus.get(cr.id);
      if (!prev.creatureIds.has(cr.id)) {
        const evType: VisualEventType = cr.status === 'egg' ? 'creature_egg' : 'creature_arrival';
        if (!handledTypesThisTurn.has(evType)) {
          const ev = this.enqueueEvent(
            state,
            evType,
            cr.roomId ?? ehRoom?.id,
            nowMs,
            { roomId: cr.roomId ?? ehRoom?.id, creatureId: cr.id }
          );
          if (ev) newlyAdded.push(ev);
        }
      } else {
        if (prevSt === 'egg' && cr.status === 'wary' && !handledTypesThisTurn.has('creature_hatch')) {
          const ev = this.enqueueEvent(
            state,
            'creature_hatch',
            cr.roomId ?? ehRoom?.id,
            nowMs,
            { roomId: cr.roomId ?? ehRoom?.id, creatureId: cr.id }
          );
          if (ev) newlyAdded.push(ev);
        } else if (prevSt !== 'tamed' && cr.status === 'tamed' && !handledTypesThisTurn.has('creature_tamed')) {
          const ev = this.enqueueEvent(
            state,
            'creature_tamed',
            cr.roomId ?? ehRoom?.id,
            nowMs,
            { roomId: cr.roomId ?? ehRoom?.id, creatureId: cr.id }
          );
          if (ev) newlyAdded.push(ev);
        } else if (prevSt !== 'loose' && cr.status === 'loose' && !handledTypesThisTurn.has('creature_escape')) {
          const ev = this.enqueueEvent(
            state,
            'creature_escape',
            cr.roomId ?? ehRoom?.id,
            nowMs,
            { roomId: cr.roomId ?? ehRoom?.id, creatureId: cr.id }
          );
          if (ev) newlyAdded.push(ev);
        }

        const prevBond = prev.creatureBond.get(cr.id) ?? cr.bondLevel;
        if (cr.bondLevel > prevBond && !handledTypesThisTurn.has('creature_bond_up')) {
          const ev = this.enqueueEvent(
            state,
            'creature_bond_up',
            cr.roomId ?? ehRoom?.id,
            nowMs,
            { roomId: cr.roomId ?? ehRoom?.id, creatureId: cr.id }
          );
          if (ev) newlyAdded.push(ev);
        }
      }
    }

    this.prev = next;
    this.promoteQueued(nowMs);
    return newlyAdded;
  }

  private mapNoticeToVisualEventType(
    noticeType: string,
    text: string,
    data?: NoticeData
  ): VisualEventType | null {
    if (data?.visualEventType && data.visualEventType in VISUAL_EVENT_CATALOGUE) {
      return data.visualEventType as VisualEventType;
    }
    if (data?.outcome) {
      if (data.outcome === 'safe') return 'expedition_safe';
      if (data.outcome === 'minor_injury') return 'expedition_minor_injury';
      if (data.outcome === 'serious_injury') return 'expedition_serious_injury';
      if (data.outcome === 'curse') return 'expedition_curse';
      if (data.outcome === 'retreat') return 'expedition_retreat';
    }
    switch (noticeType) {
      case 'bell_swing':
        return 'bell_swing';
      case 'meal_window':
        return 'meal_window';
      case 'day_tick_paid':
        return 'day_tick_paid';
      case 'day_tick_unpaid':
        return 'day_tick_unpaid';
      case 'wizard_session':
        return 'wizard_session';
      case 'level_up':
      case 'wizard_level_up':
        return 'wizard_level_up';
      case 'spell':
      case 'wizard_new_spell':
        return 'wizard_new_spell';
      case 'spell_cast':
        return 'spell_cast';
      case 'enrollment':
      case 'student_enrolled':
        return 'student_enrolled';
      case 'mastery_ready':
        return 'mastery_ready';
      case 'mastery':
      case 'graduation':
      case 'master_graduated':
      case 'mastery_granted':
        return 'master_graduated';
      case 'career':
      case 'career_taken':
        return 'career_taken';
      case 'injury':
      case 'character_injured':
        return 'character_injured';
      case 'heal':
      case 'character_healed':
        return 'character_healed';
      case 'retirement':
      case 'character_retired':
        return 'character_retired';
      case 'detention':
        return 'detention';
      case 'rift_open':
        return 'rift_open';
      case 'expedition':
      case 'expedition_launch':
        return 'expedition_launch';
      case 'creature_egg':
        return 'creature_egg';
      case 'creature_arrival':
        return 'creature_arrival';
      case 'creature_hatch':
        return 'creature_hatch';
      case 'creature_tamed':
        return 'creature_tamed';
      case 'creature_bond_up':
        return 'creature_bond_up';
      case 'creature_escape':
        return 'creature_escape';
      case 'build':
      case 'room_built':
        return 'room_built';
      default: {
        const lower = text.toLowerCase();
        if (lower.includes('graduated as master')) return 'master_graduated';
        if (lower.includes('mastery ready')) return 'mastery_ready';
        if (lower.includes('enrolled')) return 'student_enrolled';
        if (lower.includes('hatched')) return 'creature_hatch';
        if (lower.includes('tamed')) return 'creature_tamed';
        return null;
      }
    }
  }

  public enqueueEvent(
    state: FullGameState,
    type: VisualEventType,
    requestedRoomId: number | undefined,
    nowMs: number,
    data?: NoticeData,
    bypassRateLimit: boolean = false
  ): ActiveVisualEvent | null {
    const spec = VISUAL_EVENT_CATALOGUE[type];
    if (!spec) return null;

    const celebrationSize: CelebrationSizeSetting = state.settings.celebrationSize ?? 'full';
    if (spec.isCelebration && celebrationSize === 'off' && !bypassRateLimit) {
      return null;
    }

    // Track Veil dome ripple and unpaid dim timers even if celebration size is adjusted
    if (type === 'day_tick_paid') {
      this.rippleStartMs = nowMs;
    } else if (type === 'day_tick_unpaid') {
      this.unpaidDimUntilMs = nowMs + 1000;
    }

    // If a notice/event has no roomId, fall back to a generic sparkle on the Entrance Hall (never a guessed room)
    const resolved = resolveTargetRoom(state.rooms, requestedRoomId);
    const effectiveType: VisualEventType =
      requestedRoomId === undefined &&
      type !== 'day_tick_paid' &&
      type !== 'day_tick_unpaid' &&
      type !== 'bell_swing' &&
      !bypassRateLimit
        ? 'generic_sparkle'
        : type;
    const effectiveSpec = VISUAL_EVENT_CATALOGUE[effectiveType];

    const isBig =
      celebrationSize === 'small' && effectiveSpec.isCelebration ? false : effectiveSpec.isBig;
    const size: 'big' | 'small' = isBig ? 'big' : 'small';
    const scale = celebrationSize === 'small' && effectiveSpec.isCelebration ? 0.5 : 1.0;
    const schoolColor = data?.school ? SCHOOL_COLOR_HEX[data.school] : undefined;
    const color = schoolColor ?? effectiveSpec.defaultColor;

    // Small effects merge if same (type, roomId) is already active or queued
    if (!isBig) {
      const existing =
        this.active.find(e => !e.isBig && e.type === effectiveType && e.roomId === resolved.roomId) ||
        this.queued.find(e => !e.isBig && e.type === effectiveType && e.roomId === resolved.roomId);
      if (existing) {
        existing.mergedCount += 1;
        existing.startTimeMs = nowMs;
        existing.startMs = nowMs;
        return existing;
      }
    }

    const ev: ActiveVisualEvent = {
      id: `vev-${this.seq++}-${nowMs}`,
      type: effectiveType,
      roomId: resolved.roomId,
      usedEntranceHallFallback: resolved.usedFallback,
      size,
      isBig,
      isCelebration: effectiveSpec.isCelebration,
      startTimeMs: nowMs,
      startMs: nowMs,
      durationMs: state.settings.reduceMotion ? Math.min(600, effectiveSpec.durationMs) : effectiveSpec.durationMs,
      color,
      mergedCount: 1,
      scale,
      props: { ...effectiveSpec.props },
      data
    };

    if (!isBig || bypassRateLimit) {
      this.active.push(ev);
      if (isBig) this.lastBigByRoom.set(ev.roomId, nowMs);
      return ev;
    }

    // Big effect rate limit: at most 1 big effect per room every 2,000 ms, at most 4 active big effects map-wide
    if (this.canActivateBig(ev.roomId, nowMs)) {
      this.active.push(ev);
      this.lastBigByRoom.set(ev.roomId, nowMs);
    } else {
      this.queued.push(ev);
    }

    return ev;
  }

  private canActivateBig(roomId: number, nowMs: number): boolean {
    const activeBigCount = this.active.filter(e => e.isBig).length;
    if (activeBigCount >= MAX_ACTIVE_BIG_EFFECTS) return false;
    const lastRoomTime = this.lastBigByRoom.get(roomId);
    if (lastRoomTime !== undefined && nowMs - lastRoomTime < BIG_EFFECT_ROOM_COOLDOWN_MS) {
      return false;
    }
    return true;
  }

  public promoteQueued(nowMs: number): void {
    for (let i = 0; i < this.queued.length; i++) {
      const candidate = this.queued[i];
      if (!candidate.isBig || this.canActivateBig(candidate.roomId, nowMs)) {
        candidate.startTimeMs = nowMs;
        candidate.startMs = nowMs;
        this.active.push(candidate);
        if (candidate.isBig) {
          this.lastBigByRoom.set(candidate.roomId, nowMs);
        }
        this.queued.splice(i, 1);
        i--;
      }
    }
  }

  public tick(nowMs: number): void {
    this.active = this.active.filter(e => nowMs - e.startTimeMs < e.durationMs);
    if (this.rippleStartMs !== null && nowMs - this.rippleStartMs >= 1800) {
      this.rippleStartMs = null;
    }
    this.promoteQueued(nowMs);
  }

  public getVeilDomeModifiers(nowMs: number): {
    rippleProgress: number | null;
    unpaidDimRemainingMs: number;
  } {
    let rippleProgress: number | null = null;
    if (this.rippleStartMs !== null) {
      const elapsed = nowMs - this.rippleStartMs;
      if (elapsed >= 0 && elapsed < 1800) {
        rippleProgress = elapsed / 1800;
      }
    }
    const unpaidDimRemainingMs = Math.max(0, this.unpaidDimUntilMs - nowMs);
    return { rippleProgress, unpaidDimRemainingMs };
  }
}

/**
 * Draw an active visual event vignette onto a Painter in world coordinates.
 * Respects `reduceMotion` (static badge / one-frame swap) and `ev.scale` (Full vs Small).
 */
export function drawVisualEventVignette(
  g: Painter,
  ev: ActiveVisualEvent,
  box: WorldBox,
  nowOrProgress: number,
  reduceMotion: boolean
): void {
  const tRaw =
    nowOrProgress >= 0 && nowOrProgress <= 1 && ev.startTimeMs > 1
      ? nowOrProgress
      : (nowOrProgress - ev.startTimeMs) / Math.max(1, ev.durationMs);
  const t = reduceMotion ? 0.35 : Math.max(0, Math.min(1, tRaw));
  const fade = t < 0.75 ? 1 : Math.max(0, 1 - (t - 0.75) / 0.25);
  const s = ev.scale;
  const cx = box.left + box.width * 0.5;
  const cy = box.top + box.height * 0.5;
  const floorY = box.floorLineY;

  // Trunk prop for student enrollment
  if (ev.props.hasTrunk) {
    const tx = box.left + 12;
    const ty = floorY - 7;
    g.rect(tx, ty, 10 * s, 7 * s).fill({ color: 0x6e4529, alpha: 0.95 * fade });
    g.rect(tx, ty + 2 * s, 10 * s, 1.2 * s).fill({ color: 0xddb843, alpha: 0.95 * fade });
    g.rect(tx + 4 * s, ty + 1.5 * s, 2 * s, 2.5 * s).fill({ color: 0xf7e39a, alpha: 0.95 * fade });
  }

  // Egg parcel prop for creature_egg
  if (ev.props.hasEggParcel) {
    const ex = cx;
    const ey = floorY - 6;
    g.ellipse(ex, ey + 3, 6 * s, 2 * s).fill({ color: 0x96633b, alpha: 0.9 * fade });
    g.ellipse(ex, ey, 4 * s, 5.5 * s).fill({ color: 0xf5ce7a, alpha: 0.95 * fade });
  }

  // Star prop for mastery_ready, master_graduated, creature_hatch, creature_tamed
  if (ev.props.hasStar) {
    const sy = box.top + 8 - (reduceMotion ? 0 : t * 8);
    const r = 5 * s;
    g.circle(cx, sy, r + 2).fill({ color: ev.color, alpha: 0.28 * fade });
    g.poly([
      cx, sy - r,
      cx + r * 0.35, sy - r * 0.35,
      cx + r, sy,
      cx + r * 0.35, sy + r * 0.35,
      cx, sy + r,
      cx - r * 0.35, sy + r * 0.35,
      cx - r, sy,
      cx - r * 0.35, sy - r * 0.35
    ]).fill({ color: 0xf7e39a, alpha: 0.95 * fade });
  }

  // Banner prop for big milestones
  if (ev.props.hasBanner && s >= 1) {
    const bw = Math.min(box.width - 6, 44);
    const bx = cx - bw * 0.5;
    const by = box.top - 10;
    g.rect(bx, by, bw, 8).fill({ color: 0x1b1822, alpha: 0.88 * fade });
    g.rect(bx, by, bw, 1.5).fill({ color: ev.color, alpha: 0.95 * fade });
  }

  // Main ring + sparkles (static badge under reduceMotion, animated burst otherwise)
  const ringRadius = (reduceMotion ? 10 : 6 + t * 18) * s;
  g.circle(cx, cy, ringRadius).stroke({ color: ev.color, width: 1.5 * s, alpha: 0.8 * fade });

  const sparkCount = reduceMotion ? 4 : Math.max(3, Math.round(6 * s * Math.min(2, ev.mergedCount)));
  for (let i = 0; i < sparkCount; i++) {
    const angle = (i / sparkCount) * Math.PI * 2 + (reduceMotion ? 0 : t * 1.6);
    const dist = (reduceMotion ? 8 : 4 + t * 16) * s;
    const sx = cx + Math.cos(angle) * dist;
    const sy = cy + Math.sin(angle) * dist;
    g.circle(sx, sy, 1.6 * s).fill({ color: ev.color, alpha: 0.9 * fade });
  }
}

/**
 * Draw a registered hazard or incident vignette onto a Painter.
 */
export function drawHazardVignette(
  g: Painter,
  hazardOrVignette:
    | HazardOrIncidentId
    | string
    | ActiveHazardVignette
    | { roomId?: number; key?: string; hazardId?: string; def?: HazardVignetteSpec; spec?: HazardVignetteSpec },
  box: WorldBox,
  clockMs: number,
  reduceMotion: boolean
): void {
  const hazardId =
    typeof hazardOrVignette === 'string'
      ? hazardOrVignette
      : hazardOrVignette.hazardId ?? hazardOrVignette.key ?? '';
  const spec =
    (typeof hazardOrVignette === 'object' ? hazardOrVignette.spec ?? hazardOrVignette.def : undefined) ??
    HAZARD_VIGNETTE_REGISTRY[hazardId];
  if (!spec) return;
  const phase = reduceMotion ? 0 : (clockMs / 1000) * 1.8;
  const L = box.left;
  const W = box.width;
  const T = box.top;
  const B = box.floorLineY;
  const cx = L + W * 0.5;
  const cy = T + box.height * 0.5;

  if (hazardId === 'spill_of_night' || hazardId === 'night_ink') {
    // night_ink look
    g.ellipse(cx, B - 2, W * 0.36, 3.2).fill({ color: spec.primaryColor, alpha: 0.9 });
    for (let i = 0; i < 4; i++) {
      const dx = L + W * (0.2 + i * 0.2);
      const lift = (Math.sin(phase + i * 1.3) + 1) * 4;
      g.circle(dx, B - 5 - lift, 1.4).fill({ color: spec.secondaryColor, alpha: 0.78 });
    }
  } else if (hazardId === 'breach') {
    // Small violet crack and drifting wisps
    line(g, cx - 2, cy - 9, cx + 1.5, cy - 2, spec.secondaryColor, 1.4, 0.95);
    line(g, cx + 1.5, cy - 2, cx - 1.5, cy + 5, 0xd8b4fe, 1.4, 0.95);
    line(g, cx - 1.5, cy + 5, cx + 2, cy + 10, spec.secondaryColor, 1.2, 0.9);
    for (let i = 0; i < 3; i++) {
      const a = phase + (i * Math.PI * 2) / 3;
      const wx = cx + Math.cos(a) * 9;
      const wy = cy + Math.sin(a) * 6;
      g.circle(wx, wy, 1.6).fill({ color: spec.secondaryColor, alpha: 0.75 });
    }
  } else if (hazardId === 'hex_fog') {
    for (let i = 0; i < 4; i++) {
      const drift = Math.sin(phase + i) * 3;
      g.ellipse(L + ((i + 0.5) / 4) * W + drift, B - 7 - (i % 2) * 4, W * 0.16, 4.5).fill({
        color: spec.secondaryColor,
        alpha: 0.32
      });
    }
  } else if (hazardId === 'echo_loop') {
    const pulse = (phase % 1) * 6;
    g.circle(cx, cy, 5 + pulse).stroke({ color: spec.primaryColor, width: 1.1, alpha: 0.7 });
    g.circle(cx, cy, 10 + pulse * 0.6).stroke({ color: spec.secondaryColor, width: 0.9, alpha: 0.5 });
  } else if (hazardId === 'cold_snap') {
    for (let x = L + 6; x < L + W - 4; x += 10) {
      line(g, x, B - 1, x, B - 6, spec.secondaryColor, 1, 0.85);
      line(g, x - 2, B - 4, x + 2, B - 4, spec.primaryColor, 0.8, 0.8);
    }
  } else {
    // Incident vignettes
    g.circle(cx, cy - 4, 5).stroke({ color: spec.primaryColor, width: 1.2, alpha: 0.8 });
    g.circle(cx + Math.cos(phase) * 4, cy - 4 + Math.sin(phase) * 3, 1.5).fill({
      color: spec.secondaryColor,
      alpha: 0.85
    });
  }
}

/**
 * Draw the Events Board Messenger Owl perched on the Entrance Hall roof.
 */
export function drawMessengerOwl(
  g: Painter,
  owl: MessengerOwlState,
  clockMs: number,
  reduceMotion: boolean
): void {
  if (!owl.visible) return;
  const bob = reduceMotion ? 0 : Math.sin(clockMs / 450) * 0.8;
  const x = owl.x;
  const y = owl.y + bob;

  // Perch post
  g.rect(x - 4, y + 3, 8, 2).fill({ color: 0x6e4529, alpha: 1 });
  // Owl body
  g.ellipse(x, y - 1, 4.2, 5.2).fill({ color: 0x9c7a58, alpha: 1 });
  // Breast feathers
  g.ellipse(x, y, 2.6, 3.4).fill({ color: 0xe3dbce, alpha: 0.95 });
  // Ear tufts
  g.poly([x - 3.5, y - 5, x - 1.5, y - 4, x - 3, y - 7.5]).fill({ color: 0x6e4529, alpha: 1 });
  g.poly([x + 3.5, y - 5, x + 1.5, y - 4, x + 3, y - 7.5]).fill({ color: 0x6e4529, alpha: 1 });
  // Eyes & beak
  g.circle(x - 1.5, y - 3, 1.1).fill({ color: 0xf7e39a, alpha: 1 });
  g.circle(x + 1.5, y - 3, 1.1).fill({ color: 0xf7e39a, alpha: 1 });
  g.poly([x - 0.8, y - 2.2, x + 0.8, y - 2.2, x, y - 0.8]).fill({ color: 0xe0a33a, alpha: 1 });
  // Sealed letter scroll in talons + gold notification halo
  g.rect(x - 3.5, y + 1.5, 7, 2.4).fill({ color: 0xf6f1e8, alpha: 1 });
  g.circle(x, y + 2.7, 1.0).fill({ color: 0xd9472b, alpha: 1 });
  g.circle(x, y - 2, 8).stroke({ color: 0xf7e39a, width: 1, alpha: 0.65 });
}
