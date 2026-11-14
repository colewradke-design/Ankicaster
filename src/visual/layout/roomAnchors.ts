/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic furniture & room anchors for visual agents.
 * Every anchor represents one physical furniture piece or fixed room spot,
 * never a per-agent width hash, so agents spread out and never stack.
 * Read-only over FullGameState (safe for deep-freeze tests & VR-01).
 */
import { FullGameState, PlacedRoom } from '../../types/ankicaster';
import { FURNITURE_DEFINITIONS, ROOM_DEFINITIONS } from '../../data/content';
import { getFloorLineY, roomToWorldBox } from './gridToWorld';
import { layoutRoomFurniture, PlacedFurnitureView, floorLineFor } from './roomLayouts';
import { ReachabilityInfo } from '../../utils/reachability';

export type RoomAnchorKind =
  | 'lectern'
  | 'student_desk'
  | 'chair'
  | 'reading_desk'
  | 'bookshelf'
  | 'bed'
  | 'writing_desk'
  | 'cot'
  | 'orb'
  | 'seat'
  | 'work'
  | 'site_edge';

export interface RoomAnchor {
  id: string;
  roomId: number;
  kind: RoomAnchorKind;
  index: number;
  x: number;
  y: number;
  floor: number;
  furnitureId?: number;
  defId?: string;
}

export interface RoomAnchorSet {
  roomId: number;
  lecterns: RoomAnchor[];
  studentDesks: RoomAnchor[];
  chairs: RoomAnchor[];
  readingDesks: RoomAnchor[];
  bookshelves: RoomAnchor[];
  beds: RoomAnchor[];
  writingDesks: RoomAnchor[];
  cots: RoomAnchor[];
  orbs: RoomAnchor[];
  seats: RoomAnchor[];
  workSpots: RoomAnchor[];
  all: RoomAnchor[];
}

function clampRoomX(x: number, boxLeft: number, boxWidth: number, margin = 10): number {
  const minX = boxLeft + margin;
  const maxX = Math.max(minX, boxLeft + boxWidth - margin);
  return Math.round(Math.max(minX, Math.min(maxX, x)) * 10) / 10;
}

function spreadRowX(count: number, boxLeft: number, boxWidth: number, margin = 12): number[] {
  if (count <= 0) return [];
  const minX = boxLeft + margin;
  const maxX = Math.max(minX, boxLeft + boxWidth - margin);
  if (count === 1) return [Math.round(((minX + maxX) / 2) * 10) / 10];
  const out: number[] = [];
  for (let i = 0; i < count; i++) {
    const t = i / (count - 1);
    out.push(Math.round((minX + t * (maxX - minX)) * 10) / 10);
  }
  return out;
}

function nudgeDistinct(
  rawX: number,
  floor: number,
  occupiedXByFloor: Map<number, number[]>,
  boxLeft: number,
  boxWidth: number,
  minSpacing = 11,
  margin = 10
): number {
  const list = occupiedXByFloor.get(floor) ?? [];
  occupiedXByFloor.set(floor, list);
  let x = clampRoomX(rawX, boxLeft, boxWidth, margin);
  if (list.some(ox => Math.abs(ox - x) < minSpacing)) {
    const minX = boxLeft + margin;
    const maxX = Math.max(minX, boxLeft + boxWidth - margin);
    let found: number | null = null;
    for (let step = 1; step <= 24 && found === null; step++) {
      for (const dir of [1, -1]) {
        const cand = clampRoomX(x + dir * step * Math.ceil(minSpacing / 2), boxLeft, boxWidth, margin);
        if (cand >= minX && cand <= maxX && !list.some(ox => Math.abs(ox - cand) < minSpacing)) {
          found = cand;
          break;
        }
      }
    }
    if (found !== null) {
      x = found;
    } else {
      // Fallback: pick midpoint of largest free gap
      const sorted = [...list].sort((a, b) => a - b);
      let bestX = clampRoomX(rawX + list.length * 4, boxLeft, boxWidth, 6);
      let bestGap = -1;
      const bounds = [boxLeft + 8, ...sorted, boxLeft + boxWidth - 8];
      for (let i = 0; i < bounds.length - 1; i++) {
        const gap = bounds[i + 1] - bounds[i];
        if (gap > bestGap) {
          bestGap = gap;
          bestX = Math.round(((bounds[i] + bounds[i + 1]) / 2) * 10) / 10;
        }
      }
      x = bestX;
    }
  }
  list.push(x);
  return x;
}

function pushAnchor(
  target: RoomAnchor[],
  all: RoomAnchor[],
  occupiedXByFloor: Map<number, number[]>,
  room: PlacedRoom,
  kind: RoomAnchorKind,
  rawX: number,
  localFloor: number,
  box: { left: number; width: number; floorLineY: number },
  opts: { furnitureId?: number; defId?: string; minSpacing?: number; margin?: number } = {}
): RoomAnchor {
  const worldFloor = room.area === 'castle' ? room.y + localFloor : 0;
  const x = nudgeDistinct(
    rawX,
    worldFloor,
    occupiedXByFloor,
    box.left,
    box.width,
    opts.minSpacing ?? 11,
    opts.margin ?? 10
  );
  const y = floorLineFor(box.floorLineY, localFloor);
  const index = target.length;
  const anchor: RoomAnchor = {
    id: `r-${room.id}-${kind}-${index}`,
    roomId: room.id,
    kind,
    index,
    x,
    y,
    floor: worldFloor,
    furnitureId: opts.furnitureId,
    defId: opts.defId
  };
  target.push(anchor);
  all.push(anchor);
  return anchor;
}

/**
 * Computes deterministic, non-overlapping anchors inside `room`.
 */
export function buildRoomAnchors(room: PlacedRoom, groundY: number): RoomAnchorSet {
  const box = roomToWorldBox(room, groundY);
  const view = layoutRoomFurniture(room);
  const items = view.items
    .filter(it => !it.furniture.damaged)
    .slice()
    .sort((a, b) => a.floor - b.floor || a.x - b.x || a.furniture.id - b.furniture.id);

  const lecterns: RoomAnchor[] = [];
  const studentDesks: RoomAnchor[] = [];
  const chairs: RoomAnchor[] = [];
  const readingDesks: RoomAnchor[] = [];
  const bookshelves: RoomAnchor[] = [];
  const beds: RoomAnchor[] = [];
  const writingDesks: RoomAnchor[] = [];
  const cots: RoomAnchor[] = [];
  const orbs: RoomAnchor[] = [];
  const seats: RoomAnchor[] = [];
  const workSpots: RoomAnchor[] = [];
  const all: RoomAnchor[] = [];
  const occ = new Map<number, number[]>();

  const itemWorldX = (it: PlacedFurnitureView) => box.left + it.x;

  // Avoid placing agents over the Wizard's Study internal stair column (left ~18px)
  const minRoomMargin = room.defId === 'wizard_study' ? 22 : isPenDef(room.defId) ? 16 : 10;

  if (room.defId.startsWith('class_')) {
    const lecternItems = items.filter(it => it.furniture.defId === 'teachers_lectern' || it.furniture.slotKind === 'required:teachers_lectern');
    for (const it of lecternItems) {
      pushAnchor(lecterns, all, occ, room, 'lectern', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId
      });
    }
    if (lecterns.length === 0) {
      pushAnchor(lecterns, all, occ, room, 'lectern', box.left + 22, 0, box);
    }

    const deskItems = items
      .filter(it => it.furniture.defId === 'student_desk' || it.furniture.slotKind === 'required:student_desk')
      .slice(0, 4);
    for (const it of deskItems) {
      pushAnchor(studentDesks, all, occ, room, 'student_desk', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId
      });
    }
  } else if (room.defId === 'refectory') {
    const tableItems = items
      .filter(it => it.furniture.defId === 'long_table' || it.furniture.slotKind === 'required:long_table')
      .slice(0, 2);
    const hearthItems = items.filter(it => it.furniture.defId === 'hearth');
    for (const h of hearthItems) {
      // Reserve hearth x slightly so chairs stay clear
      const list = occ.get(room.area === 'castle' ? room.y + h.floor : 0) ?? [];
      list.push(clampRoomX(itemWorldX(h), box.left, box.width, 10));
      occ.set(room.area === 'castle' ? room.y + h.floor : 0, list);
    }
    // 6 distinct chairs per table
    if (tableItems.length === 1) {
      const xs = spreadRowX(6, box.left, box.width, 12);
      const tbl = tableItems[0];
      for (const cx of xs) {
        pushAnchor(chairs, all, occ, room, 'chair', cx, tbl.floor, box, {
          furnitureId: tbl.furniture.id,
          defId: 'long_table',
          minSpacing: 11,
          margin: 10
        });
      }
    } else if (tableItems.length >= 2) {
      const xs = spreadRowX(12, box.left, box.width, 10);
      xs.forEach((cx, idx) => {
        const tbl = idx < 6 ? tableItems[0] : tableItems[1];
        pushAnchor(chairs, all, occ, room, 'chair', cx, tbl.floor, box, {
          furnitureId: tbl.furniture.id,
          defId: 'long_table',
          minSpacing: 9,
          margin: 8
        });
      });
    }
    // Also provide 2 non-meal visitor/hearth seats for outside mealtime if hearth exists
    const seatXs = spreadRowX(2, box.left, box.width, 20);
    for (const sx of seatXs) {
      pushAnchor(seats, all, occ, room, 'seat', sx, 0, box, { minSpacing: 12, margin: 14 });
    }
  } else if (room.defId === 'library') {
    const deskItems = items
      .filter(it => it.furniture.defId === 'reading_desk' || it.furniture.slotKind === 'required:reading_desk')
      .slice(0, 4);
    for (const it of deskItems) {
      pushAnchor(readingDesks, all, occ, room, 'reading_desk', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId
      });
    }
    const shelfItems = items.filter(it => it.furniture.defId === 'bookshelf' || it.furniture.slotKind === 'required:bookshelf');
    for (const it of shelfItems) {
      pushAnchor(bookshelves, all, occ, room, 'bookshelf', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId
      });
    }
    const ladder = items.find(it => it.furniture.defId === 'rolling_ladder');
    if (ladder) {
      pushAnchor(bookshelves, all, occ, room, 'bookshelf', itemWorldX(ladder), ladder.floor, box, {
        furnitureId: ladder.furniture.id,
        defId: ladder.furniture.defId
      });
    }
  } else if (room.defId === 'dormitory' || room.defId === 'grand_dormitory' || room.defId === 'faculty_quarters') {
    const bedItems = items.filter(
      it => it.furniture.slotKind.includes('bed') || FURNITURE_DEFINITIONS[it.furniture.defId]?.role === 'bed'
    );
    for (const it of bedItems) {
      const slots = it.furniture.defId === 'bunk_bed' ? 2 : 1;
      for (let s = 0; s < slots; s++) {
        const offset = slots === 2 ? (s === 0 ? -5 : 5) : 0;
        pushAnchor(beds, all, occ, room, 'bed', itemWorldX(it) + offset, it.floor, box, {
          furnitureId: it.furniture.id,
          defId: it.furniture.defId,
          minSpacing: 8,
          margin: 8
        });
      }
    }
    if (room.defId === 'faculty_quarters' && beds.length === 0) {
      const cap = (ROOM_DEFINITIONS.faculty_quarters?.capacity?.facultyBeds ?? 2) + Math.max(0, room.level - 1);
      for (const bx of spreadRowX(cap, box.left, box.width, 14)) {
        pushAnchor(beds, all, occ, room, 'bed', bx, 0, box, { minSpacing: 10 });
      }
    }
    const wdItems = items
      .filter(it => it.furniture.defId === 'writing_desk' || it.furniture.slotKind === 'required:writing_desk')
      .slice(0, 2);
    for (const it of wdItems) {
      pushAnchor(writingDesks, all, occ, room, 'writing_desk', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId
      });
    }
  } else if (room.defId === 'infirmary') {
    const cotItems = items.filter(
      it => it.furniture.slotKind.includes('bed') || it.furniture.defId === 'apothecaries_cot' || it.furniture.defId === 'simple_cot'
    );
    for (const it of cotItems) {
      pushAnchor(cots, all, occ, room, 'cot', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId
      });
    }
    // Ensure at least capacity.beds cots if infirmary is built
    const targetCots = ROOM_DEFINITIONS.infirmary?.capacity?.beds ?? 3;
    if (cots.length < targetCots) {
      for (const cx of spreadRowX(targetCots, box.left, box.width, 14)) {
        if (cots.length >= targetCots) break;
        pushAnchor(cots, all, occ, room, 'cot', cx, 0, box);
      }
    }
    pushAnchor(workSpots, all, occ, room, 'work', box.left + box.width * 0.25, 0, box);
  } else if (room.defId === 'wizard_study') {
    const orbItem = items.find(it => it.furniture.defId === 'astral_orb' || it.furniture.slotKind === 'required:astral_orb');
    pushAnchor(orbs, all, occ, room, 'orb', orbItem ? itemWorldX(orbItem) : box.left + box.width * 0.55, 0, box, {
      furnitureId: orbItem?.furniture.id,
      defId: orbItem?.furniture.defId,
      margin: minRoomMargin
    });
    for (const wx of spreadRowX(2, box.left, box.width, minRoomMargin)) {
      pushAnchor(seats, all, occ, room, 'seat', wx, 0, box, { margin: minRoomMargin });
    }
  } else if (room.defId === 'common_room' || room.defId === 'faculty_lounge') {
    const seatCap = ROOM_DEFINITIONS[room.defId]?.capacity?.leisureSeats ?? (room.defId === 'faculty_lounge' ? 6 : 4);
    for (const it of items) {
      if (seats.length >= Math.max(seatCap, items.length)) break;
      pushAnchor(seats, all, occ, room, 'seat', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId
      });
    }
    const desired = Math.max(seatCap, room.w * 2);
    if (seats.length < desired) {
      for (const sx of spreadRowX(desired, box.left, box.width, 12)) {
        if (seats.length >= desired) break;
        pushAnchor(seats, all, occ, room, 'seat', sx, 0, box);
      }
    }
  } else {
    // Work/visit/pen/garden/sanctum/observatory/scriptorium/lab/kitchen/bathhouse/yard/ward/detention/hall
    const workplaceItems = items.slice(0, 4);
    for (const it of workplaceItems) {
      pushAnchor(workSpots, all, occ, room, 'work', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        margin: minRoomMargin
      });
    }
    const desiredSpots = Math.max(3, Math.min(6, room.w * 2));
    if (workSpots.length < desiredSpots) {
      for (const wx of spreadRowX(desiredSpots, box.left, box.width, minRoomMargin)) {
        if (workSpots.length >= desiredSpots) break;
        pushAnchor(workSpots, all, occ, room, 'work', wx, 0, box, { margin: minRoomMargin });
      }
    }
    for (const w of workSpots) {
      seats.push(w);
    }
  }

  return {
    roomId: room.id,
    lecterns,
    studentDesks,
    chairs,
    readingDesks,
    bookshelves,
    beds,
    writingDesks,
    cots,
    orbs,
    seats,
    workSpots,
    all
  };
}

function isPenDef(defId: string): boolean {
  return !!ROOM_DEFINITIONS[defId]?.capacity?.creatures;
}

/**
 * Finds a point inside the nearest built reachable room touching `site` (never inside the unbuilt footprint).
 */
export function findBuilderSiteEdgeAnchor(
  site: PlacedRoom,
  state: FullGameState,
  reachMap: Map<number, ReachabilityInfo> | undefined,
  groundY: number
): RoomAnchor | undefined {
  const isReach = (id: number) => (reachMap ? reachMap.get(id)?.reachable !== false : true);
  const built = (state.rooms || []).filter(r => r.state === 'built' && isReach(r.id));
  const touching = built.filter(r => roomsShareEdge(r, site));
  if (touching.length === 0) return undefined;
  const preferred = touching.find(r => r.defId !== 'wizard_study') ?? touching[0];
  const box = roomToWorldBox(preferred, groundY);
  let targetX = box.left + box.width / 2;
  let worldFloor = preferred.area === 'castle' ? preferred.y : 0;

  if (preferred.area === 'castle' && site.area === 'castle') {
    const overlapMinY = Math.max(preferred.y, site.y);
    const overlapMaxY = Math.min(preferred.y + preferred.h, site.y + site.h);
    if (overlapMinY < overlapMaxY) {
      worldFloor = overlapMinY;
    }
    if (preferred.x + preferred.w === site.x) {
      targetX = box.left + box.width - 12;
    } else if (site.x + site.w === preferred.x) {
      targetX = box.left + 12;
    }
  } else if (preferred.area === 'grounds' && site.area === 'grounds') {
    worldFloor = 0;
    if (preferred.x + preferred.w === site.x) {
      targetX = box.left + box.width - 14;
    } else if (site.x + site.w === preferred.x) {
      targetX = box.left + 14;
    }
  }

  return {
    id: `r-${preferred.id}-site_edge-${site.id}`,
    roomId: preferred.id,
    kind: 'site_edge',
    index: 0,
    x: clampRoomX(targetX, box.left, box.width, 10),
    y: preferred.area === 'castle' ? getFloorLineY(worldFloor, groundY) : box.floorLineY,
    floor: worldFloor
  };
}

function roomsShareEdge(a: PlacedRoom, b: PlacedRoom): boolean {
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
