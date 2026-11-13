/**
 * Preview creature debug: spawn statuses, honest-review path, and the add-on bundle
 * must not contain the panel.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

import { CREATURE_DEFINITIONS } from '../src/data/content.ts';
import { createInitialGameState } from '../src/data/initialState.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import type { CreatureInstance } from '../src/types/ankicaster.ts';
import { drawCreature, drawCreatureEgg } from '../src/visual/creatures/creatureArt.ts';
import { CreatureChoreographer } from '../src/visual/creatures/creatureChoreographer.ts';
import { getRiftGateVisualState } from '../src/visual/rooms/riftGateArt.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { getGroundY, getTotalWorldWidth } from '../src/visual/layout/gridToWorld.ts';
import { VisualWorld } from '../src/visual/world/VisualWorld.ts';
import {
  HABITAT_SAMPLES,
  clearDebugCreatures,
  fillPensPastCap,
  simulateHonestReviews,
  setRiftDebug,
  spawnDebugCreature,
  spawnHabitatSet,
  type DebugCreatureStatus
} from '../src/debug/creatureDebug.ts';

const PANEL_MARKER = 'ankicaster-creature-debug-panel-v4';

class ChainPainter {
  rect() { return this; }
  circle() { return this; }
  ellipse() { return this; }
  poly() { return this; }
  fill() { return this; }
  stroke() { return this; }
}

function sync(state: ReturnType<typeof createInitialGameState>) {
  const groundY = getGroundY(5);
  const nav = new NavGraph(state.rooms, groundY);
  const cc = new CreatureChoreographer(nav, groundY, getTotalWorldWidth(8));
  cc.syncState(state);
  return cc;
}

test('spawning each debug status renders, and away is omitted', () => {
  const statuses: DebugCreatureStatus[] = ['egg', 'wary', 'tamed', 'loose', 'away', 'unhomed'];
  for (const status of statuses) {
    const spawned = spawnDebugCreature(createInitialGameState(), 'bramblefox', status);
    assert.equal(spawned.state.debugUsed, true, status);
    const creature = spawned.state.creatures.find(c => c.id === spawned.creatureId);
    assert.ok(creature, status);
    const cc = sync(spawned.state);
    if (status === 'away') {
      assert.equal(cc.agents.has(creature.id), false, 'away is not an agent');
      continue;
    }
    assert.equal(cc.agents.has(creature.id), true, `${status} is drawn`);
    const agent = cc.agents.get(creature.id)!;
    if (status === 'unhomed') assert.equal(agent.unhomed, true);
    const painter = new ChainPainter();
    if (creature.status === 'egg') {
      drawCreatureEgg(painter as never, 'uncommon', 40, 80, creature.hatchProgress, 0, false);
    } else {
      drawCreature(painter as never, creature.defId, {
        x: 40,
        y: 80,
        facing: 'R',
        anim: 'idle',
        frame: 0,
        status: creature.status,
        bondLevel: creature.bondLevel,
        unhomed: agent.unhomed
      });
    }
  }
  assert.equal(Object.keys(CREATURE_DEFINITIONS).length, 40);
});

test('habitat set and cap fill are visible to the choreographer', () => {
  const habitats = spawnHabitatSet(createInitialGameState());
  assert.equal(habitats.state.debugUsed, true);
  assert.equal(
    habitats.state.creatures.filter(c => (habitats.state.debugCreatureIds || []).includes(c.id)).length,
    HABITAT_SAMPLES.length
  );
  const cc = sync(habitats.state);
  for (const sample of HABITAT_SAMPLES) {
    const creature = habitats.state.creatures.find(c => c.defId === sample.defId);
    assert.ok(creature, sample.habitat);
    assert.equal(cc.agents.has(creature.id), true, sample.habitat);
    assert.ok(habitats.state.rooms.some(r => r.defId === sample.roomDef && r.state === 'built'));
  }

  const filled = fillPensPastCap(createInitialGameState());
  const pen = sync(filled.state);
  assert.ok(pen.agents.size <= 40, `visible ${pen.agents.size}`);
  const egg = filled.state.creatures.find(c => c.status === 'egg');
  const loose = filled.state.creatures.find(c => c.status === 'loose');
  assert.ok(egg && pen.agents.has(egg.id), 'egg stays visible');
  assert.ok(loose && pen.agents.has(loose.id), 'loose stays visible');
  const hutch = filled.state.rooms.find(r => r.defId === 'gloom_hutch');
  assert.ok(hutch);
  assert.ok((pen.hiddenCounts.get(hutch.id) || 0) > 0, '1x1 pen reports +N');

  const cleared = clearDebugCreatures(filled.state);
  assert.equal(cleared.state.creatures.length, 0);
  assert.equal(cleared.state.debugUsed, true);
  assert.equal(sync(cleared.state).agents.size, 0);
});

test('simulated reviews call applyHonestReview', () => {
  const src = fs.readFileSync(path.resolve('src/debug/creatureDebug.ts'), 'utf8');
  const reviewer = fs.readFileSync(path.resolve('src/App.tsx'), 'utf8');
  assert.match(src, /AnkicasterEngine\.applyHonestReview\(/);
  assert.match(reviewer, /AnkicasterEngine\.applyHonestReview\(/);
  const start = spawnDebugCreature(createInitialGameState(), 'mossback_tortoise', 'wary').state;
  const wary = start.creatures.find(c => c.status === 'wary')!;
  assert.ok(wary.tamerId);
  const ran = simulateHonestReviews(start, 10);
  assert.equal(ran.state.reviewIndex, start.reviewIndex + 10);
  assert.equal(ran.state.bellIndex, start.bellIndex + 1);
  assert.ok(ran.state.mana > start.mana);
  const after = ran.state.creatures.find(c => c.id === wary.id) as CreatureInstance;
  assert.equal(after.tamingProgress, wary.tamingProgress + 10);
  assert.equal(ran.state.debugUsed, true);
  const single = AnkicasterEngine.applyHonestReview(start, 1, 3, 2000);
  const batched = simulateHonestReviews(start, 1);
  assert.equal(batched.state.reviewIndex, single.state.reviewIndex);
  assert.equal(batched.state.mana, single.state.mana);
  assert.equal(
    batched.state.creatures.find(c => c.id === wary.id)?.tamingProgress,
    single.state.creatures.find(c => c.id === wary.id)?.tamingProgress
  );
});

test('rift debug cycles the states the gate art reads', () => {
  const dormant = setRiftDebug(createInitialGameState(), 'dormant', 'crystal_caverns').state;
  assert.equal(getRiftGateVisualState(dormant), 'dormant');
  const open = setRiftDebug(dormant, 'open', 'crystal_caverns').state;
  assert.equal(getRiftGateVisualState(open), 'open');
  const out = setRiftDebug(open, 'expedition_out', 'ashen_wastes').state;
  assert.equal(getRiftGateVisualState(out), 'expedition_out');
  assert.equal(out.expeditions.find(e => e.state === 'active')?.destinationId, 'ashen_wastes');

  const world = new VisualWorld();
  world.camera.setViewportSize(1280, 800);
  world.setSnapshot(out);
  const back = setRiftDebug(out, 'returning', 'ashen_wastes').state;
  world.setSnapshot(back);
  assert.ok(world.riftReturningUntilMs >= 1000);
  assert.equal(getRiftGateVisualState(back, true), 'returning');
  assert.equal(back.debugUsed, true);
});

test('the creature debug panel is not in the add-on bundle', () => {
  const panel = fs.readFileSync(path.resolve('src/debug/CreatureDebugPanel.tsx'), 'utf8');
  assert.ok(panel.includes(PANEL_MARKER), 'panel source keeps its marker');
  const pkg = fs.readFileSync(path.resolve('package.json'), 'utf8');
  assert.match(pkg, /build:addon": "VITE_DEBUG_TOOLS=false /);
  const web = path.resolve('addon/web');
  assert.ok(fs.existsSync(path.join(web, 'index.html')), 'addon/web exists (run build:addon first)');
  const hits: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (!entry.name.endsWith('.map')) {
        const text = fs.readFileSync(full, 'utf8');
        if (text.includes(PANEL_MARKER)) hits.push(path.relative(web, full));
      }
    }
  };
  walk(web);
  assert.deepEqual(hits, []);
});
