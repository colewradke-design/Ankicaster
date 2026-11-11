/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Headmaster appearance (GDD 7.2): options, defaults and normalisation.
 * Stored on state.wizard.appearance; colours are stored as hex. Older saves used tokens
 * ('tone1', 'brown') or are missing fields: normalizeAppearance() maps them to valid values.
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

/** 8 hats including "no hat" (GDD 7.2). */
export const HATS: Array<{ id: string; name: string }> = [
  { id: 'pointed', name: 'Pointed' },
  { id: 'wide', name: 'Wide brim' },
  { id: 'crooked', name: 'Crooked' },
  { id: 'hood', name: 'Hood' },
  { id: 'circlet', name: 'Circlet' },
  { id: 'crown', name: 'Crown' },
  { id: 'beret', name: 'Beret' },
  { id: 'none', name: 'No hat' }
];

/** 6 staves (GDD 7.2). */
export const STAFFS: Array<{ id: string; name: string; shaft: string; tip: string }> = [
  { id: 'oak', name: 'Oak', shaft: '#6E4529', tip: '#9CD4FF' },
  { id: 'crystal', name: 'Crystal', shaft: '#8A8994', tip: '#C9A6FF' },
  { id: 'ember', name: 'Ember', shaft: '#4A2E1C', tip: '#F07A5C' },
  { id: 'moon', name: 'Moon', shaft: '#C9CED6', tip: '#EEF1F5' },
  { id: 'willow', name: 'Willow', shaft: '#96633B', tip: '#7DB861' },
  { id: 'star', name: 'Star', shaft: '#B08A22', tip: '#F7E39A' }
];

export interface WizardAppearance {
  bodyShape: number;
  skin: string;
  hair: string;
  hairColor: string;
  robeColor: string;
  hat: string;
  staff: string;
}

export const DEFAULT_APPEARANCE: WizardAppearance = {
  bodyShape: 1,
  skin: SKIN_TONES[0],
  hair: 'short_messy',
  hairColor: '#4A2E1E',
  robeColor: '#6B4FBB',
  hat: 'pointed',
  staff: 'oak'
};

const HEX = /^#[0-9a-fA-F]{6}$/;

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

export function resolveHat(v?: string): string {
  return HATS.some(h => h.id === v) ? (v as string) : DEFAULT_APPEARANCE.hat;
}

export function resolveStaff(v?: string): string {
  return STAFFS.some(s => s.id === v) ? (v as string) : DEFAULT_APPEARANCE.staff;
}

/** Fill missing fields and map legacy tokens. Safe on undefined/partial input. */
export function normalizeAppearance(a?: Partial<WizardAppearance> | null): WizardAppearance {
  const src = a || {};
  return {
    bodyShape: typeof src.bodyShape === 'number' ? src.bodyShape : DEFAULT_APPEARANCE.bodyShape,
    skin: resolveSkin(src.skin),
    hair: src.hair || DEFAULT_APPEARANCE.hair,
    hairColor: resolveHairColour(src.hairColor),
    robeColor: src.robeColor && HEX.test(src.robeColor) ? src.robeColor.toUpperCase() : DEFAULT_APPEARANCE.robeColor,
    hat: resolveHat(src.hat),
    staff: resolveStaff(src.staff)
  };
}

export function hexToNum(hex: string, fallback = 0x4e8b3a): number {
  const n = parseInt((hex || '').replace('#', ''), 16);
  return Number.isFinite(n) ? n : fallback;
}

/** Darken a colour (for capes / shading). */
export function shade(hex: number, f: number): number {
  const r = Math.round(((hex >> 16) & 255) * f);
  const g = Math.round(((hex >> 8) & 255) * f);
  const b = Math.round((hex & 255) * f);
  return (r << 16) | (g << 8) | b;
}
