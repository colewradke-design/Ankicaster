/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Nav Graph & Pathfinding
 * Implements Section 7.7:
 * - Uses exactly the same connections as computeReachability
 * - Nodes: each built, reachable room's floor line; Spiral Stairs; Study internal stair; plots; path
 * - Pathfinding: Dijkstra
 */

import { PlacedRoom } from '../../types/ankicaster';
import { computeReachability } from '../../utils/reachability';
import { roomToWorldBox, getFloorLineY, castleCellToWorldX } from '../layout/gridToWorld';

function isSpiralStairLink(defId: string): boolean {
  return defId === 'spiral_stair';
}

export interface NavNode {
  id: string; // e.g. "room-1-f0", "stair-3", "plot-8", "path"
  roomId?: number;
  x: number;
  y: number;
  floor: number;
  kind: 'room_floor' | 'stair' | 'plot' | 'path' | 'door';
}

export interface NavEdge {
  to: string;
  cost: number;
}

export class NavGraph {
  nodes = new Map<string, NavNode>();
  adj = new Map<string, NavEdge[]>();

  constructor(rooms: PlacedRoom[], groundY: number) {
    this.build(rooms, groundY);
  }

  build(rooms: PlacedRoom[], groundY: number) {
    this.nodes.clear();
    this.adj.clear();

    const reachability = computeReachability(rooms);
    const reachableRooms = rooms.filter(r => r.state === 'built' && reachability.get(r.id)?.reachable);

    const ehRoom = reachableRooms.find(r => r.defId === 'entrance_hall' && r.y === 0);
    const ehBox = ehRoom ? roomToWorldBox(ehRoom, groundY) : null;
    const frontPathX = ehBox ? ehBox.left + ehBox.width / 2 : castleCellToWorldX(3);

    // Front path node anchored outside Entrance Hall doors
    const pathNodeId = 'path-front';
    const pathNodes: NavNode[] = [];
    const frontNode: NavNode = {
      id: pathNodeId,
      x: frontPathX,
      y: groundY + 2,
      floor: 0,
      kind: 'path'
    };
    this.nodes.set(pathNodeId, frontNode);
    this.adj.set(pathNodeId, []);
    pathNodes.push(frontNode);

    // 1. Create nodes for reachable rooms
    for (const r of reachableRooms) {
      const box = roomToWorldBox(r, groundY);

      if (r.area === 'grounds') {
        const nodeId = `room-${r.id}`;
        const nodeX = box.left + box.width / 2;
        const nodeY = box.floorLineY;
        this.nodes.set(nodeId, {
          id: nodeId,
          roomId: r.id,
          x: nodeX,
          y: nodeY,
          floor: 0,
          kind: 'plot'
        });
        this.adj.set(nodeId, []);

        // Path waypoint on the cobbled front path right in front of this plot
        const plotPathId = `path-plot-${r.id}`;
        const plotPathNode: NavNode = {
          id: plotPathId,
          x: nodeX,
          y: groundY + 2,
          floor: 0,
          kind: 'path'
        };
        this.nodes.set(plotPathId, plotPathNode);
        this.adj.set(plotPathId, []);
        pathNodes.push(plotPathNode);

        // 6px step between front path (groundY + 2) and plot floor line (groundY - 4)
        this.addEdge(nodeId, plotPathId, 9);
      } else {
        // Castle room: can span multiple floors r.y .. r.y + r.h - 1
        for (let f = r.y; f < r.y + r.h; f++) {
          const nodeId = `room-${r.id}-f${f}`;
          const nodeX = box.left + box.width / 2;
          const nodeY = getFloorLineY(f, groundY);
          const isStair = r.defId === 'spiral_stair';

          this.nodes.set(nodeId, {
            id: nodeId,
            roomId: r.id,
            x: nodeX,
            y: nodeY,
            floor: f,
            kind: isStair ? 'stair' : 'room_floor'
          });
          this.adj.set(nodeId, []);

          if (r.defId === 'wizard_study') {
            // Wizard's Study internal spiral stair is drawn on the left (x = L + 3 .. L + 16 -> center L + 9.5)
            const stairX = box.left + 9.5;
            const stairNodeId = `study-stair-${r.id}-f${f}`;
            this.nodes.set(stairNodeId, {
              id: stairNodeId,
              roomId: r.id,
              x: stairX,
              y: nodeY,
              floor: f,
              kind: 'stair'
            });
            this.adj.set(stairNodeId, []);
            // Walk horizontally between the Study floor node and its left staircase column
            this.addEdge(nodeId, stairNodeId, Math.max(1, Math.abs(nodeX - stairX)));
            if (f > r.y) {
              const lowerStairId = `study-stair-${r.id}-f${f - 1}`;
              this.addEdge(stairNodeId, lowerStairId, 48 * 1.5);
            }
          } else if (isSpiralStairLink(r.defId) && f > r.y) {
            // Only Spiral Stairs (and Wizard's Study above) have internal vertical links;
            // tall rooms like Aviary or Menagerie NEVER act as staircases.
            const lowerNodeId = `room-${r.id}-f${f - 1}`;
            this.addEdge(nodeId, lowerNodeId, 48 * 1.5);
          }
        }

        // If Entrance Hall floor 0, connect to front path (6px step down)
        if (r.defId === 'entrance_hall' && r.y === 0) {
          const ehNodeId = `room-${r.id}-f0`;
          this.addEdge(ehNodeId, pathNodeId, 9);
        }
      }
    }

    // Chain all front-path nodes horizontally left-to-right so agents walk smoothly along groundY + 2
    pathNodes.sort((a, b) => a.x - b.x);
    for (let i = 0; i < pathNodes.length - 1; i++) {
      const a = pathNodes[i];
      const b = pathNodes[i + 1];
      this.addEdge(a.id, b.id, Math.max(1, Math.abs(b.x - a.x)));
    }

    // 2. Add Horizontal Edges between same-floor neighbours
    const castleRooms = reachableRooms.filter(r => r.area === 'castle');
    for (let i = 0; i < castleRooms.length; i++) {
      const a = castleRooms[i];
      for (let j = i + 1; j < castleRooms.length; j++) {
        const b = castleRooms[j];

        const floorOverlapStart = Math.max(a.y, b.y);
        const floorOverlapEnd = Math.min(a.y + a.h, b.y + b.h);

        if (floorOverlapStart < floorOverlapEnd) {
          const aRight = a.x + a.w;
          const bRight = b.x + b.w;
          if (aRight === b.x || bRight === a.x) {
            // Share boundary on each overlapping floor
            for (let f = floorOverlapStart; f < floorOverlapEnd; f++) {
              // Left neighbours of Wizard's Study enter right beside its left-side staircase
              const aNodeId =
                a.defId === 'wizard_study' && bRight === a.x
                  ? `study-stair-${a.id}-f${f}`
                  : `room-${a.id}-f${f}`;
              const bNodeId =
                b.defId === 'wizard_study' && aRight === b.x
                  ? `study-stair-${b.id}-f${f}`
                  : `room-${b.id}-f${f}`;
              if (this.nodes.has(aNodeId) && this.nodes.has(bNodeId)) {
                const nodeA = this.nodes.get(aNodeId)!;
                const nodeB = this.nodes.get(bNodeId)!;
                const dist = Math.abs(nodeA.x - nodeB.x);
                this.addEdge(aNodeId, bNodeId, dist);
              }
            }
          }
        }
      }
    }

    // 3. Add Vertical Edges between stacked Spiral Stairs
    const stairs = castleRooms.filter(r => r.defId === 'spiral_stair');
    for (let i = 0; i < stairs.length; i++) {
      const a = stairs[i];
      for (let j = i + 1; j < stairs.length; j++) {
        const b = stairs[j];
        if (a.x === b.x) {
          if (a.y + a.h === b.y) {
            // a is below b
            const aNodeId = `room-${a.id}-f${a.y + a.h - 1}`;
            const bNodeId = `room-${b.id}-f${b.y}`;
            if (this.nodes.has(aNodeId) && this.nodes.has(bNodeId)) {
              this.addEdge(aNodeId, bNodeId, 48 * 1.5);
            }
          } else if (b.y + b.h === a.y) {
            // b is below a
            const bNodeId = `room-${b.id}-f${b.y + b.h - 1}`;
            const aNodeId = `room-${a.id}-f${a.y}`;
            if (this.nodes.has(aNodeId) && this.nodes.has(bNodeId)) {
              this.addEdge(aNodeId, bNodeId, 48 * 1.5);
            }
          }
        }
      }
    }
  }

  addEdge(from: string, to: string, cost: number) {
    if (!this.adj.has(from)) this.adj.set(from, []);
    if (!this.adj.has(to)) this.adj.set(to, []);
    this.adj.get(from)!.push({ to, cost });
    this.adj.get(to)!.push({ to: from, cost });
  }

  /**
   * Find shortest path using Dijkstra
   */
  findPath(fromNodeId: string, toNodeId: string): NavNode[] {
    if (!this.nodes.has(fromNodeId) || !this.nodes.has(toNodeId)) {
      return [];
    }

    if (fromNodeId === toNodeId) {
      return [this.nodes.get(fromNodeId)!];
    }

    const dist = new Map<string, number>();
    const prev = new Map<string, string>();
    const unvisited = new Set<string>();

    for (const id of this.nodes.keys()) {
      dist.set(id, Infinity);
      unvisited.add(id);
    }
    dist.set(fromNodeId, 0);

    while (unvisited.size > 0) {
      // Find min distance unvisited
      let current: string | null = null;
      let minD = Infinity;
      for (const id of unvisited) {
        const d = dist.get(id)!;
        if (d < minD) {
          minD = d;
          current = id;
        }
      }

      if (!current || minD === Infinity) break;
      if (current === toNodeId) break;

      unvisited.delete(current);

      const edges = this.adj.get(current) || [];
      for (const edge of edges) {
        if (!unvisited.has(edge.to)) continue;
        const alt = minD + edge.cost;
        if (alt < dist.get(edge.to)!) {
          dist.set(edge.to, alt);
          prev.set(edge.to, current);
        }
      }
    }

    if (!prev.has(toNodeId)) {
      return [];
    }

    const path: NavNode[] = [];
    let curr: string | undefined = toNodeId;
    while (curr) {
      path.unshift(this.nodes.get(curr)!);
      curr = prev.get(curr);
      if (curr === fromNodeId) {
        path.unshift(this.nodes.get(fromNodeId)!);
        break;
      }
    }

    return path;
  }
}
