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
import { Application } from 'pixi.js';
import { FullGameState, PlacedRoom } from '../types/ankicaster';
import { VisualWorld } from './world/VisualWorld';
import { castleCellToWorldX } from './layout/gridToWorld';
import { ZoomIn, ZoomOut, Maximize2, Home, Compass } from 'lucide-react';

interface AcademyCanvasProps {
  state: FullGameState;
  onSelectRoom: (room: PlacedRoom) => void;
  selectedRoomId?: number;
  onResolveHazard?: (roomId: number, method: 'warder' | 'spell') => void;
}

export const AcademyCanvas: React.FC<AcademyCanvasProps> = ({
  state,
  onSelectRoom,
  selectedRoomId,
  onResolveHazard
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const appRef = useRef<Application | null>(null);
  const worldRef = useRef<VisualWorld | null>(null);
  const isDraggingRef = useRef(false);
  const dragStartPosRef = useRef({ x: 0, y: 0 });
  const lastMousePosRef = useRef({ x: 0, y: 0 });
  const totalDragDistRef = useRef(0);

  const [currentZoom, setCurrentZoom] = useState(2);

  // Latest props for the async Pixi init (the add-on hydrates the save while Pixi is starting)
  const latestRef = useRef({ state, selectedRoomId });
  latestRef.current = { state, selectedRoomId };

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

    const app = new Application();
    appRef.current = app;

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

      // Animation ticker loop
      let lastTime = performance.now();
      app.ticker.add(() => {
        const now = performance.now();
        const deltaMs = now - lastTime;
        lastTime = now;
        // Follow DPR changes (moving the Anki window between monitors, page zoom)
        if ((window.devicePixelRatio || 1) !== app.renderer.resolution) fitCanvasToDevicePixels();
        world.update(deltaMs);
      });
    }

    initPixi();

    return () => {
      isMounted = false;
      app.destroy(true);
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

    const rect = container.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const clickY = e.clientY - rect.top;

    const clickedRoom = world.hitTestRoom(clickX, clickY);
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
        onClick={handleClick}
        onWheel={handleWheel}
      />

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
