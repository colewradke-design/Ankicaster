import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialGameState } from '../src/data/initialState.ts';
import { FURNITURE_DEFINITIONS, ROOM_DEFINITIONS, roomDisplayName } from '../src/data/content.ts';
import type { Character, CreatureInstance, FullGameState, PlacedFurniture, PlacedRoom } from '../src/types/ankicaster.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { furnitureEffectForRoom, roomFurnitureEffects } from '../src/utils/formulas.ts';
import { isFurnitureCompatibleWithRoom, maxOptionalSlots } from '../src/utils/requiredFurniture.ts';
import { computeReachability } from '../src/utils/reachability.ts';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import { DemolishConfirm } from '../src/components/DemolishConfirm.tsx';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { CreatureChoreographer } from '../src/visual/creatures/creatureChoreographer.ts';
import { getGroundY, getTotalWorldWidth, roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';
import { pieceKind, piecePlane, roomLabelKeepOutRect, validateFurnitureDrop } from '../src/visual/layout/furniturePlacement.ts';
import { drawFurniture } from '../src/visual/rooms/furnitureArt.ts';
import { drawRoomInterior } from '../src/visual/rooms/roomArt.ts';
import { MOVE_SPEED } from '../src/visual/agents/doll.ts';
import type { Painter } from '../src/visual/rooms/painter.ts';

function makeRecorder() {
  const ops: string[] = [];
  const polys: number[][] = [];
  const p: Painter = {
    rect(x, y, w, h) {
      ops.push(`rect:${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)}`);
      return p;
    },
    circle(x, y, r) {
      ops.push(`circle:${x.toFixed(1)},${y.toFixed(1)},${r.toFixed(1)}`);
      return p;
    },
    ellipse(x, y, rx, ry) {
      ops.push(`ellipse:${x.toFixed(1)},${y.toFixed(1)},${rx.toFixed(1)},${ry.toFixed(1)}`);
      return p;
    },
    poly(pts) {
      polys.push([...pts]);
      ops.push(`poly:${pts.map(v => v.toFixed(1)).join(',')}`);
      return p;
    },
    fill(o) {
      ops.push(`fill:${o.color.toString(16)}`);
      return p;
    },
    stroke(o) {
      ops.push(`stroke:${o.color.toString(16)}`);
      return p;
    }
  };
  return { p, ops, polys };
}

function makeRoom(
  id: number,
  defId: string,
  x: number,
  y: number,
  level: 1 | 2 | 3 = 1,
  furniture: PlacedFurniture[] = [],
  extra: Partial<PlacedRoom> = {}
): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  return {
    id,
    defId,
    x,
    y,
    w: def.size[0],
    h: def.size[1],
    area: def.area,
    level,
    state: 'built',
    buildRequired: def.buildReviews,
    buildProgress: def.buildReviews,
    buildPaused: false,
    cleanliness: 100,
    settings: {},
    furniture,
    spent: { mana: 0 },
    fromPlan: false,
    ...extra
  };
}

function richState(): FullGameState {
  const s = createInitialGameState();
  return {
    ...s,
    mana: 50000,
    knownPatterns: Object.keys(FURNITURE_DEFINITIONS),
    resources: {
      ...s.resources,
      timber: 5000,
      stone: 5000,
      glass: 5000,
      cloth: 5000,
      provisions: 5000,
      reagents: 5000,
      insight: 5000,
      herbs: 5000,
      nectar: 5000,
      fish: 5000,
      radiance: 5000,
      umbra: 5000
    }
  };
}

function makeChar(id: number, overrides: Partial<Character> = {}): Character {
  return {
    id,
    name: `Mage ${id}`,
    pronouns: 'they/them',
    appearance: { skin: '#f2c9a5', hair: 'short', hairColor: '#3b2820', robeColor: '#6B4FBB', hat: 'none' },
    personality: 'Curious',
    traits: [],
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    needs: { hunger: 90, rest: 90, leisure: 60, composure: 90, health: 100 },
    morale: 85,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: [],
    ...overrides
  };
}

function firstCardId(s: FullGameState): number {
  const keys = Object.keys(s.allCards);
  if (keys.length > 0) return Number(keys[0]);
  s.allCards[1] = {
    id: 1,
    nid: 1,
    deckName: 'Default',
    front: 'Q',
    back: 'A',
    ivl: 5,
    lastAnswerIvl: 5,
    honestIvl: 5,
    type: 2,
    queue: 2,
    due: 0,
    lastStudiedMs: 0
  };
  return 1;
}

test('Classroom centerpieces are floor background items and 4 student_desks fit in a 2x1 classroom', () => {
  const centerpieces = ['orrery_globe', 'potting_bench', 'sun_altar', 'veiled_mirror', 'bench_cauldron'];
  for (const id of centerpieces) {
    assert.equal(piecePlane(id), 'floor', `${id} stays anchored on floor`);
    assert.equal(pieceKind(id), 'background', `${id} is background footprint so desks fit in front`);
  }

  // Simulate a 2x1 classroom flanked by rooms on both sides (worst-case doorway keep-outs)
  const leftCorridor = makeRoom(1, 'corridor', 0, 0);
  const cls = makeRoom(2, 'class_arcane', 1, 0, 1, [
    { id: 201, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false, x: 20, floor: 0, plane: 'floor' },
    { id: 202, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false, x: 64, floor: 0, plane: 'floor' }
  ]);
  const rightCorridor = makeRoom(3, 'corridor', 3, 0);
  const rooms = [leftCorridor, cls, rightCorridor];

  // Place 4 student_desks cleanly alongside lectern and centered orrery_globe
  const deskXs = [40, 60, 80, 100];
  for (let i = 0; i < deskXs.length; i++) {
    const check = validateFurnitureDrop(cls, rooms, 'student_desk', { x: deskXs[i], floor: 0, plane: 'floor' });
    assert.equal(check.valid, true, `Desk #${i + 1} at x=${deskXs[i]} fits: ${check.error || ''}`);
    cls.furniture.push({
      id: 210 + i,
      defId: 'student_desk',
      slotKind: i === 0 ? 'required:student_desk' : 'optional',
      damaged: false,
      x: deskXs[i],
      floor: 0,
      plane: 'floor'
    });
  }

  assert.equal(cls.furniture.filter(f => f.defId === 'student_desk').length, 4);
  assert.equal(maxOptionalSlots(cls), 5);
});

test('teachers_lectern auto-flips visually toward room center and classroom actors auto-face properly', () => {
  // 1. Visual lectern flipX geometry check
  const recLeft = makeRecorder();
  drawFurniture(recLeft.p, 'teachers_lectern', 20, 100);
  const recRight = makeRecorder();
  drawFurniture(recRight.p, 'teachers_lectern', 20, 100, { flipX: true });
  assert.notDeepEqual(recLeft.polys, recRight.polys, 'flipX mirrors lectern podium polygons');

  // 2. Classroom actor facing in Choreographer
  const groundY = getGroundY(3);
  const base = createInitialGameState();

  const eh = makeRoom(1, 'entrance_hall', 3, 0);
  // Test A: lectern on left (x=20), desk on right (x=96)
  const clsA = makeRoom(10, 'class_arcane', 1, 0, 1, [
    { id: 1001, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false, x: 20, floor: 0, plane: 'floor' },
    { id: 1002, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false, x: 64, floor: 0, plane: 'floor' },
    { id: 1003, defId: 'student_desk', slotKind: 'required:student_desk', damaged: false, x: 96, floor: 0, plane: 'floor' }
  ]);
  const teacherA = makeChar(1, { status: 'faculty', career: 'teacher', careerState: 'active', workplaceRoomId: 10, masteredSchools: ['arcane'] });
  const studentA = makeChar(2, { seatRoomId: 10, bedRoomId: 10, currentSchool: 'arcane' });
  const stateA: FullGameState = {
    ...base,
    rooms: [eh, clsA],
    characters: [teacherA, studentA],
    debugTimeHours: 6.5 // Period 1 class hour
  };
  const navA = new NavGraph(stateA.rooms, groundY);
  const choreoA = new Choreographer(navA, groundY);
  choreoA.syncState(stateA, computeReachability(stateA.rooms));
  choreoA.tick(16, stateA, true); // reduceMotion snaps immediately & sets facing

  const sAgentA = choreoA.agents.get('char-2')!;
  const tAgentA = choreoA.agents.get('char-1')!;
  assert.equal(sAgentA.facing, 'L', 'Student on right faces left toward lectern on left');
  assert.equal(tAgentA.facing, 'R', 'Teacher at left lectern faces right toward room center');

  // Test B: lectern on right (x=108), desk on left (x=28)
  const clsB = makeRoom(10, 'class_arcane', 1, 0, 1, [
    { id: 1001, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false, x: 108, floor: 0, plane: 'floor' },
    { id: 1002, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false, x: 64, floor: 0, plane: 'floor' },
    { id: 1003, defId: 'student_desk', slotKind: 'required:student_desk', damaged: false, x: 28, floor: 0, plane: 'floor' }
  ]);
  const stateB: FullGameState = {
    ...base,
    rooms: [eh, clsB],
    characters: [teacherA, studentA],
    debugTimeHours: 6.5
  };
  const navB = new NavGraph(stateB.rooms, groundY);
  const choreoB = new Choreographer(navB, groundY);
  choreoB.syncState(stateB, computeReachability(stateB.rooms));
  choreoB.tick(16, stateB, true);

  const sAgentB = choreoB.agents.get('char-2')!;
  const tAgentB = choreoB.agents.get('char-1')!;
  assert.equal(sAgentB.facing, 'R', 'Student on left faces right toward lectern on right');
  assert.equal(tAgentB.facing, 'L', 'Teacher at right lectern faces left toward room center');
});

test('nightglass is a wall pane restricted strictly to walled creature pens', () => {
  assert.equal(piecePlane('nightglass'), 'wall');
  assert.equal(pieceKind('nightglass'), 'background');

  const expectedAllowed = ['gloom_hutch', 'aviary', 'ember_pit', 'crystal_vivarium', 'menagerie'];
  const expectedBlocked = ['warding_chamber', 'dormitory', 'tide_tank', 'meadow_paddock', 'spiral_stair'];

  const nightDef = FURNITURE_DEFINITIONS.nightglass;
  for (const rId of expectedAllowed) {
    assert.equal(isFurnitureCompatibleWithRoom(nightDef, rId), true, `nightglass allowed in ${rId}`);
  }
  for (const rId of expectedBlocked) {
    assert.equal(isFurnitureCompatibleWithRoom(nightDef, rId), false, `nightglass excluded from ${rId}`);
  }

  // Mounts on wall behind floor creature furniture in gloom_hutch
  const hutch = makeRoom(30, 'gloom_hutch', 1, 0, 1, [
    { id: 3001, defId: 'feeding_trough', slotKind: 'required:feeding_trough', damaged: false, x: 32, floor: 0, plane: 'floor' }
  ]);
  assert.equal(
    validateFurnitureDrop(hutch, [hutch], 'nightglass', { x: 32, wallY: -26, floor: 0, plane: 'wall' }).valid,
    true,
    'nightglass mounts on wall over floor fixture'
  );
  assert.equal(
    validateFurnitureDrop(hutch, [hutch], 'nightglass', { x: 32, floor: 0, plane: 'floor' }).valid,
    false,
    'nightglass refuses floor plane'
  );
});

test('bookshelf rooms and context-aware effects; wooden_chair removed from library & wizard_study', () => {
  const shelfDef = FURNITURE_DEFINITIONS.bookshelf;
  const chairDef = FURNITURE_DEFINITIONS.wooden_chair;

  assert.equal(isFurnitureCompatibleWithRoom(chairDef, 'library'), false);
  assert.equal(isFurnitureCompatibleWithRoom(chairDef, 'wizard_study'), false);
  assert.equal(isFurnitureCompatibleWithRoom(chairDef, 'refectory'), true);

  for (const badRoom of ['greenhouse', 'refectory', 'kitchen', 'bathhouse', 'pond', 'tide_tank', 'meadow_paddock', 'spiral_stair', 'support_pillar']) {
    assert.equal(isFurnitureCompatibleWithRoom(shelfDef, badRoom), false, `bookshelf blocked in ${badRoom}`);
  }

  assert.deepEqual(furnitureEffectForRoom('bookshelf', 'library'), { kind: 'output_pct', value: 10, scope: 'room' });
  assert.deepEqual(furnitureEffectForRoom('bookshelf', 'scriptorium'), { kind: 'output_pct', value: 10, scope: 'room' });
  assert.deepEqual(furnitureEffectForRoom('bookshelf', 'class_arcane'), { kind: 'output_pct', value: 10, scope: 'room' });
  assert.deepEqual(furnitureEffectForRoom('bookshelf', 'wizard_study'), { kind: 'ponder_pct', value: 10, scope: 'room' });
  assert.deepEqual(furnitureEffectForRoom('bookshelf', 'dormitory'), { kind: 'composure_bonus', value: 2, scope: 'room' });
  assert.deepEqual(furnitureEffectForRoom('bookshelf', 'faculty_lounge'), { kind: 'composure_bonus', value: 2, scope: 'room' });

  const s = richState();
  const dorm = makeRoom(40, 'dormitory', 0, 0, 1, [
    { id: 4001, defId: 'simple_cot', slotKind: 'required:bed', damaged: false }
  ]);
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  const dormHtml = renderToStaticMarkup(
    <RoomWindow
      state={{ ...s, rooms: [...s.rooms, dorm] }}
      room={dorm}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
      initialTab="furnishings"
    />
  );
  assert.ok(dormHtml.includes('Composure +2'), 'Dormitory shows context-aware Composure +2 on Bookshelf');

  const studyHtml = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={study}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
      initialTab="furnishings"
    />
  );
  assert.ok(studyHtml.includes('Pondering +10%'), 'Wizard Study shows Pondering +10% for Bookshelf/Quill');
  assert.ok(studyHtml.includes('Pondering +5%'), 'Wizard Study shows Pondering +5% for Tea Service');
});

test('Dead effects wired in engine: tea_service, silent_quill, stewpot, tool_wall, remedy_cabinet/healing_basin', () => {
  // 1. tea_service -> leisure_bonus in faculty_lounge & ponder_pct in wizard_study
  //    silent_quill -> ponder_pct in wizard_study & output_pct in scriptorium
  {
    const s1 = richState();
    const cardId = firstCardId(s1);
    const study1 = s1.rooms.find(r => r.defId === 'wizard_study')!;
    s1.wizard.activeSession = {
      id: 1,
      kind: 'orb',
      school: 'arcane',
      targetLevel: 1,
      progress: 0,
      required: 20,
      costPaid: 0,
      state: 'active'
    };
    const rBaseline = AnkicasterEngine.applyHonestReview(structuredClone(s1), cardId, 3, 2400).state;
    assert.equal(rBaseline.wizard.activeSession!.progress, 1, 'Baseline ponder progresses by 1/review');

    study1.furniture.push(
      { id: 8101, defId: 'tea_service', slotKind: 'optional', damaged: false },
      { id: 8102, defId: 'silent_quill', slotKind: 'optional', damaged: false }
    );
    const rBoosted = AnkicasterEngine.applyHonestReview(structuredClone(s1), cardId, 3, 2400).state;
    assert.equal(rBoosted.wizard.activeSession!.progress, 1.15, 'Tea (+5%) + Quill (+10%) speeds pondering to 1.15');

    // Tea Service in faculty_lounge gives +2 Leisure effect
    const lounge = makeRoom(81, 'faculty_lounge', 0, 0, 1, [
      { id: 8110, defId: 'armchair', slotKind: 'required:armchair', damaged: false },
      { id: 8112, defId: 'armchair', slotKind: 'required:armchair', damaged: false },
      { id: 8111, defId: 'tea_service', slotKind: 'optional', damaged: false }
    ]);
    assert.equal(roomFurnitureEffects(lounge).leisure_bonus, 2);
  }

  // 2. silent_quill boosts Scriptorium Insight output (+10%)
  {
    const base = richState();
    base.bellIndex = 1;
    base.characters = [
      makeChar(5, { status: 'faculty', career: 'scholar', careerState: 'active', workplaceRoomId: 90, masteredSchools: [] })
    ];
    const scriptA = makeRoom(90, 'scriptorium', 6, 0, 1, [
      { id: 9001, defId: 'scribes_desk', slotKind: 'required:scribes_desk', damaged: false }
    ]);
    base.rooms.push(scriptA);
    base.resources.insight = 0;

    const noQuill = structuredClone(base);
    AnkicasterEngine.ringBell(noQuill, []);
    const baseGain = noQuill.resources.insight;
    assert.ok(baseGain > 0, 'Scriptorium with active scholar generates Insight');

    const withQuill = structuredClone(base);
    withQuill.rooms.find(r => r.id === 90)!.furniture.push({
      id: 9002,
      defId: 'silent_quill',
      slotKind: 'optional',
      damaged: false
    });
    AnkicasterEngine.ringBell(withQuill, []);
    assert.ok(
      withQuill.resources.insight >= baseGain * 1.1,
      `Silent Quill adds >= +10% Insight in Scriptorium (${baseGain} -> ${withQuill.resources.insight})`
    );
  }

  // 3. stewpot reduces meal provisions cost and stacks with Kitchen-Refectory adjacency
  {
    const mkMealState = (hasStewpot: boolean) => {
      const s = richState();
      s.bellIndex = 5; // Meal triggers on bellIndex % 5 === 0
      s.resources.provisions = 100;
      const kitchen = makeRoom(95, 'kitchen', 6, 0, 1, [
        { id: 9501, defId: 'cooking_range', slotKind: 'required:cooking_range', damaged: false },
        ...(hasStewpot ? [{ id: 9502, defId: 'stewpot', slotKind: 'optional', damaged: false }] : [])
      ]);
      const refectory = makeRoom(96, 'refectory', 7, 0, 1, [
        { id: 9601, defId: 'long_table', slotKind: 'required:long_table', damaged: false },
        { id: 9602, defId: 'hearth', slotKind: 'required:hearth', damaged: false }
      ]);
      s.rooms = [...s.rooms.filter(r => r.defId !== 'vegetable_patch'), kitchen, refectory];
      s.characters = Array.from({ length: 10 }, (_, i) => makeChar(100 + i));
      return s;
    };

    const sAdj = mkMealState(false);
    AnkicasterEngine.ringBell(sAdj, []);
    const costAdjOnly = 100 - sAdj.resources.provisions; // 10 * 0.9 = 9

    const sStew = mkMealState(true);
    AnkicasterEngine.ringBell(sStew, []);
    const costAdjPlusStew = 100 - sStew.resources.provisions; // 10 * 0.8 = 8
    assert.equal(costAdjOnly, 9);
    assert.equal(costAdjPlusStew, 8, 'Stewpot reduces meal provisions cost by an extra 10%');
  }

  // 4. tool_wall in built finished workshop accelerates construction buildProgress by +5%
  {
    const s = richState();
    const cardId = firstCardId(s);
    const workshop = makeRoom(97, 'workshop', 7, 0, 1, [
      { id: 9701, defId: 'workbench', slotKind: 'required:workbench', damaged: false },
      { id: 9702, defId: 'tool_wall', slotKind: 'optional', damaged: false }
    ]);
    const site = makeRoom(98, 'corridor', 1, 0, 1, [], {
      state: 'site',
      buildRequired: 20,
      buildProgress: 0
    });
    s.rooms.push(workshop, site);
    const after = AnkicasterEngine.applyHonestReview(s, cardId, 3, 2400).state;
    const updatedSite = after.rooms.find(r => r.id === 98)!;
    assert.equal(updatedSite.buildProgress, 1.05, 'tool_wall advances construction by 1.05 per review');
  }

  // 5. remedy_cabinet & healing_basin heal injured residents in built bathhouse / sunlit_sanctum
  {
    const s = richState();
    const cardId = firstCardId(s);
    s.bellIndex = 1;
    const char = makeChar(200, { injury: { type: 'bruised', points: 0, required: 100 } });
    s.characters = [char];
    const bath = makeRoom(99, 'bathhouse', 7, 0, 1, [
      { id: 9901, defId: 'soaking_tub', slotKind: 'required:soaking_tub', damaged: false },
      { id: 9902, defId: 'healing_basin', slotKind: 'optional', damaged: false }
    ]);
    const sanctum = makeRoom(100, 'sunlit_sanctum', 9, 0, 1, [
      { id: 10001, defId: 'sun_window', slotKind: 'required:sun_window', damaged: false },
      { id: 10002, defId: 'meditation_cushions', slotKind: 'required:meditation_cushions', damaged: false },
      { id: 10003, defId: 'meditation_cushions', slotKind: 'required:meditation_cushions', damaged: false },
      { id: 10004, defId: 'remedy_cabinet', slotKind: 'optional', damaged: false }
    ]);
    s.rooms.push(bath, sanctum);
    const after = AnkicasterEngine.applyHonestReview(s, cardId, 3, 2400).state;
    const healed = after.characters.find(c => c.id === 200)!;
    // Base 1.0 * (1 + 20/100) = 1.2
    assert.equal(Math.round(healed.injury!.points * 100) / 100, 1.2, 'bathhouse + sunlit_sanctum heal_pct accelerates recovery');
  }
});

test('spiral_stair & support_pillar allow 0 furniture slots and show no-furniture / tier upgrade UI', () => {
  const s = richState();
  const stair = makeRoom(201, 'spiral_stair', 1, 0, 1);
  const pillar = makeRoom(202, 'support_pillar', 2, 0, 1);
  s.rooms.push(stair, pillar);

  for (const lvl of [1, 2, 3] as const) {
    assert.equal(maxOptionalSlots({ ...stair, level: lvl }), 0, `spiral_stair Lv ${lvl} has 0 optional slots`);
    assert.equal(maxOptionalSlots({ ...pillar, level: lvl }), 0, `support_pillar Lv ${lvl} has 0 optional slots`);
  }

  assert.equal(isFurnitureCompatibleWithRoom(FURNITURE_DEFINITIONS.potted_fern, 'spiral_stair'), false);
  assert.equal(isFurnitureCompatibleWithRoom(FURNITURE_DEFINITIONS.potted_fern, 'support_pillar'), false);

  const acqStair = AnkicasterEngine.acquireFurniture(s, stair.id, 'potted_fern');
  assert.equal(acqStair.success, false, 'Engine blocks placing even "any" furniture into spiral_stair');
  const acqPillar = AnkicasterEngine.acquireFurniture(s, pillar.id, 'potted_fern');
  assert.equal(acqPillar.success, false, 'Engine blocks placing even "any" furniture into support_pillar');

  const htmlLv1 = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={stair}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
      initialTab="furnishings"
    />
  );
  assert.ok(htmlLv1.includes('This room holds no furniture.'), 'Spiral Stair Lv 1 renders no-furniture notice');
  assert.ok(htmlLv1.includes('Magical Elevator (Lv 2)'), 'Spiral Stair Lv 1 upgrade mentions Magical Elevator');

  const htmlLv2 = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={{ ...stair, level: 2 }}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onRemoveFurniture={() => {}}
      initialTab="furnishings"
    />
  );
  assert.ok(htmlLv2.includes('Teleportation Portal (Lv 3)'), 'Spiral Stair Lv 2 upgrade mentions Teleportation Portal');
});

test('spiral_stair Lv 2 is faster Magical Elevator and Lv 3 is unstacked Teleportation Portal with distinct art', () => {
  const groundY = getGroundY(3);

  // 1. Unstacked Lv 1 stairs do NOT reach separated F1 room; upgrading both to Lv 3 connects them directly!
  const unstackedRoomsLv1: PlacedRoom[] = [
    makeRoom(1, 'entrance_hall', 2, 0),    // x=2..4, y=0
    makeRoom(2, 'spiral_stair', 1, 0, 1),  // x=1..2, y=0 (F0)
    makeRoom(3, 'corridor', 4, 1),         // x=4..5, y=1 (F1)
    makeRoom(4, 'spiral_stair', 5, 1, 1)   // x=5..6, y=1 (F1, not stacked over x=1!)
  ];
  const reachLv1 = computeReachability(unstackedRoomsLv1);
  assert.equal(reachLv1.get(4)?.reachable, false, 'Unstacked Lv 1 spiral stairs cannot reach F1');
  assert.equal(reachLv1.get(3)?.reachable, false, 'F1 corridor unreachable through unstacked Lv 1 stairs');

  const unstackedRoomsLv3 = unstackedRoomsLv1.map(r => (r.defId === 'spiral_stair' ? { ...r, level: 3 as const } : r));
  const reachLv3 = computeReachability(unstackedRoomsLv3);
  assert.equal(reachLv3.get(4)?.reachable, true, 'Unstacked Lv 3 portal at F1 is directly reachable');
  assert.equal(reachLv3.get(3)?.reachable, true, 'Rooms next to unstacked Lv 3 portal become reachable');

  const navLv3 = new NavGraph(unstackedRoomsLv3, groundY);
  const portalPath = navLv3.findPath('room-2-f0', 'room-4-f1');
  assert.ok(portalPath.length >= 2, 'NavGraph routes across unstacked Lv 3 portals');

  // 2. Lv 2 Magical Elevator uses lower NavGraph vertical cost and higher speed (MOVE_SPEED.elevator > MOVE_SPEED.climb)
  assert.ok(MOVE_SPEED.elevator > MOVE_SPEED.climb, 'Magical elevator moves faster than stair climb');
  const stackedLv1 = [
    makeRoom(1, 'entrance_hall', 2, 0),
    makeRoom(2, 'spiral_stair', 1, 0, 1),
    makeRoom(3, 'spiral_stair', 1, 1, 1)
  ];
  const stackedLv2 = stackedLv1.map(r => (r.defId === 'spiral_stair' ? { ...r, level: 2 as const } : r));
  const nav1 = new NavGraph(stackedLv1, groundY);
  const nav2 = new NavGraph(stackedLv2, groundY);
  const edge1 = nav1.adj.get('room-2-f0')!.find(e => e.to === 'room-3-f1')!;
  const edge2 = nav2.adj.get('room-2-f0')!.find(e => e.to === 'room-3-f1')!;
  assert.ok(edge2.cost < edge1.cost, `Lv 2 elevator edge cost (${edge2.cost}) < Lv 1 climb cost (${edge1.cost})`);

  // 3. Choreographer teleports agent between Lv 3 portals cleanly
  const s = createInitialGameState();
  const dormF1 = makeRoom(5, 'dormitory', 6, 1, 1, [
    { id: 5001, defId: 'simple_cot', slotKind: 'required:bed', damaged: false }
  ]);
  const portalRooms = [...unstackedRoomsLv3, dormF1];
  const c = makeChar(77, { bedRoomId: 5 });
  const portalState: FullGameState = {
    ...s,
    rooms: portalRooms,
    characters: [c],
    debugTimeHours: 23 // Sleep hour (clears stagger offset) -> F0 entrance -> F1 dormitory via Lv 3 portal
  };
  const portalNav = new NavGraph(portalRooms, groundY);
  const choreo = new Choreographer(portalNav, groundY);
  choreo.syncState(portalState, computeReachability(portalRooms));
  for (let i = 0; i < 400; i++) {
    choreo.tick(100, portalState, false);
  }
  const charAgent = choreo.agents.get('char-77')!;
  assert.equal(charAgent.currentRoomId, 5, 'Agent reaches F1 Dormitory across unstacked Lv 3 Teleportation Portals');
  assert.equal(charAgent.currentFloor, 1);

  // 4. Visual differentiation across spiral_stair Lv 1, Lv 2, Lv 3
  const opsByLevel = ([1, 2, 3] as const).map(lvl => {
    const rec = makeRecorder();
    const room = makeRoom(60, 'spiral_stair', 1, 0, lvl);
    const box = roomToWorldBox(room, groundY);
    drawRoomInterior(rec.p, room, box);
    return rec.ops.join('|');
  });
  assert.notEqual(opsByLevel[0], opsByLevel[1], 'Lv 1 Stairs differ visually from Lv 2 Magical Elevator');
  assert.notEqual(opsByLevel[1], opsByLevel[2], 'Lv 2 Magical Elevator differs visually from Lv 3 Teleportation Portal');
  assert.notEqual(opsByLevel[0], opsByLevel[2], 'Lv 1 Stairs differ visually from Lv 3 Teleportation Portal');
});

test('student_desk visually flips to face teachers_lectern and updates when lectern moves', () => {
  // 1. Standalone desk sprite is asymmetric under flipX (chair flips side to face R vs L)
  const rightFacing = makeRecorder();
  drawFurniture(rightFacing.p, 'student_desk', 40, 100, { flipX: false });
  const leftFacing = makeRecorder();
  drawFurniture(leftFacing.p, 'student_desk', 40, 100, { flipX: true });
  assert.notDeepEqual(rightFacing.ops, leftFacing.ops, 'student_desk flipX mirrors side-profile geometry');

  const groundY = getGroundY(3);
  const cls = makeRoom(80, 'class_arcane', 1, 0, 1, [
    { id: 8001, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false, x: 20, floor: 0, plane: 'floor' },
    { id: 8002, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false, x: 64, floor: 0, plane: 'floor' },
    { id: 8003, defId: 'student_desk', slotKind: 'required:student_desk', damaged: false, x: 56, floor: 0, plane: 'floor' }
  ]);
  const box = roomToWorldBox(cls, groundY);

  // Extract expected desk draw ops for right of lectern (flipX: true -> faces Left)
  const expectedLeftRec = makeRecorder();
  drawFurniture(expectedLeftRec.p, 'student_desk', box.left + 56, box.floorLineY, { flipX: true });
  const expectedRightRec = makeRecorder();
  drawFurniture(expectedRightRec.p, 'student_desk', box.left + 56, box.floorLineY, { flipX: false });

  // Classroom with lectern at x=20 and desk at x=56 -> desk must draw left-facing ops
  const roomLeftLectern = makeRecorder();
  drawRoomInterior(roomLeftLectern.p, cls, box);
  const roomLeftStream = roomLeftLectern.ops.join('|');
  assert.ok(roomLeftStream.includes(expectedLeftRec.ops.join('|')), 'Desk right of lectern faces Left toward lectern');
  assert.equal(roomLeftStream.includes(expectedRightRec.ops.join('|')), false, 'Desk right of lectern does not face Right');

  // Move lectern to x=108 (to the right of desk at x=56) -> same desk must flip to face Right!
  const clsMovedLectern: PlacedRoom = {
    ...cls,
    furniture: cls.furniture.map(f => (f.id === 8001 ? { ...f, x: 108 } : f))
  };
  const roomRightLectern = makeRecorder();
  drawRoomInterior(roomRightLectern.p, clsMovedLectern, box);
  const roomRightStream = roomRightLectern.ops.join('|');
  assert.ok(roomRightStream.includes(expectedRightRec.ops.join('|')), 'After lectern moves right, desk flips to face Right');
  assert.equal(roomRightStream.includes(expectedLeftRec.ops.join('|')), false, 'After lectern moves right, desk no longer faces Left');
});

test('freeroaming creatures receive MOVE_SPEED.elevator boost on Lv 2 Magical Elevator and teleport across Lv 3 portals', () => {
  const groundY = getGroundY(3);
  const worldW = getTotalWorldWidth(3);
  const base = createInitialGameState();
  const makeRoamer = (id: number, defId: string): CreatureInstance => ({
    id,
    defId,
    nickname: defId,
    status: 'tamed',
    hungry: false,
    hatchProgress: 10,
    tamingProgress: 10,
    bondLevel: 2,
    bondProgress: 0,
    arrivedDay: 1,
    roomId: 1
  });

  // 1. Stacked Lv 1 stairs vs Lv 2 Magical Elevator (scurry creature: bramblefox)
  const eh = makeRoom(1, 'entrance_hall', 2, 0);
  const stairF0Lv1 = makeRoom(2, 'spiral_stair', 1, 0, 1);
  const stairF1Lv1 = makeRoom(3, 'spiral_stair', 1, 1, 1);
  const dormF1 = makeRoom(4, 'dormitory', 2, 1, 1, [
    { id: 4001, defId: 'simple_cot', slotKind: 'required:bed', damaged: false }
  ]);

  const roomsLv1 = [eh, stairF0Lv1, stairF1Lv1, dormF1];
  const roomsLv2 = [eh, { ...stairF0Lv1, level: 2 as const }, { ...stairF1Lv1, level: 2 as const }, dormF1];

  const nav1 = new NavGraph(roomsLv1, groundY);
  const cc1 = new CreatureChoreographer(nav1, groundY, worldW);
  const state1: FullGameState = { ...base, rooms: roomsLv1, creatures: [makeRoamer(101, 'bramblefox')] };
  cc1.syncState(state1);
  const fox1 = cc1.agents.get(101)!;
  const f0Node = nav1.nodes.get('room-2-f0')!;
  const f1Node = nav1.nodes.get('room-3-f1')!;
  fox1.x = f0Node.x;
  fox1.y = f0Node.y;
  fox1.roamPath = [f0Node, f1Node];
  fox1.roamPathIdx = 1;

  const nav2 = new NavGraph(roomsLv2, groundY);
  const cc2 = new CreatureChoreographer(nav2, groundY, worldW);
  const state2: FullGameState = { ...base, rooms: roomsLv2, creatures: [makeRoamer(101, 'bramblefox')] };
  cc2.syncState(state2);
  const fox2 = cc2.agents.get(101)!;
  fox2.x = f0Node.x;
  fox2.y = f0Node.y;
  fox2.roamPath = [f0Node, f1Node];
  fox2.roamPathIdx = 1;

  // Tick 500ms: elevator moves at MOVE_SPEED.elevator (72 px/s -> 36 px), Lv 1 scurry moves 50 px/s -> 25 px
  for (let i = 0; i < 5; i++) {
    cc1.tick(100, state1, false);
    cc2.tick(100, state2, false);
  }
  const climbedLv1 = f0Node.y - fox1.y;
  const climbedLv2 = f0Node.y - fox2.y;
  assert.ok(climbedLv2 > climbedLv1, `Lv 2 elevator roamer climbed farther (${climbedLv2}px) than Lv 1 stairs (${climbedLv1}px)`);
  assert.ok(Math.abs(climbedLv2 - MOVE_SPEED.elevator * 0.5) < 0.5, `Elevator roamer matches MOVE_SPEED.elevator (${climbedLv2}px vs ${MOVE_SPEED.elevator * 0.5}px)`);

  // Tick another 400ms (total 900ms > 600ms scurry pause window): Lv 2 elevator completes climb without mid-lift scurry pause
  for (let i = 0; i < 4; i++) {
    cc2.tick(100, state2, false);
  }
  assert.equal(fox2.roamPath.length, 0, 'Lv 2 elevator roamer finishes ascent cleanly without pausing mid-shaft');
  assert.equal(fox2.y, f1Node.y);

  // 2. Unstacked Lv 3 Teleportation Portals: roaming creature jumps instantaneously between portal nodes
  const portalA = makeRoom(10, 'spiral_stair', 1, 0, 3);
  const portalB = makeRoom(11, 'spiral_stair', 5, 1, 3);
  const roomsLv3 = [eh, portalA, portalB, makeRoom(12, 'dormitory', 6, 1, 1, [{ id: 12001, defId: 'simple_cot', slotKind: 'required:bed', damaged: false }])];
  const nav3 = new NavGraph(roomsLv3, groundY);
  const cc3 = new CreatureChoreographer(nav3, groundY, worldW);
  const state3: FullGameState = { ...base, rooms: roomsLv3, creatures: [makeRoamer(102, 'bramblefox')] };
  cc3.syncState(state3);
  const fox3 = cc3.agents.get(102)!;
  const pNodeA = nav3.nodes.get('room-10-f0')!;
  const pNodeB = nav3.nodes.get('room-11-f1')!;
  fox3.x = pNodeA.x;
  fox3.y = pNodeA.y;
  fox3.roamPath = [pNodeA, pNodeB];
  fox3.roamPathIdx = 1;
  cc3.tick(50, state3, false);
  assert.equal(fox3.x, pNodeB.x, 'Roaming creature teleports X across Lv 3 Teleportation Portals');
  assert.equal(fox3.y, pNodeB.y, 'Roaming creature teleports Y across Lv 3 Teleportation Portals');
});

test('stair room display name changes per tier (Spiral Stair -> Magical Elevator -> Teleportation Portal)', () => {
  assert.equal(roomDisplayName('spiral_stair', 1), 'Spiral Stair');
  assert.equal(roomDisplayName('spiral_stair', 2), 'Magical Elevator');
  assert.equal(roomDisplayName('spiral_stair', 3), 'Teleportation Portal');
  assert.equal(roomDisplayName('dormitory', 3), 'Dormitory');

  const s = richState();
  const stair = makeRoom(90, 'spiral_stair', 1, 0, 1);
  s.rooms.push(stair);

  const renderStairWindow = (room: PlacedRoom) =>
    renderToStaticMarkup(
      <RoomWindow
        state={s}
        room={room}
        onClose={() => {}}
        onOpenScreen={() => {}}
        onResolveHazard={() => {}}
        onUpgrade={() => {}}
        onAddFurniture={() => {}}
        onRemoveFurniture={() => {}}
      />
    );

  const html1 = renderStairWindow(stair);
  assert.ok(html1.includes('Spiral Stair'), 'Lv 1 RoomWindow shows Spiral Stair');
  assert.ok(!html1.includes('aria-label="Magical Elevator window"'), 'Lv 1 RoomWindow dialog label is Spiral Stair');

  const up2 = AnkicasterEngine.upgradeRoom(s, 90);
  assert.equal(up2.success, true);
  const stair2 = up2.state.rooms.find(r => r.id === 90)!;
  assert.equal(roomDisplayName(stair2), 'Magical Elevator');
  assert.ok(up2.state.notices[up2.state.notices.length - 1].text.includes('Magical Elevator'));
  const html2 = renderStairWindow(stair2);
  assert.ok(html2.includes('aria-label="Magical Elevator window"'), 'Lv 2 RoomWindow title updates to Magical Elevator');

  const up3 = AnkicasterEngine.upgradeRoom(up2.state, 90);
  assert.equal(up3.success, true);
  const stair3 = up3.state.rooms.find(r => r.id === 90)!;
  assert.equal(roomDisplayName(stair3), 'Teleportation Portal');
  assert.ok(up3.state.notices[up3.state.notices.length - 1].text.includes('Teleportation Portal'));
  const html3 = renderStairWindow(stair3);
  assert.ok(html3.includes('aria-label="Teleportation Portal window"'), 'Lv 3 RoomWindow title updates to Teleportation Portal');

  const demolishHtml = renderToStaticMarkup(
    <DemolishConfirm state={up3.state} roomId={90} onCancel={() => {}} onConfirm={() => {}} />
  );
  assert.ok(demolishHtml.includes('Teleportation Portal'), 'DemolishConfirm uses Lv 3 Teleportation Portal name');
  assert.ok((roomLabelKeepOutRect(stair3)?.right ?? 0) >= (roomLabelKeepOutRect(stair)?.right ?? 0));
});

