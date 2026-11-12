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
import { drawRoomInterior, drawEmitter, drawAnimatedItem, Emitter, AnimatedItem, roomTier, TIERS, vaultFillStep } from '../rooms/roomArt';
import { drawSite } from '../rooms/siteArt';
import { isRoomUnfinished } from '../../utils/requiredFurniture';
import { drawDirt, dirtLevel, drawLockHazard, drawPadlock, drawWrench, drawDirtyBadge, drawRing, drawUnfinishedBadge } from '../rooms/statusArt';
import { drawEffect, VisualEffect, EFFECT_MS } from '../rooms/effects';
import { reviewsToGo, siteFraction } from '../../utils/construction';
import { hexToNum } from '../../utils/appearance';
import { chooseBubble, drawBubble, bubbleLabel, BubbleKind } from '../agents/doll';
import { CAPPED_RESOURCES, resourceLabel, storageCap } from '../../utils/resourceReport';

/** Fixed ambient rate (Addendum 5.5: 2-8 fps, never tied to reviews). 5 fps -> 0.8 s per 4-frame loop. */
export const AMBIENT_FRAME_MS = 200;

/** A screen-space overlay label anchored to a world point (kept crisp: never scaled by the camera). */
interface OverlayLabel { key: string; text: string; wx: number; wy: number; color: number; size: number; align: 'center' | 'left' | 'right' }
interface AmbientGroup { animate: boolean; emitters: Emitter[]; items: AnimatedItem[] }

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
  /** Cosmetic room animations (torches, glows, animated furniture); frame 0 under reduce motion. */
  ambientGraphics = new Graphics();
  /** Per-room status art above furniture: unreachable dim, selection outline. */
  statusGraphics = new Graphics();
  /** One-shot cosmetic effects (reveal dust, demolish dust, level-up trace). */
  fxGraphics = new Graphics();
  ambientGroups: AmbientGroup[] = [];
  ambientFrame = -1;
  /** Real-time clock for fixed-rate ambience (ms); never advanced by reviews. */
  clockMs = 0;
  effects: VisualEffect[] = [];
  private prevRooms: Map<number, PlacedRoom> | null = null;
  /** Last bellIndex seen. Output pops fire once when it changes, never per review. */
  private prevBell: number | null = null;
  overlayLabels: OverlayLabel[] = [];
  overlayTexts = new Map<string, Text>();
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
    this.worldContainer.addChild(this.ambientGraphics);
    this.worldContainer.addChild(this.statusGraphics);
    this.worldContainer.addChild(this.fxGraphics);
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
    for (const text of this.overlayTexts.values()) text.resolution = this.pixelRatio;
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

    // One-shot effects from state changes (never from review count or speed)
    this.detectEffects(state);

    // Draw static world layers
    this.renderWorldLayers();
  }

  /** Compare with the previous snapshot: site -> built (reveal), removed (demolish/cancel dust), level up, tier change, bell pops. */
  private detectEffects(state: FullGameState) {
    const next = new Map(state.rooms.map(r => [r.id, r] as const));
    const prev = this.prevRooms;
    this.prevRooms = next;
    const bell = state.bellIndex ?? 0;
    const bellChanged = this.prevBell !== null && bell !== this.prevBell;
    this.prevBell = bell;
    if (!prev || state.settings.reduceMotion) return;
    const now = this.clockMs;
    for (const [id, before] of prev) {
      const after = next.get(id);
      if (!after) {
        this.effects.push({ kind: 'dust', box: roomToWorldBox(before, this.groundY), start: now, ms: EFFECT_MS.dust });
      } else if (before.state === 'site' && after.state === 'built') {
        this.effects.push({ kind: 'reveal', box: roomToWorldBox(after, this.groundY), start: now, ms: EFFECT_MS.reveal });
      } else if (after.state === 'built') {
        if (after.level > before.level) {
          const def = ROOM_DEFINITIONS[after.defId];
          this.effects.push({ kind: 'level', box: roomToWorldBox(after, this.groundY), start: now, ms: after.level >= 3 ? EFFECT_MS.level3 : EFFECT_MS.level, level: after.level, name: def?.name, roomId: id });
        }
        if (before.state === 'built') {
          const delta = TIERS.indexOf(roomTier(after)) - TIERS.indexOf(roomTier(before));
          if (delta > 0) this.effects.push({ kind: 'wipe', box: roomToWorldBox(after, this.groundY), start: now, ms: EFFECT_MS.tier, roomId: id });
          else if (delta < 0) this.effects.push({ kind: 'fade', box: roomToWorldBox(after, this.groundY), start: now, ms: EFFECT_MS.tier, roomId: id });
        }
      }
    }
    if (bellChanged) this.spawnOutputPops(state, now);
  }

  /** One floater per producing room, from the latest bell's real ledger amounts. */
  private spawnOutputPops(state: FullGameState, now: number) {
    const entries = state.resourceLedger?.bells?.[state.resourceLedger.bells.length - 1]?.entries || [];
    const chunks: Array<{ source: string; items: Array<{ resource: string; amount: number }>; used?: boolean }> = [];
    for (const e of entries) {
      if (!(e.amount > 0)) continue;
      const last = chunks[chunks.length - 1];
      if (last && last.source === e.source) last.items.push(e);
      else chunks.push({ source: e.source, items: [e] });
    }
    const matches = (source: string, name: string) => source === name || source.startsWith(name + ' ') || source.startsWith(name + '(');
    for (const room of state.rooms) {
      if (room.state !== 'built' || isRoomUnfinished(room)) continue;
      const locked = (room.lockedUntilReviewIndex ?? -1) > (state.reviewIndex ?? 0);
      if (locked || !(this.reachability.get(room.id)?.reachable ?? false)) continue;
      const name = ROOM_DEFINITIONS[room.defId]?.name || room.defId;
      const chunk = chunks.find(c => !c.used && matches(c.source, name));
      if (!chunk) continue;
      chunk.used = true;
      const best = chunk.items.reduce((a, b) => (b.amount > a.amount ? b : a));
      const box = roomToWorldBox(room, this.groundY);
      this.effects.push({
        kind: 'pop',
        box,
        start: now,
        ms: EFFECT_MS.pop,
        roomId: room.id,
        name: popLabel(best.amount, best.resource),
        color: POP_COLOR[best.resource] ?? 0xe0a33a
      });
    }
  }

  renderWorldLayers() {
    if (!this.state) return;

    // 1. Sky & earth band
    ForgeRenderer.drawSky(this.skyGraphics, this.totalWorldWidth, this.groundY + 120, this.groundY);

    // 2. Castle & Grounds Rooms
    this.castleGraphics.clear();
    this.statusGraphics.clear();
    this.ambientGroups = [];
    this.overlayLabels = [];
    const robeColor = this.state.wizard?.appearance?.robeColor;
    // Crop growth: no harvest timing in the engine yet, so bell index modulo 4 (Addendum 5.5)
    const cropStage = Math.abs(this.state.bellIndex ?? 0) % 4;
    let stored = 0;
    const bag = this.state.resources as unknown as Record<string, number>;
    for (const k of CAPPED_RESOURCES) stored += bag?.[k] || 0;
    const cap = storageCap(this.state);
    const vaultFill = vaultFillStep(stored, cap > 0 ? cap : 200);
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

      if (room.state === 'built') {
        const art = drawRoomInterior(this.castleGraphics, room, box, { robeColor, hasLeftDoor, hasRightDoor, cropStage, vaultFill });
        const locked = (room.lockedUntilReviewIndex ?? -1) > (this.state.reviewIndex ?? 0);
        // Ambient loops run only in built, reachable, unlocked, finished rooms (Addendum 5.5)
        const unfinished = isRoomUnfinished(room);
        this.ambientGroups.push({ animate: isReachable && !locked && !unfinished, emitters: art.emitters, items: art.animated });
        const dirt = drawDirt(this.statusGraphics, room, box);
        if (locked) drawLockHazard(this.statusGraphics, room, box);
        ForgeRenderer.drawRoomStatus(this.statusGraphics, box, isReachable, isSelected);
        for (const d of art.damaged) drawWrench(this.statusGraphics, d.x, d.y);
        let bx = box.left + 9;
        if (locked) {
          drawPadlock(this.statusGraphics, bx, box.top + 10);
          const n = (room.lockedUntilReviewIndex ?? 0) - (this.state.reviewIndex ?? 0);
          this.overlayLabels.push({ key: `lock:${room.id}`, text: `Locked for ${n} more review${n === 1 ? '' : 's'}`, wx: box.left + 3, wy: box.top + 19, color: 0xf6e08c, size: 10, align: 'left' });
          bx += 16;
        }
        if (dirt >= 3) {
          drawDirtyBadge(this.statusGraphics, bx, box.top + 10);
          this.overlayLabels.push({ key: `dirty:${room.id}`, text: 'Dirty', wx: bx, wy: box.top + (locked ? 27 : 19), color: 0xe0c48a, size: 10, align: 'center' });
          bx += 22;
        }
        if (unfinished) {
          // Unfinished badge: top-right (clear of the centred label); the Unreachable badge owns
          // that corner, so an unreachable room shows it with the left-hand badges instead.
          const right = isReachable;
          const ux = right ? box.left + box.width - 10 : bx;
          const uy = box.top + 10 + (!right && locked ? 17 : 0);
          drawUnfinishedBadge(this.statusGraphics, ux, uy);
          this.overlayLabels.push({ key: `unfinished:${room.id}`, text: 'Unfinished', wx: right ? ux + 6 : ux - 6, wy: uy + 9, color: 0xf0b44a, size: 10, align: right ? 'right' : 'left' });
        }
      } else {
        const site = drawSite(this.castleGraphics, room, box, { robeColor });
        this.ambientGroups.push({ animate: !site.paused, emitters: site.emitters, items: [] });
        ForgeRenderer.drawRoomStatus(this.statusGraphics, box, isReachable, isSelected);
        // Progress ring at the top-right + the same countdown the Build panel shows
        const rx = box.left + box.width - 10, ry = box.top + 11;
        drawRing(this.statusGraphics, rx, ry, 6, siteFraction(room), site.paused ? 0xb9b8c2 : 0x7dd87a);
        const n = reviewsToGo(room);
        this.overlayLabels.push({ key: `site:${room.id}`, text: `${n} to go`, wx: rx, wy: ry + 9, color: 0xffffff, size: 10, align: 'center' });
        if (site.ribbon) this.overlayLabels.push({ key: `paused:${room.id}`, text: 'Paused', wx: site.ribbon.x, wy: site.ribbon.y - 4, color: 0xf6e08c, size: 10, align: 'center' });
      }

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

    // 4. Ambient layer (redrawn by update() when the animation frame changes)
    this.ambientFrame = -1;
    this.renderAmbient(0);

    // 5. Overlays & Unreachable Badges
    this.renderOverlays();
    this.renderGhost();
  }

  /** Redraw the cosmetic ambient layer for an animation frame (0..3); still groups stay on frame 0. */
  renderAmbient(frame: number) {
    if (frame === this.ambientFrame) return;
    this.ambientFrame = frame;
    const g = this.ambientGraphics;
    g.clear();
    for (const grp of this.ambientGroups) {
      const f = grp.animate ? frame : 0;
      for (const it of grp.items) drawAnimatedItem(g, it, f);
      for (const e of grp.emitters) drawEmitter(g, e, f, 0);
    }
  }

  /** Current ambient frame: fixed real-time rate; always 0 under reduce motion. */
  ambientFrameFor(reduceMotion: boolean): number {
    return reduceMotion ? 0 : Math.floor(this.clockMs / AMBIENT_FRAME_MS) % 4;
  }

  private renderEffects(reduceMotion: boolean) {
    const g = this.fxGraphics;
    if (reduceMotion) this.effects = [];
    if (!this.effects.length && !this.fxDirty) return;
    g.clear();
    this.fxDirty = false;
    const now = this.clockMs;
    this.effects = this.effects.filter(e => now - e.start < e.ms);
    for (const e of this.effects) {
      drawEffect(g, e, Math.max(0, Math.min(1, (now - e.start) / e.ms)));
      this.fxDirty = true;
    }
  }
  private fxDirty = false;

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
        // Sites carry the progress ring at the top-right, so their badge sits at the left
        const badgeWX = room.state === 'site' ? box.left + 34 : box.left + box.width - 20;
        const screenX = badgeWX * this.camera.zoom - (this.camera.x * this.camera.zoom - this.camera.viewportWidth / 2);
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

    // Status / construction labels (screen space, fixed size, device-pixel snapped)
    const labels = [...this.overlayLabels];
    for (const e of this.effects) {
      if (e.kind === 'level' && (e.level ?? 0) >= 3 && e.name && this.clockMs - e.start < e.ms) {
        labels.push({ key: `fx:${e.roomId}`, text: e.name, wx: e.box.left + e.box.width / 2, wy: e.box.top - 14, color: 0xf7e39a, size: 12, align: 'center' });
      } else if (e.kind === 'pop' && e.name && this.clockMs - e.start < e.ms) {
        const t = Math.max(0, Math.min(1, (this.clockMs - e.start) / e.ms));
        labels.push({ key: `pop:${e.roomId}:${e.start}`, text: e.name, wx: e.box.left + e.box.width / 2 + 6, wy: e.box.top - 10 - t * 18, color: 0xf6f1e8, size: 11, align: 'center' });
      }
    }
    // Status bubbles (Addendum 6.7): one per character, 24 screen px, crowded rooms collapse.
    const byRoom = new Map<number, Array<{ x: number; y: number; b: BubbleKind }>>();
    const loose: Array<{ x: number; y: number; b: BubbleKind }> = [];
    for (const agent of this.choreographer.agents.values()) {
      const char = agent.character;
      if (!char) continue;
      const showMorale = !!agent.arrivedAt && (Date.now() - agent.arrivedAt) < 3000;
      const b = chooseBubble(char, { showMorale });
      if (!b) continue;
      const wx = agent.x;
      const wy = agent.y - 30;
      const roomId = agent.currentRoomId;
      if (roomId == null) loose.push({ x: wx, y: wy, b });
      else {
        const list = byRoom.get(roomId) || [];
        list.push({ x: wx, y: wy, b });
        byRoom.set(roomId, list);
      }
    }
    const paint = (wx: number, wy: number, b: BubbleKind) => {
      const sx = wx * this.camera.zoom - (this.camera.x * this.camera.zoom - this.camera.viewportWidth / 2);
      const sy = wy * this.camera.zoom - (this.camera.y * this.camera.zoom - this.camera.viewportHeight / 2);
      drawBubble(this.overlayGraphics, b, sx, sy, 2);
    };
    for (const [roomId, list] of byRoom) {
      if (list.length > 8) {
        const sx = list[0].x;
        const sy = list[0].y;
        labels.push({ key: `crowd:${roomId}`, text: bubbleLabel(list.map(i => i.b)), wx: sx, wy: sy, color: 0xf6f1e8, size: 12, align: 'center' });
      } else {
        for (const item of list) paint(item.x, item.y, item.b);
      }
    }
    for (const item of loose) paint(item.x, item.y, item.b);

    for (const agent of this.choreographer.agents.values()) {
      const schools = agent.isWizard ? [] : (agent.character?.masteredSchools || []);
      if (this.camera.zoom >= 2 && schools.length) {
        labels.push({ key: `pips:${agent.id}`, text: schools.map(s => s.slice(0, 1).toUpperCase()).join(''), wx: agent.x, wy: agent.y + 8, color: 0xf7e39a, size: 10, align: 'center' });
      }
      if (this.camera.zoom >= 3 && agent.character?.career) {
        labels.push({ key: `career:${agent.id}`, text: agent.character.career, wx: agent.x, wy: agent.y + 16, color: 0xf6f1e8, size: 10, align: 'center' });
      }
    }

    const live = new Set<string>();
    const z = this.camera.zoom, ox = this.worldContainer.x, oy = this.worldContainer.y;
    for (const l of labels) {
      live.add(l.key);
      let t = this.overlayTexts.get(l.key);
      if (!t) {
        t = new Text({ text: l.text, resolution: this.pixelRatio, style: new TextStyle({ fontFamily: 'sans-serif', fontSize: l.size, fill: l.color, fontWeight: 'bold', stroke: { color: 0x000000, width: 3 } }) });
        this.overlayContainer.addChild(t);
        this.overlayTexts.set(l.key, t);
      } else if (t.text !== l.text) {
        t.text = l.text;
      }
      t.resolution = this.pixelRatio;
      // Grow a little with zoom but always re-rastered at the target size (never bitmap-scaled)
      const fs = Math.round(l.size * (0.5 + 0.25 * z));
      if (t.style.fontSize !== fs) t.style.fontSize = fs;
      let w = 0;
      try { w = t.width; } catch { w = 0; }
      const sx = ox + l.wx * z, sy = oy + l.wy * z;
      t.x = this.snap(l.align === 'center' ? sx - w / 2 : l.align === 'right' ? sx - w : sx);
      t.y = this.snap(sy);
    }
    for (const [k, t] of this.overlayTexts) {
      if (!live.has(k)) {
        this.overlayContainer.removeChild(t);
        t.destroy();
        this.overlayTexts.delete(k);
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

  private lastReal = -1;

  /** Real-time gap. Repeated callbacks with the same `now` add nothing. Hidden-tab jumps clamp to 250ms. */
  consumeTime(deltaMs: number, nowMs?: number): number {
    let gap: number;
    if (nowMs == null) gap = deltaMs;
    else if (this.lastReal < 0) gap = Number.isFinite(deltaMs) ? deltaMs : 0;
    else gap = nowMs - this.lastReal;
    if (nowMs != null) this.lastReal = nowMs;
    if (!Number.isFinite(gap) || gap < 0) gap = 0;
    return Math.min(250, gap);
  }

  /** Screen-space box of a built room, relative to the canvas. Null if it isn't placed. */
  roomScreenBox(defId: string): { left: number; top: number; width: number; height: number } | null {
    const room = this.state?.rooms.find(r => r.defId === defId && r.state === 'built');
    if (!room) return null;
    const box = roomToWorldBox(room, this.groundY);
    const z = this.camera.zoom;
    const ox = this.camera.viewportWidth / 2 - this.camera.x * z;
    const oy = this.camera.viewportHeight / 2 - this.camera.y * z;
    return { left: ox + box.left * z, top: oy + box.top * z, width: box.width * z, height: box.height * z };
  }

  /** Pan the camera onto the room when it sits off the canvas. Returns false if the viewport isn't ready. */
  ensureRoomVisible(defId: string): boolean {
    if (this.camera.viewportWidth < 20 || this.camera.viewportHeight < 20) return false;
    const room = this.state?.rooms.find(r => r.defId === defId && r.state === 'built');
    if (!room) return false;
    const box = roomToWorldBox(room, this.groundY);
    const screen = this.roomScreenBox(defId);
    const pad = 32;
    const vw = this.camera.viewportWidth;
    const vh = this.camera.viewportHeight;
    const off = !screen || screen.left < pad || screen.top < pad || screen.left + screen.width > vw - pad || screen.top + screen.height > vh - pad;
    if (off) this.camera.centerOn(box.left + box.width / 2, box.top + box.height / 2);
    return true;
  }

  update(deltaMs: number, nowMs?: number) {
    if (!this.state) return;
    const reduceMotion = !!this.state.settings.reduceMotion;
    const gap = this.consumeTime(deltaMs, nowMs);
    this.clockMs += gap;

    // One clock. A second callback with the same `now` adds nothing (stacked tickers, re-renders).
    this.choreographer.tick(gap, this.state, reduceMotion, nowMs);

    // Fixed-rate ambience + one-shot effects (cosmetic only)
    this.renderAmbient(this.ambientFrameFor(reduceMotion));
    this.renderEffects(reduceMotion);

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

const POP_COLOR: Record<string, number> = {
  timber: 0x6e4529, stone: 0x8a8994, glass: 0x9cd4ff, cloth: 0xd97a9a,
  provisions: 0xe0a33a, greens: 0x6ba34f, fish: 0x5a9ad6, nectar: 0xf5ce7a,
  herbs: 0x4e8b3a, insight: 0x6b4fbb, radiance: 0xe8c547, umbra: 0x4c5ba3, reagents: 0xd9472b,
  crystal: 0x9c86e0, heartwood: 0x7db861
};

function popLabel(amount: number, resource: string): string {
  const n = Math.abs(amount);
  const shown = Math.abs(n - Math.round(n)) < 0.05 ? String(Math.round(n)) : String(Math.round(n * 10) / 10);
  return `+${shown} ${resourceLabel(resource)}`;
}
