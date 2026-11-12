/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Headmaster portrait: the forge paper doll drawn from a saved (or in-progress) appearance.
 * Used by the character creation preview and the Wizard's Study header.
 */

import React, { useEffect, useRef } from 'react';
import { ForgeRenderer } from '../visual/sprites/forge/ForgeRenderer';
import { CanvasPainter } from '../visual/sprites/forge/CanvasPainter';
import { normalizeAppearance, WizardAppearance } from '../utils/appearance';
import type { DollAnim } from '../visual/agents/doll';
import { dollFrame } from '../visual/agents/doll';

/** Art size of the creation preview. Blitted at an integer scale, nearest-neighbour. */
export const PREVIEW_SCALE = 4;
const PREVIEW_ART_W = 48;
const PREVIEW_ART_H = 64;
export const PREVIEW_W = PREVIEW_ART_W * PREVIEW_SCALE;
export const PREVIEW_H = PREVIEW_ART_H * PREVIEW_SCALE;

function deviceScale(logical: number, dpr: number) {
  const ratio = dpr > 0 && Number.isFinite(dpr) ? dpr : 1;
  return { ratio, scale: Math.max(1, Math.round(logical * ratio)) };
}

function sizeCrispCanvas(canvas: HTMLCanvasElement, artW: number, artH: number, scale: number, dpr: number) {
  const { ratio, scale: device } = deviceScale(scale, dpr);
  const bw = artW * device;
  const bh = artH * device;
  if (canvas.width !== bw) canvas.width = bw;
  if (canvas.height !== bh) canvas.height = bh;
  canvas.style.width = `${bw / ratio}px`;
  canvas.style.height = `${bh / ratio}px`;
  canvas.style.imageRendering = 'pixelated';
  const ctx = canvas.getContext('2d');
  if (ctx) ctx.imageSmoothingEnabled = false;
  return ctx;
}

/**
 * Large live headmaster. Canvas size is set in markup (never zero) and the
 * idle frame comes from elapsed time. Nearest-neighbour, centred.
 */
export const HeadmasterPreview: React.FC<{
  appearance?: Partial<WizardAppearance> | null;
  reduceMotion?: boolean;
}> = ({ appearance, reduceMotion }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const look = normalizeAppearance(appearance);
  const key = JSON.stringify(look);
  const lookRef = useRef(look);
  lookRef.current = look;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    let raf = 0;
    let stopped = false;
    const start = performance.now();
    const off = document.createElement('canvas');
    off.width = PREVIEW_ART_W;
    off.height = PREVIEW_ART_H;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.imageSmoothingEnabled = false;
    const paint = (now: number) => {
      if (stopped || !canvas) return;
      const current = lookRef.current;
      const frame = reduceMotion ? 0 : dollFrame('idle', now - start);
      const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
      octx.setTransform(1, 0, 0, 1, 0, 0);
      octx.imageSmoothingEnabled = false;
      octx.fillStyle = '#142033';
      octx.fillRect(0, 0, PREVIEW_ART_W, PREVIEW_ART_H);
      octx.fillStyle = '#1e3348';
      octx.fillRect(0, PREVIEW_ART_H - 8, PREVIEW_ART_W, 8);
      ForgeRenderer.drawPaperDoll(new CanvasPainter(octx), {
        x: PREVIEW_ART_W / 2,
        y: PREVIEW_ART_H - 4,
        facing: 'R',
        anim: 'idle',
        animTimer: 0,
        animFrame: frame,
        isWizard: true,
        robeColor: current.robeColor,
        hairColor: current.hairColor,
        skin: current.skin,
        hat: current.hat,
        staff: current.staff,
        hair: current.hair,
        bodyShape: current.bodyShape,
        eyes: current.eyes,
        face: current.face,
        shoes: current.shoes
      });
      const ctx = sizeCrispCanvas(canvas, PREVIEW_ART_W, PREVIEW_ART_H, PREVIEW_SCALE, dpr);
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
      if (!reduceMotion) raf = requestAnimationFrame(paint);
    };
    paint(start);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [key, reduceMotion]);

  return (
    <div
      data-testid="look-preview-frame"
      className="mx-auto"
      style={{ width: 'fit-content' }}
    >
      <canvas
        ref={ref}
        width={PREVIEW_W}
        height={PREVIEW_H}
        data-testid="headmaster-preview"
        data-scale={PREVIEW_SCALE}
        aria-label="Headmaster preview"
        style={{ width: PREVIEW_W, height: PREVIEW_H, imageRendering: 'pixelated', display: 'block' }}
      />
    </div>
  );
};

export const WizardPortrait: React.FC<{
  appearance?: Partial<WizardAppearance> | null;
  /** CSS size of the square portrait. */
  size?: number;
  className?: string;
  title?: string;
  anim?: DollAnim;
  frame?: number;
}> = ({ appearance, size = 56, className = '', title, anim = 'idle', frame = 0 }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const look = normalizeAppearance(appearance);
  const key = JSON.stringify(look);

  const ART = 48;
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const scale = Math.max(1, Math.round(size / ART));
    const ctx = sizeCrispCanvas(canvas, ART, ART, scale, dpr);
    if (!ctx) return;
    const off = document.createElement('canvas');
    off.width = ART;
    off.height = ART;
    const octx = off.getContext('2d');
    if (!octx) return;
    octx.imageSmoothingEnabled = false;
    ForgeRenderer.drawPaperDoll(new CanvasPainter(octx), {
      x: 24, y: 44, facing: 'R', anim, animTimer: 0, animFrame: frame, isWizard: true,
      robeColor: look.robeColor, hairColor: look.hairColor, skin: look.skin, hat: look.hat, staff: look.staff,
      hair: look.hair, bodyShape: look.bodyShape, eyes: look.eyes, face: look.face, shoes: look.shoes
    });
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(off, 0, 0, canvas.width, canvas.height);
  }, [key, size, anim, frame]);

  const css = ART * Math.max(1, Math.round(size / ART));
  return (
    <canvas
      ref={ref}
      width={css}
      height={css}
      data-testid="wizard-portrait"
      data-look={key}
      title={title}
      style={{ width: css, height: css, imageRendering: 'pixelated', display: 'block' }}
      className={className}
    />
  );
};
