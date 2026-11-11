/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Grid to World Pixel Math
 * Implements Section 3.1:
 * - Art cell: CW = 64 art px, CH = 48 art px
 * - Grounds plots on left: G = 9 plots (indices 0..8 = L8..L0)
 * - Castle cell left edge: worldX(x) = (G * CW) + x * CW
 * - Castle room box:
 *   left = worldX(room.x)
 *   top = groundY - (room.y + room.h) * CH
 *   width = room.w * CW
 *   height = room.h * CH
 * - Floor line for floor f: groundY - f * CH - 4
 * - groundY = skyHeight + castleMaxH * CH, with skyHeight = 160 art px
 * - Grounds plot world x:
 *   Left plots (0..8 -> L8..L0): worldX_plot = plotIndex * CW
 *   Right plots (9..17 -> R0..R8): worldX_plot = (G * CW) + castleCols * CW + (plotIndex - 9) * CW
 */

export const CELL_W = 64;
export const CELL_H = 48;
export const GROUNDS_PLOTS_PER_SIDE = 9;
export const SKY_HEIGHT = 160;
export const CASTLE_COLS = 8; // Castle width columns (columns 0..7)

export function getGroundY(maxFloorHeight: number = 5): number {
  return SKY_HEIGHT + maxFloorHeight * CELL_H;
}

export function castleCellToWorldX(cellX: number): number {
  return (GROUNDS_PLOTS_PER_SIDE * CELL_W) + cellX * CELL_W;
}

export function groundsPlotToWorldX(plotIndex: number, castleCols: number = CASTLE_COLS): number {
  if (plotIndex <= 8) {
    // 0..8 -> L8..L0
    return plotIndex * CELL_W;
  } else {
    // 9..17 -> R0..R8
    const rIndex = plotIndex - 9;
    return (GROUNDS_PLOTS_PER_SIDE * CELL_W) + (castleCols * CELL_W) + (rIndex * CELL_W);
  }
}

export interface RoomWorldBox {
  left: number;
  top: number;
  width: number;
  height: number;
  floorLineY: number; // For floor y=0 or bottom floor of the room
}

export function roomToWorldBox(
  room: { x: number; y: number; w: number; h: number; area: 'castle' | 'grounds' },
  groundY: number,
  castleCols: number = CASTLE_COLS
): RoomWorldBox {
  if (room.area === 'grounds') {
    const left = groundsPlotToWorldX(room.x, castleCols);
    const width = room.w * CELL_W;
    const height = room.h * CELL_H;
    const top = groundY - height;
    const floorLineY = groundY - 4;
    return { left, top, width, height, floorLineY };
  } else {
    const left = castleCellToWorldX(room.x);
    const width = room.w * CELL_W;
    const height = room.h * CELL_H;
    const top = groundY - (room.y + room.h) * CELL_H;
    const floorLineY = groundY - room.y * CELL_H - 4;
    return { left, top, width, height, floorLineY };
  }
}

export function getFloorLineY(floor: number, groundY: number): number {
  return groundY - floor * CELL_H - 4;
}

export function getTotalWorldWidth(castleCols: number = CASTLE_COLS): number {
  return (GROUNDS_PLOTS_PER_SIDE * 2 + castleCols) * CELL_W;
}
