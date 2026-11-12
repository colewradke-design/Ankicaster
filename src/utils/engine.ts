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
  AnkiCardSnapshot
} from '../types/ankicaster';
import {
  ROOM_DEFINITIONS,
  FURNITURE_DEFINITIONS,
  CREATURE_DEFINITIONS,
  RIFT_DESTINATIONS,
  SPELL_DEFINITIONS,
  SCHOOL_EVENTS
} from '../data/content';
import { createInitialGameState } from '../data/initialState';
import {
  validatePlacement,
  findAutoPlacement,
  roomLimitStatus,
  countRoomsOfType,
  newlyCutOffRooms,
  newlyUnsupportedRooms,
  placementCharge,
  defaultSpent,
  demolishRefund,
  REFUND_MATERIALS,
  BUILD_MATERIALS,
  PlacementCheck
} from './placement';
import { normalizeAppearance } from './appearance';
import {
  allFurnitureIds, fillRequiredFixtures, isRoomUnfinished, missingRequiredSlots, requiredInstallOption,
  requiredSlotStatus, costText, unaffordable
} from './requiredFurniture';
import {
  calculateReviewMana,
  calculateDailyVeilCost,
  calculateStudentSkill,
  isMasteryReady,
  calculateTeacherDelay,
  calculateRiftChance,
  calculateMorale,
  calculateRoomEfficiency,
  calculateRoomQuality,
  getWizardLevelRequirements
} from '../utils/formulas';
import { computeReachability, ReachabilityInfo } from './reachability';
import {
  DraftDeckId, DRAFT_TUTORIAL, dealDraft, deckPrice, isRoomUnlocked, isStructure, planHint
} from './decks';
import {
  BellNote, commitBell, ensureLedger, glassworksConversion, logResourceChange, logResourceDiff,
  resourceSnapshot, storageCap as storageCapOf, weavingOutput
} from './resourceReport';

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
      id: `rift-plan-${Date.now()}`,
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
        spellCooldowns: { ...state.wizard.spellCooldowns },
        activeSession: state.wizard.activeSession ? { ...state.wizard.activeSession } : undefined,
        queuedSessions: state.wizard.queuedSessions ? state.wizard.queuedSessions.map(s => ({ ...s })) : []
      },
      allCards: { ...state.allCards },
      characters: state.characters.map(c => ({
        ...c,
        needs: { ...c.needs },
        readyDays: { ...c.readyDays },
        chronicle: [...c.chronicle],
        injury: c.injury ? { ...c.injury } : undefined
      })),
      cardSets: state.cardSets.map(s => ({ ...s, cardIds: [...s.cardIds] })),
      rooms: state.rooms.map(r => ({ ...r, settings: { ...r.settings }, furniture: [...r.furniture] })),
      creatures: state.creatures.map(c => ({ ...c })),
      expeditions: state.expeditions.map(e => ({ ...e, suppliesTaken: [...e.suppliesTaken] })),
      resources: { ...state.resources, potions: { ...state.resources.potions } },
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
    const manaEarned = calculateReviewMana(next.wizard.levels.arcane);
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
    for (const char of next.characters) {
      if (char.studySetId) {
        const studySet = next.cardSets.find(s => s.id === char.studySetId);
        if (studySet && studySet.cardIds.includes(cardId)) {
          const ivls = studySet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
          if (isMasteryReady(ivls, next.settings.cardsPerStudent)) {
            if (!char.masteredSchools.includes(char.currentSchool || 'nature')) {
              const school = char.currentSchool || 'nature';
              char.readyDays[school] = (char.readyDays[school] || 0);
            }
          }
        }
      }
    }

    // 3. Advance Wizard Active Training Session (BR-06, BR-07)
    if (next.wizard.activeSession && next.wizard.activeSession.state === 'active') {
      next.wizard.activeSession.progress += 1;
      if (next.wizard.activeSession.progress >= next.wizard.activeSession.required) {
        const sess = next.wizard.activeSession;
        if (sess.kind === 'orb') {
          const sch = sess.school;
          const newLevel = (next.wizard.levels[sch] || 0) + 1;
          next.wizard.levels[sch] = Math.min(10, newLevel);
          notifications.push(`🎉 Wizard reached Level ${newLevel} in ${sch.toUpperCase()}!`);
          next.notices.push({
            id: `lvl-${Date.now()}`,
            time: Date.now(),
            type: 'level_up',
            text: `Wizard attained Level ${newLevel} in ${sch} magic.`
          });
        } else if (sess.kind === 'grimoire' && sess.spellId) {
          if (!next.wizard.knownSpells.includes(sess.spellId)) {
            next.wizard.knownSpells.push(sess.spellId);
            const spDef = SPELL_DEFINITIONS[sess.spellId];
            notifications.push(`✨ Mastered Grimoire Spell: ${spDef ? spDef.name : sess.spellId}!`);
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
    for (const room of next.rooms) {
      if (room.state === 'site' && !room.buildPaused) {
        room.buildProgress += 1;
        if (room.buildProgress >= room.buildRequired) AnkicasterEngine.completeSite(next, room, notifications);
      }
    }

    // 5. Advance Active Creature Taming & Hatching
    for (const c of next.creatures) {
      if (c.status === 'wary' && c.tamerId) {
        c.tamingProgress += 1;
        const cDef = CREATURE_DEFINITIONS[c.defId];
        if (cDef && c.tamingProgress >= cDef.tamingReviews) {
          c.status = 'tamed';
          notifications.push(`🐾 Tamed ${c.nickname} (${cDef.name})!`);
        }
      } else if (c.status === 'tamed') {
        c.bondProgress += 1;
        if (c.bondLevel === 1 && c.bondProgress >= 150) {
          c.bondLevel = 2;
          notifications.push(`❤️ Bond Level 2 reached with ${c.nickname}!`);
        } else if (c.bondLevel === 2 && c.bondProgress >= 400) {
          c.bondLevel = 3;
          notifications.push(`🌟 Bond Level 3 (Max) reached with ${c.nickname}!`);
        }
      }
    }

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
    for (const r of next.rooms) {
      if (r.defId !== 'infirmary' || r.state !== 'built' || isRoomUnfinished(r)) continue;
      infirmaryBonus = Math.max(infirmaryBonus, 1.5 * AnkicasterEngine.roomEfficiency(next, r));
    }
    const activeHealers = next.characters.filter(c => c.career === 'healer' && c.careerState === 'active').length;
    const hasHealingCreature = next.creatures.some(c => c.status === 'tamed' && (c.defId === 'halo_lamb' || c.defId === 'fen_sprite' || c.defId === 'ember_phoenix'));

    for (const char of next.characters) {
      if (char.injury) {
        let healRate = 1.0;
        if (infirmaryBonus > 0) healRate += infirmaryBonus;
        healRate += activeHealers * 1.5;
        if (hasHealingCreature) healRate += 1.5;

        char.injury.points += healRate;
        if (char.injury.points >= char.injury.required) {
          char.injury = undefined;
          notifications.push(`💖 ${char.name} has fully recovered from injury!`);
        }
      }
    }

    // 8. Decrement Spell Cooldowns
    for (const [spell, cd] of Object.entries(next.wizard.spellCooldowns)) {
      if (cd > 1) {
        next.wizard.spellCooldowns[spell] = cd - 1;
      } else {
        delete next.wizard.spellCooldowns[spell];
      }
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

  private static findOpenWorkplace(state: FullGameState, career: string, exceptId?: number): PlacedRoom | undefined {
    return state.rooms.find(r => {
      const wp = ROOM_DEFINITIONS[r.defId]?.workplace;
      return !!wp && wp.career === career && AnkicasterEngine.roomWorkable(r) && AnkicasterEngine.slotsUsed(state, r, exceptId) < wp.slots;
    });
  }

  /**
   * Point each working faculty member at a built, finished room of their career with a free slot.
   * Keeps a still-valid assignment. Clears the post when they have no career.
   */
  static syncWorkplaces(state: FullGameState): void {
    if (!state.characters || !state.rooms) return;
    for (const c of state.characters) {
      if (!c.career) {
        c.workplaceRoomId = undefined;
        continue;
      }
      if (c.careerState === 'sabbatical') continue;
      const current = c.workplaceRoomId != null ? state.rooms.find(r => r.id === c.workplaceRoomId) : undefined;
      const wp = current ? ROOM_DEFINITIONS[current.defId]?.workplace : undefined;
      const still = !!current && !!wp && wp.career === c.career && AnkicasterEngine.roomWorkable(current)
        && AnkicasterEngine.slotsUsed(state, current, c.id) < wp.slots;
      if (still) continue;
      c.workplaceRoomId = AnkicasterEngine.findOpenWorkplace(state, c.career, c.id)?.id;
    }
  }

  private static roomIsStaffed(state: FullGameState, room: PlacedRoom): boolean {
    const workplace = ROOM_DEFINITIONS[room.defId]?.workplace;
    if (!workplace || !STAFF_CAREERS.has(workplace.career)) return true;
    return state.characters.some(c => c.workplaceRoomId === room.id && c.career === workplace.career && c.careerState !== 'sabbatical');
  }

  private static roomIsLocked(state: FullGameState, room: PlacedRoom): boolean {
    return (room.lockedUntilReviewIndex ?? -1) > state.reviewIndex;
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
    return AnkicasterEngine.restTargetFromEfficiency(eff);
  }

  static restTarget(state: FullGameState, char: Character, reach?: Map<number, ReachabilityInfo>): number {
    const bed = char.bedRoomId != null ? state.rooms.find(r => r.id === char.bedRoomId) : undefined;
    return AnkicasterEngine.restTargetForRoom(state, bed, reach);
  }

  /**
   * Leisure seats from built, finished Common Room, Faculty Lounge, Bathhouse and Orchard,
   * each multiplied by that room's efficiency.
   * Bathhouse has no leisureSeats in content.ts, so it counts as 8.
   */
  private static leisureCapacity(state: FullGameState, reach?: Map<number, ReachabilityInfo>): number {
    const ids = new Set(['common_room', 'faculty_lounge', 'bathhouse', 'orchard']);
    let cap = 0;
    for (const room of state.rooms) {
      if (!ids.has(room.defId) || room.state !== 'built' || isRoomUnfinished(room)) continue;
      const listed = ROOM_DEFINITIONS[room.defId]?.capacity?.leisureSeats;
      const seats = listed ?? 8;
      cap += seats * AnkicasterEngine.roomEfficiency(state, room, reach);
    }
    return cap;
  }

  private static charmBonus(state: FullGameState): number {
    let charm = 0;
    for (const room of state.rooms) {
      if (room.state !== 'built') continue;
      for (const f of room.furniture) {
        const pts = FURNITURE_DEFINITIONS[f.defId]?.stats?.charm || 0;
        charm += f.damaged ? pts * 0.5 : pts;
      }
    }
    return Math.min(20, charm / 10);
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
    return 60 + AnkicasterEngine.charmBonus(state) + creatureBonus + AnkicasterEngine.veilModifier(state.veil.strength);
  }

  private static approachNeed(current: number, target: number, decay: number): number {
    const next = current + (target - current) * 0.25 - decay;
    return Math.min(100, Math.max(0, next));
  }

  /**
   * Who eats on a meal bell. cap is two sittings (floor(seats × 2 × efficiency)) across finished Refectories.
   * No Refectory means cap 0: everyone with food stands. Food, not seats, is what leaves someone unfed.
   */
  static mealPlan(state: FullGameState, reach?: Map<number, ReachabilityInfo>): { cap: number; seated: number; standing: number; unfed: number } {
    const diners = state.characters.length;
    const food = Math.max(0, Math.floor(state.resources.provisions));
    const refectories = state.rooms.filter(r => r.defId === 'refectory' && r.state === 'built' && !isRoomUnfinished(r));
    const seats = ROOM_DEFINITIONS.refectory?.capacity?.seats ?? 12;
    const cap = refectories.reduce((sum, r) => sum + Math.floor(seats * 2 * AnkicasterEngine.roomEfficiency(state, r, reach)), 0);
    const served = Math.min(diners, food);
    const seated = Math.min(served, cap);
    return { cap, seated, standing: served - seated, unfed: diners - served };
  }

  /**
   * Ringing the bell (every 10 honest reviews)
   */
  static ringBell(state: FullGameState, notifications: string[]) {
    const reach = computeReachability(state.rooms);
    const bellNotes: BellNote[] = [];
    const bag = state.resources as unknown as Record<string, number>;
    const note = (resource: string, before: number, source: string) => {
      const amount = (bag[resource] || 0) - before;
      if (amount) bellNotes.push({ resource, amount, source });
    };
    const roomName = (defId: string) => ROOM_DEFINITIONS[defId]?.name || defId;

    // 1. Classroom Essence Production (influenced by room hazards)
    for (const char of state.characters) {
      if (char.status === 'student' && char.seatRoomId && char.currentSchool) {
        const room = state.rooms.find(r => r.id === char.seatRoomId);
        if (room && room.state === 'built' && !isRoomUnfinished(room)) {
          // Hazard active effects
          if (room.hazard?.type === 'cold_snap') continue; // room frozen/disabled
          if (room.hazard?.type === 'echo_loop') continue; // suppresses classroom essence

          const eff = AnkicasterEngine.roomEfficiency(state, room, reach);
          if (eff <= 0) continue;

          let yieldMult = eff;
          if (room.hazard?.type === 'spill_of_night') yieldMult = eff * 0.5; // efficiency halved

          const moraleFactor = 0.6 + (0.6 * char.morale) / 100;
          const yieldAmount = 0.2 * moraleFactor * yieldMult;
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
    const hasTortoise = state.creatures.some(c => c.status === 'tamed' && c.defId === 'mossback_tortoise');
    const greenhouseMult = hasTortoise ? 1.05 : 1.0;
    const cap = AnkicasterEngine.storageCap(state);
    const store = (before: number, add: number) => (add > 0 && before >= cap ? before : add > 0 ? Math.min(cap, before + add) : before + add);

    for (const room of state.rooms) {
      if (room.state !== 'built' || isRoomUnfinished(room)) continue; // Unfinished rooms run at 0%
      if (room.hazard?.type === 'cold_snap') continue; // room disabled

      const eff = AnkicasterEngine.roomEfficiency(state, room, reach);
      if (eff <= 0) continue;

      let harvestMult = eff;
      if (room.hazard?.type === 'spill_of_night') {
        harvestMult = eff * 0.5;
        room.cleanliness = 0; // soot residue
      }

      if (room.defId === 'vegetable_patch') {
        const src = roomName(room.defId);
        let before = bag.provisions || 0;
        bag.provisions = store(before, 1.0 * harvestMult);
        note('provisions', before, src);
        before = bag.greens || 0;
        bag.greens = store(before, 0.2 * harvestMult);
        note('greens', before, src);
      } else if (room.defId === 'herb_garden') {
        const before = bag.herbs || 0;
        bag.herbs = before + 0.6 * harvestMult;
        note('herbs', before, roomName(room.defId));
      } else if (room.defId === 'woodlot') {
        const src = roomName(room.defId);
        let before = bag.timber || 0;
        bag.timber = store(before, 2 * harvestMult);
        note('timber', before, src);
        if (Math.random() < 0.02) {
          before = bag.heartwood || 0;
          bag.heartwood = before + 1;
          note('heartwood', before, src);
        }
      } else if (room.defId === 'quarry') {
        const src = roomName(room.defId);
        let before = bag.stone || 0;
        bag.stone = store(before, 1 * harvestMult);
        note('stone', before, src);
        if (Math.random() < 0.04) {
          before = bag.crystal || 0;
          bag.crystal = before + 1;
          note('crystal', before, src);
        }
      } else if (room.defId === 'greenhouse') {
        const src = roomName(room.defId);
        let before = bag.provisions || 0;
        bag.provisions = store(before, 1.5 * harvestMult * greenhouseMult);
        note('provisions', before, src);
        before = bag.herbs || 0;
        bag.herbs = before + 0.5 * harvestMult * greenhouseMult;
        note('herbs', before, src);
      } else if (room.defId === 'orchard') {
        const src = roomName(room.defId);
        let before = bag.provisions || 0;
        bag.provisions = store(before, 0.8 * harvestMult);
        note('provisions', before, src);
        before = bag.nectar || 0;
        bag.nectar = store(before, 0.3 * harvestMult);
        note('nectar', before, src);
      } else if (room.defId === 'glassworks') {
        const conv = glassworksConversion(bag.stone || 0, harvestMult, bag.glass || 0, cap);
        if (conv.stoneUsed > 0) {
          const beforeS = bag.stone || 0;
          bag.stone = beforeS - conv.stoneUsed;
          note('stone', beforeS, 'Glassworks');
          const beforeG = bag.glass || 0;
          bag.glass = beforeG + conv.glassGain;
          note('glass', beforeG, 'Glassworks');
        }
      } else if (room.defId === 'weaving_room') {
        const moonsheep = state.creatures.some(c => c.status === 'tamed' && c.defId === 'moonsheep');
        const gain = weavingOutput(harvestMult, moonsheep);
        const before = bag.cloth || 0;
        bag.cloth = store(before, gain);
        note('cloth', before, moonsheep ? 'Weaving Room (Moonsheep)' : 'Weaving Room');
      }
    }

    // 3. Creature Active Buffs per Bell
    const hasGlimmerhornStag = state.creatures.some(c => c.status === 'tamed' && c.defId === 'glimmerhorn_stag');
    let lanternMoth = false;

    for (const c of state.creatures) {
      if (c.status !== 'tamed') continue;
      const bump = (resource: string, amount: number) => {
        const before = bag[resource] || 0;
        bag[resource] = before + amount;
        note(resource, before, CREATURE_DEFINITIONS[c.defId]?.name || c.defId);
      };
      if (c.defId === 'thistle_hare') bump('herbs', 0.1);
      else if (c.defId === 'mistfeather_owl') bump('insight', 0.1);
      else if (c.defId === 'night_lynx') bump('umbra', 0.1);
      else if (c.defId === 'ember_phoenix') bump('radiance', 0.2);
      else if (c.defId === 'alembic_salamander') bump('reagents', 0.1);
      else if (c.defId === 'lantern_moth') lanternMoth = true;
    }

    // 4. Meal targets are stored on the meal bell, then hunger drifts toward them every bell (GDD 14.4).
    if (state.bellIndex % 5 === 0 && state.characters.length > 0) {
      const plan = AnkicasterEngine.mealPlan(state, reach);
      const served = plan.seated + plan.standing;
      const before = bag.provisions || 0;
      bag.provisions = before - served;
      note('provisions', before, `Meals (${served} people)`);
      state.characters.forEach((char, i) => {
        char.mealTarget = i < plan.seated ? 100 : i < served ? 50 : 25;
      });
      if (plan.unfed > 0) {
        notifications.push(`⚠️ Food shortage! ${plan.unfed} students went hungry.`);
      }
    }

    // 5. Needs. Hunger uses the stored meal target (50 until the first meal).
    const headcount = state.characters.length;
    const leisureTarget = 30 + 70 * Math.min(1, headcount > 0 ? AnkicasterEngine.leisureCapacity(state, reach) / headcount : 0);
    const compTarget = AnkicasterEngine.composureTarget(state);
    for (const char of state.characters) {
      char.needs.hunger = AnkicasterEngine.approachNeed(char.needs.hunger, char.mealTarget ?? 50, 4);
      char.needs.rest = AnkicasterEngine.approachNeed(char.needs.rest, AnkicasterEngine.restTarget(state, char, reach), 3);
      char.needs.leisure = AnkicasterEngine.approachNeed(char.needs.leisure, leisureTarget, 3);
      char.needs.composure = AnkicasterEngine.approachNeed(char.needs.composure, compTarget, 1);
    }

    // Creature and hazard tweaks apply after the need update.
    if (lanternMoth) {
      for (const char of state.characters) {
        char.needs.composure = Math.min(100, char.needs.composure + 1);
      }
    }

    for (const char of state.characters) {
      // Hex fog hazard in classroom or dorm causes extra composure drain
      if (char.seatRoomId) {
        const room = state.rooms.find(r => r.id === char.seatRoomId);
        if (room?.hazard?.type === 'hex_fog') {
          char.needs.composure = Math.max(0, char.needs.composure - 10);
        }
      }

      char.morale = calculateMorale(char.needs);
      // Glimmerhorn Stag applies +3 morale to all residents (applied after base morale recalculation so it is not overwritten)
      if (hasGlimmerhornStag) {
        char.morale = Math.min(100, char.morale + 3);
      }

      // Student Misbehavior driven by low morale (<40) or low composure (<40)
      if (char.status === 'student' && (char.morale < 40 || char.needs.composure < 40) && Math.random() < 0.15) {
        const incidents = [
          { text: `${char.name} skipped study hall to raid honey rolls from the refectory! (-5 Provisions, +10 Rest)`, apply: () => {
            const before = bag.provisions || 0;
            bag.provisions = Math.max(0, before - 5);
            note('provisions', before, 'Misbehavior');
            char.needs.rest = Math.min(100, char.needs.rest + 10);
          } },
          { text: `${char.name} accidentally set off a sulfur spark in the corridor! (Cleanliness -10)`, apply: () => { for (const r of state.rooms) r.cleanliness = Math.max(0, r.cleanliness - 2); } },
          { text: `${char.name} fell soundly asleep with their quill in the inkpot! (+15 Rest, Composure -5)`, apply: () => { char.needs.rest = Math.min(100, char.needs.rest + 15); char.needs.composure = Math.max(0, char.needs.composure - 5); } },
          { text: `${char.name} got into an enchanted chalk duel in the dormitory cloisters!`, apply: () => { char.needs.leisure = Math.min(100, char.needs.leisure + 15); char.needs.composure = Math.max(0, char.needs.composure - 5); } }
        ];
        const chosenInc = incidents[Math.floor(Math.random() * incidents.length)];
        chosenInc.apply();
        notifications.push(`⚠️ Misbehavior: ${chosenInc.text}`);
        state.notices.push({
          id: `misbehavior-${Date.now()}-${char.id}`,
          time: Date.now(),
          type: 'misbehavior',
          text: `Student Incident: ${chosenInc.text}`
        });
      }
    }

    // 6. Cleanliness & Mopslime
    let cleanBonus = 0;
    for (const c of state.creatures) {
      if (c.status === 'tamed' && c.defId === 'mopslime') cleanBonus += 3;
    }
    for (const r of state.rooms) {
      r.cleanliness = Math.min(100, r.cleanliness - 0.5 + cleanBonus);
    }
    commitBell(state, bellNotes);
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
    next.day += daysPassed;

    let totalVeilPaid = 0;
    let floorReached = false;

    // 10% Bank floor rule (BR-25)
    const bankFloor = Math.max(10, Math.round((next.bankAtLastReview || next.mana) * 0.1));

    for (let d = 0; d < processedDays; d++) {
      const warders = next.characters.filter(c => c.career === 'warder' && c.careerState === 'active').length;
      const batSwarm = next.creatures.some(c => c.status === 'tamed' && c.defId === 'velvet_bat_swarm');
      const umbralWyrm = next.creatures.some(c => c.status === 'tamed' && c.defId === 'umbral_wyrmling');

      const veilInfo = calculateDailyVeilCost(
        next.rooms,
        next.wizard.levels.shadow,
        warders,
        0,
        batSwarm,
        umbralWyrm
      );

      next.veil.costToday = veilInfo.cost;
      next.veil.reductions = veilInfo.reductions;

      if (next.veil.autoPay) {
        if (next.mana > bankFloor) {
          const availableToSpend = next.mana - bankFloor;
          const pay = Math.min(availableToSpend, veilInfo.cost);
          next.mana -= pay;
          totalVeilPaid += pay;
          next.veil.paidToday = pay;

          if (pay >= veilInfo.cost) {
            next.veil.strength = Math.min(100, next.veil.strength + 2);
          } else {
            const unpaidRatio = (veilInfo.cost - pay) / veilInfo.cost;
            next.veil.strength = Math.max(0, next.veil.strength - Math.round(15 * unpaidRatio));
          }
        } else {
          // Reached 10% bank floor!
          // Under BR-25 / BR-04: Breaks are safe! Auto-pay ceases and the Veil HOLDS STEADY without further decay.
          floorReached = true;
          next.veil.paidToday = 0;
        }
      }

      // Real Day Mastery Delays & Graduations
      for (const char of next.characters) {
        if (char.status === 'student' && char.studySetId) {
          const studySet = next.cardSets.find(s => s.id === char.studySetId);
          if (studySet) {
            const ivls = studySet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
            if (isMasteryReady(ivls, next.settings.cardsPerStudent)) {
              const sch = char.currentSchool || 'nature';
              char.readyDays[sch] = (char.readyDays[sch] || 0) + 1;

              const teacher = next.characters.find(c => c.career === 'teacher' && c.workplaceRoomId === char.seatRoomId);
              let teacherIvls: number[] = [];
              if (teacher && teacher.careerSetIds.length > 0) {
                const tSet = next.cardSets.find(s => s.id === teacher.careerSetIds[0]);
                if (tSet) teacherIvls = tSet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
              }

              const delay = calculateTeacherDelay(
                teacher ? 'teacher' : 'wizard',
                teacherIvls,
                next.wizard.levels[sch],
                next.wizard.levels.light
              );

              if (char.readyDays[sch] >= delay && !char.masteredSchools.includes(sch)) {
                char.masteredSchools.push(sch);
                char.title = `Master of ${sch.toUpperCase()}`;
                char.status = 'resident';
                next.renown += 10;
                summary.push(`🎓 ${char.name} completed real-time mastery countdown and graduated as Master of ${sch.toUpperCase()}!`);
                AnkicasterEngine.grantRiftGate(next);
              }
            }
          }
        }
      }

      // Real-day event arrival roll (one roll per real day picking from all 25 SCHOOL_EVENTS)
      if (Math.random() < 0.4) {
        const availableEvents = SCHOOL_EVENTS.filter(ev => !next.activeEvents.some(ae => ae.eventId === ev.id));
        if (availableEvents.length > 0) {
          const chosen = availableEvents[Math.floor(Math.random() * availableEvents.length)];
          next.activeEvents.push({ eventId: chosen.id, dayArrived: next.day });
          summary.push(`📜 Event arrived at Academy gates: ${chosen.name}.`);
        }
      }

      // Check thin Veil hazard spawn if Veil < 50%
      // Rule BR-25: While the player is away and the bank has hit the 10% floor, skip hazard rolls
      if (!floorReached && next.mana > bankFloor) {
        const hazardChance = Math.max(0.02, 0.25 * Math.pow(0.7, warders));
        if (next.veil.strength < 50 && Math.random() < hazardChance) {
          const eligibleRooms = next.rooms.filter(r => r.state === 'built' && !r.hazard);
          if (eligibleRooms.length > 0) {
            const target = eligibleRooms[Math.floor(Math.random() * eligibleRooms.length)];
            const hazards = [
              { type: 'spill_of_night' as const, name: 'Spill of Night', description: 'Gloom residue seeped through the thinning Veil.', effect: 'Halves room efficiency until dispelled.' },
              { type: 'hex_fog' as const, name: 'Hex Fog', description: 'Corrosive mist clinging to the floorboards.', effect: 'Students in this room lose composure faster.' },
              { type: 'echo_loop' as const, name: 'Echo Loop', description: 'A temporal chime repeating indefinitely.', effect: 'Suppresses classroom essence generation.' },
              { type: 'cold_snap' as const, name: 'Cold Snap', description: 'Sub-zero frost crystallizing across furnishings.', effect: 'Room unusable until thawed.' }
            ];
            const chosenHazard = hazards[Math.floor(Math.random() * hazards.length)];
            target.hazard = chosenHazard;
            summary.push(`⚠️ Thin Veil hazard emerged: ${chosenHazard.name} in ${ROOM_DEFINITIONS[target.defId]?.name || 'room'}!`);
          }
        }
      }
    }

    if (totalVeilPaid > 0) {
      summary.push(`Veil upkeep processed over ${daysPassed} day(s): ${totalVeilPaid} mana paid from reserve. Dome strength: ${next.veil.strength}%.`);
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

    // 1. Veil Upkeep Calculation (F23) with 10% Floor (BR-25)
    const warders = next.characters.filter(c => c.career === 'warder' && c.careerState === 'active').length;
    const batSwarm = next.creatures.some(c => c.status === 'tamed' && c.defId === 'velvet_bat_swarm');
    const umbralWyrm = next.creatures.some(c => c.status === 'tamed' && c.defId === 'umbral_wyrmling');

    const veilInfo = calculateDailyVeilCost(
      next.rooms,
      next.wizard.levels.shadow,
      warders,
      0,
      batSwarm,
      umbralWyrm
    );

    next.veil.costToday = veilInfo.cost;
    next.veil.reductions = veilInfo.reductions;

    const bankFloor = Math.max(10, Math.round((next.bankAtLastReview || next.mana) * 0.1));

    if (next.veil.autoPay) {
      if (next.mana > bankFloor) {
        const available = next.mana - bankFloor;
        const paid = Math.min(available, veilInfo.cost);
        next.mana -= paid;
        next.veil.paidToday = paid;

        if (paid >= veilInfo.cost) {
          next.veil.strength = Math.min(100, next.veil.strength + 3);
          summary.push(`Veil upkeep paid: ${paid} mana. Dome holds Strong (${next.veil.strength}%).`);
        } else {
          const unpaidRatio = (veilInfo.cost - paid) / veilInfo.cost;
          next.veil.strength = Math.max(0, next.veil.strength - Math.round(15 * unpaidRatio));
          summary.push(`⚠️ Partial Veil upkeep paid (${paid}/${veilInfo.cost} mana). Bank reached 10% floor (${bankFloor} mana). Dome holds steady at ${next.veil.strength}%.`);
        }
      } else {
        next.veil.paidToday = 0;
        summary.push(`🛡️ 10% Bank Floor active (${next.mana} mana). Veil holds steady at ${next.veil.strength}% without further decay.`);
      }
    }

    // 2. Mastery Delays and Graduation Checks
    for (const char of next.characters) {
      if (char.status === 'student' && char.studySetId) {
        const studySet = next.cardSets.find(s => s.id === char.studySetId);
        if (studySet) {
          const ivls = studySet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
          if (isMasteryReady(ivls, next.settings.cardsPerStudent)) {
            const sch = char.currentSchool || 'nature';
            char.readyDays[sch] = (char.readyDays[sch] || 0) + 1;

            const teacher = next.characters.find(c => c.career === 'teacher' && c.workplaceRoomId === char.seatRoomId);
            let teacherIvls: number[] = [];
            if (teacher && teacher.careerSetIds.length > 0) {
              const tSet = next.cardSets.find(s => s.id === teacher.careerSetIds[0]);
              if (tSet) teacherIvls = tSet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
            }

            const delay = calculateTeacherDelay(
              teacher ? 'teacher' : 'wizard',
              teacherIvls,
              next.wizard.levels[sch],
              next.wizard.levels.light
            );

            if (char.readyDays[sch] >= delay && !char.masteredSchools.includes(sch)) {
              char.masteredSchools.push(sch);
              char.title = `Master of ${sch.toUpperCase()}`;
              char.status = 'resident';
              next.renown += 10;
              summary.push(`🎓 Congratulations! ${char.name} has graduated as a Master of ${sch.toUpperCase()}!`);
              next.notices.push({
                id: `master-${Date.now()}-${char.id}`,
                time: Date.now(),
                type: 'mastery',
                text: `${char.name} graduated as Master of ${sch.toUpperCase()} (+10 Renown)!`
              });
              AnkicasterEngine.grantRiftGate(next);
            }
          }
        }
      }
    }

    // 3. New Random Event Arrival
    if (Math.random() < 0.4) {
      const availableEvents = SCHOOL_EVENTS.filter(ev => !next.activeEvents.some(ae => ae.eventId === ev.id));
      if (availableEvents.length > 0) {
        const chosen = availableEvents[Math.floor(Math.random() * availableEvents.length)];
        next.activeEvents.push({ eventId: chosen.id, dayArrived: next.day });
        summary.push(`📜 A new event has arrived at the Academy gates: ${chosen.name}.`);
      }
    }

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

    // Add to Alumni Gallery
    next.alumniGallery.push({
      id: char.id,
      name: char.name,
      portrait: char.appearance.hat || 'grand_hat',
      titles: char.masteredSchools.map(s => `Master of ${s.toUpperCase()}`),
      retiredDay: next.day,
      bonusType: 'renown_resonance',
      bonusValue: 10
    });

    next.renown += 10;
    next.characters.splice(charIndex, 1);
    AnkicasterEngine.grantRiftGate(next);

    next.notices.push({
      id: `retire-${Date.now()}`,
      time: Date.now(),
      type: 'retirement',
      text: `🏛️ ${char.name} has gracefully retired to the Academy Alumni Gallery (+10 Renown)! Flashcards returned to free pool.`
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

        // Add to Alumni Gallery
        next.alumniGallery.push({
          id: char.id,
          name: char.name,
          portrait: char.appearance.hat || 'grand_hat',
          titles: char.masteredSchools.map(s => `Master of ${s.toUpperCase()}`),
          retiredDay: next.day,
          bonusType: 'renown_resonance',
          bonusValue: 10
        });

        next.renown += 10;
        next.characters.splice(i, 1);
        retired.push(char);
        AnkicasterEngine.grantRiftGate(next);

        const msg = `🏛️ ${char.name} has automatically retired to the Alumni Gallery (+10 Renown) after all cards reached ${retirementThreshold}d retirement age!`;
        if (summary) summary.push(msg);
        next.notices.push({
          id: `auto-retire-${Date.now()}-${char.id}`,
          time: Date.now(),
          type: 'retirement',
          text: msg
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

      const report = {
        cardsStudied,
        mastersGraduated,
        renownEarned,
        honorTier,
        completedAt: currentTimeMs
      };

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

    // 1. Move any graduated masters to alumni gallery before reset
    for (const char of next.characters) {
      if (char.masteredSchools.length > 0) {
        if (!next.alumniGallery.some(a => a.name === char.name)) {
          next.alumniGallery.push({
            id: char.id,
            name: char.name,
            portrait: char.appearance?.hat || 'grand_hat',
            titles: char.masteredSchools.map(s => `Master of ${s.toUpperCase()}`),
            retiredDay: next.day,
            bonusType: 'renown_resonance',
            bonusValue: 10
          });
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

    // 4. Remove ALL creatures (GDD Item 41)
    next.creatures = [];

    // 5. Reset rooms and materials back to starting layout & stock (BR-34 / F36)
    const fresh = createInitialGameState();
    next.rooms = fresh.rooms;
    next.resources = fresh.resources;

    // 6. Reset unspent mana, renown, patterns, and this term's draw prices. Room plans stay.
    next.mana = 0;
    next.bankAtLastReview = 0;
    next.manaDebt = 0;
    next.renown = 0;
    next.knownPatterns = ['simple_cot', 'long_table', 'hearth', 'couch', 'potted_fern', 'bookshelf'];
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

    next.settings.termLengthDays = termLengthDays;
    next.termStartDateMs = now;
    next.termEndDateMs = now + (termLengthDays * 24 * 3600 * 1000);
    next.termInitialReviewIndex = next.reviewIndex;
    next.termInitialMasters = next.alumniGallery.length;
    next.termInitialRenown = 0;
    next.termFinishedReport = undefined;

    next.notices.push({
      id: `term-start-${now}`,
      time: now,
      type: 'term_start',
      text: `📜 New Academic Term commenced (${termLengthDays} days). Students, faculty, and creatures reset; card links freed; wizard masteries, spellbooks, and alumni honored!`
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

    if (char.masteredSchools.length < 1) {
      return { state, success: false, error: 'Character must have mastered their first school before enrolling in a second.' };
    }

    if (char.masteredSchools.includes(school) || char.currentSchool === school) {
      return { state, success: false, error: `Already enrolled in or mastered ${school.toUpperCase()}.` };
    }

    if ((next.wizard.levels[school] || 0) < 5) {
      return { state, success: false, error: `Wizard Level 5 in ${school.toUpperCase()} required to teach.` };
    }

    if (next.mana < 60) {
      return { state, success: false, error: '60 Mana required for advanced second-school enrollment.' };
    }

    // Check free young cards
    const linkedCardIds = new Set<number>();
    for (const set of next.cardSets) {
      if (!set.released) {
        for (const cid of set.cardIds) linkedCardIds.add(cid);
      }
    }

    const allowNew = next.settings.linkNewCards ?? false;
    const freeYoungCards = Object.values(next.allCards)
      .filter(c => !linkedCardIds.has(c.id) && c.honestIvl <= 30 && c.queue !== -1 && (allowNew || (c.type ?? 2) !== 0))
      .sort((a, b) => a.honestIvl - b.honestIvl);

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

    const chosenCards = freeYoungCards.slice(0, needed).map(c => c.id);
    const newSetId = Date.now();

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

    char.studySetId = newSetId;
    char.currentSchool = school;
    char.status = 'student';
    char.readyDays[school] = 0;
    char.chronicle.push({ day: next.day, text: `Enrolled in second school: ${school.toUpperCase()}.` });

    next.notices.push({
      id: `sec-school-${char.id}`,
      time: Date.now(),
      type: 'enrollment',
      text: `✨ ${char.name} embarked on advanced study in ${school.toUpperCase()} with 50 new flashcards linked!`
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
    const linkedCardIds = new Set<number>();
    for (const set of next.cardSets) {
      if (!set.released) {
        for (const cid of set.cardIds) linkedCardIds.add(cid);
      }
    }

    const allowNewCards = next.settings.linkNewCards ?? false;
    const freeYoungCards = Object.values(next.allCards)
      .filter(c => !linkedCardIds.has(c.id) && c.honestIvl <= 30 && c.queue !== -1 && (allowNewCards || (c.type ?? 2) !== 0))
      .sort((a, b) => a.honestIvl - b.honestIvl);

    const needed = next.settings.cardsPerStudent;
    if (freeYoungCards.length < needed) {
      return {
        state,
        success: false,
        error: `Enrollment tracker blocked: Only ${freeYoungCards.length} / ${needed} free young cards available.`
      };
    }

    // 4. Free Bed & Free Seat Check
    const dorms = next.rooms.filter(r => r.state === 'built' && (r.defId === 'dormitory' || r.defId === 'grand_dormitory'));
    let totalBeds = 0;
    for (const d of dorms) {
      totalBeds += d.furniture.filter(f => f.slotKind.includes('bed') && !f.damaged).length;
    }
    const currentStudents = next.characters.filter(c => c.status === 'student');
    if (currentStudents.length >= totalBeds) {
      return { state, success: false, error: 'No free student beds available. Build more Dormitories.' };
    }

    const classroomDefId = `class_${school}`;
    const classrooms = next.rooms.filter(r => r.state === 'built' && r.defId === classroomDefId);
    let totalSeats = 0;
    for (const c of classrooms) {
      totalSeats += (ROOM_DEFINITIONS[classroomDefId]?.capacity?.seats || 5);
    }
    const studentsInSchool = currentStudents.filter(c => c.currentSchool === school).length;
    if (studentsInSchool >= totalSeats) {
      return { state, success: false, error: `No free seats in ${school.toUpperCase()} classroom. Build another.` };
    }

    // Deduct mana
    next.mana -= 60;

    // Pick 50 youngest cards
    const chosenCards = freeYoungCards.slice(0, needed).map(c => c.id);

    const charId = Date.now();
    const setId = charId + 1;

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

    // Auto-assign first free bed and seat
    if (dorms.length > 0) newStudent.bedRoomId = dorms[0].id;
    if (classrooms.length > 0) newStudent.seatRoomId = classrooms[0].id;

    next.characters.push(newStudent);
    next.notices.push({
      id: `enr-${charId}`,
      time: Date.now(),
      type: 'enrollment',
      text: `${name} enrolled in ${school.toUpperCase()} with 50 flashcards linked!`
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

    if (teamIds.length === 0 || teamIds.length > 3) {
      return { state, success: false, error: 'Teams must consist of 1 to 3 adventurers.' };
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
    const partySkillDays = cardCount > 0 ? totalCardsIvl / cardCount : 0;

    const hasElixir = suppliesTaken.includes('rift_elixir');
    const isVeilThin = next.veil.strength < 50;

    const { chance } = calculateRiftChance(dest, partySkillDays, teamIds.length, hasElixir, isVeilThin);

    // Consume costs
    next.mana -= dest.cost;
    const beforeRes = resourceSnapshot(next);
    next.resources.provisions -= provisionsNeeded;
    for (const s of suppliesTaken) {
      if (next.resources.potions[s]) next.resources.potions[s] = Math.max(0, next.resources.potions[s] - 1);
    }
    logResourceDiff(next, beforeRes, `Expedition to ${dest.name}`);

    // Seeded outcome rolled at launch (Section 27.6)
    const roll = Math.floor(Math.random() * 100) + 1;
    const wrongRoll = Math.floor(Math.random() * 100) + 1;

    // Set heroes status to away
    for (const hId of teamIds) {
      const hero = next.characters.find(c => c.id === hId);
      if (hero) hero.status = 'away';
    }

    const expedition: ActiveExpedition = {
      id: Date.now(),
      destinationId,
      teamIds,
      companionId,
      suppliesTaken,
      partySkillDays,
      chance,
      fortune: 1,
      roll,
      wrongRoll,
      requiredReviews: dest.reviews,
      progressReviews: 0,
      state: 'active'
    };

    next.expeditions.push(expedition);
    next.notices.push({
      id: `rift-launch-${expedition.id}`,
      time: Date.now(),
      type: 'expedition',
      text: `Party stepped through the Rift towards ${dest.name}! (${dest.reviews} reviews to return)`
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

    const loot: string[] = [];

    if (exp.roll <= exp.chance) {
      // Safe Return (Full Rewards)
      exp.outcome = 'safe';
      notifications.push(`🏆 Safe Return from ${dest.name}! Party returned triumphant without a scratch.`);

      if (dest.id === 'mossy_hollow') {
        state.resources.timber += 40;
        state.resources.herbs += 20;
        loot.push('40 Timber', '20 Herbs');
        if (Math.random() < 0.4) {
          state.resources.seedsUnlocked.push('glimmerberry');
          loot.push('Glimmerberry Seeds');
        }
      } else if (dest.id === 'whispering_fen') {
        state.resources.herbs += 40;
        state.resources.moonsilk += 2;
        loot.push('40 Herbs', '2 Moonsilk');
        if (Math.random() < 0.3) {
          state.resources.seedsUnlocked.push('lumen_lily');
          loot.push('Lumen Lily Seeds');
        }
      } else if (dest.id === 'crystal_caverns') {
        state.resources.crystal += 5;
        state.resources.stone += 50;
        state.resources.golem_core += 1;
        state.resources.starmetal += 1;
        loot.push('5 Crystal', '50 Stone', '1 Golem Core', '1 Starmetal');
      } else if (dest.id === 'ashen_wastes') {
        state.resources.ember_salt += 3;
        state.resources.sunstone += 2;
        state.resources.void_pearl += 1;
        state.resources.phoenix_ash += 1;
        loot.push('3 Ember Salt', '2 Sunstone', '1 Void Pearl', '1 Phoenix Ash');
      } else if (dest.id === 'shattered_spire') {
        state.resources.starmetal += 4;
        state.resources.void_pearl += 3;
        state.resources.phoenix_ash += 2;
        state.renown += 15;
        loot.push('4 Starmetal', '3 Void Pearl', '2 Phoenix Ash', '+15 Renown');
      } else {
        state.resources.crystal += 3;
        state.resources.herbs += 30;
        loot.push('Exotic rift essences and treasures');
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

      let cum = 0;
      let chosenOutcome = 'minor_injury';
      for (const row of wrongTable) {
        cum += row.pct;
        if (exp.wrongRoll <= cum) {
          chosenOutcome = row.id;
          break;
        }
      }

      exp.outcome = chosenOutcome as any;
      const injuredHeroId = exp.teamIds[Math.floor(Math.random() * exp.teamIds.length)];
      const injuredHero = state.characters.find(c => c.id === injuredHeroId);

      if (chosenOutcome === 'minor_injury') {
        notifications.push(`⚠️ Expedition to ${dest.name}: ${injuredHero?.name} suffered minor bruises, but brought back full loot!`);
        if (injuredHero) injuredHero.injury = { type: 'bruised', points: 0, required: 30 };
        state.resources.timber += 25;
        loot.push('25 Timber', '10 Herbs');
      } else if (chosenOutcome === 'serious_injury') {
        notifications.push(`🚨 Serious Injury! ${injuredHero?.name} suffered a sprain/fracture. Half loot returned.`);
        if (injuredHero) injuredHero.injury = { type: 'sprained', points: 0, required: 80 };
        state.resources.timber += 12;
        loot.push('12 Timber (Half Loot)');
      } else if (chosenOutcome === 'curse') {
        notifications.push(`🔮 Curse of the Rift! ${injuredHero?.name} was hexed by otherworldly energies.`);
        if (injuredHero) injuredHero.injury = { type: 'hexed', points: 0, required: 120 };
        loot.push('Curio relic fragments');
      } else {
        notifications.push(`🏃 Party was forced to retreat empty-handed from ${dest.name}!`);
      }
    }

    exp.lootSummary = loot;
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

    // Per-room limits (content maxCount; sites count)
    const limit = roomLimitStatus(state.rooms, defId);
    if (limit.capped) return { state, success: false, error: `${limit.reason}.` };

    // Materials only. Mana is not a build cost.
    const charge = placementCharge(defId);
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

    const roomId = Math.max(Date.now(), ...next.rooms.map(r => r.id + 1));
    const buildReq = def.buildReviews;
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
    if (isInstant && def.requiredFurniture) fillRequiredFixtures(newRoom, allFurnitureIds(next.rooms));

    if (newRoom.fromPlan) {
      next.roomPlans = { ...(next.roomPlans || {}) };
      next.roomPlans[defId] = (next.roomPlans[defId] || 0) - 1;
    }

    next.rooms.push(newRoom);
    AnkicasterEngine.syncWorkplaces(next);
    next.notices.push({
      id: `room-built-${roomId}`,
      time: Date.now(),
      type: 'construction',
      text: isInstant
        ? `Built ${def.name} on ${placeArea === 'castle' ? `Floor ${y}` : 'Sacred Grounds'}!`
        : `Construction site placed for ${def.name} (${buildReq} reviews to complete).`
    });

    return { state: next, success: true, roomId, warnings };
  }

  /** Why a room can't be moved or demolished right now (undefined = allowed). */
  static roomActionBlock(state: FullGameState, roomId: number, action: 'move' | 'demolish'): string | undefined {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return 'Room not found.';
    const def = ROOM_DEFINITIONS[room.defId];
    if (room.hazard) return `Dispel the ${room.hazard.name || 'hazard'} first`;
    if (action === 'demolish' && def?.noDemolish && countRoomsOfType(state.rooms, room.defId, room.id) === 0) {
      return `The ${def.name} can't be demolished`;
    }
    if (action === 'demolish') {
      const after = state.rooms.filter(r => r.id !== roomId);
      const unsupported = newlyUnsupportedRooms(state.rooms, after);
      if (unsupported.length) return `${ROOM_DEFINITIONS[unsupported[0].defId]?.name || 'A room'} above needs it for support`;
      const cut = newlyCutOffRooms(state.rooms, after);
      if (cut.length) return `It would cut ${ROOM_DEFINITIONS[cut[0].defId]?.name || 'a room'} off from the Entrance Hall`;
    }
    return undefined;
  }

  /** Validate moving a room to (x, y): same rules as placement, plus nothing else may lose support or connection. */
  static validateMove(state: FullGameState, roomId: number, x: number, y: number): PlacementCheck {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return { valid: false, errors: ['Room not found.'], warnings: [] };
    const block = AnkicasterEngine.roomActionBlock(state, roomId, 'move');
    if (block) return { valid: false, errors: [block], warnings: [] };
    const ny = room.area === 'grounds' ? 0 : y;
    if (room.x === x && room.y === ny) return { valid: false, errors: ['Already here'], warnings: [] };
    const check = validatePlacement(state, room.defId, room.area, x, ny, roomId);
    if (!check.valid) return check;
    const after = state.rooms.map(r => (r.id === roomId ? { ...r, x, y: ny } : r));
    const unsupported = newlyUnsupportedRooms(state.rooms, after);
    if (unsupported.length) {
      return { valid: false, errors: [`${ROOM_DEFINITIONS[unsupported[0].defId]?.name || 'A room'} above needs it for support`], warnings: [] };
    }
    const cut = newlyCutOffRooms(state.rooms, after).filter(r => r.id !== roomId);
    if (cut.length) {
      return { valid: false, errors: [`It would cut ${ROOM_DEFINITIONS[cut[0].defId]?.name || 'a room'} off from the Entrance Hall`], warnings: [] };
    }
    return check;
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
    const def = ROOM_DEFINITIONS[room.defId];
    next.notices.push({
      id: `move-${roomId}-${Date.now()}`,
      time: Date.now(),
      type: 'construction',
      text: `Moved ${def?.name || 'room'} to ${room.area === 'castle' ? `Floor ${room.y}, column ${room.x}` : `plot ${room.x}`}.`
    });
    return { state: next, success: true, warnings: check.warnings };
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
    next.notices.push({ id: `pause-${Date.now()}-${r.id}`, time: Date.now(), type: 'build', text: paused ? `Paused construction of ${name}. Progress is kept.` : `Resumed construction of ${name}.` });
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
    const def = ROOM_DEFINITIONS[room.defId];
    const refund = demolishRefund(room);

    const beforeRes = resourceSnapshot(next);
    // A demolished vault stops counting toward the cap before the refund is added.
    next.rooms = next.rooms.filter(r => r.id !== roomId);
    next.mana += refund.mana;
    for (const k of BUILD_MATERIALS) {
      const n = (refund as unknown as Record<string, number>)[k] || 0;
      if (n) (next.resources as unknown as Record<string, number>)[k] = ((next.resources as unknown as Record<string, number>)[k] || 0) + n;
    }
    logResourceDiff(next, beforeRes, `${refund.cancel ? 'Cancelled' : 'Demolished'} ${def?.name || 'room'}`);

    // Furniture -> inventory
    next.furnitureInventory = { ...(next.furnitureInventory || {}) };
    for (const f of room.furniture) {
      if (!FURNITURE_DEFINITIONS[f.defId] || f.slotKind.startsWith('required:')) continue; // required fixtures refund nothing
      next.furnitureInventory[f.defId] = (next.furnitureInventory[f.defId] || 0) + 1;
    }

    // Undo renovation renown
    next.renown = Math.max(0, next.renown - (room.renownGranted || 0));

    if (room.fromPlan) {
      next.roomPlans = { ...(next.roomPlans || {}) };
      next.roomPlans[room.defId] = (next.roomPlans[room.defId] || 0) + 1;
    }

    // Occupants: same-kind room if one exists, otherwise between rooms
    const bedKinds = ['dormitory', 'grand_dormitory', 'faculty_quarters'];
    const sameKind = (ids: string[]) => next.rooms.find(r => r.state === 'built' && ids.includes(r.defId));
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

    const parts = BUILD_MATERIALS.filter(k => ((refund as unknown as Record<string, number>)[k] || 0) > 0).map(k => `${(refund as unknown as Record<string, number>)[k]} ${k}`);
    if (refund.mana > 0) parts.unshift(`${refund.mana} mana`);
    next.notices.push({
      id: `demolish-${roomId}-${Date.now()}`,
      time: Date.now(),
      type: 'construction',
      text: `${refund.cancel ? 'Cancelled' : 'Demolished'} ${def?.name || 'room'}${parts.length ? ` (returned ${parts.join(', ')})` : ''}${moved ? '; occupants reassigned' : ''}.`
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
    if (out.furnitureInventory === undefined && out.rooms) out.furnitureInventory = {};
    // One-time migration for saves from before required fixtures were enforced: fill any empty
    // required slot of a room that is already built, with the instant-build shape, so existing
    // rooms keep working. Sites are left alone. It runs once per save (the version marker), so a
    // room that finishes construction later keeps its fixtures empty until the player installs
    // them, even across reloads. Running it again changes nothing.
    if (Array.isArray(out.rooms) && (out.requiredFixturesVersion ?? 0) < 1) {
      const ids = allFurnitureIds(out.rooms);
      out.rooms = out.rooms.map((r: PlacedRoom) => {
        if (!r || r.state !== 'built' || missingRequiredSlots({ defId: r.defId, furniture: r.furniture || [] }).length === 0) return r;
        const copy: PlacedRoom = { ...r, furniture: [...(r.furniture || [])] };
        fillRequiredFixtures(copy, ids);
        return copy;
      });
      out.requiredFixturesVersion = 1;
    }
    if (Array.isArray(out.characters) && Array.isArray(out.rooms) && (out.staffingVersion ?? 0) < 1) {
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
      id: `build-${Date.now()}-${room.id}`,
      time: Date.now(),
      type: 'build_complete',
      text: missing.length
        ? `Construction finished for ${name}. It is Unfinished (0%) until you install: ${list}. Open the room to install them.`
        : `Construction finished for ${name}. Ready for furnishings.`
    });
    AnkicasterEngine.syncWorkplaces(next);
  }

  /**
   * Install one empty required slot (GDD 17.1). Cost comes from the furniture catalog
   * (requiredInstallOption); a role with no catalog entry is free. A stored copy of the same
   * item is used first, for free. Required fixtures are never refunded or returned by demolish.
   */
  static installRequiredFixture(
    state: FullGameState,
    roomId: number,
    slotIndex: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };
    if (room.state !== 'built') return { state, success: false, error: 'Finish construction first.' };
    const slot = requiredSlotStatus(room).find(s => s.index === slotIndex);
    if (!slot) return { state, success: false, error: 'No such required slot.' };
    if (slot.filled) return { state, success: false, error: `${slot.name} is already installed.` };
    const opt = requiredInstallOption(slot.role);
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    const r = next.rooms.find(x => x.id === roomId)!;
    const stored = next.furnitureInventory?.[opt.defId] || 0;
    if (!opt.free && stored > 0) {
      next.furnitureInventory = { ...next.furnitureInventory, [opt.defId]: stored - 1 };
    } else if (!opt.free) {
      const why = unaffordable(next, opt.cost);
      if (why) return { state, success: false, error: why };
      next.mana -= opt.cost.mana || 0;
      const res = next.resources as unknown as Record<string, number>;
      for (const [k, v] of Object.entries(opt.cost)) if (k !== 'mana' && v) res[k] -= v;
    }
    const ids = allFurnitureIds(next.rooms);
    let id = r.id * 10 + slot.index + 1;
    if (ids.has(id)) id = Math.max(0, ...ids) + 1;
    r.furniture.push({ id, defId: opt.defId, slotKind: `required:${slot.role}`, damaged: false });
    const rDef = ROOM_DEFINITIONS[r.defId];
    const left = missingRequiredSlots(r).length;
    next.notices.push({
      id: `reqfurn-${Date.now()}-${r.id}-${slot.index}`,
      time: Date.now(),
      type: 'furniture',
      text: `Installed ${slot.name} in ${rDef?.name || 'room'} (${opt.free ? 'free' : costText(opt.cost)}).${left ? ` ${left} required fixture${left === 1 ? '' : 's'} still missing.` : ' The room is now open.'}`
    });
    AnkicasterEngine.syncWorkplaces(next);
    logResourceDiff(next, beforeRes, `Installed ${slot.name}`);
    return { state: next, success: true };
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
    if (room.level >= 3) return { state, success: false, error: 'Room is already at maximum Level 3.' };

    const def = ROOM_DEFINITIONS[room.defId];
    const upgradeCost = Math.round((def?.cost.mana || 100) * 0.75) + 50;
    if (next.mana < upgradeCost) {
      return { state, success: false, error: `Need ${upgradeCost} Mana to renovate to Level ${room.level + 1}.` };
    }

    next.mana -= upgradeCost;
    room.level = (room.level + 1) as 2 | 3;
    next.renown += 5;
    room.renownGranted = (room.renownGranted || 0) + 5;

    next.notices.push({
      id: `upg-${roomId}-${room.level}`,
      time: Date.now(),
      type: 'renovation',
      text: `${def?.name || 'Room'} upgraded to Level ${room.level}! (+5 Renown)`
    });

    return { state: next, success: true };
  }

  /**
   * Add furniture to room
   */
  static addFurniture(
    state: FullGameState,
    roomId: number,
    furnitureDefId: string
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false, error: 'Room not found.' };

    const fDef = FURNITURE_DEFINITIONS[furnitureDefId];
    if (!fDef) return { state, success: false, error: 'Unknown furniture item.' };

    const roomDef = ROOM_DEFINITIONS[room.defId];
    const maxSlots = (roomDef?.optionalSlots || 2) + (room.level - 1) * 2;
    const currentSlots = room.furniture.filter(f => !f.slotKind.startsWith('required:')).reduce((acc, f) => {
      const def = FURNITURE_DEFINITIONS[f.defId];
      return acc + (def?.slots || 1);
    }, 0);

    if (currentSlots + fDef.slots > maxSlots) {
      return { state, success: false, error: `No available slots in this room (${currentSlots}/${maxSlots} used).` };
    }

    // A stored item (returned by demolition) is re-installed for free
    const stored = next.furnitureInventory?.[furnitureDefId] || 0;
    if (stored > 0) {
      next.furnitureInventory = { ...next.furnitureInventory, [furnitureDefId]: stored - 1 };
    } else {
    if (next.mana < fDef.cost.mana) {
      return { state, success: false, error: `Need ${fDef.cost.mana} Mana.` };
    }
    if ((fDef.cost.timber || 0) > next.resources.timber) {
      return { state, success: false, error: `Need ${fDef.cost.timber} Timber.` };
    }
    if ((fDef.cost.stone || 0) > next.resources.stone) {
      return { state, success: false, error: `Need ${fDef.cost.stone} Stone.` };
    }
    if ((fDef.cost.cloth || 0) > next.resources.cloth) {
      return { state, success: false, error: `Need ${fDef.cost.cloth} Cloth.` };
    }

    next.mana -= fDef.cost.mana;
    if (fDef.cost.timber) next.resources.timber -= fDef.cost.timber;
    if (fDef.cost.stone) next.resources.stone -= fDef.cost.stone;
    if (fDef.cost.cloth) next.resources.cloth -= fDef.cost.cloth;
    }

    room.furniture.push({
      id: Date.now(),
      defId: furnitureDefId,
      slotKind: fDef.role === 'bed' ? 'bed' : 'optional',
      damaged: false
    });

    next.notices.push({
      id: `furn-${Date.now()}`,
      time: Date.now(),
      type: 'furniture',
      text: `Installed ${fDef.name} into ${roomDef?.name}.`
    });
    logResourceDiff(next, beforeRes, `Installed ${fDef.name}`);

    return { state: next, success: true };
  }

  /**
   * Remove furniture from room
   */
  static removeFurniture(
    state: FullGameState,
    roomId: number,
    furnitureId: number
  ): { state: FullGameState; success: boolean } {
    const next = structuredClone(state);
    const room = next.rooms.find(r => r.id === roomId);
    if (!room) return { state, success: false };

    room.furniture = room.furniture.filter(f => f.id !== furnitureId);
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
    career: CareerType
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const char = next.characters.find(c => c.id === charId);
    if (!char) return { state, success: false, error: 'Character not found.' };

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

    // Check faculty limits (F12, BR-14, BR-22)
    const facultyCareers: CareerType[] = ['teacher', 'scholar', 'gardener', 'tamer', 'healer', 'warder', 'alchemist', 'builder'];
    if (facultyCareers.includes(career)) {
      const activeFaculty = next.characters.filter(c => c.career && facultyCareers.includes(c.career) && c.careerState === 'active' && c.id !== char.id).length;
      
      const dorms = next.rooms.filter(r => r.state === 'built' && (r.defId === 'dormitory' || r.defId === 'grand_dormitory' || r.defId === 'faculty_quarters'));
      let facultyBeds = 0;
      for (const d of dorms) {
        facultyBeds += d.furniture.filter(f => f.slotKind.includes('faculty_bed') || f.slotKind.includes('bed')).length;
      }

      const totalWiz = Object.values(next.wizard.levels).reduce((a, b) => a + b, 0);
      const classroomsCount = next.rooms.filter(r => r.state === 'built' && (r.defId.startsWith('class_') || r.defId.startsWith('hall_'))).length;
      const studentsCount = next.characters.filter(c => c.status === 'student').length;

      // F12 formula
      const maxAllowed = Math.min(
        1 + Math.floor(totalWiz / 4),
        Math.max(1, facultyBeds),
        1 + 2 * classroomsCount,
        1 + Math.floor(studentsCount / 3),
        12
      );

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
    const linkedCardIds = new Set<number>();
    for (const set of next.cardSets) {
      if (!set.released) {
        for (const cid of set.cardIds) linkedCardIds.add(cid);
      }
    }

    // Check if char already has a career set for this specific career
    const existingCareerSet = next.cardSets.find(s => s.characterId === char.id && s.career === career && !s.released);

    if (!existingCareerSet) {
      const allowNewCards = next.settings.linkNewCards ?? false;
      const freeCards = Object.values(next.allCards)
        .filter(c => !linkedCardIds.has(c.id) && c.honestIvl <= 45 && c.queue !== -1 && (allowNewCards || (c.type ?? 2) !== 0))
        .sort((a, b) => a.honestIvl - b.honestIvl);

      const needed = 20;
      if (freeCards.length < needed) {
        return {
          state,
          success: false,
          error: `Need ${needed} free young flashcards to link career expertise (found ${freeCards.length}).`
        };
      }

      const chosen = freeCards.slice(0, needed).map(c => c.id);
      const careerSetId = Date.now();
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
    AnkicasterEngine.syncWorkplaces(next);
    char.chronicle.push({
      day: next.day,
      text: previousCareer
        ? `Switched career from ${previousCareer.toUpperCase()} to ${career.toUpperCase()} (retaining prior expertise).`
        : `Appointed as Academy ${career.toUpperCase()}.`
    });

    next.notices.push({
      id: `career-${char.id}`,
      time: Date.now(),
      type: 'career',
      text: previousCareer
        ? `🔄 ${char.name} transitioned careers to ${career.toUpperCase()} with 20 new flashcards linked!`
        : `🏛️ ${char.name} has taken the mantle of ${career.toUpperCase()}!`
    });

    return { state: next, success: true };
  }

  /**
   * Use / Consume a Potion from inventory
   */
  static usePotion(
    state: FullGameState,
    potionId: string,
    targetId?: number
  ): { state: FullGameState; success: boolean; error?: string; message?: string } {
    const next = structuredClone(state);
    const count = next.resources.potions[potionId] || 0;
    if (count <= 0) {
      return { state, success: false, error: 'No potions of this type in inventory.' };
    }

    next.resources.potions[potionId] -= 1;
    let message = 'Potion consumed.';

    switch (potionId) {
      case 'healing_draught':
        const injuredHero = targetId
          ? next.characters.find(c => c.id === targetId)
          : next.characters.find(c => c.injury);
        if (injuredHero && injuredHero.injury) {
          injuredHero.injury = undefined;
          message = `💖 Healing Draught consumed! ${injuredHero.name}'s injuries are completely cured.`;
        } else {
          message = 'Healing Draught consumed (all residents are healthy).';
        }
        break;

      case 'draught_of_composure':
        const targetStudent = targetId
          ? next.characters.find(c => c.id === targetId)
          : next.characters[0];
        if (targetStudent) {
          targetStudent.needs.composure = 100;
          targetStudent.morale = Math.min(100, targetStudent.morale + 25);
          message = `✨ Draught of Composure consumed by ${targetStudent.name}! Composure 100%, +25 Morale.`;
        }
        break;

      case 'beast_cordial':
        const waryCreature = targetId
          ? next.creatures.find(c => c.id === targetId)
          : next.creatures.find(c => c.status === 'wary');
        if (waryCreature) {
          waryCreature.tamingProgress += 30;
          const cDef = CREATURE_DEFINITIONS[waryCreature.defId];
          if (cDef && waryCreature.tamingProgress >= cDef.tamingReviews) {
            waryCreature.status = 'tamed';
            message = `🐾 Beast Cordial administered! ${waryCreature.nickname} is now fully tamed!`;
          } else {
            message = `🐾 Beast Cordial administered! +30 taming progress to ${waryCreature.nickname}.`;
          }
        } else {
          message = 'Beast Cordial consumed, but no wary creatures were found.';
        }
        break;

      case 'veil_tincture':
        next.veil.strength = Math.min(100, next.veil.strength + 25);
        message = '🛡️ Veil Tincture poured into the reservoir! Veil strength surged by +25%.';
        break;

      case 'quickening_elixir':
        const site = next.rooms.find(r => r.state === 'site');
        if (site) {
          site.buildProgress += 30;
          if (site.buildProgress >= site.buildRequired) AnkicasterEngine.completeSite(next, site);
          message = `⚡ Quickening Elixir poured over construction site: +30 reviews progress!`;
        } else {
          message = 'Quickening Elixir consumed.';
        }
        break;

      case 'phoenix_draught':
        for (const c of next.characters) {
          c.injury = undefined;
        }
        message = '🔥 Phoenix Draught consumed! All injuries across the entire academy are instantly purged!';
        break;

      default:
        message = `Drank ${potionId}! Energy and focus restored.`;
    }

    next.notices.push({
      id: `potion-use-${Date.now()}`,
      time: Date.now(),
      type: 'potion',
      text: message
    });

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
      const hasWarder = next.characters.some(c => c.career === 'warder' && c.careerState === 'active');
      if (!hasWarder) return { state, success: false, error: 'Requires an active Warder on faculty.' };
    }

    const hazardName = room.hazard.name;
    room.hazard = undefined;
    room.cleanliness = Math.max(room.cleanliness, 80);

    next.notices.push({
      id: `hazard-clear-${Date.now()}`,
      time: Date.now(),
      type: 'hazard',
      text: `✨ Cleared hazard "${hazardName}" from ${ROOM_DEFINITIONS[room.defId]?.name || 'room'} using ${method}!`
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

    const def = CREATURE_DEFINITIONS[creature.defId];
    if (!def) return { state, success: false, error: 'Creature species unknown.' };

    // Check diet
    let canFeed = true;
    for (const [food, amount] of Object.entries(def.diet)) {
      const current = (next.resources as any)[food] || 0;
      if (current < amount) {
        canFeed = false;
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
    creature.bondProgress += 10;
    if (creature.bondLevel === 1 && creature.bondProgress >= 150) creature.bondLevel = 2;
    else if (creature.bondLevel === 2 && creature.bondProgress >= 400) creature.bondLevel = 3;

    next.notices.push({
      id: `feed-${creature.id}`,
      time: Date.now(),
      type: 'creature',
      text: `🍎 Fed ${creature.nickname} (${def.name})! Bond deepened.`
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
   * Queue Wizard Arcane Study Session (BR-05, BR-06)
   */
  static queueWizardSession(
    state: FullGameState,
    school: SchoolType,
    isGrimoire: boolean = false,
    spellId?: string
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);

    // Total sessions cap: max 5 sessions including active session
    const totalSessions = (next.wizard.activeSession ? 1 : 0) + next.wizard.queuedSessions.length;
    if (totalSessions >= 5) {
      return { state, success: false, error: 'Maximum of 5 wizard training sessions (active + queued).' };
    }

    const curLevel = next.wizard.levels[school] || 0;
    let targetLevel = 1;
    let cost = 250;
    let required = 50;

    if (!isGrimoire) {
      const activeForSchool = (next.wizard.activeSession && next.wizard.activeSession.school === school && next.wizard.activeSession.kind === 'orb') ? 1 : 0;
      const queuedForSchool = next.wizard.queuedSessions.filter(s => s.school === school && s.kind === 'orb').length;
      targetLevel = curLevel + activeForSchool + queuedForSchool + 1;

      if (targetLevel > 10) {
        return { state, success: false, error: `${school.toUpperCase()} training capped at Master Level 10.` };
      }

      cost = 80 * targetLevel;
      required = 25 * targetLevel;
    }

    if (next.mana < cost) {
      return { state, success: false, error: `Need ${cost} Mana to ponder this arcane mystery.` };
    }

    next.mana -= cost;
    const session = {
      id: Date.now(),
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

    next.notices.push({
      id: `study-${Date.now()}`,
      time: Date.now(),
      type: 'wizard',
      text: `Pondering the Orb: Training towards ${school.toUpperCase()} Level ${targetLevel} (${required} reviews, cost ${cost}m).`
    });

    return { state: next, success: true };
  }

  /**
   * Cast a Wizard Spell (BR-29, Section 29)
   */
  static castSpell(
    state: FullGameState,
    spellId: string
  ): { state: FullGameState; success: boolean; error?: string; notice?: string } {
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    const spell = SPELL_DEFINITIONS[spellId];
    if (!spell) return { state, success: false, error: 'Unknown spell.' };

    if ((next.wizard.spellCooldowns[spellId] || 0) > 0) {
      return { state, success: false, error: `Spell on cooldown for ${next.wizard.spellCooldowns[spellId]} more reviews.` };
    }

    if (next.mana < spell.manaCost) {
      return { state, success: false, error: `Need ${spell.manaCost} Mana to cast ${spell.name}.` };
    }

    next.mana -= spell.manaCost;
    next.wizard.spellCooldowns[spellId] = spell.cooldownReviews;

    let notice = `${spell.name} cast! ${spell.effect}`;

    // Execute effect
    switch (spellId) {
      case 'glow':
      case 'dispel':
        notice = `${spell.name} cast! Hazards dispelled.`;
        break;
      case 'beckon':
        const loose = next.creatures.find(c => c.status === 'loose');
        if (loose) loose.status = 'tamed';
        notice = 'Beckon cast! Escaped creature has returned home safely.';
        break;
      case 'rain_dance':
      case 'verdant_surge':
        next.resources.greens += 35;
        next.resources.herbs += 20;
        notice = `${spell.name} cast! Sacred plots flourish with bonus harvest.`;
        break;
      case 'mend':
      case 'sunburst':
        const injured = next.characters.find(c => c.injury);
        if (injured && injured.injury) {
          injured.injury.points += 40;
          if (injured.injury.points >= injured.injury.required) injured.injury = undefined;
          notice = `Mend cast! Healed injuries of ${injured.name}.`;
        }
        break;
      case 'veil_stitch':
        next.veil.strength = Math.min(100, next.veil.strength + 20);
        notice = 'Veil Stitch cast! Veil strength surged by +20%.';
        break;
      case 'tidy_wind':
        next.rooms.forEach(r => { r.cleanliness = 100; });
        notice = 'Tidy Wind cast! Academy rooms restored to pristine cleanliness.';
        break;
      case 'quickening':
        const activeSite = next.rooms.find(r => r.state === 'site');
        if (activeSite) {
          activeSite.buildProgress += 25;
          if (activeSite.buildProgress >= activeSite.buildRequired) AnkicasterEngine.completeSite(next, activeSite);
          notice = `Quickening cast! +25 progress points granted to ${activeSite.defId}.`;
        }
        break;
      case 'transmute':
        if (next.resources.timber >= 30) {
          next.resources.timber -= 30;
          next.resources.stone += 30;
          notice = 'Transmute cast! 30 Timber transmuted into 30 Stone.';
        }
        break;
    }

    next.notices.push({
      id: `spell-${Date.now()}`,
      time: Date.now(),
      type: 'spell',
      text: notice
    });
    logResourceDiff(next, beforeRes, spell.name || 'Spell');

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
    const potion = next.potions.find(p => p.id === potionId);
    if (!potion) return { state, success: false, error: 'Potion recipe not found.' };

    if (next.mana < 30) {
      return { state, success: false, error: 'Need 30 Mana for alchemical reagent catalyst.' };
    }

    next.mana -= 30;
    next.resources.potions[potionId] = (next.resources.potions[potionId] || 0) + 1;

    next.notices.push({
      id: `brew-${Date.now()}`,
      time: Date.now(),
      type: 'alchemy',
      text: `Brewed 1x ${potion.name}! (${potion.effect})`
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

    const cards = dealDraft(next, deck, rng);
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
   * Choose one draft card (Draw 3, Keep 1)
   */
  static chooseDraftCard(
    state: FullGameState,
    card: DraftCard
  ): { state: FullGameState; message: string } {
    const next = structuredClone(state);
    const beforeRes = resourceSnapshot(next);
    let message = `Selected ${card.name}!`;

    if (card.type === 'blueprint' && card.targetId) {
      next.roomPlans = { ...(next.roomPlans || {}) };
      next.roomPlans[card.targetId] = (next.roomPlans[card.targetId] || 0) + 1;
      message = `Kept a ${ROOM_DEFINITIONS[card.targetId]?.name || card.name} plan. It can be built once.`;
    } else if (card.type === 'furniture_pattern' && card.targetId) {
      if (!next.knownPatterns.includes(card.targetId)) next.knownPatterns.push(card.targetId);
      message = `Learned furniture pattern for ${card.name}!`;
    } else if (card.type === 'boon') {
      if (card.name.includes('Supply')) {
        next.resources.timber += 45;
        next.resources.stone += 30;
        next.resources.glass += 10;
        message = 'Supply crate unpacked: +45 Timber, +30 Stone, +10 Glass!';
      } else if (card.name.includes('Astral')) {
        next.resources.insight += 35;
        next.mana += 150;
        message = 'Astral Influx absorbed: +35 Insight, +150 Mana!';
      } else if (card.name.includes('Dawn')) {
        next.resources.radiance += 30;
        message = 'Dawn Blessing received: +30 Radiance!';
      } else if (card.name.includes('Veil')) {
        next.veil.strength = Math.min(100, next.veil.strength + 35);
        next.resources.umbra += 25;
        message = 'Veil Tether attuned: +35% Veil Strength, +25 Umbra!';
      }
    } else if (card.type === 'lure') {
      const creatureDefId = (card.targetId && card.targetId in CREATURE_DEFINITIONS) ? card.targetId : 'bramblefox';
      next.creatures.push({
        id: Date.now(),
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
      message = 'Creature lure was successful! A wild creature arrived outside your habitat.';
    }

    next.notices.push({
      id: `draft-pick-${Date.now()}`,
      time: Date.now(),
      type: 'draft',
      text: message
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
          next.knownPatterns.push('canopy_bed');
          summary = 'Purchased Canopy Bed blueprint from the Curio Cart!';
        } else {
          summary = 'Insufficient mana for the curio purchase.';
        }
        break;
      case 'buy_lantern':
        if (next.mana >= 120) {
          next.mana -= 120;
          next.knownPatterns.push('ward_lantern');
          summary = 'Purchased Ward Lantern blueprint from the Curio Cart!';
        } else {
          summary = 'Insufficient mana for the curio purchase.';
        }
        break;
      case 'keep_creature':
        next.creatures.push({
          id: Date.now(),
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
        next.creatures.push({
          id: Date.now(),
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
        next.mana += 150;
        summary = 'Condensed pure crystalline liquid mana (+150 Mana)!';
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
        next.characters.forEach(c => { c.injury = undefined; });
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
        next.mana += 120;
        summary = 'Capacitor attuned to starlight pulse (+120 Mana)!';
        break;
      case 'starlight_picnic':
        next.characters.forEach(c => {
          c.needs.rest = Math.min(100, c.needs.rest + 25);
          c.morale = Math.min(100, c.morale + 25);
        });
        summary = 'Midnight meteor watching refreshed all students (+25 Rest & Morale)!';
        break;
      case 'grant_mana':
        next.mana += 200;
        summary = 'Received Arcanum endowment research fund (+200 Mana)!';
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
        next.mana += 150;
        summary = 'Alumni scholarship bequest deposited (+150 Mana)!';
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
      default:
        summary = 'The matter was handled gracefully by the Academy staff.';
    }

    next.notices.push({
      id: `evt-${Date.now()}`,
      time: Date.now(),
      type: 'event',
      text: summary
    });
    logResourceDiff(next, beforeRes, 'Gate event');

    return { state: next, summary };
  }
}
