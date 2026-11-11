/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Construction countdown helpers shared by the Build panel, the room window and the map ring
 * (Addendum 5.6, GDD 15.4). Read-only: they never change state.
 */
import { PlacedRoom } from '../types/ankicaster';

/**
 * Honest reviews of progress per review for a site. The engine advances every unpaused site by 1 per
 * honest review (engine.ts processReview step 4) and has no Builder slots yet, so the rate is 1.
 * GDD 15.4's Builder rate (1.25) applies once the engine gains Builder slots.
 */
export function siteRate(_room: Pick<PlacedRoom, 'state'>): number {
  return 1;
}

/** Fraction built, 0..1. */
export function siteFraction(room: Pick<PlacedRoom, 'buildProgress' | 'buildRequired' | 'state'>): number {
  if (room.state === 'built') return 1;
  const req = Math.max(1, room.buildRequired || 0);
  return Math.max(0, Math.min(1, (room.buildProgress || 0) / req));
}

/** N in "About N honest reviews to go" = ceil((buildRequired - buildProgress) / rate). */
export function reviewsToGo(room: Pick<PlacedRoom, 'buildProgress' | 'buildRequired' | 'state'>): number {
  if (room.state === 'built') return 0;
  return Math.max(0, Math.ceil(((room.buildRequired || 0) - (room.buildProgress || 0)) / siteRate(room)));
}

export function reviewsToGoText(room: Pick<PlacedRoom, 'buildProgress' | 'buildRequired' | 'state'>): string {
  const n = reviewsToGo(room);
  return `About ${n} honest review${n === 1 ? '' : 's'} to go`;
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
