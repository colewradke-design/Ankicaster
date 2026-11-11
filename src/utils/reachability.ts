/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Reachability Graph Calculator
 * Implements GDD Section 15.3 BFS reachability:
 * - Root is the Entrance Hall (floor 0, castle area)
 * - Horizontal links: two built castle rooms on the same floor sharing a vertical wall edge (P4)
 * - Vertical links:
 *   - Stacked Spiral Stairs in the same column
 *   - Wizard's Study internal stair linking floor 0 and floor 1
 * - Grounds links:
 *   - Grounds plots connect to the Entrance Hall via the front path
 */

import { PlacedRoom } from '../types/ankicaster';

export interface ReachabilityInfo {
  reachable: boolean;
  distance: number;
}

/**
 * Computes reachability and BFS distance for all rooms from the Entrance Hall.
 * Pure function: does not mutate rooms.
 */
export function computeReachability(rooms: PlacedRoom[]): Map<number, ReachabilityInfo> {
  const result = new Map<number, ReachabilityInfo>();

  for (const r of rooms) {
    result.set(r.id, { reachable: false, distance: Infinity });
  }

  // Find root Entrance Hall: built castle room with defId === 'entrance_hall' on floor 0
  const entranceHalls = rooms.filter(
    r => r.state === 'built' && r.defId === 'entrance_hall' && r.area === 'castle' && r.y === 0
  );

  if (entranceHalls.length === 0) {
    return result;
  }

  // Build adjacency list
  const adj = new Map<number, number[]>();
  for (const r of rooms) {
    adj.set(r.id, []);
  }

  const castleRooms = rooms.filter(r => r.state === 'built' && r.area === 'castle');
  const groundsRooms = rooms.filter(r => r.state === 'built' && r.area === 'grounds');

  // 1. Same-floor horizontal wall adjacency (sharing a vertical wall edge)
  for (let i = 0; i < castleRooms.length; i++) {
    const a = castleRooms[i];
    for (let j = i + 1; j < castleRooms.length; j++) {
      const b = castleRooms[j];

      // Check vertical floor overlap
      const floorOverlapStart = Math.max(a.y, b.y);
      const floorOverlapEnd = Math.min(a.y + a.h, b.y + b.h);

      if (floorOverlapStart < floorOverlapEnd) {
        // Must share vertical boundary: a.right === b.left or b.right === a.left
        const aRight = a.x + a.w;
        const bRight = b.x + b.w;
        if (aRight === b.x || bRight === a.x) {
          adj.get(a.id)!.push(b.id);
          adj.get(b.id)!.push(a.id);
        }
      }
    }
  }

  // 2. Vertical connections:
  // Stacked Spiral Stairs in the same column
  const stairs = castleRooms.filter(r => r.defId === 'spiral_stair');
  for (let i = 0; i < stairs.length; i++) {
    const a = stairs[i];
    for (let j = i + 1; j < stairs.length; j++) {
      const b = stairs[j];
      if (a.x === b.x) {
        // Stacked vertically: a is immediately below b or vice versa
        if (a.y + a.h === b.y || b.y + b.h === a.y) {
          adj.get(a.id)!.push(b.id);
          adj.get(b.id)!.push(a.id);
        }
      }
    }
  }

  // Wizard's Study internal stair connects floor 0 and 1 intrinsically (handled since it spans y=0..2)
  // Multi-floor rooms span floors so horizontal connections on any overlapping floor are already linked above.

  // 3. Grounds plots link to Entrance Hall via front path
  for (const eh of entranceHalls) {
    for (const g of groundsRooms) {
      adj.get(eh.id)!.push(g.id);
      adj.get(g.id)!.push(eh.id);
    }
  }

  // Run BFS starting from entrance hall(s)
  const queue: Array<{ id: number; dist: number }> = [];
  for (const eh of entranceHalls) {
    result.set(eh.id, { reachable: true, distance: 0 });
    queue.push({ id: eh.id, dist: 0 });
  }

  while (queue.length > 0) {
    const { id, dist } = queue.shift()!;
    const neighbors = adj.get(id) || [];
    for (const nId of neighbors) {
      const current = result.get(nId)!;
      if (!current.reachable || dist + 1 < current.distance) {
        result.set(nId, { reachable: true, distance: dist + 1 });
        queue.push({ id: nId, dist: dist + 1 });
      }
    }
  }

  return result;
}
