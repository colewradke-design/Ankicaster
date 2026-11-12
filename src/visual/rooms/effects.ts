/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One-shot cosmetic effects triggered by player-visible state changes (Addendum 5.4, 5.6):
 *  - reveal: a site finished -> dust puff as the scaffold comes down
 *  - dust:   a room was demolished or a site cancelled (player action) -> 0.8 s dust cloud
 *  - level:  room.level went up -> 1.2 s gold outline trace + 12 sparkles (L3: 2 s name banner + shimmer)
 *  - wipe:   quality tier went up -> 600 ms left-to-right skin wipe with sparkles on the edge
 *  - fade:   quality tier went down -> 600 ms plain cross-fade
 *  - pop:    one output floater per producing room when the bell changes (1.2 s)
 * Durations are fixed real time; nothing scales with review count or speed. Off under reduce motion.
 */
import { Painter } from './painter';

export const EFFECT_MS = { dust: 800, reveal: 900, level: 1200, level3: 2000, tier: 600, pop: 1200 };

export interface VisualEffect {
  kind: 'dust' | 'reveal' | 'level' | 'wipe' | 'fade' | 'pop';
  box: { left: number; top: number; width: number; height: number };
  start: number;
  ms: number;
  level?: number;
  name?: string;
  roomId?: number;
  color?: number;
}

export function drawEffect(g: Painter, e: VisualEffect, t: number) {
  const { left: L, top: T, width: W, height: H } = e.box;
  if (e.kind === 'wipe') {
    const x = L + W * t;
    if (x < L + W) g.rect(x, T, Math.max(0, L + W - x), H).fill({ color: 0x1b1822, alpha: 0.35 * (1 - t) });
    g.rect(x - 1, T, 2, H).fill({ color: 0xf7e39a, alpha: 0.9 });
    for (let i = 0; i < 3; i++) {
      const y = T + ((i + 0.5) * H) / 3;
      const a = 1 - t;
      g.rect(x - 0.5, y - 2, 1, 4).fill({ color: 0xffffff, alpha: a });
      g.rect(x - 2, y - 0.5, 4, 1).fill({ color: 0xffffff, alpha: a });
    }
    return;
  }
  if (e.kind === 'fade') {
    g.rect(L, T, W, H).fill({ color: 0xf6f1e8, alpha: 0.45 * (1 - t) });
    return;
  }
  if (e.kind === 'pop') {
    const rise = t * 18;
    const a = t < 0.7 ? 1 : Math.max(0, 1 - (t - 0.7) / 0.3);
    const x = L + W / 2 - 16;
    const y = T - 8 - rise;
    g.circle(x, y, 3).fill({ color: e.color ?? 0xe0a33a, alpha: a });
    return;
  }
  if (e.kind === 'dust' || e.kind === 'reveal') {
    const n = Math.max(4, Math.round(W / 14));
    for (let i = 0; i < n; i++) {
      const x = L + ((i + 0.5) * W) / n;
      const r = 4 + t * 10;
      g.circle(x + Math.sin(i * 1.7) * t * 6, T + H - 4 - t * (6 + (i % 3) * 3), r).fill({ color: 0xc9c0b0, alpha: 0.55 * (1 - t) });
    }
    if (e.kind === 'reveal') {
      // scaffold slides down
      const y = T + t * H;
      g.rect(L + 2, y, W - 4, 2).fill({ color: 0xc28e5c, alpha: 1 - t });
    }
    return;
  }
  // level: gold outline traced around the room edge, 12 sparkles along the traced part
  const per = 2 * (W + H);
  const k = Math.min(1, t / 0.75);
  const len = per * k;
  const seg = (a: number, b: number) => {
    const pts: Array<[number, number]> = [];
    for (const d of [a, b]) {
      let u = d;
      if (u <= W) pts.push([L + u, T]);
      else if ((u -= W) <= H) pts.push([L + W, T + u]);
      else if ((u -= H) <= W) pts.push([L + W - u, T + H]);
      else pts.push([L, T + H - (u - W)]);
    }
    return pts;
  };
  const corners = [0, W, W + H, 2 * W + H, per];
  for (let i = 0; i < 4; i++) {
    const a = corners[i], b = Math.min(corners[i + 1], len);
    if (b <= a) break;
    const [[x1, y1], [x2, y2]] = seg(a, b);
    g.poly([x1, y1, x2, y2]).stroke({ color: 0xf7e39a, width: 2, alpha: 1 - Math.max(0, t - 0.75) * 4 });
  }
  for (let i = 0; i < 12; i++) {
    const d = (i / 12) * per;
    if (d > len) break;
    const [[x, y]] = seg(d, d);
    const a = 1 - t;
    g.rect(x - 0.5, y - 2.5, 1, 5).fill({ color: 0xffffff, alpha: a });
    g.rect(x - 2.5, y - 0.5, 5, 1).fill({ color: 0xffffff, alpha: a });
  }
  if ((e.level ?? 0) >= 3) {
    const shimmer = 0.35 + 0.45 * Math.abs(Math.sin(Math.PI * t));
    g.rect(L, T, W, H).fill({ color: 0xf7e39a, alpha: 0.12 * Math.sin(Math.PI * t) });
    if (e.name) {
      const bw = Math.max(36, Math.min(Math.max(4, W - 4), e.name.length * 4 + 28));
      const bx = L + (W - bw) / 2;
      const by = T - 16;
      g.rect(bx, by, bw, 12).fill({ color: 0x2a2533, alpha: 0.92 });
      g.rect(bx, by, bw, 1.5).fill({ color: 0xf7e39a, alpha: shimmer });
      g.rect(bx, by + 10.5, bw, 1.5).fill({ color: 0xf7e39a, alpha: Math.min(1, shimmer * 0.7) });
    }
  }
}
