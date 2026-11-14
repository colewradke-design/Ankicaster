/**
 * Preview-only creature debug actions.
 * Not imported by the add-on bundle. Real play never calls these.
 * Creatures use the same instance shape the engine pushes. Reviews go through
 * AnkicasterEngine.applyHonestReview. Rooms use the engine's placement checks,
 * then are marked built without charging materials (this save is tagged debugUsed).
 */
import {
  CREATURE_DEFINITIONS,
  FURNITURE_DEFINITIONS,
  POTION_RECIPES,
  RIFT_DESTINATIONS,
  ROOM_DEFINITIONS,
  SCHOOL_EVENTS,
  SPELL_DEFINITIONS
} from '../data/content';
import type {
  CareerType,
  Character,
  CreatureInstance,
  FullGameState,
  HabitatType,
  InjuryType,
  PlacedRoom,
  SchoolType
} from '../types/ankicaster';
import { AnkicasterEngine } from '../utils/engine';
import { findAutoPlacement, getGridSize, validatePlacement } from '../utils/placement';
import { allFurnitureIds, fillRequiredFixtures } from '../utils/requiredFurniture';
import { ONE_BY_ONE_PEN_CAP, penCreatureCapacity, syncDiscoveredCreatures } from '../utils/creatures';
import { SKIN_TONES, HAIR_COLOURS, HAIR_STYLES } from '../utils/appearance';
import { VisualEventType, VISUAL_EVENT_CATALOGUE, emitVisualPreview } from '../visual/events/visualEvents';
import type { VisualWorld } from '../visual/world/VisualWorld';

export const SCHOOL_HEX: Record<SchoolType, string> = {
  arcane: '#6B4FBB',
  nature: '#4E8B3A',
  light: '#E8C547',
  shadow: '#2F3A73',
  alchemy: '#B5651D'
};

function randomStudentAppearance(school: SchoolType, rng: () => number = Math.random): Character['appearance'] {
  return {
    skin: SKIN_TONES[Math.floor(rng() * SKIN_TONES.length)] || SKIN_TONES[0],
    hair: HAIR_STYLES[Math.floor(rng() * HAIR_STYLES.length)]?.id || 'short',
    hairColor: HAIR_COLOURS[Math.floor(rng() * HAIR_COLOURS.length)]?.color || '#4A2E1E',
    robeColor: SCHOOL_HEX[school] || '#6B4FBB',
    hat: 'cap'
  };
}

export type DebugCreatureStatus = CreatureInstance['status'] | 'unhomed';

export type RiftDebugMode = 'dormant' | 'open' | 'expedition_out' | 'returning';

export interface DebugResult {
  state: FullGameState;
  message: string;
  creatureId?: number;
  characterId?: number;
}

export const HABITAT_SAMPLES: Array<{ habitat: HabitatType; defId: string; roomDef: string; label: string }> = [
  { habitat: 'meadow', defId: 'mossback_tortoise', roomDef: 'meadow_paddock', label: 'Meadow' },
  { habitat: 'tide', defId: 'puddlewyrm', roomDef: 'tide_tank', label: 'Tide' },
  { habitat: 'sky', defId: 'dawn_finch', roomDef: 'aviary', label: 'Sky' },
  { habitat: 'gloom', defId: 'duskmouse', roomDef: 'gloom_hutch', label: 'Gloom' },
  { habitat: 'ember', defId: 'cinder_newt', roomDef: 'ember_pit', label: 'Ember' },
  { habitat: 'crystal', defId: 'inkling_wisp', roomDef: 'crystal_vivarium', label: 'Crystal' }
];

export const ALL_SCHOOLS: SchoolType[] = ['arcane', 'nature', 'light', 'shadow', 'alchemy'];
export const ALL_CAREERS: CareerType[] = ['teacher', 'scholar', 'gardener', 'tamer', 'healer', 'warder', 'alchemist', 'builder', 'adventurer'];
export const ALL_INJURIES: InjuryType[] = ['bruised', 'sprained', 'hexed', 'broken_bone', 'rift_touched'];
export const ALL_HAZARD_TYPES: Array<NonNullable<PlacedRoom['hazard']>['type']> = [
  'spill_of_night',
  'hex_fog',
  'echo_loop',
  'cold_snap',
  'breach'
];

function touch(state: FullGameState): FullGameState {
  const next = structuredClone(state);
  next.debugUsed = true;
  next.debugCreatureIds = [...(next.debugCreatureIds || [])];
  next.debugRoomIds = [...(state.debugRoomIds || [])];
  next.debugCharacterIds = [...(state.debugCharacterIds || [])];
  next.debugExpeditionIds = [...(state.debugExpeditionIds || [])];
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
  syncDiscoveredCreatures(state);
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

/** 1×1 gloom hutch past its capacity, plus enough creatures to pass the global 40 cap. */
export function fillPensPastCap(state: FullGameState): DebugResult {
  const next = touch(state);
  const err = placeDebugRoom(next, 'gloom_hutch');
  if (err) return { state: next, message: err };
  const room = builtRoom(next, 'gloom_hutch');
  const cap = room ? penCreatureCapacity(room) : ONE_BY_ONE_PEN_CAP;
  const add = (status: CreatureInstance['status'], n: number, hatch = 100, defId = 'velvet_bat_swarm') => {
    for (let i = 0; i < n; i++) {
      const creature = makeDebugCreature(next, defId, status, {
        roomId: status === 'loose' ? undefined : room?.id,
        hatchProgress: hatch,
        nickname: `Cap ${status} ${state.creatures.length + next.creatures.length}`
      });
      if (status === 'loose') delete creature.roomId;
      rememberCreature(next, creature);
    }
  };
  add('wary', 8);
  add('egg', 1, 40, 'duskmouse');
  add('loose', 1, 100, 'duskmouse');
  add('tamed', 34, 100, 'bramblefox');
  return {
    state: next,
    message: `Filled the Gloom Hutch past ${cap} and the map past 40. Eggs and loose stay visible; the rest show +N.`
  };
}

export function setDiscoveryDebug(state: FullGameState, mode: 'all' | 'reset'): DebugResult {
  const next = touch(state);
  if (mode === 'all') {
    next.discoveredCreatures = Object.keys(CREATURE_DEFINITIONS);
    return { state: next, message: 'Bestiary unlocked: all 40 species discovered.' };
  }
  next.discoveredCreatures = [];
  syncDiscoveredCreatures(next);
  return {
    state: next,
    message: `Reset Bestiary discoveries (${(next.discoveredCreatures || []).length} currently in Academy kept).`
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

// ============================================================================
// PART C.2 — PEOPLE DEBUG TOOLS
// ============================================================================

const DEBUG_NAMES = [
  'Aurelia Vance', 'Caspian Thorne', 'Lyra Sterling', 'SorenAshford',
  'Mireille Dusk', 'Orion Finch', 'Tamsin Vale', 'Rowan Kestrel',
  'Evander Voss', 'Sylvie Lark', 'Gideon Frost', 'Briar Solis'
];

/**
 * Force-enroll a student bypassing mana, bed, and free-card requirements
 * (creates/links fake card ids if needed).
 */
export function debugForceEnrollStudent(
  state: FullGameState,
  school: SchoolType = 'arcane',
  customName?: string
): DebugResult {
  const next = touch(state);
  const charId = allocId(next);
  const setId = charId * 10 + 1;
  const fakeCards: number[] = [];
  const baseCardId = 900_000 + charId * 50;
  for (let i = 0; i < 30; i++) {
    const cid = baseCardId + i;
    fakeCards.push(cid);
    next.allCards[cid] = {
      id: cid,
      nid: cid,
      deckName: 'Debug',
      front: `Debug Card ${cid}`,
      back: `Answer ${cid}`,
      ivl: 10,
      lastAnswerIvl: 10,
      honestIvl: 10,
      type: 2,
      queue: 2,
      due: 0,
      lastStudiedMs: Date.now()
    };
  }
  next.cardSets.push({
    id: setId,
    characterId: charId,
    kind: 'study',
    school,
    size: 30,
    createdDay: next.day,
    released: false,
    cardIds: fakeCards
  });

  const classroom = next.rooms.find(r => r.state === 'built' && r.defId.startsWith('classroom_'));
  const dorm = next.rooms.find(r => r.state === 'built' && (r.defId === 'dormitory' || r.defId === 'grand_dormitory'));
  const hall = next.rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall');

  const name = customName?.trim() || DEBUG_NAMES[next.characters.length % DEBUG_NAMES.length];
  const student: Character = {
    id: charId,
    name,
    pronouns: 'they/them',
    appearance: randomStudentAppearance(school, Math.random),
    personality: 'Curious',
    traits: ['Focused'],
    status: 'student',
    currentSchool: school,
    masteredSchools: [],
    needs: { hunger: 90, rest: 90, leisure: 85, composure: 90, health: 100 },
    morale: 85,
    readyDays: { [school]: 0 },
    enrolledDay: next.day,
    chronicle: [{ day: next.day, text: `Force-enrolled in ${school.toUpperCase()} via Debug Tools.` }],
    studySetId: setId,
    careerSetIds: [],
    seatRoomId: classroom?.id,
    bedRoomId: dorm?.id
  };

  next.characters.push(student);
  next.debugCharacterIds = [...(next.debugCharacterIds || []), charId];
  next.notices.push({
    id: `enroll-debug-${charId}-${Date.now()}`,
    time: Date.now(),
    type: 'enroll',
    text: `🎓 ${student.name} enrolled in ${school.toUpperCase()} (Debug)!`,
    data: {
      characterIds: [charId],
      roomId: hall?.id ?? classroom?.id,
      school,
      visualEventType: 'student_enrolled'
    }
  });

  return {
    state: next,
    characterId: charId,
    message: `Enrolled ${student.name} in ${school}.`
  };
}

export function debugForceEnrollFiveStudents(state: FullGameState, school: SchoolType = 'arcane'): DebugResult {
  let cur = state;
  let lastId: number | undefined;
  for (let i = 0; i < 5; i++) {
    const sch = i === 0 ? school : ALL_SCHOOLS[(ALL_SCHOOLS.indexOf(school) + i) % ALL_SCHOOLS.length];
    const res = debugForceEnrollStudent(cur, sch);
    cur = res.state;
    lastId = res.characterId;
  }
  return {
    state: cur,
    characterId: lastId,
    message: 'Force-enrolled +5 students across schools.'
  };
}

export function debugUpdateCharacter(
  state: FullGameState,
  charId: number,
  patch: {
    status?: Character['status'];
    currentSchool?: SchoolType;
    toggleMasteredSchool?: SchoolType;
    career?: CareerType | 'none';
    workplaceRoomId?: number | null;
    readySchool?: SchoolType;
    readyDays?: number;
    injuryType?: InjuryType | 'none';
    injuryPoints?: number;
    injuryRequired?: number;
    morale?: number;
    needs?: Partial<Character['needs']>;
    needsPreset?: 'all_100' | 'all_20';
  }
): DebugResult {
  const next = touch(state);
  const char = next.characters.find(c => c.id === charId);
  if (!char) return { state, message: 'Character not found.' };

  if (patch.status !== undefined) {
    char.status = patch.status;
  }
  if (patch.currentSchool !== undefined) {
    char.currentSchool = patch.currentSchool;
  }
  if (patch.toggleMasteredSchool !== undefined) {
    const s = patch.toggleMasteredSchool;
    if (char.masteredSchools.includes(s)) {
      char.masteredSchools = char.masteredSchools.filter(m => m !== s);
    } else {
      char.masteredSchools = [...char.masteredSchools, s];
      char.appearance.robeColor = SCHOOL_HEX[s] || char.appearance.robeColor;
    }
  }
  if (patch.career !== undefined) {
    if (patch.career === 'none') {
      delete char.career;
      delete char.careerState;
      delete char.workplaceRoomId;
    } else {
      char.career = patch.career;
      char.careerState = 'active';
      char.status = patch.career === 'adventurer' ? 'resident' : 'faculty';
    }
  }
  if (patch.workplaceRoomId !== undefined) {
    if (patch.workplaceRoomId === null) delete char.workplaceRoomId;
    else char.workplaceRoomId = patch.workplaceRoomId;
  }
  if (patch.readySchool !== undefined && patch.readyDays !== undefined) {
    char.readyDays = { ...(char.readyDays || {}), [patch.readySchool]: Math.max(0, Math.min(60, patch.readyDays)) };
  }
  if (patch.injuryType !== undefined) {
    if (patch.injuryType === 'none') {
      delete char.injury;
      char.needs.health = 100;
    } else {
      char.injury = {
        type: patch.injuryType,
        points: patch.injuryPoints ?? 0,
        required: patch.injuryRequired ?? 100
      };
    }
  }
  if (patch.morale !== undefined) {
    char.morale = Math.max(0, Math.min(100, patch.morale));
  }
  if (patch.needs) {
    char.needs = { ...char.needs, ...patch.needs };
  }
  if (patch.needsPreset === 'all_100') {
    char.morale = 100;
    char.needs = { hunger: 100, rest: 100, leisure: 100, composure: 100, health: 100 };
  } else if (patch.needsPreset === 'all_20') {
    char.morale = 20;
    char.needs = { hunger: 20, rest: 20, leisure: 20, composure: 20, health: 20 };
  }

  return { state: next, characterId: charId, message: `Updated ${char.name}.` };
}

export function debugMakeMasteryReady(state: FullGameState, charId: number): DebugResult {
  const next = touch(state);
  const char = next.characters.find(c => c.id === charId);
  if (!char) return { state, message: 'Character not found.' };
  const sch = char.currentSchool || 'arcane';
  char.currentSchool = sch;
  char.status = 'student';
  char.readyDays = { ...(char.readyDays || {}), [sch]: 30 };
  // Also make their study card set mastery-ready (ivl >= 21) so isMasteryReady returns true
  if (char.studySetId) {
    const set = next.cardSets.find(s => s.id === char.studySetId);
    if (set) {
      for (const cid of set.cardIds) {
        if (next.allCards[cid]) {
          next.allCards[cid].honestIvl = 25;
          next.allCards[cid].ivl = 25;
        }
      }
    }
  }
  next.notices.push({
    id: `mastery-ready-${char.id}-${Date.now()}`,
    time: Date.now(),
    type: 'mastery',
    text: `🌟 ${char.name} has reached 30 Ready Days in ${sch.toUpperCase()}! Ready for Mastery Graduation.`,
    data: {
      characterIds: [char.id],
      roomId: char.seatRoomId ?? char.bedRoomId,
      school: sch,
      visualEventType: 'mastery_ready'
    }
  });
  return { state: next, characterId: charId, message: `${char.name} is now mastery-ready in ${sch} (30/30 days).` };
}

export function debugGrantMasteryNow(state: FullGameState, charId: number): DebugResult {
  const next = touch(state);
  const char = next.characters.find(c => c.id === charId);
  if (!char) return { state, message: 'Character not found.' };
  const sch = char.currentSchool || ALL_SCHOOLS.find(s => !char.masteredSchools.includes(s)) || 'arcane';
  if (!char.masteredSchools.includes(sch)) {
    char.masteredSchools = [...char.masteredSchools, sch];
  }
  char.status = 'resident';
  char.currentSchool = undefined;
  char.appearance.robeColor = SCHOOL_HEX[sch] || char.appearance.robeColor;
  char.appearance.hat = 'pointed';
  next.renown += 25;
  const hall = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built');
  next.notices.push({
    id: `grad-${char.id}-${Date.now()}`,
    time: Date.now(),
    type: 'graduation',
    text: `🎓 ${char.name} graduated as a Master of ${sch.toUpperCase()}!`,
    data: {
      characterIds: [char.id],
      roomId: hall?.id ?? char.seatRoomId,
      school: sch,
      visualEventType: 'mastery_granted'
    }
  });
  return { state: next, characterId: charId, message: `Granted ${sch} mastery to ${char.name}!` };
}

export function debugRetireCharacterNow(state: FullGameState, charId: number): DebugResult {
  const touched = touch(state);
  const char = touched.characters.find(c => c.id === charId);
  if (!char) return { state, message: 'Character not found.' };
  if (char.status === 'student') {
    char.status = 'resident';
  }
  if (char.masteredSchools.length === 0) {
    char.masteredSchools = [char.currentSchool || 'arcane'];
  }
  const threshold = (touched.settings.retirementAgeDays || 90) + 10;
  let charSets = touched.cardSets.filter(s => s.characterId === charId);
  if (charSets.length === 0) {
    const fakeCid = 980_000 + charId;
    touched.allCards[fakeCid] = {
      id: fakeCid,
      nid: fakeCid,
      deckName: 'Debug',
      front: 'Debug Card',
      back: 'Answer',
      ivl: threshold,
      lastAnswerIvl: threshold,
      honestIvl: threshold,
      type: 2,
      queue: 2,
      due: 0,
      lastStudiedMs: Date.now()
    };
    const fakeSet = {
      id: 980_000 + charId,
      characterId: charId,
      kind: 'study' as const,
      school: char.masteredSchools[0],
      size: 1,
      createdDay: touched.day,
      released: false,
      cardIds: [fakeCid]
    };
    touched.cardSets.push(fakeSet);
    charSets = [fakeSet];
  } else {
    for (const s of charSets) {
      for (const cid of s.cardIds) {
        if (touched.allCards[cid]) {
          touched.allCards[cid].honestIvl = threshold;
          touched.allCards[cid].ivl = threshold;
        }
      }
    }
  }
  const res = AnkicasterEngine.retireCharacter(touched, charId);
  if (res.success) {
    return { state: res.state, message: `Retired ${char.name} to the Alumni Gallery.` };
  }
  return { state: touched, message: res.error || 'Could not retire character.' };
}

export function debugDeleteCharacter(state: FullGameState, charId: number): DebugResult {
  const next = touch(state);
  const char = next.characters.find(c => c.id === charId);
  if (!char) return { state, message: 'Character not found.' };
  next.characters = next.characters.filter(c => c.id !== charId);
  return { state: next, message: `Deleted ${char.name}.` };
}

// ============================================================================
// PART C.3 — EVENTS & HAZARDS DEBUG TOOLS
// ============================================================================

export function debugTriggerSchoolEvent(state: FullGameState, eventId: string): DebugResult {
  const next = touch(state);
  const evt = SCHOOL_EVENTS.find(e => e.id === eventId);
  const targetId = evt ? evt.id : (eventId || SCHOOL_EVENTS[0]?.id || 'owl_post');
  const targetName = evt ? evt.name : targetId;
  if (!next.activeEvents.some(e => e.eventId === targetId)) {
    next.activeEvents = [...next.activeEvents, { eventId: targetId, dayArrived: next.day }];
  }
  const hall = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built');
  next.notices.push({
    id: `debug-evt-spawn-${targetId}-${Date.now()}`,
    time: Date.now(),
    type: 'event',
    text: `🦉 Messenger owl arrived with "${targetName}"!`,
    data: {
      eventId: targetId,
      roomId: hall?.id,
      visualEventType: 'school_event_spawned'
    }
  });
  return { state: next, message: `Triggered school event: ${targetName}.` };
}

export function debugClearAllEvents(state: FullGameState): DebugResult {
  const next = touch(state);
  next.activeEvents = [];
  return { state: next, message: 'Cleared all active school events.' };
}

const HAZARD_LABELS: Record<NonNullable<PlacedRoom['hazard']>['type'], string> = {
  spill_of_night: 'Spill of Night',
  hex_fog: 'Hex Fog',
  echo_loop: 'Echo Loop',
  cold_snap: 'Cold Snap',
  breach: 'Veil Breach'
};

export function debugSetRoomHazard(
  state: FullGameState,
  roomId: number,
  hazardType: NonNullable<PlacedRoom['hazard']>['type'] | 'clear'
): DebugResult {
  const next = touch(state);
  const room = next.rooms.find(r => r.id === roomId);
  if (!room) return { state, message: 'Room not found.' };
  if (hazardType === 'clear') {
    room.hazard = undefined;
    next.notices.push({
      id: `debug-haz-clear-${roomId}-${Date.now()}`,
      time: Date.now(),
      type: 'hazard',
      text: `Cleared hazard in ${ROOM_DEFINITIONS[room.defId]?.name || room.defId}.`,
      data: { roomId, visualEventType: 'hazard_cleared' }
    });
    return { state: next, message: `Cleared hazard in room #${roomId}.` };
  }
  room.hazard = {
    type: hazardType,
    name: HAZARD_LABELS[hazardType] || hazardType,
    description: `${HAZARD_LABELS[hazardType]} in room`,
    effect: 'Room output impaired until cleared.'
  };
  return { state: next, message: `Set ${HAZARD_LABELS[hazardType]} on ${ROOM_DEFINITIONS[room.defId]?.name || room.defId}.` };
}

export function debugClearAllHazards(state: FullGameState): DebugResult {
  const next = touch(state);
  for (const r of next.rooms) {
    r.hazard = undefined;
  }
  return { state: next, message: 'Cleared all room hazards.' };
}

export function debugTriggerExpeditionOutcome(
  state: FullGameState,
  outcome: 'safe' | 'minor_injury' | 'serious_injury' | 'curse' | 'retreat',
  expeditionIdOrHeroIds?: number | number[]
): DebugResult {
  const next = touch(state);
  const expeditionId = typeof expeditionIdOrHeroIds === 'number' ? expeditionIdOrHeroIds : undefined;
  const heroIds = Array.isArray(expeditionIdOrHeroIds) ? expeditionIdOrHeroIds : undefined;

  let exp = expeditionId
    ? next.expeditions.find(e => e.id === expeditionId)
    : next.expeditions.find(e => e.state === 'active');

  const chosenTeamIds =
    heroIds && heroIds.length > 0
      ? heroIds
      : exp?.teamIds?.length
      ? exp.teamIds
      : next.characters.slice(0, 2).map(c => c.id);

  if (!exp) {
    exp = {
      id: allocId(next),
      destinationId: 'crystal_caverns',
      teamIds: chosenTeamIds,
      suppliesTaken: [],
      partySkillDays: 10,
      chance: 80,
      fortune: 1,
      roll: 10,
      wrongRoll: 50,
      progressReviews: 100,
      requiredReviews: 100,
      state: 'active'
    };
    next.expeditions.push(exp);
  } else if (heroIds && heroIds.length > 0) {
    exp.teamIds = chosenTeamIds;
  }

  exp.state = 'returned';
  exp.outcome = outcome;

  const teamChars = next.characters.filter(c => exp!.teamIds.includes(c.id));
  for (const tc of teamChars) {
    tc.status = tc.career && tc.career !== 'adventurer' ? 'faculty' : (tc.masteredSchools.length > 0 ? 'resident' : 'student');
    if (outcome === 'minor_injury') {
      tc.injury = { type: 'sprained', points: 0, required: 60 };
    } else if (outcome === 'serious_injury') {
      tc.injury = { type: 'broken_bone', points: 0, required: 150 };
    } else if (outcome === 'curse') {
      tc.injury = { type: 'hexed', points: 0, required: 100 };
    }
  }

  const riftRoom = next.rooms.find(r => r.defId === 'rift_gate' && r.state === 'built');
  const infirmary = next.rooms.find(r => r.defId === 'infirmary' && r.state === 'built');
  const visualEventType: VisualEventType =
    outcome === 'safe'
      ? 'expedition_return_safe'
      : outcome === 'retreat'
      ? 'expedition_retreat'
      : outcome === 'curse'
      ? 'expedition_return_curse'
      : outcome === 'minor_injury'
      ? 'expedition_minor_injury'
      : 'expedition_serious_injury';

  next.notices.push({
    id: `debug-exp-${exp.id}-${Date.now()}`,
    time: Date.now(),
    type: 'expedition',
    text: `Expedition returned with outcome: ${outcome}.`,
    data: {
      roomId: outcome === 'safe' || outcome === 'retreat' ? riftRoom?.id : (infirmary?.id ?? riftRoom?.id),
      characterIds: exp.teamIds,
      outcome,
      visualEventType
    }
  });

  return { state: next, message: `Triggered expedition outcome: ${outcome}.` };
}

type PreviewVignetteListener = (type: VisualEventType, roomId?: number) => void;
const previewListeners = new Set<PreviewVignetteListener>();

export function onDebugPreviewVignette(cb: PreviewVignetteListener): () => void {
  previewListeners.add(cb);
  return () => previewListeners.delete(cb);
}

/**
 * Pure visual preview helper: queues/plays a vignette in VisualWorld for any VisualEventType
 * WITHOUT mutating FullGameState at all (satisfies VR-01 and Test #6).
 */
export function previewVisualEventInWorld(
  world: VisualWorld,
  state: FullGameState,
  type: VisualEventType,
  roomId?: number
) {
  const fallbackId = roomId ?? state.rooms.find(r => r.defId === 'entrance_hall')?.id ?? 1;
  world.eventDispatcher.triggerPreview(type, fallbackId, world.clockMs);
  if (type === 'day_tick_paid') {
    world.veilRippleUntilMs = world.clockMs + 1500;
  } else if (type === 'day_tick_unpaid') {
    world.veilDimUntilMs = world.clockMs + 1000;
  }
  world.renderAtmosphereAndLighting();
  world.renderEventVignettes();
}

export function debugFirePreviewVignette(
  state: FullGameState,
  type: VisualEventType,
  roomId?: number
): DebugResult {
  if (!VISUAL_EVENT_CATALOGUE[type]) {
    return { state, message: `Unknown visual event type: ${type}` };
  }
  emitVisualPreview(type, roomId);
  if (previewListeners.size > 0) {
    for (const cb of previewListeners) cb(type, roomId);
  }
  return { state, message: `Fired visual vignette preview: ${type} (no state change).` };
}

// ============================================================================
// PART C.4 — ATMOSPHERE DEBUG TOOLS
// ============================================================================

export function debugSetTimeOverride(
  state: FullGameState,
  hours: number | null
): DebugResult {
  const next = touch(state);
  next.debugTimeHours = hours === null ? null : Math.max(0, Math.min(24, hours));
  return {
    state: next,
    message: hours === null ? 'Reset to real clock.' : `Time override set to ${hours.toFixed(1)}h.`
  };
}

export function debugSetVeilStrength(
  state: FullGameState,
  strength: number
): DebugResult {
  const next = touch(state);
  next.veil.strength = Math.max(0, Math.min(100, Math.round(strength)));
  return {
    state: next,
    message: `Veil strength set to ${next.veil.strength}%.`
  };
}

export function debugRunDayTick(
  state: FullGameState,
  paid: boolean
): DebugResult {
  const next = touch(state);
  const upkeep = next.veil.costToday || 50;
  if (paid && next.mana < upkeep) {
    next.mana = upkeep + 100;
  } else if (!paid) {
    next.mana = 0;
  }
  const ticked = AnkicasterEngine.triggerDayTick(next).state;
  return {
    state: ticked,
    message: `Ran Day Tick (${paid ? 'Paid' : 'Unpaid'}).`
  };
}

// ============================================================================
// PART C.5 — ACADEMY DEBUG TOOLS
// ============================================================================

export function debugGrantAllResources(state: FullGameState): DebugResult {
  const next = touch(state);
  next.mana += 1000;
  const keys = [
    'timber', 'stone', 'glass', 'cloth', 'provisions', 'greens', 'fish', 'nectar',
    'herbs', 'insight', 'radiance', 'umbra', 'reagents', 'crystal', 'starmetal',
    'sunstone', 'void_pearl', 'ember_salt', 'moonsilk', 'phoenix_ash', 'heartwood', 'golem_core'
  ] as const;
  const bag = next.resources as unknown as Record<string, number>;
  for (const k of keys) {
    bag[k] = (bag[k] || 0) + 200;
  }
  return { state: next, message: 'Granted +1,000 Mana and +200 of all materials.' };
}

export function debugSetResourceAmount(
  state: FullGameState,
  resourceKey: 'mana' | string,
  amount: number
): DebugResult {
  const next = touch(state);
  const val = Math.max(0, Math.floor(amount));
  if (resourceKey === 'mana') {
    next.mana = val;
  } else {
    (next.resources as unknown as Record<string, number>)[resourceKey] = val;
  }
  return { state: next, message: `Set ${resourceKey} to ${val}.` };
}

export function debugSetWizardSchoolLevel(
  state: FullGameState,
  school: SchoolType,
  level: number
): DebugResult {
  const next = touch(state);
  next.wizard.levels[school] = Math.max(0, Math.min(10, Math.floor(level)));
  return { state: next, message: `Set Wizard ${school} level to ${next.wizard.levels[school]}.` };
}

export function debugLearnAllSpells(state: FullGameState): DebugResult {
  const next = touch(state);
  next.wizard.knownSpells = Object.keys(SPELL_DEFINITIONS);
  next.wizard.spellCooldowns = {};
  return { state: next, message: `Learned all ${next.wizard.knownSpells.length} spells.` };
}

export function debugUnlockAllBlueprintsAndRecipes(state: FullGameState): DebugResult {
  const next = touch(state);
  next.knownPlans = Object.keys(ROOM_DEFINITIONS);
  next.roomPlans = { ...(next.roomPlans || {}) };
  for (const id of Object.keys(ROOM_DEFINITIONS)) {
    next.roomPlans[id] = Math.max(next.roomPlans[id] || 0, 5);
  }
  next.knownPatterns = Object.keys(FURNITURE_DEFINITIONS);
  next.potions = next.potions.map(p => ({ ...p, discovered: true }));
  const existingPotionIds = new Set(next.potions.map(p => p.id));
  for (const rec of POTION_RECIPES) {
    if (!existingPotionIds.has(rec.id)) {
      next.potions.push({ ...rec, discovered: true });
    }
  }
  return { state: next, message: 'Unlocked all room blueprints, furniture patterns, and potion recipes.' };
}

export function debugAdvanceBells(state: FullGameState, count: number): DebugResult {
  const next = touch(state);
  const n = Math.max(1, Math.floor(count));
  for (let i = 0; i < n; i++) {
    next.bellIndex += 1;
    AnkicasterEngine.ringBell(next, []);
  }
  return { state: next, message: `Advanced +${n} bell(s).` };
}

export function debugCompleteAllConstruction(state: FullGameState): DebugResult {
  const next = touch(state);
  const sites = next.rooms.filter(r => r.state === 'site');
  for (const site of sites) {
    site.buildProgress = site.buildRequired;
    AnkicasterEngine.completeSite(next, site);
  }
  return {
    state: next,
    message: sites.length > 0 ? `Completed ${sites.length} construction site(s).` : 'No active construction sites.'
  };
}

