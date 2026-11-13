/**
 * Preview-only creature debug actions.
 * Not imported by the add-on bundle. Real play never calls these.
 * Creatures use the same instance shape the engine pushes. Reviews go through
 * AnkicasterEngine.applyHonestReview. Rooms use the engine's placement checks,
 * then are marked built without charging materials (this save is tagged debugUsed).
 */
import { CREATURE_DEFINITIONS, RIFT_DESTINATIONS, ROOM_DEFINITIONS } from '../data/content';
import type { Character, CreatureInstance, FullGameState, HabitatType, PlacedRoom } from '../types/ankicaster';
import { AnkicasterEngine } from '../utils/engine';
import { findAutoPlacement, getGridSize, validatePlacement } from '../utils/placement';
import { allFurnitureIds, fillRequiredFixtures } from '../utils/requiredFurniture';

export type DebugCreatureStatus = CreatureInstance['status'] | 'unhomed';

export type RiftDebugMode = 'dormant' | 'open' | 'expedition_out' | 'returning';

export interface DebugResult {
  state: FullGameState;
  message: string;
  creatureId?: number;
}

export const HABITAT_SAMPLES: Array<{ habitat: HabitatType; defId: string; roomDef: string; label: string }> = [
  { habitat: 'meadow', defId: 'mossback_tortoise', roomDef: 'meadow_paddock', label: 'Meadow' },
  { habitat: 'tide', defId: 'puddlewyrm', roomDef: 'tide_tank', label: 'Tide' },
  { habitat: 'sky', defId: 'dawn_finch', roomDef: 'aviary', label: 'Sky' },
  { habitat: 'gloom', defId: 'duskmouse', roomDef: 'gloom_hutch', label: 'Gloom' },
  { habitat: 'ember', defId: 'cinder_newt', roomDef: 'ember_pit', label: 'Ember' },
  { habitat: 'crystal', defId: 'inkling_wisp', roomDef: 'crystal_vivarium', label: 'Crystal' }
];

function touch(state: FullGameState): FullGameState {
  const next = structuredClone(state);
  next.debugUsed = true;
  next.debugCreatureIds = [...(next.debugCreatureIds || [])];
  next.debugRoomIds = [...(next.debugRoomIds || [])];
  next.debugCharacterIds = [...(next.debugCharacterIds || [])];
  next.debugExpeditionIds = [...(next.debugExpeditionIds || [])];
  return next;
}

function allocId(state: FullGameState): number {
  const ids = [
    ...state.rooms.map(r => r.id),
    ...state.creatures.map(c => c.id),
    ...state.characters.map(c => c.id),
    ...state.expeditions.map(e => e.id),
    ...(state.debugCreatureIds || []),
    ...(state.debugRoomIds || []),
    ...(state.debugCharacterIds || []),
    ...(state.debugExpeditionIds || [])
  ];
  return ids.reduce((m, n) => Math.max(m, Number.isFinite(n) ? n : 0), 0) + 1;
}

/** Same fields the engine writes when a lure or event adds a creature. */
export function makeDebugCreature(
  state: FullGameState,
  defId: string,
  status: CreatureInstance['status'],
  extra: Partial<CreatureInstance> = {}
): CreatureInstance {
  const def = CREATURE_DEFINITIONS[defId];
  const assignedTamer = status === 'wary' && extra.tamerId === undefined ? ensureDebugTamer(state) : extra.tamerId;
  const id = extra.id ?? allocId(state);
  const creature: CreatureInstance = {
    defId,
    nickname: extra.nickname || def?.name || defId,
    status,
    hungry: false,
    hatchProgress: status === 'egg' ? 0 : 100,
    tamingProgress: 0,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: state.day || 1,
    ...extra,
    id,
    tamerId: assignedTamer
  };
  if (assignedTamer === undefined) delete creature.tamerId;
  return creature;
}

/** A real faculty id. The engine only counts a tamer when tamerId is truthy (0 is the wizard-paw flag, not a review tamer). */
function ensureDebugTamer(state: FullGameState): number {
  const ids = new Set(state.debugCharacterIds || []);
  const existing = state.characters.find(c => ids.has(c.id) && c.career === 'tamer');
  if (existing) return existing.id;
  const id = allocId(state);
  const character: Character = {
    id,
    name: 'Debug Tamer',
    pronouns: 'they/them',
    appearance: { skin: '#F6D7C3', hair: 'short', hairColor: '#4A2E1E', robeColor: '#4E8B3A', hat: 'none' },
    personality: 'Gentle',
    traits: [],
    status: 'faculty',
    career: 'tamer',
    careerState: 'active',
    masteredSchools: [],
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: state.day || 1,
    chronicle: [],
    careerSetIds: []
  };
  state.characters = [...state.characters, character];
  state.debugCharacterIds = [...(state.debugCharacterIds || []), id];
  return id;
}

function rememberCreature(state: FullGameState, creature: CreatureInstance) {
  state.creatures = [...state.creatures, creature];
  state.debugCreatureIds = [...(state.debugCreatureIds || []), creature.id];
}

function habitatRoomDef(defId: string): string | undefined {
  const habitat = CREATURE_DEFINITIONS[defId]?.habitats?.[0];
  return HABITAT_SAMPLES.find(h => h.habitat === habitat)?.roomDef;
}

function builtRoom(state: FullGameState, defId: string): PlacedRoom | undefined {
  return state.rooms.find(r => r.defId === defId && r.state === 'built');
}

function placeDebugRoom(state: FullGameState, defId: string): string | undefined {
  if (builtRoom(state, defId)) return undefined;
  const def = ROOM_DEFINITIONS[defId];
  if (!def) return `Unknown room ${defId}.`;
  const spot = chooseSpot(state, defId);
  if (!spot) return `No free spot for ${def.name}.`;
  const roomId = allocId(state);
  const room: PlacedRoom = {
    id: roomId,
    defId,
    x: spot.x,
    y: spot.y,
    w: def.size[0],
    h: def.size[1],
    area: def.area,
    level: 1,
    state: 'built',
    buildRequired: def.buildReviews,
    buildProgress: def.buildReviews,
    buildPaused: false,
    cleanliness: 100,
    settings: {},
    furniture: [],
    spent: { mana: 0 },
    fromPlan: false
  };
  fillRequiredFixtures(room, allFurnitureIds(state.rooms));
  state.rooms = [...state.rooms, room];
  state.debugRoomIds = [...(state.debugRoomIds || []), roomId];
  if (!(state.knownPlans || []).includes(defId)) state.knownPlans = [...(state.knownPlans || []), defId];
  return undefined;
}

/** Prefer stacking the aviary above the study so the ground floor stays free for the other pens. */
function chooseSpot(state: FullGameState, defId: string): { x: number; y: number } | null {
  if (defId === 'aviary') {
    const grid = getGridSize(state);
    for (let y = 2; y + 2 <= grid.castleFloors; y++) {
      for (let x = 0; x < grid.castleCols; x++) {
        if (validatePlacement(state, defId, 'castle', x, y).valid) return { x, y };
      }
    }
  }
  const auto = findAutoPlacement(state, defId);
  return auto ? { x: auto.x, y: auto.y } : null;
}

export function spawnDebugCreature(
  state: FullGameState,
  defId: string,
  status: DebugCreatureStatus
): DebugResult {
  if (!CREATURE_DEFINITIONS[defId]) return { state, message: `Unknown species ${defId}.` };
  const next = touch(state);
  let placeNote = '';
  if (status !== 'loose' && status !== 'away' && status !== 'unhomed') {
    const roomDef = habitatRoomDef(defId);
    if (roomDef && !builtRoom(next, roomDef)) {
      const err = placeDebugRoom(next, roomDef);
      if (err) placeNote = ` ${err}`;
    }
  }
  const realStatus: CreatureInstance['status'] = status === 'unhomed' ? 'wary' : status;
  const room = status === 'unhomed' || status === 'loose' || status === 'away'
    ? undefined
    : builtRoom(next, habitatRoomDef(defId) || '');
  const creature = makeDebugCreature(next, defId, realStatus, {
    roomId: room?.id,
    debugUnhomed: status === 'unhomed' ? true : undefined,
    hatchProgress: realStatus === 'egg' ? 10 : 100
  });
  if (status === 'unhomed') delete creature.roomId;
  rememberCreature(next, creature);
  const label = status === 'unhomed' ? 'unhomed' : realStatus;
  return {
    state: next,
    creatureId: creature.id,
    message: placeNote
      ? `Spawned ${creature.nickname} (${label}).${placeNote}`
      : `Spawned ${creature.nickname} (${label}).`
  };
}

export function patchDebugCreature(
  state: FullGameState,
  creatureId: number,
  patch: {
    status?: DebugCreatureStatus;
    tamingPct?: number;
    hatchProgress?: number;
    bondLevel?: 0 | 1 | 2 | 3;
    hungry?: boolean;
  }
): DebugResult {
  const current = state.creatures.find(c => c.id === creatureId);
  if (!current) return { state, message: 'That creature is gone.' };
  const next = touch(state);
  next.creatures = next.creatures.map(c => {
    if (c.id !== creatureId) return c;
    let updated = { ...c };
    if (patch.status) {
      if (patch.status === 'unhomed') {
        updated.status = updated.status === 'tamed' ? 'tamed' : 'wary';
        updated.debugUnhomed = true;
        delete updated.roomId;
      } else {
        updated.status = patch.status;
        delete updated.debugUnhomed;
        if (patch.status === 'loose' || patch.status === 'away') delete updated.roomId;
      }
      if (updated.status === 'wary' && updated.tamerId === undefined) updated.tamerId = ensureDebugTamer(next);
    }
    if (patch.tamingPct !== undefined) {
      const req = Math.max(1, CREATURE_DEFINITIONS[updated.defId]?.tamingReviews || 1);
      updated.tamingProgress = Math.max(0, Math.min(req, (patch.tamingPct / 100) * req));
    }
    if (patch.hatchProgress !== undefined) {
      updated.hatchProgress = Math.max(0, Math.min(100, patch.hatchProgress));
    }
    if (patch.bondLevel !== undefined) {
      updated.bondLevel = patch.bondLevel;
      updated.bondProgress = 0;
    }
    if (patch.hungry !== undefined) updated.hungry = patch.hungry;
    return updated;
  });
  return { state: next, creatureId, message: 'Updated creature.' };
}

export function spawnHabitatSet(state: FullGameState): DebugResult {
  let next = touch(state);
  const notes: string[] = [];
  for (const sample of HABITAT_SAMPLES) {
    const err = placeDebugRoom(next, sample.roomDef);
    if (err) {
      notes.push(err);
      continue;
    }
    const room = builtRoom(next, sample.roomDef);
    const creature = makeDebugCreature(next, sample.defId, 'tamed', { roomId: room?.id });
    rememberCreature(next, creature);
  }
  const placed = HABITAT_SAMPLES.length - notes.length;
  return {
    state: next,
    message: notes.length
      ? `Spawned ${placed} habitat creatures. ${notes.join(' ')}`
      : 'Spawned one creature in each habitat.'
  };
}

/** 1×1 gloom hutch past the 6-cap, plus enough creatures to pass the global 40 cap. */
export function fillPensPastCap(state: FullGameState): DebugResult {
  const next = touch(state);
  const err = placeDebugRoom(next, 'gloom_hutch');
  if (err) return { state: next, message: err };
  const room = builtRoom(next, 'gloom_hutch');
  const add = (status: CreatureInstance['status'], n: number, hatch = 100) => {
    for (let i = 0; i < n; i++) {
      const creature = makeDebugCreature(next, 'duskmouse', status, {
        roomId: status === 'loose' ? undefined : room?.id,
        hatchProgress: hatch,
        nickname: `Cap ${status} ${state.creatures.length + next.creatures.length}`
      });
      if (status === 'loose') delete creature.roomId;
      rememberCreature(next, creature);
    }
  };
  add('tamed', 8);
  add('egg', 1, 40);
  add('loose', 1);
  add('tamed', 34);
  return {
    state: next,
    message: 'Filled the Gloom Hutch past 6 and the map past 40. Eggs and loose stay visible; the rest show +N.'
  };
}

function masterCount(state: FullGameState): number {
  return state.characters.filter(c => (c.masteredSchools?.length || 0) > 0).length + (state.alumniGallery?.length || 0);
}

function addDebugMaster(state: FullGameState, n: number) {
  const id = allocId(state);
  const character: Character = {
    id,
    name: `Debug Master ${n}`,
    pronouns: 'they/them',
    appearance: { skin: '#F6D7C3', hair: 'short', hairColor: '#4A2E1E', robeColor: '#6B4FBB', hat: 'none' },
    personality: 'Curious',
    traits: [],
    status: 'resident',
    masteredSchools: ['arcane'],
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: state.day || 1,
    chronicle: [],
    careerSetIds: []
  };
  state.characters = [...state.characters, character];
  state.debugCharacterIds = [...(state.debugCharacterIds || []), id];
}

function dropDebugMasters(state: FullGameState) {
  const ids = new Set(state.debugCharacterIds || []);
  state.characters = state.characters.filter(c => !ids.has(c.id));
  state.debugCharacterIds = [];
}

function ensureRiftRoom(state: FullGameState): string | undefined {
  return placeDebugRoom(state, 'rift_gate');
}

function setRiftLock(state: FullGameState, locked: boolean) {
  state.rooms = state.rooms.map(r => {
    if (r.defId !== 'rift_gate') return r;
    if (!locked) {
      if (!state.debugRiftLock) return r;
      const copy = { ...r };
      delete copy.lockedUntilReviewIndex;
      return copy;
    }
    return { ...r, lockedUntilReviewIndex: (state.reviewIndex || 0) + 1_000_000 };
  });
  state.debugRiftLock = locked;
}

function retireDebugExpeditions(state: FullGameState) {
  const ids = new Set(state.debugExpeditionIds || []);
  state.expeditions = state.expeditions.map(e => (ids.has(e.id) && e.state === 'active' ? { ...e, state: 'returned' as const } : e));
}

export function setRiftDebug(state: FullGameState, mode: RiftDebugMode, destinationId: string): DebugResult {
  const dest = RIFT_DESTINATIONS[destinationId] ? destinationId : 'crystal_caverns';
  const next = touch(state);
  const roomErr = ensureRiftRoom(next);
  if (roomErr && mode !== 'dormant') return { state: next, message: roomErr };

  if (mode === 'dormant') {
    dropDebugMasters(next);
    retireDebugExpeditions(next);
    if (masterCount(next) >= 3 && builtRoom(next, 'rift_gate')) setRiftLock(next, true);
    else setRiftLock(next, false);
    return { state: next, message: roomErr ? `Rift Gate is dormant. ${roomErr}` : 'Rift Gate set to dormant.' };
  }

  setRiftLock(next, false);
  while (masterCount(next) < 3) addDebugMaster(next, (next.debugCharacterIds || []).length + 1);
  retireDebugExpeditions(next);

  if (mode === 'open') {
    const blocking = next.expeditions.some(e => e.state === 'active');
    return {
      state: next,
      message: blocking
        ? 'A real expedition is still out, so the gate stays expedition-out.'
        : 'Rift Gate set to open.'
    };
  }

  const id = allocId(next);
  const teamIds = next.characters.slice(0, 3).map(c => c.id);
  const companionId = next.creatures.find(c => c.status === 'tamed')?.id;
  if (mode === 'expedition_out') {
    next.expeditions = [...next.expeditions, {
      id,
      destinationId: dest,
      teamIds,
      companionId,
      suppliesTaken: [],
      partySkillDays: 10,
      chance: 80,
      fortune: 1,
      roll: 10,
      wrongRoll: 90,
      progressReviews: 1,
      requiredReviews: 1_000_000,
      state: 'active'
    }];
    next.debugExpeditionIds = [...(next.debugExpeditionIds || []), id];
    return { state: next, message: `Expedition out: ${RIFT_DESTINATIONS[dest].name}.` };
  }

  const active = next.expeditions.find(e => e.state === 'active' && (next.debugExpeditionIds || []).includes(e.id));
  if (active) {
    next.expeditions = next.expeditions.map(e => (e.id === active.id ? { ...e, state: 'returned' as const } : e));
    return { state: next, message: 'Expedition returned. The gate flares for 1.5s unless Reduce Motion is on.' };
  }
  next.expeditions = [...next.expeditions, {
    id,
    destinationId: dest,
    teamIds,
    companionId,
    suppliesTaken: [],
    partySkillDays: 10,
    chance: 80,
    fortune: 1,
    roll: 10,
    wrongRoll: 90,
    progressReviews: 1,
    requiredReviews: 1_000_000,
    state: 'returned'
  }];
  next.debugExpeditionIds = [...(next.debugExpeditionIds || []), id];
  return { state: next, message: 'Marked the debug expedition returned.' };
}

/** The same function the reviewer and the Anki bridge use, once per honest review. */
export function simulateHonestReviews(state: FullGameState, count: number): DebugResult {
  const n = Math.max(0, Math.floor(count));
  let cur: FullGameState = { ...state, debugUsed: true };
  const cardIds = Object.keys(cur.allCards || {}).map(Number).filter(id => Number.isFinite(id));
  const fallback = cardIds[0] ?? 1;
  for (let i = 0; i < n; i++) {
    const cardId = cardIds.length ? cardIds[i % cardIds.length] : fallback;
    cur = AnkicasterEngine.applyHonestReview(cur, cardId, 3, 2000).state;
  }
  return { state: cur, message: `Ran ${n} honest reviews through the normal review path.` };
}

export function clearDebugCreatures(state: FullGameState): DebugResult {
  const next = touch(state);
  const creatures = new Set(next.debugCreatureIds || []);
  const rooms = new Set(next.debugRoomIds || []);
  const characters = new Set(next.debugCharacterIds || []);
  const expeditions = new Set(next.debugExpeditionIds || []);
  next.creatures = next.creatures.filter(c => !creatures.has(c.id));
  next.characters = next.characters.filter(c => !characters.has(c.id));
  next.expeditions = next.expeditions.filter(e => !expeditions.has(e.id));
  next.rooms = next.rooms
    .filter(r => !rooms.has(r.id))
    .map(r => {
      if (!next.debugRiftLock || r.defId !== 'rift_gate') return r;
      const copy = { ...r };
      delete copy.lockedUntilReviewIndex;
      return copy;
    });
  next.debugCreatureIds = [];
  next.debugRoomIds = [];
  next.debugCharacterIds = [];
  next.debugExpeditionIds = [];
  next.debugRiftLock = false;
  return { state: next, message: 'Cleared debug creatures, pens, and rift stand-ins. This save stays marked.' };
}
