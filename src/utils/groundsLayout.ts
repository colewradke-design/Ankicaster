/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Grounds Plot Layout Mapping
 * Section 3.5 & Section 13.4 of Visual Overhaul Addendum:
 * 18 plot positions: 9 on the left (L8...L0), 9 on the right (R0...R8).
 * Indices 0-8 are L8...L0 (left of castle).
 * Indices 9-17 are R0...R8 (right of castle).
 * Castle is in the middle between L0 (index 8) and R0 (index 9).
 */

export function plotSide(index: number): 'left' | 'right' {
  return index <= 8 ? 'left' : 'right';
}

/**
 * Unlocked plot indices grow outward from the castle, alternating sides:
 * 6 plots: indices 6..11 (L2..L0, R0..R2)
 * 10 plots: indices 4..13 (L4..L0, R0..R4)
 * 14 plots: indices 2..15 (L6..L0, R0..R6)
 * 16 plots: indices 1..16 (L7..L0, R0..R7)
 * 18 plots: indices 0..17 (L8..L0, R0..R8)
 */
export function unlockedPlotIndices(plotCount: number): number[] {
  const count = Math.max(6, Math.min(18, plotCount));
  const half = Math.floor(count / 2);
  const leftStart = 9 - half;
  const rightEnd = 8 + (count - half);
  const result: number[] = [];
  for (let i = leftStart; i <= rightEnd; i++) {
    result.push(i);
  }
  return result;
}

/**
 * Check if two plot indices are adjacent on the same side.
 * Indices 8 (L0) and 9 (R0) are separated by the castle and are NOT adjacent.
 */
export function adjacentPlots(a: number, b: number): boolean {
  if (Math.abs(a - b) !== 1) return false;
  // 8 and 9 are across the castle
  if ((a === 8 && b === 9) || (a === 9 && b === 8)) return false;
  return true;
}
