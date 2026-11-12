/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Choreographer & Lively Schedule
 * Implements Section 7:
 * - 10-minute "lively" loop:
 *   0:00-3:30 Class / Work
 *   3:30-5:00 Free time
 *   5:00-7:30 Class / Work
 *   7:30-8:30 Free time
 *   8:30-10:00 Sleep (bedRoomId)
 * - Meal window triggered on 5th bell (debounced to 5 min)
 * - Agents spread across room width with stable per-agent offsets
 * - Unreachable room replanning
 * - Free time picks leisure room once per block (seeded)
 * - reduceMotion places agents once per phase change only
 */

import { FullGameState, Character } from '../../types/ankicaster';
import { NavGraph, NavNode } from '../layout/navGraph';
import { roomToWorldBox } from '../layout/gridToWorld';
import { ReachabilityInfo } from '../../utils/reachability';
import { normalizeAppearance } from '../../utils/appearance';
import { MOVE_SPEED, healingPlaceFor, DollAnim, dollFrame } from './doll';

export type AgentAnimation = DollAnim;

export interface VisualAgent {
  id: string; // 'wizard' or 'char-<id>'
  isWizard: boolean;
  character?: Character;
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  currentFloor: number;
  targetFloor: number;
  facing: 'L' | 'R';
  anim: AgentAnimation;
  animFrame: number;
  animTimer: number;
  /** Clock time when the current animation started. The frame is derived from this, not from tick count. */
  animBaseMs?: number;
  animPlaying?: string;
  activity: 'class' | 'work' | 'meal' | 'sleep' | 'free_time';
  currentRoomId?: number;
  targetRoomId?: number;
  freeTimeTargetRoomId?: number;
  freeTimeBlockId?: number;
  lastReducedMotionPhase?: string;
  path: NavNode[];
  pathIndex: number;
  robeColor: string;
  hat: string;
  hair: string;
  hairColor: string;
  skin: string;
  staff?: string;
  bodyShape?: number;
  eyes?: string;
  face?: string;
  shoes?: string;
  /** Real-time stamp when the agent last arrived, for the 3 s morale heart. */
  arrivedAt?: number;
  name: string;
  unreachableWarning?: boolean;
}

export class Choreographer {
  agents = new Map<string, VisualAgent>();
  schedulePhase: 'class_work' | 'free_time' | 'meal' | 'sleep' = 'class_work';
  cycleTimeMs: number = 0; // 0..600,000 (10 min)
  /** Elapsed animation clock. Advances with real time, never with the number of callbacks. */
  clockMs = 0;
  private lastReal = -1;
  mealWindowRemainingMs: number = 0;
  lastMealBellIndex: number = -1;
  lastMealTriggerTimeMs: number = -300000;
  freeTimeBlockCounter: number = 0;
  lastSchedulePhase: string = 'class_work';

  navGraph: NavGraph;
  groundY: number;
  reachability?: Map<number, ReachabilityInfo>;

  constructor(navGraph: NavGraph, groundY: number) {
    this.navGraph = navGraph;
    this.groundY = groundY;
  }

  updateNavGraph(navGraph: NavGraph, groundY: number) {
    this.navGraph = navGraph;
    this.groundY = groundY;
  }

  /** Last seen position of each room, to detect Move / Demolish. */
  private roomSignatures = new Map<number, string>();

  private resettleAgentsForLayoutChange(state: FullGameState) {
    const sigs = new Map<number, string>();
    for (const r of state.rooms) sigs.set(r.id, `${r.area}:${r.x}:${r.y}`);
    const changed = new Set<number>();
    for (const [id, sig] of this.roomSignatures) {
      if (sigs.get(id) !== sig) changed.add(id);
    }
    this.roomSignatures = sigs;
    if (changed.size === 0) return;
    const fallback = state.rooms.find(r => r.defId === 'entrance_hall' && r.state === 'built') || state.rooms[0];
    for (const agent of this.agents.values()) {
      const hit = (agent.currentRoomId !== undefined && changed.has(agent.currentRoomId)) ||
        (agent.targetRoomId !== undefined && changed.has(agent.targetRoomId));
      if (!hit) continue;
      const room = state.rooms.find(r => r.id === agent.currentRoomId) || fallback;
      agent.path = [];
      agent.pathIndex = 0;
      agent.freeTimeTargetRoomId = undefined;
      if (!room) continue;
      const box = roomToWorldBox(room, this.groundY);
      agent.x = agent.targetX = this.getRoomSlotX(room.id, agent.id, state);
      agent.y = agent.targetY = box.floorLineY;
      agent.currentFloor = agent.targetFloor = room.area === 'castle' ? room.y : 0;
      agent.currentRoomId = agent.targetRoomId = room.id;
      this.setArrivedAnim(agent);
    }
  }

  getRoomSlotX(roomId: number, agentId: string, state: FullGameState): number {
    const room = state.rooms.find(r => r.id === roomId);
    if (!room) return 400;
    const box = roomToWorldBox(room, this.groundY);

    let hash = 0;
    for (let i = 0; i < agentId.length; i++) {
      hash = ((hash << 5) - hash + agentId.charCodeAt(i)) | 0;
    }
    const absHash = Math.abs(hash);

    // Spread across 12 distinct slots
    const slot = absHash % 12;
    const usableWidth = Math.max(16, box.width - 24);
    const slotRatio = (slot + 0.5) / 12 - 0.5; // -0.5 to +0.5
    return box.left + box.width / 2 + slotRatio * usableWidth;
  }

  syncState(state: FullGameState, reachability?: Map<number, ReachabilityInfo>) {
    if (reachability) {
      this.reachability = reachability;
    }

    // Check 5th bell meal rule (debounced to 5 min)
    if (state.bellIndex > 0 && state.bellIndex % 5 === 0 && state.bellIndex !== this.lastMealBellIndex) {
      const now = Date.now();
      if (now - this.lastMealTriggerTimeMs >= 300000) {
        this.triggerMealWindow();
        this.lastMealTriggerTimeMs = now;
        this.lastMealBellIndex = state.bellIndex;
      }
    }

    // 1. Sync Wizard
    if (!this.agents.has('wizard')) {
      const studyRoom = state.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built');
      let wx = 500;
      let wy = this.groundY - 4;
      let floor = 0;
      if (studyRoom) {
        const box = roomToWorldBox(studyRoom, this.groundY);
        wx = box.left + box.width / 2;
        wy = box.floorLineY;
        floor = studyRoom.y;
      }

      const look = normalizeAppearance(state.wizard.appearance);

      this.agents.set('wizard', {
        id: 'wizard',
        isWizard: true,
        x: wx,
        y: wy,
        targetX: wx,
        targetY: wy,
        currentFloor: floor,
        targetFloor: floor,
        facing: 'R',
        anim: 'idle',
        animFrame: 0,
        animTimer: 0,
        activity: 'work',
        currentRoomId: studyRoom?.id,
        targetRoomId: studyRoom?.id,
        path: [],
        pathIndex: 0,
        robeColor: look.robeColor,
        hat: look.hat,
        hair: look.hair,
        hairColor: look.hairColor,
        skin: look.skin,
        staff: look.staff,
        name: `${state.wizard.title} ${state.wizard.name}`
      });
    }

    // Keep the wizard's look in sync with the saved appearance (creation / "Choose your look")
    {
      const wiz = this.agents.get('wizard')!;
      const look = normalizeAppearance(state.wizard.appearance);
      wiz.robeColor = look.robeColor;
      wiz.hat = look.hat;
      wiz.hair = look.hair;
      wiz.hairColor = look.hairColor;
      wiz.skin = look.skin;
      wiz.staff = look.staff;
      wiz.bodyShape = look.bodyShape;
      wiz.eyes = look.eyes;
      wiz.face = look.face;
      wiz.shoes = look.shoes;
      wiz.name = `${state.wizard.title} ${state.wizard.name}`;
    }

    // Rooms that moved or were demolished: put their agents back on a valid floor
    this.resettleAgentsForLayoutChange(state);

    // 2. Sync Characters
    const activeCharIds = new Set<string>();
    for (const char of state.characters) {
      if (char.status === 'away') continue; // Not on map
      const id = `char-${char.id}`;
      activeCharIds.add(id);

      if (!this.agents.has(id)) {
        // Spawn at Entrance Hall or bed or seat
        const targetRoomId = char.seatRoomId || char.bedRoomId || 1;
        const room = state.rooms.find(r => r.id === targetRoomId) || state.rooms[0];
        let sx = 400;
        let sy = this.groundY - 4;
        let fl = 0;
        if (room) {
          const box = roomToWorldBox(room, this.groundY);
          sx = this.getRoomSlotX(room.id, id, state);
          sy = box.floorLineY;
          fl = room.y;
        }

        const schoolColors: Record<string, string> = {
          arcane: '#6B4FBB',
          nature: '#4E8B3A',
          light: '#E8C547',
          shadow: '#2F3A73',
          alchemy: '#B5651D'
        };
        const look = normalizeAppearance({ ...char.appearance, staff: 'oak' }, char.id);
        const robeCol = char.currentSchool ? (schoolColors[char.currentSchool] || '#4E8B3A') : look.robeColor;

        this.agents.set(id, {
          id,
          isWizard: false,
          character: char,
          x: sx,
          y: sy,
          targetX: sx,
          targetY: sy,
          currentFloor: fl,
          targetFloor: fl,
          facing: Math.random() > 0.5 ? 'R' : 'L',
          anim: 'idle',
          animFrame: Math.floor(Math.random() * 4),
          animTimer: 0,
          activity: 'free_time',
          currentRoomId: room?.id,
          targetRoomId: room?.id,
          path: [],
          pathIndex: 0,
          robeColor: robeCol,
          hat: look.hat,
          hair: look.hair,
          hairColor: look.hairColor,
          skin: look.skin,
          bodyShape: look.bodyShape,
          eyes: look.eyes,
          face: look.face,
          shoes: look.shoes,
          name: char.name
        });
      } else {
        const agent = this.agents.get(id)!;
        agent.character = char;
        const look = normalizeAppearance({ ...char.appearance, staff: 'oak' }, char.id);
        agent.hat = look.hat;
        agent.hair = look.hair;
        agent.hairColor = look.hairColor;
        agent.skin = look.skin;
        agent.bodyShape = look.bodyShape;
        agent.eyes = look.eyes;
        agent.face = look.face;
        agent.shoes = look.shoes;
        if (char.currentSchool) {
          const schoolColors: Record<string, string> = {
            arcane: '#6B4FBB',
            nature: '#4E8B3A',
            light: '#E8C547',
            shadow: '#2F3A73',
            alchemy: '#B5651D'
          };
          agent.robeColor = schoolColors[char.currentSchool] || agent.robeColor;
        }

        // Check if agent's current or target room is unreachable
        if (this.reachability) {
          const currentReachable = agent.currentRoomId ? (this.reachability.get(agent.currentRoomId)?.reachable ?? true) : true;
          const targetReachable = agent.targetRoomId ? (this.reachability.get(agent.targetRoomId)?.reachable ?? true) : true;
          if (!currentReachable) {
            // When current room is unreachable there is no legal route out: snap instantly to reachable target
            agent.path = [];
            agent.pathIndex = 0;
            agent.freeTimeTargetRoomId = undefined;
            this.planAgentNextGoal(agent, state);
            const targetRoom = state.rooms.find(r => r.id === agent.targetRoomId);
            if (targetRoom) {
              const box = roomToWorldBox(targetRoom, this.groundY);
              agent.x = this.getRoomSlotX(targetRoom.id, agent.id, state);
              agent.y = box.floorLineY;
              agent.currentFloor = targetRoom.y;
              agent.currentRoomId = targetRoom.id;
              agent.path = [];
              agent.pathIndex = 0;
              this.setArrivedAnim(agent);
            }
          } else if (!targetReachable) {
            // Target is unreachable: replan right away to a reachable room along the nav graph
            agent.path = [];
            agent.pathIndex = 0;
            agent.freeTimeTargetRoomId = undefined;
            this.planAgentNextGoal(agent, state);
          }
        }
      }
    }

    // Clean up removed characters
    for (const [id, agent] of this.agents.entries()) {
      if (!agent.isWizard && !activeCharIds.has(id)) {
        this.agents.delete(id);
      }
    }
  }

  triggerMealWindow() {
    this.mealWindowRemainingMs = 90000; // 90 seconds meal window
  }

  /**
   * Turn a callback into a real-time gap.
   * Many callbacks that share one `now` (stacked tickers, a burst of state updates)
   * add nothing. A tab that was hidden is clamped so the bob cannot fast-forward.
   */
  consumeTime(deltaMs: number, nowMs?: number): number {
    let gap: number;
    if (nowMs == null) gap = deltaMs;
    else if (this.lastReal < 0) gap = Number.isFinite(deltaMs) ? deltaMs : 0;
    else gap = nowMs - this.lastReal;
    if (nowMs != null) this.lastReal = nowMs;
    if (!Number.isFinite(gap) || gap < 0) gap = 0;
    return Math.min(250, gap);
  }

  tick(deltaMs: number, state: FullGameState, reduceMotion: boolean, nowMs?: number) {
    const gap = this.consumeTime(deltaMs, nowMs);
    this.clockMs += gap;
    this.cycleTimeMs = (this.cycleTimeMs + gap) % 600000; // 10 min loop

    if (this.mealWindowRemainingMs > 0) {
      this.mealWindowRemainingMs -= gap;
    }

    // Determine lively schedule phase
    const secInCycle = Math.floor(this.cycleTimeMs / 1000);
    if (this.mealWindowRemainingMs > 0) {
      this.schedulePhase = 'meal';
    } else if (secInCycle < 210) {
      // 0:00 - 3:30
      this.schedulePhase = 'class_work';
    } else if (secInCycle < 300) {
      // 3:30 - 5:00
      this.schedulePhase = 'free_time';
    } else if (secInCycle < 450) {
      // 5:00 - 7:30
      this.schedulePhase = 'class_work';
    } else if (secInCycle < 510) {
      // 7:30 - 8:30
      this.schedulePhase = 'free_time';
    } else {
      // 8:30 - 10:00 Sleep phase in lively loop
      this.schedulePhase = 'sleep';
    }

    // Track free-time block changes
    if (this.schedulePhase === 'free_time' && this.lastSchedulePhase !== 'free_time') {
      this.freeTimeBlockCounter++;
    } else if (this.schedulePhase !== 'free_time') {
      // Clear free-time destinations when leaving free time
      for (const agent of this.agents.values()) {
        agent.freeTimeTargetRoomId = undefined;
      }
    }
    this.lastSchedulePhase = this.schedulePhase;

    // Update each agent
    for (const agent of this.agents.values()) {
      this.updateAgent(agent, gap, state, reduceMotion);
    }
  }

  private updateAgent(agent: VisualAgent, deltaMs: number, state: FullGameState, reduceMotion: boolean) {
    if (reduceMotion) {
      agent.animFrame = 0;
      // With reduceMotion, place agents once per phase change only
      if (agent.lastReducedMotionPhase !== this.schedulePhase) {
        agent.lastReducedMotionPhase = this.schedulePhase;
        if (!agent.isWizard) {
          this.planAgentNextGoal(agent, state);
          if (agent.path.length > 0) {
            const finalNode = agent.path[agent.path.length - 1];
            agent.x = finalNode.x;
            agent.y = finalNode.y;
            agent.currentFloor = finalNode.floor;
            agent.path = [];
            agent.pathIndex = 0;
          }
          this.setArrivedAnim(agent);
        } else {
          const studyRoom = state.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built');
          if (studyRoom) {
            const box = roomToWorldBox(studyRoom, this.groundY);
            agent.x = box.left + box.width / 2;
            agent.y = box.floorLineY;
            agent.currentFloor = studyRoom.y;
          }
          agent.anim = 'idle';
        }
      }
      agent.animFrame = 0;
      return;
    }

    // Wizard stays near Study. The frame comes from elapsed time, after the anim is chosen.
    if (agent.isWizard) {
      const studyRoom = state.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built');
      if (studyRoom) {
        const box = roomToWorldBox(studyRoom, this.groundY);
        agent.targetX = box.left + box.width / 2;
        agent.targetY = box.floorLineY;
      }
      agent.anim = 'idle';
      this.applyFrame(agent);
      return;
    }

    // Character behavior:
    // If no path, decide destination based on schedule phase
    if (agent.path.length === 0) {
      this.planAgentNextGoal(agent, state);
    }

    // Follow path along the nav graph (never through floors)
    if (agent.path.length > 0 && agent.pathIndex < agent.path.length) {
      const targetNode = agent.path[agent.pathIndex];
      const dx = targetNode.x - agent.x;
      const dy = targetNode.y - agent.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 4) {
        agent.x = targetNode.x;
        agent.y = targetNode.y;
        agent.currentFloor = targetNode.floor;
        agent.pathIndex++;
        if (agent.pathIndex >= agent.path.length) {
          agent.path = [];
          agent.pathIndex = 0;
          this.setArrivedAnim(agent);
          agent.arrivedAt = Date.now();
        }
      } else {
        // Move towards target
        const inj = agent.character?.injury?.type;
        const limp = inj === 'sprained' || inj === 'broken_bone';
        const climbing = Math.abs(dy) > 2 && (() => {
          const currentRoom = state.rooms.find(r => r.id === agent.currentRoomId);
          return (currentRoom && (currentRoom.defId === 'spiral_stair' || currentRoom.defId === 'wizard_study')) || targetNode.kind === 'stair';
        })();
        const px = climbing ? MOVE_SPEED.climb : limp ? MOVE_SPEED.limp : agent.anim === 'carry_walk' ? MOVE_SPEED.carry : MOVE_SPEED.walk;
        const speed = px * (deltaMs / 1000);
        if (Math.abs(dx) > 1) {
          agent.facing = dx > 0 ? 'R' : 'L';
        }

        if (Math.abs(dy) > 2) {
          if (climbing) {
            agent.anim = 'climb';
            agent.y += (dy / dist) * Math.min(speed, Math.abs(dy));
          } else {
            // Never move vertically outside of a stair or Wizard's Study column
            agent.y = targetNode.y;
            agent.currentFloor = targetNode.floor;
          }
        } else {
          agent.y = targetNode.y;
          agent.anim = limp ? 'limp_walk' : 'walk';
        }
        agent.x += (dx / dist) * Math.min(speed, Math.abs(dx));
      }
    }
    this.applyFrame(agent);
  }

  /** Frame = floor(elapsed / frameMs) % frames. Changing anim restarts the phase; extra ticks do not. */
  private applyFrame(agent: VisualAgent) {
    if (agent.animPlaying !== agent.anim) {
      agent.animPlaying = agent.anim;
      agent.animBaseMs = this.clockMs;
    }
    const elapsed = this.clockMs - (agent.animBaseMs ?? this.clockMs);
    agent.animFrame = dollFrame(agent.anim, elapsed);
    agent.animTimer = elapsed;
  }

  private setArrivedAnim(agent: VisualAgent) {
    if (agent.activity === 'class') {
      agent.anim = 'sit_study';
    } else if (agent.activity === 'meal') {
      agent.anim = 'eat';
    } else if (agent.activity === 'sleep') {
      agent.anim = 'sleep';
    } else {
      agent.anim = 'idle';
    }
  }

  private isRoomReachable(roomId: number): boolean {
    if (!this.reachability) return true;
    return this.reachability.get(roomId)?.reachable ?? false;
  }

  private planAgentNextGoal(agent: VisualAgent, state: FullGameState) {
    const char = agent.character;
    if (!char) return;

    let targetRoomId: number | undefined;
    let targetActivity: 'class' | 'work' | 'meal' | 'sleep' | 'free_time' = 'free_time';

    // 1. Recovering / Injured -> infirmary or bed (must be reachable)
    if (char.injury) {
      targetRoomId = healingPlaceFor(char, state.rooms, id => this.isRoomReachable(id));
      targetActivity = 'sleep';
    } else if (this.schedulePhase === 'meal') {
      // 2. Meal -> Refectory
      const refectory = state.rooms.find(r => r.state === 'built' && r.defId === 'refectory' && this.isRoomReachable(r.id));
      targetRoomId = refectory ? refectory.id : 1;
      targetActivity = 'meal';
    } else if (this.schedulePhase === 'sleep') {
      // 3. Sleep phase -> bedRoomId
      if (char.bedRoomId && this.isRoomReachable(char.bedRoomId)) {
        targetRoomId = char.bedRoomId;
      } else {
        targetRoomId = 1; // Entrance Hall
      }
      targetActivity = 'sleep';
    } else if (this.schedulePhase === 'class_work') {
      // 4. Class or Work
      if (char.status === 'student' && char.seatRoomId && this.isRoomReachable(char.seatRoomId)) {
        targetRoomId = char.seatRoomId;
        targetActivity = 'class';
      } else if (char.workplaceRoomId && this.isRoomReachable(char.workplaceRoomId)) {
        targetRoomId = char.workplaceRoomId;
        targetActivity = 'work';
      } else {
        targetActivity = 'free_time';
      }
    }

    // 5. Free time
    if (!targetRoomId || targetActivity === 'free_time') {
      targetActivity = 'free_time';

      // Pick leisure spot once per free-time block per agent (seeded)
      if (agent.freeTimeTargetRoomId && this.isRoomReachable(agent.freeTimeTargetRoomId) && agent.freeTimeBlockId === this.freeTimeBlockCounter) {
        targetRoomId = agent.freeTimeTargetRoomId;
      } else {
        const reachableLeisureRooms = state.rooms.filter(
          r => r.state === 'built' &&
            this.isRoomReachable(r.id) &&
            (r.defId === 'common_room' || r.defId === 'library' || r.defId === 'courtyard_garden' || r.area === 'grounds')
        );

        if (reachableLeisureRooms.length > 0) {
          const seed = (char.id * 37 + this.freeTimeBlockCounter) >>> 0;
          targetRoomId = reachableLeisureRooms[seed % reachableLeisureRooms.length].id;
        } else {
          // Fallback to Entrance Hall
          targetRoomId = 1;
        }
        agent.freeTimeTargetRoomId = targetRoomId;
        agent.freeTimeBlockId = this.freeTimeBlockCounter;
      }
    }

    // Ensure fallback is reachable
    if (!targetRoomId || !this.isRoomReachable(targetRoomId)) {
      const anyReachable = state.rooms.find(r => r.state === 'built' && this.isRoomReachable(r.id));
      targetRoomId = anyReachable ? anyReachable.id : 1;
    }

    agent.targetRoomId = targetRoomId;
    agent.activity = targetActivity;

    // If agent is already in the target room and has arrived, do not replan path
    if (agent.currentRoomId === targetRoomId && agent.path.length === 0) {
      this.setArrivedAnim(agent);
      return;
    }

    // Find destination node in NavGraph
    let destNodeId: string | undefined;
    for (const [nodeId, node] of this.navGraph.nodes.entries()) {
      if (node.roomId === targetRoomId) {
        destNodeId = nodeId;
        break;
      }
    }

    if (!destNodeId) return;

    // Find closest node to agent's current position on the same floor if possible
    let startNodeId: string | undefined;
    let minD = Infinity;
    for (const [nodeId, node] of this.navGraph.nodes.entries()) {
      // Prioritize same-floor node
      const floorDiff = Math.abs(node.floor - agent.currentFloor);
      const d = Math.abs(node.x - agent.x) + Math.abs(node.y - agent.y) + floorDiff * 1000;
      if (d < minD) {
        minD = d;
        startNodeId = nodeId;
      }
    }

    if (startNodeId && destNodeId) {
      const path = this.navGraph.findPath(startNodeId, destNodeId);
      if (path.length > 0) {
        // Calculate stable slot offset in destination room so agents don't stack
        const targetRoom = state.rooms.find(r => r.id === targetRoomId);
        if (targetRoom) {
          const box = roomToWorldBox(targetRoom, this.groundY);
          const slotX = this.getRoomSlotX(targetRoomId, agent.id, state);
          // Append slot waypoint at the floor line
          path.push({
            id: `slot-${agent.id}`,
            roomId: targetRoomId,
            floor: targetRoom.y,
            x: slotX,
            y: box.floorLineY,
            kind: 'room_floor'
          });
        }

        agent.path = path;
        agent.pathIndex = 0;
        agent.currentRoomId = targetRoomId;
      }
    }
  }
}
