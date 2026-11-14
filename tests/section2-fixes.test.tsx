import test from 'node:test';
import assert from 'node:assert/strict';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { createInitialGameState } from '../src/data/initialState.ts';
import { POTION_RECIPES, ROOM_DEFINITIONS } from '../src/data/content.ts';
import { academyFurnitureEffect } from '../src/utils/formulas.ts';
import { deckPool } from '../src/utils/decks.ts';
import type { FullGameState, PlacedRoom } from '../src/types/ankicaster.ts';

function makeBuiltRoom(id: number, defId: string, x: number, y: number, area: 'castle' | 'grounds' = 'castle'): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  const [w, h] = def?.size || [1, 1];
  const furniture = (def?.requiredFurniture || []).map((req, idx) => ({
    id: id * 100 + idx + 1,
    defId: req.role,
    slotKind: `required:${req.role}`,
    damaged: false
  }));
  return {
    id,
    defId,
    x,
    y,
    w,
    h,
    area,
    state: 'built',
    level: 1,
    buildProgress: 0,
    buildRequired: 0,
    cleanliness: 100,
    furniture,
    settings: {}
  };
}

test('Section 2: ringBell clamps cleanliness >= 0, applies starfall_chandelier once, and produces pond/apiary', () => {
  const s = createInitialGameState();
  s.rooms.forEach(r => { r.cleanliness = 0; });
  const hall = s.rooms.find(r => r.defId === 'entrance_hall')!;
  hall.furniture.push({ id: 9991, defId: 'starfall_chandelier', slotKind: 'optional', damaged: false });
  const pond = makeBuiltRoom(50, 'pond', 0, 0, 'grounds');
  const apiary = makeBuiltRoom(51, 'apiary', 2, 0, 'grounds');
  s.rooms.push(pond, apiary);

  const beforeInsight = s.resources.insight;
  AnkicasterEngine.ringBell(s, []);

  for (const r of s.rooms) {
    assert.ok(r.cleanliness >= 0, `room ${r.defId} cleanliness >= 0 (got ${r.cleanliness})`);
  }
  assert.ok(Math.abs((s.resources.insight - beforeInsight) - 0.3) < 1e-6, `starfall_chandelier grants +0.3 once, got ${s.resources.insight - beforeInsight}`);
  assert.ok(s.resources.fish > 0, 'pond produces fish');
  assert.ok(s.resources.nectar > 0, 'apiary produces nectar');
});

test('Section 2: academyFurnitureEffect includes room-scoped bonuses when targetRoom omitted and ward_circle covers adjacent', () => {
  const s = createInitialGameState();
  const dorm = makeBuiltRoom(20, 'dormitory', 1, 0, 'castle');
  dorm.furniture.push({ id: 2001, defId: 'dreamcatcher_bed', slotKind: 'optional', damaged: false });
  dorm.furniture.push({ id: 2002, defId: 'ward_circle', slotKind: 'optional', damaged: false });
  const adj = makeBuiltRoom(21, 'library', 2, 0, 'castle');
  s.rooms.push(dorm, adj);

  assert.equal(academyFurnitureEffect(s.rooms, 'composure_bonus'), 5);
  assert.equal(academyFurnitureEffect(s.rooms, 'hazard_chance_pct', adj), -10);
});

test('Section 2: addFurniture, removeFurniture, upgradeRoom, demolishRoom enforce invariants', () => {
  let s = createInitialGameState();
  const site = makeBuiltRoom(30, 'dormitory', 1, 0, 'castle');
  site.state = 'site';
  s.rooms.push(site);

  assert.equal(AnkicasterEngine.upgradeRoom(s, 30).success, false, 'cannot upgrade construction site');
  assert.equal(AnkicasterEngine.addFurniture(s, 30, 'bookshelf').success, false, 'cannot add furniture to construction site');

  site.state = 'built';
  site.level = 2;
  s.mana = 5000;
  s.resources.timber = 500;
  s.knownPatterns.push('bookshelf');
  const b1 = AnkicasterEngine.addFurniture(s, 30, 'bookshelf');
  assert.equal(b1.success, true);
  const b2 = AnkicasterEngine.addFurniture(b1.state, 30, 'bookshelf');
  assert.equal(b2.success, true);
  const b3 = AnkicasterEngine.addFurniture(b2.state, 30, 'bookshelf');
  assert.equal(b3.success, false, 'cannot stack > 2 same item in one room');

  const reqId = site.furniture.find(f => f.slotKind.startsWith('required:'))!.id;
  assert.equal(AnkicasterEngine.removeFurniture(b2.state, 30, reqId).success, false, 'cannot remove required fixture');

  const opt = b2.state.rooms.find(r => r.id === 30)!.furniture.find(f => !f.slotKind.startsWith('required:'))!;
  const rem = AnkicasterEngine.removeFurniture(b2.state, 30, opt.id);
  assert.equal(rem.success, true);
  assert.equal(rem.state.furnitureInventory?.bookshelf, 1, 'removed optional furniture returned to inventory');

  // Damaged furniture is NOT returned to inventory on demolish
  const dorm2 = rem.state.rooms.find(r => r.id === 30)!;
  dorm2.furniture.find(f => f.defId === 'bookshelf')!.damaged = true;
  const dem = AnkicasterEngine.demolishRoom(rem.state, 30);
  assert.equal(dem.success, true);
  assert.equal(dem.state.furnitureInventory?.bookshelf, 1, 'damaged furniture not silently repaired into inventory');
});

test('Section 2: enrollStudent counts bunk_bed bed_slots, assignCareer guards student/away, retire clears tamerId', () => {
  const s = createInitialGameState();
  s.mana = 500;
  s.wizard.levels.arcane = 5;
  s.allCards = Object.fromEntries(Array.from({ length: 120 }, (_, i) => [i + 1, { id: i + 1, honestIvl: 5, queue: 0, type: 2 } as any]));
  const dorm = makeBuiltRoom(40, 'dormitory', 1, 0, 'castle');
  dorm.furniture = [
    { id: 4001, defId: 'bunk_bed', slotKind: 'required:bed', damaged: false }
  ];
  const cls = makeBuiltRoom(41, 'class_arcane', 2, 0, 'castle');
  s.rooms.push(dorm, cls);

  const e1 = AnkicasterEngine.enrollStudent(s, 'arcane', 'Alice', 'Curious', []);
  assert.equal(e1.success, true, e1.error);
  const e2 = AnkicasterEngine.enrollStudent(e1.state, 'arcane', 'Bob', 'Curious', []);
  assert.equal(e2.success, true, e2.error || 'bunk_bed provides 2 student bed slots');

  const studentId = e2.state.characters[0].id;
  assert.equal(AnkicasterEngine.assignCareer(e2.state, studentId, 'scholar').success, false, 'student cannot take career');

  // Retire master clears tamerId
  const master = e2.state.characters[0];
  master.status = 'resident';
  master.masteredSchools = ['arcane'];
  for (const cs of e2.state.cardSets.filter(x => x.characterId === master.id)) {
    for (const cid of cs.cardIds) e2.state.allCards[cid].honestIvl = 120;
  }
  e2.state.creatures.push({
    id: 777,
    defId: 'thistle_hare',
    nickname: 'Hop',
    status: 'wary',
    hungry: false,
    hatchProgress: 0,
    tamingProgress: 10,
    tamerId: master.id,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1
  });
  const ret = AnkicasterEngine.retireCharacter(e2.state, master.id);
  assert.equal(ret.success, true);
  assert.equal(ret.state.creatures[0].tamerId, undefined, 'retireCharacter clears creature.tamerId');
});

test('Section 2: Magic deck has all undiscovered potion recipes, school tags, and pass_curio works', () => {
  const s = createInitialGameState();
  const pool = deckPool('magic', s);
  const recipeTargets = new Set(pool.filter(c => c.type === 'recipe_page').map(c => c.targetId));
  const expectedUndiscovered = POTION_RECIPES.filter(p => !p.discovered).map(p => p.id);
  for (const id of expectedUndiscovered) {
    assert.ok(recipeTargets.has(id), `Magic deck includes recipe_page for ${id}`);
  }
  const sunCard = pool.find(c => c.targetId === 'sun_window');
  assert.equal(sunCard?.school, 'light');

  s.activeEvents.push({ eventId: 'peddler', dayArrived: 1 });
  const ev = AnkicasterEngine.resolveEvent(s, 'peddler', 'pass_curio');
  assert.ok(ev.summary.includes('declined'), 'pass_curio handled cleanly');
});
