/**
 * Targeted fix verification:
 * 1. Only Spiral Stairs and Wizard's Study connect floors in NavGraph & Choreographer
 * 2. Study climbing follows the drawn left staircase (box.left + 9.5)
 * 3. Aviary / tall-pen flyers explore full interior height without climbing or leaving bounds
 * 4. All 7 creature pens have zero torches/sconces/candles/open flames at any tier/level
 * 5. All 7 creature pens have bespoke, unique L2 & L3 trims where L3 adds onto L2
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_DEFINITIONS, CREATURE_DEFINITIONS } from '../src/data/content.ts';
import { createInitialGameState } from '../src/data/initialState.ts';
import type { Character, CreatureInstance, PlacedRoom } from '../src/types/ankicaster.ts';
import { computeReachability } from '../src/utils/reachability.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { CreatureChoreographer, getPenRect } from '../src/visual/creatures/creatureChoreographer.ts';
import { getGroundY, getTotalWorldWidth, roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';
import { CREATURE_PEN_IDS, drawRoomInterior, TIERS } from '../src/visual/rooms/roomArt.ts';
import { drawRoomUpgradeTrim, getRoomTrimTags, INDOOR_ONLY_TRIM_TAGS } from '../src/visual/rooms/roomTrims.ts';
import type { Painter } from '../src/visual/rooms/painter.ts';

function makeRoom(id: number, defId: string, x: number, y: number, level: 1 | 2 | 3 = 1): PlacedRoom {
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
    furniture: [],
    spent: { mana: 0 },
    fromPlan: false
  };
}

function makeChar(id: number, seatRoomId?: number): Character {
  return {
    id,
    name: `Student ${id}`,
    pronouns: 'they/them',
    status: 'student',
    personality: 'Curious',
    traits: [],
    masteredSchools: [],
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: [],
    seatRoomId,
    bedRoomId: 1,
    appearance: {
      hair: 'short',
      hat: 'none',
      hairColor: '#3b2820',
      skin: '#f2c9a5',
      robeColor: '#6B4FBB'
    }
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

function makeOpRecorder() {
  const ops: string[] = [];
  const problems: string[] = [];
  const p: Painter = {
    rect(x, y, w, h) {
      if (![x, y, w, h].every(Number.isFinite)) problems.push(`rect non-finite`);
      ops.push(`rect:${x.toFixed(1)},${y.toFixed(1)},${w.toFixed(1)},${h.toFixed(1)}`);
      return p;
    },
    circle(x, y, r) {
      if (![x, y, r].every(Number.isFinite)) problems.push(`circle non-finite`);
      ops.push(`circle:${x.toFixed(1)},${y.toFixed(1)},${r.toFixed(1)}`);
      return p;
    },
    ellipse(x, y, rx, ry) {
      if (![x, y, rx, ry].every(Number.isFinite)) problems.push(`ellipse non-finite`);
      ops.push(`ellipse:${x.toFixed(1)},${y.toFixed(1)},${rx.toFixed(1)},${ry.toFixed(1)}`);
      return p;
    },
    poly(pts) {
      if (!pts.every(Number.isFinite)) problems.push(`poly non-finite`);
      ops.push(`poly:${pts.map(v => v.toFixed(1)).join(',')}`);
      return p;
    },
    fill(o) {
      ops.push(`fill:${o.color.toString(16)}:${o.alpha ?? 1}`);
      return p;
    },
    stroke(o) {
      ops.push(`stroke:${o.color.toString(16)}:${o.width ?? 1}`);
      return p;
    }
  };
  return { p, ops, problems };
}

test('NavGraph adds internal vertical edges ONLY for spiral_stair and wizard_study', () => {
  const groundY = getGroundY(4);
  const rooms: PlacedRoom[] = [
    makeRoom(1, 'entrance_hall', 2, 0),
    makeRoom(2, 'wizard_study', 0, 0),      // x: 0..2, y: 0..2 (internal stair!)
    makeRoom(3, 'aviary', 4, 0),            // x: 4..5, y: 0..2 (must NOT connect vertically!)
    makeRoom(4, 'menagerie', 5, 0),         // x: 5..8, y: 0..2 (must NOT connect vertically!)
    makeRoom(5, 'grand_dormitory', 8, 0),   // x: 8..10, y: 0..2 (must NOT connect vertically!)
    makeRoom(6, 'spiral_stair', 10, 0),     // x: 10..11, y: 0..1
    makeRoom(7, 'spiral_stair', 10, 1)      // x: 10..11, y: 1..2
  ];

  const nav = new NavGraph(rooms, groundY);

  // Every vertical edge in NavGraph must belong exclusively to spiral_stair or wizard_study
  for (const [fromId, edges] of nav.adj.entries()) {
    const fromNode = nav.nodes.get(fromId)!;
    for (const edge of edges) {
      const toNode = nav.nodes.get(edge.to)!;
      if (fromNode.floor !== toNode.floor || Math.abs(fromNode.y - toNode.y) > 10) {
        const fromRoom = rooms.find(r => r.id === fromNode.roomId);
        const toRoom = rooms.find(r => r.id === toNode.roomId);
        assert.ok(fromRoom && toRoom, `Vertical edge ${fromId} -> ${edge.to} must link known rooms`);
        assert.ok(
          fromRoom.defId === 'spiral_stair' || fromRoom.defId === 'wizard_study',
          `Illegal vertical edge from ${fromRoom.defId} (${fromId} -> ${edge.to})`
        );
        assert.ok(
          toRoom.defId === 'spiral_stair' || toRoom.defId === 'wizard_study',
          `Illegal vertical edge to ${toRoom.defId} (${fromId} -> ${edge.to})`
        );
      }
    }
  }
});

test('Upper floor room connected only to Aviary without stairs has no floor-0 NavGraph path', () => {
  const groundY = getGroundY(3);
  const rooms: PlacedRoom[] = [
    makeRoom(1, 'entrance_hall', 0, 0), // 0..2
    makeRoom(2, 'aviary', 2, 0),        // 2..3, y: 0..2
    makeRoom(3, 'dormitory', 3, 1)      // 3..5, y: 1..2 (adjacent to Aviary floor 1 only, NO stairs!)
  ];

  const nav = new NavGraph(rooms, groundY);
  const ehNode = nav.nodes.get('room-1-f0')!;
  const dormNode = nav.nodes.get('room-3-f1')!;
  assert.ok(ehNode && dormNode);
  assert.deepEqual(nav.findPath(ehNode.id, dormNode.id), [], 'Cannot climb inside Aviary to reach Dormitory on floor 1');

  // Adding a Spiral Stair chain at x=5 allows legal pathfinding via stairs (not through Aviary f0->f1)
  const withStairs: PlacedRoom[] = [
    ...rooms,
    makeRoom(4, 'corridor', 3, 0),      // 3..4
    makeRoom(5, 'corridor', 4, 0),      // 4..5
    makeRoom(6, 'spiral_stair', 5, 0),  // 5..6, y: 0..1
    makeRoom(7, 'spiral_stair', 5, 1)   // 5..6, y: 1..2
  ];
  const navWithStairs = new NavGraph(withStairs, groundY);
  const stairPath = navWithStairs.findPath('room-1-f0', 'room-3-f1');
  assert.ok(stairPath.length > 0, 'With Spiral Stairs, upper floor Dormitory becomes reachable');
  assert.equal(
    stairPath.some(n => n.roomId === 6 || n.roomId === 7),
    true,
    'Inter-floor path must route through Spiral Stair'
  );
  assert.equal(
    stairPath.some(n => n.roomId === 2 && n.floor === 1),
    false,
    'Path must NOT climb up inside Aviary'
  );
});

test('Wizard Study climbing follows drawn left staircase (box.left + 9.5) and Choreographer only climbs on stairs', () => {
  const groundY = getGroundY(3);
  const rooms: PlacedRoom[] = [
    makeRoom(1, 'entrance_hall', 1, 0), // 1..3, y: 0..1
    makeRoom(2, 'wizard_study', 0, 0),  // 0..1, y: 0..2
    makeRoom(3, 'library', 1, 1)        // 1..3, y: 1..2 (reached via Wizard's Study f0->f1)
  ];
  const studyBox = roomToWorldBox(rooms[1], groundY);
  const expectedStairX = studyBox.left + 9.5;

  const nav = new NavGraph(rooms, groundY);
  const stairF0 = nav.nodes.get('study-stair-2-f0')!;
  const stairF1 = nav.nodes.get('study-stair-2-f1')!;
  assert.ok(stairF0 && stairF1);
  assert.equal(stairF0.kind, 'stair');
  assert.equal(stairF1.kind, 'stair');
  assert.equal(stairF0.x, expectedStairX, 'Study floor-0 stair node sits on drawn left staircase');
  assert.equal(stairF1.x, expectedStairX, 'Study floor-1 stair node sits on drawn left staircase');

  const path = nav.findPath('room-1-f0', 'room-3-f1');
  assert.ok(path.length > 0);
  const studyStairSteps = path.filter(n => n.roomId === 2 && n.kind === 'stair');
  assert.ok(studyStairSteps.length >= 2);
  for (const n of studyStairSteps) {
    assert.equal(n.x, expectedStairX);
  }

  const state = createInitialGameState();
  state.rooms = rooms;
  state.characters = [makeChar(101, undefined)]; // Spawn in Entrance Hall (floor 0)

  const reach = computeReachability(rooms);
  const chor = new Choreographer(nav, groundY);
  chor.syncState(state, reach);

  // Now assign student to floor-1 Library so they must climb Wizard Study's left staircase
  state.characters[0].seatRoomId = 3;
  chor.syncState(state, reach);
  chor.cycleTimeMs = 1000; // class_work phase

  let sawClimb = false;
  for (let t = 0; t < 240; t++) {
    chor.tick(100, state, false);
    const agent = chor.agents.get('char-101')!;
    if (agent.anim === 'climb') {
      sawClimb = true;
      assert.ok(
        Math.abs(agent.x - expectedStairX) < 12,
        `Agent must climb along Study's left staircase (${expectedStairX}), got x=${agent.x}`
      );
    }
  }
  assert.equal(sawClimb, true, 'Agent climbed Wizard Study stair to reach floor-1 Library');
});

test('Aviary flyers move across full interior height without climbing or leaving bounds; roamers use stairs', () => {
  const groundY = getGroundY(3);
  const rooms: PlacedRoom[] = [
    makeRoom(1, 'entrance_hall', 0, 0),
    makeRoom(2, 'aviary', 2, 0),        // 2..3, y: 0..2 (height 96px)
    makeRoom(3, 'menagerie', 3, 0),     // 3..6, y: 0..2
    makeRoom(4, 'spiral_stair', 6, 0),
    makeRoom(5, 'spiral_stair', 6, 1),
    makeRoom(6, 'library', 7, 1)        // floor 1 room reached via spiral_stair
  ];
  const state = createInitialGameState();
  state.rooms = rooms;
  state.characters = [makeChar(10, 6)];
  state.creatures = [
    makeCreature(1, 'dawn_finch', { status: 'tamed', roomId: 2 }),     // fly in aviary
    makeCreature(2, 'orrery_moth', { status: 'tamed', roomId: 2 }),    // glide in aviary
    makeCreature(3, 'mossback_tortoise', { status: 'tamed', roomId: 3 }), // waddle in menagerie
    makeCreature(4, 'bramblefox', { status: 'tamed', roomId: 3, bondLevel: 2 }) // roamsFreely companion
  ];

  const aviaryBox = roomToWorldBox(rooms[1], groundY);
  const aviaryPen = getPenRect(rooms[1], groundY, 'sky', 0);
  const menageriePen = getPenRect(rooms[2], groundY, 'meadow', 0);

  const nav = new NavGraph(rooms, groundY);
  const creatureChor = new CreatureChoreographer(nav, groundY, getTotalWorldWidth(9));
  creatureChor.syncState(state);

  const finchYs: number[] = [];
  for (let i = 0; i < 300; i++) {
    creatureChor.tick(100, state, false);
    for (const id of [1, 2]) {
      const bird = creatureChor.agents.get(id)!;
      assert.notEqual(bird.anim as string, 'climb', `Aviary flyer ${bird.defId} must never emit climb`);
      assert.ok(bird.x >= aviaryPen.left - 0.1 && bird.x <= aviaryPen.right + 0.1, `Bird ${id} x inside walls`);
      assert.ok(bird.y >= aviaryBox.top + 17.5 && bird.y <= aviaryBox.floorLineY + 0.5, `Bird ${id} y inside Aviary interior`);
      if (id === 1) finchYs.push(bird.y);
    }

    const tortoise = creatureChor.agents.get(3)!;
    assert.ok(Math.abs(tortoise.y - menageriePen.floorY) <= 4, 'Ground creature in Menagerie stays on floor');

    const fox = creatureChor.agents.get(4)!;
    if (fox.roamPath.length > 0) {
      for (let k = 0; k < fox.roamPath.length - 1; k++) {
        const a = fox.roamPath[k];
        const b = fox.roamPath[k + 1];
        if (a.floor !== b.floor) {
          const rA = rooms.find(r => r.id === a.roomId);
          assert.ok(rA?.defId === 'spiral_stair' || rA?.defId === 'wizard_study', 'Roaming companion only changes floors on stairs');
        }
      }
    }
  }

  const minY = Math.min(...finchYs);
  const maxY = Math.max(...finchYs);
  assert.ok(maxY - minY >= 25, `Aviary bird should fly/perch across interior height (span=${(maxY - minY).toFixed(1)})`);
});

test('Zero torches, sconces, candles, or open flames inside any of the 7 creature pens across all tiers & levels', () => {
  const groundY = getGroundY(3);
  const pens = Array.from(CREATURE_PEN_IDS);
  assert.equal(pens.length, 7);

  for (const defId of pens) {
    for (const tier of TIERS) {
      for (const level of [1, 2, 3] as const) {
        const room = makeRoom(50 + level, defId, 0, 0, level);
        const box = roomToWorldBox(room, groundY);
        const { p, problems } = makeOpRecorder();
        const res = drawRoomInterior(p, room, box, { tier, hasLeftDoor: true, hasRightDoor: true });
        assert.deepEqual(problems, [], `${defId} ${tier} L${level}`);

        const flameOrCandle = res.emitters.filter(e => e.kind === 'flame' || e.kind === 'candle');
        assert.equal(
          flameOrCandle.length,
          0,
          `${defId} (${tier} L${level}) emitted open flame/candle emitters: ${JSON.stringify(flameOrCandle)}`
        );

        if (defId !== 'ember_pit') {
          const embers = res.emitters.filter(e => e.kind === 'ember');
          assert.equal(embers.length, 0, `${defId} (${tier} L${level}) must not emit ember outside ember_pit`);
        }
      }
    }
  }
});

test('All 7 creature pens have unique L2 & L3 trim tags and L3 strictly adds onto L2 drawing ops', () => {
  const groundY = getGroundY(3);
  const pens = Array.from(CREATURE_PEN_IDS);
  const seenL2 = new Set<string>();
  const seenL3 = new Set<string>();

  for (const defId of pens) {
    const l2Tags = getRoomTrimTags(defId, 2);
    const l3Tags = getRoomTrimTags(defId, 3);
    assert.ok(l2Tags.length >= 2, `${defId} L2 tags`);
    assert.ok(l3Tags.length > l2Tags.length, `${defId} L3 adds onto L2`);
    for (const t2 of l2Tags) {
      assert.equal(l3Tags.includes(t2), true, `${defId} L3 preserves L2 tag ${t2}`);
    }

    const sig2 = l2Tags.join('|');
    const sig3 = l3Tags.join('|');
    assert.equal(seenL2.has(sig2), false, `Unique L2 tags for ${defId}`);
    assert.equal(seenL3.has(sig3), false, `Unique L3 tags for ${defId}`);
    seenL2.add(sig2);
    seenL3.add(sig3);

    if (ROOM_DEFINITIONS[defId].area === 'grounds') {
      for (const indoorTag of INDOOR_ONLY_TRIM_TAGS) {
        assert.equal(l3Tags.some(t => t.startsWith(indoorTag)), false, `Outdoor pen ${defId} never has ${indoorTag}`);
      }
    }

    // Verify L1 < L2 < L3 drawing ops & that L3 retains every L2 op
    const room1 = makeRoom(80, defId, 0, 0, 1);
    const room2 = makeRoom(80, defId, 0, 0, 2);
    const room3 = makeRoom(80, defId, 0, 0, 3);
    const box = roomToWorldBox(room1, groundY);

    const rec1 = makeOpRecorder();
    const rec2 = makeOpRecorder();
    const rec3 = makeOpRecorder();
    drawRoomUpgradeTrim(rec1.p, room1, box, 0x6ba34f, 'leaf');
    drawRoomUpgradeTrim(rec2.p, room2, box, 0x6ba34f, 'leaf');
    drawRoomUpgradeTrim(rec3.p, room3, box, 0x6ba34f, 'leaf');

    assert.equal(rec1.ops.length, 0, `${defId} L1 has no upgrade trim`);
    assert.ok(rec2.ops.length > 0, `${defId} L2 draws upgrade trim`);
    assert.ok(rec3.ops.length > rec2.ops.length, `${defId} L3 adds more ops onto L2`);

    // Every L2 op appears in order at the start of L3 ops for bespoke pen trims
    assert.deepEqual(
      rec3.ops.slice(0, rec2.ops.length),
      rec2.ops,
      `${defId} L3 trim preserves all L2 trim art before adding L3 props`
    );
  }
});
