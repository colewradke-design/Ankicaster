/**
 * V2 B: construction sites, countdown, pause tarp, cleanliness / lock / damage visuals and cosmetic
 * ambience (Addendum 5.5-5.7, 16 V2, 17.1). Also checks the visual layer never writes state and
 * that reduce motion freezes every loop and drops one-shot effects.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import { PlacedRoom, FullGameState } from '../src/types/ankicaster.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { reviewsToGo, reviewsToGoText, siteStage, siteFraction } from '../src/utils/construction.ts';
import { drawSite } from '../src/visual/rooms/siteArt.ts';
import { dirtLevel, drawDirt, drawLockHazard, drawRing } from '../src/visual/rooms/statusArt.ts';
import { drawEffect } from '../src/visual/rooms/effects.ts';
import { roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';
import { BuildMenuPanel } from '../src/components/GamePanels.tsx';

class Rec {
  problems: string[] = [];
  n = 0;
  private chk(...v: number[]) { for (const x of v) if (!Number.isFinite(x)) this.problems.push(`nan ${v}`); this.n++; return this; }
  rect(...a: number[]) { return this.chk(...a); }
  circle(...a: number[]) { return this.chk(...a); }
  ellipse(...a: number[]) { return this.chk(...a); }
  poly(p: number[]) { return this.chk(...p); }
  fill(s: { color: number; alpha?: number }) { if (s.alpha !== undefined && !(s.alpha >= 0 && s.alpha <= 1)) this.problems.push(`alpha ${s.alpha}`); return this; }
  stroke(s: { color: number; alpha?: number; width?: number }) { if (s.alpha !== undefined && !(s.alpha >= 0 && s.alpha <= 1)) this.problems.push(`alpha ${s.alpha}`); return this; }
}

function site(defId: string, progress: number, required = 40, paused = false): PlacedRoom {
  const d = ROOM_DEFINITIONS[defId];
  return { id: 77, defId, x: 0, y: 1, w: d.size[0], h: d.size[1], area: d.area as 'castle' | 'grounds', level: 1, state: 'site', buildRequired: required, buildProgress: progress, buildPaused: paused, cleanliness: 100, settings: {}, furniture: [] };
}

function deepFreeze<T>(o: T): T {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) {
    Object.freeze(o);
    for (const v of Object.values(o as object)) deepFreeze(v);
  }
  return o;
}

test('V2B-1 stage comes only from p = buildProgress / buildRequired (5.6 bands)', () => {
  const cases: Array<[number, number]> = [[0, 1], [0.1, 1], [0.2, 2], [0.39, 2], [0.4, 3], [0.6, 4], [0.79, 4], [0.8, 5], [0.95, 5], [0.999, 5], [1, 6]];
  for (const [p, st] of cases) assert.equal(siteStage(p), st, `p=${p}`);
  assert.equal(siteFraction(site('dormitory', 10, 40)), 0.25);
  // N = ceil((required - progress) / rate), rate 1 (engine advances 1 per honest review)
  assert.equal(reviewsToGo(site('dormitory', 10, 40)), 30);
  assert.equal(reviewsToGoText(site('dormitory', 39, 40)), 'About 1 honest review to go');
});

test('V2B-2 every room id draws as a site at 0.1/0.3/0.5/0.7/0.9/0.97 and paused', () => {
  for (const defId of Object.keys(ROOM_DEFINITIONS)) {
    for (const p of [0, 0.1, 0.3, 0.5, 0.7, 0.9, 0.97]) {
      for (const paused of [false, true]) {
        const r = site(defId, Math.round(p * 40), 40, paused);
        const g = new Rec();
        const res = drawSite(g, r, roomToWorldBox(r, 400), { robeColor: '#9E2A3A' });
        assert.deepEqual(g.problems, [], `${defId} p=${p}`);
        assert.equal(res.paused, paused);
        if (paused) {
          assert.ok(res.ribbon, 'paused ribbon');
          assert.equal(res.emitters.length, 0, 'no workers on a paused site');
        } else {
          assert.ok(res.emitters.some(e => e.kind === 'hammer'), 'spectral hammer on an active site');
        }
      }
    }
  }
});

test('V2B-3 Build panel countdown matches the map ring helper', () => {
  const s = createNewAcademy();
  s.rooms.push({ ...site('dormitory', 13, 40), id: 90, x: 3, y: 1 });
  s.rooms.push({ ...site('library', 5, 30, true), id: 91, x: 6, y: 1 });
  const html = renderToStaticMarkup(<BuildMenuPanel state={s} onPlaceRoom={() => {}} />);
  assert.ok(html.includes(reviewsToGoText(s.rooms.find(r => r.id === 90)!)), 'About 27 honest reviews to go');
  assert.ok(html.includes('About 27 honest reviews to go'));
  assert.ok(html.includes('Paused · About 25 honest reviews to go'));
});

test('V2B-4 pause keeps progress; the engine does not advance a paused site; resume continues', () => {
  let s = createNewAcademy();
  s.rooms.push({ ...site('dormitory', 3, 40), id: 90, x: 3, y: 1 });
  const cardId = Number(Object.keys(s.allCards)[0]);
  let r = AnkicasterEngine.setConstructionPaused(s, 90, true);
  assert.ok(r.success);
  s = r.state;
  s = AnkicasterEngine.applyHonestReview(s, cardId, 3, 2000).state;
  assert.equal(s.rooms.find(x => x.id === 90)!.buildProgress, 3, 'paused: no progress');
  r = AnkicasterEngine.setConstructionPaused(s, 90, false);
  s = AnkicasterEngine.applyHonestReview(r.state, cardId, 3, 2000).state;
  assert.equal(s.rooms.find(x => x.id === 90)!.buildProgress, 4, 'resumed: +1 per honest review');
  assert.equal(AnkicasterEngine.setConstructionPaused(s, 1, true).success, false, 'built rooms cannot be paused');
});

test('V2B-5 cleanliness decal sets, lock hazard, ring and effects draw cleanly', () => {
  assert.deepEqual([100, 70, 69, 40, 39, 20, 19, 0].map(dirtLevel), [0, 0, 1, 1, 2, 2, 3, 3]);
  const r = { ...site('dormitory', 0), state: 'built' as const, cleanliness: 5, lockReason: 'Spill of Night', lockedUntilReviewIndex: 20 };
  const box = roomToWorldBox(r, 400);
  const g = new Rec();
  assert.equal(drawDirt(g, r, box), 3);
  drawLockHazard(g, r, box);
  for (const p of [0, 0.01, 0.5, 1]) drawRing(g, 10, 10, 6, p, 0x7dd87a);
  for (const kind of ['dust', 'reveal', 'level', 'wipe', 'fade', 'pop'] as const) for (const t of [0, 0.3, 0.8, 1]) drawEffect(g, { kind, box, start: 0, ms: 1000, level: 3, name: 'Dormitory', color: 0xe0a33a }, t);
  assert.deepEqual(g.problems, []);
});

function rigWorldState(): FullGameState {
  const s = createNewAcademy({ robeColor: '#9E2A3A' });
  s.rooms.push({ ...site('dormitory', 13, 40), id: 90, x: 3, y: 1 });
  s.rooms.push({ ...site('library', 5, 30, true), id: 91, x: 6, y: 1 });
  s.rooms.push({ ...site('kitchen', 0, 1), id: 92, x: 0, y: 0, state: 'built', cleanliness: 8, lockedUntilReviewIndex: 50, lockReason: 'Hex Fog', furniture: [{ id: 1, defId: 'cooking_range', slotKind: 'required:cooking_range', damaged: true }] });
  return s;
}

test('V2B-6 the visual layer never writes game state (deep-frozen snapshot)', async () => {
  const { VisualWorld } = await import('../src/visual/world/VisualWorld.ts');
  const world = new VisualWorld();
  const s = rigWorldState();
  const before = JSON.stringify(s);
  deepFreeze(s);
  assert.doesNotThrow(() => {
    world.setSnapshot(s, 90);
    for (let i = 0; i < 30; i++) world.update(70);
    // a state change (site completes, room levels up, room removed) triggers effects, still read-only
    const s2 = deepFreeze({ ...s, rooms: s.rooms.map(r => (r.id === 90 ? { ...r, state: 'built' as const, buildProgress: 40 } : r.id === 2 ? { ...r, level: 3 as const } : r)).filter(r => r.id !== 91) });
    world.setSnapshot(s2);
    for (let i = 0; i < 30; i++) world.update(70);
  });
  assert.equal(JSON.stringify(s), before);
});

test('V2B-7 ambience runs at a fixed real-time rate; reduce motion freezes it and drops effects', async () => {
  const { VisualWorld, AMBIENT_FRAME_MS } = await import('../src/visual/world/VisualWorld.ts');
  const world = new VisualWorld();
  const s = rigWorldState();
  world.setSnapshot(s);
  const frames = new Set<number>();
  for (let i = 0; i < 8; i++) { world.update(AMBIENT_FRAME_MS); frames.add(world.ambientFrame); }
  assert.ok(frames.size >= 3, 'loops advance with time');
  // the frame depends on the clock only: more reviews do not change it
  const f0 = world.ambientFrameFor(false);
  world.setSnapshot({ ...s, reviewIndex: s.reviewIndex + 500 });
  assert.equal(world.ambientFrameFor(false), f0);
  // locked / unfinished rooms do not animate; paused sites have no workers
  assert.ok(world.ambientGroups.some(gp => !gp.animate));
  // reduce motion: frame 0 forever, and state changes create no effects
  const rm = { ...s, settings: { ...s.settings, reduceMotion: true } };
  world.setSnapshot(rm);
  for (let i = 0; i < 10; i++) { world.update(AMBIENT_FRAME_MS); assert.equal(world.ambientFrame, 0); }
  world.setSnapshot({ ...rm, rooms: rm.rooms.filter(r => r.id !== 91) });
  world.update(16);
  assert.equal(world.effects.length, 0);
  // with motion on, the same change produces a one-shot effect that expires on its own
  const w2 = new VisualWorld();
  w2.setSnapshot(s);
  w2.setSnapshot({ ...s, rooms: s.rooms.filter(r => r.id !== 91) });
  assert.equal(w2.effects.length, 1);
  for (let i = 0; i < 20; i++) w2.update(100);
  assert.equal(w2.effects.length, 0);
});

test('tier up triggers a wipe and tier down a fade; reduceMotion triggers neither', async () => {
  const { VisualWorld } = await import('../src/visual/world/VisualWorld.ts');
  const { roomTier, TIERS } = await import('../src/visual/rooms/roomArt.ts');
  const bed = (id: number): PlacedRoom['furniture'][number] => ({ id, defId: 'canopy_bed', slotKind: 'bed', damaged: false });
  const dorm = (furniture: PlacedRoom['furniture']): PlacedRoom => ({
    id: 80, defId: 'dormitory', x: 0, y: 0, w: 2, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture
  });
  const bare = dorm([]);
  const furnished = dorm([bed(1), bed(2)]);
  assert.ok(TIERS.indexOf(roomTier(furnished)) > TIERS.indexOf(roomTier(bare)), 'two canopy beds climb a tier');
  const s = createNewAcademy();
  s.rooms = [...s.rooms, bare];
  const world = new VisualWorld();
  world.setSnapshot(s);
  world.setSnapshot({ ...s, rooms: s.rooms.map(r => (r.id === 80 ? furnished : r)) });
  assert.ok(world.effects.some(e => e.kind === 'wipe'), 'tier up wipes');
  assert.ok(!world.effects.some(e => e.kind === 'fade'));
  world.setSnapshot({ ...s, rooms: s.rooms.map(r => (r.id === 80 ? bare : r)) });
  assert.ok(world.effects.some(e => e.kind === 'fade'), 'tier down fades');

  const still = new VisualWorld();
  const rm = { ...s, settings: { ...s.settings, reduceMotion: true } };
  still.setSnapshot(rm);
  still.setSnapshot({ ...rm, rooms: rm.rooms.map(r => (r.id === 80 ? furnished : r)) });
  still.setSnapshot({ ...rm, rooms: rm.rooms.map(r => (r.id === 80 ? bare : r)) });
  assert.equal(still.effects.length, 0, 'reduceMotion swaps the skin with no effect');
});

test('an output pop is created once per bell per producing room, and none for an Unfinished room', async () => {
  const { VisualWorld } = await import('../src/visual/world/VisualWorld.ts');
  const { isRoomUnfinished } = await import('../src/utils/requiredFurniture.ts');
  const wood: PlacedRoom = {
    id: 81, defId: 'woodlot', x: 9, y: 0, w: 1, h: 1, area: 'grounds', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  };
  const greenhouse: PlacedRoom = {
    id: 82, defId: 'greenhouse', x: 6, y: 0, w: 2, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  };
  assert.equal(isRoomUnfinished(greenhouse), true);
  const base = createNewAcademy();
  base.rooms = [...base.rooms, wood, greenhouse];
  base.bellIndex = 0;
  const world = new VisualWorld();
  world.setSnapshot(base);
  const bell = {
    ...base,
    bellIndex: 1,
    reviewIndex: base.reviewIndex,
    resourceLedger: {
      bells: [{ entries: [
        { resource: 'timber', amount: 2, source: 'Woodlot' },
        { resource: 'provisions', amount: 1.5, source: 'Greenhouse' },
        { resource: 'herbs', amount: 0.5, source: 'Greenhouse' }
      ] }],
      recent: {}
    }
  };
  world.setSnapshot(bell);
  const pops = () => world.effects.filter(e => e.kind === 'pop');
  assert.equal(pops().length, 1);
  assert.equal(pops()[0].roomId, 81);
  assert.equal(pops()[0].name, '+2 Timber');
  assert.ok(!pops().some(e => e.roomId === 82), 'Unfinished greenhouse has no pop');
  world.setSnapshot({ ...bell, reviewIndex: bell.reviewIndex + 500 });
  assert.equal(pops().length, 1, 'reviews do not add pops');
  world.setSnapshot(bell);
  assert.equal(pops().length, 1, 'the same bell does not pop again');
  world.setSnapshot({ ...bell, bellIndex: 2 });
  assert.equal(pops().filter(e => e.roomId === 81).length, 2, 'the next bell pops once more');

  const quiet = new VisualWorld();
  const rm = { ...base, settings: { ...base.settings, reduceMotion: true } };
  quiet.setSnapshot(rm);
  quiet.setSnapshot({ ...bell, settings: rm.settings });
  assert.equal(quiet.effects.filter(e => e.kind === 'pop').length, 0);
});
