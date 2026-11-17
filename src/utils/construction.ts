/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Construction countdown and crew planning helpers shared by the Queue panel,
 * Build panel, Room window, and visual Choreographers. Read-only: never mutates state.
 */
import { FullGameState, PlacedRoom } from '../types/ankicaster';
import { isRoomOperationalForServant, workshopBaseRate, workshopCreatureBuildBonus } from './servants';

/** Honest reviews of progress per review when no active crew rate is known. */
export function siteRate(_room: Pick<PlacedRoom, 'state'>, buildSpeedPct = 0): number {
  return buildSpeedPct > 0 ? Math.round((1 + buildSpeedPct / 100) * 100) / 100 : 1;
}

/** Fraction built, 0..1. */
export function siteFraction(room: Pick<PlacedRoom, 'buildProgress' | 'buildRequired' | 'state'>): number {
  if (room.state === 'built') return 1;
  const req = Math.max(1, room.buildRequired || 0);
  return Math.max(0, Math.min(1, (room.buildProgress || 0) / req));
}

/** N in "About N honest reviews to go". Pass slotRate (points per review) when the site has active workers. */
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

/** Maximum simultaneous workers across construction sites (Workshop servants + optional Wizard). */
export const MAX_CONSTRUCTION_SLOTS = 4;

export interface WorkshopWorkerInput {
  kind: 'wizard' | 'servant';
  id: number; // 0 for wizard, servant.id for servant
  workshopLevel: number;
  workshopId: number;
}

export interface ConstructionCrewMember {
  kind: 'wizard' | 'servant';
  id: number;
  workshopId: number;
  rate: number;
  slotIndex: number;
}

export interface ConstructionAssignment {
  roomId: number;
  rate: number;
  slot: 'wizard' | 'servant';
  crew: ConstructionCrewMember[];
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
 * Servants assigned to the Workshop (and optionally the Wizard if assigned there) work
 * the FIRST unpaused site in the build queue together, up to 4 active bodies.
 * Additional Workshop workers wait at the Workshop until a slot opens.
 * Rate per body = Workshop level base (1 / 1.25 / 1.5) * (1 + creatureBuildBonus).
 */
export function planConstruction(
  rooms: Array<Pick<PlacedRoom, 'id' | 'state' | 'buildOrder' | 'buildPaused'>>,
  opts: { workers: WorkshopWorkerInput[]; creatureBuildBonus?: number }
): ConstructionAssignment[] {
  const waiting = constructionSites(rooms).filter(r => !r.buildPaused);
  if (waiting.length === 0 || opts.workers.length === 0) return [];
  const frontSite = waiting[0];
  const mult = 1 + Math.max(0, opts.creatureBuildBonus || 0);
  const activeWorkers = opts.workers.slice(0, MAX_CONSTRUCTION_SLOTS);
  const crew: ConstructionCrewMember[] = activeWorkers.map((w, idx) => ({
    kind: w.kind,
    id: w.id,
    workshopId: w.workshopId,
    rate: roundRate(workshopBaseRate(w.workshopLevel) * mult),
    slotIndex: idx
  }));
  const totalRate = roundRate(crew.reduce((sum, m) => sum + m.rate, 0));
  if (totalRate <= 0) return [];
  return [
    {
      roomId: frontSite.id,
      rate: totalRate,
      slot: crew.some(m => m.kind === 'wizard') ? 'wizard' : 'servant',
      crew
    }
  ];
}

/** Read-only snapshot of active construction crew & rate for a full game state. */
export function computeConstructionPlan(
  state: Pick<FullGameState, 'rooms' | 'servants' | 'wizard' | 'reviewIndex' | 'creatures' | 'spellbooks' | 'bellIndex'>
): ConstructionAssignment[] {
  const workshops = (state.rooms || []).filter(
    r => r.defId === 'workshop' && isRoomOperationalForServant(state, r)
  );
  if (workshops.length === 0) return [];
  const workshopById = new Map(workshops.map(w => [w.id, w]));
  const workers: WorkshopWorkerInput[] = [];
  for (const s of [...(state.servants || [])].sort((a, b) => a.id - b.id)) {
    if (s.workplaceRoomId == null) continue;
    const ws = workshopById.get(s.workplaceRoomId);
    if (!ws) continue;
    workers.push({
      kind: 'servant',
      id: s.id,
      workshopId: ws.id,
      workshopLevel: ws.level || 1
    });
  }
  if (state.wizard?.workshopAssigned) {
    const primaryWs = [...workshops].sort((a, b) => (b.level || 1) - (a.level || 1) || a.id - b.id)[0];
    if (primaryWs) {
      workers.push({
        kind: 'wizard',
        id: 0,
        workshopId: primaryWs.id,
        workshopLevel: primaryWs.level || 1
      });
    }
  }
  return planConstruction(state.rooms, {
    workers,
    creatureBuildBonus: workshopCreatureBuildBonus(state)
  });
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
