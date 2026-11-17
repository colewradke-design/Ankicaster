/**
 * Build Mode Shelf, DOOR_GAP_PX = 5, Move Warnings, and Creature Character Card tests.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';

import { AnkicasterEngine } from '../src/utils/engine.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { DOOR_GAP_PX } from '../src/visual/layout/furniturePlacement.ts';
import { roomLimitStatus } from '../src/utils/placement.ts';
import { applyAcademyScheduleToState } from '../src/utils/schedule.ts';
import { ROOM_DEFINITIONS } from '../src/data/content.ts';
import { Choreographer } from '../src/visual/agents/Choreographer.ts';
import { NavGraph } from '../src/visual/layout/navGraph.ts';
import { describePersonActivity } from '../src/visual/agents/personActivity.ts';
import { CreatureChoreographer } from '../src/visual/creatures/creatureChoreographer.ts';
import { describeCreatureActivity } from '../src/visual/creatures/creatureActivity.ts';
import { TopBar } from '../src/components/TopBar.tsx';
import { BuildModePanel } from '../src/components/BuildModePanel.tsx';
import { CreatureCard } from '../src/components/CreatureCard.tsx';
import { defaultCompanionForTeam } from '../src/components/GamePanels.tsx';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import type { Character, CreatureInstance, FullGameState } from '../src/types/ankicaster.ts';

const noop = () => {};

function rich(): FullGameState {
  const s = createNewAcademy({ name: 'Rowan', foundingSchool: 'arcane' });
  s.mana = 100000;
  s.wizard.levels = { arcane: 5, nature: 5, light: 5, shadow: 5, alchemy: 5 };
  Object.assign(s.resources, {
    timber: 5000,
    stone: 5000,
    glass: 5000,
    cloth: 5000,
    insight: 5000,
    herbs: 5000,
    radiance: 5000,
    umbra: 5000,
    reagents: 5000,
    crystal: 5000,
    heartwood: 5000,
    provisions: 500
  });
  s.roomPlans = {};
  for (const id of Object.keys(ROOM_DEFINITIONS)) s.roomPlans[id] = 40;
  if (Object.keys(s.allCards).length < 200) {
    for (let i = 1; i <= 200; i++) {
      s.allCards[9000 + i] = {
        id: 9000 + i,
        nid: 9000 + i,
        deckName: 'TestDeck',
        front: `Q${i}`,
        back: `A${i}`,
        ivl: 5,
        lastAnswerIvl: 5,
        honestIvl: 5,
        type: 2,
        queue: 2,
        due: 0,
        lastStudiedMs: Date.now()
      };
    }
  }
  return s;
}

function addBuiltRoom(
  state: FullGameState,
  defId: string,
  x: number,
  y: number,
  level: 1 | 2 | 3 = 1,
  furnitureDefIds: string[] = []
): FullGameState {
  const placed = AnkicasterEngine.placeRoom(state, defId, ROOM_DEFINITIONS[defId]?.area, x, y);
  assert.equal(placed.success, true, placed.error);
  const next = structuredClone(placed.state);
  const added = next.rooms[next.rooms.length - 1];
  added.state = 'built';
  added.level = level;
  added.buildProgress = added.buildRequired;
  added.furniture = furnitureDefIds.map((fDefId, idx) => ({
    id: added.id * 100 + idx + 1,
    defId: fDefId,
    slotKind: fDefId.includes('bed') ? 'required:bed' : fDefId === 'wooden_desk' ? 'required:desk' : 'required:fixture',
    damaged: false
  }));
  return next;
}

function makeCreature(over: Partial<CreatureInstance> = {}): CreatureInstance {
  return {
    id: 501,
    defId: 'ember_toad',
    nickname: 'Cinder',
    status: 'tamed',
    hungry: false,
    hatchProgress: 100,
    tamingProgress: 40,
    bondLevel: 1,
    bondProgress: 20,
    arrivedDay: 1,
    ...over
  };
}

function makeCharacter(over: Partial<Character> = {}): Character {
  return {
    id: 301,
    name: 'Milo',
    pronouns: 'they/them',
    appearance: {
      skin: '#f2c9a0',
      hair: 'short',
      hairColor: '#3b2b20',
      robeColor: '#3b82f6',
      hat: 'none'
    },
    personality: 'Curious',
    traits: [],
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    needs: { hunger: 80, rest: 80, leisure: 80, composure: 80, health: 100 },
    morale: 85,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: [],
    ...over
  };
}

test('DOOR_GAP_PX is 5 and createNewAcademy initializes empty shelvedRooms', () => {
  assert.equal(DOOR_GAP_PX, 5);
  const s = createNewAcademy({ name: 'Rowan' });
  assert.deepEqual(s.shelvedRooms, []);
});

test('Shelving & placing back preserves state, construction progress, people assignments, and roomLimitStatus', () => {
  let s = rich();
  // Place a furnished Dormitory (ground floor) and a construction site above Entrance Hall (floor 1)
  s = addBuiltRoom(s, 'dormitory', 1, 0, 1, ['wooden_cot']);
  const dormId = s.rooms.find(r => r.defId === 'dormitory')!.id;
  const siteRes = AnkicasterEngine.placeRoom(s, 'corridor', 'castle', 3, 1);
  assert.equal(siteRes.success, true);
  s = siteRes.state;
  const siteRoom = s.rooms[s.rooms.length - 1];
  siteRoom.buildProgress = 7;

  // Entrance Hall supports corridor at (3, 1) -> cannot be shelved while corridor is above it
  const ehId = s.rooms.find(r => r.defId === 'entrance_hall')!.id;
  const studyId = s.rooms.find(r => r.defId === 'wizard_study')!.id;
  const blockedEh = AnkicasterEngine.shelveRoom(s, ehId);
  assert.equal(blockedEh.success, false);
  assert.match(blockedEh.error || '', /above/i);

  // Add student assigned to Dormitory
  s.characters.push(makeCharacter({ id: 401, name: 'Lyra', bedRoomId: dormId }));

  // Shelve Dormitory (built room), Corridor site, Entrance Hall (once corridor above is shelved), and Wizard Study
  const r1 = AnkicasterEngine.shelveRoom(s, dormId);
  assert.equal(r1.success, true);
  s = r1.state;
  assert.equal(roomLimitStatus(s.rooms, 'dormitory', undefined, s.shelvedRooms).count, 1);

  const rSite = AnkicasterEngine.shelveRoom(s, siteRoom.id);
  assert.equal(rSite.success, true);
  s = rSite.state;
  const shelvedSite = s.shelvedRooms!.find(r => r.id === siteRoom.id)!;
  assert.equal(shelvedSite.state, 'site');
  assert.equal(shelvedSite.buildProgress, 7);

  // Now Entrance Hall & Wizard's Study can both be shelved!
  const rEh = AnkicasterEngine.shelveRoom(s, ehId);
  assert.equal(rEh.success, true);
  s = rEh.state;
  const rStudy = AnkicasterEngine.shelveRoom(s, studyId);
  assert.equal(rStudy.success, true);
  s = rStudy.state;

  // Uniqueness cap counts shelved Entrance Hall & Wizard Study
  assert.equal(roomLimitStatus(s.rooms, 'entrance_hall', undefined, s.shelvedRooms).capped, true);
  assert.equal(roomLimitStatus(s.rooms, 'wizard_study', undefined, s.shelvedRooms).capped, true);

  // Sync workplaces & schedules while rooms are shelved -> preserves Lyra's bedRoomId
  AnkicasterEngine.syncWorkplaces(s);
  applyAcademyScheduleToState(s);
  assert.equal(s.characters.find(c => c.id === 401)!.bedRoomId, dormId);

  // normalizeLoadedState preserves shelvedRooms & spent
  const normalized = AnkicasterEngine.normalizeLoadedState(JSON.parse(JSON.stringify(s)));
  assert.equal(normalized.shelvedRooms?.length, 4);

  // Place Entrance Hall back on Floor 0, Dormitory back, Site back -> progress intact
  const dropEh = AnkicasterEngine.placeShelvedRoom(s, ehId, 3, 0);
  assert.equal(dropEh.success, true, dropEh.error);
  s = dropEh.state;
  const dropDorm = AnkicasterEngine.placeShelvedRoom(s, dormId, 1, 0);
  assert.equal(dropDorm.success, true, dropDorm.error);
  s = dropDorm.state;
  const dropSite = AnkicasterEngine.placeShelvedRoom(s, siteRoom.id, 3, 1);
  assert.equal(dropSite.success, true, dropSite.error);
  s = dropSite.state;
  assert.equal(s.rooms.find(r => r.id === siteRoom.id)?.buildProgress, 7);
});

test('Hazard blocks shelving cleanly', () => {
  const s = rich();
  const eh = s.rooms.find(r => r.defId === 'entrance_hall')!;
  eh.hazard = { type: 'hex_fog', name: 'Hex Fog', description: 'Fog', effect: 'Slow' };
  const blocked = AnkicasterEngine.shelveRoom(s, eh.id);
  assert.equal(blocked.success, false);
  assert.match(blocked.error || '', /Dispel|hazard/i);
});

test('Wizard orb pondering pauses while wizard_study is shelved and resumes when dropped back', () => {
  let s = rich();
  const q = AnkicasterEngine.queueWizardSession(s, 'arcane', false);
  assert.equal(q.success, true);
  s = q.state;
  const beforeProg = s.wizard.activeSession?.progress || 0;
  const studyId = s.rooms.find(r => r.defId === 'wizard_study')!.id;

  const shelved = AnkicasterEngine.shelveRoom(s, studyId);
  assert.equal(shelved.success, true);
  s = shelved.state;

  const cardId = Number(Object.keys(s.allCards)[0]);
  const revWhileShelved = AnkicasterEngine.applyHonestReview(s, cardId, 3, 2500);
  s = revWhileShelved.state;
  assert.equal(s.wizard.activeSession?.progress || 0, beforeProg, 'orb progress paused while study is shelved');

  const placedBack = AnkicasterEngine.placeShelvedRoom(s, studyId, 5, 0);
  assert.equal(placedBack.success, true);
  s = placedBack.state;

  const revAfterDrop = AnkicasterEngine.applyHonestReview(s, cardId, 3, 2500);
  s = revAfterDrop.state;
  assert.ok((s.wizard.activeSession?.progress || 0) > beforeProg, 'orb progress resumes when study is back');
});

test('validateMove allows cut-off rooms with warning and warns on Lv1/Lv2 stair separation (exempting Lv3 Portal)', () => {
  let s = rich();
  s = addBuiltRoom(s, 'spiral_stair', 2, 0, 1);
  s = addBuiltRoom(s, 'dormitory', 0, 0, 1);
  s = addBuiltRoom(s, 'spiral_stair', 2, 1, 1);
  const stair1Id = s.rooms[s.rooms.length - 1].id;
  s = addBuiltRoom(s, 'corridor', 7, 0, 1);

  // Moving stair1 (Lv 1) from (2,1) to (0,1) leaves vertical stack -> valid with stair stack warning
  const moveStair1 = AnkicasterEngine.validateMove(s, stair1Id, 0, 1);
  assert.equal(moveStair1.valid, true, moveStair1.errors.join(', '));
  assert.ok(moveStair1.warnings.some(w => /vertical stack|links Floor 0/i.test(w)), `Got warnings: ${moveStair1.warnings.join(' | ')}`);

  // Upgrading stair1 to Lv 3 Teleportation Portal exempts it from stair stack warning
  s.rooms.find(r => r.id === stair1Id)!.level = 3;
  const movePortal = AnkicasterEngine.validateMove(s, stair1Id, 0, 1);
  assert.equal(movePortal.valid, true);
  assert.equal(movePortal.warnings.some(w => /vertical stack/i.test(w)), false);

  // Moving a bridge corridor cuts off the neighboring corridor with warning instead of error
  let s2 = rich();
  s2 = addBuiltRoom(s2, 'corridor', 2, 0, 1);
  const bridgeId = s2.rooms[s2.rooms.length - 1].id;
  s2 = addBuiltRoom(s2, 'corridor', 1, 0, 1);
  const moveBridge = AnkicasterEngine.validateMove(s2, bridgeId, 7, 0);
  assert.equal(moveBridge.valid, true, 'moving a connecting room is allowed with warning');
  assert.ok(moveBridge.warnings.some(w => /cut off|unreachable/i.test(w)), `Got warnings: ${moveBridge.warnings.join(' | ')}`);
});

test('Front path waiting when Entrance Hall or assigned rooms are shelved', () => {
  let s = rich();
  s.characters.push(makeCharacter({ id: 402, name: 'Milo' }));
  const studyId = s.rooms.find(r => r.defId === 'wizard_study')!.id;
  const ehId = s.rooms.find(r => r.defId === 'entrance_hall')!.id;

  s = AnkicasterEngine.shelveRoom(s, studyId).state;
  s = AnkicasterEngine.shelveRoom(s, ehId).state;

  const nav = new NavGraph(s.rooms, 400);
  const choreo = new Choreographer(nav, 400);
  choreo.syncState(s);
  const wiz = choreo.agents.get('wizard')!;
  const miloChar = s.characters.find(c => c.id === 402)!;
  const milo = choreo.agents.get('char-402')!;

  assert.equal(wiz.currentRoomId, undefined);
  assert.equal(milo.currentRoomId, undefined);
  assert.equal(wiz.y, 396);
  assert.equal(milo.y, 396);
  assert.match(describePersonActivity(wiz, 'wizard', s), /front path/i);
  assert.match(describePersonActivity(milo, miloChar, s), /front path/i);
});

test('Creatures in shelved pens stay hidden in Build mode and break loose when closing Build mode', () => {
  let s = rich();
  s = addBuiltRoom(s, 'ember_pit', 7, 0);
  const pen = s.rooms.find(r => r.defId === 'ember_pit')!;
  const toad = makeCreature({ id: 701, defId: 'cinder_newt', nickname: 'Singe', status: 'tamed', roomId: pen.id });
  const egg = makeCreature({ id: 702, defId: 'ember_sprite', nickname: 'Spark', status: 'egg', hatchProgress: 40, roomId: pen.id });
  s.creatures = [toad, egg];

  s.characters.push(makeCharacter({
    id: 403,
    name: 'Bram',
    status: 'faculty',
    career: 'tamer',
    careerState: 'active',
    masteredSchools: ['nature']
  }));

  // Shelve pen
  const shelveRes = AnkicasterEngine.shelveRoom(s, pen.id);
  assert.equal(shelveRes.success, true);
  s = shelveRes.state;

  // CreatureChoreographer hides non-roaming creatures in shelved pens while buildModeOpen === true
  const cc = new CreatureChoreographer(new NavGraph(s.rooms, 400), 400, 1400);
  cc.syncState(s, true);
  assert.equal(cc.agents.has(701), false, 'shelved-pen tamed creature hidden during Build mode');
  assert.equal(cc.agents.has(702), false, 'shelved-pen egg hidden during Build mode');

  // describeCreatureActivity explains shelved pen
  assert.match(describeCreatureActivity(undefined, s.creatures[0], s), /shelved/i);

  // Closing Build mode releases wary/tamed creatures in shelved pens as loose with capture started
  const closed = AnkicasterEngine.closeBuildMode(s);
  assert.equal(closed.releasedCount, 1);
  const releasedToad = closed.state.creatures.find(c => c.id === 701)!;
  const remainingEgg = closed.state.creatures.find(c => c.id === 702)!;
  assert.equal(releasedToad.status, 'loose');
  assert.equal(releasedToad.returnStatus, 'tamed');
  assert.ok(releasedToad.captureReviewsLeft && releasedToad.captureReviewsLeft > 0);
  assert.equal(remainingEgg.status, 'egg');
});

test('CreatureCard, adventurer pairing, Rift auto-preselect, releaseCreature, BuildModePanel, and TopBar badge', () => {
  let s = rich();
  s = addBuiltRoom(s, 'ember_pit', 7, 0);
  const pen = s.rooms.find(r => r.defId === 'ember_pit')!;
  const adv = makeCharacter({
    id: 404,
    name: 'Kael',
    personality: 'Bold',
    status: 'faculty',
    career: 'adventurer',
    careerState: 'active',
    masteredSchools: ['arcane', 'nature']
  });
  s.characters.push(adv);

  const cr = makeCreature({ id: 801, defId: 'cinder_newt', nickname: 'Pyre', status: 'tamed', roomId: pen.id });
  s.creatures = [cr];
  s.discoveredCreatures = ['cinder_newt'];

  // Assign creature to adventurer
  const paired = AnkicasterEngine.assignCreatureToAdventurer(s, 801, adv.id);
  assert.equal(paired.success, true);
  s = paired.state;
  assert.equal(s.creatures[0].adventurerId, adv.id);
  assert.equal(defaultCompanionForTeam(s.creatures, [adv.id]), 801);

  // Render CreatureCard with adventurer available
  const cardHtml = renderToStaticMarkup(
    <CreatureCard
      state={s}
      creatureId={801}
      onFeed={noop}
      onAssignTamer={noop}
      onAssignAdventurer={noop}
      onRelease={noop}
      onClose={noop}
    />
  );
  assert.match(cardHtml, /data-testid="creature-card"/);
  assert.match(cardHtml, /Pyre/);
  assert.match(cardHtml, /University Role/);
  assert.match(cardHtml, /data-testid="creature-adventurer-assign"/);
  assert.match(cardHtml, /data-testid="creature-feed-btn"/);
  assert.match(cardHtml, /data-testid="creature-release-btn"/);

  // Switching adventurer career away clears creature pairing
  const careerSwitch = AnkicasterEngine.assignCareer(s, adv.id, 'scholar');
  assert.equal(careerSwitch.success, true, careerSwitch.error);
  assert.equal(careerSwitch.state.creatures[0].adventurerId, undefined);

  // RoomWindow pen occupant has open button
  const rwHtml = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={pen}
      onClose={noop}
      onOpenScreen={noop}
      onOpenCreature={noop}
      onResolveHazard={noop}
      onUpgrade={noop}
      onAddFurniture={noop}
      onRemoveFurniture={noop}
    />
  );
  assert.match(rwHtml, /data-testid="pen-open-creature-801"/);

  // Release creature removes it from academy but keeps Bestiary discovery
  const rel = AnkicasterEngine.releaseCreature(s, 801);
  assert.equal(rel.success, true);
  assert.equal(rel.state.creatures.length, 0);
  assert.ok(rel.state.discoveredCreatures?.includes('cinder_newt'));

  // BuildModePanel + TopBar shelf badge SSR
  const ehId = s.rooms.find(r => r.defId === 'entrance_hall')!.id;
  const shelvedEh = AnkicasterEngine.shelveRoom(s, ehId).state;
  const barHtml = renderToStaticMarkup(
    <TopBar state={shelvedEh} onOpenScreen={noop} onOpenRoom={noop} buildModeOpen onToggleBuildMode={noop} />
  );
  assert.match(barHtml, />Build</);
  assert.match(barHtml, /data-testid="build-shelf-count"[^>]*>1</);

  const panelHtml = renderToStaticMarkup(
    <BuildModePanel
      state={shelvedEh}
      placement={null}
      onSelectShelved={noop}
      onPlaceNewRoom={noop}
      onAutoPlaceNewRoom={noop}
      onOpenDraft={noop}
      onClose={noop}
    />
  );
  assert.match(panelHtml, /data-testid="entrance-hall-shelved-warning"/);
  assert.match(panelHtml, /data-shelved-def="entrance_hall"/);
});
