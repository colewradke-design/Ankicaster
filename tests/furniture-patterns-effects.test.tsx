/**
 * Tests for furniture deck tags, pattern gating, draft deck integration,
 * structured special effects, resource cost deductions, and content integrity.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { RoomWindow } from '../src/components/RoomWindow.tsx';
import {
  CREATURE_DEFINITIONS,
  FURNITURE_DEFINITIONS,
  POTION_RECIPES,
  ROOM_DEFINITIONS
} from '../src/data/content.ts';
import { Character, FullGameState, PlacedFurniture, PlacedRoom } from '../src/types/ankicaster.ts';
import { dealDraft, deckPool, isPatternKnown, STARTER_PATTERNS } from '../src/utils/decks.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import { academyFurnitureEffect, FURNITURE_EFFECTS, roomFurnitureEffects } from '../src/utils/formulas.ts';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';

let nextId = 9000;

function makeState(): FullGameState {
  const s = createNewAcademy({
    name: 'Test',
    title: 'Archmage',
    pronouns: 'they/them',
    bodyShape: 1,
    skin: '#f1c27d',
    hair: 'short',
    hairColor: '#2c1b18',
    robeColor: '#6B4FBB',
    hat: 'pointed',
    staff: 'oak',
    eyes: 'round',
    face: 'smile',
    shoes: 'boots',
    foundingSchool: 'arcane'
  });
  s.mana = 5000;
  s.resources.timber = 500;
  s.resources.stone = 500;
  s.resources.glass = 500;
  s.resources.cloth = 500;
  s.resources.radiance = 500;
  s.resources.umbra = 500;
  s.resources.herbs = 500;
  s.resources.insight = 500;
  s.resources.reagents = 500;
  s.resources.moonsilk = 50;
  s.resources.crystal = 50;
  s.resources.ember_salt = 50;
  return s;
}

function addRoom(state: FullGameState, defId: string, x: number, y: number, furniture: PlacedFurniture[] = []): PlacedRoom {
  const d = ROOM_DEFINITIONS[defId];
  const room: PlacedRoom = {
    id: nextId++,
    defId,
    x,
    y,
    w: d.size[0],
    h: d.size[1],
    area: d.area,
    level: 1,
    state: 'built',
    buildRequired: d.buildReviews,
    buildProgress: d.buildReviews,
    cleanliness: 100,
    settings: {},
    furniture
  };
  state.rooms.push(room);
  return room;
}

function student(id: number, seatRoomId?: number, bedRoomId?: number): Character {
  return {
    id,
    name: `Student ${id}`,
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#6B4FBB', hat: 'cap' },
    personality: 'Curious',
    traits: [],
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    needs: { hunger: 90, rest: 90, leisure: 90, composure: 90, health: 100 },
    morale: 85,
    seatRoomId,
    bedRoomId,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  };
}

test('Content integrity: every furniture item has valid deck & existing room ids, and every specialEffect has a FURNITURE_EFFECTS entry', () => {
  const roomIds = new Set(Object.keys(ROOM_DEFINITIONS));
  const list = Object.values(FURNITURE_DEFINITIONS);
  assert.equal(list.length, 92);

  for (const f of list) {
    assert.ok(['foundation', 'grounds', 'magic'].includes(f.deck), `${f.id} must have a valid deck`);
    if (Array.isArray(f.rooms)) {
      for (const rid of f.rooms) {
        assert.ok(roomIds.has(rid), `${f.id} references unknown room ${rid}`);
      }
    }
    if (f.specialEffect) {
      assert.ok(FURNITURE_EFFECTS[f.id], `${f.id} has specialEffect "${f.specialEffect}" but is missing from FURNITURE_EFFECTS`);
    }
  }
});

test('Draft integrity: every draft card targetId resolves and every card type has a working handler', () => {
  const roomIds = new Set(Object.keys(ROOM_DEFINITIONS));
  const furnIds = new Set(Object.keys(FURNITURE_DEFINITIONS));
  const creatureIds = new Set(Object.keys(CREATURE_DEFINITIONS));
  const potionIds = new Set(POTION_RECIPES.map(p => p.id));

  for (const deck of ['foundation', 'grounds', 'magic'] as const) {
    for (const card of deckPool(deck)) {
      if (card.type === 'blueprint' && card.targetId) assert.ok(roomIds.has(card.targetId), `Unknown room ${card.targetId}`);
      if (card.type === 'furniture_pattern' && card.targetId) assert.ok(furnIds.has(card.targetId), `Unknown furniture ${card.targetId}`);
      if (card.type === 'lure' && card.targetId) assert.ok(creatureIds.has(card.targetId), `Unknown creature ${card.targetId}`);
      if (card.type === 'recipe_page' && card.targetId) assert.ok(potionIds.has(card.targetId), `Unknown potion ${card.targetId}`);
    }
  }

  // Test seed, recipe_page, and Dawn Blessing handlers
  const s = makeState();
  const injuredChar = student(1);
  injuredChar.injury = { type: 'bruised', points: 0, required: 10 };
  s.characters.push(injuredChar);

  const seedCard = deckPool('magic').find(c => c.type === 'seed')!;
  const afterSeed = AnkicasterEngine.chooseDraftCard(s, seedCard).state;
  assert.ok(afterSeed.resources.seedsUnlocked.includes(seedCard.targetId!));

  const recipeCard = deckPool('magic').find(c => c.type === 'recipe_page')!;
  const afterRecipe = AnkicasterEngine.chooseDraftCard(afterSeed, recipeCard).state;
  assert.equal(afterRecipe.potions.find(p => p.id === recipeCard.targetId)?.discovered, true);

  const dawnCard = deckPool('magic').find(c => c.type === 'boon' && c.name.includes('Dawn'))!;
  const afterDawn = AnkicasterEngine.chooseDraftCard(afterRecipe, dawnCard).state;
  assert.equal(afterDawn.characters[0].injury, undefined, 'Dawn Blessing cures one injured resident');
});

test('Pattern gating: unlearned item blocked in engine & locked in RoomWindow; drafting its pattern unlocks it', () => {
  const s = makeState();
  const dorm = addRoom(s, 'dormitory', 0, 0, [{ id: nextId++, defId: 'simple_cot', slotKind: 'required:bed', damaged: false }]);

  assert.equal(isPatternKnown(s, 'canopy_bed'), false);
  const blocked = AnkicasterEngine.addFurniture(s, dorm.id, 'canopy_bed');
  assert.equal(blocked.success, false);
  assert.match(blocked.error || '', /Pattern needed/i);

  const htmlLocked = renderToStaticMarkup(
    <RoomWindow
      state={s}
      room={dorm}
      onClose={() => {}}
      onOpenScreen={() => {}}
      onResolveHazard={() => {}}
      onUpgrade={() => {}}
      onAddFurniture={() => {}}
      onInstallRequired={() => {}}
      onRemoveFurniture={() => {}}
      detailsOpen
    />
  );
  assert.match(htmlLocked, /data-testid="locked-pattern-canopy_bed"/);
  assert.match(htmlLocked, /Pattern needed \(Foundation deck\)/);

  // Draft the pattern
  const patternCard = deckPool('foundation').find(c => c.type === 'furniture_pattern' && c.targetId === 'canopy_bed')!;
  assert.ok(patternCard);
  const unlocked = AnkicasterEngine.chooseDraftCard(s, patternCard).state;
  assert.equal(isPatternKnown(unlocked, 'canopy_bed'), true);

  const ok = AnkicasterEngine.addFurniture(unlocked, dorm.id, 'canopy_bed');
  assert.equal(ok.success, true);
});

test('Required fixtures for a drawn blueprint are auto-learned and always installable', () => {
  const s = makeState();
  assert.equal(isPatternKnown(s, 'sun_window'), false);
  assert.equal(isPatternKnown(s, 'meditation_cushions'), false);

  const sanctumCard = deckPool('magic').find(c => c.type === 'blueprint' && c.targetId === 'sunlit_sanctum')!;
  const next = AnkicasterEngine.chooseDraftCard(s, sanctumCard).state;

  assert.equal(isPatternKnown(next, 'sun_window'), true);
  assert.equal(isPatternKnown(next, 'meditation_cushions'), true);
});

test('Pattern cards appear only in their tagged deck, known patterns are excluded, and <= 1 pattern per draw', () => {
  const s = makeState();
  for (const deck of ['foundation', 'grounds', 'magic'] as const) {
    const pool = deckPool(deck, s);
    for (const card of pool) {
      if (card.type === 'furniture_pattern') {
        assert.equal(FURNITURE_DEFINITIONS[card.targetId!].deck, deck);
        assert.equal(STARTER_PATTERNS.includes(card.targetId!), false);
        assert.equal(isPatternKnown(s, card.targetId!), false);
      }
    }
    const draw = dealDraft(s, deck, () => 0.99);
    const patternCount = draw.filter(c => c.type === 'furniture_pattern').length;
    assert.ok(patternCount <= 1, `Deck ${deck} drew ${patternCount} patterns`);
  }

  // Known pattern is excluded from pool
  s.knownPatterns.push('ward_lantern');
  assert.equal(deckPool('magic', s).some(c => c.targetId === 'ward_lantern'), false);
});

test('Structured effects: rest_bonus, storage_bonus, output_pct, damaged=half, and max 2 stack cap', () => {
  const s = makeState();
  // Storage bonus: frostbox (+100)
  const baseCap = AnkicasterEngine.storageCap(s);
  const vault = addRoom(s, 'storage_vault', 0, 1, [
    { id: nextId++, defId: 'shelving', slotKind: 'required:shelving', damaged: false },
    { id: nextId++, defId: 'frostbox', slotKind: 'optional', damaged: false }
  ]);
  assert.equal(AnkicasterEngine.storageCap(s), baseCap + 100 + 100); // +100 vault +100 frostbox

  // Stacking cap of 2 + damaged = half
  const dorm = addRoom(s, 'dormitory', 1, 0, [
    { id: nextId++, defId: 'simple_cot', slotKind: 'required:bed', damaged: false },
    { id: nextId++, defId: 'canopy_bed', slotKind: 'optional', damaged: false },
    { id: nextId++, defId: 'canopy_bed', slotKind: 'optional', damaged: false },
    { id: nextId++, defId: 'canopy_bed', slotKind: 'optional', damaged: false }
  ]);
  // 3 canopy_beds in one room stack at most twice: 5 + 5 = 10
  assert.equal(roomFurnitureEffects(dorm).rest_bonus, 10);

  // Damaged item counts half: 1 damaged canopy_bed -> 2.5
  const dormDamaged = addRoom(s, 'dormitory', 2, 0, [
    { id: nextId++, defId: 'simple_cot', slotKind: 'required:bed', damaged: false },
    { id: nextId++, defId: 'canopy_bed', slotKind: 'optional', damaged: true }
  ]);
  assert.equal(roomFurnitureEffects(dormDamaged).rest_bonus, 2.5);
  assert.ok(academyFurnitureEffect(s.rooms, 'rest_bonus', dorm) > 0);
  assert.ok(vault.id > 0);

  // Classroom output_pct: bookshelf (+10%) increases essence yield
  const arcaneTeacher = (roomId: number) => ({
    id: 99,
    name: 'Prof. Arcane',
    pronouns: 'they/them',
    appearance: { skin: '#fff', hair: 'short', hairColor: '#000', robeColor: '#6B4FBB', hat: 'cap' },
    personality: 'Bookish' as const,
    traits: [],
    status: 'faculty' as const,
    masteredSchools: ['arcane' as const],
    career: 'teacher' as const,
    careerState: 'active' as const,
    workplaceRoomId: roomId,
    needs: { hunger: 90, rest: 90, leisure: 90, composure: 90, health: 100 },
    morale: 80,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: []
  });

  const s1 = makeState();
  const c1 = addRoom(s1, 'class_arcane', 1, 0, [
    { id: nextId++, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false },
    { id: nextId++, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false },
    { id: nextId++, defId: 'student_desk', slotKind: 'required:student_desk', damaged: false }
  ]);
  s1.characters.push(student(1, c1.id), arcaneTeacher(c1.id));
  s1.bellIndex = 0;
  s1.reviewIndex = 9;
  const r1 = AnkicasterEngine.applyHonestReview(s1, 1, 3, 2000).state;

  const s2 = makeState();
  const c2 = addRoom(s2, 'class_arcane', 1, 0, [
    { id: nextId++, defId: 'teachers_lectern', slotKind: 'required:teachers_lectern', damaged: false },
    { id: nextId++, defId: 'orrery_globe', slotKind: 'required:orrery_globe', damaged: false },
    { id: nextId++, defId: 'student_desk', slotKind: 'required:student_desk', damaged: false },
    { id: nextId++, defId: 'bookshelf', slotKind: 'optional', damaged: false }
  ]);
  s2.characters.push(student(1, c2.id), arcaneTeacher(c2.id));
  s2.bellIndex = 0;
  s2.reviewIndex = 9;
  const r2 = AnkicasterEngine.applyHonestReview(s2, 1, 3, 2000).state;

  assert.ok(r2.resources.insight > r1.resources.insight, 'Bookshelf +10% output_pct increases classroom yield');
});

test('addFurniture checks and deducts all resource costs (glass, radiance, etc.)', () => {
  const s = makeState();
  s.knownPatterns.push('halo_candles');
  const dorm = addRoom(s, 'dormitory', 0, 0, [
    { id: nextId++, defId: 'simple_cot', slotKind: 'required:bed', damaged: false }
  ]);

  // halo_candles costs { mana: 130, glass: 2, radiance: 4 }
  s.resources.radiance = 1;
  const fail = AnkicasterEngine.addFurniture(s, dorm.id, 'halo_candles');
  assert.equal(fail.success, false);
  assert.match(fail.error || '', /Radiance/);

  s.resources.radiance = 10;
  const beforeGlass = s.resources.glass;
  const ok = AnkicasterEngine.addFurniture(s, dorm.id, 'halo_candles');
  assert.equal(ok.success, true);
  assert.equal(ok.state.resources.glass, beforeGlass - 2);
  assert.equal(ok.state.resources.radiance, 6);
});
