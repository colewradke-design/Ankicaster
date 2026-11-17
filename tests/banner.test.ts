/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import test from 'node:test';
import assert from 'node:assert/strict';
import { createNewAcademy } from '../src/visual/onboarding/freshStart';
import { AnkicasterEngine } from '../src/utils/engine';
import {
  bannerSummary,
  createBannerThrottle,
  buildChip,
  savedWithBanner,
  serviceChip,
  serviceQueueTitle,
  truncateLabel
} from '../src/utils/banner';
import { computeConstructionPlan, reviewsToGo } from '../src/utils/construction';
import { ROOM_DEFINITIONS, SPELL_DEFINITIONS } from '../src/data/content';
import type { PlacedRoom } from '../src/types/ankicaster';

function addSite(defId: string, id: number, buildProgress = 0): PlacedRoom {
  const def = ROOM_DEFINITIONS[defId];
  return {
    id,
    defId,
    x: 0,
    y: 1,
    w: def.size[0],
    h: def.size[1],
    area: def.area,
    level: 1,
    state: 'site',
    buildRequired: def.buildReviews,
    buildProgress,
    buildOrder: id,
    cleanliness: 100,
    settings: {},
    furniture: []
  };
}

test('empty academy banner has no build and no service', () => {
  const summary = bannerSummary(createNewAcademy());
  assert.equal(summary.v, 1);
  assert.equal(summary.build, undefined);
  assert.equal(summary.service, undefined);
  assert.equal(summary.buildCount, 0);
  assert.equal(summary.serviceCount, 0);
  assert.equal(summary.mana, 0);
  assert.equal(summary.manaEach, 10);
});

test('one site plus a queued orb matches the queue panel names and reviews left', () => {
  let state = createNewAcademy();
  state.mana = 500;
  state.rooms = [...state.rooms, addSite('dormitory', 880)];
  const queued = AnkicasterEngine.queueWizardSession(state, 'arcane');
  assert.equal(queued.success, true, queued.error);
  state = queued.state;

  const summary = bannerSummary(state);
  const site = state.rooms.find(r => r.state === 'site' && r.defId === 'dormitory')!;
  const plan = computeConstructionPlan(state).find(job => job.roomId === site.id);
  assert.ok(plan, 'the wizard is on the crew by default');
  assert.equal(summary.build?.name, ROOM_DEFINITIONS.dormitory.name);
  assert.equal(summary.build?.reviewsLeft, reviewsToGo(site, 0, plan!.rate));
  assert.equal(summary.build?.paused, undefined);

  const session = state.wizard.activeSession!;
  assert.equal(summary.service?.name, serviceQueueTitle(session));
  assert.equal(summary.service?.name, 'Arcane Orb · Lv 1');
  assert.equal(summary.service?.reviewsLeft, Math.max(0, Math.ceil(session.required - (session.progress || 0))));
  assert.equal(summary.buildCount, 1);
  assert.equal(summary.serviceCount, 1);
});

test('a paused site is reported as paused and a crewless site waits', () => {
  const state = createNewAcademy();
  state.rooms = [...state.rooms, addSite('dormitory', 881)];
  const site = state.rooms.find(r => r.id === 881)!;
  const paused = AnkicasterEngine.setConstructionPaused(state, site.id, true);
  assert.equal(paused.success, true, paused.error);
  const pausedSummary = bannerSummary(paused.state);
  assert.equal(pausedSummary.build?.name, 'Dormitory');
  assert.equal(pausedSummary.build?.paused, true);

  state.wizard.workshopAssigned = false;
  const waiting = bannerSummary(state);
  assert.equal(waiting.build?.reviewsLeft, -1);
  assert.equal(waiting.build?.paused, undefined);
});

test('mana is rounded, and a variable payout omits manaEach', () => {
  const state = createNewAcademy();
  state.mana = 12.6;
  assert.equal(bannerSummary(state).mana, 13);
  state.wizard.levels.arcane = 8;
  assert.equal(bannerSummary(state).manaEach, undefined);
});

test('the save payload includes bannerSummary', () => {
  const state = createNewAcademy();
  const payload = savedWithBanner({ mana: state.mana, reviewIndex: state.reviewIndex }, state);
  assert.deepEqual(payload.bannerSummary, bannerSummary(state));
  assert.equal(payload.mana, state.mana);
});

test('the banner summary is sent on change and throttled to one push a second', () => {
  let now = 5_000;
  const sent: string[] = [];
  const later: Array<{ fn: () => void; ms: number }> = [];
  const throttle = createBannerThrottle(json => sent.push(json), {
    now: () => now,
    later: (fn, ms) => {
      later.push({ fn, ms });
    }
  });
  const first = bannerSummary(createNewAcademy());
  throttle.push(first);
  assert.equal(sent.length, 1);
  assert.equal(JSON.parse(sent[0]).mana, first.mana);

  now = 5_400;
  const second = { ...first, mana: 40 };
  throttle.push(second);
  assert.equal(sent.length, 1, 'a second change inside the second is held');
  assert.equal(later.length, 1);
  assert.equal(later[0].ms, 600);

  now = 6_000;
  later[0].fn();
  assert.equal(sent.length, 2);
  assert.equal(JSON.parse(sent[1]).mana, 40);
});

type Session = NonNullable<ReturnType<typeof createNewAcademy>['wizard']['activeSession']>;

function withSession(partial: Partial<Session>, queued = 0) {
  const state = createNewAcademy();
  state.wizard.activeSession = {
    id: 1,
    kind: 'orb',
    progress: 0,
    required: 30,
    costPaid: 0,
    state: 'active',
    ...partial
  } as Session;
  state.wizard.queuedSessions = Array.from({ length: queued }, (_, i) => ({
    id: 10 + i,
    kind: 'orb' as const,
    school: 'arcane' as const,
    targetLevel: 1,
    required: 10,
    costPaid: 0
  }));
  return state;
}

test('toolbar chip: an orb names the school and target level', () => {
  const state = withSession({ kind: 'orb', school: 'nature' as Session['school'], targetLevel: 2, progress: 12, required: 30 }, 2);
  const summary = bannerSummary(state);
  assert.equal(summary.service?.kind, 'orb');
  assert.equal(summary.service?.school, 'Nature');
  assert.equal(summary.service?.targetLevel, 2);
  assert.equal(summary.service?.progressPct, 40);
  assert.equal(summary.service?.queuedCount, 2);
  const chip = serviceChip(summary.service);
  assert.equal(chip.icon, '🔮');
  assert.equal(chip.label, 'Nature Lv 2');
  assert.equal(chip.count, '18');
  assert.equal(chip.pct, 40);
  assert.equal(chip.muted, false);
  assert.equal(chip.title, 'Pondering Nature to level 2 — 18 reviews left · 2 more queued');
});

test('toolbar chip: the grimoire shows the spell display name', () => {
  const [spellId, def] = Object.entries(SPELL_DEFINITIONS)[0];
  const summary = bannerSummary(withSession({ kind: 'grimoire', spellId, progress: 5, required: 20 }));
  assert.equal(summary.service?.spellName, def.name);
  const chip = serviceChip(summary.service);
  assert.equal(chip.icon, '📖');
  assert.equal(chip.label, truncateLabel(def.name));
  assert.ok(chip.title.startsWith(`Studying the grimoire: ${def.name} — 15 reviews left`));
});

test('toolbar chip: summoning tiers 1 to 3', () => {
  const labels = [1, 2, 3].map(tier =>
    serviceChip(bannerSummary(withSession({ kind: 'summon', summonTier: tier as 1 | 2 | 3, required: 8, progress: 2 })).service)
  );
  assert.deepEqual(labels.map(c => c.label), ['Summoning', 'Summoning II', 'Summoning III']);
  assert.ok(labels.every(c => c.icon === '🌀' && c.count === '6'));
});

test('toolbar chip: nothing queued is a muted Idle with no bar', () => {
  const summary = bannerSummary(createNewAcademy());
  const svc = serviceChip(summary.service);
  const build = buildChip(summary.build);
  assert.deepEqual([svc.icon, svc.label, svc.muted, svc.pct, svc.count], ['🔮', 'Idle', true, null, '']);
  assert.deepEqual([build.icon, build.label, build.muted, build.pct, build.count], ['🔨', 'Idle', true, null, '']);
});

test('toolbar chip: long names are cut to 14 characters with an ellipsis', () => {
  assert.equal(truncateLabel('Library'), 'Library');
  assert.equal(truncateLabel('Exactly14Chars'), 'Exactly14Chars');
  const cut = truncateLabel('Grand Observatory of Stars');
  assert.equal(Array.from(cut).length, 14);
  assert.ok(cut.endsWith('…'));
  const chip = buildChip({ name: 'Grand Observatory of Stars', reviewsLeft: 9, progressPct: 50 });
  assert.equal(chip.label, cut);
  assert.ok(chip.title.startsWith('Grand Observatory of Stars — 9 reviews left'));
});

test('toolbar chip: build crew, queued sites, paused and waiting', () => {
  let state = createNewAcademy();
  state.rooms = [...state.rooms, addSite('dormitory', 890, 0), addSite('dormitory', 891)];
  const summary = bannerSummary(state);
  assert.equal(summary.build?.queuedCount, 1);
  assert.ok((summary.build?.crew || 0) >= 1);
  const chip = buildChip(summary.build);
  assert.equal(chip.icon, '🔨');
  assert.equal(chip.label, 'Dormitory');
  assert.match(chip.title, /^Dormitory — \d+ reviews? left \(crew of \d\) · 1 more queued$/);

  const paused = AnkicasterEngine.setConstructionPaused(state, 890, true);
  assert.equal(paused.success, true, paused.error);
  state = paused.state;
  const pausedChip = buildChip(bannerSummary(state).build);
  assert.equal(pausedChip.icon, '⏸');
  assert.equal(pausedChip.label, 'Dormitory');
  assert.match(pausedChip.title, /paused/);

  const waiting = buildChip({ name: 'Library', reviewsLeft: -1, crew: 0 });
  assert.equal(waiting.count, '…');
  assert.equal(waiting.title, 'Library — waiting for builders');
  const done = buildChip({ name: 'Library', reviewsLeft: 0, progressPct: 100 });
  assert.equal(done.count, '✓');
});

test('build progressPct follows the site and totalReviews matches a fresh site', () => {
  const state = createNewAcademy();
  const def = ROOM_DEFINITIONS.dormitory;
  state.rooms = [...state.rooms, addSite('dormitory', 892, Math.floor(def.buildReviews / 2))];
  const build = bannerSummary(state).build!;
  assert.equal(build.progressPct, Math.floor((Math.floor(def.buildReviews / 2) / def.buildReviews) * 100));
  assert.ok((build.totalReviews || 0) >= build.reviewsLeft);
});
