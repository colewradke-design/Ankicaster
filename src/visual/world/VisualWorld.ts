/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Visual World Coordinator
 * Implements Section 13.3 & Milestone V1:
 * - Manages PixiJS containers: skyLayer, castleLayer, agentsLayer, roofsLayer, overlayLayer
 * - Coordinates Camera, Choreographer, NavGraph, and ForgeRenderer
 * - Handles hit testing for room clicks
 */

import { Container, Graphics, Text, TextStyle } from 'pixi.js';
import { FullGameState, PlacedRoom } from '../../types/ankicaster';
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
  CELL_H
} from '../layout/gridToWorld';

export class VisualWorld {
  rootContainer = new Container();
  worldContainer = new Container();

  skyGraphics = new Graphics();
  castleGraphics = new Graphics();
  agentsGraphics = new Graphics();
  roofsGraphics = new Graphics();
  overlayGraphics = new Graphics();
  overlayContainer = new Container();

  camera: Camera;
  navGraph: NavGraph;
  choreographer: Choreographer;

  state?: FullGameState;
  reachability = new Map<number, ReachabilityInfo>();
  groundY: number = 400;
  totalWorldWidth: number = 1600;
  selectedRoomId?: number;

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
    this.overlayContainer.addChild(this.overlayGraphics);
  }

  setSnapshot(state: FullGameState, selectedRoomId?: number) {
    this.state = state;
    this.selectedRoomId = selectedRoomId;

    // Calculate castle height & groundY
    const maxFloor = Math.max(2, ...state.rooms.filter(r => r.area === 'castle').map(r => r.y + r.h - 1));
    this.groundY = getGroundY(maxFloor + 1);
    this.totalWorldWidth = getTotalWorldWidth(8);

    // Compute reachability
    this.reachability = computeReachability(state.rooms);

    // Update nav graph & choreographer
    this.navGraph.build(state.rooms, this.groundY);
    this.choreographer.updateNavGraph(this.navGraph, this.groundY);
    this.choreographer.syncState(state);

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

    for (const room of rooms) {
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
    }

    // 3. Roofs on top of each castle column
    this.roofsGraphics.clear();
    const castleRooms = rooms.filter(r => r.area === 'castle' && r.state === 'built');
    for (let col = 0; col < 8; col++) {
      const colRooms = castleRooms.filter(r => r.x <= col && r.x + r.w > col);
      if (colRooms.length > 0) {
        // Topmost room
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
  }

  renderOverlays() {
    this.overlayGraphics.clear();
    // Clear overlay text children
    while (this.overlayContainer.children.length > 1) {
      this.overlayContainer.removeChildAt(1);
    }

    if (!this.state) return;

    for (const room of this.state.rooms) {
      const isReachable = this.reachability.get(room.id)?.reachable ?? false;
      if (!isReachable) {
        // Draw Unreachable badge on top right of the room
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

        const badgeText = new Text({
          text: 'Unreachable',
          style: new TextStyle({
            fontFamily: 'sans-serif',
            fontSize: 10,
            fill: 0xffffff,
            fontWeight: 'bold',
            stroke: { color: 0x000000, width: 2 }
          })
        });
        badgeText.x = screenX - 60;
        badgeText.y = screenY - 7;
        this.overlayContainer.addChild(badgeText);
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
    this.worldContainer.x = this.camera.viewportWidth / 2 - this.camera.x * this.camera.zoom;
    this.worldContainer.y = this.camera.viewportHeight / 2 - this.camera.y * this.camera.zoom;

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
