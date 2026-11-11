/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Visual World Coordinator
 * Implements Section 13.3 & Milestone V1:
 * - Manages PixiJS containers: skyLayer, castleLayer, roomLabelsContainer, agentsLayer, roofsLayer, overlayLayer
 * - Coordinates Camera, Choreographer, NavGraph, and ForgeRenderer
 * - Draws room names on canvas (readable at 2x and never cut off)
 * - Crisp text: labels live in a SCREEN-SPACE layer (not scaled by the camera), are rasterized at
 *   fontSize x zoom and resolution = devicePixelRatio, and are snapped to whole device pixels.
 *   Pixel art stays in the zoomed world layer (nearest-neighbour look unchanged).
 * - Pools & destroys Unreachable badge text per room once
 * - Handles hit testing for room clicks
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { FullGameState, PlacedRoom } from '../../types/ankicaster';
import { ROOM_DEFINITIONS } from '../../data/content';
import { Camera } from './Camera';
import { NavGraph } from '../layout/navGraph';
import { Choreographer } from '../agents/Choreographer';
import { ForgeRenderer } from '../sprites/forge/ForgeRenderer';
import { computeReachability, ReachabilityInfo } from '../../utils/reachability';
import {
  roomToWorldBox,
  getGroundY,
  getTotalWorldWidth,
  castleCellToWorldX,
  CELL_W,
  CELL_H,
  GROUNDS_PLOTS_PER_SIDE
} from '../layout/gridToWorld';
import { unlockedPlotIndices } from '../../utils/groundsLayout';

export interface GhostFootprint {
  area: 'castle' | 'grounds';
  x: number;
  y: number;
  w: number;
  h: number;
  valid: boolean;
  plotCount: number;
  castleFloors: number;
  /** Room being moved (its own cells count as free). */
  ignoreRoomId?: number;
}

export class VisualWorld {
  rootContainer = new Container();
  worldContainer = new Container();

  skyGraphics = new Graphics();
  castleGraphics = new Graphics();
  roomLabelsContainer = new Container();
  agentsGraphics = new Graphics();
  roofsGraphics = new Graphics();
  overlayGraphics = new Graphics();
  overlayContainer = new Container();
  /** Build / Move placement ghost (world space, above rooms). */
  ghostGraphics = new Graphics();
  ghost: GhostFootprint | null = null;

  camera: Camera;
  navGraph: NavGraph;
  choreographer: Choreographer;

  state?: FullGameState;
  reachability = new Map<number, ReachabilityInfo>();
  groundY: number = 400;
  totalWorldWidth: number = 1600;
  selectedRoomId?: number;

  roomNameTexts = new Map<number, Text>();
  /** World-space anchor (top-centre) and box width for each room label. */
  roomLabelAnchors = new Map<number, { cx: number; top: number; width: number }>();
  /** Device pixel ratio the canvas renders at (renderer.resolution). */
  pixelRatio = 1;
  private labelZoom = 0;
  private labelRatio = 0;
  unreachableBadgeTexts = new Map<number, Text>();

  constructor() {
    this.camera = new Camera(2);
    this.navGraph = new NavGraph([], 400);
    this.choreographer = new Choreographer(this.navGraph, 400);

    // Setup hierarchy
    this.rootContainer.addChild(this.worldContainer);
    this.rootContainer.addChild(this.overlayContainer);

    this.worldContainer.addChild(this.skyGraphics);
    this.worldContainer.addChild(this.castleGraphics);
    this.worldContainer.addChild(this.agentsGraphics);
    this.worldContainer.addChild(this.roofsGraphics);
    this.worldContainer.addChild(this.ghostGraphics);
    // Labels sit above the world but are NOT inside the zoomed worldContainer
    this.rootContainer.addChildAt(this.roomLabelsContainer, 1);
    this.overlayContainer.addChild(this.overlayGraphics);
  }

  /** Snap a screen coordinate (CSS px) to a whole device pixel. */
  snap(v: number): number {
    const r = this.pixelRatio || 1;
    return Math.round(v * r) / r;
  }

  setPixelRatio(ratio: number) {
    this.pixelRatio = ratio > 0 ? ratio : 1;
  }

  /** Label font size in screen px for a camera zoom (world size 7 art px, min 9 px for legibility). */
  static labelFontSize(zoom: number): number {
    return Math.max(9, Math.round(7 * zoom));
  }

  /** Re-raster label textures when zoom or DPR changes, so text is never bitmap-scaled. */
  private refreshLabelStyles(force = false) {
    const zoom = this.camera.zoom;
    if (!force && zoom === this.labelZoom && this.pixelRatio === this.labelRatio) return;
    this.labelZoom = zoom;
    this.labelRatio = this.pixelRatio;
    const fontSize = VisualWorld.labelFontSize(zoom);
    const strokeW = Math.max(2, Math.round(1.5 * zoom));
    for (const [roomId, text] of this.roomNameTexts.entries()) {
      const a = this.roomLabelAnchors.get(roomId);
      text.resolution = this.pixelRatio;
      text.style.fontSize = fontSize;
      text.style.stroke = { color: 0x1b1822, width: strokeW };
      text.style.wordWrapWidth = Math.max(28 * zoom, ((a?.width ?? 64) - 6) * zoom);
    }
    for (const text of this.unreachableBadgeTexts.values()) text.resolution = this.pixelRatio;
  }

  /** Position labels from the camera transform, snapped to device pixels. */
  private layoutLabels() {
    const z = this.camera.zoom;
    const ox = this.worldContainer.x;
    const oy = this.worldContainer.y;
    for (const [roomId, text] of this.roomNameTexts.entries()) {
      const a = this.roomLabelAnchors.get(roomId);
      if (!a) continue;
      let w = 0;
      try { w = text.width; } catch { w = 0; } // measuring needs a canvas; absent in node tests
      text.x = this.snap(ox + a.cx * z - w / 2);
      text.y = this.snap(oy + (a.top + 3) * z);
    }
  }

  setSnapshot(state: FullGameState, selectedRoomId?: number) {
    this.state = state;
    this.selectedRoomId = selectedRoomId;

    // Calculate castle height & groundY
    const maxFloor = Math.max(2, ...state.rooms.filter(r => r.area === 'castle').map(r => r.y + r.h - 1));
    this.groundY = getGroundY(maxFloor + 1);
    this.totalWorldWidth = getTotalWorldWidth(8);

    // Compute reachability
    const engineReach = computeReachability(state.rooms);
    this.reachability = engineReach;
    // Construction sites are not walkable yet, so they are never "reachable" in the engine graph.
    // For the map badge, judge a site by whether it will be connected once built.
    const sites = state.rooms.filter(r => r.state === 'site');
    if (sites.length) {
      const asBuilt = computeReachability(state.rooms.map(r => (r.state === 'site' ? { ...r, state: 'built' as const } : r)));
      this.reachability = new Map(this.reachability);
      for (const site of sites) {
        const info = asBuilt.get(site.id);
        if (info) this.reachability.set(site.id, info);
      }
    }

    // Update nav graph & choreographer
    this.navGraph.build(state.rooms, this.groundY);
    this.choreographer.updateNavGraph(this.navGraph, this.groundY);
    this.choreographer.syncState(state, engineReach);

    // Draw static world layers
    this.renderWorldLayers();
  }

  renderWorldLayers() {
    if (!this.state) return;

    // 1. Sky & earth band
    ForgeRenderer.drawSky(this.skyGraphics, this.totalWorldWidth, this.groundY + 120, this.groundY);

    // 2. Castle & Grounds Rooms
    this.castleGraphics.clear();
    const rooms = this.state.rooms;
    const currentRoomIds = new Set<number>();
    let labelsCreated = false;

    for (const room of rooms) {
      currentRoomIds.add(room.id);
      const box = roomToWorldBox(room, this.groundY);
      const isReachable = this.reachability.get(room.id)?.reachable ?? false;
      const isSelected = this.selectedRoomId === room.id;

      // Check left/right doorways for castle rooms
      let hasLeftDoor = false;
      let hasRightDoor = false;
      if (room.area === 'castle') {
        const leftNeighbour = rooms.find(
          r => r.area === 'castle' && r.state === 'built' && r.x + r.w === room.x && r.y === room.y
        );
        const rightNeighbour = rooms.find(
          r => r.area === 'castle' && r.state === 'built' && r.x === room.x + room.w && r.y === room.y
        );
        hasLeftDoor = !!leftNeighbour && isReachable;
        hasRightDoor = !!rightNeighbour && isReachable;
      }

      ForgeRenderer.drawRoom(this.castleGraphics, room, box, isReachable, isSelected, hasLeftDoor, hasRightDoor);

      // Render room name on the canvas (readable at 2x and never cut off)
      const def = ROOM_DEFINITIONS[room.defId];
      const roomName = def?.name || room.defId;
      const maxW = Math.max(28, box.width - 6);

      const zoom = this.camera.zoom;
      let roomText = this.roomNameTexts.get(room.id);
      if (!roomText) {
        roomText = new Text({
          text: roomName,
          resolution: this.pixelRatio,
          style: new TextStyle({
            fontFamily: 'sans-serif',
            fontSize: VisualWorld.labelFontSize(zoom),
            fill: 0xffffff,
            fontWeight: 'bold',
            align: 'center',
            wordWrap: true,
            wordWrapWidth: maxW * zoom,
            stroke: { color: 0x1b1822, width: Math.max(2, Math.round(1.5 * zoom)) }
          })
        });
        this.roomLabelsContainer.addChild(roomText);
        this.roomNameTexts.set(room.id, roomText);
        labelsCreated = true;
      } else if (roomText.text !== roomName) {
        roomText.text = roomName;
      }
      this.roomLabelAnchors.set(room.id, { cx: box.left + box.width / 2, top: box.top, width: box.width });
    }
    this.refreshLabelStyles(labelsCreated);

    // Clean up room names for rooms no longer in state
    for (const [roomId, text] of this.roomNameTexts.entries()) {
      if (!currentRoomIds.has(roomId)) {
        this.roomLabelsContainer.removeChild(text);
        text.destroy();
        this.roomNameTexts.delete(roomId);
        this.roomLabelAnchors.delete(roomId);
      }
    }

    // 3. Roofs on top of each castle column
    this.roofsGraphics.clear();
    // Sites count too, so a roof never cuts through scaffolding placed above a room
    const castleRooms = rooms.filter(r => r.area === 'castle');
    for (let col = 0; col < 8; col++) {
      const colRooms = castleRooms.filter(r => r.x <= col && r.x + r.w > col);
      if (colRooms.length > 0) {
        let topRoom = colRooms[0];
        for (const r of colRooms) {
          if (r.y + r.h > topRoom.y + topRoom.h) topRoom = r;
        }
        const colWorldX = castleCellToWorldX(col);
        const topY = this.groundY - (topRoom.y + topRoom.h) * CELL_H;
        const roofStyle = topRoom.defId === 'wizard_study' ? 'spire' : 'battlement';
        ForgeRenderer.drawRoof(this.roofsGraphics, colWorldX, topY, CELL_W, roofStyle);
      }
    }

    // 4. Overlays & Unreachable Badges
    this.renderOverlays();
    this.renderGhost();
  }

  /** Show (or clear) the placement ghost. */
  setGhost(ghost: GhostFootprint | null) {
    const same = ghost && this.ghost && ghost.area === this.ghost.area && ghost.x === this.ghost.x &&
      ghost.y === this.ghost.y && ghost.w === this.ghost.w && ghost.h === this.ghost.h &&
      ghost.valid === this.ghost.valid && ghost.plotCount === this.ghost.plotCount;
    if (same || (!ghost && !this.ghost)) return;
    this.ghost = ghost;
    this.renderGhost();
  }

  renderGhost() {
    this.ghostGraphics.clear();
    const ghost = this.ghost;
    if (!ghost || !this.state) return;
    // Faint blueprint outline of free cells for the area being placed
    const cells: Array<{ left: number; top: number; width: number; height: number }> = [];
    if (ghost.area === 'castle') {
      for (let fy = 0; fy < ghost.castleFloors; fy++) {
        for (let cx = 0; cx < 8; cx++) {
          const taken = this.state.rooms.some(r => r.area === 'castle' && r.id !== ghost.ignoreRoomId && cx >= r.x && cx < r.x + r.w && fy >= r.y && fy < r.y + r.h);
          if (!taken) cells.push(roomToWorldBox({ x: cx, y: fy, w: 1, h: 1, area: 'castle' }, this.groundY));
        }
      }
    } else {
      for (const p of unlockedPlotIndices(ghost.plotCount)) {
        const taken = this.state.rooms.some(r => r.area === 'grounds' && r.id !== ghost.ignoreRoomId && p >= r.x && p < r.x + r.w);
        if (!taken) cells.push(roomToWorldBox({ x: p, y: 0, w: 1, h: 1, area: 'grounds' }, this.groundY));
      }
    }
    ForgeRenderer.drawBuildGrid(this.ghostGraphics, cells);
    ForgeRenderer.drawGhost(this.ghostGraphics, roomToWorldBox(ghost, this.groundY), ghost.valid);
  }

  /** Screen point -> world point. */
  screenToWorld(screenX: number, screenY: number) {
    return {
      x: (screenX - this.worldContainer.x) / this.camera.zoom,
      y: (screenY - this.worldContainer.y) / this.camera.zoom
    };
  }

  /**
   * Grid anchor (x, y) for a w x h footprint centred under the cursor, snapped to cells
   * (castle: column/floor; grounds: plot index, y = 0).
   */
  gridAnchorAt(screenX: number, screenY: number, area: 'castle' | 'grounds', w: number, h: number) {
    const p = this.screenToWorld(screenX, screenY);
    if (area === 'castle') {
      const col = (p.x - castleCellToWorldX(0)) / CELL_W;
      const floor = (this.groundY - p.y) / CELL_H;
      return { x: Math.round(col - w / 2), y: Math.max(0, Math.round(floor - h / 2)) };
    }
    const leftEnd = GROUNDS_PLOTS_PER_SIDE * CELL_W;
    const rightStart = castleCellToWorldX(8);
    let plot: number;
    if (p.x < leftEnd + (rightStart - leftEnd) / 2) plot = Math.min(p.x, leftEnd - 1) / CELL_W;
    else plot = 9 + Math.max(0, p.x - rightStart) / CELL_W;
    return { x: Math.round(plot - w / 2), y: 0 };
  }

  renderOverlays() {
    this.overlayGraphics.clear();

    if (!this.state) return;

    const currentUnreachableRoomIds = new Set<number>();

    for (const room of this.state.rooms) {
      const isReachable = this.reachability.get(room.id)?.reachable ?? false;
      if (!isReachable) {
        currentUnreachableRoomIds.add(room.id);
        const box = roomToWorldBox(room, this.groundY);
        const screenX = (box.left + box.width - 20) * this.camera.zoom - (this.camera.x * this.camera.zoom - this.camera.viewportWidth / 2);
        const screenY = (box.top + 16) * this.camera.zoom - (this.camera.y * this.camera.zoom - this.camera.viewportHeight / 2);

        // Circle with diagonal bar (Unreachable badge)
        this.overlayGraphics.circle(screenX, screenY, 10).fill({ color: 0x202020, alpha: 0.85 });
        this.overlayGraphics.circle(screenX, screenY, 10).stroke({ color: 0xd9472b, width: 2 });
        this.overlayGraphics.poly([
          screenX - 6, screenY - 6,
          screenX + 6, screenY + 6
        ]).stroke({ color: 0xd9472b, width: 2 });

        // Manage persistent badge text once per room
        let badgeText = this.unreachableBadgeTexts.get(room.id);
        if (!badgeText) {
          badgeText = new Text({
            text: 'Unreachable',
            resolution: this.pixelRatio,
            style: new TextStyle({
              fontFamily: 'sans-serif',
              fontSize: 10,
              fill: 0xffffff,
              fontWeight: 'bold',
              stroke: { color: 0x000000, width: 2 }
            })
          });
          this.overlayContainer.addChild(badgeText);
          this.unreachableBadgeTexts.set(room.id, badgeText);
        }

        badgeText.x = this.snap(screenX - 60);
        badgeText.y = this.snap(screenY - 7);
        badgeText.visible = true;
      }
    }

    // Destroy badge texts when no longer needed (e.g. room became reachable or was removed)
    for (const [roomId, badgeText] of this.unreachableBadgeTexts.entries()) {
      if (!currentUnreachableRoomIds.has(roomId)) {
        this.overlayContainer.removeChild(badgeText);
        badgeText.destroy();
        this.unreachableBadgeTexts.delete(roomId);
      }
    }
  }

  update(deltaMs: number) {
    if (!this.state) return;
    const reduceMotion = !!this.state.settings.reduceMotion;

    // Tick Choreographer
    this.choreographer.tick(deltaMs, this.state, reduceMotion);

    // Draw agents
    this.agentsGraphics.clear();
    for (const agent of this.choreographer.agents.values()) {
      ForgeRenderer.drawPaperDoll(this.agentsGraphics, agent);
    }

    // Apply Camera transform to worldContainer
    this.worldContainer.scale.set(this.camera.zoom, this.camera.zoom);
    // Snap the world origin to whole device pixels so art and labels stay on the pixel grid
    this.worldContainer.x = this.snap(this.camera.viewportWidth / 2 - this.camera.x * this.camera.zoom);
    this.worldContainer.y = this.snap(this.camera.viewportHeight / 2 - this.camera.y * this.camera.zoom);

    // Crisp screen-space labels: re-raster on zoom/DPR change, then position
    this.refreshLabelStyles();
    this.layoutLabels();

    // Update overlay position sync
    this.renderOverlays();
  }

  hitTestRoom(screenX: number, screenY: number): PlacedRoom | null {
    if (!this.state) return null;

    // Convert screen coordinates to world coordinates
    const worldX = (screenX - this.worldContainer.x) / this.camera.zoom;
    const worldY = (screenY - this.worldContainer.y) / this.camera.zoom;

    for (const room of this.state.rooms) {
      const box = roomToWorldBox(room, this.groundY);
      if (
        worldX >= box.left &&
        worldX <= box.left + box.width &&
        worldY >= box.top &&
        worldY <= box.top + box.height
      ) {
        return room;
      }
    }

    return null;
  }
}
