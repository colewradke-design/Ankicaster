/**
 * Required furniture ("fixtures"), GDD 15.4 step 6, 15.7 overrides and 17.1:
 * - old saves: built rooms get their missing required fixtures on load (idempotent)
 * - sites finish with required furniture empty: Unfinished, 0% efficiency, no outputs
 * - installing every required fixture (catalog cost, or free when none is defined) makes it normal
 * - instant-built rooms and the fresh start keep auto-filled fixtures
 * - the visual layout and the engine share one notion of "filled"
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../src/data/content.ts';
import { PlacedRoom, FullGameState } from '../src/types/ankicaster.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { calculateRoomEfficiency } from '../src/utils/formulas.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import {
  isRoomUnfinished, missingRequiredSlots, requiredSlots, requiredInstallOption, requiredSlotStatus, fillRequiredFixtures, allFurnitureIds
} from '../src/utils/requiredFurniture.ts';
import { layoutRoomFurniture } from '../src/visual/layout/roomLayouts.ts';

function room(defId: string, id: number, x: number, y: number, extra: Partial<PlacedRoom> = {}): PlacedRoom {
  const d = ROOM_DEFINITIONS[defId];
  return {
    id, defId, x, y, w: d.size[0], h: d.size[1], area: d.area as 'castle' | 'grounds', level: 1, state: 'built',
    buildRequired: d.buildReviews, buildProgress: d.buildReviews, buildPaused: false, cleanliness: 100, settings: {}, furniture: [], ...extra
  };
}

function rich(s: FullGameState): FullGameState {
  s.mana = 5000;
  for (const k of Object.keys(s.resources)) (s.resources as any)[k] = 400;
  return s;
}

test('RF-1 migration fills every old built room, keeps sites empty, is idempotent and ids are unique', () => {
  const s = createNewAcademy();
  s.rooms.push(room('refectory', 20, 0, 1));
  s.rooms.push(room('greenhouse', 21, 0, 0, { area: 'grounds', furniture: [{ id: 211, defId: 'planter_bed', slotKind: 'required:planter_bed', damaged: false }] }));
  s.rooms.push(room('dormitory', 22, 3, 1, { furniture: [{ id: 999, defId: 'feather_bed', slotKind: 'bed', damaged: false }] }));
  s.rooms.push(room('faculty_lounge', 23, 6, 1));
  s.rooms.push(room('library', 24, 7, 1, { state: 'site', buildProgress: 3 }));
  // Every room type, built with nothing installed
  let id = 100;
  for (const defId of Object.keys(ROOM_DEFINITIONS)) s.rooms.push(room(defId, id++, 20 + id, 5));
  delete (s as any).requiredFixturesVersion; // an old save has no marker
  const raw = JSON.parse(JSON.stringify(s));
  const before = Object.fromEntries(raw.rooms.map((r: PlacedRoom) => [r.id, calculateRoomEfficiency(r)]));
  assert.equal(before[20], 0, 'an empty refectory is Unfinished before migration');

  const out = AnkicasterEngine.normalizeLoadedState(raw) as FullGameState;
  for (const r of out.rooms) {
    if (r.state === 'built') {
      assert.equal(isRoomUnfinished(r), false, `${r.defId} still Unfinished after migration`);
      assert.ok(calculateRoomEfficiency(r) > 0, `${r.defId} efficiency > 0`);
    }
  }
  const ref = out.rooms.find(r => r.id === 20)!;
  assert.deepEqual(ref.furniture.map(f => [f.defId, f.slotKind]), [['long_table', 'required:long_table'], ['hearth', 'required:hearth']]);
  const gh = out.rooms.find(r => r.id === 21)!;
  assert.equal(gh.furniture.length, 2, 'greenhouse gets its second planter bed');
  const dorm = out.rooms.find(r => r.id === 22)!;
  assert.equal(dorm.furniture.length, 1, 'an installed bed already fills the dorm bed slot');
  assert.deepEqual(out.rooms.find(r => r.id === 24)!.furniture, [], 'sites are left alone');
  const ids = out.rooms.flatMap(r => r.furniture.map(f => f.id));
  assert.equal(new Set(ids).size, ids.length, 'unique furniture ids');
  // Idempotent; the input is not mutated
  assert.deepEqual(AnkicasterEngine.normalizeLoadedState(JSON.parse(JSON.stringify(out))), out);
  assert.deepEqual(raw.rooms.find((r: PlacedRoom) => r.id === 20).furniture, []);
  assert.equal(out.requiredFixturesVersion, 1);
  // Mana, resources and progress are untouched
  assert.equal(out.mana, s.mana);
  assert.deepEqual(out.resources, s.resources);
});

test('RF-2 a site that finishes from honest reviews starts Unfinished: fixtures empty, 0% and no outputs', () => {
  let s = rich(createNewAcademy());
  s.rooms.push(room('greenhouse', 30, 0, 0, { area: 'grounds', state: 'site', buildRequired: 5, buildProgress: 4 }));
  const cardId = Number(Object.keys(s.allCards)[0]);
  const res = AnkicasterEngine.applyHonestReview(s, cardId, 3, 2000);
  s = res.state;
  const gh = s.rooms.find(r => r.id === 30)!;
  assert.equal(gh.state, 'built');
  assert.deepEqual(gh.furniture, [], 'required furniture starts empty');
  assert.equal(isRoomUnfinished(gh), true);
  assert.equal(calculateRoomEfficiency(gh), 0);
  assert.equal(missingRequiredSlots(gh).length, 2);
  const notice = s.notices[s.notices.length - 1].text;
  assert.match(notice, /Unfinished/);
  assert.match(notice, /Planter Bed/);
  // Reloading the save keeps the fixtures empty (the one-time migration already ran for this save)
  const reloaded = AnkicasterEngine.normalizeLoadedState(JSON.parse(JSON.stringify(s))) as FullGameState;
  assert.deepEqual(reloaded.rooms.find(r => r.id === 30)!.furniture, [], 'no free fixtures on reload');
  assert.equal(isRoomUnfinished(reloaded.rooms.find(r => r.id === 30)!), true);
  // Unfinished rooms produce nothing at the bell
  const rnd = Math.random;
  Math.random = () => 0.99;
  try {
    const bell = (st: FullGameState) => { const c = structuredClone(st); c.resources.provisions = 0; c.resources.herbs = 0; AnkicasterEngine.ringBell(c, []); return [c.resources.provisions, c.resources.herbs]; };
    const withUnfinished = bell(s);
    const without = bell({ ...s, rooms: s.rooms.filter(r => r.id !== 30) });
    const done = structuredClone(s);
    fillRequiredFixtures(done.rooms.find(r => r.id === 30)!, allFurnitureIds(done.rooms));
    const withFinished = bell(done);
    assert.deepEqual(withUnfinished, without, 'an Unfinished greenhouse yields nothing at the bell');
    assert.ok(withFinished[0] > without[0] && withFinished[1] > without[1], 'a finished greenhouse yields');
  } finally { Math.random = rnd; }
  // Quickening potion / spell completion follows the same rule
  const q = createNewAcademy();
  q.rooms.push(room('refectory', 31, 0, 1, { state: 'site', buildRequired: 10, buildProgress: 9 }));
  AnkicasterEngine.completeSite(q, q.rooms[q.rooms.length - 1]);
  assert.equal(isRoomUnfinished(q.rooms[q.rooms.length - 1]), true);
});

test('RF-3 installing every required fixture costs the catalog price and makes efficiency normal', () => {
  let s = rich(createNewAcademy());
  s.rooms.push(room('refectory', 40, 0, 1));
  const r0 = s.rooms.find(r => r.id === 40)!;
  const mana0 = s.mana, timber0 = s.resources.timber, stone0 = s.resources.stone;
  assert.equal(calculateRoomEfficiency(r0), 0);

  // Too poor: refused, state unchanged
  const poor = structuredClone(s); poor.mana = 10;
  const fail = AnkicasterEngine.installRequiredFixture(poor, 40, 0);
  assert.equal(fail.success, false);
  assert.equal(fail.state, poor);

  for (const slot of requiredSlots('refectory')) {
    const res = AnkicasterEngine.installRequiredFixture(s, 40, slot.index);
    assert.ok(res.success, res.error);
    s = res.state;
  }
  const lt = FURNITURE_DEFINITIONS.long_table.cost, h = FURNITURE_DEFINITIONS.hearth.cost;
  assert.equal(s.mana, mana0 - lt.mana - h.mana);
  assert.equal(s.resources.timber, timber0 - (lt.timber || 0));
  assert.equal(s.resources.stone, stone0 - (h.stone || 0));
  const r1 = s.rooms.find(r => r.id === 40)!;
  assert.equal(isRoomUnfinished(r1), false);
  const filled = { ...r0, furniture: [{ id: 1, defId: 'long_table', slotKind: 'required:long_table', damaged: false }, { id: 2, defId: 'hearth', slotKind: 'required:hearth', damaged: false }] };
  assert.ok(calculateRoomEfficiency(r1) > 0);
  assert.equal(calculateRoomEfficiency(r1), calculateRoomEfficiency(filled));
  assert.equal(AnkicasterEngine.installRequiredFixture(s, 40, 0).success, false, 'a filled slot cannot be bought twice');

  // A role with no catalog cost is free (decision): faculty lounge armchairs
  assert.equal(requiredInstallOption('armchair').free, true);
  s.rooms.push(room('faculty_lounge', 41, 3, 1));
  const m = s.mana, res = structuredClone(s.resources);
  for (const slot of requiredSlots('faculty_lounge')) s = AnkicasterEngine.installRequiredFixture(s, 41, slot.index).state;
  assert.equal(s.mana, m);
  assert.deepEqual(s.resources, res);
  assert.equal(isRoomUnfinished(s.rooms.find(r => r.id === 41)!), false);
  // A generic bed slot is bought as the cheapest catalog bed
  assert.equal(requiredInstallOption('bed').defId, 'simple_cot');
  assert.equal(requiredInstallOption('couch_or_hearth').defId, 'couch');

  // No farming: demolishing returns 50% of the room's materials, 0 mana, and no required fixtures
  const preview = AnkicasterEngine.demolishPreview(s, 40)!;
  assert.equal(preview.refund.mana, 0);
  const d = AnkicasterEngine.demolishRoom(s, 40);
  assert.ok(d.success, d.error);
  {
    assert.equal(d.state.furnitureInventory?.long_table || 0, 0);
    assert.equal(d.state.furnitureInventory?.hearth || 0, 0);
    assert.ok(d.state.mana <= s.mana);
  }
});

test('RF-4 instant build and the fresh start keep auto-filled fixtures', () => {
  const fresh = createNewAcademy();
  for (const r of fresh.rooms) if (r.state === 'built') assert.equal(isRoomUnfinished(r), false, `${r.defId} fresh start`);
  assert.deepEqual(AnkicasterEngine.normalizeLoadedState(structuredClone(fresh)).rooms!.map(r => r.furniture), fresh.rooms.map(r => r.furniture), 'migration adds no fixtures on a new save');

  // Re-place the (instant) Wizard's Study on its own spot
  const s = rich(createNewAcademy());
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  const s2 = { ...s, rooms: s.rooms.filter(r => r.id !== study.id) };
  const placed = AnkicasterEngine.placeRoom(s2, 'wizard_study', 'castle', study.x, study.y);
  assert.ok(placed.success, placed.error);
  const nr = placed.state.rooms.find(r => r.id === placed.roomId)!;
  assert.equal(nr.state, 'built');
  assert.deepEqual(nr.furniture.map(f => f.slotKind).sort(), ['required:lectern', 'required:orb_stand']);
  assert.equal(nr.furniture[0].id, nr.id * 10 + 1, 'same id shape as before');
  assert.equal(isRoomUnfinished(nr), false);
  assert.ok(calculateRoomEfficiency(nr) > 0);

  // A non-instant room placed now is a site (fixtures come later). It needs a kept plan.
  const withPlan = { ...placed.state, roomPlans: { ...(placed.state.roomPlans || {}), library: 1 } };
  const site = AnkicasterEngine.placeRoom(withPlan, 'library');
  assert.ok(site.success, site.error);
  assert.deepEqual(site.state.rooms.find(r => r.id === site.roomId)!.furniture, []);
});

test('RF-5 the visual layout and the engine agree on which required slots are filled', () => {
  const alts = ['', 'optional', 'tagged', 'alt'];
  for (const defId of Object.keys(ROOM_DEFINITIONS)) {
    const slots = requiredSlots(defId);
    for (const mode of alts) {
      const r = room(defId, 50, 0, 1);
      if (mode === 'tagged') fillRequiredFixtures(r, allFurnitureIds([]));
      if (mode === 'optional') slots.slice(0, 1).forEach(sl => r.furniture.push({ id: 5, defId: requiredInstallOption(sl.role).defId, slotKind: 'optional', damaged: false }));
      if (mode === 'alt') r.furniture.push({ id: 6, defId: 'simple_cot', slotKind: 'bed', damaged: false }, { id: 7, defId: 'hearth', slotKind: 'optional', damaged: false });
      const view = layoutRoomFurniture(r);
      const engineMissing = missingRequiredSlots(r);
      const noFurniture = defId === 'spiral_stair' || defId === 'support_pillar';
      if (!noFurniture) assert.deepEqual(view.missing.map(m => m.role), engineMissing.map(m => m.role), `${defId}/${mode}`);
      assert.equal(requiredSlotStatus(r).filter(x => x.filled).length + engineMissing.length, slots.length);
      if (mode === 'tagged') assert.equal(engineMissing.length, 0, `${defId} tagged fills all`);
    }
  }
});
