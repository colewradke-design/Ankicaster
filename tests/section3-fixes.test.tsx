import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialGameState } from '../src/data/initialState.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import {
  getFacultySummary,
  FURNITURE_EFFECTS,
  formatFurnitureEffect,
} from '../src/utils/formulas.ts';
import { FURNITURE_DEFINITIONS, ROOM_DEFINITIONS } from '../src/data/content.ts';
import { RoomWindow, facultyLimitFor } from '../src/components/RoomWindow.tsx';
import { RosterPanel, RiftPanel } from '../src/components/GamePanels.tsx';
import { drawLockHazard } from '../src/visual/rooms/statusArt.ts';
import type { FullGameState, PlacedRoom } from '../src/types/ankicaster.ts';

const noop = () => {};

function makeBuiltRoom(id: number, defId: string, x: number, y: number, area: 'castle' | 'grounds' = 'castle'): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  const [w, h] = def?.size || [1, 1];
  const furniture = (def?.requiredFurniture || []).map((req, idx) => ({
    id: id * 100 + idx + 1,
    defId: req.role,
    slotKind: `required:${req.role}`,
    damaged: false,
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
    settings: {},
  };
}

test('Section 3: getFacultySummary matches across engine, RoomWindow, and RosterPanel', () => {
  const s = createInitialGameState();
  // Add a built faculty_quarters with 1 bed + 1 faculty_bed (2 beds), plus an unbuilt site that should not count
  const fq = makeBuiltRoom(40, 'faculty_quarters', 1, 0);
  fq.furniture.push({ id: 4099, defId: 'faculty_bed', slotKind: 'optional', damaged: false });
  const siteFq = makeBuiltRoom(41, 'faculty_quarters', 3, 0);
  siteFq.state = 'site';
  const classRoom = makeBuiltRoom(42, 'class_nature', 5, 0);
  s.rooms.push(fq, siteFq, classRoom);

  const baseNeeds = { hunger: 80, energy: 80, hygiene: 80, social: 80, fun: 80 };
  s.characters = [
    {
      id: 1, name: 'Alden', status: 'active', career: 'gardener', careerState: 'active',
      school: 'nature', masteredSchools: ['nature'], personality: 'calm', traits: [],
      energy: 100, morale: 80, health: 100, xp: 0, level: 1, needs: baseNeeds, skills: {},
    },
    {
      id: 2, name: 'Bryn', status: 'active', career: 'adventurer', careerState: 'active',
      school: 'light', masteredSchools: ['light'], personality: 'brave', traits: [],
      energy: 100, morale: 80, health: 100, xp: 0, level: 1, needs: baseNeeds, skills: {},
    },
    {
      id: 3, name: 'Cora', status: 'student', career: undefined,
      school: 'arcane', masteredSchools: [], personality: 'curious', traits: [],
      energy: 100, morale: 80, health: 100, xp: 0, level: 1, needs: baseNeeds, skills: {},
    },
  ] as any;

  const summary = getFacultySummary(s);
  // Alden counts (non-adventurer active faculty); Bryn (adventurer) and Cora (student) do not
  assert.equal(summary.activeFaculty, 1);
  // RoomWindow helper matches
  assert.equal(facultyLimitFor(s), summary.maxAllowed);

  // RoomWindow faculty_quarters summary chip renders activeFaculty/maxAllowed
  const rwHtml = renderToStaticMarkup(
    React.createElement(RoomWindow, {
      state: s,
      room: fq,
      onClose: noop,
      onOpenScreen: noop,
      onResolveHazard: noop,
      onUpgrade: noop,
      onAddFurniture: noop,
      onRemoveFurniture: noop,
    })
  );
  assert.ok(rwHtml.includes(`${summary.activeFaculty}/${summary.maxAllowed}`), 'RoomWindow renders unified faculty count/limit');

  // RosterPanel renders same activeFaculty/maxAllowed
  const rosterHtml = renderToStaticMarkup(
    React.createElement(RosterPanel, {
      state: s,
      onAssignCareer: noop,
      onAssignTeacherRoom: noop,
    })
  );
  assert.ok(rosterHtml.includes(`${summary.activeFaculty}/${summary.maxAllowed}`), 'RosterPanel renders unified faculty count/limit');
});

test('Section 3: AnkicasterEngine.rerollDraftCards spends Starlight Ink and deals 3 cards', () => {
  const s = createInitialGameState();
  s.draftRerollTokens = 2;
  const res = AnkicasterEngine.rerollDraftCards(s, 'foundation', () => 0.25);
  assert.equal(res.error, undefined);
  assert.equal(res.cards.length, 3);
  assert.equal(res.state.draftRerollTokens, 1);

  const empty = AnkicasterEngine.rerollDraftCards(res.state, 'foundation');
  assert.equal(empty.state.draftRerollTokens, 0);
  const fail = AnkicasterEngine.rerollDraftCards(empty.state, 'foundation');
  assert.ok(fail.error, 'reroll fails when no Starlight Ink tokens remain');
});

test('Section 3: RiftPanel shows potion supplies, provisions cost, and disables unavailable heroes', () => {
  const s = createInitialGameState();
  s.alumniGallery = [{ name: 'A' }, { name: 'B' }, { name: 'C' }] as any;
  s.resources.provisions = 20;
  s.resources.potions = { mending_draught: 2, rift_elixir: 1 };
  const baseNeeds = { hunger: 80, energy: 80, hygiene: 80, social: 80, fun: 80 };
  s.characters = [
    {
      id: 10, name: 'Vex', status: 'active', career: 'adventurer', careerState: 'active',
      school: 'shadow', masteredSchools: ['shadow'], personality: 'bold', traits: [],
      energy: 100, morale: 80, health: 100, xp: 0, level: 2, needs: baseNeeds, skills: {},
    },
    {
      id: 11, name: 'Mira', status: 'away', career: 'adventurer', careerState: 'active',
      school: 'light', masteredSchools: ['light'], personality: 'calm', traits: [],
      energy: 100, morale: 80, health: 100, xp: 0, level: 2, needs: baseNeeds, skills: {},
    },
    {
      id: 12, name: 'Torin', status: 'active', career: 'adventurer', careerState: 'active',
      school: 'nature', masteredSchools: ['nature'], personality: 'steady', traits: [],
      energy: 100, morale: 80, health: 40, xp: 0, level: 2, needs: baseNeeds, skills: {},
      injury: { type: 'sprained_ankle', severity: 1 },
    },
  ] as any;

  const html = renderToStaticMarkup(
    React.createElement(RiftPanel, {
      state: s,
      onLaunchExpedition: noop,
    })
  );
  assert.ok(html.includes('Expedition Supplies (0/'), 'RiftPanel renders potion supply selector');
  assert.ok(html.includes('Mending Draught'), 'RiftPanel lists available potions');
  assert.ok(html.includes('Rift Elixir'), 'RiftPanel lists rift_elixir');
  assert.ok(html.includes('Provisions'), 'RiftPanel shows provisions cost');
  assert.ok(html.includes('On Expedition'), 'RiftPanel marks away adventurers');
  assert.ok(html.includes('Injured'), 'RiftPanel marks injured adventurers');
});

test('Section 3: RoomWindow hides Renovate on site rooms and shows full furniture costText', () => {
  const s = createInitialGameState();
  s.knownPatterns = [...(s.knownPatterns || []), 'wizard_chess'];
  const siteRoom = makeBuiltRoom(70, 'common_room', 1, 0);
  siteRoom.state = 'site';
  siteRoom.buildRequired = 5;
  s.rooms.push(siteRoom);

  const siteHtml = renderToStaticMarkup(
    React.createElement(RoomWindow, {
      state: s,
      room: siteRoom,
      onClose: noop,
      onOpenScreen: noop,
      onResolveHazard: noop,
      onUpgrade: noop,
      onAddFurniture: noop,
      onRemoveFurniture: noop,
    })
  );
  assert.ok(!siteHtml.includes('Renovate → Lv'), 'Site rooms should not show Renovate button');
  // wizard_chess costs 140m · 10 timber · 2 insight
  assert.ok(siteHtml.includes('140m') && siteHtml.includes('10 timber') && siteHtml.includes('2 insight'), 'Furnish button shows full costText including Insight');
});

test('Section 3: stone_lantern and wizard_chess specialEffect align with FURNITURE_EFFECTS', () => {
  const lanternEff = FURNITURE_EFFECTS.stone_lantern;
  assert.ok(lanternEff);
  assert.equal(FURNITURE_DEFINITIONS.stone_lantern.specialEffect, formatFurnitureEffect(lanternEff.kind, lanternEff.value));

  const chessEff = FURNITURE_EFFECTS.wizard_chess;
  assert.ok(chessEff);
  assert.equal(FURNITURE_DEFINITIONS.wizard_chess.specialEffect, formatFurnitureEffect(chessEff.kind, chessEff.value));
});

test('Section 3: drawLockHazard has dedicated echo_loop visuals', () => {
  const calls: string[] = [];
  const chain = {
    fill: () => chain,
    stroke: () => chain,
  };
  const g: any = {
    rect: () => { calls.push('rect'); return chain; },
    ellipse: () => { calls.push('ellipse'); return chain; },
    circle: () => { calls.push('circle'); return chain; },
    moveTo: () => chain,
    lineTo: () => chain,
  };
  const room = makeBuiltRoom(80, 'library', 0, 0);
  room.hazard = { type: 'echo_loop', name: 'Echo Loop', description: 'Echoes', effect: 'Repeats' };
  drawLockHazard(g, room, { left: 0, top: 0, width: 64, height: 48, floorLineY: 44 });
  assert.equal(calls.filter(c => c === 'circle').length, 3, 'echo_loop draws 3 concentric echo circles');
});
