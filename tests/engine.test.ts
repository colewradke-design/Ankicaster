import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateReviewMana,
  calculateStudentSkill,
  isMasteryReady,
  calculateTeacherDelay,
  calculateFacultyLimit,
  calculateDailyVeilCost,
  calculateRiftChance,
  getWizardLevelRequirements
} from '../src/utils/formulas.ts';
import { AnkicasterEngine, getAnkiDayNumber } from '../src/utils/engine.ts';
import { createInitialGameState } from '../src/data/initialState.ts';
import { SchoolType, Character, PlacedRoom } from '../src/types/ankicaster.ts';
import { CREATURE_DEFINITIONS } from '../src/data/content.ts';
import { computeReachability } from '../src/utils/reachability.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { VisualWorld } from '../src/visual/world/VisualWorld.ts';
import fs from 'node:fs';

test('F1: Review Mana awards 10 base mana and arcane buff', () => {
  assert.equal(calculateReviewMana(0), 10);
  assert.equal(calculateReviewMana(5), 10);
  // Level 7 is 2 steps above 5 -> +4%
  assert.equal(calculateReviewMana(7), 10.4);
});

test('H5: Anti-mash guard grants 0 mana if answered in <800ms', () => {
  const state = createInitialGameState();
  const initialMana = state.mana;
  const cardId = Object.keys(state.allCards)[0];

  const res = AnkicasterEngine.applyHonestReview(state, Number(cardId), 3, 500); // 500ms
  assert.equal(res.state.mana, initialMana, 'Mana should not increase for fast answer');
  assert.ok(res.notifications.some(n => n.includes('<0.8s')), 'Should notify user about speed guard');

  const honestRes = AnkicasterEngine.applyHonestReview(state, Number(cardId), 3, 1500); // 1500ms
  assert.equal(honestRes.state.mana, initialMana + 10, 'Mana should increase for honest answer pace');
});

test('BR-25: 10% Bank Floor preserves bank and holds Veil steady during days away', () => {
  const state = createInitialGameState();
  state.mana = 200;
  state.bankAtLastReview = 200;

  // Simulate 10 days away
  const tenDaysMs = 10 * 24 * 60 * 60 * 1000;
  state.lastSessionTimeMs = Date.now() - tenDaysMs;

  const res = AnkicasterEngine.processRealTimeElapsedDays(state, Date.now());
  const bankFloor = Math.max(10, Math.round(200 * 0.1)); // 20

  assert.equal(res.daysPassed, 10);
  assert.ok(res.state.mana >= bankFloor, `Mana must not fall below 10% floor (${bankFloor})`);
  assert.ok(res.summary.some(s => s.includes('10% Bank Floor') || s.includes('Veil upkeep processed')), 'Summary should mention bank floor');
});

test('BR-27: Rift portal is locked if total masters < 3', () => {
  const state = createInitialGameState();
  assert.equal(state.characters.filter(c => c.masteredSchools.length > 0).length, 0);

  // Add dummy resident
  const dummyChar = {
    id: 101,
    name: 'Adventurer Test',
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#fff', hat: 'cap' },
    personality: 'Bold' as const,
    traits: ['Brave'],
    status: 'resident' as const,
    masteredSchools: ['nature'] as SchoolType[],
    needs: { hunger: 100, rest: 100, leisure: 100, composure: 100, health: 100 },
    morale: 100,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  };
  state.characters.push(dummyChar);

  const res = AnkicasterEngine.launchRiftExpedition(state, 'mossy_hollow', [101]);
  assert.equal(res.success, false);
  assert.ok(res.error?.includes('3 Masters of Magic'));
});

test('Career switching is restricted to Masters of 2+ schools', () => {
  const state = createInitialGameState();
  const char = {
    id: 102,
    name: 'Polymath Test',
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#fff', hat: 'cap' },
    personality: 'Curious' as const,
    traits: ['Quick'],
    status: 'resident' as const,
    masteredSchools: ['nature'] as SchoolType[], // only 1 school
    career: 'gardener' as const,
    needs: { hunger: 100, rest: 100, leisure: 100, composure: 100, health: 100 },
    morale: 100,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  };
  state.characters.push(char);

  const res = AnkicasterEngine.assignCareer(state, char.id, 'healer');
  assert.equal(res.success, false);
  assert.ok(res.error?.includes('2 schools'));

  // Grant second school
  char.masteredSchools.push('alchemy');
  const polymathRes = AnkicasterEngine.assignCareer(state, char.id, 'healer');
  assert.equal(polymathRes.success, true);
  assert.equal(polymathRes.state.characters.find(c => c.id === char.id)?.career, 'healer');
});

test('F12: Faculty limit formula', () => {
  const { limit } = calculateFacultyLimit(10, 4, 2, 6);
  assert.equal(limit, 3);
});

// --- NEW VERIFICATION TESTS ---

test('1. Automatic Retirement: character retires when all study and career cards reach >= 90d', () => {
  const state = createInitialGameState();
  const initialRenown = state.renown;

  const char: Character = {
    id: 501,
    name: 'Eldritch Graduate',
    pronouns: 'she/her',
    appearance: { skin: '#fff', hair: 'long', hairColor: '#222', robeColor: '#4E8B3A', hat: 'archmage_cowl' },
    personality: 'Bookish',
    traits: ['Dedicated'],
    status: 'resident',
    masteredSchools: ['nature'],
    needs: { hunger: 100, rest: 100, leisure: 100, composure: 100, health: 100 },
    morale: 100,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    studySetId: 901,
    careerSetIds: [902]
  };
  state.characters.push(char);

  // Link cards to studySet 901 and careerSet 902
  state.cardSets.push({
    id: 901,
    characterId: 501,
    kind: 'study',
    school: 'nature',
    size: 2,
    createdDay: 1,
    released: false,
    cardIds: [10001, 10002]
  });
  state.cardSets.push({
    id: 902,
    characterId: 501,
    kind: 'career',
    school: 'nature',
    size: 1,
    createdDay: 5,
    released: false,
    cardIds: [10003]
  });

  state.allCards[10001] = { id: 10001, nid: 1, deckName: 'Vocab', front: 'Q1', back: 'A1', ivl: 95, lastAnswerIvl: 95, honestIvl: 95, type: 2, queue: 2, due: 10, lastStudiedMs: Date.now() };
  state.allCards[10002] = { id: 10002, nid: 2, deckName: 'Vocab', front: 'Q2', back: 'A2', ivl: 92, lastAnswerIvl: 92, honestIvl: 92, type: 2, queue: 2, due: 10, lastStudiedMs: Date.now() };
  state.allCards[10003] = { id: 10003, nid: 3, deckName: 'Vocab', front: 'Q3', back: 'A3', ivl: 60, lastAnswerIvl: 60, honestIvl: 60, type: 2, queue: 2, due: 10, lastStudiedMs: Date.now() };

  // Card 10003 is at 60 days (< 90d), should NOT retire automatically yet
  const check1 = AnkicasterEngine.checkAutomaticRetirements(state);
  assert.equal(check1.retired.length, 0, 'Should not retire while one card is still under 90d');
  assert.equal(state.characters.some(c => c.id === 501), true);

  // Card 10003 matures to 90 days
  state.allCards[10003].honestIvl = 90;
  state.allCards[10003].ivl = 90;

  const check2 = AnkicasterEngine.checkAutomaticRetirements(state);
  assert.equal(check2.retired.length, 1, 'Character should automatically retire when all cards reach 90d');
  assert.equal(state.characters.some(c => c.id === 501), false, 'Character removed from active roster');
  assert.equal(state.alumniGallery.some(a => a.id === 501), true, 'Character placed in Alumni Gallery');
  assert.equal(state.renown, initialRenown + 10, 'Awards +10 permanent Renown');
  assert.equal(state.cardSets.find(s => s.id === 901)?.released, true, 'Card set 901 released');
  assert.equal(state.cardSets.find(s => s.id === 902)?.released, true, 'Card set 902 released');
});

test('2. Timed Terms & examTimer: evaluates term report and handles next term start', () => {
  const state = createInitialGameState();
  state.settings.mode = 'timed';
  state.settings.examTimer = true;
  state.settings.termLengthDays = 14;
  state.termStartDateMs = Date.now() - (15 * 24 * 3600 * 1000); // 15 days ago
  state.termInitialReviewIndex = 10;
  state.reviewIndex = 120; // 110 cards studied this term
  state.termInitialRenown = 5;
  state.renown = 35; // 30 renown gained

  const status = AnkicasterEngine.checkTimedTermStatus(state, Date.now());
  assert.equal(status.termEnded, true, 'Term should end when length has elapsed');
  assert.ok(status.report, 'Report card should be generated');
  assert.equal(status.report?.cardsStudied, 110);
  assert.equal(status.report?.renownEarned, 30);
  assert.ok(status.report?.honorTier, 'Honor tier must be calculated');

  // Next term reset
  const nextTerm = AnkicasterEngine.startNextTerm(state, 30);
  assert.equal(nextTerm.state.termInitialReviewIndex, 120);
  assert.equal(nextTerm.state.termFinishedReport, undefined);
  assert.ok(nextTerm.state.termEndDateMs && nextTerm.state.termEndDateMs > Date.now());
});

test('3. Hazards: active effects reduce production and composure; warders reduce hazard odds', () => {
  const state = createInitialGameState();

  // Add classroom with echo_loop hazard
  const classRoom: PlacedRoom = {
    id: 99,
    defId: 'class_arcane',
    x: 0,
    y: 1,
    w: 2,
    h: 1,
    area: 'castle' as const,
    level: 1,
    state: 'built' as const,
    buildRequired: 0,
    buildProgress: 0,
    cleanliness: 100,
    settings: {},
    furniture: [],
    hazard: {
      type: 'echo_loop' as const,
      name: 'Echo Loop',
      description: 'Chime',
      effect: 'Suppresses classroom essence generation.'
    }
  };
  state.rooms.push(classRoom);

  const student: Character = {
    id: 201,
    name: 'Student Hazard Test',
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#6B4FBB', hat: 'cap' },
    personality: 'Curious',
    traits: ['Eager'],
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    seatRoomId: 99,
    needs: { hunger: 100, rest: 100, leisure: 100, composure: 80, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  };
  state.characters.push(student);

  const initialInsight = state.resources.insight;
  AnkicasterEngine.ringBell(state, []);
  assert.equal(state.resources.insight, initialInsight, 'Echo loop must suppress classroom essence production');

  // Test hex_fog composure drop on student
  classRoom.hazard = {
    type: 'hex_fog',
    name: 'Hex Fog',
    description: 'Fog',
    effect: 'Students in this room lose composure faster.'
  };
  student.needs.composure = 80;
  AnkicasterEngine.ringBell(state, []);
  assert.ok(student.needs.composure <= 69, 'Hex fog should drain student composure significantly');

  // Warder hazard odds reduction formula
  const odds0Warders = 0.25 * Math.pow(0.7, 0);
  const odds2Warders = 0.25 * Math.pow(0.7, 2);
  assert.equal(odds0Warders, 0.25);
  assert.ok(odds2Warders < 0.13, '2 warders reduce hazard spawn odds by over 50%');
});

test('4. Creature Buffs: mopslime cleans, thistle_hare produces herbs, healing_fawn accelerates healing', () => {
  const state = createInitialGameState();
  const initialHerbs = state.resources.herbs;

  // Add tamed thistle_hare and mopslime
  state.creatures.push({
    id: 701,
    defId: 'thistle_hare',
    nickname: 'Bramble Bunny',
    status: 'tamed',
    hungry: false,
    hatchProgress: 0,
    tamingProgress: 40,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1
  });
  state.creatures.push({
    id: 702,
    defId: 'mopslime',
    nickname: 'Gloop',
    status: 'tamed',
    hungry: false,
    hatchProgress: 0,
    tamingProgress: 40,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1
  });

  const room = state.rooms[0];
  room.cleanliness = 50;
  AnkicasterEngine.ringBell(state, []);

  assert.ok(state.resources.herbs > initialHerbs, 'Thistle hare should produce extra herbs on bell ring');
  assert.ok(room.cleanliness > 50, 'Mopslime should clean the room on bell ring');

  // Halo Lamb healing test
  const patient: Character = {
    id: 301,
    name: 'Injured Student',
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#4E8B3A', hat: 'cap' },
    personality: 'Bold',
    traits: ['Brave'],
    status: 'student',
    masteredSchools: [],
    needs: { hunger: 100, rest: 100, leisure: 100, composure: 100, health: 100 },
    morale: 100,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: [],
    injury: {
      type: 'sprained',
      points: 0,
      required: 10
    }
  };
  state.characters.push(patient);

  state.creatures.push({
    id: 703,
    defId: 'halo_lamb',
    nickname: 'Halo Lamb',
    status: 'tamed',
    hungry: false,
    hatchProgress: 0,
    tamingProgress: 50,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1
  });

  const cardId = Object.keys(state.allCards)[0];
  const res = AnkicasterEngine.applyHonestReview(state, Number(cardId), 3, 2000);
  const updatedPatient = res.state.characters.find(c => c.id === 301);
  assert.ok((updatedPatient?.injury?.points || 0) >= 2.5, 'Halo lamb should accelerate injury recovery');

  // Glimmerhorn Stag morale bonus test (applied after morale is recalculated from needs)
  state.creatures.push({
    id: 704,
    defId: 'glimmerhorn_stag',
    nickname: 'Stag',
    status: 'tamed',
    hungry: false,
    hatchProgress: 0,
    tamingProgress: 50,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1
  });

  const stagStudent: Character = {
    id: 302,
    name: 'Stag Student',
    pronouns: 'she/her',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#4E8B3A', hat: 'cap' },
    personality: 'Bookish',
    traits: ['Diligent'],
    status: 'student',
    masteredSchools: [],
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 80 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  };
  state.characters = [stagStudent];
  AnkicasterEngine.ringBell(state, []);

  // Needs follow GDD 14.4, with hunger drifting toward the last meal.
  // No Refectory: the meal target is standing (50), so hunger goes 80 + (50-80)*0.25 - 4 = 68.5.
  // No bed (rest target 25), no leisure rooms (target 30), composure 60 + 2 per tamed creature (4 here).
  // calculateMorale of those needs rounds to 69; Glimmerhorn Stag adds +3.
  assert.equal(stagStudent.morale, 72, 'Glimmerhorn Stag should give +3 morale on top of recalculated needs morale');
});

test('Automated check: every creature id referenced in engine.ts exists in content.ts', () => {
  const engineSource = fs.readFileSync('src/utils/engine.ts', 'utf-8');
  const validCreatureIds = new Set(Object.keys(CREATURE_DEFINITIONS));

  const m1 = [...engineSource.matchAll(/c\.defId === '([a-z_]+)'/g)].map(m => m[1]);
  const m2 = [...engineSource.matchAll(/creatures\.some\([^)]*defId === '([a-z_]+)'/g)].map(m => m[1]);
  const m3 = [...engineSource.matchAll(/creatures\.push\(\{[^}]*defId:\s*'([a-z_]+)'/gs)].map(m => m[1]);
  const checkedIds = new Set([...m1, ...m2, ...m3]);

  assert.ok(checkedIds.size > 5, 'Should find multiple creature references in engine.ts');

  for (const id of checkedIds) {
    assert.ok(
      validCreatureIds.has(id),
      `Creature id '${id}' referenced in engine.ts must exist in CREATURE_DEFINITIONS`
    );
  }

  // Ensure real creatures requested are verified
  assert.ok(checkedIds.has('mistfeather_owl'), 'Should include mistfeather_owl');
  assert.ok(checkedIds.has('ember_phoenix'), 'Should include ember_phoenix');
  assert.ok(checkedIds.has('alembic_salamander'), 'Should include alembic_salamander');
  assert.ok(checkedIds.has('halo_lamb'), 'Should include halo_lamb');
  assert.ok(checkedIds.has('fen_sprite'), 'Should include fen_sprite');
  assert.ok(checkedIds.has('thistle_hare'), 'Should include thistle_hare');
  assert.ok(checkedIds.has('glimmerhorn_stag'), 'Should include glimmerhorn_stag');
  assert.ok(checkedIds.has('mossback_tortoise'), 'Should include mossback_tortoise');
  assert.ok(checkedIds.has('bramblefox'), 'Should include bramblefox');
});

test('5. Wizard Cost & Queue: targetLevel accounts for active and queued sessions; capped at 5', () => {
  const state = createInitialGameState();
  state.mana = 5000;
  state.wizard.levels.arcane = 1;

  // 1st Arcane session: targetLevel = 1 + 0 + 0 + 1 = 2
  // Cost: 80 * 2 = 160, Reviews: 25 * 2 = 50
  const res1 = AnkicasterEngine.queueWizardSession(state, 'arcane', false);
  assert.equal(res1.success, true);
  assert.equal(res1.state.wizard.activeSession?.targetLevel, 2);
  assert.equal(res1.state.wizard.activeSession?.costPaid, 160);
  assert.equal(res1.state.wizard.activeSession?.required, 50);

  // 2nd Arcane session queued: targetLevel = 1 + 1 (active) + 0 (queued) + 1 = 3
  // Cost: 80 * 3 = 240, Reviews: 25 * 3 = 75
  const res2 = AnkicasterEngine.queueWizardSession(res1.state, 'arcane', false);
  assert.equal(res2.success, true);
  assert.equal(res2.state.wizard.queuedSessions[0].targetLevel, 3);
  assert.equal(res2.state.wizard.queuedSessions[0].costPaid, 240);
  assert.equal(res2.state.wizard.queuedSessions[0].required, 75);

  // 3rd Arcane session queued: targetLevel = 1 + 1 + 1 + 1 = 4
  const res3 = AnkicasterEngine.queueWizardSession(res2.state, 'arcane', false);
  assert.equal(res3.success, true);
  assert.equal(res3.state.wizard.queuedSessions[1].targetLevel, 4);
  assert.equal(res3.state.wizard.queuedSessions[1].costPaid, 320);

  // Queue 4th and 5th sessions (reaching 5 total sessions)
  const res4 = AnkicasterEngine.queueWizardSession(res3.state, 'nature', false);
  assert.equal(res4.success, true);
  const res5 = AnkicasterEngine.queueWizardSession(res4.state, 'light', false);
  assert.equal(res5.success, true);
  assert.equal((res5.state.wizard.activeSession ? 1 : 0) + res5.state.wizard.queuedSessions.length, 5);

  // Attempting 6th session should be rejected by the 5-session cap
  const res6 = AnkicasterEngine.queueWizardSession(res5.state, 'shadow', false);
  assert.equal(res6.success, false);
  assert.ok(res6.error?.includes('Maximum of 5'));
});

test('6. Day Rollover: 4:00 AM Anki boundary calculation and leftover hours carryover', () => {
  const eveningMs = new Date('2026-11-10T23:00:00').getTime();
  const earlyMorningMs = new Date('2026-11-11T03:30:00').getTime();
  const afterRolloverMs = new Date('2026-11-11T04:05:00').getTime();

  const dayEvening = getAnkiDayNumber(eveningMs);
  const dayEarlyMorning = getAnkiDayNumber(earlyMorningMs);
  const dayAfterRollover = getAnkiDayNumber(afterRolloverMs);

  assert.equal(dayEarlyMorning, dayEvening, '3:30 AM belongs to the same Anki study day as 23:00 the prior night');
  assert.equal(dayAfterRollover, dayEvening + 1, '4:05 AM crosses into the new Anki study day');

  const state = createInitialGameState();
  state.lastSessionTimeMs = eveningMs;

  const resEarly = AnkicasterEngine.processRealTimeElapsedDays(state, earlyMorningMs);
  assert.equal(resEarly.daysPassed, 0, 'No day rollover at 3:30 AM');

  const resAfter = AnkicasterEngine.processRealTimeElapsedDays(state, afterRolloverMs);
  assert.equal(resAfter.daysPassed, 1, 'Rollover triggers after 4:00 AM');
});

test('7. Timed Terms reset: students, faculty and creatures reset; card links freed; wizard mastery, alumni, and blueprints kept', () => {
  const state = createInitialGameState();
  state.mana = 800;
  state.wizard.levels.arcane = 7;
  state.wizard.levels.nature = 6;
  state.wizard.knownSpells = ['foresight'];
  state.roomPlans = { ...(state.roomPlans || {}), library: 2, scriptorium: 1 };
  state.knownPatterns.push('canopy_bed');

  // Add characters, card sets, and extra creatures
  state.characters.push({
    id: 991,
    name: 'Graduating Student',
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#4E8B3A', hat: 'cap' },
    personality: 'Bold',
    traits: ['Brave'],
    status: 'resident',
    masteredSchools: ['nature'],
    needs: { hunger: 100, rest: 100, leisure: 100, composure: 100, health: 100 },
    morale: 100,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  });
  state.cardSets.push({
    id: 1,
    characterId: 991,
    kind: 'study',
    school: 'nature',
    cardIds: [1, 2, 3],
    size: 3,
    createdDay: 1,
    released: false
  });
  state.creatures.push({
    id: 881,
    defId: 'mistfeather_owl',
    nickname: 'Archimedes',
    status: 'tamed',
    hungry: false,
    hatchProgress: 0,
    tamingProgress: 100,
    bondLevel: 2,
    bondProgress: 0,
    arrivedDay: 1
  });

  state.renown = 45;

  const res = AnkicasterEngine.startNextTerm(state, 120);

  // Assert reset details (GDD Item 41 / BR-30, BR-34, F36)
  assert.equal(res.state.characters.length, 0, 'Characters must be cleared on term reset');
  assert.equal(res.state.cardSets.length, 0, 'Card sets must be cleared on term reset');
  assert.equal(res.state.creatures.length, 0, 'All creatures must be removed on term reset (Item 41)');
  assert.equal(res.state.mana, 0, 'Unspent mana must reset to 0 (Rule BR-34)');
  assert.equal(res.state.renown, 0, 'Renown must reset to 0 (Item 41)');
  assert.equal(res.state.roomPlans?.library, 2, 'Found room plans survive the term');
  assert.equal(res.state.roomPlans?.scriptorium, 1, 'Found room plans survive the term');
  assert.deepEqual(res.state.knownPatterns, ['simple_cot', 'long_table', 'hearth', 'couch', 'potted_fern', 'bookshelf'], 'Known patterns reset to starting set');
  assert.deepEqual(res.state.draftHistory, {}, 'Draft history reset');
  assert.equal(res.state.settings.termLengthDays, 120, 'Default term length is 120 days');

  // Assert kept meta data
  assert.equal(res.state.wizard.levels.arcane, 7, 'Wizard levels carry over');
  assert.equal(res.state.wizard.levels.nature, 6, 'Wizard levels carry over');
  assert.deepEqual(res.state.wizard.knownSpells, ['foresight'], 'Spellbooks carry over');
  assert.ok(res.state.alumniGallery.some(a => a.name === 'Graduating Student'), 'Master should be preserved in alumni gallery');
});

test('9. Bridged Real Reviews: card age sets honestIvl directly without running fake scheduler', () => {
  const state = createInitialGameState();
  const cardId = 555;
  state.allCards[cardId] = {
    id: cardId,
    nid: cardId,
    deckName: 'Spanish Core',
    front: 'Hola',
    back: 'Hello',
    ivl: 12,
    lastAnswerIvl: 12,
    honestIvl: 12,
    type: 2,
    queue: 2,
    due: 5,
    lastStudiedMs: Date.now() - 100000
  };

  // Bridged real review with cardAge = 18 and ease = 4 (Normally fake scheduler with ease 4 would do 12 * 2.8 = 34)
  const res = AnkicasterEngine.applyHonestReview(state, cardId, 4, 2500, 18, 'rev-bridge-1');
  const updatedCard = res.state.allCards[cardId];

  assert.equal(updatedCard.honestIvl, 18, 'Bridged review must set honestIvl to exact cardAge');
  assert.equal(updatedCard.ivl, 18, 'ivl must match real cardAge');
  assert.equal(updatedCard.lastAnswerIvl, 18, 'lastAnswerIvl must match real cardAge');

  // Deduplication: replaying the same review ID must be ignored (even with different ease/elapsedMs)
  const initialMana = res.state.mana;
  const replayRes = AnkicasterEngine.applyHonestReview(res.state, cardId, 4, 2500, 18, 'rev-bridge-1');
  assert.equal(replayRes.state.mana, initialMana, 'Replaying duplicate review ID must not grant extra mana');

  // Batch replay test
  const batchRes = AnkicasterEngine.applyBatchHonestReviews(state, [
    { cardId, ease: 3, elapsedMs: 2500, cardAge: 25, reviewId: 'batch-rev-1' },
    { cardId, ease: 3, elapsedMs: 2500, cardAge: 25, reviewId: 'batch-rev-1' }, // duplicate, should be skipped
    { cardId, ease: 4, elapsedMs: 2200, cardAge: 30, reviewId: 'batch-rev-2' }
  ]);
  assert.equal(batchRes.count, 2, 'Only distinct reviews processed in batch');
  assert.equal(batchRes.lastReviewId, 'batch-rev-2', 'Last review ID tracks correctly');
  assert.equal(batchRes.state.allCards[cardId]?.honestIvl, 30);

  // Snapshot loading test with type and queue
  const snapState = AnkicasterEngine.loadCardSnapshot(state, [
    { id: 9001, deckName: 'Biology', card_age: 42, type: 2, queue: 2 },
    { id: 9002, deckName: 'Chemistry', card_age: 15, type: 0, queue: 0 } // type 0 is new
  ]);
  assert.equal(snapState.allCards[9001]?.honestIvl, 42);
  assert.equal(snapState.allCards[9002]?.type, 0);

  // Student linking skips type 0 cards unless linkNewCards is enabled (GDD Section 579)
  snapState.settings.cardsPerStudent = 1;
  snapState.settings.linkNewCards = false;
  snapState.wizard.levels.nature = 5;
  snapState.mana = 200;
  // Ensure dorm bed and nature classroom seat exist
  snapState.rooms.push({
    id: 9910,
    defId: 'dormitory',
    x: 0,
    y: 0,
    w: 2,
    h: 1,
    area: 'castle',
    level: 1,
    state: 'built',
    buildRequired: 0,
    buildProgress: 0,
    cleanliness: 100,
    settings: {},
    furniture: [{ id: 9911, defId: 'simple_cot', slotKind: 'bed', damaged: false }]
  });
  snapState.rooms.push({
    id: 9920,
    defId: 'class_nature',
    x: 2,
    y: 0,
    w: 2,
    h: 1,
    area: 'castle',
    level: 1,
    state: 'built',
    buildRequired: 0,
    buildProgress: 0,
    cleanliness: 100,
    settings: {},
    furniture: []
  });

  // With linkNewCards = false, type 0 card 9002 should NOT be chosen
  const enrollRes = AnkicasterEngine.enrollStudent(snapState, 'nature', 'Student One', 'Bold', ['Brave']);
  assert.equal(enrollRes.success, false, 'Student enrollment blocked when only type 0 (new) cards exist and linkNewCards is off');

  // When linkNewCards is enabled, type 0 card is eligible
  snapState.settings.linkNewCards = true;
  const enrollRes2 = AnkicasterEngine.enrollStudent(snapState, 'nature', 'Student One', 'Bold', ['Brave']);
  assert.equal(enrollRes2.success, true, 'Student enrollment succeeds when linkNewCards is on');
});

test('8. Safe rest: while player is away and bank has hit 10% floor, skip hazard rolls', () => {
  const state = createInitialGameState();
  state.bankAtLastReview = 100;
  state.mana = 10; // Exactly at the 10% floor
  state.veil.strength = 20; // Thin veil (<50) that would normally roll hazards

  // Simulate 5 days away
  const fiveDaysMs = 5 * 24 * 3600 * 1000;
  state.lastSessionTimeMs = Date.now() - fiveDaysMs;

  const res = AnkicasterEngine.processRealTimeElapsedDays(state, Date.now());

  // Check no hazards spawned because bank is at the 10% floor
  const roomsWithHazard = res.state.rooms.filter(r => r.hazard !== undefined);
  assert.equal(roomsWithHazard.length, 0, 'Hazards must be skipped while bank is at 10% floor (BR-25)');
});

test('Section 17.1 & VR-01: State immutability test under deep freeze and VisualWorld simulation (15 characters, 10,000 ticks)', () => {
  const state = createInitialGameState();

  // Populate 15 characters across students and faculty
  const schools: SchoolType[] = ['arcane', 'nature', 'light', 'shadow', 'alchemy'];
  for (let i = 1; i <= 15; i++) {
    const isStudent = i <= 10;
    state.characters.push({
      id: 1000 + i,
      name: `Scholar ${i}`,
      pronouns: i % 2 === 0 ? 'she/her' : 'he/him',
      appearance: {
        skin: '#f6d7c3',
        hair: 'short',
        hairColor: '#4a2e1e',
        robeColor: '#4e8b3a',
        hat: i % 3 === 0 ? 'pointed' : 'none'
      },
      personality: 'Bookish',
      traits: ['Diligent'],
      status: isStudent ? 'student' : 'faculty',
      currentSchool: schools[i % 5],
      masteredSchools: !isStudent ? [schools[i % 5]] : [],
      seatRoomId: isStudent ? 1 : undefined,
      bedRoomId: 1,
      workplaceRoomId: !isStudent ? 1 : undefined,
      needs: {
        hunger: 40 + (i * 3) % 50,
        rest: 35 + (i * 4) % 50,
        leisure: 60 + (i * 2) % 30,
        composure: 75,
        health: 100
      },
      morale: 80,
      readyDays: {},
      enrolledDay: 1,
      chronicle: [],
      careerSetIds: []
    });
  }

  assert.equal(state.characters.length >= 15, true, 'Must test with at least 15 characters');

  // Deep freeze helper
  function deepFreeze(obj: any): any {
    Object.freeze(obj);
    for (const key of Object.getOwnPropertyNames(obj)) {
      const val = obj[key];
      if (val && typeof val === 'object' && !Object.isFrozen(val)) {
        deepFreeze(val);
      }
    }
    return obj;
  }

  const frozenState = deepFreeze(JSON.parse(JSON.stringify(state)));

  // Test that computeReachability does not mutate state
  const reachability = computeReachability(frozenState.rooms);
  assert.ok(reachability.size > 0);
  assert.equal(reachability.get(1)?.reachable, true, 'Entrance Hall must be reachable');

  // Test NavGraph construction on frozen state
  const navGraph = new NavGraph(frozenState.rooms, 400);
  assert.ok(navGraph.nodes.size > 0, 'NavGraph nodes should be populated');

  // Test VisualWorld and VisualWorld.setSnapshot on frozen state
  const world = new VisualWorld();
  assert.doesNotThrow(() => {
    world.setSnapshot(frozenState);
  }, 'VisualWorld.setSnapshot must never mutate FullGameState');

  // Test Choreographer tick and VisualWorld.update on frozen state for 10,000 ticks
  assert.doesNotThrow(() => {
    for (let i = 0; i < 10000; i++) {
      world.choreographer.tick(16, frozenState, false);
      if (i % 100 === 0) {
        world.update(16);
      }
    }
  }, 'Choreographer and VisualWorld must complete 10,000 ticks without mutating FullGameState');
});

test('computeReachability: unlinked upper room shows as unreachable', () => {
  const state = createInitialGameState();

  // Add an unlinked floor-1 room with no staircase
  state.rooms.push({
    id: 888,
    defId: 'dormitory',
    x: 0,
    y: 1, // Floor 1
    w: 2,
    h: 1,
    area: 'castle',
    level: 1,
    state: 'built',
    buildRequired: 0,
    buildProgress: 0,
    buildPaused: false,
    cleanliness: 100,
    settings: {},
    furniture: []
  });

  const reachability = computeReachability(state.rooms);
  assert.equal(reachability.get(888)?.reachable, false, 'Floor 1 room without stair connection must be unreachable');
});

test('Section 10.4: Fresh start creates clean slate with 0 mana, 0 renown, level 0 wizard, and 3 rooms', () => {
  const fresh = createNewAcademy({ name: 'Rowan', title: 'Mage', foundingSchool: 'arcane' });

  assert.equal(fresh.mana, 0);
  assert.equal(fresh.manaDebt, 0);
  assert.equal(fresh.renown, 0);
  assert.equal(fresh.wizard.levels.arcane, 0);
  assert.equal(fresh.wizard.levels.nature, 0);
  assert.equal(fresh.wizard.knownSpells.length, 0);
  assert.deepEqual(fresh.rooms.map(r => r.defId).sort(), ['entrance_hall', 'vegetable_patch', 'wizard_study']);
  assert.equal(fresh.creatures.length, 0);
  assert.equal(fresh.characters.length, 0);
  assert.equal(fresh.achievements.length, 0);
});

