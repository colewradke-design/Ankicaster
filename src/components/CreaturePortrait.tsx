/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Crisp nearest-neighbour Forge pixel portrait for creatures, pre-tamed arrivals, and "?" silhouettes.
 */
import React, { useEffect, useRef } from 'react';
import { CREATURE_DEFINITIONS } from '../data/content';
import type { CreatureInstance, SchoolType } from '../types/ankicaster';
import { CanvasPainter } from '../visual/sprites/forge/CanvasPainter';
import { creatureSize, drawCreature, drawCreatureArrival } from '../visual/creatures/creatureArt';

const SCHOOL_FRAME_HEX: Record<SchoolType, string> = {
  nature: '#4E8B3A',
  arcane: '#6B4FBB',
  light: '#E8C547',
  shadow: '#4C5BA3',
  alchemy: '#B5651D'
};

export interface CreaturePortraitProps {
  defId?: string;
  variant?: 'adult' | 'egg' | 'unknown';
  hatchProgress?: number;
  status?: CreatureInstance['status'];
  bondLevel?: 0 | 1 | 2 | 3;
  size?: number;
  className?: string;
  title?: string;
}

export const CreaturePortrait: React.FC<CreaturePortraitProps> = ({
  defId,
  variant = 'adult',
  hatchProgress = 100,
  status = 'tamed',
  bondLevel = 1,
  size = 48,
  className = '',
  title
}) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const def = defId ? CREATURE_DEFINITIONS[defId] : undefined;
  const isUnknown = variant === 'unknown' || !def;

  const { w, h } = !isUnknown && defId ? creatureSize(defId) : { w: 16, h: 16 };
  const srcW = isUnknown ? 24 : variant === 'egg' ? 24 : Math.max(w, h) + 8;
  const srcH = srcW;
  const scale = Math.max(1, Math.round(size / srcW));
  const css = srcW * scale;

  const borderColor = isUnknown ? '#334155' : SCHOOL_FRAME_HEX[def?.school ?? 'nature'] ?? '#4E8B3A';

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas || typeof document === 'undefined') return;
    const dpr = (typeof window !== 'undefined' && window.devicePixelRatio) || 1;
    const ratio = dpr > 0 ? dpr : 1;
    const device = Math.max(1, Math.round(scale * ratio));
    const backing = srcW * device;
    canvas.width = backing;
    canvas.height = backing;
    canvas.style.width = `${backing / ratio}px`;
    canvas.style.height = `${backing / ratio}px`;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.imageSmoothingEnabled = false;

    const src = document.createElement('canvas');
    src.width = srcW;
    src.height = srcH;
    const sctx = src.getContext('2d');
    if (!sctx) return;
    sctx.imageSmoothingEnabled = false;

    const p = new CanvasPainter(sctx);
    if (isUnknown) {
      // Muted "?" silhouette frame (leaks zero species color/shape)
      p.rect(1, 1, srcW - 2, srcH - 2).fill({ color: 0x0f172a });
      p.rect(1, 1, srcW - 2, srcH - 2).stroke({ color: 0x334155, width: 1 });
      // Crisp pixel "?"
      const cx = Math.floor(srcW / 2);
      p.rect(cx - 3, 5, 6, 2).fill({ color: 0x64748b });
      p.rect(cx - 4, 7, 2, 2).fill({ color: 0x64748b });
      p.rect(cx + 2, 7, 2, 3).fill({ color: 0x64748b });
      p.rect(cx - 1, 10, 3, 2).fill({ color: 0x64748b });
      p.rect(cx - 1, 12, 2, 2).fill({ color: 0x64748b });
      p.rect(cx - 1, 16, 2, 2).fill({ color: 0x94a3b8 });
    } else if (variant === 'egg' && defId) {
      drawCreatureArrival(p, {
        defId,
        origin: def?.origin,
        rarity: def?.rarity,
        x: srcW / 2,
        y: srcH - 4,
        hatchProgress,
        clockMs: 0,
        reduceMotion: true
      });
    } else if (defId) {
      drawCreature(p, defId, {
        x: srcW / 2,
        y: srcH - 4,
        facing: 'R',
        anim: 'idle',
        frame: 0,
        status,
        bondLevel
      });
    }

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, backing, backing);
    ctx.drawImage(src, 0, 0, backing, backing);
  }, [defId, variant, hatchProgress, status, bondLevel, isUnknown, srcW, srcH, scale]);

  return (
    <canvas
      ref={ref}
      width={css}
      height={css}
      data-testid="creature-portrait"
      data-variant={isUnknown ? 'unknown' : variant}
      title={isUnknown ? 'Undiscovered creature' : title || def?.name || defId}
      style={{
        width: css,
        height: css,
        imageRendering: 'pixelated',
        background: isUnknown ? '#0f172a' : 'rgba(15, 23, 42, 0.75)',
        borderColor,
        borderWidth: 1,
        borderStyle: 'solid',
        borderRadius: 8,
        display: 'block',
        flexShrink: 0
      }}
      className={className}
    />
  );
};
