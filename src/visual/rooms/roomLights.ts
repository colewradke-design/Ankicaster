/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room light fixtures (5.5 Room visual audit).
 *
 * Rule: a glow is allowed only when a drawn fixture is under it (a window pane, a hearth, a lantern,
 * a brazier, a lit furniture piece) and that fixture belongs to the room. The quality skin never
 * plants a light. This module is the one list of fixtures per room: the room painter turns it into
 * `glow` emitters and the atmosphere turns it into night lights, so both always agree.
 *
 * The geometry helpers below are shared with the drawing code (roomArt.ts / roomTrims.ts): the pane
 * that is painted is the pane that glows. Pure functions; nothing here touches game state.
 */
import type { PlacedRoom } from '../../types/ankicaster';
import type { RoomWorldBox } from '../layout/gridToWorld';
import { CELL_H } from '../layout/gridToWorld';
import { layoutRoomFurniture, floorLineFor, NO_FURNITURE_ROOMS, getRoomLayout, PlacedFurnitureView } from '../layout/roomLayouts';
import { getFurnitureArt, furnitureBox, FurnitureArt } from './furnitureArt';
import { fillsRole, requiredSlotStatus } from '../../utils/requiredFurniture';
import type { RiftGateVisualState } from './riftGateArt';

type Box = RoomWorldBox;

export type LightKind = 'window' | 'fire' | 'lamp' | 'magic';

export interface Pane {
  x: number;
  y: number;
  w: number;
  h: number;
  shape: 'rect' | 'round' | 'arch' | 'fan';
}

export interface RoomLight {
  kind: LightKind;
  /** What is drawn under the glow (e.g. 'study_window', 'hearth', 'furniture:cooking_range'). */
  fixture: string;
  x: number;
  y: number;
  /** Day glow radius in art px: the size of the fixture, never bigger than a pane plus a halo. */
  radius: number;
  color: number;
  /** The lit glass for window lights (night lights fill this shape instead of a generic square). */
  pane?: Pane;
}

export interface RoomLightOpts {
  riftState?: RiftGateVisualState;
}

// ---------------------------------------------------------------------------------------------
// Shared fixture geometry (drawn by roomArt / roomTrims, lit here)
// ---------------------------------------------------------------------------------------------

const top = (b: Box) => b.top + 3;
const mid = (b: Box) => b.left + b.width / 2;
const right = (b: Box) => b.left + b.width;

/** Wizard's Study: high round window above the orb (L1-2), enlarged into the astral lancet at L3. */
export function studyWindowPane(b: Box, level: number): Pane {
  const cx = b.left + 30, cy = top(b) + 18;
  return level >= 3
    ? { x: cx - 6, y: cy - 11, w: 12, h: 22, shape: 'arch' }
    : { x: cx - 7, y: cy - 7, w: 14, h: 14, shape: 'round' };
}
/** Spiral Stair: the glass slit at the top of the shaft. */
export function stairSlitPane(b: Box): Pane {
  return { x: mid(b) - 2, y: top(b) + 6, w: 4, h: 10, shape: 'rect' };
}
/** Spiral Stair L2 cresset: an iron bracket on the visible left wall (flame sits on the cup). */
export function stairCressetPoint(b: Box) {
  return { x: b.left + 8, y: b.floorLineY - 24 };
}
/** Corridor: the one sconce under the arch. */
export function corridorSconcePoint(b: Box) {
  return { x: mid(b), y: top(b) + 16 };
}
/** Faculty Quarters: the shared hearth in the centre gap between the two beds. */
export function quartersHearthPoint(b: Box) {
  return { x: mid(b), y: b.floorLineY };
}
/** Faculty Quarters L3: a scholar's casement cut high into the right nook. */
export function quartersCasementPane(b: Box): Pane {
  return { x: right(b) - 30, y: top(b) + 6, w: 8, h: 11, shape: 'rect' };
}
/** Faculty Lounge: the arched window that is already painted (coloured and lit at L3). */
export function loungeArchPane(b: Box): Pane {
  return { x: right(b) - 20, y: top(b) + 4, w: 10, h: 24, shape: 'arch' };
}
/** Bathhouse L3: a high aqua clerestory oculus, softly lit. */
export function bathOculusPane(b: Box): Pane {
  return { x: b.left + 25, y: top(b) + 4, w: 10, h: 10, shape: 'round' };
}
/** Observatory: the opening roof slit in the dome; the only light in the room. */
export function observatorySlitPane(b: Box): Pane {
  return { x: mid(b) - 3, y: top(b), w: 6, h: 14, shape: 'rect' };
}
/** Scriptorium L3: narrow quill-crest window between the first two hanging scrolls. */
export function scriptoriumPane(b: Box): Pane {
  return { x: b.left + 24.5, y: top(b) + 4, w: 5, h: 14, shape: 'rect' };
}
/** Infirmary L3: a high frosted window between the curtains. */
export function infirmaryPane(b: Box): Pane {
  return { x: mid(b) - 5, y: top(b) + 11, w: 10, h: 13, shape: 'rect' };
}
/** Entrance Hall L3: rose oculus in the right bay (the banner keeps the left bay). */
export function entranceOculusPane(b: Box): Pane {
  return { x: mid(b) + 27, y: top(b) + 11, w: 14, h: 14, shape: 'round' };
}
/** Sunlit Sanctum: the oculus is the Sun Window's art (larger and gilded at L3). */
export function sanctumOculus(b: Box, level: number) {
  return { cx: mid(b), cy: top(b) + 1, rx: level >= 3 ? 15 : 12, ry: level >= 3 ? 4 : 3 };
}
/** Glassworks L3: spun prism fanlight (a half-round pane) high on the right wall. */
export function glassFanlightPane(b: Box): Pane {
  return { x: right(b) - 21, y: top(b) + 9, w: 14, h: 7, shape: 'fan' };
}
/** Alchemy Lab L3: narrow distillate pane between cauldron and rack (drawn, not lit). */
export function alchemyPane(b: Box): Pane {
  return { x: b.left + 58, y: top(b) + 10, w: 5, h: 14, shape: 'rect' };
}
/** Generic L3 stained lancet kept for the rooms still waiting on the furniture pass. */
export function lancetPane(b: Box): Pane {
  return { x: b.left + 11, y: top(b) + 5, w: 8, h: 11, shape: 'rect' };
}
/** Rooms that still take the generic L3 lancet (skipped by this audit until their slots change). */
export const GENERIC_LANCET_ROOMS = new Set([
  'class_arcane', 'class_nature', 'class_light', 'class_shadow', 'class_alchemy',
  'library', 'refectory', 'dormitory', 'grand_dormitory'
]);
/** Outdoor post lantern (drawn by roomTrims.postLantern): lit glass sits 16.5 px above the ground line. */
export function postLanternPoint(x: number, floorLineY: number) {
  return { x, y: floorLineY - 16.5 };
}
/** Where each outdoor room plants its single L3 post lantern (only rooms that draw a post). */
export const OUTDOOR_LANTERNS: Record<string, { dx: (b: Box) => number; color: number }> = {
  meadow_paddock: { dx: b => b.left + 4, color: 0xf6e08c },
  training_yard: { dx: b => b.left + 5, color: 0xf6e08c },
  pond: { dx: b => right(b) - 8, color: 0x9cd4ff },
  orchard: { dx: b => b.left + 4, color: 0xf5ce7a },
  courtyard_garden: { dx: b => b.left + 6, color: 0xfff6dc },
  woodlot: { dx: b => b.left + 5, color: 0xf6e08c }
};

// ---------------------------------------------------------------------------------------------
// Required fixtures whose art IS the room's dressing (one object, never drawn twice)
// ---------------------------------------------------------------------------------------------

/**
 * Required roles whose sprite is suppressed because the room dressing draws that object when the
 * piece is installed (the Rift Gate arch, the Tide Tank water, the Ember Pit coal bed, the Alchemy
 * Lab bottle racks, the Sunlit Sanctum oculus). Missing pieces still show their ghost slot.
 */
export const DRESSING_IS_ART: Record<string, string[]> = {
  rift_gate: ['gate_arch'],
  tide_tank: ['glass_tank'],
  ember_pit: ['brazier_nest'],
  alchemy_lab: ['ingredient_rack'],
  sunlit_sanctum: ['sun_window']
};

export type FixtureState = 'missing' | 'damaged' | 'ok';

/** Is the required role installed (and working) in this room? */
export function fixtureState(room: Pick<PlacedRoom, 'defId' | 'furniture'>, role: string): FixtureState {
  const slot = requiredSlotStatus(room).find(s => s.role === role && s.filled);
  if (!slot) return 'missing';
  return room.furniture[slot.furnitureIndex]?.damaged ? 'damaged' : 'ok';
}

/** Anchor x (art px from the room's left) of a required role, for dressing drawn as that piece. */
export function requiredAnchorX(room: Pick<PlacedRoom, 'defId' | 'w' | 'h'> & { furniture?: PlacedRoom['furniture'] }, role: string): number | undefined {
  if (room.furniture) {
    const slot = requiredSlotStatus(room as Pick<PlacedRoom, 'defId' | 'furniture'>).find(s => s.role === role && s.filled);
    if (slot) {
      const item = room.furniture[slot.furnitureIndex];
      if (item && typeof item.x === 'number') return item.x;
    }
  }
  return getRoomLayout(room.defId, room.w, room.h).required.find(a => a.role === role)?.x;
}

export function isDressingArt(defId: string, f: { defId: string; slotKind?: string }): boolean {
  const roles = DRESSING_IS_ART[defId];
  return !!roles && roles.some(r => fillsRole(f as Parameters<typeof fillsRole>[0], r));
}

// ---------------------------------------------------------------------------------------------
// Placed furniture positions (shared with roomArt.placeFurniture)
// ---------------------------------------------------------------------------------------------

export interface PlacedFurniturePoint {
  view: PlacedFurnitureView;
  art: FurnitureArt;
  /** Anchor point in world px (floor: bottom-centre; wall: centre; ceiling: top-centre). */
  x: number;
  y: number;
  /** Floor line (world px) of the floor the item stands on. */
  floorY: number;
}

export function placedFurniturePoints(room: PlacedRoom, box: Box): PlacedFurniturePoint[] {
  if (NO_FURNITURE_ROOMS.has(room.defId)) return [];
  const ceilingY = box.top + 3;
  return layoutRoomFurniture(room).items.map(view => {
    const art = getFurnitureArt(view.furniture.defId);
    const fl = floorLineFor(box.floorLineY, view.floor);
    const isSnappedChair = view.furniture.defId === 'wooden_chair' && typeof view.tableId === 'number';
    const isBackRow = isSnappedChair && typeof view.markIndex === 'number' && view.markIndex < 3;
    const x = Math.min(box.left + box.width - art.w / 2 - 2, Math.max(box.left + art.w / 2 + 2, box.left + view.x));
    const y =
      view.kind === 'floor'
        ? isBackRow
          ? fl - 2
          : fl
        : view.kind === 'wall'
          ? fl + (view.wallY ?? -26)
          : ceilingY + (room.h - 1 - view.floor) * CELL_H;
    return { view, art, x, y, floorY: fl };
  });
}

/** Furniture that carries its own light: where on the sprite the light sits (fractions of its box). */
const FURNITURE_LIGHTS: Record<string, { fx: number; fy: number; r: number; color: number; kind: LightKind }> = {
  hearth: { fx: 0.5, fy: 0.85, r: 8, color: 0xf07a5c, kind: 'fire' },
  phoenix_hearth: { fx: 0.5, fy: 0.85, r: 8, color: 0xf07a5c, kind: 'fire' },
  warm_hearthstone: { fx: 0.5, fy: 0.75, r: 6, color: 0xe8752a, kind: 'fire' },
  cooking_range: { fx: 0.5, fy: 0.62, r: 7, color: 0xf0a040, kind: 'fire' },
  kiln: { fx: 0.5, fy: 0.62, r: 8, color: 0xf07a5c, kind: 'fire' },
  everburning_athanor: { fx: 0.5, fy: 0.62, r: 10, color: 0xf07a5c, kind: 'fire' },
  brazier_nest: { fx: 0.5, fy: 0.3, r: 8, color: 0xf07a5c, kind: 'fire' },
  brewing_cauldron: { fx: 0.5, fy: 0.25, r: 7, color: 0x7db861, kind: 'magic' },
  bench_cauldron: { fx: 0.5, fy: 0.3, r: 6, color: 0x7db861, kind: 'magic' },
  stewpot: { fx: 0.5, fy: 0.3, r: 6, color: 0xf0a040, kind: 'fire' },
  glow_lantern: { fx: 0.5, fy: 0.7, r: 7, color: 0xf6e08c, kind: 'lamp' },
  radiant_lamp: { fx: 0.5, fy: 0.2, r: 8, color: 0xf6e08c, kind: 'lamp' },
  candle_sconce: { fx: 0.5, fy: 0.3, r: 5, color: 0xf6e08c, kind: 'lamp' },
  floating_candles: { fx: 0.5, fy: 0.6, r: 7, color: 0xf6e08c, kind: 'lamp' },
  halo_candles: { fx: 0.5, fy: 0.6, r: 7, color: 0xf7e39a, kind: 'lamp' },
  starfall_chandelier: { fx: 0.5, fy: 0.6, r: 8, color: 0xeef1f5, kind: 'lamp' },
  ward_lantern: { fx: 0.5, fy: 0.2, r: 6, color: 0x5fc2c2, kind: 'lamp' },
  stone_lantern: { fx: 0.5, fy: 0.3, r: 6, color: 0xf6e08c, kind: 'lamp' },
  glowcap_lamp: { fx: 0.5, fy: 0.5, r: 5, color: 0x5fc2c2, kind: 'magic' },
  nightglass: { fx: 0.5, fy: 0.5, r: 7, color: 0x9cb4ff, kind: 'magic' },
  ward_circle: { fx: 0.5, fy: 0.85, r: 8, color: 0x5fc2c2, kind: 'magic' },
  geode_bed: { fx: 0.5, fy: 0.4, r: 7, color: 0x9c86e0, kind: 'magic' },
  artifact_plinth: { fx: 0.5, fy: 0.1, r: 6, color: 0xf7e39a, kind: 'magic' }
};

export function furnitureLightSpec(defId: string) {
  return FURNITURE_LIGHTS[defId];
}

// ---------------------------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------------------------

function paneLight(fixture: string, p: Pane, color: number, soft = false): RoomLight {
  const r = Math.max(p.w, p.h) / 2 + (soft ? 1.5 : 3);
  return { kind: 'window', fixture, x: p.x + p.w / 2, y: p.y + p.h / 2, radius: r, color, pane: p };
}

/** Every light in a built room, each sitting on something that is drawn. World px. */
export function roomLights(room: PlacedRoom, box: Box, opts: RoomLightOpts = {}): RoomLight[] {
  const out: RoomLight[] = [];
  const level = room.level || 1;
  const L = box.left, W = box.width, B = box.floorLineY, T = top(box), R = L + W, cx = L + W / 2;

  switch (room.defId) {
    // --- audited indoor rooms ---
    case 'entrance_hall':
      if (level >= 3) out.push(paneLight('rose_oculus', entranceOculusPane(box), 0xffd27a));
      break;
    case 'wizard_study':
      out.push(paneLight(level >= 3 ? 'astral_lancet' : 'study_round_window', studyWindowPane(box, level), level >= 3 ? 0xc9b7ff : 0xffe2a0));
      break;
    case 'spiral_stair': {
      out.push(paneLight(level >= 3 ? 'glazed_slit' : 'stair_slit', stairSlitPane(box), level >= 3 ? 0xffd27a : 0xd8eef7, true));
      if (level >= 2) {
        const c = stairCressetPoint(box);
        out.push({ kind: 'fire', fixture: 'stair_cresset', x: c.x, y: c.y - 3, radius: 5, color: 0xf0a040 });
      }
      break;
    }
    case 'corridor': {
      const s = corridorSconcePoint(box);
      out.push({ kind: 'lamp', fixture: 'corridor_sconce', x: s.x, y: s.y - 2, radius: 5, color: 0xf6e08c });
      break;
    }
    case 'faculty_quarters': {
      const h = quartersHearthPoint(box);
      out.push({ kind: 'fire', fixture: 'quarters_hearth', x: h.x, y: h.y - 4, radius: 7, color: 0xf07a5c });
      if (level >= 3) out.push(paneLight('scholar_casement', quartersCasementPane(box), 0xffe2a0));
      break;
    }
    case 'faculty_lounge':
      if (level >= 3) out.push(paneLight('emerald_parlor_glass', loungeArchPane(box), 0xa8e6a0));
      break;
    case 'kitchen': {
      // The copper hood (L2+) is a warm vent over the range: lit only when the range is working
      const ax = requiredAnchorX(room, 'cooking_range');
      if (level >= 2 && ax !== undefined && fixtureState(room, 'cooking_range') === 'ok') {
        out.push({ kind: 'fire', fixture: 'range_hood_vent', x: L + ax, y: T + 10, radius: 5, color: 0xf0a040 });
      }
      break;
    }
    case 'bathhouse':
      if (level >= 3) out.push(paneLight('aqua_oculus', bathOculusPane(box), 0x9ce8e0, true));
      break;
    case 'observatory':
      out.push(paneLight('dome_slit', observatorySlitPane(box), 0xc9d8ff, true));
      break;
    case 'scriptorium':
      if (level >= 3) out.push(paneLight('quill_crest_glass', scriptoriumPane(box), 0xf2e2b0));
      break;
    case 'infirmary':
      if (level >= 3) out.push(paneLight('frosted_window', infirmaryPane(box), 0xfff6dc));
      break;
    case 'sunlit_sanctum':
      if (fixtureState(room, 'sun_window') === 'ok') {
        const o = sanctumOculus(box, level);
        out.push({
          kind: 'window', fixture: 'sun_window_oculus', x: o.cx, y: o.cy + 2, radius: o.rx, color: 0xfff6dc,
          pane: { x: o.cx - o.rx, y: o.cy - o.ry, w: o.rx * 2, h: o.ry * 2, shape: 'round' }
        });
      }
      break;
    case 'glassworks':
      if (level >= 3) out.push(paneLight('prism_fanlight', glassFanlightPane(box), 0xf7c08a));
      break;

    // --- rooms still waiting on the furniture pass: only their drawn fixtures light ---
    case 'dormitory':
      for (const x of [L + 24, R - 24]) out.push(paneLight('dorm_round_window', { x: x - 4.5, y: T + 5.5, w: 9, h: 9, shape: 'round' }, 0xffe2a0, true));
      break;
    case 'grand_dormitory':
      out.push({ kind: 'fire', fixture: 'central_stove', x: cx, y: B - 7, radius: 7, color: 0xf07a5c });
      break;
    case 'refectory':
      for (let x = L + 32; x < R - 24; x += 48) out.push({ kind: 'lamp', fixture: 'hanging_lantern', x, y: T + 8.5, radius: 5, color: 0xf6e08c });
      break;
    case 'class_nature':
      out.push(paneLight('bough_arch_window', { x: R - 18, y: T + 8, w: 10, h: 18, shape: 'arch' }, 0xbfe6a8, true));
      break;
    case 'class_light':
      out.push(paneLight('sun_round_window', { x: L + 8, y: T + 4, w: 12, h: 12, shape: 'round' }, 0xfff6dc));
      break;
    case 'class_shadow':
      for (const x of [L + 30, R - 30]) out.push({ kind: 'lamp', fixture: 'quiet_candle', x, y: B - 28, radius: 3, color: 0x5fc2c2 });
      break;

    // --- pens: only their own fire / fungus / crystal ---
    case 'ember_pit':
      if (fixtureState(room, 'brazier_nest') === 'ok') {
        out.push({ kind: 'fire', fixture: 'coal_bed', x: cx, y: B - 4, radius: level >= 3 ? 14 : 12, color: 0xd9472b });
      }
      break;
    case 'gloom_hutch':
      for (let i = 0; i < 5; i++) {
        out.push({ kind: 'magic', fixture: 'glow_mushroom', x: L + 8 + i * 11, y: B - 1 - (i % 2) * 2 - 3.5, radius: 4, color: 0x5fc2c2 });
      }
      break;
    case 'crystal_vivarium':
      if (level >= 3) out.push({ kind: 'magic', fixture: 'floating_geode', x: cx, y: T + 13, radius: 7, color: 0x9c86e0 });
      break;

    // --- grounds ---
    case 'standing_stones':
      out.push({ kind: 'magic', fixture: 'lit_monolith', x: L + 24, y: B - 20, radius: 6, color: 0x9bd4ff });
      break;
    case 'moonwell':
      out.push({ kind: 'magic', fixture: 'well_water', x: cx, y: B - 10, radius: 10, color: 0xd8d8f0 });
      break;
    case 'rift_gate':
      if (opts.riftState && opts.riftState !== 'dormant' && fixtureState(room, 'gate_arch') === 'ok') {
        out.push({ kind: 'magic', fixture: 'gate_portal', x: cx, y: B - 34, radius: 14, color: 0x7d5ba6 });
      }
      break;
  }

  // Generic L3 lancet for the skipped rooms (it is glass, so it may glow)
  if (level >= 3 && room.area === 'castle' && GENERIC_LANCET_ROOMS.has(room.defId)) {
    out.push(paneLight('stained_lancet', lancetPane(box), 0xffd27a));
  }

  // Outdoor L3 post lanterns (only on plots that draw the post)
  const lantern = OUTDOOR_LANTERNS[room.defId];
  if (lantern && level >= 3 && room.area === 'grounds') {
    const p = postLanternPoint(lantern.dx(box), B);
    out.push({ kind: 'lamp', fixture: 'post_lantern', x: p.x, y: p.y, radius: 5, color: lantern.color });
  }

  // Lit furniture the player placed (a damaged piece is dark)
  for (const pt of placedFurniturePoints(room, box)) {
    const f = pt.view.furniture;
    if (f.damaged) continue;
    if (isDressingArt(room.defId, f)) continue; // the dressing fixture above is its light
    const spec = FURNITURE_LIGHTS[f.defId];
    if (!spec) continue;
    const b = furnitureBox(pt.art, pt.x, pt.y);
    out.push({
      kind: spec.kind,
      fixture: `furniture:${f.defId}`,
      x: b.left + b.w * spec.fx,
      y: b.top + b.h * spec.fy,
      radius: spec.r,
      color: spec.color
    });
  }
  return out;
}
