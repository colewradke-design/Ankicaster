/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Headmaster appearance (GDD 7.2 / Addendum 6.2 and 10.2).
 * Stored on state.wizard.appearance; colours are hex. Older saves used tokens
 * ('tone1', 'brown') or are missing fields: normalizeAppearance() maps them.
 */

export const SKIN_TONES = [
  '#F6D7C3', '#EDC0A0', '#D9A07A', '#C08560',
  '#A06A48', '#845236', '#643C26', '#4A2A1A'
];

export const HAIR_COLOURS: Array<{ id: string; name: string; color: string }> = [
  { id: 'black', name: 'Black', color: '#1E1A1A' },
  { id: 'brown', name: 'Brown', color: '#4A2E1E' },
  { id: 'chestnut', name: 'Chestnut', color: '#7A4A2A' },
  { id: 'copper', name: 'Copper', color: '#B07A3A' },
  { id: 'blonde', name: 'Blonde', color: '#E0B860' },
  { id: 'platinum', name: 'Platinum', color: '#F2E2B0' },
  { id: 'red', name: 'Red', color: '#B8402A' },
  { id: 'silver', name: 'Silver', color: '#D8D8D8' },
  { id: 'violet', name: 'Violet', color: '#6B4FBB' },
  { id: 'teal', name: 'Teal', color: '#2E8B8B' }
];

/** 8 side-profile hair styles. Removed ids resolve through HAIR_ALIAS. */
export const HAIR_STYLES: Array<{ id: string; name: string }> = [
  { id: 'short', name: 'Short' },
  { id: 'bob', name: 'Bob' },
  { id: 'long', name: 'Long' },
  { id: 'braid', name: 'Braid' },
  { id: 'ponytail', name: 'Ponytail' },
  { id: 'bun', name: 'Bun' },
  { id: 'mohawk', name: 'Mohawk' },
  { id: 'bald', name: 'Bald' }
];

/** 4 body shapes (GDD 7.2). */
export const BODY_SHAPES: Array<{ id: 1 | 2 | 3 | 4; name: string }> = [
  { id: 1, name: 'Slight' },
  { id: 2, name: 'Average' },
  { id: 3, name: 'Broad' },
  { id: 4, name: 'Tall' }
];

/** 4 face shapes (Addendum 6.2). */
export const FACE_SHAPES = ['round', 'oval', 'square', 'heart'] as const;

/** 6 expressions (Addendum 6.4). */
export const EXPRESSIONS = ['neutral', 'happy', 'tired', 'worried', 'asleep', 'focused'] as const;

export const EYE_COLOURS: Array<{ id: string; name: string; color: string }> = [
  { id: 'brown', name: 'Brown', color: '#4A2E1E' },
  { id: 'green', name: 'Green', color: '#3A6B2C' },
  { id: 'blue', name: 'Blue', color: '#3A6A9A' },
  { id: 'grey', name: 'Grey', color: '#8A8994' },
  { id: 'amber', name: 'Amber', color: '#C48A22' },
  { id: 'violet', name: 'Violet', color: '#6B4FBB' }
];

export const SHOE_KINDS = ['boots', 'slippers', 'sandals'] as const;

/**
 * 8 hats including "no hat" (GDD 7.2 / Addendum 6.2).
 * crooked, crown and beret stay so older looks still resolve.
 */
export const HATS: Array<{ id: string; name: string }> = [
  { id: 'pointed', name: 'Pointed' },
  { id: 'floppy', name: 'Floppy' },
  { id: 'wide', name: 'Wide brim' },
  { id: 'hood', name: 'Hood' },
  { id: 'circlet', name: 'Circlet' },
  { id: 'cap', name: 'Cap' },
  { id: 'flowers', name: 'Flower crown' },
  { id: 'none', name: 'No hat' },
  { id: 'crooked', name: 'Crooked' },
  { id: 'crown', name: 'Crown' },
  { id: 'beret', name: 'Beret' }
];

/** The eight hats the creation screen offers. */
export const CREATION_HATS = HATS.slice(0, 8);

/** 6 staves (GDD 7.2). */
export const STAFFS: Array<{ id: string; name: string; shaft: string; tip: string }> = [
  { id: 'oak', name: 'Oak', shaft: '#6E4529', tip: '#9CD4FF' },
  { id: 'crystal', name: 'Crystal', shaft: '#8A8994', tip: '#C9A6FF' },
  { id: 'ember', name: 'Ember', shaft: '#4A2E1C', tip: '#F07A5C' },
  { id: 'moon', name: 'Moon', shaft: '#C9CED6', tip: '#EEF1F5' },
  { id: 'willow', name: 'Willow', shaft: '#96633B', tip: '#7DB861' },
  { id: 'star', name: 'Star', shaft: '#B08A22', tip: '#F7E39A' }
];

export const NAME_SUGGESTIONS = [
  'Morgan', 'Rowan', 'Ivy', 'Ash', 'Quinn', 'Harper',
  'Soren', 'Wren', 'Ellis', 'Nova', 'Jules', 'Remy'
];

const HAT_ALIAS: Record<string, string> = {
  'wide-brim': 'wide',
  widebrim: 'wide',
  flower: 'flowers',
  flower_crown: 'flowers',
  'flower crown': 'flowers',
  novice_cap: 'cap',
  soft_cap: 'cap',
  archmage_cowl: 'hood',
  grand_hat: 'pointed',
  none_hat: 'none'
};

export const HAIR_ALIAS: Record<string, string> = {
  messy: 'short',
  short_messy: 'short',
  pixie: 'short',
  straight: 'long',
  curls: 'bob',
  locs: 'long',
  wavy: 'long'
};

export interface WizardAppearance {
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
}

export const DEFAULT_APPEARANCE: WizardAppearance = {
  bodyShape: 1,
  skin: SKIN_TONES[0],
  hair: 'short',
  hairColor: '#4A2E1E',
  eyes: EYE_COLOURS[0].color,
  face: 'round',
  shoes: 'boots',
  robeColor: '#6B4FBB',
  hat: 'pointed',
  staff: 'oak'
};

const HEX = /^#[0-9a-fA-F]{6}$/;

export function hashStr(s: string, seed = 0): number {
  let h = seed | 0;
  for (let i = 0; i < s.length; i++) h = (Math.imul(h, 33) + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

export function resolveSkin(v?: string): string {
  if (v && HEX.test(v)) return v.toUpperCase();
  const m = /^tone(\d)$/.exec(v || '');
  if (m) return SKIN_TONES[Math.min(8, Math.max(1, Number(m[1]))) - 1];
  return DEFAULT_APPEARANCE.skin;
}

export function resolveHairColour(v?: string): string {
  if (v && HEX.test(v)) return v.toUpperCase();
  const named = HAIR_COLOURS.find(h => h.id === (v || '').toLowerCase());
  return named ? named.color : DEFAULT_APPEARANCE.hairColor;
}

export function resolveHair(v?: string, seed = 0): string {
  if (v && HAIR_STYLES.some(h => h.id === v)) return v;
  if (v && HAIR_ALIAS[v]) return HAIR_ALIAS[v];
  if (!v) return DEFAULT_APPEARANCE.hair;
  return HAIR_STYLES[hashStr(v, seed) % HAIR_STYLES.length].id;
}

export function resolveHat(v?: string): string {
  if (v && HAT_ALIAS[v]) return HAT_ALIAS[v];
  return HATS.some(h => h.id === v) ? (v as string) : DEFAULT_APPEARANCE.hat;
}

export function resolveStaff(v?: string): string {
  return STAFFS.some(s => s.id === v) ? (v as string) : DEFAULT_APPEARANCE.staff;
}

export function resolveEyes(v?: string, seed = 0): string {
  if (v && HEX.test(v)) return v.toUpperCase();
  const named = EYE_COLOURS.find(e => e.id === (v || '').toLowerCase());
  if (named) return named.color;
  if (!v) return DEFAULT_APPEARANCE.eyes;
  return EYE_COLOURS[hashStr(v, seed) % EYE_COLOURS.length].color;
}

export function resolveFace(v?: string, seed = 0): WizardAppearance['face'] {
  if (v && (FACE_SHAPES as readonly string[]).includes(v)) return v as WizardAppearance['face'];
  if (!v) return DEFAULT_APPEARANCE.face;
  return FACE_SHAPES[hashStr(v, seed) % FACE_SHAPES.length];
}

export function resolveShoes(v?: string, seed = 0): WizardAppearance['shoes'] {
  if (v && (SHOE_KINDS as readonly string[]).includes(v)) return v as WizardAppearance['shoes'];
  if (!v) return DEFAULT_APPEARANCE.shoes;
  return SHOE_KINDS[hashStr(v, seed) % SHOE_KINDS.length];
}

export function resolveBody(v?: number, seed = 0): number {
  if (v === 1 || v === 2 || v === 3 || v === 4) return v;
  if (v === undefined) return DEFAULT_APPEARANCE.bodyShape;
  return (Math.abs(seed) % 4) + 1;
}

/** Fill missing fields and map legacy tokens. Safe on undefined/partial input. */
export function normalizeAppearance(a?: Partial<WizardAppearance> | null, seed = 0): WizardAppearance {
  const src = a || {};
  return {
    bodyShape: resolveBody(src.bodyShape, seed),
    skin: resolveSkin(src.skin),
    hair: resolveHair(src.hair, seed),
    hairColor: resolveHairColour(src.hairColor),
    eyes: resolveEyes(src.eyes, seed),
    face: resolveFace(src.face, seed),
    shoes: resolveShoes(src.shoes, seed),
    robeColor: src.robeColor && HEX.test(src.robeColor) ? src.robeColor.toUpperCase() : DEFAULT_APPEARANCE.robeColor,
    hat: resolveHat(src.hat),
    staff: resolveStaff(src.staff)
  };
}

export function hexToNum(hex: string, fallback = 0x4e8b3a): number {
  const n = parseInt((hex || '').replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
}

/** Darken a colour (for capes / shading). Result is an integer 0..0xffffff. */
export function shade(hex: number, f: number): number {
  const r = Math.round(((hex >> 16) & 255) * f);
  const g = Math.round(((hex >> 8) & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (Math.max(0, Math.min(255, r)) << 16) | (Math.max(0, Math.min(255, g)) << 8) | Math.max(0, Math.min(255, b));
}
