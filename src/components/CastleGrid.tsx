/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Interactive Castle Cross-Section & Grounds Simulation Grid
 * Implements GDD Section 15 & 16 (Quality tiers, reachability, room stats, occupants)
 */

import React from 'react';
import { PlacedRoom, FullGameState } from '../types/ankicaster';
import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS } from '../data/content';
import { calculateRoomQuality, calculateRoomEfficiency } from '../utils/formulas';
import { Wrench, Sparkles, AlertCircle, Ban, Bed, Users } from 'lucide-react';

interface CastleGridProps {
  state: FullGameState;
  onSelectRoom: (room: PlacedRoom) => void;
  selectedRoomId?: number;
}

export const CastleGrid: React.FC<CastleGridProps> = ({ state, onSelectRoom, selectedRoomId }) => {
  const { rooms, characters, creatures } = state;

  // Render ground outdoor plots and vertical castle columns
  const castleRooms = rooms.filter(r => r.area === 'castle');
  const groundPlots = rooms.filter(r => r.area === 'grounds');

  const getOccupants = (roomId: number) => {
    return characters.filter(c => c.bedRoomId === roomId || c.seatRoomId === roomId || c.workplaceRoomId === roomId);
  };

  const getCreatures = (roomId: number) => {
    return creatures.filter(c => c.roomId === roomId);
  };

  return (
    <div className="relative w-full overflow-x-auto p-6 bg-gradient-to-b from-indigo-950/40 via-slate-900/80 to-slate-950 flex flex-col items-center select-none min-h-[460px]">
      {/* Sky Aura based on Veil Strength */}
      <div className="text-center mb-4">
        <h2 className="text-sm font-semibold tracking-widest text-amber-300 uppercase">
          {state.wizard.academyName}
        </h2>
        <p className="text-xs text-slate-400">
          Cross-Section Architecture · Quality Tiers · Castle Stack &amp; Sacred Grounds
        </p>
      </div>

      {/* Main Castle Construction Structure */}
      <div className="flex flex-col-reverse items-center gap-2 border-b-4 border-amber-950/70 pb-2 relative">
        {/* Floors 2, 1, 0 stacked vertically */}
        {[2, 1, 0].map(floorY => {
          const floorRooms = castleRooms.filter(r => r.y === floorY);
          return (
            <div key={`floor-${floorY}`} className="flex items-end gap-2 relative min-h-[110px]">
              {/* Floor Label */}
              <div className="absolute -left-12 bottom-8 text-[11px] font-mono text-slate-500 font-bold">
                F{floorY}
              </div>

              {floorRooms.length === 0 ? (
                <div className="h-24 w-72 border border-dashed border-slate-700/50 rounded flex items-center justify-center text-xs text-slate-600">
                  Floor {floorY} Available Space (Build Upward)
                </div>
              ) : (
                floorRooms.map(room => {
                  const def = ROOM_DEFINITIONS[room.defId];
                  const { q, tier } = calculateRoomQuality(room);
                  const eff = calculateRoomEfficiency(room);
                  const occupants = getOccupants(room.id);
                  const roomCreatures = getCreatures(room.id);
                  const isSelected = selectedRoomId === room.id;

                  // Aesthetic styles based on Quality Tier
                  const tierBg =
                    tier === 'splendid' ? 'bg-gradient-to-b from-amber-900/60 via-purple-950/70 to-slate-900 border-amber-400/90 shadow-amber-500/20 shadow-lg' :
                    tier === 'fine' ? 'bg-gradient-to-b from-slate-800 via-indigo-950/60 to-slate-900 border-indigo-400/70 shadow' :
                    tier === 'cozy' ? 'bg-gradient-to-b from-amber-950/40 to-slate-900 border-amber-600/50' :
                    tier === 'plain' ? 'bg-slate-900/90 border-slate-600/60' :
                    'bg-slate-950/90 border-stone-700/50';

                  const widthClass = room.w === 3 ? 'w-80' : room.w === 2 ? 'w-56' : 'w-28';
                  const heightClass = room.h === 2 ? 'h-56' : 'h-28';

                  return (
                    <div
                      key={room.id}
                      onClick={() => onSelectRoom(room)}
                      className={`relative ${widthClass} ${heightClass} ${tierBg} rounded-lg border-2 p-2.5 flex flex-col justify-between cursor-pointer transition-all hover:scale-[1.01] hover:border-amber-400/80 ${
                        isSelected ? 'ring-2 ring-amber-400 ring-offset-2 ring-offset-slate-950' : ''
                      }`}
                    >
                      {/* Top Room Header */}
                      <div className="flex items-center justify-between text-xs font-medium">
                        <span className="font-bold text-slate-200 flex items-center gap-1 truncate">
                          {def?.name || room.defId}
                          {room.level > 1 && (
                            <span className="text-[10px] bg-amber-500/20 text-amber-300 px-1 py-0.2 rounded font-bold">
                              L{room.level}
                            </span>
                          )}
                        </span>
                        <div className="flex items-center gap-1.5 text-[10px]">
                          <span className="text-amber-300 font-mono" title={`Quality Score Q: ${q}`}>
                            Q{q} ({tier})
                          </span>
                        </div>
                      </div>

                      {/* Construction or Locked Overlay */}
                      {room.state === 'site' && (
                        <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-xs rounded-lg flex flex-col items-center justify-center p-2 text-center z-10">
                          <Wrench className="w-5 h-5 text-amber-400 animate-bounce mb-1" />
                          <div className="text-[11px] font-bold text-amber-200">Constructing...</div>
                          <div className="text-[10px] text-slate-400">
                            {room.buildProgress} / {room.buildRequired} reviews
                          </div>
                          <div className="w-full bg-slate-800 rounded-full h-1.5 mt-1 overflow-hidden">
                            <div
                              className="bg-amber-400 h-full transition-all"
                              style={{ width: `${Math.min(100, (room.buildProgress / Math.max(1, room.buildRequired)) * 100)}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {/* Room Interior Content: Furnishings & Occupants */}
                      <div className="flex items-center gap-1.5 flex-wrap py-1 text-xs">
                        {room.furniture.map(f => (
                          <span
                            key={f.id}
                            className={`text-[10px] px-1.5 py-0.5 rounded border ${
                              f.damaged
                                ? 'bg-red-950/60 border-red-500/50 text-red-300 line-through'
                                : 'bg-slate-800/80 border-slate-700 text-slate-300'
                            }`}
                            title={FURNITURE_DEFINITIONS[f.defId]?.name || f.defId}
                          >
                            {FURNITURE_DEFINITIONS[f.defId]?.name || f.defId}
                          </span>
                        ))}
                      </div>

                      {/* Bottom Footer: Efficiency, Cleanliness, Occupant avatars */}
                      <div className="flex items-center justify-between text-[10px] text-slate-400 border-t border-slate-800/60 pt-1">
                        <span>Eff: <strong className="text-slate-200">{(eff * 100).toFixed(0)}%</strong></span>
                        <div className="flex items-center gap-1">
                          {occupants.length > 0 && (
                            <span className="flex items-center gap-0.5 text-amber-300 font-semibold">
                              <Users className="w-3 h-3" /> {occupants.length}
                            </span>
                          )}
                          <span className={room.cleanliness < 70 ? 'text-amber-400' : 'text-slate-400'}>
                            🧼 {Math.round(room.cleanliness)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          );
        })}
      </div>

      {/* Ground Level Plots (Gardens, Woodlots, Paddock, Rift Gate) */}
      <div className="w-full max-w-4xl mt-3 pt-3 border-t-2 border-emerald-950/70">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-semibold text-emerald-400 uppercase tracking-wider flex items-center gap-1">
            🌱 Academy Grounds &amp; Outskirts
          </span>
          <span className="text-[11px] text-slate-400">{groundPlots.length} outdoor plots in use</span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {groundPlots.map(plot => {
            const def = ROOM_DEFINITIONS[plot.defId];
            const isSelected = selectedRoomId === plot.id;
            return (
              <div
                key={plot.id}
                onClick={() => onSelectRoom(plot)}
                className={`min-w-40 p-2.5 rounded-lg border-2 bg-gradient-to-b from-emerald-950/30 to-slate-900 border-emerald-800/50 cursor-pointer hover:border-emerald-400 transition-all ${
                  isSelected ? 'ring-2 ring-emerald-400 ring-offset-2 ring-offset-slate-950' : ''
                }`}
              >
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-200">
                  <span>{def?.name || plot.defId}</span>
                  <span className="text-[10px] text-slate-400 font-mono">1 plot</span>
                </div>
                <div className="text-[10px] text-slate-400 mt-1 line-clamp-1">
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
