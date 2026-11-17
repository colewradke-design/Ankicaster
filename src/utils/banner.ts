/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only summary the Anki main-window banner paints.
 * Never mutates game state.
 */

import type { FullGameState } from '../types/ankicaster';
import { ROOM_DEFINITIONS, SPELL_DEFINITIONS } from '../data/content';
import { computeConstructionPlan, constructionSites, reviewsToGo } from './construction';
import { calculateReviewMana, computeAlumniBonuses, computeSpellbookBonuses } from './formulas';

export interface BannerJob {
  name: string;
  /** Honest reviews still needed. -1 means the site is waiting for a builder. */
  reviewsLeft: number;
  paused?: boolean;
}

export interface BannerSummary {
  v: 1;
  mana: number;
  reviewIndex: number;
  build?: BannerJob;
  service?: BannerJob;
  buildCount: number;
  serviceCount: number;
  /**
   * Present only when each pending honest review would add this exact whole
   * amount of mana. Omitted when Arcane level, books, alumni, or debt make
   * the payout variable. The Anki banner uses it for a "+X" tag.
   */
  manaEach?: number;
}

export function serviceQueueTitle(item: {
  kind: 'orb' | 'grimoire' | 'summon';
  school?: string;
  targetLevel?: number;
  spellId?: string;
  summonTier?: number;
}): string {
  if (item.kind === 'orb') {
    const school = item.school ? item.school[0].toUpperCase() + item.school.slice(1) : 'Arcane';
    return `${school} Orb · Lv ${item.targetLevel || 1}`;
  }
  if (item.kind === 'grimoire') {
    const spName = item.spellId ? SPELL_DEFINITIONS[item.spellId]?.name || item.spellId : 'Spell';
    return `Grimoire · ${spName}`;
  }
  return item.summonTier ? `Summon Servant (T${item.summonTier})` : 'Summon Servant';
}

function reviewsRemaining(progress: number, required: number): number {
  return Math.max(0, Math.ceil((required || 0) - (progress || 0)));
}

export function bannerSummary(state: FullGameState): BannerSummary {
  const sites = constructionSites(state.rooms || []);
  const plan = computeConstructionPlan(state);
  const top = sites[0];
  let build: BannerJob | undefined;
  if (top) {
    const active = plan.find(job => job.roomId === top.id);
    const name = ROOM_DEFINITIONS[top.defId]?.name || top.defId;
    if (top.buildPaused) {
      build = { name, reviewsLeft: reviewsToGo(top, 0, active?.rate), paused: true };
    } else if (!active) {
      build = { name, reviewsLeft: -1 };
    } else {
      build = { name, reviewsLeft: reviewsToGo(top, 0, active.rate) };
    }
  }

  const activeSession = state.wizard?.activeSession;
  const queued = state.wizard?.queuedSessions || [];
  const topService = activeSession || queued[0];
  const service = topService
    ? {
        name: serviceQueueTitle(topService),
        reviewsLeft: reviewsRemaining(topService.progress || 0, topService.required)
      }
    : undefined;

  const pct =
    (computeSpellbookBonuses(state.spellbooks || []).manaPct || 0) +
    (computeAlumniBonuses(state.alumniGallery || []).scholarManaPct || 0);
  const arcane = state.wizard?.levels?.arcane || 0;
  const earned = calculateReviewMana(arcane, pct, state.settings?.manaPerReview ?? 10);
  const manaEach =
    pct === 0 && arcane <= 5 && (state.manaDebt || 0) <= 0 && Number.isInteger(earned) ? earned : undefined;

  const summary: BannerSummary = {
    v: 1,
    mana: Math.round(state.mana || 0),
    reviewIndex: state.reviewIndex || 0,
    buildCount: sites.length,
    serviceCount: (activeSession ? 1 : 0) + queued.length
  };
  if (build) summary.build = build;
  if (service) summary.service = service;
  if (manaEach !== undefined) summary.manaEach = manaEach;
  return summary;
}

/** Stamp the summary onto a save payload. Python reads this and nothing else. */
export function savedWithBanner<T extends object>(payload: T, state: FullGameState): T & { bannerSummary: BannerSummary } {
  return { ...payload, bannerSummary: bannerSummary(state) };
}

/**
 * Send the latest summary at most once per second.
 * A change inside the window is held and sent when the window ends.
 */
export function createBannerThrottle(
  send: (json: string) => void,
  opts: {
    intervalMs?: number;
    now?: () => number;
    later?: (fn: () => void, ms: number) => { cancel?: () => void } | void;
  } = {}
) {
  const interval = opts.intervalMs ?? 1000;
  const now = opts.now ?? (() => Date.now());
  const later =
    opts.later ??
    ((fn: () => void, ms: number) => {
      const id = setTimeout(fn, ms);
      return { cancel: () => clearTimeout(id) };
    });
  let last = 0;
  let pending: string | undefined;
  let timer: { cancel?: () => void } | void;

  return {
    push(summary: BannerSummary) {
      const json = JSON.stringify(summary);
      const t = now();
      if (last === 0 || t - last >= interval) {
        last = t;
        pending = undefined;
        if (timer?.cancel) timer.cancel();
        timer = undefined;
        send(json);
        return;
      }
      pending = json;
      if (!timer) {
        timer = later(() => {
          timer = undefined;
          last = now();
          if (pending !== undefined) {
            const body = pending;
            pending = undefined;
            send(body);
          }
        }, interval - (t - last));
      }
    }
  };
}
