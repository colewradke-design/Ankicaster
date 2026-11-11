/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Construction sites (Addendum 5.6). The stage art comes only from p = buildProgress / buildRequired:
 *   1 Marked out (0-0.2)  chalk outline, stakes and string, the materials paid
 *   2 Framed (0.2-0.4)    scaffold frame across the box, floor slab laid
 *   3 Walls rising (0.4-0.6) back wall rises to (p - 0.4) / 0.2 of the height, planks at two levels
 *   4 Roofed (0.6-0.8)    full Bare back wall, ceiling beam, dressing as pale blueprint lines
 *   5 Finishing (0.8-1)   dressing fades in 0 -> 100%, a front tarp drops off at 0.95
 * Paused sites are covered by a tarp in the category colour with a "paused" ribbon (same stage under it).
 * Active sites get a spectral hammer + floating trowel in the headmaster's colour (wizard slot 0),
 * swinging at a fixed 0.8 s whatever the review rate. Pure drawing; never writes state.
 */
import { PlacedRoom } from '../../types/ankicaster';
import { ROOM_DEFINITIONS } from '../../data/content';
import { Painter, line, darken, mix } from './painter';
import { drawTierSkin, drawDressing, drawGroundsPlot, roomTint, roomGlyph, Box, Emitter } from './roomArt';
import { siteFraction, siteStage } from '../../utils/construction';
import { placementCharge } from '../../utils/placement';

/** Wraps a painter and multiplies every alpha (fade-in of the finishing stage). */
export class AlphaPainter implements Painter {
  constructor(private g: Painter, private k: number) {}
  rect(x: number, y: number, w: number, h: number) { this.g.rect(x, y, w, h); return this; }
  circle(x: number, y: number, r: number) { this.g.circle(x, y, r); return this; }
  ellipse(x: number, y: number, rx: number, ry: number) { this.g.ellipse(x, y, rx, ry); return this; }
  poly(p: number[]) { this.g.poly(p); return this; }
  fill(s: { color: number; alpha?: number }) { this.g.fill({ color: s.color, alpha: (s.alpha ?? 1) * this.k }); return this; }
  stroke(s: { color: number; width?: number; alpha?: number }) { this.g.stroke({ ...s, alpha: (s.alpha ?? 1) * this.k }); return this; }
}

/** Wraps a painter and turns fills into thin pale "blueprint" outlines. */
export class BlueprintPainter implements Painter {
  constructor(private g: Painter, private color = 0xbfe3ff, private alpha = 0.55) {}
  rect(x: number, y: number, w: number, h: number) { this.g.rect(x, y, w, h); return this; }
  circle(x: number, y: number, r: number) { this.g.circle(x, y, r); return this; }
  ellipse(x: number, y: number, rx: number, ry: number) { this.g.ellipse(x, y, rx, ry); return this; }
  poly(p: number[]) { this.g.poly(p); return this; }
  fill(_s: { color: number; alpha?: number }) { this.g.stroke({ color: this.color, width: 0.5, alpha: this.alpha }); return this; }
  stroke(s: { color: number; width?: number; alpha?: number }) { this.g.stroke({ color: this.color, width: Math.min(0.75, s.width ?? 1), alpha: this.alpha }); return this; }
}

export interface SiteArtResult {
  stage: 1 | 2 | 3 | 4 | 5 | 6;
  p: number;
  paused: boolean;
  /** Fixed-rate cosmetic bits (spectral hammer etc.); frozen under reduce motion. */
  emitters: Emitter[];
  /** World point for the "paused" ribbon text. */
  ribbon?: { x: number; y: number };
}

const WOOD = 0x96633b, WOOD_D = 0x6e4529, STONE = 0x8a8994, STONE_D = 0x5e5d66, CHALK = 0xf6f1e8;

export function drawSite(g: Painter, room: PlacedRoom, box: Box, opts: { robeColor?: string } = {}): SiteArtResult {
  const def = ROOM_DEFINITIONS[room.defId];
  const p = siteFraction(room);
  const stage = siteStage(p);
  const paused = !!room.buildPaused;
  const tint = roomTint(def, opts.robeColor);
  const res: SiteArtResult = { stage, p, paused, emitters: [] };
  const L = box.left, T = box.top + 3, W = box.width, B = box.floorLineY, R = L + W;
  const castle = room.area === 'castle';

  // Background: open air for a castle cell not yet walled (stages 1-2) - darker interior gap
  if (castle) {
    g.rect(L, box.top, W, box.height).fill({ color: 0x2a2533, alpha: 0.55 });
  } else {
    g.rect(L, box.top + 6, W, B - box.top - 6).fill({ color: 0x4a7d3a, alpha: 0.15 });
    g.rect(L, B, W, 4).fill({ color: 0x3a2a1e });
  }

  // Stage 1+: chalk outline, stakes and string, the materials paid
  if (stage <= 2) {
    for (let x = L + 3; x < R - 3; x += 6) g.rect(x, B - 1, 3, 1).fill({ color: CHALK, alpha: 0.8 });
    for (const sx of [L + 4, R - 4]) {
      g.rect(sx - 0.75, B - 9, 1.5, 9).fill({ color: WOOD });
    }
    line(g, L + 4, B - 8, R - 4, B - 8, CHALK, 0.5, 0.9);
    drawMaterials(g, room, L + W / 2, B);
  }
  // Stage 2+: floor slab laid
  if (stage >= 2) g.rect(L, B, W, 4).fill({ color: castle ? STONE_D : 0x5a4030 });
  // Stage 3: back wall rising + planks at two levels
  if (stage === 3) {
    const k = Math.max(0.05, Math.min(1, (p - 0.4) / 0.2));
    const h = (B - T) * k;
    if (castle) {
      for (let y = B - 8, row = 0; y >= B - h - 0.01; y -= 8, row++) {
        const off = row % 2 ? 8 : 0;
        for (let x = L - off; x < R; x += 16) {
          const x0 = Math.max(L, x + 0.5), x1 = Math.min(R, x + 15.5);
          if (x1 > x0) g.rect(x0, y + 0.5, x1 - x0, 7).fill({ color: row % 2 ? 0x6a6972 : 0x76757e });
        }
      }
      // fresh mortar line on the top course + a hod of bricks
      const rows = h >= 8 ? Math.floor((h - 8) / 8) + 1 : 0;
      const topY = B - 8 * rows;
      g.rect(L, topY, W, 1).fill({ color: 0xd8d0c0 });
      g.rect(L + W - 18, B - 5, 8, 5).fill({ color: 0x9c7a58 });
    } else {
      g.rect(L + 4, B - Math.min(10, h), W - 8, Math.min(10, h)).fill({ color: WOOD_D, alpha: 0.8 });
    }
  }
  // Stage 4-5: full Bare back wall + ceiling beam + dressing (blueprint, then fading in)
  if (stage >= 4) {
    const em: Emitter[] = [];
    if (castle) {
      drawTierSkin(g, box, 'bare', tint, roomGlyph(def), room.id, em);
      g.rect(L, box.top, W, 3).fill({ color: 0x2a2533 });
      if (stage === 4) {
        drawDressing(new BlueprintPainter(g), room, box, tint, roomGlyph(def), em);
      } else {
        const k = Math.min(1, (p - 0.8) / 0.2);
        drawDressing(new BlueprintPainter(g, 0xbfe3ff, 0.55 * (1 - k)), room, box, tint, roomGlyph(def), em);
        drawDressing(new AlphaPainter(g, k), room, box, tint, roomGlyph(def), em);
      }
    } else {
      if (stage === 4) drawGroundsPlot(new BlueprintPainter(g, 0xf6f1e8, 0.7), room, box, em);
      else drawGroundsPlot(new AlphaPainter(g, Math.min(1, (p - 0.8) / 0.2)), room, box, em);
    }
  }
  // Scaffolding (stages 2-5): poles, cross braces and planks at two levels
  if (stage >= 2 && stage <= 5) {
    const top = castle ? box.top + 2 : B - 30;
    const poles: number[] = [];
    for (let x = L + 5; x <= R - 4; x += Math.max(24, Math.floor((W - 9) / Math.max(1, Math.round(W / 32))))) poles.push(x);
    if (poles[poles.length - 1] < R - 8) poles.push(R - 5);
    for (const x of poles) g.rect(x - 1, top, 2, B - top).fill({ color: WOOD });
    for (let i = 0; i + 1 < poles.length; i++) {
      line(g, poles[i], B - 2, poles[i + 1], top + 4, WOOD_D, 1, 0.9);
    }
    const levels = stage >= 3 ? [B - (B - top) * 0.33, B - (B - top) * 0.7] : [B - (B - top) * 0.5];
    for (const y of levels) {
      g.rect(L + 2, y, W - 4, 2).fill({ color: 0xc28e5c });
      g.rect(L + 2, y + 2, W - 4, 0.75).fill({ color: WOOD_D });
    }
  }
  // Stage 5: front tarp until 0.95, then it has dropped off
  if (stage === 5 && p < 0.95 && !paused) {
    const tc = mix(tint, 0xe3dbce, 0.35);
    g.rect(L + 2, box.top + 4, W * 0.45, B - box.top - 6).fill({ color: tc, alpha: 0.85 });
    for (let x = L + 8; x < L + W * 0.45; x += 8) line(g, x, box.top + 5, x - 2, B - 3, darken(tc, 0.8), 0.75, 0.8);
  }
  // Paused: canvas tarp in the category colour + "paused" ribbon
  if (paused) {
    const tc = mix(tint, 0xe3dbce, 0.2);
    g.poly([L + 1, box.top + 2, R - 1, box.top + 2, R - 3, B + 2, L + 3, B + 2]).fill({ color: tc, alpha: 0.93 });
    for (let x = L + 10; x < R - 4; x += 12) line(g, x, box.top + 3, x + 3, B + 1, darken(tc, 0.75), 1, 0.7);
    for (const x of [L + 3, R - 3]) g.circle(x, box.top + 3, 1.5).fill({ color: 0x3b3a40 });
    const ry = box.top + box.height / 2;
    g.poly([L + W / 2 - 22, ry - 5, L + W / 2 + 22, ry - 5, L + W / 2 + 18, ry, L + W / 2 + 22, ry + 5, L + W / 2 - 22, ry + 5, L + W / 2 - 18, ry]).fill({ color: 0x1b1822, alpha: 0.85 });
    res.ribbon = { x: L + W / 2, y: ry };
  } else if (stage <= 5) {
    // Workers: spectral hammer + floating trowel (wizard slot 0)
    const c = opts.robeColor ? parseInt(opts.robeColor.replace('#', ''), 16) : 0x9c86e0;
    res.emitters.push({ kind: 'hammer', x: L + W * 0.62, y: B - 14, color: mix(c, 0xffffff, 0.35) });
  }
  return res;
}

/** The materials actually paid, as small piles (Timber logs, Stone blocks, Glass panes). */
function drawMaterials(g: Painter, room: PlacedRoom, cx: number, B: number) {
  const paid = room.spent || placementCharge(room.defId);
  let x = cx - 10;
  if ((paid.timber || 0) > 0) {
    for (let i = 0; i < 3; i++) g.rect(x, B - 2 - i * 2, 9, 2).fill({ color: i % 2 ? 0x96633b : 0xc28e5c });
    x += 11;
  }
  if ((paid.stone || 0) > 0) {
    g.rect(x, B - 4, 4, 4).fill({ color: STONE });
    g.rect(x + 4.5, B - 4, 4, 4).fill({ color: 0xb9b8c2 });
    g.rect(x + 2, B - 7.5, 4, 3.5).fill({ color: STONE });
    x += 11;
  }
  if ((paid.glass || 0) > 0) {
    g.rect(x, B - 7, 1.5, 7).fill({ color: 0x9cd4ff, alpha: 0.85 });
    g.rect(x + 2, B - 7, 1.5, 7).fill({ color: 0x9cd4ff, alpha: 0.85 });
    x += 6;
  }
  if (x === cx - 10) {
    // mana-only rooms: a little crate of supplies
    g.rect(x, B - 6, 7, 6).fill({ color: 0x96633b });
    line(g, x, B - 6, x + 7, B, 0x6e4529, 0.75);
  }
}
