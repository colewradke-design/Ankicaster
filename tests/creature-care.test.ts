import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialGameState } from '../src/data/initialState.ts';
import { FURNITURE_DEFINITIONS } from '../src/data/content.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import type { Character, CreatureInstance, FullGameState } from '../src/types/ankicaster.ts';
import {
  bestBuffScale,
  captureReviewCount,
  escapeChance,
  escapeRoll,
  forceEscape,
  tickCaptures
} from '../src/utils/creatureCare.ts';

function creature(partial: Partial<CreatureInstance> & Pick<CreatureInstance, 'id' | 'defId' | 'status'>): CreatureInstance {
  return {
    nickname: partial.defId,
    hungry: false,
    hatchProgress: 100,
    tamingProgress: 0,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1,
    ...partial
  };
}

function student(id: number): Character {
  return {
    id,
    name: `Student ${id}`,
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#446', hat: 'none' },
    personality: 'Curious',
    traits: [],
    status: 'student',
    masteredSchools: [],
    needs: { hunger: 40, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 70,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  };
}

function stocked(): FullGameState {
  const state = createInitialGameState();
  state.bellIndex = 5;
  state.resources.provisions = 20;
  state.resources.greens = 20;
  state.resources.herbs = 20;
  state.resources.fish = 20;
  state.creatures = [];
  state.characters = [];
  return state;
}

test('meal bills wary and tamed only, all or nothing, characters first, lowest id first', () => {
  const state = stocked();
  state.rooms = [];
  state.characters = [student(1), student(2), student(3)];
  state.resources.provisions = 3;
  state.resources.greens = 1;
  state.creatures = [
    creature({ id: 2, defId: 'thistle_hare', status: 'wary' }),
    creature({ id: 1, defId: 'thistle_hare', status: 'tamed' }),
    creature({ id: 3, defId: 'mossback_tortoise', status: 'egg', hungry: false }),
    creature({ id: 4, defId: 'thistle_hare', status: 'loose' }),
    creature({ id: 5, defId: 'thistle_hare', status: 'away', hungry: true }),
    creature({ id: 6, defId: 'bramblefox', status: 'tamed' }),
    creature({ id: 7, defId: 'verdant_drake', status: 'tamed' })
  ];

  AnkicasterEngine.ringBell(state, []);

  const byId = (id: number) => state.creatures.find(c => c.id === id)!;
  assert.equal(byId(1).hungry, false, 'lower-id hare is fed the only green');
  assert.equal(byId(2).hungry, true, 'later hare finds the greens gone');
  assert.equal(byId(3).hungry, false, 'eggs are not billed');
  assert.equal(byId(3).status, 'egg');
  assert.equal(byId(4).hungry, false, 'loose creatures are not billed');
  assert.equal(byId(5).hungry, true, 'away hunger stays frozen');
  assert.equal(byId(6).hungry, true, 'students take the provisions before the fox');
  assert.equal(state.resources.provisions, 0);
  assert.equal(byId(7).hungry, true, 'drake needs both provisions and greens');
  assert.equal(state.resources.greens, 0, 'the one green went to hare 1, not a partial drake');
});

test('a full diet clears hunger and a short line does not spend the other line', () => {
  const state = stocked();
  state.rooms = [];
  state.resources.provisions = 2;
  state.resources.greens = 1;
  state.creatures = [creature({ id: 1, defId: 'verdant_drake', status: 'tamed', hungry: true })];
  AnkicasterEngine.ringBell(state, []);
  assert.equal(state.creatures[0].hungry, true);
  assert.equal(state.resources.provisions, 2);
  assert.equal(state.resources.greens, 1);

  state.resources.greens = 2;
  state.bellIndex = 10;
  AnkicasterEngine.ringBell(state, []);
  assert.equal(state.creatures[0].hungry, false);
  assert.equal(state.resources.provisions, 0);
  assert.equal(state.resources.greens, 0);
});

test('hungry halves the buff that creature gives', () => {
  assert.equal(bestBuffScale([
    creature({ id: 1, defId: 'mossback_tortoise', status: 'tamed', hungry: true }),
    creature({ id: 2, defId: 'mossback_tortoise', status: 'tamed', hungry: false })
  ], 'mossback_tortoise'), 1);
  assert.equal(bestBuffScale([
    creature({ id: 1, defId: 'mossback_tortoise', status: 'tamed', hungry: true })
  ], 'mossback_tortoise'), 0.5);

  const herbsFrom = (hungry: boolean) => {
    const state = stocked();
    state.bellIndex = 1;
    let id = 9;
    const probe = creature({ id, defId: 'thistle_hare', status: 'tamed', hungry: true });
    while (escapeRoll(1, id, 0) < escapeChance(probe, { unhomed: true })) {
      id += 1;
      probe.id = id;
    }
    state.creatures = [creature({ id, defId: 'thistle_hare', status: 'tamed', hungry })];
    const before = state.resources.herbs;
    AnkicasterEngine.ringBell(state, []);
    return state.resources.herbs - before;
  };
  assert.ok(Math.abs(herbsFrom(false) - herbsFrom(true) - 0.05) < 1e-9);
});

test('escape chance follows danger, hunger, bond, tamer, and a filthy or missing pen', () => {
  const fed = creature({ id: 1, defId: 'thistle_hare', status: 'tamed' });
  const hungry = creature({ id: 1, defId: 'thistle_hare', status: 'tamed', hungry: true });
  const home = { unhomed: false, cleanliness: 100 };
  assert.ok(escapeChance(hungry, home) > escapeChance(fed, home) * 2.9);
  const bonded = creature({ id: 1, defId: 'thistle_hare', status: 'tamed', bondLevel: 3 });
  assert.ok(escapeChance(bonded, home) < escapeChance(fed, home));
  const watched = creature({ id: 1, defId: 'thistle_hare', status: 'tamed', tamerId: 4 });
  assert.ok(Math.abs(escapeChance(watched, home) - escapeChance(fed, home) * 0.5) < 1e-9);
  const legend = creature({ id: 1, defId: 'elder_treant_sprout', status: 'wary' });
  const common = creature({ id: 1, defId: 'thistle_hare', status: 'wary' });
  assert.ok(escapeChance(legend, home) > escapeChance(common, home));
  assert.ok(escapeChance(fed, { unhomed: true }) > escapeChance(fed, home));
  assert.ok(escapeChance(fed, { unhomed: false, cleanliness: 10 }) > escapeChance(fed, home));
  const penned = creature({ id: 1, defId: 'thistle_hare', status: 'wary' });
  assert.ok(escapeChance(penned, { unhomed: false, menagerieLevel3: true }) < escapeChance(penned, home));
});

test('a tamer who shares the creature school catches faster than the headmaster', () => {
  const wizard = captureReviewCount({
    danger: 5,
    isCareerTamer: false,
    masteredSchools: [],
    creatureSchool: 'shadow'
  });
  const matched = captureReviewCount({
    danger: 5,
    isCareerTamer: true,
    masteredSchools: ['shadow'],
    creatureSchool: 'shadow'
  });
  assert.ok(matched < wizard);
  assert.ok(matched >= 4);
});

test('escape stashes what the species hides, and recapture gives it back', () => {
  const state = stocked();
  state.resources.herbs = 7;
  state.creatures = [creature({ id: 3, defId: 'thistle_hare', status: 'tamed', roomId: 1 })];
  const notes: string[] = [];
  forceEscape(state, 3, notes);
  const loose = state.creatures[0];
  assert.equal(loose.status, 'loose');
  assert.equal(loose.returnStatus, 'tamed');
  assert.equal(loose.stashed?.herbs, 5);
  assert.equal(state.resources.herbs, 2);
  assert.ok(loose.captureReviewsLeft && loose.captureReviewsLeft > 0);
  assert.equal(loose.captureTamerId, 0, 'no faculty tamer, so the headmaster goes');
  assert.ok(notes.some(n => n.includes(loose.captureReviewsLeft!.toString())));

  loose.captureReviewsLeft = 1;
  tickCaptures(state, []);
  assert.equal(state.creatures[0].status, 'tamed');
  assert.equal(state.resources.herbs, 7);
  assert.equal(state.creatures[0].stashed, undefined);
});

test('hand-feeding is once per bell and a small bond bump', () => {
  const state = stocked();
  state.creatures = [creature({ id: 1, defId: 'thistle_hare', status: 'tamed', hungry: true, bondProgress: 0 })];
  const first = AnkicasterEngine.feedCreature(state, 1);
  assert.equal(first.success, true);
  assert.equal(first.state.creatures[0].hungry, false);
  assert.equal(first.state.creatures[0].bondProgress, 2);
  assert.equal(first.state.resources.greens, 19);
  const second = AnkicasterEngine.feedCreature(first.state, 1);
  assert.equal(second.success, false);
  assert.match(second.error || '', /this bell/);
  assert.equal(second.state.resources.greens, 19);

  const egg = stocked();
  egg.creatures = [creature({ id: 1, defId: 'mossback_tortoise', status: 'egg' })];
  const refused = AnkicasterEngine.feedCreature(egg, 1);
  assert.equal(refused.success, false);
});

test('the automatic treat dispenser is gone', () => {
  assert.equal(FURNITURE_DEFINITIONS.treat_dispenser, undefined);
});
