/**
 * Furniture changes what a room does, not only how it looks (GDD 14.4, 15.6, 17.1).
 * - a Feather Bed dorm sets a higher Rest target than a Simple Cot dorm
 * - a Splendid classroom yields more essence than a Bare one
 * - a dirty room yields less than a clean one
 * - an Unfinished room yields 0
 * - a damaged item counts half its stat points toward quality
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BuildMenuPanel } from '../src/components/GamePanels.tsx';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import { FURNITURE_DEFINITIONS, ROOM_DEFINITIONS } from '../src/data/content.ts';
import { Character, FullGameState, PlacedFurniture, PlacedRoom } from '../src/types/ankicaster.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { calculateRoomQuality } from '../src/utils/formulas.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';

let nextFurnId = 5000;

function place(state: FullGameState, defId: string, id: number, x: number, y: number, furniture: PlacedFurniture[] = [], extra: Partial<PlacedRoom> = {}): PlacedRoom {
  const d = ROOM_DEFINITIONS[defId];
  const room: PlacedRoom = {
    id, defId, x, y, w: d.size[0], h: d.size[1], area: d.area, level: 1, state: 'built',
    buildRequired: d.buildReviews, buildProgress: d.buildReviews, cleanliness: 100, settings: {}, furniture, ...extra
  };
  state.rooms.push(room);
  return room;
}

function item(defId: string, slotKind: string, damaged = false): PlacedFurniture {
  return { id: nextFurnId++, defId, slotKind, damaged };
}

function student(id: number, seatRoomId: number, bedRoomId?: number): Character {
  return {
    id,
    name: `Student ${id}`,
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#6B4FBB', hat: 'cap' },
    personality: 'Curious',
    traits: [],
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    needs: { hunger: 90, rest: 40, leisure: 80, composure: 80, health: 100 },
    morale: 80,
    bedRoomId,
    seatRoomId,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  };
}

function classFurniture(splendid: boolean): PlacedFurniture[] {
  const base = [
    item('teachers_lectern', 'required:teachers_lectern'),
    item('orrery_globe', 'required:orrery_globe')
  ];
  if (!splendid) return base;
  // Each bookshelf is +3.5 quality in a classroom (Focus primary, Order secondary). 19 of them clear Splendid (Q >= 70).
  for (let i = 0; i < 19; i++) base.push(item('bookshelf', 'optional'));
  return base;
}

test('a Feather Bed dorm gives a higher Rest target than a Simple Cot dorm', () => {
  const state = createNewAcademy();
  const feather = place(state, 'dormitory', 40, 6, 0, [item('feather_bed', 'bed')]);
  const cot = place(state, 'dormitory', 41, 8, 0, [item('simple_cot', 'bed')]);
  const a = student(1, 0, feather.id);
  const b = student(2, 0, cot.id);
  state.characters.push(a, b);

  const featherTarget = AnkicasterEngine.restTarget(state, a);
  const cotTarget = AnkicasterEngine.restTarget(state, b);
  assert.ok(featherTarget > cotTarget, `feather ${featherTarget} should beat cot ${cotTarget}`);
  assert.ok(featherTarget > 25 && cotTarget > 25, 'a bed raises the Rest target above the no-bed floor');

  AnkicasterEngine.ringBell(state, []);
  assert.ok(a.needs.rest > b.needs.rest, 'the better bed leaves the resident more rested after a bell');
});

test('a Splendid classroom yields more essence than a Bare one', () => {
  const bell = (splendid: boolean) => {
    const state = createNewAcademy();
    const room = place(state, 'class_arcane', 50, 6, 0, classFurniture(splendid));
    const tier = calculateRoomQuality(room).tier;
    assert.equal(tier, splendid ? 'splendid' : 'bare');
    state.characters.push(student(3, room.id));
    const before = state.resources.insight;
    AnkicasterEngine.ringBell(state, []);
    return state.resources.insight - before;
  };
  const splendid = bell(true);
  const bare = bell(false);
  assert.ok(splendid > bare, `splendid ${splendid} should out-yield bare ${bare}`);
  assert.ok(bare > 0, 'a finished bare classroom still teaches');
});

test('a dirty room yields less than a clean one', () => {
  const harvest = (cleanliness: number) => {
    const state = createNewAcademy();
    const patch = state.rooms.find(r => r.defId === 'vegetable_patch')!;
    patch.cleanliness = cleanliness;
    state.resources.provisions = 0;
    AnkicasterEngine.ringBell(state, []);
    return state.resources.provisions;
  };
  const clean = harvest(100);
  const dirty = harvest(0);
  assert.ok(clean > dirty, `clean ${clean} should out-yield dirty ${dirty}`);
  assert.ok(dirty > 0, 'a dirty but finished plot still produces something');
});

test('an Unfinished room yields 0', () => {
  const state = createNewAcademy();
  const room = place(state, 'class_arcane', 60, 6, 0, []);
  state.characters.push(student(4, room.id));
  const before = state.resources.insight;
  AnkicasterEngine.ringBell(state, []);
  assert.equal(state.resources.insight, before, 'a classroom missing its required fixtures produces no essence');
  assert.equal(AnkicasterEngine.roomEfficiency(state, room), 0);
});

test('a damaged item counts half its stat points', () => {
  const dorm = (damaged: boolean): PlacedRoom => ({
    id: 1, defId: 'dormitory', x: 0, y: 0, w: 2, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {},
    furniture: [{ id: 1, defId: 'feather_bed', slotKind: 'bed', damaged }]
  });
  const intact = calculateRoomQuality(dorm(false)).q;
  const broken = calculateRoomQuality(dorm(true)).q;
  assert.ok(intact > 0);
  assert.equal(broken, intact / 2, 'GDD 17.1: damaged furniture is worth half, not nothing');
  assert.equal(FURNITURE_DEFINITIONS.feather_bed.stats.comfort, 3);
});

function teacher(id: number): Character {
  const t = student(id, 0);
  t.career = 'teacher';
  t.careerState = 'active';
  t.status = 'faculty';
  t.name = 'Teacher';
  return t;
}

function rich(state: FullGameState): FullGameState {
  state.mana = 100000;
  Object.assign(state.resources, { timber: 5000, stone: 5000, glass: 5000, cloth: 5000, provisions: 100 });
  return state;
}

test('a classroom with an appointed teacher is staffed at x1.0, and x0.5 without one', () => {
  const state = createNewAcademy();
  const room = place(state, 'class_arcane', 80, 6, 0, [
    item('teachers_lectern', 'required:teachers_lectern'),
    item('orrery_globe', 'required:orrery_globe')
  ]);
  assert.equal(AnkicasterEngine.roomEfficiencyDetail(state, room).staff, 0.5);
  const t = teacher(9);
  state.characters.push(t);
  AnkicasterEngine.syncWorkplaces(state);
  assert.equal(t.workplaceRoomId, room.id, 'appointing a teacher fills the classroom slot');
  assert.equal(AnkicasterEngine.roomEfficiencyDetail(state, room).staff, 1);
});

test('a Refectory seats two sittings and never feeds fewer people than having none', () => {
  const crowd = (withRef: boolean, cleanliness = 100) => {
    const state = rich(createNewAcademy());
    state.characters = Array.from({ length: 15 }, (_, i) => student(200 + i, 1));
    if (withRef) {
      place(state, 'refectory', 90, 6, 0, [
        item('long_table', 'required:long_table'),
        item('hearth', 'required:hearth')
      ], { cleanliness });
    }
    return state;
  };
  const clean = AnkicasterEngine.mealPlan(crowd(true, 100));
  assert.equal(ROOM_DEFINITIONS.refectory.capacity?.seats, 12);
  assert.equal(clean.seated, 15, '12 seats × 2 sittings at full efficiency seats all 15');
  assert.equal(clean.unfed, 0);
  const none = AnkicasterEngine.mealPlan(crowd(false));
  assert.equal(none.seated, 0);
  assert.equal(none.standing, 15, 'with no Refectory everyone who has food eats standing');
  const dirty = AnkicasterEngine.mealPlan(crowd(true, 0));
  assert.ok(dirty.seated + dirty.standing >= none.seated + none.standing, 'a dirty Refectory still feeds at least as many');
});

test('a blocked dorm gives Rest 25, and the room window shows that number', () => {
  const state = createNewAcademy();
  const open = place(state, 'dormitory', 40, 6, 0, [item('feather_bed', 'bed')]);
  const resident = student(1, 1, open.id);
  state.characters.push(resident);
  const openTarget = AnkicasterEngine.restTarget(state, resident);
  assert.ok(openTarget > 25);

  const unfinished = place(state, 'dormitory', 41, 7, 1, []);
  const bare = student(2, 1, unfinished.id);
  assert.equal(AnkicasterEngine.restTarget(state, bare), 25, 'an Unfinished bed room is not a bed');

  const far = place(state, 'dormitory', 42, 0, 3, [item('feather_bed', 'bed')]);
  const lost = student(3, 1, far.id);
  assert.equal(AnkicasterEngine.restTarget(state, lost), 25, 'an Unreachable dorm does not give Rest');

  open.lockedUntilReviewIndex = 80;
  assert.equal(AnkicasterEngine.restTarget(state, resident), 25, 'a Locked dorm does not give Rest');
  const html = renderToStaticMarkup(
    <RoomWindow
      state={state}
      room={open}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
    />
  );
  const shown = Math.round(AnkicasterEngine.restTargetForRoom(state, open));
  assert.equal(shown, 25);
  assert.ok(html.includes(`Rest target: ${shown}`), 'the room window shows the same Rest target');
});

test('a Kitchen with no adjacent Refectory works at 50%, not clamped to 80%', () => {
  const layout = (withRef: boolean) => {
    const state = createNewAcademy();
    state.rooms = state.rooms.filter(r => r.defId === 'entrance_hall' || r.area === 'grounds');
    const hall = state.rooms.find(r => r.defId === 'entrance_hall')!;
    hall.x = 0;
    hall.w = 2;
    place(state, 'kitchen', 70, 2, 0, [item('cooking_range', 'required:cooking_range')]);
    if (withRef) {
      place(state, 'refectory', 71, 3, 0, [
        item('long_table', 'required:long_table'),
        item('hearth', 'required:hearth')
      ]);
    }
    return AnkicasterEngine.roomEfficiency(state, state.rooms.find(r => r.defId === 'kitchen')!);
  };
  const alone = layout(false);
  const beside = layout(true);
  assert.ok(beside > 0 && alone > 0);
  assert.ok(Math.abs(alone - beside * 0.5) < 0.001, `alone ${alone} should be half of beside ${beside}`);
  assert.ok(alone < beside * 0.8, 'the 50% penalty is not clamped up to 80%');
});

test('a draft room stays locked until its blueprint is drafted, and an old save keeps one it already has', () => {
  const state = rich(createNewAcademy());
  const blocked = AnkicasterEngine.placeRoom(state, 'faculty_lounge');
  assert.equal(blocked.success, false);
  assert.match(blocked.error || '', /Blueprint locked/);
  assert.match(blocked.error || '', /card draws/);
  const drafted = AnkicasterEngine.chooseDraftCard(state, {
    id: 'lounge-plan',
    deck: 'foundation',
    rarity: 'common',
    name: 'Faculty Lounge Plan',
    type: 'blueprint',
    targetId: 'faculty_lounge',
    description: 'plan'
  });
  assert.ok(drafted.state.knownPlans.includes('faculty_lounge'));
  const placed = AnkicasterEngine.placeRoom(drafted.state, 'faculty_lounge');
  assert.equal(placed.success, true, placed.error);

  const old = rich(createNewAcademy());
  old.knownPlans = old.knownPlans.filter(id => id !== 'faculty_lounge');
  delete (old as { knownPlansVersion?: number }).knownPlansVersion;
  place(old, 'faculty_lounge', 77, 6, 0, []);
  const loaded = AnkicasterEngine.normalizeLoadedState(old);
  assert.ok(loaded.knownPlans.includes('faculty_lounge'), 'an existing draft room is remembered');
  const another = AnkicasterEngine.placeRoom(loaded, 'faculty_lounge');
  assert.equal(another.success, true, another.error);

  const menu = renderToStaticMarkup(<BuildMenuPanel state={createNewAcademy()} onPlaceRoom={() => {}} />);
  assert.ok(menu.includes('Find this blueprint in the card draws'));
  assert.ok(menu.includes('Earned from a milestone'), 'grant rooms say where the plan comes from');
});

