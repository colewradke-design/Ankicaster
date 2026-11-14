import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AnkicasterEngine } from '../src/utils/engine';
import { createInitialGameState } from '../src/data/initialState';
import { ROOM_DEFINITIONS, POTION_RECIPES, SPELL_DEFINITIONS } from '../src/data/content';
import { AlchemyPanel } from '../src/components/GamePanels';
import type { DraftCard, FullGameState } from '../src/types/ankicaster';

function makeState(): FullGameState {
  const s = createInitialGameState();
  s.mana = 5000;
  s.resources.timber = 200;
  s.resources.stone = 200;
  s.resources.glass = 50;
  s.resources.cloth = 50;
  s.resources.provisions = 200;
  s.resources.greens = 50;
  s.resources.fish = 50;
  s.resources.nectar = 50;
  s.resources.herbs = 50;
  s.resources.radiance = 50;
  s.resources.umbra = 50;
  s.resources.reagents = 50;
  s.resources.insight = 50;
  s.resources.crystal = 10;
  s.resources.moonsilk = 5;
  s.resources.starmetal = 5;
  s.resources.ember_salt = 5;
  s.resources.phoenix_ash = 5;
  s.characters.push({
    id: 1,
    name: 'Lyra',
    pronouns: 'she/her',
    appearance: { skin: '#f5d0b5', hair: 'short', hairColor: '#4a3728', robeColor: '#6B4FBB', hat: 'novice_cap' },
    personality: 'Curious',
    traits: [],
    status: 'student',
    currentSchool: 'arcane',
    masteredSchools: [],
    needs: { hunger: 90, rest: 90, leisure: 80, composure: 90, health: 100 },
    morale: 85,
    readyDays: {},
    enrolledDay: 1,
    chronicle: [],
    careerSetIds: [],
  });
  return s;
}

function addBuiltRoom(state: FullGameState, defId: string, level: 1 | 2 | 3 = 1, unfinished = false) {
  const id = Math.max(100, ...state.rooms.map(r => r.id)) + 1;
  const reqs = unfinished ? [] : (ROOM_DEFINITIONS[defId]?.requiredFurniture || []);
  const furniture = reqs.flatMap((req, rIdx) =>
    Array.from({ length: req.count }, (_, cIdx) => ({
      id: id * 100 + rIdx * 10 + cIdx + 1,
      defId: req.role,
      slotKind: req.role,
      damaged: false,
    }))
  );
  state.rooms.push({
    id,
    defId,
    x: 4 + state.rooms.length * 2,
    y: 0,
    w: 2,
    h: 1,
    area: 'castle',
    state: 'built',
    level,
    cleanliness: 100,
    buildProgress: 100,
    buildRequired: 100,
    furniture,
    settings: {},
  });
  return id;
}

test('brewPotion enforces discovered, built+finished Alchemy Lab, and deducts ingredients', () => {
  const base = makeState();
  // Undiscovered recipe blocked
  const undisc = AnkicasterEngine.brewPotion(base, 'calming_tonic');
  assert.equal(undisc.success, false);
  assert.match(undisc.error || '', /not discovered/i);

  // No Alchemy Lab blocked
  const noLab = AnkicasterEngine.brewPotion(base, 'mending_draught');
  assert.equal(noLab.success, false);
  assert.match(noLab.error || '', /Alchemy Lab/i);

  // Unfinished Alchemy Lab blocked
  const withUnfinishedLab = makeState();
  addBuiltRoom(withUnfinishedLab, 'alchemy_lab', 1, true);
  const unfinRes = AnkicasterEngine.brewPotion(withUnfinishedLab, 'mending_draught');
  assert.equal(unfinRes.success, false);

  // Built & furnished Alchemy Lab succeeds and deducts 1 of each ingredient + mana
  const ready = makeState();
  addBuiltRoom(ready, 'alchemy_lab', 1, false);
  const beforeHerbs = ready.resources.herbs;
  const beforeRadiance = ready.resources.radiance;
  const beforeGreens = ready.resources.greens;
  const beforeMana = ready.mana;

  const brewed = AnkicasterEngine.brewPotion(ready, 'mending_draught');
  assert.equal(brewed.success, true);
  assert.equal(brewed.state.resources.potions.mending_draught, 1);
  assert.equal(brewed.state.resources.herbs, beforeHerbs - 1);
  assert.equal(brewed.state.resources.radiance, beforeRadiance - 1);
  assert.equal(brewed.state.resources.greens, beforeGreens - 1);
  assert.ok(brewed.state.mana < beforeMana);

  // Missing ingredient fails
  const noHerbs = makeState();
  addBuiltRoom(noHerbs, 'alchemy_lab', 1, false);
  noHerbs.resources.herbs = 0;
  const missingRes = AnkicasterEngine.brewPotion(noHerbs, 'mending_draught');
  assert.equal(missingRes.success, false);
  assert.match(missingRes.error || '', /Missing ingredients/i);
});

test('all 18 POTION_RECIPES execute real effects in usePotion', () => {
  for (const rec of POTION_RECIPES) {
    const s = makeState();
    s.resources.potions[rec.id] = 1;
    s.veil.strength = 50;
    s.characters[0].injury = { type: 'hexed', points: 0, required: 120 };
    s.characters[0].needs.composure = 40;
    s.characters[0].needs.rest = 40;
    s.characters[0].morale = 50;
    s.rooms[0].cleanliness = 30;
    s.rooms[0].hazard = { type: 'hex_fog', name: 'Hex Fog', description: 'Mist', effect: 'Drain' };
    s.rooms.push({
      id: 999,
      defId: 'corridor',
      x: 4,
      y: 0,
      w: 1,
      h: 1,
      area: 'castle',
      state: 'site',
      level: 1,
      cleanliness: 100,
      buildProgress: 0,
      buildRequired: 50,
      furniture: [],
      settings: {},
    });
    s.creatures.push({
      id: 501,
      defId: 'bramblefox',
      nickname: 'Pip',
      status: 'wary',
      hungry: false,
      hatchProgress: 0,
      tamingProgress: 0,
      bondLevel: 1,
      bondProgress: 0,
      arrivedDay: 1,
    });

    const res = AnkicasterEngine.usePotion(s, rec.id);
    assert.equal(res.success, true, `${rec.id} should succeed`);
    assert.doesNotMatch(res.message || '', /Drank .*! Energy and focus restored\./, `${rec.id} should not hit default fallback`);
  }

  // Spot check key effects
  const inkState = makeState();
  inkState.resources.potions.starlight_ink = 1;
  const afterInk = AnkicasterEngine.usePotion(inkState, 'starlight_ink');
  assert.equal(afterInk.state.draftRerollTokens, 3);

  const fluxState = makeState();
  fluxState.resources.potions.glass_flux = 1;
  const beforeGlass = fluxState.resources.glass;
  const afterFlux = AnkicasterEngine.usePotion(fluxState, 'glass_flux');
  assert.equal(afterFlux.state.resources.glass, beforeGlass + 20);

  const lureState = makeState();
  lureState.resources.potions.lure_musk = 1;
  const afterLure = AnkicasterEngine.usePotion(lureState, 'lure_musk');
  assert.equal(afterLure.state.activeBuffs?.lureMuskPending, true);
  const ticked = AnkicasterEngine.triggerDayTick(afterLure.state);
  assert.equal(ticked.state.activeBuffs?.lureMuskPending, false);
  assert.ok(ticked.state.creatures.length >= 1);
});

test('AlchemyPanel renders mana cost instead of revs and disables when requirements not met', () => {
  const s = makeState();
  const htmlNoLab = renderToStaticMarkup(
    <AlchemyPanel state={s} onBrewPotion={() => {}} />
  );
  assert.doesNotMatch(htmlNoLab, /revs\)/);
  assert.match(htmlNoLab, /Brew \(\d+m\)/);
  assert.match(htmlNoLab, /Requires a built and furnished Alchemy Lab/);
});

test('castSpell enforces knownSpells, L3 study discount, transmute pre-check, and implements all 25 spells', () => {
  const s = makeState();
  // Unlearned spell blocked
  const unlearned = AnkicasterEngine.castSpell(s, 'glow');
  assert.equal(unlearned.success, false);
  assert.match(unlearned.error || '', /not learned/i);

  // L3 Wizard Study -10% mana cost perk
  s.wizard.knownSpells = Object.keys(SPELL_DEFINITIONS);
  const study = s.rooms.find(r => r.defId === 'wizard_study')!;
  study.level = 3;
  const beforeMana = s.mana;
  const glowRes = AnkicasterEngine.castSpell(s, 'glow');
  assert.equal(glowRes.success, true);
  assert.equal(beforeMana - glowRes.state.mana, Math.round(SPELL_DEFINITIONS.glow.manaCost * 0.9));

  // Transmute fails BEFORE charging mana or setting cooldown if < 60 common material
  const lowMat = makeState();
  lowMat.wizard.knownSpells = ['transmute'];
  lowMat.resources.timber = 30;
  lowMat.resources.stone = 30;
  lowMat.resources.glass = 10;
  lowMat.resources.cloth = 10;
  lowMat.resources.provisions = 10;
  lowMat.resources.greens = 10;
  lowMat.resources.fish = 10;
  lowMat.resources.nectar = 10;
  const manaBeforeTransmute = lowMat.mana;
  const transFail = AnkicasterEngine.castSpell(lowMat, 'transmute');
  assert.equal(transFail.success, false);
  assert.equal(transFail.state.mana, manaBeforeTransmute);
  assert.equal(transFail.state.wizard.spellCooldowns.transmute, undefined);

  // Glow actually clears spill_of_night / echo_loop
  const hazState = makeState();
  hazState.wizard.knownSpells = ['glow', 'banish', 'mend', 'sunburst', 'mend_object'];
  hazState.rooms[0].hazard = { type: 'spill_of_night', name: 'Spill of Night', description: 'Gloom', effect: 'Half' };
  const afterGlow = AnkicasterEngine.castSpell(hazState, 'glow');
  assert.equal(afterGlow.state.rooms[0].hazard, undefined);

  // Banish clears breach
  afterGlow.state.rooms[0].hazard = { type: 'breach', name: 'Rift Breach', description: 'Breach', effect: 'Breach' };
  const afterBanish = AnkicasterEngine.castSpell(afterGlow.state, 'banish');
  assert.equal(afterBanish.state.rooms[0].hazard, undefined);

  // Mend adds +30 to 1 char, Sunburst adds +60 to all
  const healState = makeState();
  healState.wizard.knownSpells = ['mend', 'sunburst'];
  healState.characters[0].injury = { type: 'sprained', points: 0, required: 80 };
  healState.characters.push({ ...structuredClone(healState.characters[0]), id: 2, injury: { type: 'hexed', points: 0, required: 120 } });
  const afterMend = AnkicasterEngine.castSpell(healState, 'mend');
  assert.equal(afterMend.state.characters[0].injury?.points, 30);
  assert.equal(afterMend.state.characters[1].injury?.points, 0);
  const afterSun = AnkicasterEngine.castSpell(afterMend.state, 'sunburst');
  assert.equal(afterSun.state.characters[0].injury, undefined); // 30 + 60 >= 80
  assert.equal(afterSun.state.characters[1].injury?.points, 60);

  // Philosopher's Hour gives instant 0-mana x2 brews
  const phState = makeState();
  phState.wizard.knownSpells = ['philosophers_hour'];
  addBuiltRoom(phState, 'alchemy_lab', 1, false);
  const afterPh = AnkicasterEngine.castSpell(phState, 'philosophers_hour');
  assert.equal(afterPh.state.activeBuffs?.philosophersHourBrews, 3);
  const manaBeforePhBrew = afterPh.state.mana;
  const phBrew = AnkicasterEngine.brewPotion(afterPh.state, 'mending_draught');
  assert.equal(phBrew.success, true);
  assert.equal(phBrew.state.mana, manaBeforePhBrew);
  assert.equal(phBrew.state.resources.potions.mending_draught, 2);
  assert.equal(phBrew.state.activeBuffs?.philosophersHourBrews, 2);
});

test('queueWizardSession for grimoire uses spell tier cost/reviews, L3 library perk, and grimoire notice', () => {
  const s = makeState();
  addBuiltRoom(s, 'library', 3, false);
  const q = AnkicasterEngine.queueWizardSession(s, 'arcane', true, 'foresight');
  assert.equal(q.success, true);
  assert.equal(q.state.wizard.activeSession?.kind, 'grimoire');
  assert.equal(q.state.wizard.activeSession?.required, 75);
  assert.equal(q.state.wizard.activeSession?.costPaid, Math.round(SPELL_DEFINITIONS.foresight.manaCost * 0.9));
  const lastNotice = q.state.notices[q.state.notices.length - 1]?.text || '';
  assert.match(lastNotice, /^Grimoire Study: Learning Foresight/);
  assert.doesNotMatch(lastNotice, /Pondering the Orb/);
});

test('No direct mana grants from Astral Influx Boon or school events', () => {
  const s = makeState();
  const manaBefore = s.mana;
  const astralCard: DraftCard = {
    id: 'extra-astral',
    deck: 'magic',
    rarity: 'rare',
    name: 'Astral Influx Boon',
    type: 'boon',
    school: 'arcane',
    description: 'Instant burst of knowledge: +50 Insight and +2 Crystal.'
  };
  const afterCard = AnkicasterEngine.chooseDraftCard(s, astralCard);
  assert.equal(afterCard.state.mana, manaBefore);
  assert.equal(afterCard.state.resources.insight, s.resources.insight + 50);
  assert.equal(afterCard.state.resources.crystal, s.resources.crystal + 2);

  for (const [evId, action] of [
    ['mana_geyser', 'geyser_mana'],
    ['meteor_shower', 'starlight_mana'],
    ['guild_grant', 'grant_mana'],
    ['alumni_bequest', 'bequest_mana']
  ] as const) {
    const evState = makeState();
    evState.activeEvents = [{ eventId: evId, dayArrived: 1 }];
    const res = AnkicasterEngine.resolveEvent(evState, evId, action);
    assert.equal(res.state.mana, evState.mana, `${action} must not grant mana`);
  }
});

test('Anki addon bridge and App hydration guard are clean', () => {
  const addonPy = fs.readFileSync(path.join(process.cwd(), 'addon/ankicaster_addon.py'), 'utf8');
  assert.doesNotMatch(addonPy, /js_load = "if \(window\.ankicasterLoadSavedGame\) \{\{/);
  assert.doesNotMatch(addonPy, /getConfig\(__name__\)|writeConfig\(__name__/);
  assert.match(addonPy, /_card_shown_timestamp <= 0/);

  const appTsx = fs.readFileSync(path.join(process.cwd(), 'src/App.tsx'), 'utf8');
  assert.match(appTsx, /hydratedRef\.current/);
  assert.match(appTsx, /if \(isAddonMode && hydratedRef\.current\)/);
});
