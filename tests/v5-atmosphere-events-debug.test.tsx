import assert from 'node:assert/strict';
import test from 'node:test';
import { createNewAcademy } from '../src/visual/onboarding/freshStart.ts';
import { getVeilBand } from '../src/utils/formulas.ts';
import {
  computeAtmosphere,
  computeCelestialBodies,
  computeClouds,
  computeMoonPhase,
  computeParallaxHills,
  computeRoomNightLights,
  computeVeilDomeState,
  getTimePhaseInfo,
  resolveEffectiveHours
} from '../src/visual/world/atmosphere.ts';
import {
  HAZARD_VIGNETTE_REGISTRY,
  VISUAL_EVENT_CATALOGUE,
  VisualEventDispatcher,
  VisualEventType,
  computeMessengerOwlState,
  drawHazardVignette,
  drawMessengerOwl,
  drawVisualEventVignette,
  getActiveHazardVignettes
} from '../src/visual/events/visualEvents.ts';
import { VisualWorld } from '../src/visual/world/VisualWorld.ts';
import { AnkicasterEngine } from '../src/utils/engine.ts';
import {
  ALL_HAZARD_TYPES,
  debugAdvanceBells,
  debugClearAllEvents,
  debugClearAllHazards,
  debugCompleteAllConstruction,
  debugDeleteCharacter,
  debugForceEnrollFiveStudents,
  debugForceEnrollStudent,
  debugGrantAllResources,
  debugGrantMasteryNow,
  debugLearnAllSpells,
  debugMakeMasteryReady,
  debugRetireCharacterNow,
  debugRunDayTick,
  debugSetResourceAmount,
  debugSetRoomHazard,
  debugSetTimeOverride,
  debugSetVeilStrength,
  debugSetWizardSchoolLevel,
  debugTriggerExpeditionOutcome,
  debugTriggerSchoolEvent,
  debugUnlockAllBlueprintsAndRecipes,
  debugUpdateCharacter,
  previewVisualEventInWorld
} from '../src/debug/creatureDebug.ts';
import { CREATURE_PEN_IDS } from '../src/visual/rooms/roomArt.ts';
import { Graphics } from 'pixi.js';
import { roomToWorldBox } from '../src/visual/layout/gridToWorld.ts';

function deepFreeze<T>(obj: T): T {
  if (obj && typeof obj === 'object') {
    Object.freeze(obj);
    for (const key of Object.keys(obj as Record<string, unknown>)) {
      const val = (obj as Record<string, unknown>)[key];
      if (val && typeof val === 'object' && !Object.isFrozen(val)) {
        deepFreeze(val);
      }
    }
  }
  return obj;
}

test('Part A: Time-of-day phases, visualTime override, Veil bands, clouds, parallax hills, sun/moon, and night lights', () => {
  // 1. Time phase info for Dawn (06:30), Day (13:00), Dusk (18:30), Night (23:00 & 00:00)
  assert.equal(getTimePhaseInfo(6.5).phase, 'dawn');
  assert.equal(getTimePhaseInfo(13.0).phase, 'day');
  assert.equal(getTimePhaseInfo(18.5).phase, 'dusk');
  assert.equal(getTimePhaseInfo(23.0).phase, 'night');
  assert.equal(getTimePhaseInfo(0.0).phase, 'night');

  // Linear blend progress in Dawn (05:30 -> 07:30) and Dusk (17:30 -> 19:30)
  const dawnMid = getTimePhaseInfo(6.5);
  assert.ok(Math.abs(dawnMid.blendProgress - 0.5) < 0.01);
  assert.ok(dawnMid.nightLightStrength > 0.2 && dawnMid.nightLightStrength < 0.8);

  const duskMid = getTimePhaseInfo(18.5);
  assert.ok(Math.abs(duskMid.blendProgress - 0.5) < 0.01);
  assert.ok(duskMid.nightLightStrength > 0.2 && duskMid.nightLightStrength < 0.8);

  // 2. visualTime setting ('day' / 'night' / 'clock') and debugTimeHours override
  const base = createNewAcademy();
  const midnightDate = new Date(2026, 5, 15, 0, 0, 0);
  assert.equal(resolveEffectiveHours(base, midnightDate), 0);

  const alwaysDay = { ...base, settings: { ...base.settings, visualTime: 'day' as const } };
  assert.equal(resolveEffectiveHours(alwaysDay, midnightDate), 12);
  assert.equal(computeAtmosphere(alwaysDay, { now: midnightDate }).phase, 'day');

  const alwaysNight = { ...base, settings: { ...base.settings, visualTime: 'night' as const } };
  assert.equal(resolveEffectiveHours(alwaysNight, midnightDate), 0);
  assert.equal(computeAtmosphere(alwaysNight, { now: midnightDate }).phase, 'night');

  const debugOverride = { ...alwaysNight, debugTimeHours: 6.25 };
  assert.equal(resolveEffectiveHours(debugOverride, midnightDate), 6.25);
  assert.equal(computeAtmosphere(debugOverride, { now: midnightDate }).phase, 'dawn');

  // 3. getVeilBand(strength) returns strong / thinning / thin / torn for 90 / 60 / 35 / 10 and exact boundaries
  assert.equal(getVeilBand(100), 'strong');
  assert.equal(getVeilBand(90), 'strong');
  assert.equal(getVeilBand(80), 'strong');
  assert.equal(getVeilBand(79), 'thinning');
  assert.equal(getVeilBand(60), 'thinning');
  assert.equal(getVeilBand(50), 'thinning');
  assert.equal(getVeilBand(49), 'thin');
  assert.equal(getVeilBand(35), 'thin');
  assert.equal(getVeilBand(20), 'thin');
  assert.equal(getVeilBand(19), 'torn');
  assert.equal(getVeilBand(10), 'torn');
  assert.equal(getVeilBand(0), 'torn');

  // 4. reduceMotion freezes cloud drift
  const c0 = computeClouds(1600, 400, 0, false);
  const cMoved = computeClouds(1600, 400, 25_000, false);
  assert.notEqual(c0[0].x, cMoved[0].x, 'Clouds drift when reduceMotion is false');

  const cFrozen0 = computeClouds(1600, 400, 0, true);
  const cFrozenLater = computeClouds(1600, 400, 25_000, true);
  assert.deepEqual(cFrozen0, cFrozenLater, 'reduceMotion freezes cloud drift');

  // 5. Parallax hills move at 20% and 40% of camera pan
  const hillsAt0 = computeParallaxHills(1600, 400, 0, 'day');
  const hillsAt100 = computeParallaxHills(1600, 400, 100, 'day');
  assert.equal(hillsAt0.far.offsetX, 0);
  assert.equal(hillsAt0.near.offsetX, 0);
  assert.equal(hillsAt100.far.offsetX, -20);
  assert.equal(hillsAt100.near.offsetX, -40);

  // 6. Sun & moon arcs and moon phase
  const sunNoon = computeCelestialBodies(12, 1600, 400, midnightDate);
  assert.equal(sunNoon.sun.visible, true);
  assert.equal(sunNoon.moon.visible, false);
  const moonMidnight = computeCelestialBodies(0, 1600, 400, midnightDate);
  assert.equal(moonMidnight.sun.visible, false);
  assert.equal(moonMidnight.moon.visible, true);
  const phase = computeMoonPhase(midnightDate);
  assert.ok(phase >= 0 && phase < 1);

  // 7. Night lights: every indoor castle room gets at least one warm window glow at night;
  // creature pens have no torches/windows (except ember_pit fire bed); outdoor grounds rooms have no windows.
  const stateWithPens = structuredClone(base);
  stateWithPens.rooms.push(
    {
      id: 50, defId: 'meadow_paddock', x: 0, y: 0, w: 2, h: 1, area: 'grounds', level: 1, state: 'built',
      buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
    },
    {
      id: 51, defId: 'ember_pit', x: 2, y: 0, w: 1, h: 1, area: 'grounds', level: 1, state: 'built',
      buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
    },
    {
      id: 52, defId: 'greenhouse', x: 3, y: 0, w: 2, h: 1, area: 'grounds', level: 1, state: 'built',
      buildRequired: 0, buildProgress: 0, cleanliness: 100, settings: {}, furniture: []
    }
  );
  const lights = computeRoomNightLights(stateWithPens, 400, 1.0);
  const indoorCastleRooms = stateWithPens.rooms.filter(
    r => r.state === 'built' && r.area === 'castle' && !CREATURE_PEN_IDS.has(r.defId)
  );
  for (const r of indoorCastleRooms) {
    assert.ok(
      lights.some(l => l.roomId === r.id && l.kind === 'window'),
      `Indoor castle room ${r.defId} must have at least one warm window glow at night`
    );
  }
  assert.equal(lights.filter(l => l.roomId === 50).length, 0, 'meadow_paddock has no torches or windows');
  assert.ok(lights.filter(l => l.roomId === 51).every(l => l.kind === 'ember_bed'), 'ember_pit only has ember_bed glow');
  assert.ok(lights.filter(l => l.roomId === 52).every(l => l.kind !== 'window'), 'outdoor grounds rooms never get window glows');

  // 8. Veil dome state & ward circles lens
  const tornState = {
    ...base,
    veil: { ...base.veil, strength: 10 },
    settings: { ...base.settings, showHazardsLens: true }
  };
  const dome = computeVeilDomeState(tornState, 1600, 400, 1000, 0.5, 0);
  assert.equal(dome.band, 'torn');
  assert.equal(dome.edgeGaps, true);
  assert.ok(dome.tears.length > 0, 'Torn veil (<20) produces violet tears');
  assert.equal(dome.showWardCircles, true);
});

test('Part B.2: Engine hooks populate notices[].data and ringBell updates wizard.presenceRoomId', () => {
  let state = createNewAcademy();
  state = debugGrantAllResources(state).state;
  state = debugLearnAllSpells(state).state;
  state = debugUnlockAllBlueprintsAndRecipes(state).state;

  // 1. Place room & complete site
  const placeRes = AnkicasterEngine.placeRoom(state, 'dormitory', 'castle', 0, 0);
  assert.equal(placeRes.success, true);
  state = placeRes.state;
  const lastPlaceNotice = state.notices[state.notices.length - 1];
  assert.ok(lastPlaceNotice.data?.roomId, 'placeRoom attaches roomId');

  state = debugCompleteAllConstruction(state).state;
  const builtNotice = state.notices[state.notices.length - 1];
  assert.equal(builtNotice.data?.visualEventType, 'room_built');
  assert.ok(builtNotice.data?.roomId);

  // 2. Upgrade room
  const dorm = state.rooms.find(r => r.defId === 'dormitory')!;
  const upgRes = AnkicasterEngine.upgradeRoom(state, dorm.id);
  assert.equal(upgRes.success, true);
  state = upgRes.state;
  const upgNotice = state.notices[state.notices.length - 1];
  assert.equal(upgNotice.data?.roomId, dorm.id);
  assert.equal(upgNotice.data?.level, 2);

  // 3. Add furniture
  const furnRes = AnkicasterEngine.addFurniture(state, dorm.id, 'canopy_bed');
  if (furnRes.success) {
    state = furnRes.state;
    assert.equal(state.notices[state.notices.length - 1].data?.roomId, dorm.id);
  }

  // 4. Cast spell
  const spellRes = AnkicasterEngine.castSpell(state, 'hush');
  assert.equal(spellRes.success, true);
  state = spellRes.state;
  const spellNotice = state.notices[state.notices.length - 1];
  assert.equal(spellNotice.data?.spellId, 'hush');
  assert.equal(spellNotice.data?.visualEventType, 'spell_cast');

  // 5. ringBell sets wizard.presenceRoomId when no session is active
  state.wizard.activeSession = undefined;
  state.bellIndex += 1;
  AnkicasterEngine.ringBell(state, []);
  assert.ok(state.wizard.presenceRoomId !== undefined, 'ringBell sets wizard.presenceRoomId');
  const studyId = state.rooms.find(r => r.defId === 'wizard_study')?.id;
  assert.notEqual(state.wizard.presenceRoomId, studyId, 'wizard.presenceRoomId picks a non-study room when other rooms exist');
});

test('Part B: VisualEventDispatcher rate-limiting, no away-time replay, 0 per-review effects, fallback, and Messenger Owl', () => {
  const base = createNewAcademy();
  // Pre-populate notices on initial state to simulate hydrating a save after away time
  base.notices.push({
    id: 'old-notice-1',
    time: Date.now() - 60_000,
    type: 'graduation',
    text: 'Old graduation while away',
    data: { roomId: 1, visualEventType: 'mastery_granted' }
  });

  const dispatcher = new VisualEventDispatcher();
  const initialSpawned = dispatcher.ingestSnapshot(base, 1000);
  assert.equal(initialSpawned.length, 0, 'Hydrating an initial snapshot fires 0 replay effects');
  assert.equal(dispatcher.getActiveEffects().length, 0);

  // Running 100 honest reviews in a row produces 0 per-review visual effects
  let cur = structuredClone(base);
  const cardIds = Object.keys(cur.allCards).map(Number);
  for (let i = 0; i < 100; i++) {
    const cid = cardIds[i % cardIds.length];
    // Keep reviewIndex at 1 so we test pure honest reviews without bell rollover (every 20 reviews)
    cur.reviewIndex = 1;
    if (cur.wizard.activeSession) cur.wizard.activeSession.progress = 0;
    for (const r of cur.rooms) {
      if (r.state === 'site') r.buildProgress = 0;
    }
    cur = AnkicasterEngine.applyHonestReview(cur, cid, 3, 2000).state;
    const fx = dispatcher.ingestSnapshot(cur, 1000 + i * 10);
    assert.equal(fx.length, 0, 'Honest reviews never fire per-review visual world effects');
  }

  // Diffing two snapshots with 10 new big events in the same room plays at most 1 big effect immediately and queues the rest
  const burstState = structuredClone(cur);
  const hallId = burstState.rooms.find(r => r.defId === 'entrance_hall')!.id;
  for (let i = 0; i < 10; i++) {
    burstState.notices.push({
      id: `burst-big-${i}`,
      time: Date.now() + i,
      type: 'graduation',
      text: `Burst graduation ${i}`,
      data: { roomId: hallId, school: 'arcane', visualEventType: 'mastery_granted' }
    });
  }
  dispatcher.ingestSnapshot(burstState, 5000);
  const activeBigInHall = dispatcher.getActiveEffects().filter(e => e.roomId === hallId && e.size === 'big');
  assert.equal(activeBigInHall.length, 1, 'At most 1 big effect active in the same room immediately');
  assert.ok(dispatcher.getQueuedEffects().length > 0, 'Remaining big effects are queued');

  // Missing or invalid roomId falls back to Entrance Hall and never throws;
  // a notice WITHOUT data.roomId gets the generic_sparkle version on Entrance Hall
  const fallbackState = structuredClone(burstState);
  fallbackState.notices.push(
    {
      id: 'missing-room-notice',
      time: Date.now() + 50,
      type: 'spell',
      text: 'Mystery spell',
      data: { roomId: 999999, visualEventType: 'spell_cast' }
    },
    {
      id: 'no-room-id-notice',
      time: Date.now() + 60,
      type: 'spell',
      text: 'Roomless spell',
      data: { visualEventType: 'spell_cast' }
    }
  );
  assert.doesNotThrow(() => {
    dispatcher.ingestSnapshot(fallbackState, 8000);
  });
  const fallbackFx = [...dispatcher.getActiveEffects(), ...dispatcher.getQueuedEffects()].find(
    e => e.type === 'spell_cast'
  );
  assert.equal(fallbackFx?.roomId, hallId, 'Invalid roomId falls back to Entrance Hall');
  const genericSparkleFx = [...dispatcher.getActiveEffects(), ...dispatcher.getQueuedEffects()].find(
    e => e.type === 'generic_sparkle'
  );
  assert.ok(genericSparkleFx, 'Notice without data.roomId gets generic_sparkle');
  assert.equal(genericSparkleFx?.roomId, hallId, 'generic_sparkle targets Entrance Hall');

  // Meal window is debounced to at most 1 per 5 minutes (300,000 ms)
  const mealDisp = new VisualEventDispatcher();
  mealDisp.ingestSnapshot(base, 0);
  assert.equal(mealDisp.notifyMealWindow(base, 1000), true, 'First meal window fires');
  assert.equal(mealDisp.notifyMealWindow(base, 60_000), false, 'Second meal window within 5 min is debounced');
  assert.equal(mealDisp.notifyMealWindow(base, 299_999), false, 'Still debounced just under 5 min');
  assert.equal(mealDisp.notifyMealWindow(base, 301_001), true, 'Meal window fires again after 5 minutes');

  // celebrationSize: 'small' downgrades 'big' to 'small'; 'off' suppresses non-essential effects
  const smallDisp = new VisualEventDispatcher();
  const sSmall = { ... createNewAcademy(), settings: { ...createNewAcademy().settings, celebrationSize: 'small' as const } };
  smallDisp.ingestSnapshot(sSmall, 0);
  const sSmall2 = structuredClone(sSmall);
  sSmall2.notices.push({
    id: 'small-test',
    time: Date.now(),
    type: 'graduation',
    text: 'Grad',
    data: { roomId: hallId, visualEventType: 'mastery_granted' }
  });
  const spawnedSmall = smallDisp.ingestSnapshot(sSmall2, 100);
  assert.equal(spawnedSmall[0]?.size, 'small', 'celebrationSize: small downgrades big effect to small');

  const offDisp = new VisualEventDispatcher();
  const sOff = { ...createNewAcademy(), settings: { ...createNewAcademy().settings, celebrationSize: 'off' as const } };
  offDisp.ingestSnapshot(sOff, 0);
  const sOff2 = structuredClone(sOff);
  sOff2.notices.push({
    id: 'off-test',
    time: Date.now(),
    type: 'graduation',
    text: 'Grad',
    data: { roomId: hallId, visualEventType: 'mastery_granted' }
  });
  const spawnedOff = offDisp.ingestSnapshot(sOff2, 100);
  assert.equal(spawnedOff.length, 0, 'celebrationSize: off suppresses celebration vignette');

  // Messenger owl perches on Entrance Hall roof whenever state.activeEvents.length > 0
  assert.equal(computeMessengerOwlState(base, 400).visible, false);
  const withEvent = debugTriggerSchoolEvent(base, 'owl_post').state;
  const owl = computeMessengerOwlState(withEvent, 400);
  assert.equal(owl.visible, true);
  assert.equal(owl.eventId, 'owl_post');
});

test('Part B.4: All 5 PlacedRoom hazard types and engine incidentId values have registered visual renderers and draw without throwing', () => {
  const state = createNewAcademy();
  const g = new Graphics();
  const hall = state.rooms.find(r => r.defId === 'entrance_hall')!;
  const box = roomToWorldBox(hall, 400);

  for (const hType of ALL_HAZARD_TYPES) {
    assert.ok(HAZARD_VIGNETTE_REGISTRY[hType], `Hazard type ${hType} is registered`);
    const sHaz = debugSetRoomHazard(state, hall.id, hType).state;
    const vignettes = getActiveHazardVignettes(sHaz);
    assert.ok(vignettes.some(v => v.key === hType && v.roomId === hall.id));
    for (const v of vignettes) {
      assert.doesNotThrow(() => drawHazardVignette(g, v, box, 500, false));
      assert.doesNotThrow(() => drawHazardVignette(g, v, box, 500, true));
    }
  }

  for (const incId of ['night_ink', 'alch_spill', 'frost_draught', 'hex_damp', 'loose_creature']) {
    assert.ok(HAZARD_VIGNETTE_REGISTRY[incId], `Incident id ${incId} is registered`);
    assert.doesNotThrow(() =>
      drawHazardVignette(g, { roomId: hall.id, key: incId, def: HAZARD_VIGNETTE_REGISTRY[incId] }, box, 500, false)
    );
  }
});

test('VR-01: Deep-frozen FullGameState passed through VisualWorld with atmosphere, visual events, and hazards active for 1,000 ticks does not throw', () => {
  let state = createNewAcademy();
  state = debugForceEnrollFiveStudents(state, 'arcane').state;
  state = debugTriggerSchoolEvent(state, 'owl_post').state;
  const hall = state.rooms.find(r => r.defId === 'entrance_hall')!;
  state = debugSetRoomHazard(state, hall.id, 'breach').state;
  state = debugSetVeilStrength(state, 15).state;
  state.settings.showHazardsLens = true;

  const world = new VisualWorld();
  // Seed initial snapshot, then add an event notice and deep-freeze
  world.setSnapshot(state);

  const nextState = structuredClone(state);
  nextState.notices.push({
    id: 'vr01-grad',
    time: Date.now(),
    type: 'graduation',
    text: 'Mastery!',
    data: { roomId: hall.id, school: 'arcane', visualEventType: 'mastery_granted' }
  });
  const beforeJson = JSON.stringify(nextState);
  deepFreeze(nextState);

  assert.doesNotThrow(() => {
    world.setSnapshot(nextState, hall.id);
    for (let i = 0; i < 1000; i++) {
      world.update(16, i * 16);
    }
  });
  assert.equal(JSON.stringify(nextState), beforeJson);
});

test('Part C: Debug Tools actions (People, Events & Hazards, Atmosphere, Academy, and non-mutating Visual Event Preview)', () => {
  // 1. Force-enrolling a student works on a fresh academy with 0 free cards and 0 beds (no NaN fields)
  let state = createNewAcademy();
  state.allCards = {};
  state.mana = 0;
  const enrollRes = debugForceEnrollStudent(state, 'nature', 'Astra Starweaver');
  state = enrollRes.state;
  assert.equal(state.characters.length, 1);
  assert.equal(state.characters[0].name, 'Astra Starweaver');
  assert.equal(state.characters[0].currentSchool, 'nature');
  assert.equal(Number.isNaN(state.characters[0].morale), false);
  for (const val of Object.values(state.characters[0].needs)) {
    assert.equal(Number.isNaN(val), false);
  }

  // +5 students
  state = debugForceEnrollFiveStudents(state, 'light').state;
  assert.equal(state.characters.length, 6);

  // 2. Setting career via debug works on a character with 0 mastered schools
  const charId = state.characters[0].id;
  assert.equal(state.characters[0].masteredSchools.length, 0);
  state = debugUpdateCharacter(state, charId, { career: 'alchemist' }).state;
  assert.equal(state.characters.find(c => c.id === charId)?.career, 'alchemist');
  assert.equal(state.characters.find(c => c.id === charId)?.status, 'faculty');

  // Mastery-ready, Grant mastery, Injury, Retire, Delete
  state = debugMakeMasteryReady(state, charId).state;
  assert.equal(state.characters.find(c => c.id === charId)?.readyDays.nature, 30);
  state = debugGrantMasteryNow(state, charId).state;
  assert.ok(state.characters.find(c => c.id === charId)?.masteredSchools.includes('nature'));

  state = debugUpdateCharacter(state, charId, { injuryType: 'hexed', needsPreset: 'all_20' }).state;
  assert.equal(state.characters.find(c => c.id === charId)?.injury?.type, 'hexed');
  assert.equal(state.characters.find(c => c.id === charId)?.morale, 20);
  state = debugUpdateCharacter(state, charId, { injuryType: 'none', needsPreset: 'all_100' }).state;
  assert.equal(state.characters.find(c => c.id === charId)?.injury, undefined);
  assert.equal(state.characters.find(c => c.id === charId)?.morale, 100);

  const secondCharId = state.characters[1].id;
  state = debugRetireCharacterNow(state, charId).state;
  assert.ok(state.alumniGallery.some(a => a.id === charId));
  state = debugDeleteCharacter(state, secondCharId).state;
  assert.ok(!state.characters.some(c => c.id === secondCharId));

  // 3. Triggering a school event via debug adds it to state.activeEvents
  state = debugTriggerSchoolEvent(state, 'star_shower').state;
  assert.ok(state.activeEvents.some(e => e.eventId === 'star_shower'));
  state = debugClearAllEvents(state).state;
  assert.equal(state.activeEvents.length, 0);

  // 4. Setting a room hazard via debug sets room.hazard and clearing removes it
  const hallId = state.rooms.find(r => r.defId === 'entrance_hall')!.id;
  state = debugSetRoomHazard(state, hallId, 'hex_fog').state;
  assert.equal(state.rooms.find(r => r.id === hallId)?.hazard?.type, 'hex_fog');
  state = debugSetRoomHazard(state, hallId, 'clear').state;
  assert.equal(state.rooms.find(r => r.id === hallId)?.hazard, undefined);
  state = debugSetRoomHazard(state, hallId, 'cold_snap').state;
  state = debugClearAllHazards(state).state;
  assert.equal(state.rooms.find(r => r.id === hallId)?.hazard, undefined);

  // Expedition outcome debug on chosen heroes
  const heroId = state.characters[0].id;
  state = debugTriggerExpeditionOutcome(state, 'curse', [heroId]).state;
  assert.ok(state.expeditions.some(e => e.outcome === 'curse' && e.teamIds.includes(heroId)));
  assert.equal(state.characters.find(c => c.id === heroId)?.injury?.type, 'hexed');

  // Atmosphere & Academy debug actions
  state = debugSetTimeOverride(state, 18.5).state;
  assert.equal(state.debugTimeHours, 18.5);
  state = debugSetTimeOverride(state, null).state;
  assert.equal(state.debugTimeHours, null);

  state = debugSetVeilStrength(state, 35).state;
  assert.equal(state.veil.strength, 35);
  state = debugRunDayTick(state, true).state;
  state = debugSetResourceAmount(state, 'mana', 777).state;
  assert.equal(state.mana, 777);
  state = debugSetWizardSchoolLevel(state, 'light', 8).state;
  assert.equal(state.wizard.levels.light, 8);
  const bellBefore = state.bellIndex;
  state = debugAdvanceBells(state, 3).state;
  assert.equal(state.bellIndex, bellBefore + 3);

  // 5. Visual event preview action queues/plays a vignette for EVERY registered event type without mutating FullGameState
  const world = new VisualWorld();
  const frozenState = deepFreeze(structuredClone(state));
  const frozenJson = JSON.stringify(frozenState);
  world.setSnapshot(frozenState);

  const g = new Graphics();
  const box = roomToWorldBox(frozenState.rooms[0], world.groundY);
  for (const type of Object.keys(VISUAL_EVENT_CATALOGUE) as VisualEventType[]) {
    previewVisualEventInWorld(world, frozenState, type, hallId);
    const allFx = [...world.eventDispatcher.getActiveEffects(), ...world.eventDispatcher.getQueuedEffects()];
    assert.ok(allFx.some(e => e.type === type), `Preview queued/activated ${type}`);
    const sample = allFx.find(e => e.type === type)!;
    assert.doesNotThrow(() => drawVisualEventVignette(g, sample, box, 0.5, false));
  }
  const owlState = computeMessengerOwlState(debugTriggerSchoolEvent(state, 'owl_post').state, world.groundY);
  assert.doesNotThrow(() => drawMessengerOwl(g, owlState, 500, false));
  assert.equal(JSON.stringify(frozenState), frozenJson, 'FullGameState was never mutated by visual event preview');
});

test('Force-enrolled students stay indoors and move to classroom, dormitory, and refectory when built afterwards', () => {
  let state = createNewAcademy();
  state = debugGrantAllResources(state).state;
  state = debugUnlockAllBlueprintsAndRecipes(state).state;
  state.debugTimeHours = 6.2; // Period 1 class hour regardless of wall clock

  // 1. Force-enroll students before any dorm or classroom exists
  state = debugForceEnrollFiveStudents(state, 'arcane').state;
  const vegPatch = state.rooms.find(r => r.defId === 'vegetable_patch')!;
  const hall = state.rooms.find(r => r.defId === 'entrance_hall')!;

  const world = new VisualWorld();
  world.setSnapshot(state);
  world.update(100, 1000);

  for (const ch of state.characters) {
    const agent = world.choreographer.agents.get(`char-${ch.id}`)!;
    assert.ok(agent, `Agent for ${ch.name} exists`);
    if (ch.currentSchool === 'nature') {
      assert.equal(agent.targetRoomId, vegPatch.id, 'Nature student visits vegetable patch per Section 7');
    } else {
      assert.notEqual(agent.targetRoomId, vegPatch.id, 'Non-Nature students must not run outside to the vegetable patch');
      assert.equal(agent.targetRoomId, hall.id, 'With only starting rooms built, non-Nature students stay in Entrance Hall');
    }
  }

  // 2. Build Dormitory, Refectory, and Classroom afterwards, complete construction, and install required fixtures
  state = AnkicasterEngine.placeRoom(state, 'dormitory').state;
  state = AnkicasterEngine.placeRoom(state, 'class_arcane').state;
  state = AnkicasterEngine.placeRoom(state, 'refectory').state;
  state = debugCompleteAllConstruction(state).state;

  const dorm = state.rooms.find(r => r.defId === 'dormitory')!;
  const classroom = state.rooms.find(r => r.defId === 'class_arcane')!;
  const refectory = state.rooms.find(r => r.defId === 'refectory')!;

  state = AnkicasterEngine.installRequiredFixture(state, dorm.id, 0).state;
  state = AnkicasterEngine.installRequiredFixture(state, classroom.id, 0).state;
  state = AnkicasterEngine.installRequiredFixture(state, classroom.id, 1).state;
  state = AnkicasterEngine.installRequiredFixture(state, classroom.id, 2).state;
  state = AnkicasterEngine.addFurniture(state, classroom.id, 'student_desk').state;
  state = AnkicasterEngine.installRequiredFixture(state, refectory.id, 0).state;
  state = AnkicasterEngine.installRequiredFixture(state, refectory.id, 1).state;

  // Give the classroom a teacher via debug tools
  const teacherId = state.characters[4].id;
  state = debugUpdateCharacter(state, teacherId, { career: 'teacher', workplaceRoomId: classroom.id }).state;
  const teacherChar = state.characters.find(c => c.id === teacherId)!;
  assert.ok(teacherChar.masteredSchools.includes('arcane'), 'Debug teacher has arcane mastered');
  assert.equal(teacherChar.workplaceRoomId, classroom.id, 'Debug teacher stays assigned to classroom');

  // Existing students now have bedRoomId synced; Arcane student has classRoomId/seatRoomId/period synced
  const students = state.characters.filter(c => c.status === 'student');
  assert.equal(students.length, 4);
  for (const st of students) {
    assert.equal(st.bedRoomId, dorm.id, 'Existing student received bedRoomId when dorm was built');
    if (st.currentSchool === 'arcane') {
      assert.equal(st.seatRoomId, classroom.id, 'Arcane student received seatRoomId when Arcane classroom was built');
      assert.equal(st.classRoomId, classroom.id, 'Arcane student received classRoomId when Arcane classroom was built');
      assert.equal(st.period, 1, 'Arcane student assigned to Period 1');
    } else {
      assert.equal(st.classRoomId, undefined, 'Non-Arcane student without own classroom stays on free time');
    }
  }

  // Choreographer routes Arcane student and teacher to classroom during Period 1
  world.setSnapshot(state);
  world.update(100, 2000);
  const arcaneStu = students.find(st => st.currentSchool === 'arcane')!;
  const arcaneAgent = world.choreographer.agents.get(`char-${arcaneStu.id}`)!;
  assert.equal(arcaneAgent.targetRoomId, classroom.id, 'Arcane student targets built classroom during Period 1');
  assert.equal(arcaneAgent.activity, 'class');

  const teacherAgent = world.choreographer.agents.get(`char-${teacherId}`)!;
  assert.equal(teacherAgent.targetRoomId, classroom.id, 'Teacher targets classroom during Period 1');
});

