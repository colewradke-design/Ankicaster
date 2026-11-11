/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Choreographer & Lively Schedule
 * Implements Section 7:
 * - 10-minute "lively" loop:
 *   0:00-4:00 Class / Work
 *   4:00-6:00 Free time
 *   6:00-9:00 Class / Work
 *   9:00-10:00 Free time
 *   Meals triggered by meal window or 5th bell
 * - Purely visual animation puppet show. Never writes to state.
 * - Respects reduceMotion: snaps agents to destination without tweening or walking.
 */

import { FullGameState, Character } from '../../types/ankicaster';
import { NavGraph, NavNode } from '../layout/navGraph';
import { roomToWorldBox, getFloorLineY } from '../layout/gridToWorld';

export type AgentAnimation =
  | 'idle'
  | 'walk'
  | 'walk_front'
  | 'climb'
  | 'sit_study'
  | 'eat'
  | 'sleep';

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
  activity: 'class' | 'work' | 'meal' | 'sleep' | 'free_time';
  currentRoomId?: number;
  path: NavNode[];
  pathIndex: number;
  robeColor: string;
  hat: string;
  hair: string;
  hairColor: string;
  skin: string;
  name: string;
  unreachableWarning?: boolean;
}

export class Choreographer {
  agents = new Map<string, VisualAgent>();
  schedulePhase: 'class_work' | 'free_time' | 'meal' | 'sleep' = 'class_work';
  cycleTimeMs: number = 0; // 0..600,000 (10 min)
  mealWindowRemainingMs: number = 0;
  navGraph: NavGraph;
  groundY: number;

  constructor(navGraph: NavGraph, groundY: number) {
    this.navGraph = navGraph;
    this.groundY = groundY;
  }

  updateNavGraph(navGraph: NavGraph, groundY: number) {
    this.navGraph = navGraph;
    this.groundY = groundY;
  }

  syncState(state: FullGameState) {
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

      const wizRobe = state.wizard.appearance?.robeColor || '#6B4FBB';
      const wizHat = state.wizard.appearance?.hat || 'pointed';

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
        path: [],
        pathIndex: 0,
        robeColor: wizRobe,
        hat: wizHat,
        hair: state.wizard.appearance?.hair || 'short_messy',
        hairColor: state.wizard.appearance?.hairColor || 'brown',
        skin: state.wizard.appearance?.skin || 'tone1',
        name: `${state.wizard.title} ${state.wizard.name}`
      });
    }

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
          sx = box.left + 20 + Math.random() * (box.width - 40);
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
        const robeCol = char.currentSchool ? (schoolColors[char.currentSchool] || '#4E8B3A') : (char.appearance.robeColor || '#4E8B3A');

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
          path: [],
          pathIndex: 0,
          robeColor: robeCol,
          hat: char.appearance.hat || 'none',
          hair: char.appearance.hair || 'short',
          hairColor: char.appearance.hairColor || '#4A2E1E',
          skin: char.appearance.skin || '#F6D7C3',
          name: char.name
        });
      } else {
        // Update character reference
        const agent = this.agents.get(id)!;
        agent.character = char;
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
      }
    }

    // Clean up removed characters
    for (const [id, agent] of this.agents.entries()) {
      if (!agent.isWizard && !activeCharIds.has(id)) {
        this.agents.delete(id);
      }
    }
  }

  tick(deltaMs: number, state: FullGameState, reduceMotion: boolean) {
    this.cycleTimeMs = (this.cycleTimeMs + deltaMs) % 600000; // 10 min loop

    if (this.mealWindowRemainingMs > 0) {
      this.mealWindowRemainingMs -= deltaMs;
    }

    // Determine lively schedule phase
    const secInCycle = Math.floor(this.cycleTimeMs / 1000);
    if (this.mealWindowRemainingMs > 0) {
      this.schedulePhase = 'meal';
    } else if (secInCycle < 240) {
      // 0..4 min
      this.schedulePhase = 'class_work';
    } else if (secInCycle < 360) {
      // 4..6 min
      this.schedulePhase = 'free_time';
    } else if (secInCycle < 540) {
      // 6..9 min
      this.schedulePhase = 'class_work';
    } else {
      // 9..10 min
      this.schedulePhase = 'free_time';
    }

    // Update each agent
    for (const agent of this.agents.values()) {
      this.updateAgent(agent, deltaMs, state, reduceMotion);
    }
  }

  triggerMealWindow() {
    this.mealWindowRemainingMs = 90000; // 90 seconds meal window
  }

  private updateAgent(agent: VisualAgent, deltaMs: number, state: FullGameState, reduceMotion: boolean) {
    // Animation frame progression
    if (!reduceMotion) {
      agent.animTimer += deltaMs;
      if (agent.animTimer > 150) {
        agent.animTimer = 0;
        agent.animFrame = (agent.animFrame + 1) % 4;
      }
    } else {
      agent.animFrame = 0;
    }

    // If wizard, stays near Study or orb
    if (agent.isWizard) {
      const studyRoom = state.rooms.find(r => r.defId === 'wizard_study' && r.state === 'built');
      if (studyRoom) {
        const box = roomToWorldBox(studyRoom, this.groundY);
        agent.targetX = box.left + box.width / 2;
        agent.targetY = box.floorLineY;
        if (reduceMotion) {
          agent.x = agent.targetX;
          agent.y = agent.targetY;
        }
      }
      agent.anim = 'idle';
      return;
    }

    // Character behavior:
    // Decide destination based on schedule phase
    if (agent.path.length === 0) {
      this.planAgentNextGoal(agent, state);
    }

    // Follow path
    if (agent.path.length > 0 && agent.pathIndex < agent.path.length) {
      const targetNode = agent.path[agent.pathIndex];
      const dx = targetNode.x - agent.x;
      const dy = targetNode.y - agent.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (reduceMotion) {
        // Instant teleport with reduceMotion
        const finalNode = agent.path[agent.path.length - 1];
        agent.x = finalNode.x;
        agent.y = finalNode.y;
        agent.currentFloor = finalNode.floor;
        agent.path = [];
        agent.pathIndex = 0;
        this.setArrivedAnim(agent);
        return;
      }

      if (dist < 4) {
        agent.x = targetNode.x;
        agent.y = targetNode.y;
        agent.currentFloor = targetNode.floor;
        agent.pathIndex++;
        if (agent.pathIndex >= agent.path.length) {
          agent.path = [];
          agent.pathIndex = 0;
          this.setArrivedAnim(agent);
        }
      } else {
        // Move towards target
        const speed = 28 * (deltaMs / 1000); // 28 art px / s
        agent.x += (dx / dist) * Math.min(speed, dist);
        agent.y += (dy / dist) * Math.min(speed, dist);

        if (Math.abs(dx) > 1) {
          agent.facing = dx > 0 ? 'R' : 'L';
        }

        if (Math.abs(dy) > 2) {
          agent.anim = 'climb';
        } else {
          agent.anim = 'walk';
        }
      }
    }
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

  private planAgentNextGoal(agent: VisualAgent, state: FullGameState) {
    const char = agent.character;
    if (!char) return;

    let targetRoomId: number | undefined;
    let targetActivity: 'class' | 'work' | 'meal' | 'sleep' | 'free_time' = 'free_time';

    // 1. Recovering / Injured -> infirmary or bed
    if (char.injury) {
      const infirmary = state.rooms.find(r => r.state === 'built' && r.defId === 'infirmary');
      targetRoomId = infirmary ? infirmary.id : char.bedRoomId;
      targetActivity = 'sleep';
    } else if (this.schedulePhase === 'meal') {
      // 2. Meal -> Refectory
      const refectory = state.rooms.find(r => r.state === 'built' && r.defId === 'refectory');
      targetRoomId = refectory ? refectory.id : 1; // Entrance hall fallback
      targetActivity = 'meal';
    } else if (this.schedulePhase === 'class_work') {
      // 3. Class or Work
      if (char.status === 'student' && char.seatRoomId) {
        targetRoomId = char.seatRoomId;
        targetActivity = 'class';
      } else if (char.workplaceRoomId) {
        targetRoomId = char.workplaceRoomId;
        targetActivity = 'work';
      } else {
        targetActivity = 'free_time';
      }
    } else {
      // 4. Free time
      targetActivity = 'free_time';
      const leisureRooms = state.rooms.filter(
        r => r.state === 'built' && (r.defId === 'common_room' || r.defId === 'library' || r.defId === 'courtyard_garden' || r.area === 'grounds')
      );
      if (leisureRooms.length > 0) {
        targetRoomId = leisureRooms[Math.floor(Math.random() * leisureRooms.length)].id;
      }
    }

    if (!targetRoomId) {
      targetRoomId = 1; // Entrance Hall
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

    // Find closest node to agent's current position
    let startNodeId: string | undefined;
    let minD = Infinity;
    for (const [nodeId, node] of this.navGraph.nodes.entries()) {
      const d = Math.abs(node.x - agent.x) + Math.abs(node.y - agent.y);
      if (d < minD) {
        minD = d;
        startNodeId = nodeId;
      }
    }

    if (startNodeId && destNodeId) {
      const path = this.navGraph.findPath(startNodeId, destNodeId);
      if (path.length > 0) {
        agent.path = path;
        agent.pathIndex = 0;
        agent.activity = targetActivity;
        agent.currentRoomId = targetRoomId;
      }
    }
  }
}
