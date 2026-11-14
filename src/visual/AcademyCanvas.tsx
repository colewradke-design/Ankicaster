/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * AcademyCanvas React Component
 * Implements Section 13.2 & Milestone V1:
 * - Mounts PixiJS Application
 * - Handles camera controls: Zoom in/out (+/-), Fit (F), Home (H)
 * - Click handling: room selection via onSelectRoom
 * - Integer zoom (1x-4x, default 2x)
 */

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Application, TextureStyle } from 'pixi.js';
import { FullGameState, PlacedRoom, CreatureInstance } from '../types/ankicaster';
import { VisualWorld } from './world/VisualWorld';
import { castleCellToWorldX } from './layout/gridToWorld';
import { ZoomIn, ZoomOut, Maximize2, Home, Move, Hammer, X as XIcon, Wand2 } from 'lucide-react';
import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../data/content';
import { AnkicasterEngine } from '../utils/engine';
import { validatePlacement, roomLimitStatus, getGridSize, findAutoPlacement, PlacementCheck } from '../utils/placement';
import { reviewsToGoText } from '../utils/construction';
import { formatMaterialCost } from '../utils/resourceReport';
import { tamingRequirement } from './creatures/creatureArt';
import { arrivalStage, arrivalStageLabel, originLabel } from '../utils/creatures';
import { registerVisualPreviewListener } from './events/visualEvents';
import {
  DropTargetInput,
  DropValidationResult,
  findFirstValidFurnitureDrop,
  piecePlane,
  resolveFurniturePosition,
  snapFurnitureX,
  validateFurnitureDrop
} from './layout/furniturePlacement';

TextureStyle.defaultOptions.scaleMode = 'nearest';

/** Build a new room, move an existing one, or place/move furniture with the ghost placement tool. */
export type PlacementMode =
  | { kind: 'build'; defId: string }
  | { kind: 'move'; roomId: number }
  | { kind: 'furniture_place'; roomId: number; furnitureId: number }
  | { kind: 'furniture_move'; roomId: number; furnitureId: number };

export function creatureHoverText(c: {
  nickname: string;
  defId: string;
  status: CreatureInstance['status'];
  tamingProgress: number;
  bondLevel: 0 | 1 | 2 | 3;
  hatchProgress: number;
  unhomed: boolean;
}): string {
  if (c.unhomed) return 'Looking for a home';
  if (c.status === 'loose') return `${c.nickname} · Loose! Click to view`;
  if (c.status === 'egg') {
    const label = originLabel(undefined, c.defId);
    const stageText = arrivalStageLabel(arrivalStage(c.hatchProgress));
    return `${label} · ${Math.floor(c.hatchProgress)}% (${stageText})`;
  }
  if (c.status === 'wary') {
    const left = Math.max(1, tamingRequirement(c.defId) - Math.floor(c.tamingProgress));
    return `About ${left} honest review${left === 1 ? '' : 's'} to tame`;
  }
  return `${c.nickname} · ${'♥'.repeat(c.bondLevel)}`;
}

interface AcademyCanvasProps {
  state: FullGameState;
  onSelectRoom: (room: PlacedRoom) => void;
  onSelectCreature?: (creature: CreatureInstance) => void;
  onSelectEvent?: (eventId: string) => void;
  selectedRoomId?: number;
  onResolveHazard?: (roomId: number, method: 'warder' | 'spell') => void;
  placement?: PlacementMode | null;
  onPlacementConfirm?: (x: number, y: number) => void;
  onFurnitureDropConfirm?: (target: DropTargetInput) => void;
  onPlacementReject?: (reason: string) => void;
  onPlacementCancel?: () => void;
  onPlacementAuto?: () => void;
  /** Tutorial: keep this room on screen, and report its page rect. */
  focusRoomDefId?: string | null;
  onRoomScreenBox?: (box: { left: number; top: number; width: number; height: number } | null) => void;
}

/** Validate a placement candidate exactly as the engine will (the engine re-checks on confirm). */
export function checkPlacementCandidate(state: FullGameState, mode: PlacementMode, x: number, y: number): PlacementCheck {
  if (mode.kind === 'furniture_place' || mode.kind === 'furniture_move') {
    return { valid: false, errors: ['Point inside the room to place furniture'], warnings: [] };
  }
  if (mode.kind === 'move') return AnkicasterEngine.validateMove(state, mode.roomId, x, y);
  const def = ROOM_DEFINITIONS[mode.defId];
  if (!def) return { valid: false, errors: ['Unknown room'], warnings: [] };
  const limit = roomLimitStatus(state.rooms, mode.defId);
  if (limit.capped) return { valid: false, errors: [limit.reason || 'Limit reached'], warnings: [] };
  return validatePlacement(state, mode.defId, def.area, x, y);
}

function placementFootprint(state: FullGameState, mode: PlacementMode) {
  if (mode.kind === 'furniture_place' || mode.kind === 'furniture_move') return null;
  if (mode.kind === 'move') {
    const r = state.rooms.find(rr => rr.id === mode.roomId);
    return r ? { area: r.area, w: r.w, h: r.h, defId: r.defId } : null;
  }
  const def = ROOM_DEFINITIONS[mode.defId];
  return def ? { area: def.area, w: def.size[0], h: def.size[1], defId: def.id } : null;
}

function placementTargetFurniture(state: FullGameState, mode: PlacementMode | null | undefined) {
  if (!mode || (mode.kind !== 'furniture_place' && mode.kind !== 'furniture_move')) return null;
  const room = state.rooms.find(r => r.id === mode.roomId);
  if (!room) return null;
  const piece =
    mode.kind === 'furniture_place'
      ? (room.unplacedFurniture || []).find(u => u.id === mode.furnitureId)
      : room.furniture.find(f => f.id === mode.furnitureId);
  if (!piece) return null;
  return { room, piece };
}

export const AcademyCanvas: React.FC<AcademyCanvasProps> = ({
  state,
  onSelectRoom,
  onSelectCreature,
  onSelectEvent,
  selectedRoomId,
  onResolveHazard,
  placement,
  onPlacementConfirm,
  onFurnitureDropConfirm,
  onPlacementReject,
  onPlacementCancel,
  onPlacementAuto,
  focusRoomDefId,
  onRoomScreenBox
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<VisualWorld | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const totalDragDistRef = useRef(0);

  const [currentZoom, setCurrentZoom] = useState(2);
  /** Current ghost candidate and its rule check (drives the banner text). */
  const [candidate, setCandidate] = useState<{ x: number; y: number; check: PlacementCheck } | null>(null);
  const [furnCandidate, setFurnCandidate] = useState<DropValidationResult | null>(null);
  const [hoverTip, setHoverTip] = useState<{ x: number; y: number; text: string } | null>(null);
  const placementRef = useRef<PlacementMode | null | undefined>(placement);
  placementRef.current = placement;

  // Latest props for the async Pixi init (the add-on hydrates the save while Pixi is starting)
  const latestRef = useRef({ state, selectedRoomId });
  latestRef.current = { state, selectedRoomId };
  const focusRef = useRef<string | null>(null);
  focusRef.current = focusRoomDefId || null;
  const boxCbRef = useRef(onRoomScreenBox);
  boxCbRef.current = onRoomScreenBox;

  /**
   * Size the canvas so its backing store maps 1:1 onto device pixels and sits on a whole
   * device pixel. Otherwise the browser resamples the whole canvas (blurry text) at
   * fractional DPRs such as 1.25 / 1.5 (common for Anki on Windows).
   */
  const fitCanvasToDevicePixels = useCallback(() => {
    const app = appRef.current;
    const container = containerRef.current;
    const world = worldRef.current;
    if (!app || !container || !app.renderer) return;
    const dpr = window.devicePixelRatio || 1;
    if (app.renderer.resolution !== dpr) app.renderer.resolution = dpr;
    const w = Math.floor(container.clientWidth * dpr) / dpr;
    const h = Math.floor(container.clientHeight * dpr) / dpr;
    if (w <= 0 || h <= 0) return;
    app.renderer.resize(w, h);
    const canvas = app.canvas as HTMLCanvasElement;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    canvas.style.transform = '';
    const r = canvas.getBoundingClientRect();
    const fx = ((r.left + window.scrollX) * dpr) % 1;
    const fy = ((r.top + window.scrollY) * dpr) % 1;
    if (fx > 0.001 || fy > 0.001) canvas.style.transform = `translate(${-fx / dpr}px, ${-fy / dpr}px)`;
    if (world) {
      world.setPixelRatio(dpr);
      world.camera.setViewportSize(w, h);
    }
  }, []);

  // Initialize Pixi Application
  useEffect(() => {
    let isMounted = true;
    const container = containerRef.current;
    if (!container) return;

    const world = new VisualWorld();
    worldRef.current = world;
    const unsubPreview = registerVisualPreviewListener((type, roomId) => {
      const targetId = roomId ?? latestRef.current.state.rooms.find(r => r.defId === 'entrance_hall')?.id ?? 1;
      world.eventDispatcher.triggerPreview(type, targetId, world.clockMs);
      if (type === 'day_tick_paid') {
        world.veilRippleUntilMs = world.clockMs + 1500;
      } else if (type === 'day_tick_unpaid') {
        world.veilDimUntilMs = world.clockMs + 1000;
      }
      world.renderAtmosphereAndLighting();
      world.renderEventVignettes();
    });

    const app = new Application();
    appRef.current = app;
    let tick: (() => void) | null = null;
    let onVis: (() => void) | null = null;
    let onWinFocus: (() => void) | null = null;
    let clockInterval: ReturnType<typeof setInterval> | null = null;

    async function initPixi() {
      if (!container) return;
      await app.init({
        width: Math.max(1, container.clientWidth),
        height: Math.max(1, container.clientHeight),
        antialias: false,
        // Render at the device pixel ratio (Anki on Windows/HiDPI is often 1.25-2x)
        resolution: window.devicePixelRatio || 1,
        autoDensity: true,
        roundPixels: true,
        backgroundAlpha: 0,
        preference: 'webgl'
      });

      if (!isMounted) {
        app.destroy(true);
        return;
      }

      container.appendChild(app.canvas);
      (app.canvas as HTMLCanvasElement).style.display = 'block';
      app.stage.addChild(world.rootContainer);
      fitCanvasToDevicePixels();
      // Default to Home on Entrance Hall
      world.camera.home(castleCellToWorldX(4), world.groundY);
      setCurrentZoom(world.camera.zoom);

      // Use the LATEST state: an add-on save may have loaded while Pixi was initialising
      world.setSnapshot(latestRef.current.state, latestRef.current.selectedRoomId);

      // One ticker. The listener is removed on unmount so a re-mount cannot stack another.
      // The frame is derived from performance.now() inside VisualWorld, and a focus return is clamped.
      let lastNow = performance.now();
      let focusedId: string | null = null;
      let lastBoxKey = '';
      onVis = () => {
        const now = performance.now();
        lastNow = now;
        world.consumeTime(0, now);
        world.choreographer.consumeTime(0, now);
        world.refreshClock(new Date());
      };
      onWinFocus = () => {
        world.refreshClock(new Date());
      };
      document.addEventListener('visibilitychange', onVis);
      window.addEventListener('focus', onWinFocus);
      clockInterval = setInterval(() => {
        world.refreshClock(new Date());
      }, 60_000);
      tick = () => {
        const now = performance.now();
        let delta = now - lastNow;
        lastNow = now;
        if (document.visibilityState === 'hidden') return;
        if (!Number.isFinite(delta) || delta < 0) delta = 0;
        if (delta > 250) delta = 250;
        if ((window.devicePixelRatio || 1) !== app.renderer.resolution) fitCanvasToDevicePixels();
        world.update(delta, now);
        const id = focusRef.current;
        if (id !== focusedId) {
          const ready = !id || world.ensureRoomVisible(id);
          if (ready) {
            focusedId = id;
            if (!id) {
              lastBoxKey = '';
              boxCbRef.current?.(null);
            }
          }
        }
        if (id && focusedId === id) {
          const b = world.roomScreenBox(id);
          const canvas = app.canvas as HTMLCanvasElement;
          const r = canvas.getBoundingClientRect();
          const box = b ? { left: r.left + b.left, top: r.top + b.top, width: b.width, height: b.height } : null;
          const key = box ? `${Math.round(box.left)}:${Math.round(box.top)}:${Math.round(box.width)}:${Math.round(box.height)}` : '';
          if (key !== lastBoxKey) {
            lastBoxKey = key;
            boxCbRef.current?.(box);
          }
        }
      };
      app.ticker.add(tick);
    }

    initPixi();

    return () => {
      isMounted = false;
      unsubPreview();
      if (tick) {
        try { app.ticker.remove(tick); } catch { /* app already destroyed */ }
        tick = null;
      }
      if (onVis) document.removeEventListener('visibilitychange', onVis);
      if (onWinFocus) window.removeEventListener('focus', onWinFocus);
      if (clockInterval) clearInterval(clockInterval);
      try { app.destroy(true); } catch { /* not initialised yet */ }
      appRef.current = null;
      worldRef.current = null;
    };
  }, []);

  // Update snapshot when state or selection changes
  useEffect(() => {
    if (worldRef.current) {
      worldRef.current.setSnapshot(state, selectedRoomId);
    }
  }, [state, selectedRoomId]);

  // Placement mode: seed the ghost (auto spot for Build, target room/spot for Furniture), clear it when the mode ends
  const placementKey = placement
    ? placement.kind === 'build'
      ? `b:${placement.defId}`
      : placement.kind === 'move'
      ? `m:${placement.roomId}`
      : placement.kind === 'furniture_place'
      ? `fp:${placement.roomId}:${placement.furnitureId}`
      : `fm:${placement.roomId}:${placement.furnitureId}`
    : '';
  useEffect(() => {
    const world = worldRef.current;
    if (!placement) {
      setCandidate(null);
      setFurnCandidate(null);
      world?.setGhost(null);
      world?.setFurnitureGhost(null);
      return;
    }
    if (placement.kind === 'furniture_place' || placement.kind === 'furniture_move') {
      setCandidate(null);
      world?.setGhost(null);
      world?.ensureRoomIdVisible(placement.roomId);
      const info = placementTargetFurniture(state, placement);
      if (!info) {
        setFurnCandidate(null);
        world?.setFurnitureGhost(null);
        return;
      }
      if (placement.kind === 'furniture_move') {
        const cur = resolveFurniturePosition(info.room, { ...info.piece, damaged: !!info.piece.damaged });
        showFurnitureCandidate({
          x: cur.x,
          floor: cur.floor,
          plane: cur.plane,
          wallY: cur.wallY,
          tableId: cur.tableId,
          markIndex: cur.markIndex
        });
      } else {
        const spot = findFirstValidFurnitureDrop(info.room, state.rooms, info.piece.defId);
        if (spot) {
          showFurnitureCandidate({
            x: spot.x,
            floor: spot.floor,
            plane: spot.plane,
            wallY: spot.wallY,
            tableId: spot.tableId,
            markIndex: spot.markIndex
          });
        } else {
          showFurnitureCandidate({
            x: snapFurnitureX(info.room.w * 32),
            floor: piecePlane(info.piece.defId) === 'ceiling' ? Math.max(0, info.room.h - 1) : 0
          });
        }
      }
      return;
    }
    setFurnCandidate(null);
    world?.setFurnitureGhost(null);
    if (placement.kind === 'build') {
      const spot = findAutoPlacement(state, placement.defId);
      if (spot) showCandidate(spot.x, spot.y);
      else setCandidate(null);
    } else {
      setCandidate(null);
      world?.setGhost(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [placementKey]);

  // Esc cancels placement
  useEffect(() => {
    if (!placement) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); onPlacementCancel?.(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [placementKey, onPlacementCancel]);

  function showCandidate(x: number, y: number) {
    const mode = placementRef.current;
    const world = worldRef.current;
    const st = latestRef.current.state;
    if (!mode) return;
    const fp = placementFootprint(st, mode);
    if (!fp) return;
    const check = checkPlacementCandidate(st, mode, x, y);
    const grid = getGridSize(st);
    setCandidate(prev => (prev && prev.x === x && prev.y === y && prev.check.valid === check.valid && prev.check.errors[0] === check.errors[0] && prev.check.warnings[0] === check.warnings[0] ? prev : { x, y, check }));
    world?.setGhost({
      area: fp.area, x, y: fp.area === 'grounds' ? 0 : y, w: fp.w, h: fp.h, valid: check.valid,
      plotCount: grid.plotCount, castleFloors: grid.castleFloors,
      ignoreRoomId: mode.kind === 'move' ? mode.roomId : undefined
    });
  }

  function showFurnitureCandidate(target: DropTargetInput): DropValidationResult | null {
    const mode = placementRef.current;
    const world = worldRef.current;
    const st = latestRef.current.state;
    const info = placementTargetFurniture(st, mode);
    if (!mode || !info || (mode.kind !== 'furniture_place' && mode.kind !== 'furniture_move')) return null;
    const excludeFurnitureId = mode.kind === 'furniture_move' ? mode.furnitureId : undefined;
    const check = validateFurnitureDrop(info.room, st.rooms, info.piece.defId, target, { excludeFurnitureId });
    setFurnCandidate(check);
    world?.setFurnitureGhost({
      roomId: info.room.id,
      furnitureId: info.piece.id,
      defId: info.piece.defId,
      x: check.x,
      floor: check.floor,
      plane: check.plane,
      wallY: check.wallY,
      valid: check.valid,
      collidingIds: check.collidingIds,
      tableId: check.tableId,
      markIndex: check.markIndex
    });
    return check;
  }

  function furnitureCandidateAtPointer(clientX: number, clientY: number): DropTargetInput | null {
    const container = containerRef.current;
    const world = worldRef.current;
    const mode = placementRef.current;
    const info = placementTargetFurniture(latestRef.current.state, mode);
    if (!container || !world || !mode || !info) return null;
    const rect = container.getBoundingClientRect();
    return world.furnitureTargetAt(clientX - rect.left, clientY - rect.top, info.room.id, info.piece.defId);
  }

  function candidateAtPointer(clientX: number, clientY: number) {
    const container = containerRef.current;
    const world = worldRef.current;
    const mode = placementRef.current;
    if (!container || !world || !mode) return null;
    const fp = placementFootprint(latestRef.current.state, mode);
    if (!fp) return null;
    const rect = container.getBoundingClientRect();
    return world.gridAnchorAt(clientX - rect.left, clientY - rect.top, fp.area, fp.w, fp.h);
  }

  // Window resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const ro = new ResizeObserver(() => fitCanvasToDevicePixels());
    ro.observe(container);
    window.addEventListener('resize', fitCanvasToDevicePixels);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', fitCanvasToDevicePixels);
    };
  }, [fitCanvasToDevicePixels]);

  // Mouse / Pointer Controls: Pan, Click Room, Zoom Wheel
  const handlePointerDown = (e: React.PointerEvent) => {
    isDraggingRef.current = true;
    dragStartPosRef.current = { x: e.clientX, y: e.clientY };
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    totalDragDistRef.current = 0;
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    // Hover on Messenger Owl, creature, or construction site (Addendum 5.6 & 8.1/8.3)
    if (!placementRef.current && !isDraggingRef.current && containerRef.current && worldRef.current) {
      const rect = containerRef.current.getBoundingClientRect();
      const px = e.clientX - rect.left;
      const py = e.clientY - rect.top;
      const owlHit = worldRef.current.hitTestMessengerOwl(px, py);
      if (owlHit) {
        setHoverTip({ x: px, y: py, text: 'Messenger Owl · Click to view event' });
      } else {
        const cHit = worldRef.current.hitTestCreature(px, py);
        if (cHit) {
          const text = creatureHoverText(cHit);
          setHoverTip({ x: px, y: py, text });
        } else {
          const hit = worldRef.current.hitTestRoom(px, py);
          const text = hit && hit.state === 'site' ? (hit.buildPaused ? `Paused · ${reviewsToGoText(hit)}` : reviewsToGoText(hit)) : null;
          setHoverTip(prev => (text ? { x: px, y: py, text } : prev ? null : prev));
        }
      }
    } else if (hoverTip) {
      setHoverTip(null);
    }
    if (placementRef.current && !(isDraggingRef.current && totalDragDistRef.current > 6)) {
      if (placementRef.current.kind === 'furniture_place' || placementRef.current.kind === 'furniture_move') {
        const ft = furnitureCandidateAtPointer(e.clientX, e.clientY);
        if (ft) showFurnitureCandidate(ft);
      } else {
        const c = candidateAtPointer(e.clientX, e.clientY);
        if (c) showCandidate(c.x, c.y);
      }
    }
    if (!isDraggingRef.current || !worldRef.current) return;
    const dx = e.clientX - lastMousePosRef.current.x;
    const dy = e.clientY - lastMousePosRef.current.y;
    lastMousePosRef.current = { x: e.clientX, y: e.clientY };
    totalDragDistRef.current += Math.abs(dx) + Math.abs(dy);

    worldRef.current.camera.pan(dx, dy);
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    isDraggingRef.current = false;
  };

  const handleClick = (e: React.MouseEvent) => {
    // If the user dragged more than 6 screen px, it was a pan gesture, not a click
    if (totalDragDistRef.current > 6) {
      return;
    }

    const container = containerRef.current;
    const world = worldRef.current;
    if (!container || !world) return;

    // Placement mode: a click confirms a valid ghost (an invalid one explains why)
    if (placementRef.current) {
      if (placementRef.current.kind === 'furniture_place' || placementRef.current.kind === 'furniture_move') {
        const ft = furnitureCandidateAtPointer(e.clientX, e.clientY);
        if (!ft) return;
        const check = showFurnitureCandidate(ft);
        if (!check) return;
        if (check.valid) {
          onFurnitureDropConfirm?.({
            x: check.x,
            floor: check.floor,
            plane: check.plane,
            wallY: check.wallY,
            tableId: check.tableId,
            markIndex: check.markIndex
          });
        } else if (check.error) {
          onPlacementReject?.(check.error);
        }
        return;
      }
      const c = candidateAtPointer(e.clientX, e.clientY);
      if (!c) return;
      showCandidate(c.x, c.y);
      const check = checkPlacementCandidate(latestRef.current.state, placementRef.current, c.x, c.y);
      if (check.valid) onPlacementConfirm?.(c.x, c.y);
      else if (check.errors[0]) onPlacementReject?.(check.errors[0]);
      return;
    }

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const owlHit = world.hitTestMessengerOwl(clickX, clickY);
    if (owlHit && onSelectEvent) {
      onSelectEvent(owlHit.eventId);
      return;
    }

    const clickedCreature = world.hitTestCreature(clickX, clickY);
    const clickedRoom = world.hitTestRoom(clickX, clickY);
    if (clickedCreature && onSelectCreature && (clickedCreature.status === 'loose' || clickedCreature.unhomed || !clickedRoom)) {
      const inst = latestRef.current.state.creatures.find(cr => cr.id === clickedCreature.creatureId);
      if (inst) {
        onSelectCreature(inst);
        return;
      }
    }

    if (clickedRoom) {
      onSelectRoom(clickedRoom);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const world = worldRef.current;
    if (!world) return;

    if (e.deltaY < 0) {
      world.camera.zoomIn();
    } else {
      world.camera.zoomOut();
    }
    setCurrentZoom(world.camera.zoom);
  };

  // Toolbar actions
  const handleZoomIn = () => {
    if (worldRef.current) {
      worldRef.current.camera.zoomIn();
      setCurrentZoom(worldRef.current.camera.zoom);
    }
  };

  const handleZoomOut = () => {
    if (worldRef.current) {
      worldRef.current.camera.zoomOut();
      setCurrentZoom(worldRef.current.camera.zoom);
    }
  };

  const handleHome = () => {
    if (worldRef.current) {
      worldRef.current.camera.home(castleCellToWorldX(4), worldRef.current.groundY);
      setCurrentZoom(worldRef.current.camera.zoom);
    }
  };

  const handleFit = () => {
    if (worldRef.current) {
      worldRef.current.camera.fit(worldRef.current.totalWorldWidth, worldRef.current.groundY + 80);
      setCurrentZoom(worldRef.current.camera.zoom);
    }
  };

  return (
    <div className="relative w-full h-[640px] md:h-[720px] rounded-2xl overflow-hidden border border-amber-900/40 shadow-2xl bg-slate-950 select-none">
      {/* Pixi Canvas Mounting Point */}
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={e => { setHoverTip(null); handleClick(e); }}
        onPointerLeave={() => setHoverTip(null)}
        onContextMenu={e => {
          if (placementRef.current) { e.preventDefault(); onPlacementCancel?.(); }
        }}
        onWheel={handleWheel}
        data-placing={placement ? placement.kind : undefined}
        style={placement ? { cursor: 'crosshair' } : undefined}
      />

      {/* Placement banner: what is being placed, whether the spot is valid, how to confirm/cancel */}
      {placement && (placement.kind === 'furniture_place' || placement.kind === 'furniture_move') && (() => {
        const info = placementTargetFurniture(state, placement);
        const rDef = info ? ROOM_DEFINITIONS[info.room.defId] : undefined;
        const fDef = info ? FURNITURE_DEFINITIONS[info.piece.defId] : undefined;
        const plane = info ? piecePlane(info.piece.defId) : 'floor';
        const planeLabel = plane === 'floor' ? 'Floor' : plane === 'wall' ? 'Wall' : 'Ceiling';
        const ok = !!furnCandidate?.valid;
        const itemName = fDef?.name || info?.piece.slotKind.replace(/^required:/, '').replace(/_/g, ' ') || 'Furniture';
        const msg = !furnCandidate
          ? 'Point inside the room to place'
          : ok
            ? (furnCandidate.tableId != null ? 'Snapping to Long Table seat' : 'Valid spot')
            : (furnCandidate.error || 'Cannot place there');
        return (
          <div
            data-testid="placement-banner"
            data-valid={ok ? 'true' : 'false'}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900/95 border border-amber-500/40 rounded-xl px-4 py-2.5 shadow-2xl text-[13px] max-w-[92%]"
          >
            {placement.kind === 'furniture_move' ? <Move className="w-4 h-4 text-amber-300 shrink-0" /> : <Hammer className="w-4 h-4 text-amber-300 shrink-0" />}
            <div className="min-w-0">
              <div className="font-bold text-amber-200">
                {placement.kind === 'furniture_move' ? 'Moving' : 'Placing'} {itemName}
                <span className="text-slate-400 font-normal">
                  {' '}· {rDef?.name || info?.room.defId || 'Room'} · {planeLabel}
                  {info && info.room.h > 1 && furnCandidate ? ` · Floor ${furnCandidate.floor + 1}` : ''}
                </span>
              </div>
              <div className={ok ? 'text-emerald-300' : 'text-rose-300'} data-testid="placement-status">
                {ok ? '✓ ' : '✕ '}{msg}
              </div>
              <div className="text-slate-500 text-[11px]">Click inside room to place · Esc or right-click to cancel · drag to pan</div>
            </div>
            <button onClick={() => onPlacementCancel?.()} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Cancel placement">
              <XIcon className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        );
      })()}

      {placement && (placement.kind === 'build' || placement.kind === 'move') && (() => {
        const fp = placementFootprint(state, placement);
        const def = fp ? ROOM_DEFINITIONS[fp.defId] : undefined;
        const ok = !!candidate?.check.valid;
        const msg = !candidate
          ? (placement.kind === 'move' ? 'Point at a new spot' : 'No free valid space: move or demolish something first')
          : ok
            ? (candidate.check.warnings[0] || 'Valid spot')
            : candidate.check.errors[0];
        return (
          <div
            data-testid="placement-banner"
            data-valid={ok ? 'true' : 'false'}
            className="absolute bottom-4 left-1/2 -translate-x-1/2 z-30 flex items-center gap-3 bg-slate-900/95 border border-amber-500/40 rounded-xl px-4 py-2.5 shadow-2xl text-[13px] max-w-[92%]"
          >
            {placement.kind === 'move' ? <Move className="w-4 h-4 text-amber-300 shrink-0" /> : <Hammer className="w-4 h-4 text-amber-300 shrink-0" />}
            <div className="min-w-0">
              <div className="font-bold text-amber-200">
                {placement.kind === 'move' ? 'Moving' : 'Placing'} {def?.name}
                {placement.kind === 'build' && def ? <span className="text-slate-400 font-normal"> · {formatMaterialCost(def.cost)} · {def.size.join('×')}</span> : null}
              </div>
              <div className={ok ? (candidate?.check.warnings.length ? 'text-amber-300' : 'text-emerald-300') : 'text-rose-300'} data-testid="placement-status">
                {ok ? '✓ ' : '✕ '}{msg}
              </div>
              <div className="text-slate-500 text-[11px]">Click to confirm · Esc or right-click to cancel · drag to pan</div>
            </div>
            {placement.kind === 'build' && onPlacementAuto && (
              <button onClick={onPlacementAuto} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800" title="Let the engine pick the first free valid spot">
                <Wand2 className="w-3.5 h-3.5" /> Auto
              </button>
            )}
            <button onClick={() => onPlacementCancel?.()} className="shrink-0 flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-700 text-slate-300 hover:bg-slate-800" aria-label="Cancel placement">
              <XIcon className="w-3.5 h-3.5" /> Cancel
            </button>
          </div>
        );
      })()}

      {hoverTip && (
        <div
          data-testid="site-hover"
          className="absolute z-30 pointer-events-none bg-slate-900/95 border border-emerald-500/40 text-emerald-200 text-[12px] font-semibold rounded-lg px-2.5 py-1 shadow-lg"
          style={{ left: hoverTip.x + 14, top: hoverTip.y + 14 }}
        >
          {hoverTip.text}
        </div>
      )}

      {/* Floating Canvas Navigation Toolbar */}
      <div className="absolute top-4 right-4 z-20 flex items-center gap-1.5 bg-slate-900/90 backdrop-blur-md p-1.5 rounded-xl border border-amber-500/30 shadow-lg text-slate-200">
        <button
          onClick={handleZoomIn}
          title="Zoom In (+)"
          className="p-2 hover:bg-slate-800 rounded-lg text-amber-400 hover:text-amber-300 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <div className="px-2 font-mono text-xs font-bold text-amber-300">
          {currentZoom * 50}%
        </div>
        <button
          onClick={handleZoomOut}
          title="Zoom Out (-)"
          className="p-2 hover:bg-slate-800 rounded-lg text-amber-400 hover:text-amber-300 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-slate-700 mx-1" />
        <button
          onClick={handleHome}
          title="Home (Entrance Hall)"
          className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
        >
          <Home className="w-3.5 h-3.5 text-amber-400" />
          <span>Home</span>
        </button>
        <button
          onClick={handleFit}
          title="Fit All"
          className="flex items-center gap-1 px-2.5 py-1.5 hover:bg-slate-800 rounded-lg text-xs font-medium text-slate-300 hover:text-white transition-colors"
        >
          <Maximize2 className="w-3.5 h-3.5 text-amber-400" />
          <span>Fit</span>
        </button>
      </div>

      {/* Academy Title and Subtitle Watermark on top-left */}
      <div className="absolute top-4 left-4 z-20 pointer-events-none bg-slate-900/80 backdrop-blur-sm px-3.5 py-2 rounded-xl border border-slate-800 shadow">
        <h2 className="text-sm font-bold tracking-wider text-amber-300 uppercase">
          {state.wizard.academyName}
        </h2>
        <p className="text-[11px] text-slate-400">
          Side-On Living Castle · 64×48 Art Pixels · Integer Zoom
        </p>
      </div>
    </div>
  );
};
