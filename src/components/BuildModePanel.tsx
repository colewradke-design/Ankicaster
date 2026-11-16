/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Fixed left-edge Build Mode shelf panel.
 * Keeps the live castle & grounds map mounted and visible while shelving rooms
 * or picking new blueprints to place.
 */

import React, { useState } from 'react';
import { Hammer, Layers, X, AlertTriangle, PackageOpen } from 'lucide-react';
import type { FullGameState, PlacedRoom } from '../types/ankicaster';
import { CREATURE_DEFINITIONS, roomDisplayName } from '../data/content';
import { penAcceptedHabitats } from '../utils/creatures';
import type { PlacementMode } from '../visual/AcademyCanvas';
import { BuildMenuPanel } from './GamePanels';

export interface BuildModePanelProps {
  state: FullGameState;
  placement: PlacementMode | null;
  onSelectShelved: (roomId: number | null) => void;
  onPlaceNewRoom: (defId: string, area: 'castle' | 'grounds') => void;
  onAutoPlaceNewRoom: (defId: string) => void;
  onOpenDraft: () => void;
  onMoveSite?: (roomId: number, direction: -1 | 1) => void;
  onClose: () => void;
}

export const BuildModePanel: React.FC<BuildModePanelProps> = ({
  state,
  placement,
  onSelectShelved,
  onPlaceNewRoom,
  onAutoPlaceNewRoom,
  onOpenDraft,
  onMoveSite,
  onClose
}) => {
  const [tab, setTab] = useState<'shelf' | 'new'>('shelf');
  const shelved: PlacedRoom[] = state.shelvedRooms || [];
  const entranceMissing = !state.rooms.some(r => r.defId === 'entrance_hall');

  const shelvedPenIds = new Set(shelved.filter(r => penAcceptedHabitats(r.defId).length > 0).map(r => r.id));
  const creaturesInShelvedPens = (state.creatures || []).filter(
    c =>
      c.roomId !== undefined &&
      shelvedPenIds.has(c.roomId) &&
      (c.status === 'wary' || c.status === 'tamed') &&
      !CREATURE_DEFINITIONS[c.defId]?.roamsFreely
  );

  return (
    <aside
      data-testid="build-mode-panel"
      aria-label="Build Mode Shelf"
      className="fixed left-0 top-[52px] bottom-0 z-30 w-72 sm:w-80 bg-slate-900/95 backdrop-blur-md border-r border-amber-900/50 shadow-2xl flex flex-col text-slate-100"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2 px-3.5 py-2.5 border-b border-slate-800 bg-gradient-to-r from-amber-900/25 to-transparent shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <Hammer className="w-4 h-4 text-amber-400 shrink-0" />
          <h2 className="text-sm font-bold text-amber-200 truncate">Build Mode</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          data-testid="build-mode-close"
          className="flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-700 text-xs font-bold text-slate-200 hover:bg-slate-800 transition"
        >
          <X className="w-3.5 h-3.5" />
          Done
        </button>
      </div>

      {/* Mode Switch Tabs */}
      <div className="flex border-b border-slate-800 px-3 pt-2 gap-1.5 shrink-0">
        <button
          type="button"
          onClick={() => setTab('shelf')}
          data-testid="build-tab-shelf"
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-t-lg text-xs font-bold border border-b-0 transition ${
            tab === 'shelf'
              ? 'bg-slate-950/80 border-amber-500/40 text-amber-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Layers className="w-3.5 h-3.5" />
          Shelf ({shelved.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('new')}
          data-testid="build-tab-new"
          className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-t-lg text-xs font-bold border border-b-0 transition ${
            tab === 'new'
              ? 'bg-slate-950/80 border-amber-500/40 text-amber-200'
              : 'border-transparent text-slate-400 hover:text-slate-200'
          }`}
        >
          <Hammer className="w-3.5 h-3.5" />
          New Rooms
        </button>
      </div>

      {/* Independent scrolling body */}
      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        {entranceMissing && (
          <div
            data-testid="entrance-hall-shelved-warning"
            className="flex items-start gap-2 bg-amber-950/60 border border-amber-500/50 rounded-xl p-2.5 text-xs text-amber-200 leading-snug"
          >
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <span>
              <strong>Entrance Hall is on the shelf.</strong> Nothing in the castle is reachable until it is placed back on the ground floor.
            </span>
          </div>
        )}

        {tab === 'shelf' ? (
          <div className="space-y-2.5">
            {shelved.length === 0 ? (
              <div
                data-testid="shelf-empty-hint"
                className="bg-slate-950/60 border border-dashed border-slate-800 rounded-xl p-4 text-center space-y-2"
              >
                <PackageOpen className="w-6 h-6 text-amber-400/70 mx-auto" />
                <p className="text-xs text-slate-300 leading-relaxed">
                  Click any room on the map (except one holding another room above it) to lift it onto the shelf and rearrange freely.
                </p>
              </div>
            ) : (
              <>
                <p className="text-[11px] text-slate-400 leading-snug">
                  Click a shelved room to place it back on the map, or click a room on the map to lift it here.
                </p>
                <div className="space-y-2">
                  {shelved.map(r => {
                    const active = placement?.kind === 'shelved' && placement.roomId === r.id;
                    const isSite = r.state === 'site';
                    const isPen = penAcceptedHabitats(r.defId).length > 0;
                    const penCreatures = isPen
                      ? (state.creatures || []).filter(c => c.roomId === r.id && c.status !== 'loose' && c.status !== 'away')
                      : [];
                    return (
                      <button
                        key={r.id}
                        type="button"
                        data-testid={`shelf-room-${r.id}`}
                        data-shelved-def={r.defId}
                        onClick={() => onSelectShelved(active ? null : r.id)}
                        className={`w-full text-left p-2.5 rounded-xl border transition shadow-sm ${
                          active
                            ? 'bg-amber-950/50 border-amber-400 text-amber-100 ring-1 ring-amber-400/40'
                            : 'bg-slate-950/80 border-slate-800 hover:border-amber-500/40 text-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-bold text-xs truncate">{roomDisplayName(r)}</span>
                          <span className="text-[11px] font-mono text-slate-400 shrink-0">
                            Lv {r.level || 1} · {r.w}×{r.h}
                          </span>
                        </div>
                        <div className="flex items-center justify-between gap-2 mt-1 text-[11px] text-slate-400">
                          <span className="capitalize">{r.area}</span>
                          {isSite ? (
                            <span className="text-sky-300 font-mono">
                              Site · {r.buildProgress}/{r.buildRequired} revs
                            </span>
                          ) : r.furniture.length > 0 ? (
                            <span>{r.furniture.length} fixture{r.furniture.length === 1 ? '' : 's'}</span>
                          ) : null}
                        </div>
                        {penCreatures.length > 0 && (
                          <div className="mt-1 text-[11px] text-amber-300/90">
                            Holds {penCreatures.length} creature{penCreatures.length === 1 ? '' : 's'}
                          </div>
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}

            {creaturesInShelvedPens.length > 0 && (
              <div
                data-testid="shelved-pen-creatures-warning"
                className="flex items-start gap-2 bg-rose-950/50 border border-rose-500/40 rounded-xl p-2.5 text-[11px] text-rose-200 leading-snug"
              >
                <AlertTriangle className="w-3.5 h-3.5 text-rose-400 shrink-0 mt-0.5" />
                <span>
                  Leaving Build mode while a pen is still on the shelf will let{' '}
                  <strong>{creaturesInShelvedPens.length}</strong> creature{creaturesInShelvedPens.length === 1 ? '' : 's'} loose!
                </span>
              </div>
            )}
          </div>
        ) : (
          <BuildMenuPanel
            state={state}
            onPlaceRoom={(defId, area) => onPlaceNewRoom(defId, area)}
            onAutoPlace={onAutoPlaceNewRoom}
            onOpenDraft={onOpenDraft}
            onMoveSite={onMoveSite}
            compact
          />
        )}
      </div>
    </aside>
  );
};
