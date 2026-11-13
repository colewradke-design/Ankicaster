/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Creature Choreographer & Habitat Behaviour
 * Implements Addendum Section 8, VR-01, VR-03, VR-04, VR-05, VR-09 & Milestone V4:
 * - Never mutates FullGameState and never imports engine.ts
 * - Zero `away` creatures drawn or tracked
 * - Eggs placed in matching built habitat -> Storage Vault -> Entrance Hall
 * - Unhomed creatures (no matching habitat & no roomId) placed outside Entrance Hall doors with bundle
 * - 6 distinct habitat movement styles (meadow, tide, sky, gloom, ember, crystal)
 * - Loose creatures strictly clamped inside world bounds [16, totalWorldWidth - 16] x [topBound, groundY - 4]
 *   and walk/float home along NavGraph when recaptured (loose -> tamed/wary)
 * - Global cap <= 40 visible creature agents; 1x1 pen cap > 6 hides excess wary/tamed and reports +N
 */

import { CREATURE_DEFINITIONS, ROOM_DEFINITIONS } from '../../data/content';
import type { CreatureInstance, FullGameState, HabitatType, PlacedRoom } from '../../types/ankicaster';
import { roomToWorldBox, getGroundY } from '../layout/gridToWorld';
import { NavGraph, NavNode } from '../layout/navGraph';
import type { VisualAgent } from '../agents/Choreographer';
import type { CreatureAnim } from './creatureArt';

export const MAX_VISIBLE_CREATURES = 40;
export const ONE_BY_ONE_PEN_CAP = 6;

export const HABITAT_TO_ROOM_DEF: Record<HabitatType, string[]> = {
  meadow: ['meadow_paddock', 'menagerie'],
  tide: ['tide_tank', 'pond', 'menagerie'],
  sky: ['aviary', 'menagerie'],
  gloom: ['gloom_hutch', 'menagerie'],
  ember: ['ember_pit', 'menagerie'],
  crystal: ['crystal_vivarium', 'menagerie']
};

export interface PenRect {
  left: number;
  right: number;
  topY: number;
  floorY: number;
  skyTopY: number;
  isWater: boolean;
}

export interface CreatureVisualAgent {
  creatureId: number;
  defId: string;
  nickname: string;
  status: CreatureInstance['status'];
  habitat: HabitatType;
  roomId?: number;
  x: number;
  y: number;
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
  bondLevel: 1 | 2 | 3;
  hungry: boolean;
  hatchProgress: number;
  tamerId?: number;
  wizardTamingPaw: boolean;
  /** Non-empty while returning home after loose -> tamed/wary. */
  returnPath: NavNode[];
  returnPathIdx: number;
  /** Optional loose wandering target point. */
  looseNextSwitchMs: number;
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

/** Determine matching habitat room or fallback for an egg / wary / tamed creature. */
export function resolveCreatureRoom(
  c: CreatureInstance,
  rooms: PlacedRoom[],
  occupancyCount: Map<number, number>
): { room: PlacedRoom | undefined; unhomed: boolean; subBayIndex: number } {
  const def = CREATURE_DEFINITIONS[c.defId];
  const habitats = def?.habitats ?? ['meadow'];

  if (c.roomId !== undefined) {
    const explicit = rooms.find(r => r.id === c.roomId && r.state === 'built');
    if (explicit) {
      const bayIdx = habitats.indexOf(habitats[0]);
      return { room: explicit, unhomed: false, subBayIndex: Math.max(0, bayIdx) };
    }
  }

  // Eggs: matching habitat if capacity permits -> storage_vault -> entrance_hall
  const findHabitat = (): { room: PlacedRoom; bay: number } | undefined => {
    for (const h of habitats) {
      const preferredDefs = HABITAT_TO_ROOM_DEF[h] ?? ['menagerie'];
      for (const defId of preferredDefs) {
        const candidates = rooms.filter(r => r.state === 'built' && r.defId === defId);
        for (const r of candidates) {
          const cap = ROOM_DEFINITIONS[r.defId]?.capacity?.creatures ?? (r.defId === 'menagerie' ? 12 : 4);
          const count = occupancyCount.get(r.id) ?? 0;
          if (count < cap) {
            const bay = r.defId === 'menagerie' ? Math.max(0, r.settings?.modules?.indexOf(h) ?? 0) : 0;
            return { room: r, bay };
          }
        }
      }
    }
    return undefined;
  };

  if (c.status === 'egg') {
    const hab = findHabitat();
    if (hab) return { room: hab.room, unhomed: false, subBayIndex: hab.bay };
    const vault = rooms.find(r => r.state === 'built' && r.defId === 'storage_vault');
    if (vault) return { room: vault, unhomed: false, subBayIndex: 0 };
    const eh = rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall');
    return { room: eh, unhomed: !eh, subBayIndex: 0 };
  }

  // Wary / tamed without valid roomId: find matching habitat, otherwise unhomed outside Entrance Hall
  const hab = findHabitat();
  if (hab) return { room: hab.room, unhomed: false, subBayIndex: hab.bay };

  const eh = rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall');
  return { room: eh, unhomed: true, subBayIndex: 0 };
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

  if (room.defId === 'menagerie') {
    const bays = Math.max(1, room.w);
    const bayIdx = ((subBayIndex % bays) + bays) % bays;
    const bayW = box.width / bays;
    left = box.left + bayIdx * bayW + 6;
    right = box.left + (bayIdx + 1) * bayW - 6;
    if (habitat === 'sky') skyTopY = box.top + 6;
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
    skyTopY = box.top - 12;
    isWater = true;
  } else if (room.defId === 'aviary') {
    // Aviary allows soaring arcs into the 48px sky overhang above the plot/room
    skyTopY = box.top - 36;
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
  return { left, right, topY, floorY, skyTopY, isWater };
}

export class CreatureChoreographer {
  agents = new Map<number, CreatureVisualAgent>();
  /** Extra creatures collapsed behind a "+N" badge per room (Section 8.6). */
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

  private computeReturnPath(fromX: number, fromY: number, targetRoom: PlacedRoom): NavNode[] {
    let destNode: NavNode | undefined;
    for (const n of this.navGraph.nodes.values()) {
      if (n.roomId === targetRoom.id) {
        destNode = n;
        break;
      }
    }
    if (!destNode) return [];

    let startNode: NavNode | undefined;
    let bestD = Infinity;
    for (const n of this.navGraph.nodes.values()) {
      const d = Math.hypot(n.x - fromX, n.y - fromY);
      if (d < bestD) {
        bestD = d;
        startNode = n;
      }
    }
    if (!startNode) return [];
    const path = this.navGraph.findPath(startNode.id, destNode.id);
    return path;
  }

  /**
   * Synchronize creatures cleanly against read-only state:
   * - Never spawns or keeps `away` creatures
   * - Applies 1x1 pen (>6) & global (<=40) visibility caps (never hiding egg or loose)
   * - Emits hatch / bond / recapture transitions
   */
  syncState(state: FullGameState): void {
    this.hiddenCounts.clear();
    this.wizardPawRooms.clear();

    const creatures = state.creatures || [];
    const occupancy = new Map<number, number>();
    const rooms = state.rooms || [];
    const topBound = this.topWorldBound(state);

    // Priority sort: loose & eggs ALWAYS drawn first (Section 8.6)
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
      bay: number;
    }> = [];
    const penVisibleCount = new Map<number, number>();

    for (const c of prioritized) {
      if (c.status === 'loose') {
        visible.push({ creature: c, room: undefined, unhomed: false, bay: 0 });
        continue;
      }
      const resolved = resolveCreatureRoom(c, rooms, occupancy);
      const room = resolved.room;
      if (room && !resolved.unhomed && c.status !== 'egg') {
        const isOneByOne = room.w === 1 && room.h === 1;
        const already = penVisibleCount.get(room.id) ?? 0;
        if (isOneByOne && already >= ONE_BY_ONE_PEN_CAP) {
          this.hiddenCounts.set(room.id, (this.hiddenCounts.get(room.id) ?? 0) + 1);
          continue;
        }
        penVisibleCount.set(room.id, already + 1);
        occupancy.set(room.id, (occupancy.get(room.id) ?? 0) + 1);
      } else if (room && !resolved.unhomed) {
        occupancy.set(room.id, (occupancy.get(room.id) ?? 0) + 1);
      }
      if (visible.length >= MAX_VISIBLE_CREATURES) {
        if (room && !resolved.unhomed) {
          this.hiddenCounts.set(room.id, (this.hiddenCounts.get(room.id) ?? 0) + 1);
        }
        continue;
      }
      visible.push({ creature: c, room, unhomed: resolved.unhomed, bay: resolved.subBayIndex });
    }

    const activeIds = new Set<number>();

    for (const item of visible) {
      const c = item.creature;
      activeIds.add(c.id);
      const def = CREATURE_DEFINITIONS[c.defId];
      const primaryHabitat: HabitatType = def?.habitats?.[0] ?? 'meadow';
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
        // Compute initial spawn coordinates
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
        } else if (item.room) {
          const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
          const span = Math.max(4, pen.right - pen.left);
          if (c.status === 'wary') {
            // Keep toward back/corner of pen
            sx = tx = pen.right - Math.min(span * 0.25, 10 + hashSeed(c.id, 3) * 8);
          } else {
            sx = tx = pen.left + span * (0.2 + 0.6 * hashSeed(c.id, 4));
          }
          sy = ty = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
        }

        this.agents.set(c.id, {
          creatureId: c.id,
          defId: c.defId,
          nickname: c.nickname,
          status: c.status,
          habitat: primaryHabitat,
          roomId: item.room?.id,
          x: sx,
          y: sy,
          facing: hashSeed(c.id, 5) > 0.5 ? 'R' : 'L',
          anim: 'idle',
          frame: 0,
          phase: hashSeed(c.id, 6) * Math.PI * 2,
          stateTimerMs: 1500 + hashSeed(c.id, 7) * 3500,
          resting: primaryHabitat === 'gloom',
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
          looseNextSwitchMs: 12000 + hashSeed(c.id, 8) * 16000
        });
      } else {
        existing.status = c.status;
        existing.nickname = c.nickname;
        existing.habitat = primaryHabitat;
        existing.roomId = item.room?.id;
        existing.unhomed = item.unhomed;
        existing.tamingProgress = c.tamingProgress ?? 0;
        existing.bondLevel = c.bondLevel ?? 1;
        existing.hungry = !!c.hungry;
        existing.hatchProgress = c.hatchProgress ?? 0;
        existing.tamerId = c.tamerId;
        existing.wizardTamingPaw = wizardPaw;

        // Status transitions (Section 8)
        if (!reduceMotion && prevStatus === 'egg' && c.status === 'wary') {
          this.bursts.push({ creatureId: c.id, kind: 'hatch', x: existing.x, y: existing.y - 8, startMs: this.clockMs, durationMs: 1000 });
        }
        if (!reduceMotion && prevStatus === 'wary' && c.status === 'tamed') {
          this.bursts.push({ creatureId: c.id, kind: 'tamed', x: existing.x, y: existing.y - 10, startMs: this.clockMs, durationMs: 1000 });
        }
        if (!reduceMotion && prevBond !== undefined && c.bondLevel > prevBond) {
          this.bursts.push({ creatureId: c.id, kind: 'bond', x: existing.x, y: existing.y - 10, startMs: this.clockMs, durationMs: 1200 });
        }

        // Recapture: loose -> tamed | wary -> walk/float back home cleanly
        if (prevStatus === 'loose' && (c.status === 'tamed' || c.status === 'wary') && item.room) {
          if (reduceMotion) {
            const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
            existing.x = existing.targetX = (pen.left + pen.right) / 2;
            existing.y = existing.targetY = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
            existing.returnPath = [];
            existing.returnPathIdx = 0;
          } else {
            const route = this.computeReturnPath(existing.x, existing.y, item.room);
            const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
            const homeX = c.status === 'wary' ? pen.right - 6 : (pen.left + pen.right) / 2;
            const homeY = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
            existing.returnPath = [
              ...route,
              { id: `pen-${c.id}`, roomId: item.room.id, x: homeX, y: homeY, floor: item.room.y, kind: 'room_floor' }
            ];
            existing.returnPathIdx = 0;
          }
        } else if (c.status !== 'loose' && existing.returnPath.length === 0) {
          // Ensure non-loose creatures live inside their room's pen if moved/resized
          if (item.unhomed) {
            const eh = rooms.find(r => r.defId === 'entrance_hall');
            if (eh) {
              const box = roomToWorldBox(eh, this.groundY);
              existing.x = existing.targetX = box.left + 12 + hashSeed(c.id, 2) * 18;
              existing.y = existing.targetY = box.floorLineY;
            }
          } else if (item.room) {
            const pen = getPenRect(item.room, this.groundY, primaryHabitat, item.bay);
            const clampX = Math.max(pen.left, Math.min(pen.right, existing.x));
            if (Math.abs(clampX - existing.x) > 12 || Math.abs(existing.y - pen.floorY) > 64) {
              existing.x = existing.targetX = (pen.left + pen.right) / 2;
              existing.y = existing.targetY = pen.isWater ? (pen.topY + pen.floorY) / 2 : pen.floorY;
            }
          }
        }
      }
    }

    // Remove away or removed creatures immediately
    for (const id of Array.from(this.agents.keys())) {
      if (!activeIds.has(id)) {
        this.agents.delete(id);
      }
    }

    // Also prune prevStatuses for deleted creatures (not for away creatures, unless deleted)
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

    // Sync first if map hasn't been initialized yet
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
        this.tickLooseCreature(agent, gap, state, topBound);
        continue;
      }

      // 4. Pen behaviour (6 distinct habitats)
      const room = agent.roomId !== undefined ? rooms.find(r => r.id === agent.roomId) : undefined;
      if (!room) continue;
      const pen = getPenRect(room, this.groundY, agent.habitat, Math.floor(hashSeed(agent.creatureId, 9) * 3));

      // Check if assigned tamer is in the same room (Section 8.1/8.3)
      const tamerAgent = agent.tamerId ? charAgents?.get(`char-${agent.tamerId}`) : undefined;
      const tamerPresent = !!(tamerAgent && tamerAgent.currentRoomId === room.id);

      if (agent.status === 'wary') {
        // Wary creatures keep toward the back corner of their pen
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

      // Hungry tamed creature waits near front of pen
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

      // Tamer present -> tamed creature approaches tamer toward pen front
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

      // Habitat-specific movement patterns
      this.tickHabitatBehavior(agent, pen, gap);
    }
  }

  private tickHabitatBehavior(agent: CreatureVisualAgent, pen: PenRect, gapMs: number): void {
    const dt = gapMs / 1000;
    const cx = (pen.left + pen.right) / 2;
    const spanX = Math.max(8, pen.right - pen.left);
    const rx = spanX * 0.38;

    switch (agent.habitat) {
      case 'tide': {
        // Continuous smooth figure-eight / oval swim loop strictly inside water rect
        agent.phase += dt * 1.45;
        const nextX = cx + Math.sin(agent.phase) * rx;
        const midY = (pen.topY + pen.floorY) / 2;
        const ry = Math.max(2, (pen.floorY - pen.topY) * 0.36);
        const nextY = midY + Math.sin(agent.phase * 2) * ry;
        if (Math.abs(nextX - agent.x) > 0.05) {
          agent.facing = nextX > agent.x ? 'R' : 'L';
        }
        agent.x = Math.max(pen.left, Math.min(pen.right, nextX));
        agent.y = Math.max(pen.topY, Math.min(pen.floorY, nextY));
        agent.anim = 'move';
        agent.frame = Math.floor(this.clockMs / 160) % 6;
        break;
      }

      case 'sky': {
        // Perches with periodic smooth vertical arcing flights into sky overhang
        agent.stateTimerMs -= gapMs;
        if (agent.resting) {
          agent.y = pen.floorY;
          agent.anim = 'idle';
          agent.frame = Math.floor(this.clockMs / 280) % 4;
          if (agent.stateTimerMs <= 0) {
            agent.resting = false;
            agent.phase = 0; // flight progress 0..1
            agent.stateTimerMs = 2200;
            const flip = agent.x > cx ? 0.25 : 0.75;
            agent.targetX = pen.left + spanX * (flip + (hashSeed(agent.creatureId, Math.floor(this.clockMs / 1000)) - 0.5) * 0.2);
          }
        } else {
          agent.phase = Math.min(1, agent.phase + dt / 1.8);
          const dx = agent.targetX - agent.x;
          if (Math.abs(dx) > 0.4) agent.facing = dx > 0 ? 'R' : 'L';
          agent.x += dx * Math.min(1, dt * 2.2);
          const arcHeight = Math.max(18, pen.floorY - pen.skyTopY);
          agent.y = pen.floorY - Math.sin(agent.phase * Math.PI) * arcHeight;
          agent.anim = 'move';
          agent.frame = Math.floor(this.clockMs / 110) % 6;
          if (agent.phase >= 1) {
            agent.y = pen.floorY;
            agent.resting = true;
            agent.stateTimerMs = 1800 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 500)) * 2200;
          }
        }
        break;
      }

      case 'gloom': {
        // Long stationary lurks in shadow corner punctuated by fast horizontal darts
        agent.stateTimerMs -= gapMs;
        if (agent.resting) {
          agent.y = pen.floorY;
          agent.anim = 'idle';
          agent.frame = Math.floor(this.clockMs / 400) % 4;
          if (agent.stateTimerMs <= 0) {
            agent.resting = false;
            agent.targetX = agent.x < cx ? pen.right - 2 : pen.left + 2;
            agent.stateTimerMs = 1200;
          }
        } else {
          const dx = agent.targetX - agent.x;
          if (Math.abs(dx) <= 2 || agent.stateTimerMs <= 0) {
            agent.x = Math.max(pen.left, Math.min(pen.right, agent.targetX));
            agent.resting = true;
            agent.stateTimerMs = 2400 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 500)) * 3200;
            agent.anim = 'idle';
          } else {
            agent.facing = dx > 0 ? 'R' : 'L';
            agent.x += Math.sign(dx) * Math.min(48 * dt, Math.abs(dx));
            agent.y = pen.floorY;
            agent.anim = 'move';
            agent.frame = Math.floor(this.clockMs / 95) % 6;
          }
        }
        break;
      }

      case 'ember': {
        // Basks near warm brazier/coals center with rhythmic low hops
        agent.phase += dt * 2.2;
        const hop = Math.max(0, Math.sin(agent.phase)) > 0.65 ? Math.abs(Math.sin(agent.phase * 3)) * 4.5 : 0;
        const targetOffset = Math.sin(agent.phase * 0.4) * Math.min(12, rx * 0.7);
        const nextX = cx + targetOffset;
        if (Math.abs(nextX - agent.x) > 0.05) agent.facing = nextX > agent.x ? 'R' : 'L';
        agent.x = Math.max(pen.left, Math.min(pen.right, nextX));
        agent.y = pen.floorY - hop;
        agent.anim = hop > 0.5 ? 'move' : 'idle';
        agent.frame = Math.floor(this.clockMs / 200) % 4;
        break;
      }

      case 'crystal': {
        // Continuous sinusoidal hover & elliptical orbital drift around geode
        agent.phase += dt * 1.65;
        const hoverY = pen.floorY - 9 - Math.sin(agent.phase * 1.4) * 4.5;
        const orbitX = cx + Math.cos(agent.phase * 0.75) * rx;
        if (Math.abs(orbitX - agent.x) > 0.05) agent.facing = orbitX > agent.x ? 'R' : 'L';
        agent.x = Math.max(pen.left, Math.min(pen.right, orbitX));
        agent.y = Math.max(pen.topY + 4, Math.min(pen.floorY - 2, hoverY));
        agent.anim = 'idle';
        agent.frame = Math.floor(this.clockMs / 220) % 4;
        break;
      }

      case 'meadow':
      default: {
        // Horizontal walk along grass with periodic graze/eat pauses
        agent.stateTimerMs -= gapMs;
        if (agent.resting) {
          agent.y = pen.floorY;
          agent.anim = agent.stateTimerMs > 1200 ? 'eat' : 'idle';
          agent.frame = Math.floor(this.clockMs / 320) % 2;
          if (agent.stateTimerMs <= 0) {
            agent.resting = false;
            const pick = hashSeed(agent.creatureId, Math.floor(this.clockMs / 700));
            agent.targetX = pen.left + pick * spanX;
            agent.stateTimerMs = 4500;
          }
        } else {
          const dx = agent.targetX - agent.x;
          if (Math.abs(dx) <= 2 || agent.stateTimerMs <= 0) {
            agent.resting = true;
            agent.stateTimerMs = 2000 + hashSeed(agent.creatureId, Math.floor(this.clockMs / 400)) * 2600;
            agent.anim = 'eat';
          } else {
            agent.facing = dx > 0 ? 'R' : 'L';
            agent.x += Math.sign(dx) * Math.min(16 * dt, Math.abs(dx));
            agent.y = pen.floorY;
            agent.anim = 'move';
            agent.frame = Math.floor(this.clockMs / 180) % 6;
          }
        }
        break;
      }
    }
  }

  private tickLooseCreature(
    agent: CreatureVisualAgent,
    gapMs: number,
    state: FullGameState,
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
    const speed = (agent.habitat === 'gloom' ? 42 : agent.habitat === 'sky' ? 36 : 26) * dt;
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
