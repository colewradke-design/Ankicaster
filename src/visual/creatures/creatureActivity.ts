/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Read-only human sentence describing what a creature is doing right now.
 * Never mutates FullGameState and never imports engine.ts.
 */

import { CREATURE_DEFINITIONS, RIFT_DESTINATIONS, roomDisplayName } from '../../data/content';
import type { CreatureInstance, FullGameState, PlacedRoom } from '../../types/ankicaster';
import { isRoamingCompanion, originLabel, resolveAllCreatureRooms } from '../../utils/creatures';
import type { CreatureVisualAgent } from './creatureChoreographer';

function findTamerName(state: FullGameState, tamerId?: number): string | undefined {
  if (tamerId === 0) return state.wizard?.name || 'The Headmaster';
  if (tamerId === undefined) return undefined;
  return state.characters.find(c => c.id === tamerId)?.name;
}

export function describeCreatureActivity(
  agent: CreatureVisualAgent | undefined,
  creature: CreatureInstance,
  state: FullGameState
): string {
  const def = CREATURE_DEFINITIONS[creature.defId];
  const partner =
    creature.adventurerId != null
      ? state.characters.find(c => c.id === creature.adventurerId && c.career === 'adventurer')
      : undefined;

  if (creature.status === 'away') {
    const exp = (state.expeditions || []).find(
      e => e.state === 'active' && e.companionId === creature.id
    );
    if (exp) {
      const destName = RIFT_DESTINATIONS[exp.destinationId]?.name || exp.destinationId.replace(/_/g, ' ');
      return `On a Rift expedition to ${destName} (${exp.progressReviews}/${exp.requiredReviews} reviews).`;
    }
    return 'Away on a Rift expedition.';
  }

  if (creature.status === 'loose') {
    const catcher = findTamerName(state, creature.captureTamerId) || 'A tamer';
    const left = creature.captureReviewsLeft;
    return `Running loose! ${catcher} is after it${left !== undefined ? ` (${left} reviews left)` : ''}.`;
  }

  const shelvedRoom: PlacedRoom | undefined =
    creature.roomId != null
      ? (state.shelvedRooms || []).find(r => r.id === creature.roomId)
      : undefined;
  if (shelvedRoom && !isRoamingCompanion(creature)) {
    return `Waiting with the shelved ${roomDisplayName(shelvedRoom)} while arranging rooms.`;
  }

  const resolution = resolveAllCreatureRooms(state.creatures || [], state.rooms || []).get(creature.id);
  const resolvedRoom =
    (agent?.roomId != null ? state.rooms.find(r => r.id === agent.roomId) : undefined) ??
    resolution?.room;
  const unhomed = agent?.unhomed ?? resolution?.unhomed ?? false;

  if (creature.status === 'egg') {
    const label = originLabel(def?.origin, creature.defId);
    const pct = Math.round(creature.hatchProgress || 0);
    if (resolvedRoom && !unhomed) {
      return `${label} incubating in the ${roomDisplayName(resolvedRoom)} (${pct}%).`;
    }
    return `${label} waiting to incubate (${pct}%).`;
  }

  if (creature.status === 'wary') {
    const tamer = findTamerName(state, creature.tamerId);
    const req = Math.max(1, def?.tamingReviews ?? 40);
    const pct = Math.min(100, Math.round(((creature.tamingProgress || 0) / req) * 100));
    if (unhomed || !resolvedRoom) {
      return tamer
        ? `Waiting outside the Entrance Hall for a pen; ${tamer} is taming it (${pct}%).`
        : 'Waiting outside the Entrance Hall for a compatible pen.';
    }
    if (tamer) {
      return `Being tamed by ${tamer} in the ${roomDisplayName(resolvedRoom)} (${pct}%).`;
    }
    return `Wary inside the ${roomDisplayName(resolvedRoom)} (${pct}% tamed).`;
  }

  // Tamed
  if (isRoamingCompanion(creature) || agent?.roaming) {
    const pairSuffix = partner ? ` (paired with ${partner.name})` : '';
    if (agent && agent.roamPath.length > 0 && agent.roamPathIdx < agent.roamPath.length) {
      const destNode = agent.roamPath[agent.roamPath.length - 1];
      const destRoom = destNode?.roomId != null ? state.rooms.find(r => r.id === destNode.roomId) : undefined;
      if (destRoom) return `Roaming toward the ${roomDisplayName(destRoom)}${pairSuffix}.`;
    }
    const curRoom =
      agent?.roomId != null ? state.rooms.find(r => r.id === agent.roomId) : undefined;
    if (agent && agent.roamNapTimerMs > 0 && curRoom) {
      return `Napping in the ${roomDisplayName(curRoom)}${pairSuffix}.`;
    }
    if (curRoom) {
      return `Roaming the ${roomDisplayName(curRoom)}${pairSuffix}.`;
    }
    return `Roaming freely around the academy${pairSuffix}.`;
  }

  if (unhomed || !resolvedRoom) {
    return 'Waiting outside the Entrance Hall for a compatible pen.';
  }

  const pairSuffix = partner ? ` · Paired with ${partner.name}` : '';
  const verb =
    agent?.anim === 'eat'
      ? 'Eating'
      : agent?.anim === 'sleep'
      ? 'Sleeping'
      : agent?.flightMode === 'cruise' || agent?.flightMode === 'takeoff'
      ? 'Flying'
      : agent?.anim === 'move'
      ? (agent.habitat === 'tide' ? 'Swimming' : 'Pacing')
      : 'Resting';

  return `${verb} in the ${roomDisplayName(resolvedRoom)}${creature.hungry ? ' (hungry)' : ''}${pairSuffix}.`;
}
