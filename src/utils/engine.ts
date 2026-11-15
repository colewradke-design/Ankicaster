/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ankicaster Comprehensive Simulation & Action Engine
 * Handles honest reviews, bells, day ticks, construction, linking, needs, and Rift expeditions.
 */

import {
  FullGameState,
  SchoolType,
  CareerType,
  PlacedRoom,
  Character,
  CardSet,
  DraftCard,
  ActiveExpedition,
  InjuryType,
  AnkiCardSnapshot,
  PlacedFurniture,
  HazardType,
  PersonalityType,
  AlchemyTarget,
  BrewingJob,
  HabitatType,
  ScrollId,
  ScrollCraftingJob
} from '../types/ankicaster';
import {
  ROOM_DEFINITIONS,
  roomDisplayName,
  FURNITURE_DEFINITIONS,
  CREATURE_DEFINITIONS,
  RIFT_DESTINATIONS,
  SPELL_DEFINITIONS,
  SCHOOL_EVENTS,
  HAZARD_CATALOG,
  BREACH_CATALOG,
  HazardDefinition,
  PERSONALITY_DEFINITIONS,
  TRAIT_DEFINITIONS,
  MISBEHAVIOR_INCIDENTS,
  GREENHOUSE_CROPS,
  SCROLL_DEFINITIONS,
  SPELLBOOK_DEFINITIONS,
  ENDLESS_SPELLBOOK_MILESTONES
} from '../data/content';
import { createInitialGameState } from '../data/initialState';
import {
  validatePlacement,
  findAutoPlacement,
  roomLimitStatus,
  countRoomsOfType,
  newlyCutOffRooms,
  newlyUnsupportedRooms,
  stairMoveWarnings,
  placementCharge,
  discountedBuildReviews,
  discountedFurnitureCost,
  discountedResourceCost,
  defaultSpent,
  demolishRefund,
  REFUND_MATERIALS,
  BUILD_MATERIALS,
  PlacementCheck
} from './placement';
import { normalizeAppearance } from './appearance';
import {
  allFurnitureIds, Cost, fillRequiredFixtures, isFurnitureCompatibleWithRoom,
  isRoomUnfinished, maxOptionalSlots, maxSameFurnitureInRoom, missingRequiredSlots,
  optionalSlotsCostForNewPiece, optionalSlotsUsed, queuedRequiredBySlot,
  requiredInstallOption, requiredSlotStatus, costText, unaffordable, uniqueFurnitureId
} from './requiredFurniture';
import {
  academyFurnitureEffect,
  alumniRetirementScale,
  FACULTY_CAREERS,
  FURNITURE_EFFECTS,
  getFacultySummary,
  calculateReviewMana,
  calculateDailyVeilCost,
  calculateHazardRollChance,
  calculateFacultyLimit,
  calculateStudentSkill,
  isMasteryReady,
  calculateTeacherDelay,
  calculateRiftChance,
  getVeilBand,
  calculateMorale,
  calculateRoomEfficiency,
  calculateRoomQuality,
  careerAffinityMultiplier,
  classroomSchool,
  computeAlumniBonuses,
  computeSpellbookBonuses,
  computeStudyLevel,
  HAZARD_SCHOOL,
  maxStudySessionsForWizard,
  wizardMasteredSchools,
  wizardOrbQuote,
  wizardSchoolBuffs
} from '../utils/formulas';
import { computeDistanceFromRooms, computeReachability, ReachabilityInfo } from './reachability';
import {
  DraftDeckId, DRAFT_TUTORIAL, STARTER_PATTERNS, dealDraft, deckPrice, isPatternKnown, isRoomUnlocked, isStructure, planHint, requiredFixturesForRoom
} from './decks';
import {
  BellNote, commitBell, ensureLedger, glassworksConversion, logResourceChange, logResourceDiff,
  resourceSnapshot, storageCap as storageCapOf, weavingOutput
} from './resourceReport';
import {
  ALL_HABITATS,
  bondBuffMultiplier,
  creatureCategoryBonus,
  creatureSpeciesBuffSum,
  getPenOccupants,
  grantTamingOneTimeBonuses,
  menagerieModuleCap,
  penAcceptedHabitats,
  penCreatureCapacity,
  resolveAllCreatureRooms,
  roomAcceptedHabitats,
  syncDiscoveredCreatures
} from './creatures';
import {
  bestBuffScale,
  billCreatureMeals,
  buffScale,
  outputMalusFactor,
  processEscapes,
  recaptureCreature,
  startCapture,
  tickCaptures,
  MANUAL_FEED_BOND
} from './creatureCare';
import {
  applyAcademyScheduleToState,
  buildAcademySchedule,
  effectiveWorkplaceSlots,
  getStudentDelaySource,
  libraryReaderCapacity,
  refectoryChairCount
} from './schedule';
import {
  DropTargetInput,
  findFirstValidFurnitureDrop,
  LONG_TABLE_MARK_OFFSETS,
  migrateRoomFurniturePositions,
  piecePlane,
  validateFurnitureDrop
} from '../visual/layout/furniturePlacement';
import { legacyLayoutRoomFurniture } from '../visual/layout/roomLayouts';

export { isRoomUnlocked, planHint as blueprintLockHint, isStructure };

/**
 * Anki 4:00 AM Rollover Boundary calculation
 * A new study day begins at 4:00 AM local time. Shifting back by 4 hours
 * aligns 4:00 AM with 00:00 local midnight.
 */
export function getAnkiDayNumber(timeMs: number): number {
  const d = new Date(timeMs);
  d.setHours(d.getHours() - 4);
  return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / (24 * 3600 * 1000));
}

export const HAZARD_DISPEL_MANA_COST = 30;

const STAFF_CAREERS = new Set<string>(['teacher', 'scholar', 'gardener', 'tamer', 'healer', 'warder', 'alchemist', 'builder']);

let _lastNumericId = 0;
let _noticeSeq = 0;

function uniqueNumericId(existing: number[] = []): number {
  const candidate = Math.max(Date.now(), _lastNumericId + 1, ...existing.map(n => n + 1));
  _lastNumericId = candidate;
  return candidate;
}

function uniqueNoticeId(prefix: string, state: FullGameState): string {
  let id: string;
  do {
    _noticeSeq += 1;
    id = `${prefix}-${Date.now()}-${_noticeSeq}`;
  } while (state.notices?.some(n => n.id === id));
  return id;
}

function cloneRoom(r: PlacedRoom): PlacedRoom {
  return {
    ...r,
    settings: {
      ...r.settings,
      crops: r.settings?.crops ? [...r.settings.crops] : undefined,
      modules: r.settings?.modules ? [...r.settings.modules] : undefined
    },
    furniture: (r.furniture || []).map(f => ({ ...f })),
    unplacedFurniture: r.unplacedFurniture ? r.unplacedFurniture.map(u => ({ ...u })) : undefined,
    hazard: r.hazard ? { ...r.hazard } : undefined,
    troubleMalus: r.troubleMalus ? { ...r.troubleMalus } : undefined,
    spent: r.spent ? { ...r.spent } : undefined
  };
}

function facultyOutputMultiplier(state: FullGameState, char?: Character): number {
  let bonus = 0;
  const hasFineLounge = (state.rooms || []).some(
    r =>
      r.defId === 'faculty_lounge' &&
      r.state === 'built' &&
      !isRoomUnfinished(r) &&
      (r.lockedUntilReviewIndex ?? -1) <= (state.reviewIndex || 0) &&
      !r.hazard?.locksRoom &&
      calculateRoomQuality(r).q >= 45
  );
  if (hasFineLounge) bonus += 0.03;
  if (char?.bedRoomId != null) {
    const bed = (state.rooms || []).find(
      r =>
        r.id === char.bedRoomId &&
        r.defId === 'faculty_quarters' &&
        r.state === 'built' &&
        !isRoomUnfinished(r) &&
        (r.level || 1) >= 3
    );
    if (bed) bonus += 0.05;
  }
  return 1 + bonus;
}

function computeAcademyCharm(state: FullGameState): number {
  let charm = 0;
  for (const room of state.rooms || []) {
    if (room.state !== 'built' || isRoomUnfinished(room)) continue;
    const ehMult = room.defId === 'entrance_hall' ? 2 : 1;
    for (const f of room.furniture || []) {
      const pts = FURNITURE_DEFINITIONS[f.defId]?.stats?.charm || 0;
      charm += (f.damaged ? pts * 0.5 : pts) * ehMult;
    }
    if (room.defId === 'courtyard_garden') {
      charm += 3 * AnkicasterEngine.roomEfficiency(state, room);
    }
    if (room.misbehaviorCharmMalus) charm += room.misbehaviorCharmMalus;
  }
  const lanternScale = creatureSpeciesBuffSum(state, 'lantern_moth');
  if (lanternScale > 0) charm += 3 * lanternScale;
  return charm;
}

function syncCharmRenown(state: FullGameState): void {
  const target = Math.max(0, Math.floor(computeAcademyCharm(state) / 50));
  const prev = state.charmRenownGranted || 0;
  if (target !== prev) {
    state.renown = Math.max(0, (state.renown || 0) + (target - prev));
    state.charmRenownGranted = target;
  }
  checkEndlessSpellbookMilestones(state);
}

function isActiveWarder(c: Character): boolean {
  return c.career === 'warder' && c.careerState === 'active' && c.status !== 'away';
}

function isNightInkType(type?: HazardType | string): boolean {
  return type === 'spill_of_night' || type === 'night_ink';
}

function floorHasHazard(state: FullGameState, room: PlacedRoom, type: HazardType): boolean {
  if (room.hazard && (room.hazard.type === type || (isNightInkType(type) && isNightInkType(room.hazard.type)))) {
    return true;
  }
  return state.rooms.some(r => {
    if (r.state !== 'built' || !r.hazard) return false;
    const sameType = r.hazard.type === type || (isNightInkType(type) && isNightInkType(r.hazard.type));
    if (!sameType || r.area !== room.area) return false;
    if (r.area === 'grounds') return r.hazard.areaScope === 'floor' || r.hazard.areaScope === 'grounds';
    const targetFloor = r.hazard.floorY ?? r.y;
    return targetFloor === room.y && (r.hazard.areaScope === 'floor' || r.id === room.id);
  });
}

function roomHasHearth(room: PlacedRoom): boolean {
  if (room.hazard?.type === 'mana_static') return false;
  return (room.furniture || []).some(f => !f.damaged && (f.defId === 'warm_hearthstone' || f.defId === 'phoenix_hearth'));
}

function roomColdSnapMultiplier(room: PlacedRoom, weatherPenaltyMult: number = 1): number {
  if (room.hazard?.type !== 'cold_snap') return 1;
  const basePenalty = roomHasHearth(room) ? 0.25 : 0.5;
  return 1 - basePenalty * weatherPenaltyMult;
}

function computeAcademyVeilSummary(state: FullGameState) {
  const warders = state.characters.filter(isActiveWarder).length;
  const wardingChambers = state.rooms.filter(
    r => r.defId === 'warding_chamber' && r.state === 'built' && !isRoomUnfinished(r)
  ).length;
  const batScale = creatureSpeciesBuffSum(state, 'velvet_bat_swarm');
  const wyrmScale = creatureSpeciesBuffSum(state, 'umbral_wyrmling');
  const extraReductions: Array<{ label: string; pct: number }> = [];
  let loomCount = 0;
  for (const r of state.rooms) {
    if (r.state !== 'built' || isRoomUnfinished(r) || r.hazard?.type === 'mana_static') continue;
    for (const f of r.furniture || []) {
      if (!f.damaged && f.defId === 'veilweaver_loom' && loomCount < 2) {
        loomCount++;
      }
    }
  }
  if (loomCount > 0) {
    extraReductions.push({ label: `Veilweaver Loom (${loomCount})`, pct: 0.05 * loomCount });
  }
  const alumni = computeAlumniBonuses(state.alumniGallery || []);
  if (alumni.warderVeilReductionPct > 0) {
    extraReductions.push({ label: 'Warder Alumni', pct: alumni.warderVeilReductionPct });
  }
  const sb = computeSpellbookBonuses(state.spellbooks || []);
  if (sb.veilCostReductionPct > 0) {
    extraReductions.push({ label: 'Spellbooks', pct: sb.veilCostReductionPct });
  }
  return calculateDailyVeilCost(
    state.rooms,
    state.wizard.levels.shadow,
    warders,
    0,
    batScale > 0,
    wyrmScale > 0,
    batScale || 1,
    wyrmScale || 1,
    wardingChambers,
    extraReductions
  );
}

function clearRoomHazard(
  state: FullGameState,
  room: PlacedRoom,
  notifications?: string[],
  reasonLabel?: string
): void {
  const haz = room.hazard;
  if (!haz) return;
  const roomName = ROOM_DEFINITIONS[room.defId]?.name || room.defId;
  room.hazard = undefined;
  if (haz.locksRoom || haz.isBreach || haz.type === 'wild_growth' || haz.type === 'kitchen_fire' || haz.type === 'rift_tremor' || haz.type === 'shade_breach' || haz.type === 'veil_rent' || haz.type === 'breach') {
    room.lockedUntilReviewIndex = undefined;
  }
  if (haz.hiddenResource?.key === 'provisions' && haz.hiddenResource.amount > 0) {
    const amt = haz.hiddenResource.amount;
    state.resources.provisions += amt;
    state.hiddenProvisions = Math.max(0, (state.hiddenProvisions || amt) - amt);
    const msg = `🍇 Recovered ${amt} hidden Provisions after clearing Imp Infestation in ${roomName}!`;
    notifications?.push(msg);
  }
  if (haz.type === 'wild_growth') {
    state.resources.herbs += 5;
    notifications?.push(`🌿 Harvested +5 Herbs from cleared Wild Growth in ${roomName}!`);
  }
  if (haz.type === 'wisp_swarm' && Math.random() < 0.25) {
    const newCid = uniqueNumericId(state.creatures.map(c => c.id));
    state.creatures.push({
      id: newCid,
      defId: 'lantern_moth',
      nickname: CREATURE_DEFINITIONS.lantern_moth?.name || 'Lantern Moth',
      status: 'wary',
      hungry: false,
      hatchProgress: 0,
      tamingProgress: 0,
      bondLevel: 1,
      bondProgress: 0,
      arrivedDay: state.day
    });
    syncDiscoveredCreatures(state);
    notifications?.push(`🦋 A curious Lantern Moth lingered after Will-o'-Wisp Swarm cleared!`);
  }
  if (reasonLabel) {
    state.notices.push({
      id: uniqueNoticeId(`haz-clear-${room.id}`, state),
      time: Date.now(),
      type: 'hazard',
      text: `✨ ${haz.name} in ${roomName} cleared (${reasonLabel}).`,
      data: { roomId: room.id, hazardType: haz.type, visualEventType: 'hazard_cleared' }
    });
  }
}

function ensureUpcomingEventsQueue(state: FullGameState): void {
  const existing = Array.isArray(state.upcomingEvents) ? state.upcomingEvents : [];
  const byDay = new Map<number, string>();
  for (const item of existing) {
    if (item && item.day > state.day) {
      byDay.set(item.day, item.eventId);
    }
  }
  const usedIds = new Set<string>([
    ...(state.activeEvents || []).map(e => e.eventId),
    ...[...byDay.values()].filter(id => id !== 'none')
  ]);
  const nextQueue: Array<{ day: number; eventId: string }> = [];
  for (let offset = 1; offset <= 3; offset++) {
    const day = state.day + offset;
    let eventId = byDay.get(day);
    if (!eventId) {
      if (Math.random() < 0.4) {
        const pool = SCHOOL_EVENTS.filter(ev => !usedIds.has(ev.id));
        if (pool.length > 0) {
          const picked = pool[Math.floor(Math.random() * pool.length)];
          eventId = picked.id;
          usedIds.add(picked.id);
        } else {
          eventId = 'none';
        }
      } else {
        eventId = 'none';
      }
    }
    nextQueue.push({ day, eventId });
  }
  state.upcomingEvents = nextQueue;
}

function localHazardFizzleChance(state: FullGameState, targetRoom: PlacedRoom): number {
  let fizzle = 0;

  // Warding Chamber: -20% within 3 BFS steps
  const chambers = state.rooms.filter(
    r => r.defId === 'warding_chamber' && r.state === 'built' && !isRoomUnfinished(r)
  );
  if (chambers.length > 0) {
    const dists = computeDistanceFromRooms(state.rooms, chambers.map(c => c.id));
    if ((dists.get(targetRoom.id) ?? Infinity) <= 3) {
      fizzle += 0.2;
    }
  }

  // Standing Stones: Grounds hazards -50%; Bramblefox: Grounds hazards -15%/copy
  if (targetRoom.area === 'grounds') {
    if (state.rooms.some(r => r.defId === 'standing_stones' && r.state === 'built' && !isRoomUnfinished(r))) {
      fizzle += 0.5;
    }
    if (bestBuffScale(state.creatures, 'bramblefox') > 0) {
      fizzle += creatureCategoryBonus(state, [{ defId: 'bramblefox', perCopy: 0.15 }], 0.5);
    }
  }

  // Ward Lantern: -30% in its room, -10% adjacent; Rune Marker -15% on grounds; Enchanted Gnome -10% on grounds
  for (const r of state.rooms) {
    if (r.state !== 'built' || isRoomUnfinished(r) || r.hazard?.type === 'mana_static') continue;
    const isAdj =
      r.id !== targetRoom.id &&
      r.area === targetRoom.area &&
      r.x <= targetRoom.x + targetRoom.w &&
      targetRoom.x <= r.x + r.w &&
      r.y <= targetRoom.y + targetRoom.h &&
      targetRoom.y <= r.y + r.h;
    for (const f of r.furniture || []) {
      const mult = f.damaged ? 0.5 : 1;
      if (f.defId === 'ward_lantern') {
        if (r.id === targetRoom.id) fizzle += 0.3 * mult;
        else if (isAdj) fizzle += 0.1 * mult;
      } else if (targetRoom.area === 'grounds') {
        if (f.defId === 'rune_marker') fizzle += 0.15 * mult;
        else if (f.defId === 'garden_gnome') fizzle += 0.1 * mult;
      }
    }
  }

  return Math.min(0.9, Math.max(0, fizzle));
}

function consumeFloorWardProtection(state: FullGameState, target: PlacedRoom, summary?: string[]): boolean {
  if (target.area !== 'castle') return false;
  const floorY = target.y;
  const preventList = state.preventFloorHazard || [];
  const pIdx = preventList.indexOf(floorY);
  if (pIdx >= 0) {
    preventList.splice(pIdx, 1);
    state.preventFloorHazard = preventList;
    summary?.push(`📜 Ward Scroll prevented a hazard on Floor ${floorY + 1}!`);
    return true;
  }
  const wwList = state.activeBuffs?.wardwaterFloors;
  const wIdx = wwList ? wwList.indexOf(floorY) : -1;
  if (wwList && wIdx >= 0) {
    wwList.splice(wIdx, 1);
    summary?.push(`🛡️ Wardwater prevented a hazard on Floor ${floorY + 1}!`);
    return true;
  }
  return false;
}

function filterRoomsForHazard(state: FullGameState, def: HazardDefinition): PlacedRoom[] {
  const candidates = state.rooms.filter(r => r.state === 'built' && !isRoomUnfinished(r) && !r.hazard);
  switch (def.targetFilter) {
    case 'castle':
      return candidates.filter(r => r.area === 'castle');
    case 'grounds':
      return candidates.filter(r => r.area === 'grounds');
    case 'wild_growth':
      return candidates.filter(
        r => r.defId === 'greenhouse' || r.area === 'grounds' || ROOM_DEFINITIONS[r.defId]?.school === 'nature'
      );
    case 'storage_kitchen':
      return candidates.filter(r => r.defId === 'storage_vault' || r.defId === 'kitchen');
    case 'echo_loop':
      return candidates.filter(r => r.defId === 'library' || ROOM_DEFINITIONS[r.defId]?.school === 'arcane');
    case 'cold_snap':
      return candidates.filter(
        r => r.defId === 'greenhouse' || r.defId === 'dormitory' || r.defId === 'grand_dormitory' || r.defId === 'faculty_quarters'
      );
    case 'kitchen_refectory':
      return candidates.filter(r => r.defId === 'kitchen' || r.defId === 'refectory');
    case 'rift_gate':
      return candidates.filter(r => r.defId === 'rift_gate');
    case 'alchemy_lab':
      return candidates.filter(r => r.defId === 'alchemy_lab');
    case 'entrance_hall':
      return candidates.filter(r => r.defId === 'entrance_hall');
    case 'any':
    default:
      return candidates;
  }
}

function weightedPick<T>(items: T[], weightFn: (item: T) => number): T | undefined {
  const weights = items.map(item => Math.max(0, weightFn(item)));
  const total = weights.reduce((a, b) => a + b, 0);
  if (total <= 0) return items[0];
  let roll = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    roll -= weights[i];
    if (roll <= 0) return items[i];
  }
  return items[items.length - 1];
}

function applyHazardInstance(
  state: FullGameState,
  def: HazardDefinition,
  target: PlacedRoom,
  notifications: string[]
): void {
  const hasWarder = state.characters.some(isActiveWarder);
  const hasGardener = state.characters.some(c => c.career === 'gardener' && c.careerState === 'active' && c.status !== 'away');
  const hasScholar = state.characters.some(c => c.career === 'scholar' && c.careerState === 'active' && c.status !== 'away');
  const hasShadeHound = creatureSpeciesBuffSum(state, 'shade_hound') > 0;
  const roomName = ROOM_DEFINITIONS[target.defId]?.name || target.defId;

  // Instant resolution bonuses per §19.3
  if (def.id === 'mana_static' && hasWarder) {
    const msg = `🛡️ Active Warder instantly dispelled Mana Static in ${roomName}!`;
    notifications.push(msg);
    state.notices.push({
      id: uniqueNoticeId(`hazard-warder-${target.id}`, state),
      time: Date.now(),
      type: 'hazard',
      text: msg,
      data: { roomId: target.id, hazardType: 'mana_static', visualEventType: 'hazard_cleared' }
    });
    return;
  }
  if (def.id === 'imp_infestation' && hasShadeHound) {
    const msg = `🐾 Your Shade Hound chased off the Imp Infestation in ${roomName} immediately!`;
    notifications.push(msg);
    state.notices.push({
      id: uniqueNoticeId(`hazard-hound-${target.id}`, state),
      time: Date.now(),
      type: 'hazard',
      text: msg,
      data: { roomId: target.id, hazardType: 'imp_infestation', visualEventType: 'hazard_cleared' }
    });
    return;
  }

  // Instant multi-room gust: Mischievous Draft (§19.3)
  if (def.id === 'drafty_window') {
    const castleRooms = state.rooms.filter(r => r.state === 'built' && !isRoomUnfinished(r) && r.area === 'castle');
    const shuffled = [...castleRooms].sort(() => Math.random() - 0.5).slice(0, 3);
    for (const r of shuffled) {
      r.cleanliness = Math.max(0, r.cleanliness - 15);
    }
    const msg = `💨 ${def.name} swept through ${shuffled.length} castle room(s) (-15 Cleanliness)!`;
    notifications.push(msg);
    state.notices.push({
      id: uniqueNoticeId(`hazard-draft`, state),
      time: Date.now(),
      type: 'hazard',
      text: msg,
      data: { roomId: shuffled[0]?.id ?? target.id, hazardId: 'drafty_window' }
    });
    return;
  }

  let duration = def.durationReviews;
  if (def.id === 'poltergeist' && hasWarder) duration = 10;
  else if (def.id === 'imp_infestation' && hasWarder) duration = 10;
  else if (def.id === 'rift_tremor' && hasWarder) duration = 10;
  else if (def.id === 'wild_growth' && hasGardener) duration = 10;
  else if (def.id === 'echo_loop' && hasScholar) duration = 5;

  const hasNightOwlOnFloor = duration > 0 && state.characters.some(c => {
    if (c.status === 'away' || !hasTrait(c, 'Night Owl')) return false;
    const floorRooms = state.rooms.filter(r => r.area === target.area && r.y === target.y).map(r => r.id);
    return (c.seatRoomId && floorRooms.includes(c.seatRoomId))
      || (c.workplaceRoomId && floorRooms.includes(c.workplaceRoomId))
      || (c.bedRoomId && floorRooms.includes(c.bedRoomId));
  });
  if (hasNightOwlOnFloor) {
    duration = Math.max(1, Math.round(duration * 0.95));
  }
  const ravenResolveBonus = duration > 0
    ? creatureCategoryBonus(state, [{ defId: 'hush_raven', perCopy: 0.15 }], 0.5)
    : 0;
  if (duration > 0 && ravenResolveBonus > 0) {
    duration = Math.max(1, Math.round(duration * Math.max(0.25, 1 - ravenResolveBonus)));
  }

  const expiresAt = duration > 0 ? state.reviewIndex + duration : undefined;
  target.hazard = {
    type: def.id as HazardType,
    name: def.name,
    description: def.description,
    effect: def.effect,
    expiresAtReviewIndex: expiresAt,
    floorY: target.area === 'castle' ? target.y : undefined,
    areaScope: def.areaScope,
    locksRoom: def.locksRoom
  };

  if (def.locksRoom && expiresAt !== undefined) {
    target.lockedUntilReviewIndex = expiresAt;
  }

  if (def.id === 'poltergeist') {
    target.cleanliness = Math.max(0, target.cleanliness - 30);
    for (const c of state.characters) {
      if (c.seatRoomId === target.id || c.workplaceRoomId === target.id || c.bedRoomId === target.id) {
        c.needs.composure = Math.max(0, c.needs.composure - 5);
      }
    }
  } else if (def.id === 'imp_infestation') {
    const stolen = Math.floor(Math.max(0, state.resources.provisions) * 0.1);
    if (stolen > 0) {
      state.resources.provisions -= stolen;
      state.hiddenProvisions = (state.hiddenProvisions || 0) + stolen;
      target.hazard.hiddenResource = { key: 'provisions', amount: stolen };
    }
  } else if (def.id === 'kitchen_fire') {
    state.pendingMealCapFactor = Math.min(state.pendingMealCapFactor ?? 1, 0.5);
  } else if (def.id === 'wisp_swarm') {
    // Also affect a second built grounds plot if available (§19.3: Plot outputs 0 on 2 plots)
    const secondPlot = state.rooms.find(
      r => r.id !== target.id && r.state === 'built' && !isRoomUnfinished(r) && r.area === 'grounds' && !r.hazard
    );
    if (secondPlot) {
      secondPlot.hazard = {
        ...target.hazard,
        areaScope: 'grounds'
      };
    }
  }

  const msg = `⚠️ Hazard emerged: ${def.name} in ${roomName}!`;
  notifications.push(msg);
  state.notices.push({
    id: uniqueNoticeId(`hazard-${target.id}`, state),
    time: Date.now(),
    type: 'hazard',
    text: msg,
    data: { roomId: target.id, hazardId: def.id as HazardType, hazardType: def.id as HazardType }
  });
}

function rollHazardForBell(state: FullGameState, notifications: string[]): void {
  if ((state.activeBuffs?.wardPulseBells || 0) > 0) return;

  const activeWarders = state.characters.filter(isActiveWarder).length;
  const shadowSteps = wizardSchoolBuffs(state.wizard?.levels || {}).shadowSteps;
  const creatureHazRed = creatureCategoryBonus(
    state,
    [
      { defId: 'night_lynx', perCopy: 0.15 },
      { defId: 'velvet_bat_swarm', perCopy: 0.08 },
      { defId: 'glyph_cat', perCopy: 0.08 }
    ],
    0.5
  );
  const acadFurnRed = Math.abs(academyFurnitureEffect(state.rooms, 'hazard_chance_pct')) / 100;
  const sb = computeSpellbookBonuses(state.spellbooks || []);
  // Combine Academy-wide hazard reductions; §19.2 caps at 75%
  const globalReduction = shadowSteps * 0.03 + activeWarders * 0.1 + creatureHazRed + acadFurnRed * 0.25 + sb.hazardReductionPct;
  const veilInfo = computeAcademyVeilSummary(state);
  const pHazard = calculateHazardRollChance(
    state.veil.strength,
    veilInfo.sizePoints,
    globalReduction,
    (state.activeBuffs?.moonlessNightBells || 0) > 0
  );
  if (Math.random() >= pHazard) return;

  const eligibleDefs: Array<{ def: HazardDefinition; rooms: PlacedRoom[] }> = [];
  const fireproofBells = state.activeBuffs?.fireproofBells || 0;
  const fireproofRoomId = state.activeBuffs?.fireproofRoomId;

  for (const def of Object.values(HAZARD_CATALOG)) {
    if (def.weight <= 0) continue;
    if (def.id === 'kitchen_fire' && fireproofBells > 0 && !fireproofRoomId) continue;
    const rooms = filterRoomsForHazard(state, def);
    if (rooms.length > 0) eligibleDefs.push({ def, rooms });
  }
  if (eligibleDefs.length === 0) return;

  const pickedEntry = weightedPick(eligibleDefs, e => {
    if (e.def.id === 'kitchen_fire') {
      const hasFirebug = e.rooms.some(rm =>
        state.characters.some(
          ch => ch.traits?.includes('Firebug') && (ch.workplaceRoomId === rm.id || ch.seatRoomId === rm.id || ch.bedRoomId === rm.id)
        )
      );
      if (hasFirebug) return e.def.weight * 2;
    }
    return e.def.weight;
  });
  if (!pickedEntry) return;
  const target = weightedPick(pickedEntry.rooms, r => ROOM_DEFINITIONS[r.defId]?.veil || 1);
  if (!target) return;

  if (pickedEntry.def.id === 'kitchen_fire' && fireproofBells > 0 && fireproofRoomId === target.id) {
    notifications.push(`🛡️ Fireproof Salve blocked a Kitchen Fire in ${ROOM_DEFINITIONS[target.defId]?.name || 'room'}!`);
    return;
  }

  if (consumeFloorWardProtection(state, target, notifications)) return;

  const fizzle = localHazardFizzleChance(state, target);
  if (Math.random() < fizzle) {
    notifications.push(`🛡️ Local wards dissolved an incoming ${pickedEntry.def.name} near ${ROOM_DEFINITIONS[target.defId]?.name || 'room'}.`);
    return;
  }

  applyHazardInstance(state, pickedEntry.def, target, notifications);
}

function rollBreachForBell(state: FullGameState, notifications: string[]): void {
  if ((state.activeBuffs?.wardPulseBells || 0) > 0) return;
  const band = getVeilBand(state.veil.strength);
  const sb = computeSpellbookBonuses(state.spellbooks || []);
  if (sb.breachesOnlyAtTorn) {
    if (band !== 'torn') return;
  } else if (band !== 'thin' && band !== 'torn') {
    return;
  }

  const stonesCount = state.rooms.filter(
    r => r.defId === 'standing_stones' && r.state === 'built' && !isRoomUnfinished(r)
  ).length;
  const baseBreachChance = band === 'torn' ? 0.03 : 0.01;
  const effectiveBreachChance = baseBreachChance * Math.pow(0.75, stonesCount);
  if (Math.random() >= effectiveBreachChance) return;

  const breachDefs = Object.values(BREACH_CATALOG).filter(b => filterRoomsForHazard(state, b).length > 0);
  if (breachDefs.length === 0) return;
  const picked = weightedPick(breachDefs, b => b.weight);
  if (!picked) return;
  const validRooms = filterRoomsForHazard(state, picked);
  const target = weightedPick(validRooms, r => ROOM_DEFINITIONS[r.defId]?.veil || 1);
  if (!target) return;

  // Level 3 Warding Chamber auto-contains breaches within 3 BFS steps
  const l3Chambers = state.rooms.filter(
    r => r.defId === 'warding_chamber' && r.state === 'built' && !isRoomUnfinished(r) && r.level >= 3
  );
  if (l3Chambers.length > 0) {
    const dists = computeDistanceFromRooms(state.rooms, l3Chambers.map(c => c.id));
    if ((dists.get(target.id) ?? Infinity) <= 3) {
      const msg = `🛡️ Level 3 Warding Chamber auto-contained a ${picked.name}!`;
      notifications.push(msg);
      state.notices.push({
        id: uniqueNoticeId(`breach-contained-${target.id}`, state),
        time: Date.now(),
        type: 'hazard',
        text: msg,
        data: { roomId: target.id, visualEventType: 'hazard_cleared' }
      });
      return;
    }
  }

  const activeWarder = state.characters.some(isActiveWarder);
  const shadeHoundRed = creatureCategoryBonus(state, [{ defId: 'shade_hound', perCopy: 0.5 }], 0.75);
  const breachFactor = Math.max(0.25, 1 - shadeHoundRed);

  if (picked.id === 'shade_breach') {
    if (activeWarder) {
      const msg = `⚔️ Active Warder banished a Shade Breach in ${ROOM_DEFINITIONS[target.defId]?.name || 'room'} immediately!`;
      notifications.push(msg);
      state.notices.push({
        id: uniqueNoticeId(`breach-warder-${target.id}`, state),
        time: Date.now(),
        type: 'hazard',
        text: msg,
        data: { roomId: target.id, visualEventType: 'hazard_cleared' }
      });
      return;
    }
    const dur = Math.max(10, Math.round(60 * breachFactor));
    const expiresAt = state.reviewIndex + dur;
    target.hazard = {
      type: 'shade_breach',
      name: picked.name,
      description: picked.description,
      effect: picked.effect,
      expiresAtReviewIndex: expiresAt,
      isBreach: true,
      locksRoom: true
    };
    target.lockedUntilReviewIndex = expiresAt;
    for (const c of state.characters) {
      if (c.status === 'away' || c.injury) continue;
      if (c.seatRoomId === target.id || c.workplaceRoomId === target.id || c.bedRoomId === target.id) {
        const hitMult = (c.traits?.includes('Lucky') ? 0.8 : 1) * breachFactor;
        const r = Math.random();
        if (r < 0.2 * hitMult) {
          if (!c.traits?.includes('Warded')) {
            c.injury = { type: 'hexed', points: 0, required: 60 };
          }
        } else if (r < 0.6 * hitMult) {
          c.injury = { type: 'bruised', points: 0, required: 30 };
        }
      }
    }
  } else if (picked.id === 'gloom_pack') {
    target.hazard = {
      type: 'gloom_pack',
      name: picked.name,
      description: picked.description,
      effect: picked.effect,
      expiresAtBellIndex: state.bellIndex + 1,
      areaScope: 'grounds',
      isBreach: true
    };
  } else if (picked.id === 'veil_rent') {
    const veilLoss = Math.max(1, Math.round(10 * breachFactor));
    state.veil.strength = Math.max(0, state.veil.strength - veilLoss);
    const dur = Math.max(5, Math.round(30 * breachFactor));
    const lockCount = shadeHoundRed > 0 ? Math.max(1, Math.round(3 * breachFactor)) : 3;
    const expiresAt = state.reviewIndex + dur;
    const lockCandidates = state.rooms.filter(r => r.state === 'built' && !isRoomUnfinished(r) && !r.hazard).slice(0, lockCount);
    for (const lr of lockCandidates) {
      lr.hazard = {
        type: 'veil_rent',
        name: picked.name,
        description: picked.description,
        effect: picked.effect,
        expiresAtReviewIndex: expiresAt,
        isBreach: true,
        locksRoom: true
      };
      lr.lockedUntilReviewIndex = expiresAt;
    }
  } else if (picked.id === 'wanderer') {
    target.hazard = {
      type: 'wanderer',
      name: picked.name,
      description: picked.description,
      effect: picked.effect,
      isBreach: true,
      tamingProgress: 0,
      tamingRequired: 160
    };
  }

  const msg = `🌀 Rift Breach: ${picked.name} emerged near ${ROOM_DEFINITIONS[target.defId]?.name || 'the Academy'}!`;
  notifications.push(msg);
  state.notices.push({
    id: uniqueNoticeId(`breach-${target.id}`, state),
    time: Date.now(),
    type: 'hazard',
    text: msg,
    data: { roomId: target.id, hazardId: picked.id as HazardType, hazardType: picked.id as HazardType }
  });
}

// --- M3: Personalities, Traits & Misbehavior Helpers (§14, §20) ---

const HABITAT_ROOM_DEFS = new Set([
  'meadow_paddock', 'tide_tank', 'aviary', 'gloom_enclosure', 'ember_hearth', 'crystal_terrarium', 'menagerie'
]);
const FELINE_CREATURES = new Set(['glyph_cat', 'night_lynx']);
const AVIAN_CREATURES = new Set(['meadow_lark', 'dawn_finch', 'star_heron', 'mistfeather_owl', 'chronoflare_owl', 'hush_raven', 'dawnhart_gryphon']);
const INSECT_CREATURES = new Set(['brook_beetle', 'prism_beetle', 'orrery_moth', 'lantern_moth']);
const COSMETIC_PRANK_LABELS = ['Green Hair', 'Floating Boots', 'Tiny Voice', 'Sparkling Ears'];
const SECRET_CLUB_NAMES = ['The Midnight Ink Society', 'The Gargoyle Watch', 'The Secret Waffle Guild', 'Order of the Floating Feather'];

function hasTrait(c: Character | undefined, trait: string): boolean {
  return !!c?.traits?.includes(trait);
}

function roomsAreAdjacent(a: PlacedRoom, b: PlacedRoom): boolean {
  if (a.id === b.id || a.area !== b.area) return false;
  return a.x <= b.x + b.w && b.x <= a.x + a.w && a.y <= b.y + b.h && b.y <= a.y + a.h;
}

function roomHasGlassFurniture(r: PlacedRoom | undefined): boolean {
  if (!r) return false;
  return (r.furniture || []).some(f => {
    const def = FURNITURE_DEFINITIONS[f.defId];
    return !!(def?.cost?.glass || f.defId.includes('window') || f.defId.includes('mirror') || f.defId.includes('lantern'));
  });
}

function characterMoraleBonuses(state: FullGameState, char: Character): number {
  let bonus = 0;
  const built = (state.rooms || []).filter(r => r.state === 'built' && !isRoomUnfinished(r));
  const hasBuilt = (defId: string) => built.some(r => r.defId === defId);
  const bedRoom = char.bedRoomId != null ? state.rooms.find(r => r.id === char.bedRoomId) : undefined;
  const seatRoom = char.seatRoomId != null ? state.rooms.find(r => r.id === char.seatRoomId) : undefined;
  const workRoom = char.workplaceRoomId != null ? state.rooms.find(r => r.id === char.workplaceRoomId) : undefined;
  const usedRooms = [bedRoom, seatRoom, workRoom].filter((r): r is PlacedRoom => !!r);

  // Personality Loves (+5) & Dislikes (-5) per §14.2
  switch (char.personality) {
    case 'Bookish':
      if (hasBuilt('library')) bonus += 5;
      if (bedRoom && built.some(r => r.defId === 'workshop' && roomsAreAdjacent(bedRoom, r))) bonus -= 5;
      break;
    case 'Mischievous':
      if (hasBuilt('common_room')) bonus += 5;
      if (hasBuilt('detention_hall')) bonus -= 5;
      break;
    case 'Gentle':
      if (built.some(r => HABITAT_ROOM_DEFS.has(r.defId))) bonus += 5;
      if (hasBuilt('training_yard')) bonus -= 5;
      break;
    case 'Bold':
      if (hasBuilt('training_yard')) bonus += 5;
      if (usedRooms.some(r => calculateRoomQuality(r).tier === 'bare')) bonus -= 5;
      break;
    case 'Dreamy':
      if (hasBuilt('observatory')) bonus += 5;
      if (usedRooms.some(r => !roomHasGlassFurniture(r))) bonus -= 5;
      break;
    case 'Steadfast':
      if (hasBuilt('sunlit_sanctum')) bonus += 5;
      break;
    case 'Social':
      if (hasBuilt('common_room') || hasBuilt('refectory')) bonus += 5;
      if (bedRoom && ['bare', 'plain'].includes(calculateRoomQuality(bedRoom).tier)) bonus -= 5;
      break;
    case 'Curious':
      if (hasBuilt('alchemy_lab') || hasBuilt('menagerie')) bonus += 5;
      break;
  }

  // Trait Morale Modifiers per §14.3
  if (hasTrait(char, 'Sunny')) bonus += 5;
  if (hasTrait(char, 'Homesick')) {
    const daysEnrolled = (state.day || 0) - (char.enrolledDay || 0);
    if (daysEnrolled <= 7) bonus -= 5;
    else if (daysEnrolled >= 30) bonus += 5;
  }
  const activeCreatures = (state.creatures || []).filter(cr => cr.status === 'tamed' || cr.status === 'wary');
  if (hasTrait(char, 'Cat Person')) bonus += activeCreatures.some(cr => FELINE_CREATURES.has(cr.defId)) ? 10 : -3;
  if (hasTrait(char, 'Bird Person')) bonus += activeCreatures.some(cr => AVIAN_CREATURES.has(cr.defId)) ? 10 : -3;
  if (hasTrait(char, 'Bug Person')) bonus += activeCreatures.some(cr => INSECT_CREATURES.has(cr.defId)) ? 10 : -3;

  return bonus;
}

function characterNeedDecayMults(state: FullGameState, char: Character): { hunger: number; rest: number; leisure: number; composure: number } {
  const m = { hunger: 1, rest: 1, leisure: 1, composure: 1 };
  const built = (state.rooms || []).filter(r => r.state === 'built' && !isRoomUnfinished(r));
  const hasLib = built.some(r => r.defId === 'library');
  const hasCommon = built.some(r => r.defId === 'common_room');
  const pDef = PERSONALITY_DEFINITIONS[char.personality];
  if (pDef) {
    const nm = pDef.needModifiers;
    if (nm.hungerDecayMult) m.hunger *= nm.hungerDecayMult;
    if (nm.restDecayMult) m.rest *= nm.restDecayMult;
    if (nm.leisureDecayMult && (!nm.requiresLibraryForLeisure || hasLib)) m.leisure *= nm.leisureDecayMult;
    if (nm.composureDecayMult && (!nm.requiresCommonRoomForComposure || hasCommon)) m.composure *= nm.composureDecayMult;
  }
  if (hasTrait(char, 'Night Owl')) m.rest *= 0.8;
  if (hasTrait(char, 'Iron Stomach')) m.hunger *= 0.7;
  if (hasTrait(char, 'Early Riser')) {
    m.rest *= 1.1;
    m.leisure *= 0.9;
  }
  if (hasTrait(char, 'Lazy')) m.rest *= 0.85;
  if (hasTrait(char, 'Nervous')) m.composure *= 1.4;
  return m;
}

function clearRoomMisbehaviorChains(state: FullGameState, roomId: number | undefined): number {
  let cleared = 0;
  for (const r of state.rooms) {
    if (roomId == null || r.id === roomId) {
      if (r.misbehaviorCharmMalus) {
        r.misbehaviorCharmMalus = undefined;
        cleared++;
      }
    }
  }
  for (const c of state.characters) {
    if (!c.misbehaviorChains?.length) continue;
    const before = c.misbehaviorChains.length;
    c.misbehaviorChains = roomId == null ? [] : c.misbehaviorChains.filter(ch => ch.roomId !== roomId);
    if (c.misbehaviorChains.length < before) cleared += before - c.misbehaviorChains.length;
  }
  return cleared;
}

function rollMisbehaviorForStudent(
  state: FullGameState,
  char: Character,
  wizBuffs: ReturnType<typeof wizardSchoolBuffs>,
  bag: Record<string, number>,
  note: (resource: string, before: number, source: string) => void,
  notifications: string[]
): void {
  if (char.status !== 'student' || char.status === ('away' as string)) return;
  if ((char.absentUntilReviewIndex || 0) > state.reviewIndex) return;

  const pMult = PERSONALITY_DEFINITIONS[char.personality]?.misbehaviorMult ?? 1;
  let traitMult = 1;
  if (hasTrait(char, 'Prankster')) traitMult *= 1.5;
  if (hasTrait(char, 'Rule-Bender')) traitMult *= 1.3;
  if ((char.secretClubUntilBell || 0) > state.bellIndex) traitMult *= 1.2;
  if ((char.morale ?? 70) >= 0) {
    const moraleMult =
      char.morale < 30 ? 2.0 :
      char.morale < 60 ? 1.25 :
      char.morale < 80 ? 1.0 : 0.6;
    const warders = state.characters.filter(isActiveWarder).length;
    const comL3 = state.rooms.filter(r => r.defId === 'common_room' && r.state === 'built' && !isRoomUnfinished(r) && r.level >= 3).length;
    const furnMisRed = Math.abs(academyFurnitureEffect(state.rooms, 'misbehavior_pct')) / 100;
    const creatureMisRed = creatureCategoryBonus(
      state,
      [
        { defId: 'duskmouse', perCopy: 0.05 },
        { defId: 'moonless_kitsune', perCopy: 0.2 }
      ],
      0.5
    );
    const sb = computeSpellbookBonuses(state.spellbooks || []);
    const globalRed = Math.min(
      0.75,
      wizBuffs.shadowSteps * 0.03 +
        warders * 0.1 +
        comL3 * 0.05 +
        furnMisRed +
        creatureMisRed +
        sb.misbehaviorReductionPct
    );
    const moonMult = (state.activeBuffs?.moonlessNightBells || 0) > 0 ? 0.4 : 1;

    const studentRoom = (char.seatRoomId ? state.rooms.find(r => r.id === char.seatRoomId) : undefined)
      || (char.bedRoomId ? state.rooms.find(r => r.id === char.bedRoomId) : undefined);
    let roomOrder = 0;
    if (studentRoom) {
      for (const f of studentRoom.furniture || []) {
        if (f.damaged) continue;
        roomOrder += FURNITURE_DEFINITIONS[f.defId]?.stats?.order || 0;
      }
    }
    const orderFactor = 1 - Math.min(0.3, roomOrder / 100);
    const pMisbehave = 0.004 * pMult * traitMult * moraleMult * (1 - globalRed) * moonMult * orderFactor;
    if (Math.random() >= pMisbehave) return;

    const picked = weightedPick(MISBEHAVIOR_INCIDENTS, inc => {
      let w = 1;
      if (inc.likelyPersonalities.includes(char.personality)) w += 3;
      if (inc.likelyTraits.some(t => hasTrait(char, t))) w += 3;
      if (inc.id === 'rift_peek' && !state.riftGateGranted) w = 0;
      return w;
    }) || MISBEHAVIOR_INCIDENTS[0];

    const ehRoom = state.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || state.rooms[0];
    let targetRoom = studentRoom || ehRoom;
    let extraText = picked.effectSummary;
    const involvedIds = [char.id];

    switch (picked.id) {
      case 'graffiti_glyphs': {
        if (targetRoom) {
          targetRoom.cleanliness = Math.max(0, targetRoom.cleanliness - 20);
          targetRoom.misbehaviorCharmMalus = (targetRoom.misbehaviorCharmMalus || 0) - 3;
          char.misbehaviorChains = [...(char.misbehaviorChains || []), { roomId: targetRoom.id, incidentId: 'graffiti_glyphs', penaltyCharm: -3 }];
        }
        if (Math.random() < 0.1) {
          const undisc = state.potions.find(p => !p.discovered);
          if (undisc) extraText += ` Clue spotted for ${undisc.name}!`;
        }
        break;
      }
      case 'food_fight': {
        const ref = state.rooms.find(r => r.defId === 'refectory' && r.state === 'built') || targetRoom;
        targetRoom = ref;
        if (ref) ref.cleanliness = Math.max(0, ref.cleanliness - 40);
        state.nextBellMealExtraProvisions = (state.nextBellMealExtraProvisions || 0) + 5;
        char.needs.leisure = Math.min(100, char.needs.leisure + 10);
        break;
      }
      case 'unauthorized_summoning': {
        const cand = targetRoom && !targetRoom.hazard ? targetRoom : state.rooms.find(r => r.state === 'built' && !isRoomUnfinished(r) && !r.hazard);
        const hazId = Math.random() < 0.5 ? 'echo_loop' : 'imp_infestation';
        if (cand && HAZARD_CATALOG[hazId]) {
          applyHazardInstance(state, HAZARD_CATALOG[hazId], cand, notifications);
          targetRoom = cand;
        }
        if (Math.random() < 0.15) {
          const commons = Object.values(CREATURE_DEFINITIONS).filter(c => c.rarity === 'common');
          const cDef = commons[Math.floor(Math.random() * commons.length)];
          if (cDef && state.creatures.length < 40) {
            state.creatures.push({
              id: uniqueNumericId(state.creatures.map(cr => cr.id)),
              defId: cDef.id,
              nickname: cDef.name,
              status: 'wary',
              hungry: false,
              hatchProgress: 0,
              tamingProgress: 0,
              bondLevel: 0,
              bondProgress: 0,
              arrivedDay: state.day
            });
            extraText += ` A wild ${cDef.name} slipped through!`;
          }
        }
        break;
      }
      case 'sneaking_out': {
        char.absentUntilReviewIndex = state.reviewIndex + 20;
        break;
      }
      case 'hex_duel': {
        const partner = state.characters.find(c => c.id !== char.id && c.status === 'student');
        const duelists = partner ? [char, partner] : [char];
        for (const d of duelists) {
          if (!d.injury && Math.random() < 0.2) d.injury = { type: 'bruised', points: 0, required: 30 };
          d.hexDuelFortuneBonus = (d.hexDuelFortuneBonus || 0) + 1;
          if (d.id !== char.id) involvedIds.push(d.id);
        }
        break;
      }
      case 'creature_release': {
        const cr = state.creatures.find(c => c.status === 'tamed' || c.status === 'wary');
        if (cr) {
          cr.returnStatus = cr.status === 'wary' ? 'wary' : 'tamed';
          cr.status = 'loose';
          extraText = `${cr.nickname} was set loose!`;
        }
        break;
      }
      case 'potion_prank': {
        const label = COSMETIC_PRANK_LABELS[Math.floor(Math.random() * COSMETIC_PRANK_LABELS.length)];
        char.cosmeticStatus = { label, expiresDay: state.day + 1 };
        for (const other of state.characters) {
          if (other.id !== char.id) other.needs.composure = Math.min(100, other.needs.composure + 5);
        }
        extraText = `${char.name} now has ${label} for 1 day (Onlookers +5 Composure)!`;
        break;
      }
      case 'midnight_feast': {
        const before = bag.provisions || 0;
        const loss = Math.min(10, Math.floor(before * 0.05));
        if (loss > 0) {
          bag.provisions = Math.max(0, before - loss);
          note('provisions', before, 'Midnight Feast');
        }
        for (const rm of state.characters) {
          if (char.bedRoomId != null && rm.bedRoomId === char.bedRoomId) {
            rm.needs.leisure = Math.min(100, rm.needs.leisure + 10);
          }
        }
        break;
      }
      case 'bell_prank': {
        for (const s of state.characters) {
          if (s.status === 'student') s.needs.rest = Math.max(0, s.needs.rest - 5);
        }
        break;
      }
      case 'library_fort': {
        const lib = state.rooms.find(r => r.defId === 'library' && r.state === 'built');
        if (lib) {
          lib.lockedUntilReviewIndex = Math.max(lib.lockedUntilReviewIndex || 0, state.reviewIndex + 20);
          targetRoom = lib;
        }
        const before = bag.insight || 0;
        bag.insight = before + 2;
        note('insight', before, 'Library Fort');
        break;
      }
      case 'portrait_mustache': {
        const hall = ehRoom || targetRoom;
        if (hall) {
          hall.misbehaviorCharmMalus = (hall.misbehaviorCharmMalus || 0) - 2;
          char.misbehaviorChains = [...(char.misbehaviorChains || []), { roomId: hall.id, incidentId: 'portrait_mustache', penaltyCharm: -2 }];
          targetRoom = hall;
        }
        break;
      }
      case 'broom_joyride': {
        if (!char.injury && Math.random() < 0.3) char.injury = { type: 'bruised', points: 0, required: 30 };
        char.needs.leisure = Math.min(100, char.needs.leisure + 5);
        break;
      }
      case 'alchemy_dare': {
        const lab = state.rooms.find(r => r.defId === 'alchemy_lab' && r.state === 'built') || targetRoom;
        state.nextBellLabExplosionMult = Math.max(state.nextBellLabExplosionMult || 1, 3);
        if (lab) {
          char.misbehaviorChains = [...(char.misbehaviorChains || []), { roomId: lab.id, incidentId: 'alchemy_dare', expiresBell: state.bellIndex + 2 }];
          targetRoom = lab;
        }
        break;
      }
      case 'rift_peek': {
        const gate = state.rooms.find(r => r.defId === 'rift_gate' && r.state === 'built');
        if (gate) {
          gate.lockedUntilReviewIndex = Math.max(gate.lockedUntilReviewIndex || 0, state.reviewIndex + 10);
          targetRoom = gate;
        }
        if (Math.random() < 0.1) {
          const resKey = Math.random() < 0.5 ? 'timber' : 'herbs';
          const amt = 3 + Math.floor(Math.random() * 6);
          const before = bag[resKey] || 0;
          bag[resKey] = before + amt;
          note(resKey, before, 'Rift Peek');
        }
        break;
      }
      case 'secret_club': {
        const members = [char, ...state.characters.filter(c => c.id !== char.id && c.status === 'student').slice(0, 2)];
        const clubName = SECRET_CLUB_NAMES[state.bellIndex % SECRET_CLUB_NAMES.length];
        for (const m of members) {
          m.needs.leisure = Math.min(100, m.needs.leisure + 10);
          m.secretClubUntilBell = state.bellIndex + 30;
          if (!involvedIds.includes(m.id)) involvedIds.push(m.id);
        }
        char.chronicle.push({ day: state.day, text: `Founded ${clubName}.` });
        extraText = `Formed "${clubName}" (+10 Leisure, misbehavior x1.2 for 30 bells)!`;
        break;
      }
      case 'dorm_swap': {
        const other = state.characters.find(c => c.id !== char.id && c.status === 'student' && c.bedRoomId && c.bedRoomId !== char.bedRoomId);
        if (other && char.bedRoomId) {
          const tmp = char.bedRoomId;
          char.bedRoomId = other.bedRoomId;
          other.bedRoomId = tmp;
          involvedIds.push(other.id);
        }
        for (const c of state.characters) {
          if (c.bedRoomId && c.bedRoomId === char.bedRoomId) {
            c.needs.composure = Math.min(100, c.needs.composure + 3);
          }
        }
        break;
      }
    }

    const msg = `${picked.name}: ${char.name} — ${extraText}`;
    notifications.push(`⚠️ Misbehavior: ${msg}`);
    state.notices.push({
      id: uniqueNoticeId(`misbehavior-${char.id}`, state),
      time: Date.now(),
      type: 'misbehavior',
      text: `Student Incident: ${msg}`,
      data: {
        roomId: targetRoom?.id,
        characterIds: involvedIds,
        incidentId: picked.id
      }
    });
  }
}

const APPLICANT_FIRST_NAMES = ['Tamsin', 'Corin', 'Lyra', 'Rowan', 'Bram', 'Sera', 'Pippin', 'Maren', 'Orin', 'Faye', 'Caspian', 'Nyx'];
const APPLICANT_LAST_NAMES = ['Reed', 'Blackwood', 'Starling', 'Vale', 'Thorn', 'Waverly', 'Ashford', 'Briar', 'Quill', 'Larkspur', 'Ember', 'Frost'];
const ALL_PERSONALITIES: PersonalityType[] = ['Bookish', 'Mischievous', 'Gentle', 'Bold', 'Dreamy', 'Steadfast', 'Social', 'Curious'];
const POSITIVE_TRAITS = Object.values(TRAIT_DEFINITIONS).filter(t => t.category === 'positive').map(t => t.id);
const NEUTRAL_TRAITS = Object.values(TRAIT_DEFINITIONS).filter(t => t.category === 'neutral').map(t => t.id);
const TROUBLESOME_TRAITS = Object.values(TRAIT_DEFINITIONS).filter(t => t.category === 'troublesome').map(t => t.id);

function generateApplicantsForState(
  state: FullGameState,
  count: number = 4
): Array<{ name: string; personality: PersonalityType; traits: string[]; bio: string }> {
  const renown = state.renown || 0;
  const hasOpenDoor = state.spellbooks?.includes('the_open_door');
  const totalCount = hasOpenDoor ? count + 1 : count;
  const seedBase = (state.day || 0) * 131 + (state.characters?.length || 0) * 37 + Math.floor(renown / 25) * 17;
  const pseudo = (salt: number) => {
    let n = Math.imul(seedBase + salt * 2654435761, 374761393);
    n = Math.imul(n ^ (n >>> 13), 1274126177);
    return ((n ^ (n >>> 16)) >>> 0) / 4294967296;
  };
  const usedNames = new Set((state.characters || []).map(c => c.name));
  const out: Array<{ name: string; personality: PersonalityType; traits: string[]; bio: string }> = [];

  for (let i = 0; i < totalCount; i++) {
    let name = '';
    for (let attempt = 0; attempt < 8; attempt++) {
      const f = APPLICANT_FIRST_NAMES[Math.floor(pseudo(i * 19 + attempt * 3 + 1) * APPLICANT_FIRST_NAMES.length)];
      const l = APPLICANT_LAST_NAMES[Math.floor(pseudo(i * 19 + attempt * 3 + 2) * APPLICANT_LAST_NAMES.length)];
      const candidate = `${f} ${l}`;
      if (!usedNames.has(candidate)) {
        name = candidate;
        usedNames.add(candidate);
        break;
      }
    }
    if (!name) name = `Apprentice #${(state.characters?.length || 0) + i + 1}`;
    const personality = ALL_PERSONALITIES[Math.floor(pseudo(i * 19 + 4) * ALL_PERSONALITIES.length)];
    const traitCount = renown >= 300 || hasOpenDoor
      ? (pseudo(i * 19 + 5) < 0.5 ? 3 : 2)
      : renown >= 150
      ? 2
      : renown >= 50
      ? (pseudo(i * 19 + 5) < 0.5 ? 2 : 1)
      : 1;

    const traits: string[] = [];
    for (let tIdx = 0; tIdx < traitCount; tIdx++) {
      const r = pseudo(i * 31 + tIdx * 7 + 9);
      const posCutoff = renown >= 300 || hasOpenDoor ? 0.72 : renown >= 150 ? 0.58 : renown >= 50 ? 0.45 : 0.3;
      const neuCutoff = posCutoff + 0.35;
      const pool = r < posCutoff ? POSITIVE_TRAITS : r < neuCutoff ? NEUTRAL_TRAITS : TROUBLESOME_TRAITS;
      const picked = pool[Math.floor(pseudo(i * 31 + tIdx * 11 + 13) * pool.length)];
      if (picked && !traits.includes(picked)) traits.push(picked);
    }
    const pInfo = PERSONALITY_DEFINITIONS[personality];
    out.push({
      name,
      personality,
      traits,
      bio: `${pInfo.flavour}. ${pInfo.lovesText}.`
    });
  }
  return out;
}

// --- M4: Timed Alchemy Brewing Helpers (§24.2) ---

function completeBrewJob(
  next: FullGameState,
  recipeId: string,
  labRoom: PlacedRoom | undefined,
  usedAlchemist: boolean,
  hasPhilosophersHour: boolean,
  notifications?: string[]
): number {
  const recipe = next.potions.find(p => p.id === recipeId);
  const wizBuffs = wizardSchoolBuffs(next.wizard.levels);
  const sb = computeSpellbookBonuses(next.spellbooks || []);
  const alumni = computeAlumniBonuses(next.alumniGallery || []);
  const creatureYield = creatureCategoryBonus(
    next,
    [
      { defId: 'cinder_newt', perCopy: 0.05 },
      { defId: 'alembic_salamander', perCopy: 0.1 }
    ],
    0.5
  );
  const hasAthanor = !!(labRoom?.furniture || []).some(f => f.defId === 'everburning_athanor' && !f.damaged);
  const yieldMult =
    1 +
    wizBuffs.alchemySteps * 0.03 +
    creatureYield +
    sb.potionYieldPct +
    alumni.alchemistPotionPct +
    (hasAthanor ? 0.15 : 0);

  const rawYield = 2 * yieldMult * (hasPhilosophersHour ? 2 : 1);
  if (!next.fractionalPotionYields) next.fractionalPotionYields = {};
  const combined = (next.fractionalPotionYields[recipeId] || 0) + rawYield;
  let granted = Math.floor(combined + 1e-9);
  next.fractionalPotionYields[recipeId] = Math.max(0, Number((combined - granted).toFixed(6)));

  let bonusFromMastery = false;
  if (usedAlchemist) {
    next.alchemistBrewCount = (next.alchemistBrewCount || 0) + 1;
    if (next.alchemistBrewCount % 4 === 0) {
      granted += 1;
      bonusFromMastery = true;
    }
  }

  next.resources.potions[recipeId] = (next.resources.potions[recipeId] || 0) + granted;
  const msg = `⚗️ Brewed ${granted}x ${recipe?.name || recipeId}!${bonusFromMastery ? ' (+1 Alchemist batch bonus!)' : ''} (${recipe?.effect || ''})`;
  notifications?.push(msg);
  next.notices.push({
    id: uniqueNoticeId(`brew-done-${recipeId}`, next),
    time: Date.now(),
    type: 'alchemy',
    text: msg,
    data: {
      potionId: recipeId,
      roomId: labRoom?.id,
      school: recipe?.school,
      visualEventType: 'potion_brewed'
    }
  });
  return granted;
}

function rollAlchemyExplosionForBell(state: FullGameState, notifications: string[]): void {
  const queue = state.brewingQueue || [];
  if (queue.length === 0) return;

  const activeLabIds = Array.from(new Set(queue.map(j => j.roomId)));
  const salamanderScale = bestBuffScale(state.creatures, 'alembic_salamander') > 0
    ? creatureSpeciesBuffSum(state, 'alembic_salamander')
    : 0;
  const fireproofBells = state.activeBuffs?.fireproofBells || 0;
  const fireproofRoomId = state.activeBuffs?.fireproofRoomId;
  const sb = computeSpellbookBonuses(state.spellbooks || []);

  for (const labId of activeLabIds) {
    const lab = state.rooms.find(r => r.id === labId && r.state === 'built' && !isRoomUnfinished(r));
    if (!lab) continue;
    if (fireproofBells > 0 && (!fireproofRoomId || fireproofRoomId === lab.id)) continue;

    const alchemists = state.characters.filter(
      c => c.career === 'alchemist' && c.careerState === 'active' && c.status !== 'away' && c.workplaceRoomId === lab.id
    );
    const hasAlchemist = alchemists.length > 0;
    const hasFumeHood = (lab.furniture || []).some(f => f.defId === 'fume_hood' && !f.damaged);
    const hasSteadyHand = state.characters.some(
      c => hasTrait(c, 'Steady Hand') && (c.workplaceRoomId === lab.id || c.seatRoomId === lab.id)
    );
    const hasFirebug = state.characters.some(
      c => hasTrait(c, 'Firebug') && (c.workplaceRoomId === lab.id || c.seatRoomId === lab.id || c.bedRoomId === lab.id)
    );

    const pExplosion =
      0.005 *
      (hasAlchemist ? 0.5 : 1) *
      (hasSteadyHand ? 0.5 : 1) *
      (hasFumeHood ? 0.6 : 1) *
      Math.max(0.25, 1 - salamanderScale * 0.30) *
      (1 - sb.labExplosionReductionPct) *
      (hasFirebug ? 2 : 1) *
      (state.nextBellLabExplosionMult || 1);

    if (Math.random() < pExplosion) {
      lab.cleanliness = Math.max(0, lab.cleanliness - 40);
      if (alchemists.length > 0 && Math.random() < 0.3) {
        const victim = alchemists[Math.floor(Math.random() * alchemists.length)];
        if (!victim.injury) {
          victim.injury = { type: 'bruised', points: 0, required: 30 };
        }
      }
      const msg = `💥 Bubbling Cauldron in ${ROOM_DEFINITIONS[lab.defId]?.name || 'Alchemy Lab'}! (-40 Cleanliness; brew continues.)`;
      notifications.push(msg);
      state.notices.push({
        id: uniqueNoticeId(`cauldron-${lab.id}`, state),
        time: Date.now(),
        type: 'hazard',
        text: msg,
        data: { roomId: lab.id, hazardId: 'bubbling_cauldron', hazardType: 'bubbling_cauldron' }
      });
    }
  }
}

// --- M7: Alumni Bonuses, Visits, 21 Spellbooks & Card Linking Helpers (§13, §31) ---

function isCardInDeckScope(card: AnkiCardSnapshot, deckScope?: string): boolean {
  if (!deckScope || deckScope === 'all' || deckScope.trim() === '') return true;
  const scope = deckScope.trim().toLowerCase();
  const name = (card.deckName || '').toLowerCase();
  return name === scope || name.startsWith(`${scope}::`) || name.includes(scope);
}

function getEligibleFreeYoungCards(state: FullGameState, maxIvl: number = 30): AnkiCardSnapshot[] {
  const linkedCardIds = new Set<number>();
  for (const set of state.cardSets || []) {
    if (!set.released) {
      for (const cid of set.cardIds) linkedCardIds.add(cid);
    }
  }
  const allowNewCards = state.settings?.linkNewCards ?? false;
  return Object.values(state.allCards || {})
    .filter(
      c =>
        !linkedCardIds.has(c.id) &&
        c.honestIvl <= maxIvl &&
        c.queue !== -1 &&
        (allowNewCards || (c.type ?? 2) !== 0) &&
        isCardInDeckScope(c, state.settings?.deckScope)
    )
    .sort((a, b) => a.honestIvl - b.honestIvl || a.id - b.id);
}

function pickFreeYoungCards(state: FullGameState, maxIvl: number, needed: number): AnkiCardSnapshot[] {
  const candidates = getEligibleFreeYoungCards(state, maxIvl);
  if (!state.settings?.avoidSiblings) {
    return candidates.slice(0, needed);
  }
  const seenNids = new Set<number>();
  const firstPass: AnkiCardSnapshot[] = [];
  const remainder: AnkiCardSnapshot[] = [];
  for (const c of candidates) {
    const nid = c.nid ?? c.id;
    if (!seenNids.has(nid)) {
      seenNids.add(nid);
      firstPass.push(c);
    } else {
      remainder.push(c);
    }
  }
  if (firstPass.length >= needed) {
    return firstPass.slice(0, needed);
  }
  return [...firstPass, ...remainder].slice(0, needed);
}

function createAlumnusRecord(
  char: Character,
  retiredDay: number,
  retirementAgeDays?: number
): FullGameState['alumniGallery'][number] {
  const scale = alumniRetirementScale(retirementAgeDays);
  const career: CareerType | 'resident' = char.career || 'resident';
  const baseByCareer: Record<CareerType | 'resident', number> = {
    teacher: 0.01,
    scholar: 0.005,
    gardener: 0.02,
    tamer: 0.02,
    healer: 0.02,
    warder: 0.01,
    alchemist: 0.02,
    builder: 0.01,
    adventurer: 0.2,
    resident: 0.01
  };
  const bonusValue = Number((baseByCareer[career] * scale).toFixed(4));
  const extraSchoolsMastered = Math.max(0, (char.masteredSchools?.length || 1) - 1);
  return {
    id: char.id,
    name: char.name,
    portrait: char.appearance?.hat || 'grand_hat',
    titles: char.masteredSchools.map(s => `Master of ${s.toUpperCase()}`),
    retiredDay,
    career,
    extraSchoolsMastered,
    retiredAgeDays: retirementAgeDays || 90,
    bonusType: career,
    bonusValue
  };
}

function offerSpellbookDraft(
  state: FullGameState,
  targetTier: 1 | 2 | 3,
  source: string,
  allowPlanPick: boolean = false
): void {
  if (!state.spellbooks) state.spellbooks = [];
  if (state.pendingSpellbookDraft) return;
  const owned = new Set(state.spellbooks);
  const allDefs = Object.values(SPELLBOOK_DEFINITIONS);
  const unownedInTier = allDefs.filter(d => d.tier === targetTier && !owned.has(d.id));
  const otherUnowned = allDefs
    .filter(d => d.tier !== targetTier && !owned.has(d.id))
    .sort((a, b) => Math.abs(a.tier - targetTier) - Math.abs(b.tier - targetTier));
  const pool = [...unownedInTier, ...otherUnowned];
  if (pool.length === 0) {
    state.renown = (state.renown || 0) + 50;
    const msg = `✨ Gilded Edition! All 21 Spellbooks already collected — ${source} grants +50 Renown!`;
    state.notices.push({
      id: uniqueNoticeId('gilded-spellbook', state),
      time: Date.now(),
      type: 'milestone',
      text: msg
    });
    return;
  }
  const choices = unownedInTier.length >= 3
    ? [...unownedInTier].sort(() => Math.random() - 0.5).slice(0, 3).map(d => d.id)
    : pool.slice(0, 3).map(d => d.id);
  state.pendingSpellbookDraft = {
    choices,
    tier: targetTier,
    source,
    allowPlanPick
  };
  state.notices.push({
    id: uniqueNoticeId('spellbook-offer', state),
    time: Date.now(),
    type: 'milestone',
    text: `📚 A Tier ${targetTier} Spellbook Choice awaits (${source})!`
  });
}

function checkEndlessSpellbookMilestones(state: FullGameState): void {
  if (state.settings?.mode === 'timed' || state.pendingSpellbookDraft) return;
  const renown = state.renown || 0;
  const last = state.lastRenownSpellbookThreshold || 0;
  for (const m of ENDLESS_SPELLBOOK_MILESTONES) {
    if (m.renown > last && renown >= m.renown) {
      state.lastRenownSpellbookThreshold = m.renown;
      offerSpellbookDraft(state, m.tier, `Endless Renown ${m.renown}`);
      return;
    }
  }
  if (last >= 1200) {
    const nextThreshold = last + 400;
    if (renown >= nextThreshold) {
      state.lastRenownSpellbookThreshold = nextThreshold;
      offerSpellbookDraft(state, 3, `Endless Renown ${nextThreshold}`);
    }
  }
}

function grantAlumniVisitGift(state: FullGameState, summary: string[]): void {
  if (!state.alumniGallery?.length) return;
  if (state.lastAlumniVisitDay === state.day) return;
  if (Math.random() >= 0.03) return;

  state.lastAlumniVisitDay = state.day;
  const visitor = state.alumniGallery[Math.floor(Math.random() * state.alumniGallery.length)];
  const career = visitor.career || visitor.bonusType || 'resident';
  const cap = AnkicasterEngine.storageCap(state);
  const storeCommon = (key: keyof FullGameState['resources'], amt: number) => {
    const cur = (state.resources as any)[key] || 0;
    (state.resources as any)[key] = cur >= cap ? cur : Math.min(cap, cur + amt);
  };
  let giftText = '+15 Mana';
  switch (career) {
    case 'gardener':
      storeCommon('greens', 20);
      giftText = '+20 Greens';
      break;
    case 'adventurer':
      if (!state.scrolls) state.scrolls = {};
      state.scrolls.rift_map = (state.scrolls.rift_map || 0) + 1;
      giftText = '+1 Rift Map scroll';
      break;
    case 'alchemist':
      state.resources.reagents = (state.resources.reagents || 0) + 15;
      giftText = '+15 Reagents';
      break;
    case 'builder':
      storeCommon('timber', 15);
      storeCommon('stone', 15);
      giftText = '+15 Timber, +15 Stone';
      break;
    case 'scholar':
      state.resources.insight = (state.resources.insight || 0) + 15;
      giftText = '+15 Insight';
      break;
    case 'healer':
      state.resources.herbs = (state.resources.herbs || 0) + 15;
      giftText = '+15 Herbs';
      break;
    case 'tamer':
      storeCommon('provisions', 10);
      storeCommon('fish', 10);
      giftText = '+10 Provisions, +10 Fish';
      break;
    case 'warder':
      state.resources.umbra = (state.resources.umbra || 0) + 15;
      giftText = '+15 Umbra';
      break;
    default:
      state.mana = (state.mana || 0) + 25;
      state.resources.radiance = (state.resources.radiance || 0) + 10;
      giftText = '+25 Mana, +10 Radiance';
      break;
  }
  const msg = `🎓 Alumni Visit: ${visitor.name} dropped by with a gift (${giftText})!`;
  summary.push(msg);
  state.notices.push({
    id: uniqueNoticeId(`alumni-visit-${visitor.id}`, state),
    time: Date.now(),
    type: 'event',
    text: msg
  });
}

function checkSuspendedLinkedCards(state: FullGameState, summary: string[]): void {
  const daysLimit = state.settings?.suspendedReleaseDays ?? 30;
  if (!state.suspendedSinceDay) state.suspendedSinceDay = {};
  const tracker = state.suspendedSinceDay;

  for (const cidStr of Object.keys(tracker)) {
    const cid = Number(cidStr);
    const card = state.allCards?.[cid];
    if (!card || card.queue !== -1) {
      delete tracker[cid];
    }
  }

  let releasedTotal = 0;
  let replacedTotal = 0;
  for (const set of state.cardSets || []) {
    if (set.released) continue;
    const maxIvl = set.kind === 'career' ? 45 : 30;
    const kept: number[] = [];
    let removedCount = 0;
    for (const cid of set.cardIds) {
      const card = state.allCards?.[cid];
      if (card && card.queue === -1) {
        if (tracker[cid] === undefined) tracker[cid] = state.day;
        if (state.day - tracker[cid] >= daysLimit) {
          delete tracker[cid];
          removedCount++;
          releasedTotal++;
          continue;
        }
      }
      kept.push(cid);
    }
    if (removedCount > 0) {
      set.cardIds = kept;
      const replacements = pickFreeYoungCards(state, maxIvl, removedCount);
      for (const rep of replacements) {
        set.cardIds.push(rep.id);
        replacedTotal++;
      }
      set.size = set.cardIds.length;
    }
  }

  if (releasedTotal > 0) {
    const msg = `🔄 Released ${releasedTotal} suspended flashcard(s) (${daysLimit}d limit) and linked ${replacedTotal} fresh replacement(s).`;
    summary.push(msg);
    state.notices.push({
      id: uniqueNoticeId('suspended-release', state),
      time: Date.now(),
      type: 'event',
      text: msg
    });
  }
}

export class AnkicasterEngine {
  /** One-off resource changes (builds, draws, events). Display only. */
  static logResourceChange(state: FullGameState, resource: string, amount: number, label: string): void {
    logResourceChange(state, resource, amount, label);
  }

  /** 200 common-material storage, plus 100 for each built Storage Vault that is not Unfinished. */
  static storageCap(state: { rooms?: FullGameState['rooms'] }): number {
    return storageCapOf(state);
  }

  /** Grant the Rift Gate plan once the Academy has 3 masters, active or alumni. */
  static grantRiftGate(state: FullGameState): void {
    if (state.riftGateGranted) return;
    const masters = state.characters.filter(c => (c.masteredSchools?.length || 0) > 0).length + (state.alumniGallery?.length || 0);
    if (masters < 3) return;
    state.roomPlans = state.roomPlans || {};
    state.roomPlans.rift_gate = (state.roomPlans.rift_gate || 0) + 1;
    state.riftGateGranted = true;
    state.notices = state.notices || [];
    state.notices.push({
      id: uniqueNoticeId('rift-plan', state),
      time: Date.now(),
      type: 'blueprint',
      text: 'Three masters now serve the Academy. A Rift Gate plan has been granted.'
    });
  }

  /**
   * Process one honest Anki review (BR-01, BR-03, BR-06, BR-07, Section 38.12)
   * Optimized: Performs localized shallow copying instead of structuredClone on entire state
   */
  static applyHonestReview(
    state: FullGameState,
    cardId: number,
    ease: 1 | 2 | 3 | 4,
    elapsedMs: number = 2400,
    cardAge?: number,
    reviewId?: string
  ): { state: FullGameState; toast?: string; notifications: string[] } {
    const notifications: string[] = [];

    // Deduplication check: ignore if this review has already been processed (only reviewId is used)
    if (reviewId) {
      if (state.processedReviewIds && state.processedReviewIds.includes(reviewId)) {
        return { state, notifications };
      }
    }

    // H5 check: Anti-mash guard (answers < 800ms grant 0)
    if (elapsedMs < 800) {
      notifications.push('Review answered too quickly (<0.8s) — honest study pace required for mana.');
      return { state, notifications };
    }

    const next: FullGameState = {
      ...state,
      wizard: {
        ...state.wizard,
        levels: { ...state.wizard.levels },
        knownSpells: [...(state.wizard.knownSpells || [])],
        spellCooldowns: { ...state.wizard.spellCooldowns },
        activeSession: state.wizard.activeSession ? { ...state.wizard.activeSession } : undefined,
        queuedSessions: state.wizard.queuedSessions ? state.wizard.queuedSessions.map(s => ({ ...s })) : []
      },
      allCards: { ...state.allCards },
      characters: state.characters.map(c => ({
        ...c,
        masteredSchools: [...(c.masteredSchools || [])],
        traits: [...(c.traits || [])],
        careerSetIds: [...(c.careerSetIds || [])],
        needs: { ...c.needs },
        readyDays: { ...c.readyDays },
        chronicle: c.chronicle.map(ch => ({ ...ch })),
        injury: c.injury ? { ...c.injury } : undefined
      })),
      cardSets: state.cardSets.map(s => ({ ...s, cardIds: [...s.cardIds] })),
      rooms: state.rooms.map(cloneRoom),
      shelvedRooms: state.shelvedRooms ? state.shelvedRooms.map(cloneRoom) : undefined,
      creatures: state.creatures.map(c => ({
        ...c,
        stashed: c.stashed ? { ...c.stashed } : undefined,
        injury: c.injury ? { ...c.injury } : undefined
      })),
      expeditions: state.expeditions.map(e => ({
        ...e,
        teamIds: [...e.teamIds],
        suppliesTaken: [...e.suppliesTaken],
        lootSummary: e.lootSummary ? [...e.lootSummary] : undefined
      })),
      resources: {
        ...state.resources,
        seedsUnlocked: Array.isArray(state.resources.seedsUnlocked)
          ? [...state.resources.seedsUnlocked]
          : state.resources.seedsUnlocked,
        potions: state.resources.potions && typeof state.resources.potions === 'object'
          ? { ...state.resources.potions }
          : state.resources.potions
      },
      veil: {
        ...state.veil,
        reductions: (state.veil.reductions || []).map(r => ({ ...r }))
      },
      activeBuffs: state.activeBuffs
        ? {
            ...state.activeBuffs,
            wardwaterFloors: state.activeBuffs.wardwaterFloors ? [...state.activeBuffs.wardwaterFloors] : undefined
          }
        : undefined,
      resourceLedger: state.resourceLedger
        ? {
            bells: state.resourceLedger.bells.map(b => ({ entries: b.entries.map(e => ({ ...e })) })),
            recent: Object.fromEntries(
              Object.entries(state.resourceLedger.recent || {}).map(([k, v]) => [k, v.map(item => ({ ...item }))])
            ),
            recentAll: state.resourceLedger.recentAll ? state.resourceLedger.recentAll.map(item => ({ ...item })) : undefined
          }
        : undefined,
      activeEvents: (state.activeEvents || []).map(ev => ({ ...ev })),
      potions: (state.potions || []).map(p => ({ ...p, ingredients: [...p.ingredients] })),
      roomPlans: state.roomPlans ? { ...state.roomPlans } : undefined,
      hand: state.hand ? [...state.hand] : [],
      draftHistory: state.draftHistory ? { ...state.draftHistory } : {},
      draftPity: state.draftPity ? { ...state.draftPity } : {},
      roomlessStreak: state.roomlessStreak ? { ...state.roomlessStreak } : undefined,
      knownPatterns: state.knownPatterns ? [...state.knownPatterns] : [],
      knownPlans: state.knownPlans ? [...state.knownPlans] : [],
      discoveredCreatures: state.discoveredCreatures ? [...state.discoveredCreatures] : undefined,
      brewingQueue: state.brewingQueue ? state.brewingQueue.map(j => ({ ...j })) : [],
      fractionalPotionYields: state.fractionalPotionYields ? { ...state.fractionalPotionYields } : undefined,
      scrolls: state.scrolls ? { ...state.scrolls } : undefined,
      scrollQueue: state.scrollQueue ? state.scrollQueue.map(j => ({ ...j })) : [],
      discoveredHints: state.discoveredHints
        ? Object.fromEntries(Object.entries(state.discoveredHints).map(([k, v]) => [k, [...v]]))
        : undefined,
      notices: [...state.notices],
      processedReviewIds: state.processedReviewIds ? [...state.processedReviewIds] : []
    };

    if (reviewId) {
      next.processedReviewIds!.push(reviewId);
      if (next.processedReviewIds!.length > 2000) {
        next.processedReviewIds!.shift();
      }
      next.lastProcessedReviewId = reviewId;
    }

    // 1. Mana gain (F1)
    const sbRev = computeSpellbookBonuses(next.spellbooks || []);
    const alumniRev = computeAlumniBonuses(next.alumniGallery || []);
    const manaEarned = calculateReviewMana(
      next.wizard.levels.arcane,
      sbRev.manaPct + alumniRev.scholarManaPct,
      next.settings?.manaPerReview ?? 10
    );
    if (next.manaDebt > 0) {
      const debtPaid = Math.min(next.manaDebt, manaEarned);
      next.manaDebt -= debtPaid;
      next.mana += manaEarned - debtPaid;
    } else {
      next.mana += manaEarned;
    }

    next.reviewIndex += 1;
    next.bankAtLastReview = next.mana;

    // 2. Update Card Interval (Real Bridged Review vs Mock Scheduler)
    const card = next.allCards[cardId];
    if (card) {
      const updatedCard = { ...card, lastStudiedMs: Date.now() };
      if (cardAge !== undefined) {
        // Bridged real review from Anki: NEVER run fake scheduler!
        updatedCard.honestIvl = cardAge;
        updatedCard.ivl = cardAge;
        updatedCard.lastAnswerIvl = cardAge;
      } else {
        // Standalone simulated review: update mock intervals
        if (ease === 1) {
          updatedCard.ivl = 1;
          updatedCard.lastAnswerIvl = 1;
          updatedCard.honestIvl = 1;
        } else if (ease === 2) {
          updatedCard.ivl = Math.max(1, Math.round(card.ivl * 1.2));
          updatedCard.lastAnswerIvl = updatedCard.ivl;
          updatedCard.honestIvl = updatedCard.ivl;
        } else if (ease === 3) {
          updatedCard.ivl = Math.max(2, Math.round(card.ivl * 2.2));
          updatedCard.lastAnswerIvl = updatedCard.ivl;
          updatedCard.honestIvl = updatedCard.ivl;
        } else {
          updatedCard.ivl = Math.max(4, Math.round(card.ivl * 2.8));
          updatedCard.lastAnswerIvl = updatedCard.ivl;
          updatedCard.honestIvl = updatedCard.ivl;
        }
      }
      next.allCards[cardId] = updatedCard;
    } else if (cardAge !== undefined) {
      // Dynamic registration for non-suspended real Anki cards
      next.allCards[cardId] = {
        id: cardId,
        nid: cardId,
        deckName: 'Anki Collection',
        front: `Anki Card #${cardId}`,
        back: 'Answer',
        ivl: cardAge,
        lastAnswerIvl: cardAge,
        honestIvl: cardAge,
        type: 2,
        queue: 2,
        due: 0,
        lastStudiedMs: Date.now(),
        installBaselineMs: next.installBaselineMs
      };
    }

    // Recalculate skill for students/faculty linked to this card
    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];
    const studyRoom = next.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built');
    for (const char of next.characters) {
      if (char.studySetId) {
        const studySet = next.cardSets.find(s => s.id === char.studySetId);
        if (studySet && studySet.cardIds.includes(cardId)) {
          const ivls = studySet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
          if (isMasteryReady(ivls, next.settings.cardsPerStudent)) {
            if (!char.masteredSchools.includes(char.currentSchool || 'nature')) {
              const school = char.currentSchool || 'nature';
              const wasTracked = school in char.readyDays;
              char.readyDays[school] = (char.readyDays[school] || 0);
              if (!wasTracked) {
                next.notices.push({
                  id: `mastery-ready-${char.id}-${school}-${next.reviewIndex}`,
                  time: Date.now(),
                  type: 'mastery_ready',
                  text: `⭐ ${char.name} is mastery-ready in ${school.toUpperCase()}!`,
                  data: {
                    roomId: char.seatRoomId ?? ehRoom?.id,
                    characterIds: [char.id],
                    school,
                    visualEventType: 'mastery_ready'
                  }
                });
              }
            }
          }
        }
      }
    }

    // 3. Advance Wizard Active Training Session (BR-06, BR-07) — paused if Wizard's Study is shelved
    if (next.wizard.activeSession && next.wizard.activeSession.state === 'active' && studyRoom) {
      const ponderPct = !isRoomUnfinished(studyRoom)
        ? academyFurnitureEffect(next.rooms, 'ponder_pct', studyRoom)
        : 0;
      const ponderStep = ponderPct > 0 ? Math.round((1 + ponderPct / 100) * 100) / 100 : 1;
      next.wizard.activeSession.progress = Math.round((next.wizard.activeSession.progress + ponderStep) * 100) / 100;
      if (next.wizard.activeSession.progress >= next.wizard.activeSession.required) {
        const sess = next.wizard.activeSession;
        if (sess.kind === 'orb') {
          const sch = sess.school;
          const newLevel = (next.wizard.levels[sch] || 0) + 1;
          next.wizard.levels[sch] = Math.min(10, newLevel);
          notifications.push(`🎉 Wizard reached Level ${newLevel} in ${sch.toUpperCase()}!`);
          next.notices.push({
            id: uniqueNoticeId('lvl', next),
            time: Date.now(),
            type: 'level_up',
            text: `Wizard attained Level ${newLevel} in ${sch} magic.`,
            data: {
              roomId: studyRoom?.id,
              school: sch,
              level: newLevel,
              visualEventType: 'wizard_level_up'
            }
          });
        } else if (sess.kind === 'grimoire' && sess.spellId) {
          if (!next.wizard.knownSpells.includes(sess.spellId)) {
            next.wizard.knownSpells.push(sess.spellId);
            const spDef = SPELL_DEFINITIONS[sess.spellId];
            notifications.push(`✨ Mastered Grimoire Spell: ${spDef ? spDef.name : sess.spellId}!`);
            next.notices.push({
              id: uniqueNoticeId(`spell-learn-${sess.spellId}`, next),
              time: Date.now(),
              type: 'wizard_new_spell',
              text: `Mastered Grimoire Spell: ${spDef ? spDef.name : sess.spellId}!`,
              data: {
                roomId: studyRoom?.id,
                spellId: sess.spellId,
                school: sess.school,
                visualEventType: 'wizard_new_spell'
              }
            });
          }
        }

        if (next.wizard.queuedSessions.length > 0) {
          const nextSess = next.wizard.queuedSessions.shift()!;
          next.wizard.activeSession = {
            ...nextSess,
            progress: 0,
            state: 'active'
          };
        } else {
          next.wizard.activeSession = undefined;
        }
      }
    }

    // 4. Advance Active Constructions
    const buildSpeedPct = academyFurnitureEffect(
      next.rooms.filter(r => r.state === 'built' && !isRoomUnfinished(r)),
      'build_speed_pct'
    );
    const activeBuilders = next.characters.filter(
      c => c.career === 'builder' && c.careerState === 'active' && c.status !== 'away' && !c.injury
    );
    let builderBonus = 0;
    for (const b of activeBuilders) {
      const ws = b.workplaceRoomId != null
        ? next.rooms.find(
            r =>
              r.id === b.workplaceRoomId &&
              r.defId === 'workshop' &&
              r.state === 'built' &&
              !isRoomUnfinished(r) &&
              !AnkicasterEngine.roomIsLocked(next, r)
          )
        : undefined;
      const bStep = ws && (ws.level || 1) >= 3 ? 0.4 : 0.25;
      builderBonus += bStep * careerAffinityMultiplier(b.masteredSchools, 'builder') * facultyOutputMultiplier(next, b);
    }
    const hasQuickHandsBuilder = activeBuilders.some(c => hasTrait(c, 'Quick Hands'));
    const creatureBuildBonus = creatureCategoryBonus(
      next,
      [
        { defId: 'bellows_toad', perCopy: 0.05 },
        { defId: 'geode_golem', perCopy: 0.1 }
      ],
      0.5
    );
    const totalBuildPct = buildSpeedPct + (hasQuickHandsBuilder ? 15 : 0) + creatureBuildBonus * 100;
    const buildStep = Math.round((1 + builderBonus) * (1 + totalBuildPct / 100) * 100) / 100;
    for (const room of next.rooms) {
      if (room.state === 'site' && !room.buildPaused) {
        room.buildProgress = Math.round((room.buildProgress + buildStep) * 100) / 100;
        if (room.buildProgress >= room.buildRequired) AnkicasterEngine.completeSite(next, room, notifications);
      }
    }

    // 5. Advance Active Creature Taming & Hatching, and count down loose-creature captures
    const wizBuffs = wizardSchoolBuffs(next.wizard.levels);
    tickCaptures(next, notifications);
    const creatureRoomMap = resolveAllCreatureRooms(next.creatures, next.rooms);
    const HATCH_REVIEWS: Record<string, number> = {
      common: 20,
      uncommon: 40,
      rare: 60,
      epic: 80,
      legendary: 100
    };
    for (const c of next.creatures) {
      const cDef = CREATURE_DEFINITIONS[c.defId];
      if (c.status === 'egg' && cDef) {
        const res = creatureRoomMap.get(c.id);
        if (
          res &&
          !res.unhomed &&
          !res.roaming &&
          res.room &&
          res.room.state === 'built' &&
          roomAcceptedHabitats(res.room).some(h => cDef.habitats.includes(h))
        ) {
          const required = HATCH_REVIEWS[cDef.rarity] ?? 20;
          c.hatchProgress = Math.min(100, (c.hatchProgress || 0) + 100 / required);
          if (c.hatchProgress >= 100 - 1e-6) {
            c.hatchProgress = 100;
            c.status = 'wary';
            notifications.push(`🥚 ${c.nickname} (${cDef.name}) hatched and is now wary!`);
            next.notices.push({
              id: `hatch-${c.id}-${next.reviewIndex}`,
              time: Date.now(),
              type: 'creature_hatch',
              text: `🥚 ${c.nickname} (${cDef.name}) hatched and is now wary!`,
              data: {
                roomId: res.room.id,
                creatureId: c.id,
                visualEventType: 'creature_hatch'
              }
            });
          }
        }
        continue;
      }

      const cRoom = c.roomId != null ? next.rooms.find(r => r.id === c.roomId) : creatureRoomMap.get(c.id)?.room;
      if (c.status === 'wary' && c.tamerId !== undefined && c.tamerId !== null) {
        const tamingBonus = academyFurnitureEffect(next.rooms, 'taming_pct', cRoom);
        const tamerChar = c.tamerId > 0 ? next.characters.find(ch => ch.id === c.tamerId) : undefined;
        const tamerMastered = c.tamerId === 0
          ? wizardMasteredSchools(next.wizard.levels)
          : (tamerChar?.masteredSchools || []);
        const tamerMult = careerAffinityMultiplier(tamerMastered, 'tamer', cDef?.school);
        const whispererMult = hasTrait(tamerChar, 'Beast Whisperer') ? 1.25 : 1;
        const gentleMult = tamerChar?.personality === 'Gentle' ? 1.25 : 1;
        c.tamingProgress +=
          (1 + tamingBonus / 100) *
          tamerMult *
          whispererMult *
          gentleMult *
          wizBuffs.natureMult *
          (1 + sbRev.tamingPct + alumniRev.tamerTamingPct);
        if (cDef && c.tamingProgress >= cDef.tamingReviews) {
          c.status = 'tamed';
          notifications.push(`🐾 Tamed ${c.nickname} (${cDef.name})!`);
          next.notices.push({
            id: `tamed-${c.id}-${next.reviewIndex}`,
            time: Date.now(),
            type: 'creature_tamed',
            text: `🐾 Tamed ${c.nickname} (${cDef.name})!`,
            data: {
              roomId: cRoom?.id ?? ehRoom?.id,
              creatureId: c.id,
              characterIds: c.tamerId ? [c.tamerId] : undefined,
              visualEventType: 'creature_tamed'
            }
          });
          grantTamingOneTimeBonuses(next, c, notifications);
        }
      } else if (c.status === 'tamed') {
        const bondBonus = academyFurnitureEffect(next.rooms, 'creature_bond_pct', cRoom);
        c.bondProgress += 1 + bondBonus / 100;
        if (c.bondLevel <= 1 && c.bondProgress >= 150) {
          c.bondLevel = 2;
          notifications.push(`❤️ Bond Level 2 reached with ${c.nickname}!`);
          next.notices.push({
            id: `bond-${c.id}-2-${next.reviewIndex}`,
            time: Date.now(),
            type: 'creature_bond_up',
            text: `❤️ Bond Level 2 reached with ${c.nickname}!`,
            data: {
              roomId: cRoom?.id ?? ehRoom?.id,
              creatureId: c.id,
              visualEventType: 'creature_bond_up'
            }
          });
        } else if (c.bondLevel === 2 && c.bondProgress >= 400) {
          c.bondLevel = 3;
          notifications.push(`🌟 Bond Level 3 (Max) reached with ${c.nickname}!`);
          next.notices.push({
            id: `bond-${c.id}-3-${next.reviewIndex}`,
            time: Date.now(),
            type: 'creature_bond_up',
            text: `🌟 Bond Level 3 (Max) reached with ${c.nickname}!`,
            data: {
              roomId: cRoom?.id ?? ehRoom?.id,
              creatureId: c.id,
              visualEventType: 'creature_bond_up'
            }
          });
        }
      }
    }
    syncDiscoveredCreatures(next);

    // 6. Advance Active Expeditions
    for (const exp of next.expeditions) {
      if (exp.state === 'active') {
        exp.progressReviews += 1;
        if (exp.progressReviews >= exp.requiredReviews) {
          this.resolveExpedition(next, exp, notifications);
        }
      }
    }

    // 7. Healing Injuries in Infirmary (the infirmary's own bonus scales with its efficiency)
    let infirmaryBonus = 0;
    let infirmaryRoom: PlacedRoom | undefined;
    for (const r of next.rooms) {
      if (r.defId !== 'infirmary' || r.state !== 'built' || isRoomUnfinished(r)) continue;
      const effBonus = 1.5 * AnkicasterEngine.roomEfficiency(next, r);
      if (effBonus > infirmaryBonus) {
        infirmaryBonus = effBonus;
        infirmaryRoom = r;
      }
    }
    const activeHealerChars = next.characters.filter(c => c.career === 'healer' && c.careerState === 'active');
    const activeHealers = activeHealerChars.length;
    const haloScale = bestBuffScale(next.creatures, 'halo_lamb') > 0 ? creatureSpeciesBuffSum(next, 'halo_lamb') : 0;
    const phoenixHealCheck = bestBuffScale(next.creatures, 'ember_phoenix');
    const sunlitScale = creatureSpeciesBuffSum(next, 'sunlit_unicorn');
    const creatureHealBonus = creatureCategoryBonus(
      next,
      [
        { defId: 'halo_lamb', perCopy: 0.1 },
        { defId: 'sunlit_unicorn', perCopy: 0.2 },
        ...(phoenixHealCheck > 0 ? [{ defId: 'ember_phoenix', perCopy: 0.1 }] : []),
        ...(infirmaryRoom ? [{ defId: 'coral_kelpie', perCopy: 0.1 }] : [])
      ],
      0.5
    );

    const hasBathhouseHeal = next.rooms.some(
      r => r.defId === 'bathhouse' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(next, r)
    );
    const hasMoonwellHeal = next.rooms.some(
      r => r.defId === 'moonwell' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(next, r)
    );
    for (const char of next.characters) {
      if (char.injury) {
        let healRate = 1.0;
        if (infirmaryBonus > 0) healRate += infirmaryBonus;
        healRate += activeHealers * 1.5;
        if (haloScale > 0) healRate += 1.5 * haloScale;
        const healRooms = new Map<number, PlacedRoom>();
        const bedRoom = char.bedRoomId != null ? next.rooms.find(r => r.id === char.bedRoomId) : undefined;
        if (bedRoom) healRooms.set(bedRoom.id, bedRoom);
        if (infirmaryRoom) healRooms.set(infirmaryRoom.id, infirmaryRoom);
        for (const hr of next.rooms) {
          if ((hr.defId === 'bathhouse' || hr.defId === 'sunlit_sanctum') && hr.state === 'built' && !isRoomUnfinished(hr)) {
            healRooms.set(hr.id, hr);
          }
        }
        let healPct = (hasBathhouseHeal ? 10 : 0) + (hasMoonwellHeal ? 20 : 0);
        for (const hr of healRooms.values()) {
          healPct += academyFurnitureEffect(next.rooms, 'heal_pct', hr);
        }
        if (healPct > 0) healRate *= 1 + healPct / 100;
        if (creatureHealBonus > 0) healRate *= 1 + creatureHealBonus;
        if (activeHealerChars.length > 0) {
          const charSchools: SchoolType[] = [...(char.currentSchool ? [char.currentSchool] : []), ...char.masteredSchools];
          const healerMult = Math.max(
            ...activeHealerChars.map(h => careerAffinityMultiplier(h.masteredSchools, 'healer', charSchools) * facultyOutputMultiplier(next, h))
          );
          healRate *= healerMult;
        }
        healRate *= wizBuffs.lightRecoveryMult;
        if (char.injury.type === 'hexed' && activeHealers === 0 && sunlitScale <= 0) {
          healRate *= 0.25;
        }
        if (hasTrait(char, 'Brave')) healRate *= 1.15;
        if (hasTrait(char, 'Hardy')) healRate /= 0.7;
        const isRiftInjury = char.injury.type === 'hexed' || char.injury.type === 'sprained' || char.injury.type === 'broken_bone' || char.injury.type === 'rift_touched';
        if (isRiftInjury) {
          if (char.personality === 'Steadfast') healRate *= 1.25;
          if (hasTrait(char, 'Daredevil')) healRate *= 0.75;
        }
        healRate *= 1 + sbRev.healingPct + alumniRev.healerHealingPct;

        char.injury.points += healRate;
        if (char.injury.points >= char.injury.required) {
          char.injury = undefined;
          notifications.push(`💖 ${char.name} has fully recovered from injury!`);
          next.notices.push({
            id: `heal-${char.id}-${next.reviewIndex}`,
            time: Date.now(),
            type: 'character_healed',
            text: `💖 ${char.name} has fully recovered from injury!`,
            data: {
              roomId: infirmaryRoom?.id ?? char.bedRoomId ?? ehRoom?.id,
              characterIds: [char.id],
              visualEventType: 'character_healed'
            }
          });
        }
      }
      if (char.absentUntilReviewIndex !== undefined && next.reviewIndex >= char.absentUntilReviewIndex) {
        char.absentUntilReviewIndex = undefined;
        const matKeys = ['timber', 'stone', 'glass', 'cloth'] as const;
        const mat = matKeys[Math.floor(Math.random() * matKeys.length)];
        const amt = 3 + Math.floor(Math.random() * 6);
        const cap = AnkicasterEngine.storageCap(next);
        const before = (next.resources as any)[mat] || 0;
        (next.resources as any)[mat] = before >= cap ? before : Math.min(cap, before + amt);
        const msg = `🌙 ${char.name} slipped back in after sneaking out (+${amt} ${mat}).`;
        notifications.push(msg);
        next.notices.push({
          id: uniqueNoticeId(`return-${char.id}`, next),
          time: Date.now(),
          type: 'misbehavior',
          text: msg,
          data: { roomId: char.bedRoomId ?? ehRoom?.id, characterIds: [char.id] }
        });
      }
    }

    const hasL3Infirmary = next.rooms.some(
      r => r.defId === 'infirmary' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(next, r) && (r.level || 1) >= 3
    );
    let baseCreatureHeal = 1.0 + infirmaryBonus + activeHealers * 1.5 + (haloScale > 0 ? 1.5 * haloScale : 0);
    const infirmHealPct =
      (infirmaryRoom ? academyFurnitureEffect(next.rooms, 'heal_pct', infirmaryRoom) : 0) +
      (hasBathhouseHeal ? 10 : 0) +
      (hasMoonwellHeal ? 20 : 0);
    if (infirmHealPct > 0) baseCreatureHeal *= 1 + infirmHealPct / 100;
    if (creatureHealBonus > 0) baseCreatureHeal *= 1 + creatureHealBonus;
    if (activeHealerChars.length > 0) {
      baseCreatureHeal *= Math.max(
        ...activeHealerChars.map(h => careerAffinityMultiplier(h.masteredSchools, 'healer') * facultyOutputMultiplier(next, h))
      );
    }
    baseCreatureHeal *= wizBuffs.lightRecoveryMult * (1 + sbRev.healingPct + alumniRev.healerHealingPct);
    for (const cr of next.creatures) {
      if (!cr.injury) continue;
      if (!hasL3Infirmary && (cr.status === 'loose' || cr.status === 'away')) continue;
      cr.injury.points += hasL3Infirmary ? baseCreatureHeal : 0.5;
      if (cr.injury.points >= cr.injury.required) {
        cr.injury = undefined;
        notifications.push(`💚 ${cr.nickname} has recovered from injury!`);
      }
    }

    // 8. Decrement Spell Cooldowns & Expire Timed Room Hazards
    for (const [spell, cd] of Object.entries(next.wizard.spellCooldowns)) {
      if (cd > 1) {
        next.wizard.spellCooldowns[spell] = cd - 1;
      } else {
        delete next.wizard.spellCooldowns[spell];
      }
    }

    const activeTamersForBreach = next.characters.filter(
      c => c.career === 'tamer' && c.careerState === 'active' && c.status !== 'away' && !c.injury
    );
    const bestTamerMult = activeTamersForBreach.length > 0
      ? Math.max(...activeTamersForBreach.map(t =>
          careerAffinityMultiplier(t.masteredSchools, 'tamer') *
          (hasTrait(t, 'Beast Whisperer') ? 1.25 : 1) *
          (t.personality === 'Gentle' ? 1.25 : 1)
        ))
      : 0;
    for (const room of next.rooms) {
      if (room.state === 'built' && room.hazard) {
        if (room.hazard.type === 'wanderer' && bestTamerMult > 0) {
          const tamingBonus = academyFurnitureEffect(next.rooms, 'taming_pct', room);
          room.hazard.tamingProgress =
            (room.hazard.tamingProgress || 0) +
            (1 + tamingBonus / 100) * bestTamerMult * wizBuffs.natureMult * (1 + sbRev.tamingPct + alumniRev.tamerTamingPct);
          if (room.hazard.tamingProgress >= (room.hazard.tamingRequired || 160)) {
            const rareDefs = Object.values(CREATURE_DEFINITIONS).filter(cd => cd.rarity === 'rare');
            const pool = rareDefs.length > 0 ? rareDefs : Object.values(CREATURE_DEFINITIONS);
            const pickedDef = pool[Math.floor(Math.random() * pool.length)];
            clearRoomHazard(next, room, notifications, 'tamed');
            if (pickedDef) {
              const newCid = uniqueNumericId(next.creatures.map(c => c.id));
              next.creatures.push({
                id: newCid,
                defId: pickedDef.id,
                nickname: pickedDef.name,
                status: 'tamed',
                hungry: false,
                hatchProgress: 0,
                tamingProgress: pickedDef.tamingReviews,
                bondLevel: 1,
                bondProgress: 0,
                arrivedDay: next.day
              });
              syncDiscoveredCreatures(next);
              notifications.push(`🌟 Your Tamer tamed the Wanderer from Beyond — it revealed itself as a ${pickedDef.name}!`);
            }
            continue;
          }
        }
        if (room.hazard.expiresAtReviewIndex !== undefined && next.reviewIndex >= room.hazard.expiresAtReviewIndex) {
          clearRoomHazard(next, room, notifications, 'resolved');
        }
      }
      if (room.lockedUntilReviewIndex !== undefined && next.reviewIndex >= room.lockedUntilReviewIndex && !room.hazard?.locksRoom) {
        room.lockedUntilReviewIndex = undefined;
      }
    }

    // 8b. Advance Timed Alchemy Brewing Stations (§24.2)
    if (next.brewingQueue && next.brewingQueue.length > 0) {
      const remainingBrews: BrewingJob[] = [];
      for (const job of next.brewingQueue) {
        const lab = next.rooms.find(r => r.id === job.roomId && r.state === 'built' && !isRoomUnfinished(r));
        if (!lab) {
          remainingBrews.push(job);
          continue;
        }
        const hasAlchemist = next.characters.some(
          c => c.career === 'alchemist' && c.careerState === 'active' && c.status !== 'away' && !c.injury && c.workplaceRoomId === lab.id
        );
        if (hasAlchemist) job.usedAlchemist = true;
        job.progress += hasAlchemist ? 2 : 1;
        if (job.progress >= job.required) {
          completeBrewJob(next, job.recipeId, lab, job.usedAlchemist, false, notifications);
        } else {
          remainingBrews.push(job);
        }
      }
      next.brewingQueue = remainingBrews;
    }

    // 8c. Advance Scriptorium Scroll Crafting Queue (§25.4)
    if (next.scrollQueue && next.scrollQueue.length > 0) {
      const remainingScrolls: ScrollCraftingJob[] = [];
      for (const job of next.scrollQueue) {
        const scriptorium = next.rooms.find(
          r =>
            r.id === job.roomId &&
            r.defId === 'scriptorium' &&
            r.state === 'built' &&
            !isRoomUnfinished(r) &&
            !AnkicasterEngine.roomIsLocked(next, r)
        );
        if (!scriptorium) {
          remainingScrolls.push(job);
          continue;
        }
        const eff = AnkicasterEngine.roomEfficiency(next, scriptorium);
        if (eff <= 0) {
          remainingScrolls.push(job);
          continue;
        }
        const scholars = next.characters.filter(
          c =>
            c.career === 'scholar' &&
            c.careerState === 'active' &&
            c.status !== 'away' &&
            !c.injury &&
            c.workplaceRoomId === scriptorium.id
        );
        const scholarRate =
          scholars.length > 0
            ? Math.max(
                ...scholars.map(
                  s => careerAffinityMultiplier(s.masteredSchools, 'scholar', 'arcane') * facultyOutputMultiplier(next, s)
                )
              )
            : 0.5;
        const outPct = academyFurnitureEffect(next.rooms, 'output_pct', scriptorium);
        const owlBonus = creatureCategoryBonus(next, [{ defId: 'mistfeather_owl', perCopy: 0.1 }], 0.5);
        const hasQuill = (scriptorium.furniture || []).some(f => f.defId === 'silent_quill' && !f.damaged);
        const quillMult = hasQuill ? 1.25 : 1;
        job.progress += scholarRate * (1 + outPct / 100) * (1 + owlBonus) * quillMult;
        if (job.progress >= job.required) {
          if (!next.scrolls) next.scrolls = {};
          next.scrolls[job.scrollId] = (next.scrolls[job.scrollId] || 0) + 1;
          const sName = SCROLL_DEFINITIONS[job.scrollId]?.name || job.scrollId;
          const msg = `📜 Crafted ${sName} in the Scriptorium!`;
          notifications.push(msg);
          next.notices.push({
            id: uniqueNoticeId(`scroll-done-${job.scrollId}`, next),
            time: Date.now(),
            type: 'alchemy',
            text: msg,
            data: { roomId: scriptorium.id }
          });
        } else {
          remainingScrolls.push(job);
        }
      }
      next.scrollQueue = remainingScrolls;
    }

    // 9. Bell Tick (every 10 reviews)
    let toastMsg = `+${Math.round(manaEarned)} mana ✨`;
    if (next.reviewIndex % 10 === 0) {
      next.bellIndex += 1;
      this.ringBell(next, notifications);
      toastMsg = `🔔 Bell ${next.bellIndex} rang! +${Math.round(manaEarned)} mana`;
    }

    // 10. Check Automatic Retirement (Rule BR-26 / GDD Section 12)
    this.checkAutomaticRetirements(next, notifications);
    syncCharmRenown(next);

    return { state: next, toast: toastMsg, notifications };
  }

  /**
   * Process a batch of reviews in a single state update (e.g. replaying pending reviews)
   */
  static applyBatchHonestReviews(
    state: FullGameState,
    reviews: Array<{
      cardId: number;
      ease: 1 | 2 | 3 | 4;
      elapsedMs?: number;
      cardAge?: number;
      reviewId?: string;
    }>
  ): { state: FullGameState; count: number; lastReviewId?: string } {
    let curState = state;
    let count = 0;
    let lastReviewId: string | undefined;

    for (const r of reviews) {
      const res = this.applyHonestReview(curState, r.cardId, r.ease, r.elapsedMs ?? 2400, r.cardAge, r.reviewId);
      if (res.state !== curState) {
        curState = res.state;
        count++;
        if (r.reviewId) lastReviewId = r.reviewId;
      }
    }

    return { state: curState, count, lastReviewId };
  }

  /**
   * Castle rooms share a vertical wall on an overlapping floor. Grounds plots neighbour on any edge.
   */
  private static sharesWall(a: PlacedRoom, b: PlacedRoom): boolean {
    if (a.area !== b.area) return false;
    const yOverlap = Math.max(a.y, b.y) < Math.min(a.y + a.h, b.y + b.h);
    const xOverlap = Math.max(a.x, b.x) < Math.min(a.x + a.w, b.x + b.w);
    const side = (a.x + a.w === b.x || b.x + b.w === a.x) && yOverlap;
    if (a.area === 'castle') return side;
    const end = (a.y + a.h === b.y || b.y + b.h === a.y) && xOverlap;
    return side || end;
  }

  /**
   * GDD 15.9 adjacency bonuses (the Kitchen's missing-Refectory penalty is applied separately,
   * outside the 0.8–1.3 clamp). Starts at 1. Greenhouse adjacent to a Kitchen +10%.
   * Classroom +5% per adjacent Library, max +10%.
   */
  private static adjacencyFactor(state: FullGameState, room: PlacedRoom): number {
    let factor = 1;
    const others = state.rooms.filter(r => r.id !== room.id && r.state === 'built');
    const touches = (defId: string) => others.some(r => r.defId === defId && AnkicasterEngine.sharesWall(room, r));
    if (room.defId === 'greenhouse' && touches('kitchen')) factor += 0.1;
    if (room.defId.startsWith('class_')) {
      const libs = others.filter(r => r.defId === 'library' && AnkicasterEngine.sharesWall(room, r)).length;
      factor += Math.min(0.1, libs * 0.05);
    }
    return factor;
  }

  /** GDD: a Kitchen with no adjacent Refectory works at 50%, not clamped up to 80%. */
  private static kitchenOffRefectory(state: FullGameState, room: PlacedRoom): boolean {
    if (room.defId !== 'kitchen') return false;
    const others = state.rooms.filter(r => r.id !== room.id && r.state === 'built');
    return !others.some(r => r.defId === 'refectory' && AnkicasterEngine.sharesWall(room, r));
  }

  private static roomWorkable(room: PlacedRoom): boolean {
    return room.state === 'built' && !isRoomUnfinished(room);
  }

  private static slotsUsed(state: FullGameState, room: PlacedRoom, exceptId?: number): number {
    return state.characters.filter(c =>
      c.id !== exceptId && c.workplaceRoomId === room.id && !!c.career && c.careerState !== 'sabbatical'
    ).length;
  }

  private static findOpenWorkplace(
    state: FullGameState,
    career: string,
    exceptId?: number,
    char?: Character,
    avoidRoomId?: number
  ): PlacedRoom | undefined {
    const matches = state.rooms.filter(r => {
      const wp = ROOM_DEFINITIONS[r.defId]?.workplace;
      if (!wp || wp.career !== career || !AnkicasterEngine.roomWorkable(r)) return false;
      if (career === 'teacher' && char) {
        const sch = classroomSchool(r.defId);
        if (!sch || !char.masteredSchools.includes(sch)) return false;
      }
      return AnkicasterEngine.slotsUsed(state, r, exceptId) < effectiveWorkplaceSlots(r);
    });
    if (avoidRoomId != null) {
      const other = matches.find(r => r.id !== avoidRoomId);
      if (other) return other;
    }
    return matches[0];
  }

  /**
   * Point each working faculty member at a built, finished room of their career with a free slot.
   * Keeps a still-valid assignment. Clears the post when they have no career.
   */
  static syncWorkplaces(state: FullGameState, avoidRoomByCharId?: Map<number, number>): void {
    if (!state.characters || !state.rooms) return;
    const shelvedIds = new Set((state.shelvedRooms || []).map(r => r.id));
    for (const c of state.characters) {
      if (!c.career) {
        c.workplaceRoomId = undefined;
        continue;
      }
      if (c.careerState === 'sabbatical') continue;
      // Teacher workplaces are managed by applyAcademyScheduleToState below
      if (c.career === 'teacher') continue;
      if (c.workplaceRoomId != null && shelvedIds.has(c.workplaceRoomId)) continue;
      const avoidId = avoidRoomByCharId?.get(c.id);
      const current = c.workplaceRoomId != null ? state.rooms.find(r => r.id === c.workplaceRoomId) : undefined;
      const wp = current ? ROOM_DEFINITIONS[current.defId]?.workplace : undefined;
      const still = !!current && !!wp && wp.career === c.career && AnkicasterEngine.roomWorkable(current)
        && AnkicasterEngine.slotsUsed(state, current, c.id) < effectiveWorkplaceSlots(current)
        && current.id !== avoidId;
      if (still) continue;
      c.workplaceRoomId = AnkicasterEngine.findOpenWorkplace(state, c.career, c.id, c, avoidId)?.id;
    }

    // Rebuild student classroom periods/desks, teacher period splits, and headmaster room coverage
    const reach = computeReachability(state.rooms);
    applyAcademyScheduleToState(state, reach, avoidRoomByCharId);

    // Sync character beds when bedRoomId is unset or points to a non-existent/unbuilt room
    const builtBedRooms = state.rooms.filter(
      r => r.state === 'built' && (r.defId === 'dormitory' || r.defId === 'grand_dormitory' || r.defId === 'faculty_quarters')
    );
    if (builtBedRooms.length > 0) {
      const roomBedCapacity = (d: PlacedRoom) => {
        if (d.defId === 'faculty_quarters') {
          return (ROOM_DEFINITIONS.faculty_quarters?.capacity?.facultyBeds || 2) + (d.level - 1);
        }
        let beds = 0;
        for (const f of d.furniture || []) {
          if (f.damaged || !f.slotKind.includes('bed')) continue;
          const eff = FURNITURE_EFFECTS[f.defId];
          beds += eff?.kind === 'bed_slots' ? eff.value : 1;
        }
        return beds;
      };
      for (const c of state.characters) {
        if (c.status === 'away') continue;
        if (c.bedRoomId != null && shelvedIds.has(c.bedRoomId)) continue;
        const currentBed = c.bedRoomId != null ? state.rooms.find(r => r.id === c.bedRoomId && r.state === 'built') : undefined;
        if (c.bedRoomId != null && currentBed) continue;
        const allowedDefs = c.status === 'faculty'
          ? ['faculty_quarters', 'dormitory', 'grand_dormitory']
          : ['dormitory', 'grand_dormitory'];
        const candidates = builtBedRooms.filter(r => allowedDefs.includes(r.defId));
        if (candidates.length === 0) continue;
        const bedOpen = (room: PlacedRoom) => {
          const cap = roomBedCapacity(room);
          const used = state.characters.filter(s => s.id !== c.id && s.bedRoomId === room.id).length;
          return used < cap;
        };
        const chosenBed =
          candidates.find(r => !isRoomUnfinished(r) && bedOpen(r)) ||
          candidates.find(r => bedOpen(r)) ||
          candidates.find(r => !isRoomUnfinished(r) && roomBedCapacity(r) > 0) ||
          candidates.find(r => roomBedCapacity(r) > 0);
        if (chosenBed) {
          c.bedRoomId = chosenBed.id;
        }
      }
    }
  }

  private static roomIsStaffed(state: FullGameState, room: PlacedRoom): boolean {
    const workplace = ROOM_DEFINITIONS[room.defId]?.workplace;
    if (!workplace || !STAFF_CAREERS.has(workplace.career)) return true;
    const classSch = classroomSchool(room.defId);
    if (classSch) {
      const schedule = buildAcademySchedule(state);
      const info = schedule.classrooms.get(room.id);
      if (info?.isStaffed || schedule.headmasterRoomId === room.id) return true;
      return state.characters.some(c =>
        c.workplaceRoomId === room.id &&
        c.career === 'teacher' &&
        c.careerState !== 'sabbatical' &&
        c.status !== 'away' &&
        !c.injury &&
        c.masteredSchools.includes(classSch)
      );
    }
    return state.characters.some(c => c.workplaceRoomId === room.id && c.career === workplace.career && c.careerState !== 'sabbatical');
  }

  private static roomIsLocked(state: FullGameState, room: PlacedRoom): boolean {
    return (room.lockedUntilReviewIndex ?? -1) > state.reviewIndex || !!room.hazard?.locksRoom;
  }

  /** Factors behind one room's efficiency, for the room window. */
  static roomEfficiencyDetail(state: FullGameState, room: PlacedRoom, reach?: Map<number, ReachabilityInfo>): {
    efficiency: number;
    level: number;
    quality: number;
    cleanliness: number;
    staff: number;
    adjacency: number;
    blocked?: 'unfinished' | 'unreachable' | 'locked';
  } {
    const staffed = AnkicasterEngine.roomIsStaffed(state, room);
    const reachable = (reach ?? computeReachability(state.rooms)).get(room.id)?.reachable ?? false;
    const locked = AnkicasterEngine.roomIsLocked(state, room);
    const rawAdj = AnkicasterEngine.adjacencyFactor(state, room);
    const kitchenHalf = AnkicasterEngine.kitchenOffRefectory(state, room);
    const { q } = calculateRoomQuality(room);
    const level = room.level === 3 ? 1.2 : room.level === 2 ? 1.1 : 1.0;
    const quality = 1 + Math.min(q, 80) / 160;
    const cleanliness = 0.7 + (0.3 * room.cleanliness) / 100;
    const staff = staffed ? 1 : 0.5;
    const adjacency = kitchenHalf ? 0.5 : Math.min(1.3, Math.max(0.8, rawAdj));
    let blocked: 'unfinished' | 'unreachable' | 'locked' | undefined;
    if (room.state === 'built' && isRoomUnfinished(room)) blocked = 'unfinished';
    else if (room.state === 'built' && !reachable) blocked = 'unreachable';
    else if (room.state === 'built' && locked) blocked = 'locked';
    let efficiency = locked ? 0 : calculateRoomEfficiency(room, staffed, reachable, rawAdj);
    if (efficiency > 0 && kitchenHalf) efficiency *= 0.5;
    if (efficiency > 0 && floorHasHazard(state, room, 'gravity_hiccup')) efficiency *= 0.5;
    return { efficiency, level, quality, cleanliness, staff, adjacency, blocked };
  }

  /** Room efficiency the engine actually uses (reachability, staff, adjacency, locks). */
  static roomEfficiency(state: FullGameState, room: PlacedRoom, reach?: Map<number, ReachabilityInfo>): number {
    return AnkicasterEngine.roomEfficiencyDetail(state, room, reach).efficiency;
  }

  /** Rest target from a bed room's efficiency. 25 means no usable bed. */
  static restTargetFromEfficiency(eff: number): number {
    return 55 + 45 * Math.min(1, Math.max(0, eff - 0.5));
  }

  /** Same number the room window shows. Unfinished, unreachable or locked beds are 25. */
  static restTargetForRoom(state: FullGameState, room: PlacedRoom | undefined, reach?: Map<number, ReachabilityInfo>): number {
    if (!room || room.state !== 'built') return 25;
    const eff = AnkicasterEngine.roomEfficiency(state, room, reach);
    if (eff <= 0) return 25;
    const bonus = academyFurnitureEffect(state.rooms, 'rest_bonus', room);
    const bathhouseBonus = state.rooms.some(
      r => r.defId === 'bathhouse' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(state, r)
    ) ? 10 : 0;
    const sb = computeSpellbookBonuses(state.spellbooks || []);
    const coldPenalty = room.hazard?.type === 'cold_snap' ? (roomHasHearth(room) ? 5 : 10) * sb.weatherPenaltyMult : 0;
    return Math.max(0, Math.min(100, AnkicasterEngine.restTargetFromEfficiency(eff) + bonus + bathhouseBonus - coldPenalty));
  }

  static restTarget(state: FullGameState, char: Character, reach?: Map<number, ReachabilityInfo>): number {
    const bed = char.bedRoomId != null ? state.rooms.find(r => r.id === char.bedRoomId) : undefined;
    return AnkicasterEngine.restTargetForRoom(state, bed, reach);
  }

  /**
   * Leisure seats from built, finished Common Room, Faculty Lounge, Bathhouse, Orchard,
   * Courtyard Garden, Library (with Rolling Ladder), and Menagerie, each multiplied by efficiency.
   */
  private static leisureCapacity(state: FullGameState, reach?: Map<number, ReachabilityInfo>): number {
    const ids = new Set(['common_room', 'faculty_lounge', 'bathhouse', 'orchard', 'courtyard_garden', 'library', 'menagerie']);
    let cap = 0;
    for (const room of state.rooms) {
      if (!ids.has(room.defId) || room.state !== 'built' || isRoomUnfinished(room)) continue;
      let seats: number;
      if (room.defId === 'library') {
        seats = libraryReaderCapacity(room);
      } else if (room.defId === 'courtyard_garden') {
        seats = 3;
      } else if (room.defId === 'menagerie') {
        seats = 6;
      } else {
        seats = ROOM_DEFINITIONS[room.defId]?.capacity?.leisureSeats ?? 8;
      }
      cap += seats * AnkicasterEngine.roomEfficiency(state, room, reach);
    }
    return cap + academyFurnitureEffect(state.rooms, 'leisure_bonus');
  }

  private static charmBonus(state: FullGameState): number {
    return Math.min(20, Math.max(-10, computeAcademyCharm(state) / 10));
  }

  private static veilModifier(strength: number): number {
    if (strength >= 80) return 0;       // Strong
    if (strength >= 50) return -10;     // Thinning
    if (strength >= 20) return -20;     // Thin
    return -35;                         // Torn
  }

  private static composureTarget(state: FullGameState): number {
    const creatures = state.creatures.filter(c => c.status === 'tamed').length;
    const creatureBonus = Math.min(10, creatures * 2);
    const lanternTargetBonus = creatureSpeciesBuffSum(state, 'lantern_moth');
    const dawnFinchBonus = 2 * creatureSpeciesBuffSum(state, 'dawn_finch');
    const furnBonus = academyFurnitureEffect(state.rooms, 'composure_bonus');
    const moonwellBonus = state.rooms.some(
      r => r.defId === 'moonwell' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(state, r)
    ) ? 5 : 0;
    const bathhouseBonus = state.rooms.some(
      r => r.defId === 'bathhouse' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(state, r)
    ) ? 5 : 0;
    const wandererPenalty = state.rooms.some(r => r.state === 'built' && r.hazard?.type === 'wanderer') ? 10 : 0;
    return Math.max(
      0,
      60 +
        AnkicasterEngine.charmBonus(state) +
        creatureBonus +
        lanternTargetBonus +
        dawnFinchBonus +
        furnBonus +
        moonwellBonus +
        bathhouseBonus +
        AnkicasterEngine.veilModifier(state.veil.strength) -
        wandererPenalty
    );
  }

  private static approachNeed(current: number, target: number, decay: number, recoveryMult: number = 1): number {
    const recovery = Math.max(0, (target - current) * 0.25) * recoveryMult;
    const loss = Math.min(0, (target - current) * 0.25);
    const next = current + recovery + loss - decay;
    return Math.min(100, Math.max(0, next));
  }

  /**
   * Who eats on a meal bell. cap is two sittings (floor(chairs * 2 * efficiency)) across finished Refectories.
   * Each Long Table supplies 6 chairs (up to 2 tables = 12 chairs).
   * No Refectory means cap 0: everyone with food stands. Food, not seats, is what leaves someone unfed.
   */
  static mealPlan(state: FullGameState, reach?: Map<number, ReachabilityInfo>, capFactor = 1): { cap: number; seated: number; standing: number; unfed: number } {
    const diners = state.characters.length;
    const food = Math.max(0, Math.floor(state.resources.provisions));
    const refectories = state.rooms.filter(r => r.defId === 'refectory' && r.state === 'built' && !isRoomUnfinished(r));
    let cap = refectories.reduce(
      (sum, r) => sum + Math.floor(refectoryChairCount(r) * 2 * AnkicasterEngine.roomEfficiency(state, r, reach)),
      0
    );
    if (capFactor < 1) cap = Math.floor(cap * capFactor);
    const served = Math.min(diners, food);
    const seated = Math.min(served, cap);
    return { cap, seated, standing: served - seated, unfed: diners - served };
  }

  /**
   * Ringing the bell (every 10 honest reviews)
   */
  static ringBell(state: FullGameState, notifications: string[]) {
    const reach = computeReachability(state.rooms);
    const schedule = buildAcademySchedule(state, reach);
    const wizBuffs = wizardSchoolBuffs(state.wizard?.levels || {});
    const sb = computeSpellbookBonuses(state.spellbooks || []);
    const alumni = computeAlumniBonuses(state.alumniGallery || []);
    const bellNotes: BellNote[] = [];
    const bag = state.resources as unknown as Record<string, number>;
    const note = (resource: string, before: number, source: string) => {
      const amount = (bag[resource] || 0) - before;
      if (amount) bellNotes.push({ resource, amount, source });
    };
    const roomName = (defId: string) => ROOM_DEFINITIONS[defId]?.name || defId;

    // 1. Classroom Essence Production (influenced by room hazards & qualifying teacher)
    for (const char of state.characters) {
      if ((char.absentUntilReviewIndex || 0) > state.reviewIndex) continue;
      if (char.status === 'student' && char.seatRoomId && char.currentSchool) {
        const room = state.rooms.find(r => r.id === char.seatRoomId);
        if (room && room.state === 'built' && !isRoomUnfinished(room)) {
          // A classroom only teaches its own school and teaches nothing without a qualifying teacher.
          const classSch = classroomSchool(room.defId);
          if (classSch && char.currentSchool !== classSch) continue;
          if (classSch && !AnkicasterEngine.roomIsStaffed(state, room)) continue;

          // Hazard active effects
          const coldMult = roomColdSnapMultiplier(room, sb.weatherPenaltyMult);
          if (coldMult <= 0) continue;
          if (room.hazard?.type === 'echo_loop') continue; // suppresses classroom essence

          const eff = AnkicasterEngine.roomEfficiency(state, room, reach);
          if (eff <= 0) continue;

          const classMalus = outputMalusFactor(room, state.reviewIndex);
          if (classMalus <= 0) continue;
          let yieldMult = eff * classMalus * coldMult;
          if ((room.level || 1) >= 3) yieldMult *= 1.05;
          if (floorHasHazard(state, room, 'spill_of_night')) yieldMult *= 0.5; // efficiency halved
          const outPct = academyFurnitureEffect(state.rooms, 'output_pct', room);
          if (outPct !== 0) yieldMult *= 1 + outPct / 100;
          if ((state.activeBuffs?.starlitConjunctionBells || 0) > 0) yieldMult *= 1.5;

          const schedIds = schedule.classrooms.get(room.id)?.teacherIds || [];
          const roomTeachers = state.characters.filter(
            t =>
              t.career === 'teacher' &&
              t.careerState !== 'sabbatical' &&
              t.status !== 'away' &&
              !t.injury &&
              (schedIds.includes(t.id) || t.workplaceRoomId === room.id)
          );
          if (roomTeachers.length > 0) {
            yieldMult *= Math.max(...roomTeachers.map(t => facultyOutputMultiplier(state, t)));
          } else if (schedule.headmasterRoomId === room.id) {
            yieldMult *= facultyOutputMultiplier(state, undefined);
          }

          const moraleFactor = 0.6 + (0.6 * char.morale) / 100;
          const schoolEssenceMult = char.currentSchool === 'nature' ? wizBuffs.natureMult : 1;
          let traitEssenceMult = 1;
          if (char.currentSchool === 'nature' && hasTrait(char, 'Green Thumb')) traitEssenceMult *= 1.2;
          if (char.currentSchool === 'arcane' && hasTrait(char, 'Star-Touched')) traitEssenceMult *= 1.1;
          if (hasTrait(char, 'Well-Read') && room.furniture.some(f => !f.damaged && f.defId === 'bookshelf')) {
            traitEssenceMult *= 1.1;
          }
          if (hasTrait(char, 'Lazy')) traitEssenceMult *= 0.85;
          const chatterboxes = state.characters.filter(
            s => s.status === 'student' && s.seatRoomId === room.id && (s.absentUntilReviewIndex || 0) <= state.reviewIndex && hasTrait(s, 'Chatterbox')
          ).length;
          if (chatterboxes > 0) traitEssenceMult *= Math.max(0.5, 1 - 0.04 * chatterboxes);

          const alumniClassMult =
            1 +
            alumni.teacherClassroomPct +
            (char.currentSchool ? alumni.residentSchoolEssencePct[char.currentSchool] || 0 : 0);
          const yieldAmount =
            0.2 * moraleFactor * yieldMult * wizBuffs.lightEssenceMult * schoolEssenceMult * traitEssenceMult * alumniClassMult;
          const essence = char.currentSchool === 'arcane' ? 'insight'
            : char.currentSchool === 'nature' ? 'herbs'
            : char.currentSchool === 'light' ? 'radiance'
            : char.currentSchool === 'shadow' ? 'umbra'
            : char.currentSchool === 'alchemy' ? 'reagents' : '';
          if (essence) {
            const before = bag[essence] || 0;
            bag[essence] = before + yieldAmount;
            note(essence, before, roomName(room.defId));
          }
        }
      }
    }

    // 2. Grounds & Resource Plots Output (influenced by hazards & creature buffs)
    const hasTortoise = bestBuffScale(state.creatures, 'mossback_tortoise') > 0;
    const hasFenSprite = bestBuffScale(state.creatures, 'fen_sprite') > 0;
    const greenhouseMult = 1 + creatureCategoryBonus(
      state,
      [
        ...(hasTortoise ? [{ defId: 'mossback_tortoise', perCopy: 0.05 }] : []),
        ...(hasFenSprite ? [{ defId: 'fen_sprite', perCopy: 0.08 }] : [])
      ],
      0.5
    );
    const herbGardenCreatureMult = 1 + (hasFenSprite ? creatureCategoryBonus(state, [{ defId: 'fen_sprite', perCopy: 0.08 }], 0.5) : 0);
    const foodHerbsMult = 1 + creatureCategoryBonus(state, [{ defId: 'verdant_drake', perCopy: 0.12 }], 0.5);
    const treantGardenerBonus = creatureCategoryBonus(state, [{ defId: 'elder_treant_sprout', perCopy: 0.2 }], 0.5);
    const pondCreatureMult = 1 + creatureCategoryBonus(state, [{ defId: 'puddlewyrm', perCopy: 0.15 }], 0.5);
    const libraryCreatureMult = 1 + creatureCategoryBonus(
      state,
      [
        { defId: 'inkling_wisp', perCopy: 0.05 },
        { defId: 'mistfeather_owl', perCopy: 0.1 }
      ],
      0.5
    );
    const scriptoriumCreatureMult = 1 + creatureCategoryBonus(state, [{ defId: 'mistfeather_owl', perCopy: 0.1 }], 0.5);
    const observatoryCreatureMult = 1 + creatureCategoryBonus(state, [{ defId: 'orrery_moth', perCopy: 0.05 }], 0.5);
    const craftCreatureMult = 1 + creatureCategoryBonus(state, [{ defId: 'quicksilver_otter', perCopy: 0.15 }], 0.5);
    const cap = AnkicasterEngine.storageCap(state);
    const store = (before: number, add: number) => (add > 0 && before >= cap ? before : add > 0 ? Math.min(cap, before + add) : before + add);
    const PLANT_ROOMS = new Set(['vegetable_patch', 'herb_garden', 'woodlot', 'greenhouse', 'orchard']);
    const activeGardeners = state.characters.filter(c => c.career === 'gardener' && c.careerState === 'active');
    const starlitMult = (state.activeBuffs?.starlitConjunctionBells || 0) > 0 ? 1.5 : 1;
    const seedMult = 1 + Math.min(0.5, (state.resources.seedsUnlocked?.length || 0) * 0.1);
    const finishedApiaries = state.rooms.filter(r => r.defId === 'apiary' && r.state === 'built' && !isRoomUnfinished(r));

    // Academy-scoped insight_per_bell (e.g. starfall_chandelier) applies once per bell, not once per room
    {
      let acadInsight = 0;
      for (const r of state.rooms) {
        if (r.state !== 'built' || !r.furniture?.length) continue;
        const counts: Record<string, number> = {};
        for (const f of [...r.furniture].sort((a, b) => (a.damaged ? 1 : 0) - (b.damaged ? 1 : 0))) {
          const eff = FURNITURE_EFFECTS[f.defId];
          if (!eff || eff.kind !== 'insight_per_bell' || eff.scope !== 'academy') continue;
          const seen = counts[f.defId] || 0;
          if (seen >= 2) continue;
          counts[f.defId] = seen + 1;
          acadInsight += eff.value * (f.damaged ? 0.5 : 1);
        }
      }
      if (acadInsight > 0) {
        const beforeI = bag.insight || 0;
        bag.insight = beforeI + acadInsight * starlitMult;
        note('insight', beforeI, 'Academy Chandelier');
      }
    }

    const plotBookMult = 1 + sb.plotOutputPct;
    for (const room of state.rooms) {
      if (room.state !== 'built' || isRoomUnfinished(room)) continue; // Unfinished rooms run at 0%
      const coldMult = roomColdSnapMultiplier(room, sb.weatherPenaltyMult);
      if (coldMult <= 0) continue;
      if (room.hazard?.type === 'echo_loop') continue;
      if (room.hazard?.type === 'wisp_swarm') continue;

      const eff = AnkicasterEngine.roomEfficiency(state, room, reach);
      if (eff <= 0) continue;

      const harvestMalus = outputMalusFactor(room, state.reviewIndex);
      if (harvestMalus <= 0) continue;
      let harvestMult = eff * harvestMalus * coldMult;
      if (floorHasHazard(state, room, 'spill_of_night')) {
        harvestMult *= 0.5;
        if (isNightInkType(room.hazard?.type)) room.cleanliness = 0; // soot residue
      }
      const outPct = academyFurnitureEffect(state.rooms, 'output_pct', room);
      if (outPct !== 0) harvestMult *= 1 + outPct / 100;

      if (PLANT_ROOMS.has(room.defId)) {
        const assignedGardeners = activeGardeners.filter(g => g.workplaceRoomId === room.id);
        const hasSlot = ROOM_DEFINITIONS[room.defId]?.workplace?.career === 'gardener';
        const gardeners = hasSlot ? assignedGardeners : (assignedGardeners.length > 0 ? assignedGardeners : activeGardeners);
        if (gardeners.length > 0) {
          const roomSchool = ROOM_DEFINITIONS[room.defId]?.school;
          const gardenerMult = Math.max(
            ...gardeners.map(
              g =>
                careerAffinityMultiplier(g.masteredSchools, 'gardener', roomSchool) *
                (hasTrait(g, 'Green Thumb') ? 1.2 : 1) *
                facultyOutputMultiplier(state, g)
            )
          );
          harvestMult *= gardenerMult * (1 + treantGardenerBonus);
        }
        if (finishedApiaries.some(a => a.area === room.area && a.x <= room.x + room.w && room.x <= a.x + a.w && a.y <= room.y + room.h && room.y <= a.y + a.h)) {
          harvestMult *= 1.05;
        }
        if ((state.activeBuffs?.rainDanceBells || 0) > 0) harvestMult *= 1.5;
        if ((state.activeBuffs?.growthElixirBells || 0) > 0 && (!state.activeBuffs?.growthElixirRoomId || state.activeBuffs.growthElixirRoomId === room.id)) {
          harvestMult *= 2;
        }
      }
      const verdantMult = (state.activeBuffs?.verdantSurgeBells || 0) > 0 ? 2 : 1;
      const natureFoodMult = wizBuffs.natureMult * foodHerbsMult * (1 + alumni.gardenerFoodHerbsPct);

      const insightBell = academyFurnitureEffect(state.rooms, 'insight_per_bell', room, true);
      if (insightBell > 0) {
        const beforeI = bag.insight || 0;
        bag.insight = beforeI + insightBell * starlitMult;
        note('insight', beforeI, roomName(room.defId));
      }
      const nectarBell = academyFurnitureEffect(state.rooms, 'nectar_per_bell', room, true);
      if (nectarBell > 0) {
        const beforeN = bag.nectar || 0;
        bag.nectar = store(beforeN, nectarBell * natureFoodMult);
        note('nectar', beforeN, roomName(room.defId));
      }

      if (room.defId === 'vegetable_patch') {
        const src = roomName(room.defId);
        let before = bag.provisions || 0;
        bag.provisions = store(before, 1.0 * harvestMult * plotBookMult * verdantMult * natureFoodMult);
        note('provisions', before, src);
        before = bag.greens || 0;
        bag.greens = store(before, 0.2 * harvestMult * plotBookMult * verdantMult * natureFoodMult);
        note('greens', before, src);
      } else if (room.defId === 'herb_garden') {
        const before = bag.herbs || 0;
        bag.herbs = before + 0.6 * harvestMult * plotBookMult * herbGardenCreatureMult * verdantMult * seedMult * starlitMult * natureFoodMult;
        note('herbs', before, roomName(room.defId));
      } else if (room.defId === 'woodlot') {
        const src = roomName(room.defId);
        let before = bag.timber || 0;
        bag.timber = store(before, 2 * harvestMult * plotBookMult);
        note('timber', before, src);
        if (Math.random() < 0.02) {
          before = bag.heartwood || 0;
          bag.heartwood = before + 1;
          note('heartwood', before, src);
        }
      } else if (room.defId === 'quarry') {
        const src = roomName(room.defId);
        let before = bag.stone || 0;
        bag.stone = store(before, 1 * harvestMult * plotBookMult);
        note('stone', before, src);
        if (Math.random() < 0.04) {
          before = bag.crystal || 0;
          bag.crystal = before + 1;
          note('crystal', before, src);
        }
      } else if (room.defId === 'greenhouse') {
        const src = roomName(room.defId);
        const bedCount = (room.level || 1) >= 3 ? 3 : 2;
        const defaultBeds = (room.level || 1) >= 3 ? ['hearthroot', 'silverleaf', 'moonbeans'] : ['hearthroot', 'silverleaf'];
        const beds = room.settings?.crops?.length
          ? room.settings.crops.slice(0, bedCount)
          : room.settings?.crop
          ? Array(bedCount).fill(room.settings.crop)
          : [...defaultBeds];
        while (beds.length < bedCount) {
          beds.push(defaultBeds[beds.length] || 'hearthroot');
        }
        const hasCistern = (room.furniture || []).some(f => !f.damaged && f.defId === 'rain_cistern');
        const hasAssignedGardener = activeGardeners.some(
          g => g.workplaceRoomId === room.id && g.status !== 'away' && !g.injury
        );
        const hasGloomCondition =
          room.y === 0 ||
          state.rooms.some(
            adj =>
              adj.state === 'built' &&
              !isRoomUnfinished(adj) &&
              (adj.defId === 'gloom_hutch' ||
                adj.defId === 'gloom_enclosure' ||
                (adj.defId === 'menagerie' && roomAcceptedHabitats(adj).includes('gloom'))) &&
              AnkicasterEngine.sharesWall(room, adj)
          );
        for (const cropId of beds) {
          const crop = GREENHOUSE_CROPS[cropId];
          if (!crop) continue;
          if (cropId === 'featherfern' && (state.wizard?.levels?.nature || 0) < 3) continue;
          if (cropId === 'shadecap' && !hasGloomCondition) continue;
          if (cropId === 'sunwheat' && !hasCistern) continue;
          if ((cropId === 'starfruit' || cropId === 'heartwood_sapling' || cropId === 'lumen_lily') && !hasAssignedGardener) continue;
          for (const [resKey, baseAmt] of Object.entries(crop.outputs)) {
            const before = bag[resKey] || 0;
            if (resKey === 'provisions' || resKey === 'greens' || resKey === 'nectar') {
              bag[resKey] = store(before, baseAmt * harvestMult * plotBookMult * greenhouseMult * verdantMult * natureFoodMult);
            } else if (resKey === 'herbs') {
              bag[resKey] = before + baseAmt * harvestMult * plotBookMult * greenhouseMult * verdantMult * seedMult * starlitMult * natureFoodMult;
            } else if (resKey === 'insight' || resKey === 'reagents' || resKey === 'radiance' || resKey === 'umbra') {
              bag[resKey] = before + baseAmt * harvestMult * plotBookMult * greenhouseMult * starlitMult;
            } else {
              bag[resKey] = before + baseAmt * harvestMult * plotBookMult * greenhouseMult;
            }
            note(resKey, before, src);
          }
        }
      } else if (room.defId === 'orchard') {
        const src = roomName(room.defId);
        let before = bag.provisions || 0;
        bag.provisions = store(before, 0.8 * harvestMult * plotBookMult * verdantMult * natureFoodMult);
        note('provisions', before, src);
        before = bag.nectar || 0;
        bag.nectar = store(before, 0.3 * harvestMult * plotBookMult * natureFoodMult);
        note('nectar', before, src);
      } else if (room.defId === 'pond') {
        const before = bag.fish || 0;
        bag.fish = store(before, 0.8 * harvestMult * plotBookMult * pondCreatureMult * natureFoodMult);
        note('fish', before, roomName(room.defId));
      } else if (room.defId === 'apiary') {
        const before = bag.nectar || 0;
        bag.nectar = store(before, 0.5 * harvestMult * plotBookMult * natureFoodMult);
        note('nectar', before, roomName(room.defId));
      } else if (room.defId === 'library' || room.defId === 'scriptorium' || room.defId === 'observatory') {
        const scholars = state.characters.filter(c => c.career === 'scholar' && c.careerState === 'active' && c.workplaceRoomId === room.id);
        if (scholars.length > 0) {
          const roomSchool = ROOM_DEFINITIONS[room.defId]?.school;
          const scholarMult = Math.max(
            ...scholars.map(
              s =>
                careerAffinityMultiplier(s.masteredSchools, 'scholar', roomSchool) *
                (hasTrait(s, 'Star-Touched') ? 1.1 : 1) *
                facultyOutputMultiplier(state, s)
            )
          );
          const baseInsight = room.defId === 'library' ? 0.3 : 0.25;
          const roomCreatureMult = room.defId === 'library'
            ? libraryCreatureMult
            : room.defId === 'scriptorium'
            ? scriptoriumCreatureMult
            : observatoryCreatureMult;
          const before = bag.insight || 0;
          bag.insight = before + baseInsight * harvestMult * scholarMult * roomCreatureMult * starlitMult;
          note('insight', before, roomName(room.defId));
        }
      } else if (room.defId === 'glassworks') {
        if (room.settings?.glassworksActive !== false) {
          const conv = glassworksConversion(bag.stone || 0, harvestMult * craftCreatureMult, bag.glass || 0, cap);
          if (conv.stoneUsed > 0) {
            const beforeS = bag.stone || 0;
            bag.stone = beforeS - conv.stoneUsed;
            note('stone', beforeS, 'Glassworks');
            const beforeG = bag.glass || 0;
            bag.glass = beforeG + conv.glassGain;
            note('glass', beforeG, 'Glassworks');
          }
        }
      } else if (room.defId === 'weaving_room') {
        const sheepScale = creatureSpeciesBuffSum(state, 'moonsheep');
        const gain = weavingOutput(harvestMult * craftCreatureMult, sheepScale > 0, sheepScale || 1);
        const before = bag.cloth || 0;
        bag.cloth = store(before, gain);
        note('cloth', before, sheepScale > 0 ? 'Weaving Room (Moonsheep)' : 'Weaving Room');
      }
    }

    // 3. Creature Active Buffs per Bell (§22.7 with Bond/Menagerie scaling & top-2/3 stacking)
    const stagScale = bestBuffScale(state.creatures, 'glimmerhorn_stag') > 0
      ? creatureSpeciesBuffSum(state, 'glimmerhorn_stag')
      : 0;
    const hareScale = bestBuffScale(state.creatures, 'thistle_hare') > 0
      ? creatureSpeciesBuffSum(state, 'thistle_hare')
      : 0;
    if (hareScale > 0) {
      const beforeH = bag.herbs || 0;
      bag.herbs = beforeH + 0.1 * hareScale * wizBuffs.natureMult;
      note('herbs', beforeH, 'Thistle Hare');
    }
    const wispScale = creatureSpeciesBuffSum(state, 'inkling_wisp');
    if (wispScale > 0) {
      const beforeI = bag.insight || 0;
      bag.insight = beforeI + 0.05 * wispScale;
      note('insight', beforeI, 'Inkling Wisp');
    }
    const sheepBellScale = creatureSpeciesBuffSum(state, 'moonsheep');
    if (sheepBellScale > 0) {
      state.moonsilkProgress = (state.moonsilkProgress || 0) + sheepBellScale;
      while (state.moonsilkProgress >= 40 - 1e-9) {
        state.moonsilkProgress -= 40;
        const beforeM = bag.moonsilk || 0;
        bag.moonsilk = beforeM + 1;
        note('moonsilk', beforeM, 'Moonsheep');
      }
    }
    const prismScale = creatureSpeciesBuffSum(state, 'prism_beetle');
    if (prismScale > 0) {
      state.crystalProgress = (state.crystalProgress || 0) + prismScale;
      while (state.crystalProgress >= 25 - 1e-9) {
        state.crystalProgress -= 25;
        const beforeC = bag.crystal || 0;
        bag.crystal = beforeC + 1;
        note('crystal', beforeC, 'Prism Beetle');
      }
    }

    // 4. Meals. Characters eat first. Wary and tamed creatures then pay their whole diet or go hungry.
    const kitchenAdjacentToRefectory = state.rooms.some(k =>
      k.defId === 'kitchen' && k.state === 'built' && !isRoomUnfinished(k) &&
      state.rooms.some(ref => ref.defId === 'refectory' && ref.state === 'built' && !isRoomUnfinished(ref) &&
        k.area === ref.area && k.x <= ref.x + ref.w && ref.x <= k.x + k.w && k.y <= ref.y + ref.h && ref.y <= k.y + k.h)
    );
    const hasBuiltKitchen = state.rooms.some(k => k.defId === 'kitchen' && k.state === 'built' && !isRoomUnfinished(k));
    if (state.bellIndex % 5 === 0) {
      if (state.characters.length > 0) {
        const capFactor = state.pendingMealCapFactor ?? 1;
        const plan = AnkicasterEngine.mealPlan(state, reach, capFactor);
        state.pendingMealCapFactor = undefined;
        const served = plan.seated + plan.standing;
        const mealCostPct = academyFurnitureEffect(
          state.rooms.filter(r => r.state === 'built' && !isRoomUnfinished(r)),
          'meal_cost_pct'
        );
        const mealMult = Math.max(0.5, 1 - (kitchenAdjacentToRefectory ? 0.1 : 0) + mealCostPct / 100 - sb.mealProvisionsReductionPct);
        const gluttonExtra = state.characters.slice(0, served).filter(c => hasTrait(c, 'Glutton')).length;
        const foodFightExtra = state.nextBellMealExtraProvisions || 0;
        state.nextBellMealExtraProvisions = undefined;
        const foodCost = Math.round((served * mealMult + gluttonExtra + foodFightExtra) * 10) / 10;
        const before = bag.provisions || 0;
        bag.provisions = Math.max(0, before - foodCost);
        note('provisions', before, `Meals (${served} people)`);
        const hasL3Refectory = state.rooms.some(
          r => r.defId === 'refectory' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(state, r) && (r.level || 1) >= 3
        );
        state.characters.forEach((char, i) => {
          char.mealTarget = i < plan.seated ? 100 : i < served ? 50 : 25;
          if (hasL3Refectory && i < plan.seated) {
            char.needs.composure = Math.min(100, char.needs.composure + 5);
          }
        });
        if (plan.unfed > 0) {
          notifications.push(`⚠️ Food shortage! ${plan.unfed} students went hungry.`);
        }
      } else {
        if (state.pendingMealCapFactor != null) state.pendingMealCapFactor = undefined;
        if (state.nextBellMealExtraProvisions != null) state.nextBellMealExtraProvisions = undefined;
      }
      billCreatureMeals(state, note);
    }

    // 5. Needs. Hunger uses the stored meal target (50 until the first meal).
    const headcount = state.characters.length;
    const leisureTarget = 30 + 70 * Math.min(1, headcount > 0 ? AnkicasterEngine.leisureCapacity(state, reach) / headcount : 0);
    const compTarget = AnkicasterEngine.composureTarget(state);
    const hasBathhouse = state.rooms.some(r => r.defId === 'bathhouse' && r.state === 'built' && !isRoomUnfinished(r));
    const creatureNeedRecoveryBonus = creatureCategoryBonus(
      state,
      [
        { defId: 'ember_phoenix', perCopy: 0.1 },
        ...(hasBathhouse ? [{ defId: 'coral_kelpie', perCopy: 0.1 }] : [])
      ],
      0.5
    );
    const needRecoveryMult = wizBuffs.lightRecoveryMult * (1 + creatureNeedRecoveryBonus);
    for (const char of state.characters) {
      const dm = characterNeedDecayMults(state, char);
      const rawHungerTarget = char.mealTarget ?? 50;
      const hungerTarget = hasTrait(char, 'Picky Eater') && !hasBuiltKitchen ? Math.max(0, rawHungerTarget - 20) : rawHungerTarget;
      const bedRoomForNeed = char.bedRoomId != null ? state.rooms.find(r => r.id === char.bedRoomId) : undefined;
      const charLeisureTarget =
        bedRoomForNeed &&
        bedRoomForNeed.defId === 'grand_dormitory' &&
        bedRoomForNeed.state === 'built' &&
        !isRoomUnfinished(bedRoomForNeed) &&
        !AnkicasterEngine.roomIsLocked(state, bedRoomForNeed) &&
        (bedRoomForNeed.level || 1) >= 3
          ? Math.min(100, leisureTarget + 5)
          : leisureTarget;
      char.needs.hunger = AnkicasterEngine.approachNeed(char.needs.hunger, hungerTarget, 4 * dm.hunger, needRecoveryMult);
      char.needs.rest = AnkicasterEngine.approachNeed(char.needs.rest, AnkicasterEngine.restTarget(state, char, reach), 3 * dm.rest, needRecoveryMult);
      char.needs.leisure = AnkicasterEngine.approachNeed(char.needs.leisure, charLeisureTarget, 3 * dm.leisure, needRecoveryMult);
      char.needs.composure = AnkicasterEngine.approachNeed(char.needs.composure, compTarget, 1 * dm.composure, needRecoveryMult);
    }

    // Roommate / classmate / trait ambient interactions + fragile furniture / portal traits
    const builtHabitats = state.rooms.filter(r => r.state === 'built' && !isRoomUnfinished(r) && HABITAT_ROOM_DEFS.has(r.defId));
    for (const char of state.characters) {
      if (char.status === 'away') continue;
      if (hasTrait(char, 'Kind Heart') && char.bedRoomId != null) {
        const dormRoom = state.rooms.find(r => r.id === char.bedRoomId);
        const kindGain = dormRoom?.defId === 'dormitory' && (dormRoom.level || 1) >= 3 ? 6 : 3;
        for (const other of state.characters) {
          if (other.id !== char.id && other.bedRoomId === char.bedRoomId) {
            other.needs.composure = Math.min(100, other.needs.composure + kindGain);
          }
        }
      }
      if (hasTrait(char, 'Sunny') && char.seatRoomId != null) {
        for (const other of state.characters) {
          if (other.id !== char.id && other.seatRoomId === char.seatRoomId) {
            other.needs.composure = Math.min(100, other.needs.composure + 2);
          }
        }
      }
      if (hasTrait(char, 'Sunny') && char.bedRoomId != null) {
        const dormRoom = state.rooms.find(r => r.id === char.bedRoomId);
        if (dormRoom?.defId === 'dormitory' && (dormRoom.level || 1) >= 3) {
          for (const other of state.characters) {
            if (other.id !== char.id && other.bedRoomId === char.bedRoomId) {
              other.needs.composure = Math.min(100, other.needs.composure + 4);
            }
          }
        }
      }
      if (hasTrait(char, 'Chatterbox') && char.bedRoomId != null) {
        for (const other of state.characters) {
          if (other.id !== char.id && other.bedRoomId === char.bedRoomId) {
            other.needs.leisure = Math.min(100, other.needs.leisure + 2);
          }
        }
      }
      if (hasTrait(char, 'Animal Allergy') && char.bedRoomId != null) {
        const dorm = state.rooms.find(r => r.id === char.bedRoomId);
        if (dorm && builtHabitats.some(h => roomsAreAdjacent(dorm, h))) {
          char.needs.composure = Math.max(0, char.needs.composure - 5);
        }
      }
      if (hasTrait(char, 'Loudmouth') && char.morale < 40 && char.bedRoomId != null) {
        for (const other of state.characters) {
          if (other.id !== char.id && other.bedRoomId === char.bedRoomId) {
            other.needs.composure = Math.max(0, other.needs.composure - 5);
          }
        }
      }
      if (hasTrait(char, 'Sleepwalker') && Math.random() < 0.01) {
        for (const other of state.characters) {
          if (other.id !== char.id && char.bedRoomId != null && other.bedRoomId === char.bedRoomId) {
            other.needs.composure = Math.max(0, other.needs.composure - 2);
          }
        }
        state.notices.push({
          id: uniqueNoticeId(`sleepwalk-${char.id}`, state),
          time: Date.now(),
          type: 'misbehavior',
          text: `🌙 ${char.name} sleepwalked through the corridors at night.`,
          data: { roomId: char.bedRoomId, characterIds: [char.id] }
        });
      }
      if (hasTrait(char, 'Butterfingers') && Math.random() < 0.03) {
        const usedRoomIds = [char.seatRoomId, char.workplaceRoomId, char.bedRoomId].filter((id): id is number => id != null);
        const targetRoom = state.rooms.find(
          r => usedRoomIds.includes(r.id) && r.furniture.some(f => !f.damaged && !f.slotKind.startsWith('required:'))
        );
        const frag = targetRoom?.furniture.find(f => !f.damaged && !f.slotKind.startsWith('required:'));
        if (targetRoom && frag) {
          frag.damaged = true;
          const fName = FURNITURE_DEFINITIONS[frag.defId]?.name || frag.defId;
          const msg = `💥 ${char.name} accidentally damaged ${fName} in ${roomName(targetRoom.defId)}!`;
          notifications.push(msg);
          state.notices.push({
            id: uniqueNoticeId(`butterfingers-${char.id}`, state),
            time: Date.now(),
            type: 'misbehavior',
            text: msg,
            data: { roomId: targetRoom.id, characterIds: [char.id] }
          });
        }
      }
      if (hasTrait(char, 'Summoner-at-Heart') && Math.random() < 0.003) {
        const cand = state.rooms.find(r => r.state === 'built' && !isRoomUnfinished(r) && !r.hazard && r.area === 'castle');
        const hazId = Math.random() < 0.5 ? 'echo_loop' : 'imp_infestation';
        if (cand && HAZARD_CATALOG[hazId]) {
          applyHazardInstance(state, HAZARD_CATALOG[hazId], cand, notifications);
        }
      }
    }

    for (const char of state.characters) {
      // Hex fog hazard on floor causes extra composure drain (-10, immune if Rift-Touched)
      const charRoom = (char.seatRoomId ? state.rooms.find(r => r.id === char.seatRoomId) : undefined)
        || (char.workplaceRoomId ? state.rooms.find(r => r.id === char.workplaceRoomId) : undefined)
        || (char.bedRoomId ? state.rooms.find(r => r.id === char.bedRoomId) : undefined);
      if (charRoom && char.injury?.type !== 'rift_touched' && floorHasHazard(state, charRoom, 'hex_fog')) {
        char.needs.composure = Math.max(0, char.needs.composure - 10);
      }

      char.morale = calculateMorale(char.needs, characterMoraleBonuses(state, char));
      // Glimmerhorn Stag applies +3 morale (scaled by Bond/Menagerie/stacking) after base morale recalculation
      if (stagScale > 0) {
        char.morale = Math.min(100, char.morale + Math.round(3 * stagScale));
      }
      const moraleFurn = academyFurnitureEffect(state.rooms, 'morale_bonus');
      if (moraleFurn !== 0) {
        char.morale = Math.min(100, Math.max(0, char.morale + moraleFurn));
      }
      if ((state.activeBuffs?.fellowshipBells || 0) > 0) {
        char.morale = Math.min(100, char.morale + 10);
      }
      if ((state.activeBuffs?.dawnBlessingBells || 0) > 0) {
        char.morale = Math.min(100, char.morale + 15);
      }

      // Clean up expired timed misbehavior chains before rolling
      if (char.misbehaviorChains?.length) {
        char.misbehaviorChains = char.misbehaviorChains.filter(ch => ch.expiresBell === undefined || ch.expiresBell > state.bellIndex);
      }

      // Full §20.2 / §20.3 Student Misbehavior Roll & Incidents
      rollMisbehaviorForStudent(state, char, wizBuffs, bag, note, notifications);
    }

    // 6. Cleanliness & Mopslime & Lv3 Storage Vault Builders
    const cleanBonus = 3 * creatureSpeciesBuffSum(state, 'mopslime');
    const hasActiveBuilderForClean = state.characters.some(
      c => c.career === 'builder' && c.careerState === 'active' && c.status !== 'away' && !c.injury
    );
    const lv3VaultClean = hasActiveBuilderForClean
      ? state.rooms.filter(
          r =>
            r.defId === 'storage_vault' &&
            r.state === 'built' &&
            !isRoomUnfinished(r) &&
            !AnkicasterEngine.roomIsLocked(state, r) &&
            (r.level || 1) >= 3
        ).length
      : 0;
    for (const r of state.rooms) {
      const roomClean = academyFurnitureEffect(state.rooms, 'cleanliness_per_bell', r);
      const isCleanImmune = (state.activeBuffs?.cleanImmuneBells || 0) > 0 && (!state.activeBuffs?.cleanImmuneRoomId || state.activeBuffs.cleanImmuneRoomId === r.id);
      const hasTidyUser = state.characters.some(
        c => c.status !== 'away' && hasTrait(c, 'Tidy') && (c.bedRoomId === r.id || c.seatRoomId === r.id || c.workplaceRoomId === r.id)
      );
      const decay = isCleanImmune ? 0 : (hasTidyUser ? 0.5 * 0.7 : 0.5) * (1 - sb.dirtReductionPct);
      r.cleanliness = Math.max(0, Math.min(100, r.cleanliness - decay + cleanBonus + roomClean + lv3VaultClean));
      if (r.cleanliness >= 80 && r.misbehaviorCharmMalus) {
        r.misbehaviorCharmMalus = undefined;
        for (const ch of state.characters) {
          if (ch.misbehaviorChains?.length) {
            ch.misbehaviorChains = ch.misbehaviorChains.filter(m => !(m.roomId === r.id && (m.incidentId === 'graffiti_glyphs' || m.incidentId === 'portrait_mustache')));
          }
        }
      }
    }

    // 7. Tick down bell-based potion & spell buffs
    if (state.activeBuffs) {
      const bellKeys: Array<keyof NonNullable<FullGameState['activeBuffs']>> = [
        'growthElixirBells',
        'cleanImmuneBells',
        'fireproofBells',
        'fellowshipBells',
        'starlitConjunctionBells',
        'rainDanceBells',
        'verdantSurgeBells',
        'dawnBlessingBells',
        'wardPulseBells',
        'moonlessNightBells'
      ];
      for (const k of bellKeys) {
        const val = state.activeBuffs[k];
        if (typeof val === 'number' && val > 0) {
          (state.activeBuffs as any)[k] = val - 1;
        }
      }
    }

    // 8. Headmaster's Presence: set wizard.presenceRoomId each bell when no session is active
    if (state.wizard.activeSession && state.wizard.activeSession.state === 'active') {
      state.wizard.presenceRoomId = undefined;
    } else {
      const candidates = state.rooms.filter(
        r => r.state === 'built' && !isRoomUnfinished(r) && r.defId !== 'wizard_study' && r.defId !== 'support_pillar' && r.defId !== 'spiral_stair'
      );
      const pool = candidates.length > 0 ? candidates : state.rooms.filter(r => r.state === 'built' && !isRoomUnfinished(r));
      if (pool.length > 0) {
        state.wizard.presenceRoomId = pool[state.bellIndex % pool.length].id;
      }
    }

    commitBell(state, bellNotes);
    processEscapes(state, notifications, note);
    for (const room of state.rooms) {
      if (room.hazard?.expiresAtBellIndex !== undefined && state.bellIndex >= room.hazard.expiresAtBellIndex) {
        clearRoomHazard(state, room, notifications, 'resolved');
      }
    }
    rollHazardForBell(state, notifications);
    rollBreachForBell(state, notifications);
    rollAlchemyExplosionForBell(state, notifications);
    state.nextBellLabExplosionMult = undefined;
    syncCharmRenown(state);
  }

  /**
   * Process Real-Time Days Elapsed from System Clock (BR-04, BR-25)
   * Calculates days passed based on actual Date.now() - state.lastSessionTimeMs.
   * Auto-pays the Veil from banked mana for each missed day down to the 10% bank floor,
   * then holds the Veil steady at its current strength without further decay.
   * Advances real-day mastery countdowns and random occurrences.
   */
  static processRealTimeElapsedDays(
    state: FullGameState,
    currentTimeMs: number = Date.now()
  ): { state: FullGameState; daysPassed: number; summary: string[] } {
    const next = structuredClone(state);
    const summary: string[] = [];

    // Anki 4:00 AM calendar day rollover
    const lastDayNum = getAnkiDayNumber(next.lastSessionTimeMs || currentTimeMs);
    const currentDayNum = getAnkiDayNumber(currentTimeMs);
    const daysPassed = Math.max(0, currentDayNum - lastDayNum);

    // Update lastSessionTimeMs carrying over leftover hours
    next.lastSessionTimeMs = currentTimeMs;

    if (daysPassed <= 0) {
      return { state: next, daysPassed: 0, summary };
    }

    // Process each missed day (clamped to max 30 days to protect performance)
    const processedDays = Math.min(30, daysPassed);
    const startDay = next.day;
    next.day += daysPassed;

    let totalVeilPaid = 0;
    let floorReached = false;

    // 10% Bank floor rule (BR-25)
    const bankFloor = Math.max(10, Math.round((next.bankAtLastReview || next.mana) * 0.1));
    const standingStonesCount = next.rooms.filter(r => r.defId === 'standing_stones' && r.state === 'built' && !isRoomUnfinished(r)).length;
    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];

    ensureUpcomingEventsQueue(next);

    for (let d = 0; d < processedDays; d++) {
      const warders = next.characters.filter(isActiveWarder).length;
      const veilInfo = computeAcademyVeilSummary(next);

      next.veil.costToday = veilInfo.cost;
      next.veil.reductions = veilInfo.reductions;

      const isManualVeil = !next.veil.autoPay || next.settings?.veilPayment === 'ask';
      if (isManualVeil) {
        next.veil.paidToday = 0;
        next.pendingVeilPayment = {
          totalCost: (next.pendingVeilPayment?.totalCost || 0) + veilInfo.cost,
          days: (next.pendingVeilPayment?.days || 0) + 1
        };
      } else {
        if (next.mana > bankFloor) {
          const availableToSpend = next.mana - bankFloor;
          const pay = Math.min(availableToSpend, veilInfo.cost);
          next.mana -= pay;
          totalVeilPaid += pay;
          next.veil.paidToday = pay;

          if (pay >= veilInfo.cost) {
            next.veil.strength = Math.min(100, next.veil.strength + 3 + standingStonesCount * 2);
          } else {
            const unpaidRatio = (veilInfo.cost - pay) / Math.max(1, veilInfo.cost);
            next.veil.strength = Math.max(0, next.veil.strength - Math.round(15 * unpaidRatio));
            if (next.mana <= bankFloor) floorReached = true;
          }
        } else {
          // Reached 10% bank floor!
          // Under BR-25 / BR-04: Breaks are safe! Auto-pay ceases and the Veil HOLDS STEADY without further decay.
          floorReached = true;
          next.veil.paidToday = 0;
        }
      }

      // Real Day Mastery Delays & Graduations
      const realSchedule = buildAcademySchedule(next);
      let anyGraduated = false;
      for (const char of next.characters) {
        if (char.status === 'student' && char.studySetId) {
          const studySet = next.cardSets.find(s => s.id === char.studySetId);
          if (studySet) {
            const ivls = studySet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
            if (isMasteryReady(ivls, next.settings.cardsPerStudent)) {
              const sch = char.currentSchool || 'nature';
              char.readyDays[sch] = (char.readyDays[sch] || 0) + 1;

              const delaySrc = getStudentDelaySource(next, realSchedule, char);
              const delay = calculateTeacherDelay(
                delaySrc.teacherType,
                delaySrc.teacherIvls,
                next.wizard.levels[sch],
                next.wizard.levels.light
              );

              if (char.readyDays[sch] >= delay && !char.masteredSchools.includes(sch)) {
                const gradRoomId = char.seatRoomId ?? ehRoom?.id;
                char.masteredSchools.push(sch);
                char.title = `Master of ${sch.toUpperCase()}`;
                char.status = 'resident';
                char.currentSchool = undefined;
                char.classRoomId = undefined;
                char.period = undefined;
                char.seatRoomId = undefined;
                anyGraduated = true;
                const renownGain = 10 + academyFurnitureEffect(next.rooms, 'renown_bonus');
                next.renown += renownGain;
                checkEndlessSpellbookMilestones(next);
                summary.push(`🎓 ${char.name} completed real-time mastery countdown and graduated as Master of ${sch.toUpperCase()}!`);
                next.notices.push({
                  id: uniqueNoticeId(`master-${char.id}`, next),
                  time: Date.now(),
                  type: 'mastery',
                  text: `${char.name} graduated as Master of ${sch.toUpperCase()} (+${renownGain} Renown)!`,
                  data: {
                    roomId: gradRoomId,
                    characterIds: [char.id],
                    school: sch,
                    visualEventType: 'master_graduated'
                  }
                });
                AnkicasterEngine.grantRiftGate(next);
              }
            }
          }
        }
      }
      if (anyGraduated) AnkicasterEngine.syncWorkplaces(next);

      // Real-day event arrival (consumed from upcomingEvents forecast queue)
      const simDay = startDay + d + 1;
      const qIdx = (next.upcomingEvents || []).findIndex(e => e.day === simDay);
      let chosenEventId = qIdx >= 0 ? next.upcomingEvents!.splice(qIdx, 1)[0].eventId : undefined;
      if (!chosenEventId && Math.random() < 0.4) {
        const availableEvents = SCHOOL_EVENTS.filter(ev => !next.activeEvents.some(ae => ae.eventId === ev.id));
        if (availableEvents.length > 0) {
          chosenEventId = availableEvents[Math.floor(Math.random() * availableEvents.length)].id;
        }
      }
      if (chosenEventId && chosenEventId !== 'none') {
        const chosen = SCHOOL_EVENTS.find(ev => ev.id === chosenEventId);
        if (chosen && !next.activeEvents.some(ae => ae.eventId === chosen.id)) {
          next.activeEvents.push({ eventId: chosen.id, dayArrived: simDay });
          summary.push(`📜 Event arrived at Academy gates: ${chosen.name}.`);
          next.notices.push({
            id: uniqueNoticeId(`event-arrive-${chosen.id}`, next),
            time: Date.now(),
            type: 'event',
            text: `📜 Event arrived at Academy gates: ${chosen.name}.`,
            data: { roomId: ehRoom?.id }
          });
        }
      }
      if (next.activeBuffs?.foresightDays && next.activeBuffs.foresightDays > 0) {
        next.activeBuffs.foresightDays -= 1;
      }
      ensureUpcomingEventsQueue(next);

      // Check thin Veil hazard spawn if Veil band is 'thin' or 'torn' (< 50%)
      // Rule BR-25: While the player is away and the bank has hit the 10% floor, skip hazard rolls
      const veilBand = getVeilBand(next.veil.strength);
      if (!floorReached && next.mana > bankFloor && (next.activeBuffs?.wardPulseBells || 0) <= 0) {
        const baseHazardChance = Math.max(0.02, 0.25 * Math.pow(0.7, warders));
        if (veilBand === 'thin' || veilBand === 'torn') {
          const shadowSteps = wizardSchoolBuffs(next.wizard.levels).shadowSteps;
          const sbDaily = computeSpellbookBonuses(next.spellbooks || []);
          const creatureHazRed = creatureCategoryBonus(
            next,
            [
              { defId: 'night_lynx', perCopy: 0.15 },
              { defId: 'velvet_bat_swarm', perCopy: 0.08 },
              { defId: 'glyph_cat', perCopy: 0.08 }
            ],
            0.5
          );
          const globalRed = Math.min(0.75, shadowSteps * 0.03 + warders * 0.1 + creatureHazRed + sbDaily.hazardReductionPct);
          const moonMult = (next.activeBuffs?.moonlessNightBells || 0) > 0 ? 0.4 : 1;
          if (Math.random() < baseHazardChance * (1 - globalRed) * moonMult) {
            const eligibleDefs = Object.values(HAZARD_CATALOG)
              .filter(def => def.weight > 0 && !(def.id === 'kitchen_fire' && (next.activeBuffs?.fireproofBells || 0) > 0 && !next.activeBuffs?.fireproofRoomId))
              .map(def => ({ def, rooms: filterRoomsForHazard(next, def) }))
              .filter(e => e.rooms.length > 0);
            const pickedEntry = weightedPick(eligibleDefs, e => e.def.weight);
            const target = pickedEntry ? weightedPick(pickedEntry.rooms, r => ROOM_DEFINITIONS[r.defId]?.veil || 1) : undefined;
            if (pickedEntry && target) {
              if (!consumeFloorWardProtection(next, target, summary) && Math.random() >= localHazardFizzleChance(next, target)) {
                applyHazardInstance(next, pickedEntry.def, target, summary);
              }
            }
          }
        }
      }
    }

    // Lure Musk guaranteed visitor
    if (next.activeBuffs?.lureMuskPending) {
      next.activeBuffs.lureMuskPending = false;
      const allDefs = Object.values(CREATURE_DEFINITIONS);
      if (allDefs.length > 0) {
        const cDef = allDefs[Math.floor(Math.random() * allDefs.length)];
        const newCid = uniqueNumericId(next.creatures.map(c => c.id));
        next.creatures.push({
          id: newCid,
          defId: cDef.id,
          nickname: cDef.name,
          status: 'wary',
          hungry: false,
          hatchProgress: 0,
          tamingProgress: 0,
          bondLevel: 1,
          bondProgress: 0,
          arrivedDay: next.day
        });
        syncDiscoveredCreatures(next);
        summary.push(`🐾 Lure Musk attracted a wild ${cDef.name} to the Academy!`);
        next.notices.push({
          id: uniqueNoticeId(`creature-arrive-${newCid}`, next),
          time: Date.now(),
          type: 'creature_arrival',
          text: `🐾 Lure Musk attracted a wild ${cDef.name} to the Academy!`,
          data: { roomId: ehRoom?.id, creatureId: newCid, visualEventType: 'creature_arrival' }
        });
      }
    }

    if (totalVeilPaid > 0) {
      summary.push(`Veil upkeep processed over ${daysPassed} day(s): ${totalVeilPaid} mana paid from reserve. Dome strength: ${next.veil.strength}%.`);
    }

    if (next.pendingVeilPayment && next.pendingVeilPayment.totalCost > 0) {
      summary.push(`🛡️ Manual Veil Upkeep awaiting confirmation: ${next.pendingVeilPayment.totalCost} mana across ${next.pendingVeilPayment.days} day(s).`);
    }

    if (floorReached) {
      summary.push(`🛡️ 10% Bank Floor reached (${bankFloor} mana preserved). The Veil is holding steady in safe rest state (Rule BR-25).`);
    }

    // Check automatic retirements
    this.checkAutomaticRetirements(next, summary);

    // Check Timed Term / examTimer
    this.checkTimedTermStatus(next, currentTimeMs);

    return { state: next, daysPassed, summary };
  }

  /**
   * Day Tick (simulating dawn / calendar day rollover)
   */
  static triggerDayTick(state: FullGameState): { state: FullGameState; summary: string[] } {
    const next = structuredClone(state);
    const summary: string[] = [];
    next.day += 1;

    // 1. Veil Upkeep Calculation (F23 / §18.3) with 10% Floor (BR-25)
    const warders = next.characters.filter(isActiveWarder).length;
    const standingStonesCount = next.rooms.filter(r => r.defId === 'standing_stones' && r.state === 'built' && !isRoomUnfinished(r)).length;
    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];

    ensureUpcomingEventsQueue(next);
    const veilInfo = computeAcademyVeilSummary(next);

    next.veil.costToday = veilInfo.cost;
    next.veil.reductions = veilInfo.reductions;

    const bankFloor = Math.max(10, Math.round((next.bankAtLastReview || next.mana) * 0.1));
    let floorHit = false;
    let paidFully = veilInfo.cost <= 0;

    const isManualVeil = !next.veil.autoPay || next.settings?.veilPayment === 'ask';
    if (isManualVeil) {
      next.veil.paidToday = 0;
      next.pendingVeilPayment = {
        totalCost: (next.pendingVeilPayment?.totalCost || 0) + veilInfo.cost,
        days: (next.pendingVeilPayment?.days || 0) + 1
      };
      summary.push(`🛡️ Manual Veil Upkeep awaiting decision: ${next.pendingVeilPayment.totalCost} mana (${next.pendingVeilPayment.days} day(s)).`);
    } else {
      if (next.mana > bankFloor) {
        const available = next.mana - bankFloor;
        const paid = Math.min(available, veilInfo.cost);
        next.mana -= paid;
        next.veil.paidToday = paid;

        if (paid >= veilInfo.cost) {
          paidFully = true;
          next.veil.strength = Math.min(100, next.veil.strength + 5 + warders * 5 + standingStonesCount * 2);
          summary.push(`Veil upkeep paid: ${paid} mana. Dome holds Strong (${next.veil.strength}%).`);
        } else {
          const unpaidRatio = (veilInfo.cost - paid) / Math.max(1, veilInfo.cost);
          next.veil.strength = Math.max(0, next.veil.strength - Math.round(15 * unpaidRatio));
          if (next.mana <= bankFloor) floorHit = true;
          summary.push(`⚠️ Partial Veil upkeep paid (${paid}/${veilInfo.cost} mana). Bank reached 10% floor (${bankFloor} mana). Dome holds steady at ${next.veil.strength}%.`);
        }
      } else {
        floorHit = true;
        next.veil.paidToday = 0;
        summary.push(`🛡️ 10% Bank Floor active (${next.mana} mana). Veil holds steady at ${next.veil.strength}% without further decay.`);
      }
    }

    next.notices.push({
      id: uniqueNoticeId(`day-tick-${next.day}`, next),
      time: Date.now(),
      type: paidFully ? 'day_tick_paid' : 'day_tick_unpaid',
      text: isManualVeil
        ? `Dawn of Day ${next.day}: Manual Veil upkeep pending (${veilInfo.cost}m).`
        : paidFully
          ? `Dawn of Day ${next.day}: Veil upkeep paid (${next.veil.paidToday}m).`
          : `Dawn of Day ${next.day}: Veil upkeep incomplete (${next.veil.paidToday}/${next.veil.costToday}m).`,
      data: {
        roomId: ehRoom?.id,
        visualEventType: paidFully ? 'day_tick_paid' : 'day_tick_unpaid'
      }
    });

    // 2. Mastery Delays and Graduation Checks
    const tickSchedule = buildAcademySchedule(next);
    let anyTickGraduated = false;
    for (const char of next.characters) {
      if (char.status === 'student' && char.studySetId) {
        const studySet = next.cardSets.find(s => s.id === char.studySetId);
        if (studySet) {
          const ivls = studySet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
          if (isMasteryReady(ivls, next.settings.cardsPerStudent)) {
            const sch = char.currentSchool || 'nature';
            char.readyDays[sch] = (char.readyDays[sch] || 0) + 1;

            const delaySrc = getStudentDelaySource(next, tickSchedule, char);
            const delay = calculateTeacherDelay(
              delaySrc.teacherType,
              delaySrc.teacherIvls,
              next.wizard.levels[sch],
              next.wizard.levels.light
            );

            if (char.readyDays[sch] >= delay && !char.masteredSchools.includes(sch)) {
              const gradRoomId = char.seatRoomId ?? ehRoom?.id;
              char.masteredSchools.push(sch);
              char.title = `Master of ${sch.toUpperCase()}`;
              char.status = 'resident';
              char.currentSchool = undefined;
              char.classRoomId = undefined;
              char.period = undefined;
              char.seatRoomId = undefined;
              anyTickGraduated = true;
              const renownGain = 10 + academyFurnitureEffect(next.rooms, 'renown_bonus');
              next.renown += renownGain;
              checkEndlessSpellbookMilestones(next);
              summary.push(`🎓 Congratulations! ${char.name} has graduated as a Master of ${sch.toUpperCase()}!`);
              next.notices.push({
                id: uniqueNoticeId(`master-${char.id}`, next),
                time: Date.now(),
                type: 'mastery',
                text: `${char.name} graduated as Master of ${sch.toUpperCase()} (+${renownGain} Renown)!`,
                data: {
                  roomId: gradRoomId,
                  characterIds: [char.id],
                  school: sch,
                  visualEventType: 'master_graduated'
                }
              });
              AnkicasterEngine.grantRiftGate(next);
            }
          }
        }
      }
    }
    if (anyTickGraduated) AnkicasterEngine.syncWorkplaces(next);

    // 3. Event Arrival (consumed from upcomingEvents forecast queue)
    const qIdx = (next.upcomingEvents || []).findIndex(e => e.day === next.day);
    let chosenEventId = qIdx >= 0 ? next.upcomingEvents!.splice(qIdx, 1)[0].eventId : undefined;
    if (!chosenEventId && Math.random() < 0.4) {
      const availableEvents = SCHOOL_EVENTS.filter(ev => !next.activeEvents.some(ae => ae.eventId === ev.id));
      if (availableEvents.length > 0) {
        chosenEventId = availableEvents[Math.floor(Math.random() * availableEvents.length)].id;
      }
    }
    if (chosenEventId && chosenEventId !== 'none') {
      const chosen = SCHOOL_EVENTS.find(ev => ev.id === chosenEventId);
      if (chosen && !next.activeEvents.some(ae => ae.eventId === chosen.id)) {
        next.activeEvents.push({ eventId: chosen.id, dayArrived: next.day });
        summary.push(`📜 A new event has arrived at the Academy gates: ${chosen.name}.`);
        next.notices.push({
          id: uniqueNoticeId(`event-arrive-${chosen.id}`, next),
          time: Date.now(),
          type: 'event',
          text: `📜 A new event has arrived at the Academy gates: ${chosen.name}.`,
          data: { roomId: ehRoom?.id }
        });
      }
    }
    if (next.activeBuffs?.foresightDays && next.activeBuffs.foresightDays > 0) {
      next.activeBuffs.foresightDays -= 1;
    }
    ensureUpcomingEventsQueue(next);

    // 3b. Thin Veil hazard spawn if Veil band is 'thin' or 'torn' (< 50%, skipped at 10% bank floor)
    const tickVeilBand = getVeilBand(next.veil.strength);
    if (!floorHit && next.mana > bankFloor && (tickVeilBand === 'thin' || tickVeilBand === 'torn') && (next.activeBuffs?.wardPulseBells || 0) <= 0) {
      const baseHazardChance = Math.max(0.02, 0.25 * Math.pow(0.7, warders));
      const shadowSteps = wizardSchoolBuffs(next.wizard.levels).shadowSteps;
      const sbDaily = computeSpellbookBonuses(next.spellbooks || []);
      const creatureHazRed = creatureCategoryBonus(
        next,
        [
          { defId: 'night_lynx', perCopy: 0.15 },
          { defId: 'velvet_bat_swarm', perCopy: 0.08 },
          { defId: 'glyph_cat', perCopy: 0.08 }
        ],
        0.5
      );
      const globalRed = Math.min(0.75, shadowSteps * 0.03 + warders * 0.1 + creatureHazRed + sbDaily.hazardReductionPct);
      const moonMult = (next.activeBuffs?.moonlessNightBells || 0) > 0 ? 0.4 : 1;
      if (Math.random() < baseHazardChance * (1 - globalRed) * moonMult) {
        const eligibleDefs = Object.values(HAZARD_CATALOG)
          .filter(def => def.weight > 0 && !(def.id === 'kitchen_fire' && (next.activeBuffs?.fireproofBells || 0) > 0 && !next.activeBuffs?.fireproofRoomId))
          .map(def => ({ def, rooms: filterRoomsForHazard(next, def) }))
          .filter(e => e.rooms.length > 0);
        const pickedEntry = weightedPick(eligibleDefs, e => e.def.weight);
        const target = pickedEntry ? weightedPick(pickedEntry.rooms, r => ROOM_DEFINITIONS[r.defId]?.veil || 1) : undefined;
        if (pickedEntry && target) {
          if (!consumeFloorWardProtection(next, target, summary) && Math.random() >= localHazardFizzleChance(next, target)) {
            applyHazardInstance(next, pickedEntry.def, target, summary);
          }
        }
      }
    }

    // 4. Lure Musk guaranteed visitor
    if (next.activeBuffs?.lureMuskPending) {
      next.activeBuffs.lureMuskPending = false;
      const targetHabId = next.activeBuffs.lureMuskRoomId;
      next.activeBuffs.lureMuskRoomId = undefined;
      const lureRoom = targetHabId != null
        ? next.rooms.find(r => r.id === targetHabId && r.state === 'built' && !isRoomUnfinished(r))
        : undefined;
      const allDefs = Object.values(CREATURE_DEFINITIONS);
      const acceptedHabs = lureRoom ? roomAcceptedHabitats(lureRoom) : [];
      const matchingDefs = acceptedHabs.length > 0
        ? allDefs.filter(d => d.habitats.some(h => acceptedHabs.includes(h)))
        : allDefs;
      const pool = matchingDefs.length > 0 ? matchingDefs : allDefs;
      if (pool.length > 0) {
        const cDef = pool[Math.floor(Math.random() * pool.length)];
        const newCid = uniqueNumericId(next.creatures.map(c => c.id));
        next.creatures.push({
          id: newCid,
          defId: cDef.id,
          nickname: cDef.name,
          roomId: lureRoom?.id,
          status: 'wary',
          hungry: false,
          hatchProgress: 0,
          tamingProgress: 0,
          bondLevel: 1,
          bondProgress: 0,
          arrivedDay: next.day
        });
        syncDiscoveredCreatures(next);
        summary.push(`🐾 Lure Musk attracted a wild ${cDef.name} to the Academy!`);
        next.notices.push({
          id: uniqueNoticeId(`creature-arrive-${newCid}`, next),
          time: Date.now(),
          type: 'creature_arrival',
          text: `🐾 Lure Musk attracted a wild ${cDef.name} to the Academy!`,
          data: { roomId: lureRoom?.id ?? ehRoom?.id, creatureId: newCid, visualEventType: 'creature_arrival' }
        });
      }
    }

    for (const c of next.characters) {
      if (c.cosmeticStatus && next.day >= c.cosmeticStatus.expiresDay) {
        c.cosmeticStatus = undefined;
      }
      if (c.status !== 'away' && hasTrait(c, 'Collector') && Math.random() < 0.02) {
        const mats = ['timber', 'stone', 'glass', 'cloth'] as const;
        const picked = mats[Math.floor(Math.random() * mats.length)];
        const amt = 2 + Math.floor(Math.random() * 4);
        const cap = AnkicasterEngine.storageCap(next);
        const before = (next.resources as any)[picked] || 0;
        (next.resources as any)[picked] = before >= cap ? before : Math.min(cap, before + amt);
        const msg = `🪙 Collector ${c.name} found +${amt} ${picked}!`;
        summary.push(msg);
        next.notices.push({
          id: uniqueNoticeId(`collector-${c.id}`, next),
          time: Date.now(),
          type: 'event',
          text: msg,
          data: { roomId: c.bedRoomId ?? ehRoom?.id, characterIds: [c.id] }
        });
      }
    }

    checkSuspendedLinkedCards(next, summary);
    grantAlumniVisitGift(next, summary);
    checkEndlessSpellbookMilestones(next);
    this.checkAutomaticRetirements(next, summary);
    this.checkTimedTermStatus(next, Date.now());

    return { state: next, summary };
  }

  /**
   * Retire a graduated character to the Alumni Gallery
   * Once all study cards have passed retirementAgeDays (default 90d), the character
   * can be retired. Their cards return to the free pool, and they provide permanent renown.
   */
  static retireCharacter(
    state: FullGameState,
    charId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const charIndex = next.characters.findIndex(c => c.id === charId);
    if (charIndex === -1) return { state, success: false, error: 'Character not found.' };

    const char = next.characters[charIndex];
    if (char.masteredSchools.length === 0) {
      return { state, success: false, error: 'Character has not yet graduated as a Master of Magic.' };
    }

    // Check retirement age: all cards from every school and career must exceed retirementAgeDays
    const retirementThreshold = next.settings.retirementAgeDays || 90;
    const charSets = next.cardSets.filter(s => s.characterId === charId);
    const allCardIds = charSets.flatMap(s => s.cardIds);

    if (allCardIds.length === 0) {
      return { state, success: false, error: 'Character has no linked cards to evaluate for retirement.' };
    }

    const notRetiredCards = allCardIds.filter(cid => (next.allCards[cid]?.honestIvl || 0) < retirementThreshold);
    if (notRetiredCards.length > 0) {
      return {
        state,
        success: false,
        error: `All cards must reach ${retirementThreshold} days interval before retirement (${notRetiredCards.length} cards still maturing).`
      };
    }

    // Release card sets back to free pool
    for (const set of charSets) {
      set.released = true;
    }

    // Add to Alumni Gallery with career-scaled permanent bonus
    const extraSchoolsRenown = Math.max(0, char.masteredSchools.length - 1) * 5;
    const renownGain = 10 + extraSchoolsRenown + academyFurnitureEffect(next.rooms, 'renown_bonus');
    next.alumniGallery.push(createAlumnusRecord(char, next.day, retirementThreshold));

    next.renown += renownGain;
    next.characters.splice(charIndex, 1);
    for (const cr of next.creatures) {
      if (cr.tamerId === char.id) cr.tamerId = undefined;
      if (cr.adventurerId === char.id) cr.adventurerId = undefined;
    }
    AnkicasterEngine.grantRiftGate(next);
    checkEndlessSpellbookMilestones(next);

    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];
    next.notices.push({
      id: uniqueNoticeId('retire', next),
      time: Date.now(),
      type: 'retirement',
      text: `🏛️ ${char.name} has gracefully retired to the Academy Alumni Gallery (+${renownGain} Renown)! Flashcards returned to free pool.`,
      data: {
        roomId: ehRoom?.id,
        characterIds: [char.id],
        visualEventType: 'character_retired'
      }
    });

    return { state: next, success: true };
  }

  /**
   * Automatic Character Retirement (Section 12 / BR-26)
   * Automatically retires characters once *every* card they've ever had,
   * from every school and career, passes the retirement age (default 90d).
   */
  static checkAutomaticRetirements(
    state: FullGameState,
    summary?: string[]
  ): { state: FullGameState; retired: Character[] } {
    const next = state;
    const retired: Character[] = [];
    const retirementThreshold = next.settings.retirementAgeDays || 90;
    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];

    for (let i = next.characters.length - 1; i >= 0; i--) {
      const char = next.characters[i];
      if (char.masteredSchools.length === 0) continue;

      const charSets = next.cardSets.filter(s => s.characterId === char.id);
      if (charSets.length === 0) continue;

      const allCardIds = charSets.flatMap(s => s.cardIds);
      if (allCardIds.length === 0) continue;

      const allMature = allCardIds.every(cid => (next.allCards[cid]?.honestIvl || 0) >= retirementThreshold);
      if (allMature) {
        // Release card sets
        for (const set of charSets) {
          set.released = true;
        }

        // Add to Alumni Gallery with career-scaled permanent bonus
        const extraSchoolsRenown = Math.max(0, char.masteredSchools.length - 1) * 5;
        const renownGain = 10 + extraSchoolsRenown + academyFurnitureEffect(next.rooms, 'renown_bonus');
        next.alumniGallery.push(createAlumnusRecord(char, next.day, retirementThreshold));

        next.renown += renownGain;
        next.characters.splice(i, 1);
        for (const cr of next.creatures) {
          if (cr.tamerId === char.id) cr.tamerId = undefined;
          if (cr.adventurerId === char.id) cr.adventurerId = undefined;
        }
        retired.push(char);
        AnkicasterEngine.grantRiftGate(next);
        checkEndlessSpellbookMilestones(next);

        const msg = `🏛️ ${char.name} has automatically retired to the Alumni Gallery (+${renownGain} Renown) after all cards reached ${retirementThreshold}d retirement age!`;
        if (summary) summary.push(msg);
        next.notices.push({
          id: uniqueNoticeId(`auto-retire-${char.id}`, next),
          time: Date.now(),
          type: 'retirement',
          text: msg,
          data: {
            roomId: ehRoom?.id,
            characterIds: [char.id],
            visualEventType: 'character_retired'
          }
        });
      }
    }

    return { state: next, retired };
  }

  /**
   * Load snapshot of non-suspended real cards from Anki collection
   * Updates state.allCards with real cards, maintaining existing links
   */
  static loadCardSnapshot(
    state: FullGameState,
    snapshot: Array<{ id: number; deckName: string; card_age: number; type?: number; queue?: number }>
  ): FullGameState {
    const existing = state.allCards || {};
    const updatedCards: Record<number, AnkiCardSnapshot> = {};

    for (const item of snapshot) {
      const prior = existing[item.id];
      updatedCards[item.id] = {
        id: item.id,
        nid: prior?.nid ?? item.id,
        deckName: item.deckName || 'Anki Collection',
        front: prior?.front ?? `Anki Card #${item.id}`,
        back: prior?.back ?? 'Answer',
        ivl: item.card_age,
        lastAnswerIvl: item.card_age,
        honestIvl: item.card_age,
        type: item.type ?? prior?.type ?? 2,
        queue: item.queue ?? prior?.queue ?? 2,
        due: 0,
        lastStudiedMs: prior?.lastStudiedMs ?? Date.now(),
        installBaselineMs: prior?.installBaselineMs ?? state.installBaselineMs
      };
    }

    // Preserve linked card entries referenced by active card sets if omitted from a partial snapshot
    for (const set of state.cardSets || []) {
      if (set.released) continue;
      for (const cid of set.cardIds) {
        if (!updatedCards[cid] && existing[cid]) {
          updatedCards[cid] = { ...existing[cid] };
        }
      }
    }

    return {
      ...state,
      allCards: updatedCards
    };
  }

  /**
   * Evaluate Timed Term / examTimer status
   */
  static checkTimedTermStatus(
    state: FullGameState,
    currentTimeMs: number = Date.now()
  ): { state: FullGameState; termEnded: boolean; report?: { cardsStudied: number; mastersGraduated: number; renownEarned: number; honorTier: string } } {
    const next = state;
    if (next.settings.mode !== 'timed' && !next.settings.examTimer) {
      return { state: next, termEnded: false };
    }

    const termEndMs = next.termEndDateMs || (next.settings.termEndDate ? new Date(next.settings.termEndDate).getTime() : 0);
    const hasEndedByDate = termEndMs > 0 && currentTimeMs >= termEndMs;
    const termLength = next.settings.termLengthDays || 120;
    const termStartDate = next.termStartDateMs || next.installBaselineMs || currentTimeMs;
    const daysSinceTermStart = Math.floor((currentTimeMs - termStartDate) / (24 * 3600 * 1000));
    const hasEndedByDays = daysSinceTermStart >= termLength;

    if (hasEndedByDate || hasEndedByDays) {
      const cardsStudied = Math.max(0, next.reviewIndex - (next.termInitialReviewIndex || 0));
      const mastersGraduated = Math.max(0, (next.characters.filter(c => c.masteredSchools.length > 0).length + next.alumniGallery.length) - (next.termInitialMasters || 0));
      const renownEarned = Math.max(0, next.renown - (next.termInitialRenown || 0));

      let honorTier = 'Cum Laude';
      if (mastersGraduated >= 5 || cardsStudied >= 500) honorTier = 'Summa Cum Laude (Valedictorian)';
      else if (mastersGraduated >= 2 || cardsStudied >= 200) honorTier = 'Magna Cum Laude';

      const stars =
        (mastersGraduated >= 5 || cardsStudied >= 500 || renownEarned >= 150) ? 3 :
        (mastersGraduated >= 2 || cardsStudied >= 200 || renownEarned >= 75) ? 2 :
        (mastersGraduated >= 1 || cardsStudied >= 50 || renownEarned >= 25) ? 1 : 0;
      next.lastTermStars = stars;

      const report = {
        cardsStudied,
        mastersGraduated,
        renownEarned,
        honorTier,
        completedAt: currentTimeMs
      };

      if (stars >= 1 && !next.pendingSpellbookDraft && !next.termFinishedReport) {
        offerSpellbookDraft(next, stars as 1 | 2 | 3, `Commencement (${stars}★)`);
      }

      next.termFinishedReport = report;
      return { state: next, termEnded: true, report };
    }

    return { state: next, termEnded: false };
  }

  /**
   * Commence Next Term (GDD Item 41 / BR-30, BR-34, F36)
   * Resets students, faculty, and ALL creatures (next.creatures = []).
   * Frees card sets so real cards become unlinked.
   * Resets Renown and furniture patterns. Room plans stay (found rooms are permanent).
   * Resets buildings and materials back to starting stock, sets unspent mana to 0.
   * Preserved across terms: wizard levels, spellbooks, alumni gallery, achievements, and room plans.
   * Default term length: 120 days.
   */
  static startNextTerm(
    state: FullGameState,
    termLengthDays: number = 120
  ): { state: FullGameState } {
    const next = structuredClone(state);
    const now = Date.now();
    const retirementThreshold = next.settings?.retirementAgeDays || 90;

    // 1. Move any graduated masters to alumni gallery before reset
    for (const char of next.characters) {
      if (char.masteredSchools.length > 0) {
        if (!next.alumniGallery.some(a => a.name === char.name)) {
          next.alumniGallery.push(createAlumnusRecord(char, next.day, retirementThreshold));
        }
      }
    }

    // 2. Free all card sets so cards become free again
    for (const set of next.cardSets) {
      set.released = true;
    }
    next.cardSets = [];

    // 3. Reset characters (students & faculty)
    next.characters = [];

    // 4. Record discoveries in Bestiary then remove creatures (GDD Item 41)
    syncDiscoveredCreatures(next);
    next.creatures = [];

    // 5. Reset rooms and materials back to starting layout & stock (BR-34 / F36)
    const fresh = createInitialGameState();
    const sb = computeSpellbookBonuses(next.spellbooks || []);
    next.rooms = fresh.rooms;
    next.shelvedRooms = [];
    next.resources = fresh.resources;
    if (sb.foundersTestament) {
      const tripleKeys = [
        'timber', 'stone', 'glass', 'cloth', 'provisions', 'greens', 'fish', 'nectar',
        'insight', 'herbs', 'radiance', 'umbra', 'reagents'
      ] as const;
      const bag = next.resources as unknown as Record<string, number>;
      for (const k of tripleKeys) {
        bag[k] = (bag[k] || 0) * 3;
      }
      next.pendingFoundersPlanChoice = true;
      if (next.pendingSpellbookDraft) {
        next.pendingSpellbookDraft.allowPlanPick = true;
      }
    }
    next.activeBuffs = {};

    // 6. Reset unspent mana, renown, patterns, and this term's draw prices. Room plans stay.
    next.mana = 0;
    next.bankAtLastReview = 0;
    next.manaDebt = 0;
    next.renown = computeAlumniBonuses(next.alumniGallery || []).totalExtraSchoolsRenown;
    if (!sb.persistPlansAndPatterns) {
      next.knownPatterns = [...STARTER_PATTERNS];
    }
    next.draftHistory = {};
    next.draftPity = {};
    next.roomlessStreak = {};
    next.hand = fresh.hand;
    next.resourceLedger = { bells: [], recent: {} };
    AnkicasterEngine.grantRiftGate(next);

    // 7. Clear expeditions & active events
    next.expeditions = [];
    next.activeEvents = [];

    // Preserved:
    // next.wizard.levels
    // next.wizard.knownSpells
    // next.spellbooks
    // next.alumniGallery
    // next.achievements
    // next.allCards
    // next.discoveredCreatures

    next.settings.termLengthDays = termLengthDays;
    next.termStartDateMs = now;
    next.termEndDateMs = now + (termLengthDays * 24 * 3600 * 1000);
    next.termInitialReviewIndex = next.reviewIndex;
    next.termInitialMasters = next.alumniGallery.length;
    next.termInitialRenown = next.renown;
    next.termFinishedReport = undefined;

    next.notices.push({
      id: uniqueNoticeId('term-start', next),
      time: now,
      type: 'term_start',
      text: `📜 New Academic Term commenced (${termLengthDays} days). Students, faculty, and creatures reset; card links freed; wizard masteries, spellbooks, and alumni honored!`,
      data: { roomId: 1 }
    });
    return { state: next };
  }

  /**
   * Enroll a Master into a Second School of Magic (GDD Section 12)
   * A character with at least 1 master title can enroll in a second school,
   * requiring 50 new free young cards and 60 mana.
   */
  static enrollSecondSchool(
    state: FullGameState,
    charId: number,
    school: SchoolType
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const char = next.characters.find(c => c.id === charId);
    if (!char) return { state, success: false, error: 'Character not found.' };
    if (char.status === 'away') return { state, success: false, error: 'Character is away on an expedition.' };

    if (char.masteredSchools.length < 1) {
      return { state, success: false, error: 'Character must have mastered their first school before enrolling in a second.' };
    }

    if (char.masteredSchools.includes(school) || char.currentSchool === school) {
      return { state, success: false, error: `Already enrolled in or mastered ${school.toUpperCase()}.` };
    }

    if ((next.wizard.levels[school] || 0) < 5) {
      return { state, success: false, error: `Wizard Level 5 in ${school.toUpperCase()} required to teach.` };
    }

    const preSchedule = buildAcademySchedule(next);
    if ((preSchedule.schoolEnrolled[school] || 0) >= (preSchedule.schoolCapacity[school] || 0)) {
      return { state, success: false, error: `No free seats in ${school.toUpperCase()} classroom.` };
    }

    if (next.mana < 60) {
      return { state, success: false, error: '60 Mana required for advanced second-school enrollment.' };
    }

    // Check free young cards
    const freeYoungCards = getEligibleFreeYoungCards(next, 30);

    const needed = next.settings.cardsPerStudent;
    if (freeYoungCards.length < needed) {
      return {
        state,
        success: false,
        error: `Only ${freeYoungCards.length} / ${needed} free young cards available for second school enrollment.`
      };
    }

    // Deduct mana
    next.mana -= 60;

    const chosenCards = pickFreeYoungCards(next, 30, needed).map(c => c.id);
    const newSetId = uniqueNumericId(next.cardSets.map(s => s.id));

    next.cardSets.push({
      id: newSetId,
      characterId: char.id,
      kind: 'study',
      school,
      size: needed,
      createdDay: next.day,
      released: false,
      cardIds: chosenCards
    });

    delete char.career;
    delete char.careerState;
    delete char.workplaceRoomId;
    for (const cr of next.creatures) {
      if (cr.tamerId === char.id) cr.tamerId = undefined;
      if (cr.adventurerId === char.id) cr.adventurerId = undefined;
    }

    char.studySetId = newSetId;
    char.currentSchool = school;
    char.status = 'student';
    char.readyDays[school] = 0;
    char.chronicle.push({ day: next.day, text: `Enrolled in second school: ${school.toUpperCase()}.` });

    AnkicasterEngine.syncWorkplaces(next);

    next.notices.push({
      id: uniqueNoticeId(`sec-school-${char.id}`, next),
      time: Date.now(),
      type: 'enrollment',
      text: `✨ ${char.name} embarked on advanced study in ${school.toUpperCase()} with ${needed} new flashcards linked!`,
      data: {
        roomId: char.seatRoomId,
        characterIds: [char.id],
        school,
        visualEventType: 'student_enrolled'
      }
    });

    return { state: next, success: true };
  }

  /**
   * Enroll a new student (BR-12, BR-23)
   */
  static enrollStudent(
    state: FullGameState,
    school: SchoolType,
    name: string,
    personality: Character['personality'],
    traits: string[]
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);

    // 1. School level unlock check (BR-08)
    if ((next.wizard.levels[school] || 0) < 5) {
      return { state, success: false, error: `Wizard Level 5 in ${school.toUpperCase()} required to teach.` };
    }

    // 2. Mana fee (60 mana)
    if (next.mana < 60) {
      return { state, success: false, error: '60 Mana required for apprentice robes and wand.' };
    }

    // 3. Free young cards check (BR-12, BR-23)
    const freeYoungCards = getEligibleFreeYoungCards(next, 30);

    const needed = next.settings.cardsPerStudent;
    if (freeYoungCards.length < needed) {
      return {
        state,
        success: false,
        error: `Enrollment tracker blocked: Only ${freeYoungCards.length} / ${needed} free young cards available.`
      };
    }

    // 4. Free Bed & Free Seat Check
    const dormBedCount = (d: PlacedRoom) => {
      let beds = 0;
      for (const f of d.furniture) {
        if (f.damaged || !f.slotKind.includes('bed')) continue;
        const eff = FURNITURE_EFFECTS[f.defId];
        beds += eff?.kind === 'bed_slots' ? eff.value : 1;
      }
      return beds;
    };
    const dorms = next.rooms.filter(
      r => r.state === 'built' && !isRoomUnfinished(r) && (r.defId === 'dormitory' || r.defId === 'grand_dormitory')
    );
    const dormIds = new Set(dorms.map(d => d.id));
    let totalBeds = 0;
    for (const d of dorms) totalBeds += dormBedCount(d);
    const occupiedDormBeds = next.characters.filter(
      c => c.bedRoomId != null && dormIds.has(c.bedRoomId)
    ).length;
    const currentStudents = next.characters.filter(c => c.status === 'student');
    if (Math.max(currentStudents.length, occupiedDormBeds) >= totalBeds) {
      return { state, success: false, error: 'No free student beds available. Build more Dormitories.' };
    }

    const preSchedule = buildAcademySchedule(next);
    const totalSeats = preSchedule.schoolCapacity[school] || 0;
    const studentsInSchool = preSchedule.schoolEnrolled[school] || 0;
    if (studentsInSchool >= totalSeats) {
      return { state, success: false, error: `No free seats in ${school.toUpperCase()} classroom. Build another.` };
    }

    // Deduct mana
    next.mana -= 60;

    // Pick youngest cards (honoring avoidSiblings + deckScope)
    const chosenCards = pickFreeYoungCards(next, 30, needed).map(c => c.id);

    const charId = uniqueNumericId([
      ...next.characters.map(c => c.id),
      ...next.alumniGallery.map(a => a.id)
    ]);
    const setId = uniqueNumericId([...next.cardSets.map(s => s.id), charId]);

    const newSet: CardSet = {
      id: setId,
      characterId: charId,
      kind: 'study',
      school,
      size: needed,
      createdDay: next.day,
      released: false,
      cardIds: chosenCards
    };
    next.cardSets.push(newSet);

    const newStudent: Character = {
      id: charId,
      name,
      pronouns: 'they/them',
      appearance: {
        skin: '#f5d0b5',
        hair: 'short',
        hairColor: '#4a3728',
        robeColor: school === 'arcane' ? '#6B4FBB' : school === 'nature' ? '#4E8B3A' : school === 'light' ? '#E8C547' : school === 'shadow' ? '#2F3A73' : '#B5651D',
        hat: 'novice_cap'
      },
      personality,
      traits,
      status: 'student',
      currentSchool: school,
      masteredSchools: [],
      needs: { hunger: 90, rest: 90, leisure: 80, composure: 90, health: 100 },
      morale: 88,
      readyDays: {},
      enrolledDay: next.day,
      chronicle: [{ day: next.day, text: `Enrolled in the School of ${school.toUpperCase()}.` }],
      studySetId: setId,
      careerSetIds: []
    };

    // Auto-assign first finished dorm with a free bed
    const freeDorm = dorms.find(
      d => next.characters.filter(s => s.bedRoomId === d.id).length < dormBedCount(d)
    ) || dorms[0];
    if (freeDorm) newStudent.bedRoomId = freeDorm.id;

    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];
    next.characters.push(newStudent);
    AnkicasterEngine.syncWorkplaces(next);
    next.notices.push({
      id: uniqueNoticeId(`enr-${charId}`, next),
      time: Date.now(),
      type: 'enrollment',
      text: `${name} enrolled in ${school.toUpperCase()} with ${needed} flashcards linked!`,
      data: {
        roomId: newStudent.seatRoomId ?? ehRoom?.id,
        characterIds: [charId],
        school,
        visualEventType: 'student_enrolled'
      }
    });

    return { state: next, success: true };
  }

  /**
   * Launch a Rift Expedition (BR-27, BR-31, BR-32, BR-33, Section 27)
   */
  static launchRiftExpedition(
    state: FullGameState,
    destinationId: string,
    teamIds: number[],
    suppliesTaken: string[] = [],
    companionId?: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);

    // Rule BR-27: The Rift is locked until at least 3 masters (active or alumni)
    const totalMasters = next.characters.filter(c => c.masteredSchools.length > 0).length + next.alumniGallery.length;
    if (totalMasters < 3) {
      return {
        state,
        success: false,
        error: `The Rift is sealed! Requires at least 3 Masters of Magic (${totalMasters}/3 graduated).`
      };
    }

    const dest = RIFT_DESTINATIONS[destinationId];
    if (!dest) return { state, success: false, error: 'Invalid destination' };

    if (teamIds.length === 0 || teamIds.length > 3 || new Set(teamIds).size !== teamIds.length) {
      return { state, success: false, error: 'Teams must consist of 1 to 3 distinct adventurers.' };
    }
    for (const hId of teamIds) {
      const hero = next.characters.find(c => c.id === hId);
      if (!hero) return { state, success: false, error: 'Selected adventurer not found.' };
      if (hero.status === 'away') return { state, success: false, error: `${hero.name} is already away on an expedition.` };
      if (hero.status === 'student') return { state, success: false, error: `${hero.name} is still a student and cannot join expeditions.` };
      if (hero.status === 'faculty' || hero.careerState === 'sabbatical' || hero.career !== 'adventurer') {
        return { state, success: false, error: `${hero.name} must be an active Adventurer to join an expedition.` };
      }
      if (hero.injury) return { state, success: false, error: `${hero.name} is injured and must recover first.` };
    }

    const sb = computeSpellbookBonuses(next.spellbooks || []);
    const alum = computeAlumniBonuses(next.alumniGallery || []);
    const maxSupplies = 1 + academyFurnitureEffect(next.rooms, 'rift_supply_slots') + sb.supplySlotBonus;
    if (suppliesTaken.length > maxSupplies) {
      return { state, success: false, error: `Can only carry up to ${maxSupplies} supply item(s).` };
    }
    const riftMapCount = suppliesTaken.filter(s => s === 'rift_map').length;
    if (riftMapCount > 1) {
      return { state, success: false, error: 'At most 1 Rift Map can be brought per expedition.' };
    }
    if (riftMapCount > 0 && (next.scrolls?.rift_map || 0) < riftMapCount) {
      return { state, success: false, error: 'No Rift Map scrolls in inventory.' };
    }

    let companionBonus = 0;
    let selectedComp: (typeof next.creatures)[number] | undefined;
    if (companionId !== undefined) {
      const comp = next.creatures.find(c => c.id === companionId);
      if (!comp || comp.status !== 'tamed') {
        return { state, success: false, error: 'Selected creature companion is not available.' };
      }
      if (comp.tiredUntilBell !== undefined && comp.tiredUntilBell > next.bellIndex) {
        return {
          state,
          success: false,
          error: `${comp.nickname} is resting from a recent expedition (${comp.tiredUntilBell - next.bellIndex} bell(s) left).`
        };
      }
      selectedComp = comp;
      companionBonus = CREATURE_DEFINITIONS[comp.defId]?.companionBonus ?? 1;
    }

    if (next.mana < dest.cost) {
      return { state, success: false, error: `Need ${dest.cost} Mana to stabilize the Rift portal.` };
    }

    const provisionsNeeded = dest.supplies * teamIds.length;
    if (next.resources.provisions < provisionsNeeded) {
      return { state, success: false, error: `Need ${provisionsNeeded} Provisions for expedition supplies.` };
    }

    // Calculate team average adventurer career card intervals (BR-31)
    let totalCardsIvl = 0;
    let cardCount = 0;
    for (const heroId of teamIds) {
      const hero = next.characters.find(c => c.id === heroId);
      if (hero && hero.careerSetIds.length > 0) {
        const cSet = next.cardSets.find(s => s.id === hero.careerSetIds[0]);
        if (cSet) {
          for (const cid of cSet.cardIds) {
            totalCardsIvl += next.allCards[cid]?.honestIvl || 0;
            cardCount++;
          }
        }
      }
    }
    const rawPartySkillDays = cardCount > 0 ? totalCardsIvl / cardCount : 0;
    const hasSocialTrio = teamIds.length === 3 && teamIds.some(id => next.characters.find(c => c.id === id)?.personality === 'Social');
    const partySkillDays = rawPartySkillDays + (hasSocialTrio ? 2 : 0);

    let traitFortune = 0;
    for (const hId of teamIds) {
      const hero = next.characters.find(c => c.id === hId);
      if (!hero) continue;
      if (hero.personality === 'Bold') traitFortune += 1;
      if (hero.personality === 'Bookish' && destinationId === 'crystal_caverns') traitFortune += 1;
      if (hero.personality === 'Mischievous' && destinationId === 'shattered_spire') traitFortune += 1;
      if (hero.personality === 'Dreamy' && destinationId === 'whispering_fen') traitFortune += 1;
      if (hero.personality === 'Curious' && (destinationId === 'mossy_hollow' || destinationId === 'ashen_wastes')) traitFortune += 1;
      if (hasTrait(hero, 'Brave')) traitFortune += 1;
      if (hasTrait(hero, 'Nervous')) traitFortune -= 1;
      if (hasTrait(hero, 'Daredevil')) traitFortune += 1;
      if (hasTrait(hero, 'Show-off')) {
        if (teamIds.length === 3) traitFortune += 1;
        else if (teamIds.length === 1) traitFortune -= 1;
      }
      if (hero.hexDuelFortuneBonus) {
        traitFortune += hero.hexDuelFortuneBonus;
        hero.hexDuelFortuneBonus = undefined;
      }
    }

    let hasElixir = suppliesTaken.includes('rift_elixir');
    if (!hasElixir && (next.activeBuffs?.riftElixirCharges || 0) > 0) {
      hasElixir = true;
      next.activeBuffs!.riftElixirCharges! -= 1;
    }
    let hasRiftMap = suppliesTaken.includes('rift_map');
    if (!hasRiftMap && next.activeBuffs?.riftMapPending) {
      hasRiftMap = true;
      next.activeBuffs.riftMapPending = false;
    }
    const riftMapFortune = hasRiftMap ? 2 : 0;
    const isVeilThin = next.veil.strength < 50;

    const { chance } = calculateRiftChance(dest, partySkillDays, teamIds.length, hasElixir, isVeilThin);

    // Consume costs
    next.mana -= dest.cost;
    const beforeRes = resourceSnapshot(next);
    next.resources.provisions -= provisionsNeeded;
    for (const s of suppliesTaken) {
      if (s === 'rift_map') {
        if (next.scrolls?.rift_map) next.scrolls.rift_map = Math.max(0, next.scrolls.rift_map - 1);
      } else if (next.resources.potions[s]) {
        next.resources.potions[s] = Math.max(0, next.resources.potions[s] - 1);
      }
    }
    logResourceDiff(next, beforeRes, `Expedition to ${dest.name}`);

    // Seeded outcome rolled at launch (Section 27.6)
    const roll = Math.floor(Math.random() * 100) + 1;
    const wrongRoll = Math.floor(Math.random() * 100) + 1;

    // Set heroes & companion status to away
    for (const hId of teamIds) {
      const hero = next.characters.find(c => c.id === hId);
      if (hero) hero.status = 'away';
    }
    if (companionId !== undefined) {
      const comp = next.creatures.find(c => c.id === companionId);
      if (comp) comp.status = 'away';
    }

    const beaconBonus = next.activeBuffs?.riftBeaconActive ? 3 : 0;
    const tremorPenalty = next.rooms.some(r => r.defId === 'rift_gate' && r.state === 'built' && r.hazard?.type === 'rift_tremor') ? -1 : 0;
    const creatureFortuneBonus =
      (creatureSpeciesBuffSum(next, 'orrery_moth') > 0 ? 1 : 0) +
      (creatureSpeciesBuffSum(next, 'star_heron') > 0 ? 1 : 0);
    const trainingYardFortune = next.rooms
      .filter(r => r.defId === 'training_yard' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(next, r))
      .reduce((sum, r) => sum + Math.min(3, r.level || 1), 0);
    const roomFortune =
      trainingYardFortune +
      (next.rooms.some(r => r.defId === 'observatory' && r.state === 'built' && !isRoomUnfinished(r)) ? 1 : 0) +
      tremorPenalty;
    let requiredReviews = next.activeBuffs?.riftBeaconActive
      ? Math.max(1, Math.round(dest.reviews * 0.75))
      : dest.reviews;
    if (selectedComp && selectedComp.defId === 'dawnhart_gryphon') {
      const gryphonSpeed = Math.min(0.4, 0.15 * bondBuffMultiplier(selectedComp.bondLevel) * (selectedComp.hungry ? 0.5 : 1));
      requiredReviews = Math.max(1, Math.round(requiredReviews * (1 - gryphonSpeed)));
    }
    if (next.activeBuffs?.riftBeaconActive) {
      next.activeBuffs.riftBeaconActive = false;
    }

    const expeditionId = uniqueNumericId(next.expeditions.map(e => e.id));
    const expedition: ActiveExpedition = {
      id: expeditionId,
      destinationId,
      teamIds,
      companionId,
      suppliesTaken,
      partySkillDays,
      chance,
      fortune: Math.max(
        0,
        1 + academyFurnitureEffect(next.rooms, 'rift_fortune') + beaconBonus + roomFortune + creatureFortuneBonus + companionBonus + traitFortune + riftMapFortune + sb.riftFortuneBonus + alum.adventurerFortune
      ),
      roll,
      wrongRoll,
      requiredReviews,
      progressReviews: 0,
      state: 'active'
    };

    const riftRoom = next.rooms.find(r => r.defId === 'rift_gate' && r.state === 'built')
      || next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built')
      || next.rooms[0];

    next.expeditions.push(expedition);
    next.notices.push({
      id: uniqueNoticeId(`rift-launch-${expedition.id}`, next),
      time: Date.now(),
      type: 'expedition',
      text: `Party stepped through the Rift towards ${dest.name}! (${requiredReviews} reviews to return)`,
      data: {
        roomId: riftRoom?.id,
        characterIds: [...teamIds],
        creatureId: companionId,
        visualEventType: 'expedition_launch'
      }
    });

    return { state: next, success: true };
  }

  /**
   * Resolving expedition when review countdown finishes (All 5 Destinations Covered)
   */
  static resolveExpedition(state: FullGameState, exp: ActiveExpedition, notifications: string[]) {
    const beforeRes = resourceSnapshot(state);
    const dest = RIFT_DESTINATIONS[exp.destinationId];
    exp.state = 'returned';

    // Unflag away
    for (const hId of exp.teamIds) {
      const hero = state.characters.find(c => c.id === hId);
      if (hero) hero.status = 'resident';
    }
    let returnedComp: (typeof state.creatures)[number] | undefined;
    if (exp.companionId !== undefined) {
      const comp = state.creatures.find(c => c.id === exp.companionId);
      if (comp) {
        if (comp.status === 'away') comp.status = 'tamed';
        returnedComp = comp;
      }
    }

    const loot: string[] = [];
    const fortuneBonus = Math.max(0, (exp.fortune || 1) - 1);

    const grantDestinationLoot = (factor: 1 | 0.5) => {
      const amt = (n: number) => Math.max(1, Math.round(n * factor));
      const suffix = factor < 1 ? ' (Half Loot)' : '';
      if (dest?.id === 'mossy_hollow') {
        const timber = amt(40);
        const herbs = amt(20);
        state.resources.timber += timber;
        state.resources.herbs += herbs;
        loot.push(`${timber} Timber${suffix}`, `${herbs} Herbs${suffix}`);
        if (factor === 1 && Math.random() < 0.4 && !state.resources.seedsUnlocked.includes('glimmerberry')) {
          state.resources.seedsUnlocked.push('glimmerberry');
          loot.push('Glimmerberry Seeds');
        }
      } else if (dest?.id === 'whispering_fen') {
        const herbs = amt(40);
        const moonsilk = amt(2);
        state.resources.herbs += herbs;
        state.resources.moonsilk += moonsilk;
        loot.push(`${herbs} Herbs${suffix}`, `${moonsilk} Moonsilk${suffix}`);
        if (factor === 1 && Math.random() < 0.3 && !state.resources.seedsUnlocked.includes('lumen_lily')) {
          state.resources.seedsUnlocked.push('lumen_lily');
          loot.push('Lumen Lily Seeds');
        }
      } else if (dest?.id === 'crystal_caverns') {
        const crystal = amt(5);
        const stone = amt(50);
        const cores = amt(1);
        const starmetal = amt(1);
        state.resources.crystal += crystal;
        state.resources.stone += stone;
        state.resources.golem_core += cores;
        state.resources.starmetal += starmetal;
        loot.push(`${crystal} Crystal${suffix}`, `${stone} Stone${suffix}`, `${cores} Golem Core${suffix}`, `${starmetal} Starmetal${suffix}`);
        if (factor === 1 && Math.random() < 0.25 && !state.resources.seedsUnlocked.includes('starfruit')) {
          state.resources.seedsUnlocked.push('starfruit');
          loot.push('Starfruit Seeds');
        }
      } else if (dest?.id === 'ashen_wastes') {
        const emberSalt = amt(3);
        const sunstone = amt(2);
        const voidPearl = amt(1);
        const phoenixAsh = amt(1);
        state.resources.ember_salt += emberSalt;
        state.resources.sunstone += sunstone;
        state.resources.void_pearl += voidPearl;
        state.resources.phoenix_ash += phoenixAsh;
        loot.push(`${emberSalt} Ember Salt${suffix}`, `${sunstone} Sunstone${suffix}`, `${voidPearl} Void Pearl${suffix}`, `${phoenixAsh} Phoenix Ash${suffix}`);
        if (factor === 1 && Math.random() < 0.3 && !state.resources.seedsUnlocked.includes('heartwood_sapling')) {
          state.resources.seedsUnlocked.push('heartwood_sapling');
          loot.push('Heartwood Sapling Seeds');
        }
      } else if (dest?.id === 'shattered_spire') {
        const starmetal = amt(4);
        const voidPearl = amt(3);
        const phoenixAsh = amt(2);
        const renownGain = amt(15);
        state.resources.starmetal += starmetal;
        state.resources.void_pearl += voidPearl;
        state.resources.phoenix_ash += phoenixAsh;
        state.renown += renownGain;
        loot.push(`${starmetal} Starmetal${suffix}`, `${voidPearl} Void Pearl${suffix}`, `${phoenixAsh} Phoenix Ash${suffix}`, `+${renownGain} Renown${suffix}`);
        if (factor === 1 && Math.random() < 0.3 && !state.resources.seedsUnlocked.includes('heartwood_sapling')) {
          state.resources.seedsUnlocked.push('heartwood_sapling');
          loot.push('Heartwood Sapling Seeds');
        }
      } else {
        const crystal = amt(3);
        const herbs = amt(30);
        state.resources.crystal += crystal;
        state.resources.herbs += herbs;
        loot.push(`${crystal} Crystal${suffix}`, `${herbs} Herbs${suffix}`);
      }
    };

    if (exp.roll <= exp.chance) {
      // Safe Return (Full Rewards)
      exp.outcome = 'safe';
      notifications.push(`🏆 Safe Return from ${dest.name}! Party returned triumphant without a scratch.`);
      grantDestinationLoot(1);

      const hasLuckyHero = exp.teamIds.some(id => hasTrait(state.characters.find(c => c.id === id), 'Lucky'));
      if (hasLuckyHero) {
        const extraCrystal = 2;
        const extraHerbs = 10;
        state.resources.crystal += extraCrystal;
        state.resources.herbs += extraHerbs;
        loot.push(`+${extraCrystal} Crystal, +${extraHerbs} Herbs (Lucky Roll)`);
      }

      if (fortuneBonus > 0) {
        const extraHerbs = fortuneBonus * 5;
        state.resources.herbs += extraHerbs;
        loot.push(`+${extraHerbs} Herbs (Fortune)`);
      }
      const plinthRenown = academyFurnitureEffect(state.rooms, 'renown_bonus');
      if (plinthRenown > 0) {
        state.renown += plinthRenown;
        loot.push(`+${plinthRenown} Renown (Artifact Plinth)`);
      }
    } else {
      // Something went wrong (BR-33)
      const wrongTable = dest.band === 'low'
        ? [
            { id: 'minor_injury', pct: 60, full: true },
            { id: 'serious_injury', pct: 25, full: false },
            { id: 'curse', pct: 10, full: false },
            { id: 'retreat', pct: 5, full: false }
          ]
        : [
            { id: 'minor_injury', pct: 40, full: true },
            { id: 'serious_injury', pct: 30, full: false },
            { id: 'curse', pct: 20, full: false },
            { id: 'retreat', pct: 10, full: false }
          ];

      const effectiveWrongRoll = Math.max(1, exp.wrongRoll - fortuneBonus * 5);
      let cum = 0;
      let chosenOutcome = 'minor_injury';
      for (const row of wrongTable) {
        cum += row.pct;
        if (effectiveWrongRoll <= cum) {
          chosenOutcome = row.id;
          break;
        }
      }

      exp.outcome = chosenOutcome as any;
      const injuredHeroId = exp.teamIds[Math.floor(Math.random() * exp.teamIds.length)];
      const injuredHero = state.characters.find(c => c.id === injuredHeroId);

      let hasCourage = exp.suppliesTaken.includes('courage_draught');
      if (!hasCourage && (state.activeBuffs?.courageDraughtCharges || 0) > 0) {
        hasCourage = true;
        state.activeBuffs!.courageDraughtCharges! -= 1;
      }
      const recoveryMult = hasCourage ? 0.5 : 1;

      if (chosenOutcome === 'minor_injury') {
        notifications.push(`⚠️ Expedition to ${dest.name}: ${injuredHero?.name} suffered minor bruises, but brought back full loot!`);
        if (injuredHero) injuredHero.injury = { type: 'bruised', points: 0, required: Math.round(30 * recoveryMult) };
        exp.injuredHeroId = injuredHero?.id;
        exp.injuryApplied = injuredHero?.injury?.type;
        grantDestinationLoot(1);
      } else if (chosenOutcome === 'serious_injury') {
        notifications.push(`🚨 Serious Injury! ${injuredHero?.name} suffered a sprain/fracture. Half loot returned.`);
        if (injuredHero) injuredHero.injury = { type: 'sprained', points: 0, required: Math.round(80 * recoveryMult) };
        exp.injuredHeroId = injuredHero?.id;
        exp.injuryApplied = injuredHero?.injury?.type;
        grantDestinationLoot(0.5);
      } else if (chosenOutcome === 'curse') {
        if (injuredHero && hasTrait(injuredHero, 'Warded')) {
          notifications.push(`🛡️ Warded trait shielded ${injuredHero.name} from the Rift curse!`);
          loot.push('Warded Curse Immunity (Curio relic fragments)');
        } else {
          notifications.push(`🔮 Curse of the Rift! ${injuredHero?.name} was hexed by otherworldly energies.`);
          if (injuredHero) injuredHero.injury = { type: 'hexed', points: 0, required: Math.round(120 * recoveryMult) };
          exp.injuredHeroId = injuredHero?.id;
          exp.injuryApplied = injuredHero?.injury?.type;
          loot.push('Curio relic fragments');
        }
      } else {
        notifications.push(`🏃 Party was forced to retreat empty-handed from ${dest.name}!`);
      }
    }

    const outcomeHeadline = notifications[notifications.length - 1] || `Expedition returned from ${dest?.name || 'the Rift'}.`;

    // Phase Ferret: full-loot expeditions gain +1 extra loot roll (scaled)
    if ((exp.outcome === 'safe' || exp.outcome === 'minor_injury') && creatureSpeciesBuffSum(state, 'phase_ferret') > 0) {
      const ferretRolls = Math.max(1, Math.round(creatureSpeciesBuffSum(state, 'phase_ferret')));
      for (let i = 0; i < ferretRolls; i++) {
        grantDestinationLoot(0.5);
      }
      notifications.push(`🐾 Phase Ferret salvaged +${ferretRolls} bonus loot roll(s)!`);
    }

    // Atlas of the Unmapped: full-loot expeditions gain +1 bonus loot cache
    const sbExp = computeSpellbookBonuses(state.spellbooks || []);
    if ((exp.outcome === 'safe' || exp.outcome === 'minor_injury') && sbExp.extraFullRewardLootRoll > 0) {
      grantDestinationLoot(0.5);
      loot.push('Atlas of the Unmapped bonus loot roll');
      notifications.push('🗺️ Atlas of the Unmapped uncovered an extra loot cache!');
    }
    checkEndlessSpellbookMilestones(state);

    // Ember Phoenix companion heals worst Rift/Academy injury on return
    if (returnedComp && returnedComp.defId === 'ember_phoenix') {
      const INJURY_SEVERITY: Record<string, number> = {
        broken_bone: 5,
        hexed: 4,
        sprained: 3,
        rift_touched: 2,
        bruised: 1
      };
      const injuredRoster = [
        ...state.characters.filter(c => exp.teamIds.includes(c.id) && !!c.injury),
        ...state.characters.filter(c => !exp.teamIds.includes(c.id) && !!c.injury)
      ].sort((a, b) => (INJURY_SEVERITY[b.injury?.type || 'bruised'] || 0) - (INJURY_SEVERITY[a.injury?.type || 'bruised'] || 0));
      const phoenixPatient = injuredRoster[0];
      if (phoenixPatient && phoenixPatient.injury) {
        const injType = phoenixPatient.injury.type;
        phoenixPatient.injury = undefined;
        phoenixPatient.needs.health = 100;
        notifications.push(`🔥 Companion Ember Phoenix healed ${phoenixPatient.name}'s ${injType.replace('_', ' ')} on return!`);
      }
    }

    // Companion returning from any non-safe expedition rests 10 bells before buffs resume (§27.11)
    if (returnedComp && exp.outcome && exp.outcome !== 'safe') {
      returnedComp.tiredUntilBell = state.bellIndex + 10;
      notifications.push(`💤 ${returnedComp.nickname} returned tired (buffs & expeditions paused for 10 bells).`);
    }

    exp.lootSummary = loot;
    const riftRoom = state.rooms.find(r => r.defId === 'rift_gate' && r.state === 'built')
      || state.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built')
      || state.rooms[0];
    state.notices.push({
      id: uniqueNoticeId(`rift-return-${exp.id}`, state),
      time: Date.now(),
      type: `expedition_${exp.outcome || 'safe'}`,
      text: outcomeHeadline,
      data: {
        roomId: riftRoom?.id,
        characterIds: [...exp.teamIds],
        creatureId: exp.companionId,
        outcome: exp.outcome || 'safe',
        visualEventType: `expedition_${exp.outcome || 'safe'}`
      }
    });
    logResourceDiff(state, beforeRes, `Expedition to ${dest.name}`);
  }

  /**
   * Place a room (GDD 15.3 P1-P7, 15.4). With targetX/targetY the spot is validated exactly;
   * without them auto-placement finds the first free valid spot (or reports there is no space).
   * The engine is authoritative: overlap, bounds, support, sky, floor rules and per-room limits
   * are enforced here for both manual and auto placement.
   */
  static placeRoom(
    state: FullGameState,
    defId: string,
    area?: 'castle' | 'grounds',
    targetX?: number,
    targetY?: number
  ): { state: FullGameState; success: boolean; error?: string; roomId?: number; warnings?: string[] } {
    const def = ROOM_DEFINITIONS[defId];
    if (!def) return { state, success: false, error: 'Unknown room definition.' };
    if (!isRoomUnlocked(state, defId)) {
      return { state, success: false, error: `No plan. ${planHint(defId)}.` };
    }
    const placeArea = area ?? def.area;

    // Per-room limits (content maxCount; sites and shelved rooms count)
    const limit = roomLimitStatus(state.rooms, defId, undefined, state.shelvedRooms || []);
    if (limit.capped) return { state, success: false, error: `${limit.reason}.` };

    // Materials only. Mana is not a build cost.
    const charge = placementCharge(defId, state);
    for (const k of BUILD_MATERIALS) {
      const need = (charge as unknown as Record<string, number>)[k] || 0;
      const have = (state.resources as unknown as Record<string, number>)[k] || 0;
      if (need > have) {
        return { state, success: false, error: `Need ${need} ${k} (have ${have}).` };
      }
    }

    // Determine grid placement
    let x: number;
    let y: number;
    let warnings: string[] = [];
    if (targetX === undefined || (placeArea === 'castle' && targetY === undefined)) {
      const spot = findAutoPlacement(state, defId);
      if (!spot || spot.area !== placeArea) {
        return { state, success: false, error: `No free valid space for ${def.name}. Move or demolish something, or build support first.` };
      }
      x = spot.x;
      y = spot.y;
      warnings = spot.warnings;
    } else {
      x = targetX;
      y = placeArea === 'grounds' ? 0 : (targetY as number);
      const check = validatePlacement(state, defId, placeArea, x, y);
      if (!check.valid) return { state, success: false, error: `Can't place ${def.name} there: ${check.errors[0]}.` };
      warnings = check.warnings;
    }

    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    for (const k of BUILD_MATERIALS) {
      const n = (charge as unknown as Record<string, number>)[k] || 0;
      if (n) (next.resources as unknown as Record<string, number>)[k] -= n;
    }
    logResourceDiff(next, beforeRes, `Built ${def.name}`);

    const roomId = uniqueNumericId([
      ...next.rooms.map(r => r.id),
      ...(next.shelvedRooms || []).map(r => r.id)
    ]);
    const buildReq = discountedBuildReviews(def.buildReviews, next);
    const isInstant = buildReq === 0;

    const newRoom: PlacedRoom = {
      id: roomId,
      defId,
      x,
      y,
      w: def.size[0],
      h: def.size[1],
      area: placeArea,
      level: 1,
      state: isInstant ? 'built' : 'site',
      buildRequired: buildReq,
      buildProgress: 0,
      buildPaused: false,
      cleanliness: 100,
      settings: {},
      furniture: [],
      spent: charge,
      fromPlan: !isStructure(defId) && defId !== 'entrance_hall' && defId !== 'wizard_study'
    };

    // Auto-place required starter furniture if built instantly (sites finish with it empty, GDD 15.4)
    if (isInstant && def.requiredFurniture) {
      fillRequiredFixtures(newRoom, allFurnitureIds([...next.rooms, ...(next.shelvedRooms || [])]));
      const allWithNew = [...next.rooms, newRoom];
      for (const f of newRoom.furniture) {
        const drop = findFirstValidFurnitureDrop(newRoom, allWithNew, f.defId);
        if (drop) {
          f.x = drop.x;
          f.floor = drop.floor;
          f.plane = drop.plane;
          if (drop.wallY !== undefined) f.wallY = drop.wallY;
        } else {
          f.x = Math.round((newRoom.w * 64) / 2);
          f.floor = 0;
          f.plane = piecePlane(f.defId);
        }
      }
    }

    if (newRoom.fromPlan) {
      next.roomPlans = { ...(next.roomPlans || {}) };
      next.roomPlans[defId] = (next.roomPlans[defId] || 0) - 1;
    }

    next.rooms.push(newRoom);
    AnkicasterEngine.syncWorkplaces(next);
    next.notices.push({
      id: uniqueNoticeId(`room-built-${roomId}`, next),
      time: Date.now(),
      type: 'construction',
      text: isInstant
        ? `Built ${def.name} on ${placeArea === 'castle' ? `Floor ${y}` : 'Sacred Grounds'}!`
        : `Construction site placed for ${def.name} (${buildReq} reviews to complete).`,
      data: { roomId }
    });

    return { state: next, success: true, roomId, warnings };
  }

  /** Why a room can't be moved, shelved, or demolished right now (undefined = allowed). */
  static roomActionBlock(state: FullGameState, roomId: number, action: 'move' | 'demolish' | 'shelve'): string | undefined {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return 'Room not found.';
    const def = ROOM_DEFINITIONS[room.defId];
    if (room.hazard) return `Dispel the ${room.hazard.name || 'hazard'} first`;
    if (action === 'demolish' && def?.noDemolish && countRoomsOfType(state.rooms, room.defId, room.id) === 0) {
      return `The ${def.name} can't be demolished`;
    }
    if (action === 'shelve') {
      const after = state.rooms.filter(r => r.id !== roomId);
      const unsupported = newlyUnsupportedRooms(state.rooms, after);
      if (unsupported.length) return `${roomDisplayName(unsupported[0])} above needs it for support`;
    }
    if (action === 'demolish') {
      const after = state.rooms.filter(r => r.id !== roomId);
      const unsupported = newlyUnsupportedRooms(state.rooms, after);
      if (unsupported.length) return `${roomDisplayName(unsupported[0])} above needs it for support`;
      const cut = newlyCutOffRooms(state.rooms, after);
      if (cut.length) return `It would cut ${roomDisplayName(cut[0])} off from the Entrance Hall`;
    }
    return undefined;
  }

  /** Validate moving a room to (x, y): same rules as placement, nothing may lose support; cut-offs & unstacked stairs warn instead of blocking. */
  static validateMove(state: FullGameState, roomId: number, x: number, y: number): PlacementCheck {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return { valid: false, errors: ['Room not found.'], warnings: [] };
    const block = AnkicasterEngine.roomActionBlock(state, roomId, 'move');
    if (block) return { valid: false, errors: [block], warnings: [] };
    const ny = room.area === 'grounds' ? 0 : y;
    if (room.x === x && room.y === ny) return { valid: false, errors: ['Already here'], warnings: [] };
    const check = validatePlacement(state, room.defId, room.area, x, ny, roomId, room.level || 1);
    if (!check.valid) return check;
    const after = state.rooms.map(r => (r.id === roomId ? { ...r, x, y: ny } : r));
    const unsupported = newlyUnsupportedRooms(state.rooms, after);
    if (unsupported.length) {
      return { valid: false, errors: [`${roomDisplayName(unsupported[0])} above needs it for support`], warnings: [] };
    }
    const warnings = [...check.warnings];
    const cut = newlyCutOffRooms(state.rooms, after).filter(r => r.id !== roomId);
    if (cut.length) {
      const names = cut.map(r => roomDisplayName(r)).join(', ');
      warnings.push(`Cuts off ${names}: Unreachable, runs at 0% until linked.`);
    }
    warnings.push(...stairMoveWarnings(state.rooms, after, room));
    return { valid: true, errors: [], warnings };
  }

  /**
   * Move a built room or construction site. Keeps id, level, furniture, progress, cleanliness,
   * occupants and everything else; only the position changes. Free (GDD has no move cost).
   */
  static moveRoom(
    state: FullGameState,
    roomId: number,
    x: number,
    y: number
  ): { state: FullGameState; success: boolean; error?: string; warnings?: string[] } {
    const check = AnkicasterEngine.validateMove(state, roomId, x, y);
    if (!check.valid) return { state, success: false, error: check.errors[0] };
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId)!;
    room.x = x;
    room.y = room.area === 'grounds' ? 0 : y;
    next.notices.push({
      id: uniqueNoticeId(`move-${roomId}`, next),
      time: Date.now(),
      type: 'construction',
      text: `Moved ${roomDisplayName(room)} to ${room.area === 'castle' ? `Floor ${room.y}, column ${room.x}` : `plot ${room.x}`}.`,
      data: { roomId }
    });
    return { state: next, success: true, warnings: check.warnings };
  }

  /** Pick up a built room or construction site onto the Build mode shelf (no refund; preserves state & occupants). */
  static shelveRoom(
    state: FullGameState,
    roomId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const block = AnkicasterEngine.roomActionBlock(state, roomId, 'shelve');
    if (block) return { state, success: false, error: block };

    const next = structuredClone(state);
    const idx = next.rooms.findIndex(r => r.id === roomId);
    if (idx === -1) return { state, success: false, error: 'Room not found.' };
    const room = next.rooms[idx];

    // Anchor auto-resolved non-roaming pen creatures to this room before lifting it off the map
    const penOccupants = getPenOccupants({ creatures: next.creatures, rooms: next.rooms }, room);
    for (const occ of penOccupants) {
      occ.roomId = room.id;
    }

    next.rooms.splice(idx, 1);
    next.shelvedRooms = [...(next.shelvedRooms || []), room];
    AnkicasterEngine.syncWorkplaces(next);
    return { state: next, success: true };
  }

  /** Validate placing a room back from the Build mode shelf at (x, y). */
  static validateShelvedDrop(state: FullGameState, roomId: number, x: number, y: number): PlacementCheck {
    const room = (state.shelvedRooms || []).find(r => r.id === roomId);
    if (!room) return { valid: false, errors: ['Room not on shelf.'], warnings: [] };
    const ny = room.area === 'grounds' ? 0 : y;
    return validatePlacement(state, room.defId, room.area, x, ny, roomId, room.level || 1);
  }

  /** Place a room from the Build mode shelf back onto the castle or grounds. */
  static placeShelvedRoom(
    state: FullGameState,
    roomId: number,
    x: number,
    y: number
  ): { state: FullGameState; success: boolean; error?: string; warnings?: string[] } {
    const check = AnkicasterEngine.validateShelvedDrop(state, roomId, x, y);
    if (!check.valid) return { state, success: false, error: check.errors[0] };

    const next = structuredClone(state);
    const shelf = next.shelvedRooms || [];
    const idx = shelf.findIndex(r => r.id === roomId);
    if (idx === -1) return { state, success: false, error: 'Room not on shelf.' };
    const [room] = shelf.splice(idx, 1);
    next.shelvedRooms = shelf;
    room.x = x;
    room.y = room.area === 'grounds' ? 0 : y;
    next.rooms.push(room);
    AnkicasterEngine.syncWorkplaces(next);
    next.notices.push({
      id: uniqueNoticeId(`unshelve-${roomId}`, next),
      time: Date.now(),
      type: 'construction',
      text: `Placed ${roomDisplayName(room)} at ${room.area === 'castle' ? `Floor ${room.y}, column ${room.x}` : `plot ${room.x}`}.`,
      data: { roomId }
    });
    return { state: next, success: true, warnings: check.warnings };
  }

  /**
   * Called when leaving Build mode. Any non-roaming wary/tamed creatures whose pen is still on
   * the shelf break loose into the academy and trigger recapture.
   */
  static closeBuildMode(state: FullGameState): { state: FullGameState; releasedCount: number } {
    const shelvedPens = (state.shelvedRooms || []).filter(r => penAcceptedHabitats(r.defId).length > 0);
    if (shelvedPens.length === 0) return { state, releasedCount: 0 };
    const penIds = new Set(shelvedPens.map(r => r.id));

    const next = structuredClone(state);
    const notifications: string[] = [];
    let releasedCount = 0;

    for (const c of next.creatures || []) {
      if (c.roomId === undefined || !penIds.has(c.roomId)) continue;
      if (c.status !== 'wary' && c.status !== 'tamed') continue;
      if (CREATURE_DEFINITIONS[c.defId]?.roamsFreely) continue;
      c.returnStatus = c.status;
      c.status = 'loose';
      c.roomId = undefined;
      startCapture(next, c, notifications);
      releasedCount += 1;
    }

    if (releasedCount === 0) return { state, releasedCount: 0 };
    return { state: next, releasedCount };
  }

  /** Preview of what demolishing returns (for the confirm dialog). */
  static demolishPreview(state: FullGameState, roomId: number) {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return undefined;
    const refund = demolishRefund(room);
    const occupants = state.characters.filter(c => c.bedRoomId === roomId || c.seatRoomId === roomId || c.workplaceRoomId === roomId).length
      + state.creatures.filter(c => c.roomId === roomId).length;
    const furniture = room.furniture.filter(f => FURNITURE_DEFINITIONS[f.defId] && !f.slotKind.startsWith('required:')).length;
    const renownLoss = Math.min(state.renown, room.renownGranted || 0);
    return { refund, occupants, furniture, renownLoss, blocked: AnkicasterEngine.roomActionBlock(state, roomId, 'demolish') };
  }

  /**
   * Pause or resume a construction site (GDD 15.4: "pause any time"; progress is kept forever).
   * The engine already skips paused sites when it advances construction; this only sets the flag.
   */
  static setConstructionPaused(
    state: FullGameState,
    roomId: number,
    paused: boolean
  ): { state: FullGameState; success: boolean; error?: string } {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    if (room.state !== 'site') return { state, success: false, error: 'Only construction sites can be paused.' };
    if (!!room.buildPaused === paused) return { state, success: true };
    const next = structuredClone(state);
    const r = next.rooms.find(x => x.id === roomId)!;
    r.buildPaused = paused;
    const name = ROOM_DEFINITIONS[r.defId]?.name || 'site';
    next.notices.push({
      id: uniqueNoticeId(`pause-${r.id}`, next),
      time: Date.now(),
      type: 'build',
      text: paused ? `Paused construction of ${name}. Progress is kept.` : `Resumed construction of ${name}.`,
      data: { roomId: r.id }
    });
    return { state: next, success: true };
  }

  /**
   * Demolish a room or cancel a construction site (GDD 15.4).
   * - Site with no progress (Cancel): 100% of the mana and materials paid.
   * - Otherwise: 50% of the materials paid (rounded down), 0% mana. Never more than was spent.
   * - Furniture goes to the furniture inventory; occupants are reassigned to a valid room of the
   *   same kind, or become "between rooms" (GDD 12.5).
   * - Renown granted by renovating this room is taken back, so build/renovate/demolish loops gain nothing.
   * - Blocked during a hazard in the room, for the last Entrance Hall / Wizard's Study, and when it
   *   would leave a room above unsupported or cut a room off from the Entrance Hall.
   */
  static demolishRoom(
    state: FullGameState,
    roomId: number
  ): { state: FullGameState; success: boolean; error?: string; refund?: ReturnType<typeof demolishRefund> } {
    const block = AnkicasterEngine.roomActionBlock(state, roomId, 'demolish');
    if (block) return { state, success: false, error: block };
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId)!;
    const roomName = roomDisplayName(room);
    const refund = demolishRefund(room);

    const beforeRes = resourceSnapshot(next);
    // A demolished vault stops counting toward the cap before the refund is added.
    next.rooms = next.rooms.filter(r => r.id !== roomId);
    next.mana += refund.mana;
    for (const k of BUILD_MATERIALS) {
      const n = (refund as unknown as Record<string, number>)[k] || 0;
      if (n) (next.resources as unknown as Record<string, number>)[k] = ((next.resources as unknown as Record<string, number>)[k] || 0) + n;
    }
    logResourceDiff(next, beforeRes, `${refund.cancel ? 'Cancelled' : 'Demolished'} ${roomName}`);

    // Furniture -> inventory (damaged items are lost rather than silently repaired)
    next.furnitureInventory = { ...(next.furnitureInventory || {}) };
    for (const f of [...room.furniture, ...(room.unplacedFurniture || [])]) {
      if (!FURNITURE_DEFINITIONS[f.defId] || f.slotKind.startsWith('required:') || f.damaged) continue; // required fixtures & damaged items refund nothing
      next.furnitureInventory[f.defId] = (next.furnitureInventory[f.defId] || 0) + 1;
    }

    // Undo renovation renown
    next.renown = Math.max(0, next.renown - (room.renownGranted || 0));

    if (room.fromPlan) {
      next.roomPlans = { ...(next.roomPlans || {}) };
      next.roomPlans[room.defId] = (next.roomPlans[room.defId] || 0) + 1;
    }

    // Occupants: same-kind finished room if one exists
    const bedKinds = ['dormitory', 'grand_dormitory', 'faculty_quarters'];
    const sameKind = (ids: string[]) =>
      next.rooms.find(r => r.state === 'built' && !isRoomUnfinished(r) && ids.includes(r.defId))
      || next.rooms.find(r => r.state === 'built' && ids.includes(r.defId));
    let moved = 0;
    for (const c of next.characters) {
      if (c.bedRoomId === roomId) {
        const kinds = c.status === 'student' ? ['dormitory', 'grand_dormitory'] : bedKinds.includes(room.defId) ? [room.defId, ...bedKinds] : bedKinds;
        c.bedRoomId = sameKind(kinds)?.id;
        moved++;
      }
      if (c.seatRoomId === roomId) { c.seatRoomId = sameKind([room.defId])?.id; moved++; }
      if (c.workplaceRoomId === roomId) { c.workplaceRoomId = undefined; moved++; }
    }
    for (const cr of next.creatures) {
      if (cr.roomId === roomId) { cr.roomId = sameKind([room.defId])?.id; moved++; }
    }
    AnkicasterEngine.syncWorkplaces(next);
    syncCharmRenown(next);

    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];
    const parts = BUILD_MATERIALS.filter(k => ((refund as unknown as Record<string, number>)[k] || 0) > 0).map(k => `${(refund as unknown as Record<string, number>)[k]} ${k}`);
    if (refund.mana > 0) parts.unshift(`${refund.mana} mana`);
    next.notices.push({
      id: uniqueNoticeId(`demolish-${roomId}`, next),
      time: Date.now(),
      type: 'construction',
      text: `${refund.cancel ? 'Cancelled' : 'Demolished'} ${roomName}${parts.length ? ` (returned ${parts.join(', ')})` : ''}${moved ? '; occupants reassigned' : ''}.`,
      data: { roomId: ehRoom?.id }
    });
    return { state: next, success: true, refund };
  }

  /**
   * Fill fields that older saves do not have (appearance sub-fields, room spend records,
   * furniture inventory). Never changes progress, mana or layout.
   */
  static normalizeLoadedState<T extends Partial<FullGameState>>(saved: T): T {
    if (!saved || typeof saved !== 'object') return saved;
    const out: any = { ...saved };
    if (out.wizard && out.wizard.appearance) {
      out.wizard = { ...out.wizard, appearance: normalizeAppearance(out.wizard.appearance) };
    }
    if (Array.isArray(out.rooms)) {
      out.rooms = out.rooms.map((r: PlacedRoom) => (r && !r.spent ? { ...r, spent: defaultSpent(r) } : r));
    }
    if (!Array.isArray(out.shelvedRooms)) {
      out.shelvedRooms = [];
    } else {
      out.shelvedRooms = out.shelvedRooms.map((r: PlacedRoom) => (r && !r.spent ? { ...r, spent: defaultSpent(r) } : r));
    }
    if (out.furnitureInventory === undefined && out.rooms) out.furnitureInventory = {};
    // One-time migration for saves from before required fixtures were enforced: fill any empty
    // required slot of a room that is already built, with the instant-build shape, so existing
    // rooms keep working. Sites are left alone. It runs once per save (the version marker), so a
    // room that finishes construction later keeps its fixtures empty until the player installs
    // them, even across reloads. Running it again changes nothing.
    if (Array.isArray(out.rooms) && (out.requiredFixturesVersion ?? 0) < 1) {
      const ids = allFurnitureIds([...out.rooms, ...(out.shelvedRooms || [])]);
      out.rooms = out.rooms.map((r: PlacedRoom) => {
        if (!r || r.state !== 'built' || missingRequiredSlots({ defId: r.defId, furniture: r.furniture || [] }).length === 0) return r;
        const copy: PlacedRoom = { ...r, furniture: [...(r.furniture || [])] };
        fillRequiredFixtures(copy, ids);
        return copy;
      });
      out.requiredFixturesVersion = 1;
    }
    // One-time migration for manual furniture placement: backfill saved (x, floor, plane, wallY)
    // on built rooms using the legacy grid layout so existing saves never jump when upgraded.
    if (Array.isArray(out.rooms) && (out.manualFurnitureVersion ?? 0) < 1) {
      out.rooms = out.rooms.map((r: PlacedRoom) => {
        if (!r || r.state !== 'built' || !Array.isArray(r.furniture) || r.furniture.length === 0) return r;
        const copy: PlacedRoom = { ...r, furniture: r.furniture.map((f: PlacedFurniture) => ({ ...f })) };
        migrateRoomFurniturePositions(copy);
        return copy;
      });
      out.manualFurnitureVersion = 1;
    }
    if (Array.isArray(out.characters) && Array.isArray(out.rooms)) {
      AnkicasterEngine.syncWorkplaces(out);
      out.staffingVersion = 1;
    }
    if (Array.isArray(out.rooms) && (out.knownPlansVersion ?? 0) < 1) {
      const plans = new Set<string>(Array.isArray(out.knownPlans) ? out.knownPlans : []);
      for (const r of out.rooms) if (r?.defId) plans.add(r.defId);
      out.knownPlans = [...plans];
      out.knownPlansVersion = 1;
    }
    const phase = out.tutorial?.phase;
    const phaseOk = phase === 'founding' || phase === 'tour' || phase === 'goal' || phase === 'done';
    out.tutorial = phaseOk
      ? { phase, step: Math.max(0, Math.floor(out.tutorial.step) || 0), part: Math.max(0, Math.floor(out.tutorial.part) || 0) }
      : { phase: 'done', step: 0, part: 0 };
    syncDiscoveredCreatures(out);
    if (!out.scrolls) out.scrolls = {};
    if (!Array.isArray(out.scrollQueue)) out.scrollQueue = [];
    if (!Array.isArray(out.spellbooks)) out.spellbooks = [];
    if (!out.suspendedSinceDay) out.suspendedSinceDay = {};
    if (out.settings) {
      out.settings = {
        ...out.settings,
        avoidSiblings: out.settings.avoidSiblings ?? true,
        deckScope: out.settings.deckScope ?? 'all',
        suspendedReleaseDays: out.settings.suspendedReleaseDays ?? 30,
        honestIntervalsOnly: out.settings.honestIntervalsOnly ?? true,
        veilPayment: out.settings.veilPayment ?? (out.veil?.autoPay === false ? 'ask' : 'auto'),
        toastMode: out.settings.toastMode ?? 'every_bell',
        textScale: out.settings.textScale ?? 1.0,
        manaPerReview: out.settings.manaPerReview ?? 10
      };
    }
    if (Array.isArray(out.alumniGallery)) {
      out.alumniGallery = out.alumniGallery.map((a: any) => {
        if (!a || a.bonusType !== 'renown_resonance') return a;
        return {
          ...a,
          career: a.career || 'resident',
          bonusType: a.career || 'resident',
          bonusValue: 0.01,
          extraSchoolsMastered: a.extraSchoolsMastered ?? Math.max(0, (a.titles?.length || 1) - 1),
          retiredAgeDays: a.retiredAgeDays ?? 90
        };
      });
    }
    if (out.charmRenownGranted === undefined && Array.isArray(out.rooms)) {
      out.charmRenownGranted = Math.max(0, Math.floor(computeAcademyCharm(out as FullGameState) / 50));
    }
    if (Array.isArray(out.rooms)) {
      ensureUpcomingEventsQueue(out as FullGameState);
    }
    return out;
  }

  /**
   * A construction site reaches its build time (GDD 15.4 step 6): the room appears with its
   * required furniture empty, and a notice prompts the player to install it. Until then the
   * room is Unfinished and runs at 0%.
   */
  static completeSite(next: FullGameState, room: PlacedRoom, notifications?: string[]) {
    room.state = 'built';
    const rDef = ROOM_DEFINITIONS[room.defId];
    const name = rDef?.name || 'new room';
    const missing = missingRequiredSlots(room);
    const list = missing.map(m => m.name).join(', ');
    notifications?.push(missing.length
      ? `🏗️ Completed construction of ${name}! Install its required fixtures (${list}) to open it.`
      : `🏗️ Completed construction of ${name}!`);
    next.notices.push({
      id: uniqueNoticeId(`build-${room.id}`, next),
      time: Date.now(),
      type: 'build_complete',
      text: missing.length
        ? `Construction finished for ${name}. It is Unfinished (0%) until you install: ${list}. Open the room to install them.`
        : `Construction finished for ${name}. Ready for furnishings.`,
      data: { roomId: room.id, visualEventType: 'room_built' }
    });
    AnkicasterEngine.syncWorkplaces(next);
    syncCharmRenown(next);
  }

  /**
   * Step 1 of installing a required fixture: pay cost (or consume stored item) and put the fixture
   * into `room.unplacedFurniture`. The room stays Unfinished until `dropRoomFurniture` places it.
   */
  static acquireRequiredFixture(
    state: FullGameState,
    roomId: number,
    slotIndex: number
  ): { state: FullGameState; success: boolean; furnitureId?: number; error?: string } {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    if (room.state !== 'built') return { state, success: false, error: 'Finish construction first.' };
    const slot = requiredSlotStatus(room).find(s => s.index === slotIndex);
    if (!slot) return { state, success: false, error: 'No such required slot.' };
    if (slot.filled) return { state, success: false, error: `${slot.name} is already installed.` };
    const queued = queuedRequiredBySlot(room);
    if (queued.has(slotIndex)) {
      return { state, success: false, error: `${slot.name} is already waiting to be placed in this room.` };
    }
    const opt = requiredInstallOption(slot.role);
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    const r = next.rooms.find(x => x.id === roomId)!;
    const stored = next.furnitureInventory?.[opt.defId] || 0;
    if (!opt.free && stored > 0) {
      next.furnitureInventory = { ...next.furnitureInventory, [opt.defId]: stored - 1 };
    } else if (!opt.free) {
      const fCost = discountedFurnitureCost(opt.cost, next);
      const why = unaffordable(next, fCost);
      if (why) return { state, success: false, error: why };
      next.mana -= fCost.mana || 0;
      const res = next.resources as unknown as Record<string, number>;
      for (const [k, v] of Object.entries(fCost)) if (k !== 'mana' && v) res[k] -= v;
    }
    const ids = allFurnitureIds([...next.rooms, ...(next.shelvedRooms || [])]);
    const id = uniqueFurnitureId(ids, r.id * 10 + slot.index + 1);
    r.unplacedFurniture = [...(r.unplacedFurniture || []), { id, defId: opt.defId, slotKind: `required:${slot.role}`, damaged: false }];
    logResourceDiff(next, beforeRes, `Acquired required ${slot.name}`);
    return { state: next, success: true, furnitureId: id };
  }

  /**
   * Step 1 of adding optional furniture: check compatibility/patterns/slots, pay cost (or use stored),
   * and add the piece to `room.unplacedFurniture` ready to be placed on the canvas.
   */
  static acquireFurniture(
    state: FullGameState,
    roomId: number,
    furnitureDefId: string
  ): { state: FullGameState; success: boolean; furnitureId?: number; error?: string } {
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    if (room.state !== 'built') return { state, success: false, error: 'Finish construction first.' };

    const fDef = FURNITURE_DEFINITIONS[furnitureDefId];
    if (!fDef) return { state, success: false, error: 'Unknown furniture item.' };
    if (!isFurnitureCompatibleWithRoom(fDef, room.defId)) {
      return { state, success: false, error: `${fDef.name} does not belong in this room.` };
    }

    if (!isPatternKnown(next, furnitureDefId)) {
      const deckLabel = fDef.deck[0].toUpperCase() + fDef.deck.slice(1);
      return { state, success: false, error: `Pattern needed (${deckLabel} deck).` };
    }

    const allItems = [...room.furniture, ...(room.unplacedFurniture || [])];
    const maxSame = maxSameFurnitureInRoom(room, furnitureDefId);
    const sameItemCount =
      furnitureDefId === 'student_desk' || furnitureDefId === 'reading_desk' || furnitureDefId === 'long_table'
        ? allItems.filter(f => f.defId === furnitureDefId).length
        : allItems.filter(f => !f.slotKind.startsWith('required:') && f.defId === furnitureDefId).length;
    if (sameItemCount >= maxSame) {
      return { state, success: false, error: `At most ${maxSame} ${fDef.name} can be placed in one room.` };
    }

    const maxSlots = maxOptionalSlots(room);
    const currentSlots = optionalSlotsUsed(room);
    const addedSlots = optionalSlotsCostForNewPiece(room, furnitureDefId);
    if (currentSlots + addedSlots > maxSlots) {
      return { state, success: false, error: `No available slots in this room (${currentSlots}/${maxSlots} used).` };
    }

    // A stored item (returned by demolition or removal) is used for free
    const stored = next.furnitureInventory?.[furnitureDefId] || 0;
    if (stored > 0) {
      next.furnitureInventory = { ...next.furnitureInventory, [furnitureDefId]: stored - 1 };
    } else {
      const cost = discountedFurnitureCost(fDef.cost as Cost, next);
      const bad = unaffordable(next, cost);
      if (bad) return { state, success: false, error: bad };

      next.mana -= cost.mana || 0;
      const res = next.resources as unknown as Record<string, number>;
      for (const [k, v] of Object.entries(cost)) {
        if (k !== 'mana' && v) res[k] = (res[k] || 0) - v;
      }
    }

    const ids = allFurnitureIds([...next.rooms, ...(next.shelvedRooms || [])]);
    const id = uniqueFurnitureId(ids, room.id * 100 + allItems.length + 1);
    const slotKind = fDef.role === 'bed' ? 'bed' : 'optional';
    room.unplacedFurniture = [...(room.unplacedFurniture || []), { id, defId: furnitureDefId, slotKind, damaged: false }];
    logResourceDiff(next, beforeRes, `Acquired ${fDef.name}`);
    return { state: next, success: true, furnitureId: id };
  }

  /**
   * Cancel/return an unplaced optional piece back to `furnitureInventory` (releases its slot).
   * Required fixtures cannot be cancelled into storage.
   */
  static cancelUnplacedFurniture(
    state: FullGameState,
    roomId: number,
    furnitureId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    const target = (room.unplacedFurniture || []).find(u => u.id === furnitureId);
    if (!target) return { state, success: false, error: 'Unplaced piece not found.' };
    if (target.slotKind.startsWith('required:')) {
      return { state, success: false, error: 'Required room fixtures cannot be returned to storage.' };
    }
    room.unplacedFurniture = (room.unplacedFurniture || []).filter(u => u.id !== furnitureId);
    if (!target.damaged && FURNITURE_DEFINITIONS[target.defId]) {
      next.furnitureInventory = { ...(next.furnitureInventory || {}) };
      next.furnitureInventory[target.defId] = (next.furnitureInventory[target.defId] || 0) + 1;
    }
    return { state: next, success: true };
  }

  /**
   * Step 2 of adding/installing furniture: drop a piece from `room.unplacedFurniture` onto a valid
   * coordinate inside the room. Refuses drops that violate any footprint rule.
   */
  static dropRoomFurniture(
    state: FullGameState,
    roomId: number,
    furnitureId: number,
    target: DropTargetInput
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    if (room.state !== 'built') return { state, success: false, error: 'Finish construction first.' };
    const unplaced = (room.unplacedFurniture || []).find(u => u.id === furnitureId);
    if (!unplaced) return { state, success: false, error: 'Unplaced piece not found.' };

    const check = validateFurnitureDrop(room, next.rooms, unplaced.defId, target);
    if (!check.valid) return { state, success: false, error: check.error || 'Cannot place there.' };

    room.unplacedFurniture = (room.unplacedFurniture || []).filter(u => u.id !== furnitureId);
    const placed: PlacedFurniture = {
      id: unplaced.id,
      defId: unplaced.defId,
      slotKind: unplaced.slotKind,
      damaged: !!unplaced.damaged,
      x: check.x,
      floor: check.floor,
      plane: check.plane
    };
    if (check.wallY !== undefined) placed.wallY = check.wallY;
    if (check.tableId !== undefined && check.markIndex !== undefined) {
      placed.tableId = check.tableId;
      placed.markIndex = check.markIndex;
    }
    room.furniture.push(placed);

    const rDef = ROOM_DEFINITIONS[room.defId];
    const fDef = FURNITURE_DEFINITIONS[unplaced.defId];
    const isReq = unplaced.slotKind.startsWith('required:');
    const label = fDef?.name || unplaced.slotKind.replace(/^required:/, '').replace(/_/g, ' ');
    if (isReq) {
      const left = missingRequiredSlots(room).length;
      next.notices.push({
        id: uniqueNoticeId(`reqfurn-${room.id}-${placed.id}`, next),
        time: Date.now(),
        type: 'furniture',
        text: `Installed ${label} in ${rDef?.name || 'room'}.${left ? ` ${left} required fixture${left === 1 ? '' : 's'} still missing.` : ' The room is now open.'}`,
        data: { roomId: room.id }
      });
    } else {
      next.notices.push({
        id: uniqueNoticeId(`furn-${placed.id}`, next),
        time: Date.now(),
        type: 'furniture',
        text: `Installed ${label} into ${rDef?.name || 'room'}.`,
        data: { roomId: room.id }
      });
    }
    AnkicasterEngine.syncWorkplaces(next);
    syncCharmRenown(next);
    return { state: next, success: true };
  }

  /**
   * Reposition an already-placed piece inside the same room.
   * Moving a long_table carries any snapped wooden_chair pieces with it.
   */
  static movePlacedFurniture(
    state: FullGameState,
    roomId: number,
    furnitureId: number,
    target: DropTargetInput
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    if (room.state !== 'built') return { state, success: false, error: 'Finish construction first.' };
    const piece = room.furniture.find(f => f.id === furnitureId);
    if (!piece) return { state, success: false, error: 'Furniture not found.' };

    const check = validateFurnitureDrop(room, next.rooms, piece.defId, target, { excludeFurnitureId: furnitureId });
    if (!check.valid) return { state, success: false, error: check.error || 'Cannot move there.' };

    piece.x = check.x;
    piece.floor = check.floor;
    piece.plane = check.plane;
    if (check.wallY !== undefined) piece.wallY = check.wallY;
    else delete piece.wallY;

    if (piece.defId === 'wooden_chair') {
      if (check.tableId !== undefined && check.markIndex !== undefined) {
        piece.tableId = check.tableId;
        piece.markIndex = check.markIndex;
      } else {
        delete piece.tableId;
        delete piece.markIndex;
      }
    } else if (piece.defId === 'long_table') {
      for (const chair of room.furniture) {
        if (chair.defId === 'wooden_chair' && chair.tableId === piece.id) {
          const col = Math.max(0, Math.min(2, (chair.markIndex ?? 0) % 3));
          chair.x = check.x + LONG_TABLE_MARK_OFFSETS[col];
          chair.floor = check.floor;
          chair.plane = 'floor';
        }
      }
    }

    AnkicasterEngine.syncWorkplaces(next);
    return { state: next, success: true };
  }

  /**
   * Install one empty required slot (GDD 17.1). If `target` is given, places at `target` cleanly
   * (failing if invalid); if omitted (headless/test callers), picks the first valid drop spot.
   */
  static installRequiredFixture(
    state: FullGameState,
    roomId: number,
    slotIndex: number,
    target?: DropTargetInput
  ): { state: FullGameState; success: boolean; error?: string } {
    const acq = AnkicasterEngine.acquireRequiredFixture(state, roomId, slotIndex);
    if (!acq.success || acq.furnitureId === undefined) return { state, success: false, error: acq.error };
    const r = acq.state.rooms.find(x => x.id === roomId)!;
    const item = r.unplacedFurniture!.find(u => u.id === acq.furnitureId)!;

    if (target) {
      return AnkicasterEngine.dropRoomFurniture(acq.state, roomId, acq.furnitureId, target);
    }

    const drop = findFirstValidFurnitureDrop(r, acq.state.rooms, item.defId);
    if (drop) {
      return AnkicasterEngine.dropRoomFurniture(acq.state, roomId, acq.furnitureId, {
        x: drop.x,
        floor: drop.floor,
        plane: drop.plane,
        wallY: drop.wallY,
        tableId: drop.tableId,
        markIndex: drop.markIndex
      });
    }

    // Fallback for legacy crowded test fixtures when no target is supplied
    r.unplacedFurniture = (r.unplacedFurniture || []).filter(u => u.id !== acq.furnitureId);
    r.furniture.push({ id: item.id, defId: item.defId, slotKind: item.slotKind, damaged: false });
    const legacy = legacyLayoutRoomFurniture(r).items.find(v => v.furniture.id === item.id);
    const placed = r.furniture[r.furniture.length - 1];
    placed.x = legacy?.x ?? Math.round((r.w * 64) / 2);
    placed.floor = legacy?.floor ?? 0;
    placed.plane = legacy?.kind ?? piecePlane(item.defId);
    AnkicasterEngine.syncWorkplaces(acq.state);
    syncCharmRenown(acq.state);
    return { state: acq.state, success: true };
  }

  /**
   * Renovate/upgrade room to next level (GDD Section 15.6)
   */
  static upgradeRoom(
    state: FullGameState,
    roomId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    if (room.state !== 'built') return { state, success: false, error: 'Finish construction first.' };
    if (room.level >= 3) return { state, success: false, error: 'Room is already at maximum Level 3.' };

    const def = ROOM_DEFINITIONS[room.defId];
    const upgradeCost = Math.round((def?.cost.mana ?? 100) * 0.75) + 50;
    if (next.mana < upgradeCost) {
      return { state, success: false, error: `Need ${upgradeCost} Mana to renovate to Level ${room.level + 1}.` };
    }

    next.mana -= upgradeCost;
    const prevName = roomDisplayName(room);
    room.level = (room.level + 1) as 2 | 3;
    const nextName = roomDisplayName(room);
    next.renown += 5;
    room.renownGranted = (room.renownGranted || 0) + 5;
    syncCharmRenown(next);

    next.notices.push({
      id: uniqueNoticeId(`upg-${roomId}-${room.level}`, next),
      time: Date.now(),
      type: 'renovation',
      text:
        nextName !== prevName
          ? `${prevName} upgraded to Level ${room.level} (${nextName})! (+5 Renown)`
          : `${nextName} upgraded to Level ${room.level}! (+5 Renown)`,
      data: { roomId, level: room.level }
    });

    return { state: next, success: true };
  }

  /**
   * Add optional furniture to room. When `target` is omitted (headless callers), picks the first
   * valid drop coordinate automatically; when `target` is supplied, strictly validates it.
   */
  static addFurniture(
    state: FullGameState,
    roomId: number,
    furnitureDefId: string,
    target?: DropTargetInput
  ): { state: FullGameState; success: boolean; error?: string } {
    const acq = AnkicasterEngine.acquireFurniture(state, roomId, furnitureDefId);
    if (!acq.success || acq.furnitureId === undefined) return { state, success: false, error: acq.error };
    const r = acq.state.rooms.find(x => x.id === roomId)!;
    const item = r.unplacedFurniture!.find(u => u.id === acq.furnitureId)!;

    if (target) {
      return AnkicasterEngine.dropRoomFurniture(acq.state, roomId, acq.furnitureId, target);
    }

    const drop = findFirstValidFurnitureDrop(r, acq.state.rooms, furnitureDefId);
    if (drop) {
      return AnkicasterEngine.dropRoomFurniture(acq.state, roomId, acq.furnitureId, {
        x: drop.x,
        floor: drop.floor,
        plane: drop.plane,
        wallY: drop.wallY,
        tableId: drop.tableId,
        markIndex: drop.markIndex
      });
    }

    // Fallback for tight legacy test rooms when target is omitted
    r.unplacedFurniture = (r.unplacedFurniture || []).filter(u => u.id !== acq.furnitureId);
    r.furniture.push({ id: item.id, defId: item.defId, slotKind: item.slotKind, damaged: false });
    const legacy = legacyLayoutRoomFurniture(r).items.find(v => v.furniture.id === item.id);
    const placed = r.furniture[r.furniture.length - 1];
    placed.x = legacy?.x ?? Math.round((r.w * 64) / 2);
    placed.floor = legacy?.floor ?? 0;
    placed.plane = legacy?.kind ?? piecePlane(item.defId);
    AnkicasterEngine.syncWorkplaces(acq.state);
    syncCharmRenown(acq.state);
    return { state: acq.state, success: true };
  }

  /**
   * Remove furniture from room. If a long_table is removed, any snapped chairs are detached;
   * chairs whose full 16px box no longer clears neighbours are moved to unplacedFurniture.
   */
  static removeFurniture(
    state: FullGameState,
    roomId: number,
    furnitureId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };

    const target = room.furniture.find(f => f.id === furnitureId);
    if (!target) return { state, success: false, error: 'Furniture not found.' };
    if (target.slotKind.startsWith('required:')) {
      return { state, success: false, error: 'Required room fixtures cannot be removed.' };
    }

    room.furniture = room.furniture.filter(f => f.id !== furnitureId);
    if (target.defId === 'long_table') {
      const detachedIds: number[] = [];
      for (const f of room.furniture) {
        if (f.defId === 'wooden_chair' && f.tableId === target.id) {
          delete f.tableId;
          delete f.markIndex;
          detachedIds.push(f.id);
        }
      }
      for (const cid of detachedIds) {
        const chair = room.furniture.find(f => f.id === cid);
        if (!chair) continue;
        const ok = validateFurnitureDrop(
          room,
          next.rooms,
          chair.defId,
          { x: chair.x ?? Math.round((room.w * 64) / 2), floor: chair.floor ?? 0 },
          { excludeFurnitureId: cid }
        );
        if (!ok.valid) {
          room.furniture = room.furniture.filter(f => f.id !== cid);
          room.unplacedFurniture = [
            ...(room.unplacedFurniture || []),
            { id: chair.id, defId: chair.defId, slotKind: chair.slotKind, damaged: chair.damaged }
          ];
        }
      }
    }

    if (!target.damaged && FURNITURE_DEFINITIONS[target.defId]) {
      next.furnitureInventory = { ...(next.furnitureInventory || {}) };
      next.furnitureInventory[target.defId] = (next.furnitureInventory[target.defId] || 0) + 1;
    }
    AnkicasterEngine.syncWorkplaces(next);
    syncCharmRenown(next);
    return { state: next, success: true };
  }

  /**
   * Assign a character to a career or switch careers (BR-15, Section 13)
   * Rule: Career switching is strictly reserved for Polymath Masters of 2 or more schools!
   * Each career links 20 new free cards while keeping previously earned cards.
   */
  static assignCareer(
    state: FullGameState,
    charId: number,
    career: CareerType,
    targetRoomId?: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const char = next.characters.find(c => c.id === charId);
    if (!char) return { state, success: false, error: 'Character not found.' };
    if (char.status === 'student') return { state, success: false, error: 'Students must graduate before taking a career.' };
    if (char.status === 'away') return { state, success: false, error: 'Character is away on an expedition.' };

    // Career switching check
    if (char.career && char.career !== career) {
      if (char.masteredSchools.length < 2) {
        return {
          state,
          success: false,
          error: `Career switching is reserved for polymaths! Character must master at least 2 schools of magic (currently ${char.masteredSchools.length}/2).`
        };
      }
    }

    // Teacher can only be appointed if they have mastered a school with a built classroom
    if (career === 'teacher') {
      const matchingRooms = next.rooms.filter(r => {
        if (r.state !== 'built') return false;
        const sch = classroomSchool(r.defId);
        return !!sch && char.masteredSchools.includes(sch);
      });
      if (matchingRooms.length === 0) {
        return {
          state,
          success: false,
          error: 'Needs a built classroom in a school this character has mastered.'
        };
      }
      if (targetRoomId !== undefined) {
        const chosen = matchingRooms.find(r => r.id === targetRoomId);
        if (!chosen) {
          return {
            state,
            success: false,
            error: 'Teacher can only be assigned to a classroom of a school they have mastered.'
          };
        }
        const wpSlots = effectiveWorkplaceSlots(chosen);
        if (AnkicasterEngine.slotsUsed(next, chosen, char.id) >= wpSlots) {
          return { state, success: false, error: 'That classroom already has a teacher.' };
        }
      }
    }

    // Check faculty limits (F12, BR-14, BR-22) - no hard cap of 12
    if (FACULTY_CAREERS.includes(career)) {
      const { activeFaculty, maxAllowed } = getFacultySummary(next, char.id);

      if (activeFaculty >= maxAllowed) {
        return {
          state,
          success: false,
          error: `Faculty limit reached (${activeFaculty}/${maxAllowed}). Expand student body (needs 3 students per faculty member) or build more faculty housing.`
        };
      }
    }

    // Link 20 youngest free cards to Career Set (BR-15)
    // When switching careers, link 20 new cards and keep old ones
    // Check if char already has a career set for this specific career
    const existingCareerSet = next.cardSets.find(s => s.characterId === char.id && s.career === career && !s.released);

    if (!existingCareerSet) {
      const freeCards = getEligibleFreeYoungCards(next, 45);

      const needed = 20;
      if (freeCards.length < needed) {
        return {
          state,
          success: false,
          error: `Need ${needed} free young flashcards to link career expertise (found ${freeCards.length}).`
        };
      }

      const chosen = pickFreeYoungCards(next, 45, needed).map(c => c.id);
      const careerSetId = uniqueNumericId(next.cardSets.map(s => s.id));
      next.cardSets.push({
        id: careerSetId,
        characterId: char.id,
        kind: 'career',
        career,
        size: needed,
        createdDay: next.day,
        released: false,
        cardIds: chosen
      });
      char.careerSetIds.push(careerSetId);
    }

    const previousCareer = char.career;
    char.career = career;
    char.careerState = 'active';
    char.status = career === 'adventurer' ? 'resident' : 'faculty';
    if (career === 'teacher' && targetRoomId !== undefined) {
      char.workplaceRoomId = targetRoomId;
    } else if (previousCareer !== career) {
      char.workplaceRoomId = undefined;
    }
    if (previousCareer === 'adventurer' && career !== 'adventurer') {
      for (const cr of next.creatures) {
        if (cr.adventurerId === char.id) cr.adventurerId = undefined;
      }
    }
    AnkicasterEngine.syncWorkplaces(next);
    char.chronicle.push({
      day: next.day,
      text: previousCareer
        ? `Switched career from ${previousCareer.toUpperCase()} to ${career.toUpperCase()} (retaining prior expertise).`
        : `Appointed as Academy ${career.toUpperCase()}.`
    });

    next.notices.push({
      id: uniqueNoticeId(`career-${char.id}`, next),
      time: Date.now(),
      type: 'career',
      text: previousCareer
        ? `🔄 ${char.name} transitioned careers to ${career.toUpperCase()} with 20 new flashcards linked!`
        : `🏛️ ${char.name} has taken the mantle of ${career.toUpperCase()}!`,
      data: {
        characterIds: [char.id],
        roomId: char.workplaceRoomId ?? targetRoomId ?? char.seatRoomId ?? char.bedRoomId,
        career,
        visualEventType: previousCareer ? 'career_switched' : 'career_taken'
      }
    });

    return { state: next, success: true };
  }

  /**
   * Assign an existing Teacher to a specific classroom of a school they have mastered.
   */
  static assignTeacherToClassroom(
    state: FullGameState,
    charId: number,
    roomId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const char = next.characters.find(c => c.id === charId);
    if (!char || char.career !== 'teacher') {
      return { state, success: false, error: 'Character is not a teacher.' };
    }
    const room = next.rooms.find(r => r.id === roomId && r.state === 'built');
    if (!room) return { state, success: false, error: 'Classroom not found.' };
    const sch = classroomSchool(room.defId);
    if (!sch || !char.masteredSchools.includes(sch)) {
      return { state, success: false, error: 'Teacher has not mastered that classroom’s school.' };
    }
    const wpSlots = effectiveWorkplaceSlots(room);
    if (AnkicasterEngine.slotsUsed(next, room, char.id) >= wpSlots) {
      return { state, success: false, error: 'That classroom already has a teacher.' };
    }
    char.workplaceRoomId = room.id;
    AnkicasterEngine.syncWorkplaces(next);
    return { state: next, success: true };
  }

  /**
   * Assign an active faculty member of a room's career to work in `roomId`.
   * If all workplace slots are full, `replaceCharId` must identify who they replace (no silent bump).
   */
  static assignRoomStaff(
    state: FullGameState,
    roomId: number,
    charId: number,
    replaceCharId?: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId && r.state === 'built');
    if (!room) return { state, success: false, error: 'Room not found.' };
    const wp = ROOM_DEFINITIONS[room.defId]?.workplace;
    if (!wp) return { state, success: false, error: 'This room has no staff post.' };
    if (!AnkicasterEngine.roomWorkable(room)) {
      return { state, success: false, error: 'Finish installing required fixtures before assigning staff.' };
    }

    const char = next.characters.find(c => c.id === charId);
    if (!char || char.career !== wp.career || char.careerState === 'sabbatical' || char.status === 'away') {
      return { state, success: false, error: `Character is not an active ${wp.career}.` };
    }
    if (wp.career === 'teacher') {
      const sch = classroomSchool(room.defId);
      if (!sch || !char.masteredSchools.includes(sch)) {
        return { state, success: false, error: 'Teacher has not mastered that classroom’s school.' };
      }
    }

    if (char.workplaceRoomId === room.id) {
      return { state: next, success: true };
    }

    const occupants = next.characters.filter(
      c => c.id !== char.id && c.workplaceRoomId === room.id && c.career === wp.career && c.careerState !== 'sabbatical'
    );

    const avoid = new Map<number, number>();
    if (occupants.length >= effectiveWorkplaceSlots(room)) {
      if (replaceCharId == null) {
        return { state, success: false, error: 'All slots are full; pick who to replace.' };
      }
      const replaced = occupants.find(c => c.id === replaceCharId);
      if (!replaced) {
        return { state, success: false, error: 'Staff member to replace was not found in this room.' };
      }
      replaced.workplaceRoomId = undefined;
      avoid.set(replaced.id, room.id);
    }

    char.workplaceRoomId = room.id;
    AnkicasterEngine.syncWorkplaces(next, avoid.size > 0 ? avoid : undefined);
    return { state: next, success: true };
  }

  /**
   * Clear a staff member's assignment to `roomId` and let auto-placement place them
   * in the next open room of their career (or back here if it is the only one).
   */
  static clearRoomStaff(
    state: FullGameState,
    roomId: number,
    charId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId && r.state === 'built');
    if (!room) return { state, success: false, error: 'Room not found.' };
    const char = next.characters.find(c => c.id === charId);
    if (!char || char.workplaceRoomId !== room.id) {
      return { state, success: false, error: 'Staff member is not assigned to this room.' };
    }
    char.workplaceRoomId = undefined;
    AnkicasterEngine.syncWorkplaces(next, new Map([[char.id, room.id]]));
    return { state: next, success: true };
  }

  /**
   * Use / Consume a Potion from inventory
   */
  static usePotion(
    state: FullGameState,
    potionId: string,
    target?: number | AlchemyTarget
  ): { state: FullGameState; success: boolean; error?: string; message?: string } {
    const next = structuredClone(state);
    const count = next.resources.potions[potionId] || 0;
    if (count <= 0) {
      return { state, success: false, error: 'No potions of this type in inventory.' };
    }

    const numTarget = typeof target === 'number' ? target : undefined;
    const tObj: AlchemyTarget = typeof target === 'object' && target !== null ? target : {};
    const charTargetId = tObj.characterId ?? numTarget;
    const roomTargetId = tObj.roomId ?? numTarget;
    const creatureTargetId = tObj.creatureId ?? numTarget;

    next.resources.potions[potionId] -= 1;
    if (!next.activeBuffs) next.activeBuffs = {};
    let message = 'Potion consumed.';
    let potionTargetRoomId: number | undefined;
    let potionTargetCharIds: number[] | undefined;
    let potionTargetCreatureId: number | undefined;
    let potionExtraEvent: string | undefined;

    switch (potionId) {
      case 'mending_draught': {
        const injuredHero = charTargetId
          ? next.characters.find(c => c.id === charTargetId && c.injury)
          : next.characters.find(c => c.injury);
        if (injuredHero && injuredHero.injury) {
          injuredHero.injury = undefined;
          injuredHero.needs.health = 100;
          potionTargetCharIds = [injuredHero.id];
          potionTargetRoomId = next.rooms.find(r => r.defId === 'infirmary' && r.state === 'built')?.id ?? injuredHero.bedRoomId;
          potionExtraEvent = 'character_healed';
          message = `💖 Mending Draught consumed! ${injuredHero.name}'s injury is completely healed.`;
        } else {
          message = 'Mending Draught consumed (all residents are healthy).';
        }
        break;
      }

      case 'calming_tonic': {
        const targetChar = tObj.roomId == null && charTargetId ? next.characters.find(c => c.id === charTargetId) : undefined;
        const targetRoomId = tObj.roomId ?? (numTarget && !targetChar
          ? numTarget
          : targetChar?.seatRoomId ?? targetChar?.workplaceRoomId ?? targetChar?.bedRoomId);
        const affected = targetRoomId
          ? next.characters.filter(c => c.seatRoomId === targetRoomId || c.workplaceRoomId === targetRoomId || c.bedRoomId === targetRoomId)
          : next.characters;
        const list = affected.length > 0 ? affected : next.characters;
        for (const c of list) {
          c.needs.composure = Math.min(100, c.needs.composure + 30);
        }
        const clearedChains = clearRoomMisbehaviorChains(next, targetRoomId);
        potionTargetRoomId = targetRoomId;
        potionTargetCharIds = list.map(c => c.id);
        message = `✨ Calming Tonic consumed! Composure +30 for ${list.length} resident(s)${clearedChains > 0 ? ` and cleared ${clearedChains} misbehavior effect(s)` : '; misbehavior calmed'}.`;
        break;
      }

      case 'growth_elixir': {
        const plot = (roomTargetId ? next.rooms.find(r => r.id === roomTargetId) : undefined)
          || next.rooms.find(r => r.state === 'built' && ['greenhouse', 'vegetable_patch', 'herb_garden', 'woodlot', 'orchard', 'apiary'].includes(r.defId));
        next.activeBuffs.growthElixirBells = 10;
        next.activeBuffs.growthElixirRoomId = plot?.id;
        potionTargetRoomId = plot?.id;
        message = `🌿 Growth Elixir poured! ${plot ? ROOM_DEFINITIONS[plot.defId]?.name || 'Plot' : 'Plots'} x2 output for 10 bells.`;
        break;
      }

      case 'beast_biscuit': {
        const loose = (creatureTargetId ? next.creatures.find(c => c.id === creatureTargetId && c.status === 'loose') : undefined)
          || next.creatures.find(c => c.status === 'loose');
        if (loose) {
          loose.status = 'tamed';
          potionTargetCreatureId = loose.id;
          potionTargetRoomId = loose.roomId;
          potionExtraEvent = 'creature_recaptured';
          message = `🐾 Beast Biscuit offered! ${loose.nickname} returned safely and is tamed.`;
        } else {
          const wary = (creatureTargetId ? next.creatures.find(c => c.id === creatureTargetId && c.status === 'wary') : undefined)
            || next.creatures.find(c => c.status === 'wary');
          if (wary) {
            wary.tamingProgress += 30;
            potionTargetCreatureId = wary.id;
            potionTargetRoomId = wary.roomId;
            const cDef = CREATURE_DEFINITIONS[wary.defId];
            if (cDef && wary.tamingProgress >= cDef.tamingReviews) {
              wary.status = 'tamed';
              grantTamingOneTimeBonuses(next, wary);
              potionExtraEvent = 'creature_tamed';
              message = `🐾 Beast Biscuit fed! ${wary.nickname} is now fully tamed!`;
            } else {
              message = `🐾 Beast Biscuit fed! +30 taming progress to ${wary.nickname}.`;
            }
          } else {
            message = 'Beast Biscuit consumed, but no wary or loose creatures were found.';
          }
        }
        break;
      }

      case 'lure_musk': {
        const habitat = roomTargetId ? next.rooms.find(r => r.id === roomTargetId && r.state === 'built') : undefined;
        next.activeBuffs.lureMuskPending = true;
        next.activeBuffs.lureMuskRoomId = habitat?.id;
        potionTargetRoomId = habitat?.id;
        message = habitat
          ? `🦊 Lure Musk scattered in ${ROOM_DEFINITIONS[habitat.defId]?.name || 'habitat'}! A wild creature is guaranteed to visit on the next day tick.`
          : '🦊 Lure Musk scattered! A wild creature is guaranteed to visit on the next day tick.';
        break;
      }

      case 'polishing_spirit': {
        const room = (roomTargetId ? next.rooms.find(r => r.id === roomTargetId) : undefined)
          || [...next.rooms].filter(r => r.state === 'built').sort((a, b) => a.cleanliness - b.cleanliness)[0];
        if (room) {
          room.cleanliness = 100;
          next.activeBuffs.cleanImmuneBells = 20;
          next.activeBuffs.cleanImmuneRoomId = room.id;
          potionTargetRoomId = room.id;
          message = `✨ Polishing Spirit applied! ${ROOM_DEFINITIONS[room.defId]?.name || 'Room'} restored to 100 cleanliness and immune to dirt for 20 bells.`;
        } else {
          message = 'Polishing Spirit consumed.';
        }
        break;
      }

      case 'fireproof_salve': {
        const room = (roomTargetId ? next.rooms.find(r => r.id === roomTargetId) : undefined)
          || next.rooms.find(r => r.state === 'built' && r.defId === 'alchemy_lab')
          || next.rooms.find(r => r.state === 'built');
        next.activeBuffs.fireproofBells = 50;
        next.activeBuffs.fireproofRoomId = room?.id;
        potionTargetRoomId = room?.id;
        message = `🛡️ Fireproof Salve coated ${room ? ROOM_DEFINITIONS[room.defId]?.name || 'room' : 'the academy'} for 50 bells.`;
        break;
      }

      case 'dreamless_draught': {
        const dorm = (roomTargetId ? next.rooms.find(r => r.id === roomTargetId) : undefined)
          || next.rooms.find(r => r.state === 'built' && (r.defId === 'dormitory' || r.defId === 'grand_dormitory'));
        const sleepers = dorm
          ? next.characters.filter(c => c.bedRoomId === dorm.id)
          : next.characters;
        const list = sleepers.length > 0 ? sleepers : next.characters;
        for (const c of list) {
          c.needs.rest = Math.min(100, c.needs.rest + 20);
        }
        potionTargetRoomId = dorm?.id;
        potionTargetCharIds = list.map(c => c.id);
        message = `🌙 Dreamless Draught shared! Rest +20 for ${list.length} resident(s).`;
        break;
      }

      case 'veil_tonic': {
        next.veil.strength = Math.min(100, next.veil.strength + 15);
        message = '🛡️ Veil Tonic poured into the reservoir! Veil strength surged by +15%.';
        break;
      }

      case 'wardwater': {
        let clearedFog = 0;
        for (const r of next.rooms) {
          if (r.hazard?.type === 'hex_fog') {
            r.hazard = undefined;
            clearedFog++;
          }
        }
        const targetRoom =
          (roomTargetId ? next.rooms.find(r => r.id === roomTargetId && r.area === 'castle') : undefined) ||
          next.rooms.find(r => r.state === 'built' && r.area === 'castle');
        if (targetRoom) {
          const floorY = targetRoom.y;
          next.activeBuffs.wardwaterFloors = [...(next.activeBuffs.wardwaterFloors || []), floorY];
          potionTargetRoomId = targetRoom.id;
          message = `💧 Wardwater sprinkled on Floor ${floorY + 1}! Next hazard prevented${clearedFog > 0 ? ` and ${clearedFog} Hex Fog dispelled` : ''}.`;
        } else {
          message = `💧 Wardwater sprinkled!${clearedFog > 0 ? ` ${clearedFog} Hex Fog dispelled.` : ''}`;
        }
        break;
      }

      case 'quickmortar': {
        const site = (roomTargetId ? next.rooms.find(r => r.id === roomTargetId && r.state === 'site') : undefined)
          || next.rooms.find(r => r.state === 'site');
        if (site) {
          site.buildProgress += 20;
          potionTargetRoomId = site.id;
          if (site.buildProgress >= site.buildRequired) AnkicasterEngine.completeSite(next, site);
          message = '⚡ Quickmortar poured over construction site: +20 progress points!';
        } else {
          message = 'Quickmortar consumed (no active construction site).';
        }
        break;
      }

      case 'rift_elixir': {
        next.activeBuffs.riftElixirCharges = (next.activeBuffs.riftElixirCharges || 0) + 1;
        message = '🧭 Rift Elixir prepared! Next expedition gains +10% safe odds (up to destination best odds).';
        break;
      }

      case 'courage_draught': {
        next.activeBuffs.courageDraughtCharges = (next.activeBuffs.courageDraughtCharges || 0) + 1;
        message = '🦁 Courage Draught imbibed! Next expedition injury or curse requires half recovery.';
        break;
      }

      case 'glass_flux': {
        const cap = AnkicasterEngine.storageCap(next);
        next.resources.glass = next.resources.glass >= cap ? next.resources.glass : Math.min(cap, next.resources.glass + 20);
        message = '🪟 Glass Flux catalyzed! +20 Glass added to stores.';
        break;
      }

      case 'elixir_of_fellowship': {
        next.activeBuffs.fellowshipBells = 30;
        for (const c of next.characters) {
          c.morale = Math.min(100, c.morale + 10);
        }
        message = '🤝 Elixir of Fellowship shared! Academy morale +10 for 30 bells.';
        break;
      }

      case 'starlight_ink': {
        next.draftRerollTokens = (next.draftRerollTokens || 0) + 3;
        message = '🖋️ Starlight Ink uncorked! Granted +3 draft reroll tokens.';
        break;
      }

      case 'transmutation_salts': {
        const commonKeys = ['timber', 'stone', 'glass', 'cloth', 'provisions', 'greens', 'fish', 'nectar'] as const;
        const bag = next.resources as unknown as Record<string, number>;
        const cap = AnkicasterEngine.storageCap(next);
        const sortedDesc = [...commonKeys].sort((a, b) => (bag[b] || 0) - (bag[a] || 0));
        const src = tObj.fromResource && (commonKeys as readonly string[]).includes(tObj.fromResource)
          ? tObj.fromResource
          : sortedDesc[0];
        const dst = tObj.toResource && (commonKeys as readonly string[]).includes(tObj.toResource) && tObj.toResource !== src
          ? tObj.toResource
          : sortedDesc.find(k => k !== src) || sortedDesc[sortedDesc.length - 1];
        if ((bag[src] || 0) >= 50 && src !== dst) {
          bag[src] -= 50;
          bag[dst] = (bag[dst] || 0) >= cap ? (bag[dst] || 0) : Math.min(cap, (bag[dst] || 0) + 40);
          message = `⚗️ Transmutation Salts applied! Converted 50 ${src} into 40 ${dst}.`;
        } else {
          message = '⚗️ Transmutation Salts fizzled (need at least 50 of a common material).';
        }
        break;
      }

      case 'phoenix_draught': {
        for (const c of next.characters) {
          c.injury = undefined;
          c.needs.health = 100;
        }
        potionExtraEvent = 'character_healed';
        message = '🔥 Phoenix Draught consumed! Every injury and curse across the academy is instantly healed!';
        break;
      }

      default:
        message = `Drank ${potionId}! Energy and focus restored.`;
    }

    const labRoomId = next.rooms.find(r => r.defId === 'alchemy_lab' && r.state === 'built')?.id;
    next.notices.push({
      id: uniqueNoticeId('potion-use', next),
      time: Date.now(),
      type: 'potion',
      text: message,
      data: {
        potionId,
        roomId: potionTargetRoomId ?? labRoomId ?? next.rooms.find(r => r.defId === 'entrance_hall')?.id,
        characterIds: potionTargetCharIds,
        creatureId: potionTargetCreatureId,
        visualEventType: potionExtraEvent ?? 'potion_used'
      }
    });

    syncCharmRenown(next);
    return { state: next, success: true, message };
  }

  /**
   * Resolve / Dispel a Hazard in a Room
   */
  static resolveHazard(
    state: FullGameState,
    roomId: number,
    method: 'warder' | 'spell' | 'clean'
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room || !room.hazard) {
      return { state, success: false, error: 'No active hazard in this room.' };
    }

    if (method === 'spell') {
      if (next.mana < HAZARD_DISPEL_MANA_COST) return { state, success: false, error: `Need ${HAZARD_DISPEL_MANA_COST} Mana for dispel spell.` };
      next.mana -= HAZARD_DISPEL_MANA_COST;
    } else if (method === 'warder') {
      const hasWarder = next.characters.some(c => c.career === 'warder' && c.careerState === 'active' && c.status !== 'away');
      if (!hasWarder) return { state, success: false, error: 'Requires an active Warder on faculty.' };
    }

    const hazardName = room.hazard.name;
    const hazardType = room.hazard.type;
    clearRoomHazard(next, room);
    room.cleanliness = Math.max(room.cleanliness, 80);

    next.notices.push({
      id: uniqueNoticeId('hazard-clear', next),
      time: Date.now(),
      type: 'hazard',
      text: `✨ Cleared hazard "${hazardName}" from ${ROOM_DEFINITIONS[room.defId]?.name || 'room'} using ${method}!`,
      data: {
        roomId,
        hazardType,
        visualEventType: 'hazard_cleared'
      }
    });

    return { state: next, success: true };
  }

  /**
   * Feed a Creature its preferred diet
   */
  static feedCreature(
    state: FullGameState,
    creatureId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const creature = next.creatures.find(c => c.id === creatureId);
    if (!creature) return { state, success: false, error: 'Creature not found.' };
    if (creature.status !== 'wary' && creature.status !== 'tamed') {
      return { state, success: false, error: 'Only wary and tamed creatures can be hand-fed.' };
    }

    const def = CREATURE_DEFINITIONS[creature.defId];
    if (!def) return { state, success: false, error: 'Creature species unknown.' };

    if (creature.lastManualFeedBell === next.bellIndex) {
      return { state, success: false, error: `${creature.nickname} was already hand-fed this bell.` };
    }

    // Check diet. A partial bag pays nothing.
    for (const [food, amount] of Object.entries(def.diet)) {
      const current = (next.resources as any)[food] || 0;
      if (current < amount) {
        return { state, success: false, error: `Need ${amount} ${food} to feed ${creature.nickname}.` };
      }
    }

    // Deduct food
    const beforeRes = resourceSnapshot(next);
    for (const [food, amount] of Object.entries(def.diet)) {
      (next.resources as any)[food] -= amount;
    }
    logResourceDiff(next, beforeRes, `Fed ${creature.nickname}`);

    creature.hungry = false;
    creature.lastManualFeedBell = next.bellIndex;
    const prevBond = creature.bondLevel;
    creature.bondProgress += MANUAL_FEED_BOND;
    if (creature.status === 'tamed') {
      if (creature.bondLevel <= 1 && creature.bondProgress >= 150) creature.bondLevel = 2;
      else if (creature.bondLevel === 2 && creature.bondProgress >= 400) creature.bondLevel = 3;
    }
    const bondLeveled = creature.bondLevel > prevBond;

    next.notices.push({
      id: uniqueNoticeId(`feed-${creature.id}`, next),
      time: Date.now(),
      type: 'creature',
      text: `🍎 Fed ${creature.nickname} (${def.name}). Bond +${MANUAL_FEED_BOND}.`,
      data: {
        creatureId: creature.id,
        roomId: creature.roomId,
        visualEventType: bondLeveled ? 'creature_bond_up' : 'creature_fed'
      }
    });

    return { state: next, success: true };
  }

  /**
   * Assign a Tamer to a Creature
   */
  static assignTamerToCreature(
    state: FullGameState,
    creatureId: number,
    tamerId: number
  ): { state: FullGameState; success: boolean } {
    const next = structuredClone(state);
    const creature = next.creatures.find(c => c.id === creatureId);
    if (!creature) return { state, success: false };

    creature.tamerId = tamerId;
    return { state: next, success: true };
  }

  /**
   * Pair (or unpair) a creature with an adventurer for Rift expeditions.
   */
  static assignCreatureToAdventurer(
    state: FullGameState,
    creatureId: number,
    adventurerId?: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const creature = next.creatures.find(c => c.id === creatureId);
    if (!creature) return { state, success: false, error: 'Creature not found.' };
    if (adventurerId === undefined) {
      creature.adventurerId = undefined;
      return { state: next, success: true };
    }
    const adv = next.characters.find(c => c.id === adventurerId && c.career === 'adventurer');
    if (!adv) return { state, success: false, error: 'Adventurer not found.' };
    creature.adventurerId = adv.id;
    return { state: next, success: true };
  }

  /**
   * Release a creature from the Academy while preserving its species in discoveredCreatures.
   */
  static releaseCreature(
    state: FullGameState,
    creatureId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const idx = next.creatures.findIndex(c => c.id === creatureId);
    if (idx === -1) return { state, success: false, error: 'Creature not found.' };
    syncDiscoveredCreatures(next);
    const [removed] = next.creatures.splice(idx, 1);
    const def = CREATURE_DEFINITIONS[removed.defId];
    next.notices.push({
      id: uniqueNoticeId(`release-${removed.id}`, next),
      time: Date.now(),
      type: 'creature',
      text: `Released ${removed.nickname} (${def?.name || removed.defId}) back to the wild.`,
      data: {
        creatureId: removed.id,
        roomId: removed.roomId
      }
    });
    return { state: next, success: true };
  }

  /**
   * Queue Wizard Arcane Study Session (BR-05, BR-06)
   */
  static queueWizardSession(
    state: FullGameState,
    school: SchoolType,
    isGrimoire: boolean = false,
    spellId?: string
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);

    // Total sessions cap based on studyLevel (1+1=2 at Lv1, 1+2=3 at Lv2, 1+4=5 at Lv3)
    const studyLvl = computeStudyLevel(next.wizard.levels);
    next.wizard.studyLevel = studyLvl;
    const maxSessions = maxStudySessionsForWizard(studyLvl);
    const totalSessions = (next.wizard.activeSession ? 1 : 0) + next.wizard.queuedSessions.length;
    if (totalSessions >= maxSessions) {
      return {
        state,
        success: false,
        error: `Maximum of ${maxSessions} wizard training sessions at Study Level ${studyLvl} (active + ${maxSessions - 1} queued).`
      };
    }

    let targetLevel = 1;
    let cost = 250;
    let required = 50;
    let spellName: string | undefined;

    if (isGrimoire) {
      const spDef = spellId ? SPELL_DEFINITIONS[spellId] : undefined;
      if (!spDef) {
        return { state, success: false, error: 'Unknown grimoire spell.' };
      }
      if (next.wizard.knownSpells.includes(spDef.id)) {
        return { state, success: false, error: `${spDef.name} is already learned.` };
      }
      const alreadyStudying =
        (next.wizard.activeSession?.kind === 'grimoire' && next.wizard.activeSession.spellId === spDef.id) ||
        next.wizard.queuedSessions.some(q => q.kind === 'grimoire' && q.spellId === spDef.id);
      if (alreadyStudying) {
        return { state, success: false, error: `${spDef.name} is already in your study queue.` };
      }
      const tierReviews: Record<string, number> = { T1: 25, T2: 50, T3: 75, T4: 100, Cap: 150 };
      required = tierReviews[spDef.tier] || 50;
      const hasL3Library = next.rooms.some(
        r => r.defId === 'library' && r.state === 'built' && !isRoomUnfinished(r) && r.level >= 3
      );
      cost = Math.max(10, Math.round(spDef.manaCost * (hasL3Library ? 0.9 : 1)));
      spellName = spDef.name;
    } else {
      const quote = wizardOrbQuote({
        foundingSchool: next.wizard.foundingSchool,
        levels: next.wizard.levels,
        active: next.wizard.activeSession,
        queued: next.wizard.queuedSessions,
        school
      });
      targetLevel = quote.targetLevel;

      if (quote.capped) {
        return { state, success: false, error: `${school.toUpperCase()} training capped at Master Level 10.` };
      }

      cost = quote.mana;
      required = quote.reviews;
    }

    if (next.mana < cost) {
      return { state, success: false, error: `Need ${cost} Mana to ponder this arcane mystery.` };
    }

    next.mana -= cost;
    const existingSessionIds = [
      ...(next.wizard.activeSession ? [next.wizard.activeSession.id] : []),
      ...next.wizard.queuedSessions.map(q => q.id)
    ];
    const session = {
      id: uniqueNumericId(existingSessionIds),
      kind: (isGrimoire ? 'grimoire' : 'orb') as 'orb' | 'grimoire',
      school,
      targetLevel,
      spellId,
      progress: 0,
      required,
      costPaid: cost,
      state: 'active' as const
    };

    if (!next.wizard.activeSession) {
      next.wizard.activeSession = session;
    } else {
      next.wizard.queuedSessions.push({
        id: session.id,
        kind: session.kind,
        school: session.school,
        targetLevel: session.targetLevel,
        spellId: session.spellId,
        required: session.required,
        costPaid: session.costPaid
      });
    }

    const studyRoomId = next.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built')?.id;
    next.notices.push({
      id: uniqueNoticeId('study', next),
      time: Date.now(),
      type: 'wizard',
      text: isGrimoire
        ? `Grimoire Study: Learning ${spellName} (${required} reviews, cost ${cost === 0 ? 'free' : `${cost}m`}).`
        : `Pondering the Orb: Training towards ${school.toUpperCase()} Level ${targetLevel} (${required} reviews, cost ${cost === 0 ? 'free' : `${cost}m`}).`,
      data: {
        roomId: studyRoomId,
        school,
        spellId
      }
    });

    return { state: next, success: true };
  }

  /**
   * Cast a Wizard Spell (BR-29, Section 29)
   */
  static castSpell(
    state: FullGameState,
    spellId: string,
    target?: number | AlchemyTarget
  ): { state: FullGameState; success: boolean; error?: string; notice?: string } {
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    const spell = SPELL_DEFINITIONS[spellId];
    if (!spell) return { state, success: false, error: 'Unknown spell.' };

    const tObj: AlchemyTarget = typeof target === 'object' && target !== null ? target : {};
    const targetId = typeof target === 'number' ? target : tObj.roomId;

    if (!next.wizard.knownSpells.includes(spellId)) {
      return { state, success: false, error: `You have not learned ${spell.name} yet.` };
    }

    if ((next.wizard.spellCooldowns[spellId] || 0) > 0) {
      return { state, success: false, error: `Spell on cooldown for ${next.wizard.spellCooldowns[spellId]} more reviews.` };
    }

    const hasL3Study = next.rooms.some(
      r => r.defId === 'wizard_study' && r.state === 'built' && !isRoomUnfinished(r) && r.level >= 3
    );
    const manaCost = Math.max(1, Math.round(spell.manaCost * (hasL3Study ? 0.9 : 1)));

    if (next.mana < manaCost) {
      return { state, success: false, error: `Need ${manaCost} Mana to cast ${spell.name}.` };
    }

    // Validate transmute material availability BEFORE charging mana or setting cooldown
    let transmuteSrc: string | undefined;
    let transmuteDst: string | undefined;
    if (spellId === 'transmute') {
      const commonKeys = ['timber', 'stone', 'glass', 'cloth', 'provisions', 'greens', 'fish', 'nectar'] as const;
      const bag = next.resources as unknown as Record<string, number>;
      const sortedDesc = [...commonKeys].sort((a, b) => (bag[b] || 0) - (bag[a] || 0));
      transmuteSrc = tObj.fromResource && (commonKeys as readonly string[]).includes(tObj.fromResource)
        ? tObj.fromResource
        : sortedDesc[0];
      transmuteDst = tObj.toResource && (commonKeys as readonly string[]).includes(tObj.toResource) && tObj.toResource !== transmuteSrc
        ? tObj.toResource
        : sortedDesc.find(k => k !== transmuteSrc) || sortedDesc[sortedDesc.length - 1];
      if ((bag[transmuteSrc] || 0) < 60 || transmuteSrc === transmuteDst) {
        return { state, success: false, error: 'Need at least 60 of a common material to cast Transmute.' };
      }
    }

    next.mana -= manaCost;
    const sbCast = computeSpellbookBonuses(next.spellbooks || []);
    next.wizard.spellCooldowns[spellId] = Math.max(
      1,
      Math.round(spell.cooldownReviews * (1 - sbCast.spellCooldownReductionPct))
    );
    if (!next.activeBuffs) next.activeBuffs = {};

    let notice = `${spell.name} cast! ${spell.effect}`;
    let spellTargetRoomId: number | undefined;

    // Execute effect
    switch (spellId) {
      case 'glow': {
        const target = next.rooms.find(r => r.hazard && (isNightInkType(r.hazard.type) || r.hazard.type === 'echo_loop'));
        if (target) {
          spellTargetRoomId = target.id;
          const floorY = target.y;
          let count = 0;
          for (const r of next.rooms) {
            if (r.area === target.area && r.y === floorY && r.hazard && (isNightInkType(r.hazard.type) || r.hazard.type === 'echo_loop')) {
              clearRoomHazard(next, r);
              count++;
            }
          }
          notice = target.area === 'castle'
            ? `Glow cast! Dispelled ${count} Spill of Night / Echo Loop hazard(s) on Floor ${floorY + 1}.`
            : `Glow cast! Dispelled ${count} Spill of Night / Echo Loop hazard(s) on the Grounds.`;
        } else {
          notice = 'Glow cast! Illuminated the halls (no Spill of Night or Echo Loop active).';
        }
        break;
      }
      case 'dispel': {
        const target = next.rooms.find(r => r.hazard && !r.hazard.isBreach && r.hazard.type !== 'breach' && !['shade_breach', 'gloom_pack', 'veil_rent', 'wanderer'].includes(r.hazard.type));
        if (target && target.hazard) {
          spellTargetRoomId = target.id;
          const hName = target.hazard.name;
          clearRoomHazard(next, target);
          notice = `Dispel cast! ${hName} cleared from ${ROOM_DEFINITIONS[target.defId]?.name || 'room'}.`;
        } else {
          notice = 'Dispel cast! No non-breach hazards active.';
        }
        break;
      }
      case 'foresight': {
        next.activeBuffs.foresightDays = 3;
        next.activeBuffs.foresightSkips = (next.activeBuffs.foresightSkips || 0) + 1;
        ensureUpcomingEventsQueue(next);
        notice = "Foresight cast! Next 3 days' omens revealed and +1 event skip granted.";
        break;
      }
      case 'rift_beacon': {
        next.activeBuffs.riftBeaconActive = true;
        notice = 'Rift Beacon lit! Next expedition gains +3 Rift Fortune and returns 25% sooner.';
        break;
      }
      case 'starlit_conjunction': {
        next.activeBuffs.starlitConjunctionBells = 50;
        notice = 'Starlit Conjunction cast! All classroom essence yields x1.5 for 50 bells.';
        break;
      }
      case 'beckon': {
        const loose = next.creatures.find(c => c.status === 'loose');
        if (loose) {
          spellTargetRoomId = loose.roomId;
          recaptureCreature(next, loose, [], 'Beckon brought');
          notice = `Beckon cast! ${loose.nickname} has returned home safely.`;
        } else {
          notice = 'Beckon cast! (No loose creatures were wandering.)';
        }
        break;
      }
      case 'rain_dance': {
        next.activeBuffs.rainDanceBells = 10;
        notice = 'Rain Dance cast! All plots x1.5 output for 10 bells.';
        break;
      }
      case 'clear_skies': {
        let cleared = 0;
        for (const r of next.rooms) {
          if (r.hazard && (r.hazard.type === 'cold_snap' || r.hazard.type === 'hex_fog')) {
            if (!spellTargetRoomId) spellTargetRoomId = r.id;
            clearRoomHazard(next, r);
            cleared++;
          }
        }
        notice = `Clear Skies cast! Dispelled ${cleared} Cold Snap / Hex Fog hazard(s).`;
        break;
      }
      case 'wild_kinship': {
        const waryList = next.creatures.filter(c => c.status === 'wary');
        if (waryList.length > 0) {
          spellTargetRoomId = waryList[0].roomId;
          const share = Math.max(1, Math.floor(50 / waryList.length));
          let tamedCount = 0;
          for (const w of waryList) {
            w.tamingProgress += share;
            const cDef = CREATURE_DEFINITIONS[w.defId];
            if (cDef && w.tamingProgress >= cDef.tamingReviews) {
              w.status = 'tamed';
              grantTamingOneTimeBonuses(next, w);
              tamedCount++;
            }
          }
          notice = `Wild Kinship cast! +50 taming points split among ${waryList.length} wary creature(s)${tamedCount > 0 ? ` (${tamedCount} tamed!)` : ''}.`;
        } else {
          notice = 'Wild Kinship cast! (No wary creatures present.)';
        }
        break;
      }
      case 'verdant_surge': {
        next.activeBuffs.verdantSurgeBells = 30;
        notice = 'Verdant Surge cast! Food and Herbs output x2 for 30 bells.';
        break;
      }
      case 'mend': {
        const injured = next.characters.find(c => c.injury);
        if (injured && injured.injury) {
          spellTargetRoomId = next.rooms.find(r => r.defId === 'infirmary' && r.state === 'built')?.id ?? injured.bedRoomId;
          injured.injury.points += 30;
          if (injured.injury.points >= injured.injury.required) {
            injured.injury = undefined;
            injured.needs.health = 100;
          }
          notice = `Mend cast! +30 healing points to ${injured.name}.`;
        } else {
          notice = 'Mend cast! (All residents are healthy.)';
        }
        break;
      }
      case 'soothing_light': {
        const builtCastle = next.rooms.filter(r => r.state === 'built' && r.area === 'castle');
        const pool = builtCastle.length > 0 ? builtCastle : next.rooms.filter(r => r.state === 'built');
        const targetArea = pool[0]?.area ?? 'castle';
        const targetFloor = pool[0]?.y ?? 0;
        const floorRoomIds = new Set(next.rooms.filter(r => r.area === targetArea && r.y === targetFloor).map(r => r.id));
        const affected = next.characters.filter(c =>
          (c.seatRoomId && floorRoomIds.has(c.seatRoomId)) ||
          (c.workplaceRoomId && floorRoomIds.has(c.workplaceRoomId)) ||
          (c.bedRoomId && floorRoomIds.has(c.bedRoomId))
        );
        const list = affected.length > 0 ? affected : next.characters;
        for (const c of list) {
          c.needs.composure = Math.min(100, c.needs.composure + 20);
        }
        notice = `Soothing Light cast! Composure +20 for ${list.length} resident(s) on ${targetArea === 'castle' ? `Floor ${targetFloor + 1}` : 'the Grounds'}.`;
        break;
      }
      case 'mend_object': {
        let repairedName: string | undefined;
        for (const r of next.rooms) {
          const dmg = r.furniture.find(f => f.damaged);
          if (dmg) {
            dmg.damaged = false;
            spellTargetRoomId = r.id;
            repairedName = FURNITURE_DEFINITIONS[dmg.defId]?.name || dmg.defId;
            break;
          }
        }
        notice = repairedName
          ? `Mend Object cast! Repaired damaged ${repairedName}.`
          : 'Mend Object cast! (No damaged furniture found.)';
        break;
      }
      case 'sunburst': {
        let count = 0;
        for (const c of next.characters) {
          if (c.injury) {
            c.injury.points += 60;
            if (c.injury.points >= c.injury.required) {
              c.injury = undefined;
              c.needs.health = 100;
            }
            count++;
          }
        }
        notice = `Sunburst cast! +60 healing points to ${count} injured character(s).`;
        break;
      }
      case 'dawn_blessing': {
        next.activeBuffs.dawnBlessingBells = 50;
        let lifted = 0;
        for (const c of next.characters) {
          c.morale = Math.min(100, c.morale + 15);
          if (c.injury?.type === 'hexed') {
            c.injury = undefined;
            c.needs.health = 100;
            lifted++;
          }
        }
        notice = `Dawn Blessing cast! Academy morale +15 for 50 bells${lifted > 0 ? ` and lifted ${lifted} Rift curse(s)` : ''}.`;
        break;
      }
      case 'hush': {
        for (const c of next.characters) {
          c.needs.composure = Math.min(100, c.needs.composure + 5);
        }
        const clearedChains = clearRoomMisbehaviorChains(next, targetId);
        if (targetId != null) spellTargetRoomId = targetId;
        notice = `Hush cast! Misbehavior calmed${clearedChains > 0 ? ` (${clearedChains} chain(s) cleared)` : ''} and Composure +5.`;
        break;
      }
      case 'ward_pulse': {
        next.activeBuffs.wardPulseBells = 10;
        notice = 'Ward Pulse cast! No hazards can emerge for 10 bells.';
        break;
      }
      case 'banish': {
        const breachRoom = next.rooms.find(
          r => r.hazard && (r.hazard.isBreach || ['breach', 'shade_breach', 'gloom_pack', 'veil_rent', 'wanderer'].includes(r.hazard.type))
        );
        if (breachRoom) {
          spellTargetRoomId = breachRoom.id;
          clearRoomHazard(next, breachRoom);
          notice = `Banish cast! Breach in ${ROOM_DEFINITIONS[breachRoom.defId]?.name || 'room'} resolved immediately.`;
        } else {
          notice = 'Banish cast! (No active breach found.)';
        }
        break;
      }
      case 'veil_stitch': {
        next.veil.strength = Math.min(100, next.veil.strength + 20);
        notice = 'Veil Stitch cast! Veil strength surged by +20%.';
        break;
      }
      case 'moonless_night': {
        next.activeBuffs.moonlessNightBells = 50;
        notice = 'Moonless Night cast! Hazards and misbehavior -60% for 50 bells.';
        break;
      }
      case 'tidy_wind': {
        const built = next.rooms.filter(r => r.state === 'built');
        const dirtiest = [...built].sort((a, b) => a.cleanliness - b.cleanliness)[0];
        if (dirtiest) {
          const floorY = dirtiest.y;
          spellTargetRoomId = dirtiest.id;
          for (const r of next.rooms) {
            if (r.area === dirtiest.area && r.y === floorY) r.cleanliness = 100;
          }
          notice = dirtiest.area === 'castle'
            ? `Tidy Wind cast! Floor ${floorY + 1} restored to 100 cleanliness.`
            : 'Tidy Wind cast! Sacred Grounds restored to 100 cleanliness.';
        } else {
          notice = 'Tidy Wind cast! (No built rooms to clean.)';
        }
        break;
      }
      case 'douse': {
        const target =
          next.rooms.find(r => r.hazard && (r.hazard.type === 'kitchen_fire' || r.hazard.type === 'bubbling_cauldron'))
          || next.rooms.find(r => r.hazard)
          || next.rooms.find(r => r.state === 'built');
        if (target) {
          spellTargetRoomId = target.id;
          if (target.hazard) clearRoomHazard(next, target);
          next.activeBuffs.fireproofBells = Math.max(next.activeBuffs.fireproofBells || 0, 20);
          next.activeBuffs.fireproofRoomId = target.id;
          notice = `Douse cast! ${ROOM_DEFINITIONS[target.defId]?.name || 'Room'} fireproofed for 20 bells.`;
        }
        break;
      }
      case 'quickening': {
        const activeSite = next.rooms.find(r => r.state === 'site');
        if (activeSite) {
          spellTargetRoomId = activeSite.id;
          activeSite.buildProgress += 25;
          if (activeSite.buildProgress >= activeSite.buildRequired) AnkicasterEngine.completeSite(next, activeSite);
          notice = `Quickening cast! +25 progress points granted to ${activeSite.defId}.`;
        } else {
          notice = 'Quickening cast! (No active construction site.)';
        }
        break;
      }
      case 'transmute': {
        if (transmuteSrc && transmuteDst) {
          const bag = next.resources as unknown as Record<string, number>;
          bag[transmuteSrc] -= 60;
          bag[transmuteDst] = (bag[transmuteDst] || 0) + 50;
          notice = `Transmute cast! 60 ${transmuteSrc} transmuted into 50 ${transmuteDst}.`;
        }
        break;
      }
      case 'philosophers_hour': {
        next.activeBuffs.philosophersHourBrews = 3;
        notice = "Philosopher's Hour cast! Next 3 brews complete instantly with x2 yield.";
        break;
      }
    }

    const studyRoomId = next.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built')?.id;
    next.notices.push({
      id: uniqueNoticeId('spell', next),
      time: Date.now(),
      type: 'spell',
      text: notice,
      data: {
        spellId,
        school: spell.school,
        roomId: spellTargetRoomId ?? studyRoomId,
        visualEventType: 'spell_cast'
      }
    });
    logResourceDiff(next, beforeRes, spell.name || 'Spell');
    syncCharmRenown(next);

    return { state: next, success: true, notice };
  }

  /**
   * Brew a Potion in the Alchemy Lab
   */
  static brewPotion(
    state: FullGameState,
    potionId: string
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    const potion = next.potions.find(p => p.id === potionId);
    if (!potion) return { state, success: false, error: 'Potion recipe not found.' };
    if (!potion.discovered) return { state, success: false, error: `${potion.name} recipe is not discovered yet.` };

    const labs = next.rooms.filter(r => r.defId === 'alchemy_lab' && r.state === 'built' && !isRoomUnfinished(r));
    if (labs.length === 0) {
      return { state, success: false, error: 'Requires a built and furnished Alchemy Lab.' };
    }

    const activeAlchemistsForLab = (labId: number) =>
      next.characters.filter(
        c => c.career === 'alchemist' && c.careerState === 'active' && c.status !== 'away' && !c.injury && c.workplaceRoomId === labId
      );

    if (potion.tier !== 'basic') {
      const hasAnyAlch = labs.some(l => activeAlchemistsForLab(l.id).length > 0);
      if (!hasAnyAlch) {
        return {
          state,
          success: false,
          error: `${potion.name} (${potion.tier}) requires an Alchemist on duty in the Alchemy Lab.`
        };
      }
    }

    const eligibleLabs = potion.tier !== 'basic'
      ? labs.filter(l => activeAlchemistsForLab(l.id).length > 0)
      : [...labs].sort((a, b) => activeAlchemistsForLab(b.id).length - activeAlchemistsForLab(a.id).length);

    if (!next.brewingQueue) next.brewingQueue = [];
    const hasPhilosophersHour = (next.activeBuffs?.philosophersHourBrews || 0) > 0;
    const isBasicInstant = (l: PlacedRoom) =>
      potion.tier === 'basic' && (l.furniture || []).some(f => f.defId === 'everburning_athanor' && !f.damaged);

    let chosenLab = eligibleLabs[0];
    let chosenStation = 0;
    const instantEligible = hasPhilosophersHour ? chosenLab : eligibleLabs.find(isBasicInstant);
    if (instantEligible) {
      chosenLab = instantEligible;
    } else {
      let foundSlot = false;
      for (const l of eligibleLabs) {
        const cap = l.level >= 3 ? 3 : 2;
        const usedStations = new Set(next.brewingQueue.filter(j => j.roomId === l.id).map(j => j.stationIndex));
        for (let sIdx = 0; sIdx < cap; sIdx++) {
          if (!usedStations.has(sIdx)) {
            chosenLab = l;
            chosenStation = sIdx;
            foundSlot = true;
            break;
          }
        }
        if (foundSlot) break;
      }
      if (!foundSlot) {
        return { state, success: false, error: 'All Alchemy Lab brewing stations are busy.' };
      }
    }

    const bag = next.resources as unknown as Record<string, number>;
    const missing = potion.ingredients.filter(ing => (bag[ing] || 0) < 1);
    if (missing.length > 0) {
      return { state, success: false, error: `Missing ingredients: ${missing.join(', ')}.` };
    }

    const brewBonus = academyFurnitureEffect(next.rooms, 'brew_speed_pct', chosenLab);
    const alchemists = activeAlchemistsForLab(chosenLab.id);
    const alchMult = alchemists.length > 0
      ? Math.max(...alchemists.map(a => careerAffinityMultiplier(a.masteredSchools, 'alchemist', potion.school)))
      : 1;
    const baseManaCost = Math.max(10, Math.round(30 * Math.max(0.5, 1 - brewBonus / 100)));
    const manaCost = hasPhilosophersHour ? 0 : Math.max(10, Math.round(baseManaCost / alchMult));
    if (next.mana < manaCost) {
      return { state, success: false, error: `Need ${manaCost} Mana for alchemical reagent catalyst.` };
    }

    next.mana -= manaCost;
    for (const ing of potion.ingredients) {
      bag[ing] -= 1;
    }
    logResourceDiff(next, beforeRes, `Brew ${potion.name}`);

    const usedAlchemist = alchemists.length > 0;
    if (hasPhilosophersHour || isBasicInstant(chosenLab)) {
      if (hasPhilosophersHour && next.activeBuffs) {
        next.activeBuffs.philosophersHourBrews = (next.activeBuffs.philosophersHourBrews || 1) - 1;
      }
      completeBrewJob(next, potionId, chosenLab, usedAlchemist, hasPhilosophersHour);
      return { state: next, success: true };
    }

    const hasAlembicArray = (chosenLab.furniture || []).some(f => f.defId === 'alembic_array' && !f.damaged);
    const baseReviews = potion.reviewsToBrew || (potion.tier === 'basic' ? 20 : potion.tier === 'advanced' ? 40 : potion.tier === 'rare' ? 80 : 120);
    const required = Math.max(1, Math.round(baseReviews * (hasAlembicArray ? 0.8 : 1)));
    const jobId = uniqueNumericId(next.brewingQueue.map(j => j.id));

    next.brewingQueue.push({
      id: jobId,
      recipeId: potionId,
      stationIndex: chosenStation,
      roomId: chosenLab.id,
      progress: 0,
      required,
      usedAlchemist
    });

    next.notices.push({
      id: uniqueNoticeId('brew-start', next),
      time: Date.now(),
      type: 'alchemy',
      text: `⚗️ Started brewing ${potion.name} on Station ${chosenStation + 1} (${required} reviews${usedAlchemist ? ', Alchemist x2 speed' : ''}).`,
      data: {
        potionId,
        roomId: chosenLab.id,
        school: potion.school
      }
    });

    return { state: next, success: true };
  }

  /**
   * Draw 3 cards, keep 1 (BR-26). Foundation 50, Grounds 50, Magic 100.
   * Each draw this term raises that deck's price by 5%.
   */
  static drawDraftCards(
    state: FullGameState,
    deck: DraftDeckId,
    rng: () => number = Math.random
  ): { state: FullGameState; cards: DraftCard[]; cost: number; error?: string; tutorial?: string } {
    const next = structuredClone(state);
    const cost = deckPrice(next, deck);

    if (next.mana < cost) {
      return { state, cards: [], cost, error: `Need ${cost} Mana to draft from the ${deck} deck.` };
    }

    const tutorial = (next.draftsCompleted || 0) === 0 ? DRAFT_TUTORIAL : undefined;
    next.mana -= cost;
    next.draftHistory = { ...(next.draftHistory || {}) };
    next.draftHistory[deck] = (next.draftHistory[deck] || 0) + 1;

    const chronoAvailable = creatureSpeciesBuffSum(next, 'chronoflare_owl') > 0 && next.lastChronoflareDraftDay !== next.day;
    const cardCount = chronoAvailable ? 4 : 3;
    if (chronoAvailable) {
      next.lastChronoflareDraftDay = next.day;
    }

    const cards = dealDraft(next, deck, rng, cardCount);
    const hadRoom = cards.some(c => c.type === 'blueprint');
    next.roomlessStreak = { ...(next.roomlessStreak || {}) };
    next.roomlessStreak[deck] = hadRoom ? 0 : (next.roomlessStreak[deck] || 0) + 1;

    next.foundingDraws = { foundation: 0, grounds: 0, ...(next.foundingDraws || {}) };
    if (deck === 'foundation') next.foundingDraws.foundation += 1;
    if (deck === 'grounds') next.foundingDraws.grounds += 1;
    next.draftsCompleted = (next.draftsCompleted || 0) + 1;

    return { state: next, cards, cost, tutorial };
  }

  /**
   * Spend 1 draftRerollToken (from Starlight Ink) to re-deal 3 cards for the current draft deck.
   */
  static rerollDraftCards(
    state: FullGameState,
    deck: DraftDeckId,
    rng: () => number = Math.random
  ): { state: FullGameState; cards: DraftCard[]; success: boolean; error?: string } {
    if ((state.draftRerollTokens || 0) <= 0) {
      return { state, cards: [], success: false, error: 'No draft reroll tokens available.' };
    }
    const next = structuredClone(state);
    next.draftRerollTokens = (next.draftRerollTokens || 0) - 1;
    const cards = dealDraft(next, deck, rng);
    return { state: next, cards, success: true };
  }

  /**
   * Choose one draft card (Draw 3, Keep 1)
   */
  static chooseDraftCard(
    state: FullGameState,
    card: DraftCard
  ): { state: FullGameState; message: string } {
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    let message = `Selected ${card.name}!`;
    let spawnedCreatureId: number | undefined;

    if (card.type === 'blueprint' && card.targetId) {
      next.roomPlans = { ...(next.roomPlans || {}) };
      next.roomPlans[card.targetId] = (next.roomPlans[card.targetId] || 0) + 1;
      for (const reqFid of requiredFixturesForRoom(card.targetId)) {
        if (!next.knownPatterns.includes(reqFid)) next.knownPatterns.push(reqFid);
      }
      message = `Kept a ${ROOM_DEFINITIONS[card.targetId]?.name || card.name} plan. It can be built once.`;
    } else if (card.type === 'furniture_pattern' && card.targetId) {
      if (!next.knownPatterns.includes(card.targetId)) next.knownPatterns.push(card.targetId);
      message = `Learned furniture pattern for ${card.name}!`;
    } else if (card.type === 'seed' && card.targetId) {
      if (!next.resources.seedsUnlocked.includes(card.targetId)) {
        next.resources.seedsUnlocked.push(card.targetId);
      }
      message = `Unlocked ${card.name} for your grounds plots!`;
    } else if (card.type === 'recipe_page' && card.targetId) {
      const recipe = next.potions.find(p => p.id === card.targetId);
      if (recipe) recipe.discovered = true;
      message = `Discovered potion recipe: ${recipe?.name || card.name}!`;
    } else if (card.type === 'boon') {
      if (card.name.includes('Supply')) {
        next.resources.timber += 45;
        next.resources.stone += 30;
        next.resources.glass += 10;
        message = 'Supply crate unpacked: +45 Timber, +30 Stone, +10 Glass!';
      } else if (card.name.includes('Astral')) {
        next.resources.insight += 50;
        next.resources.crystal += 2;
        message = 'Astral Influx absorbed: +50 Insight, +2 Crystal!';
      } else if (card.name.includes('Dawn')) {
        next.resources.radiance += 30;
        const injured = next.characters.find(c => !!c.injury);
        if (injured) {
          injured.injury = undefined;
          injured.needs.health = 100;
          message = `Dawn Blessing received: +30 Radiance and cured ${injured.name}!`;
        } else {
          message = 'Dawn Blessing received: +30 Radiance!';
        }
      } else if (card.name.includes('Veil')) {
        next.veil.strength = Math.min(100, next.veil.strength + 35);
        next.resources.umbra += 25;
        message = 'Veil Tether attuned: +35% Veil Strength, +25 Umbra!';
      }
    } else if (card.type === 'lure') {
      const creatureDefId = (card.targetId && card.targetId in CREATURE_DEFINITIONS) ? card.targetId : 'bramblefox';
      spawnedCreatureId = uniqueNumericId(next.creatures.map(c => c.id));
      next.creatures.push({
        id: spawnedCreatureId,
        defId: creatureDefId,
        nickname: 'Wild Wanderer',
        status: 'wary',
        hungry: false,
        hatchProgress: 0,
        tamingProgress: 0,
        bondLevel: 1,
        bondProgress: 0,
        arrivedDay: next.day
      });
      syncDiscoveredCreatures(next);
      message = 'Creature lure was successful! A wild creature arrived outside your habitat.';
    }

    const studyRoomId = next.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built')?.id
      ?? next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built')?.id;
    next.notices.push({
      id: uniqueNoticeId('draft-pick', next),
      time: Date.now(),
      type: 'draft',
      text: message,
      data: {
        roomId: studyRoomId,
        creatureId: spawnedCreatureId,
        visualEventType: 'draft_picked'
      }
    });
    logResourceDiff(next, beforeRes, card.name);

    return { state: next, message };
  }

  /**
   * Resolve an active academy gate event (BR-28)
   */
  static resolveEvent(
    state: FullGameState,
    eventId: string,
    action: string
  ): { state: FullGameState; summary: string } {
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    next.activeEvents = next.activeEvents.filter(e => e.eventId !== eventId);

    let summary = 'Event resolved.';
    let spawnedCreatureId: number | undefined;

    switch (action) {
      case 'send_owl':
        next.renown += 5;
        summary = 'The owl cooed gratefully and flew toward the high tower (+5 Renown).';
        break;
      case 'peek_letter':
        next.resources.insight += 10;
        summary = 'You deciphered stellar alignments from the parchment (+10 Insight).';
        break;
      case 'perch_owl':
        next.renown += 3;
        summary = 'The owl settled on the rooftop as an academy sentinel (+3 Renown).';
        break;
      case 'buy_bed':
        if (next.mana >= 150) {
          next.mana -= 150;
          if (!next.knownPatterns.includes('canopy_bed')) next.knownPatterns.push('canopy_bed');
          summary = 'Purchased Canopy Bed blueprint from the Curio Cart!';
        } else {
          summary = 'Insufficient mana for the curio purchase.';
        }
        break;
      case 'buy_lantern':
        if (next.mana >= 120) {
          next.mana -= 120;
          if (!next.knownPatterns.includes('ward_lantern')) next.knownPatterns.push('ward_lantern');
          summary = 'Purchased Ward Lantern blueprint from the Curio Cart!';
        } else {
          summary = 'Insufficient mana for the curio purchase.';
        }
        break;
      case 'keep_creature':
        spawnedCreatureId = uniqueNumericId(next.creatures.map(c => c.id));
        next.creatures.push({
          id: spawnedCreatureId,
          defId: 'velvet_bat_swarm',
          nickname: 'Doorstep Rescued',
          status: 'wary',
          hungry: false,
          hatchProgress: 0,
          tamingProgress: 0,
          bondLevel: 1,
          bondProgress: 0,
          arrivedDay: next.day
        });
        summary = 'Welcomed the gentle creature into the school grounds!';
        break;
      case 'pass_creature':
        next.renown += 5;
        summary = 'Safely transferred the creature to the wild sanctuary (+5 Renown).';
        break;
      case 'sing':
        next.characters.forEach(c => {
          c.needs.composure = Math.min(100, c.needs.composure + 5);
          c.morale = Math.min(100, c.morale + 5);
        });
        summary = 'The song lifted spirits throughout the entire academy (+5 Morale & Composure)!';
        break;
      case 'bake_cake':
        if (next.resources.provisions >= 20) {
          next.resources.provisions -= 20;
          next.characters.forEach(c => {
            c.needs.leisure = Math.min(100, c.needs.leisure + 20);
            c.morale = Math.min(100, c.morale + 10);
          });
          summary = 'A joyous honey cake feast was enjoyed by all in the refectory!';
        } else {
          summary = 'Not enough provisions for the honey cake feast.';
        }
        break;
      case 'plant_seed':
        if (!next.resources.seedsUnlocked.includes('astral_lotus')) {
          next.resources.seedsUnlocked.push('astral_lotus');
        }
        summary = 'Planted the luminescent seeds; Astral Lotus unlocked for cultivation!';
        break;
      case 'grind_seed':
        next.resources.herbs += 30;
        summary = 'Ground the rare seeds into 30 fragrant medicinal Herbs!';
        break;
      case 'observe_comet':
        next.resources.insight += 25;
        summary = 'Starlight observations completed from the Observatory (+25 Insight)!';
        break;
      case 'crystal_comet':
        next.resources.crystal = (next.resources.crystal || 0) + 2;
        summary = 'Harmonized courtyard ward crystals (+2 Crystal)!';
        break;
      case 'wish_comet':
        next.characters.forEach(c => {
          c.needs.composure = Math.min(100, c.needs.composure + 15);
          c.morale = Math.min(100, c.morale + 15);
        });
        summary = 'The student body gathered to make wishes (+15 Composure & Morale)!';
        break;
      case 'trade_sunstone':
        if (next.resources.reagents >= 20) {
          next.resources.reagents -= 20;
          next.resources.sunstone = (next.resources.sunstone || 0) + 1;
          summary = 'Exchanged 20 Reagents for a brilliant Sunstone with the alchemist!';
        } else {
          summary = 'Not enough Reagents to complete trade.';
        }
        break;
      case 'demo_brew':
        next.resources.reagents += 20;
        next.renown += 5;
        summary = 'Joint potion demonstration was a resounding success (+20 Reagents, +5 Renown)!';
        break;
      case 'water_bread':
        next.renown += 5;
        summary = 'The alchemist bowed warmly and shared travel tales (+5 Renown).';
        break;
      case 'shelter_fox':
        spawnedCreatureId = uniqueNumericId(next.creatures.map(c => c.id));
        next.creatures.push({
          id: spawnedCreatureId,
          defId: 'bramblefox',
          nickname: 'Azure Bramblefox',
          status: 'wary',
          hungry: false,
          hatchProgress: 0,
          tamingProgress: 0,
          bondLevel: 1,
          bondProgress: 0,
          arrivedDay: next.day
        });
        summary = 'Bramblefox welcomed warmly into the meadow habitat as a wary friend!';
        break;
      case 'return_fox':
        next.renown += 15;
        summary = 'Safely returned the lost familiar to its guildmaster in the capital (+15 Renown)!';
        break;
      case 'feed_fox':
        next.resources.herbs += 15;
        summary = 'Fed sweet berries to the fox; it left behind fresh wild herbs (+15 Herbs).';
        break;
      case 'tour_inspector':
        next.renown += 20;
        summary = 'The imperial envoy was thoroughly impressed by Academy standards (+20 Renown)!';
        break;
      case 'feast_inspector':
        if (next.resources.provisions >= 15) {
          next.resources.provisions -= 15;
          next.renown += 15;
          next.characters.forEach(c => { c.morale = Math.min(100, c.morale + 5); });
          summary = 'The envoy praised the refectory feast (+15 Renown, +5 Morale)!';
        } else {
          next.renown += 5;
          summary = 'Offered tea to the envoy (+5 Renown).';
        }
        break;
      case 'greet_inspector':
        next.renown += 8;
        summary = 'Polite ceremonial greetings exchanged (+8 Renown).';
        break;
      case 'buy_grimoire':
        if (next.mana >= 150) {
          next.mana -= 150;
          next.resources.insight += 30;
          summary = 'Studied the illuminated Arcane Tome (+30 Insight)!';
        } else {
          summary = 'Insufficient mana for grimoire purchase.';
        }
        break;
      case 'barter_scrolls':
        if (next.resources.timber >= 25) {
          next.resources.timber -= 25;
          next.resources.insight += 25;
          next.renown += 5;
          summary = 'Bartered timber for architectural scrolls (+25 Insight, +5 Renown)!';
        } else {
          summary = 'Insufficient timber for barter.';
        }
        break;
      case 'pass_books':
        summary = 'Politely bid farewell to the wandering scholar.';
        break;
      case 'geyser_veil':
        next.veil.strength = Math.min(100, next.veil.strength + 20);
        summary = 'Harmonic leyline pulse resonated with the Veil Dome (+20% Strength)!';
        break;
      case 'geyser_mana':
        next.resources.insight += 25;
        next.resources.crystal += 2;
        summary = 'Condensed crystalline essence from the leyline spring (+25 Insight, +2 Crystal)!';
        break;
      case 'geyser_garden':
        next.resources.provisions += 30;
        next.resources.herbs += 15;
        summary = 'Grounds gardens irrigated with latent springwater (+30 Provisions, +15 Herbs)!';
        break;
      case 'host_troupe':
        next.characters.forEach(c => {
          c.needs.leisure = Math.min(100, c.needs.leisure + 25);
          c.morale = Math.min(100, c.morale + 15);
        });
        summary = 'Grand midsummer drama filled the Great Hall (+25 Leisure, +15 Morale)!';
        break;
      case 'ballad_troupe':
        if (next.mana >= 50) {
          next.mana -= 50;
          next.renown += 15;
          summary = 'A heroic ballad of the Academy spreads across the realm (+15 Renown)!';
        } else {
          next.renown += 5;
          summary = 'Troupe sang an impromptu chorus (+5 Renown).';
        }
        break;
      case 'lawn_troupe':
        next.renown += 5;
        summary = 'Charming lawn performance delighted onlookers (+5 Renown).';
        break;
      case 'harvest_umbra':
        next.resources.umbra += 25;
        summary = 'Distilled essence of the violet eclipse (+25 Umbra)!';
        break;
      case 'fortify_umbra':
        if (next.mana >= 50) {
          next.mana -= 50;
          next.veil.strength = Math.min(100, next.veil.strength + 15);
          summary = 'Reinforced shadow ward lattices (+15% Veil Strength)!';
        } else {
          summary = 'Insufficient mana to fortify wards.';
        }
        break;
      case 'meditate_umbra':
        next.characters.forEach(c => {
          c.needs.composure = Math.min(100, c.needs.composure + 20);
        });
        summary = 'Sanctuary meditation brought deep inner composure (+20 Composure)!';
        break;
      case 'harvest_orchard':
        next.resources.provisions += 40;
        next.resources.nectar += 10;
        summary = 'Bountiful orchard harvest collected (+40 Provisions, +10 Nectar)!';
        break;
      case 'cider_orchard':
        next.resources.nectar += 15;
        next.characters.forEach(c => { c.morale = Math.min(100, c.morale + 15); });
        summary = 'Sparkling cider enjoyed throughout the grounds (+15 Nectar, +15 Morale)!';
        break;
      case 'gift_orchard':
        next.renown += 15;
        summary = 'Donated fresh fruit crates to neighboring towns (+15 Renown)!';
        break;
      case 'repair_golem':
        if (next.mana >= 40) {
          next.mana -= 40;
          next.resources.stone += 40;
          next.resources.golem_core = (next.resources.golem_core || 0) + 1;
          summary = 'Recharged dormant core; salvaged ancient golem parts (+40 Stone, +1 Golem Core)!';
        } else {
          summary = 'Insufficient mana to recharge core.';
        }
        break;
      case 'salvage_golem':
        next.resources.stone += 30;
        next.resources.insight += 10;
        summary = 'Carefully transcribed runes and salvaged stone (+30 Stone, +10 Insight)!';
        break;
      case 'statue_golem':
        next.renown += 5;
        summary = 'The mossy golem makes a stately academy garden monument (+5 Renown).';
        break;
      case 'healer_cure':
        next.characters.forEach(c => { c.injury = undefined; c.needs.health = 100; });
        summary = 'Silver Spring doctor treated all injuries across the Academy infirmary!';
        break;
      case 'healer_herbs':
        next.resources.herbs += 30;
        summary = 'Exchanged rare dried botanical specimens (+30 Herbs)!';
        break;
      case 'healer_donate':
        if (next.mana >= 30) {
          next.mana -= 30;
          next.renown += 10;
          summary = 'Donated to the traveling herbal clinic (+10 Renown)!';
        } else {
          summary = 'Insufficient mana for donation.';
        }
        break;
      case 'astral_debate':
        next.resources.insight += 25;
        summary = 'Fascinating cosmological debate with the spectral scholar (+25 Insight)!';
        break;
      case 'astral_rift':
        next.renown += 15;
        summary = 'Recorded astral drift coordinates for Rift navigation (+15 Renown)!';
        break;
      case 'astral_peace':
        next.characters.forEach(c => { c.needs.composure = Math.min(100, c.needs.composure + 15); });
        summary = 'Scholarly spectral blessing soothed the dormitories (+15 Composure)!';
        break;
      case 'bubble_reagents':
        next.resources.reagents += 20;
        summary = 'Distilled magical bubbles into laboratory flasks (+20 Reagents)!';
        break;
      case 'bubble_light':
        next.resources.radiance += 15;
        summary = 'Absorbed radiant bubbles into ward lanterns (+15 Radiance)!';
        break;
      case 'bubble_fun':
        next.characters.forEach(c => { c.morale = Math.min(100, c.morale + 10); });
        summary = 'Apprentices chased floating bubbles through the cloisters (+10 Morale)!';
        break;
      case 'fix_wagon':
        if (next.resources.timber >= 20) {
          next.resources.timber -= 20;
          next.resources.cloth += 25;
          next.resources.glass += 15;
          summary = 'Assisted merchant convoy; rewarded with fine silks and glassware (+25 Cloth, +15 Glass)!';
        } else {
          summary = 'Insufficient timber to repair wagon.';
        }
        break;
      case 'trade_wagon':
        if (next.resources.timber >= 25) {
          next.resources.timber -= 25;
          next.resources.provisions += 30;
          summary = 'Traded seasoned timber for fine merchant rations (+30 Provisions)!';
        } else {
          summary = 'Insufficient timber for trade.';
        }
        break;
      case 'shelter_wagon':
        next.renown += 10;
        summary = 'Sheltered merchants for the night (+10 Renown)!';
        break;
      case 'collect_starmetal':
        next.resources.starmetal = (next.resources.starmetal || 0) + 2;
        summary = 'Gathered fallen stardust nodules from the courtyard (+2 Starmetal)!';
        break;
      case 'starlight_mana':
        next.resources.insight += 20;
        next.resources.radiance += 20;
        summary = 'Capacitor attuned to starlight pulse (+20 Insight, +20 Radiance)!';
        break;
      case 'starlight_picnic':
        next.characters.forEach(c => {
          c.needs.rest = Math.min(100, c.needs.rest + 25);
          c.morale = Math.min(100, c.morale + 25);
        });
        summary = 'Midnight meteor watching refreshed all students (+25 Rest & Morale)!';
        break;
      case 'grant_mana':
        next.resources.insight += 40;
        next.renown += 15;
        summary = 'Received Arcanum research fellowship (+40 Insight, +15 Renown)!';
        break;
      case 'grant_mats':
        next.resources.timber += 40;
        next.resources.stone += 40;
        summary = 'Received Arcanum materials convoy (+40 Timber, +40 Stone)!';
        break;
      case 'grant_curios':
        next.resources.reagents += 10;
        next.resources.insight += 10;
        summary = 'Unpacked ministerial laboratory curios (+10 Reagents, +10 Insight)!';
        break;
      case 'tune_bells':
        if (next.mana >= 75) {
          next.mana -= 75;
          next.renown += 15;
          summary = 'Clockwork horologist tuned bell harmonics perfectly (+15 Renown)!';
        } else {
          summary = 'Insufficient mana for horology tuning.';
        }
        break;
      case 'trade_clock':
        if ((next.resources.crystal || 0) >= 1) {
          next.resources.crystal -= 1;
          next.resources.golem_core = (next.resources.golem_core || 0) + 1;
          next.resources.glass += 10;
          summary = 'Exchanged crystal for an intricate Golem Core & precision glass (+1 Core, +10 Glass)!';
        } else {
          summary = 'Insufficient crystal for clock trade.';
        }
        break;
      case 'pass_clock':
        next.renown += 2;
        summary = 'Exchanged courteous greetings with the artificer (+2 Renown).';
        break;
      case 'heron_light':
        next.resources.radiance += 20;
        summary = 'Luminous plumage bathed the water gardens (+20 Radiance)!';
        break;
      case 'heron_feed':
        if (next.resources.provisions >= 10) {
          next.resources.provisions -= 10;
          next.renown += 10;
          next.characters.forEach(c => { c.morale = Math.min(100, c.morale + 15); });
          summary = 'Fed grains to celestial herons (+10 Renown, +15 Morale)!';
        } else {
          summary = 'Insufficient provisions to feed birds.';
        }
        break;
      case 'heron_chart':
        next.resources.insight += 15;
        summary = 'Charted celestial migratory path in the library (+15 Insight)!';
        break;
      case 'bequest_mana':
        next.resources.insight += 30;
        next.renown += 15;
        summary = 'Alumni scholarship endowment deposited (+30 Insight, +15 Renown)!';
        break;
      case 'bequest_books':
        next.resources.insight += 25;
        summary = 'Unpacked rare astronomical volumes donated by graduate (+25 Insight)!';
        break;
      case 'bequest_plaque':
        next.renown += 15;
        summary = 'Hung court astrologer commendation in Great Hall (+15 Renown)!';
        break;
      case 'solstice_banquet':
        if (next.resources.provisions >= 15) {
          next.resources.provisions -= 15;
          next.characters.forEach(c => {
            c.needs.hunger = 100;
            c.needs.rest = 100;
            c.needs.leisure = 100;
            c.needs.composure = 100;
            c.morale = 100;
          });
          summary = 'Grand Solstice Feast restored all student needs to 100%!';
        } else {
          summary = 'Insufficient provisions for Solstice banquet.';
        }
        break;
      case 'solstice_radiance':
        next.resources.radiance += 35;
        summary = 'Solar collectors focused midday rays (+35 Radiance)!';
        break;
      case 'solstice_veil':
        next.veil.strength = Math.min(100, next.veil.strength + 15);
        next.renown += 10;
        summary = 'Consecrated boundary stones (+15% Veil Strength, +10 Renown)!';
        break;
      case 'pass_curio':
        summary = 'Politely declined the peddler’s wares for now.';
        break;
      default:
        summary = 'The matter was handled gracefully by the Academy staff.';
    }

    syncDiscoveredCreatures(next);
    const hallId = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built')?.id;
    next.notices.push({
      id: uniqueNoticeId('evt', next),
      time: Date.now(),
      type: 'event',
      text: summary,
      data: {
        eventId,
        roomId: hallId,
        creatureId: spawnedCreatureId,
        visualEventType: 'school_event_resolved'
      }
    });
    logResourceDiff(next, beforeRes, 'Gate event');
    checkEndlessSpellbookMilestones(next);

    return { state: next, summary };
  }

  /**
   * Player action: Reinforce the Veil (§18.3)
   * Costs 1x today's Veil upkeep mana, boosts Veil strength +15 (max 100), and ends any active Veil Rent breaches.
   */
  static reinforceVeil(
    state: FullGameState
  ): { state: FullGameState; success: boolean; error?: string; clearedRents?: number } {
    const next = structuredClone(state);
    const veilSummary = computeAcademyVeilSummary(next);
    next.veil.costToday = veilSummary.cost;
    next.veil.reductions = veilSummary.reductions;
    const cost = Math.max(1, veilSummary.cost);
    if (next.mana < cost) {
      return { state, success: false, error: `Need ${cost} Mana (1x daily Veil upkeep) to reinforce the Veil.` };
    }
    next.mana -= cost;
    next.veil.strength = Math.min(100, next.veil.strength + 15);
    let clearedRents = 0;
    for (const room of next.rooms) {
      if (room.hazard?.type === 'veil_rent') {
        clearRoomHazard(next, room);
        clearedRents++;
      }
    }
    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];
    next.notices.push({
      id: uniqueNoticeId('veil-reinforce', next),
      time: Date.now(),
      type: 'veil',
      text: `🛡️ Reinforced the Veil (${cost} mana): strength is now ${next.veil.strength}%${clearedRents > 0 ? ` and sealed ${clearedRents} Veil Rent` : ''}.`,
      data: { roomId: ehRoom?.id }
    });
    return { state: next, success: true, clearedRents };
  }

  /**
   * Resolve a Wanderer from Beyond breach (§19.4): feed 20 Provisions or engage an active Tamer.
   */
  static resolveWanderer(
    state: FullGameState,
    roomId: number,
    method: 'feed' | 'tame'
  ): { state: FullGameState; success: boolean; error?: string; message?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room || room.hazard?.type !== 'wanderer') {
      return { state, success: false, error: 'No Wanderer from Beyond present in this room.' };
    }

    if (method === 'feed') {
      if (next.resources.provisions < 20) {
        return { state, success: false, error: 'Need 20 Provisions to feed the Wanderer.' };
      }
      const beforeRes = resourceSnapshot(next);
      next.resources.provisions -= 20;
      clearRoomHazard(next, room, undefined, 'fed 20 Provisions');
      logResourceDiff(next, beforeRes, 'Fed Wanderer from Beyond');
      const msg = '🍖 Fed the Wanderer 20 Provisions — it drifted peacefully back beyond the Veil.';
      next.notices.push({
        id: uniqueNoticeId('wanderer-fed', next),
        time: Date.now(),
        type: 'hazard',
        text: msg,
        data: { roomId, hazardType: 'wanderer', visualEventType: 'hazard_cleared' }
      });
      return { state: next, success: true, message: msg };
    }

    const activeTamers = next.characters.filter(
      c => c.career === 'tamer' && c.careerState === 'active' && c.status !== 'away' && !c.injury
    );
    if (activeTamers.length === 0) {
      return { state, success: false, error: 'Requires an active Tamer on duty to tame the Wanderer.' };
    }
    const req = room.hazard.tamingRequired || 160;
    const prog = room.hazard.tamingProgress || 0;
    if (prog >= req) {
      const rareDefs = Object.values(CREATURE_DEFINITIONS).filter(cd => cd.rarity === 'rare');
      const pool = rareDefs.length > 0 ? rareDefs : Object.values(CREATURE_DEFINITIONS);
      const pickedDef = pool[Math.floor(Math.random() * pool.length)];
      clearRoomHazard(next, room, undefined, 'tamed');
      if (pickedDef) {
        const newCid = uniqueNumericId(next.creatures.map(c => c.id));
        next.creatures.push({
          id: newCid,
          defId: pickedDef.id,
          nickname: pickedDef.name,
          status: 'tamed',
          hungry: false,
          hatchProgress: 0,
          tamingProgress: pickedDef.tamingReviews,
          bondLevel: 1,
          bondProgress: 0,
          arrivedDay: next.day
        });
        syncDiscoveredCreatures(next);
      }
      return { state: next, success: true, message: `🌟 Tamed the Wanderer into a ${pickedDef?.name || 'rare creature'}!` };
    }
    const mult = Math.max(...activeTamers.map(t => careerAffinityMultiplier(t.masteredSchools, 'tamer')));
    room.hazard.tamingProgress = Math.min(req, prog + Math.round(10 * mult));
    return {
      state: next,
      success: true,
      message: `🐾 Your Tamer is coaxing the Wanderer (${Math.round(room.hazard.tamingProgress)}/${req} reviews; advances with honest reviews).`
    };
  }

  /**
   * How many days of upcoming events the Observatory + Foresight currently reveal (0..3).
   */
  static getForecastDepth(state: FullGameState): number {
    const hasObservatory = state.rooms.some(
      r => r.defId === 'observatory' && r.state === 'built' && !isRoomUnfinished(r)
    );
    let obsDepth = hasObservatory ? 1 : 0;
    if (hasObservatory && state.characters.some(c => c.status !== 'away' && c.traits?.includes('Star-Touched'))) {
      obsDepth += 1;
    }
    if (creatureSpeciesBuffSum(state, 'star_heron') > 0) {
      obsDepth += 1;
    }
    if (bestBuffScale(state.creatures, 'mistfeather_owl') > 0 && creatureSpeciesBuffSum(state, 'mistfeather_owl') > 0) {
      obsDepth += 1;
    }
    const spellDays = state.activeBuffs?.foresightDays || 0;
    return Math.min(3, Math.max(obsDepth, spellDays));
  }

  /**
   * Return the visible forecasted upcoming events without mutating the caller's state.
   */
  static getVisibleForecast(
    state: FullGameState
  ): Array<{ day: number; eventId: string; eventName: string; description: string }> {
    const depth = AnkicasterEngine.getForecastDepth(state);
    if (depth <= 0) return [];
    const queue = (state.upcomingEvents || []).filter(e => e.day > state.day).sort((a, b) => a.day - b.day);
    return queue.slice(0, depth).map(entry => {
      if (entry.eventId === 'none') {
        return { day: entry.day, eventId: 'none', eventName: 'Quiet Skies', description: 'No event scheduled to arrive.' };
      }
      const ev = SCHOOL_EVENTS.find(e => e.id === entry.eventId);
      return {
        day: entry.day,
        eventId: entry.eventId,
        eventName: ev?.name || entry.eventId,
        description: ev?.description || 'An omen stirs at the Academy gates.'
      };
    });
  }

  /**
   * Spend 1 Foresight skip charge to avert a forecasted upcoming event before it arrives.
   */
  static skipForecastedEvent(
    state: FullGameState,
    day: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const skips = state.activeBuffs?.foresightSkips || 0;
    if (skips <= 0) {
      return { state, success: false, error: 'Cast Foresight to gain an event skip charge.' };
    }
    const next = structuredClone(state);
    ensureUpcomingEventsQueue(next);
    const entry = (next.upcomingEvents || []).find(e => e.day === day);
    if (!entry || entry.eventId === 'none') {
      return { state, success: false, error: 'No incoming event on that forecasted day to skip.' };
    }
    const evName = SCHOOL_EVENTS.find(e => e.id === entry.eventId)?.name || entry.eventId;
    entry.eventId = 'none';
    if (!next.activeBuffs) next.activeBuffs = {};
    next.activeBuffs.foresightSkips = Math.max(0, (next.activeBuffs.foresightSkips || 1) - 1);
    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];
    next.notices.push({
      id: uniqueNoticeId(`skip-event-${day}`, next),
      time: Date.now(),
      type: 'event',
      text: `🔮 Foresight averted "${evName}" scheduled for Day ${day}.`,
      data: { roomId: ehRoom?.id }
    });
    return { state: next, success: true };
  }

  /**
   * Generate Renown-weighted applicant candidates for the Recruitment Board (§14).
   */
  static generateApplicants(
    state: FullGameState,
    count: number = 4
  ): Array<{ name: string; personality: PersonalityType; traits: string[]; bio: string }> {
    return generateApplicantsForState(state, count);
  }

  /**
   * Perform the Sunlit Sanctum's Rite of Renewal: once every 7 days, spend 50 Radiance
   * to remove 1 Troublesome trait from a chosen character.
   */
  static performRiteOfRenewal(
    state: FullGameState,
    characterId: number,
    traitId: string
  ): { state: FullGameState; success: boolean; error?: string } {
    const sanctum = state.rooms.find(r => r.defId === 'sunlit_sanctum' && r.state === 'built' && !isRoomUnfinished(r));
    if (!sanctum) {
      return { state, success: false, error: 'Requires a built and furnished Sunlit Sanctum.' };
    }
    if (state.sanctumRenewalLastDay != null && state.day - state.sanctumRenewalLastDay < 7) {
      const remaining = 7 - (state.day - state.sanctumRenewalLastDay);
      return { state, success: false, error: `Rite of Renewal on cooldown (${remaining} day(s) remaining).` };
    }
    if ((state.resources.radiance || 0) < 50) {
      return { state, success: false, error: 'Need 50 Radiance to perform the Rite of Renewal.' };
    }

    const next = structuredClone(state);
    const char = next.characters.find(c => c.id === characterId);
    if (!char) {
      return { state, success: false, error: 'Character not found.' };
    }
    const tDef = TRAIT_DEFINITIONS[traitId];
    if (!tDef || tDef.category !== 'troublesome') {
      return { state, success: false, error: 'Select a troublesome trait to cleanse.' };
    }
    if (!char.traits.includes(traitId)) {
      return { state, success: false, error: `${char.name} does not have the ${traitId} trait.` };
    }

    const beforeRad = next.resources.radiance || 0;
    next.resources.radiance = beforeRad - 50;
    logResourceChange(next, 'radiance', -50, 'Rite of Renewal');
    char.traits = char.traits.filter(t => t !== traitId);
    next.sanctumRenewalLastDay = next.day;
    char.chronicle.push({ day: next.day, text: `Cleansed "${traitId}" via Sunlit Sanctum's Rite of Renewal.` });

    next.notices.push({
      id: uniqueNoticeId(`renewal-${char.id}`, next),
      time: Date.now(),
      type: 'event',
      text: `☀️ Rite of Renewal: ${char.name} shed the "${traitId}" trait in the Sunlit Sanctum (-50 Radiance).`,
      data: { roomId: sanctum.id, characterIds: [char.id] }
    });

    return { state: next, success: true };
  }

  /**
   * Repair damaged furniture at 25% of its material cost (rounded up, min 1 per non-mana material).
   */
  static repairFurniture(
    state: FullGameState,
    roomId: number,
    furnitureId: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    const piece = room.furniture.find(f => f.id === furnitureId);
    if (!piece) return { state, success: false, error: 'Furniture not found.' };
    if (!piece.damaged) return { state, success: false, error: 'Furniture is not damaged.' };

    const fDef = FURNITURE_DEFINITIONS[piece.defId];
    const repairCost: Array<[string, number]> = [];
    if (fDef?.cost) {
      for (const [k, rawVal] of Object.entries(fDef.cost)) {
        if (k === 'mana' || !rawVal || rawVal <= 0) continue;
        repairCost.push([k, Math.max(1, Math.round(rawVal * 0.25))]);
      }
    }

    const bag = next.resources as unknown as Record<string, number>;
    for (const [k, amt] of repairCost) {
      if ((bag[k] || 0) < amt) {
        return { state, success: false, error: `Need ${amt} ${k} to repair ${fDef?.name || piece.defId}.` };
      }
    }
    for (const [k, amt] of repairCost) {
      bag[k] = (bag[k] || 0) - amt;
      logResourceChange(next, k, -amt, `Repair ${fDef?.name || piece.defId}`);
    }

    piece.damaged = false;
    syncCharmRenown(next);
    next.notices.push({
      id: uniqueNoticeId(`repair-${roomId}-${furnitureId}`, next),
      time: Date.now(),
      type: 'build',
      text: `🔧 Repaired ${fDef?.name || piece.defId} in ${ROOM_DEFINITIONS[room.defId]?.name || room.defId}.`,
      data: { roomId }
    });

    return { state: next, success: true };
  }

  /**
   * Configure which habitat modules an Grand Menagerie supports (2 at Lv1, 3 at Lv2, 4 at Lv3).
   */
  static setMenagerieModules(
    state: FullGameState,
    roomId: number,
    modules: HabitatType[]
  ): { state: FullGameState; success: boolean; error?: string } {
    const room = state.rooms.find(r => r.id === roomId && r.defId === 'menagerie' && r.state === 'built');
    if (!room) {
      return { state, success: false, error: 'Built Grand Menagerie not found.' };
    }
    const cap = menagerieModuleCap(room.level);
    const valid = Array.from(new Set(modules.filter((m): m is HabitatType => ALL_HABITATS.includes(m))));
    if (valid.length === 0) {
      return { state, success: false, error: 'Select at least 1 habitat module.' };
    }
    if (valid.length > cap) {
      return { state, success: false, error: `Menagerie Lv ${room.level} supports at most ${cap} habitat modules.` };
    }

    const next = structuredClone(state);
    const target = next.rooms.find(r => r.id === roomId)!;
    target.settings = { ...(target.settings || {}), modules: valid };
    next.notices.push({
      id: uniqueNoticeId(`menagerie-mods-${roomId}`, next),
      time: Date.now(),
      type: 'build',
      text: `🐾 Menagerie habitat modules set to: ${valid.join(', ')}.`,
      data: { roomId }
    });
    return { state: next, success: true };
  }

  /**
   * Craft/awaken a Geode Golem at a built Workshop using 3 Golem Cores into an open Crystal habitat.
   */
  static awakenGeodeGolem(
    state: FullGameState
  ): { state: FullGameState; success: boolean; error?: string; creatureId?: number } {
    const workshop = state.rooms.find(r => r.defId === 'workshop' && r.state === 'built' && !isRoomUnfinished(r));
    if (!workshop) {
      return { state, success: false, error: 'Requires a built and furnished Workshop.' };
    }
    if ((state.resources.golem_core || 0) < 3) {
      return { state, success: false, error: 'Need 3 Golem Cores to awaken a Geode Golem.' };
    }

    const next = structuredClone(state);
    const openCrystalPen = next.rooms.find(
      r =>
        r.state === 'built' &&
        !isRoomUnfinished(r) &&
        roomAcceptedHabitats(r).includes('crystal') &&
        getPenOccupants(next, r).length < penCreatureCapacity(r)
    );
    if (!openCrystalPen) {
      return {
        state,
        success: false,
        error: 'Requires an open Crystal habitat (Crystal Vivarium or Menagerie with Crystal module) with free space.'
      };
    }

    next.resources.golem_core = Math.max(0, (next.resources.golem_core || 0) - 3);
    logResourceChange(next, 'golem_core', -3, 'Awaken Geode Golem');

    const newId = uniqueNumericId(next.creatures.map(c => c.id));
    next.creatures.push({
      id: newId,
      defId: 'geode_golem',
      nickname: CREATURE_DEFINITIONS.geode_golem?.name || 'Geode Golem',
      roomId: openCrystalPen.id,
      status: 'wary',
      hungry: false,
      hatchProgress: 0,
      tamingProgress: 0,
      bondLevel: 1,
      bondProgress: 0,
      arrivedDay: next.day
    });
    syncDiscoveredCreatures(next);
    next.notices.push({
      id: uniqueNoticeId(`awaken-golem-${newId}`, next),
      time: Date.now(),
      type: 'creature_arrival',
      text: `💎 Awakened a wary Geode Golem at the Workshop and housed it in ${roomDisplayName(openCrystalPen)}!`,
      data: { roomId: openCrystalPen.id, creatureId: newId, visualEventType: 'creature_arrival' }
    });

    return { state: next, success: true, creatureId: newId };
  }

  /**
   * Configure mixed crop beds inside a Greenhouse (2 beds at Lv 1-2, 3 beds at Lv 3).
   */
  static setGreenhouseCrops(
    state: FullGameState,
    roomId: number,
    crops: string[]
  ): { state: FullGameState; success: boolean; error?: string } {
    const room = state.rooms.find(r => r.id === roomId && r.defId === 'greenhouse' && r.state === 'built');
    if (!room) {
      return { state, success: false, error: 'Built Greenhouse not found.' };
    }
    const bedCap = (room.level || 1) >= 3 ? 3 : 2;
    if (crops.length === 0 || crops.length > bedCap) {
      return { state, success: false, error: `Greenhouse Lv ${room.level} supports 1 to ${bedCap} crop beds.` };
    }
    const natureLvl = state.wizard?.levels?.nature || 0;
    const unlockedSeeds = new Set(state.resources?.seedsUnlocked || []);
    for (const cid of crops) {
      const def = GREENHOUSE_CROPS[cid];
      if (!def) {
        return { state, success: false, error: `Unknown crop: ${cid}.` };
      }
      if (def.unlock === 'nature_l3' && natureLvl < 3) {
        return { state, success: false, error: `${def.name} requires Headmaster Nature Lv 3.` };
      }
      if ((def.unlock === 'draft' || def.unlock === 'rift') && !unlockedSeeds.has(cid)) {
        return { state, success: false, error: `${def.name} seeds have not been unlocked yet.` };
      }
    }

    const next = structuredClone(state);
    const target = next.rooms.find(r => r.id === roomId)!;
    target.settings = { ...(target.settings || {}), crops: [...crops], crop: crops[0] };
    next.notices.push({
      id: uniqueNoticeId(`greenhouse-crops-${roomId}`, next),
      time: Date.now(),
      type: 'build',
      text: `🌱 Greenhouse beds planted: ${crops.map(id => GREENHOUSE_CROPS[id]?.name || id).join(', ')}.`,
      data: { roomId }
    });
    return { state: next, success: true };
  }

  /**
   * Toggle Glassworks stone-to-glass conversion active state (room.settings.glassworksActive).
   */
  static setGlassworksActive(
    state: FullGameState,
    roomId: number,
    active: boolean
  ): { state: FullGameState; success: boolean; error?: string } {
    const room = state.rooms.find(r => r.id === roomId && r.defId === 'glassworks' && r.state === 'built');
    if (!room) {
      return { state, success: false, error: 'Built Glassworks not found.' };
    }
    const next = structuredClone(state);
    const target = next.rooms.find(r => r.id === roomId)!;
    target.settings = { ...(target.settings || {}), glassworksActive: active };
    next.notices.push({
      id: uniqueNoticeId(`glassworks-${roomId}`, next),
      time: Date.now(),
      type: 'build',
      text: active ? '🪟 Glassworks furnace lit (converting Stone to Glass each bell).' : '🪟 Glassworks furnace banked (conversion paused).',
      data: { roomId }
    });
    return { state: next, success: true };
  }

  /**
   * Library Action: Spend Insight (30 base, -10% per active Scholar in Library down to 21)
   * to reveal 1 ingredient hint of an undiscovered potion recipe (GDD §25.3).
   */
  static researchRecipe(
    state: FullGameState,
    roomId?: number,
    recipeId?: string
  ): { state: FullGameState; success: boolean; error?: string; recipeId?: string; ingredient?: string } {
    const libs = state.rooms.filter(
      r => r.defId === 'library' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(state, r)
    );
    const lib = roomId != null ? libs.find(r => r.id === roomId) : libs[0];
    if (!lib) {
      return { state, success: false, error: 'Requires a built, furnished, and unlocked Library.' };
    }

    const activeLibraryScholars = state.characters.filter(
      c =>
        c.career === 'scholar' &&
        c.careerState === 'active' &&
        c.status !== 'away' &&
        !c.injury &&
        libs.some(l => l.id === c.workplaceRoomId)
    ).length;
    const cost = Math.max(21, Math.round(30 * (1 - Math.min(0.3, activeLibraryScholars * 0.1))));
    if ((state.resources.insight || 0) < cost) {
      return { state, success: false, error: `Need ${cost} Insight to research an alchemy recipe.` };
    }

    const hintsMap = state.discoveredHints || {};
    const undiscovered = state.potions.filter(p => !p.discovered);
    if (undiscovered.length === 0) {
      return { state, success: false, error: 'All potion recipes are already discovered!' };
    }
    const candidate = recipeId
      ? undiscovered.find(p => p.id === recipeId)
      : undiscovered.find(p => {
          const known = hintsMap[p.id] || [];
          return p.ingredients.some(ing => !known.includes(ing));
        });
    if (!candidate) {
      return { state, success: false, error: 'All undiscovered recipe ingredients have already been hinted.' };
    }
    const knownForTarget = hintsMap[candidate.id] || [];
    const nextIngredient = candidate.ingredients.find(ing => !knownForTarget.includes(ing));
    if (!nextIngredient) {
      return { state, success: false, error: `All ingredients for ${candidate.name} are already revealed.` };
    }

    const next = structuredClone(state);
    next.resources.insight = Math.max(0, (next.resources.insight || 0) - cost);
    logResourceChange(next, 'insight', -cost, 'Library Recipe Research');
    if (!next.discoveredHints) next.discoveredHints = {};
    next.discoveredHints[candidate.id] = [...(next.discoveredHints[candidate.id] || []), nextIngredient];
    next.notices.push({
      id: uniqueNoticeId(`research-${candidate.id}`, next),
      time: Date.now(),
      type: 'alchemy',
      text: `📖 Library Research (-${cost} Insight): ${candidate.name} uses "${nextIngredient}"!`,
      data: { roomId: lib.id, potionId: candidate.id }
    });
    return { state: next, success: true, recipeId: candidate.id, ingredient: nextIngredient };
  }

  /**
   * Scriptorium Action: Queue a review-timed Scroll crafting job (GDD §25.4).
   */
  static startScrollCraft(
    state: FullGameState,
    roomId: number,
    scrollId: ScrollId
  ): { state: FullGameState; success: boolean; error?: string } {
    const def = SCROLL_DEFINITIONS[scrollId];
    if (!def) {
      return { state, success: false, error: `Unknown scroll: ${scrollId}.` };
    }
    const scriptorium = state.rooms.find(
      r => r.id === roomId && r.defId === 'scriptorium' && r.state === 'built' && !isRoomUnfinished(r) && !AnkicasterEngine.roomIsLocked(state, r)
    );
    if (!scriptorium) {
      return { state, success: false, error: 'Requires a built, furnished, and unlocked Scriptorium.' };
    }
    if ((state.scrollQueue || []).some(j => j.roomId === roomId)) {
      return { state, success: false, error: 'This Scriptorium is already crafting a scroll.' };
    }

    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    const bag = next.resources as unknown as Record<string, number>;
    for (const [k, amt] of Object.entries(def.cost)) {
      if ((bag[k] || 0) < amt) {
        return { state, success: false, error: `Need ${amt} ${k} to inscribe ${def.name}.` };
      }
    }
    for (const [k, amt] of Object.entries(def.cost)) {
      bag[k] = (bag[k] || 0) - amt;
    }
    logResourceDiff(next, beforeRes, `Inscribe ${def.name}`);

    if (!next.scrollQueue) next.scrollQueue = [];
    const jobId = uniqueNumericId(next.scrollQueue.map(j => j.id));
    next.scrollQueue.push({
      id: jobId,
      scrollId,
      roomId,
      progress: 0,
      required: def.craftReviews
    });
    next.notices.push({
      id: uniqueNoticeId(`scroll-start-${scrollId}`, next),
      time: Date.now(),
      type: 'alchemy',
      text: `📜 Started inscribing ${def.name} in the Scriptorium (${def.craftReviews} reviews base).`,
      data: { roomId }
    });
    return { state: next, success: true };
  }

  /**
   * Consume a crafted Scriptorium Scroll from inventory (GDD §25.4).
   */
  static useScroll(
    state: FullGameState,
    scrollId: ScrollId,
    target?: { roomId?: number; floorY?: number; recipeId?: string }
  ): { state: FullGameState; success: boolean; error?: string; message?: string } {
    const owned = state.scrolls?.[scrollId] || 0;
    if (owned <= 0) {
      return { state, success: false, error: `No ${SCROLL_DEFINITIONS[scrollId]?.name || scrollId} scrolls in inventory.` };
    }

    const next = structuredClone(state);
    if (!next.scrolls) next.scrolls = {};
    next.scrolls[scrollId] = owned - 1;
    if (!next.activeBuffs) next.activeBuffs = {};
    let message = `Used ${SCROLL_DEFINITIONS[scrollId]?.name || scrollId}.`;
    let noticeRoomId: number | undefined;

    switch (scrollId) {
      case 'rift_map': {
        next.activeBuffs.riftMapPending = true;
        message = '🗺️ Rift Map prepared! Next Rift expedition gains +2 Rift Fortune.';
        break;
      }
      case 'ward_scroll': {
        const targetRoom = target?.roomId != null ? next.rooms.find(r => r.id === target.roomId && r.area === 'castle') : undefined;
        const floorY = target?.floorY ?? targetRoom?.y ?? 0;
        next.preventFloorHazard = [...(next.preventFloorHazard || []), Math.max(0, floorY)];
        noticeRoomId = targetRoom?.id;
        message = `📜 Ward Scroll activated on Floor ${Math.max(0, floorY) + 1}! Next hazard prevented.`;
        break;
      }
      case 'recipe_notes': {
        const hints = next.discoveredHints || {};
        const undiscovered = next.potions.filter(p => !p.discovered);
        const rec = target?.recipeId
          ? undiscovered.find(p => p.id === target.recipeId)
          : undiscovered.find(p => p.ingredients.some(ing => !(hints[p.id] || []).includes(ing)));
        const ing = rec?.ingredients.find(i => !(hints[rec.id] || []).includes(i));
        if (rec && ing) {
          if (!next.discoveredHints) next.discoveredHints = {};
          next.discoveredHints[rec.id] = [...(next.discoveredHints[rec.id] || []), ing];
          message = `📜 Recipe Notes deciphered! ${rec.name} uses "${ing}".`;
        } else {
          message = '📜 Recipe Notes read (all undiscovered recipe ingredients are already known).';
        }
        break;
      }
      case 'calming_verse': {
        const roomWithChain = next.rooms.find(r => r.misbehaviorCharmMalus && r.misbehaviorCharmMalus < 0)
          || (next.characters.find(c => (c.misbehaviorChains?.length || 0) > 0)?.misbehaviorChains?.[0]?.roomId != null
            ? next.rooms.find(r => r.id === next.characters.find(c => (c.misbehaviorChains?.length || 0) > 0)!.misbehaviorChains![0].roomId)
            : undefined);
        const targetRoom = (target?.roomId != null ? next.rooms.find(r => r.id === target.roomId) : undefined)
          || roomWithChain
          || next.rooms.find(r => r.state === 'built');
        const targetRoomId = targetRoom?.id;
        const cleared = clearRoomMisbehaviorChains(next, targetRoomId);
        const residents = targetRoomId != null
          ? next.characters.filter(c => c.seatRoomId === targetRoomId || c.workplaceRoomId === targetRoomId || c.bedRoomId === targetRoomId)
          : [];
        const list = residents.length > 0 ? residents : next.characters;
        for (const c of list) {
          c.needs.composure = Math.min(100, c.needs.composure + 20);
        }
        noticeRoomId = targetRoomId;
        syncCharmRenown(next);
        message = `🕊️ Calming Verse recited! Cleared ${cleared} misbehavior effect(s) and granted +20 Composure.`;
        break;
      }
    }

    next.notices.push({
      id: uniqueNoticeId(`scroll-use-${scrollId}`, next),
      time: Date.now(),
      type: 'alchemy',
      text: message,
      data: { roomId: noticeRoomId }
    });
    return { state: next, success: true, message };
  }

  /**
   * Return unlinked eligible young cards respecting deckScope & linkNewCards settings (§31 / Settings).
   */
  static getEligibleFreeCards(state: FullGameState, maxIvl: number = 30): AnkiCardSnapshot[] {
    return getEligibleFreeYoungCards(state, maxIvl);
  }

  /**
   * Choose one Spellbook from an active pendingSpellbookDraft choice (Commencement or Endless milestone §31.2).
   */
  static chooseSpellbook(
    state: FullGameState,
    spellbookId: string,
    bonusPlanDefId?: string
  ): { state: FullGameState; success: boolean; error?: string } {
    const draft = state.pendingSpellbookDraft;
    if (!draft) {
      return { state, success: false, error: 'No pending Spellbook draft available.' };
    }
    if (!draft.choices.includes(spellbookId)) {
      return { state, success: false, error: 'Selected spellbook is not in the current draft choices.' };
    }
    const def = SPELLBOOK_DEFINITIONS[spellbookId];
    if (!def) {
      return { state, success: false, error: `Unknown spellbook: ${spellbookId}.` };
    }
    const next = structuredClone(state);
    if (!next.spellbooks) next.spellbooks = [];
    if (!next.spellbooks.includes(spellbookId)) {
      next.spellbooks.push(spellbookId);
    }
    if (draft.allowPlanPick && bonusPlanDefId && ROOM_DEFINITIONS[bonusPlanDefId]) {
      if (!next.knownPlans) next.knownPlans = [];
      if (!next.knownPlans.includes(bonusPlanDefId)) next.knownPlans.push(bonusPlanDefId);
      next.roomPlans = { ...(next.roomPlans || {}) };
      next.roomPlans[bonusPlanDefId] = (next.roomPlans[bonusPlanDefId] || 0) + 1;
      next.pendingFoundersPlanChoice = false;
    }
    next.pendingSpellbookDraft = undefined;
    next.notices.push({
      id: uniqueNoticeId(`spellbook-pick-${spellbookId}`, next),
      time: Date.now(),
      type: 'milestone',
      text: `📚 Bound "${def.name}" (Tier ${def.tier}) into the Grand Grimoire Shelf: ${def.effect}`
    });
    checkEndlessSpellbookMilestones(next);
    return { state: next, success: true };
  }

  /**
   * Claim the bonus room plan granted by Founder's Testament at the start of a new term (§31.2).
   */
  static claimFoundersPlan(
    state: FullGameState,
    defId: string
  ): { state: FullGameState; success: boolean; error?: string } {
    if (!state.pendingFoundersPlanChoice) {
      return { state, success: false, error: "No pending Founder's Testament room plan pick." };
    }
    const rDef = ROOM_DEFINITIONS[defId];
    if (!rDef) {
      return { state, success: false, error: `Unknown room definition: ${defId}.` };
    }
    const next = structuredClone(state);
    if (!next.knownPlans) next.knownPlans = [];
    if (!next.knownPlans.includes(defId)) next.knownPlans.push(defId);
    next.roomPlans = { ...(next.roomPlans || {}) };
    next.roomPlans[defId] = (next.roomPlans[defId] || 0) + 1;
    next.pendingFoundersPlanChoice = false;
    next.notices.push({
      id: uniqueNoticeId(`founders-plan-${defId}`, next),
      time: Date.now(),
      type: 'milestone',
      text: `📜 Founder's Testament bequeathed a ${rDef.name} plan!`
    });
    return { state: next, success: true };
  }

  /**
   * Resolve pending manual Veil payment queued in `'ask'` veilPayment mode.
   */
  static resolvePendingVeilPayment(
    state: FullGameState,
    pay: boolean
  ): { state: FullGameState; success: boolean; message: string } {
    const pending = state.pendingVeilPayment;
    if (!pending) {
      return { state, success: false, message: 'No manual Veil payment pending.' };
    }
    const next = structuredClone(state);
    next.pendingVeilPayment = undefined;
    const bankFloor = Math.max(10, Math.round((next.bankAtLastReview || next.mana) * 0.1));
    const standingStonesCount = next.rooms.filter(r => r.defId === 'standing_stones' && r.state === 'built' && !isRoomUnfinished(r)).length;
    const warders = next.characters.filter(isActiveWarder).length;
    const ehRoom = next.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || next.rooms[0];

    let message = '';
    if (pay) {
      const available = Math.max(0, next.mana - bankFloor);
      const paid = Math.min(available, Math.max(0, pending.totalCost));
      next.mana -= paid;
      next.veil.paidToday = paid;
      if (paid >= pending.totalCost) {
        next.veil.strength = Math.min(100, next.veil.strength + (3 + warders * 2 + standingStonesCount * 2) * Math.max(1, pending.days));
        message = `🛡️ Paid ${paid} mana for ${pending.days} day(s) of Veil upkeep. Strength: ${next.veil.strength}%.`;
      } else {
        const unpaidRatio = (pending.totalCost - paid) / Math.max(1, pending.totalCost);
        next.veil.strength = Math.max(0, next.veil.strength - Math.round(15 * unpaidRatio));
        message = `⚠️ Partially paid ${paid}/${pending.totalCost} mana (10% bank floor protected). Veil at ${next.veil.strength}%.`;
      }
    } else {
      next.veil.paidToday = 0;
      next.veil.strength = Math.max(0, next.veil.strength - 15);
      message = `🛡️ Skipped manual Veil upkeep (${pending.totalCost} mana). Veil weakened to ${next.veil.strength}%.`;
    }

    next.notices.push({
      id: uniqueNoticeId('veil-manual-resolve', next),
      time: Date.now(),
      type: pay ? 'day_tick_paid' : 'day_tick_unpaid',
      text: message,
      data: { roomId: ehRoom?.id }
    });
    return { state: next, success: true, message };
  }
}
