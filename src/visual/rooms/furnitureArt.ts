/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forge furniture art (Addendum 5.3, 12.2 and Appendix A.2).
 * Every furniture id in the A.2 catalog, every id in FURNITURE_DEFINITIONS and every required-furniture
 * role in ROOM_DEFINITIONS has an explicit entry here: sprite size and anchor straight from A.2, a forge
 * family (one of 12 primitives), two palette colours and an optional variant detail. Animated items
 * (A.2 "4 + damaged") get a 4-frame loop; damaged items get the shared damaged frame (Section 5.5).
 * Purely visual: nothing here reads or writes game state beyond the props passed in.
 */
import { Painter, line, flame, darken, mix, glyph } from './painter';

export type FurnitureAnchor = 'floor' | 'wall' | 'ceiling';
export type FurnitureFamily =
  | 'box' | 'shelf' | 'table' | 'bed' | 'seat' | 'vessel'
  | 'lamp' | 'plant' | 'hanging' | 'frame' | 'orb' | 'statue';

export interface FurnitureArt {
  family: FurnitureFamily;
  w: number;
  h: number;
  anchor: FurnitureAnchor;
  a: number;
  b: number;
  variant?: string;
  /** A.2 "4 + damaged" items loop 4 frames (cosmetic, frozen on frame 0 under reduce motion). */
  animated?: boolean;
}

const W = 0x96633b, WD = 0x6e4529, WK = 0x4a2e1c, WL = 0xc28e5c;
const ST = 0x8a8994, SD = 0x5e5d66, SL = 0xb9b8c2;
const GOLD = 0xddb843, CLOTH = 0xe3dbce, RED = 0xb8402a, GREEN = 0x4e8b3a, LEAF = 0x6ba34f;
const VIOLET = 0x6b4fbb, INDIGO = 0x2f3a73, TEAL = 0x2e8b8b, SUN = 0xe8c547, COPPER = 0xb5651d, BRASS = 0xb08a22;
const GLASS = 0x9cd4ff, MOSS = 0x3a6b2c, IRON = 0x3b3a40, VEIL = 0x7d5ba6, PINK = 0xd97a9a;

type Row = [FurnitureFamily, number, number, FurnitureAnchor, number, number, string?, 1?];

/** id -> [family, w, h, anchor, colourA, colourB, variant?, animated?] (sizes/anchors per Appendix A.2). */
const TABLE: Record<string, Row> = {
  potted_fern: ['plant', 16, 16, 'floor', LEAF, 0xb5651d, 'pot'],
  candle_sconce: ['lamp', 16, 16, 'wall', BRASS, CLOTH, 'sconce', 1],
  woven_rug: ['hanging', 16, 16, 'floor', RED, GOLD, 'rug'],
  tapestry: ['hanging', 16, 16, 'wall', RED, GOLD, 'tapestry'],
  bookshelf: ['shelf', 16, 24, 'floor', W, RED, 'books'],
  academy_banner: ['hanging', 16, 16, 'wall', VIOLET, GOLD, 'banner'],
  grandfather_clock: ['box', 16, 24, 'floor', WD, GOLD, 'clock', 1],
  founders_portrait: ['frame', 16, 16, 'wall', GOLD, 0x7a4a2a, 'portrait'],
  glow_lantern: ['lamp', 16, 16, 'ceiling', IRON, GLASS, 'hanging', 1],
  window_box: ['plant', 16, 16, 'wall', LEAF, W, 'box'],
  fish_bowl: ['vessel', 16, 16, 'floor', GLASS, 0xe8752a, 'bowl', 1],
  hush_chimes: ['lamp', 16, 16, 'ceiling', SL, INDIGO, 'chimes', 1],
  radiant_lamp: ['lamp', 16, 16, 'floor', GOLD, SUN, 'standing', 1],
  enchanted_broom: ['statue', 16, 16, 'floor', WL, 0xe0b860, 'broom', 1],
  familiar_statue: ['statue', 16, 24, 'floor', SL, SD, 'familiar'],
  floating_candles: ['lamp', 16, 16, 'ceiling', CLOTH, GOLD, 'floating', 1],
  simple_cot: ['bed', 16, 16, 'floor', W, CLOTH, 'cot'],
  feather_bed: ['bed', 32, 16, 'floor', W, 0xf6f1e8, 'feather'],
  faculty_bed: ['bed', 32, 16, 'floor', WD, INDIGO, 'plain'],
  canopy_bed: ['bed', 32, 16, 'floor', WD, RED, 'canopy'],
  dreamcatcher_bed: ['bed', 32, 16, 'floor', W, VIOLET, 'dream'],
  mossbed: ['bed', 32, 16, 'floor', MOSS, LEAF, 'moss'],
  bunk_bed: ['bed', 16, 24, 'floor', W, 0x57677d, 'bunk'],
  bed: ['bed', 16, 16, 'floor', W, CLOTH, 'cot'],
  wardrobe: ['box', 16, 24, 'floor', WD, GOLD, 'cabinet'],
  footlocker: ['box', 16, 16, 'floor', W, BRASS, 'chest'],
  moon_curtains: ['hanging', 16, 16, 'wall', INDIGO, SL, 'curtain', 1],
  writing_desk: ['table', 16, 16, 'floor', W, CLOTH, 'desk'],
  armchair: ['seat', 16, 16, 'floor', RED, WD, 'armchair'],
  couch: ['seat', 32, 16, 'floor', PINK, WD, 'couch'],
  couch_or_hearth: ['seat', 32, 16, 'floor', PINK, WD, 'couch'],
  hammock: ['bed', 16, 16, 'floor', CLOTH, WL, 'hammock'],
  tea_service: ['table', 16, 16, 'floor', W, CLOTH, 'tea', 1],
  wizard_chess: ['table', 16, 16, 'floor', WD, CLOTH, 'chess'],
  music_box: ['box', 16, 16, 'floor', W, GOLD, 'music', 1],
  hex_darts: ['frame', 16, 16, 'floor', RED, CLOTH, 'darts'],
  warm_hearthstone: ['statue', 16, 16, 'floor', SD, 0xe8752a, 'hearthstone', 1],
  long_table: ['table', 32, 16, 'floor', W, CLOTH, 'long'],
  wooden_chair: ['seat', 16, 16, 'floor', W, WD, 'chair'],
  hearth: ['box', 16, 24, 'floor', ST, 0xe8752a, 'hearth', 1],
  cooking_range: ['box', 16, 24, 'floor', IRON, 0xe8752a, 'oven', 1],
  spice_rack: ['shelf', 16, 16, 'wall', W, RED, 'jars'],
  frostbox: ['box', 16, 24, 'floor', 0xd8eef7, GLASS, 'cabinet'],
  stewpot: ['vessel', 16, 16, 'floor', IRON, 0xc28e5c, 'cauldron', 1],
  banquet_bell: ['lamp', 16, 16, 'floor', GOLD, WD, 'deskbell'],
  teachers_lectern: ['table', 16, 24, 'floor', W, CLOTH, 'lectern'],
  lectern: ['table', 16, 24, 'floor', W, CLOTH, 'lectern'],
  orrery_globe: ['orb', 16, 24, 'floor', BRASS, VIOLET, 'orrery', 1],
  potting_bench: ['table', 16, 16, 'floor', W, LEAF, 'potting'],
  sun_altar: ['statue', 16, 24, 'floor', CLOTH, SUN, 'altar'],
  veiled_mirror: ['frame', 16, 24, 'floor', INDIGO, SL, 'mirror'],
  bench_cauldron: ['vessel', 16, 16, 'floor', IRON, 0x7db861, 'cauldron', 1],
  student_desk: ['table', 16, 16, 'floor', W, CLOTH, 'desk'],
  student_desks: ['table', 32, 16, 'floor', W, CLOTH, 'desks'],
  chalkboard: ['hanging', 16, 16, 'wall', 0x24451c, CLOTH, 'board'],
  star_chart: ['hanging', 16, 16, 'wall', 0x2e2160, 0xeef1f5, 'chart'],
  specimen_jars: ['shelf', 16, 16, 'wall', W, 0x7db861, 'jars'],
  master_lectern: ['table', 16, 24, 'floor', WD, GOLD, 'lectern'],
  grand_focus: ['orb', 32, 32, 'floor', BRASS, VIOLET, 'focus', 1],
  inspiring_quote: ['frame', 16, 16, 'wall', GOLD, CLOTH, 'quote'],
  reading_desk: ['table', 16, 16, 'floor', W, CLOTH, 'desk'],
  rolling_ladder: ['shelf', 16, 24, 'floor', WL, WD, 'ladder'],
  great_telescope: ['orb', 32, 32, 'floor', BRASS, SD, 'telescope', 1],
  scribes_desk: ['table', 16, 16, 'floor', W, CLOTH, 'scribe'],
  globe_elsewhere: ['orb', 16, 16, 'floor', W, TEAL, 'globe'],
  silent_quill: ['table', 16, 16, 'floor', WD, CLOTH, 'quill', 1],
  map_table: ['table', 32, 16, 'floor', W, 0xe6d9b0, 'map'],
  planter_bed: ['plant', 32, 16, 'floor', LEAF, 0x5a4030, 'bed'],
  rain_cistern: ['vessel', 16, 16, 'floor', W, GLASS, 'barrel', 1],
  compost_bin: ['box', 16, 16, 'floor', WD, 0x5a4030, 'crate'],
  glowcap_lamp: ['plant', 16, 16, 'ceiling', TEAL, 0x5fc2c2, 'mushroom', 1],
  feeding_trough: ['table', 32, 16, 'floor', W, 0xe0b860, 'trough'],
  glass_tank: ['vessel', 32, 32, 'floor', GLASS, TEAL, 'tank', 1],
  perch_tree: ['plant', 16, 24, 'floor', LEAF, W, 'tree'],
  lightless_burrow: ['statue', 16, 16, 'floor', 0x151a38, MOSS, 'burrow'],
  brazier_nest: ['vessel', 16, 16, 'floor', IRON, 0xe8752a, 'brazier', 1],
  geode_bed: ['orb', 32, 16, 'floor', SD, VIOLET, 'geode'],
  habitat_module: ['vessel', 32, 16, 'floor', W, LEAF, 'habitat', 1],
  creature_toybox: ['box', 16, 16, 'floor', 0xd97a9a, SUN, 'chest'],
  warm_rock: ['statue', 16, 16, 'floor', 0x9c7a58, 0xdb8c46, 'rock'],
  infirmary_cot: ['bed', 32, 16, 'floor', SL, 0xffffff, 'cot'],
  remedy_cabinet: ['box', 16, 24, 'floor', 0xf6f1e8, RED, 'cabinet'],
  healing_basin: ['vessel', 32, 16, 'floor', SL, GLASS, 'basin', 1],
  sun_window: ['frame', 16, 16, 'wall', GOLD, SUN, 'window', 1],
  meditation_cushions: ['seat', 16, 16, 'floor', SUN, 0xc9b88a, 'cushions'],
  soaking_tub: ['vessel', 32, 16, 'floor', 0x57677d, GLASS, 'tub', 1],
  halo_candles: ['lamp', 16, 16, 'ceiling', CLOTH, SUN, 'halo', 1],
  ward_circle: ['statue', 16, 16, 'floor', TEAL, 0x5fc2c2, 'runering', 1],
  ward_lantern: ['lamp', 16, 16, 'floor', IRON, 0x5fc2c2, 'post', 1],
  penitent_benches: ['seat', 32, 16, 'floor', WD, W, 'bench'],
  silence_bell: ['lamp', 16, 16, 'ceiling', SL, INDIGO, 'bell', 1],
  shadow_ledger: ['shelf', 16, 16, 'wall', INDIGO, 0x5fc2c2, 'ledger'],
  nightglass: ['frame', 16, 16, 'floor', INDIGO, 0x4c5ba3, 'pane', 1],
  brewing_cauldron: ['vessel', 16, 24, 'floor', IRON, 0x7db861, 'cauldron', 1],
  ingredient_rack: ['shelf', 16, 24, 'floor', W, 0xdb8c46, 'bottles'],
  fume_hood: ['box', 16, 24, 'floor', COPPER, SD, 'hood', 1],
  alembic_array: ['vessel', 32, 32, 'floor', GLASS, COPPER, 'alembic', 1],
  workbench: ['table', 32, 16, 'floor', W, SD, 'work'],
  tool_wall: ['shelf', 16, 24, 'floor', W, SL, 'tools'],
  kiln: ['box', 16, 24, 'floor', 0x9c7a58, 0xe8752a, 'oven', 1],
  loom: ['frame', 16, 24, 'floor', W, PINK, 'loom', 1],
  shelving: ['shelf', 16, 24, 'floor', WD, 0xc28e5c, 'crates'],
  practice_dummies: ['statue', 16, 24, 'floor', 0xe0b860, W, 'dummy'],
  supply_chest: ['box', 16, 16, 'floor', WD, IRON, 'chest'],
  artifact_plinth: ['statue', 16, 24, 'floor', SL, GOLD, 'plinth'],
  garden_gnome: ['statue', 16, 16, 'floor', RED, 0x4e8b3a, 'gnome'],
  bird_bath: ['statue', 16, 24, 'floor', SL, GLASS, 'birdbath'],
  scarecrow: ['statue', 16, 24, 'floor', 0xe0b860, VIOLET, 'scarecrow'],
  stone_lantern: ['statue', 16, 24, 'floor', ST, SUN, 'stonelantern'],
  beehive_box: ['box', 16, 24, 'floor', 0xe0b860, W, 'hive', 1],
  windmill_charm: ['statue', 16, 24, 'floor', W, CLOTH, 'windmill', 1],
  fairy_ring: ['plant', 16, 16, 'floor', 0xe8e0d0, 0xd97a9a, 'ring', 1],
  rune_marker: ['statue', 16, 16, 'floor', SD, 0x9bd4ff, 'rune', 1],
  starfall_chandelier: ['lamp', 16, 16, 'ceiling', GOLD, 0xeef1f5, 'chandelier', 1],
  heartwood_bench: ['seat', 32, 16, 'floor', W, LEAF, 'bench'],
  choir_bells: ['lamp', 16, 16, 'ceiling', GOLD, SUN, 'bells', 1],
  veilweaver_loom: ['frame', 32, 32, 'floor', VEIL, 0x9bd4ff, 'loom', 1],
  everburning_athanor: ['box', 32, 32, 'floor', COPPER, 0xe8752a, 'oven', 1],
  phoenix_hearth: ['box', 16, 24, 'floor', 0x8f2a17, 0xf07a5c, 'hearth', 1],
  // Required-furniture roles and GDD items without an A.2 row (sizes follow the closest A.2 sibling)
  grand_doors: ['frame', 16, 32, 'floor', WD, GOLD, 'door'],
  orb_stand: ['orb', 16, 24, 'floor', BRASS, VIOLET, 'orb', 1],
  gate_arch: ['frame', 32, 32, 'floor', ST, VEIL, 'arch', 1],
  anchor_stones: ['statue', 16, 16, 'floor', SD, 0x9bd4ff, 'rune', 1],
  ward_spire: ['statue', 16, 24, 'floor', ST, 0x5fc2c2, 'rune', 1]
};

/** Every id that has forge art (the catalog test asserts this covers all content ids and roles). */
export const FURNITURE_ART_IDS = Object.keys(TABLE);

export function hasFurnitureArt(id: string): boolean {
  return Object.prototype.hasOwnProperty.call(TABLE, id);
}

/** Forge art for a furniture id; unknown ids fall back to a crate so a broken save never crashes the map. */
export function getFurnitureArt(id: string): FurnitureArt {
  const r = TABLE[id] || (['box', 16, 16, 'floor', W, IRON, 'crate'] as Row);
  return { family: r[0], w: r[1], h: r[2], anchor: r[3], a: r[4], b: r[5], variant: r[6], animated: !!r[7] };
}

export interface FurnitureDrawOpts {
  /** 0..3 animation frame (always 0 under reduce motion). */
  frame?: number;
  damaged?: boolean;
  /** Category / school tint (Addendum 5.2) for banners, glyphs and orbs. */
  tint?: number;
  glyphKind?: string;
  /** Draw as an empty-slot ghost outline (Unfinished room, Section 5.3). */
  ghost?: boolean;
}

/** Box of a sprite placed at its anchor point (floor: bottom-centre; wall: centre; ceiling: top-centre). */
export function furnitureBox(art: Pick<FurnitureArt, 'w' | 'h' | 'anchor'>, x: number, y: number) {
  const left = x - art.w / 2;
  const top = art.anchor === 'floor' ? y - art.h : art.anchor === 'wall' ? y - art.h / 2 : y;
  return { left, top, w: art.w, h: art.h };
}

/**
 * Draw one furniture item at its anchor point. Damaged items use the damaged frame (Section 5.5):
 * darker, cracked, a little askew, plus the wrench badge drawn by the overlay layer.
 */
export function drawFurniture(g: Painter, id: string, x: number, y: number, opts: FurnitureDrawOpts = {}) {
  const art = getFurnitureArt(id);
  const b = furnitureBox(art, x, y);
  if (opts.ghost) {
    drawGhostSlot(g, b);
    return;
  }
  const frame = art.animated && !opts.damaged ? (opts.frame ?? 0) % 4 : 0;
  const tint = opts.tint ?? art.a;
  drawFamily(g, art, b, frame, tint, opts.glyphKind || 'star8');
  if (opts.damaged) drawDamagedFrame(g, b);
}

/** Faint outline + "+" for an empty required slot (Unfinished, Section 5.3). */
export function drawGhostSlot(g: Painter, b: { left: number; top: number; w: number; h: number }) {
  g.rect(b.left + 0.5, b.top + 0.5, b.w - 1, b.h - 1).fill({ color: 0xffffff, alpha: 0.08 });
  for (let px = b.left; px < b.left + b.w; px += 4) {
    g.rect(px, b.top, 2, 1).fill({ color: 0xffffff, alpha: 0.55 });
    g.rect(px, b.top + b.h - 1, 2, 1).fill({ color: 0xffffff, alpha: 0.55 });
  }
  for (let py = b.top; py < b.top + b.h; py += 4) {
    g.rect(b.left, py, 1, 2).fill({ color: 0xffffff, alpha: 0.55 });
    g.rect(b.left + b.w - 1, py, 1, 2).fill({ color: 0xffffff, alpha: 0.55 });
  }
  const cx = b.left + b.w / 2, cy = b.top + b.h / 2;
  g.rect(cx - 3, cy - 0.75, 6, 1.5).fill({ color: 0xffffff, alpha: 0.85 });
  g.rect(cx - 0.75, cy - 3, 1.5, 6).fill({ color: 0xffffff, alpha: 0.85 });
}

export function drawDamagedFrame(g: Painter, b: { left: number; top: number; w: number; h: number }) {
  g.rect(b.left, b.top, b.w, b.h).fill({ color: 0x1b1822, alpha: 0.35 });
  line(g, b.left + b.w * 0.3, b.top + 1, b.left + b.w * 0.5, b.top + b.h * 0.45, 0x1b1822, 1);
  line(g, b.left + b.w * 0.5, b.top + b.h * 0.45, b.left + b.w * 0.38, b.top + b.h * 0.75, 0x1b1822, 1);
  line(g, b.left + b.w * 0.5, b.top + b.h * 0.45, b.left + b.w * 0.72, b.top + b.h * 0.6, 0x1b1822, 1);
  // splinters / rubble at the base
  g.rect(b.left + 2, b.top + b.h - 2, 3, 2).fill({ color: 0x5e5d66 });
  g.rect(b.left + b.w - 5, b.top + b.h - 1.5, 2, 1.5).fill({ color: 0x5e5d66 });
}

function drawFamily(g: Painter, art: FurnitureArt, bx: { left: number; top: number; w: number; h: number }, f: number, tint: number, glyphKind: string) {
  const { left: L, top: T, w, h } = bx;
  const R = L + w, B = T + h, cx = L + w / 2;
  const a = art.a, c2 = art.b, v = art.variant || '';
  const outline = darken(a, 0.55);
  switch (art.family) {
    case 'box': {
      if (v === 'hearth') {
        g.rect(L, T + 4, w, h - 4).fill({ color: a });
        g.rect(L - 1, T + 2, w + 2, 3).fill({ color: darken(a, 0.8) });
        g.rect(L + 3, B - 11, w - 6, 11).fill({ color: 0x1b1822 });
        flame(g, cx, B - 1, 1.3, f);
        for (let i = 0; i < 3; i++) g.rect(L + 1, T + 7 + i * 4, w - 2, 0.75).fill({ color: darken(a, 0.75) });
      } else if (v === 'oven') {
        g.rect(L, T + 2, w, h - 2).fill({ color: a });
        g.rect(L + 3, T + h * 0.45, w - 6, h * 0.35).fill({ color: 0x1b1822 });
        g.rect(L + 4, T + h * 0.45 + 2, w - 8, h * 0.35 - 3).fill({ color: c2, alpha: [0.7, 0.9, 0.75, 1][f] });
        g.rect(L + w * 0.35, T - 2, w * 0.3, 4).fill({ color: darken(a, 0.7) });
        g.rect(L, T + 2, w, 2).fill({ color: darken(a, 0.7) });
      } else if (v === 'clock') {
        g.rect(L + 3, T, w - 6, h).fill({ color: a });
        g.circle(cx, T + 5, 3.5).fill({ color: 0xf6f1e8 });
        line(g, cx, T + 5, cx + 2, T + 4, 0x1b1822, 0.75);
        const sw = [-2, 0, 2, 0][f];
        line(g, cx, T + 11, cx + sw, B - 5, c2, 1);
        g.circle(cx + sw, B - 5, 1.5).fill({ color: c2 });
      } else if (v === 'cabinet' || v === 'hood') {
        g.rect(L + 1, T, w - 2, h).fill({ color: a });
        if (v === 'hood') {
          g.poly([L, T + 8, R, T + 8, R - 3, T, L + 3, T]).fill({ color: darken(a, 0.8) });
          g.rect(L + 2, T + 9, w - 4, h - 11).fill({ color: c2 });
          g.circle(cx, B - 4 - f, 1.2).fill({ color: 0xb9b8c2, alpha: 0.7 });
        } else {
          line(g, cx, T + 2, cx, B - 1, darken(a, 0.6), 1);
          g.rect(cx - 2.5, T + h / 2, 1, 2).fill({ color: c2 });
          g.rect(cx + 1.5, T + h / 2, 1, 2).fill({ color: c2 });
          g.rect(L + 1, T, w - 2, 2).fill({ color: darken(a, 0.75) });
        }
      } else if (v === 'music') {
        g.rect(L + 3, B - 7, w - 6, 7).fill({ color: a });
        g.poly([L + 3, B - 7, R - 3, B - 7, R - 4, B - 11, L + 4, B - 11]).fill({ color: darken(a, 0.8) });
        g.rect(cx - 1, B - 5, 2, 2).fill({ color: c2 });
        g.circle(cx + 3 + f, B - 13 - f, 1).fill({ color: c2 });
      } else if (v === 'dispenser') {
        g.rect(cx - 3, T + 2, 6, 9).fill({ color: GLASS, alpha: 0.8 });
        g.rect(cx - 4, T + 10, 8, h - 10).fill({ color: a });
        g.circle(cx - 1, T + 6 + (f % 2), 1).fill({ color: c2 });
      } else if (v === 'hive') {
        for (let i = 0; i < 3; i++) g.rect(L + 2, B - 7 - i * 6, w - 4, 6).fill({ color: i % 2 ? a : darken(a, 0.85) });
        g.rect(L + 1, B - 20, w - 2, 2).fill({ color: c2 });
        g.rect(cx - 1.5, B - 3, 3, 2).fill({ color: 0x1b1822 });
        g.circle(cx + 5 - f * 2, T + 2 + (f % 2) * 2, 1).fill({ color: 0xf5ce7a });
      } else if (v === 'crate') {
        g.rect(L + 2, B - 11, w - 4, 11).fill({ color: a });
        line(g, L + 2, B - 11, R - 2, B, darken(a, 0.6), 1);
        g.rect(L + 3, B - 12, w - 6, 2).fill({ color: c2 });
      } else {
        // chest / footlocker / toybox
        g.rect(L + 2, B - 8, w - 4, 8).fill({ color: a });
        g.rect(L + 2, B - 11, w - 4, 3).fill({ color: darken(a, 0.8) });
        g.rect(L + 2, B - 8, w - 4, 1).fill({ color: c2 });
        g.rect(cx - 1, B - 7, 2, 2).fill({ color: c2 });
      }
      break;
    }
    case 'shelf': {
      if (v === 'ladder') {
        line(g, L + 4, B, L + 7, T, a, 1.5);
        line(g, R - 4, B, R - 1, T, a, 1.5);
        for (let y = B - 4; y > T + 2; y -= 4) line(g, L + 5, y, R - 3, y, c2, 1);
        g.circle(L + 4, B - 1, 1).fill({ color: IRON });
        break;
      }
      if (art.anchor === 'wall') {
        g.rect(L + 1, T + h - 4, w - 2, 2).fill({ color: a });
        g.rect(L + 1, T + 4, w - 2, 2).fill({ color: a });
        if (v === 'ledger') {
          g.rect(L + 3, T + h - 10, 10, 6).fill({ color: a });
          g.rect(L + 4, T + h - 9, 8, 4).fill({ color: c2, alpha: 0.5 });
        } else {
          for (let i = 0; i < 4; i++) {
            const col = i % 2 ? c2 : mix(c2, 0xffffff, 0.35);
            g.rect(L + 2 + i * 3.5, T + h - 9, 2.5, 5).fill({ color: col });
            g.rect(L + 2 + i * 3.5, T + 1, 2.5, 3).fill({ color: mix(col, a, 0.4) });
          }
        }
        break;
      }
      g.rect(L + 1, T, w - 2, h).fill({ color: darken(a, 0.75) });
      g.rect(L + 1, T, 1.5, h).fill({ color: a });
      g.rect(R - 2.5, T, 1.5, h).fill({ color: a });
      const rows = Math.max(2, Math.floor(h / 7));
      for (let r = 0; r <= rows; r++) g.rect(L + 1, T + (r * (h - 1.5)) / rows, w - 2, 1.5).fill({ color: a });
      for (let r = 0; r < rows; r++) {
        const y0 = T + (r * (h - 1.5)) / rows + 1.5, rh = (h - 1.5) / rows - 1.5;
        for (let i = 0; i < 4; i++) {
          const bx = L + 3 + i * 2.6;
          if (v === 'tools') {
            line(g, bx + 1, y0 + 1, bx + 1, y0 + rh, c2, 1);
          } else if (v === 'bottles' || v === 'jars') {
            const bc = [c2, 0x6b4fbb, 0x7db861, 0xe8c547][(i + r) % 4];
            g.rect(bx, y0 + rh * 0.35, 2, rh * 0.65).fill({ color: bc });
            g.rect(bx + 0.5, y0 + rh * 0.15, 1, rh * 0.25).fill({ color: bc });
          } else if (v === 'crates') {
            if (i % 2 === 0) g.rect(bx, y0 + rh * 0.2, 4.5, rh * 0.8).fill({ color: c2 });
          } else {
            const bc = [c2, 0x4b3796, 0x3a6b2c, 0xc4a233][(i + r * 3) % 4];
            g.rect(bx, y0 + rh * (0.1 + 0.1 * (i % 2)), 2, rh * (0.9 - 0.1 * (i % 2))).fill({ color: bc });
          }
        }
      }
      break;
    }
    case 'table': {
      if (v === 'lectern') {
        g.rect(cx - 1.5, T + 8, 3, h - 9).fill({ color: a });
        g.rect(cx - 5, B - 2, 10, 2).fill({ color: darken(a, 0.7) });
        g.poly([L + 2, T + 9, R - 2, T + 5, R - 2, T + 8, L + 2, T + 12]).fill({ color: darken(a, 0.85) });
        g.poly([L + 3, T + 8, R - 3, T + 4.5, R - 3, T + 6, L + 3, T + 9.5]).fill({ color: c2 });
        break;
      }
      const top = v === 'trough' ? B - 7 : B - 9;
      if (v === 'trough') {
        g.poly([L + 1, top, R - 1, top, R - 3, B - 1, L + 3, B - 1]).fill({ color: a });
        g.rect(L + 3, top + 1, w - 6, 2).fill({ color: c2 });
        break;
      }
      g.rect(L + 1, top, w - 2, 2).fill({ color: a });
      g.rect(L + 2, top + 2, 1.5, B - top - 2).fill({ color: darken(a, 0.7) });
      g.rect(R - 3.5, top + 2, 1.5, B - top - 2).fill({ color: darken(a, 0.7) });
      if (w >= 32) g.rect(cx - 0.75, top + 2, 1.5, B - top - 2).fill({ color: darken(a, 0.7) });
      if (v === 'desk' || v === 'scribe' || v === 'quill') {
        g.rect(L + 3, top - 1.5, 6, 1.5).fill({ color: c2 });
        if (v === 'scribe') { g.rect(R - 5, top - 4, 1.5, 4).fill({ color: CLOTH }); flame(g, R - 4.25, top - 4, 0.5); }
        if (v === 'quill') line(g, cx + 2, top - 2 - (f % 2), cx + 5, top - 8 - (f % 2), 0xf6f1e8, 1);
      } else if (v === 'tea') {
        g.circle(cx, top - 2.5, 2.5).fill({ color: c2 });
        g.rect(cx + 2, top - 4, 2, 1).fill({ color: c2 });
        g.circle(cx - 0.5, top - 7 - f, 1.2).fill({ color: 0xffffff, alpha: 0.45 });
      } else if (v === 'chess') {
        for (let i = 0; i < 4; i++) g.rect(L + 3 + i * 2.5, top - 1, 2.5, 1).fill({ color: i % 2 ? c2 : 0x1b1822 });
        g.rect(L + 5, top - 3.5, 1.5, 2.5).fill({ color: c2 });
        g.rect(R - 6, top - 3.5, 1.5, 2.5).fill({ color: 0x1b1822 });
      } else if (v === 'map') {
        g.rect(L + 3, top - 1, w - 6, 1).fill({ color: c2 });
        g.circle(cx + 3, top - 1.5, 1).fill({ color: RED });
      } else if (v === 'long') {
        for (let i = 0; i < 3; i++) g.ellipse(L + 6 + i * 10, top - 0.5, 2.5, 0.8).fill({ color: c2 });
        g.rect(L + 3, B - 4, w - 6, 1.5).fill({ color: darken(a, 0.6) }); // bench
      } else if (v === 'potting') {
        g.rect(L + 3, top - 3, 3, 3).fill({ color: COPPER });
        g.ellipse(L + 4.5, top - 4.5, 2, 1.5).fill({ color: c2 });
        g.rect(R - 7, top - 3, 3, 3).fill({ color: COPPER });
      } else if (v === 'desks') {
        g.rect(L + 3, top - 1, 4, 1).fill({ color: c2 });
        g.rect(R - 7, top - 1, 4, 1).fill({ color: c2 });
        g.rect(L + 7, B - 4, 3, 4).fill({ color: darken(a, 0.6) });
        g.rect(R - 10, B - 4, 3, 4).fill({ color: darken(a, 0.6) });
      } else if (v === 'work') {
        g.rect(L + 4, top - 2, 6, 2).fill({ color: c2 });
        g.rect(R - 9, top - 4, 2, 4).fill({ color: WL });
        g.rect(L + 3, B - 3, 4, 2).fill({ color: 0xc28e5c, alpha: 0.6 }); // sawdust
      }
      break;
    }
    case 'bed': {
      if (v === 'hammock') {
        line(g, L + 1, T + 3, L + 1, B, WD, 1.5);
        line(g, R - 1, T + 3, R - 1, B, WD, 1.5);
        g.poly([L + 1, T + 6, cx, T + 11, R - 1, T + 6, cx, T + 9]).fill({ color: a });
        break;
      }
      if (v === 'bunk') {
        for (const yb of [B - 2, B - 12]) {
          g.rect(L + 1, yb - 3, w - 2, 3).fill({ color: c2 });
          g.rect(L + 1, yb - 4, 4, 1.5).fill({ color: 0xf6f1e8 });
          g.rect(L + 1, yb, w - 2, 1.5).fill({ color: a });
        }
        g.rect(L, T + 2, 1.5, h - 2).fill({ color: a });
        g.rect(R - 1.5, T + 2, 1.5, h - 2).fill({ color: a });
        break;
      }
      const low = v === 'cot' ? 4 : 6;
      g.rect(L + 1, B - low, w - 2, low - 1.5).fill({ color: a });
      g.rect(L, B - low - 3, 2, low + 3).fill({ color: darken(a, 0.8) }); // headboard
      g.rect(R - 2, B - low - 1, 2, low + 1).fill({ color: darken(a, 0.8) });
      g.rect(L + 2, B - low - 2, w - 4, 2.5).fill({ color: v === 'moss' ? a : 0xf6f1e8 }); // mattress
      g.rect(L + 2.5, B - low - 3.5, 4, 2).fill({ color: 0xffffff }); // pillow
      g.rect(L + 7, B - low - 2.5, w - 9.5, 3).fill({ color: c2 }); // blanket
      if (v === 'canopy') {
        g.rect(L, T, 1.5, h).fill({ color: darken(a, 0.8) });
        g.rect(R - 1.5, T, 1.5, h).fill({ color: darken(a, 0.8) });
        g.rect(L, T, w, 2).fill({ color: c2 });
        g.poly([L + 1.5, T + 2, L + 5, T + 2, L + 1.5, T + 9]).fill({ color: c2, alpha: 0.8 });
      } else if (v === 'dream') {
        g.circle(L + 2, T + 4, 2.5).stroke({ color: c2, width: 0.75 });
        line(g, L + 2, T + 6.5, L + 2, T + 9, c2, 0.75);
      } else if (v === 'moss') {
        for (let i = 0; i < 4; i++) g.circle(L + 6 + i * 6, B - low - 2, 1.2).fill({ color: c2 });
      } else if (v === 'feather') {
        g.rect(L + 7, B - low - 3.5, w - 9.5, 1).fill({ color: 0xffffff, alpha: 0.7 });
      }
      break;
    }
    case 'seat': {
      if (v === 'cushions') {
        g.ellipse(cx - 3.5, B - 2, 4, 2).fill({ color: a });
        g.ellipse(cx + 3.5, B - 2, 4, 2).fill({ color: c2 });
        g.ellipse(cx, B - 4, 3.5, 1.8).fill({ color: mix(a, 0xffffff, 0.3) });
      } else if (v === 'bench') {
        g.rect(L + 1, B - 6, w - 2, 2).fill({ color: a });
        g.rect(L + 3, B - 4, 2, 4).fill({ color: darken(a, 0.7) });
        g.rect(R - 5, B - 4, 2, 4).fill({ color: darken(a, 0.7) });
        if (c2 === LEAF) for (let i = 0; i < 3; i++) g.circle(L + 6 + i * 9, B - 6.5, 1.5).fill({ color: c2 });
      } else if (v === 'chair') {
        // Compact 8px oak dining chair centered inside the 16x16 slot
        g.rect(cx - 3.5, B - 11, 7, 1.5).fill({ color: a }); // top rail
        g.rect(cx - 3, B - 9.5, 1.2, 4.5).fill({ color: c2 }); // left stile
        g.rect(cx + 1.8, B - 9.5, 1.2, 4.5).fill({ color: c2 }); // right stile
        g.rect(cx - 4, B - 5, 8, 1.6).fill({ color: a }); // seat
        g.rect(cx - 3.5, B - 3.4, 1.3, 3.4).fill({ color: c2 }); // left leg
        g.rect(cx + 2.2, B - 3.4, 1.3, 3.4).fill({ color: c2 }); // right leg
      } else {
        const back = v === 'armchair' ? 11 : 9;
        g.rect(L + 1, B - back, w - 2, back - 5).fill({ color: darken(a, 0.85) }); // back
        g.rect(L + 1, B - 6, w - 2, 4).fill({ color: a }); // seat
        g.rect(L, B - 8, 3, 6).fill({ color: mix(a, 0x000000, 0.1) }); // arms
        g.rect(R - 3, B - 8, 3, 6).fill({ color: mix(a, 0x000000, 0.1) });
        g.rect(L + 1.5, B - 2, 1.5, 2).fill({ color: c2 });
        g.rect(R - 3, B - 2, 1.5, 2).fill({ color: c2 });
      }
      break;
    }
    case 'vessel': {
      if (v === 'tank') {
        g.rect(L + 1, T + 2, w - 2, h - 4).fill({ color: a, alpha: 0.55 });
        g.rect(L + 1, T + 2, w - 2, h - 4).stroke({ color: SL, width: 1 });
        g.rect(L + 1, B - 3, w - 2, 3).fill({ color: SD });
        for (let i = 0; i < 3; i++) {
          const kx = L + 6 + i * 9, sway = [0, 1, 0, -1][(f + i) % 4];
          line(g, kx, B - 3, kx + sway, T + 12 + i * 3, c2, 1.5);
        }
        g.circle(L + 8, T + 8 - f * 1.5, 1).fill({ color: 0xffffff, alpha: 0.7 });
        g.circle(R - 8, T + 14 - ((f + 2) % 4) * 1.5, 0.8).fill({ color: 0xffffff, alpha: 0.7 });
      } else if (v === 'bowl') {
        g.circle(cx, B - 5, 5).fill({ color: a, alpha: 0.6 });
        g.circle(cx, B - 5, 5).stroke({ color: SL, width: 0.75 });
        g.ellipse(cx - 1 + (f % 2) * 2, B - 5, 1.5, 1).fill({ color: c2 });
        g.rect(cx - 3, B - 1, 6, 1).fill({ color: WD });
      } else if (v === 'tub' || v === 'basin') {
        g.poly([L + 1, B - 8, R - 1, B - 8, R - 3, B, L + 3, B]).fill({ color: a });
        g.rect(L + 2, B - 8, w - 4, 2).fill({ color: c2 });
        g.circle(L + 8 + f * 3, B - 11 - f, 1.5).fill({ color: 0xffffff, alpha: 0.3 });
        g.circle(R - 8 - f * 2, B - 12 - (f % 2), 1.5).fill({ color: 0xffffff, alpha: 0.3 });
      } else if (v === 'barrel') {
        g.rect(L + 3, B - 12, w - 6, 12).fill({ color: a });
        g.rect(L + 3, B - 10, w - 6, 1).fill({ color: IRON });
        g.rect(L + 3, B - 3, w - 6, 1).fill({ color: IRON });
        g.ellipse(cx, B - 12, (w - 6) / 2, 1.5).fill({ color: c2 });
      } else if (v === 'brazier') {
        g.poly([L + 2, B - 7, R - 2, B - 7, cx + 2, B - 2, cx - 2, B - 2]).fill({ color: a });
        g.rect(cx - 0.75, B - 2, 1.5, 2).fill({ color: a });
        g.ellipse(cx, B - 7.5, 5, 1.5).fill({ color: c2 });
        flame(g, cx, B - 8, 0.9, f);
      } else if (v === 'alembic') {
        g.rect(L + 2, B - 3, w - 4, 3).fill({ color: WD });
        g.circle(L + 9, B - 9, 6).fill({ color: a, alpha: 0.7 });
        g.circle(L + 9, B - 9, 6).stroke({ color: c2, width: 1 });
        line(g, L + 13, B - 14, R - 7, T + 8, c2, 1.5);
        g.circle(R - 8, B - 7, 4).fill({ color: 0x7db861, alpha: 0.8 });
        g.circle(L + 8, B - 11 - f, 1).fill({ color: 0xffffff, alpha: 0.7 });
      } else if (v === 'habitat') {
        g.rect(L + 1, T + 2, w - 2, h - 2).fill({ color: a });
        g.rect(L + 2, T + 3, w - 4, h - 5).fill({ color: c2, alpha: 0.8 });
        for (let i = 0; i < 4; i++) line(g, L + 5 + i * 7, B - 3, L + 5 + i * 7 + [0, 1, 0, -1][(f + i) % 4], B - 7, 0x2f5a2a, 1);
      } else {
        // cauldron / stewpot
        const big = h > 16;
        const r = big ? 6 : 5;
        g.ellipse(cx, B - r, r + 1, r).fill({ color: a });
        g.ellipse(cx, B - 2 * r + 1, r, 1.5).fill({ color: c2 });
        g.rect(cx - r, B - 1.5, 2, 1.5).fill({ color: a });
        g.rect(cx + r - 2, B - 1.5, 2, 1.5).fill({ color: a });
        const by = B - 2 * r - 1 - f * 1.2;
        g.circle(cx - 1.5 + (f % 2), by, 1).fill({ color: mix(c2, 0xffffff, 0.4), alpha: 0.85 });
        if (big) flame(g, cx, B, 0.8, f);
      }
      break;
    }
    case 'lamp': {
      if (art.anchor === 'ceiling') {
        if (v === 'floating') {
          for (let i = 0; i < 3; i++) {
            const bob = [0, 0.75, 1, 0.75][(f + i) % 4];
            const lx = L + 3 + i * 5, ly = T + 6 + (i % 2) * 3 + bob;
            g.rect(lx, ly, 2, 4).fill({ color: a });
            flame(g, lx + 1, ly, 0.45, (f + i) % 4);
          }
        } else if (v === 'chandelier' || v === 'halo') {
          line(g, cx, T, cx, T + 4, IRON, 1);
          g.ellipse(cx, T + 6, 6, 2).stroke({ color: a, width: 1.5 });
          for (let i = 0; i < 3; i++) flame(g, cx - 5 + i * 5, T + 5, 0.45, (f + i) % 4);
          if (v === 'chandelier') for (let i = 0; i < 3; i++) g.circle(cx - 4 + i * 4, T + 10 + ((f + i) % 2), 0.8).fill({ color: c2 });
        } else if (v === 'bell' || v === 'bells') {
          const sw = [-1, 0, 1, 0][f];
          const n = v === 'bells' ? 3 : 1;
          for (let i = 0; i < n; i++) {
            const bx = n === 1 ? cx : L + 3 + i * 5;
            line(g, bx, T, bx + sw, T + 4, IRON, 0.75);
            g.poly([bx + sw - 2.5, T + 9, bx + sw + 2.5, T + 9, bx + sw + 1.5, T + 4, bx + sw - 1.5, T + 4]).fill({ color: a });
          }
        } else if (v === 'chimes') {
          line(g, L + 3, T + 2, R - 3, T + 2, a, 1);
          for (let i = 0; i < 4; i++) line(g, L + 4 + i * 2.7, T + 2, L + 4 + i * 2.7 + [0, 0.5, 0, -0.5][(f + i) % 4], T + 7 + (i % 2) * 2, c2, 1);
        } else {
          line(g, cx, T, cx, T + 4, a, 1);
          g.rect(cx - 3, T + 4, 6, 7).fill({ color: a });
          g.rect(cx - 2, T + 5, 4, 5).fill({ color: c2, alpha: [0.75, 0.95, 0.85, 1][f] });
        }
      } else if (v === 'sconce') {
        g.rect(cx - 1, T + h / 2, 2, 4).fill({ color: a });
        g.rect(cx - 3, T + h / 2 + 3, 6, 1.5).fill({ color: a });
        g.rect(cx - 1, T + h / 2 - 3, 2, 3).fill({ color: c2 });
        flame(g, cx, T + h / 2 - 3, 0.6, f);
      } else if (v === 'deskbell') {
        g.rect(L + 3, B - 2, w - 6, 2).fill({ color: c2 });
        g.ellipse(cx, B - 4, 4, 3).fill({ color: a });
        g.circle(cx, B - 7.5, 1).fill({ color: a });
      } else {
        // standing / post lantern
        g.rect(cx - 0.75, T + 6, 1.5, h - 6).fill({ color: a });
        g.rect(cx - 3, B - 1.5, 6, 1.5).fill({ color: a });
        g.rect(cx - 2.5, T + 1, 5, 6).fill({ color: a });
        g.rect(cx - 1.5, T + 2, 3, 4).fill({ color: c2, alpha: [0.75, 0.95, 0.85, 1][f] });
      }
      break;
    }
    case 'plant': {
      if (v === 'tree') {
        g.rect(cx - 1, T + 8, 2, h - 8).fill({ color: c2 });
        line(g, cx, T + 12, L + 2, T + 9, c2, 1);
        line(g, cx, T + 15, R - 2, T + 12, c2, 1);
        g.circle(cx, T + 6, 6).fill({ color: a });
        g.circle(L + 3, T + 8, 3).fill({ color: darken(a, 0.85) });
        g.circle(R - 3, T + 11, 3).fill({ color: darken(a, 0.85) });
      } else if (v === 'bed') {
        g.rect(L + 1, B - 6, w - 2, 6).fill({ color: c2 });
        g.rect(L + 1, B - 7, w - 2, 1.5).fill({ color: WD });
        for (let i = 0; i < 5; i++) {
          const px = L + 4 + i * 6;
          g.ellipse(px, B - 9, 2, 2.5).fill({ color: a });
          line(g, px, B - 7, px, B - 10, darken(a, 0.7), 0.75);
        }
      } else if (v === 'mushroom') {
        for (let i = 0; i < 3; i++) {
          const mx = L + 3 + i * 5, my = T + 5 + (i % 2) * 3;
          line(g, mx, T, mx, my, 0x5a4030, 0.75);
          g.ellipse(mx, my, 2.5, 1.5).fill({ color: c2, alpha: [0.7, 0.9, 1, 0.85][(f + i) % 4] });
        }
      } else if (v === 'ring') {
        for (let i = 0; i < 6; i++) {
          const mx = L + 2 + i * 2.4;
          g.rect(mx, B - 3, 0.75, 2).fill({ color: a });
          g.ellipse(mx + 0.4, B - 3, 1.3, 0.9).fill({ color: i % 2 ? a : c2 });
        }
        g.circle(cx + [0, 2, 0, -2][f], B - 7 - (f % 2), 0.7).fill({ color: 0xf7e39a });
      } else if (v === 'box') {
        g.rect(L + 1, T + h / 2 + 2, w - 2, 4).fill({ color: c2 });
        for (let i = 0; i < 4; i++) g.ellipse(L + 3 + i * 3.5, T + h / 2 + 1, 1.8, 2.2).fill({ color: i % 2 ? a : darken(a, 0.8) });
      } else {
        g.poly([cx - 4, B - 6, cx + 4, B - 6, cx + 3, B, cx - 3, B]).fill({ color: c2 });
        for (let i = -2; i <= 2; i++) g.ellipse(cx + i * 2.2, B - 9 - (2 - Math.abs(i)) * 1.5, 1.6, 3.2).fill({ color: i % 2 ? a : darken(a, 0.8) });
      }
      break;
    }
    case 'hanging': {
      if (v === 'rug') {
        g.ellipse(cx, B - 1, w / 2 - 1, 1.5).fill({ color: a });
        g.ellipse(cx, B - 1, w / 2 - 4, 0.8).fill({ color: c2 });
        break;
      }
      if (v === 'board' || v === 'chart') {
        g.rect(L + 1, T + 2, w - 2, h - 5).fill({ color: darken(c2 === CLOTH ? WD : GOLD, 0.8) });
        g.rect(L + 2, T + 3, w - 4, h - 7).fill({ color: a });
        if (v === 'board') {
          line(g, L + 4, T + 6, R - 5, T + 6, c2, 0.75);
          line(g, L + 4, T + 9, cx, T + 9, c2, 0.75);
        } else {
          for (let i = 0; i < 4; i++) g.rect(L + 4 + i * 2.5, T + 5 + (i % 3) * 2, 1, 1).fill({ color: c2 });
          line(g, L + 4, T + 5, L + 9, T + 9, c2, 0.5);
        }
        break;
      }
      if (v === 'curtain') {
        g.rect(L + 1, T + 1, w - 2, 1.5).fill({ color: IRON });
        const sw = [0, 0.75, 0, -0.75][f];
        g.poly([L + 2, T + 2, L + 7, T + 2, L + 5 + sw, B - 1, L + 2 + sw, B - 1]).fill({ color: a });
        g.poly([R - 7, T + 2, R - 2, T + 2, R - 2 + sw, B - 1, R - 5 + sw, B - 1]).fill({ color: a });
        g.circle(cx, T + 6, 1.5).fill({ color: c2, alpha: 0.8 });
        break;
      }
      // tapestry / banner (tint + glyph)
      const col = v === 'banner' ? tint : a;
      g.rect(L + 2, T + 1, w - 4, 1.5).fill({ color: WD });
      g.poly([L + 3, T + 2, R - 3, T + 2, R - 3, B - 3, cx, B - 1, L + 3, B - 3]).fill({ color: col });
      g.rect(L + 3, T + 2, w - 6, 1).fill({ color: c2 });
      glyph(g, v === 'banner' ? glyphKind : 'shield', cx, T + h / 2, 2.5, c2);
      break;
    }
    case 'frame': {
      if (v === 'door' || v === 'arch') {
        g.rect(L, T + 4, w, h - 4).fill({ color: darken(a, 0.8) });
        g.ellipse(cx, T + 5, w / 2, 5).fill({ color: darken(a, 0.8) });
        if (v === 'door') {
          g.rect(L + 2, T + 6, w - 4, h - 6).fill({ color: a });
          g.ellipse(cx, T + 6, w / 2 - 2, 3.5).fill({ color: a });
          line(g, cx, T + 4, cx, B, darken(a, 0.6), 1);
          g.circle(cx - 2, T + h * 0.6, 0.9).fill({ color: c2 });
          g.circle(cx + 2, T + h * 0.6, 0.9).fill({ color: c2 });
          for (const yy of [T + 10, B - 6]) g.rect(L + 2, yy, w - 4, 1).fill({ color: IRON });
        } else {
          g.rect(L + 4, T + 8, w - 8, h - 8).fill({ color: 0x1b1822 });
          g.ellipse(cx, T + 8, w / 2 - 4, 4).fill({ color: 0x1b1822 });
          const r0 = [0.55, 0.7, 0.85, 0.7][f];
          g.ellipse(cx, T + h * 0.55, (w / 2 - 6) * r0, (h / 2 - 6) * r0).fill({ color: c2, alpha: 0.85 });
          g.ellipse(cx, T + h * 0.55, (w / 2 - 9) * r0, (h / 2 - 10) * r0).fill({ color: 0x9bd4ff, alpha: 0.7 });
        }
        break;
      }
      if (v === 'loom') {
        g.rect(L + 1, T + 2, 1.5, h - 2).fill({ color: a });
        g.rect(R - 2.5, T + 2, 1.5, h - 2).fill({ color: a });
        g.rect(L + 1, T + 2, w - 2, 1.5).fill({ color: a });
        g.rect(L + 3, T + 5, w - 6, h * 0.45).fill({ color: c2 });
        for (let x = L + 4; x < R - 3; x += 2) line(g, x, T + 4, x, B - 3, 0xf6f1e8, 0.4);
        g.rect(L + 2 + f * ((w - 8) / 3), T + h * 0.55, 4, 1.5).fill({ color: WL });
        g.rect(L + 1, B - 2, w - 2, 2).fill({ color: darken(a, 0.7) });
        break;
      }
      if (v === 'darts') {
        line(g, cx, B, cx, B - 6, WD, 1.5);
        g.circle(cx, B - 10, 5).fill({ color: c2 });
        g.circle(cx, B - 10, 3.5).fill({ color: a });
        g.circle(cx, B - 10, 1.5).fill({ color: c2 });
        break;
      }
      const isFloor = art.anchor === 'floor';
      const fT = isFloor ? T + 1 : T + 2, fH = isFloor ? h - 3 : h - 4;
      g.rect(L + 2, fT, w - 4, fH).fill({ color: a });
      if (isFloor) g.rect(cx - 4, B - 2, 8, 2).fill({ color: darken(a, 0.7) });
      const iL = L + 3.5, iT = fT + 1.5, iW = w - 7, iH = fH - 3;
      if (v === 'mirror') {
        g.ellipse(cx, iT + iH / 2, iW / 2, iH / 2).fill({ color: c2 });
        g.poly([iL, iT, iL + iW, iT, iL + iW, iT + iH * 0.55, iL, iT + iH * 0.3]).fill({ color: 0x2f3a73, alpha: 0.85 }); // veil
      } else if (v === 'window' || v === 'pane') {
        g.rect(iL, iT, iW, iH).fill({ color: c2, alpha: v === 'pane' ? [0.6, 0.75, 0.9, 0.75][f] : 0.9 });
        line(g, cx, iT, cx, iT + iH, a, 0.75);
        line(g, iL, iT + iH / 2, iL + iW, iT + iH / 2, a, 0.75);
      } else if (v === 'portrait') {
        g.rect(iL, iT, iW, iH).fill({ color: c2 });
        g.circle(cx, iT + iH * 0.4, 2).fill({ color: 0xedc0a0 });
        g.rect(cx - 3, iT + iH * 0.62, 6, iH * 0.38).fill({ color: tint });
      } else {
        g.rect(iL, iT, iW, iH).fill({ color: c2 });
        for (let i = 0; i < 3; i++) line(g, iL + 1.5, iT + 2 + i * 2.5, iL + iW - 1.5 - (i % 2) * 2, iT + 2 + i * 2.5, 0x5a4030, 0.6);
      }
      break;
    }
    case 'orb': {
      if (v === 'telescope') {
        g.poly([cx - 6, B, cx, B - 12, cx + 6, B]).stroke({ color: darken(a, 0.7), width: 1.5 });
        const tilt = [0, 1, 2, 1][f];
        g.poly([cx - 3, B - 10, R - 2, T + 3 + tilt, R - 1, T + 8 + tilt, cx - 1, B - 7]).fill({ color: a });
        g.circle(R - 1.5, T + 5.5 + tilt, 2.5).fill({ color: c2 });
        g.rect(L + 6, B - 3, w - 12, 3).fill({ color: darken(a, 0.6) });
        break;
      }
      if (v === 'geode') {
        g.ellipse(cx, B - 4, w / 2 - 1, 4).fill({ color: a });
        for (let i = 0; i < 5; i++) {
          const gx = L + 5 + i * 5.5, gh = 4 + ((i * 3) % 4);
          g.poly([gx - 2, B - 4, gx, B - 4 - gh, gx + 2, B - 4]).fill({ color: i % 2 ? c2 : mix(c2, 0xffffff, 0.35) });
        }
        break;
      }
      const glow = [0.25, 0.4, 0.55, 0.4][f];
      if (v === 'orrery' || v === 'focus') {
        const r0 = v === 'focus' ? 9 : 5;
        const cy0 = B - (v === 'focus' ? 18 : 13);
        g.rect(cx - 1, cy0, 2, B - cy0).fill({ color: darken(a, 0.75) });
        g.rect(cx - 4, B - 2, 8, 2).fill({ color: darken(a, 0.75) });
        g.circle(cx, cy0, r0 + 2).fill({ color: tint, alpha: glow });
        g.ellipse(cx, cy0, r0 + 1, r0 * 0.4).stroke({ color: a, width: 1 });
        g.circle(cx, cy0, r0 * 0.5).fill({ color: GOLD });
        const ang = (f * Math.PI) / 2;
        g.circle(cx + Math.cos(ang) * (r0 + 1), cy0 + Math.sin(ang) * r0 * 0.4, 1.3).fill({ color: tint });
        break;
      }
      if (v === 'globe') {
        g.rect(cx - 3, B - 2, 6, 2).fill({ color: a });
        line(g, cx, B - 2, cx, B - 5, a, 1);
        g.circle(cx, B - 9, 4.5).fill({ color: c2 });
        g.ellipse(cx - 1, B - 10, 2, 1.5).fill({ color: 0x7db861 });
        g.circle(cx, B - 9, 5.5).stroke({ color: a, width: 0.75 });
        break;
      }
      // orb stand
      g.rect(cx - 1, T + 8, 2, h - 8).fill({ color: a });
      g.rect(cx - 4, B - 2, 8, 2).fill({ color: a });
      g.poly([cx - 3, T + 9, cx + 3, T + 9, cx + 1.5, T + 7, cx - 1.5, T + 7]).fill({ color: a });
      g.circle(cx, T + 4, 6).fill({ color: tint, alpha: glow });
      g.circle(cx, T + 4, 3.5).fill({ color: tint });
      g.circle(cx - 1, T + 3, 1).fill({ color: 0xffffff, alpha: 0.8 });
      break;
    }
    case 'statue': {
      switch (v) {
        case 'altar':
          g.rect(L + 2, B - 8, w - 4, 8).fill({ color: a });
          g.rect(L + 1, B - 9, w - 2, 2).fill({ color: darken(a, 0.85) });
          glyph(g, 'sun', cx, T + 6, 4, c2);
          break;
        case 'plinth':
          g.rect(L + 4, B - 12, w - 8, 12).fill({ color: a });
          g.rect(L + 3, B - 13, w - 6, 2).fill({ color: darken(a, 0.85) });
          g.poly([cx, T + 3, cx + 3, T + 7, cx, T + 10, cx - 3, T + 7]).fill({ color: c2 });
          break;
        case 'dummy':
          g.rect(cx - 0.75, T + 6, 1.5, h - 6).fill({ color: c2 });
          g.ellipse(cx, T + 11, 3.5, 4.5).fill({ color: a });
          g.circle(cx, T + 4, 2.5).fill({ color: a });
          line(g, cx - 5, T + 9, cx + 5, T + 9, c2, 1.5);
          g.rect(cx - 3, B - 1.5, 6, 1.5).fill({ color: c2 });
          break;
        case 'gnome':
          g.ellipse(cx, B - 4, 3.5, 4).fill({ color: c2 });
          g.circle(cx, B - 9, 2.5).fill({ color: 0xedc0a0 });
          g.poly([cx - 3, B - 10, cx + 3, B - 10, cx, B - 16]).fill({ color: a });
          g.poly([cx - 2, B - 8.5, cx + 2, B - 8.5, cx, B - 5]).fill({ color: 0xf6f1e8 });
          break;
        case 'scarecrow':
          g.rect(cx - 0.75, T + 4, 1.5, h - 4).fill({ color: WD });
          line(g, L + 2, T + 9, R - 2, T + 9, WD, 1.5);
          g.rect(cx - 3, T + 8, 6, 8).fill({ color: c2 });
          g.circle(cx, T + 5, 2.5).fill({ color: a });
          g.poly([cx - 4, T + 3, cx + 4, T + 3, cx, T - 1]).fill({ color: WD });
          break;
        case 'birdbath':
          g.rect(cx - 1.5, B - 12, 3, 12).fill({ color: a });
          g.rect(cx - 4, B - 2, 8, 2).fill({ color: a });
          g.ellipse(cx, B - 13, 6, 2.5).fill({ color: a });
          g.ellipse(cx, B - 13.5, 4.5, 1.2).fill({ color: c2 });
          break;
        case 'stonelantern':
          g.rect(cx - 1.5, B - 10, 3, 10).fill({ color: a });
          g.rect(cx - 4, B - 2, 8, 2).fill({ color: a });
          g.rect(cx - 3.5, T + 7, 7, 6).fill({ color: a });
          g.rect(cx - 2, T + 8.5, 4, 3).fill({ color: c2, alpha: 0.9 });
          g.poly([cx - 5, T + 7, cx + 5, T + 7, cx, T + 2]).fill({ color: darken(a, 0.8) });
          break;
        case 'windmill': {
          g.poly([cx - 3, B, cx + 3, B, cx + 1.5, T + 9, cx - 1.5, T + 9]).fill({ color: a });
          const ang = (f * Math.PI) / 8;
          for (let i = 0; i < 4; i++) {
            const t = ang + (i * Math.PI) / 2;
            line(g, cx, T + 8, cx + Math.cos(t) * 7, T + 8 + Math.sin(t) * 7, c2, 1.5);
          }
          g.circle(cx, T + 8, 1).fill({ color: WD });
          break;
        }
        case 'rune':
          g.poly([cx - 4, B, cx + 4, B, cx + 3, B - 12, cx, B - 14, cx - 3, B - 12]).fill({ color: a });
          g.rect(cx - 1, B - 10, 2, 5).fill({ color: c2, alpha: [0.5, 0.75, 1, 0.75][f] });
          g.rect(cx - 2, B - 8, 4, 1).fill({ color: c2, alpha: [0.5, 0.75, 1, 0.75][f] });
          break;
        case 'runering': {
          g.ellipse(cx, B - 2, w / 2 - 1, 2).stroke({ color: a, width: 1 });
          for (let i = 0; i < 4; i++) {
            const t = ((i + f * 0.25) * Math.PI) / 2;
            g.rect(cx + Math.cos(t) * (w / 2 - 2) - 0.75, B - 2 + Math.sin(t) * 1.6 - 0.75, 1.5, 1.5).fill({ color: c2 });
          }
          break;
        }
        case 'burrow':
          g.ellipse(cx, B - 4, w / 2 - 1, 5).fill({ color: c2 });
          g.ellipse(cx, B - 3, 4, 3).fill({ color: a });
          break;
        case 'rock':
          g.ellipse(cx, B - 3, 6, 3.5).fill({ color: a });
          g.ellipse(cx - 1, B - 5, 3, 1).fill({ color: c2, alpha: 0.5 });
          break;
        case 'hearthstone':
          g.ellipse(cx, B - 3, 5.5, 3).fill({ color: a });
          g.ellipse(cx, B - 4, 3, 1.2).fill({ color: c2, alpha: [0.5, 0.8, 0.65, 0.9][f] });
          break;
        case 'broom': {
          const t = [-1, 0, 1, 0][f];
          line(g, cx + 3 + t, T + 2, cx - 1, B - 5, a, 1.5);
          g.poly([cx - 4, B, cx + 2, B, cx + 0.5, B - 6, cx - 2.5, B - 6]).fill({ color: c2 });
          break;
        }
        default: // familiar statue
          g.rect(L + 3, B - 5, w - 6, 5).fill({ color: c2 });
          g.ellipse(cx, B - 10, 4, 5).fill({ color: a });
          g.circle(cx, B - 17, 3).fill({ color: a });
          g.poly([cx - 3, B - 19, cx - 2, B - 22, cx - 0.5, B - 19]).fill({ color: a });
          g.poly([cx + 0.5, B - 19, cx + 2, B - 22, cx + 3, B - 19]).fill({ color: a });
      }
      break;
    }
  }
  void outline;
}
