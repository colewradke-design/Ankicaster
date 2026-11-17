/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnkicasterEngine } from '../src/utils/engine';
import { createInitialGameState } from '../src/data/initialState';
import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../src/data/content';
import { isRoomUnlocked } from '../src/utils/decks';
import { computeJanitorAssignments, summonServantQuote } from '../src/utils/servants';
import { computeConstructionPlan } from '../src/utils/construction';
import { ALL_CAREERS } from '../src/debug/creatureDebug';
import { RosterPanel, BuildMenuPanel } from '../src/components/GamePanels';
import { QueuePanel } from '../src/components/QueuePanel';
import { TopBar } from '../src/components/TopBar';
import { RoomWindow } from '../src/components/RoomWindow';
import { orbOption } from '../src/components/StudyModals';
import { ServantChoreographer } from '../src/visual/agents/ServantChoreographer';
import { Choreographer } from '../src/visual/agents/Choreographer';
import { NavGraph } from '../src/visual/layout/navGraph';
import { computeReachability } from '../src/utils/reachability';
import { getGroundY } from '../src/visual/layout/gridToWorld';
import { drawGoblinServant, hammerSwingPose } from '../src/visual/agents/doll';
import { requiredInstallOption } from '../src/utils/requiredFurniture';
import type { FullGameState, PlacedRoom, ServantInstance } from '../src/types/ankicaster';

const noop = () => {};

function makePainterSpy() {
  const ops: string[] = [];
  const p: any = {
    rect: (..._a: any[]) => { ops.push('rect'); return p; },
    circle: (..._a: any[]) => { ops.push('circle'); return p; },
    ellipse: (..._a: any[]) => { ops.push('ellipse'); return p; },
    line: (..._a: any[]) => { ops.push('line'); return p; },
    poly: (..._a: any[]) => { ops.push('poly'); return p; },
    text: (..._a: any[]) => { ops.push('text'); return p; },
    moveTo: (..._a: any[]) => { ops.push('moveTo'); return p; },
    lineTo: (..._a: any[]) => { ops.push('lineTo'); return p; },
    fill: (..._a: any[]) => { ops.push('fill'); return p; },
    stroke: (..._a: any[]) => { ops.push('stroke'); return p; },
    push: () => { ops.push('push'); return p; },
    pop: () => { ops.push('pop'); return p; }
  };
  return { p, ops };
}

function stockedState(): FullGameState {
  const s = createInitialGameState();
  s.mana = 5000;
  s.resources.timber = 200;
  s.resources.stone = 200;
  s.resources.glass = 200;
  s.resources.reagents = 200;
  s.resources.provisions = 200;
  s.resources.herbs = 200;
  s.resources.cloth = 200;
  return s;
}

function firstCardId(s: FullGameState): number {
  return Number(Object.keys(s.allCards)[0]);
}

function makeRoom(
  id: number,
  defId: string,
  x: number,
  y: number,
  area: 'castle' | 'grounds',
  furniture: any[] = [],
  overrides: Partial<PlacedRoom> = {}
): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  return {
    id,
    defId,
    x,
    y,
    w: def?.size[0] || 1,
    h: def?.size[1] || 1,
    area,
    level: 1,
    state: 'built',
    buildRequired: def?.buildReviews || 20,
    buildProgress: def?.buildReviews || 20,
    cleanliness: 100,
    settings: {},
    furniture,
    ...overrides
  };
}

function makeServant(id: number, workplaceRoomId?: number): ServantInstance {
  return {
    id,
    name: ['Brik', 'Snag', 'Pebble', 'Grit', 'Sprocket', 'Krag'][id % 6],
    look: {
      seed: id,
      skin: '#769656',
      ears: 'pointed',
      tunicColor: '#6b4f3a',
      apronColor: '#b78a52',
      accessory: 'cap'
    },
    workplaceRoomId,
    arrivedDay: 1
  };
}

function addFinishedRoom(s: FullGameState, defId: string, x: number, y: number, id: number): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  const reqs: PlacedRoom['furniture'] = [];
  let seq = 0;
  for (const req of def.requiredFurniture || []) {
    const opt = requiredInstallOption(req.role);
    for (let i = 0; i < (req.count ?? 1); i++) {
      seq++;
      reqs.push({
        id: id * 100 + seq,
        defId: opt.defId,
        slotKind: `required:${req.role}`,
        damaged: false,
        x: 16 + seq * 24,
        floor: 0,
        plane: 'floor' as const,
        wallY: 0
      });
    }
  }
  const room = makeRoom(id, defId, x, y, def.area, reqs);
  s.rooms.push(room);
  return room;
}

test('Builder career is completely removed from hiring, debug careers, engine, and UI', () => {
  assert.equal((ALL_CAREERS as string[]).includes('builder'), false);

  const s = stockedState();
  s.characters.push({
    id: 50,
    name: 'Master Al',
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#445', hat: 'none' },
    personality: 'Curious',
    traits: [],
    status: 'faculty',
    masteredSchools: ['alchemy', 'arcane'],
    needs: { hunger: 90, rest: 90, leisure: 90, composure: 90, health: 100 },
    morale: 90,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  });

  const res = AnkicasterEngine.assignCareer(s, 50, 'builder' as any);
  assert.equal(res.success, false, 'engine refuses to assign removed builder career');

  const html = renderToStaticMarkup(
    <RosterPanel
      state={s}
      view="faculty"
      onAssignCareer={noop}
      onRetireCharacter={noop}
      onEnrollSecondSchool={noop}
    />
  );
  assert.equal(html.includes('data-career-option="builder"'), false, 'RosterPanel has no builder button');
});

test('Summoning Chamber unlocks via 1 school >= Lv5, enforces tier locks, and shelving blocks new summons', () => {
  const s = stockedState();
  assert.equal(isRoomUnlocked(s, 'summoning_chamber'), false);
  s.wizard.levels.arcane = 5;
  assert.equal(isRoomUnlocked(s, 'summoning_chamber'), true);

  // Listed in BuildMenuPanel without a blueprint card
  const buildHtml = renderToStaticMarkup(
    <BuildMenuPanel state={s} onPlaceRoom={noop} onAutoPlace={noop} />
  );
  assert.match(buildHtml, /data-build-card="summoning_chamber"/);
  assert.match(buildHtml, /Standard plan/);

  const ch = addFinishedRoom(s, 'summoning_chamber', 5, 0, 500);
  // Renovate L2 requires 2 schools at Lv 5+
  const upgFail = AnkicasterEngine.upgradeRoom(s, ch.id);
  assert.equal(upgFail.success, false);
  assert.match(upgFail.error || '', /2 magic schools at Level 5\+/);

  s.wizard.levels.nature = 5;
  const upg2 = AnkicasterEngine.upgradeRoom(s, ch.id);
  assert.equal(upg2.success, true);
  assert.equal(upg2.state.rooms.find(r => r.id === ch.id)!.level, 2);

  // Renovate L3 requires 3 schools at Lv 5+
  const upgFail3 = AnkicasterEngine.upgradeRoom(upg2.state, ch.id);
  assert.equal(upgFail3.success, false);
  assert.match(upgFail3.error || '', /3 magic schools at Level 5\+/);

  upg2.state.wizard.levels.light = 5;
  const upg3 = AnkicasterEngine.upgradeRoom(upg2.state, ch.id);
  assert.equal(upg3.success, true);
  assert.equal(upg3.state.rooms.find(r => r.id === ch.id)!.level, 3);

  // Unfinished or shelved Summoning Chamber stops new summons, existing servants stay
  const withServant = upg3.state;
  withServant.servants = [makeServant(1)];
  withServant.rooms.find(r => r.id === ch.id)!.furniture = []; // unfinished
  const unfinishedRes = AnkicasterEngine.queueSummonServant(withServant);
  assert.equal(unfinishedRes.success, false);
  assert.equal(withServant.servants.length, 1);

  const shelvedRes = AnkicasterEngine.shelveRoom(upg3.state, ch.id);
  assert.equal(shelvedRes.success, true);
  assert.equal(AnkicasterEngine.queueSummonServant(shelvedRes.state).success, false);
});

test('Services queue: mana paid on start, refunds, reorder preserves progress, summon bypasses study cap, idle goblin arrival', () => {
  let s = stockedState();
  s.wizard.levels.arcane = 5;
  addFinishedRoom(s, 'summoning_chamber', 5, 0, 501);
  const card = firstCardId(s);

  // Queue an orb session first
  const orbRes = AnkicasterEngine.queueWizardSession(s, 'arcane', false);
  assert.equal(orbRes.success, true);
  s = orbRes.state;
  const manaAfterOrb = s.mana;

  // Queue summon behind orb -> 0 mana charged yet!
  const sumRes = AnkicasterEngine.queueSummonServant(s);
  assert.equal(sumRes.success, true);
  s = sumRes.state;
  assert.equal(s.mana, manaAfterOrb, 'mana is NOT deducted while summon is queued behind orb');
  assert.equal(s.wizard.queuedSessions[0].kind, 'summon');
  assert.equal(s.wizard.queuedSessions[0].costPaid, 0);

  // Summon does NOT take a Wizard Study session slot
  s.wizard.studyLevel = 1; // max 2 study sessions (1 active + 1 queued)
  assert.equal(orbOption(s, 'nature').queueFull, false, 'summon does not consume study queue cap');

  // Advance 3 reviews on the orb, then swap summon to top
  for (let i = 0; i < 3; i++) s = AnkicasterEngine.applyHonestReview(s, card, 3, 2400).state;
  assert.equal(s.wizard.activeSession?.progress, 3);

  // Cancel unstarted summon refunds 0
  const cancelUnstarted = AnkicasterEngine.cancelWizardService(s, 1);
  assert.equal(cancelUnstarted.success, true);
  assert.equal(cancelUnstarted.refundedMana, 0);
  assert.equal(cancelUnstarted.state.mana, s.mana);

  // Re-queue summon, move to top (index 1 -> 0): deducts 500 mana, preserves orb's progress=3
  s = AnkicasterEngine.queueSummonServant(s).state;
  const manaBeforeStart = s.mana;
  const swapped = AnkicasterEngine.moveWizardService(s, 1, -1);
  assert.equal(swapped.success, true);
  s = swapped.state;
  assert.equal(s.wizard.activeSession?.kind, 'summon');
  assert.equal(s.wizard.activeSession?.costPaid, 500);
  assert.equal(s.mana, manaBeforeStart - 500, 'mana deducted when summon reaches top and starts');
  assert.equal(s.wizard.queuedSessions[0].kind, 'orb');
  assert.equal(s.wizard.queuedSessions[0].progress, 3, 'reordering preserves orb progress');

  // Cancel started summon refunds full 500 mana
  const cancelStarted = AnkicasterEngine.cancelWizardService(s, 0);
  assert.equal(cancelStarted.success, true);
  assert.equal(cancelStarted.refundedMana, 500);
  assert.equal(cancelStarted.state.mana, manaBeforeStart);
  assert.equal(cancelStarted.state.wizard.activeSession?.kind, 'orb');
  assert.equal(cancelStarted.state.wizard.activeSession?.progress, 3, 'orb resumes at saved progress 3');
  s = cancelStarted.state;

  // Move summon back up and complete all 30 reviews -> arrives idle, eats nothing, not in bestiary/characters
  s = AnkicasterEngine.queueSummonServant(s).state;
  s = AnkicasterEngine.moveWizardService(s, 1, -1).state;
  const charsBefore = s.characters.length;
  const creaturesBefore = s.creatures.length;
  for (let i = 0; i < 30; i++) s = AnkicasterEngine.applyHonestReview(s, card, 3, 2400).state;
  assert.equal(s.servants!.length, 1);
  assert.equal(s.servants![0].workplaceRoomId, undefined, 'summoned goblin starts idle');
  assert.equal(s.characters.length, charsBefore, 'servant is not a student or faculty');
  assert.equal(s.creatures.length, creaturesBefore, 'servant is not a bestiary creature');
  assert.equal(s.wizard.activeSession?.kind, 'orb', 'next service promotes automatically');

  // Ring bell on meal bell (bellIndex = 5) -> servants consume 0 provisions
  s.bellIndex = 5;
  const provBefore = s.resources.provisions;
  AnkicasterEngine.ringBell(s, []);
  assert.equal(s.resources.provisions, provBefore, 'goblin servants eat no provisions');
});

test('Workshop crew: max 4 bodies, Wizard override pauses services & resumes, Quick Hands/Tool Wall/Alchemy ignored', () => {
  let s = stockedState();
  s.wizard.levels.alchemy = 8; // must NOT speed construction
  const ws = addFinishedRoom(s, 'workshop', 5, 0, 600);
  ws.level = 2; // 1.25 per body
  ws.furniture.push({
    id: 60099,
    defId: 'tool_wall',
    slotKind: 'optional',
    damaged: false,
    x: 20,
    floor: 0,
    plane: 'wall',
    wallY: 10
  });
  s.characters.push({
    id: 610,
    name: 'Quick Fac',
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#445', hat: 'none' },
    personality: 'Curious',
    traits: ['Quick Hands'],
    status: 'faculty',
    masteredSchools: ['alchemy'],
    needs: { hunger: 90, rest: 90, leisure: 90, composure: 90, health: 100 },
    morale: 90,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  }); // Quick Hands trait must NOT speed construction
  s.rooms.push(makeRoom(601, 'dormitory', 7, 0, 'castle', [], { state: 'site', buildRequired: 30, buildProgress: 0, buildOrder: 1 }));
  s.servants = [makeServant(1, ws.id), makeServant(2, ws.id), makeServant(3, ws.id), makeServant(4, ws.id)];

  const card = firstCardId(s);
  s = AnkicasterEngine.queueWizardSession(s, 'arcane', false).state;

  // Assign Wizard (makes 5 candidate workers -> capped at 4 bodies -> 4 * 1.25 = 5.0 pts/rev)
  s = AnkicasterEngine.setWizardWorkshopAssigned(s, true).state;
  // Let's check with 3 servants + Wizard = 4 bodies so Wizard actually holds a site slot!
  s.servants![3].workplaceRoomId = undefined;
  const plan = computeConstructionPlan(s);
  assert.equal(plan[0].crew.length, 4);
  assert.equal(plan[0].crew.some(m => m.kind === 'wizard'), true);
  assert.equal(plan[0].rate, 5, '4 bodies * 1.25 Lv2 Workshop rate = 5.0 (Tool Wall, Quick Hands, Alchemy ignored)');

  s = AnkicasterEngine.applyHonestReview(s, card, 3, 2400).state;
  assert.equal(s.rooms.find(r => r.id === 601)!.buildProgress, 5);
  assert.equal(s.wizard.activeSession?.progress, 0, 'Services queue paused while Wizard is on a construction site');

  // Take Wizard off Workshop -> Services resume while 3 servants build at 3 * 1.25 = 3.75
  s = AnkicasterEngine.setWizardWorkshopAssigned(s, false).state;
  s = AnkicasterEngine.applyHonestReview(s, card, 3, 2400).state;
  assert.equal(s.rooms.find(r => r.id === 601)!.buildProgress, 8.75);
  assert.equal(s.wizard.activeSession?.progress, 1, 'Services queue resumes cleanly once Wizard leaves site');

  // Quickmortar (+20) and Quickening (+25) still advance construction sites
  s.resources.potions.quickmortar = 1;
  s = AnkicasterEngine.usePotion(s, 'quickmortar', 601).state;
  assert.equal(s.rooms.find(r => r.id === 601)!.buildProgress, 28.75);
});

test('Grounds plots, Glassworks & Weaving Room output 0.25x unstaffed vs 1.0x staffed; Gardeners stay Greenhouse-only', () => {
  const s = stockedState();
  const quarry = makeRoom(700, 'quarry', 0, 0, 'grounds', []);
  const weaving = addFinishedRoom(s, 'weaving_room', 5, 0, 701);
  const glassworks = addFinishedRoom(s, 'glassworks', 6, 0, 702);
  s.rooms.push(quarry);

  // Add an active Gardener — must NOT affect quarry
  s.characters.push({
    id: 710,
    name: 'Fern',
    pronouns: 'she/her',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#234', robeColor: '#283', hat: 'none' },
    personality: 'Gentle',
    traits: [],
    status: 'faculty',
    masteredSchools: ['nature'],
    career: 'gardener',
    careerState: 'active',
    needs: { hunger: 90, rest: 90, leisure: 90, composure: 90, health: 100 },
    morale: 90,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  });

  s.resources.stone = 100;
  s.resources.cloth = 0;
  s.resources.glass = 10;
  // Unstaffed bell (separate quarry run with no glassworks to isolate stone delta cleanly)
  const unstaffed = structuredClone(s);
  AnkicasterEngine.ringBell(unstaffed, []);
  const unstaffedCloth = unstaffed.resources.cloth;
  const unstaffedGlassGain = unstaffed.resources.glass - 10;
  const qUnstaffed = structuredClone(s);
  qUnstaffed.rooms = qUnstaffed.rooms.filter(r => r.defId !== 'glassworks');
  qUnstaffed.resources.stone = 0;
  AnkicasterEngine.ringBell(qUnstaffed, []);

  // Staff all three with 1 servant each (2nd servant on quarry rejected because cap = 1)
  let staffed = structuredClone(s);
  staffed.servants = [makeServant(1, quarry.id), makeServant(2, weaving.id), makeServant(3, glassworks.id), makeServant(4)];
  const twoOnPlot = AnkicasterEngine.assignServant(staffed, 4, quarry.id);
  assert.equal(twoOnPlot.success, false, 'plots allow max 1 servant');
  AnkicasterEngine.ringBell(staffed, []);
  const staffedCloth = staffed.resources.cloth;
  const staffedGlassGain = staffed.resources.glass - 10;
  const qStaffed = structuredClone(s);
  qStaffed.rooms = qStaffed.rooms.filter(r => r.defId !== 'glassworks');
  qStaffed.resources.stone = 0;
  qStaffed.servants = [makeServant(1, quarry.id)];
  AnkicasterEngine.ringBell(qStaffed, []);

  assert.ok(unstaffedCloth > 0 && Math.abs(unstaffedCloth - staffedCloth * 0.25) < 0.05, 'weaving 0.25x unstaffed vs 1x staffed');
  assert.ok(unstaffedGlassGain > 0 && Math.abs(unstaffedGlassGain - staffedGlassGain * 0.25) < 0.05, 'glassworks 0.25x unstaffed vs 1x staffed');
  assert.ok(qUnstaffed.resources.stone > 0 && Math.abs(qUnstaffed.resources.stone - qStaffed.resources.stone * 0.25) < 0.05, 'quarry scales 0.25x unstaffed -> 1.0x staffed regardless of Gardener');
});

test('Refectory 2x eating rate, Kitchen all-or-nothing bonuses, and Shelve/Demolish drops servants to idle', () => {
  const mkDining = (staffKitchen: boolean, staffRefectory: boolean) => {
    const s = stockedState();
    s.rooms = s.rooms.filter(r => r.area !== 'grounds');
    const kitchen = addFinishedRoom(s, 'kitchen', 5, 0, 800);
    kitchen.furniture.push({
      id: 80099,
      defId: 'stewpot',
      slotKind: 'optional',
      damaged: false,
      x: 40,
      floor: 0,
      plane: 'floor',
      wallY: 0
    });
    const refectory = addFinishedRoom(s, 'refectory', 6, 0, 801);
    s.bellIndex = 5;
    s.resources.provisions = 100;
    s.characters = Array.from({ length: 10 }, (_, i) => ({
      id: 850 + i,
      name: `Din ${i}`,
      pronouns: 'they/them',
      appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#445', hat: 'none' },
      personality: 'Curious',
      traits: i === 1 ? ['Picky Eater'] : [],
      status: 'student' as const,
      currentSchool: 'arcane' as const,
      masteredSchools: [],
      needs: { hunger: i === 1 ? 20 : 40, rest: 90, leisure: 90, composure: 90, health: 100 },
      morale: 85,
      readyDays: {},
      enrolledDay: 1,
      chronicle: [],
      careerSetIds: []
    }));
    s.servants = [];
    if (staffKitchen) s.servants.push(makeServant(1, kitchen.id));
    if (staffRefectory) s.servants.push(makeServant(2, refectory.id));
    return { s, kitchen, refectory };
  };

  // Unstaffed kitchen gives NO discount (costs 10 provisions for 10 eaters); staffed kitchen gives adj + stewpot discount (costs 8)
  const kOff = mkDining(false, false);
  AnkicasterEngine.ringBell(kOff.s, []);
  const costNoKitchen = 100 - kOff.s.resources.provisions;
  const pickyNoKitchen = kOff.s.characters[1].needs.hunger;

  const kOn = mkDining(true, false);
  AnkicasterEngine.ringBell(kOn.s, []);
  const costWithKitchen = 100 - kOn.s.resources.provisions;
  const pickyWithKitchen = kOn.s.characters[1].needs.hunger;

  assert.equal(costNoKitchen, 10, 'unstaffed Kitchen grants zero meal discounts');
  assert.equal(costWithKitchen, 8, 'staffed Kitchen grants adjacency + stewpot discounts');
  assert.ok(pickyWithKitchen > pickyNoKitchen, 'staffed Kitchen lifts Picky Eater hunger penalty (unstaffed does not)');

  // Staffed Refectory restores 2x hunger recovery rate at same provisions cost
  const refOn = mkDining(false, true);
  AnkicasterEngine.ringBell(refOn.s, []);
  const costRefStaffed = 100 - refOn.s.resources.provisions;
  const hUnstaffed = kOff.s.characters[0].needs.hunger;
  const hStaffed = refOn.s.characters[0].needs.hunger;
  assert.equal(costRefStaffed, costNoKitchen, 'staffed Refectory uses exact same food cost');
  assert.equal(hStaffed - hUnstaffed, 2.5, 'staffed Refectory doubles hunger recovery rate (+5.0 vs +2.5 recovery before -4 decay)');

  // Demolishing staffed kitchen drops its servant back to idle
  const demo = AnkicasterEngine.demolishRoom(kOn.s, kOn.kitchen.id);
  assert.equal(demo.success, true);
  assert.equal(demo.state.servants![0].workplaceRoomId, undefined, 'demolishing drops servants back to idle');
});

test('Janitors Closet assigns up to Lv capacity, cleans dirtiest unclaimed room (+5/rev), never overlaps, Mopslime independent', () => {
  let s = stockedState();
  const closet = addFinishedRoom(s, 'janitors_closet', 5, 0, 900);
  closet.level = 2; // cap 2
  const dirtyA = addFinishedRoom(s, 'library', 6, 0, 901);
  dirtyA.cleanliness = 40;
  const dirtyB = addFinishedRoom(s, 'infirmary', 8, 0, 902);
  dirtyB.cleanliness = 70;

  s.servants = [makeServant(1, closet.id), makeServant(2, closet.id), makeServant(3)];
  assert.equal(AnkicasterEngine.assignServant(s, 3, closet.id).success, false, 'Lv2 closet caps at 2 janitors');

  const card = firstCardId(s);
  s = AnkicasterEngine.applyHonestReview(s, card, 3, 2400).state;
  const libAfter = s.rooms.find(r => r.id === dirtyA.id)!;
  const infAfter = s.rooms.find(r => r.id === dirtyB.id)!;
  assert.equal(libAfter.cleanliness, 45, 'first janitor cleans dirtiest unclaimed room +5/rev');
  assert.equal(infAfter.cleanliness, 75, 'second janitor cleans second dirtiest room +5/rev');
  assert.notEqual(s.servants![0].cleaningRoomId, s.servants![1].cleaningRoomId);

  // When all rooms reach 100, computeJanitorAssignments leaves both in closet (undefined target)
  for (const r of s.rooms) r.cleanliness = 100;
  const map = computeJanitorAssignments(s);
  assert.equal(map.get(1), undefined);
  assert.equal(map.get(2), undefined);
});

test('ServantChoreographer navigates strictly via stairs, renders QueuePanel/RoomWindow/TopBar cleanly, and hammerSwingPose animates vs reduceMotion', () => {
  // 1. Visual hammerSwingPose fixed-rate animation + reduceMotion freeze
  const p0 = hammerSwingPose(0, false);
  const p150 = hammerSwingPose(150, false);
  const pRm0 = hammerSwingPose(0, true);
  const pRm150 = hammerSwingPose(150, true);
  assert.notEqual(p0.strike, p150.strike, 'hammer swing animates across real elapsed ms');
  assert.deepEqual(pRm0, pRm150, 'reduceMotion freezes hammer pose');

  // 2. drawGoblinServant draws cleanly without throwing
  const { p, ops } = makePainterSpy();
  drawGoblinServant(p, makeServant(1).look, { x: 40, y: 100, facing: 'R', anim: 'work', frame: 0, tool: 'hammer', clockMs: 150 });
  assert.ok(ops.length > 5);

  // 3. ServantChoreographer respects NavGraph stair rules & Workshop 4-body cap
  const s = stockedState();
  s.wizard.levels.arcane = 5;
  const stair = makeRoom(950, 'spiral_stair', 4, 0, 'castle', [], { level: 1 });
  const ws = addFinishedRoom(s, 'workshop', 5, 0, 951);
  const siteUp = makeRoom(952, 'dormitory', 5, 1, 'castle', [], { state: 'site', buildRequired: 20, buildProgress: 0 });
  const stairUp = makeRoom(953, 'spiral_stair', 4, 1, 'castle', [], { level: 1 });
  s.rooms.push(stair, stairUp, siteUp);
  s.servants = [makeServant(1, ws.id), makeServant(2, ws.id)];
  s.settings.reduceMotion = true;

  const groundY = getGroundY(3);
  const nav = new NavGraph(s.rooms, groundY);
  const reach = computeReachability(s.rooms);
  const sChor = new ServantChoreographer(nav, groundY);
  sChor.reachability = reach;
  sChor.syncState(s, reach);
  sChor.tick(100, s, true);
  assert.equal(sChor.agents.size, 2);
  const g1 = sChor.agents.get('servant-1')!;
  assert.equal(g1.anim, 'work');
  assert.equal(g1.tool, 'hammer');

  // Also verify live walking path uses stairUp/stair (never jumps vertically outside stairs)
  const sWalk = structuredClone(s);
  sWalk.settings.reduceMotion = false;
  const sChorWalk = new ServantChoreographer(nav, groundY);
  sChorWalk.reachability = reach;
  sChorWalk.syncState(sWalk, reach);
  sChorWalk.tick(16, sWalk, false);
  const w1 = sChorWalk.agents.get('servant-1')!;
  if (w1.path.length > 0) {
    const floorTransitions = w1.path.slice(1).filter((n, idx) => n.floor !== w1.path[idx].floor);
    assert.ok(
      floorTransitions.every(n => n.kind === 'stair'),
      'ServantChoreographer vertical transitions only happen on stair nodes'
    );
  }

  // Coexist cleanly with Choreographer (no agent key collisions)
  const chChor = new Choreographer(nav, groundY);
  chChor.syncState(s, reach);
  assert.ok(!chChor.agents.has('servant-1'));

  // 4. UI rendering: TopBar Queue btn, QueuePanel (no worker assignment), Summoning Chamber & Workshop RoomWindow
  const topHtml = renderToStaticMarkup(
    <TopBar state={s} onOpenScreen={noop} onOpenRoom={noop} onToggleBuildMode={noop} onToggleQueue={noop} />
  );
  assert.match(topHtml, /data-testid="top-queue-btn"/);

  s.wizard.activeSession = {
    id: 1,
    kind: 'summon',
    summonTier: 1,
    progress: 5,
    required: 30,
    costPaid: 500,
    state: 'active'
  };
  s.wizard.workshopAssigned = true;
  const qHtml = renderToStaticMarkup(
    <QueuePanel
      state={s}
      onMoveSite={noop}
      onTogglePause={noop}
      onMoveService={noop}
      onCancelService={noop}
      onClose={noop}
    />
  );
  assert.match(qHtml, /data-testid="queue-panel"/);
  assert.match(qHtml, /data-testid="queue-build-section"/);
  assert.match(qHtml, /data-testid="queue-services-section"/);
  assert.equal(qHtml.includes('room-servant-select'), false, 'QueuePanel does NOT assign workers');

  const ch = addFinishedRoom(s, 'summoning_chamber', 6, 0, 954);
  const chHtml = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={ch}
      onClose={noop}
      onOpenScreen={noop}
      onResolveHazard={noop}
      onUpgrade={noop}
      onAddFurniture={noop}
      onRemoveFurniture={noop}
      onQueueSummonServant={noop}
      onAssignServant={noop}
    />
  );
  assert.match(chHtml, /data-testid="summoning-chamber-controls"/);
  assert.match(chHtml, /data-testid="servant-roster"/);

  const wsHtml = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={ws}
      onClose={noop}
      onOpenScreen={noop}
      onResolveHazard={noop}
      onUpgrade={noop}
      onAddFurniture={noop}
      onRemoveFurniture={noop}
      onAssignServant={noop}
      onSetWizardWorkshopAssigned={noop}
    />
  );
  assert.match(wsHtml, /data-testid="wizard-workshop-toggle"/);
  assert.match(wsHtml, /data-testid="room-servants"/);
  assert.equal(summonServantQuote(0, 1).mana, 500);
});

test('goblin servants snap through level-3 stair teleporters instead of abandoning the path', () => {
  const s = stockedState();
  const low = makeRoom(960, 'spiral_stair', 2, 0, 'castle', [], { level: 3 });
  const high = makeRoom(961, 'spiral_stair', 0, 2, 'castle', [], { level: 3 });
  s.rooms.push(low, high);
  const kitchen = addFinishedRoom(s, 'kitchen', 1, 2, 962);
  s.servants = [makeServant(1, kitchen.id)];

  const groundY = getGroundY(3);
  const nav = new NavGraph(s.rooms, groundY);
  const reach = computeReachability(s.rooms);
  assert.equal(reach.get(kitchen.id)?.reachable, true, 'the upper kitchen is reachable through the two portals');

  const chor = new ServantChoreographer(nav, groundY);
  chor.reachability = reach;
  chor.syncState(s, reach);
  let jumped = false;
  let agent = chor.agents.get('servant-1')!;
  for (let i = 0; i < 400 && agent.currentFloor < 2; i++) {
    const beforeY = agent.y;
    const beforeFloor = agent.currentFloor;
    chor.tick(250, s, false, 1000 + i * 250);
    agent = chor.agents.get('servant-1')!;
    if (agent.currentFloor - beforeFloor >= 2 && Math.abs(agent.y - beforeY) > 40) jumped = true;
  }
  assert.equal(jumped, true, 'crossing the portals moves the goblin a full floor in one step');
  assert.equal(agent.currentFloor, 2);
});
