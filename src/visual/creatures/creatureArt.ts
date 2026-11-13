/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forge pixel art for all 40 Ankicaster creatures, eggs, bubbles & taming rings
 * Implements Addendum Section 8 & Appendix A.3:
 * - Frame sizes: 16x16 (common/uncommon), 24x24 (rare), 32x32 (epic/legendary), 48x32 (philosophers_chimera)
 * - Eggs by rarity with <50% still, 50-90% 6s wobble, >90% 2s wobble + crack line
 * - Species-specific silhouettes for all 40 CREATURE_DEFINITIONS entries
 * - Wary, tamed (Bond 3 foot sparkle), loose (dashed outline), legendary aura, unhomed bundle
 */

import { CREATURE_DEFINITIONS } from '../../data/content';
import type { CreatureInstance, CreatureDefinition } from '../../types/ankicaster';
import { PALETTE } from '../sprites/forge/palettes';
import { Painter, hex, line, darken, mix, glyph } from '../rooms/painter';

export type CreatureAnim = 'idle' | 'move' | 'eat' | 'sleep' | 'trouble';

export const CREATURE_RARITY_REQUIREMENT: Record<CreatureDefinition['rarity'], number> = {
  common: 40,
  uncommon: 90,
  rare: 160,
  epic: 260,
  legendary: 400
};

export function creatureSize(defId: string): { w: number; h: number } {
  if (defId === 'philosophers_chimera') return { w: 48, h: 32 };
  const rarity = CREATURE_DEFINITIONS[defId]?.rarity ?? 'common';
  if (rarity === 'epic' || rarity === 'legendary') return { w: 32, h: 32 };
  if (rarity === 'rare') return { w: 24, h: 24 };
  return { w: 16, h: 16 };
}

export function tamingRequirement(defId: string): number {
  const def = CREATURE_DEFINITIONS[defId];
  if (def && Number.isFinite(def.tamingReviews)) return def.tamingReviews;
  const r = def?.rarity ?? 'common';
  return CREATURE_RARITY_REQUIREMENT[r] ?? 40;
}

export function tamingRingFraction(creature: Pick<CreatureInstance, 'defId' | 'tamingProgress'>): number {
  const req = Math.max(1, tamingRequirement(creature.defId));
  return Math.max(0, Math.min(1, (creature.tamingProgress ?? 0) / req));
}

export function eggWobbleOffset(hatchProgress: number, clockMs: number, reduceMotion: boolean): number {
  if (reduceMotion || hatchProgress < 50) return 0;
  const period = hatchProgress > 90 ? 2000 : 6000;
  const phase = ((clockMs % period) + period) % period;
  if (phase > 450) return 0;
  return Math.sin((phase / 450) * Math.PI * 3) * 1.4;
}

const RARITY_EGG_COLOR: Record<CreatureDefinition['rarity'], { shell: number; spot: number; rim: number }> = {
  common: { shell: 0xe3dbce, spot: 0xc2b29b, rim: 0x8a7d6d },
  uncommon: { shell: 0x9ccb72, spot: 0x4e8b3a, rim: 0x2f5e24 },
  rare: { shell: 0x9cd4ff, spot: 0x4c8ad6, rim: 0x274d8a },
  epic: { shell: 0xb9a6ff, spot: 0x6b4fbb, rim: 0x3b2678 },
  legendary: { shell: 0xf7e39a, spot: 0xe8752a, rim: 0x8f5518 }
};

export function drawCreatureEgg(
  g: Painter,
  rarity: CreatureDefinition['rarity'],
  x: number,
  y: number,
  hatchProgress: number,
  clockMs: number,
  reduceMotion: boolean
): void {
  const cols = RARITY_EGG_COLOR[rarity] ?? RARITY_EGG_COLOR.common;
  const wobble = eggWobbleOffset(hatchProgress, clockMs, reduceMotion);
  const ex = x + wobble;
  // Straw nest base (12 x 5)
  g.ellipse(x, y - 1.5, 6.5, 2.2).fill({ color: 0x9e7738 });
  g.ellipse(x, y - 2, 5.5, 1.5).fill({ color: 0xc9a45c });
  for (let i = -4; i <= 4; i += 2) {
    line(g, x + i, y - 1, x + i + (i % 4 === 0 ? 1 : -1), y - 3.2, 0xe0c48a, 0.7);
  }
  // Egg silhouette (10 x 12)
  g.ellipse(ex, y - 6.2, 4.2, 5.4).fill({ color: cols.rim });
  g.ellipse(ex, y - 6.3, 3.6, 4.8).fill({ color: cols.shell });
  g.circle(ex - 1.2, y - 5.2, 0.9).fill({ color: cols.spot });
  g.circle(ex + 1.3, y - 7.8, 0.8).fill({ color: cols.spot });
  // Slight shine (<50 still / subtle glint on loop)
  const shineAlpha = reduceMotion ? 0.65 : hatchProgress < 50 ? 0.55 + 0.35 * Math.sin(clockMs / 400) : 0.7;
  g.ellipse(ex - 1.3, y - 8.4, 0.8, 1.5).fill({ color: 0xffffff, alpha: Math.max(0.2, Math.min(1, shineAlpha)) });
  // >90% crack line
  if (hatchProgress > 90) {
    line(g, ex - 2.2, y - 6.8, ex - 0.3, y - 5.6, 0x1b1822, 0.9);
    line(g, ex - 0.3, y - 5.6, ex + 1.4, y - 7.1, 0x1b1822, 0.9);
    line(g, ex + 1.4, y - 7.1, ex + 2.5, y - 5.9, 0x1b1822, 0.9);
  }
}

type BodyArchetype =
  | 'tortoise'
  | 'hare'
  | 'fox'
  | 'sheep'
  | 'wyrm'
  | 'stag'
  | 'kelpie'
  | 'drake'
  | 'treant'
  | 'sprite'
  | 'wisp'
  | 'moth'
  | 'cat'
  | 'beetle'
  | 'heron'
  | 'ferret'
  | 'owl'
  | 'serpent'
  | 'finch'
  | 'lamb'
  | 'pangolin'
  | 'gryphon'
  | 'unicorn'
  | 'phoenix'
  | 'mouse'
  | 'raven'
  | 'bat_swarm'
  | 'hound'
  | 'lynx'
  | 'kitsune'
  | 'newt'
  | 'slime'
  | 'toad'
  | 'otter'
  | 'golem'
  | 'chimera';

interface SpeciesVisualSpec {
  archetype: BodyArchetype;
  primary: number;
  secondary: number;
  accent: number;
  eye: number;
}

const SCHOOL_HEX: Record<string, number> = {
  nature: hex(PALETTE.schools.nature.ramp[2]),
  arcane: hex(PALETTE.schools.arcane.ramp[2]),
  light: hex(PALETTE.schools.light.ramp[2]),
  shadow: hex(PALETTE.schools.shadow.ramp[2]),
  alchemy: hex(PALETTE.schools.alchemy.ramp[2])
};

const SPECIES_SPECS: Record<string, SpeciesVisualSpec> = {
  mossback_tortoise: { archetype: 'tortoise', primary: 0x4e8b3a, secondary: 0x7a6548, accent: 0x9ccb72, eye: 0xf6e08c },
  thistle_hare: { archetype: 'hare', primary: 0xc2b29b, secondary: 0x7db861, accent: 0xd97a9a, eye: 0x1b1822 },
  bramblefox: { archetype: 'fox', primary: 0xb8522a, secondary: 0x4e8b3a, accent: 0xf6f1e8, eye: 0xf6e08c },
  moonsheep: { archetype: 'sheep', primary: 0xeef1f5, secondary: 0x9bd4ff, accent: 0x3b3a40, eye: 0x5fc2c2 },
  puddlewyrm: { archetype: 'wyrm', primary: 0x4c8ad6, secondary: 0x5fc2c2, accent: 0xbfe6a8, eye: 0xf7e39a },
  glimmerhorn_stag: { archetype: 'stag', primary: 0x8f6239, secondary: 0xc28e5c, accent: 0x9ccb72, eye: 0xe8c547 },
  coral_kelpie: { archetype: 'kelpie', primary: 0x2e8b8b, secondary: 0xf07a5c, accent: 0x9cd4ff, eye: 0xf7e39a },
  verdant_drake: { archetype: 'drake', primary: 0x3a6b2c, secondary: 0x7db861, accent: 0xe8c547, eye: 0xf07a5c },
  elder_treant_sprout: { archetype: 'treant', primary: 0x6e4529, secondary: 0x4e8b3a, accent: 0xf7e39a, eye: 0x9ccb72 },
  fen_sprite: { archetype: 'sprite', primary: 0x5fc2c2, secondary: 0x7db861, accent: 0xf5ce7a, eye: 0xffffff },
  inkling_wisp: { archetype: 'wisp', primary: 0x6b4fbb, secondary: 0xb9a6ff, accent: 0xf6f1e8, eye: 0xffffff },
  orrery_moth: { archetype: 'moth', primary: 0x9c86e0, secondary: 0xe8c547, accent: 0x9cd4ff, eye: 0x1b1822 },
  glyph_cat: { archetype: 'cat', primary: 0x4b3796, secondary: 0xc9b7ff, accent: 0x5fc2c2, eye: 0xf7e39a },
  prism_beetle: { archetype: 'beetle', primary: 0x5fc2c2, secondary: 0xb9a6ff, accent: 0xf6e08c, eye: 0xffffff },
  star_heron: { archetype: 'heron', primary: 0xd8eef7, secondary: 0x4b3796, accent: 0xf7e39a, eye: 0xe8c547 },
  phase_ferret: { archetype: 'ferret', primary: 0x7d5ba6, secondary: 0xd8eef7, accent: 0x5fc2c2, eye: 0xb9a6ff },
  mistfeather_owl: { archetype: 'owl', primary: 0x9cd4ff, secondary: 0x6b4fbb, accent: 0xeef1f5, eye: 0xf7e39a },
  aether_serpent: { archetype: 'serpent', primary: 0x6b4fbb, secondary: 0x9bd4ff, accent: 0xf7e39a, eye: 0xffffff },
  chronoflare_owl: { archetype: 'owl', primary: 0xe8c547, secondary: 0x4b3796, accent: 0x9bd4ff, eye: 0xffffff },
  lantern_moth: { archetype: 'moth', primary: 0xf5ce7a, secondary: 0xd99b38, accent: 0xfff6dc, eye: 0x3b3a40 },
  dawn_finch: { archetype: 'finch', primary: 0xf0a64b, secondary: 0xf6e08c, accent: 0xd9472b, eye: 0x1b1822 },
  halo_lamb: { archetype: 'lamb', primary: 0xfff6dc, secondary: 0xf5ce7a, accent: 0xe8c547, eye: 0x3b3a40 },
  gilded_pangolin: { archetype: 'pangolin', primary: 0xe8c547, secondary: 0xb5651d, accent: 0xfff6dc, eye: 0x1b1822 },
  dawnhart_gryphon: { archetype: 'gryphon', primary: 0xe8c547, secondary: 0xfff6dc, accent: 0xc28e5c, eye: 0xd9472b },
  sunlit_unicorn: { archetype: 'unicorn', primary: 0xfff6dc, secondary: 0xf5ce7a, accent: 0x9cd4ff, eye: 0xe8c547 },
  ember_phoenix: { archetype: 'phoenix', primary: 0xd9472b, secondary: 0xf07a5c, accent: 0xf7e39a, eye: 0xffffff },
  duskmouse: { archetype: 'mouse', primary: 0x4b4d6b, secondary: 0x7d5ba6, accent: 0xd97a9a, eye: 0xf7e39a },
  hush_raven: { archetype: 'raven', primary: 0x1f2238, secondary: 0x4c5ba3, accent: 0x9c86e0, eye: 0x5fc2c2 },
  velvet_bat_swarm: { archetype: 'bat_swarm', primary: 0x2f3a73, secondary: 0x7d5ba6, accent: 0xd97a9a, eye: 0xf7e39a },
  shade_hound: { archetype: 'hound', primary: 0x1c2240, secondary: 0x4c5ba3, accent: 0x9c86e0, eye: 0x5fc2c2 },
  night_lynx: { archetype: 'lynx', primary: 0x2f3a73, secondary: 0x6b6a75, accent: 0xb9a6ff, eye: 0xf7e39a },
  umbral_wyrmling: { archetype: 'wyrm', primary: 0x222b57, secondary: 0x7d5ba6, accent: 0x5fc2c2, eye: 0xf7e39a },
  moonless_kitsune: { archetype: 'kitsune', primary: 0x252d5c, secondary: 0xb9a6ff, accent: 0x5fc2c2, eye: 0xf7e39a },
  cinder_newt: { archetype: 'newt', primary: 0xd9472b, secondary: 0xf07a5c, accent: 0xf7e39a, eye: 0x1b1822 },
  mopslime: { archetype: 'slime', primary: 0x5fc2c2, secondary: 0x9cd4ff, accent: 0xeef1f5, eye: 0x1b1822 },
  bellows_toad: { archetype: 'toad', primary: 0xb5651d, secondary: 0xe8752a, accent: 0xf7e39a, eye: 0xf6e08c },
  quicksilver_otter: { archetype: 'otter', primary: 0xb9b8c2, secondary: 0x5e5d66, accent: 0x9cd4ff, eye: 0x1b1822 },
  alembic_salamander: { archetype: 'newt', primary: 0x2e8b8b, secondary: 0xf07a5c, accent: 0x7db861, eye: 0xf7e39a },
  geode_golem: { archetype: 'golem', primary: 0x6b6a75, secondary: 0x9c86e0, accent: 0x9cd4ff, eye: 0x5fc2c2 },
  philosophers_chimera: { archetype: 'chimera', primary: 0xd99b38, secondary: 0xb5651d, accent: 0xd9472b, eye: 0x5fc2c2 }
};

export interface CreatureDrawOpts {
  x: number;
  y: number;
  facing: 'L' | 'R';
  anim: CreatureAnim;
  frame: number;
  status: CreatureInstance['status'];
  bondLevel?: 1 | 2 | 3;
  unhomed?: boolean;
  auraPhase?: number;
}

/**
 * Draw any of the 40 creatures centered at (x, baseline y).
 * Coordinates scale smoothly by the species' rarity size (16/24/32/48x32).
 */
export function drawCreature(g: Painter, defId: string, opts: CreatureDrawOpts): void {
  const { w, h } = creatureSize(defId);
  const def = CREATURE_DEFINITIONS[defId];
  const spec = SPECIES_SPECS[defId] ?? {
    archetype: 'fox' as BodyArchetype,
    primary: SCHOOL_HEX[def?.school ?? 'nature'] ?? 0x4e8b3a,
    secondary: 0x8a8994,
    accent: 0xf7e39a,
    eye: 0x1b1822
  };

  const dir = opts.facing === 'L' ? -1 : 1;
  const f = Math.abs(Math.floor(opts.frame)) % 6;
  const scale = h / 16; // 1.0 (16x16), 1.5 (24x24), 2.0 (32x32)
  const warySquat = opts.status === 'wary' ? 0.88 : 1;
  const sleeping = opts.anim === 'sleep';
  const eating = opts.anim === 'eat';
  const moving = opts.anim === 'move';
  const trouble = opts.anim === 'trouble';

  const bobY = sleeping
    ? 1.2 * scale
    : moving
    ? -Math.abs(Math.sin((f / 3) * Math.PI)) * 1.4 * scale
    : trouble
    ? -Math.abs(Math.cos(f * 1.5)) * 2.2 * scale
    : Math.sin((f / 2) * Math.PI) * 0.45 * scale;

  const cx = opts.x;
  const baseY = opts.y + (sleeping ? 1 * scale : 0);

  // Legendary soft aura
  if (def?.rarity === 'legendary') {
    const aPulse = 0.22 + 0.12 * Math.sin(opts.auraPhase ?? f * 0.8);
    g.ellipse(cx, baseY - h * 0.42, w * 0.45, h * 0.4).fill({ color: spec.accent, alpha: Math.max(0.08, aPulse) });
    g.circle(cx - dir * w * 0.25, baseY - h * 0.72, 1.5 * scale).fill({ color: 0xffffff, alpha: 0.7 });
  }

  // Contact shadow
  g.ellipse(cx, opts.y - 0.5, w * 0.32, Math.max(1.2, 1.6 * scale)).fill({ color: 0x1b1822, alpha: 0.35 });

  // Unhomed bundle beside Entrance Hall doors
  if (opts.unhomed) {
    const bx = cx - dir * (w * 0.46);
    line(g, bx - dir * 3, opts.y - 6, bx + dir * 2, opts.y - 1, 0x6e4529, 1);
    g.circle(bx - dir * 3, opts.y - 6.5, 2.5).fill({ color: 0xc28e5c });
    g.rect(bx - dir * 4, opts.y - 5.5, 2, 1.2).fill({ color: 0xd9472b });
  }

  // Local scaled coordinate helpers around (cx, baseY + bobY)
  const px = (dx: number) => cx + dx * dir * scale;
  const py = (dy: number) => baseY + bobY + dy * scale * warySquat;
  const sr = (v: number) => Math.max(0.5, Math.abs(v) * scale);

  const pCol = spec.primary;
  const sCol = spec.secondary;
  const aCol = spec.accent;
  const darkP = darken(pCol, 0.72);
  const stride = moving ? Math.sin((f / 3) * Math.PI) * 1.6 : 0;
  const headNod = eating ? 1.8 : warySquat < 1 ? 0.9 : 0;

  switch (spec.archetype) {
    case 'tortoise': {
      g.rect(px(-4 + stride * 0.4), py(-2.5), sr(2.2), sr(2.5)).fill({ color: sCol });
      g.rect(px(2 - stride * 0.4), py(-2.5), sr(2.2), sr(2.5)).fill({ color: sCol });
      g.ellipse(px(0), py(-5.2), sr(5.4), sr(4)).fill({ color: darkP });
      g.ellipse(px(0), py(-5.8), sr(4.6), sr(3.2)).fill({ color: pCol });
      g.circle(px(-1.5), py(-7), sr(1.3)).fill({ color: aCol });
      g.circle(px(1.5), py(-6.6), sr(1.1)).fill({ color: aCol });
      g.ellipse(px(5.2), py(-4.2 + headNod), sr(2.1), sr(1.7)).fill({ color: sCol });
      if (!sleeping) g.circle(px(6.1), py(-4.6 + headNod), sr(0.55)).fill({ color: spec.eye });
      break;
    }
    case 'hare': {
      g.ellipse(px(-1), py(-4.5), sr(4.2), sr(3.2)).fill({ color: pCol });
      g.circle(px(-4.5), py(-3.8), sr(1.5)).fill({ color: aCol });
      g.circle(px(3.2), py(-7.2 + headNod), sr(2.4)).fill({ color: pCol });
      const earTilt = warySquat < 1 ? 2.4 : 0;
      g.ellipse(px(2.4 - earTilt * 0.6), py(-11.2 + earTilt * 0.5), sr(1.0), sr(3.0)).fill({ color: pCol });
      g.ellipse(px(3.8 - earTilt * 0.5), py(-10.8 + earTilt * 0.6), sr(0.9), sr(2.6)).fill({ color: sCol });
      g.rect(px(1.5 + stride), py(-2.2), sr(1.6), sr(2.2)).fill({ color: darkP });
      g.rect(px(-3 - stride), py(-2.2), sr(1.8), sr(2.2)).fill({ color: darkP });
      if (!sleeping) g.circle(px(4.2), py(-7.4 + headNod), sr(0.55)).fill({ color: spec.eye });
      break;
    }
    case 'fox':
    case 'kitsune': {
      const tails = spec.archetype === 'kitsune' ? 3 : 1;
      for (let t = 0; t < tails; t++) {
        const ty = -5.5 - t * 2.1;
        g.ellipse(px(-5.5 - t * 0.5), py(ty), sr(3.2), sr(1.4)).fill({ color: t % 2 ? sCol : pCol });
        g.circle(px(-7.4 - t * 0.5), py(ty - 0.3), sr(1.0)).fill({ color: aCol });
      }
      g.ellipse(px(-0.5), py(-4.2), sr(4.2), sr(2.5)).fill({ color: pCol });
      g.rect(px(-3.2 - stride), py(-2.6), sr(1.3), sr(2.6)).fill({ color: darkP });
      g.rect(px(2.0 + stride), py(-2.6), sr(1.3), sr(2.6)).fill({ color: darkP });
      g.circle(px(3.4), py(-6.6 + headNod), sr(2.3)).fill({ color: pCol });
      g.poly([px(1.6), py(-8.2), px(2.5), py(-10.8), px(3.8), py(-8.2)]).fill({ color: sCol });
      g.poly([px(3.2), py(-8.2), px(4.3), py(-10.6), px(5.0), py(-8.0)]).fill({ color: pCol });
      g.poly([px(4.6), py(-6.3 + headNod), px(6.8), py(-5.8 + headNod), px(4.6), py(-5.1 + headNod)]).fill({ color: aCol });
      if (!sleeping) g.circle(px(4.4), py(-6.8 + headNod), sr(0.55)).fill({ color: spec.eye });
      break;
    }
    case 'sheep':
    case 'lamb': {
      g.rect(px(-2.8 - stride), py(-3.0), sr(1.2), sr(3.0)).fill({ color: aCol });
      g.rect(px(2.0 + stride), py(-3.0), sr(1.2), sr(3.0)).fill({ color: aCol });
      g.circle(px(-1.8), py(-5.8), sr(3.1)).fill({ color: pCol });
      g.circle(px(0.8), py(-6.2), sr(3.2)).fill({ color: pCol });
      g.circle(px(-0.2), py(-4.6), sr(2.8)).fill({ color: mix(pCol, sCol, 0.25) });
      g.circle(px(4.1), py(-6.2 + headNod), sr(2.1)).fill({ color: sCol });
      if (spec.archetype === 'lamb') {
        g.ellipse(px(4.1), py(-10.2), sr(2.6), sr(0.8)).stroke({ color: aCol, width: Math.max(0.7, 0.7 * scale) });
      }
      if (!sleeping) g.circle(px(4.8), py(-6.5 + headNod), sr(0.5)).fill({ color: spec.eye });
      break;
    }
    case 'stag':
    case 'unicorn': {
      g.rect(px(-3.2 - stride), py(-4.0), sr(1.2), sr(4.0)).fill({ color: darkP });
      g.rect(px(2.2 + stride), py(-4.0), sr(1.2), sr(4.0)).fill({ color: darkP });
      g.ellipse(px(-0.4), py(-5.8), sr(4.2), sr(2.4)).fill({ color: pCol });
      g.rect(px(2.4), py(-9.6 + headNod), sr(1.8), sr(4.2)).fill({ color: pCol });
      g.ellipse(px(4.1), py(-9.8 + headNod), sr(2.2), sr(1.6)).fill({ color: pCol });
      if (spec.archetype === 'stag') {
        line(g, px(3.0), py(-11.0 + headNod), px(1.5), py(-14.0 + headNod), sCol, Math.max(0.8, 0.8 * scale));
        line(g, px(3.4), py(-11.0 + headNod), px(4.6), py(-13.8 + headNod), aCol, Math.max(0.8, 0.8 * scale));
      } else {
        g.poly([px(4.6), py(-11.0 + headNod), px(6.8), py(-14.4 + headNod), px(3.6), py(-11.2 + headNod)]).fill({ color: aCol });
        g.ellipse(px(-4.5), py(-6.5), sr(2.0), sr(1.1)).fill({ color: sCol });
      }
      if (!sleeping) g.circle(px(4.8), py(-10.1 + headNod), sr(0.5)).fill({ color: spec.eye });
      break;
    }
    case 'kelpie':
    case 'otter': {
      g.ellipse(px(-4.5), py(-3.0), sr(3.4), sr(1.4)).fill({ color: sCol });
      g.ellipse(px(0), py(-3.8), sr(4.6), sr(2.3)).fill({ color: pCol });
      g.circle(px(4.2), py(-5.5 + headNod), sr(2.0)).fill({ color: pCol });
      if (spec.archetype === 'kelpie') {
        g.poly([px(1.2), py(-7.8), px(3.2), py(-8.8), px(2.4), py(-5.6)]).fill({ color: sCol });
      } else {
        g.circle(px(4.8), py(-4.8 + headNod), sr(1.0)).fill({ color: aCol });
      }
      if (!sleeping) g.circle(px(4.9), py(-5.8 + headNod), sr(0.5)).fill({ color: spec.eye });
      break;
    }
    case 'wyrm':
    case 'serpent': {
      const wave = moving ? Math.sin(f * 1.5) * 1.4 : 0;
      g.ellipse(px(-3.8), py(-3.0 + wave), sr(2.4), sr(1.8)).fill({ color: darkP });
      g.ellipse(px(-1.0), py(-4.2 - wave), sr(2.6), sr(2.1)).fill({ color: pCol });
      g.ellipse(px(1.8), py(-5.4 + wave * 0.5), sr(2.5), sr(2.1)).fill({ color: pCol });
      g.circle(px(4.0), py(-7.0 + headNod), sr(2.1)).fill({ color: pCol });
      g.poly([px(2.4), py(-8.8), px(1.0), py(-10.8), px(3.8), py(-8.6)]).fill({ color: sCol });
      g.circle(px(0), py(-5.6), sr(1.2)).fill({ color: aCol });
      if (!sleeping) g.circle(px(4.7), py(-7.3 + headNod), sr(0.55)).fill({ color: spec.eye });
      break;
    }
    case 'drake':
    case 'phoenix':
    case 'gryphon': {
      const wingLift = moving ? Math.sin((f / 2) * Math.PI) * 2.6 : warySquat < 1 ? -1.4 : 0.6;
      g.poly([px(-0.5), py(-6.0), px(-5.2), py(-10.5 - wingLift), px(-2.4), py(-5.2)]).fill({ color: sCol });
      g.rect(px(-2.5 - stride), py(-2.8), sr(1.3), sr(2.8)).fill({ color: darkP });
      g.rect(px(1.8 + stride), py(-2.8), sr(1.3), sr(2.8)).fill({ color: darkP });
      g.ellipse(px(0), py(-5.0), sr(4.2), sr(2.6)).fill({ color: pCol });
      g.circle(px(3.6), py(-7.6 + headNod), sr(2.1)).fill({ color: spec.archetype === 'gryphon' ? sCol : pCol });
      g.poly([px(4.8), py(-7.6 + headNod), px(7.0), py(-6.8 + headNod), px(4.8), py(-6.2 + headNod)]).fill({ color: aCol });
      g.poly([px(-4.0), py(-4.8), px(-7.0), py(-5.6), px(-4.8), py(-3.6)]).fill({ color: aCol });
      if (!sleeping) g.circle(px(4.2), py(-8.0 + headNod), sr(0.55)).fill({ color: spec.eye });
      break;
    }
    case 'treant': {
      g.rect(px(-2.4), py(-7.2), sr(4.8), sr(7.2)).fill({ color: pCol });
      g.rect(px(-3.6 - stride * 0.5), py(-2.0), sr(2.0), sr(2.0)).fill({ color: darkP });
      g.rect(px(1.6 + stride * 0.5), py(-2.0), sr(2.0), sr(2.0)).fill({ color: darkP });
      g.circle(px(0), py(-10.0), sr(4.4)).fill({ color: sCol });
      g.circle(px(-2.8), py(-9.0), sr(2.6)).fill({ color: mix(sCol, aCol, 0.35) });
      g.circle(px(2.8), py(-9.2), sr(2.6)).fill({ color: sCol });
      if (!sleeping) {
        g.circle(px(1.2), py(-5.8), sr(0.55)).fill({ color: spec.eye });
        g.circle(px(-0.8), py(-5.8), sr(0.55)).fill({ color: spec.eye });
      }
      break;
    }
    case 'sprite':
    case 'wisp': {
      const hover = -4.5 - Math.sin(f * 1.1) * 1.4;
      g.ellipse(px(-2.2), py(hover - 2.0), sr(2.4), sr(1.2)).fill({ color: aCol, alpha: 0.75 });
      g.circle(px(0), py(hover), sr(3.2)).fill({ color: pCol, alpha: 0.9 });
      g.circle(px(0), py(hover - 0.6), sr(2.0)).fill({ color: sCol });
      if (!sleeping) {
        g.circle(px(1.1), py(hover - 0.4), sr(0.6)).fill({ color: spec.eye });
      }
      break;
    }
    case 'moth':
    case 'bat_swarm': {
      const flap = Math.sin((f / 2) * Math.PI) * 2.5;
      const base = -6.0;
      g.ellipse(px(-2.2), py(base - 1.5 - flap), sr(3.0), sr(2.0)).fill({ color: pCol, alpha: 0.92 });
      g.ellipse(px(2.2), py(base - 1.5 - flap), sr(3.0), sr(2.0)).fill({ color: pCol, alpha: 0.92 });
      g.circle(px(-2.2), py(base - 1.5 - flap), sr(1.0)).fill({ color: sCol });
      g.circle(px(2.2), py(base - 1.5 - flap), sr(1.0)).fill({ color: sCol });
      g.ellipse(px(0), py(base), sr(1.4), sr(2.6)).fill({ color: darkP });
      if (!sleeping) g.circle(px(0.6), py(base - 1.6), sr(0.5)).fill({ color: spec.eye });
      break;
    }
    case 'cat':
    case 'lynx':
    case 'ferret':
    case 'hound': {
      g.rect(px(-3.2 - stride), py(-2.8), sr(1.3), sr(2.8)).fill({ color: darkP });
      g.rect(px(2.0 + stride), py(-2.8), sr(1.3), sr(2.8)).fill({ color: darkP });
      g.ellipse(px(0), py(-4.6), sr(4.1), sr(2.3)).fill({ color: pCol });
      g.circle(px(3.5), py(-6.6 + headNod), sr(2.1)).fill({ color: pCol });
      g.poly([px(2.0), py(-8.2), px(2.6), py(-10.6), px(3.6), py(-8.2)]).fill({ color: sCol });
      g.poly([px(3.8), py(-8.2), px(4.6), py(-10.5), px(5.1), py(-8.0)]).fill({ color: sCol });
      g.ellipse(px(-5.0), py(-6.0), sr(2.2), sr(0.9)).fill({ color: aCol });
      if (!sleeping) g.circle(px(4.3), py(-6.8 + headNod), sr(0.55)).fill({ color: spec.eye });
      break;
    }
    case 'beetle': {
      g.ellipse(px(0), py(-4.5), sr(4.4), sr(3.2)).fill({ color: pCol });
      g.ellipse(px(-0.6), py(-5.2), sr(2.8), sr(2.0)).fill({ color: sCol });
      line(g, px(0), py(-7.6), px(0), py(-1.6), darkP, Math.max(0.7, 0.7 * scale));
      g.circle(px(3.8), py(-4.2), sr(1.5)).fill({ color: darkP });
      line(g, px(4.6), py(-4.8), px(6.4), py(-6.4), aCol, Math.max(0.7, 0.7 * scale));
      if (!sleeping) g.circle(px(4.4), py(-4.5), sr(0.5)).fill({ color: spec.eye });
      break;
    }
    case 'heron':
    case 'owl':
    case 'finch':
    case 'raven': {
      const tall = spec.archetype === 'heron' ? 2.5 : 0;
      g.rect(px(-0.8 - stride * 0.4), py(-3.0 - tall), sr(0.9), sr(3.0 + tall)).fill({ color: aCol });
      g.rect(px(0.8 + stride * 0.4), py(-3.0 - tall), sr(0.9), sr(3.0 + tall)).fill({ color: aCol });
      g.ellipse(px(0), py(-5.6 - tall), sr(3.0), sr(3.2)).fill({ color: pCol });
      g.ellipse(px(-0.6), py(-5.4 - tall), sr(2.2), sr(2.2)).fill({ color: sCol });
      g.circle(px(1.2), py(-8.6 - tall + headNod), sr(2.0)).fill({ color: pCol });
      const beakLen = spec.archetype === 'heron' ? 4.4 : 2.2;
      g.poly([px(2.6), py(-8.8 - tall + headNod), px(2.6 + beakLen), py(-8.2 - tall + headNod), px(2.6), py(-7.6 - tall + headNod)]).fill({ color: aCol });
      if (!sleeping) g.circle(px(2.0), py(-8.9 - tall + headNod), sr(0.55)).fill({ color: spec.eye });
      break;
    }
    case 'pangolin': {
      g.ellipse(px(-0.5), py(-4.2), sr(4.6), sr(3.2)).fill({ color: pCol });
      for (let i = -3; i <= 2; i += 2) {
        g.circle(px(i), py(-5.0), sr(1.4)).fill({ color: sCol });
      }
      g.ellipse(px(4.4), py(-3.6 + headNod), sr(2.0), sr(1.5)).fill({ color: aCol });
      if (!sleeping) g.circle(px(5.0), py(-3.9 + headNod), sr(0.5)).fill({ color: spec.eye });
      break;
    }
    case 'mouse': {
      g.ellipse(px(0), py(-3.0), sr(3.6), sr(2.3)).fill({ color: pCol });
      g.circle(px(2.8), py(-4.8), sr(1.6)).fill({ color: sCol });
      g.circle(px(3.5), py(-3.2 + headNod), sr(1.6)).fill({ color: pCol });
      line(g, px(-3.4), py(-2.6), px(-6.4), py(-3.8), aCol, Math.max(0.7, 0.7 * scale));
      if (!sleeping) g.circle(px(4.2), py(-3.5 + headNod), sr(0.5)).fill({ color: spec.eye });
      break;
    }
    case 'newt':
    case 'toad': {
      const rx = spec.archetype === 'toad' ? 4.4 : 4.8;
      g.ellipse(px(0), py(-3.2), sr(rx), sr(2.5)).fill({ color: pCol });
      g.ellipse(px(-0.4), py(-3.8), sr(rx * 0.65), sr(1.4)).fill({ color: sCol });
      g.circle(px(3.4), py(-4.8 + headNod), sr(1.9)).fill({ color: pCol });
      if (spec.archetype === 'newt') {
        g.poly([px(-4.2), py(-2.8), px(-7.2), py(-4.2), px(-4.4), py(-1.8)]).fill({ color: aCol });
      }
      if (!sleeping) g.circle(px(4.1), py(-5.3 + headNod), sr(0.6)).fill({ color: spec.eye });
      break;
    }
    case 'slime': {
      g.ellipse(px(0), py(-3.4), sr(4.6), sr(3.4)).fill({ color: pCol, alpha: 0.88 });
      g.ellipse(px(-1.0), py(-4.4), sr(2.0), sr(1.2)).fill({ color: sCol, alpha: 0.75 });
      g.rect(px(-1.0), py(-7.8), sr(2.0), sr(1.2)).fill({ color: aCol });
      if (!sleeping) {
        g.circle(px(1.6), py(-3.8), sr(0.6)).fill({ color: spec.eye });
        g.circle(px(3.2), py(-3.8), sr(0.6)).fill({ color: spec.eye });
      }
      break;
    }
    case 'golem': {
      g.rect(px(-4.2), py(-8.4), sr(8.4), sr(7.0)).fill({ color: pCol });
      g.rect(px(-3.6 - stride * 0.4), py(-2.2), sr(2.4), sr(2.2)).fill({ color: darkP });
      g.rect(px(1.2 + stride * 0.4), py(-2.2), sr(2.4), sr(2.2)).fill({ color: darkP });
      g.poly([px(-2.2), py(-8.4), px(-0.8), py(-12.2), px(0.8), py(-8.4)]).fill({ color: sCol });
      g.poly([px(0.8), py(-8.4), px(2.4), py(-11.6), px(3.6), py(-8.4)]).fill({ color: aCol });
      if (!sleeping) {
        g.circle(px(1.6), py(-6.0), sr(0.7)).fill({ color: spec.eye });
        g.circle(px(-0.6), py(-6.0), sr(0.7)).fill({ color: spec.eye });
      }
      break;
    }
    case 'chimera': {
      // Wide 48x32 lion-goat-serpent body
      g.rect(px(-5.5 - stride), py(-4.0), sr(2.2), sr(4.0)).fill({ color: darkP });
      g.rect(px(4.0 + stride), py(-4.0), sr(2.2), sr(4.0)).fill({ color: darkP });
      g.ellipse(px(0), py(-7.0), sr(7.2), sr(3.8)).fill({ color: pCol });
      // Dragon wings
      g.poly([px(-1.5), py(-9.2), px(-7.0), py(-14.5), px(-4.0), py(-8.4)]).fill({ color: aCol });
      // Lion mane + head (front)
      g.circle(px(6.4), py(-8.8 + headNod), sr(3.4)).fill({ color: sCol });
      g.circle(px(7.4), py(-8.8 + headNod), sr(2.4)).fill({ color: pCol });
      // Goat head (middle crest)
      g.circle(px(1.6), py(-11.4), sr(2.2)).fill({ color: 0xf6f1e8 });
      line(g, px(1.0), py(-13.2), px(0.0), py(-15.2), 0x5e5d66, Math.max(1, 0.9 * scale));
      // Serpent tail head (back)
      line(g, px(-6.8), py(-7.0), px(-10.0), py(-10.5), 0x4e8b3a, Math.max(1.2, 1.2 * scale));
      g.circle(px(-10.2), py(-10.8), sr(1.6)).fill({ color: 0x4e8b3a });
      if (!sleeping) {
        g.circle(px(8.2), py(-9.2 + headNod), sr(0.7)).fill({ color: spec.eye });
        g.circle(px(2.4), py(-11.6), sr(0.55)).fill({ color: spec.eye });
      }
      break;
    }
  }

  // Sleeping Zzz dot hint
  if (sleeping) {
    g.circle(cx + dir * 4 * scale, baseY - h * 0.72, 0.8 * scale).fill({ color: 0x9cd4ff, alpha: 0.75 });
  }

  // Bond 3 permanent sparkle under feet
  if (opts.status === 'tamed' && opts.bondLevel === 3) {
    glyph(g, 'star8', cx - 4, opts.y - 1, 2.2, 0xf7e39a);
    glyph(g, 'star8', cx + 4, opts.y - 1.5, 1.8, 0xfff6dc);
  }

  // Loose creature dashed bounding box
  if (opts.status === 'loose') {
    const left = cx - w * 0.48;
    const top = opts.y - h * 0.92;
    const bw = w * 0.96;
    const bh = h * 0.94;
    for (let dx = 0; dx < bw; dx += 6) {
      const seg = Math.min(3, bw - dx);
      g.rect(left + dx, top, seg, 1).fill({ color: 0xf07a5c, alpha: 0.9 });
      g.rect(left + dx, top + bh, seg, 1).fill({ color: 0xf07a5c, alpha: 0.9 });
    }
    for (let dy = 0; dy < bh; dy += 6) {
      const seg = Math.min(3, bh - dy);
      g.rect(left, top + dy, 1, seg).fill({ color: 0xf07a5c, alpha: 0.9 });
      g.rect(left + bw, top + dy, 1, seg).fill({ color: 0xf07a5c, alpha: 0.9 });
    }
  }
}

export function drawCreatureBubble(
  g: Painter,
  kind: 'wary' | 'loose' | 'hungry' | 'hearts' | 'paw',
  x: number,
  y: number,
  scale = 1,
  count = 1
): void {
  const s = scale;
  if (kind === 'hearts') {
    const n = Math.max(1, Math.min(3, count));
    for (let i = 0; i < n; i++) {
      const hx = x + (i - (n - 1) / 2) * 5.5 * s;
      glyph(g, 'heart', hx, y, 2.6 * s, 0xd97a9a);
    }
    return;
  }
  if (kind === 'paw') {
    g.circle(x, y + 0.6 * s, 1.5 * s).fill({ color: 0x7db861 });
    g.circle(x - 1.5 * s, y - 1.0 * s, 0.7 * s).fill({ color: 0x7db861 });
    g.circle(x, y - 1.5 * s, 0.7 * s).fill({ color: 0x7db861 });
    g.circle(x + 1.5 * s, y - 1.0 * s, 0.7 * s).fill({ color: 0x7db861 });
    return;
  }

  const rim = kind === 'wary' ? 0x1b1822 : 0xd9472b;
  g.circle(x, y, 5.2 * s).fill({ color: 0xf6f1e8 });
  g.circle(x, y, 5.2 * s).stroke({ color: rim, width: Math.max(1, 0.9 * s) });

  if (kind === 'wary') {
    // Minimal crisp "?" shape
    g.rect(x - 1.2 * s, y - 3.0 * s, 2.4 * s, 1.0 * s).fill({ color: 0x1b1822 });
    g.rect(x + 0.4 * s, y - 2.2 * s, 1.0 * s, 1.6 * s).fill({ color: 0x1b1822 });
    g.rect(x - 0.5 * s, y - 0.8 * s, 1.2 * s, 1.4 * s).fill({ color: 0x1b1822 });
    g.circle(x, y + 2.0 * s, 0.7 * s).fill({ color: 0x1b1822 });
  } else if (kind === 'loose') {
    // Red "!" exclamation
    g.rect(x - 0.7 * s, y - 3.0 * s, 1.4 * s, 3.4 * s).fill({ color: 0xd9472b });
    g.circle(x, y + 2.0 * s, 0.8 * s).fill({ color: 0xd9472b });
  } else {
    // Red food bowl for hungry tamed creatures
    g.ellipse(x, y + 0.8 * s, 3.0 * s, 1.5 * s).fill({ color: 0xd9472b });
    g.rect(x - 2.6 * s, y - 0.2 * s, 5.2 * s, 1.2 * s).fill({ color: 0xf07a5c });
  }
}
