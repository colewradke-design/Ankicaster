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
  InjuryType
} from '../types/ankicaster';
import {
  ROOM_DEFINITIONS,
  FURNITURE_DEFINITIONS,
  CREATURE_DEFINITIONS,
  RIFT_DESTINATIONS,
  SPELL_DEFINITIONS
} from '../data/content';
import {
  calculateReviewMana,
  calculateDailyVeilCost,
  calculateStudentSkill,
  isMasteryReady,
  calculateTeacherDelay,
  calculateRiftChance,
  calculateMorale
} from '../utils/formulas';

export class AnkicasterEngine {
  /**
   * Process one honest Anki review (BR-01, BR-03, BR-06, BR-07, Section 38.12)
   */
  static applyHonestReview(
    state: FullGameState,
    cardId: number,
    ease: 1 | 2 | 3 | 4,
    elapsedMs: number = 2400
  ): { state: FullGameState; toast?: string; notifications: string[] } {
    const next = structuredClone(state);
    const notifications: string[] = [];

    // H5 check: Anti-mash guard (answers < 800ms grant 0)
    if (elapsedMs < 800) {
      notifications.push('Review answered too quickly (<0.8s) — honest study pace required for mana.');
      return { state: next, notifications };
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

    // 2. Update Card Interval in mock Anki database
    const card = next.allCards[cardId];
    if (card) {
      card.lastStudiedMs = Date.now();
      if (ease === 1) {
        // Lapse: Interval resets or falls
        card.ivl = 1;
        card.lastAnswerIvl = 1;
        card.honestIvl = 1;
      } else if (ease === 2) {
        // Hard
        card.ivl = Math.max(1, Math.round(card.ivl * 1.2));
        card.lastAnswerIvl = card.ivl;
        card.honestIvl = card.ivl;
      } else if (ease === 3) {
        // Good
        card.ivl = Math.max(2, Math.round(card.ivl * 2.2));
        card.lastAnswerIvl = card.ivl;
        card.honestIvl = card.ivl;
      } else {
        // Easy
        card.ivl = Math.max(4, Math.round(card.ivl * 2.8));
        card.lastAnswerIvl = card.ivl;
        card.honestIvl = card.ivl;
      }
    }

    // Recalculate skill for students/faculty linked to this card
    for (const char of next.characters) {
      if (char.studySetId) {
        const studySet = next.cardSets.find(s => s.id === char.studySetId);
        if (studySet && studySet.cardIds.includes(cardId)) {
          const ivls = studySet.cardIds.map(id => next.allCards[id]?.honestIvl || 0);
          const oldSkill = calculateStudentSkill(ivls, next.settings.cardsPerStudent);
          // Check mastery ready
          if (isMasteryReady(ivls, next.settings.cardsPerStudent)) {
            if (!char.masteredSchools.includes(char.currentSchool || 'nature')) {
              // Mastery countdown increment
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
        // Complete session
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

        // Pop from queue if any
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
        // Builder slots advance 1.25x or wizard slot 1.0x
        room.buildProgress += 1;
        if (room.buildProgress >= room.buildRequired) {
          room.state = 'built';
          const rDef = ROOM_DEFINITIONS[room.defId];
          notifications.push(`🏗️ Completed construction of ${rDef ? rDef.name : 'new room'}!`);
          next.notices.push({
            id: `build-${Date.now()}-${room.id}`,
            time: Date.now(),
            type: 'build_complete',
            text: `Construction finished for ${rDef?.name || 'room'}. Ready for furnishings.`
          });
        }
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

    // 7. Healing Injuries in Infirmary
    for (const char of next.characters) {
      if (char.injury) {
        char.injury.points += 1.5; // heal rate
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

    return { state: next, toast: toastMsg, notifications };
  }

  /**
   * Ringing the bell (every 10 honest reviews)
   */
  static ringBell(state: FullGameState, notifications: string[]) {
    // 1. Classroom Essence Production
    for (const char of state.characters) {
      if (char.status === 'student' && char.seatRoomId && char.currentSchool) {
        const room = state.rooms.find(r => r.id === char.seatRoomId);
        if (room && room.state === 'built') {
          const moraleFactor = 0.6 + (0.6 * char.morale) / 100;
          const yieldAmount = 0.2 * moraleFactor;

          switch (char.currentSchool) {
            case 'arcane': state.resources.insight += yieldAmount; break;
            case 'nature': state.resources.herbs += yieldAmount; break;
            case 'light': state.resources.radiance += yieldAmount; break;
            case 'shadow': state.resources.umbra += yieldAmount; break;
            case 'alchemy': state.resources.reagents += yieldAmount; break;
          }
        }
      }
    }

    // 2. Grounds & Resource Plots Output
    for (const room of state.rooms) {
      if (room.state !== 'built') continue;
      if (room.defId === 'vegetable_patch') {
        state.resources.provisions = Math.min(500, state.resources.provisions + 1.0);
        state.resources.greens = Math.min(500, state.resources.greens + 0.2);
      } else if (room.defId === 'herb_garden') {
        state.resources.herbs += 0.6;
      } else if (room.defId === 'woodlot') {
        state.resources.timber = Math.min(500, state.resources.timber + 2);
        if (Math.random() < 0.02) state.resources.heartwood += 1;
      } else if (room.defId === 'quarry') {
        state.resources.stone = Math.min(500, state.resources.stone + 1);
        if (Math.random() < 0.04) state.resources.crystal += 1;
      } else if (room.defId === 'greenhouse') {
        state.resources.provisions = Math.min(500, state.resources.provisions + 1.5);
        state.resources.herbs += 0.5;
      } else if (room.defId === 'orchard') {
        state.resources.provisions = Math.min(500, state.resources.provisions + 0.8);
        state.resources.nectar = Math.min(500, state.resources.nectar + 0.3);
      }
    }

    // 3. Needs Decay & Morale Update
    for (const char of state.characters) {
      char.needs.hunger = Math.max(0, char.needs.hunger - 3);
      char.needs.rest = Math.max(0, char.needs.rest - 2);
      char.needs.leisure = Math.max(0, char.needs.leisure - 2);
      char.needs.composure = Math.max(0, char.needs.composure - 1);
      char.morale = calculateMorale(char.needs);
    }

    // 4. Mealtime every 5th bell
    if (state.bellIndex % 5 === 0) {
      const diners = state.characters.length;
      if (diners > 0) {
        const mealsAvailable = Math.floor(state.resources.provisions);
        const mealsServed = Math.min(diners, mealsAvailable);
        state.resources.provisions -= mealsServed;

        for (let i = 0; i < mealsServed; i++) {
          state.characters[i].needs.hunger = Math.min(100, state.characters[i].needs.hunger + 45);
        }

        if (mealsServed < diners) {
          notifications.push(`⚠️ Food shortage! ${diners - mealsServed} students went hungry.`);
        }
      }
    }

    // 5. Cleanliness & Mopslime
    let cleanBonus = 0;
    for (const c of state.creatures) {
      if (c.status === 'tamed' && c.defId === 'mopslime') cleanBonus += 3;
    }
    for (const r of state.rooms) {
      r.cleanliness = Math.min(100, r.cleanliness - 0.5 + cleanBonus);
    }
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

    const lastTime = next.lastSessionTimeMs || currentTimeMs;
    const diffMs = currentTimeMs - lastTime;
    const daysPassed = Math.floor(diffMs / (24 * 60 * 60 * 1000));

    // Always update lastSessionTimeMs to keep clock current
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
              }
            }
          }
        }
      }

      // Check thin Veil hazard spawn if Veil < 50%
      if (next.veil.strength < 50 && Math.random() < 0.25) {
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

    if (totalVeilPaid > 0) {
      summary.push(`Veil upkeep processed over ${daysPassed} day(s): ${totalVeilPaid} mana paid from reserve. Dome strength: ${next.veil.strength}%.`);
    }

    if (floorReached) {
      summary.push(`🛡️ 10% Bank Floor reached (${bankFloor} mana preserved). The Veil is holding steady in safe rest state (Rule BR-25).`);
    }

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
            }
          }
        }
      }
    }

    // 3. New Random Event Arrival
    if (Math.random() < 0.5) {
      const eventCandidates = ['misaddressed_owl', 'peddler', 'doorstep_basket', 'birthday', 'mysterious_seeds'];
      const chosen = eventCandidates[Math.floor(Math.random() * eventCandidates.length)];
      if (!next.activeEvents.some(e => e.eventId === chosen)) {
        next.activeEvents.push({ eventId: chosen, dayArrived: next.day });
        summary.push('📜 A new event has arrived at the Academy gates.');
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

    // Check retirement age: all cards in study set must exceed retirementAgeDays
    const retirementThreshold = next.settings.retirementAgeDays || 90;
    let canRetire = true;

    if (char.studySetId) {
      const studySet = next.cardSets.find(s => s.id === char.studySetId);
      if (studySet) {
        const notRetiredCards = studySet.cardIds.filter(cid => (next.allCards[cid]?.honestIvl || 0) < retirementThreshold);
        if (notRetiredCards.length > 0) {
          canRetire = false;
          return {
            state,
            success: false,
            error: `All cards must reach ${retirementThreshold} days interval before retirement (${notRetiredCards.length} cards still maturing).`
          };
        }
      }
    }

    // Release card sets back to free pool
    for (const set of next.cardSets) {
      if (set.characterId === charId) {
        set.released = true;
      }
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

    next.notices.push({
      id: `retire-${Date.now()}`,
      time: Date.now(),
      type: 'retirement',
      text: `🏛️ ${char.name} has gracefully retired to the Academy Alumni Gallery (+10 Renown)! Flashcards returned to free pool.`
    });

    return { state: next, success: true };
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

    const freeYoungCards = Object.values(next.allCards)
      .filter(c => !linkedCardIds.has(c.id) && c.honestIvl <= 30 && c.queue !== -1)
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

    const freeYoungCards = Object.values(next.allCards)
      .filter(c => !linkedCardIds.has(c.id) && c.honestIvl <= 30 && c.queue !== -1)
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
    next.resources.provisions -= provisionsNeeded;
    for (const s of suppliesTaken) {
      if (next.resources.potions[s]) next.resources.potions[s] = Math.max(0, next.resources.potions[s] - 1);
    }

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
  }

  /**
   * Place a new room site or instant room (GDD Section 15, 16)
   */
  static placeRoom(
    state: FullGameState,
    defId: string,
    area: 'castle' | 'grounds',
    targetX?: number,
    targetY?: number
  ): { state: FullGameState; success: boolean; error?: string } {
    const next = structuredClone(state);
    const def = ROOM_DEFINITIONS[defId];
    if (!def) return { state, success: false, error: 'Unknown room definition.' };

    // Check cost
    if (next.mana < (def.cost.mana || 0)) {
      return { state, success: false, error: `Need ${def.cost.mana} Mana.` };
    }
    if ((def.cost.timber || 0) > next.resources.timber) {
      return { state, success: false, error: `Need ${def.cost.timber} Timber (have ${next.resources.timber}).` };
    }
    if ((def.cost.stone || 0) > next.resources.stone) {
      return { state, success: false, error: `Need ${def.cost.stone} Stone (have ${next.resources.stone}).` };
    }
    if ((def.cost.glass || 0) > next.resources.glass) {
      return { state, success: false, error: `Need ${def.cost.glass} Glass (have ${next.resources.glass}).` };
    }
    if ((def.cost.cloth || 0) > next.resources.cloth) {
      return { state, success: false, error: `Need ${def.cost.cloth} Cloth (have ${next.resources.cloth}).` };
    }

    // Deduct cost
    next.mana -= def.cost.mana || 0;
    if (def.cost.timber) next.resources.timber -= def.cost.timber;
    if (def.cost.stone) next.resources.stone -= def.cost.stone;
    if (def.cost.glass) next.resources.glass -= def.cost.glass;
    if (def.cost.cloth) next.resources.cloth -= def.cost.cloth;

    // Determine grid placement
    let x = targetX ?? 0;
    let y = targetY ?? 0;
    const existing = next.rooms.filter(r => r.area === area);

    if (area === 'castle') {
      if (targetX === undefined || targetY === undefined) {
        // Find open slot
        const f0Count = existing.filter(r => r.y === 0).length;
        const f1Count = existing.filter(r => r.y === 1).length;
        if (f0Count < 7) {
          x = f0Count;
          y = 0;
        } else if (f1Count < 6) {
          x = f1Count;
          y = 1;
        } else {
          x = existing.filter(r => r.y === 2).length;
          y = 2;
        }
      }
    } else {
      // Grounds plot
      x = targetX ?? existing.length;
      y = 0;
    }

    const roomId = Date.now();
    const buildReq = def.buildReviews;
    const isInstant = buildReq === 0;

    const newRoom: PlacedRoom = {
      id: roomId,
      defId,
      x,
      y,
      w: def.size[0],
      h: def.size[1],
      area,
      level: 1,
      state: isInstant ? 'built' : 'site',
      buildRequired: buildReq,
      buildProgress: 0,
      buildPaused: false,
      cleanliness: 100,
      settings: {},
      furniture: []
    };

    // Auto-place required starter furniture if built instantly
    if (isInstant && def.requiredFurniture) {
      def.requiredFurniture.forEach((req, idx) => {
        newRoom.furniture.push({
          id: roomId * 10 + idx + 1,
          defId: req.role,
          slotKind: `required:${req.role}`,
          damaged: false
        });
      });
    }

    next.rooms.push(newRoom);
    next.notices.push({
      id: `room-built-${roomId}`,
      time: Date.now(),
      type: 'construction',
      text: isInstant
        ? `Built ${def.name} on ${area === 'castle' ? `Floor ${y}` : 'Sacred Grounds'}!`
        : `Construction site placed for ${def.name} (${buildReq} reviews to complete).`
    });

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
      const freeCards = Object.values(next.allCards)
        .filter(c => !linkedCardIds.has(c.id) && c.honestIvl <= 45 && c.queue !== -1)
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
          if (site.buildProgress >= site.buildRequired) site.state = 'built';
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
      if (next.mana < 30) return { state, success: false, error: 'Need 30 Mana for dispel spell.' };
      next.mana -= 30;
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
    for (const [food, amount] of Object.entries(def.diet)) {
      (next.resources as any)[food] -= amount;
    }

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
    const curLevel = next.wizard.levels[school] || 0;
    if (curLevel >= 10 && !isGrimoire) {
      return { state, success: false, error: `${school.toUpperCase()} is already at Master Level 10.` };
    }

    const targetLevel = curLevel + 1;
    const required = 25 * targetLevel;
    const cost = isGrimoire ? 250 : 25 * curLevel;

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
      state: 'active' as 'active'
    };

    if (!next.wizard.activeSession) {
      next.wizard.activeSession = session;
    } else {
      next.wizard.queuedSessions.push(session);
    }

    next.notices.push({
      id: `study-${Date.now()}`,
      time: Date.now(),
      type: 'wizard',
      text: `Pondering the Orb: Training towards ${school.toUpperCase()} Level ${targetLevel} (${required} reviews).`
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
          if (activeSite.buildProgress >= activeSite.buildRequired) activeSite.state = 'built';
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
   * Draw 3 cards from a Draft Deck (BR-26, Section 26)
   */
  static drawDraftCards(
    state: FullGameState,
    deck: 'foundation' | SchoolType
  ): { state: FullGameState; cards: DraftCard[]; cost: number; error?: string } {
    const next = structuredClone(state);
    const basePrice = deck === 'foundation' ? 120 : 150;
    const recent = next.draftHistory[deck] || 0;
    const cost = Math.round(basePrice * Math.pow(1.15, recent));

    if (next.mana < cost) {
      return { state, cards: [], cost, error: `Need ${cost} Mana to draft from the ${deck.toUpperCase()} deck.` };
    }

    next.mana -= cost;
    next.draftHistory[deck] = recent + 1;

    // Card pool definitions for deck
    const pool: Record<string, DraftCard[]> = {
      foundation: [
        { id: `c-fd-1`, deck: 'foundation', rarity: 'common', name: 'Refectory Plan', type: 'blueprint', targetId: 'refectory', description: 'Unlock blueprint for Refectory (communal dining and Leisure).' },
        { id: `c-fd-2`, deck: 'foundation', rarity: 'common', name: 'Bunk Bed Pattern', type: 'furniture_pattern', targetId: 'bunk_bed', description: 'Allows crafting space-saving Bunk Beds in Dormitories.' },
        { id: `c-fd-3`, deck: 'foundation', rarity: 'uncommon', name: 'Infirmary Plan', type: 'blueprint', targetId: 'infirmary', description: 'Blueprint for dedicated Infirmary to treat Rift injuries.' },
        { id: `c-fd-4`, deck: 'foundation', rarity: 'common', name: 'Supply Shipment Boon', type: 'boon', description: 'Instant crate of materials: +45 Timber, +30 Stone, +10 Glass.' },
        { id: `c-fd-5`, deck: 'foundation', rarity: 'uncommon', name: 'Grand Dormitory Plan', type: 'blueprint', targetId: 'grand_dormitory', description: 'Expansive student sleeping quarters with 8 bed capacity.' }
      ],
      arcane: [
        { id: `c-ar-1`, deck: 'arcane', rarity: 'common', name: 'Classroom of Arcane', type: 'blueprint', targetId: 'class_arcane', description: 'Blueprint for Arcane Lecture Hall (+5 student capacity).' },
        { id: `c-ar-2`, deck: 'arcane', rarity: 'uncommon', name: 'Observatory Plan', type: 'blueprint', targetId: 'observatory', description: 'Rooftop observatory yielding high Insight and celestial fortune.' },
        { id: `c-ar-3`, deck: 'arcane', rarity: 'rare', name: 'Astral Influx Boon', type: 'boon', description: 'Instant burst of knowledge: +35 Insight and +150 Mana.' },
        { id: `c-ar-4`, deck: 'arcane', rarity: 'epic', name: 'Ley Tap Blueprint', type: 'blueprint', targetId: 'ley_tap', description: 'Deep earth resonance tap generating continuous free mana.' }
      ],
      nature: [
        { id: `c-na-1`, deck: 'nature', rarity: 'common', name: 'Classroom of Nature', type: 'blueprint', targetId: 'class_nature', description: 'Blueprint for Nature Conservatory classroom.' },
        { id: `c-na-2`, deck: 'nature', rarity: 'uncommon', name: 'Greenhouse Plan', type: 'blueprint', targetId: 'greenhouse', description: 'Enclosed botanical greenhouse for year-round exotic herbs.' },
        { id: `c-na-3`, deck: 'nature', rarity: 'rare', name: 'Leaf-Fox Lure', type: 'lure', targetId: 'leaf_fox', description: 'Attracts an inquisitive Leaf-Fox kit to your academy habitat.' },
        { id: `c-na-4`, deck: 'nature', rarity: 'uncommon', name: 'Luminescent Seed Packet', type: 'seed', targetId: 'moonglow_fern', description: 'Unlock Moonglow Fern crop in sacred plots.' }
      ],
      light: [
        { id: `c-li-1`, deck: 'light', rarity: 'common', name: 'Classroom of Light', type: 'blueprint', targetId: 'class_light', description: 'Blueprint for luminous Hall of Radiance.' },
        { id: `c-li-2`, deck: 'light', rarity: 'uncommon', name: 'Sanctuary Plan', type: 'blueprint', targetId: 'sanctuary', description: 'Peaceful sanctuary restoring composure and morale.' },
        { id: `c-li-3`, deck: 'light', rarity: 'rare', name: 'Dawn Blessing Boon', type: 'boon', description: 'Radiant surge: +30 Radiance and fully cures one injured resident.' }
      ],
      shadow: [
        { id: `c-sh-1`, deck: 'shadow', rarity: 'common', name: 'Classroom of Shadow', type: 'blueprint', targetId: 'class_shadow', description: 'Blueprint for Shadow Crypt study hall.' },
        { id: `c-sh-2`, deck: 'shadow', rarity: 'uncommon', name: 'Ward Spire Plan', type: 'blueprint', targetId: 'ward_spire', description: 'Reinforces the Veil and reduces daily mana upkeep by 15%.' },
        { id: `c-sh-3`, deck: 'shadow', rarity: 'rare', name: 'Veil Tether Boon', type: 'boon', description: 'Instant +35% Veil Strength and +25 Umbra.' }
      ],
      alchemy: [
        { id: `c-al-1`, deck: 'alchemy', rarity: 'common', name: 'Classroom of Alchemy', type: 'blueprint', targetId: 'class_alchemy', description: 'Blueprint for Alchemy Lecture & Bench.' },
        { id: `c-al-2`, deck: 'alchemy', rarity: 'uncommon', name: 'Apothecary Plan', type: 'blueprint', targetId: 'apothecary', description: 'Workstation for brewing restorative elixirs.' },
        { id: `c-al-3`, deck: 'alchemy', rarity: 'rare', name: 'Elixir of Clarity Recipe', type: 'recipe_page', targetId: 'elixir_clarity', description: 'Recipe for clarity draft that speeds card review progress.' }
      ]
    };

    const choices = pool[deck] || pool.foundation;
    const shuffled = [...choices].sort(() => 0.5 - Math.random());
    const drawn = shuffled.slice(0, 3);

    return { state: next, cards: drawn, cost };
  }

  /**
   * Choose one draft card (Draw 3, Keep 1)
   */
  static chooseDraftCard(
    state: FullGameState,
    card: DraftCard
  ): { state: FullGameState; message: string } {
    const next = structuredClone(state);
    let message = `Selected ${card.name}!`;

    if (card.type === 'blueprint' && card.targetId) {
      if (!next.knownPlans.includes(card.targetId)) next.knownPlans.push(card.targetId);
      message = `Unlocked blueprint for ${card.name}! Available now in Build Menu.`;
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
      next.creatures.push({
        id: Date.now(),
        defId: card.targetId || 'leaf_fox',
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
      default:
        summary = 'The matter was handled gracefully by the Academy staff.';
    }

    next.notices.push({
      id: `evt-${Date.now()}`,
      time: Date.now(),
      type: 'event',
      text: summary
    });

    return { state: next, summary };
  }
}
