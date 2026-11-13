/**
 * Preview-only creature debug panel. The add-on build stubs this module out.
 * Unique marker (must not appear in addon/web): ankicaster-creature-debug-panel-v4
 */
import React, { useMemo, useState } from 'react';
import { CREATURE_DEFINITIONS, RIFT_DESTINATIONS } from '../data/content';
import type { FullGameState } from '../types/ankicaster';
import {
  clearDebugCreatures,
  fillPensPastCap,
  patchDebugCreature,
  setRiftDebug,
  simulateHonestReviews,
  spawnDebugCreature,
  spawnHabitatSet,
  type DebugCreatureStatus,
  type RiftDebugMode
} from './creatureDebug';

export const CREATURE_DEBUG_PANEL_MARKER = 'ankicaster-creature-debug-panel-v4';

const STATUSES: DebugCreatureStatus[] = ['egg', 'wary', 'tamed', 'loose', 'away', 'unhomed'];

function speciesList() {
  return Object.values(CREATURE_DEFINITIONS).sort((a, b) => a.name.localeCompare(b.name));
}

export function CreatureDebugPanel({
  state,
  onChange
}: {
  state: FullGameState;
  onChange: (next: FullGameState | ((prev: FullGameState) => FullGameState)) => void;
}) {
  const [open, setOpen] = useState(() => {
    if (typeof window === 'undefined') return false;
    return new URLSearchParams(window.location.search).get('debug') === '1';
  });
  const [speciesId, setSpeciesId] = useState('bramblefox');
  const [status, setStatus] = useState<DebugCreatureStatus>('wary');
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [destination, setDestination] = useState('crystal_caverns');
  const [note, setNote] = useState('');

  const allSpecies = useMemo(speciesList, []);
  const selected = state.creatures.find(c => c.id === selectedId);

  const apply = (result: { state: FullGameState; message: string; creatureId?: number }) => {
    if (result.creatureId !== undefined) setSelectedId(result.creatureId);
    setNote(result.message);
    onChange(result.state);
  };

  const tamingPct = (() => {
    if (!selected) return 0;
    const req = Math.max(1, CREATURE_DEFINITIONS[selected.defId]?.tamingReviews || 1);
    return Math.round((selected.tamingProgress / req) * 100);
  })();

  return (
    <>
      <button
        type="button"
        data-testid="creature-debug-toggle"
        title="Creature debug"
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-3 right-3 z-[80] w-10 h-10 rounded-full bg-slate-900 border border-amber-500/50 text-lg shadow-lg hover:bg-slate-800"
      >
        🐞
      </button>
      {open && (
        <section
          data-testid={CREATURE_DEBUG_PANEL_MARKER}
          className="fixed bottom-16 right-3 z-[80] w-[320px] max-h-[70vh] overflow-y-auto rounded-xl border border-amber-700/50 bg-slate-950/95 text-slate-100 shadow-2xl p-3 text-[12px] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-amber-200 text-[13px]">Creature debug</h2>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-100 px-1">
              Hide
            </button>
          </div>
          <p className="text-slate-400 leading-snug">Preview only. Actions tag this save so it is not a real academy.</p>

          <label className="block space-y-1">
            <span className="text-slate-300">Species</span>
            <select
              value={speciesId}
              onChange={e => setSpeciesId(e.target.value)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
            >
              {allSpecies.map(def => (
                <option key={def.id} value={def.id}>{def.name}</option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-slate-300">Status</span>
            <select
              value={status}
              onChange={e => setStatus(e.target.value as DebugCreatureStatus)}
              className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
            >
              {STATUSES.map(s => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => apply(spawnDebugCreature(state, speciesId, status))}
            className="w-full py-1.5 rounded-lg bg-amber-600 text-slate-950 font-bold"
          >
            Spawn creature
          </button>

          {selected && (
            <div className="space-y-2 border-t border-slate-800 pt-2">
              <label className="block space-y-1">
                <span className="text-slate-300">Selected</span>
                <select
                  value={selected.id}
                  onChange={e => setSelectedId(Number(e.target.value))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                >
                  {state.creatures.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nickname} · {c.debugUnhomed ? 'unhomed' : c.status}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block space-y-1">
                <span className="text-slate-300">Set status</span>
                <select
                  value={selected.debugUnhomed ? 'unhomed' : selected.status}
                  onChange={e => apply(patchDebugCreature(state, selected.id, { status: e.target.value as DebugCreatureStatus }))}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                >
                  {STATUSES.map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
              </label>
              <label className="block">
                Taming {tamingPct}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={tamingPct}
                  onChange={e => apply(patchDebugCreature(state, selected.id, { tamingPct: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>
              <label className="block">
                Egg {Math.round(selected.hatchProgress)}%
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={Math.round(selected.hatchProgress)}
                  onChange={e => apply(patchDebugCreature(state, selected.id, { hatchProgress: Number(e.target.value) }))}
                  className="w-full"
                />
              </label>
              <label className="block">
                Bond {selected.bondLevel}
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={selected.bondLevel}
                  onChange={e => apply(patchDebugCreature(state, selected.id, { bondLevel: Number(e.target.value) as 0 | 1 | 2 | 3 }))}
                  className="w-full"
                />
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={selected.hungry}
                  onChange={e => apply(patchDebugCreature(state, selected.id, { hungry: e.target.checked }))}
                />
                Hungry
              </label>
            </div>
          )}

          {!selected && state.creatures.length > 0 && (
            <label className="block space-y-1">
              <span className="text-slate-300">Selected creature</span>
              <select
                value=""
                onChange={e => setSelectedId(Number(e.target.value))}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
              >
                <option value="">Choose…</option>
                {state.creatures.map(c => (
                  <option key={c.id} value={c.id}>{c.nickname} · {c.status}</option>
                ))}
              </select>
            </label>
          )}

          <div className="grid grid-cols-1 gap-1.5 border-t border-slate-800 pt-2">
            <button type="button" onClick={() => apply(spawnHabitatSet(state))} className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold">
              Spawn one of each habitat
            </button>
            <button type="button" onClick={() => apply(fillPensPastCap(state))} className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold">
              Fill pens past cap
            </button>
          </div>

          <div className="space-y-1.5 border-t border-slate-800 pt-2">
            <label className="block space-y-1">
              <span className="text-slate-300">Rift destination</span>
              <select
                value={destination}
                onChange={e => setDestination(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
              >
                {Object.values(RIFT_DESTINATIONS).map(d => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </label>
            <div className="grid grid-cols-2 gap-1.5">
              {(['dormant', 'open', 'expedition_out', 'returning'] as RiftDebugMode[]).map(mode => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => {
                    if (mode !== 'returning') {
                      apply(setRiftDebug(state, mode, destination));
                      return;
                    }
                    const armed = setRiftDebug(state, 'expedition_out', destination);
                    onChange(armed.state);
                    window.setTimeout(() => {
                      onChange(current => setRiftDebug(current, 'returning', destination).state);
                    }, 60);
                    setNote('Returning: flare plays for 1.5s unless Reduce Motion is on.');
                  }}
                  className="py-1.5 rounded-lg bg-indigo-950 hover:bg-indigo-900 border border-indigo-800/60 font-bold"
                >
                  {mode === 'expedition_out' ? 'expedition out' : mode}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-1.5 border-t border-slate-800 pt-2">
            <button type="button" onClick={() => apply(simulateHonestReviews(state, 10))} className="py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/40 font-bold">
              +10 reviews
            </button>
            <button type="button" onClick={() => apply(simulateHonestReviews(state, 100))} className="py-1.5 rounded-lg bg-amber-500/15 text-amber-200 border border-amber-500/40 font-bold">
              +100 reviews
            </button>
          </div>
          <button
            type="button"
            onClick={() => apply(clearDebugCreatures(state))}
            className="w-full py-1.5 rounded-lg bg-rose-950/70 text-rose-200 border border-rose-800/60 font-bold"
          >
            Clear debug creatures
          </button>
          {note && <p className="text-slate-300 leading-snug">{note}</p>}
        </section>
      )}
    </>
  );
}
