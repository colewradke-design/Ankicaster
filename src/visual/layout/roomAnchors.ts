/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Deterministic furniture & room anchors for visual agents (manual-furniture.md).
 * Every anchor represents one physical furniture piece (using its placed x/floor)
 * or a dedicated room spot, never inventing seats when furniture isn't placed.
 * Read-only over FullGameState (safe for deep-freeze tests & VR-01).
 */
import { FullGameState, PlacedRoom } from '../../types/ankicaster';
import { FURNITURE_DEFINITIONS, ROOM_DEFINITIONS } from '../../data/content';
import { getFloorLineY, roomToWorldBox } from './gridToWorld';
import { layoutRoomFurniture, PlacedFurnitureView, floorLineFor } from './roomLayouts';
import { getFurnitureArt } from '../rooms/furnitureArt';
import { isSeatDef, pieceKind, piecePlane } from './furniturePlacement';
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
  if (minSpacing > 0 && list.some(ox => Math.abs(ox - x) < minSpacing)) {
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
  opts: { furnitureId?: number; defId?: string; minSpacing?: number; margin?: number; exact?: boolean } = {}
): RoomAnchor {
  const worldFloor = room.area === 'castle' ? room.y + localFloor : 0;
  const x = opts.exact
    ? clampRoomX(rawX, box.left, box.width, opts.margin ?? 6)
    : nudgeDistinct(
        rawX,
        worldFloor,
        occupiedXByFloor,
        box.left,
        box.width,
        opts.minSpacing ?? 11,
        opts.margin ?? 10
      );
  if (opts.exact) {
    const list = occupiedXByFloor.get(worldFloor) ?? [];
    list.push(x);
    occupiedXByFloor.set(worldFloor, list);
  }
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

/** Find a standing X beside a bookshelf or non-seat bulk piece, outside its bulk box. */
function besideBulkX(
  it: PlacedFurnitureView,
  box: { left: number; width: number },
  bulkBoxes: Array<{ floor: number; left: number; right: number }>
): number {
  const art = getFurnitureArt(it.furniture.defId);
  const shelfCenter = box.left + it.x;
  const half = art.w / 2;
  const minBound = box.left + 8;
  const maxBound = box.left + box.width - 8;
  const candidates = [shelfCenter + half + 4, shelfCenter - half - 4];
  for (const cx of candidates) {
    if (cx < minBound || cx > maxBound) continue;
    const hitsBulk = bulkBoxes.some(b => b.floor === it.floor && cx >= b.left && cx <= b.right);
    if (!hitsBulk) return cx;
  }
  return clampRoomX(candidates[0], box.left, box.width, 8);
}

/**
 * Computes deterministic, piece-tracked anchors inside `room`.
 */
export function buildRoomAnchors(room: PlacedRoom, groundY: number): RoomAnchorSet {
  const box = roomToWorldBox(room, groundY);
  const view = layoutRoomFurniture(room);
  const items = view.items
    .filter(it => !it.furniture.damaged)
    .slice()
    .sort((a, b) => a.floor - b.floor || a.x - b.x || a.furniture.id - b.furniture.id);

  // World-space boxes of all bulk pieces (including damaged ones so people don't stand inside them)
  const bulkBoxes = view.items
    .filter(it => pieceKind(it.furniture.defId) === 'bulk')
    .map(it => {
      const art = getFurnitureArt(it.furniture.defId);
      const wx = box.left + it.x;
      return { floor: it.floor, left: wx - art.w / 2, right: wx + art.w / 2 };
    });

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
  const minRoomMargin = room.defId === 'wizard_study' ? 22 : isPenDef(room.defId) ? 16 : 8;

  if (room.defId.startsWith('class_')) {
    const lecternItems = items.filter(
      it => it.furniture.defId === 'teachers_lectern' || it.furniture.slotKind === 'required:teachers_lectern'
    );
    for (const it of lecternItems) {
      pushAnchor(lecterns, all, occ, room, 'lectern', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        exact: true
      });
    }

    const deskItems = items
      .filter(it => it.furniture.defId === 'student_desk' || it.furniture.slotKind === 'required:student_desk')
      .slice(0, 4);
    for (const it of deskItems) {
      pushAnchor(studentDesks, all, occ, room, 'student_desk', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        exact: true
      });
    }

    const shelfItems = items.filter(it => it.furniture.defId === 'bookshelf');
    for (const it of shelfItems) {
      pushAnchor(bookshelves, all, occ, room, 'bookshelf', besideBulkX(it, box, bulkBoxes), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        margin: 8
      });
    }
  } else if (room.defId === 'refectory') {
    const tableItems = items
      .filter(it => it.furniture.defId === 'long_table' || it.furniture.slotKind === 'required:long_table')
      .slice(0, 2);
    const validTableIds = new Set(tableItems.map(t => t.furniture.id));

    // Only wooden_chair items snapped onto an undamaged long_table (up to 6 per table) feed/seat diners
    const perTableUsedMarks = new Map<number, Set<number>>();
    const snappedChairs = items
      .filter(
        it =>
          it.furniture.defId === 'wooden_chair' &&
          typeof it.tableId === 'number' &&
          typeof it.markIndex === 'number' &&
          it.markIndex >= 0 &&
          it.markIndex < 6 &&
          validTableIds.has(it.tableId)
      )
      .sort((a, b) => (a.tableId! - b.tableId!) || (a.markIndex! - b.markIndex!) || (a.furniture.id - b.furniture.id));

    for (const ch of snappedChairs) {
      const usedMarks = perTableUsedMarks.get(ch.tableId!) ?? new Set<number>();
      if (usedMarks.size >= 6 || usedMarks.has(ch.markIndex!)) continue;
      usedMarks.add(ch.markIndex!);
      perTableUsedMarks.set(ch.tableId!, usedMarks);
      // Slight side offset so front/back row diners at the same column don't overlap pixel-for-pixel
      const rowOffset = ch.markIndex! < 3 ? -1.5 : 1.5;
      pushAnchor(chairs, all, occ, room, 'chair', itemWorldX(ch) + rowOffset, ch.floor, box, {
        furnitureId: ch.furniture.id,
        defId: ch.furniture.defId,
        exact: true,
        margin: 6
      });
    }

    // Non-meal leisure seats only from actual placed seat furniture (freestanding chairs, benches, etc.)
    const freeSeats = items.filter(
      it => isSeatDef(it.furniture.defId) && !(it.furniture.defId === 'wooden_chair' && typeof it.tableId === 'number')
    );
    for (const sItem of freeSeats) {
      pushAnchor(seats, all, occ, room, 'seat', itemWorldX(sItem), sItem.floor, box, {
        furnitureId: sItem.furniture.id,
        defId: sItem.furniture.defId,
        exact: true
      });
    }
  } else if (room.defId === 'library') {
    const deskItems = items
      .filter(it => it.furniture.defId === 'reading_desk' || it.furniture.slotKind === 'required:reading_desk')
      .slice(0, 4);
    for (const it of deskItems) {
      pushAnchor(readingDesks, all, occ, room, 'reading_desk', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        exact: true
      });
    }
    const shelfItems = items.filter(
      it => it.furniture.defId === 'bookshelf' || it.furniture.slotKind === 'required:bookshelf' || it.furniture.defId === 'rolling_ladder'
    );
    for (const it of shelfItems) {
      pushAnchor(bookshelves, all, occ, room, 'bookshelf', besideBulkX(it, box, bulkBoxes), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        margin: 8
      });
    }
    const otherSeats = items.filter(
      it =>
        isSeatDef(it.furniture.defId) &&
        it.furniture.defId !== 'reading_desk' &&
        it.furniture.slotKind !== 'required:reading_desk'
    );
    for (const sItem of otherSeats) {
      pushAnchor(readingDesks, all, occ, room, 'seat', itemWorldX(sItem), sItem.floor, box, {
        furnitureId: sItem.furniture.id,
        defId: sItem.furniture.defId,
        exact: true
      });
    }
  } else if (room.defId === 'dormitory' || room.defId === 'grand_dormitory' || room.defId === 'faculty_quarters') {
    const bedItems = items.filter(
      it =>
        it.furniture.slotKind.includes('bed') ||
        FURNITURE_DEFINITIONS[it.furniture.defId]?.role === 'bed' ||
        FURNITURE_DEFINITIONS[it.furniture.defId]?.role === 'faculty_bed'
    );
    for (const it of bedItems) {
      const slots = it.furniture.defId === 'bunk_bed' ? 2 : 1;
      for (let s = 0; s < slots; s++) {
        const offset = slots === 2 ? (s === 0 ? -5 : 5) : 0;
        pushAnchor(beds, all, occ, room, 'bed', itemWorldX(it) + offset, it.floor, box, {
          furnitureId: it.furniture.id,
          defId: it.furniture.defId,
          exact: true,
          margin: 6
        });
      }
    }
    const wdItems = items
      .filter(it => it.furniture.defId === 'writing_desk' || it.furniture.slotKind === 'required:writing_desk')
      .slice(0, 2);
    for (const it of wdItems) {
      pushAnchor(writingDesks, all, occ, room, 'writing_desk', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        exact: true
      });
    }
    const extraSeats = items.filter(
      it =>
        isSeatDef(it.furniture.defId) &&
        it.furniture.defId !== 'writing_desk' &&
        !bedItems.some(b => b.furniture.id === it.furniture.id)
    );
    for (const it of extraSeats) {
      pushAnchor(seats, all, occ, room, 'seat', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        exact: true
      });
    }
  } else if (room.defId === 'infirmary') {
    const cotItems = items.filter(
      it => it.furniture.slotKind.includes('bed') || it.furniture.defId === 'infirmary_cot' || it.furniture.defId === 'simple_cot'
    );
    for (const it of cotItems) {
      pushAnchor(cots, all, occ, room, 'cot', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        exact: true
      });
    }
    const cabinet = items.find(it => it.furniture.defId === 'remedy_cabinet' || it.furniture.defId === 'healing_basin');
    pushAnchor(
      workSpots,
      all,
      occ,
      room,
      'work',
      cabinet ? besideBulkX(cabinet, box, bulkBoxes) : box.left + box.width * 0.25,
      cabinet?.floor ?? 0,
      box
    );
  } else if (room.defId === 'wizard_study') {
    const orbItem = items.find(
      it => it.furniture.defId === 'orb_stand' || it.furniture.defId === 'astral_orb' || it.furniture.slotKind === 'required:orb_stand'
    );
    if (orbItem) {
      pushAnchor(orbs, all, occ, room, 'orb', itemWorldX(orbItem), orbItem.floor, box, {
        furnitureId: orbItem.furniture.id,
        defId: orbItem.furniture.defId,
        exact: true,
        margin: minRoomMargin
      });
    }
    const lecternItem = items.find(it => it.furniture.defId === 'lectern' || it.furniture.slotKind === 'required:lectern');
    if (lecternItem) {
      pushAnchor(lecterns, all, occ, room, 'lectern', itemWorldX(lecternItem), lecternItem.floor, box, {
        furnitureId: lecternItem.furniture.id,
        defId: lecternItem.furniture.defId,
        exact: true,
        margin: minRoomMargin
      });
    }
    for (const sItem of items.filter(it => isSeatDef(it.furniture.defId))) {
      pushAnchor(seats, all, occ, room, 'seat', itemWorldX(sItem), sItem.floor, box, {
        furnitureId: sItem.furniture.id,
        defId: sItem.furniture.defId,
        exact: true,
        margin: minRoomMargin
      });
    }
  } else if (room.defId === 'common_room' || room.defId === 'faculty_lounge') {
    // Only actual seat pieces are seats (never stand/sit on globes, clocks, plants, or hearths)
    const seatItems = items.filter(it => isSeatDef(it.furniture.defId));
    for (const it of seatItems) {
      pushAnchor(seats, all, occ, room, 'seat', itemWorldX(it), it.floor, box, {
        furnitureId: it.furniture.id,
        defId: it.furniture.defId,
        exact: true
      });
    }
  } else {
    // Work / garden / pen / craft / sanctum / entrance rooms:
    // Seats from placed seat furniture; work spots beside/in front of active floor stations (never wall/ceiling/decor globes).
    for (const it of items) {
      const defId = it.furniture.defId;
      if (isSeatDef(defId)) {
        pushAnchor(seats, all, occ, room, 'seat', itemWorldX(it), it.floor, box, {
          furnitureId: it.furniture.id,
          defId,
          exact: true,
          margin: minRoomMargin
        });
      } else if (piecePlane(defId) === 'floor' && pieceKind(defId) === 'bulk' && !NON_INTERACTIVE_PROPS.has(defId)) {
        const spotX = defId === 'bookshelf' ? besideBulkX(it, box, bulkBoxes) : itemWorldX(it);
        pushAnchor(workSpots, all, occ, room, 'work', spotX, it.floor, box, {
          furnitureId: it.furniture.id,
          defId,
          margin: minRoomMargin
        });
      }
    }
    // Grounds plots (and entrance hall fallback): outdoor gardens/yards/hallways still have open walkable spots when unfurnished
    if (
      (room.area === 'grounds' || room.defId === 'entrance_hall' || room.defId === 'corridor' || room.defId === 'spiral_stair') &&
      workSpots.length + seats.length < 3
    ) {
      const desiredSpots = room.defId === 'entrance_hall' ? 2 : 3;
      for (const wx of spreadRowX(desiredSpots, box.left, box.width, minRoomMargin)) {
        if (workSpots.length + seats.length >= desiredSpots) break;
        const insideBulk = bulkBoxes.some(b => b.floor === 0 && wx >= b.left && wx <= b.right);
        if (insideBulk) continue;
        pushAnchor(workSpots, all, occ, room, 'work', wx, 0, box, { margin: minRoomMargin });
      }
    }
    for (const w of workSpots) seats.push(w);
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

/** Purely decorative bulk props that no one sits or stands on (globes, statues, plants, clocks). */
const NON_INTERACTIVE_PROPS = new Set([
  'orrery_globe',
  'globe_elsewhere',
  'potted_fern',
  'grandfather_clock',
  'familiar_statue',
  'garden_gnome',
  'bird_bath',
  'scarecrow',
  'stone_lantern',
  'windmill_charm',
  'rune_marker',
  'fairy_ring',
  'artifact_plinth',
  'supply_chest',
  'footlocker',
  'wardrobe',
  'creature_toybox',
  'fish_bowl',
  'radiant_lamp',
  'ward_lantern',
  'warm_hearthstone',
  'music_box',
  'hex_darts'
]);

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
