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
import { hexToNum, shade, resolveHairColour, resolveSkin, resolveHat, resolveStaff, STAFFS } from '../../../utils/appearance';

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

    // Cobblestone front path along ground line
    for (let px = 0; px < width; px += 16) {
      g.rect(px + 1, groundY, 14, 6).fill({ color: 0x5e5d66 });
    }
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
  static drawRoomStatus(g: Graphics, box: { left: number; top: number; width: number; height: number }, isReachable: boolean, isSelected: boolean) {
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
   * Draw Paper-Doll Sprite for a Character or Wizard
   * Body, Robe, Hair, Hat, Staff / Item. The wizard uses the look saved on state.wizard.appearance
   * (robe, skin, hair colour, hat, staff). `g` is a Pixi Graphics or any PaperDollPainter (the
   * creation preview and portraits draw the same figure onto a 2D canvas).
   */
  static drawPaperDoll(g: PaperDollPainter, agent: PaperDollAgent) {
    const x = agent.x;
    const y = agent.y; // Floor line (feet position)
    const isL = agent.facing === 'L';
    const sign = isL ? -1 : 1;

    // Shadow under feet
    g.ellipse(x, y - 1, 8, 3).fill({ color: 0x000000, alpha: 0.35 });

    const robeColorHex = hexToNum(agent.robeColor || '#4E8B3A');
    const hairColorHex = hexToNum(agent.isWizard ? resolveHairColour(agent.hairColor) : (agent.hairColor || '#4A2E1E'), 0x4a2e1e);
    const skinColorHex = hexToNum(agent.isWizard ? resolveSkin(agent.skin) : (agent.skin || '#F6D7C3'), 0xf6d7c3);

    // Bobbing / walking offsets
    let bobY = 0;
    let legOffset = 0;
    if (agent.anim === 'walk') {
      bobY = Math.sin(agent.animTimer * 0.05) * 1.5;
      legOffset = Math.sin(agent.animTimer * 0.05) * 3;
    } else if (agent.anim === 'climb') {
      bobY = (agent.animFrame % 2) * 1.5;
    } else if (agent.anim === 'sit_study' || agent.anim === 'eat') {
      bobY = 4; // seated lower
    }

    const footY = y;
    const bodyBaseY = footY - 8 + bobY;
    const headY = bodyBaseY - 14;
    const hat = agent.isWizard ? resolveHat(agent.hat) : agent.hat;

    // 1. Legs / Feet
    g.rect(x - 3 * sign + legOffset * sign, footY - 5, 3, 5).fill({ color: 0x4a2e1c });
    g.rect(x + 1 * sign - legOffset * sign, footY - 5, 3, 5).fill({ color: 0x4a2e1c });

    // 2. Robe
    if (agent.isWizard) {
      // Wizard cape behind (a darker shade of the chosen robe)
      g.poly([
        x - 5 * sign, bodyBaseY - 10,
        x - 8 * sign, footY - 2,
        x - 2 * sign, footY - 2
      ]).fill({ color: shade(robeColorHex, 0.6) });

      // Long wizard robe
      g.poly([
        x - 4 * sign, bodyBaseY - 10,
        x + 4 * sign, bodyBaseY - 10,
        x + 6 * sign, footY - 4,
        x - 6 * sign, footY - 4
      ]).fill({ color: robeColorHex });

      // Gold outline for wizard (Section 6.5)
      g.poly([
        x - 4 * sign, bodyBaseY - 10,
        x + 4 * sign, bodyBaseY - 10,
        x + 6 * sign, footY - 4,
        x - 6 * sign, footY - 4
      ]).stroke({ color: 0xf7e39a, width: 1 });
    } else {
      // Standard student / faculty robe
      g.poly([
        x - 4 * sign, bodyBaseY - 9,
        x + 4 * sign, bodyBaseY - 9,
        x + 5 * sign, footY - 4,
        x - 5 * sign, footY - 4
      ]).fill({ color: robeColorHex });
    }

    // 3. Hood back (behind the head)
    if (hat === 'hood') {
      g.circle(x - 1 * sign, headY - 1, 7).fill({ color: shade(robeColorHex, 0.8) });
    }

    // 4. Hair (back, behind the head), then Head & Face so the skin tone stays visible
    if (hat !== 'hood') g.circle(x - 2 * sign, headY - 1, 5.5).fill({ color: hairColorHex });
    g.circle(x, headY, 5).fill({ color: skinColorHex });
    // Eye dot (if not climbing back view)
    if (agent.anim !== 'climb') {
      g.rect(x + 2 * sign, headY - 1, 1.5, 1.5).fill({ color: 0x1b1822 });
    }

    // 5. Hair fringe over the forehead (the back of the hair is drawn behind the head)
    if (hat !== 'hood') g.rect(x - 4.5, headY - 5, 9, 2.5).fill({ color: hairColorHex });

    // 6. Hat
    const hatCol = robeColorHex;
    const brim = 0x2a2533;
    if (hat === 'pointed') {
      g.poly([x - 7 * sign, headY - 4, x + 7 * sign, headY - 4, x - 1 * sign, headY - 18]).fill({ color: hatCol });
      g.rect(Math.min(x - 7 * sign, x + 7 * sign), headY - 4, 14, 2).fill({ color: brim });
    } else if (hat === 'wide') {
      g.poly([x - 5 * sign, headY - 4, x + 5 * sign, headY - 4, x, headY - 14]).fill({ color: hatCol });
      g.rect(x - 10, headY - 5, 20, 2).fill({ color: brim });
    } else if (hat === 'crooked') {
      g.poly([x - 6 * sign, headY - 4, x + 6 * sign, headY - 4, x - 2 * sign, headY - 12, x - 9 * sign, headY - 16, x - 3 * sign, headY - 11]).fill({ color: hatCol });
      g.rect(Math.min(x - 7 * sign, x + 7 * sign), headY - 4, 14, 2).fill({ color: brim });
    } else if (hat === 'hood') {
      g.poly([x - 6 * sign, headY - 2, x + 5 * sign, headY - 6, x - 3 * sign, headY - 9]).fill({ color: hatCol });
    } else if (hat === 'circlet') {
      g.rect(x - 5, headY - 4, 10, 2).fill({ color: 0xf7e39a });
      g.rect(x - 1, headY - 5, 2, 1).fill({ color: 0x9cd4ff });
    } else if (hat === 'crown') {
      g.poly([x - 5, headY - 4, x + 5, headY - 4, x + 5, headY - 10, x + 2.5, headY - 7, x, headY - 11, x - 2.5, headY - 7, x - 5, headY - 10]).fill({ color: 0xddb843 });
      g.rect(x - 1, headY - 7, 2, 2).fill({ color: 0xd9472b });
    } else if (hat === 'beret') {
      g.ellipse(x - 1 * sign, headY - 5, 7, 3).fill({ color: hatCol });
      g.rect(x - 1 * sign, headY - 9, 2, 2).fill({ color: shade(hatCol, 0.7) });
    }
    if (agent.isWizard && (hat === 'pointed' || hat === 'wide' || hat === 'crooked')) {
      // Gold sigil star on hat
      g.rect(x, headY - 10, 2, 2).fill({ color: 0xf7e39a });
    }

    // 7. Held Item: Wizard Staff
    if (agent.isWizard) {
      const staff = STAFFS.find(st => st.id === resolveStaff(agent.staff)) || STAFFS[0];
      const staffX = x + 8 * sign;
      g.rect(staffX, headY - 12, 2, 22).fill({ color: hexToNum(staff.shaft) });
      const tip = hexToNum(staff.tip);
      if (staff.id === 'crystal') {
        g.poly([staffX + 1, headY - 19, staffX + 4, headY - 14, staffX + 1, headY - 10, staffX - 2, headY - 14]).fill({ color: tip });
      } else if (staff.id === 'moon') {
        g.circle(staffX + 1, headY - 14, 3.5).fill({ color: tip });
        g.circle(staffX + 2.5, headY - 15, 3).fill({ color: 0x2a2533 });
      } else if (staff.id === 'star') {
        g.poly([staffX + 1, headY - 19, staffX + 2.5, headY - 15.5, staffX + 5, headY - 15, staffX + 2.5, headY - 13, staffX + 3.5, headY - 10, staffX + 1, headY - 12, staffX - 1.5, headY - 10, staffX - 0.5, headY - 13, staffX - 3, headY - 15, staffX - 0.5, headY - 15.5]).fill({ color: tip });
      } else if (staff.id === 'willow') {
        g.ellipse(staffX + 3, headY - 13, 3, 1.5).fill({ color: tip });
        g.ellipse(staffX - 1, headY - 15, 3, 1.5).fill({ color: tip });
      } else {
        // Glowing orb top (oak) or ember flame
        g.circle(staffX + 1, headY - 14, 3).fill({ color: tip });
        if (staff.id === 'ember') g.circle(staffX + 1, headY - 16, 1.5).fill({ color: 0xf7e39a });
      }
    }

    // 8. Activity prop (book, spoon)
    if (agent.anim === 'sit_study') {
      g.rect(x + 3 * sign, bodyBaseY - 4, 5, 4).fill({ color: 0xf4ebd9 });
    } else if (agent.anim === 'eat') {
      g.circle(x + 4 * sign, bodyBaseY - 3, 3).fill({ color: 0xc28e5c });
    }
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

export type PaperDollAgent = Pick<VisualAgent, 'x' | 'y' | 'facing' | 'anim' | 'animTimer' | 'animFrame' | 'robeColor' | 'hairColor' | 'skin' | 'hat' | 'isWizard'> & { staff?: string };
