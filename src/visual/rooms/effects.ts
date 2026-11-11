/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * One-shot cosmetic effects triggered by player-visible state changes (Addendum 5.4, 5.6):
 *  - reveal: a site finished -> dust puff as the scaffold comes down
 *  - dust:   a room was demolished or a site cancelled (player action) -> 0.8 s dust cloud
 *  - level:  room.level went up -> 1.2 s gold outline trace + 12 sparkles (L3: 2 s with name banner)
 * Durations are fixed real time; nothing scales with review count or speed. Off under reduce motion.
 */
import { Painter } from './painter';

export const EFFECT_MS = { dust: 800, reveal: 900, level: 1200, level3: 2000 };

export interface VisualEffect {
  kind: 'dust' | 'reveal' | 'level';
  box: { left: number; top: number; width: number; height: number };
  start: number;
  ms: number;
  level?: number;
  name?: string;
  roomId?: number;
}

export function drawEffect(g: Painter, e: VisualEffect, t: number) {
  const { left: L, top: T, width: W, height: H } = e.box;
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
  if ((e.level ?? 0) >= 3) g.rect(L, T, W, H).fill({ color: 0xf7e39a, alpha: 0.12 * Math.sin(Math.PI * t) });
}
