/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Layered paper doll (Addendum Section 6). Forge-drawn, palette recoloured, one
 * function for the map, the creation preview and the 64×64 portraits.
 * Cosmetic only: never writes game state.
 */
import type { Painter } from '../rooms/painter';
import { darken, glyph, mix } from '../rooms/painter';
import type { Character, InjuryType, PlacedRoom, SchoolType } from '../../types/ankicaster';
import {
  EYE_COLOURS, FACE_SHAPES, HAIR_STYLES, HATS, SHOE_KINDS, STAFFS,
  hashStr, hexToNum, normalizeAppearance, resolveFace, resolveShoes, shade
} from '../../utils/appearance';

export const DOLL_ANIMS = {
  idle: { frames: 4, fps: 6 },
  walk: { frames: 6, fps: 10 },
  walk_front: { frames: 4, fps: 8 },
  climb: { frames: 4, fps: 8 },
  sit_study: { frames: 4, fps: 4 },
  eat: { frames: 4, fps: 6 },
  sleep: { frames: 2, fps: 2 },
  cast: { frames: 6, fps: 10 },
  carry_walk: { frames: 6, fps: 10 },
  work: { frames: 4, fps: 8 },
  cheer: { frames: 4, fps: 8 },
  limp_walk: { frames: 6, fps: 8 },
  talk: { frames: 2, fps: 3 },
  teach: { frames: 4, fps: 6 }
} as const;

export type DollAnim = keyof typeof DOLL_ANIMS;

/** Art px per second. Fixed. Never a function of review rate (Addendum 6.4). */
export const MOVE_SPEED: Record<string, number> = { walk: 28, limp: 16, carry: 24, climb: 24 };

export type DollRole = 'wizard' | 'faculty' | 'resident' | 'student' | 'adventurer' | 'sabbatical';

export type HeldItem = 'none' | 'staff' | 'book' | 'tray' | 'lantern' | 'broom' | 'watering' | 'hammer' | 'quill' | 'crate';

export type Expression = 'neutral' | 'happy' | 'tired' | 'worried' | 'asleep' | 'focused';

export interface DollLook {
  role: DollRole;
  bodyShape: number;
  skin: string;
  hair: string;
  hairColor: string;
  eyes: string;
  face: string;
  shoes: string;
  robeColor: string;
  hat: string;
  staff: string;
  school?: string;
  career?: string;
  mastered: string[];
  expression: Expression;
  injury?: InjuryType;
  /** Which role mark this draw paints. Tests assert it is never missing. */
  mark: 'sigil' | 'stole' | 'star' | 'scarf' | 'pack' | 'folded';
}

export interface DollPose {
  x: number;
  y: number;
  facing: 'L' | 'R';
  anim: DollAnim;
  frame: number;
}

const SCHOOL_HEX: Record<string, string> = {
  arcane: '#6B4FBB',
  nature: '#4E8B3A',
  light: '#E8C547',
  shadow: '#2F3A73',
  alchemy: '#B5651D'
};

const SCHOOL_GLYPH: Record<string, string> = {
  arcane: 'star8', nature: 'leaf', light: 'sun', shadow: 'crescent', alchemy: 'flask'
};

export const HELD_ITEMS: HeldItem[] = ['staff', 'book', 'tray', 'lantern', 'broom', 'watering', 'hammer', 'quill', 'crate'];

export const ROLE_MARKS: DollLook['mark'][] = ['sigil', 'stole', 'star', 'scarf', 'pack', 'folded'];

export function dollRole(o: { isWizard?: boolean; status?: string; career?: string; careerState?: string; mastered?: number }): DollRole {
  if (o.isWizard) return 'wizard';
  if (o.careerState === 'sabbatical') return 'sabbatical';
  if (o.career === 'adventurer') return 'adventurer';
  if (o.status === 'faculty' || o.career) return 'faculty';
  if (o.status === 'resident' || (o.mastered || 0) > 0) return 'resident';
  return 'student';
}

export function markFor(role: DollRole): DollLook['mark'] {
  if (role === 'wizard') return 'sigil';
  if (role === 'faculty') return 'stole';
  if (role === 'resident') return 'star';
  if (role === 'adventurer') return 'pack';
  if (role === 'sabbatical') return 'folded';
  return 'scarf';
}

export function expressionFor(anim: string, needs?: { rest?: number; composure?: number }, morale?: number): Expression {
  if (anim === 'sleep') return 'asleep';
  if ((needs?.rest ?? 100) < 25) return 'tired';
  if ((needs?.composure ?? 100) < 25) return 'worried';
  if (anim === 'sit_study' || anim === 'work' || anim === 'teach' || anim === 'cast') return 'focused';
  if ((morale ?? 0) >= 80) return 'happy';
  return 'neutral';
}

function schoolRobe(school: string | undefined, fallback: string, wizard: boolean): string {
  if (wizard || !school) return fallback;
  return SCHOOL_HEX[school] || fallback;
}

/** Map a character or the wizard onto a stable layered look (Addendum 6.2). */
export function appearanceToLayers(input: {
  id?: number | string;
  isWizard?: boolean;
  status?: string;
  career?: string;
  careerState?: string;
  masteredSchools?: string[];
  currentSchool?: string;
  appearance?: Partial<{ skin: string; hair: string; hairColor: string; robeColor: string; hat: string; bodyShape?: number; eyes?: string; face?: string; shoes?: string; staff?: string }>;
  anim?: string;
  needs?: { rest?: number; composure?: number };
  morale?: number;
  injury?: InjuryType;
  robeColor?: string;
  hair?: string;
  hairColor?: string;
  skin?: string;
  hat?: string;
  staff?: string;
  bodyShape?: number;
  eyes?: string;
  face?: string;
  shoes?: string;
}): DollLook {
  const seed = hashStr(String(input.id ?? input.appearance?.hair ?? '0'), 7);
  const app = input.appearance || {};
  const role = dollRole({
    isWizard: input.isWizard,
    status: input.status,
    career: input.career,
    careerState: input.careerState,
    mastered: input.masteredSchools?.length || 0
  });
  const base = normalizeAppearance({
    bodyShape: (input.bodyShape ?? app.bodyShape) as 1 | 2 | 3 | 4 | undefined,
    skin: input.skin || app.skin,
    hair: input.hair || app.hair,
    hairColor: input.hairColor || app.hairColor,
    eyes: input.eyes || app.eyes,
    face: resolveFace(input.face || app.face, seed),
    shoes: resolveShoes(input.shoes || app.shoes, seed),
    robeColor: input.robeColor || app.robeColor,
    hat: input.hat || app.hat,
    staff: input.staff || app.staff
  }, seed);
  // Students with a school wear that ramp and ignore the stored robe colour.
  const robeColor = schoolRobe(input.currentSchool, base.robeColor, !!input.isWizard);
  return {
    role,
    bodyShape: base.bodyShape,
    skin: base.skin,
    hair: base.hair,
    hairColor: base.hairColor,
    eyes: base.eyes,
    face: base.face,
    shoes: role === 'wizard' ? base.shoes : (input.shoes || app.shoes ? base.shoes : SHOE_KINDS[seed % SHOE_KINDS.length]),
    robeColor,
    hat: role === 'student' && !input.hat && !app.hat ? 'cap' : base.hat,
    staff: base.staff,
    school: input.currentSchool,
    career: input.career,
    mastered: input.masteredSchools || [],
    expression: expressionFor(input.anim || 'idle', input.needs, input.morale),
    injury: input.injury,
    mark: markFor(role)
  };
}

export function lookFromCharacter(char: Character, anim = 'idle'): DollLook {
  return appearanceToLayers({
    id: char.id,
    status: char.status,
    career: char.career,
    careerState: char.careerState,
    masteredSchools: char.masteredSchools,
    currentSchool: char.currentSchool,
    appearance: char.appearance,
    anim,
    needs: char.needs,
    morale: char.morale,
    injury: char.injury?.type
  });
}

function careerItem(career?: string): HeldItem {
  switch (career) {
    case 'gardener': return 'watering';
    case 'builder': return 'hammer';
    case 'scholar':
    case 'alchemist': return 'quill';
    case 'healer': return 'tray';
    case 'warder': return 'lantern';
    case 'tamer': return 'broom';
    case 'teacher': return 'book';
    case 'adventurer': return 'lantern';
    default: return 'none';
  }
}

function itemFor(look: DollLook, anim: DollAnim): HeldItem {
  if (look.role === 'wizard') return 'staff';
  if (anim === 'eat') return 'tray';
  if (anim === 'sit_study' || anim === 'teach') return 'book';
  if (anim === 'carry_walk') return 'crate';
  if (anim === 'work') return careerItem(look.career);
  if (look.role === 'student' && (anim === 'walk' || anim === 'limp_walk')) return 'book';
  if (look.role === 'adventurer') return 'lantern';
  return 'none';
}

function poseOf(anim: DollAnim, frame: number) {
  const f = Math.max(0, frame) % (DOLL_ANIMS[anim]?.frames || 4);
  const wave = [0, 1, 0, -1, 1, -1][f] || 0;
  const bob = anim === 'idle' ? [0, -1, 0, 1][f] || 0
    : anim === 'cheer' ? [0, -2, -1, 0][f] || 0
    : anim === 'walk' || anim === 'carry_walk' || anim === 'walk_front' || anim === 'limp_walk' ? (f % 2) * -1
    : anim === 'climb' ? (f % 2)
    : 0;
  const step = anim === 'walk_front' ? wave * 1.5 : anim === 'limp_walk' ? (f % 2 === 0 ? 3 : 0) : wave * 2.5;
  return {
    bob,
    step,
    seated: anim === 'sit_study' || anim === 'eat',
    sleep: anim === 'sleep',
    back: anim === 'climb',
    armUp: anim === 'cast' || anim === 'cheer' || anim === 'teach',
    cast: anim === 'cast',
    work: anim === 'work',
    talk: anim === 'talk' && f % 2 === 1
  };
}

function num(hex: string, fb = 0x888888): number {
  const n = hexToNum(hex, fb);
  return n & 0xffffff;
}

/** Draw one character. Returns the mark that was painted (never a missing texture). */
export function drawCharacter(g: Painter, look: DollLook, pose: DollPose): { mark: DollLook['mark'] } {
  const anim = (DOLL_ANIMS[pose.anim] ? pose.anim : 'idle') as DollAnim;
  const p = poseOf(anim, pose.frame);
  const sign = pose.facing === 'L' ? -1 : 1;
  const x = pose.x;
  const y = pose.y;
  if (p.sleep) {
    drawSleep(g, look, x, y);
    return { mark: look.mark };
  }
  const tall = (look.role === 'wizard' ? 2 : look.role === 'student' ? -2 : 0) + (look.bodyShape === 4 ? 2 : 0);
  const width = [6, 8, 11, 7][look.bodyShape - 1] || 8;
  const footY = y;
  const bob = p.bob;
  const headY = footY - 20 - tall + bob + (p.seated ? 4 : 0);
  const hip = footY - 8 + bob;
  const skin = num(look.skin, 0xf6d7c3);
  const hair = num(look.hairColor, 0x4a2e1e);
  const robe = num(look.robeColor, 0x4e8b3a);
  const robeInk = look.role === 'sabbatical' ? mix(robe, 0x8a8994, 0.55) : robe;
  const eye = num(look.eyes, 0x4a2e1e);

  // 1. Shadow
  g.ellipse(x, footY - 1, 5, 1.5).fill({ color: 0x000000, alpha: 0.4 });

  // 2. Back gear
  if (look.role === 'wizard' || look.hat === 'hood') {
    g.poly([x - 4 * sign, hip - 6, x - (width + 2) * sign, footY - 2, x - 1 * sign, footY - 2]).fill({ color: shade(robe, 0.55) });
  } else if (look.role === 'adventurer') {
    g.rect(x - 6 * sign, hip - 8, 5, 7).fill({ color: 0x6e4529 });
    g.rect(x - 5 * sign, hip - 4, 3, 2).fill({ color: 0xc9b88a });
  }

  // 3-4. Shoes / legs (visible under a short robe or tunic)
  const shoe = look.shoes === 'sandals' ? 0xc9b88a : look.shoes === 'slippers' ? 0x9e2a3a : 0x3b3a40;
  const leg = p.step * sign;
  g.rect(x - 3 + (p.seated ? 2 : leg), footY - 4, 2.5, 4).fill({ color: shoe });
  g.rect(x + 1 - (p.seated ? 2 : leg), footY - 4, 2.5, 4).fill({ color: shoe });
  if (look.injury === 'sprained') {
    g.rect(x - 3, footY - 3, 3, 1.5).fill({ color: 0xf6f1e8 });
  }

  // 5. Body
  g.rect(x - width / 2, hip - 6, width, 7).fill({ color: skin });

  // Robe length tells the roles apart: short (knee), long (floor), wizard (floor + cape), tunic (hip)
  const hem = look.role === 'student' ? footY - 7 : look.role === 'sabbatical' ? footY - 11 : footY - 3;
  g.poly([
    x - width / 2, hip - 4,
    x + width / 2, hip - 4,
    x + width / 2 + 1, hem,
    x - width / 2 - 1, hem
  ]).fill({ color: robeInk });
  if (look.role === 'wizard') {
    g.poly([
      x - width / 2, hip - 4,
      x + width / 2, hip - 4,
      x + width / 2 + 1, hem,
      x - width / 2 - 1, hem
    ]).stroke({ color: 0xf7e39a, width: 1 });
  }

  // 10. Role mark
  drawMark(g, look, x, hip, hem, sign, robe);

  // 6-8. Hair back, head, hair front, face
  if (!p.back && look.hair !== 'bald' && look.hat !== 'hood') drawHair(g, look.hair, x, headY, hair, sign, true);
  drawHead(g, look.face, x, headY, skin);
  if (!p.back) drawFace(g, look.expression || 'neutral', x, headY, eye, sign, p.talk);
  if (!p.back && look.hair !== 'bald' && look.hat !== 'hood') drawHair(g, look.hair, x, headY, hair, sign, false);
  if (p.back) g.circle(x, headY, 5).fill({ color: hair });

  // 9. Hat
  drawHat(g, look.hat, x, headY, robe, sign);

  // 11. Held item
  drawItem(g, itemFor(look, anim), look, x, headY, hip, sign, p);

  // Rift-Touched glow stays while the injury does
  if (look.injury === 'rift_touched') {
    g.ellipse(x, (headY + footY) / 2, width / 2 + 3, (footY - headY) / 2 + 2).stroke({ color: 0x7d5ba6, width: 1, alpha: 0.85 });
  }
  if (look.injury === 'broken_bone') {
    g.rect(x + 3 * sign, hip - 2, 4, 1.2).fill({ color: 0xf6f1e8 });
  }

  // Mastery pips, 3×3, under the feet
  look.mastered.slice(0, 5).forEach((sch, i) => {
    const px = x - (Math.min(5, look.mastered.length) * 4) / 2 + i * 4;
    g.rect(px, footY + 2, 3, 3).fill({ color: num(SCHOOL_HEX[sch] || '#DDB843', 0xddb843) });
  });
  return { mark: look.mark };
}

function drawHead(g: Painter, face: string, x: number, y: number, skin: number) {
  if (face === 'square') g.rect(x - 5, y - 5, 10, 10).fill({ color: skin });
  else if (face === 'oval') g.ellipse(x, y, 4, 6).fill({ color: skin });
  else if (face === 'heart') {
    g.circle(x, y - 1, 5).fill({ color: skin });
    g.poly([x - 4, y, x + 4, y, x, y + 6]).fill({ color: skin });
  } else g.circle(x, y, 5).fill({ color: skin });
}

function drawFace(g: Painter, exp: Expression, x: number, y: number, eye: number, sign: number, talk: boolean) {
  if (exp === 'asleep') {
    g.rect(x + 1.5 * sign, y - 1, 2.5, 0.8).fill({ color: 0x1b1822 });
    return;
  }
  const h = exp === 'tired' ? 0.8 : exp === 'focused' ? 1.2 : 1.6;
  g.rect(x + 1.2 * sign, y - 1.5, 1.6, h).fill({ color: eye });
  g.rect(x + 1.6 * sign, y - 1.2, 0.7, 0.7).fill({ color: 0x1b1822 });
  if (exp === 'worried') g.rect(x + 1 * sign, y - 3, 2.5, 0.6).fill({ color: 0x1b1822 });
  if (exp === 'happy') g.rect(x + 1 * sign, y + 2, 2, 0.7).fill({ color: 0x9e2a3a });
  if (talk) g.rect(x + 1.4 * sign, y + 1.6, 1.2, 1.2).fill({ color: 0x1b1822 });
}

function drawHair(g: Painter, style: string, x: number, y: number, hair: number, sign: number, back: boolean) {
  if (back) {
    if (style === 'long' || style === 'wavy') g.rect(x - 4, y - 2, 8, 12).fill({ color: hair });
    else if (style === 'braid') g.rect(x - 1, y + 2, 2, 10).fill({ color: hair });
    else if (style === 'locs') {
      g.rect(x - 4, y, 1.4, 8).fill({ color: hair });
      g.rect(x - 1, y + 1, 1.4, 9).fill({ color: hair });
      g.rect(x + 2, y, 1.4, 7).fill({ color: hair });
    } else if (style === 'ponytail') g.rect(x - 4 * sign, y, 2, 8).fill({ color: hair });
    else if (style === 'curls') {
      g.circle(x - 4, y + 2, 2).fill({ color: hair });
      g.circle(x + 4, y + 2, 2).fill({ color: hair });
    } else g.circle(x, y - 1, 5.5).fill({ color: hair });
    return;
  }
  if (style === 'bald') return;
  if (style === 'mohawk') g.rect(x - 1.2, y - 10, 2.4, 6).fill({ color: hair });
  else if (style === 'bun') g.circle(x, y - 7, 2.4).fill({ color: hair });
  else if (style === 'bob') g.ellipse(x, y - 1, 6, 4).fill({ color: hair });
  else if (style === 'short_messy') {
    g.poly([x - 5, y - 3, x - 2, y - 8, x, y - 4, x + 2, y - 8, x + 5, y - 3]).fill({ color: hair });
  } else if (style === 'wavy') g.poly([x - 5, y - 4, x - 2, y - 7, x + 1, y - 4, x + 4, y - 7, x + 5, y - 2]).fill({ color: hair });
  else g.rect(x - 4.5, y - 5, 9, 2.2).fill({ color: hair });
}

function drawHat(g: Painter, hat: string, x: number, y: number, robe: number, sign: number) {
  const brim = 0x2a2533;
  if (hat === 'none' || hat === 'bald') return;
  if (hat === 'pointed' || hat === 'floppy' || hat === 'crooked') {
    const tip = hat === 'pointed' ? 0 : -6 * sign;
    g.poly([x - 6, y - 4, x + 6, y - 4, x + tip, y - 16]).fill({ color: robe });
    g.rect(x - 7, y - 4, 14, 2).fill({ color: brim });
  } else if (hat === 'wide') {
    g.poly([x - 4, y - 4, x + 4, y - 4, x, y - 12]).fill({ color: robe });
    g.rect(x - 9, y - 5, 18, 2).fill({ color: brim });
  } else if (hat === 'hood') {
    g.poly([x - 6, y - 1, x + 6, y - 1, x + 4, y - 9, x - 4, y - 8]).fill({ color: shade(robe, 0.8) });
  } else if (hat === 'circlet') {
    g.rect(x - 5, y - 5, 10, 1.6).fill({ color: 0xf7e39a });
    g.rect(x - 1, y - 7, 2, 2).fill({ color: 0x9cd4ff });
  } else if (hat === 'cap' || hat === 'beret') {
    g.ellipse(x - 1 * sign, y - 5, 6, 2.4).fill({ color: robe });
  } else if (hat === 'flowers') {
    for (let i = 0; i < 5; i++) g.circle(x - 4 + i * 2, y - 6, 1.3).fill({ color: i % 2 ? 0xd97a9a : 0xf7e39a });
  } else if (hat === 'crown') {
    g.poly([x - 5, y - 4, x + 5, y - 4, x + 5, y - 10, x + 2, y - 7, x, y - 11, x - 2, y - 7, x - 5, y - 10]).fill({ color: 0xddb843 });
  }
}

function drawMark(g: Painter, look: DollLook, x: number, hip: number, hem: number, sign: number, robe: number) {
  const tint = num(SCHOOL_HEX[look.school || ''] || look.robeColor, robe);
  const glyphKind = SCHOOL_GLYPH[look.school || ''] || 'star8';
  if (look.mark === 'sigil') {
    g.rect(x - 1, hip - 16, 2, 2).fill({ color: 0xf7e39a });
  } else if (look.mark === 'scarf') {
    g.rect(x - 5, hip - 6, 10, 2.5).fill({ color: tint });
    glyph(g, glyphKind, x + 3 * sign, hip - 5, 1.4, 0xf6f1e8);
  } else if (look.mark === 'stole') {
    g.rect(x - 1.5, hip - 5, 3, Math.max(4, hem - (hip - 5) - 1)).fill({ color: 0xf6f1e8 });
    glyph(g, careerGlyph(look.career), x, hip - 1, 1.6, tint);
  } else if (look.mark === 'star') {
    glyph(g, 'star8', x, hip - 1, 2.4, 0xf7e39a);
  } else if (look.mark === 'pack') {
    g.rect(x + 3 * sign, hip - 2, 4, 3).fill({ color: 0xf6f1e8 });
  } else if (look.mark === 'folded') {
    g.rect(x + 3 * sign, hip, 4, 2).fill({ color: tint });
  }
}

function careerGlyph(career?: string): string {
  switch (career) {
    case 'gardener': return 'leaf';
    case 'builder': return 'hammer';
    case 'alchemist': return 'flask';
    case 'warder': return 'shield';
    case 'tamer': return 'heart';
    case 'adventurer': return 'rift';
    default: return 'star8';
  }
}

function drawItem(g: Painter, item: HeldItem, look: DollLook, x: number, headY: number, hip: number, sign: number, p: { armUp: boolean; cast: boolean; work: boolean }) {
  const ix = x + (p.armUp ? 2 : 7) * sign;
  const iy = p.armUp ? headY - 8 : hip - 2;
  if (item === 'none') return;
  if (item === 'staff') {
    const staff = STAFFS.find(s => s.id === look.staff) || STAFFS[0];
    g.rect(ix, headY - 14, 1.6, 24).fill({ color: num(staff.shaft, 0x6e4529) });
    const tip = num(staff.tip, 0x9cd4ff);
    if (staff.id === 'crystal') g.poly([ix + 0.8, headY - 20, ix + 3.5, headY - 16, ix + 0.8, headY - 12, ix - 2, headY - 16]).fill({ color: tip });
    else if (staff.id === 'moon') {
      g.circle(ix + 0.8, headY - 16, 2.6).fill({ color: tip });
      g.circle(ix + 1.6, headY - 16.4, 2).fill({ color: 0x2a2533 });
    } else if (staff.id === 'star') glyph(g, 'star8', ix + 0.8, headY - 16, 2.4, tip);
    else if (staff.id === 'willow') {
      g.ellipse(ix + 2, headY - 15, 2.4, 1.2).fill({ color: tip });
      g.ellipse(ix - 1, headY - 17, 2.4, 1.2).fill({ color: tip });
    } else g.circle(ix + 0.8, headY - 16, 2.4).fill({ color: tip });
    if (p.cast) g.circle(ix + 0.8, headY - 20, 1.5).fill({ color: num(look.robeColor), alpha: 0.9 });
    return;
  }
  if (item === 'book') {
    g.rect(ix - 2, iy, 5, 4).fill({ color: 0x6b4fbb });
    g.rect(ix, iy, 0.6, 4).fill({ color: 0xf6f1e8 });
  } else if (item === 'tray') {
    g.ellipse(ix, iy + 1, 4, 1.5).fill({ color: 0xc28e5c });
    g.circle(ix, iy - 1, 1.2).fill({ color: 0xe0a33a });
  } else if (item === 'lantern') {
    g.rect(ix - 1.5, iy - 2, 3, 4).fill({ color: 0xf6e08c });
    g.rect(ix - 0.4, iy - 4, 0.8, 2).fill({ color: 0x3b3a40 });
  } else if (item === 'broom') {
    g.rect(ix, iy - 8, 1.2, 12).fill({ color: 0x6e4529 });
    g.rect(ix - 2, iy - 8, 5, 2).fill({ color: 0xc9b88a });
  } else if (item === 'watering') {
    g.rect(ix - 2, iy - 2, 4, 3).fill({ color: 0x3a6a9a });
    g.rect(ix + 2, iy - 1, 2, 1).fill({ color: 0x8a8994 });
  } else if (item === 'hammer') {
    const lift = p.work ? -3 : 0;
    g.rect(ix, iy - 6 + lift, 1.2, 8).fill({ color: 0x6e4529 });
    g.rect(ix - 2, iy - 7 + lift, 5, 2).fill({ color: 0x8a8994 });
  } else if (item === 'quill') {
    g.poly([ix, iy - 6, ix + 1.5, iy + 2, ix - 0.5, iy + 1]).fill({ color: 0xf6f1e8 });
  } else if (item === 'crate') {
    g.rect(ix - 3, iy - 4, 6, 5).fill({ color: 0x96633b });
    g.rect(ix - 3, iy - 2, 6, 0.6).fill({ color: 0x6e4529 });
  }
}

function drawSleep(g: Painter, look: DollLook, x: number, y: number) {
  const robe = num(look.robeColor);
  const skin = num(look.skin);
  g.ellipse(x, y - 1, 8, 2).fill({ color: 0x000000, alpha: 0.35 });
  g.ellipse(x, y - 4, 10, 3).fill({ color: robe });
  g.circle(x + 8, y - 5, 3.5).fill({ color: skin });
  g.rect(x + 7, y - 6, 2, 0.6).fill({ color: 0x1b1822 });
  if (look.mark === 'star') glyph(g, 'star8', x, y - 4, 1.6, 0xf7e39a);
  else if (look.mark === 'scarf') g.rect(x + 4, y - 5, 3, 1.2).fill({ color: num(SCHOOL_HEX[look.school || ''] || look.robeColor) });
  else if (look.mark === 'stole') g.rect(x - 1, y - 6, 4, 1.2).fill({ color: 0xf6f1e8 });
}

/** 64×64 portrait: idle head-and-shoulders crop scaled ×4, school-coloured round frame. */
export const PORTRAIT_PX = 64;

export function drawPortrait(g: Painter, look: DollLook): void {
  const frame = num(SCHOOL_HEX[look.school || ''] || look.robeColor, 0x6b4fbb);
  g.circle(32, 32, 30).fill({ color: darken(frame, 0.45) });
  g.circle(32, 32, 27).fill({ color: frame });
  g.circle(32, 32, 24).fill({ color: 0x1b1822 });
  // Head and shoulders of the idle frame, drawn at ×4 inside the frame.
  const bake = appearanceToLayers({
    isWizard: look.role === 'wizard',
    status: look.role === 'student' ? 'student' : look.role === 'resident' ? 'resident' : look.role === 'faculty' || look.role === 'sabbatical' || look.role === 'adventurer' ? 'faculty' : 'student',
    career: look.role === 'adventurer' ? 'adventurer' : look.role === 'faculty' ? (look.career || 'teacher') : undefined,
    careerState: look.role === 'sabbatical' ? 'sabbatical' : undefined,
    currentSchool: look.school,
    masteredSchools: look.role === 'resident' ? ['nature'] : look.mastered,
    appearance: {
      skin: look.skin, hair: look.hair, hairColor: look.hairColor, robeColor: look.robeColor,
      hat: look.hat, eyes: look.eyes, face: look.face, shoes: look.shoes, staff: look.staff, bodyShape: look.bodyShape
    },
    anim: 'idle'
  });
  // Scale by drawing the bust with enlarged parts centred in the circle.
  drawBust(g, bake.role === look.role ? bake : { ...bake, role: look.role, mark: look.mark }, 32, 40);
}

function drawBust(g: Painter, look: DollLook, x: number, y: number) {
  const robe = num(look.robeColor);
  const skin = num(look.skin);
  const hair = num(look.hairColor);
  g.poly([x - 16, y + 6, x + 16, y + 6, x + 12, y - 6, x - 12, y - 6]).fill({ color: look.role === 'sabbatical' ? mix(robe, 0x8a8994, 0.5) : robe });
  if (look.role === 'wizard') g.poly([x - 18, y - 4, x - 12, y - 8, x - 14, y + 8]).fill({ color: shade(robe, 0.55) });
  drawHead(g, look.face, x, y - 12, skin);
  if (look.hair !== 'bald') drawHair(g, look.hair, x, y - 12, hair, 1, true);
  drawFace(g, 'neutral', x, y - 12, num(look.eyes), 1, false);
  if (look.hair !== 'bald') drawHair(g, look.hair, x, y - 12, hair, 1, false);
  drawHat(g, look.hat, x, y - 12, robe, 1);
  drawMark(g, look, x, y - 2, y + 6, 1, robe);
  if (look.role === 'wizard') g.circle(x, y - 22, 2).fill({ color: 0xf7e39a });
}

export type BubbleKind =
  | { kind: 'injury'; injury: InjuryType }
  | { kind: 'need'; need: 'hunger' | 'rest' | 'leisure' | 'composure'; urgent: boolean }
  | { kind: 'mastery' }
  | { kind: 'morale' };

/** One bubble, priority order from Addendum 6.7. */
export function chooseBubble(char: {
  injury?: { type: InjuryType };
  needs?: { hunger: number; rest: number; leisure: number; composure: number };
  readyDays?: Record<string, number>;
  morale?: number;
}, opts: { needsLens?: boolean; hovered?: boolean; showMorale?: boolean } = {}): BubbleKind | null {
  if (char.injury) return { kind: 'injury', injury: char.injury.type };
  const needs = char.needs;
  if (needs) {
    const bands: Array<['hunger' | 'rest' | 'leisure' | 'composure', number]> = [
      ['hunger', needs.hunger], ['rest', needs.rest], ['leisure', needs.leisure], ['composure', needs.composure]
    ];
    const urgent = bands.filter(([, n]) => n <= 24).sort((a, b) => a[1] - b[1])[0];
    if (urgent) return { kind: 'need', need: urgent[0], urgent: true };
    const ready = Object.values(char.readyDays || {}).some(d => d > 0);
    if (ready) return { kind: 'mastery' };
    if (opts.needsLens || opts.hovered) {
      const mild = bands.filter(([, n]) => n >= 25 && n <= 49).sort((a, b) => a[1] - b[1])[0];
      if (mild) return { kind: 'need', need: mild[0], urgent: false };
    }
  } else if (Object.values(char.readyDays || {}).some(d => d > 0)) return { kind: 'mastery' };
  if (opts.showMorale && (char.morale ?? 0) >= 80) return { kind: 'morale' };
  return null;
}

export function drawBubble(g: Painter, b: BubbleKind, x: number, y: number, scale = 1) {
  const s = scale;
  if (b.kind === 'injury') {
    g.circle(x, y, 6 * s).fill({ color: 0xf6f1e8 });
    g.circle(x, y, 6 * s).stroke({ color: 0x1b1822, width: 1 });
    if (b.injury === 'bruised') g.circle(x, y, 2.2 * s).fill({ color: 0x6b4fbb });
    else if (b.injury === 'sprained') {
      g.rect(x - 3 * s, y - 1 * s, 6 * s, 2 * s).fill({ color: 0xf6f1e8 });
      g.rect(x - 3 * s, y - 1 * s, 6 * s, 2 * s).stroke({ color: 0x5e5d66, width: 1 });
    } else if (b.injury === 'hexed') g.circle(x, y, 2.5 * s).stroke({ color: 0x7d5ba6, width: 1.2 });
    else if (b.injury === 'broken_bone') g.rect(x - 3 * s, y - 1 * s, 6 * s, 2 * s).fill({ color: 0xe8c547 });
    else g.poly([x, y - 3 * s, x + 1 * s, y - 1 * s, x + 3 * s, y, x + 1 * s, y + 1 * s, x, y + 3 * s, x - 1 * s, y + 1 * s, x - 3 * s, y, x - 1 * s, y - 1 * s]).fill({ color: 0xb9a6ff });
    return;
  }
  if (b.kind === 'need') {
    const rim = b.urgent ? 0xd9472b : 0x8a8994;
    g.rect(x - 6 * s, y - 6 * s, 12 * s, 12 * s).fill({ color: 0xf6f1e8 });
    g.rect(x - 6 * s, y - 6 * s, 12 * s, 12 * s).stroke({ color: rim, width: 1 });
    if (b.need === 'hunger') g.ellipse(x, y + 1 * s, 3 * s, 1.4 * s).fill({ color: 0xc28e5c });
    else if (b.need === 'rest') g.rect(x - 3 * s, y - 1 * s, 6 * s, 3 * s).fill({ color: 0x9cd4ff });
    else if (b.need === 'leisure') g.circle(x, y, 2 * s).fill({ color: 0xe8c547 });
    else g.circle(x, y, 2 * s).fill({ color: 0x5e5d66 });
    return;
  }
  if (b.kind === 'mastery') {
    glyph(g, 'star8', x, y, 6 * s, 0xf7e39a);
    return;
  }
  glyph(g, 'heart', x, y, 5 * s, 0xd97a9a);
}

export function bubbleLabel(bubbles: BubbleKind[]): string {
  let hungry = 0, injured = 0, rest = 0, other = 0;
  for (const b of bubbles) {
    if (b.kind === 'injury') injured++;
    else if (b.kind === 'need' && b.need === 'hunger') hungry++;
    else if (b.kind === 'need' && b.need === 'rest') rest++;
    else other++;
  }
  const parts: string[] = [];
  if (hungry) parts.push(`${hungry} hungry`);
  if (rest) parts.push(`${rest} exhausted`);
  if (injured) parts.push(`${injured} injured`);
  if (other) parts.push(`${other} more`);
  return parts.join(', ') || `${bubbles.length} needs`;
}

/**
 * Where an injured character goes (Addendum 7.2). Broken Bone stays in their own bed.
 * Infirmary, else bedRoomId, else the Entrance Hall.
 */
export function healingPlaceFor(
  char: { injury?: { type: string }; bedRoomId?: number },
  rooms: Array<Pick<PlacedRoom, 'id' | 'defId' | 'state'>>,
  isReachable: (id: number) => boolean = () => true
): number | undefined {
  const built = (defId: string) => rooms.find(r => r.state === 'built' && r.defId === defId && isReachable(r.id));
  const bedOk = char.bedRoomId != null && rooms.some(r => r.id === char.bedRoomId && r.state === 'built' && isReachable(r.id));
  if (char.injury?.type === 'broken_bone') {
    if (bedOk) return char.bedRoomId;
    return built('entrance_hall')?.id ?? rooms.find(r => r.defId === 'entrance_hall')?.id ?? char.bedRoomId;
  }
  const infirmary = built('infirmary');
  if (infirmary) return infirmary.id;
  if (bedOk) return char.bedRoomId;
  return built('entrance_hall')?.id ?? rooms.find(r => r.state === 'built' && r.defId === 'entrance_hall')?.id;
}

export const LAYER_OPTIONS = {
  body: [1, 2, 3, 4],
  skin: ['#F6D7C3', '#EDC0A0', '#D9A07A', '#C08560', '#A06A48', '#845236', '#643C26', '#4A2A1A'],
  hair: HAIR_STYLES.map(h => h.id),
  eyes: EYE_COLOURS.map(e => e.color),
  face: [...FACE_SHAPES],
  shoes: [...SHOE_KINDS],
  hat: HATS.map(h => h.id),
  staff: STAFFS.map(s => s.id),
  roles: ['wizard', 'faculty', 'resident', 'student', 'adventurer', 'sabbatical'] as DollRole[]
};
