/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Camera Controller
 * Implements Section 3.6:
 * - Integer zoom: 1x (50%), 2x (100% default), 3x (150%), 4x (200%)
 * - Pan with bounds
 * - Fit: calculates largest integer zoom that fits castle + grounds
 * - Home: 2x centered on Entrance Hall
 */

export class Camera {
  zoom: number = 2; // Default 2x
  x: number = 0; // World x at viewport center
  y: number = 0; // World y at viewport center
  viewportWidth: number = 1024;
  viewportHeight: number = 600;

  constructor(initialZoom: number = 2) {
    this.zoom = initialZoom;
  }

  setViewportSize(w: number, h: number) {
    this.viewportWidth = w;
    this.viewportHeight = h;
  }

  setZoom(newZoom: number) {
    this.zoom = Math.max(1, Math.min(4, Math.round(newZoom)));
  }

  zoomIn() {
    this.setZoom(this.zoom + 1);
  }

  zoomOut() {
    this.setZoom(this.zoom - 1);
  }

  pan(dx: number, dy: number) {
    // dx, dy in screen px
    this.x -= dx / this.zoom;
    this.y -= dy / this.zoom;
  }

  centerOn(worldX: number, worldY: number) {
    this.x = worldX;
    this.y = worldY;
  }

  fit(worldWidth: number, worldHeight: number) {
    const scaleX = this.viewportWidth / worldWidth;
    const scaleY = this.viewportHeight / worldHeight;
    const fitScale = Math.min(scaleX, scaleY);
    // Largest integer zoom where whole world fits
    const intZoom = Math.max(1, Math.floor(fitScale));
    this.zoom = Math.min(4, intZoom);
    this.x = worldWidth / 2;
    this.y = worldHeight / 2;
  }

  home(entranceHallWorldX: number, groundY: number) {
    this.zoom = 2;
    this.x = entranceHallWorldX;
    this.y = groundY - 40;
  }
}
