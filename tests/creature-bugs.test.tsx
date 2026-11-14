import assert from 'node:assert/strict';
import test from 'node:test';
import { createInitialGameState } from '../src/data/initialState';
import { CREATURE_DEFINITIONS } from '../src/data/content';
import { AnkicasterEngine } from '../src/utils/engine';
import { penCreatureCapacity, resolveAllCreatureRooms } from '../src/utils/creatures';
import { fillRequiredFixtures } from '../src/utils/requiredFurniture';
import { fillPensPastCap } from '../src/debug/creatureDebug';
import { getGroundY, roomToWorldBox } from '../src/visual/layout/gridToWorld';
import { NavGraph } from '../src/visual/layout/navGraph';
import { CreatureChoreographer, getPenRect } from '../src/visual/creatures/creatureChoreographer';
import type { VisualAgent } from '../src/visual/agents/Choreographer';
import type { CreatureInstance, FullGameState, PlacedRoom } from '../src/types/ankicaster';

function makeRoom(id: number, defId: string, x: number, y: number, extra: Partial<PlacedRoom> = {}): PlacedRoom {
  return {
    id,
    defId,
    x,
    y,
    w: extra.w ?? (defId === 'menagerie' ? 3 : 1),
    h: extra.h ?? (defId === 'menagerie' || defId === 'aviary' ? 2 : 1),
    area: x < 0 || defId === 'meadow_paddock' || defId === 'pond' || defId === 'menagerie' || defId === 'aviary' ? 'grounds' : 'castle',
    level: 1,
    state: 'built',
    buildProgress: 1,
    buildRequired: 1,
    cleanliness: 100,
    furniture: [],
    settings: {},
    ...extra
  };
}

function makeCreature(id: number, defId: string, extra: Partial<CreatureInstance> = {}): CreatureInstance {
  return {
    id,
    defId,
    nickname: CREATURE_DEFINITIONS[defId]?.name ?? defId,
    status: 'tamed',
    arrivedDay: 1,
    hatchProgress: 100,
    tamingProgress: 0,
    bondLevel: 1,
    bondProgress: 0,
    hungry: false,
    ...extra
  };
}

function setupWorld(rooms: PlacedRoom[]): { state: FullGameState; groundY: number; cc: CreatureChoreographer } {
  const state = createInitialGameState();
  state.rooms = rooms;
  const maxFloor = Math.max(0, ...rooms.map(r => r.y + r.h - 1));
  const groundY = getGroundY(maxFloor);
  const nav = new NavGraph(rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, 2400);
  return { state, groundY, cc };
}

test('1. Wary/hungry/tamer-present run through species movement (rooted <=2px, aviary perch loop, water stays in water)', () => {
  const paddock = makeRoom(10, 'meadow_paddock', -2, 0);
  const aviary = makeRoom(11, 'aviary', -4, 0, { w: 1, h: 2 });
  const tideTank = makeRoom(12, 'tide_tank', -5, 0);
  const eh = makeRoom(1, 'entrance_hall', 0, 0);
  const { state, groundY, cc } = setupWorld([eh, paddock, aviary, tideTank]);

  state.creatures = [
    makeCreature(1, 'elder_treant_sprout', { status: 'wary', roomId: paddock.id }),
    makeCreature(2, 'dawn_finch', { status: 'wary', roomId: aviary.id }),
    makeCreature(3, 'coral_kelpie', { status: 'wary', roomId: tideTank.id }),
    makeCreature(4, 'coral_kelpie', { status: 'tamed', hungry: true, roomId: tideTank.id })
  ];
  cc.syncState(state);

  const rootedStartX = cc.agents.get(1)!.anchorX;
  let maxRootedDisp = 0;
  const aviaryModes = new Set<string>();
  const tankPen = getPenRect(tideTank, groundY, 'tide', 0);

  for (let i = 0; i < 80; i++) {
    cc.tick(100, state, false);
    const rooted = cc.agents.get(1)!;
    maxRootedDisp = Math.max(maxRootedDisp, Math.abs(rooted.x - rootedStartX));

    const finch = cc.agents.get(2)!;
    if (finch.flightMode) aviaryModes.add(finch.flightMode);

    for (const kid of [3, 4]) {
      const k = cc.agents.get(kid)!;
      assert.ok(k.y >= tankPen.topY - 0.5 && k.y <= tankPen.floorY + 0.5, `kelpie ${kid} stays in water`);
      assert.ok(k.x >= tankPen.left - 0.5 && k.x <= tankPen.right + 0.5, `kelpie ${kid} stays in tank X`);
    }
  }

  assert.ok(maxRootedDisp <= 2, `wary rooted creature displacement ${maxRootedDisp} <= 2px`);
  assert.ok(aviaryModes.has('takeoff') || aviaryModes.has('cruise'), `wary aviary bird enters perch flight loop (${Array.from(aviaryModes).join(',')})`);
});

test('2 & 3. Scurry roam path dashes then pauses; roaming hop & hover use drawOffsetY (0 on sleep/stairs/reduceMotion)', () => {
  const eh = makeRoom(1, 'entrance_hall', 0, 0);
  const hall = makeRoom(2, 'hallway', 1, 0);
  const stair = makeRoom(3, 'spiral_stair', 2, 0);
  const dorm = makeRoom(4, 'dormitory', 0, 1);
  const stairUp = makeRoom(5, 'spiral_stair', 2, 1);
  const { state, cc } = setupWorld([eh, hall, stair, dorm, stairUp]);

  state.creatures = [
    makeCreature(1, 'duskmouse', { status: 'tamed', roomId: eh.id }),
    makeCreature(2, 'thistle_hare', { status: 'tamed', roomId: eh.id }),
    makeCreature(3, 'inkling_wisp', { status: 'tamed', roomId: eh.id })
  ];
  // Force hop & hover to be tested on roamPath as well
  cc.syncState(state);
  const mouse = cc.agents.get(1)!;
  const hare = cc.agents.get(2)!;
  const wisp = cc.agents.get(3)!;

  const flatPath = [
    { id: 'n1', roomId: eh.id, x: 40, y: cc.groundY - 4, floor: 0, kind: 'room_floor' as const },
    { id: 'n2', roomId: hall.id, x: 260, y: cc.groundY - 4, floor: 0, kind: 'room_floor' as const }
  ];
  mouse.x = flatPath[0].x;
  mouse.y = flatPath[0].y;
  mouse.roamPath = [...flatPath];
  mouse.roamPathIdx = 1;

  let sawMove = false;
  let sawPause = false;
  let sawDashAfterPause = false;
  for (let i = 0; i < 40; i++) {
    const prevX = mouse.x;
    cc.tick(100, state, false);
    if (mouse.anim === 'move' && Math.abs(mouse.x - prevX) > 0.1) {
      if (!sawPause) sawMove = true;
      else sawDashAfterPause = true;
    } else if (mouse.anim === 'idle' && Math.abs(mouse.x - prevX) === 0 && mouse.roamPath.length > 0) {
      if (sawMove) sawPause = true;
    }
  }
  assert.ok(sawMove && sawPause && sawDashAfterPause, 'scurry on roamPath dashes, pauses, and dashes again');

  // Hop & hover drawOffsetY
  hare.roaming = true;
  hare.x = flatPath[0].x;
  hare.y = flatPath[0].y;
  hare.roamPath = [...flatPath];
  hare.roamPathIdx = 1;

  wisp.roaming = true;
  wisp.x = flatPath[0].x;
  wisp.y = flatPath[0].y;
  wisp.roamPath = [...flatPath];
  wisp.roamPathIdx = 1;

  let hareOffset = 0;
  let wispOffset = 0;
  for (let i = 0; i < 10; i++) {
    cc.tick(70, state, false);
    if ((hare.drawOffsetY ?? 0) < -0.5) hareOffset = hare.drawOffsetY!;
    if ((wisp.drawOffsetY ?? 0) < -0.5) wispOffset = wisp.drawOffsetY!;
  }
  assert.ok(hareOffset < -0.5, `hop roamer has negative drawOffsetY (${hareOffset})`);
  assert.ok(wispOffset < -0.5, `hover roamer has negative drawOffsetY (${wispOffset})`);

  // On stairs -> drawOffsetY === 0
  wisp.x = 200;
  wisp.y = cc.groundY - 4;
  wisp.roamPath = [{ id: 'st', roomId: stair.id, x: 200, y: cc.groundY - 60, floor: 1, kind: 'stair' }];
  wisp.roamPathIdx = 0;
  cc.tick(100, state, false);
  assert.equal(wisp.drawOffsetY ?? 0, 0, 'hover drawOffsetY is 0 on stairs');

  // Sleeping -> drawOffsetY === 0
  wisp.roamNapTimerMs = 1000;
  cc.tick(100, state, false);
  assert.equal(wisp.drawOffsetY ?? 0, 0, 'hover drawOffsetY is 0 while sleeping');

  // reduceMotion -> drawOffsetY === 0
  wisp.roamNapTimerMs = 0;
  wisp.roamPath = [...flatPath];
  wisp.roamPathIdx = 1;
  cc.tick(100, state, true);
  assert.equal(wisp.drawOffsetY ?? 0, 0, 'drawOffsetY is 0 under reduceMotion');
});

test('4. Menagerie bay uses installed module matching creature habitat on syncState and tick', () => {
  const eh = makeRoom(1, 'entrance_hall', 0, 0);
  const menagerie = makeRoom(20, 'menagerie', -4, 0, {
    w: 3,
    h: 2,
    settings: { modules: ['meadow', 'sky', 'tide'] }
  });
  const { state, groundY, cc } = setupWorld([eh, menagerie]);

  state.creatures = [makeCreature(1, 'coral_kelpie', { status: 'tamed', roomId: menagerie.id })];
  const res = resolveAllCreatureRooms(state.creatures, state.rooms).get(1)!;
  assert.equal(res.subBayIndex, 2, 'tide creature resolves to bay 2');

  cc.syncState(state);
  const agent = cc.agents.get(1)!;
  assert.equal(agent.bay, 2);
  assert.equal(agent.habitat, 'tide');

  const bay2Pen = getPenRect(menagerie, groundY, 'tide', 2);
  assert.equal(bay2Pen.isWater, true);
  for (let i = 0; i < 40; i++) {
    cc.tick(100, state, false);
    assert.ok(agent.x >= bay2Pen.left - 0.5 && agent.x <= bay2Pen.right + 0.5, 'kelpie stays in bay 2 X');
    assert.ok(agent.y >= bay2Pen.topY - 0.5 && agent.y <= bay2Pen.floorY + 0.5, 'kelpie stays in bay 2 water Y');
  }
});

test('5. Eggs hatch on honest review only in built matching habitat pens (including tamerId 0, excluding vault/EH/site)', () => {
  let state = createInitialGameState();
  const paddock = makeRoom(10, 'meadow_paddock', -2, 0);
  const vault = makeRoom(11, 'storage_vault', 1, 0);
  const sitePen = makeRoom(12, 'ember_pit', -3, 0, { state: 'site', buildProgress: 0, buildRequired: 100 });
  state.rooms.push(paddock, vault, sitePen);

  state.creatures = [
    makeCreature(1, 'thistle_hare', { status: 'egg', hatchProgress: 0, roomId: paddock.id, tamerId: 0 }), // common -> 20 reviews
    makeCreature(2, 'bramblefox', { status: 'egg', hatchProgress: 0, roomId: vault.id }), // vault -> no advance
    makeCreature(3, 'cinder_newt', { status: 'egg', hatchProgress: 0, roomId: sitePen.id }) // site -> no advance
  ];

  for (let i = 0; i < 19; i++) {
    state = AnkicasterEngine.applyHonestReview(state, 100 + i, 3).state;
  }
  assert.equal(state.creatures[0].status, 'egg');
  assert.ok(state.creatures[0].hatchProgress >= 94 && state.creatures[0].hatchProgress < 100);

  state = AnkicasterEngine.applyHonestReview(state, 200, 3).state;
  assert.equal(state.creatures[0].status, 'wary', 'common egg hatches into wary on 20th review');
  assert.equal(state.creatures[0].hatchProgress, 100);

  // Vault & site eggs never advanced
  assert.equal(state.creatures[1].hatchProgress, 0);
  assert.equal(state.creatures[2].hatchProgress, 0);
});

test('6. Global draw cap never hides eggs even with 40 loose creatures', () => {
  const eh = makeRoom(1, 'entrance_hall', 0, 0);
  const paddock = makeRoom(10, 'meadow_paddock', -2, 0);
  const { state, cc } = setupWorld([eh, paddock]);

  state.creatures = [
    ...Array.from({ length: 40 }, (_, i) => makeCreature(i + 1, 'bramblefox', { status: 'loose' })),
    makeCreature(999, 'thistle_hare', { status: 'egg', hatchProgress: 20, roomId: paddock.id })
  ];
  cc.syncState(state);
  assert.equal(cc.agents.has(999), true, 'egg is still drawn alongside 40 loose creatures');
});

test('7. Explicit roomId respects penCreatureCapacity and fillPensPastCap reports actual Gloom Hutch cap (2)', () => {
  const state = createInitialGameState();
  const hutch = makeRoom(10, 'gloom_hutch', -2, 0);
  state.rooms.push(hutch);
  assert.equal(penCreatureCapacity(hutch), 2);

  state.creatures = [
    makeCreature(1, 'duskmouse', { status: 'wary', roomId: hutch.id }),
    makeCreature(2, 'duskmouse', { status: 'wary', roomId: hutch.id }),
    makeCreature(3, 'duskmouse', { status: 'wary', roomId: hutch.id })
  ];
  const map = resolveAllCreatureRooms(state.creatures, state.rooms);
  assert.equal(map.get(1)?.room?.id, hutch.id);
  assert.equal(map.get(2)?.room?.id, hutch.id);
  assert.equal(map.get(3)?.unhomed, true, '3rd creature deferred when explicit 1x1 gloom_hutch cap (2) is full');

  const dbg = fillPensPastCap(state);
  assert.ok(dbg.message.includes('past 2'), `fillPensPastCap message reports actual cap 2: ${dbg.message}`);
});

test('8. Follow-tamer works with tamerId === 0 (wizard)', () => {
  const eh = makeRoom(1, 'entrance_hall', 0, 0);
  const hall = makeRoom(2, 'hallway', 1, 0);
  const study = makeRoom(3, 'wizard_study', 2, 0);
  const { state, groundY, cc } = setupWorld([eh, hall, study]);
  const studyBox = roomToWorldBox(study, groundY);

  state.creatures = [makeCreature(1, 'phase_ferret', { status: 'tamed', tamerId: 0, roomId: eh.id })];
  cc.syncState(state);

  const wizAgent: VisualAgent = {
    id: 'wizard',
    name: 'Wizard',
    isWizard: true,
    x: studyBox.left + 30,
    y: cc.groundY - 4,
    targetX: studyBox.left + 30,
    targetY: cc.groundY - 4,
    currentFloor: 0,
    targetFloor: 0,
    facing: 'R',
    anim: 'idle',
    animFrame: 0,
    animTimer: 0,
    activity: 'free_time',
    currentRoomId: study.id,
    targetRoomId: study.id,
    path: [],
    pathIndex: 0,
    robeColor: '#6b4fbb',
    hairColor: '#3a2a1e',
    skin: '#f6d7c3',
    hat: 'wizard',
    hair: 'short'
  };
  const charAgents = new Map<string, VisualAgent>([['wizard', wizAgent]]);

  let visitedStudy = false;
  for (let i = 0; i < 150; i++) {
    cc.tick(100, state, false, charAgents);
    const ferret = cc.agents.get(1)!;
    if (ferret.roamPath.some(n => n.roomId === study.id)) {
      visitedStudy = true;
      break;
    }
  }
  assert.ok(visitedStudy, 'roaming companion with tamerId=0 follows wizard to wizard_study');
});

test('9. Meal bell sets hungry when diet unaffordable and halves yields / disables tortoise & moonsheep', () => {
  let state = createInitialGameState();
  const greenhouse = makeRoom(10, 'greenhouse', -2, 0);
  const weave = makeRoom(11, 'weaving_room', 1, 0);
  state.rooms = [greenhouse, weave];

  state.creatures = [
    makeCreature(1, 'thistle_hare', { status: 'tamed', hungry: false }),
    makeCreature(2, 'mossback_tortoise', { status: 'tamed', hungry: false }),
    makeCreature(3, 'moonsheep', { status: 'tamed', hungry: false })
  ];

  // Empty food -> meal bell (bellIndex === 5) sets hungry = true without partial deduction
  state.bellIndex = 5;
  Object.assign(state.resources, { provisions: 0, greens: 0.1, herbs: 0, cloth: 0, nectar: 0 });
  AnkicasterEngine.ringBell(state, []);
  assert.equal(state.creatures[0].hungry, true);
  assert.equal(state.creatures[1].hungry, true);
  assert.equal(state.creatures[2].hungry, true);
  assert.equal(state.resources.greens, 0.1, 'no partial diet deducted');

  // Hungry thistle_hare yields 0.05 herbs instead of 0.1
  const s2 = createInitialGameState();
  s2.bellIndex = 1;
  s2.resources.herbs = 0;
  s2.creatures = [makeCreature(1, 'thistle_hare', { status: 'tamed', hungry: true })];
  AnkicasterEngine.ringBell(s2, []);
  assert.ok(Math.abs((s2.resources.herbs || 0) - 0.05) < 1e-6, `hungry thistle_hare yields 0.05 herbs (got ${s2.resources.herbs})`);

  // Hungry moonsheep halves its +100% weaving bonus (+50% => 1.5x vs 2.0x when fed)
  const sWeaveHungry = createInitialGameState();
  sWeaveHungry.bellIndex = 1;
  sWeaveHungry.resources.cloth = 0;
  const weaveH = makeRoom(20, 'weaving_room', 2, 0, { area: 'castle' });
  fillRequiredFixtures(weaveH, new Set<number>());
  sWeaveHungry.rooms.push(weaveH);
  sWeaveHungry.creatures = [makeCreature(1, 'moonsheep', { status: 'tamed', hungry: true })];
  AnkicasterEngine.ringBell(sWeaveHungry, []);
  const clothHungry = sWeaveHungry.resources.cloth || 0;

  const sWeaveFed = createInitialGameState();
  sWeaveFed.bellIndex = 1;
  sWeaveFed.resources.cloth = 0;
  const weaveF = makeRoom(20, 'weaving_room', 2, 0, { area: 'castle' });
  fillRequiredFixtures(weaveF, new Set<number>());
  sWeaveFed.rooms.push(weaveF);
  sWeaveFed.creatures = [makeCreature(1, 'moonsheep', { status: 'tamed', hungry: false })];
  AnkicasterEngine.ringBell(sWeaveFed, []);
  const clothFed = sWeaveFed.resources.cloth || 0;
  assert.ok(clothHungry > 0 && clothFed > clothHungry && Math.abs(clothFed / clothHungry - 4 / 3) < 1e-6, `fed moonsheep (${clothFed}) is 4/3 of hungry moonsheep (${clothHungry})`);
});
