/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Choreographer & NPC Day Routine
 * Driven by the player's real local clock (Section 2), period/desk assignments
 * (Sections 3-5), personal staggered 8-12 min timers (Section 6), weighted
 * free-time & duty destinations (Section 7), two-sitting meals & night sleep
 * rules (Section 8), room-local conversations (Section 9), and physical
 * furniture anchors (Section 10).
 * Never imports engine.ts (VR-01) and never mutates FullGameState.
 */

import { FullGameState, Character, PlacedRoom, SchoolType } from '../../types/ankicaster';
import { ROOM_DEFINITIONS } from '../../data/content';
import { NavGraph, NavNode } from '../layout/navGraph';
import { roomToWorldBox, getFloorLineY } from '../layout/gridToWorld';
import {
  buildRoomAnchors,
  findBuilderSiteEdgeAnchor,
  RoomAnchor,
  RoomAnchorSet
} from '../layout/roomAnchors';
import { ReachabilityInfo } from '../../utils/reachability';
import { normalizeAppearance } from '../../utils/appearance';
import { MOVE_SPEED, healingPlaceFor, DollAnim, dollFrame } from './doll';
import {
  AcademySchedule,
  MealSittingAssignment,
  agentOffsetMinutes,
  buildAcademySchedule,
  buildMealSittings,
  classroomDeskCount,
  getDayBlock,
  hashAgentId,
  resolveAcademyLocalHours
} from '../../utils/schedule';

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
  /** What the headmaster is doing: ponder, teach, eat, sleep, wander, etc. */
  wizardErrand?: string;
  /** Changes when the errand should be chosen again. */
  wizardErrandKey?: string;
  currentRoomId?: number;
  targetRoomId?: number;
  targetAnchorId?: string;
  targetAnchorX?: number;
  targetAnchorY?: number;
  targetAnchorFloor?: number;
  desiredAnim?: AgentAnimation;
  freeTimeTargetRoomId?: number;
  freeTimeBlockId?: number;
  lastReducedMotionPhase?: string;
  lastBlockKey?: string;
  personalTimerMs?: number;
  personalTimerDurationMs?: number;
  personalTimerEpoch?: number;
  talkingWithId?: string;
  talkingRemainingMs?: number;
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

const STUDENT_BANNED_ROOMS = new Set([
  'quarry',
  'woodlot',
  'workshop',
  'glassworks',
  'weaving_room',
  'rift_gate',
  'storage_vault',
  'support_pillar',
  'corridor',
  'spiral_stair',
  'wizard_study'
]);

const FACULTY_NEVER_HOBBY_ROOMS = new Set([
  'quarry',
  'woodlot',
  'rift_gate',
  'storage_vault',
  'support_pillar',
  'corridor',
  'spiral_stair'
]);

function hasTrait(c: Character | undefined, trait: string): boolean {
  return !!c?.traits?.some(t => t.toLowerCase() === trait.toLowerCase());
}

function personalDurationFor(agentId: string): number {
  return 480_000 + (hashAgentId(`${agentId}:timer_dur`) % 240_001);
}

function initialPersonalElapsed(agentId: string, durationMs: number): number {
  return hashAgentId(`${agentId}:timer_phase`) % Math.max(1, durationMs);
}

type DesiredGoal = {
  blockKey: string;
  mandatory: boolean;
  activity: VisualAgent['activity'];
  roomId?: number;
  anchor?: RoomAnchor;
  anim: AgentAnimation;
  wizardErrand?: string;
  canKeepOnTimer: boolean;
  candidatePool?: Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }>;
  allowTalk?: boolean;
};

export class Choreographer {
  agents = new Map<string, VisualAgent>();
  schedulePhase: 'class_work' | 'free_time' | 'meal' | 'sleep' = 'class_work';
  /** Elapsed animation clock. Advances with real time, never with the number of callbacks. */
  clockMs = 0;
  private lastReal = -1;
  private roomAnchorsCache = new Map<number, RoomAnchorSet>();
  private lastAnchorSig = '';

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
    this.roomAnchorsCache.clear();
    this.lastAnchorSig = '';
    if (!delta || !Number.isFinite(delta)) return;
    for (const agent of this.agents.values()) {
      agent.y += delta;
      agent.targetY += delta;
      if (agent.targetAnchorY !== undefined) agent.targetAnchorY += delta;
      for (const node of agent.path) node.y += delta;
    }
  }

  private roomSignatures = new Map<number, string>();
  private lastBuiltRoomSignature = '';

  private refreshAnchors(state: FullGameState) {
    const sig =
      `${this.groundY}|` +
      (state.rooms || [])
        .map(r => `${r.id}:${r.defId}:${r.state}:${r.x}:${r.y}:${r.w}:${r.h}:${(r.furniture || []).map(f => `${f.id}-${f.defId}-${f.damaged ? 1 : 0}`).join('.')}`)
        .join(';');
    if (sig === this.lastAnchorSig) return;
    this.lastAnchorSig = sig;
    this.roomAnchorsCache.clear();
    for (const room of state.rooms || []) {
      if (room.state === 'built') {
        this.roomAnchorsCache.set(room.id, buildRoomAnchors(room, this.groundY));
      }
    }
  }

  private anchorsFor(roomId: number, state: FullGameState): RoomAnchorSet | undefined {
    this.refreshAnchors(state);
    return this.roomAnchorsCache.get(roomId);
  }

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
      const hit =
        (agent.currentRoomId !== undefined && changed.has(agent.currentRoomId)) ||
        (agent.targetRoomId !== undefined && changed.has(agent.targetRoomId));
      if (!hit) continue;
      const room = state.rooms.find(r => r.id === agent.currentRoomId) || fallback;
      agent.path = [];
      agent.pathIndex = 0;
      agent.freeTimeTargetRoomId = undefined;
      agent.targetAnchorId = undefined;
      agent.talkingRemainingMs = 0;
      agent.talkingWithId = undefined;
      if (!room) continue;
      const set = this.anchorsFor(room.id, state);
      const anchor = set?.all[0];
      const box = roomToWorldBox(room, this.groundY);
      agent.x = agent.targetX = anchor ? anchor.x : box.left + box.width / 2;
      agent.y = agent.targetY = anchor ? anchor.y : box.floorLineY;
      agent.currentFloor = agent.targetFloor = anchor ? anchor.floor : room.area === 'castle' ? room.y : 0;
      agent.currentRoomId = agent.targetRoomId = room.id;
      agent.targetAnchorId = anchor?.id;
      this.setArrivedAnim(agent);
    }
  }

  syncState(state: FullGameState, reachability?: Map<number, ReachabilityInfo>) {
    if (reachability) {
      this.reachability = reachability;
    }
    this.refreshAnchors(state);

    // 1. Sync Wizard
    if (!this.agents.has('wizard')) {
      const studyRoom = state.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built');
      let wx = 500;
      let wy = this.groundY - 4;
      let floor = 0;
      if (studyRoom) {
        const set = this.anchorsFor(studyRoom.id, state);
        const anchor = set?.orbs[0] ?? set?.all[0];
        const box = roomToWorldBox(studyRoom, this.groundY);
        wx = anchor ? anchor.x : box.left + box.width / 2;
        wy = anchor ? anchor.y : box.floorLineY;
        floor = anchor ? anchor.floor : studyRoom.y;
      }

      const look = normalizeAppearance(state.wizard.appearance);
      const dur = personalDurationFor('wizard');

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
        personalTimerMs: initialPersonalElapsed('wizard', dur),
        personalTimerDurationMs: dur,
        personalTimerEpoch: 0,
        talkingRemainingMs: 0,
        path: [],
        pathIndex: 0,
        robeColor: look.robeColor,
        hat: look.hat,
        hair: look.hair,
        hairColor: look.hairColor,
        skin: look.skin,
        staff: look.staff,
        bodyShape: look.bodyShape,
        eyes: look.eyes,
        face: look.face,
        shoes: look.shoes,
        name: `${state.wizard.title} ${state.wizard.name}`
      });
    }

    // Keep the wizard's look in sync
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

    this.resettleAgentsForLayoutChange(state);

    const builtSig = state.rooms
      .filter(r => r.state === 'built')
      .map(r => `${r.id}:${r.defId}:${(r.furniture || []).length}`)
      .join(',');
    const builtRoomsChanged = this.lastBuiltRoomSignature !== '' && builtSig !== this.lastBuiltRoomSignature;
    this.lastBuiltRoomSignature = builtSig;

    // 2. Sync Characters
    const activeCharIds = new Set<string>();
    for (const char of state.characters) {
      if (char.status === 'away') continue;
      const id = `char-${char.id}`;
      activeCharIds.add(id);

      if (!this.agents.has(id)) {
        const ehRoom = state.rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall');
        const spawnRoomId =
          char.bedRoomId || char.seatRoomId || char.workplaceRoomId || ehRoom?.id || state.rooms[0]?.id;
        const room = state.rooms.find(r => r.id === spawnRoomId && r.state === 'built') || ehRoom || state.rooms[0];
        let sx = 400;
        let sy = this.groundY - 4;
        let fl = 0;
        if (room) {
          const box = roomToWorldBox(room, this.groundY);
          const set = this.anchorsFor(room.id, state);
          const taken = this.collectTakenAnchors(state);
          const freeAnchor = set?.all.find(a => !taken.has(a.id));
          sx = freeAnchor ? freeAnchor.x : box.left + box.width / 2;
          sy = freeAnchor ? freeAnchor.y : box.floorLineY;
          fl = freeAnchor ? freeAnchor.floor : room.area === 'castle' ? room.y : 0;
        }

        const schoolColors: Record<string, string> = {
          arcane: '#6B4FBB',
          nature: '#4E8B3A',
          light: '#E8C547',
          shadow: '#2F3A73',
          alchemy: '#B5651D'
        };
        const look = normalizeAppearance({ ...char.appearance, staff: 'oak' }, char.id);
        const robeCol = char.currentSchool ? schoolColors[char.currentSchool] || '#4E8B3A' : look.robeColor;
        const dur = personalDurationFor(id);

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
          facing: hashAgentId(id) % 2 === 0 ? 'R' : 'L',
          anim: 'idle',
          animFrame: hashAgentId(id) % 4,
          animTimer: 0,
          activity: 'free_time',
          currentRoomId: room?.id,
          targetRoomId: room?.id,
          personalTimerMs: initialPersonalElapsed(id, dur),
          personalTimerDurationMs: dur,
          personalTimerEpoch: 0,
          talkingRemainingMs: 0,
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
          prevChar?.classRoomId !== char.classRoomId ||
          prevChar?.period !== char.period ||
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

        if (this.reachability) {
          const currentReachable = agent.currentRoomId ? this.reachability.get(agent.currentRoomId)?.reachable ?? true : true;
          const targetReachable = agent.targetRoomId ? this.reachability.get(agent.targetRoomId)?.reachable ?? true : true;
          if (!currentReachable) {
            agent.path = [];
            agent.pathIndex = 0;
            agent.targetAnchorId = undefined;
            agent.lastBlockKey = undefined;
            agent.talkingRemainingMs = 0;
            agent.talkingWithId = undefined;
          } else if (!targetReachable || assignmentChanged) {
            agent.path = [];
            agent.pathIndex = 0;
            agent.lastBlockKey = undefined;
          }
        } else if (assignmentChanged) {
          agent.path = [];
          agent.pathIndex = 0;
          agent.lastBlockKey = undefined;
        }
      }
    }

    // Clean up removed characters
    for (const [id, agent] of this.agents.entries()) {
      if (!agent.isWizard && !activeCharIds.has(id)) {
        if (agent.talkingWithId) {
          const partner = this.agents.get(agent.talkingWithId);
          if (partner) {
            partner.talkingWithId = undefined;
            partner.talkingRemainingMs = 0;
            this.setArrivedAnim(partner);
          }
        }
        this.agents.delete(id);
      }
    }
  }

  /**
   * Real-time gap. Repeated callbacks with the same `now` add nothing.
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
    this.refreshAnchors(state);

    const hoursFloat = resolveAcademyLocalHours(state, nowMs);
    const block = getDayBlock(hoursFloat);
    if (block.kind === 'period') this.schedulePhase = 'class_work';
    else if (block.kind === 'meal') this.schedulePhase = 'meal';
    else if (block.kind === 'night') this.schedulePhase = 'sleep';
    else this.schedulePhase = 'free_time';

    const reachMap = this.reachability;
    const schedule = buildAcademySchedule(state, reachMap);
    const sittings = buildMealSittings(state, reachMap);

    // Track claimed anchors globally so no two agents ever target the same anchor coordinate
    const takenAnchors = this.collectTakenAnchors(state);

    // Pre-assign stable bed anchors per dorm room for roommates
    const bedAssignmentByCharId = this.computeDormBedMap(state);

    // Deterministic order: wizard then characters sorted by numeric id
    const orderedAgents = Array.from(this.agents.values()).sort((a, b) => {
      if (a.isWizard !== b.isWizard) return a.isWizard ? -1 : 1;
      return (a.character?.id ?? 0) - (b.character?.id ?? 0);
    });

    for (const agent of orderedAgents) {
      if (agent.targetAnchorId) takenAnchors.delete(agent.targetAnchorId);
      this.updateAgent(agent, gap, state, hoursFloat, schedule, sittings, takenAnchors, bedAssignmentByCharId, reduceMotion);
      if (agent.targetAnchorId) takenAnchors.add(agent.targetAnchorId);
    }
  }

  private collectTakenAnchors(state: FullGameState, excludeAgentId?: string): Set<string> {
    const taken = new Set<string>();
    for (const a of this.agents.values()) {
      if (a.id === excludeAgentId) continue;
      if (a.targetAnchorId) taken.add(a.targetAnchorId);
      // Also reserve exact room floor anchor if standing on it with no targetAnchorId? No, targetAnchorId is always set when assigned.
      void state;
    }
    return taken;
  }

  private computeDormBedMap(state: FullGameState): Map<number, RoomAnchor> {
    const map = new Map<number, RoomAnchor>();
    const dorms = (state.rooms || [])
      .filter(r => r.state === 'built' && this.isRoomReachable(r.id) && (r.defId === 'dormitory' || r.defId === 'grand_dormitory' || r.defId === 'faculty_quarters'))
      .sort((a, b) => a.id - b.id);

    for (const dorm of dorms) {
      const set = this.anchorsFor(dorm.id, state);
      if (!set || set.beds.length === 0) continue;
      const residents = (state.characters || [])
        .filter(c => c.status !== 'away' && c.bedRoomId === dorm.id)
        .slice()
        .sort((a, b) => a.id - b.id);
      for (let i = 0; i < residents.length && i < set.beds.length; i++) {
        map.set(residents[i].id, set.beds[i]);
      }
    }
    return map;
  }

  private updateAgent(
    agent: VisualAgent,
    deltaMs: number,
    state: FullGameState,
    hoursFloat: number,
    schedule: AcademySchedule,
    sittings: Map<string, MealSittingAssignment>,
    takenAnchors: Set<string>,
    bedMap: Map<number, RoomAnchor>,
    reduceMotion: boolean
  ) {
    if (agent.talkingRemainingMs == null) agent.talkingRemainingMs = 0;
    if (agent.personalTimerMs == null) agent.personalTimerMs = 0;
    if (agent.personalTimerEpoch == null) agent.personalTimerEpoch = 0;
    if (agent.personalTimerDurationMs == null) agent.personalTimerDurationMs = personalDurationFor(agent.id);

    // 1. Conversation countdown (holds personal timer)
    if (!reduceMotion && agent.talkingRemainingMs > 0) {
      agent.talkingRemainingMs -= deltaMs;
      if (agent.talkingRemainingMs <= 0) {
        agent.talkingRemainingMs = 0;
        const partnerId = agent.talkingWithId;
        agent.talkingWithId = undefined;
        if (partnerId) {
          const p = this.agents.get(partnerId);
          if (p && p.talkingWithId === agent.id) {
            p.talkingWithId = undefined;
            p.talkingRemainingMs = 0;
            this.setArrivedAnim(p);
          }
        }
        this.setArrivedAnim(agent);
      }
    }

    // 2. Resolve desired mode/block from real clock
    const desired = this.resolveDesiredGoal(agent, state, hoursFloat, schedule, sittings, takenAnchors, bedMap);
    const blockChanged = agent.lastBlockKey !== desired.blockKey;
    const isTalking = !reduceMotion && agent.talkingRemainingMs > 0;

    // If mandatory block starts (or injury/sleep/class/meal begins), cancel any conversation immediately
    if ((desired.mandatory && blockChanged) || (agent.character?.injury && isTalking)) {
      this.endConversation(agent);
    }

    // Check personal timer if NOT talking and in non-mandatory block (or Night Owl awake)
    let timerTriggeredPick = false;
    if (!desired.mandatory && agent.talkingRemainingMs <= 0) {
      if (!reduceMotion) {
        agent.personalTimerMs += deltaMs;
        if (agent.personalTimerMs >= agent.personalTimerDurationMs) {
          agent.personalTimerMs %= agent.personalTimerDurationMs;
          agent.personalTimerEpoch++;
          timerTriggeredPick = true;
        }
      }
    }

    if (reduceMotion) {
      agent.animFrame = 0;
      const rmKey = `${desired.blockKey}:${agent.personalTimerEpoch}:${desired.roomId ?? 'none'}:${desired.anchor?.id ?? 'none'}`;
      if (agent.lastReducedMotionPhase !== rmKey || !agent.targetAnchorId) {
        agent.lastReducedMotionPhase = rmKey;
        agent.lastBlockKey = desired.blockKey;
        this.applyResolvedGoal(agent, desired, state, takenAnchors, false, true);
        if (agent.path.length > 0) {
          const finalNode = agent.path[agent.path.length - 1];
          agent.x = finalNode.x;
          agent.y = finalNode.y;
          agent.currentFloor = finalNode.floor;
          agent.currentRoomId = finalNode.roomId ?? agent.targetRoomId;
          agent.path = [];
          agent.pathIndex = 0;
        } else if (agent.targetAnchorX !== undefined && agent.targetAnchorY !== undefined) {
          agent.x = agent.targetAnchorX;
          agent.y = agent.targetAnchorY;
          agent.currentFloor = agent.targetAnchorFloor ?? agent.currentFloor;
          agent.currentRoomId = agent.targetRoomId;
        }
        this.setArrivedAnim(agent);
      }
      agent.animFrame = 0;
      return;
    }

    // 3. Re-plan when block changes, agent has no valid anchor yet, current room became unreachable, or personal timer triggers a new pick
    const needInitialPick =
      agent.targetRoomId === undefined ||
      !this.isRoomReachable(agent.targetRoomId) ||
      !agent.targetAnchorId;

    if (blockChanged || needInitialPick) {
      agent.lastBlockKey = desired.blockKey;
      // Release old anchor before picking new
      if (agent.targetAnchorId) takenAnchors.delete(agent.targetAnchorId);
      const changed = this.applyResolvedGoal(agent, desired, state, takenAnchors, false, false);
      if (!changed && agent.path.length === 0) {
        this.setArrivedAnim(agent);
      }
    } else if (timerTriggeredPick) {
      if (agent.talkingRemainingMs <= 0 && agent.path.length === 0) {
        // ~50% stay if anchor still fits and is ours
        const stayHash = hashAgentId(`${agent.id}:stay:${agent.personalTimerEpoch}`);
        const staying = (stayHash % 100) < 50 && this.isCurrentAnchorStillValid(agent, desired, state);
        if (staying) {
          // Stay at current spot, still allowed to roll for a conversation
          this.tryTriggerConversation(agent, state, hoursFloat, `timer:${agent.personalTimerEpoch}`);
        } else {
          if (agent.targetAnchorId) takenAnchors.delete(agent.targetAnchorId);
          this.applyResolvedGoal(agent, desired, state, takenAnchors, true, false);
        }
      }
    }

    // While talking, hold still in talk animation (no walking)
    if (agent.talkingRemainingMs > 0 && !desired.mandatory) {
      agent.anim = 'talk';
      this.applyFrame(agent);
      return;
    }

    // 4. Follow path along nav graph
    if (agent.path.length > 0 && agent.pathIndex < agent.path.length) {
      const targetNode = agent.path[agent.pathIndex];
      const dx = targetNode.x - agent.x;
      const dy = targetNode.y - agent.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 4) {
        agent.x = targetNode.x;
        agent.y = targetNode.y;
        agent.currentFloor = targetNode.floor;
        if (targetNode.roomId !== undefined) agent.currentRoomId = targetNode.roomId;
        agent.pathIndex++;
        if (agent.pathIndex >= agent.path.length) {
          agent.path = [];
          agent.pathIndex = 0;
          if (agent.targetRoomId !== undefined) {
            agent.currentRoomId = agent.targetRoomId;
          }
          if (agent.targetAnchorX !== undefined && agent.targetAnchorY !== undefined) {
            agent.x = agent.targetAnchorX;
            agent.y = agent.targetAnchorY;
            if (agent.targetAnchorFloor !== undefined) agent.currentFloor = agent.targetAnchorFloor;
          }
          this.setArrivedAnim(agent);
          agent.arrivedAt = Date.now();
          if (desired.allowTalk && !desired.mandatory) {
            this.tryTriggerConversation(agent, state, hoursFloat, `arrive:${Math.floor(this.clockMs)}:${agent.currentRoomId}`);
          }
        }
      } else {
        const inj = agent.character?.injury?.type;
        const limp = inj === 'sprained' || inj === 'broken_bone';
        const currentRoom = state.rooms.find(r => r.id === agent.currentRoomId);
        const prevNode = agent.pathIndex > 0 ? agent.path[agent.pathIndex - 1] : undefined;
        const targetRoom = targetNode.roomId !== undefined ? state.rooms.find(r => r.id === targetNode.roomId) : undefined;
        const prevRoom = prevNode?.roomId !== undefined ? state.rooms.find(r => r.id === prevNode.roomId) : currentRoom;
        const isStairLink = (r?: PlacedRoom) => r?.defId === 'spiral_stair' || r?.defId === 'wizard_study';
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
            agent.y = targetNode.y;
            agent.anim = limp ? 'limp_walk' : 'walk';
          } else {
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
    } else if (agent.targetAnchorX !== undefined && agent.targetAnchorY !== undefined) {
      // Snap cleanly to anchor if already in same room with no active path
      if (agent.currentRoomId === agent.targetRoomId && Math.abs(agent.x - agent.targetAnchorX) < 1.5) {
        this.setArrivedAnim(agent);
      }
    }
    this.applyFrame(agent);
  }

  private endConversation(agent: VisualAgent) {
    if (agent.talkingWithId) {
      const p = this.agents.get(agent.talkingWithId);
      if (p && p.talkingWithId === agent.id) {
        p.talkingWithId = undefined;
        p.talkingRemainingMs = 0;
        this.setArrivedAnim(p);
      }
    }
    agent.talkingWithId = undefined;
    agent.talkingRemainingMs = 0;
  }

  private isCurrentAnchorStillValid(agent: VisualAgent, desired: DesiredGoal, state: FullGameState): boolean {
    if (!agent.targetRoomId || !agent.targetAnchorId) return false;
    if (!this.isRoomReachable(agent.targetRoomId)) return false;
    if (desired.candidatePool && desired.candidatePool.length > 0) {
      return desired.candidatePool.some(c => c.room.id === agent.targetRoomId);
    }
    const r = state.rooms.find(rm => rm.id === agent.targetRoomId && rm.state === 'built');
    return !!r;
  }

  private applyResolvedGoal(
    agent: VisualAgent,
    desired: DesiredGoal,
    state: FullGameState,
    takenAnchors: Set<string>,
    preferDifferent: boolean,
    reduceMotion: boolean
  ): boolean {
    let chosenRoomId = desired.roomId;
    let chosenAnchor = desired.anchor;
    let chosenAnim = desired.anim;

    if (!chosenAnchor && desired.candidatePool && desired.candidatePool.length > 0) {
      const picked = this.pickFromWeightedPool(
        agent,
        desired.candidatePool,
        state,
        takenAnchors,
        preferDifferent,
        reduceMotion
      );
      if (picked) {
        chosenRoomId = picked.room.id;
        chosenAnchor = picked.anchor;
        chosenAnim = picked.anim;
      }
    }

    // Final safety fallback to any built reachable room (e.g., entrance_hall)
    if (!chosenRoomId || !this.isRoomReachable(chosenRoomId)) {
      const eh = state.rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall' && this.isRoomReachable(r.id));
      const any = eh || state.rooms.find(r => r.state === 'built' && this.isRoomReachable(r.id)) || state.rooms[0];
      if (any) {
        chosenRoomId = any.id;
        const set = this.anchorsFor(any.id, state);
        chosenAnchor = set?.all.find(a => !takenAnchors.has(a.id)) ?? set?.all[0];
      }
    }

    if (chosenRoomId !== undefined && !chosenAnchor) {
      const set = this.anchorsFor(chosenRoomId, state);
      chosenAnchor = set?.all.find(a => !takenAnchors.has(a.id)) ?? set?.all[0];
    }

    if (chosenAnchor) {
      takenAnchors.add(chosenAnchor.id);
    }

    const prevTargetRoomId = agent.targetRoomId;
    const prevAnchorId = agent.targetAnchorId;

    agent.activity = desired.activity;
    agent.desiredAnim = chosenAnim;
    agent.targetRoomId = chosenRoomId;
    agent.targetAnchorId = chosenAnchor?.id;
    agent.targetAnchorX = chosenAnchor?.x;
    agent.targetAnchorY = chosenAnchor?.y;
    agent.targetAnchorFloor = chosenAnchor?.floor;
    if (agent.isWizard) {
      agent.wizardErrand = desired.wizardErrand ?? (desired.activity === 'meal' ? 'meal' : desired.activity === 'class' ? 'teach' : 'wander');
    }

    if (
      chosenRoomId !== undefined &&
      agent.currentRoomId === chosenRoomId &&
      prevAnchorId === chosenAnchor?.id &&
      agent.path.length === 0
    ) {
      this.setArrivedAnim(agent);
      return false;
    }

    if (chosenRoomId !== undefined) {
      if (reduceMotion) {
        if (chosenAnchor) {
          agent.x = chosenAnchor.x;
          agent.y = chosenAnchor.y;
          agent.currentFloor = chosenAnchor.floor;
          agent.currentRoomId = chosenRoomId;
          agent.path = [];
          agent.pathIndex = 0;
        } else {
          this.routeToRoom(agent, state, chosenRoomId, chosenAnchor);
        }
      } else {
        this.routeToRoom(agent, state, chosenRoomId, chosenAnchor);
      }
    }
    return prevTargetRoomId !== chosenRoomId || prevAnchorId !== chosenAnchor?.id;
  }

  private resolveDesiredGoal(
    agent: VisualAgent,
    state: FullGameState,
    hoursFloat: number,
    schedule: AcademySchedule,
    sittings: Map<string, MealSittingAssignment>,
    takenAnchors: Set<string>,
    bedMap: Map<number, RoomAnchor>
  ): DesiredGoal {
    const offsetHrs = agentOffsetMinutes(agent.id) / 60;
    const builtReachable = (state.rooms || []).filter(r => r.state === 'built' && this.isRoomReachable(r.id));

    // 1. Injured non-wizard
    if (!agent.isWizard && agent.character?.injury) {
      const char = agent.character;
      let targetRoomId: number | undefined;
      let targetAnchor: RoomAnchor | undefined;

      if (char.injury!.type !== 'broken_bone') {
        const infirmary = builtReachable.find(r => r.defId === 'infirmary');
        if (infirmary) {
          const set = this.anchorsFor(infirmary.id, state);
          const freeCot = set?.cots.find(c => !takenAnchors.has(c.id));
          if (freeCot) {
            targetRoomId = infirmary.id;
            targetAnchor = freeCot;
          }
        }
      }
      if (!targetRoomId && char.bedRoomId != null && this.isRoomReachable(char.bedRoomId)) {
        const assignedBed = bedMap.get(char.id);
        if (assignedBed && !takenAnchors.has(assignedBed.id)) {
          targetRoomId = char.bedRoomId;
          targetAnchor = assignedBed;
        }
      }
      if (!targetRoomId) {
        targetRoomId = healingPlaceFor(char, state.rooms, id => this.isRoomReachable(id));
        if (targetRoomId !== undefined) {
          const set = this.anchorsFor(targetRoomId, state);
          targetAnchor = set?.cots.find(c => !takenAnchors.has(c.id))
            ?? set?.beds.find(b => !takenAnchors.has(b.id))
            ?? set?.all.find(a => !takenAnchors.has(a.id));
        }
      }
      return {
        blockKey: `injured:${targetRoomId ?? 'none'}`,
        mandatory: true,
        activity: 'sleep',
        roomId: targetRoomId,
        anchor: targetAnchor,
        anim: 'sleep',
        canKeepOnTimer: true,
        allowTalk: false
      };
    }

    // 2. Active Period class check with stagger [hStart + offsetHrs, hStart + 1 + offsetHrs]
    let activePeriod: 1 | 2 | 3 | 4 | undefined;
    for (const p of [1, 2, 3, 4] as const) {
      const hStart = 6 + (p - 1) * 2;
      if (hoursFloat >= hStart + offsetHrs && hoursFloat < hStart + 1 + offsetHrs) {
        activePeriod = p;
        break;
      }
    }

    if (activePeriod !== undefined) {
      if (agent.isWizard) {
        if (schedule.headmasterRoomId !== undefined) {
          const info = schedule.classrooms.get(schedule.headmasterRoomId);
          const slot = info?.periods[activePeriod];
          if (info && slot && slot.studentIds.length > 0 && this.isRoomReachable(info.roomId)) {
            const set = this.anchorsFor(info.roomId, state);
            const lectern = set?.lecterns[0] ?? set?.all[0];
            return {
              blockKey: `class:p${activePeriod}:room${info.roomId}`,
              mandatory: true,
              activity: 'class',
              roomId: info.roomId,
              anchor: lectern,
              anim: 'teach',
              wizardErrand: 'teach',
              canKeepOnTimer: true,
              allowTalk: false
            };
          }
        }
      } else if (agent.character) {
        const char = agent.character;
        if (char.status === 'student') {
          const stuAssign = schedule.studentAssignments.get(char.id);
          if (stuAssign && stuAssign.period === activePeriod && this.isRoomReachable(stuAssign.classRoomId)) {
            const set = this.anchorsFor(stuAssign.classRoomId, state);
            const desk = set?.studentDesks[stuAssign.deskIndex] ?? set?.studentDesks[0] ?? set?.all[0];
            if (desk) {
              return {
                blockKey: `class:p${activePeriod}:room${stuAssign.classRoomId}`,
                mandatory: true,
                activity: 'class',
                roomId: stuAssign.classRoomId,
                anchor: desk,
                anim: 'sit_study',
                canKeepOnTimer: true,
                allowTalk: false
              };
            }
          }
        } else if (char.career === 'teacher' && char.careerState === 'active') {
          const tAssign = schedule.teacherAssignments.get(char.id);
          if (tAssign && tAssign.periods.includes(activePeriod) && this.isRoomReachable(tAssign.classRoomId)) {
            const info = schedule.classrooms.get(tAssign.classRoomId);
            const slot = info?.periods[activePeriod];
            if (slot && slot.studentIds.length > 0) {
              const set = this.anchorsFor(tAssign.classRoomId, state);
              const lectern = set?.lecterns[0] ?? set?.all[0];
              return {
                blockKey: `class:p${activePeriod}:room${tAssign.classRoomId}`,
                mandatory: true,
                activity: 'class',
                roomId: tAssign.classRoomId,
                anchor: lectern,
                anim: 'teach',
                canKeepOnTimer: true,
                allowTalk: false
              };
            }
          }
        }
      }
    }

    // 3. Meals: Lunch 13:00-14:00, Supper 18:00-19:00
    const mealStart = hoursFloat >= 13 && hoursFloat < 14.08 ? 13 : hoursFloat >= 18 && hoursFloat < 19.08 ? 18 : -1;
    if (mealStart > 0) {
      const sit = sittings.get(agent.id);
      if (sit) {
        let inSitting = false;
        if (sit.sitting === 'A') {
          inSitting = hoursFloat >= mealStart + offsetHrs && hoursFloat < mealStart + 0.5;
        } else if (sit.sitting === 'B') {
          inSitting = hoursFloat >= mealStart + 0.5 + offsetHrs && hoursFloat < mealStart + 1.0;
        } else {
          inSitting = hoursFloat >= mealStart + offsetHrs && hoursFloat < mealStart + 0.35 + offsetHrs;
        }

        if (inSitting) {
          if (sit.sitting !== 'packed' && sit.roomId !== undefined && sit.chairIndex !== undefined && this.isRoomReachable(sit.roomId)) {
            const set = this.anchorsFor(sit.roomId, state);
            const chair = set?.chairs[sit.chairIndex] ?? set?.chairs.find(c => !takenAnchors.has(c.id)) ?? set?.all[0];
            if (chair) {
              return {
                blockKey: `meal:${mealStart}:${sit.sitting}:r${sit.roomId}`,
                mandatory: true,
                activity: 'meal',
                roomId: sit.roomId,
                anchor: chair,
                anim: 'eat',
                wizardErrand: 'meal',
                canKeepOnTimer: true,
                allowTalk: true
              };
            }
          }
          // Packed meal fallback: dorm, else courtyard, else common room (never entrance hall if avoidable, never refectory)
          const dormRoom =
            !agent.isWizard && agent.character?.bedRoomId != null
              ? builtReachable.find(r => r.id === agent.character!.bedRoomId)
              : undefined;
          const packedCandidates = [
            dormRoom,
            builtReachable.find(r => r.defId === 'courtyard_garden'),
            builtReachable.find(r => r.defId === 'common_room'),
            agent.isWizard || agent.character?.status === 'faculty'
              ? builtReachable.find(r => r.defId === 'faculty_lounge')
              : undefined
          ].filter((r): r is PlacedRoom => !!r);

          if (packedCandidates.length > 0) {
            return {
              blockKey: `meal:${mealStart}:packed`,
              mandatory: true,
              activity: 'meal',
              anim: 'eat',
              wizardErrand: 'meal',
              canKeepOnTimer: true,
              allowTalk: true,
              candidatePool: packedCandidates.map((room, i) => ({
                room,
                weight: 100 - i * 20,
                anim: 'eat'
              }))
            };
          }
        }
      }
    }

    // 4. Night: 22:00-06:00 (with Early Riser waking at 05:00 + offsetHrs, Night Owl rolling to stay up)
    const isNightHour = hoursFloat >= 22 + offsetHrs || hoursFloat < 6;
    if (isNightHour) {
      const char = agent.character;
      const wokenEarly = !agent.isWizard && hasTrait(char, 'Early Riser') && hoursFloat >= 5 + offsetHrs && hoursFloat < 6;

      if (!wokenEarly) {
        if (!agent.isWizard && hasTrait(char, 'Night Owl')) {
          const nightSpots = this.nightOwlCandidates(agent, state, builtReachable, takenAnchors);
          if (nightSpots.length > 0) {
            const roll = hashAgentId(`${agent.id}:nightowl:${agent.personalTimerEpoch}`) % 10;
            if (roll < 6) {
              return {
                blockKey: `night_owl:${Math.floor(hoursFloat)}`,
                mandatory: false,
                activity: 'free_time',
                anim: 'sit_study',
                canKeepOnTimer: true,
                allowTalk: true,
                candidatePool: nightSpots
              };
            }
          }
        }

        // Sleep in own assigned bed if built & reachable
        if (!agent.isWizard && char && char.bedRoomId != null && this.isRoomReachable(char.bedRoomId)) {
          const bedAnchor = bedMap.get(char.id);
          if (bedAnchor && !takenAnchors.has(bedAnchor.id)) {
            return {
              blockKey: `sleep:bed:${char.bedRoomId}`,
              mandatory: true,
              activity: 'sleep',
              roomId: char.bedRoomId,
              anchor: bedAnchor,
              anim: 'sleep',
              canKeepOnTimer: true,
              allowTalk: false
            };
          }
        }

        // Unassigned dorm bed fallback -> or free common room seat (never stack in entrance_hall!)
        const sleepFallbackRooms = builtReachable.filter(r =>
          agent.isWizard
            ? r.defId === 'faculty_quarters' || r.defId === 'wizard_study' || r.defId === 'common_room' || r.defId === 'faculty_lounge'
            : r.defId === 'common_room' || (char?.status === 'faculty' && r.defId === 'faculty_lounge')
        );
        if (sleepFallbackRooms.length > 0) {
          return {
            blockKey: 'sleep:common_fallback',
            mandatory: true,
            activity: 'sleep',
            anim: 'sleep',
            wizardErrand: 'sleep',
            canKeepOnTimer: true,
            allowTalk: false,
            candidatePool: sleepFallbackRooms.map((room, i) => ({
              room,
              weight: 100 - i * 10,
              anim: 'sleep'
            }))
          };
        }

        // Last resort if neither dorm bed nor common room exists
        const studyOrHall =
          (agent.isWizard ? builtReachable.find(r => r.defId === 'wizard_study') : undefined) ||
          builtReachable.find(r => r.defId === 'entrance_hall') ||
          builtReachable[0];
        return {
          blockKey: 'sleep:last_resort',
          mandatory: true,
          activity: 'sleep',
          roomId: studyOrHall?.id,
          anim: 'sleep',
          wizardErrand: 'sleep',
          canKeepOnTimer: true,
          allowTalk: false
        };
      }
    }

    // 5. Headmaster orb pondering during Breaks (07, 09, 11) or Afternoon (14-18) / Evening (19-22) / Early morning
    if (agent.isWizard) {
      const session = state.wizard.activeSession;
      if (session?.kind === 'orb' && session.state === 'active') {
        const study = builtReachable.find(r => r.defId === 'wizard_study');
        if (study) {
          const set = this.anchorsFor(study.id, state);
          const orb = set?.orbs[0] ?? set?.all[0];
          return {
            blockKey: `ponder:${study.id}`,
            mandatory: true,
            activity: 'work',
            roomId: study.id,
            anchor: orb,
            anim: 'cast',
            wizardErrand: 'ponder',
            canKeepOnTimer: true,
            allowTalk: false
          };
        }
      }

      const pool = this.buildHeadmasterPool(state, schedule, hoursFloat, builtReachable);
      return {
        blockKey: `wizard_free:${Math.floor(hoursFloat)}`,
        mandatory: false,
        activity: 'free_time',
        anim: 'idle',
        wizardErrand: 'wander',
        canKeepOnTimer: true,
        allowTalk: true,
        candidatePool: pool
      };
    }

    // 6. Faculty Duty (during the 4 class period hours 06-07, 08-09, 10-11, 12-13) vs Free-Time Hobbies
    const char = agent.character!;
    const block = getDayBlock(hoursFloat);
    const inPeriodHour = block.kind === 'period';
    const isDuskOrEvening = hoursFloat >= 18;

    if (char.status !== 'student' && char.career && char.careerState === 'active' && inPeriodHour) {
      const dutyPool = this.buildFacultyDutyPool(char, state, builtReachable, takenAnchors);
      if (dutyPool.length > 0) {
        return {
          blockKey: `duty:${char.career}:p${block.period}`,
          mandatory: false,
          activity: 'work',
          anim: 'work',
          canKeepOnTimer: true,
          allowTalk: true,
          candidatePool: dutyPool
        };
      }
    }

    // 7. Student / Off-duty Faculty / Resident Hobbies
    const hobbyPool =
      char.status === 'student'
        ? this.buildStudentHobbyPool(char, state, schedule, hoursFloat, isDuskOrEvening, builtReachable)
        : this.buildFacultyHobbyPool(char, state, builtReachable, isDuskOrEvening);

    return {
      blockKey: `free:${block.kind}:${char.status}:${char.currentSchool ?? ''}`,
      mandatory: false,
      activity: 'free_time',
      anim: 'idle',
      canKeepOnTimer: true,
      allowTalk: true,
      candidatePool: hobbyPool
    };
  }

  private nightOwlCandidates(
    agent: VisualAgent,
    state: FullGameState,
    builtReachable: PlacedRoom[],
    takenAnchors: Set<string>
  ): Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }> {
    const out: Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }> = [];
    for (const r of builtReachable) {
      if (r.defId === 'library') {
        const set = this.anchorsFor(r.id, state);
        const a = set?.readingDesks.find(d => !takenAnchors.has(d.id)) ?? set?.bookshelves.find(b => !takenAnchors.has(b.id));
        if (a) out.push({ room: r, weight: 50, anim: 'sit_study', anchorOverride: a });
      } else if (r.defId === 'observatory') {
        const set = this.anchorsFor(r.id, state);
        const a = set?.all.find(x => !takenAnchors.has(x.id));
        if (a) out.push({ room: r, weight: 45, anim: 'work', anchorOverride: a });
      } else if (!agent.isWizard && agent.character?.bedRoomId === r.id) {
        const set = this.anchorsFor(r.id, state);
        const wd = set?.writingDesks.find(d => !takenAnchors.has(d.id));
        if (wd) out.push({ room: r, weight: 40, anim: 'sit_study', anchorOverride: wd });
      }
    }
    return out;
  }

  private buildStudentHobbyPool(
    char: Character,
    state: FullGameState,
    schedule: AcademySchedule,
    hoursFloat: number,
    isDuskOrEvening: boolean,
    builtReachable: PlacedRoom[]
  ): Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }> {
    const weights = new Map<number, { room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }>();
    const boost = (room: PlacedRoom | undefined, w: number, anim: AgentAnimation, anchorOverride?: RoomAnchor) => {
      if (!room) return;
      if (STUDENT_BANNED_ROOMS.has(room.defId)) return;
      if ((room.lockedUntilReviewIndex ?? -1) > (state.reviewIndex || 0)) return;
      const existing = weights.get(room.id);
      if (existing) {
        existing.weight += w;
      } else {
        weights.set(room.id, { room, weight: w, anim, anchorOverride });
      }
    };

    const byDef = (defId: string) => builtReachable.filter(r => r.defId === defId);
    const school = char.currentSchool;
    const isBookish = char.personality === 'Bookish' || hasTrait(char, 'Well-Read');
    const isGreenThumb = hasTrait(char, 'Green Thumb');
    const isSteadfast = char.personality === 'Steadfast';
    const isCurious = char.personality === 'Curious';
    const isSocial = char.personality === 'Social' || char.personality === 'Mischievous' || hasTrait(char, 'Chatterbox');
    const isGentle = char.personality === 'Gentle' || hasTrait(char, 'Beast Whisperer');
    const isDreamy = char.personality === 'Dreamy' || hasTrait(char, 'Star-Touched');
    const isBold = char.personality === 'Bold';
    const isTidy = hasTrait(char, 'Tidy');

    const ownDorm = char.bedRoomId != null ? builtReachable.find(r => r.id === char.bedRoomId) : undefined;

    // 1. School first, then Personality, then Traits (Section 7 table)
    if (school === 'arcane' || isBookish) {
      const m = school === 'arcane' ? 1.5 : 1.0;
      for (const r of byDef('library')) boost(r, Math.round(45 * m), 'sit_study');
      if (ownDorm) boost(ownDorm, Math.round(30 * m), 'sit_study');
      for (const r of byDef('observatory')) boost(r, Math.round(28 * m), 'work');
      for (const r of byDef('scriptorium')) boost(r, Math.round(22 * m), 'sit_study');
    }
    if (school === 'nature' || isGreenThumb) {
      const m = school === 'nature' ? 1.5 : 1.0;
      for (const r of byDef('vegetable_patch')) boost(r, Math.round(40 * m), 'work');
      for (const r of byDef('herb_garden')) boost(r, Math.round(38 * m), 'work');
      for (const r of byDef('greenhouse')) boost(r, Math.round(35 * m), 'work');
      for (const r of byDef('orchard')) boost(r, Math.round(30 * m), 'work');
      for (const r of byDef('courtyard_garden')) boost(r, Math.round(26 * m), 'idle');
    }
    if (school === 'light' || isSteadfast) {
      const m = school === 'light' ? 1.5 : 1.0;
      for (const r of byDef('sunlit_sanctum')) boost(r, Math.round(42 * m), 'idle');
      for (const r of byDef('bathhouse')) boost(r, Math.round(34 * m), 'idle');
      for (const r of byDef('courtyard_garden')) boost(r, Math.round(28 * m), 'idle');
      for (const r of byDef('common_room')) boost(r, Math.round(24 * m), 'idle');
    }
    if (school === 'shadow') {
      for (const r of byDef('bathhouse')) boost(r, 42, 'idle');
      for (const r of byDef('common_room')) boost(r, 36, 'idle');
      if (ownDorm) boost(ownDorm, 30, 'idle');
      if (isDuskOrEvening) {
        for (const r of byDef('courtyard_garden')) boost(r, 26, 'idle');
      }
    }
    if (school === 'alchemy' || isCurious) {
      const m = school === 'alchemy' ? 1.5 : 1.0;
      for (const r of byDef('alchemy_lab')) boost(r, Math.round(42 * m), 'work');
      for (const r of byDef('kitchen')) boost(r, Math.round(32 * m), 'work');
      for (const r of byDef('greenhouse')) boost(r, Math.round(26 * m), 'work');
    }
    if (isSocial) {
      for (const r of byDef('common_room')) boost(r, 34, 'idle');
      const block = getDayBlock(hoursFloat);
      if (block.kind !== 'meal') {
        for (const r of byDef('refectory')) boost(r, 24, 'idle');
      }
      for (const r of byDef('courtyard_garden')) boost(r, 22, 'idle');
    }
    if (isGentle) {
      for (const r of builtReachable) {
        const hasCreature = (state.creatures || []).some(c => c.status !== 'away' && c.roomId === r.id);
        if (hasCreature && (ROOM_DEFINITIONS[r.defId]?.capacity?.creatures ?? 0) > 0) {
          boost(r, 34, 'idle');
        }
      }
      for (const r of byDef('menagerie')) boost(r, 26, 'idle');
      for (const r of byDef('courtyard_garden')) boost(r, 20, 'idle');
    }
    if (isDreamy) {
      for (const r of byDef('observatory')) boost(r, 36, 'work');
      for (const r of byDef('library')) boost(r, 30, 'sit_study');
      for (const r of byDef('courtyard_garden')) boost(r, 24, 'idle');
      for (const r of byDef('pond')) boost(r, 22, 'idle');
    }
    if (isBold) {
      for (const r of byDef('training_yard')) boost(r, 36, 'work');
      for (const r of byDef('courtyard_garden')) boost(r, 22, 'idle');
    }
    if (isTidy) {
      if (ownDorm) boost(ownDorm, 30, 'idle');
      for (const r of byDef('common_room')) boost(r, 24, 'idle');
    }

    // Same-school classroom weak extra if not currently in session
    if (school) {
      const currentBlock = getDayBlock(hoursFloat);
      const classDef = `class_${school}`;
      for (const r of byDef(classDef)) {
        const info = schedule.classrooms.get(r.id);
        const inSession =
          currentBlock.kind === 'period' &&
          !!info &&
          info.periods[currentBlock.period].studentIds.length > 0;
        if (!inSession) {
          boost(r, 8, 'sit_study');
        }
      }
    }

    // Gentle general indoor leisure fallback so students without matching affinity rooms stay indoors (common_room, library, dorm)
    if (weights.size === 0) {
      for (const r of byDef('common_room')) boost(r, 20, 'idle');
      for (const r of byDef('library')) boost(r, 18, 'sit_study');
      if (ownDorm) boost(ownDorm, 16, 'idle');
      for (const r of byDef('dormitory')) boost(r, 12, 'idle');
      for (const r of byDef('grand_dormitory')) boost(r, 12, 'idle');
      for (const r of byDef('entrance_hall')) boost(r, 5, 'idle');
    }

    return Array.from(weights.values());
  }

  private buildFacultyDutyPool(
    char: Character,
    state: FullGameState,
    builtReachable: PlacedRoom[],
    takenAnchors: Set<string>
  ): Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }> {
    const out: Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }> = [];
    const byDef = (defId: string) => builtReachable.filter(r => r.defId === defId);
    const wp = char.workplaceRoomId != null ? builtReachable.find(r => r.id === char.workplaceRoomId) : undefined;
    const lounge = byDef('faculty_lounge');

    switch (char.career) {
      case 'teacher':
        // Spare or off-period teacher: hobbies weighted by mastered school + faculty lounge
        return this.buildFacultyHobbyPool(char, state, builtReachable, false, true);

      case 'scholar': {
        if (wp) out.push({ room: wp, weight: 80, anim: 'sit_study' });
        for (const r of [...byDef('library'), ...byDef('observatory'), ...byDef('scriptorium')]) {
          if (r.id !== wp?.id) out.push({ room: r, weight: 40, anim: 'sit_study' });
        }
        for (const r of lounge) out.push({ room: r, weight: 15, anim: 'idle' });
        return out;
      }

      case 'gardener': {
        if (wp) out.push({ room: wp, weight: 80, anim: 'work' });
        for (const r of [...byDef('greenhouse'), ...byDef('herb_garden'), ...byDef('vegetable_patch'), ...byDef('orchard')]) {
          if (r.id !== wp?.id) out.push({ room: r, weight: 40, anim: 'work' });
        }
        for (const r of [...byDef('courtyard_garden'), ...byDef('sunlit_sanctum'), ...lounge]) {
          out.push({ room: r, weight: 12, anim: 'idle' });
        }
        return out;
      }

      case 'tamer': {
        if (wp) out.push({ room: wp, weight: 80, anim: 'work' });
        for (const r of byDef('menagerie')) {
          if (r.id !== wp?.id) out.push({ room: r, weight: 45, anim: 'work' });
        }
        for (const r of [...byDef('courtyard_garden'), ...lounge]) {
          out.push({ room: r, weight: 12, anim: 'idle' });
        }
        return out;
      }

      case 'healer': {
        const anyInjured = (state.characters || []).some(c => c.status !== 'away' && !!c.injury);
        for (const r of byDef('infirmary')) {
          out.push({ room: r, weight: anyInjured ? 120 : 65, anim: 'work' });
        }
        for (const r of [...byDef('sunlit_sanctum'), ...byDef('bathhouse'), ...lounge]) {
          out.push({ room: r, weight: 15, anim: 'idle' });
        }
        return out;
      }

      case 'warder': {
        const patrol = [
          ...byDef('entrance_hall'),
          ...byDef('dormitory'),
          ...byDef('grand_dormitory'),
          ...byDef('warding_chamber'),
          ...byDef('detention_hall')
        ];
        for (const r of patrol) out.push({ room: r, weight: 40, anim: 'work' });
        for (const r of [...lounge, ...byDef('common_room')]) out.push({ room: r, weight: 20, anim: 'idle' });
        return out;
      }

      case 'alchemist': {
        if (wp) out.push({ room: wp, weight: 80, anim: 'work' });
        for (const r of byDef('alchemy_lab')) {
          if (r.id !== wp?.id) out.push({ room: r, weight: 60, anim: 'work' });
        }
        for (const r of [...byDef('kitchen'), ...lounge]) out.push({ room: r, weight: 20, anim: 'work' });
        return out;
      }

      case 'builder': {
        const sites = (state.rooms || []).filter(r => r.state === 'site');
        for (const site of sites) {
          const edgeAnchor = findBuilderSiteEdgeAnchor(site, state, this.reachability, this.groundY);
          if (edgeAnchor && !takenAnchors.has(edgeAnchor.id)) {
            const room = builtReachable.find(r => r.id === edgeAnchor.roomId);
            if (room) {
              out.push({ room, weight: 90, anim: 'work', anchorOverride: edgeAnchor });
            }
          }
        }
        for (const r of byDef('workshop')) out.push({ room: r, weight: out.length === 0 ? 75 : 25, anim: 'work' });
        for (const r of lounge) out.push({ room: r, weight: 15, anim: 'idle' });
        return out;
      }

      case 'adventurer': {
        for (const r of byDef('training_yard')) out.push({ room: r, weight: 70, anim: 'work' });
        return [...out, ...this.buildFacultyHobbyPool(char, state, builtReachable, false, false)];
      }

      default:
        return this.buildFacultyHobbyPool(char, state, builtReachable, false, false);
    }
  }

  private buildFacultyHobbyPool(
    char: Character,
    state: FullGameState,
    builtReachable: PlacedRoom[],
    isDuskOrEvening: boolean,
    includeLoungeBoost = true
  ): Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }> {
    const weights = new Map<number, { room: PlacedRoom; weight: number; anim: AgentAnimation }>();
    const boost = (room: PlacedRoom | undefined, w: number, anim: AgentAnimation) => {
      if (!room || FACULTY_NEVER_HOBBY_ROOMS.has(room.defId)) return;
      if ((room.lockedUntilReviewIndex ?? -1) > (state.reviewIndex || 0)) return;
      const cur = weights.get(room.id);
      if (cur) cur.weight += w;
      else weights.set(room.id, { room, weight: w, anim });
    };
    const byDef = (defId: string) => builtReachable.filter(r => r.defId === defId);

    const schools: SchoolType[] = char.masteredSchools.length > 0 ? char.masteredSchools : ['arcane'];
    for (const s of schools) {
      if (s === 'arcane') {
        for (const r of byDef('library')) boost(r, 35, 'sit_study');
        for (const r of byDef('observatory')) boost(r, 30, 'work');
        for (const r of byDef('scriptorium')) boost(r, 25, 'sit_study');
      } else if (s === 'nature') {
        for (const r of byDef('courtyard_garden')) boost(r, 34, 'idle');
        for (const r of byDef('greenhouse')) boost(r, 30, 'work');
        for (const r of byDef('herb_garden')) boost(r, 26, 'work');
        for (const r of byDef('orchard')) boost(r, 24, 'work');
      } else if (s === 'light') {
        for (const r of byDef('sunlit_sanctum')) boost(r, 36, 'idle');
        for (const r of byDef('bathhouse')) boost(r, 28, 'idle');
        for (const r of byDef('courtyard_garden')) boost(r, 22, 'idle');
      } else if (s === 'shadow') {
        for (const r of byDef('bathhouse')) boost(r, 32, 'idle');
        for (const r of byDef('common_room')) boost(r, 26, 'idle');
        if (isDuskOrEvening) for (const r of byDef('courtyard_garden')) boost(r, 24, 'idle');
      } else if (s === 'alchemy') {
        for (const r of byDef('alchemy_lab')) boost(r, 32, 'work');
        for (const r of byDef('kitchen')) boost(r, 26, 'work');
        for (const r of byDef('greenhouse')) boost(r, 20, 'work');
      }
    }

    if (includeLoungeBoost) {
      for (const r of byDef('faculty_lounge')) boost(r, 38, 'idle');
    } else {
      for (const r of byDef('faculty_lounge')) boost(r, 24, 'idle');
    }
    for (const r of byDef('common_room')) boost(r, 18, 'idle');

    if (weights.size === 0) {
      for (const r of byDef('faculty_quarters')) boost(r, 20, 'idle');
      for (const r of byDef('entrance_hall')) boost(r, 10, 'idle');
    }
    return Array.from(weights.values());
  }

  private buildHeadmasterPool(
    state: FullGameState,
    schedule: AcademySchedule,
    hoursFloat: number,
    builtReachable: PlacedRoom[]
  ): Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }> {
    const weights = new Map<number, { room: PlacedRoom; weight: number; anim: AgentAnimation }>();
    const boost = (room: PlacedRoom | undefined, w: number, anim: AgentAnimation) => {
      if (!room) return;
      if (room.defId === 'wizard_study' || room.defId === 'spiral_stair' || room.defId === 'support_pillar' || room.defId === 'corridor') {
        return;
      }
      const cur = weights.get(room.id);
      if (cur) cur.weight += w;
      else weights.set(room.id, { room, weight: w, anim });
    };
    const byDef = (defId: string) => builtReachable.filter(r => r.defId === defId);

    const schools = new Set<SchoolType>();
    if (state.wizard.foundingSchool) schools.add(state.wizard.foundingSchool);
    if (state.wizard.activeSession?.school) schools.add(state.wizard.activeSession.school);

    for (const s of schools) {
      if (s === 'arcane') {
        for (const r of byDef('library')) boost(r, 38, 'sit_study');
        for (const r of byDef('observatory')) boost(r, 30, 'work');
        for (const r of byDef('scriptorium')) boost(r, 25, 'sit_study');
      } else if (s === 'nature') {
        for (const r of byDef('vegetable_patch')) boost(r, 38, 'work');
        for (const r of byDef('herb_garden')) boost(r, 32, 'work');
        for (const r of byDef('greenhouse')) boost(r, 30, 'work');
        for (const r of byDef('courtyard_garden')) boost(r, 26, 'idle');
      } else if (s === 'light') {
        for (const r of byDef('sunlit_sanctum')) boost(r, 38, 'idle');
        for (const r of byDef('bathhouse')) boost(r, 26, 'idle');
        for (const r of byDef('courtyard_garden')) boost(r, 24, 'idle');
      } else if (s === 'shadow') {
        for (const r of byDef('bathhouse')) boost(r, 32, 'idle');
        for (const r of byDef('common_room')) boost(r, 28, 'idle');
      } else if (s === 'alchemy') {
        for (const r of byDef('alchemy_lab')) boost(r, 36, 'work');
        for (const r of byDef('kitchen')) boost(r, 26, 'work');
        for (const r of byDef('greenhouse')) boost(r, 24, 'work');
      }
    }

    // Short rounds walk through lived-in rooms (dorms, common_room, off-session classrooms)
    const block = getDayBlock(hoursFloat);
    for (const r of [...byDef('common_room'), ...byDef('dormitory'), ...byDef('grand_dormitory'), ...byDef('faculty_lounge')]) {
      boost(r, 16, 'idle');
    }
    for (const r of builtReachable) {
      if (!r.defId.startsWith('class_')) continue;
      const info = schedule.classrooms.get(r.id);
      const inSession = block.kind === 'period' && !!info && info.periods[block.period].studentIds.length > 0;
      if (!inSession) boost(r, 14, 'idle');
    }

    if (weights.size === 0) {
      for (const r of builtReachable) {
        if (r.defId !== 'wizard_study' && r.defId !== 'entrance_hall' && r.defId !== 'spiral_stair' && r.defId !== 'corridor' && r.defId !== 'support_pillar') {
          boost(r, 20, 'idle');
        }
      }
    }
    if (weights.size === 0) {
      for (const r of builtReachable) {
        if (r.defId !== 'wizard_study') boost(r, 10, 'idle');
      }
    }
    if (weights.size === 0) {
      const study = builtReachable.find(r => r.defId === 'wizard_study') || builtReachable[0];
      if (study) weights.set(study.id, { room: study, weight: 10, anim: 'idle' });
    }
    return Array.from(weights.values());
  }

  private pickFromWeightedPool(
    agent: VisualAgent,
    pool: Array<{ room: PlacedRoom; weight: number; anim: AgentAnimation; anchorOverride?: RoomAnchor }>,
    state: FullGameState,
    takenAnchors: Set<string>,
    preferDifferent: boolean,
    reduceMotion: boolean
  ): { room: PlacedRoom; anchor: RoomAnchor; anim: AgentAnimation } | undefined {
    // Filter out rooms with zero free anchors
    const expanded: Array<{ room: PlacedRoom; anchor: RoomAnchor; weight: number; anim: AgentAnimation }> = [];

    for (const entry of pool) {
      if (entry.anchorOverride) {
        if (!takenAnchors.has(entry.anchorOverride.id)) {
          expanded.push({ room: entry.room, anchor: entry.anchorOverride, weight: entry.weight, anim: entry.anim });
        }
        continue;
      }
      const anchor = this.pickFreeAnchorInRoom(agent, entry.room, state, takenAnchors);
      if (anchor) {
        expanded.push({ room: entry.room, anchor, weight: entry.weight, anim: entry.anim });
      }
    }

    if (expanded.length === 0) return undefined;

    let candidates = expanded;
    if (preferDifferent && expanded.length > 1 && agent.targetRoomId !== undefined) {
      const other = expanded.filter(e => e.room.id !== agent.targetRoomId);
      if (other.length > 0) candidates = other;
    }

    const total = candidates.reduce((acc, c) => acc + Math.max(1, c.weight), 0);
    const epoch = reduceMotion ? 0 : agent.personalTimerEpoch;
    const h = hashAgentId(`${agent.id}:pick:${epoch}:${candidates.length}`);
    let roll = h % total;
    for (const c of candidates) {
      roll -= Math.max(1, c.weight);
      if (roll < 0) return c;
    }
    return candidates[0];
  }

  private pickFreeAnchorInRoom(
    agent: VisualAgent,
    room: PlacedRoom,
    state: FullGameState,
    takenAnchors: Set<string>
  ): RoomAnchor | undefined {
    const set = this.anchorsFor(room.id, state);
    if (!set || set.all.length === 0) return undefined;
    const free = (list: RoomAnchor[]) => list.filter(a => !takenAnchors.has(a.id));

    if (room.defId === 'library') {
      if (agent.character?.career === 'scholar') {
        const own = free(set.readingDesks);
        if (own.length > 0) return own[0];
        const shelf = free(set.bookshelves);
        if (shelf.length > 0) return shelf[0];
      } else {
        const desks = free(set.readingDesks);
        if (desks.length > 0) return desks[0];
        const shelves = free(set.bookshelves);
        if (shelves.length > 0) return shelves[0];
      }
      return undefined;
    }

    if (room.defId.startsWith('class_')) {
      // Visitors/headmaster rounds: students reading sit at free desks; headmaster stands or sits at free spot
      const desks = free(set.studentDesks);
      if (desks.length > 0) return desks[0];
      if (!agent.character || agent.character.status !== 'student') {
        const lect = free(set.lecterns);
        if (lect.length > 0) return lect[0];
      }
      return undefined;
    }

    if (room.defId === 'dormitory' || room.defId === 'grand_dormitory' || room.defId === 'faculty_quarters') {
      const wd = free(set.writingDesks);
      if (wd.length > 0) return wd[0];
      const beds = free(set.beds);
      if (beds.length > 0) return beds[0];
      return undefined;
    }

    if (room.defId === 'refectory') {
      const seats = free(set.seats);
      if (seats.length > 0) return seats[0];
      const ch = free(set.chairs);
      if (ch.length > 0) return ch[0];
      return undefined;
    }

    const candidates = free(set.all);
    if (candidates.length === 0) return undefined;
    const idx = hashAgentId(`${agent.id}:${room.id}`) % candidates.length;
    return candidates[idx];
  }

  private tryTriggerConversation(agent: VisualAgent, state: FullGameState, hoursFloat: number, rollKey: string) {
    if ((agent.talkingRemainingMs ?? 0) > 0 || agent.path.length > 0 || agent.currentRoomId === undefined) return;
    if (agent.activity === 'class' || agent.activity === 'sleep' || agent.character?.injury) return;
    if (agent.isWizard && agent.wizardErrand === 'ponder') return;

    const candidates = Array.from(this.agents.values()).filter(
      other =>
        other.id !== agent.id &&
        other.currentRoomId === agent.currentRoomId &&
        other.path.length === 0 &&
        (other.talkingRemainingMs ?? 0) <= 0 &&
        other.activity !== 'class' &&
        other.activity !== 'sleep' &&
        !other.character?.injury &&
        !(other.isWizard && other.wizardErrand === 'ponder')
    );

    if (candidates.length === 0) return;

    for (const other of candidates) {
      const chance = conversationChance(agent, other, state);
      if (chance <= 0) continue;
      const pairIds = agent.id < other.id ? `${agent.id}:${other.id}` : `${other.id}:${agent.id}`;
      const h = hashAgentId(`talk:${pairIds}:${rollKey}:${Math.floor(hoursFloat * 10)}`);
      if ((h % 1000) / 1000 < chance) {
        const duration = 20_000 + (hashAgentId(`talkdur:${pairIds}:${rollKey}`) % 20_001);
        agent.talkingWithId = other.id;
        other.talkingWithId = agent.id;
        agent.talkingRemainingMs = duration;
        other.talkingRemainingMs = duration;

        // Stand a short distance apart without overlapping
        const room = state.rooms.find(r => r.id === agent.currentRoomId);
        if (room) {
          const box = roomToWorldBox(room, this.groundY);
          const minX = box.left + 10;
          const maxX = Math.max(minX, box.left + box.width - 10);
          const dx = other.x - agent.x;
          if (Math.abs(dx) < 14) {
            const mid = Math.max(minX + 7, Math.min(maxX - 7, (agent.x + other.x) / 2));
            if (agent.x <= other.x) {
              agent.x = mid - 7;
              other.x = mid + 7;
            } else {
              other.x = mid - 7;
              agent.x = mid + 7;
            }
          }
        }
        agent.facing = agent.x <= other.x ? 'R' : 'L';
        other.facing = other.x >= agent.x ? 'L' : 'R';
        agent.anim = 'talk';
        other.anim = 'talk';
        return;
      }
    }
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
    if ((agent.talkingRemainingMs ?? 0) > 0) {
      agent.anim = 'talk';
      return;
    }
    if (agent.desiredAnim) {
      agent.anim = agent.desiredAnim;
      return;
    }
    if (agent.activity === 'class') {
      agent.anim = agent.isWizard || agent.character?.career === 'teacher' ? 'teach' : 'sit_study';
    } else if (agent.activity === 'meal') {
      agent.anim = 'eat';
    } else if (agent.activity === 'sleep') {
      agent.anim = 'sleep';
    } else if (agent.activity === 'work') {
      agent.anim = agent.isWizard && agent.wizardErrand === 'ponder' ? 'cast' : 'work';
    } else {
      agent.anim = 'idle';
    }
  }

  private isRoomReachable(roomId: number): boolean {
    if (!this.reachability) return true;
    return this.reachability.get(roomId)?.reachable ?? false;
  }

  /** Walk the nav graph to a room and stop at the chosen furniture/room anchor. */
  private routeToRoom(agent: VisualAgent, state: FullGameState, targetRoomId: number, anchor?: RoomAnchor) {
    const destCandidates = Array.from(this.navGraph.nodes.values())
      .filter(n => n.roomId === targetRoomId)
      .sort((a, b) => {
        if (anchor) {
          const aSameFloor = a.floor === anchor.floor ? 0 : 1;
          const bSameFloor = b.floor === anchor.floor ? 0 : 1;
          if (aSameFloor !== bSameFloor) return aSameFloor - bSameFloor;
        }
        return (a.kind === 'stair' ? 1 : 0) - (b.kind === 'stair' ? 1 : 0) || a.floor - b.floor;
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
          const destFloor = anchor ? anchor.floor : targetRoom.area === 'castle' ? lastNode.floor : 0;
          const destX = anchor ? anchor.x : box.left + box.width / 2;
          const destY = anchor ? anchor.y : targetRoom.area === 'castle' ? getFloorLineY(destFloor, this.groundY) : box.floorLineY;
          bestPath.push({
            id: `anchor-${agent.id}`,
            roomId: targetRoomId,
            floor: destFloor,
            x: destX,
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

export function conversationChance(a: VisualAgent, b: VisualAgent, state: FullGameState): number {
  const traitsA = a.character?.traits ?? [];
  const traitsB = b.character?.traits ?? [];
  for (const t of traitsA) {
    if (traitsB.some(ob => ob.toLowerCase() === t.toLowerCase())) {
      return 0.45;
    }
  }
  const schoolA = a.isWizard ? state.wizard.foundingSchool : a.character?.currentSchool;
  const schoolB = b.isWizard ? state.wizard.foundingSchool : b.character?.currentSchool;
  if (schoolA && schoolB && schoolA === schoolB) {
    return 0.18;
  }
  const socialA = a.character?.personality === 'Social' || hasTrait(a.character, 'Chatterbox');
  const socialB = b.character?.personality === 'Social' || hasTrait(b.character, 'Chatterbox');
  if (socialA && socialB) {
    return 0.12;
  }
  return 0;
}
