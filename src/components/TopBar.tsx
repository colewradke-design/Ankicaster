/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Slim Top Bar: mana, resources, day/term, Veil, hazard alert, Build, Academy menu, Settings.
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Sparkles, Shield, Sun, Hammer, Settings as SettingsIcon, ChevronDown, AlertTriangle, Castle
} from 'lucide-react';
import { FullGameState } from '../types/ankicaster';
import { ROOM_DEFINITIONS } from '../data/content';
import {
  ScreenId, SCREEN_DEFS, getAcademyMenuScreens, hazardRooms
} from '../ui/screens';
import { ScreenIcon } from './ScreenIcon';
import { ResourceBar } from './ResourceBar';

interface TopBarProps {
  state: FullGameState;
  onOpenScreen: (id: ScreenId) => void;
  onOpenRoom: (roomId: number) => void;
  /** Optional dev-only controls (never shown in Anki). */
  devControls?: React.ReactNode;
  forceAcademy?: boolean;
}

export function termLabel(state: FullGameState, now: number = Date.now()): string | null {
  if (!(state.settings.examTimer || state.settings.mode === 'timed')) return null;
  const end = state.termEndDateMs || (state.settings.termEndDate ? new Date(state.settings.termEndDate).getTime() : 0);
  if (!end) return 'Term';
  const days = Math.max(0, Math.ceil((end - now) / 86400000));
  return `Term · ${days}d left`;
}

export const AcademyMenu: React.FC<{
  state: FullGameState;
  onOpenScreen: (id: ScreenId) => void;
  onOpenRoom: (roomId: number) => void;
  defaultOpen?: boolean;
  forceOpen?: boolean;
}> = ({ state, onOpenScreen, onOpenRoom, defaultOpen = false, forceOpen = false }) => {
  const [open, setOpen] = useState(defaultOpen || forceOpen);
  const shown = forceOpen || open;
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!shown || forceOpen) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('mousedown', onDown);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', onDown);
      window.removeEventListener('keydown', onKey);
    };
  }, [shown, forceOpen]);

  const roomScreens = getAcademyMenuScreens(state);
  const general: ScreenId[] = ['reviewer', 'journal', 'codex', 'settings'];
  const hazards = hazardRooms(state);

  const pick = (fn: () => void) => () => { setOpen(false); fn(); };

  const Item = ({ id, badge }: { id: ScreenId; badge?: React.ReactNode }) => (
    <button
      role="menuitem"
      data-screen={id}
      onClick={pick(() => onOpenScreen(id))}
      title={SCREEN_DEFS[id].hint}
      className="w-full flex items-center gap-2.5 px-3 py-2 min-h-[32px] rounded-lg text-[13px] text-slate-200 hover:bg-amber-500/10 hover:text-amber-200 text-left transition"
    >
      <ScreenIcon id={id} className="w-4 h-4 shrink-0" />
      <span className="flex-1">{SCREEN_DEFS[id].label}</span>
      {badge}
    </button>
  );

  return (
    <div className="relative" ref={ref} data-tour="academy-menu">
      <button
        onClick={() => { if (!forceOpen) setOpen(o => !o); }}
        aria-haspopup="menu"
        aria-expanded={shown}
        className={`flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg border text-[13px] font-bold transition ${
          shown ? 'bg-amber-500/20 border-amber-500/50 text-amber-200' : 'border-slate-700 text-slate-200 hover:bg-slate-800'
        }`}
      >
        <Castle className="w-4 h-4 text-amber-400" />
        Academy
        <ChevronDown className="w-3.5 h-3.5 opacity-70" />
      </button>

      {shown && (
        <div
          role="menu"
          aria-label="Academy menu"
          data-tour="academy-panel"
          className="absolute right-0 mt-2 w-64 max-h-[75vh] overflow-y-auto bg-slate-900 border border-amber-900/50 rounded-xl shadow-2xl p-1.5 z-50"
        >
          {hazards.length > 0 && (
            <>
              <div className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wider font-bold text-rose-400">Hazards</div>
              {hazards.map(r => (
                <button
                  key={r.id}
                  role="menuitem"
                  data-hazard-room={r.id}
                  onClick={pick(() => onOpenRoom(r.id))}
                  className="w-full flex items-center gap-2.5 px-3 py-2 min-h-[32px] rounded-lg text-[13px] text-rose-200 hover:bg-rose-500/10 text-left"
                >
                  <AlertTriangle className="w-4 h-4 text-rose-400" />
                  <span className="flex-1">{ROOM_DEFINITIONS[r.defId]?.name || r.defId}</span>
                </button>
              ))}
              <div className="my-1 border-t border-slate-800" />
            </>
          )}

          <div className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wider font-bold text-slate-500">Rooms</div>
          {roomScreens.map(id => (
            <Item
              key={id}
              id={id}
              badge={id === 'events' ? (
                <span className="text-[11px] bg-amber-500/20 text-amber-300 px-1.5 rounded">{state.activeEvents.length}</span>
              ) : undefined}
            />
          ))}
          <div className="my-1 border-t border-slate-800" />
          <div className="px-3 pt-1.5 pb-1 text-[11px] uppercase tracking-wider font-bold text-slate-500">General</div>
          {general.map(id => <Item key={id} id={id} />)}
          <div className="px-3 py-2 text-[12px] text-slate-500 border-t border-slate-800 mt-1">
            Build more rooms to unlock more screens.
          </div>
        </div>
      )}
    </div>
  );
};

export const TopBar: React.FC<TopBarProps> = ({ state, onOpenScreen, onOpenRoom, devControls, forceAcademy }) => {
  const { mana, veil } = state;

  const veilColor =
    veil.strength >= 80 ? 'text-sky-300 border-sky-700/60' :
    veil.strength >= 50 ? 'text-indigo-300 border-indigo-700/60' :
    veil.strength >= 20 ? 'text-purple-300 border-purple-700/60' :
    'text-red-300 border-red-700/60';
  const veilBandLabel =
    veil.strength >= 80 ? 'Strong' : veil.strength >= 50 ? 'Thinning' : veil.strength >= 20 ? 'Thin' : 'Torn';
  const bankFloor = Math.max(10, Math.round((state.bankAtLastReview || mana) * 0.1));

  const hazards = hazardRooms(state);
  const term = termLabel(state);

  return (
    <header className="bg-slate-950/95 backdrop-blur border-b border-amber-900/30 text-amber-100 px-3 py-2 flex items-center justify-between gap-2 shadow-md select-none">
      <div className="flex items-center gap-2 min-w-0">
        <button
          onClick={() => onOpenScreen('reviewer')}
          className="flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 px-3 py-1 min-h-[32px] rounded-full shadow-inner hover:bg-amber-500/20 transition"
          title="Mana: earned from honest reviews. Click to open the Study Desk."
          data-testid="mana-chip"
        >
          <Sparkles className="w-4 h-4 text-amber-400" />
          <span className="font-bold text-amber-300 text-sm tracking-wide">
            {Math.floor(mana).toLocaleString()} <span className="text-[11px] text-amber-400/80 font-normal">MANA</span>
          </span>
          {state.manaDebt > 0 && (
            <span className="text-[12px] text-rose-400 font-bold">-{Math.floor(state.manaDebt)}</span>
          )}
        </button>

        <ResourceBar state={state} />

        <span
          className="flex items-center gap-1.5 text-slate-300 bg-slate-900/80 px-2.5 py-1 min-h-[32px] rounded-lg border border-slate-800 text-[13px]"
          title="Academy day"
          data-testid="day-chip"
        >
          <Sun className="w-3.5 h-3.5 text-amber-400" />
          Day <strong className="text-slate-100">{state.day}</strong>
          {term && <span className="text-sky-300 ml-1">· {term}</span>}
        </span>

        <span
          className={`hidden sm:flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-lg border bg-slate-900/80 text-[13px] ${veilColor}`}
          title={`Veil ${veilBandLabel}: ${veil.strength}%. Daily upkeep ${veil.costToday} mana. Safe floor ${bankFloor} mana.`}
        >
          <Shield className="w-3.5 h-3.5" />
          {veil.strength}%
        </span>

        {hazards.length > 0 && (
          <button
            onClick={() => onOpenRoom(hazards[0].id)}
            className="flex items-center gap-1.5 px-2.5 py-1 min-h-[32px] rounded-lg border border-rose-600/60 bg-rose-950/60 text-rose-200 text-[13px] font-bold hover:bg-rose-900/60"
            title={`Hazard in ${hazards.map(h => ROOM_DEFINITIONS[h.defId]?.name || h.defId).join(', ')}`}
            data-testid="hazard-chip"
          >
            <AlertTriangle className="w-4 h-4" />
            {hazards.length}
          </button>
        )}
      </div>

      <div className="flex items-center gap-2 shrink-0">
        {devControls}
        <button
          onClick={() => onOpenScreen('build')}
          className="flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg bg-amber-600 hover:bg-amber-500 text-slate-950 text-[13px] font-bold shadow border-b-2 border-amber-800 transition"
          title="Plan a new room"
        >
          <Hammer className="w-4 h-4" />
          Build
        </button>
        <AcademyMenu state={state} onOpenScreen={onOpenScreen} onOpenRoom={onOpenRoom} forceOpen={forceAcademy} />
        <button
          onClick={() => onOpenScreen('settings')}
          className="p-1.5 min-w-[32px] min-h-[32px] flex items-center justify-center text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg border border-slate-700 transition"
          title="Settings"
          aria-label="Settings"
        >
          <SettingsIcon className="w-4 h-4" />
        </button>
      </div>
    </header>
  );
};
