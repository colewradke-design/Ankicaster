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
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let raf = 0;
    let stopped = false;
    const start = performance.now();
    const off = document.createElement('canvas');
    off.width = PREVIEW_ART_W;
    off.height = PREVIEW_ART_H;
    const octx = off.getContext('2d');
    if (!octx) return;
    const paint = (now: number) => {
      if (stopped || !canvas) return;
      const current = lookRef.current;
      const frame = reduceMotion ? 0 : dollFrame('idle', now - start);
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
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, PREVIEW_W, PREVIEW_H);
      ctx.drawImage(off, 0, 0, PREVIEW_W, PREVIEW_H);
      if (!reduceMotion) raf = requestAnimationFrame(paint);
    };
    paint(start);
    return () => { stopped = true; cancelAnimationFrame(raf); };
  }, [key, reduceMotion]);

  return (
    <div
      data-testid="look-preview-frame"
      className="mx-auto"
      style={{ height: 'clamp(168px, 42vh, 256px)', aspectRatio: `${PREVIEW_W} / ${PREVIEW_H}`, minWidth: 96 }}
    >
      <canvas
        ref={ref}
        width={PREVIEW_W}
        height={PREVIEW_H}
        data-testid="headmaster-preview"
        data-scale={PREVIEW_SCALE}
        aria-label="Headmaster preview"
        style={{ width: '100%', height: '100%', imageRendering: 'pixelated', display: 'block' }}
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

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    // The figure (hat tip to feet) spans ~40 art px; scale it to fill the portrait
    const scale = (size * dpr) / 44;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, 44, 44);
    ForgeRenderer.drawPaperDoll(new CanvasPainter(ctx), {
      x: 22, y: 41, facing: 'R', anim, animTimer: 0, animFrame: frame, isWizard: true,
      robeColor: look.robeColor, hairColor: look.hairColor, skin: look.skin, hat: look.hat, staff: look.staff,
      hair: look.hair, bodyShape: look.bodyShape, eyes: look.eyes, face: look.face, shoes: look.shoes
    });
  }, [key, size, anim, frame]);

  return (
    <canvas
      ref={ref}
      data-testid="wizard-portrait"
      data-look={key}
      title={title}
      style={{ width: size, height: size }}
      className={className}
    />
  );
};
