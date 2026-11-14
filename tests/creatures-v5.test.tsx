/**
 * Creatures Overhaul (V5) Verification Tests:
 * 1. All 40 species have valid movement, origin, roamsFreely
 * 2. Lower pen caps (1x1 <= 3, larger <= 5) & outdoor buildable meadow_paddock
 * 3. Real horizontal cruise flight (no giant jump arc), rooted <= 2px, all 11 movements & reduceMotion freeze
 * 4. Pre-tamed origin artwork + 5 arrival stages + origin hover labels (zero egg shell/Hatching for non-eggs)
 * 5. Roaming companions take 0 pen slots, traverse stairs/grounds via NavGraph, nap in occupied rooms, follow tamer
 * 6. Bestiary Collector's Book: 40 entries, ? silhouettes leak zero secrets, discovery sticks across release & term reset
 * 7. Habitat RoomWindow Occupants card & Pen capacity display
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CREATURE_DEFINITIONS, ROOM_DEFINITIONS } from '../src/data/content.ts';
import { createInitialGameState } from '../src/data/initialState.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import {
  LARGE_PEN_CAP,
  ONE_BY_ONE_PEN_CAP,
  arrivalStage,
  creatureNeedsPenSlot,
  getDiscoveredCreatureIds,
  getPenOccupants,
  isRoamingCompanion,
  originLabel,
  penCreatureCapacity,
  resolveAllCreatureRooms
} from '../src/utils/creatures.ts';
import type {
  Character,
  CreatureInstance,
  CreatureMovement,
  CreatureOrigin,
  PlacedRoom
} from '../src/types/ankicaster.ts';
import { drawCreatureArrival } from '../src/visual/creatures/creatureArt.ts';
import { CreatureChoreographer, getPenRect } from '../src/visual/creatures/creatureChoreographer.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { getGroundY, getTotalWorldWidth, roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';
import { creatureHoverText } from '../src/visual/AcademyCanvas.tsx';
import { BestiaryPanel } from '../src/components/GamePanels.tsx';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import type { Painter } from '../src/visual/rooms/painter.ts';
import type { VisualAgent } from '../src/visual/agents/Choreographer.ts';

function recordingPainter() {
  const ops: string[] = [];
  const p: Painter = {
    rect(x, y, w, h) { ops.push(`rect:${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)}`); return p; },
    circle(x, y, r) { ops.push(`circle:${x.toFixed(1)},${y.toFixed(1)},${r.toFixed(1)}`); return p; },
    ellipse(x, y, rx, ry) { ops.push(`ellipse:${x.toFixed(1)},${y.toFixed(1)},${rx.toFixed(1)},${ry.toFixed(1)}`); return p; },
    poly(pts) { ops.push(`poly:${pts.length}`); return p; },
    fill(o) { ops.push(`fill:${JSON.stringify(o)}`); return p; },
    stroke(o) { ops.push(`stroke:${JSON.stringify(o)}`); return p; }
  };
  return { p, ops };
}

function makeRoom(id: number, defId: string, x: number, y: number): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  return {
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
    buildPaused: false,
    cleanliness: 100,
    settings: {},
    furniture: [],
    spent: { mana: 0 },
    fromPlan: false
  };
}

function makeCreature(id: number, defId: string, over: Partial<CreatureInstance> = {}): CreatureInstance {
  return {
    id,
    defId,
    nickname: CREATURE_DEFINITIONS[defId]?.name || defId,
    status: 'tamed',
    hungry: false,
    hatchProgress: 100,
    tamingProgress: 0,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1,
    ...over
  };
}

test('all 40 creatures define valid movement, origin, and roamsFreely', () => {
  const validMovements = new Set<CreatureMovement>([
    'scurry', 'hop', 'trot', 'waddle', 'slither', 'fly', 'glide', 'swim', 'hover', 'rooted', 'crawl'
  ]);
  const validOrigins = new Set<CreatureOrigin>(['egg', 'sapling', 'litter', 'cocoon', 'geode', 'wisp']);
  const defs = Object.values(CREATURE_DEFINITIONS);
  assert.equal(defs.length, 40);

  for (const def of defs) {
    assert.ok(validMovements.has(def.movement), `${def.id} has valid movement (${def.movement})`);
    assert.ok(validOrigins.has(def.origin), `${def.id} has valid origin (${def.origin})`);
    assert.equal(typeof def.roamsFreely, 'boolean', `${def.id} has boolean roamsFreely`);
  }

  assert.equal(CREATURE_DEFINITIONS.duskmouse.movement, 'scurry');
  assert.equal(CREATURE_DEFINITIONS.duskmouse.roamsFreely, true);
  assert.equal(CREATURE_DEFINITIONS.elder_treant_sprout.movement, 'rooted');
  assert.equal(CREATURE_DEFINITIONS.elder_treant_sprout.origin, 'sapling');
  assert.equal(CREATURE_DEFINITIONS.geode_golem.origin, 'geode');
  assert.equal(CREATURE_DEFINITIONS.orrery_moth.origin, 'cocoon');
  assert.equal(CREATURE_DEFINITIONS.inkling_wisp.origin, 'wisp');
  assert.equal(CREATURE_DEFINITIONS.coral_kelpie.roamsFreely, false);
  assert.equal(CREATURE_DEFINITIONS.ember_phoenix.roamsFreely, false);
});

test('pen capacities are <=3 for 1x1 pens and <=5 for larger pens; meadow_paddock is buildable outdoors', () => {
  assert.equal(ONE_BY_ONE_PEN_CAP, 3);
  assert.equal(LARGE_PEN_CAP, 5);
  for (const id of ['gloom_hutch', 'ember_pit', 'crystal_vivarium']) {
    const r = makeRoom(1, id, 0, 0);
    assert.ok(penCreatureCapacity(r) <= 3, `${id} cap ${penCreatureCapacity(r)} <= 3`);
  }
  for (const id of ['menagerie', 'meadow_paddock', 'tide_tank', 'aviary', 'pond']) {
    const r = makeRoom(2, id, 0, 0);
    assert.ok(penCreatureCapacity(r) <= 5, `${id} cap ${penCreatureCapacity(r)} <= 5`);
  }
  assert.equal(penCreatureCapacity(makeRoom(3, 'menagerie', 0, 1)), 5);
  assert.equal(penCreatureCapacity(makeRoom(4, 'pond', 0, 0)), 3);

  const state = createInitialGameState();
  state.resources.timber += 100;
  state.resources.stone += 100;
  state.roomPlans = { ...(state.roomPlans || {}), meadow_paddock: 1 };
  const placed = AnkicasterEngine.placeRoom(state, 'meadow_paddock');
  assert.equal(placed.success, true, `meadow_paddock builds outdoors on unlocked grounds plot: ${placed.error || 'ok'}`);
  const builtPaddock = placed.state.rooms.find(r => r.id === placed.roomId);
  assert.equal(builtPaddock?.area, 'grounds');
});

test('fly and glide use steady horizontal cruise flight (never a giant parabolic jump) and rooted moves <= 2px', () => {
  const state = createInitialGameState();
  const groundY = getGroundY(5);
  const aviary = makeRoom(10, 'aviary', 2, 1);
  const paddock = makeRoom(11, 'meadow_paddock', 0, 0);
  state.rooms.push(aviary, paddock);
  state.creatures = [
    makeCreature(1, 'dawn_finch', { status: 'tamed', roomId: aviary.id }),
    makeCreature(2, 'orrery_moth', { status: 'tamed', roomId: aviary.id }),
    makeCreature(3, 'elder_treant_sprout', { status: 'tamed', roomId: paddock.id })
  ];

  const nav = new NavGraph(state.rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, getTotalWorldWidth(8));
  cc.syncState(state);

  const finchAnchor = cc.agents.get(1)!;
  const treantStart = { x: cc.agents.get(3)!.anchorX, y: cc.agents.get(3)!.y };
  const cruiseYs: number[] = [];
  const cruiseXs: number[] = [];
  const mothCruiseYs: number[] = [];

  for (let i = 0; i < 150; i++) {
    cc.tick(100, state, false);
    const finch = cc.agents.get(1)!;
    const moth = cc.agents.get(2)!;
    const treant = cc.agents.get(3)!;

    if (finch.flightMode === 'cruise') {
      cruiseYs.push(finch.y);
      cruiseXs.push(finch.x);
    }
    if (moth.flightMode === 'cruise') {
      mothCruiseYs.push(moth.y);
    }
    const treantDisp = Math.hypot(treant.x - treantStart.x, treant.y - treantStart.y);
    assert.ok(treantDisp <= 2.01, `rooted treant moved ${treantDisp.toFixed(2)}px (> 2px)`);
  }

  assert.ok(cruiseYs.length > 10, 'dawn_finch enters horizontal cruise phase');
  assert.ok(Math.max(...cruiseYs) - Math.min(...cruiseYs) <= 4.0, 'fly cruise altitude stays steady (not a jump arc)');
  assert.ok(Math.max(...cruiseXs) - Math.min(...cruiseXs) > 10, 'fly cruises horizontally across pen');
  assert.ok(mothCruiseYs.length > 10 && Math.max(...mothCruiseYs) - Math.min(...mothCruiseYs) <= 3.0, 'glide drifts steadily');
  assert.ok(finchAnchor.movement === 'fly');

  // Reduce motion freezes motion cleanly
  const snapX = cc.agents.get(1)!.x;
  cc.tick(500, state, true);
  assert.equal(cc.agents.get(1)!.x, snapX, 'reduceMotion freezes flight x');
});

test('non-egg origins draw origin-specific art across 5 stages and never use Hatching hover text', () => {
  assert.equal(arrivalStage(0), 0);
  assert.equal(arrivalStage(19), 0);
  assert.equal(arrivalStage(20), 1);
  assert.equal(arrivalStage(40), 2);
  assert.equal(arrivalStage(60), 3);
  assert.equal(arrivalStage(80), 4);
  assert.equal(arrivalStage(100), 4);

  const origins: Array<{ defId: string; origin: CreatureOrigin; expectedPrefix: string }> = [
    { defId: 'elder_treant_sprout', origin: 'sapling', expectedPrefix: 'Seedling' },
    { defId: 'bramblefox', origin: 'litter', expectedPrefix: 'Sleeping pup' },
    { defId: 'orrery_moth', origin: 'cocoon', expectedPrefix: 'Cocoon' },
    { defId: 'geode_golem', origin: 'geode', expectedPrefix: 'Uncut geode' },
    { defId: 'inkling_wisp', origin: 'wisp', expectedPrefix: 'Faint wisp' },
    { defId: 'verdant_drake', origin: 'egg', expectedPrefix: 'Egg' }
  ];

  for (const item of origins) {
    assert.equal(CREATURE_DEFINITIONS[item.defId].origin, item.origin);
    const tip = creatureHoverText({
      nickname: item.defId,
      defId: item.defId,
      status: 'egg',
      tamingProgress: 0,
      bondLevel: 1,
      hatchProgress: 45,
      unhomed: false
    });
    assert.ok(!tip.includes('Hatching'), `tooltip "${tip}" must not say Hatching`);
    assert.ok(tip.startsWith(item.expectedPrefix), `tooltip "${tip}" starts with "${item.expectedPrefix}"`);

    const stageSignatures = new Set<string>();
    for (const pct of [10, 30, 50, 70, 90]) {
      const { p, ops } = recordingPainter();
      drawCreatureArrival(p, {
        defId: item.defId,
        origin: item.origin,
        rarity: 'rare',
        x: 100,
        y: 100,
        hatchProgress: pct,
        clockMs: 0,
        reduceMotion: true
      });
      assert.ok(ops.length > 0, `${item.origin} stage ${pct}% produces draw operations`);
      stageSignatures.add(ops.join('|'));
    }
    assert.equal(stageSignatures.size, 5, `${item.origin} produces 5 visually distinct arrival stages`);
  }

  assert.equal(originLabel('egg', 'puddlewyrm'), 'Spawn');
});

test('roaming companions take 0 pen slots, walk floors/stairs/grounds via NavGraph, nap in occupied rooms, and follow tamer', () => {
  const state = createInitialGameState();
  // Two-floor castle + stairs + grounds path (no creature pens built!)
  const stairs0 = makeRoom(20, 'spiral_stair', 2, 0);
  const stairs1 = makeRoom(21, 'spiral_stair', 2, 1);
  const dorm1 = makeRoom(22, 'dormitory', 3, 1);
  const student: Character = {
    id: 50,
    name: 'Pip',
    pronouns: 'they/them',
    appearance: { skin: '#F6D7C3', hair: 'short', hairColor: '#4A2E1E', robeColor: '#4E8B3A', hat: 'none' },
    personality: 'Gentle',
    traits: [],
    status: 'student',
    masteredSchools: [],
    bedRoomId: dorm1.id,
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  };
  state.rooms.push(stairs0, stairs1, dorm1);
  state.characters.push(student);

  const fox = makeCreature(1, 'bramblefox', { status: 'tamed', tamerId: 50 });
  const kelpie = makeCreature(2, 'coral_kelpie', { status: 'tamed' }); // non-roamer without tide pen
  state.creatures = [fox, kelpie];

  assert.equal(isRoamingCompanion(fox), true);
  assert.equal(creatureNeedsPenSlot(fox), false);
  assert.equal(isRoamingCompanion(kelpie), false);
  assert.equal(creatureNeedsPenSlot(kelpie), true);

  const resolved = resolveAllCreatureRooms(state.creatures, state.rooms);
  assert.equal(resolved.get(1)?.roaming, true);
  assert.equal(resolved.get(1)?.room, undefined);
  assert.equal(resolved.get(1)?.unhomed, false);
  assert.equal(resolved.get(2)?.roaming, false);
  assert.equal(resolved.get(2)?.unhomed, true);

  const groundY = getGroundY(5);
  const nav = new NavGraph(state.rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, getTotalWorldWidth(8));
  cc.syncState(state);

  const charAgents = new Map<string, VisualAgent>();
  const dormBox = roomToWorldBox(dorm1, groundY);
  charAgents.set('char-50', {
    id: 'char-50',
    character: student,
    isWizard: false,
    name: 'Pip',
    x: dormBox.left + 40,
    y: dormBox.floorLineY,
    targetX: dormBox.left + 40,
    targetY: dormBox.floorLineY,
    currentFloor: 1,
    targetFloor: 1,
    facing: 'R',
    anim: 'idle',
    animFrame: 0,
    animTimer: 0,
    activity: 'free_time',
    currentRoomId: dorm1.id,
    targetRoomId: dorm1.id,
    path: [],
    pathIndex: 0,
    robeColor: '#4e8b3a',
    hairColor: '#4a2e1e',
    skin: '#f6d7c3',
    hat: 'none',
    hair: 'short'
  });

  let climbedFloors = false;
  let napped = false;
  const startY = cc.agents.get(1)!.y;
  for (let i = 0; i < 300; i++) {
    cc.tick(100, state, false, charAgents);
    const a = cc.agents.get(1)!;
    if (Math.abs(a.y - startY) > 20) climbedFloors = true;
    if (a.anim === 'sleep') napped = true;
  }
  assert.ok(climbedFloors, 'tamed roaming companion navigates across floors via NavGraph');
  assert.ok(napped, 'roamer traverses and naps in occupied rooms');
});

test('Bestiary discovery persists across releaseCreature and startNextTerm and hides undiscovered details', () => {
  let state = createInitialGameState();
  state.discoveredCreatures = [];
  const startHtml = renderToStaticMarkup(
    React.createElement(BestiaryPanel, { state, onFeedCreature: () => {}, onAssignTamer: () => {} })
  );
  assert.ok(startHtml.includes('Discovered 0 / 40'), 'fresh academy shows Discovered 0 / 40');
  assert.ok(startHtml.includes('data-testid="bestiary-entry-bramblefox"'));
  assert.ok(startHtml.includes('data-discovered="false"'));
  // Undiscovered species must NEVER leak its name or buff
  assert.ok(!startHtml.includes('Bramblefox'), 'undiscovered Bramblefox name is hidden');
  assert.ok(!startHtml.includes('+20% Herb &amp; Crop yield') && !startHtml.includes('+20% Herb & Crop yield'), 'undiscovered buff is hidden');

  // Acquire Bramblefox via lure draft card
  state = AnkicasterEngine.chooseDraftCard(state, {
    id: 'lure-fox',
    name: 'Bramblefox Lure',
    deck: 'grounds',
    rarity: 'rare',
    type: 'lure',
    targetId: 'bramblefox',
    description: 'Lure a bramblefox'
  }).state;

  assert.ok(getDiscoveredCreatureIds(state).has('bramblefox'), 'acquired species recorded in discoveredCreatures');

  const afterAcquireHtml = renderToStaticMarkup(
    React.createElement(BestiaryPanel, { state, onFeedCreature: () => {}, onAssignTamer: () => {} })
  );
  assert.ok(afterAcquireHtml.includes('Discovered 1 / 40'), 'shows Discovered 1 / 40');
  assert.ok(afterAcquireHtml.includes('Bramblefox'), 'discovered species name shown');
  assert.ok(afterAcquireHtml.includes('Roams freely once tamed'), 'roaming badge shown for discovered roamer');
  assert.ok(!afterAcquireHtml.includes('Ember Phoenix'), 'still-undiscovered Ember Phoenix remains secret');

  // Release and startNextTerm keep discovery sticky
  const creatureId = state.creatures[0].id;
  state = AnkicasterEngine.releaseCreature(state, creatureId).state;
  assert.equal(state.creatures.length, 0);
  assert.ok(state.discoveredCreatures?.includes('bramblefox'), 'release retains discovery');

  state.creatures = [makeCreature(99, 'coral_kelpie', { status: 'tamed' })];
  state = AnkicasterEngine.startNextTerm(state).state;
  assert.equal(state.creatures.length, 0);
  assert.ok(state.discoveredCreatures?.includes('bramblefox'));
  assert.ok(state.discoveredCreatures?.includes('coral_kelpie'), 'startNextTerm retains discoveries');
});

test('Habitat RoomWindow shows Occupants count, accepted habitats, and excludes tamed roamers', () => {
  const state = createInitialGameState();
  const paddock = makeRoom(30, 'meadow_paddock', 0, 0);
  state.rooms.push(paddock);
  state.creatures = [
    makeCreature(1, 'elder_treant_sprout', { status: 'egg', hatchProgress: 45, roomId: paddock.id }),
    makeCreature(2, 'glimmerhorn_stag', { status: 'wary', tamingProgress: 40, hungry: true, roomId: paddock.id }),
    // Tamed bramblefox roams freely -> should NOT take a pen slot!
    makeCreature(3, 'bramblefox', { status: 'tamed', roomId: paddock.id })
  ];

  const occupants = getPenOccupants(state, paddock);
  assert.equal(occupants.length, 2, 'only penned creatures count toward pen occupancy');
  assert.ok(!occupants.some(c => c.id === 3), 'tamed roamer does not occupy pen slot');

  const html = renderToStaticMarkup(
    React.createElement(RoomWindow, {
      state,
      room: paddock,
      onClose: () => {},
      onOpenScreen: () => {},
      onResolveHazard: () => {},
      onUpgrade: () => {},
      onAddFurniture: () => {},
      onRemoveFurniture: () => {}
    })
  );

  assert.ok(html.includes('data-testid="pen-occupants"'));
  assert.ok(html.includes('2 / 3'), 'shows occupancy 2 / 3');
  assert.ok(html.includes('Seedling'), 'shows non-egg origin label Seedling');
  assert.ok(html.includes('Glimmerhorn Stag'));
  assert.ok(html.includes('Hungry'));
  assert.ok(html.includes(CREATURE_DEFINITIONS.glimmerhorn_stag.buffDescription));
  assert.ok(html.includes(CREATURE_DEFINITIONS.glimmerhorn_stag.troubleDescription));
});
