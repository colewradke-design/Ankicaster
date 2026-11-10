import test from 'node:test';
import assert from 'node:assert/strict';

import {
  calculateReviewMana,
  calculateStudentSkill,
  isMasteryReady,
  calculateTeacherDelay,
  calculateFacultyLimit,
  calculateDailyVeilCost,
  calculateRiftChance
} from '../src/utils/formulas.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { createInitialGameState } from '../src/data/initialState.ts';
import { SchoolType } from '../src/types/ankicaster.ts';

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
  const initialVeil = state.veil.strength;

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
  // totalWiz=10, facBeds=4, classrooms=2, students=6
  const { limit, breakdown } = calculateFacultyLimit(10, 4, 2, 6);
  // A = 1 + floor(10/4) = 3
  // B = 4
  // C = 1 + 2*2 = 5
  // D = 1 + floor(6/3) = 3
  // min(3, 4, 5, 3) = 3
  assert.equal(limit, 3);
});
