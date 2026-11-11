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

export const WizardPortrait: React.FC<{
  appearance?: Partial<WizardAppearance> | null;
  /** CSS size of the square portrait. */
  size?: number;
  className?: string;
  title?: string;
}> = ({ appearance, size = 56, className = '', title }) => {
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
      x: 22, y: 41, facing: 'R', anim: 'idle', animTimer: 0, animFrame: 0, isWizard: true,
      robeColor: look.robeColor, hairColor: look.hairColor, skin: look.skin, hat: look.hat, staff: look.staff
    });
  }, [key, size]);

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
