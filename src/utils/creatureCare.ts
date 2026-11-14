/**
 * Creature meals, hunger, escape, and recapture.
 *
 * Billed at a meal (every 5th bell), after characters, in creature-id order:
 * wary and tamed only. Eggs are not alive yet. Loose creatures are already
 * unpaid and unbuffed. Away creatures are not in the castle: their hunger
 * freezes. A diet is all-or-nothing. Hungry halves the buff that creature gives.
 *
 * Escape rolls once per bell for wary and tamed creatures. Danger is rarity.
 * Hunger, a missing pen, and a filthy pen raise the chance. Bond, an assigned
 * tamer, and a level-3 Menagerie (wary only) lower it. A tamer goes after a
 * loose creature; capture time depends on danger, whether they are actually a
 * tamer, and school affinity with the creature.
 */

import {
  CreatureInstance,
  CreatureRarity,
  FullGameState,
  PlacedRoom,
  SchoolType
} from '../types/ankicaster';
import { CREATURE_DEFINITIONS, FURNITURE_DEFINITIONS } from '../data/content';
import { careerAffinityMultiplier, wizardMasteredSchools } from './formulas';
import { resolveAllCreatureRooms } from './creatures';
import { logResourceChange } from './resourceReport';

export const MANUAL_FEED_BOND = 2;

const DANGER: Record<CreatureRarity, number> = {
  common: 1,
  uncommon: 2,
  rare: 3,
  epic: 4,
  legendary: 5
};

const ESCAPE_BASE: Record<CreatureRarity, { wary: number; tamed: number }> = {
  common: { wary: 0.015, tamed: 0.002 },
  uncommon: { wary: 0.015, tamed: 0.002 },
  rare: { wary: 0.02, tamed: 0.0025 },
  epic: { wary: 0.025, tamed: 0.003 },
  legendary: { wary: 0.03, tamed: 0.003 }
};

export function creatureDanger(rarity: CreatureRarity | undefined): number {
  return rarity ? DANGER[rarity] : 1;
}

export function buffScale(hungry: boolean): number {
  return hungry ? 0.5 : 1;
}

/** 0 if nobody of this species is tamed. 1 if any fed copy remains. 0.5 if every copy is hungry. */
export function bestBuffScale(creatures: CreatureInstance[], defId: string): number {
  const list = creatures.filter(c => c.status === 'tamed' && c.defId === defId);
  if (list.length === 0) return 0;
  return list.some(c => !c.hungry) ? 1 : 0.5;
}

export function outputMalusFactor(room: PlacedRoom, reviewIndex: number): number {
  const malus = room.troubleMalus;
  if (!malus) return 1;
  if (malus.untilReview <= reviewIndex) {
    room.troubleMalus = undefined;
    return 1;
  }
  return malus.outputFactor;
}

export function billCreatureMeals(
  state: FullGameState,
  note: (resource: string, before: number, source: string) => void
): void {
  const bag = state.resources as unknown as Record<string, number>;
  const eaters = state.creatures
    .filter(c => c.status === 'wary' || c.status === 'tamed')
    .sort((a, b) => a.id - b.id);
  for (const c of eaters) {
    const diet = CREATURE_DEFINITIONS[c.defId]?.diet;
    if (!diet) continue;
    const lines = Object.entries(diet).filter(([, amount]) => amount > 0);
    if (lines.length === 0) {
      c.hungry = false;
      continue;
    }
    const canPay = lines.every(([food, amount]) => (bag[food] || 0) >= amount);
    if (!canPay) {
      c.hungry = true;
      continue;
    }
    const who = CREATURE_DEFINITIONS[c.defId]?.name || c.nickname;
    for (const [food, amount] of lines) {
      const before = bag[food] || 0;
      bag[food] = before - amount;
      note(food, before, `Fed ${who}`);
    }
    c.hungry = false;
  }
}

export interface EscapeContext {
  unhomed: boolean;
  cleanliness?: number;
  menagerieLevel3?: boolean;
}

export function escapeChance(c: CreatureInstance, ctx: EscapeContext): number {
  if (c.status !== 'wary' && c.status !== 'tamed') return 0;
  const def = CREATURE_DEFINITIONS[c.defId];
  if (!def) return 0;
  const rates = ESCAPE_BASE[def.rarity];
  let p = c.status === 'wary' ? rates.wary : rates.tamed;
  if (c.hungry) p *= 3;
  const bond = c.bondLevel ?? 1;
  if (bond >= 3) p *= 0.45;
  else if (bond >= 2) p *= 0.7;
  if (c.tamerId !== undefined && c.tamerId !== null) p *= 0.5;
  if (ctx.unhomed) p *= 1.5;
  else if ((ctx.cleanliness ?? 100) < 40) p *= 1.25;
  if (c.status === 'wary' && ctx.menagerieLevel3) p *= 0.5;
  return p;
}

export function captureReviewCount(opts: {
  danger: number;
  isCareerTamer: boolean;
  masteredSchools: SchoolType[];
  creatureSchool: SchoolType;
}): number {
  let reviews = 8 + opts.danger * 5;
  if (!opts.isCareerTamer) reviews += 6;
  const mult = careerAffinityMultiplier(opts.masteredSchools, 'tamer', opts.creatureSchool);
  reviews = Math.round(reviews / mult);
  reviews -= Math.min(4, opts.masteredSchools.length);
  return Math.max(4, reviews);
}

type Trouble =
  | { kind: 'malus'; roomDef?: string; factor: number; reviews: number }
  | { kind: 'stash'; resource: string; amount: number }
  | { kind: 'dirty'; roomDef?: string; amount: number }
  | { kind: 'hurt'; composure: number; injure?: boolean }
  | { kind: 'damage'; roomDef?: string; material?: 'cloth' | 'glass' }
  | { kind: 'lock'; roomDef?: string; reviews: number }
  | { kind: 'rest'; amount: number; dorm?: boolean; everyone?: boolean }
  | { kind: 'rile' }
  | { kind: 'looseOne' }
  | { kind: 'hazard'; roomDef?: string }
  | { kind: 'veil'; amount: number }
  | { kind: 'meal'; factor: number }
  | { kind: 'transmute'; amount: number }
  | { kind: 'unsettled'; composure: number; count?: number };

const TROUBLE: Record<string, Trouble> = {
  mossback_tortoise: { kind: 'malus', roomDef: 'vegetable_patch', factor: 0.5, reviews: 10 },
  thistle_hare: { kind: 'stash', resource: 'herbs', amount: 5 },
  bramblefox: { kind: 'stash', resource: 'provisions', amount: 5 },
  moonsheep: { kind: 'rest', amount: 15, dorm: true },
  puddlewyrm: { kind: 'dirty', amount: 30 },
  glimmerhorn_stag: { kind: 'rile' },
  coral_kelpie: { kind: 'hurt', composure: 10 },
  verdant_drake: { kind: 'lock', roomDef: 'greenhouse', reviews: 30 },
  elder_treant_sprout: { kind: 'lock', roomDef: 'corridor', reviews: 20 },
  fen_sprite: { kind: 'stash', resource: 'herbs', amount: 5 },
  inkling_wisp: { kind: 'malus', roomDef: 'library', factor: 0.8, reviews: 15 },
  orrery_moth: { kind: 'damage', material: 'cloth' },
  glyph_cat: { kind: 'malus', roomDef: 'class_arcane', factor: 0, reviews: 10 },
  prism_beetle: { kind: 'damage', material: 'glass' },
  star_heron: { kind: 'lock', roomDef: 'observatory', reviews: 15 },
  phase_ferret: { kind: 'damage', roomDef: 'trophy_hall' },
  mistfeather_owl: { kind: 'lock', roomDef: 'library', reviews: 10 },
  aether_serpent: { kind: 'hazard', roomDef: 'class_arcane' },
  chronoflare_owl: { kind: 'lock', roomDef: 'observatory', reviews: 20 },
  lantern_moth: { kind: 'unsettled', composure: 5, count: 1 },
  dawn_finch: { kind: 'rest', amount: 5, dorm: true },
  halo_lamb: { kind: 'malus', roomDef: 'class_light', factor: 0.9, reviews: 10 },
  gilded_pangolin: { kind: 'stash', resource: 'glass', amount: 10 },
  dawnhart_gryphon: { kind: 'hurt', composure: 10, injure: true },
  sunlit_unicorn: { kind: 'lock', roomDef: 'sunlit_sanctum', reviews: 20 },
  ember_phoenix: { kind: 'lock', reviews: 15 },
  duskmouse: { kind: 'meal', factor: 0.9 },
  hush_raven: { kind: 'stash', resource: 'glass', amount: 5 },
  velvet_bat_swarm: { kind: 'rest', amount: 10, dorm: true, everyone: true },
  shade_hound: { kind: 'unsettled', composure: 10 },
  night_lynx: { kind: 'looseOne' },
  umbral_wyrmling: { kind: 'veil', amount: 10 },
  moonless_kitsune: { kind: 'unsettled', composure: 8, count: 3 },
  cinder_newt: { kind: 'dirty', amount: 15 },
  mopslime: { kind: 'stash', resource: 'provisions', amount: 5 },
  bellows_toad: { kind: 'lock', roomDef: 'workshop', reviews: 10 },
  quicksilver_otter: { kind: 'malus', roomDef: 'pond', factor: 0, reviews: 15 },
  alembic_salamander: { kind: 'lock', roomDef: 'alchemy_lab', reviews: 20 },
  geode_golem: { kind: 'lock', roomDef: 'corridor', reviews: 10 },
  philosophers_chimera: { kind: 'transmute', amount: 50 }
};

function bag(state: FullGameState): Record<string, number> {
  return state.resources as unknown as Record<string, number>;
}

function findBuilt(state: FullGameState, defId?: string, fallbackId?: number): PlacedRoom | undefined {
  if (defId) {
    const hit = state.rooms.find(r => r.state === 'built' && r.defId === defId);
    if (hit) return hit;
  }
  if (fallbackId !== undefined) {
    const own = state.rooms.find(r => r.id === fallbackId && r.state === 'built');
    if (own) return own;
  }
  return state.rooms.find(r => r.state === 'built');
}

import type { NoticeData } from '../types/ankicaster';

function pushNotice(
  state: FullGameState,
  notifications: string[],
  id: string,
  text: string,
  data?: NoticeData,
  type: string = 'creature'
): void {
  notifications.push(text);
  state.notices.push({ id, time: Date.now(), type, text, data });
}

function takeFromBag(
  state: FullGameState,
  resource: string,
  amount: number,
  note?: (resource: string, before: number, source: string) => void,
  source = 'Escape'
): number {
  const store = bag(state);
  const have = Math.max(0, store[resource] || 0);
  const take = Math.min(amount, have);
  if (take <= 0) return 0;
  const before = store[resource] || 0;
  store[resource] = before - take;
  note?.(resource, before, source);
  return take;
}

function damageFurniture(state: FullGameState, roomDef?: string, material?: 'cloth' | 'glass'): string | undefined {
  const rooms = state.rooms.filter(r => r.state === 'built' && (!roomDef || r.defId === roomDef));
  const pool = rooms.length > 0 ? rooms : state.rooms.filter(r => r.state === 'built');
  for (const room of pool) {
    const intact = room.furniture.filter(f => !f.damaged);
    const preferred = material
      ? intact.filter(f => ((FURNITURE_DEFINITIONS[f.defId]?.cost || {}) as Record<string, number>)[material])
      : intact;
    const pick = (preferred[0] || intact[0]);
    if (!pick) continue;
    pick.damaged = true;
    const name = FURNITURE_DEFINITIONS[pick.defId]?.name || pick.defId;
    return name;
  }
  return undefined;
}

function residents(state: FullGameState, dormOnly: boolean): FullGameState['characters'] {
  let people = state.characters.filter(c => c.status !== 'away' && c.status !== 'alumnus');
  if (!dormOnly) return people;
  const dormIds = new Set(
    state.rooms.filter(r => r.state === 'built' && (r.defId === 'dormitory' || r.defId === 'grand_dormitory')).map(r => r.id)
  );
  const housed = people.filter(c => c.bedRoomId !== undefined && dormIds.has(c.bedRoomId));
  return housed.length > 0 ? housed : people;
}

interface Catcher {
  id: number;
  name: string;
  schools: SchoolType[];
  isCareerTamer: boolean;
}

function wizardCatcher(state: FullGameState): Catcher {
  return {
    id: 0,
    name: state.wizard?.name || 'the Headmaster',
    schools: wizardMasteredSchools(state.wizard?.levels || {}),
    isCareerTamer: false
  };
}

function pickCatcher(state: FullGameState, creature: CreatureInstance, school: SchoolType): Catcher {
  const assigned = creature.tamerId;
  if (assigned === 0) return wizardCatcher(state);
  if (assigned !== undefined && assigned !== null) {
    const named = state.characters.find(c => c.id === assigned && c.status !== 'away');
    if (named) {
      return {
        id: named.id,
        name: named.name,
        schools: named.masteredSchools || [],
        isCareerTamer: named.career === 'tamer' && named.careerState !== 'sabbatical'
      };
    }
  }
  const tamers = state.characters
    .filter(c => c.career === 'tamer' && c.careerState === 'active' && c.status !== 'away')
    .sort((a, b) => {
      const aMatch = a.masteredSchools?.includes(school) ? 1 : 0;
      const bMatch = b.masteredSchools?.includes(school) ? 1 : 0;
      return bMatch - aMatch || a.id - b.id;
    });
  const tamer = tamers[0];
  if (!tamer) return wizardCatcher(state);
  return {
    id: tamer.id,
    name: tamer.name,
    schools: tamer.masteredSchools || [],
    isCareerTamer: true
  };
}

function roommates(state: FullGameState, creature: CreatureInstance): CreatureInstance[] {
  const resolved = resolveAllCreatureRooms(state.creatures, state.rooms);
  const roomId = creature.roomId ?? resolved.get(creature.id)?.room?.id;
  if (roomId === undefined) return [];
  return state.creatures.filter(other => {
    if (other.id === creature.id) return false;
    if (other.status !== 'wary' && other.status !== 'tamed') return false;
    const otherRoom = other.roomId ?? resolved.get(other.id)?.room?.id;
    return otherRoom === roomId;
  });
}

function applyTrouble(
  state: FullGameState,
  creature: CreatureInstance,
  notifications: string[],
  note: ((resource: string, before: number, source: string) => void) | undefined,
  depth: number
): CreatureInstance[] {
  const def = CREATURE_DEFINITIONS[creature.defId];
  const trouble = TROUBLE[creature.defId] || { kind: 'dirty' as const, amount: 15 };
  const follow: CreatureInstance[] = [];
  const homeId = creature.roomId;
  if (trouble.kind === 'malus') {
    const room = findBuilt(state, trouble.roomDef, homeId);
    if (room) {
      const until = (state.reviewIndex || 0) + trouble.reviews;
      const prev = room.troubleMalus;
      if (!prev || prev.untilReview < until || prev.outputFactor > trouble.factor) {
        room.troubleMalus = {
          untilReview: until,
          outputFactor: trouble.factor,
          reason: def?.troubleDescription || def?.name || 'Creature trouble'
        };
      }
    }
  } else if (trouble.kind === 'stash') {
    const took = takeFromBag(state, trouble.resource, trouble.amount, note, def?.name || 'Escape');
    if (took > 0) creature.stashed = { ...(creature.stashed || {}), [trouble.resource]: (creature.stashed?.[trouble.resource] || 0) + took };
  } else if (trouble.kind === 'dirty') {
    const room = findBuilt(state, trouble.roomDef, homeId);
    if (room) room.cleanliness = Math.max(0, room.cleanliness - trouble.amount);
  } else if (trouble.kind === 'hurt') {
    const people = state.characters.filter(c => c.status === 'student' || c.status === 'resident' || c.status === 'faculty');
    const target = people.find(c => c.status === 'student') || people[0];
    if (target) {
      target.needs.composure = Math.max(0, target.needs.composure - trouble.composure);
      if (trouble.injure && !target.injury) target.injury = { type: 'bruised', points: 0, required: 30 };
    }
  } else if (trouble.kind === 'damage') {
    damageFurniture(state, trouble.roomDef, trouble.material);
  } else if (trouble.kind === 'lock') {
    const room = findBuilt(state, trouble.roomDef, homeId);
    if (room) {
      const until = (state.reviewIndex || 0) + trouble.reviews;
      if ((room.lockedUntilReviewIndex ?? -1) < until) {
        room.lockedUntilReviewIndex = until;
        room.lockReason = def?.troubleDescription || 'A creature is loose in here.';
      }
    }
  } else if (trouble.kind === 'rest') {
    const list = residents(state, !!trouble.dorm);
    const hit = trouble.everyone ? list : list.slice(0, 1);
    for (const person of hit) person.needs.rest = Math.max(0, person.needs.rest - trouble.amount);
  } else if (trouble.kind === 'rile' && depth === 0) {
    follow.push(...roommates(state, creature));
  } else if (trouble.kind === 'looseOne' && depth === 0) {
    const other = state.creatures
      .filter(c => c.id !== creature.id && (c.status === 'wary' || c.status === 'tamed'))
      .sort((a, b) => a.id - b.id)[0];
    if (other) follow.push(other);
  } else if (trouble.kind === 'hazard') {
    const room = findBuilt(state, trouble.roomDef, homeId);
    if (room && !room.hazard) {
      room.hazard = {
        type: 'echo_loop',
        name: 'Echo Loop',
        description: def?.troubleDescription || 'A tiny rift tears the room.',
        effect: 'Classroom essence is suppressed.'
      };
    }
  } else if (trouble.kind === 'veil') {
    state.veil.strength = Math.max(0, state.veil.strength - trouble.amount);
  } else if (trouble.kind === 'meal') {
    state.pendingMealCapFactor = Math.min(state.pendingMealCapFactor ?? 1, trouble.factor);
  } else if (trouble.kind === 'transmute') {
    const store = bag(state);
    const timber = Math.max(0, store.timber || 0);
    const moved = Math.min(trouble.amount, timber);
    if (moved > 0) {
      const beforeT = store.timber || 0;
      store.timber = beforeT - moved;
      note?.('timber', beforeT, def?.name || 'Chimera');
      const beforeS = store.stone || 0;
      store.stone = beforeS + moved;
      note?.('stone', beforeS, def?.name || 'Chimera');
    }
  } else if (trouble.kind === 'unsettled') {
    const people = state.characters.filter(c => c.status === 'student' || c.status === 'resident' || c.status === 'faculty');
    const count = trouble.count ?? people.length;
    for (const person of people.slice(0, count)) {
      person.needs.composure = Math.max(0, person.needs.composure - trouble.composure);
    }
  }
  return follow;
}

function startCapture(state: FullGameState, creature: CreatureInstance, notifications: string[]): void {
  const def = CREATURE_DEFINITIONS[creature.defId];
  const school = def?.school || 'nature';
  const catcher = pickCatcher(state, creature, school);
  const reviews = captureReviewCount({
    danger: creatureDanger(def?.rarity),
    isCareerTamer: catcher.isCareerTamer,
    masteredSchools: catcher.schools,
    creatureSchool: school
  });
  creature.captureTamerId = catcher.id;
  creature.captureReviewsLeft = reviews;
  const ehRoom = state.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || state.rooms[0];
  const resolved = resolveAllCreatureRooms(state.creatures, state.rooms);
  const roomId = creature.roomId ?? resolved.get(creature.id)?.room?.id ?? ehRoom?.id;
  const text = `${def?.name || 'A creature'} (${creature.nickname}) is loose. ${catcher.name} is after it (${reviews} reviews).`;
  pushNotice(
    state,
    notifications,
    `escape-${creature.id}-${state.reviewIndex}`,
    text,
    {
      roomId,
      creatureId: creature.id,
      characterIds: catcher.id ? [catcher.id] : undefined,
      visualEventType: 'creature_escape'
    },
    'creature_escape'
  );
}

function escapeOne(
  state: FullGameState,
  creature: CreatureInstance,
  notifications: string[],
  note: ((resource: string, before: number, source: string) => void) | undefined,
  depth: number
): CreatureInstance[] {
  if (creature.status !== 'wary' && creature.status !== 'tamed') return [];
  creature.returnStatus = creature.status;
  creature.status = 'loose';
  const follow = applyTrouble(state, creature, notifications, note, depth);
  startCapture(state, creature, notifications);
  const def = CREATURE_DEFINITIONS[creature.defId];
  if (def?.troubleDescription) {
    const ehRoom = state.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || state.rooms[0];
    const resolved = resolveAllCreatureRooms(state.creatures, state.rooms);
    const roomId = creature.roomId ?? resolved.get(creature.id)?.room?.id ?? ehRoom?.id;
    pushNotice(
      state,
      notifications,
      `trouble-${creature.id}-${state.reviewIndex}`,
      `${creature.nickname}: ${def.troubleDescription}`,
      {
        roomId,
        creatureId: creature.id,
        incidentId: 'creature_trouble'
      },
      'creature'
    );
  }
  return depth === 0 ? follow : [];
}

export function forceEscape(
  state: FullGameState,
  creatureId: number,
  notifications: string[] = [],
  note?: (resource: string, before: number, source: string) => void
): void {
  const creature = state.creatures.find(c => c.id === creatureId);
  if (!creature) return;
  const follow = escapeOne(state, creature, notifications, note, 0);
  for (const other of follow) escapeOne(state, other, notifications, note, 1);
}

export function processEscapes(
  state: FullGameState,
  notifications: string[],
  note?: (resource: string, before: number, source: string) => void,
  rng: (bellIndex: number, creatureId: number, salt: number) => number = escapeRoll
): void {
  const resolution = resolveAllCreatureRooms(state.creatures, state.rooms);
  const consider = (creature: CreatureInstance, salt: number) => {
    if (creature.status !== 'wary' && creature.status !== 'tamed') return false;
    const res = resolution.get(creature.id);
    const room = res?.room;
    const chance = escapeChance(creature, {
      unhomed: !res || res.unhomed || !room,
      cleanliness: room?.cleanliness,
      menagerieLevel3: !!room && room.defId === 'menagerie' && room.level >= 3
    });
    return rng(state.bellIndex, creature.id, salt) < chance;
  };
  const first = state.creatures.filter(c => consider(c, 0)).sort((a, b) => a.id - b.id);
  for (const creature of first) {
    const follow = escapeOne(state, creature, notifications, note, 0);
    for (const other of follow) {
      const forced = TROUBLE[creature.defId]?.kind === 'looseOne';
      if (forced || consider(other, 1)) escapeOne(state, other, notifications, note, 1);
    }
  }
}

export function escapeRoll(bellIndex: number, creatureId: number, salt = 0): number {
  let n = Math.imul((bellIndex + 1) ^ (salt * 997), 374761393) ^ Math.imul(creatureId + 17, 668265263);
  n = Math.imul(n ^ (n >>> 13), 1274126177);
  return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
}

export function recaptureCreature(state: FullGameState, creature: CreatureInstance, notifications: string[], how: string): void {
  const back = creature.returnStatus === 'wary' || creature.returnStatus === 'tamed' ? creature.returnStatus : 'tamed';
  const stash = creature.stashed || {};
  for (const [resource, amount] of Object.entries(stash)) {
    if (!amount) continue;
    const store = bag(state);
    store[resource] = (store[resource] || 0) + amount;
    logResourceChange(state, resource, amount, `Recaptured ${creature.nickname}`);
  }
  const catcherId = creature.captureTamerId;
  creature.status = back;
  creature.stashed = undefined;
  creature.captureReviewsLeft = undefined;
  creature.captureTamerId = undefined;
  creature.returnStatus = undefined;
  const def = CREATURE_DEFINITIONS[creature.defId];
  const ehRoom = state.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || state.rooms[0];
  const resolved = resolveAllCreatureRooms(state.creatures, state.rooms);
  const roomId = creature.roomId ?? resolved.get(creature.id)?.room?.id ?? ehRoom?.id;
  pushNotice(
    state,
    notifications,
    `recapture-${creature.id}-${state.reviewIndex}`,
    `${how} ${creature.nickname} (${def?.name || 'creature'}) is home.`,
    {
      roomId,
      creatureId: creature.id,
      characterIds: catcherId ? [catcherId] : undefined
    },
    'creature'
  );
}

export function tickCaptures(state: FullGameState, notifications: string[]): void {
  for (const creature of state.creatures) {
    if (creature.status !== 'loose') continue;
    if (creature.captureReviewsLeft === undefined) {
      startCapture(state, creature, notifications);
    }
    if (creature.captureReviewsLeft === undefined) continue;
    creature.captureReviewsLeft -= 1;
    if (creature.captureReviewsLeft <= 0) {
      const catcher = creature.captureTamerId === 0
        ? (state.wizard?.name || 'The Headmaster')
        : (state.characters.find(c => c.id === creature.captureTamerId)?.name || 'A tamer');
      recaptureCreature(state, creature, notifications, `${catcher} caught`);
    }
  }
}
