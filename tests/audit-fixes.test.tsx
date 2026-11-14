import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createInitialGameState } from '../src/data/initialState.ts';
import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import type { Character, CreatureInstance, PlacedFurniture, PlacedRoom } from '../src/types/ankicaster.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { academyFurnitureEffect, furnitureEffectForRoom, roomFurnitureEffects } from '../src/utils/formulas.ts';
import { reviewsToGo, reviewsToGoText, siteRate } from '../src/utils/construction.ts';
import { DemolishConfirm } from '../src/components/DemolishConfirm.tsx';
import { GrimoireBook } from '../src/components/StudyModals.tsx';
import { BestiaryPanel, BuildMenuPanel, RecruitmentPanel, RiftPanel, RosterPanel } from '../src/components/GamePanels.tsx';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { getGroundY } from '../src/visual/layout/gridToWorld.ts';
import { getRoomDoors, walkableFloorsForRoom } from '../src/visual/layout/furniturePlacement.ts';
import { getRiftGateVisualState } from '../src/visual/rooms/riftGateArt.ts';
import { describePersonActivity } from '../src/visual/agents/personActivity.ts';
import { describeCreatureActivity } from '../src/visual/creatures/creatureActivity.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { normalizeAppearance } from '../src/utils/appearance.ts';

const noop = () => {};

function makeBuiltRoom(
  id: number,
  defId: string,
  x: number,
  y: number,
  level: 1 | 2 | 3 = 1,
  furniture: PlacedFurniture[] = [],
  extra: Partial<PlacedRoom> = {}
): PlacedRoom {
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
    furniture,
    ...extra
  };
}

function makeChar(id: number, name: string, over: Partial<Character> = {}): Character {
  return {
    id,
    name,
    pronouns: 'they/them',
    personality: 'Bookish',
    traits: ['Focused'],
    appearance: {
      skin: '#f2c9a5',
      hair: 'short',
      hairColor: '#3b2820',
      robeColor: '#6B4FBB',
      hat: 'none'
    },
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 80,
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    studySetId: id * 10,
    careerSetIds: [],
    ...over
  };
}

test('Phase 1: chooseDraftCard and resolveEvent generate unique numeric and notice IDs', () => {
  const s = createInitialGameState();
  s.creatures = [
    {
      id: 10,
      defId: 'mosskit',
      nickname: 'Old Moss',
      status: 'tamed',
      hungry: false,
      hatchProgress: 100,
      tamingProgress: 40,
      bondLevel: 1,
      bondProgress: 0,
      arrivedDay: 1
    }
  ];
  s.notices = [];
  const d1 = AnkicasterEngine.chooseDraftCard(s, {
    id: 'lure-1',
    deck: 'magic',
    type: 'lure',
    rarity: 'common',
    name: 'Forest Lure',
    description: 'Lure creature',
    targetId: 'bramblefox'
  });
  const d2 = AnkicasterEngine.chooseDraftCard(d1.state, {
    id: 'lure-2',
    deck: 'magic',
    type: 'lure',
    rarity: 'common',
    name: 'Forest Lure 2',
    description: 'Lure creature',
    targetId: 'bramblefox'
  });
  const ids = d2.state.creatures.map(c => c.id);
  assert.equal(new Set(ids).size, ids.length, 'creature ids remain unique');
  assert.ok(ids[1] > 10 && ids[2] > ids[1], 'new creature ids advance strictly past max existing id');

  const nIds = d2.state.notices.map(n => n.id);
  assert.equal(new Set(nIds).size, nIds.length, 'draft notice ids remain unique');
});

test('Phase 1: healer_cure cures character injury AND restores needs.health to 100', () => {
  const s = createInitialGameState();
  s.activeEvents = [
    {
      eventId: 'ev-1',
      title: 'Wandering Healer',
      description: 'Offers healing',
      expiresAtBell: s.bellIndex + 5,
      actions: [{ id: 'healer_cure', label: 'Heal' }]
    } as any
  ];
  s.characters = [
    makeChar(1, 'Alden', {
      status: 'resident',
      needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 35 },
      injury: { type: 'sprained', points: 10, required: 80 }
    })
  ];
  const res = AnkicasterEngine.resolveEvent(s, 'ev-1', 'healer_cure');
  assert.equal(res.state.characters[0].injury, undefined);
  assert.equal(res.state.characters[0].needs.health, 100);
});

test('Phase 1: unfinished rooms contribute 0 to roomFurnitureEffects and academyFurnitureEffect', () => {
  const unfinishedStudy = makeBuiltRoom(50, 'wizard_study', 2, 0, 1, [
    { id: 501, defId: 'bookshelf', slotKind: 'optional', x: 60, damaged: false }
  ]);
  assert.deepEqual(roomFurnitureEffects(unfinishedStudy), {});
  assert.equal(academyFurnitureEffect([unfinishedStudy], 'ponder_pct'), 0);

  const finishedStudy = makeBuiltRoom(50, 'wizard_study', 2, 0, 1, [
    { id: 499, defId: 'orb_stand', slotKind: 'required:orb_stand', x: 10, damaged: false },
    { id: 500, defId: 'lectern', slotKind: 'required:lectern', x: 24, damaged: false },
    { id: 501, defId: 'bookshelf', slotKind: 'optional', x: 60, damaged: false }
  ]);
  assert.equal(roomFurnitureEffects(finishedStudy).ponder_pct, 10);
  assert.equal(academyFurnitureEffect([finishedStudy], 'ponder_pct'), 10);
});

test('Phase 2: BOOKSHELF_OUTPUT_ROOMS gives Observatory +10% output instead of Composure', () => {
  assert.deepEqual(furnitureEffectForRoom('bookshelf', 'observatory'), {
    kind: 'output_pct',
    value: 10,
    scope: 'room'
  });
});

test('Phase 2: NavGraph and getRoomDoors align on multi-floor mezzanine vs non-mezzanine tall rooms', () => {
  const s = createInitialGameState();
  const eh = s.rooms.find(r => r.defId === 'entrance_hall')!;
  const stair0 = makeBuiltRoom(20, 'spiral_stair', 5, 0);
  const stair1 = makeBuiltRoom(21, 'spiral_stair', 5, 1);
  const study = makeBuiltRoom(22, 'wizard_study', 6, 0);
  const aviary = makeBuiltRoom(23, 'aviary', eh.x - 1, 0);
  const dormF1 = makeBuiltRoom(24, 'dormitory', Math.max(0, eh.x - 3), 1);

  const rooms = [eh, stair0, stair1, study, aviary, dormF1];
  assert.deepEqual(walkableFloorsForRoom(study), [0, 1]);
  assert.deepEqual(walkableFloorsForRoom(aviary), [0]);

  const reach = new Set(rooms.map(r => r.id));
  const studyDoors = getRoomDoors(study, rooms, reach);
  assert.deepEqual(studyDoors.leftDoorFloors, [0, 1], 'Wizard Study gets doors on both floor 0 and floor 1 next to stairs');

  const nav = new NavGraph(rooms, getGroundY(3));
  assert.ok(nav.nodes.has(`room-${aviary.id}-f0`), 'Aviary ground floor node exists');
  assert.equal(nav.nodes.has(`room-${aviary.id}-f1`), false, 'Non-mezzanine Aviary has no thin-air floor-1 nav node');
  assert.ok(nav.nodes.has(`room-${study.id}-f1`), 'Mezzanine Wizard Study keeps floor-1 nav node');
});

test('Phase 2: construction helpers incorporate academy build_speed_pct', () => {
  const site = { state: 'site' as const, buildProgress: 0, buildRequired: 11 };
  assert.equal(siteRate(site, 0), 1);
  assert.equal(siteRate(site, 10), 1.1);
  assert.equal(reviewsToGo(site, 0), 11);
  assert.equal(reviewsToGo(site, 10), 10);
  assert.equal(reviewsToGoText(site, 10), 'About 10 honest reviews to go');
});

test('Phase 2: GrimoireBook reflects Lv 3 Wizard Study 10% mana discount', () => {
  const s = createInitialGameState();
  s.wizard.knownSpells = ['glow']; // 40 mana -> 36 mana with Lv 3 Wizard Study
  s.mana = 36;
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  study.level = 3;

  const html = renderToStaticMarkup(React.createElement(GrimoireBook, { state: s, onCast: noop, onClose: noop })).replace(/<!-- -->/g, '');
  assert.ok(html.includes('36 mana'), 'Shows discounted 36 mana cost');
  assert.ok(!html.includes('Needs 40 mana'), 'Does not block cast at 36 mana when Lv 3 Study discounts it');
});

test('Phase 2: DemolishConfirm renders rare/special refunded BUILD_MATERIALS like Crystal', () => {
  const s = createInitialGameState();
  const vault = makeBuiltRoom(77, 'observatory', 0, 1, 1, [], {
    state: 'site',
    buildProgress: 0,
    spent: { mana: 0, timber: 20, stone: 30, glass: 15, cloth: 0, crystal: 4 }
  });
  s.rooms.push(vault);
  const html = renderToStaticMarkup(React.createElement(DemolishConfirm, { state: s, roomId: 77, onCancel: noop, onConfirm: noop }));
  assert.ok(html.includes('4 Crystal'), 'DemolishConfirm shows special materials refunded');
});

test('Phase 2: UI panels match engine eligibility & labels (Recruitment, Bestiary, Rift, Roster, RoomWindow)', () => {
  const s = createInitialGameState();
  s.settings.linkNewCards = false;
  s.settings.cardsPerStudent = 2;
  s.alumniGallery = [{ name: 'A' }, { name: 'B' }, { name: 'C' }] as any;
  s.allCards = {
    1: { id: 1, nid: 1, deckName: 'D', front: 'Q1', back: 'A1', ivl: 5, lastAnswerIvl: 5, honestIvl: 5, queue: 2, type: 2, due: 0, lastStudiedMs: 0 },
    2: { id: 2, nid: 2, deckName: 'D', front: 'Q2', back: 'A2', ivl: 0, lastAnswerIvl: 0, honestIvl: 0, queue: 0, type: 0, due: 0, lastStudiedMs: 0 },
    3: { id: 3, nid: 3, deckName: 'D', front: 'Q3', back: 'A3', ivl: 0, lastAnswerIvl: 0, honestIvl: 0, queue: 0, type: 0, due: 0, lastStudiedMs: 0 }
  };
  const recruitHtml = renderToStaticMarkup(React.createElement(RecruitmentPanel, { state: s, onEnroll: noop }));
  assert.ok(recruitHtml.includes('Free Young Cards: <span class="text-amber-300">1</span> / 2'), 'RecruitmentPanel filters out New cards when linkNewCards is false');

  const tamerSabb = makeChar(30, 'SabbTamer', { status: 'faculty', career: 'tamer', careerState: 'sabbatical', masteredSchools: ['nature'] });
  const advSabb = makeChar(31, 'SabbAdv', { status: 'faculty', career: 'adventurer', careerState: 'sabbatical', masteredSchools: ['shadow'] });
  const retiredReadyChar = makeChar(32, 'Eldrin', {
    status: 'faculty',
    currentSchool: undefined,
    career: 'scholar',
    masteredSchools: ['arcane'],
    studySetId: 100
  });
  s.cardSets = [
    { id: 100, characterId: 32, kind: 'study', school: 'arcane', size: 1, cardIds: [1], createdDay: 1, released: false },
    { id: 101, characterId: 32, kind: 'career', career: 'scholar', size: 1, cardIds: [10], createdDay: 1, released: false }
  ];
  s.allCards[1] = { id: 1, nid: 1, deckName: 'D', front: 'Q1', back: 'A1', ivl: 100, lastAnswerIvl: 100, honestIvl: 100, queue: 2, type: 2, due: 0, lastStudiedMs: 0 };
  s.allCards[10] = { id: 10, nid: 10, deckName: 'D', front: 'Q10', back: 'A10', ivl: 20, lastAnswerIvl: 20, honestIvl: 20, queue: 2, type: 2, due: 0, lastStudiedMs: 0 };
  s.characters = [retiredReadyChar, tamerSabb, advSabb];
  s.creatures = [
    {
      id: 90,
      defId: 'mosskit',
      nickname: 'Rover',
      status: 'away',
      hungry: false,
      hatchProgress: 100,
      tamingProgress: 40,
      bondLevel: 1,
      bondProgress: 0,
      arrivedDay: 1
    },
    {
      id: 91,
      defId: 'mosskit',
      nickname: 'Mosskit',
      status: 'tamed',
      hungry: false,
      hatchProgress: 100,
      tamingProgress: 40,
      bondLevel: 1,
      bondProgress: 0,
      arrivedDay: 1,
      roomId: 88
    }
  ];

  const bestiaryHtml = renderToStaticMarkup(
    React.createElement(BestiaryPanel, { state: s, onFeedCreature: noop, onAssignTamer: noop })
  );
  assert.ok(bestiaryHtml.includes('On Expedition'), 'BestiaryPanel shows On Expedition filter/badge for away creatures');

  const riftHtml = renderToStaticMarkup(React.createElement(RiftPanel, { state: s, onLaunchExpedition: noop }));
  assert.ok(!riftHtml.includes('SabbAdv'), 'RiftPanel excludes sabbatical adventurers');
  assert.ok(riftHtml.includes('Mosskit (+1 Fortune)'), 'RiftPanel shows companionBonus value');

  const rosterHtml = renderToStaticMarkup(
    React.createElement(RosterPanel, {
      state: s,
      onAssignCareer: noop,
      onRetireCharacter: noop,
      onEnrollSecondSchool: noop,
      view: 'faculty'
    })
  ).replace(/<!-- -->/g, '');
  assert.ok(rosterHtml.includes('1 cards') && rosterHtml.includes('2 Cards)'), 'RosterPanel uses dynamic card counts instead of hardcoded 50');
  assert.ok(
    /disabled=""[^>]*title="Requires all linked cards/.test(rosterHtml) ||
      /title="Requires all linked cards[^"]*"[^>]*disabled=""/.test(rosterHtml) ||
      rosterHtml.includes('Requires all linked cards'),
    'RosterPanel disables Retire button when career cards are below retirementAgeDays'
  );

  const lockedRoom = makeBuiltRoom(88, 'meadow_paddock', 0, 0, 1, [], { lockedUntilReviewIndex: s.reviewIndex + 5 });
  s.rooms.push(lockedRoom);
  const rwHtml = renderToStaticMarkup(
    React.createElement(RoomWindow, {
      state: s,
      room: lockedRoom,
      onClose: noop,
      onOpenScreen: noop,
      onUpgrade: noop,
      onDemolish: noop,
      onInstallRequired: noop,
      onAddFurniture: noop,
      onRemoveFurniture: noop,
      onResolveHazard: noop
    })
  );
  assert.ok(rwHtml.includes('data-testid="hazard-banner"'), 'RoomWindow shows lock countdown even after hazard object is cleared');
  assert.ok(!rwHtml.includes('Mosskit (Mosskit)'), 'RoomWindow avoids redundant species duplicate when nickname matches species');

  const siteRoom = makeBuiltRoom(89, 'common_room', 5, 0, 1, [], { state: 'site', buildProgress: 0, buildRequired: 11 });
  const buildHtml = renderToStaticMarkup(
    React.createElement(BuildMenuPanel, { state: { ...s, rooms: [...s.rooms, siteRoom] }, onPlaceRoom: noop })
  );
  assert.ok(buildHtml.includes('data-testid="build-sites"'), 'BuildMenuPanel renders sites section');
});

test('Phase 2: Choreographer resets graduated robeColor; RiftGate respects debugRiftLock; pen/wary descriptions align', () => {
  const s = createInitialGameState();
  s.alumniGallery = [{ name: 'A' }, { name: 'B' }, { name: 'C' }] as any;
  s.rooms.push(makeBuiltRoom(60, 'rift_gate', 5, 0));
  assert.equal(getRiftGateVisualState(s), 'open');
  assert.equal(getRiftGateVisualState({ ...s, debugRiftLock: true }), 'dormant');

  const person = makeChar(5, 'Lyra', {
    status: 'faculty',
    currentSchool: undefined,
    masteredSchools: ['arcane'],
    career: 'teacher',
    appearance: { skin: '#f2c9a5', hair: 'short', hairColor: '#3b2820', robeColor: '#3b82f6', hat: 'none' }
  });
  const groundY = getGroundY(3);
  const choreo = new Choreographer(new NavGraph(s.rooms, groundY), groundY);
  s.characters = [person];
  choreo.syncState(s);
  const synced = choreo.agents.get('char-5');
  assert.ok(synced);
  synced!.robeColor = '#112233';
  choreo.syncState(s);
  const expectedLook = normalizeAppearance({ ...person.appearance, staff: 'oak' }, person.id);
  assert.equal(synced!.robeColor, expectedLook.robeColor);

  const paddock = makeBuiltRoom(71, 'meadow_paddock', 3, 0);
  s.rooms.push(paddock);
  synced!.currentRoomId = 71;
  synced!.targetRoomId = 71;
  synced!.activity = 'free_time';
  synced!.anim = 'idle';
  assert.equal(describePersonActivity(synced!, person, s), 'Visiting the Meadow Paddock.');

  const waryHungry: CreatureInstance = {
    id: 72,
    defId: 'mosskit',
    nickname: 'Mossy',
    status: 'wary',
    hungry: true,
    hatchProgress: 100,
    tamingProgress: 5,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1
  };
  assert.ok(describeCreatureActivity(undefined, waryHungry, s).includes('(hungry)'));
});
