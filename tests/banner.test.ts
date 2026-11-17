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
  savedWithBanner,
  serviceQueueTitle
} from '../src/utils/banner';
import { computeConstructionPlan, reviewsToGo } from '../src/utils/construction';
import { ROOM_DEFINITIONS } from '../src/data/content';
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
