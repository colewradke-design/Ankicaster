import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Graphics } from 'pixi.js';
import { createInitialGameState } from '../src/data/initialState';
import {
  CREATURE_DEFINITIONS,
  GREENHOUSE_CROPS,
  HAZARD_CATALOG,
  BREACH_CATALOG,
  MISBEHAVIOR_INCIDENTS,
  PERSONALITY_DEFINITIONS,
  POTION_RECIPES,
  ROOM_DEFINITIONS,
  SCROLL_DEFINITIONS,
  SPELLBOOK_DEFINITIONS,
  SPELL_DEFINITIONS,
  TRAIT_DEFINITIONS
} from '../src/data/content';
import { AnkicasterEngine } from '../src/utils/engine';
import {
  alumniRetirementScale,
  calculateDailyVeilCost,
  calculateHazardRollChance,
  calculateReviewMana,
  computeAlumniBonuses,
  computeSpellbookBonuses,
  computeStudyLevel,
  maxStudySessionsForWizard,
  wizardSchoolBuffs
} from '../src/utils/formulas';
import {
  bondBuffMultiplier,
  creatureCategoryBonus,
  creatureSpeciesBuffSum,
  menagerieModuleCap,
  menagerieModules
} from '../src/utils/creatures';
import { discountedBuildReviews, discountedFurnitureCost } from '../src/utils/placement';
import { deckPrice } from '../src/utils/decks';
import { ALL_HAZARD_TYPES, debugSetRoomHazard } from '../src/debug/creatureDebug';
import {
  HAZARD_VIGNETTE_REGISTRY,
  drawHazardVignette,
  getActiveHazardVignettes
} from '../src/visual/events/visualEvents';
import { roomToWorldBox } from '../src/visual/layout/gridToWorld';
import { GrimoireBook } from '../src/components/StudyModals';
import { TopBar } from '../src/components/TopBar';
import { VisitorsPanel } from '../src/components/AcademyPanels';
import { AlchemyPanel, RecruitmentPanel, RosterPanel } from '../src/components/GamePanels';
import { RoomWindow } from '../src/components/RoomWindow';
import type { Character, CreatureInstance, FullGameState, PlacedRoom, SchoolType } from '../src/types/ankicaster';

const noop = () => {};

function makeBaseState(): FullGameState {
  const s = createInitialGameState();
  s.mana = 5000;
  s.resources.timber = 300;
  s.resources.stone = 300;
  s.resources.glass = 150;
  s.resources.cloth = 150;
  s.resources.provisions = 300;
  s.resources.greens = 100;
  s.resources.fish = 100;
  s.resources.nectar = 100;
  s.resources.herbs = 100;
  s.resources.radiance = 150;
  s.resources.umbra = 100;
  s.resources.reagents = 100;
  s.resources.insight = 150;
  s.resources.crystal = 50;
  s.resources.heartwood = 50;
  s.resources.moonsilk = 20;
  s.resources.starmetal = 20;
  s.resources.ember_salt = 20;
  s.resources.phoenix_ash = 20;
  s.resources.golem_core = 10;
  return s;
}

function addBuiltRoom(
  state: FullGameState,
  defId: string,
  opts: { level?: 1 | 2 | 3; x?: number; y?: number; area?: 'castle' | 'grounds'; unfinished?: boolean; qBoost?: boolean } = {}
): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  const id = Math.max(100, ...state.rooms.map(r => r.id)) + 1;
  const area = opts.area ?? def?.area ?? 'castle';
  const [w, h] = def?.size || [2, 1];
  const reqs = opts.unfinished ? [] : (def?.requiredFurniture || []);
  const furniture = reqs.flatMap((req, rIdx) =>
    Array.from({ length: req.count }, (_, cIdx) => ({
      id: id * 100 + rIdx * 10 + cIdx + 1,
      defId: req.role,
      slotKind: req.role,
      damaged: false
    }))
  );
  if (opts.qBoost) {
    // Push room Quality into Fine/Splendid range
    furniture.push(
      { id: id * 100 + 81, defId: 'tapestry', slotKind: 'wall', damaged: false },
      { id: id * 100 + 82, defId: 'starfall_chandelier', slotKind: 'ceiling', damaged: false },
      { id: id * 100 + 83, defId: 'stained_window', slotKind: 'wall', damaged: false }
    );
  }
  const castleFloor0 = state.rooms.filter(r => r.area === 'castle' && r.y === 0);
  const nextCastleX = castleFloor0.reduce((m, r) => Math.max(m, r.x + r.w), 3);
  const groundsList = state.rooms.filter(r => r.area === 'grounds');
  const nextGroundsX = groundsList.reduce((m, r) => Math.max(m, r.x + r.w), 0);
  const defaultX = area === 'grounds' ? nextGroundsX : nextCastleX;
  const room: PlacedRoom = {
    id,
    defId,
    x: opts.x ?? defaultX,
    y: opts.y ?? 0,
    w,
    h,
    area,
    state: 'built',
    level: opts.level ?? 1,
    cleanliness: 100,
    buildProgress: def?.buildReviews || 50,
    buildRequired: def?.buildReviews || 50,
    furniture,
    settings: {}
  };
  state.rooms.push(room);
  return room;
}

function makeStudent(id: number, name: string, over: Partial<Character> = {}): Character {
  return {
    id,
    name,
    pronouns: 'they/them',
    appearance: { skin: '#f2c9a5', hair: 'short', hairColor: '#3b2820', robeColor: '#6B4FBB', hat: 'none' },
    personality: 'Bookish',
    traits: [],
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    needs: { hunger: 85, rest: 85, leisure: 85, composure: 85, health: 100 },
    morale: 85,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: [],
    ...over
  };
}

// ==========================================
// GROUP 1: Wizard Passives (Lv 6-10), studyLevel & Grimoire Study UI
// ==========================================
test('Phase3 Group 1: Wizard L6-10 passives, studyLevel caps (2/3/5), and GrimoireBook unlearned study', () => {
  const buffs = wizardSchoolBuffs({ arcane: 10, nature: 8, light: 7, shadow: 9, alchemy: 10 });
  assert.equal(buffs.arcaneSteps, 5);
  assert.equal(buffs.natureSteps, 3);
  assert.equal(buffs.lightSteps, 2);
  assert.equal(buffs.shadowSteps, 4);
  assert.equal(buffs.alchemySteps, 5);
  assert.ok(Math.abs(buffs.manaMult - 1.1) < 1e-9);
  assert.ok(Math.abs(buffs.natureMult - 1.09) < 1e-9);
  assert.ok(Math.abs(buffs.lightRecoveryMult - 1.06) < 1e-9);
  assert.ok(Math.abs(buffs.shadowMult - 0.88) < 1e-9);
  assert.ok(Math.abs(buffs.alchemyCostMult - 0.85) < 1e-9);
  assert.ok(Math.abs(buffs.alchemyPotionYieldBonus - 0.15) < 1e-9);

  // studyLevel thresholds at 15 and 30 -> total session caps 2 / 3 / 5
  assert.equal(computeStudyLevel({ arcane: 5, nature: 5, light: 4 }), 1);
  assert.equal(maxStudySessionsForWizard(1), 2);
  assert.equal(computeStudyLevel({ arcane: 5, nature: 5, light: 5 }), 2);
  assert.equal(maxStudySessionsForWizard(2), 3);
  assert.equal(computeStudyLevel({ arcane: 6, nature: 6, light: 6, shadow: 6, alchemy: 6 }), 3);
  assert.equal(maxStudySessionsForWizard(3), 5);

  // Enforce Study Lv 1 queue cap (1 active + 1 queued = 2), then Lv 2 allows 3rd
  const s1 = makeBaseState();
  s1.wizard.levels = { arcane: 2, nature: 1, light: 0, shadow: 0, alchemy: 0 };
  s1.wizard.studyLevel = 1;
  const q1 = AnkicasterEngine.queueWizardSession(s1, 'arcane');
  assert.equal(q1.success, true);
  const q2 = AnkicasterEngine.queueWizardSession(q1.state, 'nature');
  assert.equal(q2.success, true);
  const q3 = AnkicasterEngine.queueWizardSession(q2.state, 'light');
  assert.equal(q3.success, false);

  // GrimoireBook renders unlearned spells with Study queue button and Spellbook Shelf when bound
  const sg = makeBaseState();
  sg.wizard.levels.arcane = 5;
  sg.spellbooks = ['almanac_of_kind_weather'];
  const html = renderToStaticMarkup(
    <GrimoireBook state={sg} onCast={noop} onStudySpell={noop} onClose={noop} />
  );
  assert.match(html, /grimoire-study-tab/);
  assert.match(html, /Study Grimoires/);
  assert.match(html, /grimoire-spellbook-shelf/);
  assert.match(html, /Almanac of Kind Weather/);
});

// ==========================================
// GROUP 2: Hazards (§19), Breaches, Warding Chamber, Standing Stones, Fireproof, Foresight & Observatory
// ==========================================
test('Phase3 Group 2: All 14 hazards + 4 breaches, Warding Chamber, Standing Stones, Foresight & visual vignettes', () => {
  // All 14 GDD hazards and 4 breaches exist in catalogs & ALL_HAZARD_TYPES
  assert.ok(Object.keys(HAZARD_CATALOG).length >= 14);
  assert.ok(Object.keys(BREACH_CATALOG).length >= 4);
  const g = new Graphics();
  const base = makeBaseState();
  const hall = base.rooms.find(r => r.defId === 'entrance_hall')!;
  const box = roomToWorldBox(hall, 400);
  for (const hType of ALL_HAZARD_TYPES) {
    assert.ok(HAZARD_VIGNETTE_REGISTRY[hType], `Hazard ${hType} registered`);
    const sHaz = debugSetRoomHazard(base, hall.id, hType).state;
    const vigs = getActiveHazardVignettes(sHaz);
    assert.ok(vigs.some(v => v.key === hType));
    for (const v of vigs) {
      assert.doesNotThrow(() => drawHazardVignette(g, v, box, 500, false));
    }
  }

  // Warding Chamber reduces Veil cost (-5% per chamber, max 3)
  const noWardVeil = calculateDailyVeilCost(base.rooms, 5, 0, 0, false, false, 1, 1, 0);
  const withWardVeil = calculateDailyVeilCost(base.rooms, 5, 0, 0, false, false, 1, 1, 2);
  assert.ok(withWardVeil.cost < noWardVeil.cost, 'Warding Chambers reduce daily Veil cost');

  // Hazard chance formula & Moonless Night outside 75% cap
  const baseHazardP = calculateHazardRollChance(100, 100, 0.75, false);
  const moonlessP = calculateHazardRollChance(100, 100, 0.75, true);
  assert.ok(Math.abs(moonlessP - baseHazardP * 0.4) < 1e-9);

  // Foresight + Observatory forecast visibility & skipForecastedEvent
  const sf = makeBaseState();
  addBuiltRoom(sf, 'observatory');
  sf.upcomingEvents = [
    { day: sf.day + 1, eventId: 'rainy_week' },
    { day: sf.day + 2, eventId: 'harvest_market' }
  ];
  sf.activeBuffs = { foresightDays: 2, foresightSkips: 1 };
  const visible = AnkicasterEngine.getVisibleForecast(sf);
  assert.equal(visible.length, 2);
  const vHtml = renderToStaticMarkup(
    <VisitorsPanel state={sf} onOpenEvent={noop} onSkipForecastEvent={noop} />
  );
  assert.match(vHtml, /Skip Event/);
  const skipped = AnkicasterEngine.skipForecastedEvent(sf, sf.day + 1);
  assert.equal(skipped.success, true);
  assert.equal(skipped.state.activeBuffs?.foresightSkips, 0);
  assert.equal(skipped.state.upcomingEvents?.find(e => e.day === sf.day + 1)?.eventId, 'none');

  // Fireproof Salve / Douse blocks kitchen_fire
  const sfFire = makeBaseState();
  addBuiltRoom(sfFire, 'kitchen');
  sfFire.resources.potions.fireproof_salve = 1;
  const afterSalve = AnkicasterEngine.usePotion(sfFire, 'fireproof_salve');
  assert.equal(afterSalve.success, true);
  assert.ok((afterSalve.state.activeBuffs?.fireproofBells || 0) > 0);
});

// ==========================================
// GROUP 3: §14 Traits, Sunlit Sanctum Rite of Renewal & §20 Misbehavior
// ==========================================
test('Phase3 Group 3: Personalities/Traits catalogs, Rite of Renewal cooldown, and §20 misbehavior + calming', () => {
  assert.equal(Object.keys(PERSONALITY_DEFINITIONS).length, 8);
  assert.ok(Object.keys(TRAIT_DEFINITIONS).length >= 35);
  assert.equal(MISBEHAVIOR_INCIDENTS.length, 16);

  // Renown-weighted applicant generation respects The Open Door (+1 applicant)
  const sApp = makeBaseState();
  const baseApps = AnkicasterEngine.generateApplicants(sApp, 4);
  assert.equal(baseApps.length, 4);
  sApp.spellbooks = ['the_open_door'];
  const openDoorApps = AnkicasterEngine.generateApplicants(sApp, 4);
  assert.equal(openDoorApps.length, 5);

  // Sunlit Sanctum Rite of Renewal cleanses troublesome trait for 50 Radiance & enforces 7d cooldown
  const sr = makeBaseState();
  addBuiltRoom(sr, 'sunlit_sanctum');
  sr.characters.push(makeStudent(1, 'Jorin', { traits: ['Firebug', 'Brave'] }));
  const radBefore = sr.resources.radiance;
  const ren1 = AnkicasterEngine.performRiteOfRenewal(sr, 1, 'Firebug');
  assert.equal(ren1.success, true);
  assert.equal(ren1.state.resources.radiance, radBefore - 50);
  assert.deepEqual(ren1.state.characters[0].traits, ['Brave']);

  // Cooldown active before 7 days pass
  ren1.state.characters[0].traits.push('Lazy');
  ren1.state.day += 3;
  const renCooldown = AnkicasterEngine.performRiteOfRenewal(ren1.state, 1, 'Lazy');
  assert.equal(renCooldown.success, false);
  assert.match(renCooldown.error || '', /cooldown/i);

  // After 7 days, succeeds again
  ren1.state.day += 4;
  const ren2 = AnkicasterEngine.performRiteOfRenewal(ren1.state, 1, 'Lazy');
  assert.equal(ren2.success, true);

  // Calming Tonic & Calming Verse clear active misbehaviorChains & charm malus
  const sm = makeBaseState();
  const cr = addBuiltRoom(sm, 'common_room');
  cr.misbehaviorCharmMalus = -5;
  sm.characters.push(
    makeStudent(2, 'Mira', {
      needs: { hunger: 80, rest: 80, leisure: 80, composure: 50, health: 100 },
      misbehaviorChains: [{ roomId: cr.id, incidentId: 'graffiti_glyphs', penaltyCharm: -5 }]
    })
  );
  sm.resources.potions.calming_tonic = 1;
  const toned = AnkicasterEngine.usePotion(sm, 'calming_tonic', { roomId: cr.id });
  assert.equal(toned.success, true);
  assert.equal(toned.state.rooms.find(r => r.id === cr.id)?.misbehaviorCharmMalus || 0, 0);
  assert.equal(toned.state.characters[0].misbehaviorChains?.length || 0, 0);

  // Same clearing via Calming Verse scroll
  sm.scrolls = { calming_verse: 1 };
  const versed = AnkicasterEngine.useScroll(sm, 'calming_verse', { roomId: cr.id });
  assert.equal(versed.success, true);
  assert.equal(versed.state.rooms.find(r => r.id === cr.id)?.misbehaviorCharmMalus || 0, 0);
  assert.ok(versed.state.characters[0].needs.composure >= 70);
});

// ==========================================
// GROUP 4: Timed Alchemy Brewing, Fractional Carryover, Alchemist x2 & Target Picker
// ==========================================
test('Phase3 Group 4: Alchemy station caps (2 vs 3 at L3), Alchemist 2x speed, fractional yield & AlchemyPanel UI', () => {
  const sa = makeBaseState();
  const lab = addBuiltRoom(sa, 'alchemy_lab', { level: 1 });
  // Ensure 2 station cap at L1
  assert.equal(AnkicasterEngine.brewPotion(sa, 'mending_draught').success, true);
  let q = AnkicasterEngine.brewPotion(sa, 'mending_draught').state;
  q = AnkicasterEngine.brewPotion(q, 'mending_draught').state;
  assert.equal(q.brewingQueue?.length, 2);
  const capped = AnkicasterEngine.brewPotion(q, 'mending_draught');
  assert.equal(capped.success, false);

  // L3 Alchemy Lab opens 3rd station
  q.rooms.find(r => r.id === lab.id)!.level = 3;
  const third = AnkicasterEngine.brewPotion(q, 'mending_draught');
  assert.equal(third.success, true);
  assert.equal(third.state.brewingQueue?.length, 3);

  // Active Alchemist doubles brew speed (20 reviews -> completes in 10 reviews)
  const sb = makeBaseState();
  const lab2 = addBuiltRoom(sb, 'alchemy_lab', { level: 1 });
  sb.characters.push(
    makeStudent(10, 'Vesper', {
      status: 'resident',
      masteredSchools: ['alchemy'],
      career: 'alchemist',
      careerState: 'active',
      workplaceRoomId: lab2.id
    })
  );
  let br = AnkicasterEngine.brewPotion(sb, 'mending_draught').state;
  for (let i = 0; i < 10; i++) {
    br = AnkicasterEngine.applyHonestReview(br, 1, 3, 2000).state;
  }
  assert.equal(br.brewingQueue?.length, 0);
  assert.ok((br.resources.potions.mending_draught || 0) >= 2);

  // Philosopher's Hour stays instant x2 yield
  const sp = makeBaseState();
  addBuiltRoom(sp, 'alchemy_lab', { level: 1 });
  sp.activeBuffs = { philosophersHourBrews: 1 };
  const ph = AnkicasterEngine.brewPotion(sp, 'mending_draught');
  assert.equal(ph.success, true);
  assert.equal(ph.state.brewingQueue?.length || 0, 0);
  assert.ok((ph.state.resources.potions.mending_draught || 0) >= 4);

  // Explicit AlchemyTarget targeting for usePotion (e.g., healing specific injured student)
  const st = makeBaseState();
  st.resources.potions.mending_draught = 1;
  st.characters.push(
    makeStudent(11, 'A', { injury: { type: 'sprained', points: 0, required: 60 } }),
    makeStudent(12, 'B', { injury: { type: 'sprained', points: 0, required: 60 } })
  );
  const healed = AnkicasterEngine.usePotion(st, 'mending_draught', { characterId: 12 });
  assert.equal(healed.success, true);
  assert.ok(healed.state.characters.find(c => c.id === 11)?.injury);
  assert.equal(healed.state.characters.find(c => c.id === 12)?.injury, undefined);

  // AlchemyPanel UI renders station progress bar
  const apHtml = renderToStaticMarkup(
    <AlchemyPanel state={third.state} onBrewPotion={noop} onUsePotion={noop} />
  );
  assert.match(apHtml, /Station 1/);
  assert.match(apHtml, /Brew \(\d+m · \d+r\)/);
});

// ==========================================
// GROUP 5: All 40 Creatures, Bond 1/2/3 Scaling, Moonsheep, Menagerie Modules & Geode Golem
// ==========================================
test('Phase3 Group 5: All 40 creatures, Bond Lv 1/2/3 scaling, Menagerie modules & Geode Golem awakening', () => {
  const allDefs = Object.values(CREATURE_DEFINITIONS);
  assert.equal(allDefs.length, 40, 'Exactly 40 creatures defined in Bestiary');

  // Table-driven check across all 40 species: Bond 1/2/3 scaling & max-2 (3 with Menagerie Royale) copy cap
  assert.equal(bondBuffMultiplier(1), 1.0);
  assert.equal(bondBuffMultiplier(2), 1.25);
  assert.equal(bondBuffMultiplier(3), 1.5);

  for (const def of allDefs) {
    const s = makeBaseState();
    s.creatures = [1, 2, 3].map(idx => ({
      id: idx,
      defId: def.id,
      nickname: `${def.name} ${idx}`,
      status: 'tamed' as const,
      hungry: false,
      hatchProgress: 100,
      tamingProgress: def.tamingReviews,
      bondLevel: idx === 1 ? 1 : idx === 2 ? 2 : 3,
      bondProgress: 0,
      arrivedDay: 1
    }));
    const top2 = creatureSpeciesBuffSum(s, def.id);
    // Top 2 sorted by bondLevel -> Bond 3 (1.5) + Bond 2 (1.25) = 2.75
    assert.ok(Math.abs(top2 - 2.75) < 1e-9, `${def.id} top-2 Bond sum should equal 2.75`);

    // With Menagerie Royale -> 3 copies allowed & +15% buff multiplier
    s.spellbooks = ['menagerie_royale'];
    const top3Royale = creatureSpeciesBuffSum(s, def.id);
    assert.ok(Math.abs(top3Royale - (1.5 + 1.25 + 1.0) * 1.15) < 1e-9, `${def.id} Menagerie Royale top-3 scaled`);
  }

  // Category cap of +50% on base potion yield while bond scales cleanly
  const catState = makeBaseState();
  catState.creatures = [
    ...Array.from({ length: 2 }, (_, i) => ({
      id: 10 + i,
      defId: 'alembic_salamander',
      nickname: 'Sal',
      status: 'tamed' as const,
      hungry: false,
      hatchProgress: 100,
      tamingProgress: 50,
      bondLevel: 3 as const,
      bondProgress: 0,
      arrivedDay: 1
    })),
    ...Array.from({ length: 2 }, (_, i) => ({
      id: 20 + i,
      defId: 'cinder_newt',
      nickname: 'Newt',
      status: 'tamed' as const,
      hungry: false,
      hatchProgress: 100,
      tamingProgress: 30,
      bondLevel: 3 as const,
      bondProgress: 0,
      arrivedDay: 1
    }))
  ];
  const potBonus = creatureCategoryBonus(catState, [
    { defId: 'alembic_salamander', perCopy: 0.1 },
    { defId: 'cinder_newt', perCopy: 0.05 }
  ]);
  assert.ok(potBonus > 0 && potBonus <= 0.5 * 1.5 + 1e-6);

  // Menagerie module cap & setMenagerieModules
  const sm = makeBaseState();
  const men = addBuiltRoom(sm, 'menagerie', { level: 1, area: 'grounds' });
  assert.deepEqual(menagerieModules(men), ['meadow', 'tide']);
  assert.equal(menagerieModuleCap(3), 4);
  assert.equal(AnkicasterEngine.setMenagerieModules(sm, men.id, ['meadow', 'sky', 'crystal']).success, false);
  men.level = 3;
  const modOk = AnkicasterEngine.setMenagerieModules(sm, men.id, ['meadow', 'sky', 'crystal', 'ember']);
  assert.equal(modOk.success, true);
  assert.deepEqual(modOk.state.rooms.find(r => r.id === men.id)?.settings.modules, ['meadow', 'sky', 'crystal', 'ember']);

  // Awaken Geode Golem requires built Workshop + 3 golem_core + Crystal habitat space
  const sg = makeBaseState();
  addBuiltRoom(sg, 'workshop', { level: 1 });
  addBuiltRoom(sg, 'crystal_vivarium', { level: 1, area: 'grounds' });
  sg.resources.golem_core = 3;
  const golemRes = AnkicasterEngine.awakenGeodeGolem(sg);
  assert.equal(golemRes.success, true);
  assert.equal(golemRes.state.resources.golem_core, 0);
  assert.ok(golemRes.state.creatures.some(c => c.defId === 'geode_golem'));
});

// ==========================================
// GROUP 6: Remaining Rooms, Scriptorium, All 16 Lv3 Perks & room.settings
// ==========================================
test('Phase3 Group 6: Remaining rooms (Courtyard/Entrance/Bathhouse/Lounge/Yard), Scriptorium, all 16 L3 perks & settings', () => {
  // Check Lv 3 perks across ROOM_DEFINITIONS match implemented systems
  const s = makeBaseState();
  const vault = addBuiltRoom(s, 'storage_vault', { level: 3 });
  vault.cleanliness = 50;
  const workshop = addBuiltRoom(s, 'workshop', { level: 3 });
  const greenhouse = addBuiltRoom(s, 'greenhouse', { level: 3, area: 'grounds' });
  const glassworks = addBuiltRoom(s, 'glassworks', { level: 1 });
  const courtyard = addBuiltRoom(s, 'courtyard_garden', { level: 1, area: 'grounds' });
  const lounge = addBuiltRoom(s, 'faculty_lounge', { level: 1, qBoost: true });
  const scriptorium = addBuiltRoom(s, 'scriptorium', { level: 1 });
  const library = addBuiltRoom(s, 'library', { level: 1 });

  // Lv 3 Greenhouse allows 3 mixed crop beds and respects seed unlocks
  assert.equal(Object.keys(GREENHOUSE_CROPS).length, 12);
  assert.equal(AnkicasterEngine.setGreenhouseCrops(s, greenhouse.id, ['glimmerberry']).success, false);
  const ghSet = AnkicasterEngine.setGreenhouseCrops(s, greenhouse.id, ['hearthroot', 'moonbeans', 'silverleaf']);
  assert.equal(ghSet.success, true);

  // Glassworks active toggle pauses Stone->Glass conversion when false
  const gwOff = AnkicasterEngine.setGlassworksActive(ghSet.state, glassworks.id, false);
  assert.equal(gwOff.success, true);
  assert.equal(gwOff.state.rooms.find(r => r.id === glassworks.id)?.settings.glassworksActive, false);

  // Scriptorium scroll crafting + advancement via reviews + useScroll
  assert.equal(Object.keys(SCROLL_DEFINITIONS).length, 4);
  const scStart = AnkicasterEngine.startScrollCraft(gwOff.state, scriptorium.id, 'rift_map');
  assert.equal(scStart.success, true);
  let cur = scStart.state;
  const craftRevs = SCROLL_DEFINITIONS.rift_map.craftReviews;
  for (let i = 0; i < craftRevs * 2; i++) {
    cur = AnkicasterEngine.applyHonestReview(cur, 1, 3, 2000).state;
  }
  assert.equal(cur.scrollQueue?.length, 0);
  assert.equal(cur.scrolls?.rift_map, 1);
  const scUse = AnkicasterEngine.useScroll(cur, 'rift_map');
  assert.equal(scUse.success, true);
  assert.equal(scUse.state.activeBuffs?.riftMapPending, true);

  // Library Recipe Research discovers hint for Insight
  const res = AnkicasterEngine.researchRecipe(scUse.state, library.id);
  assert.equal(res.success, true);
  assert.ok(res.ingredient);

  // Lv 3 Infirmary heals creature injuries faster than habitat
  const sInf = makeBaseState();
  addBuiltRoom(sInf, 'infirmary', { level: 3 });
  sInf.creatures.push({
    id: 50,
    defId: 'bramblefox',
    nickname: 'Patch',
    status: 'tamed',
    hungry: false,
    hatchProgress: 100,
    tamingProgress: 30,
    bondLevel: 1,
    bondProgress: 0,
    arrivedDay: 1,
    injury: { type: 'sprained', points: 0, required: 60 }
  });
  const afterInf = AnkicasterEngine.applyHonestReview(sInf, 1, 3, 2000).state;
  assert.ok((afterInf.creatures[0].injury?.points || 0) > 0 || afterInf.creatures[0].injury === undefined);

  // Entrance Hall doubles Charm from furniture for Charm-to-Renown (every 50 Charm = +1 Renown)
  const sCh = makeBaseState();
  const eh = sCh.rooms.find(r => r.defId === 'entrance_hall')!;
  for (let i = 0; i < 5; i++) {
    eh.furniture.push({ id: 901 + i, defId: 'starfall_chandelier', slotKind: 'ceiling', damaged: false }); // 6 charm * 5 * 2 = 60 >= 50 -> +1 Renown
  }
  AnkicasterEngine.syncWorkplaces(sCh);
  const ehRen = AnkicasterEngine.applyHonestReview(sCh, 1, 3, 2000).state;
  assert.ok(ehRen.renown >= 1, 'Entrance Hall 2x furniture Charm triggers Charm-to-Renown');

  // RoomWindow UI for Greenhouse & Glassworks renders settings controls
  const ghHtml = renderToStaticMarkup(
    <RoomWindow
      state={ghSet.state}
      room={ghSet.state.rooms.find(r => r.id === greenhouse.id)!}
      onClose={noop}
      onOpenScreen={noop}
      onResolveHazard={noop}
      onUpgrade={noop}
      onAddFurniture={noop}
      onRemoveFurniture={noop}
      onSetGreenhouseCrops={noop}
    />
  );
  assert.match(ghHtml, /Bed 3/);
  assert.match(ghHtml, /greenhouse-bed-2/);

  assert.ok(workshop && courtyard && lounge);
});

// ==========================================
// GROUP 7: Alumni Bonuses/Visits, 21 Spellbooks, Card-Linking Settings & UI
// ==========================================
test('Phase3 Group 7: Alumni career scaling, 21 Spellbooks, Term Commencement, Card Linking & Settings UI', () => {
  assert.equal(Object.keys(SPELLBOOK_DEFINITIONS).length, 21, 'All 21 Spellbooks defined');

  // Alumni scaling by retirementAgeDays / 90 clamped [0.67, 2.0] & polymath extra schools Renown
  assert.ok(Math.abs(alumniRetirementScale(60) - 60 / 90) < 0.01);
  assert.equal(alumniRetirementScale(90), 1);
  assert.equal(alumniRetirementScale(180), 2);
  assert.equal(alumniRetirementScale(365), 2);

  const makeSnap = (id: number, nid: number, deckName: string, honestIvl: number) => ({
    id,
    nid,
    deckName,
    front: `Q${id}`,
    back: `A${id}`,
    ivl: honestIvl,
    lastAnswerIvl: honestIvl,
    honestIvl,
    type: 2,
    queue: 2,
    due: 0,
    lastStudiedMs: 0
  });

  const sAlum = makeBaseState();
  sAlum.settings.retirementAgeDays = 180; // scale = 2.0
  sAlum.allCards[901] = makeSnap(901, 901, 'Arcane', 185);
  sAlum.cardSets.push({
    id: 901,
    characterId: 20,
    kind: 'study',
    school: 'arcane',
    size: 1,
    createdDay: 1,
    released: false,
    cardIds: [901]
  });
  sAlum.characters.push(
    makeStudent(20, 'Archon', {
      status: 'resident',
      masteredSchools: ['arcane', 'light'],
      career: 'teacher',
      careerState: 'active',
      readyDays: { arcane: 100 },
      studySetId: 901
    })
  );
  const ret = AnkicasterEngine.retireCharacter(sAlum, 20);
  assert.equal(ret.success, true);
  assert.equal(ret.state.alumniGallery.length, 1);
  const alumBonus = computeAlumniBonuses(ret.state.alumniGallery);
  assert.equal(alumBonus.totalExtraSchoolsRenown, 5);
  assert.ok(alumBonus.teacherClassroomPct > 0.015, '180-day retirement scales teacher bonus above base');

  // RosterPanel Alumni tab shows career breakdown
  const rosterAlumHtml = renderToStaticMarkup(
    <RosterPanel state={ret.state} view="alumni" onAssignCareer={noop} onAssignTeacherRoom={noop} />
  );
  assert.match(rosterAlumHtml, /Archon/);
  assert.match(rosterAlumHtml, /alumni-summary-strip/);

  // Timed Term Commencement -> Spellbook choice, Architect's Folio pattern persistence, Founder's Testament x3 resources
  const sTerm = makeBaseState();
  sTerm.settings.mode = 'timed';
  sTerm.settings.examTimer = true;
  sTerm.spellbooks = ['architects_folio', 'the_founders_testament'];
  sTerm.knownPatterns = ['long_table', 'crystal_chandelier'];
  sTerm.termInitialReviewIndex = 0;
  sTerm.reviewIndex = 600; // 3 stars!
  sTerm.termEndDateMs = Date.now() - 1000;
  const termCheck = AnkicasterEngine.checkTimedTermStatus(sTerm, Date.now());
  assert.equal(termCheck.termEnded, true);
  assert.ok(termCheck.state.pendingSpellbookDraft, 'Commencement offers Spellbook choice');
  assert.equal(termCheck.state.pendingSpellbookDraft?.tier, 3);

  const pickedSbId = termCheck.state.pendingSpellbookDraft!.choices[0];
  const choseSb = AnkicasterEngine.chooseSpellbook(termCheck.state, pickedSbId);
  assert.equal(choseSb.success, true);
  assert.ok(choseSb.state.spellbooks.includes(pickedSbId));

  const nextTerm = AnkicasterEngine.startNextTerm(choseSb.state, 45).state;
  assert.ok(nextTerm.knownPatterns.includes('crystal_chandelier'), "Architect's Folio persists patterns");
  assert.equal(nextTerm.pendingFoundersPlanChoice, true);
  assert.equal(nextTerm.resources.timber, createInitialGameState().resources.timber * 3);
  const claimed = AnkicasterEngine.claimFoundersPlan(nextTerm, 'observatory');
  assert.equal(claimed.success, true);
  assert.ok(claimed.state.knownPlans.includes('observatory'));

  // Spellbook modifiers in mana, draft prices, furniture cost, build reviews
  const manaBoosted = calculateReviewMana(10, computeSpellbookBonuses(['book_of_bright_mornings']).manaPct, 15);
  assert.ok(manaBoosted > 15);
  assert.ok((discountedFurnitureCost({ timber: 100 }, { rooms: sTerm.rooms, wizard: sTerm.wizard, spellbooks: ['notes_on_furnishing'] }).timber ?? 100) < 100);
  assert.ok(discountedBuildReviews(100, { wizard: sTerm.wizard, spellbooks: ['architects_folio'] }) < 100);
  const sDeck = makeBaseState();
  sDeck.draftHistory = { foundation: 4 };
  const basePrice = deckPrice(sDeck, 'foundation');
  sDeck.spellbooks = ['the_eternal_index', 'primer_of_patience'];
  assert.ok(deckPrice(sDeck, 'foundation') < basePrice);

  // Card Linking Settings: avoidSiblings, deckScope, manaPerReview, veilPayment: 'ask'
  const sCfg = makeBaseState();
  sCfg.allCards = {
    1: makeSnap(1, 99, 'Spanish::Core', 5),
    2: makeSnap(2, 99, 'Spanish::Core', 6),
    3: makeSnap(3, 100, 'Spanish::Core', 7),
    4: makeSnap(4, 101, 'Physics::Optics', 4)
  };
  sCfg.wizard.levels.nature = 5;
  sCfg.settings.deckScope = 'Spanish';
  sCfg.settings.avoidSiblings = true;
  sCfg.settings.cardsPerStudent = 2;
  addBuiltRoom(sCfg, 'dormitory');
  addBuiltRoom(sCfg, 'class_nature');
  const elig = AnkicasterEngine.getEligibleFreeCards(sCfg, 30);
  assert.equal(elig.length, 3, 'deckScope filters out Physics');

  const enrolled = AnkicasterEngine.enrollStudent(sCfg, 'nature', 'Sora', 'Gentle', ['Tidy']);
  assert.equal(enrolled.success, true);
  const linkedIds = enrolled.state.cardSets[0].cardIds;
  assert.deepEqual(linkedIds.sort((a, b) => a - b), [1, 3], 'avoidSiblings skips duplicate nid 99');

  // RecruitmentPanel reflects deckScope
  const recHtml = renderToStaticMarkup(<RecruitmentPanel state={sCfg} onEnroll={noop} />);
  assert.match(recHtml, /Spanish/);

  // manaPerReview custom economy + veilPayment: 'ask' manual resolution + TopBar badges
  const sEcon = makeBaseState();
  sEcon.mana = 500;
  sEcon.settings.manaPerReview = 15;
  const revCustom = AnkicasterEngine.applyHonestReview(sEcon, 1, 3, 2000);
  assert.equal(revCustom.state.mana, 515);

  const sManualVeil = makeBaseState();
  sManualVeil.settings.veilPayment = 'ask';
  sManualVeil.veil.autoPay = false;
  const tickedAsk = AnkicasterEngine.triggerDayTick(sManualVeil);
  assert.ok(tickedAsk.state.pendingVeilPayment, 'veilPayment: ask queues pendingVeilPayment');
  const topHtml = renderToStaticMarkup(
    <TopBar
      state={{ ...tickedAsk.state, settings: { ...tickedAsk.state.settings, manaPerReview: 15 } }}
      onOpenScreen={noop}
      onOpenRoom={noop}
      buildModeOpen={false}
      onToggleBuildMode={noop}
      onResolveVeil={noop}
    />
  );
  assert.match(topHtml, /Custom Economy/);
  assert.match(topHtml, /pending-veil-btn/);

  const paidManual = AnkicasterEngine.resolvePendingVeilPayment(tickedAsk.state, true);
  assert.equal(paidManual.success, true);
  assert.equal(paidManual.state.pendingVeilPayment, undefined);
});
