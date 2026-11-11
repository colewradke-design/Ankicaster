/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Ankicaster Pure Formula Implementation (GDD Section 41, Appendix A)
 */

import {
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
 */
export function getWizardLevelRequirements(level: number): { reviews: number; mana: number } {
  return {
    reviews: 25 * level,
    mana: 80 * level
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
  hasUmbralWyrm: boolean = false
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

  if (hasBatSwarm) reductions.push({ label: 'Velvet Bat Swarm', pct: 0.02 });
  if (hasUmbralWyrm) reductions.push({ label: 'Umbral Wyrmling', pct: 0.05 });

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
