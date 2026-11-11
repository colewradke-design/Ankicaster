/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * A tiny Canvas2D implementation of the PaperDollPainter API, so UI portraits (creation
 * preview, Wizard's Study header) draw the exact same forge figure as the castle canvas.
 */

import type { PaperDollPainter } from './ForgeRenderer';

type Shape =
  | { k: 'rect'; x: number; y: number; w: number; h: number }
  | { k: 'circle'; x: number; y: number; r: number }
  | { k: 'ellipse'; x: number; y: number; rx: number; ry: number }
  | { k: 'poly'; p: number[] };

function css(color: number, alpha = 1): string {
  const r = (color >> 16) & 255, g = (color >> 8) & 255, b = color & 255;
  return `rgba(${r},${g},${b},${alpha})`;
}

export class CanvasPainter implements PaperDollPainter {
  private shapes: Shape[] = [];
  private consumed = false;
  constructor(private ctx: CanvasRenderingContext2D) {}

  private add(s: Shape): this {
    if (this.consumed) { this.shapes = []; this.consumed = false; }
    this.shapes.push(s);
    return this;
  }
  rect(x: number, y: number, w: number, h: number) { return this.add({ k: 'rect', x, y, w, h }); }
  circle(x: number, y: number, r: number) { return this.add({ k: 'circle', x, y, r }); }
  ellipse(x: number, y: number, rx: number, ry: number) { return this.add({ k: 'ellipse', x, y, rx, ry }); }
  poly(p: number[]) { return this.add({ k: 'poly', p }); }

  private path() {
    const c = this.ctx;
    c.beginPath();
    for (const s of this.shapes) {
      if (s.k === 'rect') c.rect(s.x, s.y, s.w, s.h);
      else if (s.k === 'circle') { c.moveTo(s.x + s.r, s.y); c.arc(s.x, s.y, s.r, 0, Math.PI * 2); }
      else if (s.k === 'ellipse') { c.moveTo(s.x + s.rx, s.y); c.ellipse(s.x, s.y, s.rx, s.ry, 0, 0, Math.PI * 2); }
      else {
        c.moveTo(s.p[0], s.p[1]);
        for (let i = 2; i < s.p.length; i += 2) c.lineTo(s.p[i], s.p[i + 1]);
        if (s.p.length > 4) c.closePath();
      }
    }
  }
  fill(style: { color: number; alpha?: number }) {
    this.path();
    this.ctx.fillStyle = css(style.color, style.alpha ?? 1);
    this.ctx.fill();
    this.consumed = true;
    return this;
  }
  stroke(style: { color: number; width?: number; alpha?: number }) {
    this.path();
    this.ctx.strokeStyle = css(style.color, style.alpha ?? 1);
    this.ctx.lineWidth = style.width ?? 1;
    this.ctx.stroke();
    this.consumed = true;
    return this;
  }
}
