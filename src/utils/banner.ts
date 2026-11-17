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
  /** 0..100, rounded down to a whole percent. */
  progressPct?: number;
  /** Honest reviews the whole job takes at the current rate. Lets Python move the bar while the game is closed. */
  totalReviews?: number;
  /** Active crew on the front site (wizard + servants). */
  crew?: number;
  /** Items waiting behind this one. */
  queuedCount?: number;
}

export type BannerServiceKind = 'orb' | 'grimoire' | 'summon';

export interface BannerService extends BannerJob {
  kind: BannerServiceKind;
  school?: string;
  targetLevel?: number;
  spellName?: string;
  summonTier?: number;
}

export interface BannerSummary {
  v: 1;
  mana: number;
  reviewIndex: number;
  build?: BannerJob;
  service?: BannerService;
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

function pctOf(done: number, total: number): number {
  if (!(total > 0)) return 0;
  return Math.max(0, Math.min(100, Math.floor((done / total) * 100)));
}

function capitalize(s?: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : 'Arcane';
}

export function bannerSummary(state: FullGameState): BannerSummary {
  const sites = constructionSites(state.rooms || []);
  const plan = computeConstructionPlan(state);
  const top = sites[0];
  let build: BannerJob | undefined;
  if (top) {
    const active = plan.find(job => job.roomId === top.id);
    const name = ROOM_DEFINITIONS[top.defId]?.name || top.defId;
    const rate = active?.rate;
    const progressPct = pctOf(top.buildProgress || 0, top.buildRequired || 0);
    const totalReviews = reviewsToGo({ state: 'site', buildProgress: 0, buildRequired: top.buildRequired }, 0, rate);
    if (top.buildPaused) {
      build = { name, reviewsLeft: reviewsToGo(top, 0, rate), paused: true, progressPct, totalReviews };
    } else if (!active) {
      build = { name, reviewsLeft: -1, progressPct, crew: 0 };
    } else {
      build = { name, reviewsLeft: reviewsToGo(top, 0, active.rate), progressPct, totalReviews, crew: active.crew.length };
    }
    build.queuedCount = Math.max(0, sites.length - 1);
  }

  const activeSession = state.wizard?.activeSession;
  const queued = state.wizard?.queuedSessions || [];
  const topService = activeSession || queued[0];
  let service: BannerService | undefined;
  if (topService) {
    const required = topService.required || 0;
    const progress = topService.progress || 0;
    service = {
      kind: topService.kind,
      name: serviceQueueTitle(topService),
      reviewsLeft: reviewsRemaining(progress, required),
      progressPct: pctOf(progress, required),
      totalReviews: Math.max(0, Math.ceil(required)),
      queuedCount: Math.max(0, (activeSession ? 1 : 0) + queued.length - 1)
    };
    if (activeSession && activeSession.state === 'paused') service.paused = true;
    if (topService.kind === 'orb') {
      service.school = capitalize(topService.school);
      service.targetLevel = topService.targetLevel || 1;
    } else if (topService.kind === 'grimoire') {
      service.spellName = topService.spellId
        ? SPELL_DEFINITIONS[topService.spellId]?.name || topService.spellId
        : 'Spell';
    } else if (topService.kind === 'summon') {
      service.summonTier = topService.summonTier || 1;
    }
  }

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

/* ------------------------------------------------------------------ */
/* Toolbar chips. addon/banner.py format_chip() mirrors these exactly. */
/* ------------------------------------------------------------------ */

export const CHIP_LABEL_MAX = 14;

export interface ToolbarChip {
  icon: string;
  label: string;
  muted: boolean;
  /** Bar fill 0..100, or null for no bar. */
  pct: number | null;
  /** Number shown after the bar: reviews left, "✓" when done, "…" when waiting for builders. */
  count: string;
  title: string;
}

/** Cut to CHIP_LABEL_MAX characters (code points), ending with "…". */
export function truncateLabel(text: string, max = CHIP_LABEL_MAX): string {
  const chars = Array.from(text || '');
  if (chars.length <= max) return chars.join('');
  return chars.slice(0, max - 1).join('').trimEnd() + '…';
}

const ROMAN: Record<number, string> = { 2: 'II', 3: 'III' };

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? '' : 's'}`;
}

function leftText(left: number): string {
  if (left < 0) return 'waiting for builders';
  if (left === 0) return 'done, completes when the Academy opens';
  return `${plural(left, 'review')} left`;
}

function countText(left: number): string {
  if (left < 0) return '…';
  if (left === 0) return '✓';
  return String(left);
}

function queuedText(n?: number): string {
  return n && n > 0 ? ` · ${n} more queued` : '';
}

export function buildChip(job?: BannerJob | null): ToolbarChip {
  if (!job || !job.name) {
    return { icon: '🔨', label: 'Idle', muted: true, pct: null, count: '', title: 'Nothing building' };
  }
  const left = Number.isFinite(job.reviewsLeft) ? Math.trunc(job.reviewsLeft) : -1;
  const crew = job.crew && job.crew > 0 ? ` (crew of ${job.crew})` : '';
  const status = job.paused ? `paused, ${left >= 0 ? leftText(left) : 'waiting'}` : leftText(left);
  return {
    icon: job.paused ? '⏸' : '🔨',
    label: truncateLabel(job.name),
    muted: false,
    pct: Math.max(0, Math.min(100, job.progressPct ?? 0)),
    count: countText(left),
    title: `${job.name} — ${status}${job.paused ? '' : crew}${queuedText(job.queuedCount)}`
  };
}

export function serviceChip(svc?: BannerService | null): ToolbarChip {
  if (!svc || (!svc.kind && !svc.name)) {
    return { icon: '🔮', label: 'Idle', muted: true, pct: null, count: '', title: 'No services queued' };
  }
  const left = Number.isFinite(svc.reviewsLeft) ? Math.max(0, Math.trunc(svc.reviewsLeft)) : 0;
  let icon = '🔮';
  let label: string;
  let what: string;
  if (svc.kind === 'grimoire') {
    icon = '📖';
    label = svc.spellName || 'Grimoire';
    what = `Studying the grimoire: ${label}`;
  } else if (svc.kind === 'summon') {
    icon = '🌀';
    const roman = ROMAN[svc.summonTier || 1];
    label = roman ? `Summoning ${roman}` : 'Summoning';
    what = roman ? `Summoning a servant (tier ${roman})` : 'Summoning a servant';
  } else if (svc.kind !== 'orb') {
    // Summary written before the service kind existed.
    label = svc.name;
    what = svc.name;
  } else {
    const school = svc.school || 'Arcane';
    const lv = svc.targetLevel || 1;
    label = `${school} Lv ${lv}`;
    what = `Pondering ${school} to level ${lv}`;
  }
  if (svc.paused) icon = '⏸';
  return {
    icon,
    label: truncateLabel(label),
    muted: false,
    pct: Math.max(0, Math.min(100, svc.progressPct ?? 0)),
    count: countText(left),
    title: `${what} — ${svc.paused ? 'paused, ' : ''}${leftText(left)}${queuedText(svc.queuedCount)}`
  };
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
