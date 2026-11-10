/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 * 
 * Top Bar showing Mana Bank, Five Essences, Common Materials, and Veil Status
 * Follows GDD Section 36.2 layout
 */

import React from 'react';
import { Sparkles, Shield, Compass, Sun, Moon, FlaskConical, Leaf, BookOpen, AlertTriangle } from 'lucide-react';
import { FullGameState } from '../types/ankicaster';

interface TopBarProps {
  state: FullGameState;
  onOpenCodex: () => void;
  onOpenSettings: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ state, onOpenCodex, onOpenSettings }) => {
  const { mana, resources, veil, reviewIndex, bellIndex, renown } = state;

  const veilColor =
    veil.strength >= 80 ? 'text-sky-400 bg-sky-950/60 border-sky-600/50' :
    veil.strength >= 50 ? 'text-indigo-300 bg-indigo-950/60 border-indigo-600/50' :
    veil.strength >= 20 ? 'text-purple-400 bg-purple-950/60 border-purple-600/50' :
    'text-red-400 bg-red-950/60 border-red-600/50 animate-pulse';

  const veilBandLabel =
    veil.strength >= 80 ? 'Strong' :
    veil.strength >= 50 ? 'Thinning' :
    veil.strength >= 20 ? 'Thin' : 'Torn';

  return (
    <header className="bg-slate-950/90 backdrop-blur border-b border-amber-900/30 text-amber-100 text-xs px-4 py-2 flex flex-wrap items-center justify-between gap-3 shadow-lg select-none sticky top-0 z-40">
      {/* Left: Mana & School Renown */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1 rounded-full shadow-inner">
          <Sparkles className="w-4 h-4 text-amber-400 animate-spin" style={{ animationDuration: '6s' }} />
          <span className="font-bold text-amber-300 text-sm tracking-wide">
            {Math.floor(mana).toLocaleString()} <span className="text-[10px] text-amber-400/70 font-normal">MANA</span>
          </span>
          {state.manaDebt > 0 && (
            <span className="text-[10px] text-rose-400">(-{Math.floor(state.manaDebt)} debt)</span>
          )}
        </div>

        <div className="hidden sm:flex items-center gap-1.5 text-slate-300 bg-slate-900/60 px-2.5 py-1 rounded border border-slate-800">
          <Compass className="w-3.5 h-3.5 text-amber-400" />
          <span>Renown: <strong className="text-amber-200">{renown}</strong></span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 text-slate-400">
          <span>Bell <strong className="text-slate-200">{bellIndex}</strong></span>
          <span className="text-slate-600">·</span>
          <span>Review <strong className="text-slate-200">{reviewIndex}</strong></span>
        </div>
      </div>

      {/* Center: Five Essences */}
      <div className="flex items-center gap-3 bg-slate-900/80 px-3 py-1 rounded-lg border border-slate-800/80">
        <div className="flex items-center gap-1 text-purple-300" title="Insight (Arcane Essence)">
          <BookOpen className="w-3.5 h-3.5 text-purple-400" />
          <span>{Math.floor(resources.insight)}</span>
        </div>
        <div className="flex items-center gap-1 text-emerald-300" title="Herbs (Nature Essence)">
          <Leaf className="w-3.5 h-3.5 text-emerald-400" />
          <span>{Math.floor(resources.herbs)}</span>
        </div>
        <div className="flex items-center gap-1 text-amber-300" title="Radiance (Light Essence)">
          <Sun className="w-3.5 h-3.5 text-amber-400" />
          <span>{Math.floor(resources.radiance)}</span>
        </div>
        <div className="flex items-center gap-1 text-indigo-300" title="Umbra (Shadow Essence)">
          <Moon className="w-3.5 h-3.5 text-indigo-400" />
          <span>{Math.floor(resources.umbra)}</span>
        </div>
        <div className="flex items-center gap-1 text-orange-300" title="Reagents (Alchemy Essence)">
          <FlaskConical className="w-3.5 h-3.5 text-orange-400" />
          <span>{Math.floor(resources.reagents)}</span>
        </div>
      </div>

      {/* Right: Common materials, Veil Gauge, & Help */}
      <div className="flex items-center gap-3">
        <div className="hidden lg:flex items-center gap-2.5 text-slate-300 font-mono text-[11px]">
          <span title="Timber">🪵 {Math.floor(resources.timber)}</span>
          <span title="Stone">🪨 {Math.floor(resources.stone)}</span>
          <span title="Glass">🪟 {Math.floor(resources.glass)}</span>
          <span title="Cloth">🧵 {Math.floor(resources.cloth)}</span>
          <span title="Provisions (Food)">🍞 {Math.floor(resources.provisions)}</span>
        </div>

        {/* Veil Dome Status */}
        <div
          className={`flex items-center gap-1.5 px-2.5 py-1 rounded border text-xs font-semibold cursor-pointer ${veilColor}`}
          title={`Veil Strength: ${veil.strength}%. Daily upkeep: ${veil.costToday} mana.`}
        >
          <Shield className="w-3.5 h-3.5" />
          <span>Veil: {veilBandLabel} ({veil.strength}%)</span>
        </div>

        <button
          onClick={onOpenCodex}
          className="text-amber-300/80 hover:text-amber-200 hover:bg-amber-900/20 px-2 py-1 rounded border border-amber-600/30 transition text-xs"
        >
          📖 Codex
        </button>
      </div>
    </header>
  );
};
