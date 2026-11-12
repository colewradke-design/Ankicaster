/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 *
 * Room window (UI declutter pass). Consistent layout for every room:
 *   1. header: room name, level, quality tier, floor
 *   2. key stats row (chips)
 *   3. hazard banner, when there is one (dispel cost comes from the engine constant)
 *   4. 1-3 primary actions: the management screens this room holds (src/ui/screens.ts)
 *   5. "Room details" secondary section, collapsed by default: description, renovate, furniture
 *
 * Every action still goes through the same App handlers / engine calls as before.
 */

import React from 'react';
import {
  X, AlertTriangle, Sparkles, Droplets, Shield, Gauge, ChevronRight, Info, Hammer, Users, Briefcase, Award, Move, Trash2, Pause, Play
} from 'lucide-react';
import { reviewsToGo, reviewsToGoText } from '../utils/construction';
import { requiredSlotStatus, requiredInstallOption, costText, unaffordable } from '../utils/requiredFurniture';
import { AnkicasterEngine } from '../utils/engine';
import { WizardPortrait } from './WizardPortrait';
import { CharacterPortrait } from './CharacterPortrait';
import { FullGameState, PlacedRoom } from '../types/ankicaster';
import { ROOM_DEFINITIONS, FURNITURE_DEFINITIONS, SPELL_DEFINITIONS } from '../data/content';
import { calculateRoomQuality, calculateFacultyLimit } from '../utils/formulas';
import { HAZARD_DISPEL_MANA_COST } from '../utils/engine';
import { ScreenId, SCREEN_DEFS, getRoomScreens } from '../ui/screens';
import { ScreenIcon } from './ScreenIcon';

export const Chip: React.FC<{ icon?: React.ReactNode; label: string; value: React.ReactNode; title?: string; tone?: string }> = ({
  icon, label, value, title, tone = 'text-slate-100'
}) => (
  <span
    title={title || label}
    className="inline-flex items-center gap-1.5 bg-slate-950/70 border border-slate-800 px-2.5 py-1 rounded-lg text-[13px]"
  >
    {icon}
    <span className="text-slate-400">{label}</span>
    <strong className={tone}>{value}</strong>
  </span>
);

export function upgradeCost(room: PlacedRoom): number {
  return Math.round((ROOM_DEFINITIONS[room.defId]?.cost.mana || 100) * 0.75) + 50;
}

const STAT_LABELS: Record<string, string> = {
  comfort: 'Comfort', focus: 'Focus', order: 'Order', aura: 'Aura', charm: 'Charm'
};

/** Stat points on a piece being bought, and how many quality points it would add in this room. */
function furnitureBuyTitle(room: PlacedRoom, stats: { comfort?: number; focus?: number; order?: number; aura?: number; charm?: number } | undefined): string {
  const def = ROOM_DEFINITIONS[room.defId];
  const parts = Object.entries(stats || {}).filter(([, v]) => v).map(([k, v]) => `${STAT_LABELS[k] || k} ${v}`);
  let q = 0;
  if (def && stats) {
    for (const [stat, val] of Object.entries(stats)) {
      if (!val) continue;
      if (def.stats.primary.includes(stat)) q += val;
      else if (def.stats.secondary === stat) q += 0.5 * val;
    }
  }
  const qText = Number.isInteger(q) ? String(q) : String(Math.round(q * 10) / 10);
  return `${parts.join(', ') || 'No stat points'} · +${qText} quality here`;
}

export function facultyLimitFor(state: FullGameState) {
  const totalWiz = Object.values(state.wizard.levels).reduce((a, b) => a + b, 0);
  const facBeds = state.rooms.reduce((acc, r) => acc + (r.defId === 'faculty_quarters' ? 2 : 0), 0);
  const classCount = state.rooms.filter(r => r.defId.startsWith('class_') || r.defId.startsWith('hall_')).length;
  const studentCount = state.characters.filter(c => c.status === 'student').length;
  return calculateFacultyLimit(totalWiz, facBeds, classCount, studentCount).limit;
}

/** Small room-specific summary line (status only, no actions). */
const RoomSummary: React.FC<{ state: FullGameState; room: PlacedRoom; onChangeLook?: () => void }> = ({ state, room, onChangeLook }) => {
  const id = room.defId;
  if (id === 'wizard_study') {
    const s = state.wizard.activeSession;
    const queued = state.wizard.queuedSessions?.length || 0;
    const total = Object.values(state.wizard.levels).reduce((a, b) => a + b, 0);
    return (
      <div className="bg-purple-950/40 border border-purple-500/30 rounded-xl p-3 space-y-2" data-testid="study-summary">
        <div className="flex items-center gap-3">
          <div className="rounded-lg bg-gradient-to-b from-sky-300/25 to-slate-800 border border-purple-500/30">
            <WizardPortrait appearance={state.wizard.appearance} size={48} title={`${state.wizard.title} ${state.wizard.name}`} />
          </div>
          <div className="flex-1 min-w-0 text-[13px]">
            <div className="font-bold text-amber-200 truncate">{state.wizard.title} {state.wizard.name}</div>
            <div className="text-slate-400 text-[12px]">Headmaster of {state.wizard.academyName}</div>
          </div>
          {onChangeLook && (
            <button onClick={onChangeLook} className="shrink-0 px-2.5 py-1 min-h-[28px] rounded-lg border border-purple-500/40 text-purple-200 hover:bg-purple-900/40 text-[12px] font-bold" data-testid="change-look">
              Change look
            </button>
          )}
        </div>
        <div className="flex items-center justify-between text-[13px]">
          <span className="font-bold text-purple-200 capitalize flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-purple-400" />
            {s
              ? s.kind === 'orb'
                ? `${s.school} orb · Lv ${s.targetLevel}`
                : `Grimoire: ${SPELL_DEFINITIONS[s.spellId || '']?.name || 'Spell'}`
              : 'Orb idle'}
          </span>
          <span className="text-slate-400">
            Mastery <strong className="text-amber-300">{total}/50</strong>
            {queued > 0 && <> · <strong className="text-purple-300">{queued}</strong> queued</>}
          </span>
        </div>
        {s && (
          <div title={`${s.progress} / ${s.required} honest reviews. Pauses safely during breaks.`}>
            <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden">
              <div
                className="bg-gradient-to-r from-purple-500 to-amber-400 h-full"
                style={{ width: `${Math.min(100, (s.progress / Math.max(1, s.required)) * 100)}%` }}
              />
            </div>
            <div className="text-[12px] text-slate-400 mt-1 font-mono">{s.progress}/{s.required} reviews</div>
          </div>
        )}
      </div>
    );
  }
  const chips: React.ReactNode[] = [];
  if (id === 'faculty_quarters' || id === 'faculty_lounge') {
    const fac = state.characters.filter(c => c.career).length;
    chips.push(<Chip key="f" icon={<Briefcase className="w-3.5 h-3.5 text-amber-300" />} label="Faculty" value={`${fac}/${facultyLimitFor(state)}`} title="Faculty / limit (F12)" />);
  }
  if (getRoomScreens(id).includes('students')) {
    const st = state.characters.filter(c => !c.career).length;
    chips.push(<Chip key="s" icon={<Users className="w-3.5 h-3.5 text-emerald-400" />} label="Students" value={st} />);
  }
  if (id === 'entrance_hall') {
    chips.push(<Chip key="r" icon={<Award className="w-3.5 h-3.5 text-amber-400" />} label="Renown" value={state.renown} />);
    if (state.activeEvents.length) chips.push(<Chip key="v" label="Visitors" value={state.activeEvents.length} tone="text-amber-300" />);
  }
  if (!chips.length) return null;
  return <div className="flex flex-wrap gap-2">{chips}</div>;
};

export interface RoomWindowProps {
  state: FullGameState;
  room: PlacedRoom;
  onClose: () => void;
  onOpenScreen: (id: ScreenId) => void;
  onResolveHazard: (roomId: number, method: 'warder' | 'spell') => void;
  onUpgrade: (roomId: number) => void;
  onAddFurniture: (roomId: number, furnitureDefId: string) => void;
  onRemoveFurniture: (roomId: number, furnitureId: number) => void;
  /** Enter Move mode (ghost placement) for this room. */
  onMove?: (roomId: number) => void;
  /** Ask to demolish (opens the confirm dialog). */
  onDemolish?: (roomId: number) => void;
  /** Wizard's Study: reopen "Choose your look". */
  onChangeLook?: () => void;
  /** Construction site: pause / resume (GDD 15.4). */
  onTogglePause?: (roomId: number, paused: boolean) => void;
  /** Install one empty required slot (by its index in the room's required slots). */
  onInstallRequired?: (roomId: number, slotIndex: number) => void;
  /** For tests/screenshots: render the details section expanded. */
  detailsOpen?: boolean;
}

export const RoomWindow: React.FC<RoomWindowProps> = ({
  state, room, onClose, onOpenScreen, onResolveHazard, onUpgrade, onAddFurniture, onRemoveFurniture, onMove, onDemolish, onChangeLook, onTogglePause, onInstallRequired, detailsOpen = false
}) => {
  const moveBlock = AnkicasterEngine.roomActionBlock(state, room.id, 'move');
  const demolishBlock = AnkicasterEngine.roomActionBlock(state, room.id, 'demolish');
  const stored = state.furnitureInventory || {};
  const def = ROOM_DEFINITIONS[room.defId];
  const { q, tier } = calculateRoomQuality(room);
  const detail = AnkicasterEngine.roomEfficiencyDetail(state, room);
  const eff = detail.efficiency;
  const factorLine = `Lv ×${detail.level.toFixed(2)} · Q ×${detail.quality.toFixed(2)} · Clean ×${detail.cleanliness.toFixed(2)} · Staff ×${detail.staff.toFixed(2)} · Adj ×${detail.adjacency.toFixed(2)}`;
  const bedRoom = !!(def?.capacity?.beds || def?.capacity?.facultyBeds);
  const restTarget = Math.round(AnkicasterEngine.restTargetForRoom(state, room));
  // A construction site offers no screens until it is built.
  const screens = room.state === 'built' ? getRoomScreens(room.defId, state) : [];
  const primary = screens.slice(0, 3);
  const extra = screens.slice(3);
  const isSite = room.state === 'site';
  const reqStatus = requiredSlotStatus(room);
  const reqMissing = reqStatus.filter(s => !s.filled).length;
  const unfinished = !isSite && reqMissing > 0;

  const compatible = Object.values(FURNITURE_DEFINITIONS)
    .filter(fDef => {
      if (fDef.role === 'required') return false;
      if (fDef.rooms === 'any') return true;
      if (Array.isArray(fDef.rooms) && fDef.rooms.includes(room.defId)) return true;
      if (fDef.role === 'bed' && room.defId.includes('dorm')) return true;
      return false;
    })
    .slice(0, 12);

  return (
    <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[1px] flex items-center justify-center p-4" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div
        role="dialog"
        aria-label={`${def?.name || room.defId} window`}
        data-room-window={room.defId}
        className="bg-slate-900 border border-amber-900/50 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* 1. Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-slate-800 bg-gradient-to-r from-amber-900/30 to-transparent rounded-t-2xl">
          <div className="flex items-center gap-2 flex-wrap min-w-0">
            <h3 className="text-base font-bold text-amber-300 truncate">{def?.name || room.defId}</h3>
            <span className="text-[12px] bg-amber-500/20 border border-amber-500/40 text-amber-200 px-2 py-0.5 rounded-md font-bold">Lv {room.level}</span>
            <span className="text-[12px] bg-slate-800 border border-slate-700 text-slate-200 px-2 py-0.5 rounded-md capitalize" title={`Quality ${Math.round(q)}`}>{tier}</span>
            <span className="text-[12px] text-slate-500 font-mono">{room.area === 'castle' ? `F${room.y}` : 'Grounds'}</span>
            {def?.description && (
              <span title={def.description} className="text-slate-500 hover:text-slate-300 cursor-help"><Info className="w-3.5 h-3.5" /></span>
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onMove && (
              <button
                onClick={() => !moveBlock && onMove(room.id)}
                disabled={!!moveBlock}
                aria-label="Move room"
                data-action="move"
                title={moveBlock ? `Can't move: ${moveBlock}` : 'Move this room (keeps level, furniture and progress)'}
                className="p-1.5 min-w-[32px] min-h-[32px] text-slate-300 hover:text-amber-200 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Move className="w-4 h-4" />
              </button>
            )}
            {onDemolish && (
              <button
                onClick={() => !demolishBlock && onDemolish(room.id)}
                disabled={!!demolishBlock}
                aria-label={isSite ? 'Cancel construction' : 'Demolish room'}
                data-action="demolish"
                title={demolishBlock ? `Can't demolish: ${demolishBlock}` : isSite ? 'Cancel or demolish this construction site' : 'Demolish this room'}
                className="p-1.5 min-w-[32px] min-h-[32px] text-slate-300 hover:text-rose-300 rounded-lg hover:bg-slate-800 disabled:opacity-30 disabled:hover:bg-transparent"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button onClick={onClose} aria-label="Close" className="p-1.5 min-w-[32px] min-h-[32px] text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="p-5 space-y-4">
          {/* 2. Key stats */}
          <div className="flex flex-wrap gap-2" data-testid="room-stats">
            {isSite ? (
              <Chip icon={<Hammer className="w-3.5 h-3.5 text-amber-400" />} label="Building" value={`${room.buildProgress}/${room.buildRequired}`} title={reviewsToGoText(room)} />
            ) : (
              <Chip icon={<Gauge className={`w-3.5 h-3.5 ${unfinished ? 'text-amber-400' : 'text-emerald-400'}`} />} label="Eff" value={`${(eff * 100).toFixed(0)}%`} title={unfinished ? 'Unfinished: runs at 0% until every required fixture is installed' : factorLine} tone={unfinished ? 'text-amber-300' : 'text-emerald-300'} />
            )}
            <Chip icon={<Droplets className="w-3.5 h-3.5 text-sky-400" />} label="Clean" value={`${Math.round(room.cleanliness)}%`} title="Cleanliness" />
            <Chip icon={<Shield className="w-3.5 h-3.5 text-indigo-300" />} label="Veil" value={`${def?.veil ?? 4}/day`} title="Daily Veil upkeep (mana)" tone="text-indigo-300" />
            <Chip label="Q" value={Math.round(q)} title="Quality score" tone="text-amber-300" />
          </div>
          {!isSite && (
            <p className="text-[12px] text-slate-400 -mt-2" data-testid="efficiency-breakdown">
              Efficiency {(eff * 100).toFixed(0)}%{detail.blocked ? ` (${detail.blocked})` : ''} · {factorLine}
              {bedRoom && <> · Rest target: {restTarget}</>}
            </p>
          )}

          {isSite && (
            <div className="flex items-center justify-between gap-2 bg-slate-950/60 border border-slate-800 rounded-xl px-3 py-2 text-[13px]" data-testid="site-countdown">
              <span className={room.buildPaused ? 'text-slate-400' : 'text-emerald-300'}>
                {room.buildPaused ? `Paused · ${reviewsToGo(room)} honest reviews left (progress is kept)` : reviewsToGoText(room)}
              </span>
              {onTogglePause && (
                <button
                  data-action="toggle-pause"
                  onClick={() => onTogglePause(room.id, !room.buildPaused)}
                  className="flex items-center gap-1 px-2.5 py-1 min-h-[30px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800"
                  title={room.buildPaused ? 'Resume construction' : 'Pause construction: progress is kept forever'}
                >
                  {room.buildPaused ? <><Play className="w-3.5 h-3.5" /> Resume</> : <><Pause className="w-3.5 h-3.5" /> Pause</>}
                </button>
              )}
            </div>
          )}

          {!isSite && reqStatus.length > 0 && (
            <div
              className={`rounded-xl px-3 py-2 text-[13px] border ${unfinished ? 'bg-amber-950/30 border-amber-600/50' : 'bg-slate-950/60 border-slate-800'}`}
              data-testid="required-fixtures"
            >
              <div className="flex items-center justify-between gap-2 mb-1.5">
                <span className={`font-bold ${unfinished ? 'text-amber-200' : 'text-slate-300'}`}>Required fixtures</span>
                {unfinished ? (
                  <span className="text-[12px] bg-amber-500/20 border border-amber-500/50 text-amber-200 px-2 py-0.5 rounded-md font-bold" data-testid="unfinished-badge" title="A room missing required furniture runs at 0% (GDD 15.4)">
                    Unfinished · 0%
                  </span>
                ) : (
                  <span className="text-[12px] text-emerald-300">All installed</span>
                )}
              </div>
              <ul className="space-y-1">
                {reqStatus.map(slot => {
                  const opt = requiredInstallOption(slot.role);
                  const storedN = !opt.free ? stored[opt.defId] || 0 : 0;
                  const why = opt.free || storedN > 0 ? undefined : unaffordable(state, opt.cost);
                  const installed = slot.filled ? room.furniture[slot.furnitureIndex] : undefined;
                  const installedName = installed ? FURNITURE_DEFINITIONS[installed.defId]?.name || slot.name : '';
                  return (
                    <li key={slot.index} className="flex items-center justify-between gap-2" data-required-slot={slot.role} data-filled={slot.filled ? 'yes' : 'no'}>
                      <span className={slot.filled ? 'text-slate-200' : 'text-amber-100'}>
                        {slot.filled ? '✓' : '○'} {slot.name}
                        {slot.filled && installedName && installedName !== slot.name && <span className="text-slate-500"> ({installedName})</span>}
                      </span>
                      {slot.filled ? (
                        <span className="text-[12px] text-emerald-400">Installed</span>
                      ) : onInstallRequired && (
                        <button
                          data-action="install-required"
                          onClick={() => !why && onInstallRequired(room.id, slot.index)}
                          disabled={!!why}
                          title={why || (opt.free ? `Install ${slot.name} (no catalog cost: free)` : storedN > 0 ? `Install a stored ${opt.name}` : `Install ${opt.name} for ${costText(opt.cost)}`)}
                          className="shrink-0 px-2.5 py-1 min-h-[28px] bg-amber-500/20 hover:bg-amber-500/35 text-amber-200 border border-amber-500/50 rounded-md text-[12px] font-bold disabled:opacity-40"
                        >
                          Install · {opt.free ? 'Free' : storedN > 0 ? `Stored ×${storedN}` : costText(opt.cost)}
                        </button>
                      )}
                    </li>
                  );
                })}
              </ul>
              {unfinished && <div className="text-[12px] text-amber-300/80 mt-1.5">Unfinished rooms run at 0% until every required fixture is in place.</div>}
            </div>
          )}

          {/* 3. Hazard */}
          {room.hazard && (
            <div className="bg-rose-950/40 border border-rose-500/50 p-3 rounded-xl space-y-2 text-rose-200" data-testid="hazard-banner">
              <div className="flex items-center gap-2 flex-wrap">
                <AlertTriangle className="w-4 h-4 text-rose-300" />
                <span className="font-bold text-[13px] capitalize" title={room.hazard.description}>
                  {room.hazard.type.replace(/_/g, ' ')}
                </span>
                <span className="text-[12px] bg-rose-900/60 px-2 py-0.5 rounded font-mono" title="Room locked for this many honest reviews">
                  🔒 {Math.max(0, (room.lockedUntilReviewIndex || 0) - state.reviewIndex)} reviews
                </span>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => onResolveHazard(room.id, 'warder')}
                  className="flex-1 min-h-[32px] px-3 py-1.5 bg-rose-800 hover:bg-rose-700 text-white font-bold text-[13px] rounded-lg"
                  title="Send an active Warder to cleanse the room"
                >
                  Dispel (Warder)
                </button>
                <button
                  onClick={() => onResolveHazard(room.id, 'spell')}
                  className="flex-1 min-h-[32px] px-3 py-1.5 bg-purple-700 hover:bg-purple-600 text-white font-bold text-[13px] rounded-lg"
                  title={`Dispel immediately using ${HAZARD_DISPEL_MANA_COST} Mana`}
                >
                  Dispel ({HAZARD_DISPEL_MANA_COST} Mana)
                </button>
              </div>
            </div>
          )}

          <RoomSummary state={state} room={room} onChangeLook={onChangeLook} />

          {(() => {
            const people = state.characters.filter(c => c.bedRoomId === room.id || c.seatRoomId === room.id || c.workplaceRoomId === room.id);
            if (!people.length) return null;
            return (
              <div className="flex flex-wrap gap-2" data-testid="room-occupants">
                {people.map(c => (
                  <div key={c.id} className="flex items-center gap-2 bg-slate-950/60 border border-slate-800 rounded-full pr-3">
                    <CharacterPortrait character={c} size={40} />
                    <span className="text-[12px] text-slate-200">{c.name}</span>
                  </div>
                ))}
              </div>
            );
          })()}


          {/* 4. Primary actions */}
          {primary.length > 0 && (
            <div className={`grid gap-2 ${primary.length === 1 ? 'grid-cols-1' : primary.length === 2 ? 'grid-cols-2' : 'grid-cols-3'}`} data-testid="room-actions">
              {primary.map((id, i) => (
                <button
                  key={id}
                  data-screen={id}
                  onClick={() => onOpenScreen(id)}
                  title={SCREEN_DEFS[id].hint}
                  className={`flex flex-col items-center justify-center gap-1 min-h-[64px] px-2 py-2 rounded-xl text-[13px] font-bold transition border-b-2 ${
                    i === 0
                      ? 'bg-amber-600 hover:bg-amber-500 text-slate-950 border-amber-800'
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-100 border-slate-950 border border-slate-700'
                  }`}
                >
                  <ScreenIcon id={id} className="w-5 h-5" />
                  {SCREEN_DEFS[id].label}
                </button>
              ))}
            </div>
          )}

          {/* 5. Secondary, collapsed by default */}
          <details className="group bg-slate-950/40 border border-slate-800 rounded-xl" open={detailsOpen || undefined}>
            <summary className="cursor-pointer list-none flex items-center justify-between px-3 py-2 min-h-[36px] text-[13px] font-bold text-slate-300">
              <span>Room details</span>
              <span className="flex items-center gap-1 text-slate-500 font-normal">
                {room.furniture.length} items
                <ChevronRight className="w-4 h-4 transition group-open:rotate-90" />
              </span>
            </summary>
            <div className="px-3 pb-3 space-y-3 text-[13px]">
              {def?.description && <p className="text-slate-400 leading-relaxed">{def.description}</p>}

              {extra.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {extra.map(id => (
                    <button key={id} data-screen={id} onClick={() => onOpenScreen(id)} className="flex items-center gap-1.5 px-3 py-1.5 min-h-[32px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800">
                      <ScreenIcon id={id} /> {SCREEN_DEFS[id].label}
                    </button>
                  ))}
                </div>
              )}

              {(onMove || onDemolish) && (
                <div className="flex items-center justify-between gap-2" data-testid="room-layout-actions">
                  <span className="text-slate-300">Layout</span>
                  <div className="flex gap-2">
                    {onMove && (
                      <button
                        onClick={() => !moveBlock && onMove(room.id)}
                        disabled={!!moveBlock}
                        title={moveBlock ? `Can't move: ${moveBlock}` : 'Pick a new spot on the map'}
                        className="flex items-center gap-1 px-3 py-1.5 min-h-[32px] rounded-lg border border-slate-700 text-slate-200 hover:bg-slate-800 disabled:opacity-40"
                      >
                        <Move className="w-3.5 h-3.5" /> Move
                      </button>
                    )}
                    {onDemolish && (
                      <button
                        onClick={() => !demolishBlock && onDemolish(room.id)}
                        disabled={!!demolishBlock}
                        title={demolishBlock ? `Can't demolish: ${demolishBlock}` : 'Returns 50% of materials, no mana (cancelling a site with no progress refunds everything)'}
                        className="flex items-center gap-1 px-3 py-1.5 min-h-[32px] rounded-lg border border-rose-800/60 text-rose-300 hover:bg-rose-950/40 disabled:opacity-40"
                      >
                        <Trash2 className="w-3.5 h-3.5" /> {isSite ? 'Cancel site' : 'Demolish'}
                      </button>
                    )}
                  </div>
                </div>
              )}
              {(moveBlock || demolishBlock) && (onMove || onDemolish) && (
                <div className="text-[12px] text-slate-500 -mt-1" data-testid="room-layout-block">
                  {demolishBlock && moveBlock && demolishBlock === moveBlock ? demolishBlock : [moveBlock && `Move: ${moveBlock}`, demolishBlock && `Demolish: ${demolishBlock}`].filter(Boolean).join(' · ')}
                </div>
              )}

              {room.level < 3 && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-slate-300" title="+2 optional furniture slots, better efficiency; Level 3 unlocks the room perk">
                    Renovate → Lv {room.level + 1}
                  </span>
                  <button
                    onClick={() => onUpgrade(room.id)}
                    className="px-3 py-1.5 min-h-[32px] bg-amber-600/90 hover:bg-amber-500 text-slate-950 font-bold rounded-lg"
                  >
                    {upgradeCost(room)} Mana
                  </button>
                </div>
              )}

              <div>
                <div className="text-[12px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">Installed</div>
                {room.furniture.length === 0 ? (
                  <div className="text-slate-500">Nothing yet.</div>
                ) : (
                  <div className="flex flex-wrap gap-1.5">
                    {room.furniture.map(f => {
                      const fDef = FURNITURE_DEFINITIONS[f.defId];
                      const req = f.slotKind.startsWith('required:');
                      return (
                        <span key={f.id} className={`inline-flex items-center gap-1 px-2 py-1 rounded-md border ${req ? 'border-amber-800/50 text-amber-200' : 'border-slate-700 text-slate-200'}`} title={req ? 'Required fixture' : 'Optional furnishing'}>
                          {fDef?.name || f.defId}
                          {!req && (
                            <button onClick={() => onRemoveFurniture(room.id, f.id)} className="text-rose-400 hover:text-rose-300 ml-0.5" aria-label={`Remove ${fDef?.name || f.defId}`} title="Remove">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              <div>
                <div className="text-[12px] uppercase tracking-wider font-bold text-slate-500 mb-1.5">Furnish</div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-1">
                  {compatible.map(fDef => {
                    const buyTitle = furnitureBuyTitle(room, fDef.stats);
                    return (
                    <div key={fDef.id} title={buyTitle} className="flex items-center justify-between gap-2 bg-slate-900 border border-slate-800 px-2.5 py-1.5 rounded-lg">
                      <span className="text-slate-200 truncate">{fDef.name}</span>
                      <button
                        onClick={() => onAddFurniture(room.id, fDef.id)}
                        className="shrink-0 px-2 py-1 min-h-[28px] bg-amber-500/15 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md text-[12px] font-bold"
                        title={`${buyTitle} · Install ${fDef.name}`}
                      >
                        {(stored[fDef.id] || 0) > 0 ? `Stored ×${stored[fDef.id]}` : <>{fDef.cost.mana}m{fDef.cost.timber ? ` · ${fDef.cost.timber}T` : ''}</>}
                      </button>
                    </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </details>
        </div>
      </div>
    </div>
  );
};
