/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Forge Rasterizer & Paper Doll Drawing
 * Implements Section 12.2 & 6.2:
 * - Code-drawn placeholder ("forge") graphics for rooms, furniture, characters, and badges.
 * - Draws side-on cutaway rooms with tier wall colours, floor slabs, doorways, stairs, roofs, and grounds plots.
 * - Draws paper-doll character sprites (body, robe, hair, hat, staff) with animations.
 */

import { Graphics, Container, Text, TextStyle } from 'pixi.js';
import { PlacedRoom } from '../../../types/ankicaster';
import { calculateRoomQuality } from '../../../utils/formulas';
import { PALETTE } from './palettes';
import { VisualAgent } from '../../agents/Choreographer';
import { appearanceToLayers, drawCharacter, DollAnim, DOLL_ANIMS } from '../../agents/doll';

export class ForgeRenderer {
  /**
   * Draw Sky backdrop
   */
  static drawSky(g: Graphics, width: number, height: number, groundY: number) {
    g.clear();
    // Sky gradient approximation with rectangles
    g.rect(0, 0, width, groundY).fill({ color: 0x8fc8f0 });
    g.rect(0, 0, width, groundY * 0.4).fill({ color: 0x6eaedc, alpha: 0.5 });

    // Distant hills
    g.ellipse(width * 0.3, groundY, 400, 60).fill({ color: 0x5a8a50 });
    g.ellipse(width * 0.75, groundY, 450, 75).fill({ color: 0x4d7744 });

    // Ground line & earth band
    g.rect(0, groundY, width, height - groundY).fill({ color: 0x3a2a1e }); // Earth
    g.rect(0, groundY - 2, width, 4).fill({ color: 0x4a7d3a }); // Grass line

    // Cobblestone front path along ground line linking Entrance Hall doors to every grounds plot
    g.rect(0, groundY - 1, width, 1).fill({ color: 0x3b3a40 });
    g.rect(0, groundY, width, 7).fill({ color: 0x45444d });
    for (let px = 0; px < width; px += 12) {
      const shade = (px / 12) % 3 === 0 ? 0x6b6a75 : (px / 12) % 2 === 0 ? 0x5e5d66 : 0x53525c;
      g.rect(px + 1, groundY + 1, 10, 4).fill({ color: shade });
      g.rect(px + 2, groundY + 1, 8, 1).fill({ color: 0x8a8994, alpha: 0.45 });
    }
    g.rect(0, groundY + 6, width, 1.5).fill({ color: 0x2a2533 });
  }

  /**
   * Draw a Room Shell with Tier colours, floor slab, doorways, and Unreachable badge
   */
  static drawRoom(
    g: Graphics,
    room: PlacedRoom,
    box: { left: number; top: number; width: number; height: number; floorLineY: number },
    isReachable: boolean,
    isSelected: boolean,
    hasLeftDoor: boolean,
    hasRightDoor: boolean
  ) {
    const { tier } = calculateRoomQuality(room);
    const tierStyle = PALETTE.tierColors[tier] || PALETTE.tierColors.bare;

    const wallColor = parseInt(tierStyle.wall.replace('#', '0x'), 16);
    const floorColor = parseInt(tierStyle.floor.replace('#', '0x'), 16);
    const borderColor = parseInt(tierStyle.border.replace('#', '0x'), 16);

    // 1. Room Interior Wall
    if (room.area === 'grounds') {
      // Grounds plot: open sky and grass bed
      g.rect(box.left, box.top, box.width, box.height).fill({ color: 0x4a7d3a, alpha: 0.35 });
      g.rect(box.left, box.top + box.height - 8, box.width, 8).fill({ color: 0x3a2a1e });
      g.rect(box.left + 2, box.top + 4, box.width - 4, box.height - 12).stroke({ color: 0x6e4529, width: 2 });
    } else {
      // Castle room interior
      g.rect(box.left, box.top, box.width, box.height).fill({ color: wallColor });

      // Floor slab at bottom (4px height)
      g.rect(box.left, box.floorLineY, box.width, 4).fill({ color: floorColor });

      // Ceiling beam at top (3px height)
      g.rect(box.left, box.top, box.width, 3).fill({ color: 0x2a2533 });

      // Outer walls (cutaway edge 2px)
      // Left wall
      if (hasLeftDoor) {
        // Doorway arch cutout: arch 14x30 art px at the floor line
        g.rect(box.left, box.top, 2, box.height - 30).fill({ color: borderColor });
      } else {
        g.rect(box.left, box.top, 2, box.height).fill({ color: borderColor });
      }

      // Right wall
      if (hasRightDoor) {
        g.rect(box.left + box.width - 2, box.top, 2, box.height - 30).fill({ color: borderColor });
      } else {
        g.rect(box.left + box.width - 2, box.top, 2, box.height).fill({ color: borderColor });
      }

      // Special Room Dressing:
      if (room.defId === 'spiral_stair') {
        // Spiral staircase helix indication
        for (let y = box.top + 6; y < box.floorLineY; y += 8) {
          g.rect(box.left + 16, y, box.width - 32, 3).fill({ color: 0xb9b8c2 });
          g.circle(box.left + box.width / 2, y + 1, 2).fill({ color: 0x3b3a40 });
        }
      } else if (room.defId === 'wizard_study') {
        // Tower bookshelves and study window
        g.rect(box.left + 6, box.top + 10, 16, box.height - 24).fill({ color: 0x6e4529 });
        g.circle(box.left + box.width - 20, box.top + 30, 12).fill({ color: 0x9cd4ff });
        g.circle(box.left + box.width - 20, box.top + 30, 12).stroke({ color: 0xd9a07a, width: 2 });
      } else if (room.defId === 'entrance_hall') {
        // Grand doors arch
        g.rect(box.left + 12, box.floorLineY - 32, 28, 32).stroke({ color: 0xd9a07a, width: 2 });
        g.rect(box.left + box.width - 40, box.floorLineY - 32, 28, 32).stroke({ color: 0xd9a07a, width: 2 });
      }
    }

    // Unreachable indicator
    if (!isReachable) {
      g.rect(box.left, box.top, box.width, box.height).fill({ color: 0x202020, alpha: 0.4 });
    }

    // Selection highlight outline
    if (isSelected) {
      g.rect(box.left - 2, box.top - 2, box.width + 4, box.height + 4).stroke({ color: 0xf6e08c, width: 3 });
    } else {
      g.rect(box.left, box.top, box.width, box.height).stroke({ color: 0x1b1822, width: 1 });
    }
  }

  /** Unreachable dim + selection outline drawn above a room's furniture (status layer). */
  static drawRoomStatus(
    g: Graphics,
    box: { left: number; top: number; width: number; height: number },
    isReachable: boolean,
    isSelected: boolean,
    area: 'castle' | 'grounds' = 'castle'
  ) {
    if (area === 'grounds') {
      const groundBandH = Math.min(24, box.height);
      const bandTop = box.top + box.height - groundBandH;
      if (!isReachable) g.rect(box.left, bandTop, box.width, groundBandH).fill({ color: 0x202020, alpha: 0.4 });
      if (isSelected) {
        g.rect(box.left + 1, bandTop, box.width - 2, groundBandH - 1).stroke({ color: 0xf6e08c, width: 2 });
        g.rect(box.left, box.top + box.height - 3, box.width, 3).fill({ color: 0xf6e08c, alpha: 0.7 });
      }
      return;
    }
    if (!isReachable) g.rect(box.left, box.top, box.width, box.height).fill({ color: 0x202020, alpha: 0.4 });
    if (isSelected) g.rect(box.left - 2, box.top - 2, box.width + 4, box.height + 4).stroke({ color: 0xf6e08c, width: 3 });
    else g.rect(box.left, box.top, box.width, box.height).stroke({ color: 0x1b1822, width: 1 });
  }

  /**
   * Draw Roof on top room of column
   */
  static drawRoof(g: Graphics, x: number, y: number, width: number, style: 'battlement' | 'spire' | 'glass' | 'dome' = 'battlement') {
    if (style === 'spire') {
      g.poly([
        x, y,
        x + width / 2, y - 28,
        x + width, y
      ]).fill({ color: 0x3e4a5c }).stroke({ color: 0x2a3340, width: 1 });
    } else {
      // Battlements
      g.rect(x, y - 8, width, 8).fill({ color: 0x5e5d66 });
      const toothW = width / 5;
      for (let i = 0; i < 5; i += 2) {
        g.rect(x + i * toothW, y - 14, toothW, 6).fill({ color: 0x5e5d66 });
      }
    }
  }

  /**
   * Layered paper doll (Addendum Section 6). Map, creation preview and portraits share this.
   */
  static drawPaperDoll(g: PaperDollPainter, agent: PaperDollAgent) {
    const char = agent.character;
    const anim = (DOLL_ANIMS[agent.anim as DollAnim] ? agent.anim : 'idle') as DollAnim;
    const look = appearanceToLayers({
      id: char?.id ?? 'wizard',
      isWizard: agent.isWizard,
      status: char?.status,
      career: char?.career,
      careerState: char?.careerState,
      masteredSchools: char?.masteredSchools,
      currentSchool: char?.currentSchool,
      appearance: char?.appearance,
      anim,
      needs: char?.needs,
      morale: char?.morale,
      injury: char?.injury?.type,
      robeColor: agent.robeColor,
      hair: agent.hair,
      hairColor: agent.hairColor,
      skin: agent.skin,
      hat: agent.hat,
      staff: agent.staff,
      bodyShape: agent.bodyShape,
      eyes: agent.eyes,
      face: agent.face,
      shoes: agent.shoes
    });
    drawCharacter(g, look, { x: agent.x, y: agent.y, facing: agent.facing, anim, frame: agent.animFrame });
  }

  /** Placement ghost: footprint tinted green (valid) or red (invalid), with a dashed outline. */
  static drawGhost(g: Graphics, box: { left: number; top: number; width: number; height: number }, valid: boolean) {
    const col = valid ? 0x3ccf6e : 0xe0464b;
    g.rect(box.left, box.top, box.width, box.height).fill({ color: col, alpha: 0.35 });
    g.rect(box.left + 1, box.top + 1, box.width - 2, box.height - 2).stroke({ color: col, width: 2 });
    for (let px = box.left + 4; px < box.left + box.width - 4; px += 8) {
      g.rect(px, box.top + 4, 4, 1).fill({ color: 0xffffff, alpha: 0.6 });
      g.rect(px, box.top + box.height - 5, 4, 1).fill({ color: 0xffffff, alpha: 0.6 });
    }
  }

  /** Build mode: faint dashed outlines of the free castle cells / unlocked plots (Addendum 3.x). */
  static drawBuildGrid(g: Graphics, cells: Array<{ left: number; top: number; width: number; height: number }>) {
    for (const c of cells) {
      g.rect(c.left + 2, c.top + 2, c.width - 4, c.height - 4).stroke({ color: 0xbfe3ff, width: 1, alpha: 0.35 });
    }
  }
}

/** The subset of the Pixi Graphics API the paper doll uses. */
export interface PaperDollPainter {
  rect(x: number, y: number, w: number, h: number): PaperDollPainter;
  circle(x: number, y: number, r: number): PaperDollPainter;
  ellipse(x: number, y: number, rx: number, ry: number): PaperDollPainter;
  poly(points: number[]): PaperDollPainter;
  fill(style: { color: number; alpha?: number }): PaperDollPainter;
  stroke(style: { color: number; width?: number; alpha?: number }): PaperDollPainter;
}

export type PaperDollAgent = Pick<VisualAgent, 'x' | 'y' | 'facing' | 'anim' | 'animTimer' | 'animFrame' | 'robeColor' | 'hairColor' | 'skin' | 'hat' | 'isWizard'> & {
  staff?: string;
  hair?: string;
  bodyShape?: number;
  eyes?: string;
  face?: string;
  shoes?: string;
  character?: VisualAgent['character'];
};
