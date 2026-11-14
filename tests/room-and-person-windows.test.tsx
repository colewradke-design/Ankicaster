/**
 * Tests for the Room Window refactor (Room / Furnishings tabs + Room tab Staff assign/clear),
 * Person Card, canvas person hit-testing, activity sentences, and removal of mastery pips.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { requiredSlots } from '../src/utils/requiredFurniture.ts';
import { VisualWorld } from '../src/visual/world/VisualWorld.ts';
import { describePersonActivity } from '../src/visual/agents/personActivity.ts';
import type { VisualAgent } from '../src/visual/agents/Choreographer.ts';
import { PersonCard } from '../src/components/PersonCard.tsx';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import { RosterPanel } from '../src/components/GamePanels.tsx';
import type { Character, FullGameState, PlacedRoom, SchoolType } from '../src/types/ankicaster.ts';

const noop = () => {};

function baseState(): FullGameState {
  const s = createNewAcademy({ name: 'Rowan' });
  s.mana = 5000;
  s.resources = {
    ...s.resources,
    timber: 500,
    stone: 500,
    glass: 500,
    cloth: 500,
    provisions: 500,
    greens: 500
  };
  return s;
}

function defaultRequiredItemId(role: string): string {
  if (role.includes('_or_')) return role.split('_or_')[0];
  if (role === 'bed') return 'simple_cot';
  if (role === 'chair') return 'dining_bench';
  return role;
}

function addBuiltRoom(state: FullGameState, defId: string, x: number, y: number, level: 1 | 2 | 3 = 1): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  const reqs = requiredSlots(defId);
  const id = Math.max(0, ...state.rooms.map(r => r.id)) + 1;
  const room: PlacedRoom = {
    id,
    defId,
    x,
    y,
    w: def.size[0],
    h: def.size[1],
    area: def.area,
    state: 'built',
    buildRequired: 0,
    buildProgress: 0,
    level,
    cleanliness: 100,
    furniture: reqs.map((rf, idx) => ({
      id: id * 100 + idx + 1,
      defId: defaultRequiredItemId(rf.role),
      slotKind: `required:${rf.role}`,
      damaged: false,
      x: 24 + idx * 32,
      floor: 0,
      plane: 'floor' as const
    })),
    unplacedFurniture: [],
    settings: {}
  };
  state.rooms.push(room);
  return room;
}

function makeChar(overrides: Partial<Character> = {}): Character {
  return {
    id: overrides.id ?? 100,
    name: overrides.name ?? 'Lyra',
    pronouns: 'she/her',
    appearance: {
      skin: '#f0c7a4',
      hair: 'bob',
      hairColor: '#3b2b20',
      robeColor: '#3b5998',
      hat: 'pointed'
    },
    status: overrides.status ?? 'student',
    currentSchool: 'arcane',
    period: 2,
    masteredSchools: [],
    careerSetIds: [],
    morale: 84,
    needs: { hunger: 72, rest: 80, leisure: 70, composure: 75, health: 100 },
    personality: 'Bookish',
    traits: ['Early Bird', 'Curious'],
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    ...overrides
  };
}

test('RW-1: Master squares and zoomed school initials removed from doll and canvas labels; ready star & career label kept', () => {
  const dollSrc = fs.readFileSync(new URL('../src/visual/agents/doll.ts', import.meta.url), 'utf8');
  assert.ok(!dollSrc.includes('look.mastered.slice'), 'colored mastery squares removed from doll feet');

  const s = baseState();
  const dorm = addBuiltRoom(s, 'dormitory', 10, 0);
  const teacher = makeChar({
    id: 11,
    name: 'Maren',
    status: 'faculty',
    career: 'teacher',
    careerState: 'active',
    masteredSchools: ['arcane', 'nature'],
    bedRoomId: dorm.id
  });
  s.characters = [teacher];

  const world = new VisualWorld();
  world.setSnapshot(s);
  world.camera.setZoom(4);
  world.update(16);

  const labelKeys = [...world.overlayTexts.keys()];
  assert.ok(!labelKeys.some(k => k.startsWith('pips:')), 'zoomed-in school initials removed');
  assert.ok(labelKeys.includes('career:char-11'), 'close-zoom career label kept');
});

test('RW-2: VisualWorld.hitTestPerson hits doll (student/faculty/headmaster) before room behind it', () => {
  const s = baseState();
  const stu = makeChar({ id: 21, name: 'Bram', status: 'student', currentSchool: 'arcane', period: 1 });
  s.characters = [stu];

  const world = new VisualWorld();
  world.setSnapshot(s);
  world.camera.setViewportSize(1200, 800);
  world.update(16);

  const wizAgent = Array.from(world.choreographer.agents.values()).find(a => a.isWizard)!;
  assert.ok(wizAgent, 'wizard agent exists');
  const wx = Math.round(world.worldContainer.x + wizAgent.x * world.camera.zoom);
  const wy = Math.round(world.worldContainer.y + (wizAgent.y - 8) * world.camera.zoom);
  const hitWiz = world.hitTestPerson(wx, wy);
  assert.equal(hitWiz?.id, 'wizard', 'clicking Headmaster doll hits Headmaster before room');
  assert.ok(world.hitTestRoom(wx, wy) !== null, 'room is behind Headmaster at those coordinates');

  const stuAgent = world.choreographer.agents.get('char-21')!;
  assert.ok(stuAgent, 'student agent exists');
  const sx = Math.round(world.worldContainer.x + stuAgent.x * world.camera.zoom);
  const sy = Math.round(world.worldContainer.y + (stuAgent.y - 8) * world.camera.zoom);
  const hitStu = world.hitTestPerson(sx, sy);
  assert.equal(hitStu?.character?.id, 21, 'clicking student doll hits student');
});

test('RW-3: describePersonActivity produces exact natural sentences for all states and rooms', () => {
  const s = baseState();
  s.bellIndex = 1; // Period 2 (bellIndex % 5 === 1)
  const lightClass = addBuiltRoom(s, 'class_light', 6, 0);
  const kitchen = addBuiltRoom(s, 'kitchen', 6 + lightClass.w, 0);
  const library = addBuiltRoom(s, 'library', 6 + lightClass.w + kitchen.w, 0);
  const garden = addBuiltRoom(s, 'courtyard_garden', 2, 0);
  const dorm = addBuiltRoom(s, 'dormitory', 1, 0);
  const refectory = addBuiltRoom(s, 'refectory', 0, 0);
  addBuiltRoom(s, 'infirmary', 20, 0);

  const student = makeChar({ id: 30, status: 'student', currentSchool: 'light', period: 2, bedRoomId: dorm.id, classRoomId: lightClass.id });
  const teacher = makeChar({ id: 31, status: 'faculty', career: 'teacher', careerState: 'active', masteredSchools: ['light'], workplaceRoomId: lightClass.id });
  const cook = makeChar({ id: 32, status: 'faculty', career: 'healer', careerState: 'active', workplaceRoomId: kitchen.id });
  const awayHero = makeChar({ id: 33, status: 'away', career: 'adventurer', careerState: 'active' });
  const injuredStu = makeChar({ id: 34, status: 'student', injury: { type: 'sprained', points: 10, required: 100 } });
  s.characters = [student, teacher, cook, awayHero, injuredStu];

  const baseAgent = (over: Partial<VisualAgent>): VisualAgent => ({
    id: 'a',
    isWizard: false,
    name: 'X',
    x: 0,
    y: 0,
    targetX: 0,
    targetY: 0,
    currentFloor: 0,
    targetFloor: 0,
    facing: 'R',
    anim: 'idle',
    animFrame: 0,
    animTimer: 0,
    activity: 'free_time',
    targetRoomId: lightClass.id,
    path: [],
    pathIndex: 0,
    robeColor: '#3b5998',
    hat: 'pointed',
    hair: 'bob',
    hairColor: '#3b2b20',
    skin: '#f0c7a4',
    ...over
  });

  // Walking between rooms
  assert.equal(
    describePersonActivity(
      baseAgent({ anim: 'walk', path: [{ id: 'n1', roomId: kitchen.id, x: 10, y: 0, floor: 0, kind: 'room_floor' }], targetRoomId: kitchen.id }),
      cook,
      s
    ),
    'Walking to the Kitchen.'
  );

  // Class, teacher, headmaster cover, headmaster orb
  assert.equal(
    describePersonActivity(baseAgent({ activity: 'class', lastBlockKey: 'class:p2', targetRoomId: lightClass.id }), student, s),
    'In class, period 2, at a desk in the Dawn Classroom.'
  );
  assert.equal(
    describePersonActivity(baseAgent({ activity: 'work', lastBlockKey: 'class:p2', targetRoomId: lightClass.id }), teacher, s),
    'Teaching the Dawn Classroom, period 2.'
  );
  assert.equal(
    describePersonActivity(baseAgent({ isWizard: true, activity: 'work', wizardErrand: 'teach', lastBlockKey: 'class:p2', targetRoomId: lightClass.id }), 'wizard', s),
    'Teaching the Dawn Classroom, period 2.'
  );
  assert.equal(
    describePersonActivity(baseAgent({ isWizard: true, wizardErrand: 'ponder', targetRoomId: s.rooms[0].id }), 'wizard', s),
    'Pondering the orb.'
  );

  // Workplace job
  assert.equal(
    describePersonActivity(baseAgent({ activity: 'work', targetRoomId: kitchen.id }), cook, s),
    'Working in the Kitchen.'
  );

  // Meal
  assert.equal(
    describePersonActivity(baseAgent({ activity: 'meal', targetRoomId: refectory.id }), student, s),
    'Eating in the Refectory.'
  );
  assert.equal(
    describePersonActivity(baseAgent({ activity: 'meal', targetRoomId: dorm.id }), student, s),
    'Eating a packed meal.'
  );

  // Sleep
  assert.equal(
    describePersonActivity(baseAgent({ activity: 'sleep', targetRoomId: dorm.id }), student, s),
    'Sleeping in the Dormitory.'
  );

  // Free time room-specific phrases
  assert.equal(
    describePersonActivity(baseAgent({ activity: 'free_time', anim: 'sit_study', targetRoomId: library.id }), student, s),
    'Reading in the Library.'
  );
  assert.equal(
    describePersonActivity(baseAgent({ activity: 'free_time', anim: 'idle', targetRoomId: garden.id }), student, s),
    'In the garden.'
  );

  // Away and injured stay factual
  assert.equal(describePersonActivity(undefined, awayHero, s), 'Away from the academy.');
  const expState: FullGameState = {
    ...s,
    expeditions: [{
      id: 1,
      destinationId: 'mossy_hollow',
      teamIds: [awayHero.id],
      suppliesTaken: [],
      partySkillDays: 40,
      chance: 0.9,
      fortune: 0.5,
      roll: 0.2,
      wrongRoll: 0.9,
      requiredReviews: 50,
      progressReviews: 0,
      state: 'active'
    }]
  };
  assert.equal(describePersonActivity(undefined, awayHero, expState), 'On a Rift expedition to Mossy Hollow.');
  assert.match(describePersonActivity(undefined, injuredStu, s), /Recovering in the Infirmary/);
});

test('RW-4: PersonCard renders compact read-only fields and omits blank rows', () => {
  const s = baseState();
  const dorm = addBuiltRoom(s, 'dormitory', 1, 0);
  const arcaneClass = addBuiltRoom(s, 'class_arcane', 6, 0);
  const library = addBuiltRoom(s, 'library', 6 + arcaneClass.w, 0);
  s.wizard.foundingSchool = 'arcane' as SchoolType;
  s.wizard.levels.arcane = 2;

  const stu = makeChar({
    id: 40,
    name: 'Tamsin',
    status: 'student',
    currentSchool: 'arcane',
    period: 3,
    bedRoomId: dorm.id,
    classRoomId: arcaneClass.id,
    personality: 'Bookish',
    traits: ['Focused']
  });
  const sabFaculty = makeChar({
    id: 41,
    name: 'Orin',
    status: 'faculty',
    career: 'scholar',
    careerState: 'sabbatical',
    masteredSchools: ['arcane', 'alchemy'],
    workplaceRoomId: library.id,
    injury: { type: 'hexed', points: 5, required: 100 }
  });
  s.characters = [stu, sabFaculty];

  const stuHtml = renderToStaticMarkup(<PersonCard state={s} personId={stu.id} onClose={noop} />);
  assert.ok(stuHtml.includes('Tamsin'));
  assert.ok(stuHtml.includes('Arcane · Period 3 · Student'));
  assert.ok(stuHtml.includes('Morale'));
  assert.ok(stuHtml.includes('Hunger'));
  assert.ok(stuHtml.includes('Bookish · Focused'));
  assert.ok(stuHtml.includes('Dormitory'));
  assert.ok(stuHtml.includes(ROOM_DEFINITIONS.class_arcane.name));
  assert.ok(!stuHtml.includes('person-mastered'), 'student with no mastered schools hides mastered row');
  assert.ok(!stuHtml.includes('person-workplace'), 'student with no workplace hides workplace row');
  assert.ok(!stuHtml.includes('person-injury'), 'healthy student hides injury row');
  assert.ok(!stuHtml.includes('Demolish') && !stuHtml.includes('Career Appointment'), 'no room/career actions on PersonCard');

  const facHtml = renderToStaticMarkup(<PersonCard state={s} personId={sabFaculty.id} onClose={noop} />);
  assert.ok(facHtml.includes('Scholar · On leave'), 'sabbatical shows On leave');
  assert.ok(facHtml.includes('Arcane, Alchemy'), 'mastered schools listed by name');
  assert.ok(facHtml.includes('Library'));
  assert.ok(facHtml.includes('Hexed'));
  assert.ok(!facHtml.includes('person-bed'), 'blank bed left off, not shown as none');

  const wizHtml = renderToStaticMarkup(<PersonCard state={s} personId="wizard" onClose={noop} />);
  assert.ok(wizHtml.includes('Headmaster · Arcane Lv 2'));
});

test('RW-5: RoomWindow splits cleanly into Room and Furnishings tabs, removes Info/second Move&Demolish/details, hides complete required box', () => {
  const s = baseState();
  const refectory = addBuiltRoom(s, 'refectory', 6, 0, 1);
  // 1. Complete built room on Room tab
  const roomHtml = renderToStaticMarkup(
    <RoomWindow state={s} room={refectory} onClose={noop} onOpenScreen={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} onMove={noop} onDemolish={noop} />
  );
  assert.equal((roomHtml.match(/aria-label="Move room"/g) || []).length, 1, 'exactly one Move button in header');
  assert.equal((roomHtml.match(/aria-label="Demolish room"/g) || []).length, 1, 'exactly one Demolish button in header');
  assert.ok(!roomHtml.includes('All installed'), 'no All installed placeholder');
  assert.ok(!roomHtml.includes('data-testid="required-fixtures"'), 'required fixtures hidden when complete');
  assert.ok(!/<details[\s>]/.test(roomHtml), 'no Room details drawer');
  assert.ok(roomHtml.includes('data-testid="room-description"'), 'description shown directly on Room tab');
  assert.ok(!roomHtml.includes(ROOM_DEFINITIONS.refectory.level3Perk!), 'Lv 3 perk hidden at Lv 1');

  // Level 3 shows perk on Room tab
  const refectoryLv3 = { ...refectory, level: 3 as const };
  const lv3Html = renderToStaticMarkup(
    <RoomWindow state={s} room={refectoryLv3} onClose={noop} onOpenScreen={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} />
  );
  assert.ok(lv3Html.includes(ROOM_DEFINITIONS.refectory.level3Perk!), 'Lv 3 perk shown once room is Lv 3');

  // 2. Missing required fixture shows Required fixtures box on Room tab
  const unfinishedRefectory = { ...refectory, furniture: [] };
  const unfinishedHtml = renderToStaticMarkup(
    <RoomWindow state={s} room={unfinishedRefectory} onClose={noop} onOpenScreen={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} />
  );
  assert.ok(unfinishedHtml.includes('data-testid="required-fixtures"'), 'required fixtures shown while incomplete');

  // 3. Furnishings tab: single-column layout, Now and next copy, Renovate hidden at Lv 3
  const furnLv1 = renderToStaticMarkup(
    <RoomWindow state={s} room={refectory} initialTab="furnishings" onClose={noop} onOpenScreen={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} />
  );
  assert.ok(furnLv1.includes('Bare. Optional slots as built.'));
  assert.ok(furnLv1.includes('Cozy. +2 optional slots, and the room works better.'));
  assert.ok(furnLv1.includes('data-tour="room-renovate"'));
  assert.ok(!furnLv1.includes('md:grid-cols-2'), 'no two-column furnishings grid');

  const furnLv3 = renderToStaticMarkup(
    <RoomWindow state={s} room={refectoryLv3} initialTab="furnishings" onClose={noop} onOpenScreen={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} />
  );
  assert.ok(furnLv3.includes('This room is finished.'));
  assert.ok(!furnLv3.includes('data-tour="room-renovate"'), 'Renovate button gone at Lv 3');

  // 4. Construction site hides description/actions/staff and furnishings lists
  const siteRoom: PlacedRoom = { ...refectory, state: 'site', buildRequired: 30, buildProgress: 10, furniture: [] };
  const siteRoomHtml = renderToStaticMarkup(
    <RoomWindow state={s} room={siteRoom} onClose={noop} onOpenScreen={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} onTogglePause={noop} />
  );
  assert.ok(!siteRoomHtml.includes('data-testid="room-description"'));
  assert.ok(!siteRoomHtml.includes('data-testid="room-staff"'));
  assert.ok(siteRoomHtml.includes('Pause'));
  const siteFurnHtml = renderToStaticMarkup(
    <RoomWindow state={s} room={siteRoom} initialTab="furnishings" onClose={noop} onOpenScreen={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} />
  );
  assert.ok(siteFurnHtml.includes('Furnishings arrive when the room is built.'));
});

test('RW-6: Room staff assign/clear override, replacement guard, classroom school filter, and RosterPanel picker removal', () => {
  const s = baseState();
  // Connect floor-0 rooms contiguously from Wizard's Study (x=5..6)
  let nextX = 6;
  const arcaneClass1 = addBuiltRoom(s, 'class_arcane', nextX, 0);
  nextX += arcaneClass1.w;
  const arcaneClass2 = addBuiltRoom(s, 'class_arcane', nextX, 0);
  nextX += arcaneClass2.w;
  const lightClass = addBuiltRoom(s, 'class_light', nextX, 0);
  nextX += lightClass.w;
  const dorm = addBuiltRoom(s, 'dormitory', nextX, 0);
  nextX += dorm.w;

  const tArc1 = makeChar({
    id: 50,
    name: 'Selene',
    status: 'faculty',
    career: 'teacher',
    careerState: 'active',
    masteredSchools: ['arcane'],
    workplaceRoomId: arcaneClass1.id
  });
  const tArc2 = makeChar({
    id: 51,
    name: 'Cyrus',
    status: 'faculty',
    career: 'teacher',
    careerState: 'active',
    masteredSchools: ['arcane'],
    workplaceRoomId: arcaneClass2.id
  });
  const tLight = makeChar({
    id: 52,
    name: 'Vesper',
    status: 'faculty',
    career: 'teacher',
    careerState: 'active',
    masteredSchools: ['light'],
    workplaceRoomId: lightClass.id
  });
  s.characters = [tArc1, tArc2, tLight];

  // Full slot rejects assign without explicit replaceCharId (no silent bump)
  const silentBump = AnkicasterEngine.assignRoomStaff(s, arcaneClass1.id, tArc2.id);
  assert.equal(silentBump.success, false, 'full workplace refuses assignment without explicit replacement');

  // Unmastered school rejected
  const wrongSchool = AnkicasterEngine.assignRoomStaff(s, arcaneClass1.id, tLight.id, tArc1.id);
  assert.equal(wrongSchool.success, false, 'teacher who has not mastered school is rejected');

  // Explicit replacement swaps cleanly and moves replaced teacher to next open qualifying room
  const replaceRes = AnkicasterEngine.assignRoomStaff(s, arcaneClass1.id, tArc2.id, tArc1.id);
  assert.equal(replaceRes.success, true);
  assert.equal(replaceRes.state.characters.find(c => c.id === tArc2.id)!.workplaceRoomId, arcaneClass1.id);
  assert.equal(replaceRes.state.characters.find(c => c.id === tArc1.id)!.workplaceRoomId, arcaneClass2.id);

  // Clear when other room is already occupied falls back to the cleared room
  const clearFullOther = AnkicasterEngine.clearRoomStaff(replaceRes.state, arcaneClass2.id, tArc1.id);
  assert.equal(clearFullOther.success, true);
  assert.equal(clearFullOther.state.characters.find(c => c.id === tArc1.id)!.workplaceRoomId, arcaneClass2.id, 'falls back to cleared room if other qualifying room is occupied');

  // Clear when another open qualifying room exists moves teacher to that open room
  const stateWithOpenThird = structuredClone(replaceRes.state);
  const arcaneClass3 = addBuiltRoom(stateWithOpenThird, 'class_arcane', nextX, 0);
  const clearToOpen = AnkicasterEngine.clearRoomStaff(stateWithOpenThird, arcaneClass2.id, tArc1.id);
  assert.equal(clearToOpen.success, true);
  assert.equal(clearToOpen.state.characters.find(c => c.id === tArc1.id)!.workplaceRoomId, arcaneClass3.id, 'Clear moves staff to next open qualifying room');

  // Verify room staff UI on Room tab shows clickable portraits, Replace option when full, filters out tLight
  const fullHtml = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={arcaneClass1}
      initialAssignOpen
      onClose={noop}
      onOpenScreen={noop}
      onOpenPerson={noop}
      onAssignStaff={noop}
      onClearStaff={noop}
      onResolveHazard={noop}
      onUpgrade={noop}
      onAddFurniture={noop}
      onRemoveFurniture={noop}
    />
  );
  assert.ok(fullHtml.includes('1 / 1'));
  assert.ok(fullHtml.includes('Selene'));
  assert.ok(fullHtml.includes('Replace Selene'));
  assert.ok(!fullHtml.includes('Vesper'), 'Light-only teacher excluded from Arcane Classroom Assign list');

  // Dormitory has no workplace -> no staff block
  const dormHtml = renderToStaticMarkup(
    <RoomWindow state={s} room={dorm} onClose={noop} onOpenScreen={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} />
  );
  assert.ok(!dormHtml.includes('data-testid="room-staff"'));

  // Clear on sole open qualifying room keeps worker there via auto sync
  const soleState = baseState();
  const singleHerb = addBuiltRoom(soleState, 'greenhouse', 6, 0);
  const gardener = makeChar({ id: 60, name: 'Moss', status: 'faculty', career: 'gardener', careerState: 'active', workplaceRoomId: singleHerb.id });
  soleState.characters = [gardener];
  const soleClear = AnkicasterEngine.clearRoomStaff(soleState, singleHerb.id, gardener.id);
  assert.equal(soleClear.success, true);
  assert.equal(soleClear.state.characters[0].workplaceRoomId, singleHerb.id, 'sole open qualifying room re-assigns via auto');

  // Headmaster is not a staff slot
  const studyRoom = s.rooms.find(r => r.defId === 'wizard_study')!;
  const studyHtml = renderToStaticMarkup(
    <RoomWindow state={s} room={studyRoom} onClose={noop} onOpenScreen={noop} onOpenPerson={noop} onResolveHazard={noop} onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} />
  );
  assert.ok(studyHtml.includes('data-testid="study-wizard-portrait-btn"'), 'Headmaster portrait is clickable in Study');
  assert.ok(!studyHtml.includes('data-testid="room-staff"'), 'Study has no Staff job block');

  // RosterPanel has no teacher-classroom-picker
  const rosterHtml = renderToStaticMarkup(
    <RosterPanel state={s} view="faculty" onAssignCareer={noop} />
  );
  assert.ok(!rosterHtml.includes('teacher-classroom-picker'), 'RosterPanel no longer renders teacher-classroom-picker');

  // syncWorkplaces preserves valid placements cleanly
  AnkicasterEngine.syncWorkplaces(s);
  assert.equal(s.characters.find(c => c.id === tArc1.id)!.workplaceRoomId, arcaneClass1.id);
});
