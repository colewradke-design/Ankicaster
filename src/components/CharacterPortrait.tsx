/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * 64×64 portrait: idle head and shoulders, ×4 nearest-neighbour, school-coloured round frame.
 */
import React, { useEffect, useRef } from 'react';
import { CanvasPainter } from '../visual/sprites/forge/CanvasPainter';
import { appearanceToLayers, drawPortraitSource, DollRole, PORTRAIT_PX, PORTRAIT_SRC } from '../visual/agents/doll';
import type { Character } from '../types/ankicaster';

export const CharacterPortrait: React.FC<{
  character?: Pick<Character, 'id' | 'status' | 'career' | 'careerState' | 'masteredSchools' | 'currentSchool' | 'appearance' | 'name'>;
  /** Used when there is no character yet (an applicant). */
  name?: string;
  role?: DollRole;
  school?: string;
  size?: number;
  className?: string;
}> = ({ character, name, role, school, size = PORTRAIT_PX, className = '' }) => {
  const ref = useRef<HTMLCanvasElement>(null);
  const look = appearanceToLayers({
    id: character?.id ?? name ?? 'portrait',
    isWizard: role === 'wizard',
    status: character?.status ?? (role === 'resident' ? 'resident' : role === 'faculty' || role === 'sabbatical' ? 'faculty' : 'student'),
    career: character?.career ?? (role === 'adventurer' ? 'adventurer' : role === 'faculty' ? 'teacher' : undefined),
    careerState: character?.careerState ?? (role === 'sabbatical' ? 'sabbatical' : undefined),
    masteredSchools: character?.masteredSchools ?? (role === 'resident' ? ['nature'] : []),
    currentSchool: character?.currentSchool || school,
    appearance: character?.appearance
  });
  if (role) look.role = role;
  look.mark = role === 'wizard' ? 'sigil' : role === 'faculty' ? 'stole' : role === 'resident' ? 'star' : role === 'adventurer' ? 'pack' : role === 'sabbatical' ? 'folded' : look.mark;
  const key = JSON.stringify({ look, role });

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    canvas.width = PORTRAIT_PX;
    canvas.height = PORTRAIT_PX;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, PORTRAIT_PX, PORTRAIT_PX);
    const src = document.createElement('canvas');
    src.width = PORTRAIT_SRC;
    src.height = PORTRAIT_SRC;
    const sctx = src.getContext('2d');
    if (!sctx) return;
    sctx.imageSmoothingEnabled = false;
    drawPortraitSource(new CanvasPainter(sctx), look);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(src, 0, 0, PORTRAIT_PX, PORTRAIT_PX);
  }, [key]);

  return (
    <canvas
      ref={ref}
      width={PORTRAIT_PX}
      height={PORTRAIT_PX}
      data-testid="character-portrait"
      data-role={look.role}
      title={character?.name || name || look.role}
      style={{ width: size, height: size, imageRendering: 'pixelated', background: 'transparent' }}
      className={`rounded-full overflow-hidden ${className}`}
    />
  );
};
