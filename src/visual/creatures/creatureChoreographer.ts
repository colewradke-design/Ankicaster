/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Creature Choreographer & Per-Species Behaviour
 * - Never mutates FullGameState and never imports engine.ts
 * - Zero `away` creatures drawn or tracked
 * - Per-species `movement` (11 types): scurry, hop, trot, waddle, slither, fly, glide, swim, hover, rooted, crawl
 * - Tamed `roamsFreely` companions need 0 pen slots, wander castle floors/stairs & grounds via NavGraph, nap in occupied rooms, and follow their tamer
 * - Pre-tamed (`egg` status) rendered via origin-specific 5-stage arrival art
 * - Pen caps: <= 3 visible in 1x1 pens (`ONE_BY_ONE_PEN_CAP`), <= 5 visible in larger pens (`LARGE_PEN_CAP`), <= 40 globally (never hiding egg or loose)
 */

import { CREATURE_DEFINITIONS } from '../../data/content';
import type {
  CreatureInstance,
  CreatureMovement,
  CreatureOrigin,
  FullGameState,
  HabitatType,
  PlacedRoom
} from '../../types/ankicaster';
import {
  ONE_BY_ONE_PEN_CAP,
  LARGE_PEN_CAP,
  HABITAT_TO_ROOM_DEF,
  penCreatureCapacity,
  resolveAllCreatureRooms,
  isRoamingCompanion
} from '../../utils/creatures';
import { roomToWorldBox, getGroundY } from '../layout/gridToWorld';
import { NavGraph, NavNode } from '../layout/navGraph';
import type { VisualAgent } from '../agents/Choreographer';
import type { CreatureAnim } from './creatureArt';

export { ONE_BY_ONE_PEN_CAP, LARGE_PEN_CAP, HABITAT_TO_ROOM_DEF, penCreatureCapacity };
export const MAX_VISIBLE_CREATURES = 40;

export interface PenRect {
  left: number;
  right: number;
  topY: number;
  floorY: number;
  skyTopY: number;
  isWater: boolean;
  perches?: Array<{ x: number; y: number }>;
}

export interface CreatureVisualAgent {
  creatureId: number;
  defId: string;
  nickname: string;
  status: CreatureInstance['status'];
  habitat: HabitatType;
  movement: CreatureMovement;
  origin: CreatureOrigin;
  roaming: boolean;
  roomId?: number;
  x: number;
  y: number;
  anchorX: number;
  facing: 'L' | 'R';
  anim: CreatureAnim;
  frame: number;
  phase: number;
  stateTimerMs: number;
  resting: boolean;
  targetX: number;
  targetY: number;
  unhomed: boolean;
  tamingProgress: number;
  bondLevel: 0 | 1 | 2 | 3;
  hungry: boolean;
  hatchProgress: number;
  tamerId?: number;
  wizardTamingPaw: boolean;
  /** Non-empty while returning home after loose -> tamed/wary. */
  returnPath: NavNode[];
  returnPathIdx: number;
  /** NavGraph path while roaming castle & grounds as a companion. */
  roamPath: NavNode[];
  roamPathIdx: number;
  roamNapTimerMs: number;
  /** Optional loose wandering switch timer. */
  looseNextSwitchMs: number;
  /** Real flight phases for fly / glide species (takeoff -> cruise -> land -> perch). */
  flightMode?: 'perch' | 'takeoff' | 'cruise' | 'land';
  flightPhaseMs?: number;
  cruiseY?: number;
  perchY?: number;
  flightStartX?: number;
  flightStartY?: number;
  /** Hop arc progress for hop species. */
  hopProgress?: number;
  hopStartX?: number;
  hopDir?: 1 | -1;
}

export interface CreatureBurst {
  creatureId: number;
  kind: 'hatch' | 'tamed' | 'bond';
  x: number;
  y: number;
  startMs: number;
  durationMs: number;
}

function hashSeed(id: number, salt = 0): number {
  let x = (id * 2654435761 + salt * 374761393) | 0;
  x ^= x >>> 16;
  return (x >>> 0) / 4294967296;
}

/** Backwards-compatible single-creature resolver delegating to shared deterministic helper. */
export function resolveCreatureRoom(
  c: CreatureInstance,
  rooms: PlacedRoom[],
  occupancyCount: Map<number, number>
): { room: PlacedRoom | undefined; unhomed: boolean; subBayIndex: number } {
  const dummyList = [c];
  const map = resolveAllCreatureRooms(dummyList, rooms);
  const res = map.get(c.id);
  if (!res) return { room: undefined, unhomed: true, subBayIndex: 0 };
  if (res.room && (occupancyCount.get(res.room.id) ?? 0) >= penCreatureCapacity(res.room)) {
    const others = rooms.filter(r => r.state === 'built' && r.defId === res.room!.defId && (occupancyCount.get(r.id) ?? 0) < penCreatureCapacity(r));
    if (others.length > 0) return { room: others[0], unhomed: false, subBayIndex: 0 };
  }
  return { room: res.room, unhomed: res.unhomed, subBayIndex: res.subBayIndex };
}

/** Exact pen/water/sky bounds for a creature inside a room. */
export function getPenRect(room: PlacedRoom, groundY: number, habitat: HabitatType, subBayIndex = 0): PenRect {
  const box = roomToWorldBox(room, groundY);
  let left = box.left + 8;
  let right = box.left + box.width - 8;
  let topY = box.top + 8;
  let floorY = box.floorLineY;
  let skyTopY = topY;
  let isWater = false;
  let perches: Array<{ x: number; y: number }> | undefined;

  if (room.defId === 'menagerie') {
    const bays = Math.max(1, room.w);
    const bayIdx = ((subBayIndex % bays) + bays) % bays;
    const bayW = box.width / bays;
    left = box.left + bayIdx * bayW + 6;
    right = box.left + (bayIdx + 1) * bayW - 6;
    if (habitat === 'sky') {
      topY = box.top + 18;
      skyTopY = topY;
    }
    if (habitat === 'tide') {
      topY = floorY - 22;
      isWater = true;
    }
  } else if (room.defId === 'tide_tank') {
    left = box.left + 9;
    right = box.left + box.width - 9;
    topY = box.top + 8;
    floorY = box.floorLineY - 5;
    skyTopY = topY;
    isWater = true;
  } else if (room.defId === 'pond') {
    left = box.left + 11;
    right = box.left + box.width - 11;
    topY = box.floorLineY - 12;
    floorY = box.floorLineY - 3;
    skyTopY = Math.max(box.top + 10, box.floorLineY - 40);
    isWater = true;
  } else if (room.defId === 'aviary') {
    left = box.left + 8;
    right = box.left + box.width - 8;
    // Stay strictly inside the cage (never above the roof)
    topY = box.top + 10;
    skyTopY = box.top + 10;
    // Two perch bars matching the painted bars in roomArt.ts (T = box.top + 3: [L + 10, T + 30], [R - 14, T + 54])
    perches = [
      { x: box.left + 10, y: box.top + 33 },
      { x: box.left + box.width - 14, y: box.top + 57 }
    ];
  } else if (room.defId === 'meadow_paddock') {
    left = box.left + 6;
    right = box.left + box.width - 6;
  } else if (room.defId === 'crystal_vivarium') {
    left = box.left + 9;
    right = box.left + box.width - 9;
    topY = box.top + 7;
  }

  if (right - left < 12) {
    const mid = (left + right) / 2;
    left = mid - 6;
    right = mid + 6;
  }
  return { left, right, topY, floorY, skyTopY, isWater, perches };
}

export class CreatureChoreographer {
  agents = new Map<number, CreatureVisualAgent>();
  /** Extra creatures collapsed behind a "+N" badge per room. */
  hiddenCounts = new Map<number, number>();
  /** Rooms where the Wizard serves as Common creature tamer (shows paw charm per VR-05). */
  wizardPawRooms = new Set<number>();
  bursts: CreatureBurst[] = [];

  clockMs = 0;
  private lastReal = -1;
  private prevStatuses = new Map<number, CreatureInstance['status']>();
  private prevBonds = new Map<number, number>();

  navGraph: NavGraph;
  groundY: number;
  totalWorldWidth: number;

  constructor(navGraph: NavGraph, groundY: number, totalWorldWidth: number) {
    this.navGraph = navGraph;
    this.groundY = groundY;
    this.totalWorldWidth = totalWorldWidth;
  }

  updateBounds(navGraph: NavGraph, groundY: number, totalWorldWidth: number) {
    this.navGraph = navGraph;
    this.groundY = groundY;
    this.totalWorldWidth = totalWorldWidth;
  }

  consumeTime(deltaMs: number, nowMs?: number): number {
    let gap: number;
    if (nowMs == null) gap = deltaMs;
    else if (this.lastReal < 0) gap = Number.isFinite(deltaMs) ? deltaMs : 0;
    else gap = nowMs - this.lastReal;
    if (nowMs != null) this.lastReal = nowMs;
    if (!Number.isFinite(gap) || gap < 0) gap = 0;
    return Math.min(250, gap);
  }

  private topWorldBound(state: FullGameState): number {
    const castleRooms = state.rooms.filter(r => r.area === 'castle');
    if (castleRooms.length === 0) return Math.max(24, this.groundY - 96);
    const maxTopFloor = Math.max(1, ...castleRooms.map(r => r.y + r.h));
    const minTop = getGroundY(maxTopFloor) - maxTopFloor * 48;
    return Math.max(24, Math.min(this.groundY - 48, minTop + 16));
  }

  private clampWorldPoint(x: number, y: number, topBound: number): { x: number; y: number } {
    const minX = 16;
    const maxX = Math.max(minX + 16, this.totalWorldWidth - 16);
    const minY = Math.min(topBound, this.groundY - 8);
    const maxY = this.groundY - 4;
    return {
      x: Math.max(minX, Math.min(maxX, x)),
      y: Math.max(minY, Math.min(maxY, y))
    };
  }

  private nearestNavNode(fromX: number, fromY: number): NavNode | undefined {
    let best: NavNode | undefined;
    let bestD = Infinity;
    for (const n of this.navGraph.nodes.values()) {
      const d = Math.hypot(n.x - fromX, (n.y - fromY) * 2);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    return best;
  }

  private computeReturnPath(fromX: number, fromY: number, targetRoom: PlacedRoom): NavNode[] {
    let destNode: NavNode | undefined;
    for (const n of this.navGraph.nodes.values()) {
      if (n.roomId === targetRoom.id) {
        destNode = n;
        break;
      }
    }
    if (!destNode) return [];
    const startNode = this.nearestNavNode(fromX, fromY);
    if (!startNode) return [];
    return this.navGraph.findPath(startNode.id, destNode.id);
  }

  /**
   * Synchronize creatures cleanly against read-only state:
   * - Never spawns or keeps `away` creatures
   * - Tamed `roamsFreely` companions need 0 pen slots & wander via NavGraph
   * - Pen visibility caps: <= 3 in 1x1 pens, <= 5 in larger pens, <= 40 globally (never hiding egg or loose)
   * - Emits hatch / bond / recapture transitions
   */
  syncState(state: FullGameState): void {
    this.hiddenCounts.clear();
    this.wizardPawRooms.clear();

    const creatures = state.creatures || [];
    const rooms = state.rooms || [];
    const topBound = this.topWorldBound(state);
    const resolutionMap = resolveAllCreatureRooms(creatures, rooms);

    // Priority sort: loose & eggs ALWAYS drawn first
    const prioritized = [...creatures]
      .filter(c => c.status !== 'away')
      .sort((a, b) => {
        const rank = (s: CreatureInstance['status']) => (s === 'loose' ? 0 : s === 'egg' ? 1 : 2);
        return rank(a.status) - rank(b.status) || a.id - b.id;
      });

    const visible: Array<{
      creature: CreatureInstance;
      room: PlacedRoom | undefined;
      unhomed: boolean;
      roaming: boolean;
      bay: number;
    }> = [];
    const penVisibleCount = new Map<number, number>();

    for (const c of prioritized) {
      if (c.status === 'loose') {
        visible.push({ creature: c, room: undefined, unhomed: false, roaming: false, bay: 0 });
        continue;
      }
      const resolved = resolutionMap.get(c.id);
      const room = resolved?.room;
      const unhomed = !!resolved?.unhomed;
      const roaming = !!resolved?.roaming && isRoamingCompanion(c);
      const bay = resolved?.subBayIndex ?? 0;

      if (room && !unhomed && !roaming && c.status !== 'egg') {
        const cap = penCreatureCapacity(room);
        const already = penVisibleCount.get(room.id) ?? 0;
        if (already >= cap) {
          this.hiddenCounts.set(room.id, (this.hiddenCounts.get(room.id) ?? 0) + 1);
          continue;
        }
        penVisibleCount.set(room.id, already + 1);
      }

      if (visible.length >= MAX_VISIBLE_CREATURES) {
        if (room && !unhomed && !roaming) {
          this.hiddenCounts.set(room.id, (this.hiddenCounts.get(room.id) ?? 0) + 1);
        }
        continue;
      }
      visible.push({ creature: c, room, unhomed, roaming, bay });
    }

    const activeIds = new Set<number>();

    for (const item of visible) {
      const c = item.creature;
      activeIds.add(c.id);
      const def = CREATURE_DEFINITIONS[c.defId];
      const primaryHabitat: HabitatType = def?.habitats?.[0] ?? 'meadow';
      const movement: CreatureMovement = def?.movement ?? 'trot';
      const origin: CreatureOrigin = def?.origin ?? 'egg';
      const prevStatus = this.prevStatuses.get(c.id);
      const prevBond = this.prevBonds.get(c.id);
      this.prevStatuses.set(c.id, c.status);
      this.prevBonds.set(c.id, c.bondLevel ?? 1);

      const wizardPaw =
        c.status === 'wary' &&
        def?.rarity === 'common' &&
        (state.wizard?.levels?.nature ?? 0) >= 3 &&
        c.tamerId === 0;
      if (wizardPaw && item.room) {
        this.wizardPawRooms.add(item.room.id);
      }

      const existing = this.agents.get(c.id);
      const reduceMotion = !!state.settings?.reduceMotion;

      if (!existing) {
        let sx = 400;
        let sy = this.groundY - 4;
        let tx = sx;
        let ty = sy;

        if (c.status === 'loose') {
          const eh = rooms.find(r => r.defId === 'entrance_hall');
          const baseBox = eh ? roomToWorldBox(eh, this.groundY) : { left: 600, top: this.groundY - 48, width: 128, height: 48, floorLineY: this.groundY - 4 };
          const randX = baseBox.left + baseBox.width * (0.2 + 0.6 * hashSeed(c.id, 1));
          const clamped = this.clampWorldPoint(randX, baseBox.floorLineY, topBound);
          sx = tx = clamped.x;
          sy = ty = clamped.y;
        } else if (item.unhomed) {
          const eh = rooms.find(r => r.defId === 'entrance_hall');
          if (eh) {
            const box = roomToWorldBox(eh, this.groundY);
            sx = tx = box.left + 12 + hashSeed(c.id, 2) * 18;
            sy = ty = box.floorLineY;
          }
        } else if (item.roaming) {
          const explicit = c.roomId !== undefined ? rooms.find(r => r.id === c.roomId && r.state === 'built') : undefined;
          const startRoom = explicit || rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall') || rooms.find(r => r.state === 'built');
          if (startRoom) {
            const box = roomToWorldBox(startRoom, this.groundY);
            sx = tx = box.left + box.width * (0.25 + 0.5 * hashSeed(c.id, 4));
            sy = ty = box.floorLineY;
          }
        } else if (item.room) {
          const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
          const span = Math.max(4, pen.right - pen.left);
          if (c.status === 'wary') {
            sx = tx = pen.right - Math.min(span * 0.25, 10 + hashSeed(c.id, 3) * 8);
            sy = ty = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
          } else if ((movement === 'fly' || movement === 'glide') && pen.perches && pen.perches.length > 0) {
            const bar = pen.perches[Math.floor(hashSeed(c.id, 13) * pen.perches.length)];
            sx = tx = bar.x;
            sy = ty = bar.y;
          } else if (movement === 'rooted') {
            sx = tx = pen.left + span * (0.32 + 0.36 * hashSeed(c.id, 4));
            sy = ty = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
          } else {
            sx = tx = pen.left + span * (0.2 + 0.6 * hashSeed(c.id, 4));
            sy = ty = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
          }
        }
        const isFlyer = movement === 'fly' || movement === 'glide';
        const spawnPerchY =
          isFlyer && item.room && !item.unhomed && !item.roaming && c.status !== 'wary'
            ? (() => {
                const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
                return pen.perches && pen.perches.length > 0 ? sy : undefined;
              })()
            : undefined;

        this.agents.set(c.id, {
          creatureId: c.id,
          defId: c.defId,
          nickname: c.nickname,
          status: c.status,
          habitat: primaryHabitat,
          movement,
          origin,
          roaming: item.roaming,
          roomId: item.room?.id,
          x: sx,
          y: sy,
          anchorX: sx,
          facing: hashSeed(c.id, 5) > 0.5 ? 'R' : 'L',
          anim: 'idle',
          frame: 0,
          phase: hashSeed(c.id, 6) * Math.PI * 2,
          stateTimerMs: isFlyer ? 400 + hashSeed(c.id, 7) * 700 : 1000 + hashSeed(c.id, 7) * 2000,
          resting: movement === 'scurry' || isFlyer,
          targetX: tx,
          targetY: ty,
          unhomed: item.unhomed,
          tamingProgress: c.tamingProgress ?? 0,
          bondLevel: c.bondLevel ?? 1,
          hungry: !!c.hungry,
          hatchProgress: c.hatchProgress ?? 0,
          tamerId: c.tamerId,
          wizardTamingPaw: wizardPaw,
          returnPath: [],
          returnPathIdx: 0,
          roamPath: [],
          roamPathIdx: 0,
          roamNapTimerMs: 0,
          looseNextSwitchMs: 12000 + hashSeed(c.id, 8) * 16000,
          flightMode: isFlyer ? 'perch' : undefined,
          flightPhaseMs: 0,
          perchY: spawnPerchY
        });
      } else {
        existing.status = c.status;
        existing.nickname = c.nickname;
        existing.habitat = primaryHabitat;
        existing.movement = movement;
        existing.origin = origin;
        existing.roaming = item.roaming;
        existing.roomId = item.room?.id;
        existing.unhomed = item.unhomed;
        existing.tamingProgress = c.tamingProgress ?? 0;
        existing.bondLevel = c.bondLevel ?? 1;
        existing.hungry = !!c.hungry;
        existing.hatchProgress = c.hatchProgress ?? 0;
        existing.tamerId = c.tamerId;
        existing.wizardTamingPaw = wizardPaw;

        if (!reduceMotion && prevStatus === 'egg' && c.status === 'wary') {
          this.bursts.push({ creatureId: c.id, kind: 'hatch', x: existing.x, y: existing.y - 8, startMs: this.clockMs, durationMs: 1000 });
        }
        if (!reduceMotion && prevStatus === 'wary' && c.status === 'tamed') {
          this.bursts.push({ creatureId: c.id, kind: 'tamed', x: existing.x, y: existing.y - 10, startMs: this.clockMs, durationMs: 1000 });
        }
        if (!reduceMotion && prevBond !== undefined && c.bondLevel > prevBond) {
          this.bursts.push({ creatureId: c.id, kind: 'bond', x: existing.x, y: existing.y - 10, startMs: this.clockMs, durationMs: 1200 });
        }

        if (prevStatus === 'loose' && (c.status === 'tamed' || c.status === 'wary')) {
          if (item.roaming) {
            // Roaming companion recaptured: snaps/walks back into roam nav cleanly
            existing.returnPath = [];
            existing.returnPathIdx = 0;
            existing.roamPath = [];
            existing.roamPathIdx = 0;
          } else if (item.room) {
            if (reduceMotion) {
              const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
              existing.x = existing.targetX = existing.anchorX = (pen.left + pen.right) / 2;
              existing.y = existing.targetY = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
              existing.returnPath = [];
              existing.returnPathIdx = 0;
            } else {
              const route = this.computeReturnPath(existing.x, existing.y, item.room);
              const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
              const homeX = c.status === 'wary' ? pen.right - 6 : (pen.left + pen.right) / 2;
              const homeY = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
              existing.anchorX = homeX;
              existing.returnPath = [
                ...route,
                { id: `pen-${c.id}`, roomId: item.room.id, x: homeX, y: homeY, floor: item.room.y, kind: 'room_floor' }
              ];
              existing.returnPathIdx = 0;
            }
          }
        } else if (c.status !== 'loose' && !item.roaming && existing.returnPath.length === 0) {
          if (item.unhomed) {
            const eh = rooms.find(r => r.defId === 'entrance_hall');
            if (eh) {
              const box = roomToWorldBox(eh, this.groundY);
              existing.x = existing.targetX = existing.anchorX = box.left + 12 + hashSeed(c.id, 2) * 18;
              existing.y = existing.targetY = box.floorLineY;
            }
          } else if (item.room) {
            const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
            const isFlyer = movement === 'fly' || movement === 'glide';
            const clampX = Math.max(pen.left, Math.min(pen.right, existing.x));
            if (isFlyer && pen.perches && pen.perches.length > 0 && c.status !== 'wary') {
              const outOfCage = Math.abs(clampX - existing.x) > 12 || existing.y < pen.skyTopY - 6 || existing.y > pen.floorY + 12;
              if (outOfCage) {
                const bar = pen.perches[Math.floor(hashSeed(c.id, 13) * pen.perches.length)];
                existing.x = existing.targetX = existing.anchorX = bar.x;
                existing.y = existing.targetY = existing.perchY = bar.y;
                existing.flightMode = 'perch';
              }
            } else if (Math.abs(clampX - existing.x) > 12 || Math.abs(existing.y - pen.floorY) > 64) {
              existing.x = existing.targetX = existing.anchorX = (pen.left + pen.right) / 2;
              existing.y = existing.targetY = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
            }
          }
        }
      }
    }

    for (const id of Array.from(this.agents.keys())) {
      if (!activeIds.has(id)) {
        this.agents.delete(id);
      }
    }

    const stateIds = new Set(creatures.map(c => c.id));
    for (const id of Array.from(this.prevStatuses.keys())) {
      if (!stateIds.has(id)) {
        this.prevStatuses.delete(id);
        this.prevBonds.delete(id);
      }
    }
  }

  tick(
    deltaMs: number,
    state: FullGameState,
    reduceMotion: boolean,
    charAgents?: Map<string, VisualAgent>,
    nowMs?: number
  ): void {
    const gap = this.consumeTime(deltaMs, nowMs);
    if (!reduceMotion) {
      this.clockMs += gap;
    }

    if (this.agents.size === 0 && (state.creatures?.length ?? 0) > 0) {
      this.syncState(state);
    }

    this.bursts = reduceMotion
      ? []
      : this.bursts.filter(b => this.clockMs - b.startMs < b.durationMs);

    const topBound = this.topWorldBound(state);
    const rooms = state.rooms || [];

    for (const agent of this.agents.values()) {
      if (reduceMotion) {
        agent.anim = 'idle';
        agent.frame = 0;
        if (agent.returnPath.length > 0) {
          const end = agent.returnPath[agent.returnPath.length - 1];
          agent.x = end.x;
          agent.y = end.y;
          agent.returnPath = [];
          agent.returnPathIdx = 0;
        }
        if (agent.roamPath.length > 0) {
          agent.roamPath = [];
          agent.roamPathIdx = 0;
        }
        if (agent.flightMode && agent.flightMode !== 'perch') {
          const r = agent.roomId !== undefined ? rooms.find(rm => rm.id === agent.roomId) : undefined;
          if (r) {
            const pen = getPenRect(r, this.groundY, agent.habitat);
            if (pen.perches && pen.perches.length > 0) {
              const bar = pen.perches.reduce((best, b) => (Math.abs(b.x - agent.x) < Math.abs(best.x - agent.x) ? b : best), pen.perches[0]);
              agent.y = bar.y;
              agent.perchY = bar.y;
            } else {
              agent.y = pen.floorY;
            }
          }
          agent.flightMode = 'perch';
        }
        continue;
      }

      if (agent.status === 'egg') {
        agent.anim = 'idle';
        agent.frame = Math.floor(this.clockMs / 250) % 4;
        continue;
      }

      // 1. Returning home from Loose state
      if (agent.returnPath.length > 0 && agent.returnPathIdx < agent.returnPath.length) {
        const wp = agent.returnPath[agent.returnPathIdx];
        const dx = wp.x - agent.x;
        const dy = wp.y - agent.y;
        const dist = Math.hypot(dx, dy);
        const speed = 34 * (gap / 1000);
        if (dist <= 3) {
          agent.x = wp.x;
          agent.y = wp.y;
          agent.returnPathIdx++;
          if (agent.returnPathIdx >= agent.returnPath.length) {
            agent.returnPath = [];
            agent.returnPathIdx = 0;
            agent.anim = 'idle';
          }
        } else {
          if (Math.abs(dx) > 0.5) agent.facing = dx > 0 ? 'R' : 'L';
          agent.x += (dx / dist) * Math.min(speed, dist);
          agent.y += (dy / dist) * Math.min(speed, dist);
          agent.anim = 'move';
          agent.frame = Math.floor(this.clockMs / 150) % 6;
        }
        continue;
      }

      // 2. Unhomed outside Entrance Hall
      if (agent.unhomed) {
        agent.anim = 'idle';
        agent.frame = Math.floor(this.clockMs / 350) % 4;
        continue;
      }

      // 3. Loose creatures wander across reachable world inside strict bounds
      if (agent.status === 'loose') {
        this.tickLooseCreature(agent, gap, topBound);
        continue;
      }

      // 4. Tamed roaming companions wander castle & grounds freely, nap in occupied rooms, follow tamer
      if (agent.roaming && agent.status === 'tamed') {
        this.tickRoamingCompanion(agent, gap, state, charAgents);
        continue;
      }

      // 5. Pen behaviour (per-species movement)
      const room = agent.roomId !== undefined ? rooms.find(r => r.id === agent.roomId) : undefined;
      if (!room) continue;
      const pen = getPenRect(room, this.groundY, agent.habitat, Math.floor(hashSeed(agent.creatureId, 9) * 3));

      const tamerAgent = agent.tamerId !== undefined && agent.tamerId !== null ? charAgents?.get(`char-${agent.tamerId}`) : undefined;
      const tamerPresent = !!(tamerAgent && tamerAgent.currentRoomId === room.id);

      if (agent.status === 'wary') {
        const backX = pen.right - Math.min(10, (pen.right - pen.left) * 0.25);
        agent.targetX = backX;
        agent.facing = 'L';
        const dx = agent.targetX - agent.x;
        if (Math.abs(dx) > 1.5) {
          agent.x += Math.sign(dx) * Math.min(18 * (gap / 1000), Math.abs(dx));
          agent.anim = 'move';
        } else {
          agent.anim = 'idle';
        }
        agent.y = pen.isWater ? (pen.topY + pen.floorY) / 2 + Math.sin(agent.phase + this.clockMs / 500) * 1.5 : pen.floorY;
        agent.frame = Math.floor(this.clockMs / 240) % 4;
        continue;
      }

      if (agent.hungry) {
        const frontX = pen.left + Math.min(14, (pen.right - pen.left) * 0.28);
        const dx = frontX - agent.x;
        if (Math.abs(dx) > 2) {
          agent.facing = dx > 0 ? 'R' : 'L';
          agent.x += Math.sign(dx) * Math.min(20 * (gap / 1000), Math.abs(dx));
          agent.anim = 'move';
        } else {
          agent.anim = 'idle';
        }
        agent.y = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
        agent.frame = Math.floor(this.clockMs / 250) % 4;
        continue;
      }

      if (tamerPresent && tamerAgent) {
        const approachX = Math.max(pen.left, Math.min(pen.right, tamerAgent.x));
        const dx = approachX - agent.x;
        if (Math.abs(dx) > 4) {
          agent.facing = dx > 0 ? 'R' : 'L';
          agent.x += Math.sign(dx) * Math.min(24 * (gap / 1000), Math.abs(dx));
          agent.anim = 'move';
        } else {
          agent.anim = 'idle';
        }
        agent.y = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
        agent.frame = Math.floor(this.clockMs / 200) % 4;
        continue;
      }

      this.tickMovementBehavior(agent, pen, gap);
    }
  }

  private tickRoamingCompanion(
    agent: CreatureVisualAgent,
    gapMs: number,
    state: FullGameState,
    charAgents?: Map<string, VisualAgent>
  ): void {
    const dt = gapMs / 1000;

    if (agent.hungry) {
      // Hungry companion lingers near entrance hall or refectory
      agent.anim = 'idle';
      agent.frame = Math.floor(this.clockMs / 260) % 4;
      if (agent.roamPath.length === 0) {
        const ref = state.rooms.find(r => r.state === 'built' && (r.defId === 'refectory' || r.defId === 'entrance_hall'));
        if (ref) agent.roamPath = this.computeReturnPath(agent.x, agent.y, ref);
        agent.roamPathIdx = 0;
      }
      if (agent.roamPath.length > 0 && agent.roamPathIdx < agent.roamPath.length) {
        this.stepAlongRoamPath(agent, dt, gapMs, state);
      }
      return;
    }

    if (agent.roamNapTimerMs > 0) {
      agent.roamNapTimerMs -= gapMs;
      agent.anim = 'sleep';
      agent.frame = Math.floor(this.clockMs / 400) % 2;
      return;
    }

    if (agent.roamPath.length > 0 && agent.roamPathIdx < agent.roamPath.length) {
      this.stepAlongRoamPath(agent, dt, gapMs, state);
      return;
    }

    agent.stateTimerMs -= gapMs;
    agent.anim = 'idle';
    agent.frame = Math.floor(this.clockMs / 300) % 4;
    if (agent.stateTimerMs > 0) return;

    // Pick next roaming target across built castle rooms & grounds via NavGraph
    const startNode = this.nearestNavNode(agent.x, agent.y);
    if (!startNode || this.navGraph.nodes.size === 0) {
      agent.stateTimerMs = 1500;
      return;
    }

    const tamerAgent = agent.tamerId !== undefined && agent.tamerId !== null ? charAgents?.get(`char-${agent.tamerId}`) : undefined;
    const seed = Math.floor(this.clockMs / 400) + agent.creatureId * 13;
    const rPick = hashSeed(agent.creatureId, seed);

    let destNode: NavNode | undefined;

    // Sometimes follow tamer to their current room
    if (tamerAgent?.currentRoomId && rPick < 0.4) {
      const tamerNodes = Array.from(this.navGraph.nodes.values()).filter(n => n.roomId === tamerAgent.currentRoomId);
      if (tamerNodes.length > 0) {
        destNode = tamerNodes[Math.floor(hashSeed(agent.creatureId, seed + 1) * tamerNodes.length)];
      }
    }

    if (!destNode) {
      const occupiedRoomIds = new Set<number>();
      for (const ch of state.characters || []) {
        if (ch.bedRoomId) occupiedRoomIds.add(ch.bedRoomId);
        if (ch.seatRoomId) occupiedRoomIds.add(ch.seatRoomId);
        if (ch.workplaceRoomId) occupiedRoomIds.add(ch.workplaceRoomId);
      }
      for (const a of charAgents?.values() ?? []) {
        if (a.currentRoomId) occupiedRoomIds.add(a.currentRoomId);
      }

      const candidates = Array.from(this.navGraph.nodes.values()).filter(n => n.id !== startNode.id);
      const preferred = candidates.filter(n => n.roomId !== undefined && occupiedRoomIds.has(n.roomId));
      const pool = preferred.length > 0 && rPick < 0.72 ? preferred : candidates;
      if (pool.length > 0) {
        destNode = pool[Math.floor(hashSeed(agent.creatureId, seed + 2) * pool.length)];
      }
    }

    if (destNode) {
      const path = this.navGraph.findPath(startNode.id, destNode.id);
      if (path.length > 0) {
        agent.roamPath = path;
        agent.roamPathIdx = 0;
        agent.stateTimerMs = 2000;
        return;
      }
    }
    agent.stateTimerMs = 1200;
  }

  private stepAlongRoamPath(agent: CreatureVisualAgent, dt: number, gapMs: number, state: FullGameState): void {
    const wp = agent.roamPath[agent.roamPathIdx];
    const dx = wp.x - agent.x;
    const dy = wp.y - agent.y;
    const dist = Math.hypot(dx, dy);
    const baseSpeed = agent.movement === 'scurry' ? 42 : agent.movement === 'hop' ? 28 : agent.movement === 'hover' ? 24 : 26;
    const speed = baseSpeed * dt;

    if (dist <= 3) {
      agent.x = wp.x;
      agent.y = wp.y;
      agent.roamPathIdx++;
      if (agent.roamPathIdx >= agent.roamPath.length) {
        agent.roamPath = [];
        agent.roamPathIdx = 0;
        const arrivedRoom = wp.roomId !== undefined ? state.rooms.find(r => r.id === wp.roomId && r.area === 'castle') : undefined;
        const hasPeople = arrivedRoom && state.characters.some(c => c.bedRoomId === arrivedRoom.id || c.seatRoomId === arrivedRoom.id || c.workplaceRoomId === arrivedRoom.id);
        if (hasPeople && hashSeed(agent.creatureId, Math.floor(this.clockMs / 500)) < 0.55) {
          agent.roamNapTimerMs = 2200 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 300)) * 2200;
          agent.anim = 'sleep';
        } else {
          agent.stateTimerMs = 1200 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 300)) * 1800;
          agent.anim = 'idle';
        }
      }
      return;
    }

    if (Math.abs(dx) > 0.4) agent.facing = dx > 0 ? 'R' : 'L';
    agent.x += (dx / dist) * Math.min(speed, dist);
    const hopOffset = agent.movement === 'hop' && Math.abs(dy) < 2 ? -Math.abs(Math.sin(this.clockMs / 140)) * 4.5 : 0;
    const hoverOffset = agent.movement === 'hover' && Math.abs(dy) < 2 ? -5 - Math.sin(this.clockMs / 250) * 1.5 : 0;
    agent.y += (dy / dist) * Math.min(speed, dist) + hopOffset * 0 + hoverOffset * 0;
    agent.anim = 'move';
    agent.frame = Math.floor(this.clockMs / (agent.movement === 'scurry' ? 100 : 160)) % 6;
  }

  /**
   * 11 distinct per-species movements:
   * scurry, hop, trot, waddle, slither, fly, glide, swim, hover, rooted, crawl
   */
  private tickMovementBehavior(agent: CreatureVisualAgent, pen: PenRect, gapMs: number): void {
    const dt = gapMs / 1000;
    const cx = (pen.left + pen.right) / 2;
    const spanX = Math.max(8, pen.right - pen.left);
    const rx = spanX * 0.38;

    switch (agent.movement) {
      case 'rooted': {
        // Stays planted in soil/spot: total displacement from home anchor <= 2px
        const anchor = Math.max(pen.left + 2, Math.min(pen.right - 2, agent.anchorX || cx));
        agent.anchorX = anchor;
        agent.x = anchor + Math.sin(this.clockMs / 900 + agent.phase) * 0.8;
        agent.y = pen.floorY;
        agent.anim = 'idle';
        agent.frame = Math.floor(this.clockMs / 450) % 2;
        break;
      }

      case 'swim': {
        agent.phase += dt * 1.45;
        const nextX = cx + Math.sin(agent.phase) * rx;
        const midY = (pen.topY + pen.floorY) / 2;
        const ry = Math.max(2, (pen.floorY - pen.topY) * 0.36);
        const nextY = midY + Math.sin(agent.phase * 2) * ry;
        if (Math.abs(nextX - agent.x) > 0.05) agent.facing = nextX > agent.x ? 'R' : 'L';
        agent.x = Math.max(pen.left, Math.min(pen.right, nextX));
        agent.y = Math.max(pen.topY, Math.min(pen.floorY, nextY));
        agent.anim = 'move';
        agent.frame = Math.floor(this.clockMs / 160) % 6;
        break;
      }

      case 'hover': {
        agent.phase += dt * 1.65;
        const hoverY = pen.floorY - 9 - Math.sin(agent.phase * 1.4) * 3.5;
        const orbitX = cx + Math.cos(agent.phase * 0.75) * rx;
        if (Math.abs(orbitX - agent.x) > 0.05) agent.facing = orbitX > agent.x ? 'R' : 'L';
        agent.x = Math.max(pen.left, Math.min(pen.right, orbitX));
        agent.y = Math.max(pen.topY + 4, Math.min(pen.floorY - 2, hoverY));
        agent.anim = 'idle';
        agent.frame = Math.floor(this.clockMs / 220) % 4;
        break;
      }

      case 'fly':
      case 'glide': {
        const isGlide = agent.movement === 'glide';
        if (pen.perches && pen.perches.length > 0) {
          // Aviary perch-bar flight: perch on painted bars, takeoff ~60% toward skyTopY (>=8px below roof),
          // cruise horizontally inside the cage with per-creature height variation, and land back on a bar.
          const perches = pen.perches;
          const homeBar = perches[Math.floor(hashSeed(agent.creatureId, 13) * perches.length)];
          const sixtyPctY = homeBar.y - 0.6 * (homeBar.y - pen.skyTopY);
          const isUpperBar = homeBar.y <= pen.skyTopY + 26;
          const jitter = isUpperBar
            ? (hashSeed(agent.creatureId, 21) - 0.15) * 6.5
            : (hashSeed(agent.creatureId, 21) - 0.5) * 7.0;
          const minCruiseY = pen.skyTopY + 8; // >= 8px below skyTopY (and >= 18px below roof)
          const targetCruiseY = Math.max(minCruiseY, Math.min(pen.floorY - 12, sixtyPctY + jitter));

          if (!agent.flightMode) agent.flightMode = 'perch';
          if (agent.cruiseY === undefined || agent.cruiseY < minCruiseY || agent.cruiseY > pen.floorY - 12) {
            agent.cruiseY = targetCruiseY;
          }
          const matchedPerch = perches.find(b => Math.abs(b.y - (agent.perchY ?? -1)) <= 1.5);
          if (!matchedPerch) agent.perchY = homeBar.y;

          agent.stateTimerMs -= gapMs;
          if (agent.flightMode === 'perch') {
            const curBar = perches.find(b => Math.abs(b.y - (agent.perchY ?? homeBar.y)) <= 1.5) ?? homeBar;
            if (Math.abs(agent.y - curBar.y) > 2) {
              // Returning smoothly to perch bar after leaving it (e.g. wary/tamer)
              agent.flightMode = 'takeoff';
              agent.flightPhaseMs = 0;
              agent.flightStartX = agent.x;
              agent.flightStartY = agent.y;
              agent.cruiseY = targetCruiseY;
              agent.targetX = curBar.x;
              agent.perchY = curBar.y;
              agent.facing = agent.targetX >= agent.x ? 'R' : 'L';
            } else {
              agent.y = curBar.y;
              agent.anim = 'idle';
              agent.frame = Math.floor(this.clockMs / 320) % 4;
              if (agent.stateTimerMs <= 0) {
                agent.flightMode = 'takeoff';
                agent.flightPhaseMs = 0;
                agent.flightStartX = agent.x;
                agent.flightStartY = agent.y;
                agent.cruiseY = targetCruiseY;
                const pick = hashSeed(agent.creatureId, Math.floor(this.clockMs / 500) + 1);
                agent.targetX =
                  agent.x > cx
                    ? pen.left + spanX * (0.12 + pick * 0.24)
                    : pen.right - spanX * (0.12 + pick * 0.24);
                agent.facing = agent.targetX >= agent.x ? 'R' : 'L';
              }
            }
          } else if (agent.flightMode === 'takeoff') {
            agent.flightPhaseMs = (agent.flightPhaseMs ?? 0) + gapMs;
            const u = Math.min(1, agent.flightPhaseMs / 400);
            const startY = agent.flightStartY ?? homeBar.y;
            agent.y = Math.max(pen.skyTopY, Math.min(pen.floorY, startY + (agent.cruiseY - startY) * u));
            const dx = agent.targetX - agent.x;
            if (Math.abs(dx) > 0.2) agent.facing = dx > 0 ? 'R' : 'L';
            agent.x = Math.max(
              pen.left,
              Math.min(pen.right, agent.x + Math.sign(dx) * Math.min((isGlide ? 16 : 22) * dt, Math.abs(dx)))
            );
            agent.anim = 'move';
            agent.frame = Math.floor(this.clockMs / (isGlide ? 185 : 100)) % 6;
            if (u >= 1) {
              agent.y = agent.cruiseY;
              agent.flightMode = 'cruise';
              agent.stateTimerMs = isGlide ? 2200 : 1800;
              agent.targetX = agent.x > cx ? pen.left + 3 : pen.right - 3;
            }
          } else if (agent.flightMode === 'cruise') {
            const speed = isGlide ? 16 : 26;
            if (Math.abs(agent.targetX - agent.x) <= 2) {
              agent.targetX = agent.x > cx ? pen.left + 3 : pen.right - 3;
            }
            const dirX = agent.targetX - agent.x;
            if (Math.abs(dirX) > 0.2) agent.facing = dirX > 0 ? 'R' : 'L';
            agent.x = Math.max(
              pen.left,
              Math.min(pen.right, agent.x + Math.sign(dirX) * Math.min(speed * dt, Math.abs(dirX)))
            );
            const rippleAmp = isGlide ? 0.45 : 0.75;
            const rippleSpeed = isGlide ? 340 : 180;
            agent.y = Math.max(
              minCruiseY,
              Math.min(pen.floorY - 8, agent.cruiseY + Math.sin(this.clockMs / rippleSpeed + agent.phase) * rippleAmp)
            );
            agent.anim = 'move';
            agent.frame = Math.floor(this.clockMs / (isGlide ? 220 : 105)) % 6;
            if (agent.stateTimerMs <= 0) {
              const otherBars = perches.filter(b => Math.abs(b.y - (agent.perchY ?? -1)) > 2);
              const pickRoll = hashSeed(agent.creatureId, Math.floor(this.clockMs / 400) + 19);
              const pool = otherBars.length > 0 && pickRoll < 0.78 ? otherBars : perches;
              const destBar = pool[Math.floor(hashSeed(agent.creatureId, Math.floor(this.clockMs / 400) + 23) * pool.length)];
              agent.flightMode = 'land';
              agent.flightPhaseMs = 0;
              agent.flightStartX = agent.x;
              agent.flightStartY = agent.y;
              agent.targetX = destBar.x;
              agent.perchY = destBar.y;
              agent.facing = destBar.x >= agent.x ? 'R' : 'L';
            }
          } else {
            // Land smoothly onto chosen perch bar (both x and y converge onto the bar)
            agent.flightPhaseMs = (agent.flightPhaseMs ?? 0) + gapMs;
            const u = Math.min(1, agent.flightPhaseMs / 440);
            const startX = agent.flightStartX ?? agent.x;
            const startY = agent.flightStartY ?? agent.cruiseY;
            const destY = agent.perchY ?? homeBar.y;
            agent.x = Math.max(pen.left, Math.min(pen.right, startX + (agent.targetX - startX) * u));
            agent.y = Math.max(pen.skyTopY, Math.min(pen.floorY, startY + (destY - startY) * u));
            agent.anim = 'move';
            agent.frame = Math.floor(this.clockMs / 165) % 6;
            if (u >= 1) {
              agent.x = agent.targetX;
              agent.y = destY;
              agent.flightMode = 'perch';
              agent.anim = 'idle';
              agent.stateTimerMs =
                (isGlide ? 2200 : 1600) + hashSeed(agent.creatureId, Math.floor(this.clockMs / 400)) * 1600;
            }
          }
          break;
        }

        // Non-aviary fly/glide pens (e.g. Menagerie sky bay)
        const availSky = Math.max(18, pen.floorY - pen.skyTopY);
        const heightFrac = 0.42 + 0.42 * hashSeed(agent.creatureId, 21);
        const targetCruiseY = Math.max(
          pen.skyTopY,
          pen.floorY - Math.min(availSky - 4, Math.max(24, availSky * heightFrac))
        );
        const perchLevels = availSky >= 48
          ? [pen.floorY, pen.floorY - Math.round(availSky * 0.34), pen.floorY - Math.round(availSky * 0.62)]
          : [pen.floorY];
        if (!agent.flightMode) agent.flightMode = 'perch';
        if (agent.cruiseY === undefined) agent.cruiseY = targetCruiseY;
        if (agent.perchY === undefined) agent.perchY = pen.floorY;

        agent.stateTimerMs -= gapMs;
        if (agent.flightMode === 'perch') {
          agent.y = Math.max(pen.skyTopY, Math.min(pen.floorY, agent.perchY));
          agent.anim = 'idle';
          agent.frame = Math.floor(this.clockMs / 320) % 4;
          if (agent.stateTimerMs <= 0) {
            agent.flightMode = 'takeoff';
            agent.flightPhaseMs = 0;
            agent.flightStartY = agent.y;
            agent.cruiseY = targetCruiseY;
            const pick = hashSeed(agent.creatureId, Math.floor(this.clockMs / 500) + 1);
            agent.targetX = agent.x > cx ? pen.left + spanX * (0.1 + pick * 0.25) : pen.right - spanX * (0.1 + pick * 0.25);
            agent.facing = agent.targetX >= agent.x ? 'R' : 'L';
          }
        } else if (agent.flightMode === 'takeoff') {
          agent.flightPhaseMs = (agent.flightPhaseMs ?? 0) + gapMs;
          const u = Math.min(1, agent.flightPhaseMs / 360);
          const startY = agent.flightStartY ?? pen.floorY;
          agent.y = Math.max(pen.skyTopY, Math.min(pen.floorY, startY + (agent.cruiseY - startY) * u));
          agent.x = Math.max(
            pen.left,
            Math.min(pen.right, agent.x + Math.sign(agent.targetX - agent.x) * Math.min(18 * dt, Math.abs(agent.targetX - agent.x)))
          );
          agent.anim = 'move';
          agent.frame = Math.floor(this.clockMs / (isGlide ? 190 : 100)) % 6;
          if (u >= 1) {
            agent.flightMode = 'cruise';
            agent.stateTimerMs = isGlide ? 2200 : 1800;
          }
        } else if (agent.flightMode === 'cruise') {
          const speed = isGlide ? 16 : 26;
          const dx = agent.targetX - agent.x;
          if (Math.abs(dx) <= 2) {
            agent.targetX = agent.x > cx ? pen.left + 2 : pen.right - 2;
          }
          const dirX = agent.targetX - agent.x;
          if (Math.abs(dirX) > 0.2) agent.facing = dirX > 0 ? 'R' : 'L';
          agent.x = Math.max(pen.left, Math.min(pen.right, agent.x + Math.sign(dirX) * Math.min(speed * dt, Math.abs(dirX))));
          const rippleAmp = isGlide ? 0.8 : 1.5;
          const rippleSpeed = isGlide ? 340 : 170;
          agent.y = Math.max(
            pen.skyTopY,
            Math.min(pen.floorY, agent.cruiseY + Math.sin(this.clockMs / rippleSpeed + agent.phase) * rippleAmp)
          );
          agent.anim = 'move';
          agent.frame = Math.floor(this.clockMs / (isGlide ? 240 : 105)) % 6;
          if (agent.stateTimerMs <= 0) {
            agent.flightMode = 'land';
            agent.flightPhaseMs = 0;
            agent.flightStartY = agent.y;
            const perchIdx = Math.floor(hashSeed(agent.creatureId, Math.floor(this.clockMs / 400) + 19) * perchLevels.length);
            agent.perchY = Math.max(pen.skyTopY, Math.min(pen.floorY, perchLevels[perchIdx] ?? pen.floorY));
          }
        } else {
          // Land smoothly onto chosen perch inside the pen
          agent.flightPhaseMs = (agent.flightPhaseMs ?? 0) + gapMs;
          const u = Math.min(1, agent.flightPhaseMs / 360);
          const startY = agent.flightStartY ?? agent.cruiseY;
          const destY = agent.perchY ?? pen.floorY;
          agent.y = Math.max(pen.skyTopY, Math.min(pen.floorY, startY + (destY - startY) * u));
          agent.anim = 'move';
          agent.frame = Math.floor(this.clockMs / 180) % 6;
          if (u >= 1) {
            agent.y = destY;
            agent.flightMode = 'perch';
            agent.stateTimerMs = (isGlide ? 2200 : 1600) + hashSeed(agent.creatureId, Math.floor(this.clockMs / 400)) * 1600;
          }
        }
        break;
      }

      case 'scurry': {
        agent.stateTimerMs -= gapMs;
        if (agent.resting) {
          agent.y = pen.floorY;
          agent.anim = 'idle';
          agent.frame = Math.floor(this.clockMs / 360) % 4;
          if (agent.stateTimerMs <= 0) {
            agent.resting = false;
            agent.targetX = agent.x < cx ? pen.right - 2 : pen.left + 2;
            agent.stateTimerMs = 1100;
          }
        } else {
          const dx = agent.targetX - agent.x;
          if (Math.abs(dx) <= 2 || agent.stateTimerMs <= 0) {
            agent.x = Math.max(pen.left, Math.min(pen.right, agent.targetX));
            agent.resting = true;
            agent.stateTimerMs = 2000 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 500)) * 2800;
            agent.anim = 'idle';
          } else {
            agent.facing = dx > 0 ? 'R' : 'L';
            agent.x += Math.sign(dx) * Math.min(52 * dt, Math.abs(dx));
            agent.y = pen.floorY;
            agent.anim = 'move';
            agent.frame = Math.floor(this.clockMs / 85) % 6;
          }
        }
        break;
      }

      case 'hop': {
        // Short ground hops (<= 8px tall) with quick floor pauses
        agent.stateTimerMs -= gapMs;
        if (agent.resting) {
          agent.y = pen.floorY;
          agent.anim = 'idle';
          agent.frame = Math.floor(this.clockMs / 320) % 4;
          if (agent.stateTimerMs <= 0) {
            agent.resting = false;
            agent.hopProgress = 0;
            agent.hopStartX = agent.x;
            const hopSpan = Math.min(18, spanX * 0.35);
            const goRight = agent.x < pen.left + 6 ? true : agent.x > pen.right - 6 ? false : hashSeed(agent.creatureId, Math.floor(this.clockMs / 300)) > 0.5;
            agent.hopDir = goRight ? 1 : -1;
            agent.facing = goRight ? 'R' : 'L';
            agent.targetX = Math.max(pen.left, Math.min(pen.right, agent.x + agent.hopDir * hopSpan));
          }
        } else {
          agent.hopProgress = Math.min(1, (agent.hopProgress ?? 0) + dt / 0.42);
          const u = agent.hopProgress;
          const sx = agent.hopStartX ?? agent.x;
          agent.x = sx + (agent.targetX - sx) * u;
          agent.y = pen.floorY - Math.sin(u * Math.PI) * 6.5;
          agent.anim = 'move';
          agent.frame = Math.floor(this.clockMs / 130) % 4;
          if (u >= 1) {
            agent.y = pen.floorY;
            agent.resting = true;
            agent.stateTimerMs = 600 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 350)) * 900;
          }
        }
        break;
      }

      case 'slither': {
        // Smooth low floor wave patrol
        if (Math.abs(agent.targetX - agent.x) <= 2 || agent.targetX < pen.left || agent.targetX > pen.right) {
          agent.targetX = agent.x >= cx ? pen.left + 3 : pen.right - 3;
        }
        const dx = agent.targetX - agent.x;
        agent.facing = dx >= 0 ? 'R' : 'L';
        agent.x = Math.max(pen.left, Math.min(pen.right, agent.x + Math.sign(dx) * Math.min(18 * dt, Math.abs(dx))));
        agent.y = pen.floorY;
        agent.anim = 'move';
        agent.frame = Math.floor(this.clockMs / 140) % 6;
        break;
      }

      case 'waddle':
      case 'crawl': {
        const speed = agent.movement === 'crawl' ? 8.5 : 10.5;
        agent.stateTimerMs -= gapMs;
        if (agent.resting) {
          agent.y = pen.floorY;
          agent.anim = agent.movement === 'waddle' && agent.stateTimerMs > 1000 ? 'eat' : 'idle';
          agent.frame = Math.floor(this.clockMs / 340) % 2;
          if (agent.stateTimerMs <= 0) {
            agent.resting = false;
            const pick = hashSeed(agent.creatureId, Math.floor(this.clockMs / 700));
            agent.targetX = pen.left + pick * spanX;
            agent.stateTimerMs = 5000;
          }
        } else {
          const dx = agent.targetX - agent.x;
          if (Math.abs(dx) <= 2 || agent.stateTimerMs <= 0) {
            agent.resting = true;
            agent.stateTimerMs = 1800 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 400)) * 2000;
            agent.anim = 'idle';
          } else {
            agent.facing = dx > 0 ? 'R' : 'L';
            agent.x += Math.sign(dx) * Math.min(speed * dt, Math.abs(dx));
            agent.y = pen.floorY;
            agent.anim = 'move';
            agent.frame = Math.floor(this.clockMs / 210) % 6;
          }
        }
        break;
      }

      case 'trot':
      default: {
        agent.stateTimerMs -= gapMs;
        if (agent.resting) {
          agent.y = pen.floorY;
          agent.anim = agent.stateTimerMs > 1100 ? 'eat' : 'idle';
          agent.frame = Math.floor(this.clockMs / 290) % 2;
          if (agent.stateTimerMs <= 0) {
            agent.resting = false;
            const pick = hashSeed(agent.creatureId, Math.floor(this.clockMs / 650));
            agent.targetX = pen.left + pick * spanX;
            agent.stateTimerMs = 3600;
          }
        } else {
          const dx = agent.targetX - agent.x;
          if (Math.abs(dx) <= 2 || agent.stateTimerMs <= 0) {
            agent.resting = true;
            agent.stateTimerMs = 1500 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 450)) * 1800;
            agent.anim = 'eat';
          } else {
            agent.facing = dx > 0 ? 'R' : 'L';
            agent.x += Math.sign(dx) * Math.min(22 * dt, Math.abs(dx));
            agent.y = pen.floorY;
            agent.anim = 'move';
            agent.frame = Math.floor(this.clockMs / 155) % 6;
          }
        }
        break;
      }
    }
  }

  private tickLooseCreature(
    agent: CreatureVisualAgent,
    gapMs: number,
    topBound: number
  ): void {
    const dt = gapMs / 1000;
    agent.looseNextSwitchMs -= gapMs;
    const nodes = Array.from(this.navGraph.nodes.values());

    if (agent.looseNextSwitchMs <= 0 || Math.hypot(agent.targetX - agent.x, agent.targetY - agent.y) < 3) {
      agent.looseNextSwitchMs = 1500 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 500)) * 2500;
      if (nodes.length > 0) {
        const idx = Math.floor(hashSeed(agent.creatureId, Math.floor(this.clockMs / 300) + 17) * nodes.length);
        const node = nodes[idx];
        const clamped = this.clampWorldPoint(node.x, node.y, topBound);
        agent.targetX = clamped.x;
        agent.targetY = clamped.y;
      } else {
        const target = this.clampWorldPoint(
          16 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 400)) * (this.totalWorldWidth - 32),
          this.groundY - 4,
          topBound
        );
        agent.targetX = target.x;
        agent.targetY = target.y;
      }
    }

    const dx = agent.targetX - agent.x;
    const dy = agent.targetY - agent.y;
    const dist = Math.hypot(dx, dy);
    const speed = (agent.movement === 'scurry' ? 42 : agent.movement === 'fly' ? 36 : 26) * dt;
    if (dist > 0.5) {
      if (Math.abs(dx) > 0.5) agent.facing = dx > 0 ? 'R' : 'L';
      const next = this.clampWorldPoint(
        agent.x + (dx / dist) * Math.min(speed, dist),
        agent.y + (dy / dist) * Math.min(speed, dist),
        topBound
      );
      agent.x = next.x;
      agent.y = next.y;
      agent.anim = 'move';
      agent.frame = Math.floor(this.clockMs / 150) % 6;
    } else {
      const clamped = this.clampWorldPoint(agent.x, agent.y, topBound);
      agent.x = clamped.x;
      agent.y = clamped.y;
      agent.anim = 'idle';
      agent.frame = Math.floor(this.clockMs / 250) % 4;
    }
  }
}
