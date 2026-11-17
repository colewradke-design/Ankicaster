/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Visual choreographer for Goblin Servants.
 * Navigates purely via NavGraph (stairs / Wizard's Study vertical links only),
 * respects reduceMotion, derives animations strictly from elapsed clockMs,
 * never imports engine.ts, and never mutates FullGameState.
 */

import type { FullGameState, PlacedRoom, ServantInstance, ServantLook } from '../../types/ankicaster';
import { computeConstructionPlan } from '../../utils/construction';
import type { ReachabilityInfo } from '../../utils/reachability';
import { computeJanitorAssignments, isRoomOperationalForServant } from '../../utils/servants';
import { castleCellToWorldX, getFloorLineY, roomToWorldBox } from '../layout/gridToWorld';
import { NavGraph, NavNode } from '../layout/navGraph';
import { findBuilderSiteEdgeAnchor } from '../layout/roomAnchors';
import { MOVE_SPEED, type GoblinTool } from './doll';

export interface ServantVisualAgent {
  id: string; // 'servant-<id>'
  servantId: number;
  name: string;
  look: ServantLook;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  currentFloor: number;
  targetFloor: number;
  facing: 'L' | 'R';
  anim: 'idle' | 'walk' | 'climb' | 'work';
  desiredAnim: 'idle' | 'work';
  frame: number;
  animBaseMs: number;
  animPlaying: string;
  tool: GoblinTool;
  currentRoomId?: number;
  targetRoomId?: number;
  targetAnchorKey?: string;
  targetAnchorFloor?: number;
  cleaningRoomId?: number;
  buildingSiteId?: number;
  goalKey?: string;
  path: NavNode[];
  pathIndex: number;
}

function hashId(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toolForWorkplace(defId: string | undefined): GoblinTool {
  if (!defId) return 'none';
  if (defId === 'workshop' || defId === 'quarry' || defId === 'woodlot' || defId === 'glassworks') return 'hammer';
  if (defId === 'janitors_closet' || defId === 'weaving_room') return 'broom';
  if (defId === 'kitchen' || defId === 'refectory') return 'tray';
  return 'watering';
}

export class ServantChoreographer {
  agents = new Map<string, ServantVisualAgent>();
  navGraph: NavGraph;
  groundY: number;
  reachability?: Map<number, ReachabilityInfo>;
  clockMs = 0;
  private lastReal = -1;

  constructor(navGraph: NavGraph, groundY: number) {
    this.navGraph = navGraph;
    this.groundY = groundY;
  }

  updateNavGraph(navGraph: NavGraph, groundY: number) {
    const delta = groundY - this.groundY;
    this.navGraph = navGraph;
    this.groundY = groundY;
    if (!delta || !Number.isFinite(delta)) return;
    for (const agent of this.agents.values()) {
      agent.y += delta;
      agent.targetY += delta;
      for (const node of agent.path) node.y += delta;
    }
  }

  private isRoomReachable(roomId: number): boolean {
    if (!this.reachability) return true;
    return this.reachability.get(roomId)?.reachable ?? false;
  }

  private frontPathSpot(agentId: string): { x: number; y: number } {
    const front = this.navGraph?.nodes?.get('path-front');
    const baseX = front ? front.x : castleCellToWorldX(3) + 64;
    const offset = ((hashId(agentId) % 7) - 3) * 10;
    return { x: baseX + offset, y: (Number.isFinite(this.groundY) ? this.groundY : 400) - 4 };
  }

  private roomSpot(room: PlacedRoom, servantId: number): { x: number; y: number; floor: number } {
    const box = roomToWorldBox(room, this.groundY);
    const margin = 12;
    const span = Math.max(8, box.width - margin * 2);
    const offset = (hashId(`gob:${servantId}:${room.id}`) % Math.max(1, Math.floor(span))) - span / 2;
    const x = Math.max(box.left + margin, Math.min(box.left + box.width - margin, box.left + box.width / 2 + offset));
    const floor = room.area === 'castle' ? room.y : 0;
    const y = room.area === 'castle' ? getFloorLineY(floor, this.groundY) : box.floorLineY;
    return { x, y, floor };
  }

  syncState(state: FullGameState, reachability?: Map<number, ReachabilityInfo>) {
    if (reachability) this.reachability = reachability;
    const servants = state.servants || [];
    const seen = new Set<string>();
    const chamber = (state.rooms || []).find(r => r.defId === 'summoning_chamber' && r.state === 'built' && this.isRoomReachable(r.id));
    const eh = (state.rooms || []).find(r => r.defId === 'entrance_hall' && r.state === 'built' && this.isRoomReachable(r.id));

    for (const s of servants) {
      const id = `servant-${s.id}`;
      seen.add(id);
      let agent = this.agents.get(id);
      if (!agent) {
        const spawnRoom = chamber || eh;
        const spot = spawnRoom ? this.roomSpot(spawnRoom, s.id) : { ...this.frontPathSpot(id), floor: 0 };
        agent = {
          id,
          servantId: s.id,
          name: s.name,
          look: s.look,
          x: spot.x,
          y: spot.y,
          targetX: spot.x,
          targetY: spot.y,
          currentFloor: spot.floor,
          targetFloor: spot.floor,
          facing: 'R',
          anim: 'idle',
          desiredAnim: 'idle',
          frame: 0,
          animBaseMs: this.clockMs,
          animPlaying: 'idle',
          tool: 'none',
          currentRoomId: spawnRoom?.id,
          targetRoomId: spawnRoom?.id,
          path: [],
          pathIndex: 0
        };
        this.agents.set(id, agent);
      } else {
        agent.name = s.name;
        agent.look = s.look;
      }

      if (agent.currentRoomId !== undefined && !state.rooms.some(r => r.id === agent!.currentRoomId)) {
        const fallback = chamber || eh;
        if (fallback) {
          const spot = this.roomSpot(fallback, s.id);
          agent.x = agent.targetX = spot.x;
          agent.y = agent.targetY = spot.y;
          agent.currentFloor = agent.targetFloor = spot.floor;
          agent.currentRoomId = fallback.id;
        } else {
          const spot = this.frontPathSpot(id);
          agent.x = agent.targetX = spot.x;
          agent.y = agent.targetY = spot.y;
          agent.currentFloor = agent.targetFloor = 0;
          agent.currentRoomId = undefined;
        }
        agent.path = [];
        agent.pathIndex = 0;
      }
    }

    for (const id of Array.from(this.agents.keys())) {
      if (!seen.has(id)) this.agents.delete(id);
    }

    if (servants.length > 0) {
      this.assignGoals(state, !!state.settings?.reduceMotion);
    }
  }

  private resolveGoalForServant(
    s: ServantInstance,
    state: FullGameState,
    constructionPlan: ReturnType<typeof computeConstructionPlan>,
    janitorTargets: Map<number, number | undefined>
  ): {
    goalKey: string;
    roomId?: number;
    x: number;
    y: number;
    floor: number;
    desiredAnim: 'idle' | 'work';
    tool: GoblinTool;
    buildingSiteId?: number;
    cleaningRoomId?: number;
  } {
    const builtReachable = (state.rooms || []).filter(r => r.state === 'built' && this.isRoomReachable(r.id));
    const wp = s.workplaceRoomId != null ? builtReachable.find(r => r.id === s.workplaceRoomId) : undefined;

    if (wp && isRoomOperationalForServant(state, wp)) {
      if (wp.defId === 'workshop') {
        for (const job of constructionPlan) {
          const member = job.crew.find(m => m.kind === 'servant' && m.id === s.id);
          if (member) {
            const site = (state.rooms || []).find(r => r.id === job.roomId && r.state === 'site');
            if (site) {
              const anchor = findBuilderSiteEdgeAnchor(site, state, this.reachability, this.groundY, member.slotIndex);
              if (anchor) {
                return {
                  goalKey: `build:${site.id}:slot${member.slotIndex}:${anchor.roomId}`,
                  roomId: anchor.roomId,
                  x: anchor.x,
                  y: anchor.y,
                  floor: anchor.floor,
                  desiredAnim: 'work',
                  tool: 'hammer',
                  buildingSiteId: site.id
                };
              }
            }
          }
        }
        // Waiting at Workshop (5th+ or no active site)
        const spot = this.roomSpot(wp, s.id);
        return {
          goalKey: `wait_workshop:${wp.id}`,
          roomId: wp.id,
          x: spot.x,
          y: spot.y,
          floor: spot.floor,
          desiredAnim: 'idle',
          tool: 'hammer'
        };
      }

      if (wp.defId === 'janitors_closet') {
        const cleanRoomId = janitorTargets.get(s.id);
        const targetRoom = cleanRoomId != null ? builtReachable.find(r => r.id === cleanRoomId) : undefined;
        if (targetRoom) {
          const spot = this.roomSpot(targetRoom, s.id);
          return {
            goalKey: `clean:${targetRoom.id}`,
            roomId: targetRoom.id,
            x: spot.x,
            y: spot.y,
            floor: spot.floor,
            desiredAnim: 'work',
            tool: 'broom',
            cleaningRoomId: targetRoom.id
          };
        }
        const spot = this.roomSpot(wp, s.id);
        return {
          goalKey: `wait_closet:${wp.id}`,
          roomId: wp.id,
          x: spot.x,
          y: spot.y,
          floor: spot.floor,
          desiredAnim: 'idle',
          tool: 'broom'
        };
      }

      // Direct workplace (plot, kitchen, refectory, glassworks, weaving_room)
      const spot = this.roomSpot(wp, s.id);
      return {
        goalKey: `work:${wp.id}:${wp.defId}`,
        roomId: wp.id,
        x: spot.x,
        y: spot.y,
        floor: spot.floor,
        desiredAnim: 'work',
        tool: toolForWorkplace(wp.defId)
      };
    }

    // Idle servant: stay in Summoning Chamber, else Entrance Hall, else front path
    const home =
      builtReachable.find(r => r.defId === 'summoning_chamber') ||
      builtReachable.find(r => r.defId === 'entrance_hall') ||
      builtReachable[0];
    if (home) {
      const spot = this.roomSpot(home, s.id);
      return {
        goalKey: `idle:${home.id}`,
        roomId: home.id,
        x: spot.x,
        y: spot.y,
        floor: spot.floor,
        desiredAnim: 'idle',
        tool: 'none'
      };
    }
    const front = this.frontPathSpot(`servant-${s.id}`);
    return {
      goalKey: 'idle:front',
      roomId: undefined,
      x: front.x,
      y: front.y,
      floor: 0,
      desiredAnim: 'idle',
      tool: 'none'
    };
  }

  private assignGoals(state: FullGameState, reduceMotion: boolean) {
    const constructionPlan = computeConstructionPlan(state);
    const janitorTargets = computeJanitorAssignments(state);

    for (const s of state.servants || []) {
      const agent = this.agents.get(`servant-${s.id}`);
      if (!agent) continue;

      const goal = this.resolveGoalForServant(s, state, constructionPlan, janitorTargets);
      agent.tool = goal.tool;
      agent.desiredAnim = goal.desiredAnim;
      agent.buildingSiteId = goal.buildingSiteId;
      agent.cleaningRoomId = goal.cleaningRoomId;

      if (agent.goalKey === goal.goalKey && (agent.path.length > 0 || agent.currentRoomId === goal.roomId)) {
        if (reduceMotion) {
          agent.x = goal.x;
          agent.y = goal.y;
          agent.currentFloor = goal.floor;
          agent.currentRoomId = goal.roomId;
          agent.path = [];
          agent.pathIndex = 0;
          agent.anim = goal.desiredAnim;
        }
        continue;
      }

      agent.goalKey = goal.goalKey;
      agent.targetRoomId = goal.roomId;
      agent.targetX = goal.x;
      agent.targetY = goal.y;
      agent.targetFloor = goal.floor;

      if (goal.roomId == null) {
        agent.x = goal.x;
        agent.y = goal.y;
        agent.currentFloor = 0;
        agent.currentRoomId = undefined;
        agent.path = [];
        agent.pathIndex = 0;
        agent.anim = goal.desiredAnim;
        continue;
      }

      if (reduceMotion) {
        agent.x = goal.x;
        agent.y = goal.y;
        agent.currentFloor = goal.floor;
        agent.currentRoomId = goal.roomId;
        agent.path = [];
        agent.pathIndex = 0;
        agent.anim = goal.desiredAnim;
      } else {
        this.routeToTarget(agent, state, goal.roomId, goal.x, goal.y, goal.floor);
      }
    }
  }

  private routeToTarget(
    agent: ServantVisualAgent,
    state: FullGameState,
    targetRoomId: number,
    destX: number,
    destY: number,
    destFloor: number
  ) {
    const destCandidates = Array.from(this.navGraph.nodes.values())
      .filter(n => n.roomId === targetRoomId)
      .sort((a, b) => {
        const aSame = a.floor === destFloor ? 0 : 1;
        const bSame = b.floor === destFloor ? 0 : 1;
        return aSame - bSame || (a.kind === 'stair' ? 1 : 0) - (b.kind === 'stair' ? 1 : 0);
      });
    if (destCandidates.length === 0) return;

    let startNodeId: string | undefined;
    let minD = Infinity;
    for (const [nodeId, node] of this.navGraph.nodes.entries()) {
      const floorDiff = Math.abs(node.floor - agent.currentFloor);
      const roomBonus = agent.currentRoomId !== undefined && node.roomId === agent.currentRoomId ? -8 : 0;
      const d = Math.abs(node.x - agent.x) + Math.abs(node.y - agent.y) + floorDiff * 1000 + roomBonus;
      if (d < minD) {
        minD = d;
        startNodeId = nodeId;
      }
    }
    if (!startNodeId) return;

    let bestPath: NavNode[] = [];
    for (const destNode of destCandidates) {
      const candidatePath = this.navGraph.findPath(startNodeId, destNode.id);
      if (candidatePath.length > 0 && (bestPath.length === 0 || candidatePath.length < bestPath.length)) {
        bestPath = candidatePath;
      }
    }

    if (bestPath.length > 0) {
      const targetRoom = state.rooms.find(r => r.id === targetRoomId);
      bestPath.push({
        id: `anchor-${agent.id}`,
        roomId: targetRoomId,
        floor: destFloor,
        x: destX,
        y: destY,
        kind: targetRoom?.area === 'grounds' ? 'plot' : 'room_floor'
      });
      agent.path = bestPath;
      agent.pathIndex = 0;
    }
  }

  private consumeTime(deltaMs: number, nowMs?: number): number {
    let gap: number;
    if (nowMs == null) gap = deltaMs;
    else if (this.lastReal < 0) gap = Number.isFinite(deltaMs) ? deltaMs : 0;
    else gap = nowMs - this.lastReal;
    if (nowMs != null) this.lastReal = nowMs;
    if (!Number.isFinite(gap) || gap < 0) gap = 0;
    return Math.min(250, gap);
  }

  tick(deltaMs: number, state: FullGameState, reduceMotion = false, nowMs?: number) {
    if ((state.servants || []).length === 0) {
      this.agents.clear();
      return;
    }
    const gap = this.consumeTime(deltaMs, nowMs);
    this.clockMs += gap;

    if (reduceMotion) {
      this.assignGoals(state, true);
      for (const agent of this.agents.values()) {
        agent.anim = agent.desiredAnim;
        agent.frame = 0;
      }
      return;
    }

    // Re-evaluate janitor & construction assignments lightly
    this.assignGoals(state, false);

    for (const agent of this.agents.values()) {
      if (agent.path.length > 0 && agent.pathIndex < agent.path.length) {
        const targetNode = agent.path[agent.pathIndex];
        const prevNode = agent.pathIndex > 0 ? agent.path[agent.pathIndex - 1] : undefined;
        const dx = targetNode.x - agent.x;
        const dy = targetNode.y - agent.y;
        const dist = Math.hypot(dx, dy);

        if (dist < 2) {
          agent.x = targetNode.x;
          agent.y = targetNode.y;
          agent.currentFloor = targetNode.floor;
          if (targetNode.roomId !== undefined && targetNode.roomId >= 0) agent.currentRoomId = targetNode.roomId;
          agent.pathIndex++;
          if (agent.pathIndex >= agent.path.length) {
            agent.path = [];
            agent.pathIndex = 0;
            agent.anim = agent.desiredAnim;
          }
        } else {
          const targetRoom = state.rooms.find(r => r.id === targetNode.roomId);
          const currentRoom = agent.currentRoomId !== undefined ? state.rooms.find(r => r.id === agent.currentRoomId) : undefined;
          const stairLink =
            targetNode.kind === 'stair' &&
            prevNode?.kind === 'stair' &&
            targetNode.roomId === prevNode.roomId &&
            (targetRoom?.defId === 'spiral_stair' || targetRoom?.defId === 'wizard_study');
          const climbing = stairLink || (prevNode?.kind === 'stair' && Math.abs(dy) > 2 && targetRoom?.defId === 'spiral_stair');
          const onElevator =
            stairLink &&
            prevNode?.kind === 'stair' &&
            targetRoom?.defId === 'spiral_stair' &&
            targetRoom.level >= 2;
          const pathStep =
            Math.abs(dy) <= 10 &&
            (targetNode.kind === 'path' ||
              targetNode.kind === 'plot' ||
              prevNode?.kind === 'path' ||
              prevNode?.kind === 'plot' ||
              currentRoom?.defId === 'entrance_hall' ||
              currentRoom?.area === 'grounds');
          const px = onElevator ? MOVE_SPEED.elevator : climbing ? MOVE_SPEED.climb : MOVE_SPEED.walk;
          const speed = px * (gap / 1000);
          if (Math.abs(dx) > 1) agent.facing = dx > 0 ? 'R' : 'L';
          if (Math.abs(dy) > 2) {
            if (climbing) {
              agent.anim = onElevator ? 'idle' : 'climb';
              agent.y += (dy / dist) * Math.min(speed, Math.abs(dy));
            } else if (pathStep) {
              agent.anim = 'walk';
              agent.y += (dy / dist) * Math.min(speed, Math.abs(dy));
            } else if (targetNode.floor === agent.currentFloor) {
              agent.y = targetNode.y;
              agent.anim = 'walk';
            } else {
              agent.path = [];
              agent.pathIndex = 0;
              agent.anim = agent.desiredAnim;
            }
          } else {
            agent.y = targetNode.y;
            agent.anim = 'walk';
          }
          agent.x += (dx / dist) * Math.min(speed, Math.abs(dx));
        }
      } else {
        agent.anim = agent.desiredAnim;
      }

      if (agent.animPlaying !== agent.anim) {
        agent.animPlaying = agent.anim;
        agent.animBaseMs = this.clockMs;
      }
      const elapsed = Math.max(0, this.clockMs - agent.animBaseMs);
      agent.frame = Math.floor(elapsed / 150) % 4;
    }
  }
}
