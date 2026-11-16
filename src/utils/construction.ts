/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Construction countdown helpers shared by the Build panel, the room window and the map ring
 * (Addendum 5.6, GDD 15.4). Read-only: they never change state.
 */
import { PlacedRoom } from '../types/ankicaster';

/** Honest reviews of progress per review when no slot rate is known. */
export function siteRate(_room: Pick<PlacedRoom, 'state'>, buildSpeedPct = 0): number {
  return buildSpeedPct > 0 ? Math.round((1 + buildSpeedPct / 100) * 100) / 100 : 1;
}

/** Fraction built, 0..1. */
export function siteFraction(room: Pick<PlacedRoom, 'buildProgress' | 'buildRequired' | 'state'>): number {
  if (room.state === 'built') return 1;
  const req = Math.max(1, room.buildRequired || 0);
  return Math.max(0, Math.min(1, (room.buildProgress || 0) / req));
}

/** N in "About N honest reviews to go". Pass slotRate (points per review) when the site has a slot. */
export function reviewsToGo(
  room: Pick<PlacedRoom, 'buildProgress' | 'buildRequired' | 'state'>,
  buildSpeedPct = 0,
  slotRate?: number
): number {
  if (room.state === 'built') return 0;
  const rate = slotRate && slotRate > 0 ? slotRate : siteRate(room, buildSpeedPct);
  return Math.max(0, Math.ceil(((room.buildRequired || 0) - (room.buildProgress || 0)) / rate));
}

export function reviewsToGoText(
  room: Pick<PlacedRoom, 'buildProgress' | 'buildRequired' | 'state'>,
  buildSpeedPct = 0,
  slotRate?: number
): string {
  const n = reviewsToGo(room, buildSpeedPct, slotRate);
  return `About ${n} honest review${n === 1 ? '' : 's'} to go`;
}

/** Wizard plus at most 3 Builders (GDD 15.4). */
export const MAX_CONSTRUCTION_SLOTS = 4;

export interface BuilderSlotInput {
  id: number;
  workshopLevel: number;
  quickHands: boolean;
}

export interface ConstructionAssignment {
  roomId: number;
  rate: number;
  slot: 'wizard' | 'builder';
}

function roundRate(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Sites the queue will consider, paused ones included, earliest first. */
export function constructionSites<T extends Pick<PlacedRoom, 'id' | 'state' | 'buildOrder' | 'buildPaused'>>(rooms: T[]): T[] {
  return rooms
    .filter(r => r.state === 'site')
    .sort((a, b) => (a.buildOrder ?? a.id) - (b.buildOrder ?? b.id) || a.id - b.id);
}

/**
 * The wizard's slot is always first (1/review, 1.1 at Alchemy 5).
 * Each Builder working a finished Workshop opens the next slot (1.25, or 1.4 in a level-3 Workshop).
 * academySpeedPct is furniture and creature build speed. Quick Hands is that Builder's slot only.
 */
export function planConstruction(
  rooms: Array<Pick<PlacedRoom, 'id' | 'state' | 'buildOrder' | 'buildPaused'>>,
  opts: { alchemyLevel: number; builders: BuilderSlotInput[]; academySpeedPct?: number }
): ConstructionAssignment[] {
  const waiting = constructionSites(rooms).filter(r => !r.buildPaused);
  const mult = 1 + (opts.academySpeedPct || 0) / 100;
  const wizard = roundRate((opts.alchemyLevel >= 5 ? 1.1 : 1) * mult);
  const builders = opts.builders.slice(0, MAX_CONSTRUCTION_SLOTS - 1);
  const rates = [
    wizard,
    ...builders.map(b => roundRate((b.workshopLevel >= 3 ? 1.4 : 1.25) * (b.quickHands ? 1.15 : 1) * mult))
  ];
  return waiting.slice(0, rates.length).map((room, i) => ({
    roomId: room.id,
    rate: rates[i],
    slot: i === 0 ? 'wizard' : 'builder'
  }));
}

/** Addendum 5.6 stage from p: 1 marked out, 2 framed, 3 walls rising, 4 roofed, 5 finishing, 6 complete. */
export function siteStage(p: number): 1 | 2 | 3 | 4 | 5 | 6 {
  if (p >= 1) return 6;
  if (p >= 0.8) return 5;
  if (p >= 0.6) return 4;
  if (p >= 0.4) return 3;
  if (p >= 0.2) return 2;
  return 1;
}
