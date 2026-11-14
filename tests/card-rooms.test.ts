/**
 * Every room is a card. Builds cost materials. Hunger drifts toward the last meal.
 * Glassworks and the Weaving Room produce. The ledger matches the real change.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import { Character, FullGameState, PlacedFurniture } from '../src/types/ankicaster.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { magicSchoolOdds, schoolMultiplier, deckPool } from '../src/utils/decks.ts';
import { glassworksConversion, resourceFlow, weavingOutput } from '../src/utils/resourceReport.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { BuildMenuPanel } from '../src/components/GamePanels.tsx';

function stocked(): FullGameState {
  const s = createNewAcademy();
  s.mana = 100000;
  Object.assign(s.resources, {
    timber: 5000, stone: 5000, glass: 5000, cloth: 5000, provisions: 5000,
    insight: 500, crystal: 50, heartwood: 20, radiance: 50
  });
  return s;
}

function student(id: number, hunger = 90): Character {
  return {
    id, name: `Student ${id}`, pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#6B4FBB', hat: 'cap' },
    personality: 'Curious', traits: [], status: 'student', currentSchool: 'arcane', masteredSchools: [],
    needs: { hunger, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 80, readyDays: {}, enrolledDay: 1, chronicle: [], careerSetIds: []
  };
}

let furn = 8000;
function item(defId: string, slotKind: string): PlacedFurniture {
  return { id: furn++, defId, slotKind, damaged: false };
}

test('a new game has only the hall, the study and one vegetable patch', () => {
  const s = createNewAcademy();
  assert.deepEqual(s.rooms.map(r => r.defId).sort(), ['entrance_hall', 'vegetable_patch', 'wizard_study']);
  const blocked = AnkicasterEngine.placeRoom(stocked(), 'dormitory');
  assert.equal(blocked.success, false);
  assert.match(blocked.error || '', /No plan/);
  assert.match(blocked.error || '', /Foundation/);

  const kept = AnkicasterEngine.chooseDraftCard(stocked(), {
    id: 'd', deck: 'foundation', rarity: 'common', name: 'Dormitory Plan', type: 'blueprint', targetId: 'dormitory', description: ''
  });
  assert.equal(kept.state.roomPlans?.dormitory, 1);
  const once = AnkicasterEngine.placeRoom(kept.state, 'dormitory');
  assert.equal(once.success, true, once.error);
  assert.equal(once.state.mana, kept.state.mana, 'building spends no mana');
  assert.equal(once.state.roomPlans?.dormitory, 0);
  const twice = AnkicasterEngine.placeRoom(once.state, 'dormitory');
  assert.equal(twice.success, false);
});

test('founding draws cost the normal price and include the guaranteed rooms', () => {
  const s = stocked();
  const first = AnkicasterEngine.drawDraftCards(s, 'foundation', () => 0.5);
  assert.equal(first.cost, 50);
  assert.equal(first.error, undefined);
  assert.equal(first.state.mana, s.mana - 50);
  assert.ok(first.cards.some(c => c.targetId === 'dormitory'));
  assert.ok(first.tutorial && /Foundation/.test(first.tutorial) && /Grounds/.test(first.tutorial) && /Magic/.test(first.tutorial));

  const second = AnkicasterEngine.drawDraftCards(first.state, 'foundation', () => 0.2);
  assert.equal(second.cost, Math.round(50 * 1.05));
  assert.ok(second.cards.some(c => c.targetId === 'refectory'));
  assert.equal(second.tutorial, undefined);

  const grounds = AnkicasterEngine.drawDraftCards(stocked(), 'grounds', () => 0);
  assert.equal(grounds.cost, 50);
  assert.ok(grounds.cards.some(c => c.targetId === 'woodlot' || c.targetId === 'quarry'));
  assert.equal(AnkicasterEngine.drawDraftCards(stocked(), 'magic').cost, 100);
});

test('demolish returns the plan and move does not', () => {
  let s = stocked();
  s.resources.timber = 80;
  s.roomPlans = { dormitory: 1 };
  const placed = AnkicasterEngine.placeRoom(s, 'dormitory', 'castle', 6, 0);
  assert.equal(placed.success, true, placed.error);
  const id = placed.roomId!;
  const moved = AnkicasterEngine.moveRoom(placed.state, id, 0, 0);
  assert.equal(moved.success, true, moved.error);
  assert.equal(moved.state.roomPlans?.dormitory, 0, 'moving spends no plan');
  const gone = AnkicasterEngine.demolishRoom(moved.state, id);
  assert.equal(gone.success, true, gone.error);
  assert.equal(gone.state.roomPlans?.dormitory, 1, 'demolish gives the card back');
  assert.ok(gone.state.resources.timber > moved.state.resources.timber, 'materials still refund');
});

test('draw prices rise 5% and a term keeps room plans', () => {
  let s = stocked();
  assert.equal(AnkicasterEngine.drawDraftCards(s, 'foundation').cost, 50);
  s = AnkicasterEngine.drawDraftCards(s, 'foundation').state;
  assert.equal(AnkicasterEngine.drawDraftCards(s, 'foundation').cost, Math.round(50 * 1.05));
  s.roomPlans = { library: 2 };
  s.settings.mode = 'timed';
  const next = AnkicasterEngine.startNextTerm(s, 120);
  assert.equal(next.state.roomPlans?.library, 2);
  assert.deepEqual(next.state.draftHistory, {});
});

test('the Magic deck favors studied schools but unstudied schools can still appear', () => {
  assert.equal(schoolMultiplier(0), 1);
  assert.equal(schoolMultiplier(4), 3);
  assert.equal(schoolMultiplier(10), 3);
  const even = magicSchoolOdds({ arcane: 0, nature: 0, light: 0, shadow: 0, alchemy: 0 });
  for (const n of Object.values(even)) assert.ok(n > 0, 'every school is in the deck');
  const tilted = magicSchoolOdds({ arcane: 10, nature: 0, light: 0, shadow: 0, alchemy: 0 });
  assert.ok(tilted.arcane > tilted.nature);
  assert.ok(tilted.nature > 0);
  const pool = deckPool('magic');
  assert.equal(pool.some(c => c.targetId === 'sanctuary' || c.targetId === 'ward_spire' || c.targetId === 'apothecary'), false);
});

test('bad-luck protection puts a room card in the draw after 10 roomless draws', () => {
  const s = stocked();
  s.roomlessStreak = { foundation: 10 };
  s.foundingDraws = { foundation: 5, grounds: 5 };
  s.draftsCompleted = 5;
  const res = AnkicasterEngine.drawDraftCards(s, 'foundation', () => 0.99);
  assert.ok(res.cards.some(c => c.type === 'blueprint'));
  assert.equal(res.state.roomlessStreak?.foundation, 0);
});

test('three masters grant one Rift Gate plan, and only once', () => {
  const s = stocked();
  s.alumniGallery = [
    { id: 1, name: 'A', portrait: '', titles: [], retiredDay: 1, bonusType: '', bonusValue: 0 },
    { id: 2, name: 'B', portrait: '', titles: [], retiredDay: 1, bonusType: '', bonusValue: 0 }
  ];
  AnkicasterEngine.grantRiftGate(s);
  assert.equal(s.roomPlans?.rift_gate, undefined);
  s.characters.push(student(1));
  s.characters[0].masteredSchools = ['arcane'];
  AnkicasterEngine.grantRiftGate(s);
  assert.equal(s.roomPlans?.rift_gate, 1);
  AnkicasterEngine.grantRiftGate(s);
  assert.equal(s.roomPlans?.rift_gate, 1);
  assert.equal(deckPool('foundation').some(c => c.targetId === 'rift_gate'), false);
  assert.equal(deckPool('grounds').some(c => c.targetId === 'rift_gate'), false);
  assert.equal(deckPool('magic').some(c => c.targetId === 'rift_gate'), false);
});

test('hunger settles near 84 when seated and stays above 25 when standing', () => {
  const run = (withRef: boolean) => {
    const s = stocked();
    s.resources.provisions = 10000;
    // The next bell is a meal, so the stored target is set before hunger drifts.
    s.bellIndex = 4;
    s.characters = Array.from({ length: 15 }, (_, i) => student(100 + i));
    if (withRef) {
      const t1 = { ...item('long_table', 'required:long_table'), x: 64, floor: 0, plane: 'floor' as const };
      const t2 = { ...item('long_table', 'optional'), x: 120, floor: 0, plane: 'floor' as const };
      const refFurn: PlacedFurniture[] = [
        t1,
        t2,
        { ...item('hearth', 'required:hearth'), x: 168, floor: 0, plane: 'floor' as const }
      ];
      for (const tbl of [t1, t2]) {
        for (let m = 0; m < 6; m++) {
          refFurn.push({ ...item('wooden_chair', 'optional'), tableId: tbl.id, markIndex: m, floor: 0, plane: 'floor' as const });
        }
      }
      s.rooms.push({
        id: 90, defId: 'refectory', x: 6, y: 0, w: 3, h: 1, area: 'castle', level: 1, state: 'built',
        buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {},
        furniture: refFurn
      });
    }
    let worst = 100;
    for (let i = 0; i < 50; i++) {
      s.bellIndex += 1;
      AnkicasterEngine.ringBell(s, []);
      for (const c of s.characters) worst = Math.min(worst, c.needs.hunger);
    }
    return { end: s.characters.map(c => c.needs.hunger), worst };
  };
  const seated = run(true);
  assert.ok(seated.end.every(h => h >= 80), `seated hunger dipped: ${Math.min(...seated.end)}`);
  assert.ok(seated.worst >= 80, `seated hunger dipped during the run: ${seated.worst}`);
  const standing = run(false);
  assert.ok(standing.end.every(h => h > 25), `standing hunger dipped: ${Math.min(...standing.end)}`);
  assert.ok(standing.worst > 25, `standing hunger dipped during the run: ${standing.worst}`);
});

test('Glassworks converts stone to glass, and an Unfinished one does nothing', () => {
  assert.deepEqual(glassworksConversion(10, 1, 0), { stoneUsed: 2, glassGain: 1 });
  assert.deepEqual(glassworksConversion(1, 1, 0), { stoneUsed: 1, glassGain: 0.5 });

  const finished = stocked();
  finished.resources.stone = 10;
  finished.resources.glass = 0;
  finished.rooms.push({
    id: 70, defId: 'glassworks', x: 2, y: 0, w: 1, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {},
    furniture: [item('kiln', 'required:kiln')]
  });
  const room = finished.rooms.find(r => r.defId === 'glassworks')!;
  const eff = AnkicasterEngine.roomEfficiency(finished, room);
  AnkicasterEngine.ringBell(finished, []);
  const conv = glassworksConversion(10, eff, 0);
  assert.ok(Math.abs(finished.resources.stone - (10 - conv.stoneUsed)) < 1e-9);
  assert.ok(Math.abs(finished.resources.glass - conv.glassGain) < 1e-9);

  const short = stocked();
  short.resources.stone = 1;
  short.resources.glass = 0;
  short.rooms.push({ ...room, id: 71 });
  const eff2 = AnkicasterEngine.roomEfficiency(short, short.rooms.find(r => r.id === 71)!);
  AnkicasterEngine.ringBell(short, []);
  const conv2 = glassworksConversion(1, eff2, 0);
  assert.equal(conv2.stoneUsed, 1);
  assert.equal(conv2.glassGain, 0.5);
  assert.ok(Math.abs(short.resources.glass - 0.5) < 1e-9);
  assert.ok(Math.abs(short.resources.stone - 0) < 1e-9);

  const bare = stocked();
  bare.resources.stone = 10;
  bare.resources.glass = 4;
  bare.rooms.push({
    id: 72, defId: 'glassworks', x: 2, y: 0, w: 1, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  });
  AnkicasterEngine.ringBell(bare, []);
  assert.equal(bare.resources.stone, 10);
  assert.equal(bare.resources.glass, 4);
});

test('the Weaving Room adds cloth, doubled by a tamed moonsheep', () => {
  assert.equal(weavingOutput(1, false), 0.5);
  assert.equal(weavingOutput(1, true), 1);
  const weave = (sheep: boolean) => {
    const s = stocked();
    s.resources.cloth = 0;
    s.rooms.push({
      id: 73, defId: 'weaving_room', x: 2, y: 0, w: 1, h: 1, area: 'castle', level: 1, state: 'built',
      buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {},
      furniture: [item('loom', 'required:loom')]
    });
    if (sheep) {
      s.creatures.push({
        id: 1, defId: 'moonsheep', nickname: 'Wool', status: 'tamed', hungry: false,
        hatchProgress: 0, tamingProgress: 0, bondLevel: 1, bondProgress: 0, arrivedDay: 1
      });
    }
    const eff = AnkicasterEngine.roomEfficiency(s, s.rooms.find(r => r.defId === 'weaving_room')!);
    AnkicasterEngine.ringBell(s, []);
    return { cloth: s.resources.cloth, expected: Math.min(500, weavingOutput(eff, sheep)) };
  };
  const plain = weave(false);
  const wool = weave(true);
  assert.ok(Math.abs(plain.cloth - plain.expected) < 1e-9);
  assert.ok(Math.abs(wool.cloth - wool.expected) < 1e-9);
  assert.ok(wool.cloth > plain.cloth);
});

test('the ledger matches provisions, and building writes a Recent line', () => {
  const s = stocked();
  s.resources.provisions = 80;
  s.characters = [student(1), student(2), student(3)];
  const before = s.resources.provisions;
  for (let i = 0; i < 5; i++) AnkicasterEngine.ringBell(s, []);
  const flow = resourceFlow(s, 'provisions');
  const delta = s.resources.provisions - before;
  assert.equal(flow.bells, 5);
  assert.ok(Math.abs(flow.net * 5 - delta) < 1e-6, `net ${flow.net} * 5 vs delta ${delta}`);
  assert.ok(flow.income.some(l => /Vegetable Patch/.test(l.label)));
  assert.ok(flow.use.some(l => /Meals/.test(l.label)));

  s.roomPlans = { dormitory: 1 };
  const placed = AnkicasterEngine.placeRoom(s, 'dormitory', 'castle', 6, 0);
  assert.equal(placed.success, true, placed.error);
  const recent = placed.state.resourceLedger?.recent.timber || [];
  const line = recent[recent.length - 1];
  assert.ok(line, 'building records timber');
  assert.match(line.label, /Dormitory/);
  assert.equal(line.amount, -(ROOM_DEFINITIONS.dormitory.cost.timber || 0));
});

test('the build menu shows plan counts for rooms you can build', () => {
  const s = createNewAcademy();
  s.roomPlans = { library: 2 };
  const html = renderToStaticMarkup(React.createElement(BuildMenuPanel, { state: s, onPlaceRoom: () => {} }));
  assert.match(html, /2 plans/);
  assert.match(html, /data-build-card="library"/);
  assert.ok(!html.includes('data-build-card="dormitory"'));
  const stair = html.split('data-build-card="spiral_stair"')[1]?.slice(0, 500) || '';
  assert.ok(!/plan-count|plans</.test(stair), 'structure pieces show no plan count');
  assert.ok(!html.includes('>0m<') && !/Cost:[\s\S]{0,40}\d+m/.test(html));
});

function vault(id: number, finished: boolean, state: 'built' | 'site' = 'built') {
  return {
    id, defId: 'storage_vault', x: 0, y: 0, w: 1, h: 1, area: 'castle' as const, level: 1 as const, state,
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {},
    furniture: finished ? [item('shelving', 'required:shelving')] : []
  };
}

test('storage cap is 200, 300 with a finished vault, and 200 if that vault is Unfinished', () => {
  const s = createNewAcademy();
  assert.equal(AnkicasterEngine.storageCap(s), 200);
  s.rooms.push(vault(90, true));
  assert.equal(AnkicasterEngine.storageCap(s), 300);
  s.rooms[s.rooms.length - 1].furniture = [];
  assert.equal(AnkicasterEngine.storageCap(s), 200);
  s.rooms[s.rooms.length - 1].state = 'site';
  s.rooms[s.rooms.length - 1].furniture = [item('shelving', 'required:shelving')];
  assert.equal(AnkicasterEngine.storageCap(s), 200, 'a site does not raise the cap');
});

test('a woodlot at 199 timber ends the bell at 200', () => {
  const s = stocked();
  s.resources.timber = 199;
  s.rooms.push({
    id: 91, defId: 'woodlot', x: 6, y: 0, w: 1, h: 1, area: 'grounds', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  });
  AnkicasterEngine.ringBell(s, []);
  assert.equal(s.resources.timber, 200);
});

test('a supply crate at 195 timber ends at 200 and does not throw away surplus', () => {
  const s = stocked();
  s.resources.timber = 195;
  const stone = s.resources.stone;
  const glass = s.resources.glass;
  const res = AnkicasterEngine.chooseDraftCard(s, {
    id: 'extra-supply', deck: 'foundation', rarity: 'common', name: 'Supply Shipment Boon', type: 'boon', description: ''
  });
  assert.equal(res.state.resources.timber, 200);
  assert.equal(res.state.resources.stone, stone);
  assert.equal(res.state.resources.glass, glass);
});

test('demolishing a vault leaves surplus timber, and the next bell adds nothing', () => {
  const s = stocked();
  s.resources.timber = 280;
  s.rooms.push(vault(92, true));
  s.rooms.push({
    id: 93, defId: 'woodlot', x: 6, y: 0, w: 1, h: 1, area: 'grounds', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  });
  assert.equal(AnkicasterEngine.storageCap(s), 300);
  const gone = AnkicasterEngine.demolishRoom(s, 92);
  assert.equal(gone.success, true, gone.error);
  assert.equal(gone.state.resources.timber, 280);
  AnkicasterEngine.ringBell(gone.state, []);
  assert.equal(gone.state.resources.timber, 280);
});

test('the build list shows only planned rooms plus the three structure pieces', () => {
  const s = createNewAcademy();
  s.roomPlans = { library: 1 };
  const html = renderToStaticMarkup(React.createElement(BuildMenuPanel, { state: s, onPlaceRoom: () => {} }));
  const cards = [...html.matchAll(/data-build-card="([^"]+)"/g)].map(m => m[1]).sort();
  assert.deepEqual(cards, ['corridor', 'library', 'spiral_stair', 'support_pillar']);
  const tabs = [...html.matchAll(/data-build-tab="([^"]+)"/g)].map(m => m[1]);
  assert.ok(tabs.includes('all') && tabs.includes('core') && tabs.includes('arcane'));
  assert.ok(!tabs.includes('alchemy') && !tabs.includes('living') && !tabs.includes('grounds'));

  const bare = renderToStaticMarkup(React.createElement(BuildMenuPanel, { state: createNewAcademy(), onPlaceRoom: () => {} }));
  assert.match(bare, /Draw room cards to unlock more rooms/);
  assert.match(bare, /data-build-card="spiral_stair"/);
  assert.ok(!bare.includes('data-build-card="dormitory"'));
  assert.ok(!bare.includes('data-build-tab="alchemy"'));
});
