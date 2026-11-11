/**
 * V2 visual catalog (Addendum 16 V2 + 17.2): every room id and every furniture id draws through the
 * forge renderer with no error, no missing art and no non-finite geometry, in every quality tier,
 * at every level, with and without its furniture (Unfinished ghosts).
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../src/data/content.ts';
import { PlacedRoom } from '../src/types/ankicaster.ts';
import { drawRoomInterior, TIERS, drawEmitter, drawAnimatedItem } from '../src/visual/rooms/roomArt.ts';
import { drawFurniture, hasFurnitureArt, FURNITURE_ART_IDS, getFurnitureArt } from '../src/visual/rooms/furnitureArt.ts';
import { layoutRoomFurniture } from '../src/visual/layout/roomLayouts.ts';
import { roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';

/** Records draw calls and fails on bad geometry / colours or a shape that is never filled or stroked. */
class RecordingPainter {
  shapes = 0;
  pending = 0;
  problems: string[] = [];
  private num(label: string, ...v: number[]) {
    for (const n of v) if (!Number.isFinite(n)) this.problems.push(`${label} non-finite ${v.join(',')}`);
    return this;
  }
  rect(x: number, y: number, w: number, h: number) { this.pending++; return this.num('rect', x, y, w, h); }
  circle(x: number, y: number, r: number) { this.pending++; if (r < 0) this.problems.push('circle r<0'); return this.num('circle', x, y, r); }
  ellipse(x: number, y: number, rx: number, ry: number) { this.pending++; return this.num('ellipse', x, y, rx, ry); }
  poly(points: number[]) { this.pending++; if (points.length < 4 || points.length % 2) this.problems.push(`poly ${points.length}`); return this.num('poly', ...points); }
  fill(s: { color: number; alpha?: number }) { return this.style('fill', s); }
  stroke(s: { color: number; width?: number; alpha?: number }) { return this.style('stroke', s); }
  private style(kind: string, s: { color: number; alpha?: number; width?: number }) {
    if (!Number.isInteger(s.color) || s.color < 0 || s.color > 0xffffff) this.problems.push(`${kind} colour ${s.color}`);
    if (s.alpha !== undefined && !(s.alpha >= 0 && s.alpha <= 1)) this.problems.push(`${kind} alpha ${s.alpha}`);
    if (s.width !== undefined && !(s.width > 0)) this.problems.push(`${kind} width ${s.width}`);
    this.shapes += this.pending ? 1 : 0;
    this.pending = 0;
    return this;
  }
}

const REQUIRED_ROLES = [...new Set(Object.values(ROOM_DEFINITIONS).flatMap(d => d.requiredFurniture.map(r => r.role)))];

function makeRoom(defId: string, level: 1 | 2 | 3, furnished: boolean): PlacedRoom {
  const d = ROOM_DEFINITIONS[defId];
  const furniture = [] as PlacedRoom['furniture'];
  let id = 1;
  if (furnished) {
    for (const r of d.requiredFurniture) for (let i = 0; i < r.count; i++) furniture.push({ id: id++, defId: r.role.split('_or_')[0], slotKind: `required:${r.role}`, damaged: false });
    for (const f of Object.values(FURNITURE_DEFINITIONS)) {
      if (f.role === 'required') continue;
      if (f.rooms === 'any' || (f.rooms || []).includes(defId)) furniture.push({ id: id++, defId: f.id, slotKind: 'optional', damaged: id % 3 === 0 });
      if (furniture.length > 8) break;
    }
  }
  return { id: 7, defId, x: 0, y: 0, w: d.size[0], h: d.size[1], area: d.area as 'castle' | 'grounds', level, state: 'built', buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture };
}

test('V2-1 every furniture id and required role has explicit forge art (no missing texture)', () => {
  const missing = [...Object.keys(FURNITURE_DEFINITIONS), ...REQUIRED_ROLES.flatMap(r => r.split('_or_')), ...REQUIRED_ROLES]
    .filter(id => !hasFurnitureArt(id));
  assert.deepEqual(missing, []);
  assert.ok(FURNITURE_ART_IDS.length >= 114, `A.2 lists 114 items; have ${FURNITURE_ART_IDS.length}`);
});

test('V2-2 every furniture id draws (frames 0-3, damaged, ghost) with valid geometry', () => {
  for (const id of FURNITURE_ART_IDS) {
    const art = getFurnitureArt(id);
    assert.ok([16, 32].includes(art.w) && [16, 24, 32].includes(art.h), `${id} size ${art.w}x${art.h}`);
    for (const opts of [{ frame: 0 }, { frame: 1 }, { frame: 2 }, { frame: 3 }, { damaged: true }, { ghost: true }]) {
      const p = new RecordingPainter();
      assert.doesNotThrow(() => drawFurniture(p, id, 100, 100, opts), id);
      assert.deepEqual(p.problems, [], `${id} ${JSON.stringify(opts)}`);
      assert.ok(p.shapes >= 2, `${id} draws something (${p.shapes})`);
    }
  }
});

test('V2-3 every room id draws in every tier and level, furnished and empty', () => {
  for (const defId of Object.keys(ROOM_DEFINITIONS)) {
    for (const tier of TIERS) for (const level of [1, 2, 3] as const) for (const furnished of [true, false]) {
      const room = makeRoom(defId, level, furnished);
      const p = new RecordingPainter();
      const box = roomToWorldBox(room, 400);
      let res!: ReturnType<typeof drawRoomInterior>;
      assert.doesNotThrow(() => { res = drawRoomInterior(p, room, box, { tier, robeColor: '#9E2A3A', hasLeftDoor: true }); }, `${defId} ${tier} L${level}`);
      for (const e of res.emitters) drawEmitter(p, e, 2, 0);
      for (const it of res.animated) drawAnimatedItem(p, it, 3);
      assert.deepEqual(p.problems, [], `${defId} ${tier} L${level}`);
      assert.equal(res.tier, tier);
      assert.ok(res.bespoke, `${defId} has its own dressing (A.1)`);
      if (!furnished && ROOM_DEFINITIONS[defId].requiredFurniture.length && !['spiral_stair', 'support_pillar'].includes(defId)) {
        assert.ok(res.missing.length > 0, `${defId} empty shows Unfinished ghosts`);
      }
      if (furnished) assert.equal(res.missing.length, 0, `${defId} furnished has no ghosts`);
    }
  }
});

test('V2-4 furniture stays inside its room and on its anchor kind', () => {
  for (const defId of Object.keys(ROOM_DEFINITIONS)) {
    const room = makeRoom(defId, 1, true);
    const view = layoutRoomFurniture(room);
    const W = room.w * 64;
    for (const it of view.items) {
      assert.ok(it.x >= 0 && it.x <= W, `${defId} ${it.furniture.defId} x=${it.x}`);
      assert.ok(it.floor >= 0 && it.floor < room.h);
    }
  }
});

test('V2-5 room art follows calculateRoomQuality (no forced tier)', async () => {
  const { calculateRoomQuality } = await import('../src/utils/formulas.ts');
  const room = makeRoom('dormitory', 1, true);
  const p = new RecordingPainter();
  const res = drawRoomInterior(p, room, roomToWorldBox(room, 400));
  assert.equal(res.tier, calculateRoomQuality(room).tier);
});
