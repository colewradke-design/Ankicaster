/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forge room art (Addendum 5.1, 5.2, 5.6, 12.2 and Appendix A.1).
 * A room is drawn back to front:
 *   1. Tier wall skin (Bare / Plain / Cozy / Fine / Splendid) from calculateRoomQuality, seeded per
 *      room so the masonry never shimmers between redraws, tinted by the room category (5.2).
 *   2. The room's dressing: signature props for every room id in ROOM_DEFINITIONS (A.1 "Look").
 *   3. Level trim: L2 moulding + crest, L3 gilded trim + finials (5.1 "upgrade levels").
 *   4. Furniture at its layout anchors (furnitureArt.ts), ghost outlines for missing required items.
 * Animated bits (torches, glows, animated furniture) are returned as emitters / animated items so the
 * ambient layer can loop them; under reduce motion they stay on frame 0. Never writes state.
 */
import { PlacedRoom, RoomDefinition } from '../../types/ankicaster';
import { ROOM_DEFINITIONS } from '../../data/content';
import { calculateRoomQuality } from '../../utils/formulas';
import { PALETTE } from '../sprites/forge/palettes';
import { Painter, hex, line, noise, mix, darken, flame, glyph } from './painter';
import { drawFurniture, getFurnitureArt, furnitureBox, drawGhostSlot } from './furnitureArt';
import { layoutRoomFurniture, floorLineFor, getRoomLayout, NO_FURNITURE_ROOMS } from '../layout/roomLayouts';
import { drawRoomUpgradeTrim, getRoomTrimTags } from './roomTrims';
import { drawRiftGateArch, RiftGateVisualState } from './riftGateArt';
import {
  roomLights, placedFurniturePoints, isDressingArt, DRESSING_IS_ART, fixtureState, requiredAnchorX,
  studyWindowPane, stairSlitPane, stairCressetPoint, corridorSconcePoint, quartersHearthPoint, loungeArchPane,
  observatorySlitPane, sanctumOculus
} from './roomLights';

export type Tier = 'bare' | 'plain' | 'cozy' | 'fine' | 'splendid';
export const TIERS: Tier[] = ['bare', 'plain', 'cozy', 'fine', 'splendid'];

/** All 7 creature pens: never draw wall torches, sconces, or open flames inside them (except Ember Pit's fire bed). */
export const CREATURE_PEN_IDS = new Set([
  'meadow_paddock',
  'tide_tank',
  'menagerie',
  'aviary',
  'gloom_hutch',
  'ember_pit',
  'crystal_vivarium'
]);

/** Crate-pile step for a Storage Vault: total common materials / (8 × storage cap). */
export function vaultFillStep(total: number, cap: number): 0 | 1 | 2 | 3 | 4 {
  const denom = 8 * (cap > 0 ? cap : 200);
  const f = denom > 0 ? total / denom : 0;
  if (f >= 1) return 4;
  if (f >= 0.75) return 3;
  if (f >= 0.5) return 2;
  if (f >= 0.25) return 1;
  return 0;
}

export interface Box { left: number; top: number; width: number; height: number; floorLineY: number }

export type EmitterKind = 'flame' | 'glow' | 'steam' | 'bubble' | 'twinkle' | 'mote' | 'ember' | 'leaf' | 'ripple' | 'portal' | 'sway' | 'candle' | 'hammer';
export interface Emitter { kind: EmitterKind; x: number; y: number; size?: number; color?: number; seed?: number }

export interface AnimatedItem { id: string; x: number; y: number; damaged: boolean; tint: number; glyphKind: string }

export interface RoomArtResult {
  tier: Tier;
  emitters: Emitter[];
  animated: AnimatedItem[];
  /** Damaged furniture boxes (world px) for the wrench badge (Section 5.5). */
  damaged: Array<{ x: number; y: number }>;
  /** Missing required slots (world px boxes) for the Unfinished ghosts. */
  missing: Array<{ left: number; top: number; w: number; h: number; role: string }>;
  /** True when the room id has its own dressing (A.1), not the generic category banner. */
  bespoke: boolean;
  /** Per-room upgrade trim tags applied at this room's level (Part B). */
  trimTags: string[];
}

export interface RoomArtOpts {
  robeColor?: string;
  hasLeftDoor?: boolean;
  hasRightDoor?: boolean;
  /** Force a tier (catalog test / screenshots); default = calculateRoomQuality(room). */
  tier?: Tier;
  /** Crop growth stage 0..3 (bell index modulo 4 until the engine has harvest timing). */
  cropStage?: number;
  /** Storage Vault pile step 0..4. Omit to draw a mid pile (callers with no resource state). */
  vaultFill?: number;
  /** Rift Gate visual state (used when defId === 'rift_gate'). */
  riftState?: RiftGateVisualState;
  riftDestId?: string;
  riftPhaseRad?: number;
  riftFlareAlpha?: number;
}

const STONE = PALETTE.stone.map(hex);
const PLASTER = PALETTE.plaster.map(hex);
const WOOD = PALETTE.wood.map(hex);
const GOLDS = PALETTE.gold.map(hex);
const GLASS = 0x9cd4ff;

/** Category tint (Addendum 5.2). Core rooms use the player's robe colour. */
export function roomTint(def: RoomDefinition | undefined, robeColor?: string): number {
  if (!def) return STONE[2];
  const school = (PALETTE.schools as Record<string, { ramp: string[] }>)[def.category];
  if (school) return hex(school.ramp[2]);
  switch (def.category) {
    case 'core': return robeColor ? hex(robeColor) : 0x6b4fbb;
    case 'living': return 0xd97a9a;
    case 'craft': return 0xb87333;
    case 'rift': return 0x7d5ba6;
    default: return 0x6ba34f;
  }
}

export function roomGlyph(def: RoomDefinition | undefined): string {
  if (!def) return 'shield';
  const school = (PALETTE.schools as Record<string, { glyph: string }>)[def.category];
  if (school) return school.glyph;
  return def.category === 'living' ? 'heart' : def.category === 'craft' ? 'hammer' : def.category === 'rift' ? 'rift' : 'shield';
}

export function roomTier(room: PlacedRoom): Tier {
  return calculateRoomQuality(room).tier;
}

/** Draw a full built room (skin, dressing, trim, static furniture); returns the animated parts. */
export function drawRoomInterior(g: Painter, room: PlacedRoom, box: Box, opts: RoomArtOpts = {}): RoomArtResult {
  const def = ROOM_DEFINITIONS[room.defId];
  const tier = opts.tier ?? roomTier(room);
  const tint = roomTint(def, opts.robeColor);
  const gk = roomGlyph(def);
  const res: RoomArtResult = { tier, emitters: [], animated: [], damaged: [], missing: [], bespoke: false, trimTags: [] };
  if (room.area === 'grounds') {
    res.bespoke = drawGroundsPlot(g, room, box, res.emitters, opts.cropStage ?? 3, opts);
    res.trimTags = drawRoomUpgradeTrim(g, room, box, tint, gk);
  } else {
    drawTierSkin(g, box, tier, tint, gk, room.id);
    res.bespoke = drawDressing(g, room, box, tint, gk, res.emitters, opts.cropStage ?? 3, opts.vaultFill);
    drawShell(g, room, box, tier, !!opts.hasLeftDoor, !!opts.hasRightDoor);
    res.trimTags = drawRoomUpgradeTrim(g, room, box, tint, gk);
  }
  placeFurniture(g, room, box, tint, gk, res, opts.cropStage ?? 3);
  // 5.5 audit: every glow sits on a drawn fixture of this room (window pane, hearth, lantern, lit piece)
  for (const l of roomLights(room, box, { riftState: opts.riftState })) {
    res.emitters.push({ kind: 'glow', x: l.x, y: l.y, size: l.radius, color: l.color });
  }
  if (tier === 'splendid') {
    let sparkles = 0;
    res.emitters = res.emitters.filter(e => e.kind !== 'twinkle' || ++sparkles <= 3);
  }
  return res;
}

function furnitureDrawLayer(pt: ReturnType<typeof placedFurniturePoints>[number]): number {
  const defId = pt.view.furniture.defId;
  if (defId === 'woven_rug') return 0; // flat floor background under standing furniture
  if (pt.view.kind === 'wall' || pt.view.kind === 'ceiling') return 1;
  if (defId === 'wooden_chair' && typeof pt.view.tableId === 'number') {
    return (pt.view.markIndex ?? 0) < 3 ? 2 : 4; // back row before long_table (3), front row after
  }
  return 3;
}

function placeFurniture(g: Painter, room: PlacedRoom, box: Box, tint: number, gk: string, res: RoomArtResult, cropStage = 3) {
  if (NO_FURNITURE_ROOMS.has(room.defId)) return;
  const view = layoutRoomFurniture(room);
  const ceilingY = box.top + 3;
  const points = [...placedFurniturePoints(room, box)].sort((a, b) => furnitureDrawLayer(a) - furnitureDrawLayer(b));
  for (const pt of points) {
    const it = pt.view;
    const { art, x, y } = pt;
    const damaged = !!it.furniture.damaged;
    if (isDressingArt(room.defId, it.furniture)) {
      // The dressing draws this piece (one object, never two); only the wrench badge comes from here
      if (damaged) {
        if (room.defId === 'rift_gate') res.damaged.push({ x: box.left + box.width / 2 + 26, y: box.floorLineY - 24 });
        else {
          const b = furnitureBox(art, x, y);
          res.damaged.push({ x: b.left + b.w, y: b.top });
        }
      }
      continue;
    }
    if (art.animated && !damaged) {
      res.animated.push({ id: it.furniture.defId, x, y, damaged, tint, glyphKind: gk });
    } else {
      drawFurniture(g, it.furniture.defId, x, y, { damaged, tint, glyphKind: gk });
    }
    if (damaged) {
      const b = furnitureBox(art, x, y);
      res.damaged.push({ x: b.left + b.w, y: b.top });
    }
    drawPieceEffects(g, room, box, it.furniture.defId, x, y, art, damaged, res.emitters, cropStage);
  }
  for (const m of view.missing) {
    if (DRESSING_IS_ART[room.defId]?.includes(m.role!) && m.kind === 'wall' && room.defId === 'sunlit_sanctum') {
      // The Sun Window is the oculus in the ceiling: its ghost sits where the oculus will open
      const o = sanctumOculus(box, room.level || 1);
      const b = { left: o.cx - 8, top: ceilingY + 1, w: 16, h: 8 };
      drawGhostSlot(g, b);
      res.missing.push({ ...b, role: m.role! });
      continue;
    }
    const art = getFurnitureArt(m.role!);
    const fl = box.floorLineY;
    const x = box.left + m.x;
    const y = art.anchor === 'floor' ? fl : art.anchor === 'wall' ? fl - 26 : ceilingY;
    const b = furnitureBox(art, x, y);
    drawGhostSlot(g, b);
    res.missing.push({ ...b, role: m.role! });
  }
}

/**
 * Effects that belong to a placed piece, drawn on that piece only (5.5 audit): bath steam rises from
 * the tub, cauldron bubbles from the cauldron, a plinth is lit only when it holds an artifact, and
 * greenhouse crops grow in the planter beds the player placed (no painted second set of beds).
 */
function drawPieceEffects(
  g: Painter,
  room: PlacedRoom,
  box: Box,
  defId: string,
  x: number,
  y: number,
  art: ReturnType<typeof getFurnitureArt>,
  damaged: boolean,
  em: Emitter[],
  cropStage: number
) {
  if (damaged) return;
  const b = furnitureBox(art, x, y);
  switch (defId) {
    case 'soaking_tub':
      em.push({ kind: 'steam', x: x - 6, y: b.top + 2 });
      em.push({ kind: 'steam', x: x + 7, y: b.top + 2 });
      break;
    case 'brewing_cauldron':
    case 'bench_cauldron':
      if (room.defId === 'alchemy_lab') em.push({ kind: 'bubble', x, y: b.top + 2, color: 0x7db861 });
      break;
    case 'artifact_plinth':
      if (room.defId === 'trophy_hall') {
        g.poly([x - 2, box.top + 3, x + 2, box.top + 3, x + 7, b.top + 2, x - 7, b.top + 2]).fill({ color: 0xfff6dc, alpha: 0.18 });
        em.push({ kind: 'twinkle', x, y: b.top + 1, color: 0xf7e39a });
      }
      break;
    case 'planter_bed':
      if (room.defId === 'greenhouse') {
        const cs = Math.max(0, Math.min(3, cropStage));
        if (cs >= 2) {
          for (let i = 0; i < 4; i++) {
            const px = b.left + 6 + i * ((b.w - 12) / 3);
            g.circle(px, b.top + b.h - 11, 0.8 + (cs - 2) * 0.5).fill({ color: cs === 3 ? 0xd9472b : 0xf6f1e8 });
          }
        }
      }
      break;
  }
}

// ---------------------------------------------------------------------------------------------
// 1. Tier wall skins (Addendum 5.1)
// ---------------------------------------------------------------------------------------------

/**
 * Quality skin: wall material, colour and floor only (5.5 room visual audit). It never plants a
 * light: no torches, sconces, lamps, candles or glow discs, in any room or pen. A Cozy or Fine room
 * looks warmer through its walls; every glow in a room comes from a fixture in roomLights.ts.
 * `_em` is kept so construction-site callers can share the signature; the skin never pushes to it.
 */
export function drawTierSkin(
  g: Painter,
  box: Box,
  tier: Tier,
  tint: number,
  gk: string,
  seed: number,
  _em?: Emitter[]
) {
  const L = box.left, T = box.top + 3, W = box.width, B = box.floorLineY;
  const H = B - T;
  switch (tier) {
    case 'bare': {
      g.rect(L, T, W, H).fill({ color: 0x4b4a52 });
      // rough stone blocks, staggered, seeded shade
      let row = 0;
      for (let y = T; y < B; y += 8, row++) {
        const off = row % 2 ? 8 : 0;
        for (let x = L - off; x < L + W; x += 16) {
          const n = noise(seed, row * 64 + Math.round(x));
          const c = mix(0x4b4a52, n > 0.5 ? 0x5e5d66 : 0x3b3a40, Math.abs(n - 0.5));
          const x0 = Math.max(L, x + 0.5), x1 = Math.min(L + W, x + 15.5);
          if (x1 > x0) g.rect(x0, y + 0.5, x1 - x0, Math.min(7, B - y - 0.5)).fill({ color: c });
        }
      }
      // crack + cobweb
      const cx = L + 10 + noise(seed, 7) * (W - 20);
      line(g, cx, T + 4, cx + 3, T + 11, 0x252429, 1);
      line(g, cx + 3, T + 11, cx + 1, T + 17, 0x252429, 1);
      line(g, L + 2, T, L + 10, T, 0xd8d8d8, 0.5);
      line(g, L + 2, T, L + 2, T + 8, 0xd8d8d8, 0.5);
      line(g, L + 2, T + 6, L + 7, T, 0xd8d8d8, 0.5);
      line(g, L + 2, T + 3, L + 4, T, 0xd8d8d8, 0.4);
      floorSlab(g, box, 0x36353b, 'flag', seed);
      break;
    }
    case 'plain': {
      g.rect(L, T, W, H).fill({ color: PLASTER[1] });
      for (let i = 0; i < 3; i++) {
        const px = L + 6 + noise(seed, i) * (W - 18), py = T + 4 + noise(seed, i + 9) * (H - 20);
        g.rect(px, py, 6 + noise(seed, i + 3) * 6, 4).fill({ color: PLASTER[0], alpha: 0.35 });
      }
      // stone base course
      for (let x = L, i = 0; x < L + W; x += 12, i++) {
        g.rect(x + 0.5, B - 8, Math.min(11, L + W - x - 0.5), 7.5).fill({ color: noise(seed, 40 + i) > 0.5 ? STONE[2] : mix(STONE[2], STONE[1], 0.3) });
      }
      g.rect(L, B - 9, W, 1).fill({ color: STONE[1] });
      floorSlab(g, box, STONE[1], 'flag', seed);
      break;
    }
    case 'cozy': {
      g.rect(L, T, W, H).fill({ color: PLASTER[2] });
      const stain = mix(WOOD[2], tint, 0.25);
      g.rect(L, B - 14, W, 14).fill({ color: stain });
      for (let x = L + 6; x < L + W; x += 8) g.rect(x, B - 13, 0.75, 12).fill({ color: darken(stain, 0.8) });
      g.rect(L, B - 15, W, 2).fill({ color: WOOD[1] }); // ledge
      // potted plant on the ledge
      const px = L + 8 + noise(seed, 3) * (W - 24);
      g.rect(px - 2, B - 19, 4, 4).fill({ color: 0xb5651d });
      g.ellipse(px, B - 20.5, 3, 2.2).fill({ color: 0x6ba34f });
      floorSlab(g, box, WOOD[3], 'plank', seed);
      // small tinted rug
      g.rect(L + W / 2 - Math.min(20, W / 4), B - 1, Math.min(40, W / 2), 1.5).fill({ color: tint });
      break;
    }
    case 'fine': {
      g.rect(L, T, W, H).fill({ color: WOOD[2] });
      const railY = T + Math.round(H * 0.33);
      for (let x = L + 3; x < L + W - 6; x += 16) {
        g.rect(x, railY + 3, 12, B - railY - 7).fill({ color: WOOD[1] });
        g.rect(x + 1, railY + 4, 10, B - railY - 9).fill({ color: mix(WOOD[2], WOOD[1], 0.4) });
      }
      g.rect(L, railY, W, 2).fill({ color: WOOD[0] }); // picture rail
      // category banner with glyph (left of the room label)
      const bx = L + 10;
      g.rect(bx - 6, T + 1, 12, 1.5).fill({ color: WOOD[0] });
      g.poly([bx - 5, T + 2, bx + 5, T + 2, bx + 5, T + 13, bx, T + 16, bx - 5, T + 13]).fill({ color: tint });
      glyph(g, gk, bx, T + 8, 3, GOLDS[3]);
      floorSlab(g, box, WOOD[0], 'plank', seed);
      g.rect(L + 6, B - 1, W - 12, 1.5).fill({ color: tint }); // runner
      g.rect(L + 6, B - 1, W - 12, 0.5).fill({ color: GOLDS[2] });
      break;
    }
    case 'splendid': {
      g.rect(L, T, W, H).fill({ color: mix(WOOD[2], WOOD[1], 0.3) });
      // arched niches with tinted glass
      const n = Math.max(1, Math.round(W / 48));
      for (let i = 0; i < n; i++) {
        const nx = L + ((i + 0.5) * W) / n;
        g.rect(nx - 6, T + 9, 12, H - 22).fill({ color: GOLDS[0] });
        g.ellipse(nx, T + 9, 6, 5).fill({ color: GOLDS[0] });
        g.rect(nx - 4.5, T + 9, 9, H - 23).fill({ color: mix(tint, 0xffffff, 0.25), alpha: 0.9 });
        g.ellipse(nx, T + 9, 4.5, 3.8).fill({ color: mix(tint, 0xffffff, 0.45), alpha: 0.9 });
        line(g, nx, T + 6, nx, T + H - 14, GOLDS[1], 0.75);
      }
      // gilded trim
      g.rect(L, T, W, 2).fill({ color: GOLDS[2] });
      g.rect(L, B - 10, W, 1.5).fill({ color: GOLDS[2] });
      g.rect(L, B - 9, W, 9).fill({ color: WOOD[1] });
      for (let x = L + 4; x < L + W - 2; x += 10) g.rect(x, B - 7, 6, 5).stroke({ color: GOLDS[1], width: 0.5 });
      floorSlab(g, box, GOLDS[0], 'parquet', seed);
      // inlaid crest in the floor runner
      g.rect(L + 4, B - 1, W - 8, 1.5).fill({ color: tint });
      glyph(g, gk, L + W / 2, B - 20, 3.5, GOLDS[3]);
      break;
    }
  }
}

function floorSlab(g: Painter, box: Box, color: number, style: 'flag' | 'plank' | 'parquet', seed: number) {
  const L = box.left, W = box.width, y = box.floorLineY;
  g.rect(L, y, W, 4).fill({ color });
  if (style === 'flag') {
    for (let x = L + 10, i = 0; x < L + W; x += 10 + Math.round(noise(seed, 90 + i++) * 8)) g.rect(x, y, 0.75, 4).fill({ color: darken(color, 0.7) });
  } else if (style === 'plank') {
    g.rect(L, y + 2, W, 0.5).fill({ color: darken(color, 0.75) });
    for (let x = L + 14, i = 0; x < L + W; x += 22, i++) g.rect(x + (i % 2) * 8, y, 0.75, 4).fill({ color: darken(color, 0.75) });
  } else {
    for (let x = L, i = 0; x < L + W; x += 4, i++) g.rect(x, y + (i % 2) * 2, 4, 2).fill({ color: i % 2 ? GOLDS[1] : color });
  }
  g.rect(L, y, W, 0.75).fill({ color: mix(color, 0xffffff, 0.25) });
}

function sconce(g: Painter, x: number, y: number, em: Emitter[]) {
  g.rect(x - 2, y + 2, 4, 1.5).fill({ color: GOLDS[1] });
  g.rect(x - 0.75, y - 1, 1.5, 3).fill({ color: 0xf6f1e8 });
  em.push({ kind: 'flame', x, y: y - 1, size: 0.5 });
}

/** Outer cutaway walls, ceiling beam and doorways (kept from V1, tier border colours). */
function drawShell(g: Painter, room: PlacedRoom, box: Box, tier: Tier, left: boolean, right: boolean) {
  const border = hex((PALETTE.tierColors[tier] || PALETTE.tierColors.bare).border);
  g.rect(box.left, box.top, box.width, 3).fill({ color: 0x2a2533 });
  const doorH = 30;
  g.rect(box.left, box.top, 2, left ? box.height - doorH : box.height).fill({ color: border });
  g.rect(box.left + box.width - 2, box.top, 2, right ? box.height - doorH : box.height).fill({ color: border });
  const layout = getRoomLayout(room.defId, room.w, room.h);
  if (layout.mezzanine) {
    for (let f = 1; f < room.h; f++) {
      const y = floorLineFor(box.floorLineY, f);
      // mezzanine slab with a stair gap on the left (agents use the room's internal stair)
      g.rect(box.left + 18, y, box.width - 18, 4).fill({ color: 0x5e5d66 });
      g.rect(box.left + 18, y, box.width - 18, 0.75).fill({ color: 0x8a8994 });
    }
  }
}

/** Level trims (Part B: delegates to per-room-type upgrade trims when defId is supplied). */
export function drawLevelTrim(g: Painter, box: Box, level: number, tint: number, gk: string, defId?: string) {
  if (level < 2) return;
  if (defId) {
    const def = ROOM_DEFINITIONS[defId];
    drawRoomUpgradeTrim(
      g,
      {
        id: 0,
        defId,
        x: 0,
        y: 0,
        w: Math.max(1, Math.round(box.width / 64)),
        h: Math.max(1, Math.round(box.height / 48)),
        area: (def?.area as 'castle' | 'grounds') || 'castle',
        level: Math.min(3, Math.max(1, level)) as 1 | 2 | 3,
        state: 'built',
        buildRequired: 0,
        buildProgress: 0,
        cleanliness: 100,
        settings: {},
        furniture: []
      },
      box,
      tint,
      gk
    );
    return;
  }
  const L = box.left, T = box.top + 3, W = box.width;
  const c = level >= 3 ? GOLDS[2] : STONE[3];
  g.rect(L + 2, T, W - 4, 1.5).fill({ color: c });
  for (let x = L + 6; x < L + W - 4; x += 8) g.rect(x, T + 1.5, 2, 1.5).fill({ color: darken(c, 0.8) });
  const cx = L + W - 9, cy = T + 7;
  g.poly([cx - 4, cy - 4, cx + 4, cy - 4, cx + 4, cy + 1, cx, cy + 5, cx - 4, cy + 1]).fill({ color: level >= 3 ? GOLDS[1] : STONE[2] });
  glyph(g, gk, cx, cy, 2.2, level >= 3 ? GOLDS[3] : tint);
}
export { getRoomTrimTags };

// ---------------------------------------------------------------------------------------------
// 2. Dressings (Appendix A.1 "Look"), one per room id
// ---------------------------------------------------------------------------------------------

function win(g: Painter, x: number, y: number, w: number, h: number, frame = 0x5e5d66, glass = GLASS) {
  g.rect(x - 1, y - 1, w + 2, h + 2).fill({ color: frame });
  g.rect(x, y, w, h).fill({ color: glass });
  line(g, x + w / 2, y, x + w / 2, y + h, frame, 0.75);
  g.rect(x + 1, y + 1, w * 0.3, h * 0.3).fill({ color: 0xffffff, alpha: 0.35 });
}
function roundWin(g: Painter, x: number, y: number, r: number, frame = 0xd9a07a) {
  g.circle(x, y, r + 1.5).fill({ color: frame });
  g.circle(x, y, r).fill({ color: GLASS });
  line(g, x - r, y, x + r, y, frame, 0.75);
  line(g, x, y - r, x, y + r, frame, 0.75);
}
function archWin(g: Painter, x: number, y: number, w: number, h: number, glass = GLASS) {
  g.rect(x - 1, y + w / 2 - 1, w + 2, h - w / 2 + 2).fill({ color: 0x5e5d66 });
  g.ellipse(x + w / 2, y + w / 2, w / 2 + 1, w / 2 + 1).fill({ color: 0x5e5d66 });
  g.rect(x, y + w / 2, w, h - w / 2).fill({ color: glass });
  g.ellipse(x + w / 2, y + w / 2, w / 2, w / 2).fill({ color: glass });
}
function wallShelf(g: Painter, x: number, y: number, w: number, rows: number, seed: number) {
  g.rect(x, y, w, rows * 7 + 1).fill({ color: WOOD[1] });
  for (let r = 0; r < rows; r++) {
    for (let bx = x + 1, i = 0; bx < x + w - 2; bx += 2.5, i++) {
      const hh = 4 + noise(seed, r * 40 + i) * 2;
      g.rect(bx, y + r * 7 + 7 - hh, 2, hh).fill({ color: [0xb8402a, 0x4b3796, 0x3a6b2c, 0xc4a233, 0x2e8b8b][(i + r) % 5] });
    }
    g.rect(x, y + r * 7 + 7, w, 1).fill({ color: WOOD[0] });
  }
}
function hangLantern(g: Painter, x: number, top: number, _em: Emitter[], len = 6, glow = 0xf6e08c) {
  line(g, x, top, x, top + len, 0x3b3a40, 0.75);
  g.rect(x - 2, top + len, 4, 5).fill({ color: 0x3b3a40 });
  g.rect(x - 1.2, top + len + 1, 2.4, 3).fill({ color: glow });
}
function drapes(g: Painter, x: number, y: number, w: number, h: number, color: number) {
  g.rect(x, y, w, 1.5).fill({ color: 0x3b3a40 });
  g.poly([x, y + 1, x + w * 0.4, y + 1, x + w * 0.2, y + h, x, y + h]).fill({ color });
  g.poly([x + w * 0.6, y + 1, x + w, y + 1, x + w, y + h, x + w * 0.8, y + h]).fill({ color });
}
function chalkboard(g: Painter, x: number, y: number, w: number, h: number, board: number, chalk: number, gk?: string) {
  g.rect(x - 1, y - 1, w + 2, h + 2).fill({ color: WOOD[1] });
  g.rect(x, y, w, h).fill({ color: board });
  if (gk) glyph(g, gk, x + 6, y + h / 2, 3, chalk);
  line(g, x + 12, y + 3, x + w - 3, y + 3, chalk, 0.6);
  line(g, x + 12, y + 6, x + w - 8, y + 6, chalk, 0.6);
  g.rect(x, y + h + 1, w, 1).fill({ color: WOOD[0] });
}
function vines(g: Painter, x0: number, x1: number, y: number, color: number, seed: number) {
  line(g, x0, y, x1, y, darken(color, 0.7), 0.75);
  for (let x = x0, i = 0; x < x1; x += 4, i++) {
    const d = 3 + noise(seed, i) * 9;
    line(g, x, y, x + 1, y + d, darken(color, 0.8), 0.6);
    g.ellipse(x + 1, y + d, 1.4, 1).fill({ color });
  }
}
function pipes(g: Painter, x0: number, x1: number, y: number) {
  g.rect(x0, y, x1 - x0, 2).fill({ color: 0xb5651d });
  for (let x = x0 + 8; x < x1; x += 18) {
    g.rect(x, y, 2, 8).fill({ color: 0xb5651d });
    g.circle(x + 1, y + 1, 1.5).fill({ color: 0xdb8c46 });
  }
}
function tiles(g: Painter, L: number, T: number, W: number, H: number, color: number) {
  g.rect(L, T, W, H).fill({ color });
  for (let x = L; x < L + W; x += 6) g.rect(x, T, 0.5, H).fill({ color: mix(color, 0xffffff, 0.35) });
  for (let y = T; y < T + H; y += 6) g.rect(L, y, W, 0.5).fill({ color: mix(color, 0xffffff, 0.35) });
}

export function drawDressing(g: Painter, room: PlacedRoom, box: Box, tint: number, gk: string, em: Emitter[], cropStage = 3, vaultFill?: number): boolean {
  const L = box.left, T = box.top + 3, W = box.width, B = box.floorLineY, R = L + W, cx = L + W / 2;
  const s = room.id;
  switch (room.defId) {
    case 'entrance_hall': {
      // vaulted ribs + crest banner with the sigil (robe colour)
      for (let x = L + 16; x < R; x += 32) line(g, x, T, x + 16, T + 8, STONE[1], 1);
      const bx = cx - 30;
      g.rect(bx - 7, T + 2, 14, 1.5).fill({ color: WOOD[0] });
      g.poly([bx - 6, T + 3, bx + 6, T + 3, bx + 6, T + 18, bx, T + 22, bx - 6, T + 18]).fill({ color: tint });
      glyph(g, 'star8', bx, T + 11, 3.5, GOLDS[3]);
      break;
    }
    case 'wizard_study': {
      // internal spiral stair on the left, bookshelves, and one high round window above the orb
      // stand: the room's only light (L3 trim enlarges it into the astral lancet in the same place)
      for (let y = T + 4; y < B; y += 7) {
        g.rect(L + 3, y, 13, 2.5).fill({ color: STONE[3] });
        g.circle(L + 9.5, y + 1, 1.5).fill({ color: STONE[0] });
      }
      wallShelf(g, R - 22, T + 6, 18, 3, s);
      if ((room.level || 1) < 3) {
        const p = studyWindowPane(box, room.level || 1);
        roundWin(g, p.x + p.w / 2, p.y + p.h / 2, p.w / 2);
      }
      break;
    }
    case 'spiral_stair': {
      // the glass slit is the stair's light (no torch at L1; L2 adds one cresset, L3 glazes the slit)
      const p = stairSlitPane(box);
      g.rect(p.x, p.y, p.w, p.h).fill({ color: GLASS });
      for (let y = T + 18; y < B; y += 6) {
        g.rect(L + 14, y, W - 28, 2.5).fill({ color: STONE[3] });
        g.circle(cx, y + 1, 2).fill({ color: STONE[0] });
      }
      g.rect(cx - 1, T, 2, B - T).fill({ color: STONE[1], alpha: 0.6 });
      if ((room.level || 1) >= 2) {
        const cp = stairCressetPoint(box);
        em.push({ kind: 'flame', x: cp.x, y: cp.y - 1, size: 0.7 });
      }
      break;
    }
    case 'corridor': {
      g.ellipse(cx, T, W / 2 - 2, 7).stroke({ color: STONE[1], width: 1.5 });
      const sp = corridorSconcePoint(box);
      sconce(g, sp.x, sp.y, em);
      break;
    }
    case 'support_pillar': {
      g.rect(cx - 12, T, 24, B - T).fill({ color: STONE[2] });
      for (let y = T + 6; y < B; y += 8) g.rect(cx - 12, y, 24, 0.75).fill({ color: STONE[1] });
      g.rect(cx - 16, T, 32, 5).fill({ color: STONE[3] }); // carved capital
      g.rect(cx - 14, T + 5, 28, 2).fill({ color: STONE[2] });
      g.rect(cx - 15, B - 4, 30, 4).fill({ color: STONE[3] });
      break;
    }
    case 'storage_vault': {
      g.ellipse(cx, T + 2, W / 2, 10).stroke({ color: STONE[1], width: 2 });
      // Shelf slot owns the centre; optional crates sit on the open floor; fill steps tuck along
      // the far-left wall when that slot is clear (no painted ledger desk over the right slot).
      if (room.furniture.length <= 1) {
        const step = vaultFill === undefined ? 2 : Math.max(0, Math.min(4, Math.floor(vaultFill)));
        for (let i = 0; i < step; i++) {
          const y = B - 5 - i * 5;
          const x = L + 3 + (i % 2) * 2;
          if (i % 2 === 0) g.ellipse(x + 3.5, y + 2.5, 4, 2.5).fill({ color: 0xc9b88a });
          else {
            g.rect(x, y, 8, 5).fill({ color: WOOD[2] });
            line(g, x, y, x + 8, y + 5, WOOD[0], 0.6);
          }
        }
      }
      break;
    }
    case 'dormitory': {
      roundWin(g, L + 24, T + 10, 4.5, 0x96633b);
      roundWin(g, R - 24, T + 10, 4.5, 0x96633b);
      for (const x of [L + 4, cx - 2, R - 8]) g.rect(x, T + 18, 4, B - T - 18).fill({ color: WOOD[1], alpha: 0.5 }); // alcove posts
      break;
    }
    case 'grand_dormitory': {
      for (let x = L + 28; x < R - 10; x += 48) drapes(g, x, T + 2, 18, B - T - 8, 0xd97a9a);
      // central stove
      g.rect(cx - 6, B - 14, 12, 14).fill({ color: 0x3b3a40 });
      g.rect(cx - 1.5, T, 3, B - T - 14).fill({ color: 0x3b3a40 });
      g.rect(cx - 3, B - 9, 6, 4).fill({ color: 0xe8752a });
      em.push({ kind: 'ember', x: cx, y: B - 7, color: 0xe8752a });
      break;
    }
    case 'faculty_quarters': {
      // bookcase partition between two nooks, shared hearth in the centre gap (floor clear for beds + desk)
      wallShelf(g, cx - 5, T + 4, 10, 4, s);
      const hp = quartersHearthPoint(box);
      g.rect(hp.x - 6, hp.y - 10, 12, 10).fill({ color: STONE[2] });
      g.rect(hp.x - 3, hp.y - 6, 6, 6).fill({ color: 0x1b1822 });
      em.push({ kind: 'flame', x: hp.x, y: hp.y, size: 0.8 });
      break;
    }
    case 'faculty_lounge': {
      // the arch is already there: colour and light it at L3; steam belongs only to a placed tea service
      const p = loungeArchPane(box);
      const l3 = (room.level || 1) >= 3;
      archWin(g, p.x, p.y, p.w, p.h, l3 ? 0x8be09e : GLASS);
      if (l3) {
        line(g, p.x + p.w / 2, p.y + 1, p.x + p.w / 2, p.y + p.h, GOLDS[2], 0.75);
        line(g, p.x, p.y + p.h * 0.55, p.x + p.w, p.y + p.h * 0.55, GOLDS[2], 0.75);
      }
      for (const [x, c] of [[L + 10, 0x6b4fbb], [L + 26, 0x4e8b3a]] as Array<[number, number]>) {
        g.rect(x - 4, T + 6, 9, 11).fill({ color: GOLDS[1] });
        g.rect(x - 3, T + 7, 7, 9).fill({ color: c });
        g.circle(x + 0.5, T + 10, 1.5).fill({ color: 0xedc0a0 });
      }
      break;
    }
    case 'refectory': {
      // serving hatch towards the kitchen side + hanging lanterns
      g.rect(R - 20, B - 24, 14, 10).fill({ color: 0x1b1822 });
      g.rect(R - 21, B - 15, 16, 2).fill({ color: WOOD[1] });
      for (let x = L + 32; x < R - 24; x += 48) hangLantern(g, x, T, em);
      break;
    }
    case 'kitchen': {
      // pots and herbs on the ceiling; floor stays clear for the Cooking Range (no chopping block or orphan steam)
      for (let i = 0; i < 3; i++) {
        const x = L + 18 + i * 8;
        line(g, x, T, x, T + 5, 0x3b3a40, 0.6);
        g.ellipse(x, T + 7, 3, 2).fill({ color: 0x5e5d66 });
      }
      for (let i = 0; i < 2; i++) {
        line(g, R - 10 - i * 5, T, R - 10 - i * 5, T + 4, 0x6e4529, 0.6);
        g.ellipse(R - 10 - i * 5, T + 7, 1.5, 3).fill({ color: 0x6ba34f });
      }
      break;
    }
    case 'common_room': {
      // notice board on the right; hearth is placed furniture when chosen, never painted over a couch
      g.rect(R - 26, T + 5, 16, 12).fill({ color: WOOD[2] });
      for (let i = 0; i < 3; i++) g.rect(R - 24 + i * 5, T + 7 + (i % 2) * 3, 4, 4).fill({ color: [0xf6f1e8, 0xf5ce7a, 0x9cd4ff][i] });
      break;
    }
    case 'bathhouse': {
      // aqua wall tiles and towels on pegs; steam rises only from the placed Soaking Tub
      tiles(g, L + 2, B - 18, W - 4, 18, 0x3a6b2c);
      for (const x of [L + 8, R - 12]) { g.rect(x, T + 8, 6, 1).fill({ color: WOOD[1] }); g.rect(x + 1, T + 9, 4, 8).fill({ color: 0xf6f1e8 }); }
      break;
    }
    case 'class_arcane':
      chalkboard(g, cx - 18, T + 4, 36, 14, 0x2e2160, 0xc9b7ff, gk);
      for (const x of [L + 8, R - 14]) { g.rect(x, T + 6, 8, 8).fill({ color: 0x1b1430 }); g.circle(x + 3, T + 9, 0.8).fill({ color: 0xffffff }); g.circle(x + 6, T + 11, 0.6).fill({ color: 0xffffff }); }
      em.push({ kind: 'twinkle', x: cx - 12, y: T + 11, color: 0xc9b7ff });
      break;
    case 'class_nature':
      vines(g, L + 2, R - 2, T + 1, 0x6ba34f, s);
      archWin(g, R - 18, T + 8, 10, 18, 0xbfe6a8);
      em.push({ kind: 'leaf', x: cx, y: T + 6, color: 0x6ba34f });
      break;
    case 'class_light':
      g.rect(L, T, W, 2).fill({ color: GOLDS[2] });
      roundWin(g, L + 14, T + 10, 6, GOLDS[2]);
      g.poly([L + 10, T + 14, L + 18, T + 14, L + 44, B, L + 26, B]).fill({ color: 0xfff6dc, alpha: 0.25 });
      em.push({ kind: 'mote', x: L + 26, y: B - 16 });
      break;
    case 'class_shadow':
      drapes(g, L + 4, T + 1, 22, B - T - 6, 0x222b57);
      drapes(g, R - 26, T + 1, 22, B - T - 6, 0x222b57);
      g.poly([cx - 3, T + 9, cx + 3, T + 9, cx + 2, T + 4, cx - 2, T + 4]).fill({ color: STONE[3] }); // quiet bell
      line(g, cx, T, cx, T + 4, STONE[1], 0.6);
      for (const x of [L + 30, R - 30]) { g.rect(x - 1, B - 26, 2, 4).fill({ color: 0xe3dbce }); em.push({ kind: 'flame', x, y: B - 26, size: 0.45, color: 0x5fc2c2 }); }
      break;
    case 'class_alchemy':
      pipes(g, L + 4, R - 4, T + 3);
      em.push({ kind: 'steam', x: L + 20, y: T + 12, color: 0x7db861 });
      break;
    case 'library':
      wallShelf(g, L + 3, T + 2, 26, 5, s);
      wallShelf(g, R - 29, T + 2, 26, 5, s + 1);
      line(g, L + 3, T + 1, R - 3, T + 1, WOOD[0], 1); // ladder rail
      break;
    case 'observatory': {
      // two-floor dome with the opening roof slit (its only light)
      const slit = observatorySlitPane(box);
      g.ellipse(cx, T + 10, W / 2 - 3, 12).fill({ color: 0x1b1430 });
      g.rect(slit.x, slit.y, slit.w, slit.h).fill({ color: 0x0f0b1f });
      for (let i = 0; i < 6; i++) g.circle(L + 10 + noise(s, i) * (W - 20), T + 4 + noise(s, i + 5) * 12, 0.7).fill({ color: 0xffffff });
      em.push({ kind: 'twinkle', x: cx + 8, y: T + 6, color: 0xffffff });
      break;
    }
    case 'scriptorium':
      for (let x = L + 14; x < R - 8; x += 26) {
        line(g, x, T, x, T + 3, 0x6e4529, 0.6);
        g.rect(x - 3, T + 3, 6, 12).fill({ color: 0xf2e2b0 });
        g.rect(x - 4, T + 2, 8, 1.5).fill({ color: WOOD[1] });
        g.rect(x - 4, T + 15, 8, 1.5).fill({ color: WOOD[1] });
      }
      break;
    case 'greenhouse': {
      // glass roof and mullions stay; floor stays clear for the placed Planter Beds
      g.rect(L + 2, T, W - 4, B - T - 12).fill({ color: GLASS, alpha: 0.35 });
      for (let x = L + 2; x <= R - 2; x += 16) line(g, x, T, x, B - 12, 0xd8eef7, 1);
      line(g, L + 2, T + 12, R - 2, T + 12, 0xd8eef7, 0.75);
      em.push({ kind: 'twinkle', x: cx, y: T + 10, color: 0xd8eef7 });
      break;
    }
    case 'tide_tank': {
      // one tank, not two: frame is the enclosure, water + bubbles fill once Glass Tank is installed
      const tank = fixtureState(room, 'glass_tank');
      if (tank !== 'missing') {
        g.rect(L + 6, T + 4, W - 12, B - T - 6).fill({ color: 0x5fc2c2, alpha: tank === 'ok' ? 0.45 : 0.22 });
        if (tank === 'ok') {
          for (let x = L + 14; x < R - 10; x += 14) em.push({ kind: 'bubble', x, y: B - 4, color: 0xffffff });
          em.push({ kind: 'ripple', x: cx, y: T + 6, size: W / 2 - 8 });
        }
      }
      g.rect(L + 6, T + 4, W - 12, B - T - 6).stroke({ color: STONE[3], width: 1.5 });
      break;
    }
    case 'menagerie': {
      // habitat module partitions (no painted keeper desk on a furniture slot)
      for (let x = L + 64; x < R; x += 64) g.rect(x - 1, T, 2, B - T).fill({ color: WOOD[1], alpha: 0.6 });
      em.push({ kind: 'leaf', x: L + 30, y: B - 14, color: 0x6ba34f });
      em.push({ kind: 'bubble', x: L + 96, y: B - 6, color: 0xffffff });
      em.push({ kind: 'twinkle', x: L + 160, y: B - 12, color: 0x9c86e0 });
      break;
    }
    case 'infirmary':
      // curtains only; no floor glow disc (L3 frosted window is the room's light)
      for (const x of [L + 28, R - 28]) drapes(g, x, T + 4, 14, B - T - 10, 0xf6f1e8);
      break;
    case 'aviary': {
      for (let x = L + 4; x < R; x += 6) line(g, x, T, x, B, WOOD[1], 0.75);
      g.ellipse(cx, T, W / 2, 6).stroke({ color: WOOD[1], width: 1.5 });
      for (const [px, py] of [[L + 10, T + 30], [R - 14, T + 54]] as Array<[number, number]>) {
        g.rect(px - 8, py, 16, 1.5).fill({ color: WOOD[2] });
        g.ellipse(px, py - 2, 2.2, 1.8).fill({ color: 0xe8c547 });
      }
      em.push({ kind: 'sway', x: L + 10, y: T + 28, size: 2, color: 0xe8c547 });
      break;
    }
    case 'sunlit_sanctum': {
      // the oculus is the Sun Window slot: lit and casting its cone once installed (gilded at L3)
      const sun = fixtureState(room, 'sun_window');
      if (sun !== 'missing') {
        const o = sanctumOculus(box, room.level || 1);
        if ((room.level || 1) >= 3) g.ellipse(o.cx, o.cy, o.rx + 1.5, o.ry + 1).fill({ color: GOLDS[2] });
        g.ellipse(o.cx, o.cy, o.rx, o.ry).fill({ color: sun === 'ok' ? 0xfff6dc : STONE[2] });
        if (sun === 'ok') {
          g.poly([o.cx - o.rx + 2, o.cy + 1, o.cx + o.rx - 2, o.cy + 1, o.cx + 22, B, o.cx - 22, B]).fill({ color: 0xfff6dc, alpha: 0.22 });
        }
      }
      break;
    }
    case 'warding_chamber':
      // floor stays clear for the placed Ward Circle (posts live in L2 trim; no duplicate floor ellipse)
      break;
    case 'gloom_hutch':
      g.rect(L + 2, T, W - 4, B - T).fill({ color: 0x151a38, alpha: 0.55 });
      for (let i = 0; i < 5; i++) {
        const mx = L + 8 + i * 11, my = B - 1 - (i % 2) * 2;
        line(g, mx, my, mx, my - 3, 0xe3dbce, 0.75);
        g.ellipse(mx, my - 3.5, 2.5, 1.5).fill({ color: 0x5fc2c2 });
      }
      g.ellipse(cx, T + 2, W / 2 - 3, 4).fill({ color: 0x3a6b2c, alpha: 0.6 });
      break;
    case 'detention_hall':
      g.circle(cx, T + 8, 5).fill({ color: WOOD[1] });
      g.circle(cx, T + 8, 3.8).fill({ color: 0xf6f1e8 });
      line(g, cx, T + 8, cx, T + 5.5, 0x1b1822, 0.75);
      line(g, cx, T + 13, cx, T + 19, WOOD[1], 0.75);
      em.push({ kind: 'sway', x: cx, y: T + 13, size: 3, color: GOLDS[1] });
      for (const x of [L + 8, R - 16]) { g.rect(x, T + 6, 8, 6).fill({ color: 0x3b3a40 }); line(g, x + 1, T + 8, x + 7, T + 8, 0xe3dbce, 0.5); }
      break;
    case 'alchemy_lab': {
      // bottle shelves are the Ingredient Rack's art (shown over its anchor once installed)
      if (fixtureState(room, 'ingredient_rack') !== 'missing') {
        const rx = (requiredAnchorX(room, 'ingredient_rack') ?? 85) - 15;
        for (let i = 0; i < 2; i++) {
          const y = T + 6 + i * 8;
          g.rect(L + rx, y + 5, 30, 1.5).fill({ color: WOOD[1] });
          for (let j = 0; j < 6; j++) g.rect(L + rx + 2 + j * 4.5, y + 1, 2.5, 4).fill({ color: [0xd9472b, 0x7db861, 0x6b4fbb, 0xe8c547, 0x2e8b8b, 0xdb8c46][(i + j) % 6] });
        }
      }
      break;
    }
    case 'ember_pit': {
      // hollow ash rim always; coals and embers appear once the Brazier Nest is installed
      g.ellipse(cx, B - 1, W / 2 - 6, 4).fill({ color: 0x2a2533 });
      const nest = fixtureState(room, 'brazier_nest');
      if (nest !== 'missing') {
        g.ellipse(cx, B - 1, W / 2 - 6, 4).fill({ color: 0x5c1a0e });
        for (let i = 0; i < 7; i++) g.circle(L + 12 + i * 6.5, B - 2 + (i % 2), 1.5).fill({ color: i % 2 ? 0xd9472b : 0xf07a5c });
        if (nest === 'ok') em.push({ kind: 'ember', x: cx, y: B - 3, color: 0xf07a5c });
      }
      break;
    }
    case 'workshop':
      g.rect(L + 6, B - 2, 20, 1.5).fill({ color: 0xc28e5c, alpha: 0.7 }); // sawdust
      if (room.furniture.length <= 1) {
        g.rect(R - 22, B - 9, 12, 9).stroke({ color: WOOD[2], width: 1.5 }); // half-built crate when floor is open
        line(g, R - 22, B - 9, R - 10, B, WOOD[2], 1);
      }
      break;
    case 'glassworks':
      // coloured glass blobs on rods; no orphan glow (the placed Kiln lights the corner)
      for (let i = 0; i < 3; i++) {
        line(g, L + 8 + i * 6, T + 4, L + 8 + i * 6, T + 14, 0x3b3a40, 0.75);
        g.circle(L + 8 + i * 6, T + 15, 1.8).fill({ color: [0xf07a5c, 0xe8c547, 0x9cd4ff][i] });
      }
      break;
    case 'weaving_room':
      // hanging cloths on the beam; no painted floor baskets duplicating optional slots
      line(g, L + 4, T + 4, R - 4, T + 4, WOOD[1], 0.75);
      for (let i = 0; i < 3; i++) g.rect(L + 8 + i * 16, T + 4, 10, 12).fill({ color: [0xd97a9a, 0x5a9ad6, 0xe8c547][i], alpha: 0.85 });
      break;
    case 'crystal_vivarium':
      // glass enclosure + sparkle; glow sits on the placed Geode Bed / L3 geode, not empty floor
      g.rect(L + 6, T + 4, W - 12, B - T - 5).fill({ color: 0x9c86e0, alpha: 0.2 });
      g.rect(L + 6, T + 4, W - 12, B - T - 5).stroke({ color: STONE[3], width: 1 });
      em.push({ kind: 'twinkle', x: cx - 8, y: B - 12, color: 0xc9b7ff });
      break;
    case 'trophy_hall':
      // red carpet runner; plinth spots & twinkles are drawn only on placed Artifact Plinths
      g.rect(cx - 10, B - 1, 20, 1.5).fill({ color: 0xb8402a });
      g.rect(L + 6, B - 1, W - 12, 1).fill({ color: 0xb8402a });
      break;
    default: {
      // GDD rooms without a bespoke dressing yet (e.g. future school halls): a category banner
      const bx = L + 10;
      g.rect(bx - 6, T + 1, 12, 1.5).fill({ color: WOOD[0] });
      g.poly([bx - 5, T + 2, bx + 5, T + 2, bx + 5, T + 13, bx, T + 16, bx - 5, T + 13]).fill({ color: tint });
      glyph(g, gk, bx, T + 8, 3, GOLDS[3]);
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------------------------
// Grounds plots (A.1: 64 x 96 per plot, ground line 48 px from the top, up to 48 px sky overhang)
// ---------------------------------------------------------------------------------------------

export function drawGroundsPlot(g: Painter, room: PlacedRoom, box: Box, em: Emitter[], cropStage = 3, opts: RoomArtOpts = {}): boolean {
  const cs = Math.max(0, Math.min(3, cropStage));
  const L = box.left, W = box.width, B = box.floorLineY, R = L + W, cx = L + W / 2;
  const s = room.id;
  // ground turf strip + earth band (open sky above, no indoor box frame)
  g.rect(L, B - 8, W, 8).fill({ color: 0x4a7d3a, alpha: 0.3 });
  g.rect(L, B, W, 4).fill({ color: 0x3a2a1e });
  g.rect(L, B - 1, W, 1.5).fill({ color: 0x6ba34f });
  const fence = (x0: number, x1: number) => {
    for (let x = x0; x <= x1; x += 8) g.rect(x, B - 9, 1.5, 9).fill({ color: WOOD[2] });
    g.rect(x0, B - 7, x1 - x0, 1).fill({ color: WOOD[2] });
    g.rect(x0, B - 4, x1 - x0, 1).fill({ color: WOOD[2] });
  };
  const tree = (x: number, h: number, crown: number, fruit?: number) => {
    g.rect(x - 1.5, B - h, 3, h).fill({ color: WOOD[1] });
    g.circle(x, B - h - crown * 0.6, crown).fill({ color: 0x3a6b2c });
    g.circle(x - crown * 0.6, B - h, crown * 0.7).fill({ color: 0x4e8b3a });
    g.circle(x + crown * 0.6, B - h + 1, crown * 0.7).fill({ color: 0x4e8b3a });
    if (fruit) for (let i = 0; i < 4; i++) g.circle(x - crown * 0.6 + noise(s, i + x) * crown * 1.2, B - h - noise(s, i + 20 + x) * crown, 1.3).fill({ color: fruit });
  };
  switch (room.defId) {
    case 'vegetable_patch':
      for (let i = 0; i < 3; i++) {
        g.rect(L + 6, B - 4 - i * 5, W - 12, 3).fill({ color: 0x5a4030 });
        for (let x = L + 10; x < R - 8; x += 9) g.circle(x + (i % 2) * 4, B - 5 - i * 5 - cs * 0.3, 0.8 + cs * 0.5).fill({ color: cs === 0 ? 0x9ccb72 : 0x7db861 });
      }
      fence(L + 2, R - 2);
      em.push({ kind: 'sway', x: cx, y: B - 10, size: 2, color: 0x7db861 });
      break;
    case 'herb_garden':
      for (const x of [L + 6, cx + 2]) {
        g.rect(x, B - 7, W / 2 - 8, 7).fill({ color: WOOD[1] });
        for (let i = 0; i < 4; i++) g.ellipse(x + 3 + i * 6, B - 8 - cs * 0.5, 1 + cs * 0.2, 1.2 + cs * 0.6).fill({ color: [0x6ba34f, 0x9ccb72, 0x9c86e0, 0x7db861][i] });
        g.rect(x + 2, B - 12, 3, 2).fill({ color: 0xf6f1e8 });
      }
      em.push({ kind: 'sway', x: cx, y: B - 10, size: 2, color: 0x6ba34f });
      break;
    case 'woodlot':
      tree(L + 14, 18, 9);
      tree(L + 34, 24, 11);
      tree(R - 10, 16, 8);
      g.rect(cx - 4, B - 5, 8, 5).fill({ color: WOOD[2] });
      g.ellipse(cx, B - 5, 4, 1.5).fill({ color: WOOD[3] });
      em.push({ kind: 'leaf', x: L + 34, y: B - 30, color: 0x6ba34f });
      break;
    case 'quarry':
      g.poly([L + 2, B, L + 2, B - 30, L + 22, B - 38, L + 40, B - 26, R - 2, B - 18, R - 2, B]).fill({ color: STONE[2] });
      for (let i = 0; i < 4; i++) line(g, L + 6 + i * 12, B - 26 + i * 3, L + 14 + i * 12, B - 6, STONE[1], 0.75);
      g.rect(L + 8, B - 6, 8, 6).fill({ color: STONE[3] });
      g.rect(R - 18, B - 5, 7, 5).fill({ color: STONE[3] });
      line(g, R - 8, B, R - 8, B - 34, WOOD[1], 1.5); // crane
      line(g, R - 8, B - 34, R - 26, B - 30, WOOD[1], 1.5);
      line(g, R - 24, B - 30, R - 24, B - 20, 0x3b3a40, 0.5);
      em.push({ kind: 'steam', x: L + 16, y: B - 8, color: 0xc9c0b0 });
      break;
    case 'pond':
      g.ellipse(cx, B - 4, W / 2 - 10, 6).fill({ color: 0x5a9ad6 });
      g.ellipse(cx - 6, B - 6, W / 4, 2).fill({ color: 0x9cd4ff, alpha: 0.5 });
      for (let i = 0; i < 6; i++) line(g, L + 10 + i * 3, B - 4, L + 9 + i * 3, B - 14 - (i % 3) * 3, 0x4e8b3a, 1);
      g.rect(R - 30, B - 7, 22, 2).fill({ color: WOOD[2] }); // jetty
      for (const x of [R - 28, R - 12]) g.rect(x, B - 5, 1.5, 5).fill({ color: WOOD[1] });
      em.push({ kind: 'ripple', x: cx, y: B - 4, size: W / 2 - 14 });
      break;
    case 'orchard':
      for (let x = L + 18; x < R - 8; x += 32) tree(x, 18, 10, cs >= 2 ? (cs === 3 ? 0xd9472b : 0xe8c547) : undefined);
      if (cs === 1) for (let x = L + 18; x < R - 8; x += 32) for (let i = 0; i < 4; i++) g.circle(x - 6 + i * 4, B - 26 + (i % 2) * 4, 1).fill({ color: 0xf6f1e8 });
      line(g, R - 14, B, R - 8, B - 22, WOOD[3], 1);
      line(g, R - 10, B, R - 4, B - 22, WOOD[3], 1);
      em.push({ kind: 'sway', x: L + 18, y: B - 26, size: 3, color: 0x4e8b3a });
      break;
    case 'apiary': {
      // readable skep hives on a wooden stand (not 2px dots) and twinkle right above a hive
      g.rect(L + 8, B - 5, W - 16, 1.5).fill({ color: WOOD[1] });
      for (const x of [L + 11, R - 13]) g.rect(x, B - 4, 1.5, 4).fill({ color: WOOD[0] });
      for (const hx of [L + 18, cx, R - 18]) {
        g.ellipse(hx, B - 8, 4.5, 4).fill({ color: 0xe8c547 });
        g.rect(hx - 4, B - 8, 8, 1).fill({ color: WOOD[1] });
        g.rect(hx - 1, B - 7, 2, 2).fill({ color: 0x1b1822 });
      }
      em.push({ kind: 'twinkle', x: cx, y: B - 14, color: 0xf5ce7a });
      break;
    }
    case 'courtyard_garden':
      g.rect(L + 3, B - 10, 14, 10).fill({ color: 0x3a6b2c });
      g.rect(R - 17, B - 10, 14, 10).fill({ color: 0x3a6b2c });
      g.rect(cx - 7, B - 4, 14, 4).fill({ color: STONE[3] });
      g.rect(cx - 1.5, B - 12, 3, 8).fill({ color: STONE[3] });
      em.push({ kind: 'steam', x: cx, y: B - 13, color: 0x9cd4ff });
      break;
    case 'standing_stones':
      for (const [x, h] of [[L + 10, 22], [L + 24, 30], [L + 40, 26], [R - 10, 20]] as Array<[number, number]>) {
        g.poly([x - 4, B, x + 4, B, x + 3, B - h, x - 3, B - h + 2]).fill({ color: STONE[2] });
        g.rect(x - 1, B - h + 8, 2, 4).fill({ color: 0x9bd4ff, alpha: 0.7 });
      }
      break;
    case 'moonwell':
      g.rect(cx - 12, B - 10, 24, 10).fill({ color: STONE[2] });
      for (let x = cx - 12; x < cx + 12; x += 6) g.rect(x, B - 10, 0.75, 10).fill({ color: STONE[1] });
      g.ellipse(cx, B - 10, 12, 2.5).fill({ color: 0xd8d8f0 });
      line(g, cx - 10, B - 10, cx - 10, B - 24, WOOD[1], 1.5);
      line(g, cx + 10, B - 10, cx + 10, B - 24, WOOD[1], 1.5);
      g.poly([cx - 14, B - 24, cx + 14, B - 24, cx, B - 32]).fill({ color: 0x3e4a5c });
      break;
    case 'meadow_paddock': {
      for (let x = L + 4; x < R - 4; x += 5) line(g, x, B, x + 1, B - 4 - noise(s, x) * 3, 0x6ba34f, 0.75);
      // L1 progressive fencing: rope & stakes (L2 upgrades to wooden rail, L3 adds hedge & shelter hut)
      const stakes: number[] = [];
      for (let x = L + 4; x <= R - 4; x += 14) {
        stakes.push(x);
        g.rect(x, B - 8, 1.5, 8).fill({ color: WOOD[1] });
      }
      for (let i = 0; i < stakes.length - 1; i++) {
        const x0 = stakes[i] + 1, x1 = stakes[i + 1];
        const xm = (x0 + x1) / 2;
        line(g, x0, B - 6, xm, B - 4.5, 0xc9b88a, 1);
        line(g, xm, B - 4.5, x1, B - 6, 0xc9b88a, 1);
      }
      em.push({ kind: 'sway', x: L + 30, y: B - 4, size: 2, color: 0x6ba34f });
      break;
    }
    case 'rift_gate': {
      const arch = room.state === 'site' ? 'ok' : fixtureState(room, 'gate_arch');
      if (arch === 'missing') {
        // Stone dais only until the Gate Arch is installed (no portal before the arch exists)
        g.rect(cx - 38, B - 5, 76, 5).fill({ color: STONE[0] });
        g.rect(cx - 34, B - 8, 68, 3).fill({ color: STONE[1] });
        g.rect(cx - 34, B - 8, 68, 0.75).fill({ color: STONE[2] });
        break;
      }
      const rState: RiftGateVisualState = arch === 'ok' ? (opts.riftState ?? 'dormant') : 'dormant';
      drawRiftGateArch(g, box, rState, {
        phaseRad: opts.riftPhaseRad ?? 0,
        destinationId: opts.riftDestId,
        flareAlpha: opts.riftFlareAlpha
      });
      if (rState !== 'dormant') {
        em.push({ kind: 'portal', x: cx, y: B - 34, size: 14, color: 0x7d5ba6 });
      }
      break;
    }
    case 'training_yard':
      g.ellipse(cx, B - 1, W / 2 - 6, 3).fill({ color: 0xe0c48a });
      g.rect(R - 18, B - 18, 12, 2).fill({ color: WOOD[1] }); // weapon rack
      for (let i = 0; i < 3; i++) line(g, R - 16 + i * 4, B - 22, R - 16 + i * 4, B, SD_LINE, 1);
      break;
    default:
      g.rect(L + 2, B - 2, W - 4, 2).fill({ color: 0x6e4529, alpha: 0.65 });
      return false;
  }
  // Low turf/path border along the plot ground edge (never a sky box outline)
  g.rect(L + 1, B - 1.5, W - 2, 1.5).fill({ color: 0x4a7d3a, alpha: 0.8 });
  return true;
}
const SD_LINE = 0x8a8994;

/** Draw an animated furniture item / emitter frame (ambient layer). */
export function drawAnimatedItem(g: Painter, it: AnimatedItem, frame: number) {
  drawFurniture(g, it.id, it.x, it.y, { frame, damaged: it.damaged, tint: it.tint, glyphKind: it.glyphKind });
}

export function drawEmitter(g: Painter, e: Emitter, frame: number, t: number) {
  const f = frame % 4;
  switch (e.kind) {
    case 'flame':
      flame(g, e.x, e.y, e.size ?? 1, f);
      if (e.color) g.circle(e.x, e.y - 2, 1.2 * (e.size ?? 1)).fill({ color: e.color, alpha: 0.7 });
      break;
    case 'glow': {
      const p = [0.16, 0.22, 0.19, 0.25][(f + (e.seed ?? 0)) % 4];
      g.circle(e.x, e.y, e.size ?? 8).fill({ color: e.color ?? 0xf6e08c, alpha: p });
      break;
    }
    case 'candle': {
      const bob = [0, 0.75, 1.2, 0.75][(f + (e.seed ?? 0)) % 4];
      g.rect(e.x - 1, e.y + bob, 2, 4).fill({ color: 0xf6f1e8 });
      flame(g, e.x, e.y + bob, 0.45, (f + (e.seed ?? 0)) % 4);
      break;
    }
    case 'steam':
      for (let i = 0; i < 3; i++) {
        const k = (f + i) % 4;
        g.circle(e.x + (i - 1) * 2 + (k % 2), e.y - k * 2.5, 1.2 + k * 0.3).fill({ color: e.color ?? 0xffffff, alpha: 0.35 - k * 0.06 });
      }
      break;
    case 'bubble':
      for (let i = 0; i < 3; i++) {
        const k = (f + i * 2) % 4;
        g.circle(e.x + (i - 1) * 2, e.y - k * 3 - i, 0.9).fill({ color: e.color ?? 0xffffff, alpha: 0.75 });
      }
      break;
    case 'twinkle': {
      const a = [0.2, 0.9, 0.5, 0.0][f];
      if (a > 0) {
        g.rect(e.x - 0.5, e.y - 2.5, 1, 5).fill({ color: e.color ?? 0xffffff, alpha: a });
        g.rect(e.x - 2.5, e.y - 0.5, 5, 1).fill({ color: e.color ?? 0xffffff, alpha: a });
      }
      break;
    }
    case 'mote':
      for (let i = 0; i < 4; i++) g.circle(e.x - 8 + i * 5 + (f % 2), e.y - ((f + i) % 4) * 3, 0.6).fill({ color: 0xfff6dc, alpha: 0.8 });
      break;
    case 'ember':
      for (let i = 0; i < 3; i++) {
        const k = (f + i) % 4;
        g.rect(e.x - 4 + i * 4 + (k % 2), e.y - k * 3 - 2, 1, 1).fill({ color: e.color ?? 0xf07a5c, alpha: 1 - k * 0.2 });
      }
      break;
    case 'leaf':
      g.ellipse(e.x + [0, 2, 3, 1][f], e.y + f * 3, 1.5, 0.8).fill({ color: e.color ?? 0x6ba34f });
      break;
    case 'ripple': {
      const r = (e.size ?? 10) * (0.3 + 0.2 * f);
      g.ellipse(e.x, e.y, r, r * 0.12 + 0.5).stroke({ color: 0xffffff, width: 0.6, alpha: 0.5 - f * 0.1 });
      break;
    }
    case 'portal': {
      const r = e.size ?? 12;
      // stone arch
      g.rect(e.x - r - 6, e.y - r * 0.4, 5, r * 1.9).fill({ color: 0x8a8994 });
      g.rect(e.x + r + 1, e.y - r * 0.4, 5, r * 1.9).fill({ color: 0x8a8994 });
      g.ellipse(e.x, e.y - r * 0.4, r + 6, r * 0.9).stroke({ color: 0x8a8994, width: 5 });
      g.ellipse(e.x, e.y + 2, r, r * 1.05).fill({ color: e.color ?? 0x7d5ba6, alpha: 0.9 });
      const a = (f * Math.PI) / 2;
      for (let i = 0; i < 3; i++) {
        const t = a + (i * Math.PI * 2) / 3;
        g.circle(e.x + Math.cos(t) * r * 0.55, e.y + 2 + Math.sin(t) * r * 0.6, 1.6).fill({ color: 0x9bd4ff, alpha: 0.85 });
      }
      g.circle(e.x, e.y + 2, r * 0.3).fill({ color: 0xb9a6ff, alpha: 0.8 });
      break;
    }
    case 'hammer': {
      // Spectral hammer (one swing per 4 frames = 0.8 s at 5 fps) and a floating trowel, wizard colour
      const c = e.color ?? 0xc9b7ff;
      const px = e.x, py = e.y + 7; // pivot (hand)
      const ang = [-1.0, -0.45, 0.25, -0.45][f]; // radians from vertical, swinging right
      const tx = px + Math.sin(ang) * 10, ty = py - Math.cos(ang) * 10;
      g.circle(px, py - 5, 10).fill({ color: c, alpha: 0.1 });
      line(g, px, py, tx, ty, 0x6e4529, 1.6);
      // head perpendicular to the handle
      const nx = Math.cos(ang), ny = Math.sin(ang);
      const hw = 4, hh = 1.8;
      g.poly([
        tx - nx * hw - Math.sin(ang) * hh, ty - ny * hw + Math.cos(ang) * hh,
        tx + nx * hw - Math.sin(ang) * hh, ty + ny * hw + Math.cos(ang) * hh,
        tx + nx * hw + Math.sin(ang) * hh, ty + ny * hw - Math.cos(ang) * hh,
        tx - nx * hw + Math.sin(ang) * hh, ty - ny * hw - Math.cos(ang) * hh
      ]).fill({ color: c, alpha: 0.95 });
      if (f === 2) { g.rect(tx + 4, ty + 1, 1, 1).fill({ color: 0xf7e39a }); g.rect(tx + 5, ty - 2, 1, 1).fill({ color: 0xf7e39a }); }
      // floating trowel
      const bx = px - 14, by = py - 9 + [0, -1, -1.5, -1][f];
      g.poly([bx, by - 4, bx + 3, by, bx, by + 4, bx - 3, by]).fill({ color: c, alpha: 0.9 });
      line(g, bx, by + 4, bx, by + 8, 0x6e4529, 1.2);
      g.circle(bx, by, 5).fill({ color: c, alpha: 0.1 });
      break;
    }
    case 'sway': {
      const d = [0, 1, 0, -1][f] * (e.size ?? 2) * 0.25;
      g.rect(e.x - 0.5 + d, e.y, 1, 1).fill({ color: e.color ?? 0xffffff, alpha: 0.9 });
      break;
    }
  }
  void t;
}
