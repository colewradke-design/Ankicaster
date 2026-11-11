/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Forge drawing helpers (Addendum 12.2, Tier 0 art). Everything in src/visual/rooms draws through
 * the `Painter` subset of the Pixi Graphics API so the catalog test can record the calls in node
 * and check every room / furniture id draws without errors or non-finite geometry.
 */
import type { PaperDollPainter } from '../sprites/forge/ForgeRenderer';

export type Painter = PaperDollPainter;

export const hex = (s: string) => parseInt(s.replace('#', ''), 16);

export function line(g: Painter, x1: number, y1: number, x2: number, y2: number, color: number, width = 1, alpha = 1) {
  g.poly([x1, y1, x2, y2]).stroke({ color, width, alpha });
}

/** Deterministic 0..1 noise from integers (seeded per room so walls never shimmer between redraws). */
export function noise(seed: number, i: number): number {
  let h = (seed * 374761393 + i * 668265263) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  h = h ^ (h >>> 16);
  return ((h >>> 0) % 10000) / 10000;
}

export function mix(a: number, b: number, t: number): number {
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t), gg = Math.round(ag + (bg - ag) * t), bl = Math.round(ab + (bb - ab) * t);
  return (r << 16) | (gg << 8) | bl;
}

export function darken(c: number, f: number): number {
  return mix(c, 0x000000, 1 - f);
}

/** A small flame (static frame 0, or frame 0..3 when animated). */
export function flame(g: Painter, x: number, y: number, size = 1, frame = 0) {
  const lean = [0, 0.6, 0, -0.6][frame % 4] * size;
  const tall = [1, 1.15, 0.9, 1.1][frame % 4];
  g.poly([x - 2.2 * size, y, x + lean, y - 6 * size * tall, x + 2.2 * size, y]).fill({ color: 0xe8752a });
  g.poly([x - 1.1 * size, y, x + lean * 0.6, y - 3.6 * size * tall, x + 1.1 * size, y]).fill({ color: 0xf7e39a });
}

/** A school / category glyph inside a w x w box centred at (x, y). */
export function glyph(g: Painter, kind: string, x: number, y: number, r: number, color: number) {
  if (kind === 'star8' || kind === 'star') {
    const pts: number[] = [];
    for (let i = 0; i < 16; i++) {
      const a = (Math.PI * i) / 8 - Math.PI / 2;
      const rr = i % 2 === 0 ? r : r * 0.45;
      pts.push(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
    }
    g.poly(pts).fill({ color });
  } else if (kind === 'leaf') {
    g.ellipse(x, y, r * 0.55, r).fill({ color });
    line(g, x, y - r, x, y + r, darken(color, 0.6), 1);
  } else if (kind === 'sun') {
    g.circle(x, y, r * 0.55).fill({ color });
    for (let i = 0; i < 8; i++) {
      const a = (Math.PI * i) / 4;
      line(g, x + Math.cos(a) * r * 0.7, y + Math.sin(a) * r * 0.7, x + Math.cos(a) * r, y + Math.sin(a) * r, color, 1);
    }
  } else if (kind === 'crescent') {
    g.circle(x, y, r).fill({ color });
    g.circle(x + r * 0.45, y - r * 0.2, r * 0.8).fill({ color: darken(color, 0.25) });
  } else if (kind === 'flask') {
    g.rect(x - r * 0.2, y - r, r * 0.4, r * 0.7).fill({ color });
    g.poly([x - r * 0.25, y - r * 0.35, x + r * 0.25, y - r * 0.35, x + r * 0.8, y + r, x - r * 0.8, y + r]).fill({ color });
  } else if (kind === 'hammer') {
    g.rect(x - r * 0.15, y - r * 0.4, r * 0.3, r * 1.4).fill({ color });
    g.rect(x - r * 0.7, y - r, r * 1.4, r * 0.6).fill({ color });
  } else if (kind === 'heart') {
    g.circle(x - r * 0.4, y - r * 0.2, r * 0.5).fill({ color });
    g.circle(x + r * 0.4, y - r * 0.2, r * 0.5).fill({ color });
    g.poly([x - r * 0.85, y, x + r * 0.85, y, x, y + r]).fill({ color });
  } else if (kind === 'rift') {
    g.ellipse(x, y, r * 0.6, r).stroke({ color, width: 1.5 });
    g.circle(x, y, r * 0.3).fill({ color });
  } else {
    // keep / shield
    g.poly([x - r * 0.8, y - r, x + r * 0.8, y - r, x + r * 0.8, y, x, y + r, x - r * 0.8, y]).fill({ color });
  }
}
