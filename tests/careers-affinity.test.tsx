/**
 * Careers: school affinities, no faculty hard cap, headmaster taming fix, and teacher-school matching.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { BestiaryPanel, RosterPanel } from '../src/components/GamePanels.tsx';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import {
  AnkiCardSnapshot, CareerType, Character, CreatureInstance, FullGameState, PlacedFurniture, PlacedRoom, SchoolType
} from '../src/types/ankicaster.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { careerAffinityMultiplier, describeCareerAffinity } from '../src/utils/formulas.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';

let nextFurnId = 9000;

function makeCard(id: number, ivl = 5): AnkiCardSnapshot {
  return {
    id,
    nid: id,
    deckName: 'Default',
    front: `Front ${id}`,
    back: `Back ${id}`,
    ivl,
    lastAnswerIvl: ivl,
    honestIvl: ivl,
    type: 2,
    queue: 2,
    due: 0,
    lastStudiedMs: Date.now()
  };
}

function makeStateWithCards(cardCount = 30): FullGameState {
  const state = createNewAcademy();
  state.mana = 10000;
  for (let i = 1; i <= cardCount; i++) {
    state.allCards[i] = makeCard(i, 5);
  }
  return state;
}

function addRoom(
  state: FullGameState,
  defId: string,
  id: number,
  x: number,
  y: number,
  furniture: PlacedFurniture[] = []
): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  const room: PlacedRoom = {
    id,
    defId,
    x,
    y,
    w: def.size[0],
    h: def.size[1],
    area: def.area,
    level: 1,
    state: 'built',
    buildRequired: def.buildReviews,
    buildProgress: def.buildReviews,
    cleanliness: 100,
    settings: {},
    furniture
  };
  state.rooms.push(room);
  return room;
}

function makeChar(
  id: number,
  opts: Partial<Character> = {}
): Character {
  return {
    id,
    name: `Char ${id}`,
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#6B4FBB', hat: 'cap' },
    personality: 'Curious',
    traits: [],
    status: 'resident',
    masteredSchools: [],
    needs: { hunger: 90, rest: 90, leisure: 90, composure: 90, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: [],
    ...opts
  };
}

function makeWaryCreature(id: number, defId: string, tamerId?: number): CreatureInstance {
  return {
    id,
    defId,
    nickname: defId,
    status: 'wary',
    hatchProgress: 100,
    tamingProgress: 0,
    tamerId,
    hungry: false,
    bondLevel: 0,
    bondProgress: 0,
    arrivedDay: 1
  };
}

test('Tamer affinity multiplier & engine taming progress: Nature, Shadow, and Shadow+Nature never add', () => {
  // Formula checks
  assert.equal(careerAffinityMultiplier(['nature'], 'tamer', 'shadow'), 1.10);
  assert.equal(careerAffinityMultiplier(['nature'], 'tamer', 'nature'), 1.20);
  assert.equal(careerAffinityMultiplier(['shadow'], 'tamer', 'shadow'), 1.20);
  assert.equal(careerAffinityMultiplier(['shadow'], 'tamer', 'nature'), 1.00);
  assert.equal(careerAffinityMultiplier(['shadow', 'nature'], 'tamer', 'shadow'), 1.20);
  assert.equal(careerAffinityMultiplier(['shadow', 'nature'], 'tamer', 'nature'), 1.20);
  assert.equal(careerAffinityMultiplier(['shadow', 'nature'], 'tamer', 'arcane'), 1.10);

  // Engine integration checks via applyHonestReview
  const runTameReview = (tamerSchools: SchoolType[], creatureDefId: string): number => {
    const state = makeStateWithCards(5);
    const tamer = makeChar(10, { status: 'faculty', career: 'tamer', careerState: 'active', masteredSchools: tamerSchools });
    const creature = makeWaryCreature(20, creatureDefId, tamer.id);
    state.characters.push(tamer);
    state.creatures.push(creature);
    const res = AnkicasterEngine.applyHonestReview(state, 1, 3, 2000);
    return res.state.creatures[0].tamingProgress;
  };

  assert.ok(Math.abs(runTameReview(['nature'], 'night_lynx') - 1.10) < 1e-9, 'Nature tamer on Shadow creature x1.10');
  assert.ok(Math.abs(runTameReview(['nature'], 'mossback_tortoise') - 1.20) < 1e-9, 'Nature tamer on Nature creature x1.20');
  assert.ok(Math.abs(runTameReview(['shadow'], 'night_lynx') - 1.20) < 1e-9, 'Shadow tamer on Shadow creature x1.20');
  assert.ok(Math.abs(runTameReview(['shadow'], 'mossback_tortoise') - 1.00) < 1e-9, 'Shadow tamer on Nature creature x1.00');
  assert.ok(Math.abs(runTameReview(['shadow', 'nature'], 'night_lynx') - 1.20) < 1e-9, 'Shadow+Nature tamer on Shadow x1.20');
  assert.ok(Math.abs(runTameReview(['shadow', 'nature'], 'mossback_tortoise') - 1.20) < 1e-9, 'Shadow+Nature tamer on Nature x1.20');
  assert.ok(Math.abs(runTameReview(['shadow', 'nature'], 'mistfeather_owl') - 1.10) < 1e-9, 'Shadow+Nature tamer on Arcane x1.10');
});

test('Gardener affinity multiplier & bell output: broad +5%, focused +10%, never adds', () => {
  assert.equal(careerAffinityMultiplier(['nature'], 'gardener', 'nature'), 1.10);
  assert.equal(careerAffinityMultiplier(['nature'], 'gardener', undefined), 1.05);
  assert.equal(careerAffinityMultiplier(['shadow'], 'gardener', 'nature'), 1.00);
  assert.equal(careerAffinityMultiplier(['shadow'], 'gardener', 'shadow'), 1.10);
  assert.equal(careerAffinityMultiplier(['shadow', 'nature'], 'gardener', 'nature'), 1.10);
  assert.equal(careerAffinityMultiplier(['shadow', 'nature'], 'gardener', 'shadow'), 1.10);
  assert.equal(careerAffinityMultiplier(['shadow', 'nature'], 'gardener', undefined), 1.05);

  const runGreenhouse = (gardenerSchools?: SchoolType[]) => {
    const state = makeStateWithCards(5);
    const gh = addRoom(state, 'greenhouse', 60, 6, 0, [
      { id: nextFurnId++, defId: 'planter_bed', slotKind: 'required:planter_bed', damaged: false },
      { id: nextFurnId++, defId: 'planter_bed', slotKind: 'required:planter_bed', damaged: false }
    ]);
    if (gardenerSchools) {
      const g = makeChar(30, {
        status: 'faculty',
        career: 'gardener',
        careerState: 'active',
        masteredSchools: gardenerSchools,
        workplaceRoomId: gh.id
      });
      state.characters.push(g);
    }
    state.resources.herbs = 0;
    AnkicasterEngine.ringBell(state, []);
    return state.resources.herbs;
  };

  const unstaffed = runGreenhouse(undefined); // staffFactor = 0.5
  const shadowGardener = runGreenhouse(['shadow']); // staffFactor = 1.0, affinity = 1.00
  const natureGardener = runGreenhouse(['nature']); // staffFactor = 1.0, affinity = 1.10
  const dualGardener = runGreenhouse(['shadow', 'nature']); // staffFactor = 1.0, affinity = 1.10

  assert.ok(shadowGardener > unstaffed);
  assert.ok(Math.abs(natureGardener / shadowGardener - 1.10) < 1e-6, 'Nature gardener boosts greenhouse by +10%');
  assert.ok(Math.abs(dualGardener - natureGardener) < 1e-9, 'Shadow+Nature gardener does not add broad+focused');
});

test('Teacher can only be assigned to a classroom of a mastered school, and unstaffed classrooms teach nothing', () => {
  const state = makeStateWithCards(30);
  const arcaneClass = addRoom(state, 'class_arcane', 70, 6, 0, [
    { id: nextFurnId++, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false },
    { id: nextFurnId++, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false }
  ]);
  const natureMaster = makeChar(40, { masteredSchools: ['nature'] });
  const studentInArcane = makeChar(41, {
    status: 'student',
    currentSchool: 'arcane',
    seatRoomId: arcaneClass.id
  });
  state.characters.push(natureMaster, studentInArcane);

  // Cannot appoint Nature master as Teacher when only Arcane classroom exists
  const failAppoint = AnkicasterEngine.assignCareer(state, natureMaster.id, 'teacher');
  assert.equal(failAppoint.success, false);

  // Even if forced as teacher in state, syncWorkplaces will not put Nature master in Arcane classroom
  natureMaster.career = 'teacher';
  natureMaster.careerState = 'active';
  natureMaster.status = 'faculty';
  natureMaster.workplaceRoomId = arcaneClass.id;
  AnkicasterEngine.syncWorkplaces(state);
  assert.equal(natureMaster.workplaceRoomId, undefined, 'Nature teacher cannot remain assigned to Arcane classroom');

  // assignTeacherToClassroom rejects unmastered classroom
  const failMove = AnkicasterEngine.assignTeacherToClassroom(state, natureMaster.id, arcaneClass.id);
  assert.equal(failMove.success, false);

  // Unstaffed classroom teaches nothing in ringBell
  const beforeInsight = state.resources.insight;
  AnkicasterEngine.ringBell(state, []);
  assert.equal(state.resources.insight, beforeInsight, 'classroom without qualifying teacher teaches nothing');

  // RoomWindow shows "Needs a Arcane master teacher"
  const html = renderToStaticMarkup(
    <RoomWindow
      state={state}
      room={arcaneClass}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
    />
  );
  assert.ok(html.includes('Needs a Arcane master teacher'), 'RoomWindow shows missing teacher notice');

  // Now add a Nature classroom; Nature teacher can be assigned to it and Arcane teacher to Arcane
  const natureClass = addRoom(state, 'class_nature', 71, 8, 0, [
    { id: nextFurnId++, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false },
    { id: nextFurnId++, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false }
  ]);
  const okMove = AnkicasterEngine.assignTeacherToClassroom(state, natureMaster.id, natureClass.id);
  assert.equal(okMove.success, true);
  assert.equal(okMove.state.characters.find(c => c.id === natureMaster.id)?.workplaceRoomId, natureClass.id);
});

test('Faculty limit can exceed 12 when beds, classrooms, students, and wizard levels allow', () => {
  const state = makeStateWithCards(30);
  // 52 wizard levels => 1 + floor(52/4) = 14
  state.wizard.levels = { arcane: 10, nature: 10, light: 10, shadow: 10, alchemy: 10 };
  state.wizard.levels.arcane = 14; // total 54 -> A = 14

  // 7 built classrooms => C = 1 + 2*7 = 15
  for (let i = 0; i < 7; i++) {
    addRoom(state, 'class_arcane', 100 + i, 6 + i * 2, 0, [
      { id: nextFurnId++, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false },
      { id: nextFurnId++, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false }
    ]);
  }
  // 14 faculty beds (7 faculty_quarters * 2 beds) => B = 14
  for (let i = 0; i < 7; i++) {
    addRoom(state, 'faculty_quarters', 120 + i, 6 + i * 2, 1, [
      { id: nextFurnId++, defId: 'feather_bed', slotKind: 'faculty_bed', damaged: false },
      { id: nextFurnId++, defId: 'feather_bed', slotKind: 'faculty_bed', damaged: false },
      { id: nextFurnId++, defId: 'writing_desk', slotKind: 'required:writing_desk', damaged: false }
    ]);
  }
  // 39 students => D = 1 + floor(39/3) = 14
  for (let i = 0; i < 39; i++) {
    state.characters.push(makeChar(200 + i, { status: 'student', currentSchool: 'arcane' }));
  }
  // 12 existing active faculty
  for (let i = 0; i < 12; i++) {
    state.characters.push(makeChar(300 + i, { status: 'faculty', career: 'scholar', careerState: 'active', masteredSchools: ['arcane'] }));
  }
  const candidate = makeChar(400, { status: 'resident', masteredSchools: ['nature'] });
  state.characters.push(candidate);

  const res = AnkicasterEngine.assignCareer(state, candidate.id, 'gardener');
  assert.equal(res.success, true, `Should allow 13th faculty member, got error: ${res.error}`);
  const activeFaculty = res.state.characters.filter(c => c.career && c.careerState === 'active').length;
  assert.equal(activeFaculty, 13);
});

test('Headmaster (tamerId 0) assigned as tamer advances taming and renders in BestiaryPanel', () => {
  const state = makeStateWithCards(5);
  state.wizard.levels.nature = 5; // Headmaster mastered Nature -> x1.20 on Nature creature, x1.10 on Shadow
  const natureCreature = makeWaryCreature(50, 'mossback_tortoise', 0);
  const shadowCreature = makeWaryCreature(51, 'night_lynx', 0);
  state.creatures.push(natureCreature, shadowCreature);

  const res = AnkicasterEngine.applyHonestReview(state, 1, 3, 2000);
  assert.ok(Math.abs(res.state.creatures[0].tamingProgress - 1.20) < 1e-9, 'Headmaster (0) tames Nature creature at x1.20');
  assert.ok(Math.abs(res.state.creatures[1].tamingProgress - 1.10) < 1e-9, 'Headmaster (0) tames Shadow creature at x1.10');

  const html = renderToStaticMarkup(
    <BestiaryPanel state={res.state} onFeedCreature={() => {}} onAssignTamer={() => {}} />
  );
  assert.ok(html.includes('Tamer speed: ×1.20'), 'BestiaryPanel tooltip shows tamer speed multiplier');
  assert.ok(html.includes('Headmaster'), 'BestiaryPanel includes Headmaster tamer option');
});

test('UI: RosterPanel career picker shows affinity summaries and hides Teacher when no matching classroom is built', () => {
  const state = makeStateWithCards(5);
  const shadowMaster = makeChar(500, { status: 'resident', masteredSchools: ['shadow'] });
  state.characters.push(shadowMaster);

  const htmlNoClass = renderToStaticMarkup(
    <RosterPanel state={state} onAssignCareer={() => {}} view="all" />
  );
  assert.ok(!htmlNoClass.includes('data-career-option="teacher"'), 'Teacher option hidden without matching built classroom');
  assert.ok(htmlNoClass.includes('Tamer: +20% Shadow creatures only'), 'Shadow tamer affinity summary shown');

  assert.equal(describeCareerAffinity(['nature'], 'tamer'), '+10% all creatures, +20% Nature creatures');
});
