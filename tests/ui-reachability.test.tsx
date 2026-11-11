/**
 * UI declutter pass: every former top-bar tab's features stay reachable through a room window
 * or the slim top bar / Academy menu. Pure-logic checks plus server-side renders of the new
 * components (no DOM needed).
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { AnkicasterEngine, HAZARD_DISPEL_MANA_COST } from '../src/utils/engine.ts';
import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import type { FullGameState, PlacedRoom, SchoolType } from '../src/types/ankicaster.ts';
import {
  ALL_SCREENS, SCREEN_DEFS, FORMER_TABS, ROOMLESS_SCREENS, ScreenId,
  getRoomScreens, isScreenUnlocked, getAcademyMenuScreens
} from '../src/ui/screens.ts';
import { TopBar, AcademyMenu } from '../src/components/TopBar.tsx';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import { PonderOrbPicker, GrimoireBook, orbOption, SCHOOLS } from '../src/components/StudyModals.tsx';

const noop = () => {};
const fresh = () => createNewAcademy({ name: 'Rowan' });

function withRoom(state: FullGameState, defId: string): FullGameState {
  const base = state.rooms[0];
  const maxId = Math.max(...state.rooms.map(r => r.id));
  const room: PlacedRoom = { ...base, id: maxId + 1, defId, furniture: [], hazard: undefined, x: 30, y: 3 };
  return { ...state, rooms: [...state.rooms, room] };
}

/** Everything the player can open right now without a room window: top bar + Academy menu. */
function topLevelReachable(state: FullGameState): Set<ScreenId> {
  return new Set<ScreenId>([...ROOMLESS_SCREENS, ...getAcademyMenuScreens(state)]);
}

/** Everything reachable: top level plus every built room's window actions. */
function allReachable(state: FullGameState): Set<ScreenId> {
  const out = topLevelReachable(state);
  for (const r of state.rooms) for (const id of getRoomScreens(r.defId, state)) out.add(id);
  return out;
}

const renderRoom = (state: FullGameState, room: PlacedRoom, detailsOpen = false) =>
  renderToStaticMarkup(
    <RoomWindow state={state} room={room} onClose={noop} onOpenScreen={noop} onResolveHazard={noop}
      onUpgrade={noop} onAddFurniture={noop} onRemoveFurniture={noop} detailsOpen={detailsOpen} />
  );

test('UI-1: the mapping table covers all 10 former tabs and only known screens', () => {
  assert.deepEqual(
    FORMER_TABS.map(t => t.tab),
    ['Castle & Grounds', 'Anki Gateway', 'Wizard Study', 'Students & Faculty', 'Admissions', 'Architect', 'Grimoire Draft', 'Bestiary', 'Alchemy Lab', 'The Rift']
  );
  for (const t of FORMER_TABS) for (const s of t.screens) assert.ok(SCREEN_DEFS[s], `${t.tab} -> ${s}`);
  for (const id of ALL_SCREENS) {
    for (const r of SCREEN_DEFS[id].rooms) assert.ok(ROOM_DEFINITIONS[r], `${id} home room ${r} exists in content`);
  }
});

test('UI-2: every screen is rendered by App (exhaustive switch) and the old tab bar is gone', () => {
  const app = fs.readFileSync(new URL('../src/App.tsx', import.meta.url), 'utf8');
  for (const id of ALL_SCREENS) assert.ok(app.includes(`case '${id}'`), `App renders screen ${id}`);
  assert.ok(!app.includes('activeTab'), 'no activeTab state left');
  assert.ok(!/<nav[\s>]/.test(app), 'no tab <nav> left');
});

test('UI-3: fresh start: slim top bar has mana, day, Build, Academy, Settings; no resource strip', () => {
  const s = fresh();
  const html = renderToStaticMarkup(<TopBar state={s} onOpenScreen={noop} onOpenRoom={noop} />);
  assert.match(html, /data-testid="mana-chip"/);
  assert.match(html, /data-testid="day-chip"/);
  assert.match(html, />Build</);
  assert.match(html, /Academy/);
  assert.match(html, /aria-label="Settings"/);
  assert.ok(!/Insight|Timber|Renown|Codex/.test(html), 'resources/codex moved out of the top bar');
  assert.ok(!/hazard-chip/.test(html));
});

test('UI-4: fresh start: Academy menu lists only screens whose room is built', () => {
  const s = fresh();
  const menu = getAcademyMenuScreens(s);
  for (const id of ['ponder', 'grimoire', 'admissions', 'draft', 'stores'] as ScreenId[]) assert.ok(menu.includes(id), id);
  for (const id of ['students', 'faculty', 'alumni', 'bestiary', 'alchemy', 'rift', 'events'] as ScreenId[]) {
    assert.ok(!menu.includes(id), `${id} hidden at fresh start`);
  }
  const html = renderToStaticMarkup(<AcademyMenu state={s} onOpenScreen={noop} onOpenRoom={noop} defaultOpen />);
  for (const id of [...menu, 'reviewer', 'journal', 'codex', 'settings']) assert.match(html, new RegExp(`data-screen="${id}"`));
  assert.ok(!/data-screen="faculty"/.test(html));
});

test('UI-5: each former tab feature is reachable via a room window or the top bar/Academy menu once its room exists', () => {
  for (const t of FORMER_TABS) {
    for (const id of t.screens) {
      const def = SCREEN_DEFS[id];
      if (def.rooms.length === 0) {
        assert.ok(topLevelReachable(fresh()).has(id), `${t.tab}: ${id} always reachable`);
        continue;
      }
      for (const room of def.rooms) {
        const s = withRoom(fresh(), room);
        assert.ok(getRoomScreens(room, s).includes(id), `${room} window offers ${id}`);
        assert.ok(isScreenUnlocked(s, id), `${id} unlocked with ${room}`);
        assert.ok(getAcademyMenuScreens(s).includes(id), `${id} in Academy menu with ${room}`);
      }
    }
  }
  // At fresh start nothing that exists in the save is unreachable: every former tab whose room is built
  const s = fresh();
  const reach = allReachable(s);
  for (const id of ['reviewer', 'ponder', 'grimoire', 'admissions', 'build', 'draft'] as ScreenId[]) assert.ok(reach.has(id), id);
});

test('UI-6: room screens stay hidden until their room is BUILT (no data fallbacks; data untouched)', () => {
  const s = fresh();
  const char = (over: any) => ({ id: 900 + Math.random(), name: 'X', status: 'student', masteredSchools: [], careerSetIds: [], traits: [], needs: {}, ...over });
  const loaded = {
    ...s,
    characters: [char({}), char({ career: 'teacher', status: 'faculty', masteredSchools: ['arcane'] })],
    creatures: [{ id: 1 } as any],
    resources: { ...s.resources, potions: { mending_draught: 1 } },
    alumniGallery: [{ id: 1 } as any],
    expeditions: [{ state: 'active' } as any]
  } as any;
  const before = JSON.stringify(loaded);
  const menu = getAcademyMenuScreens(loaded);
  for (const id of ['students', 'faculty', 'alumni', 'bestiary', 'alchemy', 'rift'] as ScreenId[]) {
    assert.ok(!isScreenUnlocked(loaded, id), `${id} hidden without its room`);
    assert.ok(!menu.includes(id), `${id} not in Academy menu without its room`);
  }
  assert.equal(JSON.stringify(loaded), before, 'save data is not touched');

  // A construction site does not unlock its screens, in the menu or in its own window
  for (const [defId, id] of [['faculty_quarters', 'faculty'], ['dormitory', 'students'], ['alchemy_lab', 'alchemy']] as Array<[string, ScreenId]>) {
    const site = withRoom(s, defId);
    site.rooms[site.rooms.length - 1] = { ...site.rooms[site.rooms.length - 1], state: 'site', buildRequired: 50, buildProgress: 3 };
    assert.ok(!isScreenUnlocked(site, id), `${id} locked while ${defId} is a site`);
    assert.ok(!getAcademyMenuScreens(site).includes(id));
    const html = renderRoom(site, site.rooms[site.rooms.length - 1]);
    assert.ok(!new RegExp(`data-screen="${id}"`).test(html), `${defId} site window offers no ${id}`);
    const built = withRoom(s, defId);
    assert.ok(isScreenUnlocked(built, id) && getAcademyMenuScreens(built).includes(id), `${id} unlocked once ${defId} is built`);
    assert.match(renderRoom(built, built.rooms[built.rooms.length - 1]), new RegExp(`data-screen="${id}"`));
  }

  // Visitors: Entrance Hall built + someone waiting
  const ev = { ...s, activeEvents: [{ eventId: 'misaddressed_owl', dayArrived: 1 }] };
  assert.ok(isScreenUnlocked(ev, 'events'));
  assert.ok(getRoomScreens('entrance_hall', ev).includes('events'));
  assert.ok(!getRoomScreens('entrance_hall', s).includes('events'));
  const noHall = { ...ev, rooms: ev.rooms.filter(r => r.defId !== 'entrance_hall') };
  assert.ok(!isScreenUnlocked(noHall, 'events'));
});

test('UI-7: hazards stay reachable: top bar chip, Academy menu entry, room window dispel with engine cost', () => {
  const s0 = fresh();
  const target = s0.rooms.find(r => r.defId === 'storage_vault')!;
  const hazard = { type: 'hex_fog', description: 'Fog', arrivedReviewIndex: 0 } as any;
  const s = { ...s0, rooms: s0.rooms.map(r => (r.id === target.id ? { ...r, hazard } : r)) };
  const bar = renderToStaticMarkup(<TopBar state={s} onOpenScreen={noop} onOpenRoom={noop} />);
  assert.match(bar, /data-testid="hazard-chip"/);
  const menu = renderToStaticMarkup(<AcademyMenu state={s} onOpenScreen={noop} onOpenRoom={noop} defaultOpen />);
  assert.match(menu, new RegExp(`data-hazard-room="${target.id}"`));
  const win = renderRoom(s, s.rooms.find(r => r.id === target.id)!);
  assert.match(win, /data-testid="hazard-banner"/);
  assert.ok(win.includes(`Dispel (${HAZARD_DISPEL_MANA_COST} Mana)`));
  assert.ok(win.includes('Dispel (Warder)'));
});

test('UI-8: Wizard\'s Study window: one Ponder Orb + one Grimoire button (no per-school buttons), details collapsed', () => {
  const s = fresh();
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  const html = renderRoom(s, study);
  assert.equal((html.match(/data-screen="ponder"/g) || []).length, 1);
  assert.equal((html.match(/data-screen="grimoire"/g) || []).length, 1);
  assert.ok(!/Ponder Level|Queue Level/.test(html), 'no five study buttons');
  assert.ok(!/<details[^>]* open/.test(html), 'secondary section collapsed by default');
  assert.match(html, /data-testid="room-stats"/);
  // 1-3 primary actions in every room window
  for (const defId of Object.keys(ROOM_DEFINITIONS)) assert.ok(getRoomScreens(defId).length <= 3, defId);
});

test('UI-9: Ponder Orb picker offers the 5 schools with the engine\'s own cost', () => {
  const s = { ...fresh(), mana: 5000 };
  const html = renderToStaticMarkup(<PonderOrbPicker state={s} onPick={noop} onClose={noop} />);
  for (const sch of SCHOOLS) assert.match(html, new RegExp(`data-school="${sch}"`));
  for (const sch of SCHOOLS as SchoolType[]) {
    const o = orbOption(s, sch);
    const res = AnkicasterEngine.queueWizardSession(s, sch, false);
    assert.equal(res.success, o.canQueue, sch);
    const sess = res.state.wizard.activeSession || res.state.wizard.queuedSessions.at(-1)!;
    assert.equal((sess as any).targetLevel, o.targetLvl);
    assert.equal(s.mana - res.state.mana, o.req.mana);
  }
});

test('UI-10: Grimoire book lists known spells with Cast', () => {
  const s0 = fresh();
  const s = { ...s0, wizard: { ...s0.wizard, knownSpells: ['glow', 'dispel'], spellCooldowns: { dispel: 5 } } };
  const html = renderToStaticMarkup(<GrimoireBook state={s} onCast={noop} onClose={noop} />);
  assert.match(html, /data-spell="glow"/);
  assert.match(html, /data-spell="dispel"/);
  assert.match(html, />Cast</);
  const empty = renderToStaticMarkup(<GrimoireBook state={s0} onCast={noop} onClose={noop} />);
  assert.match(empty, /No spells inscribed yet/);
});

test('UI-11: navigation helpers never mutate state', () => {
  const s = withRoom(fresh(), 'faculty_quarters');
  const deepFreeze = (o: any) => { if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const k of Object.keys(o)) deepFreeze(o[k]); } return o; };
  deepFreeze(s);
  getAcademyMenuScreens(s);
  for (const r of s.rooms) { getRoomScreens(r.defId, s); renderRoom(s, r, true); }
  renderToStaticMarkup(<TopBar state={s} onOpenScreen={noop} onOpenRoom={noop} />);
  renderToStaticMarkup(<AcademyMenu state={s} onOpenScreen={noop} onOpenRoom={noop} defaultOpen />);
  renderToStaticMarkup(<PonderOrbPicker state={s} onPick={noop} onClose={noop} />);
});

test('UI-12: crisp canvas text: labels are screen-space, sized by zoom and snapped to device pixels', async () => {
  const { VisualWorld } = await import('../src/visual/world/VisualWorld.ts');
  const world = new VisualWorld();
  assert.ok(!world.worldContainer.children.includes(world.roomLabelsContainer), 'labels are not scaled by the camera');
  assert.ok(world.rootContainer.children.includes(world.roomLabelsContainer));
  assert.deepEqual([1, 2, 3, 4].map(z => VisualWorld.labelFontSize(z)), [9, 14, 21, 28]);
  for (const dpr of [1, 1.25, 1.5, 2]) {
    world.setPixelRatio(dpr);
    for (const v of [10.1, 33.37, 101.66, 640.5]) {
      const sv = world.snap(v);
      assert.ok(Math.abs(sv * dpr - Math.round(sv * dpr)) < 1e-9, `snap(${v}) on a device pixel at DPR ${dpr}`);
    }
  }
  world.setPixelRatio(1.5);
  world.setSnapshot(fresh());
  for (const z of [1, 2, 4]) {
    world.camera.setZoom(z);
    world.update(16);
    for (const t of world.roomNameTexts.values()) {
      assert.equal(t.resolution, 1.5);
      assert.equal(t.style.fontSize, VisualWorld.labelFontSize(z));
      assert.ok(Math.abs(t.y * 1.5 - Math.round(t.y * 1.5)) < 1e-9);
    }
  }
});
