/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room status visuals (Addendum 5.6 ring, 5.7 cleanliness / locks / hazards, 5.3 damaged furniture).
 * World-space art drawn above furniture and below agents; text labels live in the screen-space
 * overlay so they stay crisp. Only reads the room; never writes state.
 */
import { PlacedRoom } from '../../types/ankicaster';
import { Painter, line, noise } from './painter';
import { Box } from './roomArt';

/** Dirt decal sets by cleanliness (5.7): 70-100 clean, 40-69 A, 20-39 A+B, 0-19 A+B+C + Dirty badge. */
export function dirtLevel(cleanliness: number): 0 | 1 | 2 | 3 {
  if (cleanliness >= 70) return 0;
  if (cleanliness >= 40) return 1;
  if (cleanliness >= 20) return 2;
  return 3;
}

export function drawDirt(g: Painter, room: PlacedRoom, box: Box) {
  const lvl = dirtLevel(room.cleanliness ?? 100);
  if (!lvl) return lvl;
  const L = box.left, W = box.width, B = box.floorLineY, T = box.top + 3, s = room.id;
  // A: dust specks on the floor
  for (let i = 0; i < Math.round(W / 6); i++) {
    g.rect(L + 3 + noise(s, i) * (W - 6), B - 1 - noise(s, i + 50) * 2, 1, 1).fill({ color: 0x6b5a48, alpha: 0.85 });
  }
  if (lvl >= 2) {
    // B: cobweb in the top-right corner, stains, scattered paper
    const cx = L + W - 3;
    line(g, cx, T, cx - 9, T, 0xd8d8d8, 0.5, 0.9);
    line(g, cx, T, cx, T + 9, 0xd8d8d8, 0.5, 0.9);
    line(g, cx, T + 7, cx - 7, T, 0xd8d8d8, 0.5, 0.9);
    line(g, cx, T + 4, cx - 4, T, 0xd8d8d8, 0.4, 0.9);
    for (let i = 0; i < 3; i++) g.ellipse(L + 10 + noise(s, i + 9) * (W - 20), T + 8 + noise(s, i + 19) * (B - T - 16), 3, 2).fill({ color: 0x4a3a2a, alpha: 0.35 });
    for (let i = 0; i < 2; i++) {
      const px = L + 8 + noise(s, i + 31) * (W - 16);
      g.poly([px, B - 1, px + 4, B - 2, px + 5, B - 0.5, px + 1, B]).fill({ color: 0xf6f1e8, alpha: 0.9 });
    }
  }
  if (lvl >= 3) {
    // C: muddy footprint trail
    for (let x = L + 6, i = 0; x < L + W - 6; x += 7, i++) g.ellipse(x, B - 0.8 - (i % 2) * 1.2, 1.6, 0.7).fill({ color: 0x5a4030, alpha: 0.8 });
  }
  return lvl;
}

/** Hazard look from lockReason / hazard type (Section 9.3, simplified forge version). */
export function drawLockHazard(g: Painter, room: PlacedRoom, box: Box) {
  const kind = (room.hazard?.type || room.lockReason || '').toLowerCase();
  const L = box.left, W = box.width, B = box.floorLineY, T = box.top;
  if (kind.includes('spill') || kind.includes('night')) {
    g.ellipse(L + W / 2, B - 1, W * 0.35, 3).fill({ color: 0x151a38, alpha: 0.9 });
    g.rect(L, T, W, box.height).fill({ color: 0x151a38, alpha: 0.25 });
  } else if (kind.includes('fog')) {
    for (let i = 0; i < 5; i++) g.ellipse(L + (i + 0.5) * (W / 5), B - 10 - (i % 2) * 6, W / 6, 6).fill({ color: 0x9c86e0, alpha: 0.3 });
  } else if (kind.includes('cold') || kind.includes('frost')) {
    g.rect(L, T, W, box.height).fill({ color: 0xd8eef7, alpha: 0.25 });
    for (let x = L + 4; x < L + W; x += 8) line(g, x, T + 3, x + 2, T + 7, 0xffffff, 0.75, 0.8);
  } else if (kind.includes('breach')) {
    g.ellipse(L + W / 2, T + box.height / 2, 7, 12).fill({ color: 0x7d5ba6, alpha: 0.7 });
  } else {
    g.rect(L, T, W, box.height).fill({ color: 0x2f3a73, alpha: 0.25 });
  }
}

export function drawPadlock(g: Painter, x: number, y: number) {
  g.circle(x, y, 7).fill({ color: 0x1b1822, alpha: 0.9 });
  g.circle(x, y, 7).stroke({ color: 0xe8c547, width: 1 });
  g.ellipse(x, y - 2.5, 2.5, 3).stroke({ color: 0xe8c547, width: 1.25 });
  g.rect(x - 3.5, y - 1, 7, 5).fill({ color: 0xe8c547 });
  g.rect(x - 0.5, y + 0.5, 1, 2).fill({ color: 0x1b1822 });
}

export function drawWrench(g: Painter, x: number, y: number) {
  g.circle(x, y, 4).fill({ color: 0x1b1822, alpha: 0.9 });
  line(g, x - 2, y + 2, x + 1.5, y - 1.5, 0xf07a5c, 1.25);
  g.circle(x + 1.8, y - 1.8, 1.4).stroke({ color: 0xf07a5c, width: 0.9 });
}

export function drawDirtyBadge(g: Painter, x: number, y: number) {
  g.circle(x, y, 7).fill({ color: 0x1b1822, alpha: 0.9 });
  g.circle(x, y, 7).stroke({ color: 0xc28e5c, width: 1 });
  g.ellipse(x - 1, y + 1, 3.5, 2.5).fill({ color: 0x7a5a40 });
  g.circle(x + 2.5, y - 2, 1.2).fill({ color: 0x7a5a40 });
}

/** "Unfinished" badge (GDD 15.4 step 6): amber ring with a "+" for missing required fixtures. */
export function drawUnfinishedBadge(g: Painter, x: number, y: number) {
  g.circle(x, y, 7).fill({ color: 0x1b1822, alpha: 0.9 });
  g.circle(x, y, 7).stroke({ color: 0xf0b44a, width: 1.25 });
  g.rect(x - 3.5, y - 0.75, 7, 1.5).fill({ color: 0xf0b44a });
  g.rect(x - 0.75, y - 3.5, 1.5, 7).fill({ color: 0xf0b44a });
}

/** Progress ring: dark disc, track, filled arc for fraction p (clockwise from 12 o'clock). */
export function drawRing(g: Painter, x: number, y: number, r: number, p: number, color: number) {
  g.circle(x, y, r + 2).fill({ color: 0x1b1822, alpha: 0.9 });
  g.circle(x, y, r).stroke({ color: 0x3e4a5c, width: 2 });
  const k = Math.max(0, Math.min(1, p));
  if (k > 0) {
    const steps = Math.max(2, Math.ceil(k * 24));
    const pts: number[] = [];
    for (let i = 0; i <= steps; i++) {
      const a = -Math.PI / 2 + (i / steps) * k * Math.PI * 2;
      pts.push(x + Math.cos(a) * r, y + Math.sin(a) * r);
    }
    for (let i = 0; i + 3 < pts.length; i += 2) line(g, pts[i], pts[i + 1], pts[i + 2], pts[i + 3], color, 2);
  }
}
