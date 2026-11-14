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

import { FullGameState, Character, PlacedRoom, SchoolType } from '../../types/ankicaster';
import { ROOM_DEFINITIONS } from '../../data/content';
import { NavGraph, NavNode } from '../layout/navGraph';
import { roomToWorldBox, getFloorLineY } from '../layout/gridToWorld';
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
  /** What the headmaster is doing: ponder, teach, heal, tend, garden, build, meal, wander. */
  wizardErrand?: string;
  /** Changes when the errand should be chosen again (ponder, or phase + bell). */
  wizardErrandKey?: string;
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
    const delta = groundY - this.groundY;
    this.navGraph = navGraph;
    this.groundY = groundY;
    // The whole castle is redrawn from the new ground line. Anyone already
    // standing still has to move with it, or they are left in the earth.
    if (!delta || !Number.isFinite(delta)) return;
    for (const agent of this.agents.values()) {
      agent.y += delta;
      agent.targetY += delta;
      for (const node of agent.path) node.y += delta;
    }
  }

  /** Last seen position of each room, to detect Move / Demolish. */
  private roomSignatures = new Map<number, string>();
  private lastBuiltRoomSignature = '';

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

    const builtSig = state.rooms
      .filter(r => r.state === 'built')
      .map(r => `${r.id}:${r.defId}`)
      .join(',');
    const builtRoomsChanged = this.lastBuiltRoomSignature !== '' && builtSig !== this.lastBuiltRoomSignature;
    this.lastBuiltRoomSignature = builtSig;

    // 2. Sync Characters
    const activeCharIds = new Set<string>();
    for (const char of state.characters) {
      if (char.status === 'away') continue; // Not on map
      const id = `char-${char.id}`;
      activeCharIds.add(id);

      if (!this.agents.has(id)) {
        // Spawn at assigned seat/workplace/bed, or a built classroom/dorm, or Entrance Hall
        const fallbackClass = char.status === 'student'
          ? (state.rooms.find(r => r.state === 'built' && r.defId === `class_${char.currentSchool || 'arcane'}`) ||
             state.rooms.find(r => r.state === 'built' && r.defId.startsWith('class_')))
          : undefined;
        const fallbackBed = state.rooms.find(
          r => r.state === 'built' && (r.defId === 'dormitory' || r.defId === 'grand_dormitory')
        );
        const targetRoomId =
          char.seatRoomId || char.workplaceRoomId || char.bedRoomId || fallbackClass?.id || fallbackBed?.id || 1;
        const room = state.rooms.find(r => r.id === targetRoomId && r.state === 'built') || state.rooms[0];
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
        const prevChar = agent.character;
        const assignmentChanged =
          builtRoomsChanged ||
          prevChar?.seatRoomId !== char.seatRoomId ||
          prevChar?.bedRoomId !== char.bedRoomId ||
          prevChar?.workplaceRoomId !== char.workplaceRoomId ||
          prevChar?.currentSchool !== char.currentSchool ||
          prevChar?.status !== char.status ||
          prevChar?.career !== char.career ||
          prevChar?.injury?.type !== char.injury?.type;

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
          } else if (!targetReachable || assignmentChanged) {
            // Target is unreachable or character room/school/built rooms changed: replan right away
            agent.path = [];
            agent.pathIndex = 0;
            agent.freeTimeTargetRoomId = undefined;
            this.planAgentNextGoal(agent, state);
          }
        } else if (assignmentChanged) {
          agent.path = [];
          agent.pathIndex = 0;
          agent.freeTimeTargetRoomId = undefined;
          this.planAgentNextGoal(agent, state);
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

    const phaseChanged = this.schedulePhase !== this.lastSchedulePhase;
    // Track free-time block changes
    if (this.schedulePhase === 'free_time' && this.lastSchedulePhase !== 'free_time') {
      this.freeTimeBlockCounter++;
    } else if (this.schedulePhase !== 'free_time' && this.lastSchedulePhase === 'free_time') {
      // Clear free-time destinations when leaving free time
      for (const agent of this.agents.values()) {
        agent.freeTimeTargetRoomId = undefined;
      }
    }
    if (phaseChanged) {
      for (const agent of this.agents.values()) {
        if (!agent.isWizard) {
          agent.path = [];
          agent.pathIndex = 0;
        }
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
      // With reduceMotion, place agents once per phase change only.
      // The headmaster also replans when their errand changes (a new bell, or the orb).
      const errandChanged = agent.isWizard && agent.wizardErrandKey !== this.wizardErrandKey(state);
      if (agent.lastReducedMotionPhase !== this.schedulePhase || errandChanged) {
        agent.lastReducedMotionPhase = this.schedulePhase;
        if (agent.isWizard) this.planWizardGoal(agent, state);
        else this.planAgentNextGoal(agent, state);
        if (agent.path.length > 0) {
          const finalNode = agent.path[agent.path.length - 1];
          agent.x = finalNode.x;
          agent.y = finalNode.y;
          agent.currentFloor = finalNode.floor;
          agent.currentRoomId = finalNode.roomId ?? agent.targetRoomId;
          agent.path = [];
          agent.pathIndex = 0;
        }
        this.setArrivedAnim(agent);
      }
      agent.animFrame = 0;
      return;
    }

    // The headmaster walks the school. Drop the current path when the errand changes
    // (orb started or stopped, a new bell, meal time) so they turn around immediately.
    if (agent.isWizard && agent.wizardErrandKey !== this.wizardErrandKey(state)) {
      agent.path = [];
      agent.pathIndex = 0;
    }

    // If no path, decide destination based on schedule phase (or the headmaster's errand)
    if (agent.path.length === 0) {
      if (agent.isWizard) this.planWizardGoal(agent, state);
      else this.planAgentNextGoal(agent, state);
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
        agent.currentRoomId = targetNode.roomId;
        agent.pathIndex++;
        if (agent.pathIndex >= agent.path.length) {
          agent.path = [];
          agent.pathIndex = 0;
          if (agent.targetRoomId !== undefined) {
            agent.currentRoomId = agent.targetRoomId;
          }
          this.setArrivedAnim(agent);
          agent.arrivedAt = Date.now();
        }
      } else {
        // Move towards target
        const inj = agent.character?.injury?.type;
        const limp = inj === 'sprained' || inj === 'broken_bone';
        const currentRoom = state.rooms.find(r => r.id === agent.currentRoomId);
        const prevNode = agent.pathIndex > 0 ? agent.path[agent.pathIndex - 1] : undefined;
        const targetRoom = targetNode.roomId !== undefined ? state.rooms.find(r => r.id === targetNode.roomId) : undefined;
        const prevRoom = prevNode?.roomId !== undefined ? state.rooms.find(r => r.id === prevNode.roomId) : currentRoom;
        const isStairLink = (r?: PlacedRoom) => r?.defId === 'spiral_stair' || r?.defId === 'wizard_study';
        // Vertical climbing happens ONLY along spiral_stair or wizard_study stair links
        const climbing =
          Math.abs(dy) > 2 &&
          targetNode.kind === 'stair' &&
          isStairLink(targetRoom) &&
          (prevNode ? prevNode.kind === 'stair' && isStairLink(prevRoom) : isStairLink(currentRoom));
        const pathStep =
          !climbing &&
          Math.abs(dy) > 2 &&
          Math.abs(dy) <= 10 &&
          (targetNode.kind === 'path' ||
            targetNode.kind === 'plot' ||
            prevNode?.kind === 'path' ||
            prevNode?.kind === 'plot' ||
            currentRoom?.defId === 'entrance_hall' ||
            currentRoom?.area === 'grounds');
        const px = climbing ? MOVE_SPEED.climb : limp ? MOVE_SPEED.limp : agent.anim === 'carry_walk' ? MOVE_SPEED.carry : MOVE_SPEED.walk;
        const speed = px * (deltaMs / 1000);
        if (Math.abs(dx) > 1) {
          agent.facing = dx > 0 ? 'R' : 'L';
        }

        if (Math.abs(dy) > 2) {
          if (climbing) {
            agent.anim = 'climb';
            agent.y += (dy / dist) * Math.min(speed, Math.abs(dy));
          } else if (pathStep) {
            agent.anim = limp ? 'limp_walk' : 'walk';
            agent.y += (dy / dist) * Math.min(speed, Math.abs(dy));
          } else if (targetNode.floor === agent.currentFloor) {
            // Same-floor alignment only (never snap across floors outside a stair)
            agent.y = targetNode.y;
            agent.anim = limp ? 'limp_walk' : 'walk';
          } else {
            // Invalid cross-floor transition without a stair: drop path & replan cleanly
            agent.path = [];
            agent.pathIndex = 0;
            agent.anim = 'idle';
            this.applyFrame(agent);
            return;
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

  /** Feet on the Wizard's Study floor. No-op if the study is not built yet. */
  private wizardErrandKey(state: FullGameState): string {
    const session = state.wizard.activeSession;
    if (session?.kind === 'orb' && session.state === 'active') return 'ponder';
    return `${this.schedulePhase}:${state.bellIndex ?? 0}`;
  }

  /** Orb session: stay in the Study. Otherwise cover an open job, then walk the school. */
  private planWizardGoal(agent: VisualAgent, state: FullGameState) {
    const key = this.wizardErrandKey(state);
    if (agent.wizardErrandKey === key && agent.path.length === 0 && agent.currentRoomId !== undefined && agent.currentRoomId === agent.targetRoomId) {
      this.setArrivedAnim(agent);
      return;
    }
    const task = this.chooseWizardTask(state);
    agent.wizardErrandKey = key;
    agent.wizardErrand = task.errand;
    agent.activity = task.activity;
    agent.targetRoomId = task.roomId;
    if (task.roomId !== undefined && agent.currentRoomId === task.roomId && agent.path.length === 0) {
      this.setArrivedAnim(agent);
      return;
    }
    if (task.roomId !== undefined) this.routeToRoom(agent, state, task.roomId);
  }

  private chooseWizardTask(state: FullGameState): { roomId?: number; errand: string; activity: VisualAgent['activity'] } {
    const built = state.rooms.filter(r => r.state === 'built' && this.isRoomReachable(r.id));
    const session = state.wizard.activeSession;
    if (session?.kind === 'orb' && session.state === 'active') {
      const study = built.find(r => r.defId === 'wizard_study');
      return { roomId: study?.id, errand: 'ponder', activity: 'work' };
    }
    if (this.schedulePhase === 'meal') {
      const refectory = built.find(r => r.defId === 'refectory');
      if (refectory) return { roomId: refectory.id, errand: 'meal', activity: 'meal' };
    }

    const bell = state.bellIndex ?? 0;
    const onDuty = (career: string, roomId?: number) => state.characters.some(c =>
      c.career === career && c.careerState !== 'sabbatical' && c.status !== 'away' &&
      (roomId === undefined || c.workplaceRoomId === roomId)
    );

    const classrooms = built.filter(r => r.defId.startsWith('class_') && !onDuty('teacher', r.id));
    if (classrooms.length) {
      const levels = state.wizard.levels || {};
      classrooms.sort((a, b) => {
        const la = levels[a.defId.slice('class_'.length) as SchoolType] || 0;
        const lb = levels[b.defId.slice('class_'.length) as SchoolType] || 0;
        return lb - la || a.id - b.id;
      });
      return { roomId: classrooms[0].id, errand: 'teach', activity: 'class' };
    }

    const hurt = state.characters.some(c => c.injury && c.status !== 'away');
    const infirmary = built.find(r => r.defId === 'infirmary');
    if (hurt && infirmary && !onDuty('healer')) return { roomId: infirmary.id, errand: 'heal', activity: 'work' };

    const wary = (state.creatures || []).some(c => c.status === 'wary');
    if (wary && !onDuty('tamer')) {
      const pen = built.find(r => (ROOM_DEFINITIONS[r.defId]?.capacity?.creatures ?? 0) > 0 || ROOM_DEFINITIONS[r.defId]?.workplace?.career === 'tamer');
      if (pen) return { roomId: pen.id, errand: 'tend', activity: 'work' };
    }

    const sites = state.rooms.filter(r => r.state === 'site');
    if (sites.length && !onDuty('builder')) {
      const beside = built.filter(r => r.defId !== 'wizard_study' && sites.some(site => roomsTouch(r, site)));
      const spot = beside.length ? beside[bell % beside.length] : built.find(r => sites.some(site => roomsTouch(r, site)));
      if (spot) return { roomId: spot.id, errand: 'build', activity: 'work' };
    }

    const greenhouse = built.find(r => ROOM_DEFINITIONS[r.defId]?.workplace?.career === 'gardener' && !onDuty('gardener', r.id));
    if (greenhouse) return { roomId: greenhouse.id, errand: 'garden', activity: 'work' };

    // Headmaster's Presence: a different room each bell. Never the Study unless it is the only room.
    if (state.wizard?.presenceRoomId !== undefined) {
      const targetPresence = built.find(r => r.id === state.wizard.presenceRoomId);
      if (targetPresence) {
        return { roomId: targetPresence.id, errand: 'wander', activity: 'free_time' };
      }
    }
    const pool = built.filter(r => r.defId !== 'wizard_study' && r.defId !== 'spiral_stair' && r.defId !== 'support_pillar' && r.defId !== 'corridor');
    const visit = pool.length ? pool[(bell * 17 + (state.day ?? 0)) % pool.length] : built.find(r => r.defId === 'wizard_study') || built[0];
    return { roomId: visit?.id, errand: 'wander', activity: 'free_time' };
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
    if (agent.isWizard) {
      if (agent.wizardErrand === 'ponder') agent.anim = 'cast';
      else if (agent.wizardErrand === 'teach') agent.anim = 'teach';
      else if (agent.wizardErrand === 'meal') agent.anim = 'eat';
      else if (agent.wizardErrand === 'heal' || agent.wizardErrand === 'tend' || agent.wizardErrand === 'garden' || agent.wizardErrand === 'build') agent.anim = 'work';
      else agent.anim = 'idle';
      return;
    }
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
      // 3. Sleep phase -> bedRoomId (or fallback to any built reachable dormitory)
      const assignedBed = char.bedRoomId != null
        ? state.rooms.find(r => r.id === char.bedRoomId && r.state === 'built' && this.isRoomReachable(r.id))
        : undefined;
      const fallbackBed =
        assignedBed ||
        state.rooms.find(
          r => r.state === 'built' &&
            this.isRoomReachable(r.id) &&
            (r.defId === 'dormitory' || r.defId === 'grand_dormitory' || (char.status === 'faculty' && r.defId === 'faculty_quarters'))
        );
      targetRoomId = fallbackBed ? fallbackBed.id : 1; // Entrance Hall
      targetActivity = 'sleep';
    } else if (this.schedulePhase === 'class_work') {
      // 4. Class or Work
      if (char.status === 'student') {
        const assignedSeat = char.seatRoomId != null
          ? state.rooms.find(r => r.id === char.seatRoomId && r.state === 'built' && this.isRoomReachable(r.id))
          : undefined;
        const schoolClass = state.rooms.find(
          r => r.state === 'built' && r.defId === `class_${char.currentSchool || 'arcane'}` && this.isRoomReachable(r.id)
        );
        const anyClass = state.rooms.find(
          r => r.state === 'built' && r.defId.startsWith('class_') && this.isRoomReachable(r.id)
        );
        const classRoom =
          (assignedSeat && assignedSeat.defId.startsWith('class_') ? assignedSeat : undefined) ||
          schoolClass ||
          anyClass ||
          assignedSeat;
        if (classRoom) {
          targetRoomId = classRoom.id;
          targetActivity = 'class';
        } else {
          targetActivity = 'free_time';
        }
      } else if (char.workplaceRoomId && this.isRoomReachable(char.workplaceRoomId)) {
        targetRoomId = char.workplaceRoomId;
        targetActivity = 'work';
      } else if (char.career && char.careerState !== 'sabbatical') {
        const fallbackWp = state.rooms.find(
          r => r.state === 'built' &&
            this.isRoomReachable(r.id) &&
            ROOM_DEFINITIONS[r.defId]?.workplace?.career === char.career
        );
        if (fallbackWp) {
          targetRoomId = fallbackWp.id;
          targetActivity = 'work';
        } else {
          targetActivity = 'free_time';
        }
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
        const indoorSocialRooms = state.rooms.filter(
          r => r.state === 'built' &&
            this.isRoomReachable(r.id) &&
            (r.defId === 'common_room' ||
              r.defId === 'library' ||
              r.defId === 'courtyard_garden' ||
              r.defId === 'faculty_lounge' ||
              r.defId === 'bathhouse' ||
              r.defId === 'refectory' ||
              r.defId === 'dormitory' ||
              r.defId === 'grand_dormitory' ||
              r.defId === 'entrance_hall')
        );
        const nonHallRooms = indoorSocialRooms.filter(r => r.defId !== 'entrance_hall');
        const reachableLeisureRooms = nonHallRooms.length > 0 ? nonHallRooms : indoorSocialRooms;

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

    this.routeToRoom(agent, state, targetRoomId);
  }

  /** Walk the nav graph to a room and stop on a slot of the floor the path arrives on. */
  private routeToRoom(agent: VisualAgent, state: FullGameState, targetRoomId: number) {
    // Prefer a floor or plot node over the stair column.
    const destCandidates = Array.from(this.navGraph.nodes.values())
      .filter(n => n.roomId === targetRoomId)
      .sort((a, b) => (a.kind === 'stair' ? 1 : 0) - (b.kind === 'stair' ? 1 : 0) || a.floor - b.floor);

    if (destCandidates.length === 0) return;

    // Find closest node to agent's current position on the same floor if possible
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

    if (startNodeId) {
      let bestPath: NavNode[] = [];
      for (const destNode of destCandidates) {
        const candidatePath = this.navGraph.findPath(startNodeId, destNode.id);
        if (candidatePath.length > 0 && (bestPath.length === 0 || candidatePath.length < bestPath.length)) {
          bestPath = candidatePath;
        }
      }

      if (bestPath.length === 0) {
        const ehRoom = state.rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall' && r.y === 0);
        const ehNode = ehRoom ? this.navGraph.nodes.get(`room-${ehRoom.id}-f0`) : undefined;
        if (ehRoom && ehNode && targetRoomId !== ehRoom.id) {
          const ehPath = this.navGraph.findPath(startNodeId, ehNode.id);
          if (ehPath.length > 0) {
            bestPath = ehPath;
            targetRoomId = ehRoom.id;
            agent.targetRoomId = ehRoom.id;
          }
        }
      }

      if (bestPath.length > 0) {
        const targetRoom = state.rooms.find(r => r.id === targetRoomId);
        const lastNode = bestPath[bestPath.length - 1];
        if (targetRoom) {
          const box = roomToWorldBox(targetRoom, this.groundY);
          const slotX = this.getRoomSlotX(targetRoomId, agent.id, state);
          const destFloor = targetRoom.area === 'castle' ? lastNode.floor : 0;
          const destY = targetRoom.area === 'castle' ? getFloorLineY(destFloor, this.groundY) : box.floorLineY;
          // Append slot waypoint at the connected floor line
          bestPath.push({
            id: `slot-${agent.id}`,
            roomId: targetRoomId,
            floor: destFloor,
            x: slotX,
            y: destY,
            kind: targetRoom.area === 'grounds' ? 'plot' : 'room_floor'
          });
        }

        agent.path = bestPath;
        agent.pathIndex = 0;
      }
    }
  }
}

/** Share an edge on the castle grid, or sit on neighbouring grounds plots. */
function roomsTouch(a: PlacedRoom, b: PlacedRoom): boolean {
  if (a.area !== b.area) return false;
  if (a.area === 'grounds') {
    return a.x + a.w === b.x || b.x + b.w === a.x;
  }
  const xOverlap = a.x < b.x + b.w && b.x < a.x + a.w;
  const yOverlap = a.y < b.y + b.h && b.y < a.y + a.h;
  const xTouch = a.x + a.w === b.x || b.x + b.w === a.x;
  const yTouch = a.y + a.h === b.y || b.y + b.h === a.y;
  return (xTouch && yOverlap) || (yTouch && xOverlap);
}
