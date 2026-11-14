/**
 * Building, placement, move/demolish and headmaster look (fix pass 3).
 * GDD 15.2 grid, 15.3 placement rules P1-P7, 15.4 cancel/demolish refunds, 7.2 appearance.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

import { AnkicasterEngine } from '../src/utils/engine.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { validatePlacement, findAutoPlacement, roomLimitStatus } from '../src/utils/placement.ts';
import { computeReachability } from '../src/utils/reachability.ts';
import { normalizeAppearance, DEFAULT_APPEARANCE } from '../src/utils/appearance.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { getGroundY, roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';
import { FullGameState, PlacedRoom } from '../src/types/ankicaster.ts';
import { ROOM_DEFINITIONS } from '../src/data/content.ts';

function rich(): FullGameState {
  const s = createNewAcademy({ robeColor: '#9E2A3A', hat: 'crown' });
  s.mana = 100000;
  Object.assign(s.resources, {
    timber: 5000, stone: 5000, glass: 5000, cloth: 5000,
    insight: 5000, herbs: 5000, radiance: 5000, umbra: 5000, reagents: 5000,
    crystal: 5000, heartwood: 5000
  });
  s.roomPlans = {};
  for (const id of Object.keys(ROOM_DEFINITIONS)) s.roomPlans[id] = 40;
  return s;
}

function overlapping(rooms: PlacedRoom[]): boolean {
  for (let i = 0; i < rooms.length; i++) for (let j = i + 1; j < rooms.length; j++) {
    const a = rooms[i], b = rooms[j];
    if (a.area !== b.area) continue;
    const xo = a.x < b.x + b.w && b.x < a.x + a.w;
    const yo = a.area === 'grounds' || (a.y < b.y + b.h && b.y < a.y + a.h);
    if (xo && yo) return true;
  }
  return false;
}

const total = (s: FullGameState) => s.mana + s.resources.timber + s.resources.stone + s.resources.glass + s.resources.cloth;

test('B1 uniqueness: a second Wizard\'s Study or Entrance Hall is rejected by the engine', () => {
  const s = rich();
  for (const id of ['wizard_study', 'entrance_hall']) {
    assert.equal(roomLimitStatus(s.rooms, id).capped, true, `${id} capped at 1`);
    const auto = AnkicasterEngine.placeRoom(s, id);
    assert.equal(auto.success, false, `${id} auto rejected`);
    assert.match(auto.error || '', /Only one/);
    const manual = AnkicasterEngine.placeRoom(s, id, 'castle', 0, 0);
    assert.equal(manual.success, false, `${id} manual rejected`);
    assert.equal(manual.state, s, 'state untouched');
  }
  // Rift Gate: one per Academy (GDD 16.9 duplicates level it up), sites count
  const r1 = AnkicasterEngine.placeRoom(s, 'rift_gate');
  assert.equal(r1.success, true);
  assert.equal(AnkicasterEngine.placeRoom(r1.state, 'rift_gate').success, false);
  // Unlimited rooms are unaffected
  const d1 = AnkicasterEngine.placeRoom(s, 'dormitory');
  assert.equal(AnkicasterEngine.placeRoom(d1.state, 'dormitory').success, true);
});

test('B2 overlap: manual placement on an occupied tile is rejected; auto never overlaps', () => {
  const s = rich();
  // Entrance Hall covers columns 3-4 on floor 0
  const bad = AnkicasterEngine.placeRoom(s, 'dormitory', 'castle', 4, 0);
  assert.equal(bad.success, false);
  assert.match(bad.error || '', /Overlaps Entrance Hall/);
  assert.equal(validatePlacement(s, 'corridor', 'castle', 5, 1).valid, false, 'study spans floors 0-1');

  // Fill the castle with auto placements: never an overlap, then a clear "no space" error
  let cur = s;
  let placed = 0;
  for (const id of ['dormitory', 'corridor']) {
    for (let i = 0; i < 60; i++) {
      const res = AnkicasterEngine.placeRoom(cur, id);
      if (!res.success) {
        assert.match(res.error || '', /No free valid space/);
        break;
      }
      cur = res.state;
      placed++;
      assert.equal(overlapping(cur.rooms), false, `no overlap after ${placed} auto placements`);
    }
  }
  assert.ok(placed > 10, 'auto placement filled many spots');
  const full = AnkicasterEngine.placeRoom(cur, 'corridor');
  assert.equal(full.success, false);
  assert.equal(full.state.mana, cur.mana, 'nothing charged when there is no space');
});

test('B3 invalid placement: bounds, support, area, plots, sky and floor rules', () => {
  const s = rich();
  const v = (id: string, area: 'castle' | 'grounds', x: number, y: number) => validatePlacement(s, id, area, x, y);
  assert.match(v('corridor', 'castle', 8, 0).errors[0], /Outside/);
  assert.match(v('corridor', 'castle', -1, 0).errors[0], /Outside/);
  assert.match(v('corridor', 'castle', 0, 5).errors[0], /Outside/);
  assert.match(v('corridor', 'castle', 0, 1).errors.join(), /support/, 'floating room (P3)');
  assert.equal(v('corridor', 'castle', 3, 1).valid, true, 'above the Entrance Hall is supported');
  assert.match(v('dormitory', 'grounds', 6, 0).errors[0], /inside the castle/, 'castle room on a plot (P1)');
  assert.match(v('woodlot', 'castle', 0, 0).errors[0], /grounds plot/);
  assert.match(v('quarry', 'grounds', 2, 0).errors[0], /unlocked plot/, 'only 6 plots at the start (15.2)');
  assert.equal(v('quarry', 'grounds', 7, 0).valid, true);
  assert.match(v('quarry', 'grounds', 8, 0).errors[0], /Overlaps/);
  assert.match(v('pond', 'grounds', 8, 0).errors.join(), /adjacent plots|Overlaps/, 'multi-plot across the castle (P7)');
  // P6: Tide Tank floor 0 only
  assert.match(validatePlacement(s, 'tide_tank', 'castle', 3, 1).errors.join(), /Ground floor/);
  // P5: nothing may be built over a needs-sky room
  const gh = AnkicasterEngine.placeRoom(s, 'greenhouse', 'castle', 6, 0);
  assert.equal(gh.success, true, gh.error);
  const over = validatePlacement(gh.state, 'corridor', 'castle', 6, 1);
  assert.match(over.errors.join(), /sky/);
  // Engine refuses the invalid spot and charges nothing
  const r = AnkicasterEngine.placeRoom(s, 'corridor', 'castle', 0, 3);
  assert.equal(r.success, false);
  assert.equal(r.state.mana, s.mana);
  // Unconnected rooms are allowed (P4) but warned about
  const lone = validatePlacement(s, 'corridor', 'castle', 7, 0);
  assert.equal(lone.valid, true);
  assert.equal(lone.warnings.length, 1);
});

test('B4 auto placement prefers a connected free spot and reports no space', () => {
  const s = rich();
  const spot = findAutoPlacement(s, 'dormitory');
  assert.ok(spot);
  const res = AnkicasterEngine.placeRoom(s, 'dormitory');
  assert.equal(res.success, true);
  const room = res.state.rooms.find(r => r.id === res.roomId)!;
  assert.equal(overlapping(res.state.rooms), false);
  const made = { ...room, state: 'built' as const };
  const reach = computeReachability(res.state.rooms.map(r => (r.id === room.id ? made : r)));
  assert.equal(reach.get(room.id)?.reachable, true, 'auto spot is connected');
  // Grounds: six plots, one already a Vegetable Patch, so five quarries fit and the sixth does not
  let cur = s;
  for (let i = 0; i < 5; i++) {
    const g = AnkicasterEngine.placeRoom(cur, 'quarry');
    assert.equal(g.success, true, g.error);
    cur = g.state;
  }
  const none = AnkicasterEngine.placeRoom(cur, 'quarry');
  assert.equal(none.success, false);
  assert.match(none.error || '', /No free valid space/);
});

test('B5 move keeps the room\'s level, furniture, progress and state, and stays valid', () => {
  let s = rich();
  const placed = AnkicasterEngine.placeRoom(s, 'dormitory', 'castle', 6, 0);
  assert.equal(placed.success, true, placed.error);
  s = placed.state;
  const id = placed.roomId!;
  const room = s.rooms.find(r => r.id === id)!;
  room.state = 'built';
  room.level = 2;
  room.cleanliness = 73;
  room.furniture.push({ id: 9001, defId: 'simple_cot', slotKind: 'bed', damaged: false });
  s.characters.push({ id: 77, bedRoomId: id } as any);

  // Invalid targets
  assert.equal(AnkicasterEngine.moveRoom(s, id, 3, 0).success, false, 'onto the Entrance Hall');
  assert.equal(AnkicasterEngine.moveRoom(s, id, 0, 3).success, false, 'floating');
  assert.equal(AnkicasterEngine.moveRoom(s, id, 7, 0).success, false, 'out of bounds (2 wide)');

  // Valid: stack it on floor 1 above the Entrance Hall
  const mv = AnkicasterEngine.moveRoom(s, id, 3, 1);
  assert.equal(mv.success, true, mv.error);
  const after = mv.state.rooms.find(r => r.id === id)!;
  assert.deepEqual([after.x, after.y], [3, 1]);
  assert.equal(after.level, 2);
  assert.equal(after.state, 'built');
  assert.equal(after.cleanliness, 73);
  assert.deepEqual(after.furniture, room.furniture);
  assert.equal(mv.state.characters.find(c => c.id === 77)!.bedRoomId, id, 'occupants stay');
  assert.equal(mv.state.mana, s.mana, 'moving is free');
  assert.equal(overlapping(mv.state.rooms), false);

  // Something resting on a room blocks moving it (P3)
  const top = AnkicasterEngine.placeRoom(mv.state, 'corridor', 'castle', 3, 2);
  assert.equal(top.success, true, top.error);
  const blocked = AnkicasterEngine.moveRoom(top.state, id, 6, 0);
  assert.equal(blocked.success, false);
  assert.match(blocked.error || '', /support/);

  // A site keeps its build progress when moved
  const site = AnkicasterEngine.placeRoom(s, 'corridor', 'castle', 0, 0);
  const st = site.state;
  st.rooms.find(r => r.id === site.roomId)!.buildProgress = 2;
  const ms = AnkicasterEngine.moveRoom(st, site.roomId!, 3, 1);
  assert.equal(ms.success, true, ms.error);
  const sr = ms.state.rooms.find(r => r.id === site.roomId)!;
  assert.equal(sr.state, 'site');
  assert.equal(sr.buildProgress, 2);
});

test('B6 demolish refund bounds: cancel = 100%, demolish = 50% materials and 0 mana, never more than spent', () => {
  const s = rich();
  // Common materials sit under the storage cap, so a refund is allowed to land.
  s.resources.timber = 100;
  s.resources.stone = 100;
  const placed = AnkicasterEngine.placeRoom(s, 'dormitory', 'castle', 6, 0); // 30T 10S
  const afterPlace = placed.state;
  const id = placed.roomId!;

  // Cancel before any progress: exactly what was paid
  const cancel = AnkicasterEngine.demolishRoom(afterPlace, id);
  assert.equal(cancel.success, true);
  assert.equal(cancel.state.mana, s.mana);
  assert.equal(cancel.state.resources.timber, s.resources.timber);
  assert.equal(total(cancel.state), total(s), 'net zero');

  // Demolish after progress/built: half the materials, no mana
  const built = structuredClone(afterPlace);
  const r = built.rooms.find(x => x.id === id)!;
  r.state = 'built';
  r.buildProgress = r.buildRequired;
  r.furniture.push({ id: 5, defId: 'simple_cot', slotKind: 'bed', damaged: false });
  const dem = AnkicasterEngine.demolishRoom(built, id);
  assert.equal(dem.success, true);
  assert.equal(dem.state.mana, built.mana, '0% mana');
  assert.equal(dem.state.resources.timber, built.resources.timber + 15);
  assert.equal(dem.state.resources.stone, built.resources.stone + 5);
  assert.ok(total(dem.state) < total(s), 'demolishing never returns more than was spent');
  assert.equal(dem.state.furnitureInventory?.simple_cot, 1, 'furniture returned to inventory');
  assert.equal(dem.state.rooms.some(x => x.id === id), false);

  // Pre-built starter rooms were never paid for: no refund
  const patch = s.rooms.find(x => x.defId === 'vegetable_patch')!;
  const dv = AnkicasterEngine.demolishRoom(s, patch.id);
  assert.equal(dv.success, true, dv.error);
  assert.equal(total(dv.state), total(s));
});

test('B7 no-exploit loop: build/renovate/demolish and build/cancel never gain mana, materials or renown', () => {
  let s = rich();
  s.resources.timber = 150;
  s.resources.stone = 100;
  const start = { total: total(s), renown: s.renown };
  for (let i = 0; i < 5; i++) {
    const p = AnkicasterEngine.placeRoom(s, 'dormitory', 'castle', 6, 0);
    assert.equal(p.success, true, p.error);
    let st = p.state;
    const room = st.rooms.find(r => r.id === p.roomId)!;
    room.state = 'built';
    room.buildProgress = room.buildRequired;
    const up = AnkicasterEngine.upgradeRoom(st, room.id);
    assert.equal(up.success, true);
    st = up.state;
    const d = AnkicasterEngine.demolishRoom(st, room.id);
    assert.equal(d.success, true);
    s = d.state;
    assert.ok(total(s) < start.total, 'each loop costs something');
    assert.ok(s.renown <= start.renown, 'renovation renown is taken back');
  }
  // place + cancel is exactly neutral
  const before = total(s);
  const p = AnkicasterEngine.placeRoom(s, 'corridor');
  const c = AnkicasterEngine.demolishRoom(p.state, p.roomId!);
  assert.equal(total(c.state), before);
  // re-installing stored furniture is free but only once per stored item
  const inv = structuredClone(c.state);
  inv.furnitureInventory = { potted_fern: 1 };
  const eh = inv.rooms.find(r => r.defId === 'entrance_hall')!;
  const a1 = AnkicasterEngine.addFurniture(inv, eh.id, 'potted_fern');
  assert.equal(a1.success, true, a1.error);
  assert.equal(a1.state.mana, inv.mana);
  assert.equal(a1.state.furnitureInventory?.potted_fern, 0);
  const a2 = AnkicasterEngine.addFurniture(a1.state, eh.id, 'potted_fern');
  assert.ok(!a2.success || a2.state.mana < a1.state.mana, 'second copy is paid for');
});

test('B8 demolish/move guards: last Entrance Hall/Study, hazards, support and nav-graph cut-offs', () => {
  const s = rich();
  const eh = s.rooms.find(r => r.defId === 'entrance_hall')!;
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  assert.equal(AnkicasterEngine.demolishRoom(s, eh.id).success, false);
  assert.equal(AnkicasterEngine.demolishRoom(s, study.id).success, false);
  // Legacy save with a duplicate study: the extra one can go, the last one can't
  const dup = structuredClone(s);
  dup.rooms.push({ ...structuredClone(study), id: 999999, x: 0, y: 0, h: 2 });
  assert.equal(AnkicasterEngine.demolishRoom(dup, 999999).success, true);

  // Hazard in the room blocks demolish and move (GDD 15.4)
  const hz = structuredClone(s);
  hz.rooms.push({
    id: 4, defId: 'storage_vault', x: 1, y: 0, w: 1, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  });
  hz.rooms.push({
    id: 3, defId: 'spiral_stair', x: 2, y: 0, w: 1, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  });
  const vault = hz.rooms.find(r => r.defId === 'storage_vault')!;
  vault.hazard = { type: 'hex_fog', name: 'Hex Fog', description: '', effect: '' };
  assert.match(AnkicasterEngine.demolishRoom(hz, vault.id).error || '', /hazard|Hex Fog/i);
  assert.equal(AnkicasterEngine.moveRoom(hz, vault.id, 0, 0).success, false);

  // A stair between the hall and a vault: removing it would cut the vault off
  const linked = structuredClone(s);
  linked.rooms.push({
    id: 4, defId: 'storage_vault', x: 1, y: 0, w: 1, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  });
  linked.rooms.push({
    id: 3, defId: 'spiral_stair', x: 2, y: 0, w: 1, h: 1, area: 'castle', level: 1, state: 'built',
    buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
  });
  const stair = linked.rooms.find(r => r.defId === 'spiral_stair')!;
  const cut = AnkicasterEngine.demolishRoom(linked, stair.id);
  assert.equal(cut.success, false);
  assert.match(cut.error || '', /cut .* off/);

  // A room resting on another blocks demolishing the lower one
  const up = AnkicasterEngine.placeRoom(s, 'corridor', 'castle', 3, 1);
  const res = AnkicasterEngine.demolishRoom(up.state, eh.id);
  assert.equal(res.success, false);

  // Occupants are reassigned to a valid room of the same kind or left between rooms
  let st = rich();
  const d1 = AnkicasterEngine.placeRoom(st, 'dormitory', 'castle', 6, 0);
  const d2 = AnkicasterEngine.placeRoom(d1.state, 'dormitory', 'castle', 3, 1);
  st = d2.state;
  for (const r of st.rooms) if (r.state === 'site') { r.state = 'built'; r.buildProgress = r.buildRequired; }
  st.characters.push({ id: 1, status: 'student', bedRoomId: d1.roomId } as any);
  const gone = AnkicasterEngine.demolishRoom(st, d1.roomId!);
  assert.equal(gone.success, true, gone.error);
  assert.equal(gone.state.characters[0].bedRoomId, d2.roomId);
});

test('B9 the headmaster look persists through save/reload and old saves get defaults', () => {
  const s = createNewAcademy({ robeColor: '#9E2A3A', hat: 'crown', skin: '#845236', hairColor: '#E0B860', staff: 'star' });
  assert.deepEqual(
    { robe: s.wizard.appearance?.robeColor, hat: s.wizard.appearance?.hat, skin: s.wizard.appearance?.skin, hair: s.wizard.appearance?.hairColor, staff: s.wizard.appearance?.staff },
    { robe: '#9E2A3A', hat: 'crown', skin: '#845236', hair: '#E0B860', staff: 'star' }
  );
  // Save -> JSON (the add-on bridge stores the same JSON) -> load
  const loaded = AnkicasterEngine.normalizeLoadedState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(loaded.wizard.appearance, s.wizard.appearance);

  // Old save: appearance with legacy tokens and missing fields
  const old: any = JSON.parse(JSON.stringify(s));
  old.wizard.appearance = { robeColor: '#5A9AD6', hat: 'wide', skin: 'tone3', hairColor: 'brown' };
  for (const r of old.rooms) delete r.spent;
  delete old.furnitureInventory;
  const n = AnkicasterEngine.normalizeLoadedState(old);
  assert.equal(n.wizard.appearance.robeColor, '#5A9AD6');
  assert.equal(n.wizard.appearance.hat, 'wide');
  assert.equal(n.wizard.appearance.skin, '#D9A07A');
  assert.equal(n.wizard.appearance.hairColor, '#4A2E1E');
  assert.equal(n.wizard.appearance.staff, DEFAULT_APPEARANCE.staff);
  assert.ok(n.rooms.every((r: PlacedRoom) => r.spent), 'spend records filled');
  assert.deepEqual(n.furnitureInventory, {});
  assert.deepEqual(normalizeAppearance(undefined), DEFAULT_APPEARANCE);

  // Saves with no look at all stay without one (the "Choose your look" prompt still appears)
  const none: any = JSON.parse(JSON.stringify(s));
  delete none.wizard.appearance;
  assert.equal(AnkicasterEngine.normalizeLoadedState(none).wizard.appearance, undefined);
});

test('B10 the castle wizard is drawn with the saved look and follows changes', () => {
  const s = createNewAcademy();
  const ch = new Choreographer(new NavGraph(s.rooms, 304), 304);
  ch.syncState(s);
  assert.equal(ch.agents.get('wizard')!.hat, 'pointed');
  // Creation completes after the map already exists (the reported bug): the agent must update
  const s2 = createNewAcademy({ robeColor: '#9E2A3A', hat: 'crown', staff: 'moon' });
  ch.syncState(s2);
  const w = ch.agents.get('wizard')!;
  assert.equal(w.robeColor, '#9E2A3A');
  assert.equal(w.hat, 'crown');
  assert.equal(w.staff, 'moon');
});

function visualGroundY(rooms: PlacedRoom[]): number {
  const maxFloor = Math.max(2, ...rooms.filter(r => r.area === 'castle').map(r => r.y + r.h - 1));
  return getGroundY(maxFloor + 1);
}

test('B11 the headmaster walks the school, and only the orb keeps them in the study', () => {
  const s = createNewAcademy();
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  const ground0 = visualGroundY(s.rooms);
  const ch = new Choreographer(new NavGraph(s.rooms, ground0), ground0);
  ch.syncState(s);
  const wiz = ch.agents.get('wizard')!;
  assert.equal(wiz.y, roomToWorldBox(study, ground0).floorLineY);
  const yAtSpawn = wiz.y;

  const tall = structuredClone(s);
  tall.rooms.push({
    id: 50,
    defId: 'corridor',
    x: 1,
    y: 4,
    w: 1,
    h: 1,
    area: 'castle',
    level: 1,
    state: 'built',
    buildRequired: 0,
    buildProgress: 0,
    cleanliness: 100,
    settings: {},
    furniture: []
  });
  const ground1 = visualGroundY(tall.rooms);
  assert.ok(ground1 > ground0);
  ch.updateNavGraph(new NavGraph(tall.rooms, ground1), ground1);
  ch.syncState(tall);
  assert.equal(wiz.y, yAtSpawn + (ground1 - ground0), 'growing the castle does not leave the headmaster behind');
  assert.ok(wiz.y < ground1, 'feet stay above the earth');

  ch.updateNavGraph(new NavGraph(s.rooms, ground0), ground0);
  ch.syncState(s);
  assert.equal(wiz.y, yAtSpawn, 'shrinking the castle does not bury the headmaster');

  const patch = s.rooms.find(r => r.defId === 'vegetable_patch')!;
  for (let i = 0; i < 200; i++) ch.tick(100, s, false);
  assert.equal(wiz.currentRoomId, patch.id, 'with no orb session the headmaster leaves the study for a job or a visit');
  assert.equal(wiz.wizardErrand, 'wander');
  assert.ok(Math.abs(wiz.y - roomToWorldBox(patch, ground0).floorLineY) < 2, 'they arrive on the plot floor, not under the ground');

  s.wizard.activeSession = {
    id: 1,
    kind: 'orb',
    school: 'nature',
    targetLevel: 1,
    progress: 0,
    required: 25,
    costPaid: 0,
    state: 'active'
  };
  for (let i = 0; i < 200; i++) ch.tick(100, s, false);
  assert.equal(wiz.currentRoomId, study.id, 'pondering the orb sends them back to the study');
  assert.equal(wiz.wizardErrand, 'ponder');
  assert.equal(wiz.anim, 'cast');
  assert.equal(wiz.y, roomToWorldBox(study, ground0).floorLineY);
});
