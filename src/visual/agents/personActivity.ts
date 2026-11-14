/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only human sentence describing what a person (student, faculty, or Headmaster)
 * is doing right now. Never mutates FullGameState and never imports engine.ts (VR-01).
 */

import type { Character, FullGameState, PlacedRoom } from '../../types/ankicaster';
import { RIFT_DESTINATIONS, roomDisplayName } from '../../data/content';
import { classroomSchool } from '../../utils/formulas';
import {
  buildAcademySchedule,
  buildMealSittings,
  getDayBlock,
  resolveAcademyLocalHours
} from '../../utils/schedule';
import type { DollAnim } from './doll';
import type { VisualAgent } from './Choreographer';

function describeFreeTime(room: PlacedRoom | undefined, anim?: DollAnim): string {
  if (!room) return 'Wandering the academy.';
  const name = roomDisplayName(room);
  switch (room.defId) {
    case 'library':
      return `Reading in the ${name}.`;
    case 'scriptorium':
      return `Copying texts in the ${name}.`;
    case 'observatory':
      return `Stargazing in the ${name}.`;
    case 'courtyard_garden':
      return 'In the garden.';
    case 'greenhouse':
    case 'herb_garden':
    case 'vegetable_patch':
    case 'orchard':
      return `Tending the ${name}.`;
    case 'common_room':
    case 'faculty_lounge':
      return `Relaxing in the ${name}.`;
    case 'bathhouse':
      return `Soaking in the ${name}.`;
    case 'sunlit_sanctum':
      return `Meditating in the ${name}.`;
    case 'training_yard':
      return `Practising in the ${name}.`;
    case 'alchemy_lab':
    case 'kitchen':
      return `Tinkering in the ${name}.`;
    case 'dormitory':
    case 'grand_dormitory':
    case 'faculty_quarters':
      return anim === 'sit_study' ? `Studying in the ${name}.` : `Resting in the ${name}.`;
    case 'menagerie':
    case 'aviary':
    case 'meadow_paddock':
    case 'tide_tank':
    case 'gloom_hutch':
    case 'ember_pit':
    case 'crystal_vivarium':
    case 'pond':
      return `Visiting the ${name}.`;
    default:
      return `In the ${name}.`;
  }
}

function periodFromBlockKey(blockKey?: string): number | undefined {
  if (!blockKey) return undefined;
  const m = /^class:p([1-4])\b/.exec(blockKey);
  return m ? Number(m[1]) : undefined;
}

export function describePersonActivity(
  agent: VisualAgent | undefined,
  person: 'wizard' | Character,
  state: FullGameState,
  nowMs?: number
): string {
  const findRoom = (id: number | undefined): PlacedRoom | undefined =>
    id != null ? state.rooms.find(r => r.id === id) : undefined;
  const findShelved = (id: number | undefined): PlacedRoom | undefined =>
    id != null ? (state.shelvedRooms || []).find(r => r.id === id) : undefined;
  const hasBuiltEH = state.rooms.some(r => r.defId === 'entrance_hall' && r.state === 'built' && r.y === 0);

  // 1. Away (e.g. Rift expedition)
  if (person !== 'wizard' && person.status === 'away') {
    const exp = (state.expeditions || []).find(
      e => e.state === 'active' && e.teamIds.includes(person.id)
    );
    if (exp) {
      const destName = RIFT_DESTINATIONS[exp.destinationId]?.name || exp.destinationId.replace(/_/g, ' ');
      return `On a Rift expedition to ${destName}.`;
    }
    return 'Away from the academy.';
  }

  // 2. Walking between rooms
  if (agent && agent.path.length > 0 && agent.pathIndex < agent.path.length) {
    const target = findRoom(agent.targetRoomId);
    if (target) return `Walking to the ${roomDisplayName(target)}.`;
    return 'Walking across the academy.';
  }

  // 3. Injured (non-wizard)
  if (person !== 'wizard' && person.injury) {
    const restRoom =
      findRoom(agent?.currentRoomId ?? agent?.targetRoomId) ??
      (person.injury.type !== 'broken_bone'
        ? state.rooms.find(r => r.state === 'built' && r.defId === 'infirmary')
        : undefined) ??
      findRoom(person.bedRoomId);
    if (restRoom) return `Recovering in the ${roomDisplayName(restRoom)}.`;
    return 'Recovering from an injury.';
  }

  const hoursFloat = resolveAcademyLocalHours(state, nowMs);
  const block = getDayBlock(hoursFloat);

  // 4. Headmaster
  if (person === 'wizard') {
    const shelvedStudy = (state.shelvedRooms || []).find(r => r.defId === 'wizard_study');
    if (agent) {
      const room = findRoom(agent.currentRoomId ?? agent.targetRoomId);
      if (!hasBuiltEH && !room) return 'Waiting on the front path while rooms are arranged.';
      if (shelvedStudy && room?.defId === 'entrance_hall' && (state.wizard.activeSession?.state === 'active' || agent.wizardErrand === 'ponder')) {
        return `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedStudy)}.`;
      }
      if (agent.wizardErrand === 'ponder') return 'Pondering the orb.';
      if (agent.activity === 'class' || agent.wizardErrand === 'teach') {
        const period = periodFromBlockKey(agent.lastBlockKey) ?? (block.kind === 'period' ? block.period : undefined);
        if (room) return `Teaching the ${roomDisplayName(room)}${period ? `, period ${period}` : ''}.`;
        return 'Teaching a class.';
      }
      if (agent.activity === 'meal') {
        return room?.defId === 'refectory' ? 'Eating in the Refectory.' : 'Eating a packed meal.';
      }
      if (agent.activity === 'sleep') {
        return room ? `Sleeping in the ${roomDisplayName(room)}.` : 'Sleeping for the night.';
      }
      if ((agent.talkingRemainingMs ?? 0) > 0 && room) {
        return room.defId === 'courtyard_garden'
          ? 'Chatting in the garden.'
          : `Chatting in the ${roomDisplayName(room)}.`;
      }
      return describeFreeTime(room, agent.anim);
    }

    if (!hasBuiltEH && state.rooms.length === 0) {
      return 'Waiting on the front path while rooms are arranged.';
    }

    // Fallback when no VisualAgent is mounted
    const schedule = buildAcademySchedule(state);
    if (block.kind === 'period' && schedule.headmasterRoomId != null) {
      const info = schedule.classrooms.get(schedule.headmasterRoomId);
      if (info && info.periods[block.period].studentIds.length > 0) {
        const room = findRoom(info.roomId);
        if (room) return `Teaching the ${roomDisplayName(room)}, period ${block.period}.`;
      }
    }
    if (block.kind === 'meal') {
      const sit = buildMealSittings(state).get('wizard');
      if (sit && sit.sitting !== 'packed') return 'Eating in the Refectory.';
      return 'Eating a packed meal.';
    }
    if (block.kind === 'night') {
      const fq = state.rooms.find(r => r.state === 'built' && r.defId === 'faculty_quarters')
        ?? state.rooms.find(r => r.state === 'built' && r.defId === 'wizard_study');
      return fq ? `Sleeping in the ${roomDisplayName(fq)}.` : 'Sleeping for the night.';
    }
    if (state.wizard.activeSession?.kind === 'orb' && state.wizard.activeSession.state === 'active') {
      if (shelvedStudy) {
        return hasBuiltEH
          ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedStudy)}.`
          : 'Waiting on the front path while rooms are arranged.';
      }
      return 'Pondering the orb.';
    }
    const study = findRoom(state.wizard.presenceRoomId)
      ?? state.rooms.find(r => r.state === 'built' && r.defId === 'wizard_study');
    if (!study && !hasBuiltEH) return 'Waiting on the front path while rooms are arranged.';
    return describeFreeTime(study, 'idle');
  }

  // 5. Character with live VisualAgent
  if (agent) {
    const room = findRoom(agent.currentRoomId ?? agent.targetRoomId);
    if (!hasBuiltEH && !room) {
      return 'Waiting on the front path while rooms are arranged.';
    }
    if (agent.activity === 'class') {
      const period =
        periodFromBlockKey(agent.lastBlockKey) ??
        (block.kind === 'period' ? block.period : person.period);
      if (person.status === 'student') {
        const cls = room ?? findRoom(person.classRoomId);
        const shelvedCls = findShelved(person.classRoomId);
        if (shelvedCls && (!room || room.defId === 'entrance_hall')) {
          return hasBuiltEH
            ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedCls)}.`
            : 'Waiting on the front path while rooms are arranged.';
        }
        if (cls) {
          return `In class${period ? `, period ${period}` : ''}, at a desk in the ${roomDisplayName(cls)}.`;
        }
        return 'In class.';
      }
      if (person.career === 'teacher') {
        const cls = room ?? findRoom(person.workplaceRoomId);
        const shelvedCls = findShelved(person.workplaceRoomId);
        if (shelvedCls && (!room || room.defId === 'entrance_hall')) {
          return hasBuiltEH
            ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedCls)}.`
            : 'Waiting on the front path while rooms are arranged.';
        }
        if (cls) {
          return `Teaching the ${roomDisplayName(cls)}${period ? `, period ${period}` : ''}.`;
        }
        return 'Teaching class.';
      }
    }
    if (agent.activity === 'work') {
      const workRoom = room ?? findRoom(person.workplaceRoomId);
      const shelvedWp = findShelved(person.workplaceRoomId);
      if (shelvedWp && (!room || room.defId === 'entrance_hall')) {
        return hasBuiltEH
          ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedWp)}.`
          : 'Waiting on the front path while rooms are arranged.';
      }
      if (person.career === 'teacher' && workRoom && classroomSchool(workRoom.defId)) {
        const period =
          periodFromBlockKey(agent.lastBlockKey) ??
          (block.kind === 'period' ? block.period : undefined);
        return `Teaching the ${roomDisplayName(workRoom)}${period ? `, period ${period}` : ''}.`;
      }
      return workRoom ? `Working in the ${roomDisplayName(workRoom)}.` : 'Working on duty.';
    }
    if (agent.activity === 'meal') {
      return room?.defId === 'refectory' ? 'Eating in the Refectory.' : 'Eating a packed meal.';
    }
    if (agent.activity === 'sleep') {
      const sleepRoom = room ?? findRoom(person.bedRoomId);
      const shelvedBed = findShelved(person.bedRoomId);
      if (shelvedBed && (!room || room.defId === 'entrance_hall')) {
        return hasBuiltEH
          ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedBed)}.`
          : 'Waiting on the front path while rooms are arranged.';
      }
      return sleepRoom ? `Sleeping in the ${roomDisplayName(sleepRoom)}.` : 'Sleeping for the night.';
    }
    if ((agent.talkingRemainingMs ?? 0) > 0 && room) {
      return room.defId === 'courtyard_garden'
        ? 'Chatting in the garden.'
        : `Chatting in the ${roomDisplayName(room)}.`;
    }
    return describeFreeTime(room, agent.anim);
  }

  // 6. Character fallback without mounted VisualAgent (headless/SSR tests)
  const schedule = buildAcademySchedule(state);
  if (block.kind === 'period') {
    if (person.status === 'student') {
      const stuAssign = schedule.studentAssignments.get(person.id);
      if (stuAssign && stuAssign.period === block.period) {
        const cls = findRoom(stuAssign.classRoomId);
        if (cls) return `In class, period ${block.period}, at a desk in the ${roomDisplayName(cls)}.`;
      }
      const shelvedCls = findShelved(person.classRoomId);
      if (shelvedCls) {
        return hasBuiltEH
          ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedCls)}.`
          : 'Waiting on the front path while rooms are arranged.';
      }
    } else if (person.career === 'teacher' && person.careerState === 'active') {
      const tAssign = schedule.teacherAssignments.get(person.id);
      if (tAssign && tAssign.periods.includes(block.period)) {
        const cls = findRoom(tAssign.classRoomId);
        if (cls) return `Teaching the ${roomDisplayName(cls)}, period ${block.period}.`;
      }
      const shelvedWp = findShelved(person.workplaceRoomId);
      if (shelvedWp) {
        return hasBuiltEH
          ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedWp)}.`
          : 'Waiting on the front path while rooms are arranged.';
      }
    } else if (person.career && person.careerState === 'active') {
      const wp = findRoom(person.workplaceRoomId);
      if (wp && wp.state === 'built') return `Working in the ${roomDisplayName(wp)}.`;
      const shelvedWp = findShelved(person.workplaceRoomId);
      if (shelvedWp) {
        return hasBuiltEH
          ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedWp)}.`
          : 'Waiting on the front path while rooms are arranged.';
      }
    }
  }
  if (block.kind === 'meal') {
    const sit = buildMealSittings(state).get(`char-${person.id}`);
    if (sit && sit.sitting !== 'packed') return 'Eating in the Refectory.';
    return 'Eating a packed meal.';
  }
  if (block.kind === 'night') {
    const bedRoom = findRoom(person.bedRoomId);
    if (bedRoom) return `Sleeping in the ${roomDisplayName(bedRoom)}.`;
    const shelvedBed = findShelved(person.bedRoomId);
    if (shelvedBed) {
      return hasBuiltEH
        ? `Waiting in the Entrance Hall for the ${roomDisplayName(shelvedBed)}.`
        : 'Waiting on the front path while rooms are arranged.';
    }
    return 'Sleeping for the night.';
  }
  const idleRoom =
    findRoom(person.bedRoomId) ??
    state.rooms.find(r => r.state === 'built' && r.defId === 'common_room') ??
    state.rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall');
  if (!idleRoom && !hasBuiltEH) return 'Waiting on the front path while rooms are arranged.';
  return describeFreeTime(idleRoom, 'idle');
}
