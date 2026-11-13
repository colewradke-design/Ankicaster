/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ankicaster Pure Formula Implementation (GDD Section 41, Appendix A)
 */

import {
  CareerType,
  Character,
  FullGameState,
  PlacedRoom,
  RiftDestination,
  SchoolType
} from '../types/ankicaster';
import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../data/content';
import { isRoomUnfinished } from './requiredFurniture';

/**
 * F1: Mana per honest review
 * Base 10 mana. Arcane level 6-10 grants +2% per level (max +10%). Combined mana mult capped at +25%.
 */
export function calculateReviewMana(arcaneLevel: number, additionalMults: number = 0): number {
  const arcaneBuff = 0.02 * Math.max(0, arcaneLevel - 5);
  const totalMult = Math.min(0.25, arcaneBuff + additionalMults);
  return 10 * (1 + totalMult);
}

/**
 * F3 & F4: Reviews and mana required for Wizard level n (BR-07)
 * The normal price is always 80 × level. The founding school's first orb
 * session (to level 1) is the one exception: 0 mana, still 25 reviews.
 */
export function getWizardLevelRequirements(level: number): { reviews: number; mana: number } {
  return {
    reviews: 25 * level,
    mana: 80 * level
  };
}

export interface OrbQuote {
  targetLevel: number;
  reviews: number;
  mana: number;
  /** First Pondering the Orb in the headmaster's founding school, to level 1. Once. */
  free: boolean;
  capped: boolean;
}

/**
 * Cost of the next orb session in one school.
 * Free only when that school is the one picked at character creation,
 * the session would reach level 1, and it has not been started or queued.
 * Every other ponder, including the second in the founding school, is 80 × target level.
 * Reviews stay 25 × target level either way.
 */
export function wizardOrbQuote(input: {
  foundingSchool?: string;
  levels: Partial<Record<string, number>>;
  active?: { school?: string; kind?: string } | null;
  queued?: Array<{ school?: string; kind?: string }>;
  school: string;
}): OrbQuote {
  const cur = input.levels[input.school] || 0;
  const active = input.active && input.active.school === input.school && input.active.kind === 'orb' ? 1 : 0;
  const queued = (input.queued || []).filter(s => s.school === input.school && s.kind === 'orb').length;
  const targetLevel = cur + active + queued + 1;
  const capped = targetLevel > 10;
  const free = !capped && !!input.foundingSchool && input.school === input.foundingSchool && targetLevel === 1;
  return {
    targetLevel,
    reviews: 25 * targetLevel,
    mana: free ? 0 : 80 * targetLevel,
    free,
    capped
  };
}

/**
 * F7: Student Skill (0-100)
 * Mean over linked cards of min(honest_ivl, 30) / 30 * 100
 */
export function calculateStudentSkill(cardHonestIvls: number[], expectedCount: number = 50): number {
  if (expectedCount <= 0) return 0;
  let sum = 0;
  for (let i = 0; i < expectedCount; i++) {
    const ivl = i < cardHonestIvls.length ? cardHonestIvls[i] : 0;
    sum += Math.min(ivl, 30) / 30;
  }
  return Math.round((100 * sum) / expectedCount);
}

/**
 * F8: Mastery Ready Check (BR-15, BR-16)
 * A student is ready when ALL of their study cards are strictly > 30 days interval.
 */
export function isMasteryReady(cardHonestIvls: number[], requiredCount: number = 50): boolean {
  if (cardHonestIvls.length < requiredCount) return false;
  return cardHonestIvls.every(ivl => ivl > 30);
}

/**
 * F9 & F10: Teacher Delay in real days (BR-16)
 * delay = 30 - mean(teacher's 20 teaching cards ivls); 0 once all 20 are > 30 days.
 * Stand-in Wizard delay: 20 - 2 * (wizard_level - 5)
 * Multiplied by Light teaching buff: delay * (1 - 0.03 * light_steps), rounded UP.
 */
export function calculateTeacherDelay(
  teacherType: 'teacher' | 'wizard' | 'none',
  teacherCareerCardIvls: number[] = [],
  wizardSchoolLevel: number = 5,
  lightSchoolLevel: number = 0
): number {
  let baseDelay = 30;

  if (teacherType === 'teacher') {
    if (teacherCareerCardIvls.length >= 20 && teacherCareerCardIvls.every(ivl => ivl > 30)) {
      baseDelay = 0;
    } else {
      const avgIvl =
        teacherCareerCardIvls.length > 0
          ? teacherCareerCardIvls.reduce((a, b) => a + b, 0) / Math.max(1, teacherCareerCardIvls.length)
          : 0;
      baseDelay = Math.max(0, 30 - avgIvl);
    }
  } else if (teacherType === 'wizard') {
    baseDelay = Math.max(10, 20 - 2 * (wizardSchoolLevel - 5));
  } else {
    baseDelay = 30;
  }

  const lightSteps = Math.max(0, lightSchoolLevel - 5);
  const lightFactor = 1 - 0.03 * lightSteps;
  return Math.ceil(baseDelay * lightFactor);
}

/**
 * F11: Career Proficiency (0.75 - 1.25)
 */
export function calculateCareerProficiency(careerSkill: number): number {
  return 0.75 + (0.5 * Math.min(100, Math.max(0, careerSkill))) / 100;
}

/**
 * F12: Faculty Limit (BR-22)
 * min(1 + floor(total_wizard_levels / 4), faculty_beds, 1 + 2 * classrooms, 1 + floor(students / 3))
 */
export function calculateFacultyLimit(
  totalWizardLevels: number,
  facultyBeds: number,
  classroomsCount: number,
  studentsCount: number
): { limit: number; breakdown: { A: number; B: number; C: number; D: number; bottleneck: string } } {
  const A = 1 + Math.floor(totalWizardLevels / 4);
  const B = Math.max(1, facultyBeds);
  const C = 1 + 2 * classroomsCount;
  const D = 1 + Math.floor(studentsCount / 3);

  const limit = Math.min(A, B, C, D);
  let bottleneck = 'Wizard levels';
  if (limit === B) bottleneck = 'Faculty housing';
  else if (limit === C) bottleneck = 'Classroom space';
  else if (limit === D) bottleneck = 'Student body ratio (needs 3 students per faculty)';

  return { limit, breakdown: { A, B, C, D, bottleneck } };
}

/**
 * F16: Student Morale (0-100)
 */
export function calculateMorale(needs: Character['needs'], bonuses: number = 0): number {
  const raw =
    0.25 * needs.hunger +
    0.25 * needs.rest +
    0.2 * needs.leisure +
    0.2 * needs.composure +
    0.1 * needs.health +
    bonuses;
  return Math.min(100, Math.max(0, Math.round(raw)));
}

/**
 * F19 & F20: Room Quality Score Q & Tier
 */
export function calculateRoomQuality(room: PlacedRoom): { q: number; tier: 'bare' | 'plain' | 'cozy' | 'fine' | 'splendid' } {
  const def = ROOM_DEFINITIONS[room.defId];
  if (!def) return { q: 0, tier: 'bare' };

  let q = 0;
  const primaryStats = def.stats.primary;
  const secondaryStat = def.stats.secondary;

  for (const furn of room.furniture) {
    const fDef = FURNITURE_DEFINITIONS[furn.defId];
    if (!fDef || !fDef.stats) continue;
    // GDD 17.1: damaged furniture keeps half its stat points (not zero).
    const mult = furn.damaged ? 0.5 : 1;

    for (const [stat, val] of Object.entries(fDef.stats)) {
      if (!val) continue;
      if (primaryStats.includes(stat)) {
        q += val * mult;
      } else if (stat === secondaryStat) {
        q += 0.5 * val * mult;
      }
    }
  }

  let tier: 'bare' | 'plain' | 'cozy' | 'fine' | 'splendid' = 'bare';
  if (q >= 70) tier = 'splendid';
  else if (q >= 45) tier = 'fine';
  else if (q >= 25) tier = 'cozy';
  else if (q >= 10) tier = 'plain';

  return { q, tier };
}

/**
 * F21: Room Efficiency
 * level * qualityFactor * cleanlinessFactor * staffFactor * adjacency
 */
export function calculateRoomEfficiency(
  room: PlacedRoom,
  isStaffed: boolean = true,
  isReachable: boolean = true,
  adjacencyFactor: number = 1.0
): number {
  if (!isReachable || room.state !== 'built') return 0;
  if (isRoomUnfinished(room)) return 0; // GDD 15.7 override: missing required furniture

  const { q } = calculateRoomQuality(room);
  const levelFactor = room.level === 3 ? 1.2 : room.level === 2 ? 1.1 : 1.0;
  const qualityFactor = 1 + Math.min(q, 80) / 160;
  const cleanFactor = 0.7 + (0.3 * room.cleanliness) / 100;
  const staffFactor = isStaffed ? 1.0 : 0.5;
  const clampedAdj = Math.min(1.3, Math.max(0.8, adjacencyFactor));

  return levelFactor * qualityFactor * cleanFactor * staffFactor * clampedAdj;
}

/**
 * F23: Daily Veil Cost (BR-24)
 * cost = (40 + 3 * size_points) * (1 - reductions)
 */
export function calculateDailyVeilCost(
  rooms: PlacedRoom[],
  shadowLevel: number,
  wardersCount: number,
  veilTheoryRanks: number = 0,
  hasBatSwarm: boolean = false,
  hasUmbralWyrm: boolean = false,
  batScale = 1,
  wyrmScale = 1
): { cost: number; sizePoints: number; reductions: Array<{ label: string; pct: number }> } {
  let sizePoints = 0;
  for (const r of rooms) {
    const def = ROOM_DEFINITIONS[r.defId];
    if (def) {
      const levelMult = r.level === 3 ? 1.5 : r.level === 2 ? 1.25 : 1.0;
      sizePoints += def.veil * levelMult;
    }
  }

  const reductions: Array<{ label: string; pct: number }> = [];

  // Shadow wizard level (3% per level above 5)
  const shadowSteps = Math.max(0, shadowLevel - 5);
  if (shadowSteps > 0) {
    reductions.push({ label: `Shadow Level ${shadowLevel}`, pct: 0.03 * shadowSteps });
  }

  // Warders (3% each, max 3)
  const activeWarders = Math.min(3, wardersCount);
  if (activeWarders > 0) {
    reductions.push({ label: `${activeWarders} Warder(s)`, pct: 0.03 * activeWarders });
  }

  // Veil Theory Research
  if (veilTheoryRanks > 0) {
    reductions.push({ label: `Veil Theory Ranks (${veilTheoryRanks})`, pct: 0.03 * veilTheoryRanks });
  }

  if (hasBatSwarm) reductions.push({ label: 'Velvet Bat Swarm', pct: 0.02 * batScale });
  if (hasUmbralWyrm) reductions.push({ label: 'Umbral Wyrmling', pct: 0.05 * wyrmScale });

  const totalReductionPct = Math.min(0.5, reductions.reduce((sum, item) => sum + item.pct, 0));
  const rawCost = (40 + 3 * sizePoints) * (1 - totalReductionPct);

  return {
    cost: Math.round(rawCost),
    sizePoints,
    reductions
  };
}

/**
 * F32 & F33: Rift Expedition Safe Return Chance (BR-31, BR-32, BR-33)
 */
export function calculateRiftChance(
  dest: RiftDestination,
  partySkillDays: number,
  teamSize: number,
  hasRiftElixir: boolean,
  isVeilThinOrTorn: boolean
): { chance: number; breakdown: Array<{ label: string; val: number }> } {
  const breakdown: Array<{ label: string; val: number }> = [];
  let chance = dest.safeOdds;
  breakdown.push({ label: 'Base Safe Odds', val: dest.safeOdds });

  const diff = partySkillDays - dest.skillNeeded;
  if (diff < 0) {
    const stepsBelow = Math.floor(-diff / 5);
    const penalty = -10 * stepsBelow;
    if (penalty !== 0) {
      chance += penalty;
      breakdown.push({ label: `Skill Shortfall (${stepsBelow * 5}d below)`, val: penalty });
    }
  } else {
    const stepsAbove = Math.floor(diff / 5);
    const bonus = 5 * stepsAbove;
    if (bonus > 0) {
      chance += bonus;
      breakdown.push({ label: `Skill Advantage (${stepsAbove * 5}d above)`, val: bonus });
    }
  }

  // Team size penalty
  if (teamSize === 2) {
    chance -= 10;
    breakdown.push({ label: 'Team of Two Penalty', val: -10 });
  } else if (teamSize === 1) {
    chance -= 25;
    breakdown.push({ label: 'Solo Adventurer Penalty', val: -25 });
  }

  // Elixir
  if (hasRiftElixir) {
    chance += 10;
    breakdown.push({ label: 'Rift Elixir Boon', val: 10 });
  }

  // Thin/Torn Veil
  if (isVeilThinOrTorn) {
    chance -= 5;
    breakdown.push({ label: 'Thin Veil Disruption', val: -5 });
  }

  // Caps
  const capped = Math.min(dest.bestOdds, Math.max(5, chance));
  return { chance: capped, breakdown };
}

export type FurnitureEffectKind =
  | 'rest_bonus'
  | 'composure_bonus'
  | 'leisure_bonus'
  | 'morale_bonus'
  | 'output_pct'
  | 'hazard_chance_pct'
  | 'cleanliness_per_bell'
  | 'heal_pct'
  | 'storage_bonus'
  | 'capacity_bonus'
  | 'bed_slots'
  | 'insight_per_bell'
  | 'nectar_per_bell'
  | 'creature_bond_pct'
  | 'taming_pct'
  | 'brew_speed_pct'
  | 'rift_fortune'
  | 'rift_supply_slots'
  | 'renown_bonus';

export type FurnitureEffectScope = 'room' | 'adjacent' | 'grounds' | 'academy';

export interface FurnitureEffectDef {
  kind: FurnitureEffectKind;
  value: number;
  scope: FurnitureEffectScope;
}

/**
 * Structured effects for furniture that declares a specialEffect.
 * Same-item effects in one room stack at most twice; damaged items count half.
 */
export const FURNITURE_EFFECTS: Record<string, FurnitureEffectDef> = {
  canopy_bed: { kind: 'rest_bonus', value: 5, scope: 'room' },
  bookshelf: { kind: 'output_pct', value: 10, scope: 'room' },
  ward_lantern: { kind: 'hazard_chance_pct', value: -10, scope: 'room' },
  enchanted_broom: { kind: 'cleanliness_per_bell', value: 1, scope: 'room' },
  fume_hood: { kind: 'hazard_chance_pct', value: -10, scope: 'room' },
  bunk_bed: { kind: 'bed_slots', value: 2, scope: 'room' },
  dreamcatcher_bed: { kind: 'composure_bonus', value: 5, scope: 'room' },
  mossbed: { kind: 'heal_pct', value: 10, scope: 'room' },
  moon_curtains: { kind: 'rest_bonus', value: 5, scope: 'room' },
  tea_service: { kind: 'output_pct', value: 5, scope: 'room' },
  wizard_chess: { kind: 'leisure_bonus', value: 5, scope: 'room' },
  music_box: { kind: 'composure_bonus', value: 3, scope: 'room' },
  hex_darts: { kind: 'hazard_chance_pct', value: -5, scope: 'academy' },
  warm_hearthstone: { kind: 'hazard_chance_pct', value: -8, scope: 'room' },
  spice_rack: { kind: 'morale_bonus', value: 2, scope: 'room' },
  frostbox: { kind: 'storage_bonus', value: 100, scope: 'academy' },
  stewpot: { kind: 'output_pct', value: 10, scope: 'room' },
  banquet_bell: { kind: 'morale_bonus', value: 4, scope: 'academy' },
  rolling_ladder: { kind: 'capacity_bonus', value: 1, scope: 'room' },
  globe_elsewhere: { kind: 'insight_per_bell', value: 0.2, scope: 'room' },
  silent_quill: { kind: 'output_pct', value: 10, scope: 'room' },
  map_table: { kind: 'rift_fortune', value: 1, scope: 'academy' },
  rain_cistern: { kind: 'output_pct', value: 10, scope: 'room' },
  compost_bin: { kind: 'output_pct', value: 5, scope: 'room' },
  glowcap_lamp: { kind: 'output_pct', value: 10, scope: 'room' },
  creature_toybox: { kind: 'creature_bond_pct', value: 10, scope: 'room' },
  warm_rock: { kind: 'taming_pct', value: 10, scope: 'room' },
  infirmary_cot: { kind: 'heal_pct', value: 5, scope: 'room' },
  remedy_cabinet: { kind: 'heal_pct', value: 10, scope: 'room' },
  healing_basin: { kind: 'heal_pct', value: 10, scope: 'room' },
  meditation_cushions: { kind: 'composure_bonus', value: 4, scope: 'room' },
  soaking_tub: { kind: 'rest_bonus', value: 5, scope: 'room' },
  halo_candles: { kind: 'composure_bonus', value: 2, scope: 'room' },
  ward_circle: { kind: 'hazard_chance_pct', value: -10, scope: 'room' },
  penitent_benches: { kind: 'composure_bonus', value: 4, scope: 'room' },
  silence_bell: { kind: 'hazard_chance_pct', value: -8, scope: 'adjacent' },
  shadow_ledger: { kind: 'hazard_chance_pct', value: -8, scope: 'academy' },
  nightglass: { kind: 'creature_bond_pct', value: 10, scope: 'room' },
  alembic_array: { kind: 'brew_speed_pct', value: 10, scope: 'room' },
  tool_wall: { kind: 'output_pct', value: 5, scope: 'room' },
  supply_chest: { kind: 'rift_supply_slots', value: 1, scope: 'academy' },
  artifact_plinth: { kind: 'renown_bonus', value: 2, scope: 'room' },
  garden_gnome: { kind: 'hazard_chance_pct', value: -10, scope: 'grounds' },
  bird_bath: { kind: 'creature_bond_pct', value: 5, scope: 'academy' },
  scarecrow: { kind: 'output_pct', value: 5, scope: 'room' },
  stone_lantern: { kind: 'morale_bonus', value: 3, scope: 'academy' },
  beehive_box: { kind: 'nectar_per_bell', value: 0.1, scope: 'room' },
  windmill_charm: { kind: 'output_pct', value: 8, scope: 'room' },
  fairy_ring: { kind: 'taming_pct', value: 8, scope: 'grounds' },
  rune_marker: { kind: 'hazard_chance_pct', value: -10, scope: 'grounds' },
  starfall_chandelier: { kind: 'insight_per_bell', value: 0.3, scope: 'academy' },
  heartwood_bench: { kind: 'morale_bonus', value: 5, scope: 'room' }
};

/**
 * Sum structured furniture effects inside a single built room.
 * Same-item effects in one room stack at most twice; undamaged items take priority; damaged = half.
 */
export function roomFurnitureEffects(room: PlacedRoom): Partial<Record<FurnitureEffectKind, number>> {
  const out: Partial<Record<FurnitureEffectKind, number>> = {};
  if (room.state !== 'built' || !room.furniture?.length) return out;
  const counts: Record<string, number> = {};
  const sorted = [...room.furniture].sort((a, b) => (a.damaged ? 1 : 0) - (b.damaged ? 1 : 0));
  for (const f of sorted) {
    const eff = FURNITURE_EFFECTS[f.defId];
    if (!eff) continue;
    const seen = counts[f.defId] || 0;
    if (seen >= 2) continue;
    counts[f.defId] = seen + 1;
    const mult = f.damaged ? 0.5 : 1;
    out[eff.kind] = (out[eff.kind] || 0) + eff.value * mult;
  }
  return out;
}

function roomsAdjacent(a: PlacedRoom, b: PlacedRoom): boolean {
  if (a.id === b.id) return true;
  if (a.area !== b.area) return false;
  const xOverlap = a.x <= b.x + b.w && b.x <= a.x + a.w;
  const yOverlap = a.y <= b.y + b.h && b.y <= a.y + a.h;
  return xOverlap && yOverlap;
}

/**
 * Sum a specific furniture effect kind across built rooms, respecting scope:
 * - 'room': only targetRoom
 * - 'adjacent': targetRoom and orthogonally/diagonally touching rooms
 * - 'grounds': any grounds room when targetRoom is on grounds (or omitted)
 * - 'academy': all built rooms
 */
export function academyFurnitureEffect(
  rooms: PlacedRoom[],
  kind: FurnitureEffectKind,
  targetRoom?: PlacedRoom
): number {
  let total = 0;
  for (const r of rooms) {
    if (r.state !== 'built' || !r.furniture?.length) continue;
    const counts: Record<string, number> = {};
    const sorted = [...r.furniture].sort((a, b) => (a.damaged ? 1 : 0) - (b.damaged ? 1 : 0));
    for (const f of sorted) {
      const eff = FURNITURE_EFFECTS[f.defId];
      if (!eff || eff.kind !== kind) continue;
      const seen = counts[f.defId] || 0;
      if (seen >= 2) continue;
      counts[f.defId] = seen + 1;
      const applies =
        eff.scope === 'academy' ||
        (eff.scope === 'grounds' && (!targetRoom || targetRoom.area === 'grounds')) ||
        (eff.scope === 'adjacent' && (!targetRoom || roomsAdjacent(r, targetRoom))) ||
        (eff.scope === 'room' && targetRoom?.id === r.id);
      if (!applies) continue;
      total += eff.value * (f.damaged ? 0.5 : 1);
    }
  }
  return total;
}

const EFFECT_LABELS: Record<FurnitureEffectKind, (v: number) => string> = {
  rest_bonus: v => `Rest target +${v}`,
  composure_bonus: v => `Composure +${v}`,
  leisure_bonus: v => `Leisure +${v}`,
  morale_bonus: v => `Morale +${v}`,
  output_pct: v => `Output ${v >= 0 ? '+' : ''}${v}%`,
  hazard_chance_pct: v => `Hazard chance ${v}%`,
  cleanliness_per_bell: v => `Cleanliness +${v}/bell`,
  heal_pct: v => `Healing +${v}%`,
  storage_bonus: v => `Storage +${v}`,
  capacity_bonus: v => `Capacity +${v}`,
  bed_slots: v => `Bed slots +${v}`,
  insight_per_bell: v => `Insight +${v.toFixed(1)}/bell`,
  nectar_per_bell: v => `Nectar +${v.toFixed(1)}/bell`,
  creature_bond_pct: v => `Creature bond +${v}%`,
  taming_pct: v => `Taming speed +${v}%`,
  brew_speed_pct: v => `Brewing +${v}%`,
  rift_fortune: v => `Rift Fortune +${v}`,
  rift_supply_slots: v => `Expedition slots +${v}`,
  renown_bonus: v => `Renown +${v}`
};

export function formatFurnitureEffect(kind: FurnitureEffectKind, value: number): string {
  return EFFECT_LABELS[kind](Number.isInteger(value) ? value : Math.round(value * 10) / 10);
}

/**
 * School tags for room hazards so Warder affinity applies.
 */
export const HAZARD_SCHOOL: Record<NonNullable<PlacedRoom['hazard']>['type'], SchoolType> = {
  spill_of_night: 'shadow',
  hex_fog: 'shadow',
  echo_loop: 'arcane',
  cold_snap: 'nature',
  breach: 'shadow'
};

/**
 * Classroom defId -> SchoolType mapping.
 */
export function classroomSchool(defId: string): SchoolType | undefined {
  if (!defId.startsWith('class_')) return undefined;
  const sch = defId.slice('class_'.length);
  if (sch === 'arcane' || sch === 'nature' || sch === 'light' || sch === 'shadow' || sch === 'alchemy') {
    return sch;
  }
  return undefined;
}

/**
 * Schools the Headmaster (wizard) has mastered (level >= 5).
 */
export function wizardMasteredSchools(levels: Partial<Record<SchoolType, number>>): SchoolType[] {
  const schools: SchoolType[] = ['arcane', 'nature', 'light', 'shadow', 'alchemy'];
  return schools.filter(s => (levels[s] || 0) >= 5);
}

export interface CareerAffinityDef {
  homeSchool: SchoolType | null;
  broadPct: number;
  focusedPct: number;
  broadLabel: string;
  focusedNoun: string;
}

/**
 * Career School Affinities.
 * Focused bonus applies to work tagged with ANY school the character has mastered.
 * Broad bonus applies to all of that career's work only if the character mastered the career's home school.
 * Use Math.max(focused, broad) — never add them.
 */
export const CAREER_AFFINITY: Record<CareerType, CareerAffinityDef> = {
  gardener: { homeSchool: 'nature', broadPct: 5, focusedPct: 10, broadLabel: 'all plant-growing rooms', focusedNoun: 'plants' },
  alchemist: { homeSchool: 'alchemy', broadPct: 5, focusedPct: 10, broadLabel: 'all alchemy production', focusedNoun: 'potions' },
  tamer: { homeSchool: 'nature', broadPct: 10, focusedPct: 20, broadLabel: 'all creatures', focusedNoun: 'creatures' },
  healer: { homeSchool: 'light', broadPct: 5, focusedPct: 10, broadLabel: 'everyone', focusedNoun: 'characters' },
  warder: { homeSchool: 'shadow', broadPct: 5, focusedPct: 10, broadLabel: 'all hazard/ward effects', focusedNoun: 'hazards' },
  scholar: { homeSchool: 'arcane', broadPct: 5, focusedPct: 10, broadLabel: 'research/study output', focusedNoun: 'research' },
  builder: { homeSchool: null, broadPct: 0, focusedPct: 0, broadLabel: '', focusedNoun: '' },
  teacher: { homeSchool: null, broadPct: 0, focusedPct: 0, broadLabel: '', focusedNoun: '' },
  adventurer: { homeSchool: null, broadPct: 0, focusedPct: 0, broadLabel: '', focusedNoun: '' }
};

/**
 * Returns the multiplier (e.g. 1.0, 1.05, 1.10, 1.20) for a character's career on a target school (or array of schools).
 * Never adds broad and focused bonuses; always takes the higher one that applies.
 */
export function careerAffinityMultiplier(
  masteredSchools: SchoolType[],
  career: CareerType | undefined,
  targetSchool?: SchoolType | SchoolType[]
): number {
  if (!career) return 1;
  const def = CAREER_AFFINITY[career];
  if (!def || (def.broadPct === 0 && def.focusedPct === 0)) return 1;

  const targets = Array.isArray(targetSchool)
    ? targetSchool
    : targetSchool
    ? [targetSchool]
    : [];

  const hasFocused = targets.some(s => masteredSchools.includes(s));
  const hasBroad = def.homeSchool !== null && masteredSchools.includes(def.homeSchool);
  const pct = Math.max(hasFocused ? def.focusedPct : 0, hasBroad ? def.broadPct : 0);
  return 1 + pct / 100;
}

function capSchool(s: SchoolType): string {
  return s[0].toUpperCase() + s.slice(1);
}

/**
 * Human-readable summary of what career affinity bonus a character would receive for a given career.
 */
export function describeCareerAffinity(masteredSchools: SchoolType[], career: CareerType): string {
  if (career === 'teacher') return 'Teaches mastered school classrooms only (no affinity bonus)';
  if (career === 'builder') return 'No school bonus';
  if (career === 'adventurer') return 'No school bonus';
  const def = CAREER_AFFINITY[career];
  if (!def || (def.broadPct === 0 && def.focusedPct === 0) || masteredSchools.length === 0) {
    return 'No school bonus';
  }
  const hasBroad = def.homeSchool !== null && masteredSchools.includes(def.homeSchool);
  const schoolList = masteredSchools.map(capSchool).join(' & ');
  if (hasBroad) {
    return `+${def.broadPct}% ${def.broadLabel}, +${def.focusedPct}% ${schoolList} ${def.focusedNoun}`;
  }
  return `+${def.focusedPct}% ${schoolList} ${def.focusedNoun} only`;
}


