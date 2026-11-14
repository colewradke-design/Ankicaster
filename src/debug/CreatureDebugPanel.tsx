/**
 * Preview-only debug tools panel. The add-on build stubs this module out.
 * Unique marker (must not appear in addon/web): ankicaster-creature-debug-panel-v4
 */
import React, { useMemo, useState } from 'react';
import {
  CREATURE_DEFINITIONS,
  RIFT_DESTINATIONS,
  ROOM_DEFINITIONS,
  SCHOOL_EVENTS
} from '../data/content';
import type { CareerType, FullGameState, InjuryType, PlacedRoom, SchoolType } from '../types/ankicaster';
import {
  ALL_CAREERS,
  ALL_HAZARD_TYPES,
  ALL_INJURIES,
  ALL_SCHOOLS,
  clearDebugCreatures,
  debugAdvanceBells,
  debugClearAllEvents,
  debugClearAllHazards,
  debugCompleteAllConstruction,
  debugDeleteCharacter,
  debugFirePreviewVignette,
  debugForceEnrollFiveStudents,
  debugForceEnrollStudent,
  debugGrantAllResources,
  debugGrantMasteryNow,
  debugLearnAllSpells,
  debugMakeMasteryReady,
  debugRetireCharacterNow,
  debugRunDayTick,
  debugSetResourceAmount,
  debugSetRoomHazard,
  debugSetTimeOverride,
  debugSetVeilStrength,
  debugSetWizardSchoolLevel,
  debugTriggerExpeditionOutcome,
  debugTriggerSchoolEvent,
  debugUnlockAllBlueprintsAndRecipes,
  debugUpdateCharacter,
  fillPensPastCap,
  patchDebugCreature,
  setDiscoveryDebug,
  setRiftDebug,
  simulateHonestReviews,
  spawnDebugCreature,
  spawnHabitatSet,
  type DebugCreatureStatus,
  type RiftDebugMode
} from './creatureDebug';
import { ORIGIN_LABELS, arrivalStage, arrivalStageLabel, originLabel } from '../utils/creatures';
import { getVeilBand } from '../utils/formulas';
import { VISUAL_EVENT_CATALOGUE, VisualEventType } from '../visual/events/visualEvents';

export const CREATURE_DEBUG_PANEL_MARKER = 'ankicaster-creature-debug-panel-v4';

const STATUSES: DebugCreatureStatus[] = ['egg', 'wary', 'tamed', 'loose', 'away', 'unhomed'];

type DebugTab = 'creatures' | 'people' | 'events' | 'atmosphere' | 'academy';

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
  const [activeTab, setActiveTab] = useState<DebugTab>('creatures');

  // Creatures state
  const [speciesId, setSpeciesId] = useState('bramblefox');
  const [status, setStatus] = useState<DebugCreatureStatus>('wary');
  const [selectedId, setSelectedId] = useState<number | ''>('');
  const [destination, setDestination] = useState('crystal_caverns');

  // People state
  const [enrollSchool, setEnrollSchool] = useState<SchoolType>('arcane');
  const [enrollName, setEnrollName] = useState('');
  const [selectedCharId, setSelectedCharId] = useState<number | ''>('');
  const [readySchool, setReadySchool] = useState<SchoolType>('arcane');

  // Events & Hazards state
  const [schoolEventId, setSchoolEventId] = useState(SCHOOL_EVENTS[0]?.id || 'owl_post');
  const [hazardRoomId, setHazardRoomId] = useState<number | ''>('');
  const [hazardType, setHazardType] = useState<NonNullable<PlacedRoom['hazard']>['type']>('spill_of_night');
  const [expeditionOutcome, setExpeditionOutcome] = useState<'safe' | 'minor_injury' | 'serious_injury' | 'curse' | 'retreat'>('safe');
  const [previewEventType, setPreviewEventType] = useState<VisualEventType>('mastery_granted');
  const [previewRoomId, setPreviewRoomId] = useState<number | ''>('');

  // Academy state
  const [resKey, setResKey] = useState<string>('mana');
  const [resAmount, setResAmount] = useState<number>(500);

  const [note, setNote] = useState('');

  const allSpecies = useMemo(speciesList, []);
  const selected = state.creatures.find(c => c.id === selectedId);
  const pickerDef = CREATURE_DEFINITIONS[speciesId];
  const selectedDef = selected ? CREATURE_DEFINITIONS[selected.defId] : undefined;

  const selectedChar = state.characters.find(c => c.id === selectedCharId) || state.characters[0];
  const builtRooms = state.rooms.filter(r => r.state === 'built');
  const targetHazardRoomId = hazardRoomId !== '' ? Number(hazardRoomId) : (builtRooms[0]?.id ?? 1);
  const targetPreviewRoomId = previewRoomId !== '' ? Number(previewRoomId) : (builtRooms[0]?.id ?? 1);

  const apply = (result: { state: FullGameState; message: string; creatureId?: number; characterId?: number }) => {
    if (result.creatureId !== undefined) setSelectedId(result.creatureId);
    if (result.characterId !== undefined) setSelectedCharId(result.characterId);
    setNote(result.message);
    onChange(result.state);
  };

  const tamingPct = (() => {
    if (!selected) return 0;
    const req = Math.max(1, CREATURE_DEFINITIONS[selected.defId]?.tamingReviews || 1);
    return Math.round((selected.tamingProgress / req) * 100);
  })();

  const allVisualEventTypes = useMemo(
    () => Object.keys(VISUAL_EVENT_CATALOGUE) as VisualEventType[],
    []
  );

  return (
    <>
      <button
        type="button"
        data-testid="creature-debug-toggle"
        title="Debug Tools"
        onClick={() => setOpen(v => !v)}
        className="fixed bottom-3 right-3 z-[80] w-10 h-10 rounded-full bg-slate-900 border border-amber-500/50 text-lg shadow-lg hover:bg-slate-800"
      >
        🐞
      </button>
      {open && (
        <section
          data-testid={CREATURE_DEBUG_PANEL_MARKER}
          className="fixed bottom-16 right-3 z-[80] w-[360px] max-h-[78vh] overflow-y-auto rounded-xl border border-amber-700/50 bg-slate-950/95 text-slate-100 shadow-2xl p-3 text-[12px] space-y-3"
        >
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-bold text-amber-200 text-[13px]">Debug Tools</h2>
            <button type="button" onClick={() => setOpen(false)} className="text-slate-400 hover:text-slate-100 px-1">
              Hide
            </button>
          </div>
          <p className="text-slate-400 leading-snug">Preview only. Actions tag this save so it is not a real academy.</p>

          {/* Collapsible / Switchable Tabs */}
          <div className="grid grid-cols-5 gap-1 bg-slate-900 p-1 rounded-lg border border-slate-800">
            {([
              { id: 'creatures', label: 'Creatures' },
              { id: 'people', label: 'People' },
              { id: 'events', label: 'Events & Hazards' },
              { id: 'atmosphere', label: 'Atmosphere' },
              { id: 'academy', label: 'Academy' }
            ] as Array<{ id: DebugTab; label: string }>).map(tab => (
              <button
                key={tab.id}
                type="button"
                data-testid={`debug-tab-${tab.id}`}
                onClick={() => setActiveTab(tab.id)}
                className={`py-1 px-1 rounded text-[10px] font-bold truncate ${
                  activeTab === tab.id ? 'bg-amber-600 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
                title={tab.label}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* TAB 1: CREATURES */}
          {activeTab === 'creatures' && (
            <div className="space-y-2.5">
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
                {pickerDef && (
                  <div className="text-[11px] text-slate-400">
                    Move: <strong className="text-slate-200">{pickerDef.movement}</strong> · Origin:{' '}
                    <strong className="text-slate-200">{ORIGIN_LABELS[pickerDef.origin]}</strong> ·{' '}
                    <strong className="text-emerald-300">{pickerDef.roamsFreely ? 'Roams freely' : 'Pen'}</strong>
                  </div>
                )}
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
                  <label className="block space-y-1">
                    <span>
                      {originLabel(selectedDef?.origin, selected.defId)} {Math.round(selected.hatchProgress)}% ·{' '}
                      {arrivalStageLabel(arrivalStage(selected.hatchProgress))}
                    </span>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(selected.hatchProgress)}
                      onChange={e => apply(patchDebugCreature(state, selected.id, { hatchProgress: Number(e.target.value) }))}
                      className="w-full"
                    />
                    <div className="grid grid-cols-5 gap-1">
                      {[10, 30, 50, 70, 90].map((pct, idx) => (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => apply(patchDebugCreature(state, selected.id, { hatchProgress: pct }))}
                          className="py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px] font-mono"
                        >
                          S{idx + 1} ({pct}%)
                        </button>
                      ))}
                    </div>
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
                <div className="grid grid-cols-2 gap-1.5">
                  <button type="button" onClick={() => apply(setDiscoveryDebug(state, 'all'))} className="py-1.5 rounded-lg bg-emerald-950/70 hover:bg-emerald-900 border border-emerald-700/50 text-emerald-200 font-bold">
                    Discover all 40
                  </button>
                  <button type="button" onClick={() => apply(setDiscoveryDebug(state, 'reset'))} className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold">
                    Reset discovery
                  </button>
                </div>
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
            </div>
          )}

          {/* TAB 2: PEOPLE */}
          {activeTab === 'people' && (
            <div className="space-y-2.5">
              <div className="space-y-1.5">
                <span className="font-bold text-amber-200 block">Force Enroll Student</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={enrollSchool}
                    onChange={e => setEnrollSchool(e.target.value as SchoolType)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                  >
                    {ALL_SCHOOLS.map(s => (
                      <option key={s} value={s}>{s.toUpperCase()}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Optional name"
                    value={enrollName}
                    onChange={e => setEnrollName(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                  />
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => apply(debugForceEnrollStudent(state, enrollSchool, enrollName))}
                    className="py-1.5 rounded-lg bg-amber-600 text-slate-950 font-bold"
                  >
                    Force Enroll
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(debugForceEnrollFiveStudents(state, enrollSchool))}
                    className="py-1.5 rounded-lg bg-amber-500/20 text-amber-200 border border-amber-500/40 font-bold"
                  >
                    +5 students
                  </button>
                </div>
              </div>

              {state.characters.length > 0 && selectedChar && (
                <div className="space-y-2 border-t border-slate-800 pt-2">
                  <label className="block space-y-1">
                    <span className="text-slate-300">Selected Character</span>
                    <select
                      value={selectedChar.id}
                      onChange={e => setSelectedCharId(Number(e.target.value))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                    >
                      {state.characters.map(c => (
                        <option key={c.id} value={c.id}>
                          {c.name} · {c.status} {c.career ? `(${c.career})` : ''}
                        </option>
                      ))}
                    </select>
                  </label>

                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block space-y-1">
                      <span className="text-slate-300">Status</span>
                      <select
                        value={selectedChar.status}
                        onChange={e => apply(debugUpdateCharacter(state, selectedChar.id, { status: e.target.value as any }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                      >
                        {(['student', 'resident', 'faculty', 'away'] as const).map(st => (
                          <option key={st} value={st}>{st}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-slate-300">Current School</span>
                      <select
                        value={selectedChar.currentSchool || 'arcane'}
                        onChange={e => apply(debugUpdateCharacter(state, selectedChar.id, { currentSchool: e.target.value as SchoolType }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                      >
                        {ALL_SCHOOLS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div>
                    <span className="text-slate-300 block mb-1">Mastered Schools (toggle)</span>
                    <div className="grid grid-cols-3 gap-1">
                      {ALL_SCHOOLS.map(s => {
                        const has = selectedChar.masteredSchools.includes(s);
                        return (
                          <button
                            key={s}
                            type="button"
                            onClick={() => apply(debugUpdateCharacter(state, selectedChar.id, { toggleMasteredSchool: s }))}
                            className={`py-1 rounded text-[11px] font-bold border ${
                              has ? 'bg-emerald-900/80 border-emerald-500 text-emerald-200' : 'bg-slate-900 border-slate-700 text-slate-400'
                            }`}
                          >
                            {s}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <label className="block space-y-1">
                      <span className="text-slate-300">Career (bypasses rules)</span>
                      <select
                        value={selectedChar.career || 'none'}
                        onChange={e => apply(debugUpdateCharacter(state, selectedChar.id, { career: e.target.value as CareerType | 'none' }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                      >
                        <option value="none">None</option>
                        {ALL_CAREERS.map(cr => (
                          <option key={cr} value={cr}>{cr}</option>
                        ))}
                      </select>
                    </label>
                    <label className="block space-y-1">
                      <span className="text-slate-300">Workplace / Classroom</span>
                      <select
                        value={selectedChar.workplaceRoomId ?? ''}
                        onChange={e => apply(debugUpdateCharacter(state, selectedChar.id, { workplaceRoomId: e.target.value === '' ? null : Number(e.target.value) }))}
                        className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                      >
                        <option value="">Auto / None</option>
                        {builtRooms.map(r => (
                          <option key={r.id} value={r.id}>
                            #{r.id} {ROOM_DEFINITIONS[r.defId]?.name || r.defId}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Ready Days ({readySchool}): {selectedChar.readyDays?.[readySchool] ?? 0}/30</span>
                      <select
                        value={readySchool}
                        onChange={e => setReadySchool(e.target.value as SchoolType)}
                        className="bg-slate-900 border border-slate-700 rounded px-1.5 py-0.5 text-[11px]"
                      >
                        {ALL_SCHOOLS.map(s => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={60}
                      value={selectedChar.readyDays?.[readySchool] ?? 0}
                      onChange={e => apply(debugUpdateCharacter(state, selectedChar.id, { readySchool, readyDays: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => apply(debugMakeMasteryReady(state, selectedChar.id))}
                      className="py-1.5 rounded-lg bg-amber-900/50 border border-amber-600/50 text-amber-200 font-bold"
                    >
                      Make mastery-ready
                    </button>
                    <button
                      type="button"
                      onClick={() => apply(debugGrantMasteryNow(state, selectedChar.id))}
                      className="py-1.5 rounded-lg bg-emerald-900/60 border border-emerald-600/50 text-emerald-200 font-bold"
                    >
                      Grant mastery now
                    </button>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Injury</span>
                      <button
                        type="button"
                        onClick={() => apply(debugUpdateCharacter(state, selectedChar.id, { injuryType: 'none' }))}
                        className="px-2 py-0.5 rounded bg-emerald-950 border border-emerald-700 text-emerald-200 text-[11px]"
                      >
                        Heal now
                      </button>
                    </div>
                    <select
                      value={selectedChar.injury?.type || 'none'}
                      onChange={e => apply(debugUpdateCharacter(state, selectedChar.id, { injuryType: e.target.value as InjuryType | 'none' }))}
                      className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                    >
                      <option value="none">Healthy (None)</option>
                      {ALL_INJURIES.map(inj => (
                        <option key={inj} value={inj}>{inj}</option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-300">Morale ({Math.round(selectedChar.morale)}) & Needs</span>
                      <div className="flex gap-1">
                        <button
                          type="button"
                          onClick={() => apply(debugUpdateCharacter(state, selectedChar.id, { needsPreset: 'all_100' }))}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
                        >
                          All 100
                        </button>
                        <button
                          type="button"
                          onClick={() => apply(debugUpdateCharacter(state, selectedChar.id, { needsPreset: 'all_20' }))}
                          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
                        >
                          All 20
                        </button>
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={100}
                      value={Math.round(selectedChar.morale)}
                      onChange={e => apply(debugUpdateCharacter(state, selectedChar.id, { morale: Number(e.target.value) }))}
                      className="w-full"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => apply(debugRetireCharacterNow(state, selectedChar.id))}
                      className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold"
                    >
                      Retire now
                    </button>
                    <button
                      type="button"
                      onClick={() => apply(debugDeleteCharacter(state, selectedChar.id))}
                      className="py-1.5 rounded-lg bg-rose-950/70 text-rose-200 border border-rose-800/60 font-bold"
                    >
                      Delete character
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 3: EVENTS & HAZARDS */}
          {activeTab === 'events' && (
            <div className="space-y-3">
              {/* Trigger School Event */}
              <div className="space-y-1.5">
                <span className="font-bold text-amber-200 block">School Events (Messenger Owl)</span>
                <select
                  value={schoolEventId}
                  onChange={e => setSchoolEventId(e.target.value)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                >
                  {SCHOOL_EVENTS.map(ev => (
                    <option key={ev.id} value={ev.id}>{ev.name}</option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => apply(debugTriggerSchoolEvent(state, schoolEventId))}
                    className="py-1.5 rounded-lg bg-amber-600 text-slate-950 font-bold"
                  >
                    Trigger Event
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(debugClearAllEvents(state))}
                    className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold"
                  >
                    Clear all events
                  </button>
                </div>
              </div>

              {/* Room Hazards */}
              <div className="space-y-1.5 border-t border-slate-800 pt-2">
                <span className="font-bold text-amber-200 block">Room Hazards</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={targetHazardRoomId}
                    onChange={e => setHazardRoomId(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                  >
                    {builtRooms.map(r => (
                      <option key={r.id} value={r.id}>
                        #{r.id} {ROOM_DEFINITIONS[r.defId]?.name || r.defId}
                      </option>
                    ))}
                  </select>
                  <select
                    value={hazardType}
                    onChange={e => setHazardType(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                  >
                    {ALL_HAZARD_TYPES.map(ht => (
                      <option key={ht} value={ht}>{ht}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => apply(debugSetRoomHazard(state, targetHazardRoomId, hazardType))}
                    className="py-1.5 rounded-lg bg-rose-900/70 border border-rose-700 text-rose-100 font-bold"
                  >
                    Set Hazard
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(debugClearAllHazards(state))}
                    className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold"
                  >
                    Clear hazards
                  </button>
                </div>
              </div>

              {/* Expedition Outcomes */}
              <div className="space-y-1.5 border-t border-slate-800 pt-2">
                <span className="font-bold text-amber-200 block">Trigger Expedition Outcome</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={expeditionOutcome}
                    onChange={e => setExpeditionOutcome(e.target.value as any)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                  >
                    {(['safe', 'minor_injury', 'serious_injury', 'curse', 'retreat'] as const).map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => apply(debugTriggerExpeditionOutcome(state, expeditionOutcome))}
                    className="py-1.5 rounded-lg bg-indigo-900 hover:bg-indigo-800 border border-indigo-700 font-bold"
                  >
                    Force Outcome
                  </button>
                </div>
              </div>

              {/* Fire Visual Vignette Preview */}
              <div className="space-y-1.5 border-t border-slate-800 pt-2">
                <span className="font-bold text-amber-200 block">Fire Visual Vignette Preview</span>
                <select
                  value={previewEventType}
                  onChange={e => setPreviewEventType(e.target.value as VisualEventType)}
                  className="w-full bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                >
                  {allVisualEventTypes.map(vt => (
                    <option key={vt} value={vt}>
                      {vt} ({VISUAL_EVENT_CATALOGUE[vt].size})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-1.5">
                  <select
                    value={targetPreviewRoomId}
                    onChange={e => setPreviewRoomId(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                  >
                    {builtRooms.map(r => (
                      <option key={r.id} value={r.id}>
                        #{r.id} {ROOM_DEFINITIONS[r.defId]?.name || r.defId}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    data-testid="fire-vignette-preview"
                    onClick={() => apply(debugFirePreviewVignette(state, previewEventType, targetPreviewRoomId))}
                    className="py-1.5 rounded-lg bg-emerald-700 text-slate-950 font-bold"
                  >
                    Fire on room
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: ATMOSPHERE */}
          {activeTab === 'atmosphere' && (
            <div className="space-y-3">
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-amber-200">
                    Time Override: {state.debugTimeHours != null ? `${state.debugTimeHours.toFixed(1)}h` : 'Real Clock'}
                  </span>
                  <button
                    type="button"
                    onClick={() => apply(debugSetTimeOverride(state, null))}
                    className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 text-[11px]"
                  >
                    Use real clock
                  </button>
                </div>
                <input
                  type="range"
                  min={0}
                  max={24}
                  step={0.25}
                  value={state.debugTimeHours ?? 12}
                  onChange={e => apply(debugSetTimeOverride(state, Number(e.target.value)))}
                  className="w-full"
                />
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: 'Dawn (6:30)', h: 6.5 },
                    { label: 'Day (12:00)', h: 12 },
                    { label: 'Dusk (18:30)', h: 18.5 },
                    { label: 'Night (0:00)', h: 0 }
                  ].map(p => (
                    <button
                      key={p.label}
                      type="button"
                      onClick={() => apply(debugSetTimeOverride(state, p.h))}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1 border-t border-slate-800 pt-2">
                <span className="font-bold text-amber-200 block">
                  Veil Strength: {state.veil.strength}% ({getVeilBand(state.veil.strength)})
                </span>
                <input
                  type="range"
                  min={0}
                  max={100}
                  value={state.veil.strength}
                  onChange={e => apply(debugSetVeilStrength(state, Number(e.target.value)))}
                  className="w-full"
                />
                <div className="grid grid-cols-4 gap-1">
                  {[
                    { label: 'Strong (90)', v: 90 },
                    { label: 'Thinning (60)', v: 60 },
                    { label: 'Thin (35)', v: 35 },
                    { label: 'Torn (10)', v: 10 }
                  ].map(b => (
                    <button
                      key={b.label}
                      type="button"
                      onClick={() => apply(debugSetVeilStrength(state, b.v))}
                      className="py-1 rounded bg-slate-800 hover:bg-slate-700 text-[10px]"
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-800 pt-2">
                <span className="font-bold text-amber-200 block">Trigger Day Tick</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => apply(debugRunDayTick(state, true))}
                    className="py-1.5 rounded-lg bg-emerald-900/70 border border-emerald-700 text-emerald-100 font-bold"
                  >
                    Run Day Tick (Paid)
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(debugRunDayTick(state, false))}
                    className="py-1.5 rounded-lg bg-rose-900/70 border border-rose-700 text-rose-100 font-bold"
                  >
                    Run Day Tick (Unpaid)
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 5: ACADEMY */}
          {activeTab === 'academy' && (
            <div className="space-y-3">
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => apply(debugGrantAllResources(state))}
                  className="w-full py-1.5 rounded-lg bg-amber-600 text-slate-950 font-bold"
                >
                  +1,000 Mana & +200 all materials
                </button>
                <div className="grid grid-cols-3 gap-1.5">
                  <select
                    value={resKey}
                    onChange={e => setResKey(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                  >
                    {[
                      'mana', 'timber', 'stone', 'glass', 'cloth', 'provisions', 'greens', 'fish', 'nectar',
                      'herbs', 'insight', 'radiance', 'umbra', 'reagents', 'crystal', 'starmetal',
                      'sunstone', 'dragonscale', 'phoenix_ash', 'heartwood', 'golem_core'
                    ].map(k => (
                      <option key={k} value={k}>{k}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    value={resAmount}
                    onChange={e => setResAmount(Number(e.target.value))}
                    className="bg-slate-900 border border-slate-700 rounded-lg px-2 py-1"
                  />
                  <button
                    type="button"
                    onClick={() => apply(debugSetResourceAmount(state, resKey, resAmount))}
                    className="py-1 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold"
                  >
                    Set
                  </button>
                </div>
              </div>

              <div className="space-y-1 border-t border-slate-800 pt-2">
                <span className="font-bold text-amber-200 block">Wizard School Levels (0..10)</span>
                {ALL_SCHOOLS.map(sch => (
                  <label key={sch} className="flex items-center gap-2">
                    <span className="w-16 capitalize text-slate-300">{sch} ({state.wizard.levels[sch] || 0})</span>
                    <input
                      type="range"
                      min={0}
                      max={10}
                      value={state.wizard.levels[sch] || 0}
                      onChange={e => apply(debugSetWizardSchoolLevel(state, sch, Number(e.target.value)))}
                      className="flex-1"
                    />
                  </label>
                ))}
                <div className="grid grid-cols-2 gap-1.5 pt-1">
                  <button
                    type="button"
                    onClick={() => apply(debugLearnAllSpells(state))}
                    className="py-1.5 rounded-lg bg-indigo-900/70 border border-indigo-700 text-indigo-100 font-bold"
                  >
                    Learn all spells
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(debugUnlockAllBlueprintsAndRecipes(state))}
                    className="py-1.5 rounded-lg bg-emerald-900/70 border border-emerald-700 text-emerald-100 font-bold"
                  >
                    Unlock all plans
                  </button>
                </div>
              </div>

              <div className="space-y-1.5 border-t border-slate-800 pt-2">
                <span className="font-bold text-amber-200 block">Bells & Construction</span>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    type="button"
                    onClick={() => apply(debugAdvanceBells(state, 1))}
                    className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold"
                  >
                    +1 bell
                  </button>
                  <button
                    type="button"
                    onClick={() => apply(debugAdvanceBells(state, 10))}
                    className="py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 font-bold"
                  >
                    +10 bells
                  </button>
                </div>
                <button
                  type="button"
                  onClick={() => apply(debugCompleteAllConstruction(state))}
                  className="w-full py-1.5 rounded-lg bg-emerald-700 text-slate-950 font-bold"
                >
                  Complete all construction sites
                </button>
              </div>
            </div>
          )}

          {note && <p className="text-slate-300 leading-snug border-t border-slate-800 pt-2">{note}</p>}
        </section>
      )}
    </>
  );
}
