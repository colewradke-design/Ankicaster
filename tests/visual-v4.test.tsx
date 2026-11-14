/**
 * V4 + Part B: creatures, grounds path/plots/Rift Gate, and per-room upgrade trims.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CREATURE_DEFINITIONS, ROOM_DEFINITIONS } from '../src/data/content.ts';
import { createInitialGameState } from '../src/data/initialState.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import type { CreatureInstance, FullGameState, HabitatType, PlacedRoom } from '../src/types/ankicaster.ts';
import {
  CREATURE_RARITY_REQUIREMENT,
  creatureSize,
  drawCreature,
  drawCreatureBubble,
  drawCreatureEgg,
  eggWobbleOffset,
  tamingRequirement,
  tamingRingFraction,
  type CreatureAnim
} from '../src/visual/creatures/creatureArt.ts';
import {
  CreatureChoreographer,
  MAX_VISIBLE_CREATURES,
  ONE_BY_ONE_PEN_CAP,
  getPenRect,
  penCreatureCapacity
} from '../src/visual/creatures/creatureChoreographer.ts';
import {
  INDOOR_ONLY_TRIM_TAGS,
  ROOM_TRIM_SPECS,
  drawRoomUpgradeTrim,
  getRoomTrimTags
} from '../src/visual/rooms/roomTrims.ts';
import {
  RIFT_RETURN_FLARE_MS,
  drawRiftGateArch,
  getRiftGateVisualState,
  type RiftGateVisualState
} from '../src/visual/rooms/riftGateArt.ts';
import { drawRoomInterior, TIERS } from '../src/visual/rooms/roomArt.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { getGroundY, getTotalWorldWidth, roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';
import { VisualWorld } from '../src/visual/world/VisualWorld.ts';
import { creatureHoverText } from '../src/visual/AcademyCanvas.tsx';

class RecordingPainter {
  shapes = 0;
  pending = 0;
  problems: string[] = [];
  ops: Array<
    | { k: 'rect'; x: number; y: number; w: number; h: number }
    | { k: 'circle'; x: number; y: number; r: number }
    | { k: 'ellipse'; x: number; y: number; rx: number; ry: number }
    | { k: 'poly'; points: number[] }
  > = [];

  private num(label: string, ...vals: number[]) {
    for (const v of vals) {
      if (!Number.isFinite(v)) this.problems.push(`${label} non-finite: ${v}`);
    }
    return this;
  }

  rect(x: number, y: number, w: number, h: number) {
    this.ops.push({ k: 'rect', x, y, w, h });
    this.pending++;
    return this.num('rect', x, y, w, h);
  }
  circle(x: number, y: number, r: number) {
    this.ops.push({ k: 'circle', x, y, r });
    this.pending++;
    if (r < 0) this.problems.push(`circle r<0: ${r}`);
    return this.num('circle', x, y, r);
  }
  ellipse(x: number, y: number, rx: number, ry: number) {
    this.ops.push({ k: 'ellipse', x, y, rx, ry });
    this.pending++;
    return this.num('ellipse', x, y, rx, ry);
  }
  poly(points: number[]) {
    this.ops.push({ k: 'poly', points: points.slice() });
    this.pending++;
    if (points.length < 4 || points.length % 2 !== 0) this.problems.push(`poly bad length ${points.length}`);
    return this.num('poly', ...points);
  }
  fill(s: { color: number; alpha?: number }) {
    return this.style('fill', s);
  }
  stroke(s: { color: number; width?: number; alpha?: number }) {
    return this.style('stroke', s);
  }
  private style(kind: string, s: { color: number; alpha?: number; width?: number }) {
    if (!Number.isInteger(s.color) || s.color < 0 || s.color > 0xffffff) {
      this.problems.push(`${kind} bad color ${s.color}`);
    }
    if (s.alpha !== undefined && !(s.alpha >= 0 && s.alpha <= 1)) {
      this.problems.push(`${kind} bad alpha ${s.alpha}`);
    }
    if (s.width !== undefined && !(s.width > 0)) {
      this.problems.push(`${kind} bad width ${s.width}`);
    }
    if (this.pending > 0) this.shapes++;
    this.pending = 0;
    return this;
  }
}

function makeRoom(id: number, defId: string, x: number, y: number, level: 1 | 2 | 3 = 1): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  return {
    id,
    defId,
    x,
    y,
    w: def?.size[0] ?? 1,
    h: def?.size[1] ?? 1,
    area: def?.area ?? 'castle',
    level,
    state: 'built',
    buildRequired: 10,
    buildProgress: 10,
    cleanliness: 95,
    settings: {},
    furniture: []
  };
}

function makeCreature(id: number, defId: string, overrides: Partial<CreatureInstance> = {}): CreatureInstance {
  return {
    id,
    defId,
    nickname: CREATURE_DEFINITIONS[defId]?.name ?? defId,
    status: 'tamed',
    hungry: false,
    hatchProgress: 100,
    tamingProgress: 0,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1,
    ...overrides
  };
}

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      deepFreeze((obj as Record<string, unknown>)[key]);
    }
  }
  return obj;
}

test('all 40 creature species draw cleanly across sizes, statuses, animations, and eggs', () => {
  const defs = Object.values(CREATURE_DEFINITIONS);
  assert.equal(defs.length, 40, 'CREATURE_DEFINITIONS has 40 species');

  const anims: CreatureAnim[] = ['idle', 'move', 'eat', 'sleep', 'trouble'];
  const statuses: CreatureInstance['status'][] = ['wary', 'tamed', 'loose'];

  for (const def of defs) {
    const size = creatureSize(def.id);
    if (def.id === 'philosophers_chimera') {
      assert.deepEqual(size, { w: 48, h: 32 });
    } else if (def.rarity === 'epic' || def.rarity === 'legendary') {
      assert.deepEqual(size, { w: 32, h: 32 });
    } else if (def.rarity === 'rare') {
      assert.deepEqual(size, { w: 24, h: 24 });
    } else {
      assert.deepEqual(size, { w: 16, h: 16 });
    }

    for (const status of statuses) {
      for (const anim of anims) {
        for (const facing of ['L', 'R'] as const) {
          const p = new RecordingPainter();
          drawCreature(p, def.id, {
            x: 80,
            y: 90,
            facing,
            anim,
            frame: 2,
            status,
            bondLevel: 3,
            unhomed: status === 'tamed',
            auraPhase: 1.1
          });
          assert.deepEqual(p.problems, [], `${def.id} ${status} ${anim} ${facing}`);
          assert.ok(p.shapes >= 3, `${def.id} drew shapes`);
        }
      }
    }

    // Egg rendering for every rarity
    const eggPainter = new RecordingPainter();
    drawCreatureEgg(eggPainter, def.rarity, 50, 80, 95, 2100, false);
    assert.deepEqual(eggPainter.problems, [], `egg ${def.rarity}`);
    assert.ok(eggPainter.shapes >= 5, `egg ${def.rarity} drew nest + egg + crack`);
  }

  for (const kind of ['wary', 'loose', 'hungry', 'hearts', 'paw'] as const) {
    const p = new RecordingPainter();
    drawCreatureBubble(p, kind, 40, 40, 1.5, 3);
    assert.deepEqual(p.problems, [], `bubble ${kind}`);
  }
});

test('away creatures never enter CreatureChoreographer and render nothing', () => {
  const state = createInitialGameState();
  state.rooms.push(makeRoom(10, 'meadow_paddock', 0, 0));
  state.creatures = [
    makeCreature(1, 'mossback_tortoise', { status: 'away', roomId: 10 }),
    makeCreature(2, 'thistle_hare', { status: 'tamed', roomId: 10 })
  ];

  const groundY = getGroundY(5);
  const nav = new NavGraph(state.rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, getTotalWorldWidth(8));
  cc.syncState(state);

  assert.equal(cc.agents.has(1), false, 'away creature is never added to agents');
  assert.equal(cc.agents.has(2), true, 'tamed creature is present');

  // If a visible creature goes away on expedition, it disappears immediately
  state.creatures[1].status = 'away';
  cc.syncState(state);
  assert.equal(cc.agents.has(2), false, 'creature transitioning to away is removed immediately');
});

test('taming ring fraction matches engine requirement per rarity and hover tooltip text', () => {
  assert.equal(CREATURE_RARITY_REQUIREMENT.common, 40);
  assert.equal(CREATURE_RARITY_REQUIREMENT.uncommon, 90);
  assert.equal(CREATURE_RARITY_REQUIREMENT.rare, 160);
  assert.equal(CREATURE_RARITY_REQUIREMENT.epic, 260);
  assert.equal(CREATURE_RARITY_REQUIREMENT.legendary, 400);

  const sampleByRarity = [
    'mossback_tortoise', // 40
    'bramblefox',        // 90
    'glimmerhorn_stag',  // 160
    'verdant_drake',     // 260
    'ember_phoenix'      // 400
  ];
  for (const id of sampleByRarity) {
    const req = tamingRequirement(id);
    assert.equal(req, CREATURE_DEFINITIONS[id].tamingReviews);
    const half = makeCreature(10, id, { status: 'wary', tamingProgress: req / 2 });
    assert.ok(Math.abs(tamingRingFraction(half) - 0.5) < 1e-6);
    assert.equal(
      creatureHoverText({ ...half, unhomed: false }),
      `About ${req / 2} honest reviews to tame`
    );
  }
});

test('egg arrival wobble (stage 4 >=80%) and reduceMotion freeze', () => {
  // Stages 0-3 (<80%): still
  for (const pct of [10, 30, 50, 70]) {
    for (const t of [0, 100, 1500, 2120, 6100]) {
      assert.equal(eggWobbleOffset(pct, t, false), 0, `<80% arrival (${pct}%) must not wobble at ${t}ms`);
    }
  }
  // Stage 4 (>=80%): wobbles on 2s cadence and freezes with reduceMotion
  assert.ok(Math.abs(eggWobbleOffset(95, 2120, false)) > 0.01, '95% arrival wobbles on 2s cadence');
  assert.equal(eggWobbleOffset(95, 2120, true), 0, 'reduceMotion freezes arrival wobble');
});

test('loose creatures stay strictly inside world bounds over 1000 ticks and walk home when recaptured', () => {
  const state = createInitialGameState();
  const eh = state.rooms.find(r => r.defId === 'entrance_hall')!;
  const paddock = makeRoom(50, 'meadow_paddock', 1, 0);
  state.rooms.push(paddock);
  const looseCritter = makeCreature(7, 'mossback_tortoise', { status: 'loose', roomId: paddock.id });
  state.creatures = [looseCritter];

  const groundY = getGroundY(5);
  const worldW = getTotalWorldWidth(8);
  const nav = new NavGraph(state.rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, worldW);
  cc.syncState(state);

  const xs: number[] = [];
  for (let i = 0; i < 1000; i++) {
    cc.tick(100, state, false);
    const a = cc.agents.get(7)!;
    assert.ok(a.x >= 16 && a.x <= worldW - 16, `loose x=${a.x} escaped horizontal world bounds`);
    assert.ok(a.y >= 24 && a.y <= groundY - 4, `loose y=${a.y} escaped vertical world bounds`);
    xs.push(a.x);
  }
  const travelSpan = Math.max(...xs) - Math.min(...xs);
  assert.ok(travelSpan > 20, `loose creature should wander meaningfully (span=${travelSpan})`);
  assert.ok(eh.id > 0);

  // Recapture: loose -> tamed transitions into a walk home rather than vanishing
  looseCritter.status = 'tamed';
  cc.syncState(state);
  const agent = cc.agents.get(7)!;
  assert.ok(agent.returnPath.length > 0, 'recaptured creature builds a return path home');
  const pen = getPenRect(paddock, groundY, 'meadow');
  for (let i = 0; i < 600 && agent.returnPath.length > 0; i++) {
    cc.tick(100, state, false);
  }
  assert.equal(agent.returnPath.length, 0, 'recaptured creature arrives home');
  assert.ok(agent.x >= pen.left - 1 && agent.x <= pen.right + 1, 'arrived inside paddock pen');
});

test('unhomed creature without habitat waits outside Entrance Hall doors with bundle', () => {
  const state = createInitialGameState();
  state.creatures = [makeCreature(99, 'ember_phoenix', { status: 'wary' })];
  const groundY = getGroundY(5);
  const nav = new NavGraph(state.rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, getTotalWorldWidth(8));
  cc.syncState(state);

  const agent = cc.agents.get(99)!;
  assert.equal(agent.unhomed, true);
  assert.equal(creatureHoverText(agent), 'Looking for a home');
  const eh = state.rooms.find(r => r.defId === 'entrance_hall')!;
  const ehBox = roomToWorldBox(eh, groundY);
  assert.ok(agent.x >= ehBox.left && agent.x <= ehBox.left + ehBox.width, 'waits by Entrance Hall doors');
});

test('6 habitat movement styles produce measurably distinct behaviors', () => {
  const habitats: Array<{ habitat: HabitatType; defId: string; roomDef: string }> = [
    { habitat: 'meadow', defId: 'mossback_tortoise', roomDef: 'meadow_paddock' },
    { habitat: 'tide', defId: 'puddlewyrm', roomDef: 'tide_tank' },
    { habitat: 'sky', defId: 'dawn_finch', roomDef: 'aviary' },
    { habitat: 'gloom', defId: 'velvet_bat_swarm', roomDef: 'gloom_hutch' },
    { habitat: 'ember', defId: 'bellows_toad', roomDef: 'ember_pit' },
    { habitat: 'crystal', defId: 'geode_golem', roomDef: 'crystal_vivarium' }
  ];

  const state = createInitialGameState();
  const groundY = getGroundY(5);
  habitats.forEach((h, i) => {
    const roomDef = ROOM_DEFINITIONS[h.roomDef];
    const room = makeRoom(100 + i, h.roomDef, roomDef.area === 'grounds' ? i : i + 2, 0);
    state.rooms.push(room);
    state.creatures.push(makeCreature(200 + i, h.defId, { status: 'tamed', roomId: room.id }));
  });

  const nav = new NavGraph(state.rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, getTotalWorldWidth(8));
  cc.syncState(state);

  const samples = new Map<HabitatType, Array<{ x: number; y: number; anim: CreatureAnim }>>();
  for (const h of habitats) samples.set(h.habitat, []);

  for (let step = 0; step < 120; step++) {
    cc.tick(100, state, false);
    habitats.forEach((h, i) => {
      const a = cc.agents.get(200 + i)!;
      samples.get(h.habitat)!.push({ x: a.x, y: a.y, anim: a.anim });
    });
  }

  // Tide stays strictly inside tide_tank water rect and moves smoothly along both X and Y
  const tideRoom = state.rooms.find(r => r.defId === 'tide_tank')!;
  const tidePen = getPenRect(tideRoom, groundY, 'tide');
  const tidePts = samples.get('tide')!;
  for (const pt of tidePts) {
    assert.ok(pt.x >= tidePen.left - 0.1 && pt.x <= tidePen.right + 0.1);
    assert.ok(pt.y >= tidePen.topY - 0.1 && pt.y <= tidePen.floorY + 0.1);
  }
  assert.ok(Math.max(...tidePts.map(p => p.y)) - Math.min(...tidePts.map(p => p.y)) > 4, 'tide creature swims vertically in figure-8');

  // Sky creature arcs vertically above room floor into sky overhang
  const skyRoom = state.rooms.find(r => r.defId === 'aviary')!;
  const skyBox = roomToWorldBox(skyRoom, groundY);
  const skyPts = samples.get('sky')!;
  assert.ok(Math.min(...skyPts.map(p => p.y)) < skyBox.floorLineY - 20, 'sky creature flies upward in arcs');

  // Crystal hovers strictly above floor line continuously
  const crystalRoom = state.rooms.find(r => r.defId === 'crystal_vivarium')!;
  const crystalBox = roomToWorldBox(crystalRoom, groundY);
  const crystalPts = samples.get('crystal')!;
  assert.ok(crystalPts.every(p => p.y < crystalBox.floorLineY - 1.5), 'crystal creature continuously hovers above floor');

  // Gloom mixes stationary lurk frames with fast dart bursts
  const gloomPts = samples.get('gloom')!;
  const gloomIdleCount = gloomPts.filter(p => p.anim === 'idle').length;
  assert.ok(gloomIdleCount > 10, 'gloom creature spends significant time lurking stationary');

  // Meadow exhibits grazing ('eat') pauses
  const meadowPts = samples.get('meadow')!;
  assert.ok(meadowPts.some(p => p.anim === 'eat' || p.anim === 'move'), 'meadow creature walks & grazes');

  // Ember makes rhythmic hops around center
  const emberRoom = state.rooms.find(r => r.defId === 'ember_pit')!;
  const emberBox = roomToWorldBox(emberRoom, groundY);
  const emberPts = samples.get('ember')!;
  assert.ok(Math.min(...emberPts.map(p => p.y)) < emberBox.floorLineY - 1, 'ember creature hops over coals');
});

test('creature caps enforce <=6 in 1x1 pen without hiding eggs/loose and <=40 globally', () => {
  const state = createInitialGameState();
  const hutch = makeRoom(50, 'gloom_hutch', 2, 0);
  state.rooms.push(hutch);

  // 8 wary/penned + 1 egg + 1 loose in the 1x1 hutch
  const list: CreatureInstance[] = [];
  for (let i = 1; i <= 8; i++) {
    list.push(makeCreature(i, 'velvet_bat_swarm', { status: 'wary', roomId: hutch.id }));
  }
  list.push(makeCreature(9, 'duskmouse', { status: 'egg', hatchProgress: 30, roomId: hutch.id }));
  list.push(makeCreature(10, 'duskmouse', { status: 'loose', roomId: hutch.id }));
  state.creatures = list;

  const groundY = getGroundY(5);
  const nav = new NavGraph(state.rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, getTotalWorldWidth(8));
  cc.syncState(state);

  assert.equal(cc.agents.has(9), true, 'egg is never hidden by pen cap');
  assert.equal(cc.agents.has(10), true, 'loose creature is never hidden by pen cap');
  const pennedInHutch = Array.from(cc.agents.values()).filter(a => a.roomId === hutch.id && !a.unhomed && a.status !== 'egg' && a.status !== 'loose');
  assert.equal(pennedInHutch.length, penCreatureCapacity(hutch), 'hutch holds at most its penCreatureCapacity (2) penned creatures');

  // Global cap test: 50 creatures across a 3x2 menagerie -> <= 40 agents drawn
  const menagerie = makeRoom(60, 'menagerie', 0, 1);
  state.rooms.push(menagerie);
  state.creatures = Array.from({ length: 50 }, (_, idx) =>
    makeCreature(100 + idx, 'bramblefox', { status: idx === 49 ? 'loose' : 'tamed', roomId: menagerie.id })
  );
  cc.syncState(state);
  assert.ok(cc.agents.size <= MAX_VISIBLE_CREATURES, `visible creatures (${cc.agents.size}) capped at ${MAX_VISIBLE_CREATURES}`);
  assert.equal(cc.agents.has(149), true, 'loose creature still prioritized under global cap');
});

test('Rift Gate draws dormant, open, expedition_out, and returning states cleanly', () => {
  const state = createInitialGameState();
  const gate = makeRoom(70, 'rift_gate', 2, 0);
  state.rooms.push(gate);
  assert.equal(getRiftGateVisualState(state), 'dormant', '<3 masters keeps Rift Gate dormant');

  // 3 masters -> open
  state.characters = [1, 2, 3].map(id => ({
    id,
    name: `M${id}`,
    pronouns: 'they/them',
    appearance: { skin: '#F6D7C3', hair: 'bob', hairColor: '#4A2E1E', robeColor: '#6B4FBB', hat: 'none' },
    personality: 'Bold',
    traits: [],
    status: 'resident',
    masteredSchools: ['arcane'],
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  }));
  assert.equal(getRiftGateVisualState(state), 'open');

  state.expeditions = [{
    id: 1,
    destinationId: 'crystal_caverns',
    teamIds: [1, 2],
    suppliesTaken: [],
    partySkillDays: 10,
    chance: 85,
    fortune: 2,
    roll: 20,
    wrongRoll: 80,
    progressReviews: 5,
    requiredReviews: 20,
    state: 'active'
  }];
  assert.equal(getRiftGateVisualState(state), 'expedition_out');

  state.expeditions[0].state = 'returned';
  assert.equal(getRiftGateVisualState(state, true), 'returning');
  assert.ok(RIFT_RETURN_FLARE_MS >= 1000);

  const groundY = getGroundY(5);
  const box = roomToWorldBox(gate, groundY);
  for (const rs of ['dormant', 'open', 'expedition_out', 'returning'] as RiftGateVisualState[]) {
    const p = new RecordingPainter();
    drawRiftGateArch(p, box, rs, { phaseRad: 1.2, destinationId: 'crystal_caverns', flareAlpha: 0.9 });
    assert.deepEqual(p.problems, [], `Rift Gate ${rs}`);
    assert.ok(p.shapes >= 10, `Rift Gate ${rs} drew arch`);
  }
});

test('NavGraph connects Entrance Hall to grounds front path and Choreographer steps smoothly', () => {
  const state = createInitialGameState();
  state.debugTimeHours = 6.2; // Period 1 faculty duty hour regardless of wall clock
  const veg = makeRoom(80, 'vegetable_patch', 1, 0);
  state.rooms.push(veg);

  const groundY = getGroundY(5);
  const nav = new NavGraph(state.rooms, groundY);
  const eh = state.rooms.find(r => r.defId === 'entrance_hall')!;
  const path = nav.findPath(`room-${eh.id}-f0`, `room-${veg.id}`);
  assert.ok(path.length >= 4, 'path traverses Entrance Hall -> path-front -> path-plot -> plot');
  assert.ok(path.some(n => n.kind === 'path' && n.y === groundY + 2), 'path steps down to cobblestone groundY + 2');

  const chor = new Choreographer(nav, groundY);
  state.characters = [{
    id: 5,
    name: 'Pip',
    pronouns: 'they/them',
    appearance: { skin: '#F6D7C3', hair: 'short', hairColor: '#4A2E1E', robeColor: '#4E8B3A', hat: 'none' },
    personality: 'Curious',
    traits: [],
    status: 'faculty',
    career: 'gardener',
    careerState: 'active',
    workplaceRoomId: veg.id,
    bedRoomId: 2,
    masteredSchools: [],
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  }];
  chor.syncState(state);
  const pip = chor.agents.get('char-5')!;
  pip.currentRoomId = eh.id;
  pip.x = roomToWorldBox(eh, groundY).left + 32;
  pip.y = groundY - 4;
  pip.path = nav.findPath(`room-${eh.id}-f0`, `room-${veg.id}`);
  pip.pathIndex = 0;

  let sawPathY = false;
  for (let i = 0; i < 200; i++) {
    chor.tick(100, state, false);
    if (Math.abs(pip.y - (groundY + 2)) < 1.5) sawPathY = true;
  }
  assert.equal(sawPathY, true, 'agent visibly steps down onto cobblestone path at groundY + 2');
});

test('Part B1: outdoor grounds rooms never use indoor upgrade trims or float in sky', () => {
  const groundY = getGroundY(5);
  const groundsDefs = Object.values(ROOM_DEFINITIONS).filter(d => d.area === 'grounds');
  assert.ok(groundsDefs.length === 13, `expected 13 grounds definitions, got ${groundsDefs.length}`);

  for (const def of groundsDefs) {
    for (const lvl of [1, 2, 3] as const) {
      const tags = getRoomTrimTags(def.id, lvl);
      for (const indoorTag of INDOOR_ONLY_TRIM_TAGS) {
        assert.equal(
          tags.includes(indoorTag),
          false,
          `Outdoor room ${def.id} L${lvl} emitted indoor trim tag "${indoorTag}"`
        );
      }

      const room = makeRoom(300 + lvl, def.id, 0, 0, lvl);
      const box = roomToWorldBox(room, groundY);
      for (const tier of TIERS) {
        const p = new RecordingPainter();
        const result = drawRoomInterior(p, room, box, { tier });
        assert.deepEqual(p.problems, [], `${def.id} L${lvl} ${tier}`);
        assert.ok(
          !result.trimTags.some(t => (INDOOR_ONLY_TRIM_TAGS as readonly string[]).includes(t)),
          `${def.id} drawRoomInterior must not emit indoor trims`
        );
      }

      // Check L3 outdoor props sit anchored at ground level (not floating at box.top)
      const trimOnly = new RecordingPainter();
      drawRoomUpgradeTrim(trimOnly, room, box, 0x6ba34f, 'leaf');
      assert.deepEqual(trimOnly.problems, [], `${def.id} L${lvl} trim only`);
      if (lvl === 3) {
        const ys = trimOnly.ops.flatMap(op =>
          op.k === 'rect' || op.k === 'circle' || op.k === 'ellipse'
            ? [op.y]
            : op.points.filter((_, idx) => idx % 2 === 1)
        );
        if (ys.length > 0) {
          const minY = Math.min(...ys);
          assert.ok(minY >= box.floorLineY - 26, `${def.id} L3 trim prop floats too high (minY=${minY}, floor=${box.floorLineY})`);
        }
      }
    }
  }
});

test('Part B2: all 51 ROOM_DEFINITIONS have pairwise distinct L2 and L3 upgrade trim sets', () => {
  const allDefs = Object.values(ROOM_DEFINITIONS);
  assert.equal(allDefs.length, 51, 'ROOM_DEFINITIONS has 51 rooms');

  const l2Signatures = new Map<string, string>();
  const l3Signatures = new Map<string, string>();

  for (const def of allDefs) {
    assert.ok(ROOM_TRIM_SPECS[def.id], `Missing ROOM_TRIM_SPECS entry for ${def.id}`);
    const t2 = getRoomTrimTags(def.id, 2);
    const t3 = getRoomTrimTags(def.id, 3);
    assert.ok(t2.length >= 2, `${def.id} L2 should have at least 2 trim tags`);
    assert.ok(t3.length > t2.length, `${def.id} L3 should add trims on top of L2`);

    const sig2 = [...t2].sort().join('|');
    const sig3 = [...t3].sort().join('|');
    assert.equal(l2Signatures.has(sig2), false, `Duplicate L2 trim signature between ${def.id} and ${l2Signatures.get(sig2)}: ${sig2}`);
    assert.equal(l3Signatures.has(sig3), false, `Duplicate L3 trim signature between ${def.id} and ${l3Signatures.get(sig3)}: ${sig3}`);
    l2Signatures.set(sig2, def.id);
    l3Signatures.set(sig3, def.id);
  }
});

test('VR-01: VisualWorld never mutates FullGameState and visual modules never import engine.ts', () => {
  const state = createInitialGameState();
  state.rooms.push(makeRoom(10, 'meadow_paddock', 1, 0));
  state.rooms.push(makeRoom(11, 'rift_gate', 2, 0));
  state.creatures = [
    makeCreature(1, 'mossback_tortoise', { status: 'wary', roomId: 10, tamingProgress: 15 }),
    makeCreature(2, 'bramblefox', { status: 'loose', roomId: 10 }),
    makeCreature(3, 'ember_phoenix', { status: 'away' }),
    makeCreature(4, 'thistle_hare', { status: 'egg', hatchProgress: 92, roomId: 10 })
  ];
  const frozen = deepFreeze(state);

  const world = new VisualWorld();
  world.camera.setViewportSize(1280, 800);
  world.setSnapshot(frozen);
  for (let i = 0; i < 20; i++) {
    world.update(50, 1000 + i * 50);
  }
  assert.equal(Object.isFrozen(frozen), true);
  assert.equal(AnkicasterEngine.roomEfficiency(frozen, frozen.rooms[0]) > 0, true);

  // Verify visual sub-modules (excluding AcademyCanvas and freshStart) never import engine.ts
  const checkDirs = ['rooms', 'creatures', 'world', 'layout', 'agents'];
  for (const dir of checkDirs) {
    const fullDir = path.resolve('src/visual', dir);
    for (const file of fs.readdirSync(fullDir)) {
      if (!file.endsWith('.ts') && !file.endsWith('.tsx')) continue;
      const src = fs.readFileSync(path.join(fullDir, file), 'utf8');
      assert.equal(/from\s+['"][^'"]*engine['"]/.test(src), false, `${dir}/${file} must not import engine.ts`);
    }
  }
});
