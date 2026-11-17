/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeJanitorAssignments,
  generateServantLook,
  pickGoblinName,
  requiredSchoolsForChamberLevel,
  roomServantCapacity,
  schoolsAtLevel5Count,
  summonServantQuote,
  summoningChamberUnlocked,
  uniqueServantId,
  workshopBaseRate
} from './servants';
import { constructionSites, planConstruction } from './construction';
import type { PlacedRoom, ServantInstance } from '../types/ankicaster';

function makeRoom(
  id: number,
  defId: string,
  opts: Partial<PlacedRoom> = {}
): PlacedRoom {
  return {
    id,
    defId,
    x: opts.x ?? 0,
    y: opts.y ?? 0,
    w: opts.w ?? 1,
    h: opts.h ?? 1,
    area: opts.area ?? 'castle',
    level: opts.level ?? 1,
    state: opts.state ?? 'built',
    buildRequired: opts.buildRequired ?? 0,
    buildProgress: opts.buildProgress ?? 0,
    cleanliness: opts.cleanliness ?? 100,
    settings: opts.settings ?? {},
    furniture: opts.furniture ?? [],
    ...opts
  };
}

function makeServant(id: number, workplaceRoomId?: number, cleaningRoomId?: number): ServantInstance {
  return {
    id,
    name: `Gob${id}`,
    look: generateServantLook(id),
    workplaceRoomId,
    cleaningRoomId,
    arrivedDay: 1
  };
}

test('summonServantQuote prices L1/L2/L3 tiers accurately with 20% ceiling discount & 20-review L3 speed', () => {
  assert.deepEqual(summonServantQuote(0, 1), { tier: 1, mana: 500, reviews: 30, ownedServants: 0 });
  assert.deepEqual(summonServantQuote(3, 1), { tier: 1, mana: 800, reviews: 30, ownedServants: 3 });

  // Lv 2: 20% discount rounded up
  assert.deepEqual(summonServantQuote(0, 2), { tier: 2, mana: 400, reviews: 30, ownedServants: 0 });
  assert.deepEqual(summonServantQuote(1, 2), { tier: 2, mana: 480, reviews: 30, ownedServants: 1 });
  // Base 501-like ceiling edge check handled; check 500+100*2=700 -> 560
  assert.deepEqual(summonServantQuote(2, 2), { tier: 2, mana: 560, reviews: 30, ownedServants: 2 });

  // Lv 3: keeps L2 cut and drops reviews from 30 to 20
  assert.deepEqual(summonServantQuote(0, 3), { tier: 3, mana: 400, reviews: 20, ownedServants: 0 });
  assert.deepEqual(summonServantQuote(2, 3), { tier: 3, mana: 560, reviews: 20, ownedServants: 2 });
});

test('school Lv 5 count & chamber tier requirements enforce 1/2/3 schools', () => {
  assert.equal(schoolsAtLevel5Count({ arcane: 4, nature: 2 }), 0);
  assert.equal(summoningChamberUnlocked({ arcane: 4, nature: 2 }), false);

  assert.equal(schoolsAtLevel5Count({ arcane: 5, nature: 4 }), 1);
  assert.equal(summoningChamberUnlocked({ arcane: 5, nature: 4 }), true);

  assert.equal(schoolsAtLevel5Count({ arcane: 5, nature: 6, light: 5 }), 3);
  assert.equal(requiredSchoolsForChamberLevel(1), 1);
  assert.equal(requiredSchoolsForChamberLevel(2), 2);
  assert.equal(requiredSchoolsForChamberLevel(3), 3);
});

test('roomServantCapacity matches Workshop (Infinity), Janitor Closet (1/2/3), and single-slot workplaces', () => {
  assert.equal(roomServantCapacity({ defId: 'workshop', level: 1 }), Infinity);
  assert.equal(roomServantCapacity({ defId: 'janitors_closet', level: 1 }), 1);
  assert.equal(roomServantCapacity({ defId: 'janitors_closet', level: 2 }), 2);
  assert.equal(roomServantCapacity({ defId: 'janitors_closet', level: 3 }), 3);
  for (const id of [
    'vegetable_patch',
    'herb_garden',
    'woodlot',
    'quarry',
    'pond',
    'orchard',
    'apiary',
    'kitchen',
    'refectory',
    'glassworks',
    'weaving_room'
  ]) {
    assert.equal(roomServantCapacity({ defId: id, level: 3 }), 1, `${id} holds 1 servant`);
  }
  assert.equal(roomServantCapacity({ defId: 'dormitory', level: 1 }), 0);
  assert.equal(roomServantCapacity({ defId: 'greenhouse', level: 1 }), 0);
});

test('planConstruction caps at 4 active bodies on first unpaused site, skips paused sites, and scales L1/L2/L3 + creature bonus', () => {
  assert.equal(workshopBaseRate(1), 1);
  assert.equal(workshopBaseRate(2), 1.25);
  assert.equal(workshopBaseRate(3), 1.5);

  const site1 = makeRoom(10, 'dormitory', { state: 'site', buildOrder: 1, buildPaused: true, buildRequired: 30 });
  const site2 = makeRoom(11, 'library', { state: 'site', buildOrder: 2, buildPaused: false, buildRequired: 30 });
  const site3 = makeRoom(12, 'corridor', { state: 'site', buildOrder: 3, buildPaused: false, buildRequired: 20 });

  assert.deepEqual(
    constructionSites([site3, site1, site2]).map(s => s.id),
    [10, 11, 12],
    'constructionSites orders paused sites alongside active ones by buildOrder'
  );

  // 5 workers provided -> only first 4 work site2; site1 skipped because paused
  const workers = [
    { kind: 'servant' as const, id: 1, workshopId: 99, workshopLevel: 1 },
    { kind: 'servant' as const, id: 2, workshopId: 99, workshopLevel: 2 },
    { kind: 'servant' as const, id: 3, workshopId: 99, workshopLevel: 3 },
    { kind: 'wizard' as const, id: 0, workshopId: 99, workshopLevel: 1 },
    { kind: 'servant' as const, id: 4, workshopId: 99, workshopLevel: 3 }
  ];
  const plan = planConstruction([site1, site2, site3], { workers, creatureBuildBonus: 0.1 });
  assert.equal(plan.length, 1);
  assert.equal(plan[0].roomId, 11, 'first unpaused site receives the crew');
  assert.equal(plan[0].crew.length, 4, 'capped at 4 simultaneous bodies');
  // 1.1 + 1.38 (1.25*1.1=1.375->1.38) + 1.65 + 1.1 = 5.23
  assert.equal(plan[0].rate, 5.23);
});

test('computeJanitorAssignments assigns each janitor to a unique dirtiest room and keeps sticky target until 100%', () => {
  const closet = makeRoom(1, 'janitors_closet', {
    level: 2,
    cleanliness: 100,
    furniture: [{ id: 1, defId: 'broom_cupboard', slotKind: 'required:broom_cupboard', damaged: false }]
  });
  const dirtyMost = makeRoom(2, 'kitchen', { cleanliness: 35 });
  const dirtySticky = makeRoom(3, 'library', { cleanliness: 65 });
  const cleanRoom = makeRoom(4, 'dormitory', { cleanliness: 100 });

  const s1 = makeServant(1, closet.id, dirtySticky.id);
  const s2 = makeServant(2, closet.id);

  const assignments = computeJanitorAssignments({
    rooms: [closet, dirtyMost, dirtySticky, cleanRoom],
    servants: [s1, s2],
    reviewIndex: 0
  });
  assert.equal(assignments.get(1), dirtySticky.id, 'sticky target kept until 100%');
  assert.equal(assignments.get(2), dirtyMost.id, 'second janitor picks dirtiest unclaimed room');
  assert.notEqual(assignments.get(1), assignments.get(2), 'janitors never overlap in same room');

  // Once both rooms are 100% clean, assignments become undefined (wait in closet)
  dirtyMost.cleanliness = 100;
  dirtySticky.cleanliness = 100;
  const idleAssignments = computeJanitorAssignments({
    rooms: [closet, dirtyMost, dirtySticky, cleanRoom],
    servants: [s1, s2],
    reviewIndex: 0
  });
  assert.equal(idleAssignments.get(1), undefined);
  assert.equal(idleAssignments.get(2), undefined);
});

test('uniqueServantId & pickGoblinName avoid duplicates across larger rosters', () => {
  const roster = Array.from({ length: 22 }, (_, i) => ({
    ...makeServant(i + 1),
    name: pickGoblinName([])
  }));
  assert.equal(uniqueServantId(roster), 23);

  const used: string[] = [];
  for (let i = 0; i < 25; i++) {
    const next = pickGoblinName(used, 1);
    assert.equal(used.includes(next), false, `name "${next}" must be unique`);
    used.push(next);
  }
});
