/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Castle Cross-Section & Grounds Simulation Grid
 * Implements GDD Section 15 & 16 (Quality tiers, reachability, room stats, occupants)
 * Laid out on a true CSS grid using exact x, y, w, h with Floor 0 at bottom and multi-floor spanning.
 */

import React from 'react';
import { PlacedRoom, FullGameState } from '../types/ankicaster';
import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../data/content';
import { calculateRoomQuality, calculateRoomEfficiency } from '../utils/formulas';
import { Wrench, Sparkles, AlertTriangle, Users, ShieldAlert, Sparkle } from 'lucide-react';

interface CastleGridProps {
  state: FullGameState;
  onSelectRoom: (room: PlacedRoom) => void;
  selectedRoomId?: number;
  onResolveHazard?: (roomId: number, method: 'warder' | 'spell') => void;
}

export const CastleGrid: React.FC<CastleGridProps> = ({
  state,
  onSelectRoom,
  selectedRoomId,
  onResolveHazard
}) => {
  const { rooms, characters, creatures } = state;

  const castleRooms = rooms.filter(r => r.area === 'castle');
  const groundPlots = rooms.filter(r => r.area === 'grounds');

  // Determine vertical floor bounds (Floors 0 to maxFloor)
  const maxFloor = Math.max(2, ...castleRooms.map(r => r.y + r.h - 1));
  const totalFloors = maxFloor + 1; // e.g. 3 floors: 0, 1, 2
  const totalCols = 7; // Columns 0 to 6

  const getOccupants = (roomId: number) => {
    return characters.filter(c => c.bedRoomId === roomId || c.seatRoomId === roomId || c.workplaceRoomId === roomId);
  };

  return (
    <div className="relative w-full overflow-x-auto p-4 md:p-6 bg-gradient-to-b from-indigo-950/40 via-slate-900/80 to-slate-950 flex flex-col items-center select-none rounded-2xl border border-amber-900/30 shadow-2xl">
      {/* Academy Title and Architectural Subhead */}
      <div className="text-center mb-5">
        <h2 className="text-sm md:text-base font-bold tracking-widest text-amber-300 uppercase">
          {state.wizard.academyName}
        </h2>
        <p className="text-xs text-slate-400 mt-1">
          Architectural Cross-Section · Real CSS Grid · Floor 0 Ground Foundation to High Spire
        </p>
      </div>

      {/* Main Castle Construction Structure on True CSS Grid */}
      <div className="relative w-full max-w-5xl flex gap-3 items-stretch">
        {/* Floor Elevation Labels on Left */}
        <div
          className="flex flex-col justify-between py-2 text-xs font-mono font-bold text-slate-400 select-none w-10 text-right pr-2 border-r border-slate-800"
          style={{ minHeight: `${totalFloors * 130}px` }}
        >
          {Array.from({ length: totalFloors }, (_, i) => totalFloors - 1 - i).map(f => (
            <div key={`floor-lbl-${f}`} className="flex items-center justify-end h-full">
              <span className="bg-slate-900/80 px-1.5 py-0.5 rounded border border-slate-800 text-amber-400/90 shadow">
                F{f}
              </span>
            </div>
          ))}
        </div>

        {/* 7-Column True CSS Grid Container */}
        <div className="relative flex-1">
          {/* Subtle architectural background cell outlines */}
          <div
            className="absolute inset-0 grid grid-cols-7 gap-3 pointer-events-none opacity-20"
            style={{
              gridTemplateRows: `repeat(${totalFloors}, minmax(130px, 1fr))`
            }}
          >
            {Array.from({ length: totalFloors * totalCols }).map((_, idx) => (
              <div
                key={`cell-bg-${idx}`}
                className="border border-dashed border-slate-700/60 rounded-xl"
              />
            ))}
          </div>

          {/* Actual Castle Rooms positioned on (x, y, w, h) */}
          <div
            className="relative grid grid-cols-7 gap-3 min-w-[750px]"
            style={{
              gridTemplateRows: `repeat(${totalFloors}, minmax(130px, 1fr))`
            }}
          >
            {castleRooms.map(room => {
              const def = ROOM_DEFINITIONS[room.defId];
              const { q, tier } = calculateRoomQuality(room);
              const eff = calculateRoomEfficiency(room);
              const occupants = getOccupants(room.id);
              const isSelected = selectedRoomId === room.id;

              // Row mapping: Floor 2 = row 1, Floor 1 = row 2, Floor 0 = row 3
              const rowStart = totalFloors - (room.y + room.h - 1);
              const rowSpan = room.h;
              const colStart = room.x + 1;
              const colSpan = room.w;

              // Aesthetic styling based on Quality Tier
              const tierBg =
                tier === 'splendid'
                  ? 'bg-gradient-to-b from-amber-900/60 via-purple-950/70 to-slate-900 border-amber-400/90 shadow-amber-500/20 shadow-lg'
                  : tier === 'fine'
                  ? 'bg-gradient-to-b from-slate-800 via-indigo-950/60 to-slate-900 border-indigo-400/70 shadow-md'
                  : tier === 'cozy'
                  ? 'bg-gradient-to-b from-amber-950/40 to-slate-900 border-amber-600/50'
                  : tier === 'plain'
                  ? 'bg-slate-900/95 border-slate-600/60'
                  : 'bg-slate-950/95 border-stone-700/50';

              return (
                <div
                  key={room.id}
                  onClick={() => onSelectRoom(room)}
                  style={{
                    gridColumnStart: colStart,
                    gridColumnEnd: `span ${colSpan}`,
                    gridRowStart: rowStart,
                    gridRowEnd: `span ${rowSpan}`
                  }}
                  className={`relative ${tierBg} rounded-xl border-2 p-3 flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.01] hover:border-amber-400/90 shadow-md ${
                    isSelected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950' : ''
                  }`}
                >
                  {/* Top Room Header: Name on its own line to prevent truncation */}
                  <div className="flex flex-col gap-1 pb-1 border-b border-slate-800/60">
                    <div className="flex items-center justify-between text-xs text-amber-300 font-mono">
                      <span className="flex items-center gap-1.5">
                        <span className="font-bold text-amber-400">Q{Math.round(q)}</span>
                        <span className="text-slate-400">({tier})</span>
                      </span>
                      {room.level > 1 && (
                        <span className="bg-amber-500/20 text-amber-300 px-1.5 py-0.5 rounded font-bold border border-amber-500/30 text-xs">
                          Level {room.level}
                        </span>
                      )}
                    </div>
                    <div className="font-bold text-slate-100 text-sm leading-snug break-words">
                      {def?.name || room.defId}
                    </div>
                  </div>

                  {/* Active Hazard Banner */}
                  {room.hazard && (
                    <div className="my-1.5 p-2 bg-rose-950/90 border border-rose-500/60 rounded-lg flex items-center justify-between text-xs text-rose-200 shadow z-20">
                      <div className="flex items-center gap-1.5 truncate">
                        <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        <span className="font-bold truncate">{room.hazard.name}</span>
                      </div>
                      {onResolveHazard && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            onResolveHazard(room.id, 'spell');
                          }}
                          className="px-2 py-0.5 bg-rose-600 hover:bg-rose-500 text-white rounded font-bold text-xs shadow shrink-0 ml-1"
                        >
                          Dispel (30m)
                        </button>
                      )}
                    </div>
                  )}

                  {/* Construction Overlay */}
                  {room.state === 'site' && (
                    <div className="absolute inset-0 bg-slate-950/90 backdrop-blur-xs rounded-xl flex flex-col items-center justify-center p-3 text-center z-10">
                      <Wrench className="w-5 h-5 text-amber-400 animate-bounce mb-1" />
                      <div className="text-xs font-bold text-amber-200">Constructing Room...</div>
                      <div className="text-xs text-slate-400 mt-0.5">
                        {room.buildProgress} / {room.buildRequired} reviews
                      </div>
                      <div className="w-full bg-slate-800 rounded-full h-2 mt-2 overflow-hidden border border-slate-700">
                        <div
                          className="bg-amber-400 h-full transition-all"
                          style={{
                            width: `${Math.min(100, (room.buildProgress / Math.max(1, room.buildRequired)) * 100)}%`
                          }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Room Furnishings Tag Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap py-1.5 text-xs">
                    {room.furniture.map(f => (
                      <span
                        key={f.id}
                        className={`text-xs px-2 py-0.5 rounded border ${
                          f.damaged
                            ? 'bg-red-950/70 border-red-500/50 text-red-300 line-through'
                            : 'bg-slate-800/90 border-slate-700 text-slate-200'
                        }`}
                        title={FURNITURE_DEFINITIONS[f.defId]?.name || f.defId}
                      >
                        {FURNITURE_DEFINITIONS[f.defId]?.name || f.defId}
                      </span>
                    ))}
                    {room.furniture.length === 0 && room.state === 'built' && (
                      <span className="text-xs text-slate-400 italic">Unfurnished</span>
                    )}
                  </div>

                  {/* Bottom Footer: Efficiency, Cleanliness, Occupants */}
                  <div className="flex items-center justify-between text-xs text-slate-400 border-t border-slate-800/70 pt-1.5 mt-1">
                    <span>
                      Eff: <strong className="text-emerald-300">{(eff * 100).toFixed(0)}%</strong>
                    </span>
                    <div className="flex items-center gap-2">
                      {occupants.length > 0 && (
                        <span className="flex items-center gap-1 text-amber-300 font-semibold" title="Assigned occupants">
                          <Users className="w-3.5 h-3.5" /> {occupants.length}
                        </span>
                      )}
                      <span className={room.cleanliness < 70 ? 'text-amber-400 font-bold' : 'text-slate-400'}>
                        🧼 {Math.round(room.cleanliness)}%
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Ground Level Plots (Gardens, Woodlots, Paddock, Rift Portal) */}
      <div className="w-full max-w-5xl mt-6 pt-4 border-t-2 border-emerald-950/70">
        <div className="flex items-center justify-between mb-3">
          <span className="text-xs md:text-sm font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-2">
            🌱 Sacred Grounds &amp; Outskirts ({groundPlots.length} Plots Cultivated)
          </span>
          <span className="text-xs text-slate-400">
            Produces Provisions, Herbs, Timber, and houses the Rift Gateway
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
          {groundPlots.map(plot => {
            const def = ROOM_DEFINITIONS[plot.defId];
            const isSelected = selectedRoomId === plot.id;
            return (
              <div
                key={plot.id}
                onClick={() => onSelectRoom(plot)}
                className={`p-3 rounded-xl border-2 bg-gradient-to-b from-emerald-950/40 to-slate-900 border-emerald-800/50 cursor-pointer hover:border-emerald-400 transition-all shadow ${
                  isSelected ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950' : ''
                }`}
              >
                <div className="flex items-center justify-between text-xs font-bold text-emerald-200">
                  <span>{def?.name || plot.defId}</span>
                  <span className="text-xs text-slate-400 font-mono">Outdoor</span>
                </div>
                <div className="text-xs text-slate-300 mt-1 line-clamp-2 leading-relaxed">
                  {def?.description}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
