import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AnkicasterEngine } from '../src/utils/engine.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import { isRoomUnfinished } from '../src/utils/requiredFurniture.ts';
import {
  buildAcademySchedule,
  buildMealSittings,
  classroomDeskCount,
  getDayBlock,
  getStudentDelaySource,
  libraryReaderCapacity,
  refectoryChairCount,
  resolveAcademyLocalHours
} from '../src/utils/schedule.ts';
import { calculateTeacherDelay } from '../src/utils/formulas.ts';
import { computeReachability } from '../src/utils/reachability.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { getGroundY, roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';
import { buildRoomAnchors, findBuilderSiteEdgeAnchor } from '../src/visual/layout/roomAnchors.ts';
import { Choreographer, conversationChance } from '../src/visual/agents/Choreographer.ts';
import { RosterPanel } from '../src/components/GamePanels.tsx';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import type { Character, FullGameState, PlacedFurniture, PlacedRoom, SchoolType } from '../src/types/ankicaster.ts';

let nextFurnId = 90000;

function furn(defId: string, slotKind = 'optional', damaged = false): PlacedFurniture {
  return { id: nextFurnId++, defId, slotKind, damaged };
}

function makeRoom(
  id: number,
  defId: string,
  x: number,
  y: number,
  area: 'castle' | 'grounds' = 'castle',
  furniture?: PlacedFurniture[],
  overrides: Partial<PlacedRoom> = {}
): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  const defaultFurn =
    furniture ??
    (def.requiredFurniture || []).map(req => furn(req.role, `required:${req.role}`));
  return {
    id,
    defId,
    x,
    y,
    w: def.size[0],
    h: def.size[1],
    area,
    level: 1,
    state: 'built',
    buildRequired: 0,
    buildProgress: 0,
    cleanliness: 100,
    settings: {},
    furniture: defaultFurn,
    ...overrides
  };
}

function makeChar(id: number, overrides: Partial<Character> = {}): Character {
  return {
    id,
    name: `Char ${id}`,
    pronouns: 'they/them',
    appearance: {
      skin: '#F0C8A0',
      hair: 'short_messy',
      hairColor: '#3A2318',
      robeColor: '#6B4FBB',
      hat: 'pointed'
    },
    personality: 'Curious',
    traits: [],
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    needs: { hunger: 90, rest: 90, leisure: 90, composure: 90, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: [],
    ...overrides
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const val of Object.values(obj as Record<string, unknown>)) {
      deepFreeze(val);
    }
  }
  return obj;
}

function setupBasicAcademy(): FullGameState {
  const s = createNewAcademy();
  s.mana = 5000;
  s.resources = {
    ...s.resources,
    timber: 1000,
    stone: 1000,
    glass: 200,
    cloth: 200,
    provisions: 500,
    insight: 0,
    radiance: 50
  };
  s.wizard.levels = { arcane: 6, nature: 6, light: 6, shadow: 6, alchemy: 6 };
  s.knownPatterns = [
    ...s.knownPatterns,
    'student_desk',
    'writing_desk',
    'reading_desk',
    'long_table',
    'bookshelf'
  ];
  return s;
}

test('Section 1 & 2: real local clock timetable, staggered offsets, and bells do not drive sprite destinations', () => {
  assert.deepEqual(getDayBlock(6.25), { kind: 'period', period: 1, hourStart: 6 });
  assert.deepEqual(getDayBlock(7.5), { kind: 'break', afterPeriod: 1, hourStart: 7 });
  assert.deepEqual(getDayBlock(8.0), { kind: 'period', period: 2, hourStart: 8 });
  assert.deepEqual(getDayBlock(9.9), { kind: 'break', afterPeriod: 2, hourStart: 9 });
  assert.deepEqual(getDayBlock(10.5), { kind: 'period', period: 3, hourStart: 10 });
  assert.deepEqual(getDayBlock(11.1), { kind: 'break', afterPeriod: 3, hourStart: 11 });
  assert.deepEqual(getDayBlock(12.8), { kind: 'period', period: 4, hourStart: 12 });
  assert.deepEqual(getDayBlock(13.2), { kind: 'meal', meal: 'lunch', sitting: 'A', hourStart: 13 });
  assert.deepEqual(getDayBlock(13.7), { kind: 'meal', meal: 'lunch', sitting: 'B', hourStart: 13 });
  assert.deepEqual(getDayBlock(16.0), { kind: 'afternoon', hourStart: 14 });
  assert.deepEqual(getDayBlock(18.1), { kind: 'meal', meal: 'supper', sitting: 'A', hourStart: 18 });
  assert.deepEqual(getDayBlock(18.8), { kind: 'meal', meal: 'supper', sitting: 'B', hourStart: 18 });
  assert.deepEqual(getDayBlock(20.5), { kind: 'evening', hourStart: 19 });
  assert.deepEqual(getDayBlock(23.2), { kind: 'night', hourStart: 22 });
  assert.deepEqual(getDayBlock(3.5), { kind: 'night', hourStart: 22 });

  const s = setupBasicAcademy();
  const lib = makeRoom(10, 'library', 1, 0, 'castle');
  const common = makeRoom(11, 'common_room', 6, 0, 'castle');
  const ref = makeRoom(12, 'refectory', 8, 0, 'castle');
  s.rooms.push(lib, common, ref);
  const c1 = makeChar(101, { personality: 'Bookish', traits: ['Well-Read'] });
  const c2 = makeChar(102, { personality: 'Social' });
  s.characters.push(c1, c2);

  // Noon/afternoon visit without any bells still uses real clock (and 5th bell does not force Refectory)
  s.debugTimeHours = 15.5;
  s.bellIndex = 5;
  const groundY = getGroundY(3);
  const nav = new NavGraph(s.rooms, groundY);
  const chor = new Choreographer(nav, groundY);
  chor.reachability = computeReachability(s.rooms);
  chor.syncState(s, chor.reachability);
  chor.tick(100, s, true);

  assert.equal((chor as unknown as Record<string, unknown>).triggerMealWindow, undefined, '5th bell meal stampede removed');
  const a1 = chor.agents.get('char-101')!;
  const a2 = chor.agents.get('char-102')!;
  assert.notEqual(a1.activity, 'meal', 'bellIndex = 5 does not override afternoon free time');
  assert.notEqual(a2.activity, 'meal');

  // resolveAcademyLocalHours falls back cleanly to Date when debugTimeHours and visualTime are unset
  const plain = createNewAcademy();
  const sampleMs = new Date(2026, 0, 1, 14, 30, 0, 0).getTime();
  assert.ok(Math.abs(resolveAcademyLocalHours(plain, sampleMs) - 14.5) < 1e-6);
});

test('Section 3 & 10: Desks 1-4, required desk, 4 desks + bookshelf fit, stable period packing & overenrollment UI', () => {
  const s = setupBasicAcademy();
  // Unfinished classroom without student_desk provides 0 desks and 0 capacity
  const unfinishedClass = makeRoom(20, 'class_arcane', 1, 0, 'castle', [
    furn('teachers_lectern', 'required:teachers_lectern'),
    furn('orrery_globe', 'required:orrery_globe')
  ]);
  s.rooms.push(unfinishedClass);
  assert.equal(isRoomUnfinished(unfinishedClass), true);
  assert.equal(classroomDeskCount(unfinishedClass), 0);
  let sched = buildAcademySchedule(s);
  assert.equal(sched.schoolCapacity.arcane, 0);

  // Installing required student_desk makes room active with 1 desk (capacity 4)
  unfinishedClass.furniture.push(furn('student_desk', 'required:student_desk'));
  assert.equal(isRoomUnfinished(unfinishedClass), false);
  assert.equal(classroomDeskCount(unfinishedClass), 1);

  // addFurniture allows adding 3 more optional desks (total 4) PLUS a bookshelf (5 optional slots)
  let cur = structuredClone(s);
  for (let i = 0; i < 3; i++) {
    const r = AnkicasterEngine.addFurniture(cur, unfinishedClass.id, 'student_desk');
    assert.equal(r.success, true, `Adding optional student_desk #${i + 2} should succeed`);
    cur = r.state;
  }
  const fail5th = AnkicasterEngine.addFurniture(cur, unfinishedClass.id, 'student_desk');
  assert.equal(fail5th.success, false, 'Cannot place 5th student_desk in one classroom');
  const addShelf = AnkicasterEngine.addFurniture(cur, unfinishedClass.id, 'bookshelf');
  assert.equal(addShelf.success, true, 'Well-Read bookshelf still fits alongside 4 desks');
  cur = addShelf.state;

  const builtClass = cur.rooms.find(r => r.id === unfinishedClass.id)!;
  assert.equal(classroomDeskCount(builtClass), 4);

  // Enroll 17 arcane students: first 16 fill P1..P4 (4 per period), 17th is overenrolled
  for (let i = 1; i <= 17; i++) {
    cur.characters.push(makeChar(1000 + i, { status: 'student', currentSchool: 'arcane' }));
  }
  AnkicasterEngine.syncWorkplaces(cur);
  sched = buildAcademySchedule(cur);
  assert.equal(sched.schoolCapacity.arcane, 16);
  assert.equal(sched.overenrolledBySchool.arcane, 1);

  const p1Students = cur.characters.filter(c => c.period === 1);
  const p4Students = cur.characters.filter(c => c.period === 4);
  const s17 = cur.characters.find(c => c.id === 1017)!;
  assert.equal(p1Students.length, 4);
  assert.equal(p4Students.length, 4);
  assert.equal(s17.classRoomId, undefined);
  assert.equal(s17.period, undefined);
  assert.equal(s17.seatRoomId, undefined);

  // RosterPanel shows overenrolled banner and Period badges
  const html = renderToStaticMarkup(
    <RosterPanel state={cur} onAssignCareer={() => {}} view="students" />
  );
  assert.ok(html.includes('overenrolled-banner'), 'RosterPanel displays overenrolled warning banner');
  assert.ok(html.includes('No Period (Overenrolled)'), 'RosterPanel displays No Period (Overenrolled) on overflow student');
  assert.ok(html.includes('Period 1'), 'RosterPanel displays Period 1 on seated student');

  // During Period 1 (06:20), ONLY Period 1 students attend class_arcane; P2-4 & 17th use free time
  cur.debugTimeHours = 6.3;
  const common = makeRoom(21, 'common_room', 6, 0, 'castle');
  cur.rooms.push(common);
  const groundY = getGroundY(3);
  const chor = new Choreographer(new NavGraph(cur.rooms, groundY), groundY);
  chor.reachability = computeReachability(cur.rooms);
  chor.syncState(cur, chor.reachability);
  chor.tick(100, cur, true);

  for (const st of cur.characters) {
    const ag = chor.agents.get(`char-${st.id}`)!;
    if (st.period === 1) {
      assert.equal(ag.targetRoomId, builtClass.id, `Period 1 student ${st.id} attends class during Period 1`);
      assert.equal(ag.activity, 'class');
    } else {
      assert.notEqual(ag.activity, 'class', `Non-Period-1 student ${st.id} (period=${st.period}) is NOT in class`);
    }
  }
});

test('Section 4: teacher assignment, sharing 1 room P1-2 / P3-4, spare teachers, empty period, and skip away/injured/sabbatical', () => {
  const s = setupBasicAcademy();
  const c1 = makeRoom(30, 'class_arcane', 1, 0, 'castle'); // 1 desk
  s.rooms.push(c1);

  // 5 arcane students => P1..P4 each have >=1 student (P1 has 1, P2 has 1, P3 has 1, P4 has 1, 5th overenrolled)
  for (let i = 1; i <= 4; i++) {
    s.characters.push(makeChar(200 + i, { status: 'student', currentSchool: 'arcane' }));
  }

  // Two Arcane teachers share c1: A takes P1-2, B takes P3-4, 3rd teacher C is spare
  const tA = makeChar(10, { status: 'faculty', career: 'teacher', careerState: 'active', masteredSchools: ['arcane'] });
  const tB = makeChar(11, { status: 'faculty', career: 'teacher', careerState: 'active', masteredSchools: ['arcane'] });
  const tC = makeChar(12, { status: 'faculty', career: 'teacher', careerState: 'active', masteredSchools: ['arcane'] });
  s.characters.push(tA, tB, tC);

  const sched = buildAcademySchedule(s);
  assert.deepEqual(sched.teacherAssignments.get(10)?.periods, [1, 2]);
  assert.deepEqual(sched.teacherAssignments.get(11)?.periods, [3, 4]);
  assert.equal(sched.teacherAssignments.has(12), false, '3rd teacher is spare');
  assert.ok(sched.spareTeacherIds.has(12));

  // Period 1 (06:20): only Teacher A goes to lectern; Teacher B and spare C are on free time
  const lib = makeRoom(31, 'library', 6, 0, 'castle');
  s.rooms.push(lib);
  const groundY = getGroundY(3);
  const chor = new Choreographer(new NavGraph(s.rooms, groundY), groundY);
  chor.reachability = computeReachability(s.rooms);
  s.debugTimeHours = 6.3;
  chor.syncState(s, chor.reachability);
  chor.tick(100, s, true);
  assert.equal(chor.agents.get('char-10')!.activity, 'class', 'Teacher A teaches Period 1');
  assert.notEqual(chor.agents.get('char-11')!.activity, 'class', 'Teacher B does not teach Period 1');
  assert.notEqual(chor.agents.get('char-12')!.activity, 'class', 'Spare Teacher C is on free time');

  // Period 3 (10:20): only Teacher B goes to lectern; Teacher A is on free time
  s.debugTimeHours = 10.3;
  chor.tick(100, s, true);
  assert.notEqual(chor.agents.get('char-10')!.activity, 'class', 'Teacher A off-duty Period 3');
  assert.equal(chor.agents.get('char-11')!.activity, 'class', 'Teacher B teaches Period 3');

  // Remove Period 4 student so Period 4 is empty: Teacher B should NOT be called to lectern during Period 4
  s.characters = s.characters.filter(c => c.id !== 204);
  s.debugTimeHours = 12.3;
  chor.syncState(s, chor.reachability);
  chor.tick(100, s, true);
  assert.notEqual(chor.agents.get('char-11')!.activity, 'class', 'Empty Period 4 does not call teacher to lectern');

  // If Teacher A becomes injured and Teacher B goes on sabbatical, spare Teacher C takes full c1 across P1-4!
  tA.injury = { type: 'sprained', points: 0, required: 10 };
  tB.careerState = 'sabbatical';
  const rebuilt = buildAcademySchedule(s);
  assert.equal(rebuilt.teacherAssignments.get(10), undefined, 'injured teacher excluded');
  assert.equal(rebuilt.teacherAssignments.get(11), undefined, 'sabbatical teacher excluded');
  assert.deepEqual(rebuilt.teacherAssignments.get(12)?.periods, [1, 2, 3, 4], 'spare teacher promoted');
});

test('Section 5: Headmaster coverage (<=1 uncovered classroom lv>=5), orb pondering on breaks, delay & RoomWindow', () => {
  const s = setupBasicAcademy();
  s.wizard.levels = { arcane: 5, nature: 8, light: 5, shadow: 4, alchemy: 2 };
  s.wizard.activeSession = {
    id: 1,
    kind: 'orb',
    school: 'arcane',
    targetLevel: 6,
    progress: 0,
    required: 20,
    costPaid: 50,
    state: 'active'
  };

  const cArc = makeRoom(40, 'class_arcane', 1, 0, 'castle');
  const cNat = makeRoom(41, 'class_nature', 6, 0, 'castle');
  const cSha = makeRoom(42, 'class_shadow', 8, 0, 'castle');
  s.rooms.push(cArc, cNat, cSha);

  s.characters.push(
    makeChar(301, { status: 'student', currentSchool: 'arcane' }),
    makeChar(302, { status: 'student', currentSchool: 'nature' }),
    makeChar(303, { status: 'student', currentSchool: 'shadow' })
  );

  // Headmaster prefers Nature (level 8 > Arcane 5; Shadow is level 4 < 5 so ineligible)
  const sched = buildAcademySchedule(s);
  assert.equal(sched.headmasterRoomId, cNat.id, 'Headmaster picks highest wizard level (Nature lv 8)');
  assert.equal(sched.classrooms.get(cNat.id)?.coveredByHeadmaster, true);
  assert.equal(sched.classrooms.get(cArc.id)?.coveredByHeadmaster, false);
  assert.equal(sched.classrooms.get(cSha.id)?.coveredByHeadmaster, false);

  // Room efficiency: Headmaster covered classroom counts as staffed (staff = 1.0)
  assert.equal(AnkicasterEngine.roomEfficiencyDetail(s, cNat).staff, 1);
  assert.equal(AnkicasterEngine.roomEfficiencyDetail(s, cArc).staff, 0.5);

  // Delay calculation: Nature student gets Wizard delay (20 - 2*(8-5) = 14); Shadow student gets uncovered delay (30)
  const natDelaySrc = getStudentDelaySource(s, sched, s.characters[1]);
  const arcDelaySrc = getStudentDelaySource(s, sched, s.characters[0]);
  assert.equal(natDelaySrc.teacherType, 'wizard');
  assert.equal(calculateTeacherDelay(natDelaySrc.teacherType, natDelaySrc.teacherIvls, 8, 5), 14);
  assert.equal(arcDelaySrc.teacherType, 'none');
  assert.equal(calculateTeacherDelay(arcDelaySrc.teacherType, arcDelaySrc.teacherIvls, 5, 5), 30);

  // RoomWindow shows Headmaster coverage banner and hides "Needs a Nature master teacher"
  const natHtml = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={cNat}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
    />
  );
  assert.ok(natHtml.includes('classroom-headmaster-covered'));
  assert.ok(!natHtml.includes('Needs a Nature master teacher'));

  // Choreographer: Period 1 (06:20) sends Headmaster to covered classroom lectern, Break (07:20) sends Headmaster to Ponder Orb
  const groundY = getGroundY(3);
  const chor = new Choreographer(new NavGraph(s.rooms, groundY), groundY);
  chor.reachability = computeReachability(s.rooms);
  s.debugTimeHours = 6.3;
  chor.syncState(s, chor.reachability);
  chor.tick(100, s, true);
  const wiz = chor.agents.get('wizard')!;
  assert.equal(wiz.targetRoomId, cNat.id);
  assert.equal(wiz.wizardErrand, 'teach');
  assert.equal(wiz.anim, 'teach');

  s.debugTimeHours = 7.3;
  chor.tick(100, s, true);
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  assert.equal(wiz.targetRoomId, study.id);
  assert.equal(wiz.wizardErrand, 'ponder');
  assert.equal(wiz.anim, 'cast');
});

test('Section 5: Split-room teachers apply distinct career-card delays per period', () => {
  const s = setupBasicAcademy();
  const cArc = makeRoom(45, 'class_arcane', 1, 0, 'castle');
  s.rooms.push(cArc);

  // Card sets: P1 teacher has 30d cards (0 delay), P3 teacher has 0d cards (30 delay)
  s.allCards = {
    1: { id: 1, nid: 1, deckName: 'Arcane', front: 'q1', back: 'a1', ivl: 35, lastAnswerIvl: 35, honestIvl: 35, due: 0, lastStudiedMs: 0, queue: 2, type: 2 },
    2: { id: 2, nid: 2, deckName: 'Arcane', front: 'q2', back: 'a2', ivl: 0, lastAnswerIvl: 0, honestIvl: 0, due: 0, lastStudiedMs: 0, queue: 0, type: 2 }
  };
  s.cardSets.push(
    { id: 101, characterId: 501, kind: 'career', career: 'teacher', size: 1, createdDay: 1, released: false, cardIds: [1] },
    { id: 102, characterId: 502, kind: 'career', career: 'teacher', size: 1, createdDay: 1, released: false, cardIds: [2] }
  );

  const t1 = makeChar(501, { status: 'faculty', career: 'teacher', careerState: 'active', masteredSchools: ['arcane'], careerSetIds: [101] });
  const t2 = makeChar(502, { status: 'faculty', career: 'teacher', careerState: 'active', masteredSchools: ['arcane'], careerSetIds: [102] });
  const stu1 = makeChar(601, { status: 'student', currentSchool: 'arcane' }); // Period 1 -> t1
  const stu2 = makeChar(602, { status: 'student', currentSchool: 'arcane' }); // Period 2 -> t1
  const stu3 = makeChar(603, { status: 'student', currentSchool: 'arcane' }); // Period 3 -> t2
  s.characters.push(t1, t2, stu1, stu2, stu3);

  const sched = buildAcademySchedule(s);
  const d1 = getStudentDelaySource(s, sched, stu1);
  const d3 = getStudentDelaySource(s, sched, stu3);
  assert.equal(calculateTeacherDelay(d1.teacherType, d1.teacherIvls, 6, 5), 0);
  assert.equal(calculateTeacherDelay(d3.teacherType, d3.teacherIvls, 6, 5), 30);
});

test('Section 6 & 7: personal timers stagger & hold during talk, reduceMotion determinism, banned rooms, site edge & injured lock', () => {
  const s = setupBasicAcademy();
  // Add a construction site touching Entrance Hall right/left, plus banned & allowed rooms
  const lib = makeRoom(50, 'library', 1, 0, 'castle');
  const common = makeRoom(51, 'common_room', 6, 0, 'castle');
  const quarry = makeRoom(52, 'quarry', 0, 0, 'grounds');
  const workshop = makeRoom(53, 'workshop', 8, 0, 'castle');
  const infirmary = makeRoom(54, 'infirmary', 10, 0, 'castle');
  const site: PlacedRoom = {
    ...makeRoom(55, 'courtyard_garden', 2, 0, 'grounds', []),
    state: 'site',
    buildRequired: 10,
    buildProgress: 2
  };
  s.rooms.push(lib, common, quarry, workshop, infirmary, site);

  const stu = makeChar(701, { status: 'student', currentSchool: 'arcane', personality: 'Bookish' });
  const builder = makeChar(702, { status: 'faculty', career: 'builder', careerState: 'active', masteredSchools: ['arcane'] });
  const injured = makeChar(703, {
    status: 'student',
    currentSchool: 'light',
    injury: { type: 'bruised', points: 0, required: 10 }
  });
  s.characters.push(stu, builder, injured);

  // Period 1 hour: builder picks site edge (inside touching grounds plot vegetable_patch at x=8? Or workshop), NEVER inside site footprint; stu never visits banned rooms
  s.debugTimeHours = 6.2;
  const groundY = getGroundY(3);
  const chorNormal = new Choreographer(new NavGraph(s.rooms, groundY), groundY);
  chorNormal.reachability = computeReachability(s.rooms);
  chorNormal.syncState(s, chorNormal.reachability);

  const agStu = chorNormal.agents.get('char-701')!;
  const agBld = chorNormal.agents.get('char-702')!;
  const agInj = chorNormal.agents.get('char-703')!;

  assert.ok(
    agStu.personalTimerDurationMs! >= 480_000 && agStu.personalTimerDurationMs! <= 720_000,
    'Personal timer duration between 8 and 12 minutes'
  );

  // Reduce motion picks the exact same room and anchor as normal clock at the same hour
  const chorRM = new Choreographer(new NavGraph(s.rooms, groundY), groundY);
  chorRM.reachability = computeReachability(s.rooms);
  chorRM.syncState(s, chorRM.reachability);
  chorNormal.tick(100, s, false);
  chorRM.tick(100, s, true);
  assert.equal(chorRM.agents.get('char-701')!.targetRoomId, agStu.targetRoomId);
  assert.equal(chorRM.agents.get('char-701')!.targetAnchorId, agStu.targetAnchorId);

  // Injured stays at infirmary cot across ticks
  assert.equal(agInj.targetRoomId, infirmary.id);
  assert.equal(agInj.activity, 'sleep');

  // Student never picks quarry, workshop, or unbuilt site
  assert.notEqual(agStu.targetRoomId, quarry.id);
  assert.notEqual(agStu.targetRoomId, workshop.id);
  assert.notEqual(agStu.targetRoomId, site.id);

  // Builder never stands inside unbuilt site footprint
  assert.notEqual(agBld.targetRoomId, site.id);

  // findBuilderSiteEdgeAnchor resolves a touching built room if adjacent to site (1x1 courtyard_garden at x=2..3 -> greenhouse at x=3)
  const touchingBuilt = makeRoom(56, 'greenhouse', 3, 0, 'grounds');
  s.rooms.push(touchingBuilt);
  const edge = findBuilderSiteEdgeAnchor(site, s, computeReachability(s.rooms), groundY);
  assert.ok(edge && edge.roomId === touchingBuilt.id, 'Builder visits touching built room edge, never site itself');
});

test('Section 8: Meals use two sittings by chair count with packed fallback; Night uses own beds & Early Riser/Night Owl', () => {
  const s = setupBasicAcademy();
  // Connect cleanly: dorm x=1..3 | EH x=3..5 | Study x=5..6 | Ref x=6..9 | Lib x=9..11 | Common x=11..13
  const ref = makeRoom(60, 'refectory', 6, 0, 'castle');
  const dorm = makeRoom(61, 'dormitory', 1, 0, 'castle', [
    furn('bunk_bed', 'required:bed'),
    furn('bunk_bed', 'optional'),
    furn('writing_desk', 'optional')
  ]);
  const lib = makeRoom(62, 'library', 9, 0, 'castle');
  const common = makeRoom(63, 'common_room', 11, 0, 'castle');
  s.rooms.push(ref, dorm, lib, common);

  for (let i = 1; i <= 14; i++) {
    s.characters.push(makeChar(800 + i, {
      status: 'student',
      currentSchool: 'arcane',
      bedRoomId: i <= 4 ? dorm.id : undefined,
      traits: i === 1 ? ['Early Riser'] : i === 2 ? ['Night Owl'] : []
    }));
  }

  assert.equal(refectoryChairCount(ref), 6);
  const sittings = buildMealSittings(s);
  const sitACount = Array.from(sittings.values()).filter(x => x.sitting === 'A').length;
  const sitBCount = Array.from(sittings.values()).filter(x => x.sitting === 'B').length;
  const packedCount = Array.from(sittings.values()).filter(x => x.sitting === 'packed').length;
  assert.equal(sitACount, 6, 'Sitting A takes 6 chairs');
  assert.equal(sitBCount, 6, 'Sitting B takes 6 chairs');
  assert.equal(packedCount, 3, 'Remaining 3 get packed meals (never crammed into refectory)');

  // Night (23:00): characters with dorm beds get distinct bed anchor coordinates (bunk roommates don't stack)
  s.debugTimeHours = 23.0;
  const groundY = getGroundY(3);
  const chor = new Choreographer(new NavGraph(s.rooms, groundY), groundY);
  chor.reachability = computeReachability(s.rooms);
  chor.syncState(s, chor.reachability);
  chor.tick(100, s, true);

  const xsInDorm = [1, 3, 4].map(idx => chor.agents.get(`char-${800 + idx}`)!.x);
  assert.equal(new Set(xsInDorm).size, xsInDorm.length, 'Dorm roommates claim distinct bunk/bed x coordinates');

  // Unbedded students doze in common_room seats (first 4 seats), NOT stacked in Entrance Hall
  const unbedded = chor.agents.get('char-805')!;
  assert.equal(unbedded.targetRoomId, common.id, 'Unbedded sleeper uses common_room fallback');

  // Early Riser (801) wakes up after 05:00 while others keep sleeping
  s.debugTimeHours = 5.4;
  chor.tick(100, s, true);
  assert.notEqual(chor.agents.get('char-801')!.activity, 'sleep', 'Early Riser wakes at 05:00');
  assert.equal(chor.agents.get('char-803')!.activity, 'sleep', 'Normal student still sleeps at 05:24');

  // Packed meal fallback when no refectory table exists never goes to Refectory or Entrance Hall when dorm/common_room exist
  ref.furniture = [furn('hearth', 'required:hearth')];
  s.debugTimeHours = 13.15;
  chor.syncState(s, chor.reachability);
  chor.tick(100, s, true);
  const packedAgent = chor.agents.get('char-801')!;
  assert.notEqual(packedAgent.targetRoomId, ref.id, 'No-table packed meal does not stand inside Refectory');
  assert.notEqual(packedAgent.targetRoomId, s.rooms.find(r => r.defId === 'entrance_hall')!.id);
});

test('Section 9: Conversation probabilities, standoff spacing, and personal timer pause during talk', () => {
  const s = setupBasicAcademy();
  const common = makeRoom(70, 'common_room', 1, 0, 'castle');
  s.rooms.push(common);

  const a = makeChar(901, { personality: 'Bookish', traits: ['Green Thumb'], currentSchool: 'arcane' });
  const b = makeChar(902, { personality: 'Steadfast', traits: ['Green Thumb'], currentSchool: 'nature' });
  const c = makeChar(903, { personality: 'Bold', traits: [], currentSchool: 'arcane' });
  const d = makeChar(904, { personality: 'Social', traits: [], currentSchool: 'light' });
  const e = makeChar(905, { personality: 'Curious', traits: ['Chatterbox'], currentSchool: 'alchemy' });
  s.characters.push(a, b, c, d, e);

  s.debugTimeHours = 15.0; // Afternoon free time
  const groundY = getGroundY(3);
  const chor = new Choreographer(new NavGraph(s.rooms, groundY), groundY);
  chor.reachability = computeReachability(s.rooms);
  chor.syncState(s, chor.reachability);

  const agA = chor.agents.get('char-901')!;
  const agB = chor.agents.get('char-902')!;
  const agC = chor.agents.get('char-903')!;
  const agD = chor.agents.get('char-904')!;
  const agE = chor.agents.get('char-905')!;

  assert.equal(conversationChance(agA, agB, s), 0.45, 'shared trait -> 0.45');
  assert.equal(conversationChance(agA, agC, s), 0.18, 'same school -> 0.18');
  assert.equal(conversationChance(agD, agE, s), 0.12, 'both Social/Chatterbox -> 0.12');
  assert.equal(conversationChance(agB, agD, s), 0, 'no shared trait/school/Social -> 0');

  // Place A & B already arrived in common_room overlapping; simulate an active conversation & verify timer holds
  agA.currentRoomId = common.id;
  agB.currentRoomId = common.id;
  agA.path = [];
  agB.path = [];
  agA.talkingRemainingMs = 25000;
  agB.talkingRemainingMs = 25000;
  agA.talkingWithId = agB.id;
  agB.talkingWithId = agA.id;
  agA.lastBlockKey = 'free:afternoon:student:arcane';
  agA.targetRoomId = common.id;
  agA.targetAnchorId = `r-${common.id}-seat-0`;
  const timerBefore = (agA.personalTimerMs = 12345);
  for (let i = 0; i < 4; i++) chor.tick(250, s, false);
  assert.equal(agA.anim, 'talk');
  assert.equal(agA.personalTimerMs, timerBefore, 'personal timer pauses while talking');
  assert.equal(agA.talkingRemainingMs, 24000);
});

test('Section 10 & 13: Anchors stay unique & inside pen bounds; unreachable rooms stay unscheduled; Deep Freeze immutability', () => {
  const s = setupBasicAcademy();
  const groundY = getGroundY(3);

  const lib = makeRoom(80, 'library', 1, 0, 'castle', [
    furn('bookshelf', 'required:bookshelf'),
    furn('bookshelf', 'required:bookshelf'),
    furn('reading_desk', 'required:reading_desk'),
    furn('reading_desk', 'optional'),
    furn('rolling_ladder', 'optional')
  ]);
  assert.equal(libraryReaderCapacity(lib), 5); // 2 desks + 2 shelves + 1 ladder
  const libAnchors = buildRoomAnchors(lib, groundY);
  assert.equal(libAnchors.readingDesks.length, 2);
  assert.equal(libAnchors.bookshelves.length, 3);
  assert.equal(new Set(libAnchors.all.map(a => a.x)).size, libAnchors.all.length, 'Every library anchor has a distinct x');

  const pond = makeRoom(81, 'pond', 0, 0, 'grounds');
  const pondBox = roomToWorldBox(pond, groundY);
  const pondAnchors = buildRoomAnchors(pond, groundY);
  for (const a of pondAnchors.all) {
    assert.ok(a.x >= pondBox.left + 8 && a.x <= pondBox.left + pondBox.width - 8, 'Pen anchor stays strictly inside pen bounds');
  }

  // Unreachable upper floor classroom on floor 2 (no spiral stair connecting floor 2) is never scheduled
  const floatingClass = makeRoom(82, 'class_light', 6, 2, 'castle');
  s.rooms.push(lib, floatingClass);
  const lightStu = makeChar(950, { status: 'student', currentSchool: 'light' });
  s.characters.push(lightStu);

  const reach = computeReachability(s.rooms);
  assert.equal(reach.get(floatingClass.id)?.reachable, false);
  const sched = buildAcademySchedule(s, reach);
  assert.equal(sched.schoolCapacity.light, 0, 'Unreachable classroom adds 0 capacity');
  assert.equal(sched.studentAssignments.has(lightStu.id), false);

  // Deep-freeze FullGameState and run buildAcademySchedule, buildMealSittings, buildRoomAnchors, and Choreographer.tick
  s.debugTimeHours = 13.15;
  deepFreeze(s);
  const chor = new Choreographer(new NavGraph(s.rooms, groundY), groundY);
  chor.reachability = reach;
  assert.doesNotThrow(() => {
    chor.syncState(s, reach);
    buildAcademySchedule(s, reach);
    buildMealSittings(s, reach);
    for (let i = 0; i < 20; i++) chor.tick(100, s, false);
  });
});
