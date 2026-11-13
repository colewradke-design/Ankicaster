/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Rift Gate multi-state standing-stone arch (Addendum 3.5, 9.3 & Appendix A.1).
 * States:
 *   - dormant: grey carved standing stones, faint unlit runes (locked / < 3 masters / site)
 *   - open: built & unlocked (3+ masters), swirling Veil-ramp portal surface, slow fixed rotation
 *   - expedition_out: active expedition -> faster destination-tinted vortex + "away" banner
 *   - returning: 1.5 s Veil-light flare on transition from active expedition to returned
 */
import { FullGameState } from '../../types/ankicaster';
import { PALETTE } from '../sprites/forge/palettes';
import { Painter, hex, line, mix, darken } from './painter';
import type { Box } from './roomArt';

export type RiftGateVisualState = 'dormant' | 'open' | 'expedition_out' | 'returning';

export const RIFT_RETURN_FLARE_MS = 1500;

export const DESTINATION_COLORS: Record<string, { inner: number; outer: number; rune: number }> = {
  mossy_hollow: { inner: 0x7db861, outer: 0x2e8b8b, rune: 0x9ccb72 },
  whispering_fen: { inner: 0x5fc2c2, outer: 0x7d5ba6, rune: 0x9bd4ff },
  crystal_caverns: { inner: 0x9c86e0, outer: 0x9bd4ff, rune: 0xeef1f5 },
  ashen_wastes: { inner: 0xf07a5c, outer: 0x7d5ba6, rune: 0xf6e08c },
  shattered_spire: { inner: 0xb9a6ff, outer: 0x4b3796, rune: 0xffffff }
};

const STONE = PALETTE.stone.map(hex);
const VEIL = PALETTE.veil.map(hex);
const GOLDS = PALETTE.gold.map(hex);

/** Pure helper determining Rift Gate visual state from read-only game state + returning flare flag. */
export function getRiftGateVisualState(
  state: Pick<FullGameState, 'characters' | 'alumniGallery' | 'expeditions' | 'rooms' | 'reviewIndex'>,
  returningActive: boolean = false
): RiftGateVisualState {
  if (state.expeditions?.some(e => e.state === 'active')) {
    return 'expedition_out';
  }
  if (returningActive) {
    return 'returning';
  }
  const room = state.rooms?.find(r => r.defId === 'rift_gate');
  if (!room || room.state !== 'built') return 'dormant';
  const locked = (room.lockedUntilReviewIndex ?? -1) > (state.reviewIndex ?? 0);
  if (locked) return 'dormant';
  const totalMasters =
    (state.characters?.filter(c => c.masteredSchools.length > 0).length ?? 0) +
    (state.alumniGallery?.length ?? 0);
  if (totalMasters < 3) return 'dormant';
  return 'open';
}

export interface RiftGateDrawOpts {
  phaseRad?: number;
  destinationId?: string;
  flareAlpha?: number;
}

/**
 * Draw the 128 x 96 standing-stone Rift Gate arch rising 48 px above the grounds plot.
 * Ground line sits at box.floorLineY; arch apex sits near box.floorLineY - 86.
 */
export function drawRiftGateArch(
  g: Painter,
  box: Box,
  riftState: RiftGateVisualState,
  opts: RiftGateDrawOpts = {}
) {
  const cx = box.left + box.width / 2;
  const B = box.floorLineY;
  const archTop = B - 84;
  const portalCx = cx;
  const portalCy = B - 34;
  const portalRx = 20;
  const portalRy = 30;
  const phase = opts.phaseRad ?? 0;

  // Stone dais / threshold steps at base
  g.rect(cx - 38, B - 5, 76, 5).fill({ color: STONE[0] });
  g.rect(cx - 34, B - 8, 68, 3).fill({ color: STONE[1] });
  g.rect(cx - 34, B - 8, 68, 0.75).fill({ color: STONE[2] });

  // Outer carved standing-stone piers & keystone arch (128x96 silhouette rising into sky overhang)
  // Left & right megalith pillars
  for (const side of [-1, 1] as const) {
    const px = cx + side * 26;
    g.poly([
      px - 8, B - 8,
      px + 8, B - 8,
      px + 6, archTop + 22,
      px - 6, archTop + 20
    ]).fill({ color: STONE[1] });
    g.rect(px - 7, B - 12, 14, 4).fill({ color: STONE[2] });
    // Chisel mortar lines
    for (let y = archTop + 28; y < B - 16; y += 12) {
      line(g, px - 5, y, px + 5, y, STONE[0], 0.75);
    }
  }

  // Upper stone arch lintel & capstone
  g.poly([
    cx - 32, archTop + 22,
    cx - 22, archTop + 6,
    cx, archTop,
    cx + 22, archTop + 6,
    cx + 32, archTop + 22,
    cx + 20, archTop + 24,
    cx + 14, archTop + 14,
    cx, archTop + 11,
    cx - 14, archTop + 14,
    cx - 20, archTop + 24
  ]).fill({ color: STONE[2] });

  // Keystone diamond
  g.poly([
    cx, archTop - 2,
    cx + 6, archTop + 6,
    cx, archTop + 14,
    cx - 6, archTop + 6
  ]).fill({ color: STONE[3] });

  // Carved Veil runes along pillars (dim grey when dormant, lit Veil/destination tint when open+)
  const destCols = opts.destinationId ? DESTINATION_COLORS[opts.destinationId] : undefined;
  const runeCol =
    riftState === 'dormant'
      ? STONE[0]
      : riftState === 'expedition_out' && destCols
      ? destCols.rune
      : VEIL[3];
  const runeAlpha = riftState === 'dormant' ? 0.65 : 0.95;

  for (const side of [-1, 1] as const) {
    const rx = cx + side * 26;
    for (let i = 0; i < 4; i++) {
      const ry = B - 22 - i * 11;
      g.rect(rx - 1.5, ry - 2, 3, 4).fill({ color: runeCol, alpha: runeAlpha });
      if (riftState !== 'dormant') {
        g.circle(rx, ry, 2.8).fill({ color: runeCol, alpha: 0.25 });
      }
    }
  }
  // Keystone rune gem
  g.circle(cx, archTop + 6, 2.2).fill({ color: riftState === 'dormant' ? STONE[0] : runeCol });

  if (riftState === 'dormant') {
    // Faint mist wisps inside the dormant empty stone arch
    g.ellipse(portalCx, portalCy, portalRx - 2, portalRy - 2).stroke({ color: STONE[0], width: 1, alpha: 0.5 });
    return;
  }

  // Active portal surface (open, expedition_out, returning)
  const outerCol = riftState === 'expedition_out' && destCols ? destCols.outer : VEIL[0];
  const midCol = riftState === 'expedition_out' && destCols ? destCols.inner : VEIL[1];
  const hiCol = riftState === 'expedition_out' && destCols ? destCols.rune : VEIL[2];

  g.ellipse(portalCx, portalCy, portalRx, portalRy).fill({ color: darken(outerCol, 0.7), alpha: 0.92 });
  g.ellipse(portalCx, portalCy, portalRx * 0.82, portalRy * 0.84).fill({ color: outerCol, alpha: 0.85 });
  g.ellipse(portalCx, portalCy, portalRx * 0.6, portalRy * 0.64).fill({ color: midCol, alpha: 0.85 });
  g.ellipse(portalCx, portalCy, portalRx * 0.34, portalRy * 0.38).fill({ color: hiCol, alpha: 0.85 });

  // Swirling spiral arms (driven by phaseRad)
  const arms = riftState === 'expedition_out' ? 4 : 3;
  for (let i = 0; i < arms; i++) {
    const a = phase + (i * Math.PI * 2) / arms;
    const x1 = portalCx + Math.cos(a) * (portalRx * 0.22);
    const y1 = portalCy + Math.sin(a) * (portalRy * 0.22);
    const x2 = portalCx + Math.cos(a + 0.9) * (portalRx * 0.75);
    const y2 = portalCy + Math.sin(a + 0.9) * (portalRy * 0.75);
    line(g, x1, y1, x2, y2, VEIL[3], riftState === 'expedition_out' ? 1.6 : 1.1, 0.85);
    g.circle(x2, y2, 1.4).fill({ color: 0xffffff, alpha: 0.8 });
  }

  // Expedition Out: draw small physical "away" banner tablet on the arch lintel
  if (riftState === 'expedition_out') {
    g.rect(cx - 16, archTop + 14, 32, 9).fill({ color: 0x1b1822, alpha: 0.95 });
    g.rect(cx - 16, archTop + 14, 32, 9).stroke({ color: GOLDS[2], width: 1 });
    g.circle(cx - 12, archTop + 18.5, 1.4).fill({ color: midCol });
    g.circle(cx + 12, archTop + 18.5, 1.4).fill({ color: midCol });
  }

  // Returning: bright 1.5s Veil-light flare across the arch
  if (riftState === 'returning') {
    const fa = Math.max(0.25, Math.min(1, opts.flareAlpha ?? 0.85));
    g.ellipse(portalCx, portalCy, portalRx * 1.35, portalRy * 1.25).fill({ color: VEIL[3], alpha: 0.35 * fa });
    g.ellipse(portalCx, portalCy, portalRx * 0.95, portalRy * 0.95).fill({ color: 0xffffff, alpha: 0.55 * fa });
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3 + phase * 0.5;
      line(
        g,
        portalCx,
        portalCy,
        portalCx + Math.cos(a) * 34,
        portalCy + Math.sin(a) * 44,
        0xffffff,
        1.5,
        0.7 * fa
      );
    }
  }
}
